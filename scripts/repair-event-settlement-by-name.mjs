import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";
import {
  eventShareCredentials,
  mergeSharedEventIntoState
} from "../src/data/sharedEventStore.mjs";
import {
  reconcileSettlementTransfers,
  settlementOptionsForEvent
} from "../src/domain/settlement.mjs";
import { validateSharedStateFinancials } from "../src/domain/sharedStateMerge.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const eventName = argumentValue("--name");
const apply = process.argv.includes("--apply");
if (!eventName) {
  throw new Error("Usage: node scripts/repair-event-settlement-by-name.mjs --name <event-name> [--apply]");
}

const databaseUrl =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Missing Supabase database URL.");

const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

try {
  await sql.begin(async (transaction) => {
    const sharedRows = await transaction`
      select id, owner_user_id, snapshot_kind, state, updated_at
      from public.app_snapshots
      where snapshot_kind = 'shared_event'
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(state -> 'events', '[]'::jsonb)
          ) as event(value)
          where event.value ->> 'name' = ${eventName}
        )
      order by updated_at desc
      for update
    `;
    if (sharedRows.length !== 1) {
      throw new Error(`Expected one shared event named ${eventName}, found ${sharedRows.length}.`);
    }

    const sharedRow = sharedRows[0];
    const event = sharedRow.state.events.find((item) => item.name === eventName);
    const members = await transaction`
      select user_id, participant_id, role
      from private.shared_snapshot_members
      where snapshot_id = ${sharedRow.id}
        and status = 'active'
      order by joined_at
      for update
    `;
    const admin = members.find((member) => member.role === "admin");
    if (!admin) throw new Error("The shared event has no active administrator.");
    const participantIds = new Set(event.participantIds ?? []);
    const participants = (sharedRow.state.participants ?? []).filter(
      (participant) => participantIds.has(participant.id)
    );
    const names = new Map(
      participants.map((participant) => [participant.id, participant.displayName])
    );
    const settlement = reconcileSettlementTransfers(
      participants,
      event.expenses ?? [],
      event.transfers ?? [],
      settlementOptionsForEvent(event)
    );
    if (settlement.issues.length) {
      throw new Error(`Settlement issues: ${JSON.stringify(settlement.issues)}`);
    }

    const nextEvent = { ...event, transfers: settlement.transfers };
    const nextSharedState = {
      ...sharedRow.state,
      events: sharedRow.state.events.map((item) =>
        item.id === event.id ? nextEvent : item
      )
    };
    validateEvent(nextSharedState, event.id, sharedRow.id);

    const inviteRows = await transaction`
      select space_key
      from public.event_invite_tokens
      where event_id = ${event.id}
        and space_id = ${sharedRow.id}
      order by (revoked_at is null) desc, updated_at desc
      limit 1
    `;
    const fallbackCredentials = {
      id: sharedRow.id,
      key: String(inviteRows[0]?.space_key ?? "")
    };

    const workspaceRows = await transaction`
      select id, owner_user_id, snapshot_kind, state, updated_at
      from public.app_snapshots
      where snapshot_kind = 'workspace'
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(state -> 'events', '[]'::jsonb)
          ) as event(value)
          where event.value ->> 'id' = ${event.id}
        )
      for update
    `;
    const nextWorkspaces = workspaceRows.map((workspace) => {
      const localEvent = workspace.state.events.find((item) => item.id === event.id);
      const credentials = eventShareCredentials(localEvent) ?? fallbackCredentials;
      const nextState = mergeSharedEventIntoState(
        workspace.state,
        nextSharedState,
        credentials
      );
      validateEvent(nextState, event.id, workspace.id);
      return { ...workspace, nextState };
    });

    const summarize = (transfer) => ({
      from: names.get(transfer.fromParticipantId) ?? transfer.fromParticipantId,
      to: names.get(transfer.toParticipantId) ?? transfer.toParticipantId,
      amount: transfer.amount,
      status: transfer.status ?? "pending"
    });
    const report = {
      mode: apply ? "apply" : "dry-run",
      eventName,
      eventId: event.id,
      selectedMode: event.directSettlementTransfers ? "direct" : "optimized",
      workspaceCount: workspaceRows.length,
      transfersBefore: (event.transfers ?? []).map(summarize),
      transfersAfter: settlement.transfers.map(summarize)
    };
    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const backupPath = await writeBackup(sharedRow, workspaceRows, event.id);
    await transaction`
      select pg_catalog.set_config(
        'request.jwt.claim.sub',
        ${String(admin.user_id)},
        true
      )
    `;
    await transaction`
      update public.app_snapshots
      set state = ${transaction.json(nextSharedState)},
          updated_at = pg_catalog.clock_timestamp()
      where id = ${sharedRow.id}
    `;
    for (const workspace of nextWorkspaces) {
      await transaction`
        update public.app_snapshots
        set state = ${transaction.json(workspace.nextState)},
            updated_at = pg_catalog.clock_timestamp()
        where id = ${workspace.id}
      `;
    }
    console.log(JSON.stringify({ ...report, backupPath }, null, 2));
  });
} finally {
  await sql.end({ timeout: 5 });
}

function validateEvent(state, eventId, label) {
  const event = state.events?.find((item) => item.id === eventId);
  if (!event) throw new Error(`${label} is missing the repaired event.`);
  const participantIds = new Set(event.participantIds ?? []);
  const errors = validateSharedStateFinancials(
    {
      participants: (state.participants ?? []).filter((participant) =>
        participantIds.has(participant.id)
      ),
      groups: [],
      events: [event]
    },
    label
  );
  if (errors.length) throw new Error(errors.join(" "));
}

async function writeBackup(sharedRow, workspaceRows, eventId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.resolve(
    "downloads",
    `event-settlement-backup-${eventId}-${timestamp}.json`
  );
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(
    backupPath,
    JSON.stringify({
      eventId,
      exportedAt: new Date().toISOString(),
      snapshots: [sharedRow, ...workspaceRows]
    }, null, 2),
    "utf8"
  );
  return backupPath;
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}
