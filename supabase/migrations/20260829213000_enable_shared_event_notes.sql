begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

create or replace function private.has_valid_shared_event_notes(p_state jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  event_value jsonb := p_state -> 'events' -> 0;
  notes_value jsonb;
  deleted_notes_value jsonb;
  participants_value jsonb;
  note_value jsonb;
  deletion_value jsonb;
  note_ids jsonb := '{}'::jsonb;
  deleted_note_ids jsonb := '{}'::jsonb;
  note_id text;
begin
  if event_value is null then
    return true;
  end if;

  notes_value := coalesce(event_value -> 'notes', '[]'::jsonb);
  deleted_notes_value := coalesce(event_value -> 'deletedNotes', '[]'::jsonb);
  participants_value := case
    when pg_catalog.jsonb_typeof(p_state -> 'participants') = 'array'
      then p_state -> 'participants'
    else '[]'::jsonb
  end;

  if pg_catalog.jsonb_typeof(notes_value) <> 'array'
    or pg_catalog.jsonb_typeof(deleted_notes_value) <> 'array'
    or pg_catalog.jsonb_array_length(notes_value) > 100
    or pg_catalog.jsonb_array_length(deleted_notes_value) > 500 then
    return false;
  end if;

  for note_value in
    select item.value
    from pg_catalog.jsonb_array_elements(notes_value) as item(value)
  loop
    if pg_catalog.jsonb_typeof(note_value) <> 'object'
      or note_value - array[
        'id',
        'title',
        'body',
        'pinned',
        'createdAt',
        'updatedAt',
        'createdByParticipantId',
        'updatedByParticipantId'
      ] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(note_value -> 'id') <> 'string'
      or pg_catalog.jsonb_typeof(note_value -> 'title') <> 'string'
      or pg_catalog.jsonb_typeof(note_value -> 'body') <> 'string'
      or pg_catalog.jsonb_typeof(note_value -> 'createdAt') <> 'string'
      or pg_catalog.jsonb_typeof(note_value -> 'updatedAt') <> 'string'
      or pg_catalog.jsonb_typeof(note_value -> 'createdByParticipantId') <> 'string'
      or pg_catalog.jsonb_typeof(note_value -> 'updatedByParticipantId') <> 'string'
      or (
        note_value ? 'pinned'
        and pg_catalog.jsonb_typeof(note_value -> 'pinned') <> 'boolean'
      ) then
      return false;
    end if;

    note_id := note_value ->> 'id';
    if note_id !~ '^[A-Za-z0-9_-]{1,128}$'
      or note_ids ? note_id
      or pg_catalog.char_length(note_value ->> 'title') > 120
      or pg_catalog.char_length(note_value ->> 'body') > 5000
      or (
        pg_catalog.btrim(note_value ->> 'title') = ''
        and pg_catalog.btrim(note_value ->> 'body') = ''
      )
      or not exists (
        select 1
        from pg_catalog.jsonb_array_elements(participants_value) as participant(value)
        where participant.value ->> 'id' = note_value ->> 'createdByParticipantId'
      )
      or not exists (
        select 1
        from pg_catalog.jsonb_array_elements(participants_value) as participant(value)
        where participant.value ->> 'id' = note_value ->> 'updatedByParticipantId'
      ) then
      return false;
    end if;

    begin
      perform (note_value ->> 'createdAt')::timestamptz;
      perform (note_value ->> 'updatedAt')::timestamptz;
    exception when others then
      return false;
    end;

    note_ids := note_ids || pg_catalog.jsonb_build_object(note_id, true);
  end loop;

  for deletion_value in
    select item.value
    from pg_catalog.jsonb_array_elements(deleted_notes_value) as item(value)
  loop
    if pg_catalog.jsonb_typeof(deletion_value) <> 'object'
      or deletion_value - array[
        'id',
        'deletedAt',
        'deletedByParticipantId'
      ] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(deletion_value -> 'id') <> 'string'
      or pg_catalog.jsonb_typeof(deletion_value -> 'deletedAt') <> 'string'
      or pg_catalog.jsonb_typeof(deletion_value -> 'deletedByParticipantId') <> 'string' then
      return false;
    end if;

    note_id := deletion_value ->> 'id';
    if note_id !~ '^[A-Za-z0-9_-]{1,128}$'
      or deleted_note_ids ? note_id
      or note_ids ? note_id
      or not exists (
        select 1
        from pg_catalog.jsonb_array_elements(participants_value) as participant(value)
        where participant.value ->> 'id' = deletion_value ->> 'deletedByParticipantId'
      ) then
      return false;
    end if;

    begin
      perform (deletion_value ->> 'deletedAt')::timestamptz;
    exception when others then
      return false;
    end;

    deleted_note_ids := deleted_note_ids ||
      pg_catalog.jsonb_build_object(note_id, true);
  end loop;

  return true;
end;
$$;

create or replace function private.is_safe_shared_event_notes_update(
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  old_event jsonb := p_old_state -> 'events' -> 0;
  new_event jsonb := p_new_state -> 'events' -> 0;
  old_notes jsonb := coalesce(old_event -> 'notes', '[]'::jsonb);
  new_notes jsonb := coalesce(new_event -> 'notes', '[]'::jsonb);
  old_deletions jsonb := coalesce(old_event -> 'deletedNotes', '[]'::jsonb);
  new_deletions jsonb := coalesce(new_event -> 'deletedNotes', '[]'::jsonb);
  new_note jsonb;
  old_note jsonb;
  old_deletion jsonb;
  new_deletion jsonb;
  actor_is_admin boolean;
begin
  if new_event is null then
    return true;
  end if;

  if not private.has_valid_shared_event_notes(p_new_state) then
    return false;
  end if;

  if old_notes is not distinct from new_notes
    and old_deletions is not distinct from new_deletions then
    return true;
  end if;

  if p_actor_participant_id is null
    or not (
      p_actor_participant_id = any(
        private.active_event_participant_ids(p_old_state)
      )
    ) then
    return false;
  end if;

  actor_is_admin := p_actor_participant_id = any(
    private.event_admin_ids(p_old_state)
  );
  if actor_is_admin then
    return true;
  end if;

  if coalesce((old_event ->> 'adminsCanEditOnly')::boolean, false) then
    return false;
  end if;

  for new_note in
    select item.value
    from pg_catalog.jsonb_array_elements(new_notes) as item(value)
  loop
    select item.value
    into old_note
    from pg_catalog.jsonb_array_elements(old_notes) as item(value)
    where item.value ->> 'id' = new_note ->> 'id'
    limit 1;

    if old_note is null then
      if new_note ->> 'createdByParticipantId' is distinct from p_actor_participant_id
        or new_note ->> 'updatedByParticipantId' is distinct from p_actor_participant_id
        or new_note ->> 'createdAt' is distinct from new_note ->> 'updatedAt' then
        return false;
      end if;
    elsif old_note is distinct from new_note then
      if old_note ->> 'createdAt' is distinct from new_note ->> 'createdAt'
        or old_note ->> 'createdByParticipantId' is distinct from
          new_note ->> 'createdByParticipantId'
        or new_note ->> 'updatedByParticipantId' is distinct from
          p_actor_participant_id then
        return false;
      end if;

      begin
        if (new_note ->> 'updatedAt')::timestamptz <=
          (old_note ->> 'updatedAt')::timestamptz then
          return false;
        end if;
      exception when others then
        return false;
      end;
    end if;
  end loop;

  for old_note in
    select item.value
    from pg_catalog.jsonb_array_elements(old_notes) as item(value)
  loop
    if not exists (
      select 1
      from pg_catalog.jsonb_array_elements(new_notes) as item(value)
      where item.value ->> 'id' = old_note ->> 'id'
    ) then
      select item.value
      into new_deletion
      from pg_catalog.jsonb_array_elements(new_deletions) as item(value)
      where item.value ->> 'id' = old_note ->> 'id'
      limit 1;

      if new_deletion is null
        or new_deletion ->> 'deletedByParticipantId' is distinct from
          p_actor_participant_id then
        return false;
      end if;

      begin
        if (new_deletion ->> 'deletedAt')::timestamptz <
          (old_note ->> 'updatedAt')::timestamptz then
          return false;
        end if;
      exception when others then
        return false;
      end;
    end if;
  end loop;

  for old_deletion in
    select item.value
    from pg_catalog.jsonb_array_elements(old_deletions) as item(value)
  loop
    if not exists (
      select 1
      from pg_catalog.jsonb_array_elements(new_deletions) as item(value)
      where item.value = old_deletion
    ) then
      return false;
    end if;
  end loop;

  for new_deletion in
    select item.value
    from pg_catalog.jsonb_array_elements(new_deletions) as item(value)
  loop
    select item.value
    into old_deletion
    from pg_catalog.jsonb_array_elements(old_deletions) as item(value)
    where item.value ->> 'id' = new_deletion ->> 'id'
    limit 1;

    if old_deletion is null
      and new_deletion ->> 'deletedByParticipantId' is distinct from
        p_actor_participant_id then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function private.guard_shared_event_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if not private.has_valid_shared_event_notes(new.state) then
    raise exception 'Shared event notes are invalid'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and not private.is_safe_shared_event_notes_update(
      old.state,
      new.state,
      private.current_actor_participant_id()
    ) then
    raise exception 'Shared event note update is not authorized'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_shared_event_notes on public.app_snapshots;
create trigger guard_shared_event_notes
  before insert or update of state on public.app_snapshots
  for each row execute function private.guard_shared_event_notes();

do $$
declare
  previous_definition text;
  next_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.guard_shared_snapshot_update()'::regprocedure
  ) into previous_definition;

  if pg_catalog.strpos(previous_definition, '''deletedNotes''') > 0 then
    return;
  end if;

  next_definition := pg_catalog.replace(
    previous_definition,
    E'''activityLog''\n          ]',
    E'''activityLog'',\n            ''notes'',\n            ''deletedNotes''\n          ]'
  );

  if next_definition = previous_definition
    or pg_catalog.strpos(next_definition, '''deletedNotes''') = 0 then
    raise exception 'Shared snapshot guard could not be extended for notes';
  end if;

  execute next_definition;
end;
$$;

revoke all on function private.has_valid_shared_event_notes(jsonb)
  from public, anon, authenticated;
revoke all on function private.is_safe_shared_event_notes_update(jsonb,jsonb,text)
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_notes()
  from public, anon, authenticated;

commit;
