import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const rows = await sql`
    select
      coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', '') as display_name,
      coalesce(raw_app_meta_data ->> 'provider', '') as provider,
      last_sign_in_at,
      updated_at,
      nullif(raw_user_meta_data ->> 'account_space_id', '') is not null as has_workspace,
      nullif(raw_user_meta_data ->> 'username', '') is not null as has_username
    from auth.users
    where last_sign_in_at > pg_catalog.now() - interval '2 hours'
      and email not like 'qa-%@example.test'
    order by last_sign_in_at desc
    limit 20
  `;
  console.log(JSON.stringify({ recent_sign_ins: rows }));
} finally {
  await sql.end({ timeout: 5 });
}
