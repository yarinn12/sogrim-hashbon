import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

const root = process.cwd();
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const databaseUrl =
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");

const migrationName = "20260827201000_backfill_canonical_event_membership";
const migration = await readFile(
  resolve(root, `supabase/migrations/${migrationName}.sql`),
  "utf8"
);
const verification = await readFile(
  resolve(
    root,
    "supabase/verification/verify_20260827201000_canonical_event_membership_backfill.sql"
  ),
  "utf8"
);
const dryRun = process.argv.includes("--dry-run");
const rollbackMarker = new Error("CANONICAL_MEMBERSHIP_BACKFILL_DRY_RUN");
const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5
});

try {
  let repaired = 0;
  try {
    await sql.begin(async (transaction) => {
      const before = await countMissingMemberships(transaction);
      await transaction.unsafe(migration);
      await transaction.unsafe(verification);
      const after = await countMissingMemberships(transaction);
      repaired = before - after;
      if (dryRun) throw rollbackMarker;
    });
  } catch (error) {
    if (error !== rollbackMarker) throw error;
  }
  console.log(JSON.stringify({
    ok: true,
    migration: migrationName,
    applied: !dryRun,
    verified: true,
    repaired
  }));
} finally {
  await sql.end();
}

async function countMissingMemberships(database) {
  const [row] = await database.unsafe(`
    with active_account_members as (
      select snapshot.id as snapshot_id, account.id as user_id
      from public.app_snapshots as snapshot
      cross join lateral pg_catalog.unnest(
        private.active_event_participant_ids(snapshot.state)
      ) as active_participant(participant_id)
      join auth.users as account
        on account.id = case
          when active_participant.participant_id ~* (
            '^account-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-' ||
            '[0-9a-f]{4}-[0-9a-f]{12}$'
          ) then pg_catalog.substr(active_participant.participant_id, 9)::uuid
          else null
        end
      where snapshot.snapshot_kind = 'shared_event'
        and snapshot.state -> 'events' -> 0 is not null
    )
    select pg_catalog.count(*)::integer as missing
    from active_account_members as active
    left join private.shared_snapshot_members as member
      on member.snapshot_id = active.snapshot_id
      and member.user_id = active.user_id
      and member.status = 'active'
    where member.user_id is null
  `);
  return Number(row?.missing ?? 0);
}
