begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.is_safe_account_deletion_anonymization(
  p_old_state jsonb,
  p_new_state jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with old_participants as (
    select participant, position
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(p_old_state -> 'participants') = 'array'
          then p_old_state -> 'participants'
        else '[]'::jsonb
      end
    ) with ordinality as item(participant, position)
  ),
  new_participants as (
    select participant, position
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
          then p_new_state -> 'participants'
        else '[]'::jsonb
      end
    ) with ordinality as item(participant, position)
  )
  select
    pg_catalog.jsonb_typeof(p_old_state -> 'participants') = 'array'
    and pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
    and (p_old_state - 'participants') = (p_new_state - 'participants')
    and pg_catalog.jsonb_array_length(p_old_state -> 'participants') =
      pg_catalog.jsonb_array_length(p_new_state -> 'participants')
    and p_old_state -> 'participants' is distinct from p_new_state -> 'participants'
    and not exists (
      select 1
      from old_participants as old_item
      full join new_participants as new_item using (position)
      where old_item.participant is null
        or new_item.participant is null
        or (
          new_item.participant is distinct from old_item.participant
          and new_item.participant is distinct from pg_catalog.jsonb_set(
            old_item.participant - 'email' - 'authProvider' - 'authSubject',
            '{displayName}',
            pg_catalog.to_jsonb('משתמש שנמחק'::text),
            true
          )
        )
    );
$$;

create or replace function private.guard_shared_snapshot_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  old_event jsonb := old.state -> 'events' -> 0;
  new_event jsonb := new.state -> 'events' -> 0;
  old_active_ids text[] := private.active_event_participant_ids(old.state);
  new_active_ids text[] := private.active_event_participant_ids(new.state);
  old_admin_ids text[] := private.event_admin_ids(old.state);
  new_admin_ids text[] := private.event_admin_ids(new.state);
  actor_is_admin boolean;
  actor_is_joining boolean;
  actor_is_leaving boolean;
begin
  if old.snapshot_kind <> new.snapshot_kind then
    raise exception 'Snapshot kind cannot be changed'
      using errcode = '42501';
  end if;

  if old.access_key_hash <> new.access_key_hash then
    raise exception 'Snapshot access key cannot be changed through a state update'
      using errcode = '42501';
  end if;

  if old.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if actor_id is null or actor_participant_id is null then
    if pg_catalog.pg_trigger_depth() > 1
      and private.is_safe_account_deletion_anonymization(old.state, new.state) then
      return new;
    end if;
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if old_event is null then
    raise exception 'Shared event state is invalid'
      using errcode = '22023';
  end if;

  actor_is_admin := actor_participant_id = any(old_admin_ids);

  if new_event is null then
    if not actor_is_admin then
      raise exception 'Only an event admin can delete a shared event'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if coalesce(old_event ->> 'id', '') = ''
    or old_event ->> 'id' is distinct from new_event ->> 'id' then
    raise exception 'Shared event identity cannot be changed'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(new_admin_ids) as admin_id(value)
    where not (admin_id.value = any(new_active_ids))
  ) then
    raise exception 'Event admins must be active participants'
      using errcode = '22023';
  end if;

  if pg_catalog.cardinality(new_active_ids) > 0
    and pg_catalog.cardinality(new_admin_ids) = 0 then
    raise exception 'A shared event must keep at least one active admin'
      using errcode = '22023';
  end if;

  actor_is_leaving :=
    actor_participant_id = any(old_active_ids)
    and not (actor_participant_id = any(new_active_ids))
    and pg_catalog.array_remove(old_active_ids, actor_participant_id) = new_active_ids
    and old_event ->> 'createdByParticipantId' is distinct from actor_participant_id
    and pg_catalog.cardinality(new_admin_ids) > 0
    and (
      old_admin_ids = new_admin_ids
      or pg_catalog.array_remove(old_admin_ids, actor_participant_id) = new_admin_ids
    );

  actor_is_joining :=
    not (actor_participant_id = any(old_active_ids))
    and actor_participant_id = any(new_active_ids)
    and pg_catalog.cardinality(new_active_ids) =
      pg_catalog.cardinality(old_active_ids) + 1
    and old_active_ids <@ new_active_ids
    and old_admin_ids = new_admin_ids;

  if (
    old_active_ids is distinct from new_active_ids
    or old_admin_ids is distinct from new_admin_ids
  ) and not actor_is_admin and not actor_is_leaving and not actor_is_joining then
    raise exception 'Only an event admin can manage event membership'
      using errcode = '42501';
  end if;

  if coalesce((old_event ->> 'adminsCanEditOnly')::boolean, false)
    and not actor_is_admin
    and not actor_is_leaving
    and not actor_is_joining
    and old.state is distinct from new.state then
    raise exception 'Only an event admin can edit this event'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.is_safe_account_deletion_anonymization(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.guard_shared_snapshot_update()
  from public, anon, authenticated;

commit;
