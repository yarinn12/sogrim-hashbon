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

const migration = await readFile(
  resolve(
    root,
    "supabase/migrations/20260826204500_auto_grant_canonical_event_membership.sql"
  ),
  "utf8"
);
const verification = await readFile(
  resolve(
    root,
    "supabase/verification/verify_20260826204500_auto_grant_canonical_event_membership.sql"
  ),
  "utf8"
);
const dryRun = process.argv.includes("--dry-run");
const rollbackMarker = new Error("CANONICAL_MEMBERSHIP_DRY_RUN_ROLLBACK");
const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5
});

try {
  try {
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migration);
      await transaction.unsafe(verification);
      if (dryRun) throw rollbackMarker;
    });
  } catch (error) {
    if (error !== rollbackMarker) throw error;
  }
  console.log(JSON.stringify({
    ok: true,
    migration: "20260826204500_auto_grant_canonical_event_membership",
    applied: !dryRun,
    verified: true
  }));
} finally {
  await sql.end();
}
