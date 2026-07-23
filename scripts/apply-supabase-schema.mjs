import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

const root = process.cwd();
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");

const schema = await readFile(resolve(root, "supabase/schema.sql"), "utf8");
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  await sql.unsafe(schema);
  const [result] = await sql`
    select
      to_regclass('public.app_snapshots') is not null as table_ready,
      to_regprocedure('public.delete_account_data(uuid,text,text)') is not null as deletion_ready
  `;
  if (!result?.table_ready || !result?.deletion_ready) {
    throw new Error("Supabase schema verification failed");
  }
  console.log("Supabase schema is ready.");
} finally {
  await sql.end({ timeout: 5 });
}
