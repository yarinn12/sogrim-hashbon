import { resolve } from "node:path";
import process from "node:process";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

const root = process.cwd();
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const eventName = argumentValue("--name");
if (!eventName) {
  throw new Error("Usage: node scripts/audit-event-visibility-live.mjs --name <event-name>");
}

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
  const events = await sql`
    select
      snapshot.id as snapshot_id,
      snapshot.snapshot_kind,
      snapshot.owner_user_id::text as owner_user_id,
      snapshot.updated_at,
      event.value ->> 'id' as event_id,
      event.value ->> 'name' as event_name,
      event.value ->> 'sharedSpaceId' as shared_space_id,
      event.value -> 'participantIds' as participant_ids,
      event.value -> 'inactiveParticipantIds' as inactive_participant_ids,
      event.value -> 'participantAccountLinks' as participant_account_links,
      event.value -> 'adminIds' as admin_ids
    from public.app_snapshots as snapshot
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(snapshot.state -> 'events', '[]'::jsonb)
    ) as event(value)
    where pg_catalog.lower(event.value ->> 'name') =
      pg_catalog.lower(${eventName})
    order by snapshot.updated_at desc
  `;

  const eventIds = [...new Set(events.map((row) => row.event_id).filter(Boolean))];
  const memberships = eventIds.length
    ? await sql`
        select
          shared_event.value ->> 'id' as event_id,
          member.snapshot_id,
          member.user_id::text as user_id,
          member.participant_id,
          member.role,
          member.status,
          member.removed_at,
          exists (
            select 1
            from public.app_snapshots as workspace
            cross join lateral pg_catalog.jsonb_array_elements(
              coalesce(workspace.state -> 'events', '[]'::jsonb)
            ) as personal_event(value)
            where workspace.owner_user_id = member.user_id
              and workspace.snapshot_kind = 'workspace'
              and personal_event.value ->> 'id' = shared_event.value ->> 'id'
          ) as personal_index_present
        from private.shared_snapshot_members as member
        join public.app_snapshots as shared
          on shared.id = member.snapshot_id
         and shared.snapshot_kind = 'shared_event'
        cross join lateral pg_catalog.jsonb_array_elements(
          coalesce(shared.state -> 'events', '[]'::jsonb)
        ) as shared_event(value)
        where shared_event.value ->> 'id' = any(${sql.array(eventIds)})
        order by shared_event.value ->> 'id', member.user_id
      `
    : [];

  const matchingProfiles = await sql`
    select distinct
      workspace.owner_user_id::text as owner_user_id,
      participant.value ->> 'id' as participant_id,
      participant.value ->> 'displayName' as display_name,
      participant.value ->> 'username' as username
    from public.app_snapshots as workspace
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(workspace.state -> 'participants', '[]'::jsonb)
    ) as participant(value)
    where workspace.snapshot_kind = 'workspace'
      and (
        participant.value ->> 'displayName' ilike '%הראל%'
        or participant.value ->> 'username' ilike '%harel%'
      )
    order by workspace.owner_user_id::text, participant.value ->> 'id'
  `;

  const eventOwnerUserIds = [
    ...new Set(events.map((row) => row.owner_user_id).filter(Boolean))
  ];
  const accountProfiles = eventOwnerUserIds.length
    ? await sql`
        select
          workspace.owner_user_id::text as owner_user_id,
          workspace.state ->> 'currentParticipantId' as current_participant_id,
          current_profile.value ->> 'displayName' as display_name,
          current_profile.value ->> 'username' as username,
          workspace.updated_at
        from public.app_snapshots as workspace
        left join lateral (
          select participant.value
          from pg_catalog.jsonb_array_elements(
            coalesce(workspace.state -> 'participants', '[]'::jsonb)
          ) as participant(value)
          where participant.value ->> 'id' =
            workspace.state ->> 'currentParticipantId'
          limit 1
        ) as current_profile on true
        where workspace.snapshot_kind = 'workspace'
          and workspace.owner_user_id::text = any(
            ${sql.array(eventOwnerUserIds)}
          )
        order by workspace.owner_user_id::text
      `
    : [];

  console.log(JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    eventName,
    events,
    memberships,
    matchingProfiles,
    accountProfiles
  }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}
