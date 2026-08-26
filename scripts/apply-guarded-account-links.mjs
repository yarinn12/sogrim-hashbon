import { readFile } from "node:fs/promises";
import process from "node:process";

import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Missing Supabase database URL.");

const migration = await readFile(
  "supabase/migrations/20260826223000_allow_guarded_event_account_links.sql",
  "utf8"
);
const migrationBody = migration
  .replace(/^\s*begin;\s*/i, "")
  .replace(/\s*commit;\s*$/i, "");
const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 1,
  connect_timeout: 15
});

try {
  await sql.begin(async (transaction) => {
    await transaction.unsafe(migrationBody);
  });
  const [installed] = await sql`
    select
      pg_catalog.to_regprocedure(
        'private.authorized_shared_event_account_link(text,jsonb,jsonb,text)'
      ) is not null as authorization_helper_ready,
      pg_catalog.to_regprocedure(
        'private.has_authorized_transfer_status_changes(jsonb,jsonb,text,text)'
      ) is not null as payment_guard_ready,
      pg_catalog.to_regprocedure(
        'private.has_preserved_paid_history_for_account_link(jsonb,jsonb,jsonb)'
      ) is not null as paid_history_guard_ready,
      pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(
          'private.guard_shared_event_financial_integrity()'::regprocedure
        ),
        'authorized_shared_event_account_link'
      ) > 0 as financial_trigger_ready,
      pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(
          'private.revoke_event_invites_after_member_removal()'::regprocedure
        ),
        'authorized_shared_event_account_link'
      ) > 0 as invite_preservation_ready
  `;
  console.log(JSON.stringify({ committed: true, ...installed }));
} finally {
  await sql.end({ timeout: 5 });
}
