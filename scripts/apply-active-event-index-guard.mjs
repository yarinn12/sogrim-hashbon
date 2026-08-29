import fs from "node:fs/promises";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");

const migration = await fs.readFile(
  "supabase/migrations/20260828203000_guard_active_event_personal_index.sql",
  "utf8"
);
const verification = await fs.readFile(
  "supabase/verification/verify_20260828203000_guard_active_event_personal_index.sql",
  "utf8"
);
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  await sql.begin(async (transaction) => {
    await transaction.unsafe(migration);
    await transaction.unsafe(verification);
  });
  console.log(JSON.stringify({
    applied: true,
    migration: "20260828203000_guard_active_event_personal_index"
  }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
