import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const eventName = process.argv.find((value) => value.startsWith("--event-name="))
  ?.slice("--event-name=".length)
  .trim();
if (!eventName) throw new Error("--event-name is required");

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
      snapshot.id as space_id,
      snapshot.state -> 'events' -> 0 ->> 'id' as event_id,
      coalesce((snapshot.state -> 'events' -> 0 ->> 'locked')::boolean, false) as locked,
      nullif(snapshot.state -> 'events' -> 0 ->> 'closedAt', '') is not null as closed,
      jsonb_array_length(coalesce(snapshot.state -> 'events' -> 0 -> 'participantIds', '[]'::jsonb)) as participant_count,
      coalesce(members.active_members, 0)::integer as active_member_count,
      coalesce(invites.open_invites, 0)::integer as active_open_invite_count,
      coalesce(invites.private_invites, 0)::integer as active_private_invite_count,
      coalesce(invites.revoked_invites, 0)::integer as revoked_invite_count,
      nullif(snapshot.state -> 'events' -> 0 ->> 'openInviteToken', '') is not null as event_has_token,
      coalesce(invites.active_token_matches_event, false) as active_token_matches_event,
      coalesce(invites.active_space_key_matches_snapshot, false) as active_space_key_matches_snapshot,
      coalesce(copies.copy_count, 0)::integer as personal_copy_count,
      coalesce(copies.copy_token_count, 0)::integer as personal_copy_token_count,
      coalesce(copies.copy_active_token_match, false) as personal_copy_active_token_match,
      snapshot.updated_at
    from public.app_snapshots as snapshot
    left join lateral (
      select count(*) filter (where member.status = 'active') as active_members
      from private.shared_snapshot_members as member
      where member.snapshot_id = snapshot.id
    ) as members on true
    left join lateral (
      select
        count(*) filter (where invite.kind = 'open' and invite.revoked_at is null) as open_invites,
        count(*) filter (where invite.kind = 'private' and invite.revoked_at is null) as private_invites,
        count(*) filter (where invite.revoked_at is not null) as revoked_invites,
        bool_or(
          invite.kind = 'open'
          and invite.revoked_at is null
          and invite.token_hash = encode(
            extensions.digest(snapshot.state -> 'events' -> 0 ->> 'openInviteToken', 'sha256'),
            'hex'
          )
        ) as active_token_matches_event,
        bool_or(
          invite.kind = 'open'
          and invite.revoked_at is null
          and snapshot.access_key_hash = encode(extensions.digest(invite.space_key, 'sha256'), 'hex')
        ) as active_space_key_matches_snapshot
      from public.event_invite_tokens as invite
      where invite.space_id = snapshot.id
        and invite.event_id = snapshot.state -> 'events' -> 0 ->> 'id'
    ) as invites on true
    left join lateral (
      select
        count(*) as copy_count,
        count(*) filter (where nullif(event_record.event ->> 'openInviteToken', '') is not null) as copy_token_count,
        bool_or(
          nullif(event_record.event ->> 'openInviteToken', '') is not null
          and exists (
            select 1
            from public.event_invite_tokens as invite
            where invite.space_id = snapshot.id
              and invite.event_id = snapshot.state -> 'events' -> 0 ->> 'id'
              and invite.kind = 'open'
              and invite.revoked_at is null
              and invite.token_hash = encode(
                extensions.digest(event_record.event ->> 'openInviteToken', 'sha256'),
                'hex'
              )
          )
        ) as copy_active_token_match
      from public.app_snapshots as personal
      cross join lateral jsonb_array_elements(coalesce(personal.state -> 'events', '[]'::jsonb)) as event_record(event)
      where personal.snapshot_kind = 'workspace'
        and event_record.event ->> 'id' = snapshot.state -> 'events' -> 0 ->> 'id'
    ) as copies on true
    where snapshot.snapshot_kind = 'shared_event'
      and snapshot.state -> 'events' -> 0 ->> 'name' = ${eventName}
    order by snapshot.updated_at desc
  `;
  console.log(JSON.stringify({ matches: rows.length, events: rows }));
} finally {
  await sql.end({ timeout: 5 });
}
