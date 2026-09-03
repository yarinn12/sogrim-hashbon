import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

const root = process.cwd();
const apply = process.argv.includes("--apply");
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");

const [migration, verification] = await Promise.all([
  readFile(
    resolve(
      root,
      "supabase/migrations/20260903193000_atomic_shared_event_note_replication.sql"
    ),
    "utf8"
  ),
  readFile(
    resolve(
      root,
      "supabase/verification/verify_20260903193000_atomic_shared_event_note_replication.sql"
    ),
    "utf8"
  )
]);

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  if (apply) await sql.unsafe(migration);
  await sql.unsafe(verification);
  console.log(
    apply
      ? "Atomic shared-event note replication was applied and verified."
      : "Atomic shared-event note replication is already active."
  );
} finally {
  await sql.end({ timeout: 5 });
}
