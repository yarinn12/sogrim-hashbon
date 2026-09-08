begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Skip identical note projections while retaining atomic updates and all guards.
create or replace function private.sync_shared_event_notes_to_workspaces(
  p_snapshot_id text,
  p_shared_state jsonb,
  p_canonical_updated_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  shared_event jsonb := p_shared_state -> 'events' -> 0;
  shared_event_id text := shared_event ->> 'id';
  canonical_notes jsonb := coalesce(shared_event -> 'notes', '[]'::jsonb);
  canonical_deleted_notes jsonb := coalesce(
    shared_event -> 'deletedNotes',
    '[]'::jsonb
  );
  member_record record;
  workspace public.app_snapshots%rowtype;
  next_events jsonb;
  missing_participants jsonb;
  indexed_event jsonb;
  matching_event_exists boolean;
  conflicting_event_exists boolean;
  previous_subject text := pg_catalog.current_setting(
    'request.jwt.claim.sub',
    true
  );
  synced_count integer := 0;
begin
  if coalesce(p_snapshot_id, '') = ''
    or shared_event is null
    or coalesce(shared_event_id, '') = '' then
    return 0;
  end if;

  if pg_catalog.jsonb_typeof(canonical_notes) <> 'array'
    or pg_catalog.jsonb_typeof(canonical_deleted_notes) <> 'array' then
    raise exception 'Shared event notes are invalid' using errcode = '22023';
  end if;

  for member_record in
    select member.user_id
    from private.shared_snapshot_members as member
    where member.snapshot_id = p_snapshot_id
      and member.status = 'active'
      and member.removed_at is null
    order by member.user_id
  loop
    select personal.* into workspace
    from public.app_snapshots as personal
    left join auth.users as account on account.id = personal.owner_user_id
    where personal.owner_user_id = member_record.user_id
      and personal.snapshot_kind = 'workspace'
    order by
      case
        when personal.id = account.raw_user_meta_data ->> 'account_space_id'
        then 0 else 1
      end,
      personal.updated_at desc
    limit 1
    for update of personal;

    if workspace.id is null then
      raise exception 'Active member workspace is unavailable'
        using errcode = 'P0002';
    end if;

    select
      coalesce(
        pg_catalog.bool_or(
          event_item.value ->> 'id' = shared_event_id
          and coalesce(
            event_item.value ->> 'sharedSpaceId',
            p_snapshot_id
          ) = p_snapshot_id
        ),
        false
      ),
      coalesce(
        pg_catalog.bool_or(
          event_item.value ->> 'id' = shared_event_id
          and coalesce(
            event_item.value ->> 'sharedSpaceId',
            p_snapshot_id
          ) <> p_snapshot_id
        ),
        false
      )
    into matching_event_exists, conflicting_event_exists
    from pg_catalog.jsonb_array_elements(
      coalesce(workspace.state -> 'events', '[]'::jsonb)
    ) as event_item(value);

    if conflicting_event_exists then
      raise exception 'Event identifier belongs to another shared snapshot'
        using errcode = '23505';
    end if;

    select coalesce(
      pg_catalog.jsonb_agg(
        case
          when event_item.value ->> 'id' = shared_event_id
            and coalesce(
              event_item.value ->> 'sharedSpaceId',
              p_snapshot_id
            ) = p_snapshot_id
          then event_item.value || pg_catalog.jsonb_build_object(
            'notes', canonical_notes,
            'deletedNotes', canonical_deleted_notes
          )
          else event_item.value
        end
        order by event_item.ordinality
      ),
      '[]'::jsonb
    ) into next_events
    from pg_catalog.jsonb_array_elements(
      coalesce(workspace.state -> 'events', '[]'::jsonb)
    ) with ordinality as event_item(value, ordinality);

    if not matching_event_exists then
      indexed_event := shared_event || pg_catalog.jsonb_build_object(
        'sharedSpaceId', p_snapshot_id,
        'sharedSpaceKey', 'member_access_recovery_v1_key_0001',
        'notes', canonical_notes,
        'deletedNotes', canonical_deleted_notes
      );
      next_events := pg_catalog.jsonb_build_array(indexed_event) || next_events;
    end if;

    select coalesce(pg_catalog.jsonb_agg(candidate.value), '[]'::jsonb)
    into missing_participants
    from pg_catalog.jsonb_array_elements(
      coalesce(p_shared_state -> 'participants', '[]'::jsonb)
    ) as candidate(value)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(workspace.state -> 'participants', '[]'::jsonb)
      ) as current_participant(value)
      where current_participant.value ->> 'id' = candidate.value ->> 'id'
    );

    -- Membership-only changes also reach this mirror. Do not rewrite a whole
    -- account (and run its guards/projections) when its notes and participants
    -- already contain exactly the requested projection. Real note changes,
    -- missing event indexes and missing participants still use the atomic write.
    if next_events is not distinct from workspace.state -> 'events'
      and missing_participants = '[]'::jsonb then
      continue;
    end if;

    perform pg_catalog.set_config(
      'request.jwt.claim.sub',
      member_record.user_id::text,
      true
    );
    update public.app_snapshots as personal
    set state = pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(
            personal.state,
            '{participants}',
            coalesce(personal.state -> 'participants', '[]'::jsonb)
              || missing_participants,
            true
          ),
          '{events}',
          next_events,
          true
        ),
        updated_at = greatest(
          pg_catalog.clock_timestamp(),
          p_canonical_updated_at
        )
    where personal.id = workspace.id;
    synced_count := synced_count + 1;
  end loop;

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(previous_subject, ''),
    true
  );
  return synced_count;
exception
  when others then
    perform pg_catalog.set_config(
      'request.jwt.claim.sub',
      coalesce(previous_subject, ''),
      true
    );
    raise;
end;
$$;

commit;
