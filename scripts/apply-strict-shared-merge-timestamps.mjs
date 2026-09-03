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

const [migration, verification] = await Promise.all([
  readFile(
    resolve(
      root,
      "supabase/migrations/20260903093000_strict_shared_merge_timestamp_maps.sql"
    ),
    "utf8"
  ),
  readFile(
    resolve(
      root,
      "supabase/verification/verify_20260903093000_strict_shared_merge_timestamp_maps.sql"
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
  await sql.unsafe(migration);
  await sql.unsafe(verification);
  console.log("Applied and verified strict shared merge timestamp maps");
} finally {
  await sql.end({ timeout: 5 });
}
