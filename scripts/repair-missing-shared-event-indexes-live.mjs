import { resolve } from "node:path";
import process from "node:process";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

const root = process.cwd();
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const apply = process.argv.includes("--apply");
const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  await sql.begin(async (transaction) => {
    const missing = await transaction`
      select
        member.snapshot_id,
        member.user_id::text as user_id,
        member.participant_id,
        shared_event.value ->> 'id' as event_id,
        shared_event.value ->> 'name' as event_name,
        workspace.id as workspace_id
      from private.shared_snapshot_members as member
      join public.app_snapshots as shared
        on shared.id = member.snapshot_id
       and shared.snapshot_kind = 'shared_event'
      join auth.users as account on account.id = member.user_id
      join public.app_snapshots as workspace
        on workspace.id = account.raw_user_meta_data ->> 'account_space_id'
       and workspace.snapshot_kind = 'workspace'
       and workspace.owner_user_id = account.id
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(shared.state -> 'events', '[]'::jsonb)
      ) as shared_event(value)
      where member.status = 'active'
        and coalesce(shared_event.value -> 'participantIds', '[]'::jsonb)
          ? member.participant_id
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(workspace.state -> 'events', '[]'::jsonb)
          ) as personal_event(value)
          where personal_event.value ->> 'id' = shared_event.value ->> 'id'
        )
      order by shared.updated_at desc, member.user_id
      for update of workspace
    `;

    const repaired = [];
    if (apply) {
      const affectedUserIds = [...new Set(missing.map((row) => row.user_id))];
      for (const userId of affectedUserIds) {
        const [result] = await transaction`
          select public.reconcile_shared_event_indexes_for_member(
            ${userId}::uuid
          ) as result
        `;
        repaired.push({
          userId,
          result: result?.result ?? null
        });
      }
    }

    console.log(JSON.stringify({
      ok: true,
      mode: apply ? "apply" : "dry-run",
      checkedAt: new Date().toISOString(),
      count: missing.length,
      missing,
      repaired
    }, null, 2));
  });
} finally {
  await sql.end({ timeout: 5 });
}
