import { readFile } from "node:fs/promises";

import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl =
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing Supabase database URL.");

const migrationName = "20260829213000_enable_shared_event_notes";
const migration = await readFile(
  `supabase/migrations/${migrationName}.sql`,
  "utf8"
);
const verification = await readFile(
  "supabase/verification/verify_20260829213000_shared_event_notes.sql",
  "utf8"
);
const migrationBody = migration
  .replace(/^\s*begin;\s*/i, "")
  .replace(/\s*commit;\s*$/i, "");
const dryRun = process.argv.includes("--dry-run");
const rollbackMarker = new Error("SHARED_EVENT_NOTES_DRY_RUN_ROLLBACK");
const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5
});

try {
  try {
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migrationBody);
      await transaction.unsafe(verification);
      if (dryRun) throw rollbackMarker;
    });
  } catch (error) {
    if (error !== rollbackMarker) throw error;
  }
  console.log(JSON.stringify({
    ok: true,
    migration: migrationName,
    applied: !dryRun,
    verified: true
  }));
} finally {
  await sql.end({ timeout: 5 });
}
