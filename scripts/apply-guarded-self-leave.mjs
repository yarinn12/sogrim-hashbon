import {readFile} from "node:fs/promises";
import postgres from "postgres";
import {loadEnvFile} from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");
const apply = process.argv.includes("--apply"), dryRun = process.argv.includes("--dry-run");
if (apply && dryRun) throw new Error("Choose --apply or --dry-run, not both");
const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");
const migration = await readFile("supabase/migrations/20261003090000_allow_guarded_self_leave_receipt.sql", "utf8");
const verification = await readFile("supabase/verification/verify_20261003090000_allow_guarded_self_leave_receipt.sql", "utf8");
const sql = postgres(databaseUrl, {max:1, connect_timeout:15, idle_timeout:5, ssl:"require"});
try {
  if (dryRun) {
    if (!/commit;\s*$/.test(migration)) throw new Error("Migration transaction is missing");
    await sql.unsafe(migration.replace(/commit;\s*$/, () => verification + "\nrollback;"));
    console.log("Guarded self-leave migration verified with rollback.");
  } else {
    if (apply) await sql.unsafe(migration);
    await sql.unsafe(verification);
    console.log(apply ? "Guarded self-leave migration applied and verified." : "Guarded self-leave migration is active.");
  }
} finally {await sql.end({timeout:5});}
