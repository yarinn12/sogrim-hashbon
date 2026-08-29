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

const migrationName = "20260828154500_admin_operational_health";
const [migration, verification] = await Promise.all([
  readFile(resolve(root, `supabase/migrations/${migrationName}.sql`), "utf8"),
  readFile(
    resolve(root, "supabase/verification/verify_20260828154500_admin_operational_health.sql"),
    "utf8"
  )
]);
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
  const [status] = await sql`
    select public.admin_operational_health(30) as health
  `;
  console.log(JSON.stringify({
    ok: true,
    migration: migrationName,
    continuity: status?.health?.dataContinuity ?? {},
    delivery: status?.health?.pushDelivery ?? {}
  }));
} finally {
  await sql.end({ timeout: 5 });
}
