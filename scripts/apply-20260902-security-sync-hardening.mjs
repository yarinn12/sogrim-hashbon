import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

const root = process.cwd();
const apply = process.argv.includes("--apply");
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");
if (!apply) {
  throw new Error("Refusing database changes without the explicit --apply flag");
}

const releases = [
  [
    "20260902093000_guard_closed_shared_event_integrity.sql",
    "verify_20260902093000_closed_shared_event_integrity.sql"
  ],
  [
    "20260902094500_commit_failed_friend_probe_limits.sql",
    "verify_20260902094500_failed_friend_probe_limits.sql"
  ],
  [
    "20260902101500_guard_trusted_avatar_origins.sql",
    "verify_20260902101500_trusted_avatar_origins.sql"
  ],
  [
    "20260902113000_isolate_shared_event_index_reconciliation.sql",
    "verify_20260902113000_shared_event_index_reconciliation.sql"
  ],
  [
    "20260902114500_reject_new_future_shared_merge_timestamps.sql",
    "verify_20260902114500_future_timestamp_guard.sql"
  ]
];

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  for (const [migrationName, verificationName] of releases) {
    const [migration, verification] = await Promise.all([
      readFile(resolve(root, "supabase/migrations", migrationName), "utf8"),
      readFile(resolve(root, "supabase/verification", verificationName), "utf8")
    ]);
    await sql.unsafe(migration);
    await sql.unsafe(verification);
    console.log(`Applied and verified ${migrationName}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
