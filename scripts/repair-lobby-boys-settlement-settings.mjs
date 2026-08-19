import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";
import {
  buildSharedEventState,
  eventShareCredentials
} from "../src/data/sharedEventStore.mjs";
import { validateSharedStateFinancials } from "../src/domain/sharedStateMerge.mjs";

const EVENT_ID = "event-1786746080561-9d50a768090a18";
const SHARED_SNAPSHOT_ID = "space-mstihi73-waamqyp7";
const SOURCE_WORKSPACE_ID = "space-mrp37ml0-tgu5rfyc";
const EXPECTED_EXPENSE_COUNT = 3;
const EXPECTED_EXPENSE_TOTAL = 39_000;

const apply = process.argv.includes("--apply");
const env = await readEnvFile(path.resolve(".env.local"));
const databaseUrl =
  env.SUPABASE_DB_URL ||
  env.DATABASE_URL ||
  env.POSTGRES_URL_NON_POOLING ||
  env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Missing Supabase database URL.");

const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

try {
  await sql.begin(async (transaction) => {
    const rows = await transaction`
      select
        id,
        owner_user_id,
        snapshot_kind,
        state,
        updated_at,
        updated_at::text as updated_at_exact
      from public.app_snapshots
      where id in (${SHARED_SNAPSHOT_ID}, ${SOURCE_WORKSPACE_ID})
      order by id
      for update
    `;
    const sharedRow = rows.find((row) => row.id === SHARED_SNAPSHOT_ID);
    const sourceRow = rows.find((row) => row.id === SOURCE_WORKSPACE_ID);
    if (!sharedRow || sharedRow.snapshot_kind !== "shared_event") {
      throw new Error("The expected shared event snapshot was not found.");
    }
    if (!sourceRow || sourceRow.snapshot_kind !== "workspace") {
      throw new Error("The expected manager workspace was not found.");
    }

    const sharedEvent = eventFrom(sharedRow.state);
    const sourceEvent = eventFrom(sourceRow.state);
    assertExpectedEvent(sharedEvent, "shared event");
    assertExpectedEvent(sourceEvent, "manager workspace");
    if (sourceEvent.directSettlementTransfers !== false) {
      throw new Error("The manager workspace no longer requests optimized transfers.");
    }
    if (sourceEvent.roundSettlementTransfers !== true) {
      throw new Error("The manager workspace no longer requests rounded transfers.");
    }
    if (
      !sourceRow.owner_user_id ||
      !sourceEvent.adminIds?.includes(sourceRow.state.currentParticipantId)
    ) {
      throw new Error("The source workspace is not owned by an event manager.");
    }
    const credentials = eventShareCredentials(sourceEvent);
    if (credentials?.id !== SHARED_SNAPSHOT_ID) {
      throw new Error("The manager workspace does not hold the expected event key.");
    }
    if (
      Date.parse(sourceEvent.settingsUpdatedAt || 0) <=
      Date.parse(sharedEvent.settingsUpdatedAt || 0)
    ) {
      throw new Error("The manager workspace settings are not newer than the shared event.");
    }

    const repairedState = structuredClone(sharedRow.state);
    const repairedEvent = eventFrom(repairedState);
    repairedEvent.directSettlementTransfers = false;
    repairedEvent.roundSettlementTransfers = true;
    repairedEvent.settingsUpdatedAt = sourceEvent.settingsUpdatedAt;
    assertOnlySettingsChanged(sharedEvent, repairedEvent);
    const errors = validateSharedStateFinancials(repairedState, "repaired shared event");
    if (errors.length) throw new Error(errors.join(" "));

    const report = {
      mode: apply ? "apply" : "dry-run",
      eventId: EVENT_ID,
      eventName: sharedEvent.name,
      before: summarize(sharedEvent),
      after: summarize(repairedEvent)
    };

    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const backupPath = await writeBackup(sharedRow);
    await transaction`
      select
        pg_catalog.set_config(
          'request.jwt.claim.sub',
          ${sourceRow.owner_user_id}::text,
          true
        ),
        pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)
    `;
    const [updateResult] = await transaction`
      select public.update_shared_event_snapshot(
        ${SHARED_SNAPSHOT_ID},
        ${credentials.key},
        (
          select current_snapshot.updated_at
          from public.app_snapshots as current_snapshot
          where current_snapshot.id = ${SHARED_SNAPSHOT_ID}
        ),
        ${transaction.json(buildSharedEventState(repairedState, EVENT_ID))}
      ) as result
    `;
    if (updateResult?.result?.status !== "updated") {
      throw new Error(
        `The guarded update did not complete: ${JSON.stringify(updateResult?.result)}`
      );
    }

    const [verifiedRow] = await transaction`
      select state, updated_at
      from public.app_snapshots
      where id = ${SHARED_SNAPSHOT_ID}
    `;
    const verifiedEvent = eventFrom(verifiedRow?.state);
    assertExpectedEvent(verifiedEvent, "verified shared event");
    assertOnlySettingsChanged(sharedEvent, verifiedEvent);
    if (
      verifiedEvent.directSettlementTransfers !== false ||
      verifiedEvent.roundSettlementTransfers !== true ||
      verifiedEvent.settingsUpdatedAt !== sourceEvent.settingsUpdatedAt
    ) {
      throw new Error("The shared event settings did not match after update.");
    }

    console.log(JSON.stringify({
      ...report,
      verified: summarize(verifiedEvent),
      backupPath
    }, null, 2));
  });
} finally {
  await sql.end();
}

function eventFrom(state) {
  const event = (state?.events ?? []).find((item) => item.id === EVENT_ID);
  if (!event) throw new Error(`Event ${EVENT_ID} was not found.`);
  return event;
}

function assertExpectedEvent(event, label) {
  const expenseTotal = (event.expenses ?? []).reduce(
    (sum, expense) => sum + expense.total,
    0
  );
  if (
    event.name !== "לובי בנים" ||
    event.expenses?.length !== EXPECTED_EXPENSE_COUNT ||
    expenseTotal !== EXPECTED_EXPENSE_TOTAL ||
    event.participantIds?.length !== 4 ||
    event.transfers?.length !== 3
  ) {
    throw new Error(`${label} no longer matches the reviewed live event.`);
  }
}

function assertOnlySettingsChanged(before, after) {
  const withoutSettings = (event) => {
    const copy = structuredClone(event);
    delete copy.directSettlementTransfers;
    delete copy.roundSettlementTransfers;
    delete copy.settingsUpdatedAt;
    return copy;
  };
  if (
    JSON.stringify(withoutSettings(before)) !==
    JSON.stringify(withoutSettings(after))
  ) {
    throw new Error("The repair attempted to change event data outside settlement settings.");
  }
}

function summarize(event) {
  return {
    roundSettlementTransfers: event.roundSettlementTransfers !== false,
    directSettlementTransfers: event.directSettlementTransfers === true,
    settingsUpdatedAt: event.settingsUpdatedAt,
    expenseCount: event.expenses.length,
    participantCount: event.participantIds.length,
    transferCount: event.transfers.length
  };
}

async function writeBackup(row) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.resolve(
    "downloads",
    `lobby-boys-settings-backup-${timestamp}.json`
  );
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        snapshotId: row.id,
        updatedAt: row.updated_at,
        exportedAt: new Date().toISOString(),
        state: row.state
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
