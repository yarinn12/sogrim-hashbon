import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

import {
  buildSharedEventState,
  eventShareCredentials,
  mergeSharedEventIntoState
} from "../src/data/sharedEventStore.mjs";
import { linkParticipantAccountInEvent } from "../src/domain/appActions.mjs";
import { validateSharedStateFinancials } from "../src/domain/sharedStateMerge.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const eventId = argumentValue("--event-id");
const sourceParticipantId = argumentValue("--source-id");
const targetParticipantId = argumentValue("--target-id");
const apply = process.argv.includes("--apply");

if (!eventId || !sourceParticipantId || !targetParticipantId) {
  throw new Error(
    "Usage: node scripts/repair-event-participant-link.mjs " +
      "--event-id <id> --source-id <offline-id> --target-id <account-id> [--apply]"
  );
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
      select id, state, updated_at
      from public.app_snapshots
      where snapshot_kind = 'shared_event'
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(state -> 'events', '[]'::jsonb)
          ) as event(value)
          where event.value ->> 'id' = ${eventId}
        )
      for update
    `;
    if (sharedRows.length !== 1) {
      throw new Error(
        `Expected one shared snapshot for ${eventId}, found ${sharedRows.length}.`
      );
    }

    const sharedRow = sharedRows[0];
    const event = sharedRow.state.events?.find((item) => item.id === eventId);
    if (!event) throw new Error("The shared event payload is missing.");

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
    if (!members.some((member) => member.participant_id === targetParticipantId)) {
      throw new Error("The target account is not an active event member.");
    }
    if (members.some((member) => member.participant_id === sourceParticipantId)) {
      throw new Error("The offline source is unexpectedly tied to an account membership.");
    }

    const source = sharedRow.state.participants?.find(
      (participant) => participant.id === sourceParticipantId
    );
    const target = sharedRow.state.participants?.find(
      (participant) => participant.id === targetParticipantId
    );
    if (!source || !target) throw new Error("The source or target participant is missing.");

    const repairState = {
      ...sharedRow.state,
      currentParticipantId: admin.participant_id
    };
    const linkedState = linkParticipantAccountInEvent(
      repairState,
      eventId,
      sourceParticipantId,
      targetParticipantId
    );
    if (linkedState === repairState) {
      throw new Error("The participant link was rejected by event permissions or identity checks.");
    }
    const nextSharedState = buildSharedEventState(linkedState, eventId);
    if (!nextSharedState) throw new Error("The linked shared-event payload is unavailable.");
    const nextEvent = nextSharedState.events.find((item) => item.id === eventId);
    validateEvent(nextSharedState, sharedRow.id);
    assertFinancialMeaningPreserved(event, nextEvent);
    if (nextEvent.participantIds.includes(sourceParticipantId)) {
      throw new Error("The offline duplicate remains active after the repair.");
    }

    const inviteRows = await transaction`
      select space_key
      from public.event_invite_tokens
      where event_id = ${eventId}
        and space_id = ${sharedRow.id}
      order by (revoked_at is null) desc, updated_at desc
      limit 1
    `;
    const credentials = {
      id: sharedRow.id,
      key: String(inviteRows[0]?.space_key ?? "")
    };
    if (!eventShareCredentials({
      sharedSpaceId: credentials.id,
      sharedSpaceKey: credentials.key
    })) {
      throw new Error("Shared event recovery credentials are unavailable.");
    }

    const memberUserIds = members.map((member) => member.user_id);
    const workspaceRows = await transaction`
      select workspace.id, workspace.owner_user_id, workspace.state, workspace.updated_at
      from public.app_snapshots as workspace
      join (
        select distinct on (owner_user_id) id
        from public.app_snapshots
        where snapshot_kind = 'workspace'
          and owner_user_id = any(${transaction.array(memberUserIds)}::uuid[])
        order by owner_user_id, updated_at desc
      ) as latest on latest.id = workspace.id
      for update of workspace
    `;
    const workspacesByOwner = new Map(
      workspaceRows.map((row) => [String(row.owner_user_id), row])
    );
    const nextWorkspaces = members.map((member) => {
      const workspace = workspacesByOwner.get(String(member.user_id));
      if (!workspace) {
        throw new Error(`Active member ${member.user_id} has no account workspace.`);
      }
      const mergedState = mergeSharedEventIntoState(
        workspace.state,
        nextSharedState,
        credentials
      );
      const nextState = {
        ...mergedState,
        currentParticipantId: member.participant_id
      };
      validateEvent(nextState, workspace.id);
      return { ...workspace, nextState, participantId: member.participant_id };
    });

    const report = {
      mode: apply ? "apply" : "dry-run",
      eventId,
      eventName: event.name,
      sharedSnapshotId: sharedRow.id,
      source: { id: source.id, displayName: source.displayName },
      target: { id: target.id, displayName: target.displayName },
      activeMemberCount: members.length,
      participantCountBefore: event.participantIds.length,
      participantCountAfter: nextEvent.participantIds.length,
      expenseCount: event.expenses?.length ?? 0,
      transferCount: event.transfers?.length ?? 0,
      totalMinor: (event.expenses ?? []).reduce(
        (total, expense) => total + Number(expense.total ?? 0),
        0
      ),
      workspaceIdentities: nextWorkspaces.map((workspace) => ({
        snapshotId: workspace.id,
        participantId: workspace.participantId,
        beforeCurrentParticipantId: workspace.state.currentParticipantId ?? null,
        afterCurrentParticipantId: workspace.nextState.currentParticipantId
      }))
    };

    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const backupPath = await writeBackup(sharedRow, nextWorkspaces);
    await transaction`
      select pg_catalog.set_config(
        'request.jwt.claim.sub',
        ${String(admin.user_id)},
        true
      )
    `;
    await transaction`
      update public.app_snapshots
      set state = ${transaction.json(nextSharedState)}, updated_at = pg_catalog.now()
      where id = ${sharedRow.id}
    `;
    for (const workspace of nextWorkspaces) {
      await transaction`
        select pg_catalog.set_config(
          'request.jwt.claim.sub',
          ${String(workspace.owner_user_id)},
          true
        )
      `;
      await transaction`
        update public.app_snapshots
        set state = ${transaction.json(workspace.nextState)}, updated_at = pg_catalog.now()
        where id = ${workspace.id}
      `;
    }

    console.log(JSON.stringify({ ...report, backupPath }, null, 2));
  });
} finally {
  await sql.end();
}

function assertFinancialMeaningPreserved(previousEvent, nextEvent) {
  const previousExpenseTotals = new Map(
    (previousEvent.expenses ?? []).map((expense) => [expense.id, expense.total])
  );
  const nextExpenseTotals = new Map(
    (nextEvent.expenses ?? []).map((expense) => [expense.id, expense.total])
  );
  if (
    previousExpenseTotals.size !== nextExpenseTotals.size ||
    [...previousExpenseTotals].some(
      ([expenseId, total]) => nextExpenseTotals.get(expenseId) !== total
    )
  ) {
    throw new Error("The proposed link changes an expense amount or removes an expense.");
  }

  const previousPaidIds = new Set(
    (previousEvent.transfers ?? [])
      .filter((transfer) => transfer.status === "paid")
      .map((transfer) => transfer.id)
  );
  const nextPaidIds = new Set(
    (nextEvent.transfers ?? [])
      .filter((transfer) => transfer.status === "paid")
      .map((transfer) => transfer.id)
  );
  if (
    previousPaidIds.size !== nextPaidIds.size ||
    [...previousPaidIds].some((transferId) => !nextPaidIds.has(transferId))
  ) {
    throw new Error("The proposed link removes completed payment history.");
  }
}

function validateEvent(state, snapshotId) {
  const event = state.events?.find((item) => item.id === eventId);
  if (!event) throw new Error(`${snapshotId} is missing ${eventId}.`);
  const participantIds = new Set(event.participantIds ?? []);
  const validationState = {
    participants: (state.participants ?? []).filter((participant) =>
      participantIds.has(participant.id)
    ),
    groups: [],
    events: [event]
  };
  const errors = validateSharedStateFinancials(validationState, snapshotId);
  if (errors.length) throw new Error(errors.join(" "));
}

async function writeBackup(sharedRow, workspaces) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.resolve(
    "downloads",
    `event-participant-link-backup-${timestamp}.json`
  );
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        eventId,
        exportedAt: new Date().toISOString(),
        snapshots: [
          {
            id: sharedRow.id,
            updatedAt: sharedRow.updated_at,
            state: sharedRow.state
          },
          ...workspaces.map((workspace) => ({
            id: workspace.id,
            ownerUserId: workspace.owner_user_id,
            updatedAt: workspace.updated_at,
            state: workspace.state
          }))
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  return backupPath;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}
