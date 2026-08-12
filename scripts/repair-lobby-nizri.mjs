import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";
import { mergeParticipants } from "../src/domain/appActions.mjs";
import {
  mergeSharedStates,
  validateSharedStateFinancials
} from "../src/domain/sharedStateMerge.mjs";

const EVENT_ID = "event-1785599593318-d10edffd8d78b";
const OWNER_USER_ID = "c6850f3c-a184-4a32-8d0b-74998985c594";
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
      select id, owner_user_id, state, updated_at
      from public.app_snapshots
      where state::text like ${`%${EVENT_ID}%`}
      order by updated_at desc
      for update
    `;
    if (rows.length < 2) {
      throw new Error(`Expected shared copies of ${EVENT_ID}, found ${rows.length}.`);
    }

    const ownerRow = rows.find(
      (row) => String(row.owner_user_id ?? "") === OWNER_USER_ID
    );
    if (!ownerRow) throw new Error("The event owner's snapshot was not found.");

    let canonicalState = mergeSharedStates(ownerRow.state, ownerRow.state);
    for (const duplicateId of DUPLICATE_MAOR_IDS) {
      canonicalState = mergeParticipants(
        canonicalState,
        duplicateId,
        ONLINE_MAOR_ID
      );
    }
    canonicalState = mergeSharedStates(canonicalState, canonicalState);

    const canonicalEvent = canonicalState.events.find(
      (event) => event.id === EVENT_ID
    );
    if (!canonicalEvent) throw new Error("Canonical event was not found.");
    canonicalEvent.participantAliases = {
      ...(canonicalEvent.participantAliases ?? {}),
      [ONLINE_MAOR_ID]: MAOR_ALIAS
    };

    assertExpectedEvent(canonicalEvent);
    const canonicalParticipants = canonicalState.participants.filter(
      (participant) => canonicalEvent.participantIds.includes(participant.id)
    );
    const repairedAt = new Date().toISOString();
    const repairedRows = rows.map((row) => ({
      ...row,
      state: repairSnapshot(
        row.state,
        canonicalEvent,
        canonicalParticipants,
        repairedAt
      )
    }));

    for (const row of repairedRows) {
      validateTargetEvent(row.state, row.id);
    }

    const report = {
      mode: apply ? "apply" : "dry-run",
      eventId: EVENT_ID,
      snapshotCount: rows.length,
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

    const backupPath = await writeBackup(rows);
    for (const row of repairedRows) {
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

function repairSnapshot(
  originalState,
  canonicalEvent,
  canonicalParticipants,
  repairedAt
) {
  let state = structuredClone(originalState);
  const onlineMaor = canonicalParticipants.find(
    (participant) => participant.id === ONLINE_MAOR_ID
  );
  if (!onlineMaor) throw new Error("The online Maor account is missing.");

  const targetIndex = (state.participants ?? []).findIndex(
    (participant) => participant.id === ONLINE_MAOR_ID
  );
  state.participants = [...(state.participants ?? [])];
  if (targetIndex < 0) {
    state.participants.push(structuredClone(onlineMaor));
  }

  for (const duplicateId of DUPLICATE_MAOR_IDS) {
    state = mergeParticipants(state, duplicateId, ONLINE_MAOR_ID);
  }

  const participantById = new Map(
    (state.participants ?? []).map((participant) => [participant.id, participant])
  );
  for (const participant of canonicalParticipants) {
    participantById.set(participant.id, {
      ...structuredClone(participant),
      ...structuredClone(participantById.get(participant.id) ?? {})
    });
  }
  for (const duplicateId of DUPLICATE_MAOR_IDS) {
    participantById.delete(duplicateId);
  }

  const deletionById = new Map(
    (state.deletedParticipants ?? []).map((deletion) => [deletion.id, deletion])
  );
  for (const duplicateId of DUPLICATE_MAOR_IDS) {
    deletionById.set(duplicateId, {
      id: duplicateId,
      reason: "merged",
      targetParticipantId: ONLINE_MAOR_ID,
      deletedAt: repairedAt
    });
  }

  return {
    ...state,
    participants: [...participantById.values()],
    deletedParticipants: [...deletionById.values()],
    events: (state.events ?? []).map((event) =>
      event.id === EVENT_ID ? structuredClone(canonicalEvent) : event
    )
  };
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
        snapshots: rows.map(({ id, owner_user_id, state, updated_at }) => ({
          id,
          ownerUserId: owner_user_id,
          updatedAt: updated_at,
          state
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
