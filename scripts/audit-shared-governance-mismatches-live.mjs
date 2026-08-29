import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const mismatches = await sql`
    select
      member.snapshot_id,
      member.user_id,
      profile.username,
      personal.id as workspace_id,
      shared.state -> 'events' -> 0 ->> 'id' as event_id,
      shared.state -> 'events' -> 0 ->> 'name' as event_name,
      private.event_admin_ids(shared.state) as canonical_admin_ids,
      coalesce(personal_event.value -> 'adminIds', '[]'::jsonb) as personal_admin_ids,
      coalesce(
        (shared.state -> 'events' -> 0 ->> 'adminsCanEditOnly')::boolean,
        false
      ) as canonical_collaborative,
      coalesce(
        (personal_event.value ->> 'adminsCanEditOnly')::boolean,
        false
      ) as personal_collaborative,
      personal_event.value ->> 'sharedSpaceId' as personal_space_id
    from private.shared_snapshot_members as member
    join public.app_snapshots as shared
      on shared.id = member.snapshot_id
     and shared.snapshot_kind = 'shared_event'
    join public.app_snapshots as personal
      on personal.owner_user_id = member.user_id
     and personal.snapshot_kind = 'workspace'
    left join public.user_profiles as profile on profile.user_id = member.user_id
    cross join lateral jsonb_array_elements(
      coalesce(personal.state -> 'events', '[]'::jsonb)
    ) as personal_event(value)
    where member.status = 'active'
      and member.removed_at is null
      and personal_event.value ->> 'id' =
        shared.state -> 'events' -> 0 ->> 'id'
      and (
        private.event_text_ids(personal_event.value, 'adminIds') is distinct from
          private.event_admin_ids(shared.state)
        or coalesce(
          (personal_event.value ->> 'adminsCanEditOnly')::boolean,
          false
        ) is distinct from coalesce(
          (shared.state -> 'events' -> 0 ->> 'adminsCanEditOnly')::boolean,
          false
        )
      )
    order by profile.username, event_name
  `;

  const invalidPersonalIndexes = await sql`
    select
      personal.id as workspace_id,
      personal.owner_user_id,
      profile.username,
      shared_event.value ->> 'id' as missing_event_id,
      shared_event.value ->> 'name' as missing_event_name,
      member.snapshot_id
    from public.app_snapshots as personal
    join public.user_profiles as profile
      on profile.user_id = personal.owner_user_id
    join private.shared_snapshot_members as member
      on member.user_id = personal.owner_user_id
    join public.app_snapshots as shared
      on shared.id = member.snapshot_id
     and shared.snapshot_kind = 'shared_event'
    cross join lateral jsonb_array_elements(
      coalesce(shared.state -> 'events', '[]'::jsonb)
    ) as shared_event(value)
    where personal.snapshot_kind = 'workspace'
      and member.status = 'active'
      and member.removed_at is null
      and coalesce(shared_event.value -> 'participantIds', '[]'::jsonb)
        ? member.participant_id
      and not exists (
        select 1
        from jsonb_array_elements(
          coalesce(personal.state -> 'events', '[]'::jsonb)
        ) as personal_event(value)
        where personal_event.value ->> 'id' = shared_event.value ->> 'id'
          and coalesce(personal_event.value -> 'participantIds', '[]'::jsonb)
            ? member.participant_id
          and not (
            coalesce(personal_event.value -> 'inactiveParticipantIds', '[]'::jsonb)
              ? member.participant_id
          )
      )
    order by profile.username, missing_event_name
  `;

  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    readOnly: true,
    mismatches,
    invalidPersonalIndexes
  }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
