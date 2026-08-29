import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

const root = process.cwd();
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");

const migrationName = "20260829141500_connected_event_publication_health";
const [migration, verification] = await Promise.all([
  readFile(resolve(root, `supabase/migrations/${migrationName}.sql`), "utf8"),
  readFile(
    resolve(
      root,
      "supabase/verification/verify_20260829141500_connected_event_publication_health.sql"
    ),
    "utf8"
  )
]);
const migrationBody = migration
  .replace(/^\s*begin;\s*/i, "")
  .replace(/\s*commit;\s*$/i, "");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  await sql.begin(async (transaction) => {
    await transaction.unsafe(migrationBody);
    await transaction.unsafe(verification);
  });
  console.log(JSON.stringify({ ok: true, migration: migrationName }, null, 2));
} finally {
  await sql.end();
}
