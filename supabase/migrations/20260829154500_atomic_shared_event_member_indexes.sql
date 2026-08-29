begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- Rebuild the device-facing event index from every active canonical
-- membership in one workspace update. Doing this in one write is important:
-- the personal-workspace guard correctly rejects an intermediate state that
-- still omits a different active event for the same account.
create or replace function public.reconcile_shared_event_indexes_for_member(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.app_snapshots%rowtype;
  canonical_events jsonb := '[]'::jsonb;
  canonical_event_ids text[] := '{}'::text[];
  missing_participants jsonb := '[]'::jsonb;
  retained_events jsonb := '[]'::jsonb;
  next_state jsonb;
begin
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

  select
    coalesce(
      pg_catalog.jsonb_agg(
        canonical.event_value || pg_catalog.jsonb_build_object(
          'sharedSpaceId', canonical.snapshot_id,
          'sharedSpaceKey', coalesce(
            (
              select personal_event.value ->> 'sharedSpaceKey'
              from pg_catalog.jsonb_array_elements(
                coalesce(workspace.state -> 'events', '[]'::jsonb)
              ) as personal_event(value)
              where personal_event.value ->> 'id' = canonical.event_id
                and personal_event.value ->> 'sharedSpaceId' =
                  canonical.snapshot_id
                and char_length(
                  coalesce(personal_event.value ->> 'sharedSpaceKey', '')
                ) between 24 and 256
              limit 1
            ),
            'member_access_recovery_v1_key_0001'
          )
        )
        order by canonical.shared_updated_at desc, canonical.event_id
      ),
      '[]'::jsonb
    ),
    coalesce(
      pg_catalog.array_agg(
        canonical.event_id order by canonical.shared_updated_at desc,
        canonical.event_id
      ),
      '{}'::text[]
    )
  into canonical_events, canonical_event_ids
  from (
    select distinct on (shared_event.value ->> 'id')
      shared.id as snapshot_id,
      shared.updated_at as shared_updated_at,
      shared_event.value ->> 'id' as event_id,
      shared_event.value as event_value
    from private.shared_snapshot_members as member
    join public.app_snapshots as shared
      on shared.id = member.snapshot_id
     and shared.snapshot_kind = 'shared_event'
     and shared.owner_user_id is null
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(shared.state -> 'events', '[]'::jsonb)
    ) as shared_event(value)
    where member.user_id = p_user_id
      and member.status = 'active'
      and member.removed_at is null
      and coalesce(shared_event.value -> 'participantIds', '[]'::jsonb)
        ? member.participant_id
      and not coalesce(
        shared_event.value -> 'inactiveParticipantIds',
        '[]'::jsonb
      ) ? member.participant_id
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(workspace.state -> 'events', '[]'::jsonb)
        ) as personal_event(value)
        where personal_event.value ->> 'id' = shared_event.value ->> 'id'
          and coalesce(
            personal_event.value -> 'participantIds',
            '[]'::jsonb
          ) ? member.participant_id
          and not coalesce(
            personal_event.value -> 'inactiveParticipantIds',
            '[]'::jsonb
          ) ? member.participant_id
      )
    order by
      shared_event.value ->> 'id',
      shared.updated_at desc,
      shared.id
  ) as canonical;

  if pg_catalog.cardinality(canonical_event_ids) = 0 then
    return pg_catalog.jsonb_build_object(
      'status', 'unchanged',
      'workspaceId', workspace.id,
      'eventCount', 0
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(candidate.value), '[]'::jsonb)
  into missing_participants
  from (
    select distinct on (participant.value ->> 'id') participant.value
    from private.shared_snapshot_members as member
    join public.app_snapshots as shared
      on shared.id = member.snapshot_id
     and shared.snapshot_kind = 'shared_event'
     and shared.owner_user_id is null
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(shared.state -> 'events', '[]'::jsonb)
    ) as shared_event(value)
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(shared.state -> 'participants', '[]'::jsonb)
    ) as participant(value)
    where member.user_id = p_user_id
      and member.status = 'active'
      and member.removed_at is null
      and coalesce(shared_event.value -> 'participantIds', '[]'::jsonb)
        ? member.participant_id
      and not coalesce(
        shared_event.value -> 'inactiveParticipantIds',
        '[]'::jsonb
      ) ? member.participant_id
      and shared_event.value ->> 'id' = any(canonical_event_ids)
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(workspace.state -> 'participants', '[]'::jsonb)
        ) as current_participant(value)
        where current_participant.value ->> 'id' = participant.value ->> 'id'
      )
    order by participant.value ->> 'id'
  ) as candidate;

  select coalesce(
    pg_catalog.jsonb_agg(personal_event.value order by personal_event.ordinality),
    '[]'::jsonb
  )
  into retained_events
  from pg_catalog.jsonb_array_elements(
    coalesce(workspace.state -> 'events', '[]'::jsonb)
  ) with ordinality as personal_event(value, ordinality)
  where not (
    personal_event.value ->> 'id' = any(canonical_event_ids)
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
    canonical_events || retained_events,
    true
  );

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    p_user_id::text,
    true
  );
  update public.app_snapshots
  set state = next_state,
      updated_at = pg_catalog.clock_timestamp()
  where id = workspace.id;

  return pg_catalog.jsonb_build_object(
    'status', 'reconciled',
    'workspaceId', workspace.id,
    'eventCount', pg_catalog.cardinality(canonical_event_ids)
  );
end;
$$;

revoke all on function public.reconcile_shared_event_indexes_for_member(uuid)
  from public, anon, authenticated;
grant execute on function public.reconcile_shared_event_indexes_for_member(uuid)
  to service_role;

create or replace function private.reconcile_shared_snapshot_member_workspaces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_actor_id uuid := auth.uid();
  active_member record;
begin
  if new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  for active_member in
    select distinct member.user_id
    from private.shared_snapshot_members as member
    where member.snapshot_id = new.id
      and member.status = 'active'
      and member.removed_at is null
      and (
        original_actor_id is null
        or member.user_id <> original_actor_id
      )
    order by member.user_id
  loop
    perform public.reconcile_shared_event_indexes_for_member(
      active_member.user_id
    );
  end loop;

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(original_actor_id::text, ''),
    true
  );
  return new;
exception when others then
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(original_actor_id::text, ''),
    true
  );
  raise;
end;
$$;

drop trigger if exists zz_reconcile_shared_snapshot_member_workspaces
  on public.app_snapshots;
create trigger zz_reconcile_shared_snapshot_member_workspaces
  after insert or update of state on public.app_snapshots
  for each row
  execute function private.reconcile_shared_snapshot_member_workspaces();

revoke all on function private.reconcile_shared_snapshot_member_workspaces()
  from public, anon, authenticated;

commit;
