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

const migrationPath = resolve(
  root,
  "supabase/migrations/20260831160000_redact_deleted_account_profiles.sql"
);
const verificationPath = resolve(
  root,
  "supabase/verification/verify_20260831160000_redact_deleted_account_profiles.sql"
);
const apply = process.argv.includes("--apply");
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  if (apply) {
    const migration = await readFile(migrationPath, "utf8");
    await sql.unsafe(migration);
  }
  const verification = await readFile(verificationPath, "utf8");
  await sql.unsafe(verification);
  console.log(apply
    ? "Deleted-account profile redaction was applied and verified."
    : "Deleted-account profile redaction is already active.");
} finally {
  await sql.end({ timeout: 5 });
}
