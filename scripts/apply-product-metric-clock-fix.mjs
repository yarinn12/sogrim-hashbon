import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured.");

const migration = await readFile(
  resolve("supabase/migrations/20260829170000_fix_product_metric_rate_limit_clock.sql"),
  "utf8"
);
const verification = await readFile(
  resolve("supabase/verification/verify_20260829170000_product_metric_rate_limit_clock.sql"),
  "utf8"
);
const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

try {
  await sql.unsafe(migration);
  await sql.unsafe(verification);
  console.log(JSON.stringify({ applied: true, verified: true }));
} finally {
  await sql.end({ timeout: 5 });
}
