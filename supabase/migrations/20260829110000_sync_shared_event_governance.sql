begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- Collaborative events intentionally let every active member add an accepted
-- friend. Keep the existing strict membership guard for removals, role changes,
-- inactive-member restoration and restricted events.
create or replace function private.is_safe_offline_guest_addition(
  p_old_state jsonb,
  p_new_state jsonb
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  old_event jsonb := p_old_state -> 'events' -> 0;
  new_event jsonb := p_new_state -> 'events' -> 0;
  old_participant_ids text[] := private.event_text_ids(
    old_event,
    'participantIds'
  );
  new_participant_ids text[] := private.event_text_ids(
    new_event,
    'participantIds'
  );
  old_inactive_ids text[] := private.event_text_ids(
    old_event,
    'inactiveParticipantIds'
  );
  new_inactive_ids text[] := private.event_text_ids(
    new_event,
    'inactiveParticipantIds'
  );
  added_ids text[];
  added_id text;
  added_user_id uuid;
begin
  if old_event is null or new_event is null then
    return false;
  end if;

  select coalesce(
    pg_catalog.array_agg(candidate.participant_id order by candidate.participant_id),
    '{}'::text[]
  )
  into added_ids
  from (
    select participant_id
    from pg_catalog.unnest(new_participant_ids) as new_id(participant_id)
    except
    select participant_id
    from pg_catalog.unnest(old_participant_ids) as old_id(participant_id)
  ) as candidate;

  if pg_catalog.cardinality(added_ids) = 0
    or not (old_participant_ids <@ new_participant_ids)
    or pg_catalog.cardinality(new_participant_ids) <>
      pg_catalog.cardinality(old_participant_ids) +
      pg_catalog.cardinality(added_ids)
    or old_inactive_ids is distinct from new_inactive_ids
    or private.event_admin_ids(p_old_state) is distinct from
      private.event_admin_ids(p_new_state) then
    return false;
  end if;

  if pg_catalog.jsonb_array_length(
      case
        when pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
          then p_new_state -> 'participants'
        else '[]'::jsonb
      end
    ) <> pg_catalog.jsonb_array_length(
      case
        when pg_catalog.jsonb_typeof(p_old_state -> 'participants') = 'array'
          then p_old_state -> 'participants'
        else '[]'::jsonb
      end
    ) + pg_catalog.cardinality(added_ids)
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        case
          when pg_catalog.jsonb_typeof(p_old_state -> 'participants') = 'array'
            then p_old_state -> 'participants'
          else '[]'::jsonb
        end
      ) as old_participant(value)
      where not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          case
            when pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
              then p_new_state -> 'participants'
            else '[]'::jsonb
          end
        ) as new_participant(value)
        where new_participant.value = old_participant.value
      )
    ) then
    return false;
  end if;

  foreach added_id in array added_ids loop
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        case
          when pg_catalog.jsonb_typeof(p_old_state -> 'deletedParticipants') = 'array'
            then p_old_state -> 'deletedParticipants'
          else '[]'::jsonb
        end
      ) as deletion(value)
      where deletion.value ->> 'id' = added_id
    ) then
      return false;
    end if;

    if added_id ~ '^guest-[A-Za-z0-9_-]{1,120}$' then
      if not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          case
            when pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
              then p_new_state -> 'participants'
            else '[]'::jsonb
          end
        ) as participant(value)
        where participant.value ->> 'id' = added_id
          and participant.value ->> 'kind' = 'guest'
          and coalesce(participant.value -> 'accountLinked', 'false'::jsonb)
            is distinct from 'true'::jsonb
          and coalesce(participant.value ->> 'authProvider', '') = ''
          and coalesce(participant.value ->> 'authSubject', '') = ''
          and coalesce(participant.value ->> 'email', '') = ''
      ) then
        return false;
      end if;
    elsif added_id ~ '^account-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      if actor_id is null
        or pg_catalog.cardinality(added_ids) <> 1
        or coalesce((old_event ->> 'adminsCanEditOnly')::boolean, false)
        or coalesce((old_event ->> 'locked')::boolean, false)
        or coalesce(old_event ->> 'closedAt', '') <> '' then
        return false;
      end if;

      added_user_id := pg_catalog.substr(added_id, 9)::uuid;
      if not exists (
        select 1
        from public.friendships as friendship
        where friendship.user_low = least(actor_id, added_user_id)
          and friendship.user_high = greatest(actor_id, added_user_id)
          and friendship.status = 'accepted'
      ) or not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          case
            when pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
              then p_new_state -> 'participants'
            else '[]'::jsonb
          end
        ) as participant(value)
        where participant.value ->> 'id' = added_id
          and participant.value ->> 'kind' = 'user'
          and coalesce(participant.value -> 'accountLinked', 'false'::jsonb) =
            'true'::jsonb
      ) then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function private.is_safe_offline_guest_addition(jsonb, jsonb)
  from public, anon, authenticated;

create or replace function private.sync_shared_event_governance_to_workspaces(
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
  canonical_updated_at text := coalesce(
    shared_event ->> 'adminIdsUpdatedAt',
    shared_event ->> 'settingsUpdatedAt',
    p_canonical_updated_at::text
  );
  governance_patch jsonb;
  workspace record;
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

  governance_patch := pg_catalog.jsonb_build_object(
    'adminIds', pg_catalog.to_jsonb(private.event_admin_ids(p_shared_state)),
    'adminIdsScopedToEvent', true,
    'adminIdsUpdatedAt', canonical_updated_at,
    'adminsCanEditOnly', coalesce(
      (shared_event ->> 'adminsCanEditOnly')::boolean,
      false
    ),
    'settingsUpdatedAt', coalesce(
      shared_event ->> 'settingsUpdatedAt',
      canonical_updated_at
    ),
    'settingsFieldUpdatedAt',
      coalesce(shared_event -> 'settingsFieldUpdatedAt', '{}'::jsonb) ||
      pg_catalog.jsonb_build_object(
        'adminsCanEditOnly',
        coalesce(
          shared_event -> 'settingsFieldUpdatedAt' ->> 'adminsCanEditOnly',
          shared_event ->> 'settingsUpdatedAt',
          canonical_updated_at
        )
      )
  );

  for workspace in
    select distinct personal.id, personal.owner_user_id
    from private.shared_snapshot_members as member
    join public.app_snapshots as personal
      on personal.owner_user_id = member.user_id
     and personal.snapshot_kind = 'workspace'
    where member.snapshot_id = p_snapshot_id
      and member.status = 'active'
      and member.removed_at is null
      and exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(personal.state -> 'events', '[]'::jsonb)
        ) as indexed_event(value)
        where indexed_event.value ->> 'id' = shared_event_id
          and coalesce(indexed_event.value ->> 'sharedSpaceId', p_snapshot_id) =
            p_snapshot_id
      )
  loop
    perform pg_catalog.set_config(
      'request.jwt.claim.sub',
      workspace.owner_user_id::text,
      true
    );
    update public.app_snapshots as personal
      set state = pg_catalog.jsonb_set(
            personal.state,
            '{events}',
            (
              select pg_catalog.jsonb_agg(
                case
                  when indexed_event.value ->> 'id' = shared_event_id
                    and coalesce(
                      indexed_event.value ->> 'sharedSpaceId',
                      p_snapshot_id
                    ) = p_snapshot_id
                  then indexed_event.value || governance_patch
                  else indexed_event.value
                end
                order by indexed_event.ordinality
              )
              from pg_catalog.jsonb_array_elements(
                coalesce(personal.state -> 'events', '[]'::jsonb)
              ) with ordinality as indexed_event(value, ordinality)
            ),
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

create or replace function private.mirror_shared_event_governance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_event jsonb := old.state -> 'events' -> 0;
  new_event jsonb := new.state -> 'events' -> 0;
begin
  if new.snapshot_kind <> 'shared_event' or new_event is null then
    return new;
  end if;

  if old_event is null
    or old_event -> 'adminIds' is distinct from new_event -> 'adminIds'
    or old_event -> 'adminIdsScopedToEvent' is distinct from
      new_event -> 'adminIdsScopedToEvent'
    or old_event -> 'adminIdsUpdatedAt' is distinct from
      new_event -> 'adminIdsUpdatedAt'
    or old_event -> 'adminsCanEditOnly' is distinct from
      new_event -> 'adminsCanEditOnly' then
    perform private.sync_shared_event_governance_to_workspaces(
      new.id,
      new.state,
      new.updated_at
    );
  end if;
  return new;
end;
$$;

drop trigger if exists zz_mirror_shared_event_governance
  on public.app_snapshots;
create trigger zz_mirror_shared_event_governance
  after update of state on public.app_snapshots
  for each row execute function private.mirror_shared_event_governance();

revoke all on function private.sync_shared_event_governance_to_workspaces(
  text,
  jsonb,
  timestamptz
) from public, anon, authenticated;
revoke all on function private.mirror_shared_event_governance()
  from public, anon, authenticated;

-- Repair already-stale personal event indexes, including manager promotions
-- that happened before this migration was installed.
do $$
declare
  shared_snapshot record;
begin
  for shared_snapshot in
    select snapshot.id, snapshot.state, snapshot.updated_at
    from public.app_snapshots as snapshot
    where snapshot.snapshot_kind = 'shared_event'
      and snapshot.state -> 'events' -> 0 is not null
  loop
    perform private.sync_shared_event_governance_to_workspaces(
      shared_snapshot.id,
      shared_snapshot.state,
      shared_snapshot.updated_at
    );
  end loop;
end;
$$;

commit;
