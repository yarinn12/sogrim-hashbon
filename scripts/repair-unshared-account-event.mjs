import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

import {
  buildSharedEventState,
  ensureEventShareCredentials
} from "../src/data/sharedEventStore.mjs";
import { createClientSpaceId, createClientSpaceKey } from "../src/domain/cloudSpace.mjs";
import { validateSharedStateFinancials } from "../src/domain/sharedStateMerge.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const eventId = argumentValue("--event-id");
const targetUserId = argumentValue("--user-id");
const apply = process.argv.includes("--apply");
if (!eventId) {
  throw new Error(
    "Usage: node scripts/repair-unshared-account-event.mjs --event-id <id> " +
      "[--user-id <uuid>] [--apply]"
  );
}

const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Missing Supabase database URL.");

const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

try {
  await sql.begin(async (transaction) => {
    const rows = await transaction`
      select snapshot.id, snapshot.owner_user_id, snapshot.state, snapshot.updated_at
      from public.app_snapshots as snapshot
      where snapshot.snapshot_kind = 'workspace'
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(snapshot.state -> 'events', '[]'::jsonb)
          ) as event(value)
          where event.value ->> 'id' = ${eventId}
        )
      order by snapshot.updated_at desc
      for update
    `;
    const unsharedRows = rows.filter((row) => {
      const event = row.state.events?.find((item) => item.id === eventId);
      return event && !event.sharedSpaceId && !event.sharedSpaceKey;
    });
    if (unsharedRows.length !== 1) {
      throw new Error(
        `Expected one unshared owner workspace for ${eventId}, found ${unsharedRows.length}.`
      );
    }

    const ownerWorkspace = unsharedRows[0];
    const ownerState = structuredClone(ownerWorkspace.state);
    const event = ownerState.events.find((item) => item.id === eventId);
    const accountUserIds = [
      ...new Set(
        (event.participantIds ?? [])
          .filter((participantId) =>
            /^account-[0-9a-f-]{36}$/i.test(String(participantId))
          )
          .map((participantId) => participantId.slice("account-".length))
      )
    ];
    if (targetUserId && !accountUserIds.includes(targetUserId)) {
      throw new Error(`${targetUserId} is not an account participant in ${eventId}.`);
    }

    const credentials = ensureEventShareCredentials(event, {
      createId: createClientSpaceId,
      createKey: createClientSpaceKey
    });
    const sharedState = buildSharedEventState(ownerState, eventId);
    const financialErrors = validateSharedStateFinancials(sharedState, eventId);
    if (financialErrors.length) throw new Error(financialErrors.join(" "));

    const workspaceBackups = await transaction`
      select id, owner_user_id, state, updated_at
      from public.app_snapshots
      where snapshot_kind = 'workspace'
        and owner_user_id = any(
          ${transaction.array(accountUserIds)}::uuid[]
        )
      order by owner_user_id, updated_at desc
    `;
    const report = {
      mode: apply ? "apply" : "dry-run",
      eventId,
      eventName: event.name,
      ownerUserId: String(ownerWorkspace.owner_user_id),
      ownerWorkspaceId: ownerWorkspace.id,
      targetUserId: targetUserId || null,
      accountUserIds,
      sharedSnapshotId: credentials.id
    };
    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const backupPath = await writeBackup({
      eventId,
      ownerWorkspace,
      workspaceBackups
    });
    await transaction`
      select pg_catalog.set_config(
        'request.jwt.claim.sub',
        ${String(ownerWorkspace.owner_user_id)},
        true
      )
    `;
    await transaction`
      select public.create_shared_event_snapshot(
        ${credentials.id},
        ${credentials.key},
        ${transaction.json(sharedState)}
      )
    `;
    await transaction`
      update public.app_snapshots
      set state = ${transaction.json(ownerState)},
          updated_at = pg_catalog.now()
      where id = ${ownerWorkspace.id}
    `;

    const indexedUsers = [];
    for (const userId of accountUserIds) {
      if (userId === String(ownerWorkspace.owner_user_id)) continue;
      if (targetUserId && userId !== targetUserId) continue;
      const [indexed] = await transaction`
        select public.index_shared_event_for_member(
          ${credentials.id},
          ${userId}::uuid
        ) as result
      `;
      indexedUsers.push({
        userId,
        result: indexed?.result ?? null
      });
    }

    console.log(JSON.stringify({
      ...report,
      backupPath,
      indexedUsers
    }, null, 2));
  });
} finally {
  await sql.end();
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}

async function writeBackup(payload) {
  const directory = path.resolve("downloads");
  await fs.mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    directory,
    `unshared-event-backup-${timestamp}.json`
  );
  await fs.writeFile(backupPath, JSON.stringify(payload, null, 2), "utf8");
  return backupPath;
}
