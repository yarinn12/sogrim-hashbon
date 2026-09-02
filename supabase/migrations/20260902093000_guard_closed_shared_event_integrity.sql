-- Prevent identity and note mutations after an event is closed, and make
-- event-closed activity entries append-only and bound to the actual admin close.
create or replace function private.guard_closed_shared_event_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_event jsonb := coalesce(old.state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
  old_activity jsonb := case
    when pg_catalog.jsonb_typeof(old_event -> 'activityLog') = 'array'
      then old_event -> 'activityLog'
    else '[]'::jsonb
  end;
  new_activity jsonb := case
    when pg_catalog.jsonb_typeof(new_event -> 'activityLog') = 'array'
      then new_event -> 'activityLog'
    else '[]'::jsonb
  end;
  actor_participant_id text := private.current_actor_participant_id();
  added_closed_count integer := 0;
  added_closed_entry jsonb;
  old_is_closed boolean := coalesce((old_event ->> 'locked')::boolean, false)
    or nullif(pg_catalog.btrim(old_event ->> 'closedAt'), '') is not null;
  new_is_closed boolean := coalesce((new_event ->> 'locked')::boolean, false)
    and nullif(pg_catalog.btrim(new_event ->> 'closedAt'), '') is not null;
begin
  if new.snapshot_kind <> 'shared_event'
    or old_event ->> 'id' is distinct from new_event ->> 'id' then
    return new;
  end if;

  if old_is_closed and (
    coalesce(old_event -> 'notes', '[]'::jsonb) is distinct from
      coalesce(new_event -> 'notes', '[]'::jsonb)
    or coalesce(old_event -> 'deletedNotes', '[]'::jsonb) is distinct from
      coalesce(new_event -> 'deletedNotes', '[]'::jsonb)
    or coalesce(old_event -> 'participantAccountLinks', '[]'::jsonb) is distinct from
      coalesce(new_event -> 'participantAccountLinks', '[]'::jsonb)
  ) then
    raise exception 'Closed event notes and account links cannot be changed'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(old_activity) as previous(value)
    where previous.value ->> 'kind' = 'event-closed'
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(new_activity) as candidate(value)
        where candidate.value ->> 'id' = previous.value ->> 'id'
          and candidate.value = previous.value
      )
  ) then
    raise exception 'Event close activity is append-only'
      using errcode = '42501';
  end if;

  select count(*), min(candidate.value::text)::jsonb
  into added_closed_count, added_closed_entry
  from pg_catalog.jsonb_array_elements(new_activity) as candidate(value)
  where candidate.value ->> 'kind' = 'event-closed'
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(old_activity) as previous(value)
      where previous.value ->> 'id' = candidate.value ->> 'id'
    );

  if added_closed_count > 0 and (
    added_closed_count <> 1
    or old_is_closed
    or not new_is_closed
    or coalesce(actor_participant_id, '') = ''
    or not (
      actor_participant_id = any(private.event_admin_ids(old.state))
    )
    or added_closed_entry ->> 'actorParticipantId' is distinct from actor_participant_id
    or added_closed_entry ->> 'occurredAt' is distinct from new_event ->> 'closedAt'
  ) then
    raise exception 'Event close activity must match an admin close transition'
      using errcode = '42501';
  end if;

  return new;
exception
  when invalid_text_representation then
    raise exception 'Shared event close state is invalid'
      using errcode = '22023';
end;
$$;

drop trigger if exists guard_closed_shared_event_integrity
  on public.app_snapshots;
create trigger guard_closed_shared_event_integrity
  before update of state on public.app_snapshots
  for each row execute function private.guard_closed_shared_event_integrity();

revoke all on function private.guard_closed_shared_event_integrity()
  from public, anon, authenticated;
