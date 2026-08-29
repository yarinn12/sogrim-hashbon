begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.is_safe_shared_event_deletion(
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  old_event jsonb := p_old_state -> 'events' -> 0;
  old_event_id text := old_event ->> 'id';
  target_tombstone jsonb;
  target_deleted_at timestamptz;
begin
  if old_event is null
    or coalesce(old_event_id, '') = ''
    or coalesce(p_actor_participant_id, '') = ''
    or not (
      p_actor_participant_id = any(private.event_admin_ids(p_old_state))
    )
    or pg_catalog.jsonb_typeof(p_new_state -> 'events') <> 'array'
    or p_new_state -> 'events' is distinct from '[]'::jsonb
    or p_new_state -> 'participants' is distinct from '[]'::jsonb
    or p_new_state -> 'groups' is distinct from '[]'::jsonb
    or coalesce(p_new_state ->> 'currentParticipantId', '') <> ''
    or pg_catalog.jsonb_typeof(p_new_state -> 'deletedEvents') <> 'array'
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(p_old_state -> 'deletedEvents', '[]'::jsonb)
      ) as old_deletion(value)
      where old_deletion.value ->> 'id' = old_event_id
    )
    or p_new_state - array[
      'events',
      'participants',
      'groups',
      'currentParticipantId',
      'deletedEvents'
    ] is distinct from p_old_state - array[
      'events',
      'participants',
      'groups',
      'currentParticipantId',
      'deletedEvents'
    ] then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      coalesce(p_old_state -> 'deletedEvents', '[]'::jsonb)
    ) as old_deletion(value)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_new_state -> 'deletedEvents')
        as new_deletion(value)
      where new_deletion.value = old_deletion.value
    )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_new_state -> 'deletedEvents')
      as new_deletion(value)
    where new_deletion.value ->> 'id' is distinct from old_event_id
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(p_old_state -> 'deletedEvents', '[]'::jsonb)
        ) as old_deletion(value)
        where old_deletion.value = new_deletion.value
      )
  ) then
    return false;
  end if;

  select deletion.value into target_tombstone
  from pg_catalog.jsonb_array_elements(p_new_state -> 'deletedEvents')
    as deletion(value)
  where deletion.value ->> 'id' = old_event_id;

  if target_tombstone is null
    or target_tombstone - array['id', 'deletedAt'] <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(target_tombstone -> 'deletedAt') <> 'string'
    or (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(p_new_state -> 'deletedEvents')
        as deletion(value)
      where deletion.value ->> 'id' = old_event_id
    ) <> 1 then
    return false;
  end if;

  target_deleted_at := (target_tombstone ->> 'deletedAt')::timestamptz;
  return target_deleted_at is not null;
exception
  when others then
    return false;
end;
$$;

create or replace function private.guard_shared_event_history_and_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
  account_link jsonb := case when tg_op = 'UPDATE' then
    private.authorized_shared_event_account_link(
      new.id,
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
  else null end;
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) > 500
    or pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) > 500 then
    raise exception 'Shared event transfer history is too large'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and not private.is_safe_shared_event_deletion(
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
    and not private.has_preserved_paid_transfer_history(old.state, new.state)
    and not private.has_preserved_paid_history_for_account_link(
      old.state,
      new.state,
      account_link
    ) then
    raise exception 'Completed payment history cannot be removed or rewritten'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.is_safe_shared_event_deletion(jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_history_and_limits()
  from public, anon, authenticated;

commit;
