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

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const rows = await sql`
    select
      event.value ->> 'id' as event_id,
      event.value ->> 'name' as event_name,
      snapshot.owner_user_id::text as owner_user_id,
      snapshot.updated_at,
      array(
        select pg_catalog.replace(
          participant.participant_id,
          'account-',
          ''
        )
        from pg_catalog.jsonb_array_elements_text(
          coalesce(event.value -> 'participantIds', '[]'::jsonb)
        ) as participant(participant_id)
        where participant.participant_id ~* '^account-[0-9a-f-]{36}$'
          and not coalesce(
            event.value -> 'inactiveParticipantIds',
            '[]'::jsonb
          ) ? participant.participant_id
      ) as active_account_user_ids
    from public.app_snapshots as snapshot
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(snapshot.state -> 'events', '[]'::jsonb)
    ) as event(value)
    where snapshot.snapshot_kind = 'workspace'
      and snapshot.owner_user_id is not null
      and coalesce(event.value ->> 'sharedSpaceId', '') = ''
      and event.value ->> 'createdByParticipantId' =
        'account-' || snapshot.owner_user_id::text
      and (event.value -> 'participantIds') ?
        ('account-' || snapshot.owner_user_id::text)
      and not coalesce(
        event.value -> 'inactiveParticipantIds',
        '[]'::jsonb
      ) ? ('account-' || snapshot.owner_user_id::text)
      and (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements_text(
          coalesce(event.value -> 'participantIds', '[]'::jsonb)
        ) as participant(participant_id)
        where participant.participant_id ~* '^account-[0-9a-f-]{36}$'
          and not coalesce(
            event.value -> 'inactiveParticipantIds',
            '[]'::jsonb
          ) ? participant.participant_id
      ) > 1
    order by snapshot.updated_at desc
  `;

  console.log(JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    count: rows.length,
    events: rows
  }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
