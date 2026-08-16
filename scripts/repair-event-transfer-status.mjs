import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

import { updateTransferStatus } from "../src/domain/appActions.mjs";
import {
  eventShareCredentials,
  mergeSharedEventIntoState
} from "../src/data/sharedEventStore.mjs";
import {
  reconcileSettlementTransfers,
  settlementOptionsForEvent
} from "../src/domain/settlement.mjs";
import { validateSharedStateFinancials } from "../src/domain/sharedStateMerge.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const eventId = argumentValue("--event-id");
const fromParticipantId = argumentValue("--from-id");
const toParticipantId = argumentValue("--to-id");
const expectedPaidTotal = Number(argumentValue("--expected-paid-total"));
const apply = process.argv.includes("--apply");

if (
  !eventId ||
  !fromParticipantId ||
  !toParticipantId ||
  !Number.isSafeInteger(expectedPaidTotal) ||
  expectedPaidTotal <= 0
) {
  throw new Error(
    "Usage: node scripts/repair-event-transfer-status.mjs " +
      "--event-id <id> --from-id <id> --to-id <id> " +
      "--expected-paid-total <minor-units> [--apply]"
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
      select id, owner_user_id, snapshot_kind, state, updated_at
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
    const event = findEvent(sharedRow.state);
    assertExpectedEvent(event, sharedRow.state);
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

    const paidTransfers = (event.transfers ?? []).filter(
      (transfer) =>
        transfer.status === "paid" &&
        transfer.fromParticipantId === fromParticipantId &&
        transfer.toParticipantId === toParticipantId
    );
    const paidTotal = paidTransfers.reduce(
      (total, transfer) => total + transfer.amount,
      0
    );
    if (!paidTransfers.length || paidTotal !== expectedPaidTotal) {
      throw new Error(
        `Expected paid route total ${expectedPaidTotal}, found ${paidTotal} ` +
          `across ${paidTransfers.length} transfer(s).`
      );
    }

    const markedAt = new Date().toISOString();
    let nextSharedState = sharedRow.state;
    for (const transfer of paidTransfers) {
      nextSharedState = updateTransferStatus(
        nextSharedState,
        eventId,
        transfer.id,
        { status: "pending", markedAt }
      );
    }

    const eventWithCanceledPayments = findEvent(nextSharedState);
    const eventParticipantIds = new Set(event.participantIds);
    const eventParticipants = (nextSharedState.participants ?? []).filter(
      (participant) => eventParticipantIds.has(participant.id)
    );
    const settlement = reconcileSettlementTransfers(
      eventParticipants,
      event.expenses,
      eventWithCanceledPayments.transfers,
      settlementOptionsForEvent(event)
    );
    if (settlement.issues.length) {
      throw new Error(`Settlement failed: ${settlement.issues.join(" ")}`);
    }

    const nextEvent = {
      ...eventWithCanceledPayments,
      transfers: settlement.transfers
    };
    nextSharedState = {
      ...nextSharedState,
      events: nextSharedState.events.map((item) =>
        item.id === eventId ? nextEvent : item
      )
    };
    validateEvent(nextSharedState, sharedRow.id);
    assertCanceledRoute(nextEvent);

    const inviteRows = await transaction`
      select space_key
      from public.event_invite_tokens
      where event_id = ${eventId}
        and space_id = ${sharedRow.id}
      order by (revoked_at is null) desc, updated_at desc
      limit 1
    `;
    const fallbackCredentials = {
      id: sharedRow.id,
      key: String(inviteRows[0]?.space_key ?? "")
    };
    if (
      !eventShareCredentials({
        sharedSpaceId: fallbackCredentials.id,
        sharedSpaceKey: fallbackCredentials.key
      })
    ) {
      throw new Error("Shared event recovery credentials are unavailable.");
    }

    const workspaceRows = await transaction`
      select id, owner_user_id, snapshot_kind, state, updated_at
      from public.app_snapshots
      where snapshot_kind = 'workspace'
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(state -> 'events', '[]'::jsonb)
          ) as event(value)
          where event.value ->> 'id' = ${eventId}
        )
      for update
    `;
    const nextWorkspaces = workspaceRows.map((workspace) => {
      const localEvent = findEvent(workspace.state);
      const credentials = eventShareCredentials(localEvent) ?? fallbackCredentials;
      const nextState = mergeSharedEventIntoState(
        workspace.state,
        nextSharedState,
        credentials
      );
      validateEvent(nextState, workspace.id);
      assertCanceledRoute(findEvent(nextState));
      return { ...workspace, nextState };
    });

    const report = {
      mode: apply ? "apply" : "dry-run",
      eventId,
      eventName: event.name,
      sharedSnapshotId: sharedRow.id,
      workspaceCount: workspaceRows.length,
      expenseCount: event.expenses.length,
      expenseTotal: event.expenses.reduce(
        (total, expense) => total + expense.total,
        0
      ),
      canceledPaidTransfers: paidTransfers.map(summarizeTransfer),
      transfersBefore: event.transfers.map(summarizeTransfer),
      transfersAfter: nextEvent.transfers.map(summarizeTransfer)
    };

    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const backupPath = await writeBackup(sharedRow, workspaceRows);
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
  await sql.end();
}

function assertExpectedEvent(event, state) {
  if (!event) throw new Error(`Event ${eventId} was not found.`);
  const expenseTotal = (event.expenses ?? []).reduce(
    (total, expense) => total + expense.total,
    0
  );
  if (event.expenses?.length !== 3 || expenseTotal !== 39_000) {
    throw new Error(
      `Unexpected expenses: count=${event.expenses?.length}, total=${expenseTotal}.`
    );
  }
  if (event.participantIds?.length !== 4) {
    throw new Error(
      `Unexpected participant count: ${event.participantIds?.length}.`
    );
  }
  validateEvent(state, "shared-before");
}

function assertCanceledRoute(event) {
  const stillPaid = (event.transfers ?? []).filter(
    (transfer) =>
      transfer.status === "paid" &&
      transfer.fromParticipantId === fromParticipantId &&
      transfer.toParticipantId === toParticipantId
  );
  if (stillPaid.length) {
    throw new Error("The requested paid route remains paid after repair.");
  }

  const canceledIds = new Set(
    (event.transferStatusUpdates ?? [])
      .filter((update) => update.status === "pending")
      .map((update) => update.id)
  );
  if (!canceledIds.size) {
    throw new Error("The repair did not persist cancellation markers.");
  }
}

function validateEvent(state, label) {
  const event = findEvent(state);
  if (!event) throw new Error(`${label} is missing ${eventId}.`);
  const participantIds = new Set(event.participantIds ?? []);
  const validationState = {
    participants: (state.participants ?? []).filter((participant) =>
      participantIds.has(participant.id)
    ),
    groups: [],
    events: [event]
  };
  const errors = validateSharedStateFinancials(validationState, label);
  if (errors.length) throw new Error(errors.join(" "));
}

function findEvent(state) {
  return state.events?.find((event) => event.id === eventId);
}

function summarizeTransfer(transfer) {
  return {
    id: transfer.id,
    fromParticipantId: transfer.fromParticipantId,
    toParticipantId: transfer.toParticipantId,
    amount: transfer.amount,
    status: transfer.status
  };
}

async function writeBackup(sharedRow, workspaceRows) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.resolve(
    "downloads",
    `event-transfer-status-backup-${timestamp}.json`
  );
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        eventId,
        exportedAt: new Date().toISOString(),
        snapshots: [sharedRow, ...workspaceRows].map((row) => ({
          id: row.id,
          ownerUserId: row.owner_user_id,
          snapshotKind: row.snapshot_kind,
          updatedAt: row.updated_at,
          state: row.state
        }))
      },
      null,
      2
    ),
    "utf8"
  );
  return backupPath;
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}
