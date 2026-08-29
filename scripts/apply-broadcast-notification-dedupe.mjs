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
if (!databaseUrl) throw new Error("Supabase database URL is not configured.");

const migrationName = "20260828120000_dedupe_broadcast_notifications";
const migration = await readFile(
  resolve(root, `supabase/migrations/${migrationName}.sql`),
  "utf8"
);
const verification = await readFile(
  resolve(root, "supabase/verification/verify_20260828120000_broadcast_notification_dedupe.sql"),
  "utf8"
);
const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5
});

try {
  await sql.begin(async (transaction) => {
    await transaction.unsafe(migration);
    await transaction.unsafe(verification);
  });
  const [status] = await sql.unsafe(`
    select
      to_regclass('public.broadcast_notification_deliveries') is not null as table_exists,
      pg_catalog.count(*)::integer as delivery_count
    from public.broadcast_notification_deliveries
  `);
  console.log(JSON.stringify({
    ok: true,
    migration: migrationName,
    verified: status?.table_exists === true,
    deliveryCount: Number(status?.delivery_count ?? 0)
  }));
} finally {
  await sql.end();
}
