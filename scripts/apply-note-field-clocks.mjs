import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");
const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (apply && dryRun) throw new Error("Choose --apply or --dry-run, not both");
const databaseUrl = process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");
const migration = await readFile("supabase/migrations/20260904003000_note_field_clocks.sql", "utf8");
const verification = await readFile("supabase/verification/verify_20260904003000_note_field_clocks.sql", "utf8") +
  "\n" + await readFile("supabase/verification/verify_20260903223000_preserve_complete_note_history.sql", "utf8");
const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15, idle_timeout: 5, ssl: "require" });
try {
  if (!/commit;\s*$/.test(migration)) throw new Error("Migration transaction is missing");
  if (dryRun || apply) {
    // Verify in the SAME transaction. A failed assertion rolls back the DDL.
    await sql.unsafe(migration.replace(/commit;\s*$/, () => verification + (dryRun ? "\nrollback;" : "\ncommit;")));
    console.log(dryRun ? "Note field clocks, legacy writes and history verified with rollback."
      : "Note field clocks applied and verified atomically.");
  } else {
    await sql.unsafe(verification);
    console.log("Note field clocks are active and verified.");
  }
} finally {
  await sql.end({ timeout: 5 });
}
