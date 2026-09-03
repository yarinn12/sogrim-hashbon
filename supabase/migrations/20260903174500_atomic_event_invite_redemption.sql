begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Redeeming an invite used to stop after creating a ten-minute pending
-- membership. The browser then had to publish the canonical participant and
-- index the event in its personal workspace in two later HTTP requests. A
-- suspended mobile tab could therefore leave a durable half-join. Commit the
-- membership, canonical event and device-facing index as one transaction.
create or replace function public.redeem_event_invite_membership(
  p_invite_id uuid,
  p_token_hash text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_actor_sub text := pg_catalog.current_setting(
    'request.jwt.claim.sub',
    true
  );
  invite public.event_invite_tokens%rowtype;
  snapshot public.app_snapshots%rowtype;
  existing_member private.shared_snapshot_members%rowtype;
  account auth.users%rowtype;
  profile public.user_profiles%rowtype;
  event_record jsonb;
  next_shared_state jsonb;
  participant_profile jsonb;
  index_result jsonb;
  actor_participant_id text := 'account-' || p_user_id::text;
  creator_participant_id text;
  active_ids text[];
  inactive_ids text[];
  admin_ids text[];
  participant_exists boolean := false;
  canonical_changed boolean := false;
  joined_at text;
begin
  if p_invite_id is null
    or p_user_id is null
    or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Event invitation is invalid' using errcode = '42501';
  end if;

  select record.* into invite
  from public.event_invite_tokens as record
  where record.id = p_invite_id
  for update;

  if invite.id is null
    or invite.token_hash <> p_token_hash
    or invite.revoked_at is not null
    or (invite.expires_at is not null and invite.expires_at <= pg_catalog.now())
    or (invite.kind = 'private' and invite.recipient_user_id <> p_user_id) then
    raise exception 'Event invitation is no longer active' using errcode = '42501';
  end if;

  -- Match the member -> shared snapshot -> workspace lock order used by the
  -- indexing RPC. This keeps repeated redemption and foreground recovery from
  -- deadlocking each other.
  select member.* into existing_member
  from private.shared_snapshot_members as member
  where member.snapshot_id = invite.space_id
    and member.user_id = p_user_id
  for update;

  if existing_member.user_id is not null
    and existing_member.status = 'removed' then
    raise exception 'You are no longer a member of this event' using errcode = '42501';
  end if;

  select record.* into snapshot
  from public.app_snapshots as record
  where record.id = invite.space_id
    and record.snapshot_kind = 'shared_event'
  for update;

  event_record := snapshot.state -> 'events' -> 0;
  if snapshot.id is null
    or event_record is null
    or event_record ->> 'id' <> invite.event_id
    or coalesce((event_record ->> 'locked')::boolean, false)
    or nullif(event_record ->> 'closedAt', '') is not null then
    raise exception 'Shared event is no longer available' using errcode = '42501';
  end if;

  active_ids := private.active_event_participant_ids(snapshot.state);
  inactive_ids := private.event_text_ids(event_record, 'inactiveParticipantIds');
  admin_ids := private.event_admin_ids(snapshot.state);
  creator_participant_id := 'account-' || invite.created_by::text;

  if not (creator_participant_id = any(active_ids))
    or actor_participant_id = any(inactive_ids)
    or (invite.kind = 'private' and not (actor_participant_id = any(active_ids))) then
    raise exception 'Event invitation is no longer active' using errcode = '42501';
  end if;

  select record.* into account
  from auth.users as record
  where record.id = p_user_id;

  if account.id is null then
    raise exception 'Invited account is unavailable' using errcode = '42501';
  end if;

  select record.* into profile
  from public.user_profiles as record
  where record.user_id = p_user_id;

  select exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      coalesce(snapshot.state -> 'participants', '[]'::jsonb)
    ) as participant(value)
    where participant.value ->> 'id' = actor_participant_id
  ) into participant_exists;

  if not (actor_participant_id = any(active_ids)) then
    joined_at := pg_catalog.to_char(
      pg_catalog.clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    );

    if not participant_exists then
      participant_profile := pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
          'id', actor_participant_id,
          'displayName', coalesce(
            nullif(pg_catalog.btrim(profile.display_name), ''),
            nullif(pg_catalog.btrim(account.raw_user_meta_data ->> 'full_name'), ''),
            nullif(pg_catalog.btrim(account.raw_user_meta_data ->> 'name'), ''),
            nullif(pg_catalog.split_part(account.email, '@', 1), ''),
            'משתמש חדש'
          ),
          'kind', 'user',
          'avatarPreset', nullif(profile.avatar_preset, ''),
          'avatarImage', nullif(profile.avatar_image, ''),
          'avatarImageUpdatedAt', case
            when profile.avatar_image_updated_at is null then null
            else pg_catalog.to_char(
              profile.avatar_image_updated_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
          end,
          'profileUpdatedAt', case
            when profile.updated_at is null then joined_at
            else pg_catalog.to_char(
              profile.updated_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
          end,
          'accountLinked', true
        )
      );
      next_shared_state := pg_catalog.jsonb_set(
        snapshot.state,
        '{participants}',
        coalesce(snapshot.state -> 'participants', '[]'::jsonb)
          || pg_catalog.jsonb_build_array(participant_profile),
        true
      );
    else
      next_shared_state := snapshot.state;
    end if;

    event_record := pg_catalog.jsonb_set(
      event_record,
      '{participantIds}',
      coalesce(event_record -> 'participantIds', '[]'::jsonb)
        || pg_catalog.jsonb_build_array(actor_participant_id),
      true
    );
    event_record := pg_catalog.jsonb_set(
      event_record,
      '{membershipUpdatedAt}',
      pg_catalog.to_jsonb(joined_at),
      true
    );
    event_record := pg_catalog.jsonb_set(
      event_record,
      '{membershipUpdatedAtByParticipant}',
      pg_catalog.jsonb_set(
        case
          when pg_catalog.jsonb_typeof(
            event_record -> 'membershipUpdatedAtByParticipant'
          ) = 'object'
            then event_record -> 'membershipUpdatedAtByParticipant'
          else '{}'::jsonb
        end,
        array[actor_participant_id],
        pg_catalog.to_jsonb(joined_at),
        true
      ),
      true
    );
    next_shared_state := pg_catalog.jsonb_set(
      next_shared_state,
      '{events,0}',
      event_record,
      false
    );
    canonical_changed := true;
  else
    next_shared_state := snapshot.state;
  end if;

  insert into private.shared_snapshot_members (
    snapshot_id, user_id, participant_id, role, status, removed_at,
    pending_join_until, updated_at
  ) values (
    snapshot.id,
    p_user_id,
    actor_participant_id,
    case when actor_participant_id = any(admin_ids) then 'admin' else 'member' end,
    'active',
    null,
    case
      when canonical_changed then pg_catalog.clock_timestamp() + interval '10 minutes'
      else null
    end,
    pg_catalog.clock_timestamp()
  )
  on conflict (snapshot_id, user_id) do update
  set
    participant_id = excluded.participant_id,
    role = excluded.role,
    status = 'active',
    removed_at = null,
    pending_join_until = excluded.pending_join_until,
    updated_at = excluded.updated_at;

  if canonical_changed then
    -- Execute the normal shared-event guards as the joining account. They
    -- permit exactly one self-join and reject unrelated event mutations.
    perform pg_catalog.set_config(
      'request.jwt.claim.sub',
      p_user_id::text,
      true
    );
    update public.app_snapshots
    set
      state = next_shared_state,
      updated_at = pg_catalog.clock_timestamp()
    where id = snapshot.id;
  end if;

  update public.event_invite_tokens
  set
    last_redeemed_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where id = invite.id;

  -- This call locks and updates the recipient workspace in the same database
  -- transaction. Any failure rolls the invite, membership and canonical event
  -- back together, so a client retry always starts from a consistent state.
  select public.index_shared_event_for_member(snapshot.id, p_user_id)
  into index_result;

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(original_actor_sub, ''),
    true
  );

  return pg_catalog.jsonb_build_object(
    'status', case when canonical_changed then 'joined' else 'existing' end,
    'snapshotId', snapshot.id,
    'participantId', actor_participant_id,
    'canonicalParticipantReady', true,
    'workspaceIndexed', true,
    'indexStatus', index_result ->> 'status'
  );
end;
$$;

revoke all on function public.redeem_event_invite_membership(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.redeem_event_invite_membership(uuid, text, uuid)
  to service_role;

commit;
