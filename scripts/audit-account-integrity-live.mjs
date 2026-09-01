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
  const [accounts] = await sql`
    select
      count(*)::integer as total,
      count(*) filter (where account.email_confirmed_at is null)::integer as unconfirmed,
      count(*) filter (
        where account.email_confirmed_at is null
          and account.created_at < pg_catalog.now() - interval '24 hours'
      )::integer as stale_unconfirmed,
      count(*) filter (where profile.user_id is null)::integer as missing_profile,
      count(*) filter (where invite.user_id is null)::integer as missing_friend_code,
      count(*) filter (
        where nullif(account.raw_user_meta_data ->> 'account_space_id', '') is null
      )::integer as missing_workspace_metadata,
      count(*) filter (
        where nullif(account.raw_user_meta_data ->> 'account_space_id', '') is null
          and account.email_confirmed_at is not null
          and account.last_sign_in_at is not null
          and account.updated_at < pg_catalog.now() - interval '10 minutes'
      )::integer as active_accounts_missing_workspace_metadata,
      count(*) filter (
        where nullif(account.raw_user_meta_data ->> 'account_space_id', '') is null
          and account.email_confirmed_at is not null
          and account.last_sign_in_at is not null
          and account.updated_at < pg_catalog.now() - interval '10 minutes'
          and account.email not like 'qa-%@example.test'
          and account.email <> 'store-review@sogrimhashbon.app'
      )::integer as active_non_test_accounts_missing_workspace_metadata,
      count(*) filter (
        where nullif(account.raw_user_meta_data ->> 'account_space_id', '') is not null
          and snapshot.id is null
          and account.last_sign_in_at is not null
      )::integer as initialized_accounts_missing_workspace,
      count(*) filter (
        where snapshot.id is not null
          and snapshot.owner_user_id is distinct from account.id
      )::integer as wrong_workspace_owner,
      count(*) filter (
        where snapshot.id is not null
          and snapshot.state ->> 'currentParticipantId'
            is distinct from 'account-' || account.id::text
      )::integer as wrong_current_participant
    from auth.users as account
    left join public.user_profiles as profile on profile.user_id = account.id
    left join public.friend_invite_codes as invite on invite.user_id = account.id
    left join public.app_snapshots as snapshot
      on snapshot.id = account.raw_user_meta_data ->> 'account_space_id'
  `;

  const [duplicates] = await sql`
    select
      (
        select count(*)::integer
        from (
          select pg_catalog.lower(email)
          from auth.users
          where email is not null
          group by pg_catalog.lower(email)
          having count(*) > 1
        ) as duplicate_email
      ) as duplicate_email_groups,
      (
        select count(*)::integer
        from (
          select username
          from public.user_profiles
          group by username
          having count(*) > 1
        ) as duplicate_username
      ) as duplicate_username_groups,
      (
        select count(*)::integer
        from (
          select least(requester_id, addressee_id), greatest(requester_id, addressee_id)
          from public.friendships
          group by least(requester_id, addressee_id), greatest(requester_id, addressee_id)
          having count(*) > 1
        ) as duplicate_friendship
      ) as duplicate_friendship_pairs,
      (
        select count(*)::integer
        from (
          select owner_user_id
          from public.app_snapshots
          where snapshot_kind = 'workspace' and owner_user_id is not null
          group by owner_user_id
          having count(*) > 1
        ) as duplicate_workspace
      ) as accounts_with_multiple_owned_workspaces,
      (
        select count(*)::integer
        from (
          select snapshot.id, participant ->> 'authSubject'
          from public.app_snapshots as snapshot
          cross join lateral pg_catalog.jsonb_array_elements(
            coalesce(snapshot.state -> 'participants', '[]'::jsonb)
          ) as participant
          where nullif(participant ->> 'authSubject', '') is not null
          group by snapshot.id, participant ->> 'authSubject'
          having count(*) > 1
        ) as duplicate_identity
      ) as snapshots_with_duplicate_account_identity
  `;

  const [eventContinuity] = await sql`
    with shared_events as (
      select
        snapshot.id as snapshot_id,
        event.value as event_state,
        event.value ->> 'id' as event_id
      from public.app_snapshots as snapshot
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(snapshot.state -> 'events', '[]'::jsonb)
      ) as event(value)
      where snapshot.snapshot_kind = 'shared_event'
    ),
    active_online_participants as (
      select
        shared_event.snapshot_id,
        shared_event.event_id,
        participant.participant_id
      from shared_events as shared_event
      cross join lateral pg_catalog.jsonb_array_elements_text(
        coalesce(shared_event.event_state -> 'participantIds', '[]'::jsonb)
      ) as participant(participant_id)
      where participant.participant_id ~* '^account-[0-9a-f-]{36}$'
        and not coalesce(
          shared_event.event_state -> 'inactiveParticipantIds',
          '[]'::jsonb
        ) ? participant.participant_id
    ),
    workspace_events as (
      select
        workspace.owner_user_id,
        event.value as event_state,
        event.value ->> 'id' as event_id,
        nullif(event.value ->> 'sharedSpaceId', '') as shared_space_id
      from public.app_snapshots as workspace
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(workspace.state -> 'events', '[]'::jsonb)
      ) as event(value)
      where workspace.snapshot_kind = 'workspace'
        and workspace.owner_user_id is not null
    )
    select
      (
        select pg_catalog.count(*)::integer
        from public.app_snapshots
        where snapshot_kind = 'shared_event'
      ) as shared_snapshots,
      (select pg_catalog.count(*)::integer from shared_events) as shared_event_records,
      (
        select pg_catalog.count(*)::integer
        from private.shared_snapshot_members
        where status = 'active'
      ) as active_memberships,
      (
        select pg_catalog.count(*)::integer
        from active_online_participants
      ) as active_online_participants,
      (
        select pg_catalog.count(*)::integer
        from public.app_snapshots as snapshot
        where snapshot.snapshot_kind = 'shared_event'
          and pg_catalog.jsonb_array_length(
            coalesce(snapshot.state -> 'events', '[]'::jsonb)
          ) <> 1
      ) as shared_snapshots_with_invalid_event_count,
      (
        select pg_catalog.count(*)::integer
        from public.app_snapshots as snapshot
        where snapshot.snapshot_kind = 'shared_event'
          and pg_catalog.jsonb_array_length(
            coalesce(snapshot.state -> 'events', '[]'::jsonb)
          ) <> 1
          and exists (
            select 1
            from private.shared_snapshot_members as member
            where member.snapshot_id = snapshot.id
              and member.status = 'active'
          )
      ) as shared_snapshots_with_active_members_and_invalid_event_count,
      (
        select pg_catalog.count(*)::integer
        from active_online_participants as participant
        left join auth.users as account
          on 'account-' || account.id::text = participant.participant_id
        where account.id is null
      ) as active_online_participants_missing_auth_account,
      (
        select pg_catalog.count(*)::integer
        from active_online_participants as participant
        left join private.shared_snapshot_members as member
          on member.snapshot_id = participant.snapshot_id
         and member.participant_id = participant.participant_id
         and member.status = 'active'
        where member.snapshot_id is null
      ) as active_online_participants_missing_membership,
      (
        select pg_catalog.count(*)::integer
        from active_online_participants as participant
        join auth.users as account
          on 'account-' || account.id::text = participant.participant_id
        left join private.shared_snapshot_members as member
          on member.snapshot_id = participant.snapshot_id
         and member.user_id = account.id
         and member.participant_id = participant.participant_id
         and member.status = 'active'
        where member.snapshot_id is null
      ) as existing_active_online_participants_missing_membership,
      (
        select pg_catalog.count(*)::integer
        from private.shared_snapshot_members as member
        where member.status = 'active'
          and not exists (
            select 1
            from active_online_participants as participant
            where participant.snapshot_id = member.snapshot_id
              and participant.participant_id = member.participant_id
          )
      ) as active_memberships_not_in_canonical_event,
      (
        select pg_catalog.count(*)::integer
        from private.shared_snapshot_members as member
        join auth.users as account on account.id = member.user_id
        left join public.app_snapshots as workspace
          on workspace.id = account.raw_user_meta_data ->> 'account_space_id'
         and workspace.snapshot_kind = 'workspace'
         and workspace.owner_user_id = account.id
        where member.status = 'active'
          and workspace.id is null
      ) as active_memberships_without_workspace,
      (
        select pg_catalog.count(*)::integer
        from private.shared_snapshot_members as member
        join shared_events as shared_event
          on shared_event.snapshot_id = member.snapshot_id
        join auth.users as account on account.id = member.user_id
        join public.app_snapshots as workspace
          on workspace.id = account.raw_user_meta_data ->> 'account_space_id'
         and workspace.snapshot_kind = 'workspace'
         and workspace.owner_user_id = account.id
        where member.status = 'active'
          and not exists (
            select 1
            from workspace_events as personal_event
            where personal_event.owner_user_id = account.id
              and personal_event.event_id = shared_event.event_id
          )
      ) as active_memberships_missing_personal_event,
      (
        select pg_catalog.count(*)::integer
        from private.shared_snapshot_members as member
        join shared_events as shared_event
          on shared_event.snapshot_id = member.snapshot_id
        join workspace_events as personal_event
          on personal_event.owner_user_id = member.user_id
         and personal_event.event_id = shared_event.event_id
        where member.status = 'active'
          and personal_event.shared_space_id is distinct from member.snapshot_id
      ) as active_memberships_wrong_personal_reference,
      (
        select pg_catalog.count(*)::integer
        from workspace_events as personal_event
        where personal_event.shared_space_id is not null
          and not exists (
            select 1
            from public.app_snapshots as shared
            where shared.id = personal_event.shared_space_id
              and shared.snapshot_kind = 'shared_event'
          )
      ) as personal_shared_references_missing_snapshot,
      (
        select pg_catalog.count(*)::integer
        from (
          select owner_user_id, event_id
          from workspace_events
          where event_id is not null
          group by owner_user_id, event_id
          having pg_catalog.count(*) > 1
        ) as duplicate_personal_event
      ) as duplicate_personal_event_id_groups,
      (
        select pg_catalog.count(*)::integer
        from workspace_events as personal_event
        where personal_event.shared_space_id is null
          and personal_event.event_state ->> 'createdByParticipantId' =
            'account-' || personal_event.owner_user_id::text
          and coalesce(
            personal_event.event_state -> 'participantIds',
            '[]'::jsonb
          ) ? ('account-' || personal_event.owner_user_id::text)
          and not coalesce(
            personal_event.event_state -> 'inactiveParticipantIds',
            '[]'::jsonb
          ) ? ('account-' || personal_event.owner_user_id::text)
          and (
            select pg_catalog.count(*)
            from pg_catalog.jsonb_array_elements_text(
              coalesce(personal_event.event_state -> 'participantIds', '[]'::jsonb)
            ) as participant(participant_id)
            where participant.participant_id ~* '^account-[0-9a-f-]{36}$'
              and not coalesce(
                personal_event.event_state -> 'inactiveParticipantIds',
                '[]'::jsonb
              ) ? participant.participant_id
          ) > 1
      ) as unpublished_multi_account_personal_events
  `;

  const details = process.argv.includes("--details")
    ? await sql`
        select
          account.id as user_id,
          coalesce(account.raw_app_meta_data ->> 'provider', '') as provider,
          account.created_at,
          account.updated_at,
          account.last_sign_in_at,
          account.email_confirmed_at is not null as email_confirmed,
          coalesce(account.raw_user_meta_data ? 'full_name', false) as has_full_name,
          coalesce(account.raw_user_meta_data ? 'username', false) as has_username
        from auth.users as account
        where nullif(account.raw_user_meta_data ->> 'account_space_id', '') is null
        order by account.created_at
      `
    : undefined;
  const orphanedWorkspaceDetails = process.argv.includes("--details")
    ? await sql`
        select
          account.id as user_id,
          coalesce(account.raw_app_meta_data ->> 'provider', '') as provider,
          account.created_at,
          account.updated_at,
          account.last_sign_in_at,
          account.email like 'qa-%@example.test'
            or account.email = 'store-review@sogrimhashbon.app' as is_test_account,
          coalesce(account.raw_user_meta_data ? 'full_name', false) as has_full_name,
          coalesce(account.raw_user_meta_data ? 'username', false) as has_username,
          account.raw_user_meta_data ->> 'account_space_id' as workspace_id
        from auth.users as account
        left join public.app_snapshots as snapshot
          on snapshot.id = account.raw_user_meta_data ->> 'account_space_id'
        where nullif(account.raw_user_meta_data ->> 'account_space_id', '') is not null
          and snapshot.id is null
          and account.last_sign_in_at is not null
        order by account.created_at
      `
    : undefined;
  const unpublishedEventDetails = process.argv.includes("--details")
    ? await sql`
        select
          workspace.owner_user_id as user_id,
          account.email like 'qa-%@example.test'
            or account.email = 'store-review@sogrimhashbon.app' as is_test_account,
          event.value ->> 'id' as event_id,
          coalesce(event.value ->> 'name', '') as event_name,
          coalesce(event.value ->> 'createdAt', '') as created_at,
          (
            select pg_catalog.count(*)::integer
            from pg_catalog.jsonb_array_elements_text(
              coalesce(event.value -> 'participantIds', '[]'::jsonb)
            ) as participant(participant_id)
            where participant.participant_id ~* '^account-[0-9a-f-]{36}$'
              and not coalesce(
                event.value -> 'inactiveParticipantIds',
                '[]'::jsonb
              ) ? participant.participant_id
          ) as active_account_participants
        from public.app_snapshots as workspace
        join auth.users as account on account.id = workspace.owner_user_id
        cross join lateral pg_catalog.jsonb_array_elements(
          coalesce(workspace.state -> 'events', '[]'::jsonb)
        ) as event(value)
        where workspace.snapshot_kind = 'workspace'
          and workspace.owner_user_id is not null
          and coalesce(event.value ->> 'sharedSpaceId', '') = ''
          and event.value ->> 'createdByParticipantId' =
            'account-' || workspace.owner_user_id::text
          and coalesce(event.value -> 'participantIds', '[]'::jsonb)
            ? ('account-' || workspace.owner_user_id::text)
          and not coalesce(
            event.value -> 'inactiveParticipantIds',
            '[]'::jsonb
          ) ? ('account-' || workspace.owner_user_id::text)
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
        order by workspace.updated_at desc, event.value ->> 'id'
      `
    : undefined;

  const failures = Object.entries({ ...accounts, ...duplicates, ...eventContinuity })
    .filter(([key, value]) =>
      ![
        "total",
        "unconfirmed",
        "stale_unconfirmed",
        "missing_workspace_metadata",
        "active_accounts_missing_workspace_metadata",
        "active_non_test_accounts_missing_workspace_metadata",
        "shared_snapshots",
        "shared_event_records",
        "active_memberships",
        "active_online_participants",
        "shared_snapshots_with_invalid_event_count",
        "active_online_participants_missing_auth_account",
        "active_online_participants_missing_membership"
      ].includes(key) && Number(value) > 0
    )
    .map(([key]) => key);
  const warnings = [
    ...(Number(accounts.stale_unconfirmed) > 0 ? ["stale_unconfirmed"] : []),
    ...(Number(accounts.active_accounts_missing_workspace_metadata) > 0
      ? ["incomplete_first_login_repaired_on_next_sign_in"]
      : [])
  ];

  console.log(JSON.stringify({
    ok: failures.length === 0,
    accounts,
    duplicates,
    event_continuity: eventContinuity,
    failures,
    warnings,
    ...(details ? {
      details,
      orphaned_workspace_details: orphanedWorkspaceDetails,
      unpublished_event_details: unpublishedEventDetails
    } : {})
  }));
  if (failures.length) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
