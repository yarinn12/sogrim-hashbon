-- Keep a newly activated shared-event membership visible in the member's
-- personal workspace immediately. Canonical membership remains the authority;
-- the personal event entry is only the device-facing index.
create or replace function public.index_shared_event_for_member(
  p_snapshot_id text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member private.shared_snapshot_members%rowtype;
  shared_state jsonb;
  shared_event jsonb;
  workspace public.app_snapshots%rowtype;
  existing_event jsonb;
  indexed_event jsonb;
  missing_participants jsonb := '[]'::jsonb;
  next_state jsonb;
begin
  select row.* into member
  from private.shared_snapshot_members as row
  where row.snapshot_id = p_snapshot_id
    and row.user_id = p_user_id
    and row.status = 'active'
  for update;

  if member.user_id is null then
    raise exception 'Active shared event membership is required'
      using errcode = '42501';
  end if;

  select snapshot.state into shared_state
  from public.app_snapshots as snapshot
  where snapshot.id = p_snapshot_id
    and snapshot.snapshot_kind = 'shared_event'
    and snapshot.owner_user_id is null
  for update;

  shared_event := shared_state -> 'events' -> 0;
  if shared_event is null
    or not coalesce(shared_event -> 'participantIds', '[]'::jsonb)
      ? member.participant_id then
    raise exception 'Shared event membership payload is invalid'
      using errcode = '22023';
  end if;

  select snapshot.* into workspace
  from public.app_snapshots as snapshot
  left join auth.users as account on account.id = snapshot.owner_user_id
  where snapshot.owner_user_id = p_user_id
    and snapshot.snapshot_kind = 'workspace'
  order by
    case
      when snapshot.id = account.raw_user_meta_data ->> 'account_space_id'
      then 0 else 1
    end,
    snapshot.updated_at desc
  limit 1
  for update of snapshot;

  if workspace.id is null then
    raise exception 'Account workspace is unavailable'
      using errcode = 'P0002';
  end if;

  select event.value into existing_event
  from pg_catalog.jsonb_array_elements(
    coalesce(workspace.state -> 'events', '[]'::jsonb)
  ) as event(value)
  where event.value ->> 'id' = shared_event ->> 'id'
  limit 1;

  if existing_event is not null then
    if coalesce(existing_event ->> 'sharedSpaceId', p_snapshot_id)
      <> p_snapshot_id then
      raise exception 'Event identifier belongs to another shared snapshot'
        using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'existing',
      'snapshotId', p_snapshot_id,
      'workspaceId', workspace.id
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(candidate.value), '[]'::jsonb)
  into missing_participants
  from pg_catalog.jsonb_array_elements(
    coalesce(shared_state -> 'participants', '[]'::jsonb)
  ) as candidate(value)
  where not exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      coalesce(workspace.state -> 'participants', '[]'::jsonb)
    ) as current_participant(value)
    where current_participant.value ->> 'id' = candidate.value ->> 'id'
  );

  indexed_event := shared_event || pg_catalog.jsonb_build_object(
    'sharedSpaceId', p_snapshot_id,
    'sharedSpaceKey', 'member_access_recovery_v1_key_0001'
  );
  next_state := pg_catalog.jsonb_set(
    workspace.state,
    '{participants}',
    coalesce(workspace.state -> 'participants', '[]'::jsonb)
      || missing_participants,
    true
  );
  next_state := pg_catalog.jsonb_set(
    next_state,
    '{events}',
    pg_catalog.jsonb_build_array(indexed_event)
      || coalesce(workspace.state -> 'events', '[]'::jsonb),
    true
  );

  -- Workspace update guards intentionally require the exact owner subject.
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    p_user_id::text,
    true
  );
  update public.app_snapshots
  set state = next_state,
      updated_at = pg_catalog.now()
  where id = workspace.id;

  return pg_catalog.jsonb_build_object(
    'status', 'indexed',
    'snapshotId', p_snapshot_id,
    'workspaceId', workspace.id,
    'eventId', shared_event ->> 'id'
  );
end;
$$;

revoke all on function public.index_shared_event_for_member(text, uuid)
  from public, anon, authenticated;
grant execute on function public.index_shared_event_for_member(text, uuid)
  to service_role;
