import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";
import { validateSharedStateFinancials } from "../src/domain/sharedStateMerge.mjs";
import {
  eventShareCredentials,
  mergeSharedEventIntoState
} from "../src/data/sharedEventStore.mjs";

const EVENT_ID = "event-1785599593318-d10edffd8d78b";
const ONLINE_MAOR_ID = "account-87b6c358-fe9c-448f-84e6-6bb093273944";
const MAOR_ALIAS = "מאור סיבוני";
const DUPLICATE_MAOR_IDS = [
  "guest-1785599646932-6e17dc66d86b38",
  "guest-1784820382265-a8f2db61015fb"
];
const EXPECTED_EXPENSE_TOTAL = 30_300;

const apply = process.argv.includes("--apply");
const env = await readEnvFile(path.resolve(".env.local"));
const databaseUrl =
  env.SUPABASE_DB_URL || env.DATABASE_URL || env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Missing Supabase database URL.");

const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

try {
  await sql.begin(async (transaction) => {
    const rows = await transaction`
      select id, owner_user_id, snapshot_kind, state, updated_at
      from public.app_snapshots
      where state::text like ${`%${EVENT_ID}%`}
      order by updated_at desc
      for update
    `;
    if (rows.length < 2) {
      throw new Error(`Expected shared copies of ${EVENT_ID}, found ${rows.length}.`);
    }

    const sharedRow = rows.find(
      (row) => row.snapshot_kind === "shared_event"
    );
    if (!sharedRow) throw new Error("The shared event snapshot was not found.");

    const canonicalEvent = sharedRow.state.events.find(
      (event) => event.id === EVENT_ID
    );
    if (!canonicalEvent) throw new Error("The shared event was not found.");

    assertExpectedEvent(canonicalEvent);
    const canonicalParticipants = sharedRow.state.participants.filter(
      (participant) => canonicalEvent.participantIds.includes(participant.id)
    );
    const repairedRows = rows.map((row) => {
      if (row.snapshot_kind !== "workspace") {
        return { ...row, changed: false };
      }
      const localEvent = row.state.events?.find((event) => event.id === EVENT_ID);
      if (!localEvent) return { ...row, changed: false };
      if (!needsParticipantRepair(row.state)) {
        return { ...row, changed: false };
      }
      const credentials = eventShareCredentials(localEvent);
      if (!credentials) {
        throw new Error(`${row.id} is missing shared event credentials.`);
      }
      const repairedState = mergeSharedEventIntoState(
        row.state,
        sharedRow.state,
        credentials
      );
      return {
        ...row,
        originalState: row.state,
        state: repairedState,
        changed: JSON.stringify(repairedState) !== JSON.stringify(row.state)
      };
    });

    for (const row of repairedRows) {
      validateTargetEvent(row.state, row.id);
    }
    const changedRows = repairedRows.filter((row) => row.changed);

    const report = {
      mode: apply ? "apply" : "dry-run",
      eventId: EVENT_ID,
      snapshotCount: rows.length,
      changedWorkspaceCount: changedRows.length,
      changedWorkspaces: changedRows.map((row) => ({
        snapshotId: row.id,
        before: summarizeEvent(row.originalState),
        after: summarizeEvent(row.state)
      })),
      expenseCount: canonicalEvent.expenses.length,
      expenseTotal: canonicalEvent.expenses.reduce(
        (sum, expense) => sum + expense.total,
        0
      ),
      participantCount: canonicalEvent.participantIds.length,
      transferCount: canonicalEvent.transfers.length,
      transfers: canonicalEvent.transfers.map((transfer) => ({
        from: participantName(canonicalParticipants, transfer.fromParticipantId),
        to: participantName(canonicalParticipants, transfer.toParticipantId),
        amount: transfer.amount,
        status: transfer.status
      }))
    };

    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const backupPath = await writeBackup(changedRows);
    for (const row of changedRows) {
      await transaction`
        update public.app_snapshots
        set state = ${transaction.json(row.state)}, updated_at = now()
        where id = ${row.id}
      `;
    }
    console.log(JSON.stringify({ ...report, backupPath }, null, 2));
  });
} finally {
  await sql.end();
}

function assertExpectedEvent(event) {
  const expenseTotal = (event.expenses ?? []).reduce(
    (sum, expense) => sum + expense.total,
    0
  );
  if (event.expenses?.length !== 3 || expenseTotal !== EXPECTED_EXPENSE_TOTAL) {
    throw new Error(
      `Unexpected expenses: count=${event.expenses?.length}, total=${expenseTotal}.`
    );
  }
  if (event.participantIds?.length !== 4) {
    throw new Error(`Unexpected participant count: ${event.participantIds?.length}.`);
  }
  if (event.transfers?.length !== 3) {
    throw new Error(`Unexpected transfer count: ${event.transfers?.length}.`);
  }
  if (
    DUPLICATE_MAOR_IDS.some((participantId) =>
      JSON.stringify(event).includes(participantId)
    )
  ) {
    throw new Error("A duplicate Maor identity still appears in the event.");
  }
}

function validateTargetEvent(state, snapshotId) {
  const event = (state.events ?? []).find((item) => item.id === EVENT_ID);
  if (!event) throw new Error(`${snapshotId} lost the repaired event.`);
  const referencedIds = new Set(event.participantIds ?? []);
  const validationState = {
    participants: (state.participants ?? []).filter((participant) =>
      referencedIds.has(participant.id)
    ),
    groups: [],
    events: [event]
  };
  const errors = validateSharedStateFinancials(validationState, snapshotId);
  if (errors.length) throw new Error(errors.join(" "));
  assertExpectedEvent(event);
}

function participantName(participants, participantId) {
  if (participantId === ONLINE_MAOR_ID) return MAOR_ALIAS;
  return participants.find((participant) => participant.id === participantId)
    ?.displayName ?? participantId;
}

function summarizeEvent(state) {
  const event = state.events?.find((item) => item.id === EVENT_ID);
  const activeState = {
    participants: state.participants ?? [],
    groups: state.groups ?? [],
    events: state.events ?? []
  };
  return {
    participantIds: event?.participantIds ?? [],
    expenseIds: (event?.expenses ?? []).map((expense) => expense.id),
    expenseTotal: (event?.expenses ?? []).reduce(
      (sum, expense) => sum + expense.total,
      0
    ),
    transfers: (event?.transfers ?? []).map((transfer) => ({
      id: transfer.id,
      from: transfer.fromParticipantId,
      to: transfer.toParticipantId,
      amount: transfer.amount,
      status: transfer.status
    })),
    activeDuplicateIds: DUPLICATE_MAOR_IDS.filter((participantId) =>
      JSON.stringify(activeState).includes(participantId)
    ),
    mergeTombstoneIds: (state.deletedParticipants ?? [])
      .filter(
        (deletion) =>
          deletion.reason === "merged" &&
          deletion.targetParticipantId === ONLINE_MAOR_ID
      )
      .map((deletion) => deletion.id)
  };
}

function needsParticipantRepair(state) {
  const activeState = JSON.stringify({
    participants: state.participants ?? [],
    groups: state.groups ?? [],
    events: state.events ?? []
  });
  const tombstones = new Set(
    (state.deletedParticipants ?? [])
      .filter(
        (deletion) =>
          deletion.reason === "merged" &&
          deletion.targetParticipantId === ONLINE_MAOR_ID
      )
      .map((deletion) => deletion.id)
  );
  return DUPLICATE_MAOR_IDS.some(
    (participantId) =>
      activeState.includes(participantId) || !tombstones.has(participantId)
  );
}

async function writeBackup(rows) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.resolve(
    "downloads",
    `lobby-nizri-backup-${timestamp}.json`
  );
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        eventId: EVENT_ID,
        exportedAt: new Date().toISOString(),
        snapshots: rows.map(({ id, owner_user_id, originalState, state, updated_at }) => ({
          id,
          ownerUserId: owner_user_id,
          updatedAt: updated_at,
          state: originalState ?? state
        }))
      },
      null,
      2
    ),
    "utf8"
  );
  return backupPath;
}

async function readEnvFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      })
  );
}
