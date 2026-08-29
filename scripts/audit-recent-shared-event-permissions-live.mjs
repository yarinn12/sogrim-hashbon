import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");

const hoursArgument = process.argv.find((value) => value.startsWith("--hours="));
const hours = Math.min(Math.max(Number(hoursArgument?.slice(8) || 6), 1), 168);
const eventArgument = process.argv.find((value) => value.startsWith("--event="));
const eventNameFilter = String(eventArgument?.slice(8) ?? "").trim();
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const rows = await sql`
    select
      snapshot.id as snapshot_id,
      snapshot.updated_at,
      snapshot.state -> 'events' -> 0 ->> 'id' as event_id,
      snapshot.state -> 'events' -> 0 ->> 'name' as event_name,
      coalesce(
        (snapshot.state -> 'events' -> 0 ->> 'adminsCanEditOnly')::boolean,
        false
      ) as admins_can_edit_only,
      coalesce(
        snapshot.state -> 'events' -> 0 -> 'participantIds',
        '[]'::jsonb
      ) as participant_ids,
      coalesce(
        snapshot.state -> 'events' -> 0 -> 'adminIds',
        '[]'::jsonb
      ) as admin_ids,
      coalesce(
        (snapshot.state -> 'events' -> 0 ->> 'adminIdsScopedToEvent')::boolean,
        false
      ) as admin_ids_scoped_to_event,
      snapshot.state -> 'events' -> 0 ->> 'adminIdsUpdatedAt' as admin_ids_updated_at,
      jsonb_array_length(
        coalesce(snapshot.state -> 'events' -> 0 -> 'expenses', '[]'::jsonb)
      ) as expense_count,
      jsonb_array_length(
        coalesce(snapshot.state -> 'events' -> 0 -> 'deletedExpenses', '[]'::jsonb)
      ) as deleted_expense_count,
      coalesce(members.active_members, '[]'::jsonb) as active_members,
      coalesce(invites.active_invites, '[]'::jsonb) as active_invites,
      coalesce(invites.recent_invites, '[]'::jsonb) as recent_invites,
      coalesce(personal_refs.references, '[]'::jsonb) as personal_references
    from public.app_snapshots as snapshot
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'participantId', member.participant_id,
          'role', member.role,
          'username', profile.username,
          'status', member.status,
          'updatedAt', member.updated_at
        ) order by member.updated_at desc
      ) filter (where member.status = 'active') as active_members
      from private.shared_snapshot_members as member
      left join public.user_profiles as profile on profile.user_id = member.user_id
      where member.snapshot_id = snapshot.id
    ) as members on true
    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'kind', invite.kind,
            'expiresAt', invite.expires_at,
            'lastRedeemedAt', invite.last_redeemed_at,
            'revokedAt', invite.revoked_at
          ) order by invite.created_at desc
        ) filter (
          where invite.revoked_at is null
            and invite.expires_at > now()
        ) as active_invites,
        jsonb_agg(
          jsonb_build_object(
            'kind', invite.kind,
            'createdAt', invite.created_at,
            'expiresAt', invite.expires_at,
            'lastRedeemedAt', invite.last_redeemed_at,
            'revokedAt', invite.revoked_at
          ) order by invite.created_at desc
        ) filter (where invite.created_at > now() - make_interval(hours => ${hours}))
          as recent_invites
      from public.event_invite_tokens as invite
      where invite.space_id = snapshot.id
        and invite.event_id = snapshot.state -> 'events' -> 0 ->> 'id'
    ) as invites on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
           'workspaceId', personal.id,
           'username', profile.username,
           'sharedSpaceId', event_record.event ->> 'sharedSpaceId',
           'hasSharedSpaceKey', nullif(event_record.event ->> 'sharedSpaceKey', '') is not null,
           'adminIds', coalesce(event_record.event -> 'adminIds', '[]'::jsonb),
           'adminIdsScopedToEvent', coalesce(
             (event_record.event ->> 'adminIdsScopedToEvent')::boolean,
             false
           ),
           'adminIdsUpdatedAt', event_record.event ->> 'adminIdsUpdatedAt',
           'workspaceUpdatedAt', personal.updated_at
        ) order by personal.updated_at desc
      ) as references
      from public.app_snapshots as personal
      cross join lateral jsonb_array_elements(
        coalesce(personal.state -> 'events', '[]'::jsonb)
      ) as event_record(event)
      left join auth.users as account
        on account.raw_user_meta_data ->> 'account_space_id' = personal.id
      left join public.user_profiles as profile on profile.user_id = account.id
      where personal.snapshot_kind = 'workspace'
        and event_record.event ->> 'id' = snapshot.state -> 'events' -> 0 ->> 'id'
    ) as personal_refs on true
    where snapshot.snapshot_kind = 'shared_event'
      and snapshot.updated_at > now() - make_interval(hours => ${hours})
      and (
        ${eventNameFilter} = ''
        or snapshot.state -> 'events' -> 0 ->> 'name' = ${eventNameFilter}
      )
    order by snapshot.updated_at desc
  `;

  const events = rows.map((row) => {
    const participantIds = Array.isArray(row.participant_ids)
      ? row.participant_ids.map(String)
      : [];
    const activeMembers = Array.isArray(row.active_members) ? row.active_members : [];
    const activeParticipantIds = new Set(
      activeMembers.map((member) => String(member.participantId ?? ""))
    );
    const missingAccountMemberships = participantIds.filter(
      (participantId) =>
        /^account-[0-9a-fA-F-]{36}$/.test(participantId) &&
        !activeParticipantIds.has(participantId)
    );
    return {
      snapshotId: row.snapshot_id,
      eventId: row.event_id,
      eventName: row.event_name,
      updatedAt: row.updated_at,
      adminsCanEditOnly: row.admins_can_edit_only,
      participantIds,
      adminIds: row.admin_ids,
      adminIdsScopedToEvent: row.admin_ids_scoped_to_event,
      adminIdsUpdatedAt: row.admin_ids_updated_at,
      expenseCount: row.expense_count,
      deletedExpenseCount: row.deleted_expense_count,
      activeMembers,
      missingAccountMemberships,
      activeInvites: row.active_invites,
      recentInvites: row.recent_invites,
      personalReferences: row.personal_references
    };
  });

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), readOnly: true, hours, events }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
