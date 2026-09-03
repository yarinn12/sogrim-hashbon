begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Optional protocol metadata, bounded by the already validated note revision.
-- No author, membership, deletion, active-note-count or snapshot-byte guard is removed.
create or replace function private.has_valid_note_field_clocks(p_note jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  clocks jsonb := p_note -> 'fieldUpdatedAt';
  field_name text;
  clock_time timestamptz;
  created_time timestamptz;
  updated_time timestamptz;
begin
  if not (p_note ? 'fieldUpdatedAt') then return true; end if;
  if pg_catalog.jsonb_typeof(clocks) is distinct from 'object'
    or clocks - array['title','body','pinned'] <> '{}'::jsonb
    or not (clocks ?& array['title','body','pinned']) then
    return false;
  end if;
  created_time := (p_note ->> 'createdAt')::timestamptz;
  updated_time := (p_note ->> 'updatedAt')::timestamptz;
  if created_time is null or updated_time is null
    or not pg_catalog.isfinite(created_time) or not pg_catalog.isfinite(updated_time) then
    return false;
  end if;
  foreach field_name in array array['title','body','pinned'] loop
    if pg_catalog.jsonb_typeof(clocks -> field_name) is distinct from 'string'
      or (clocks ->> field_name) !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$' then
      return false;
    end if;
    clock_time := (clocks ->> field_name)::timestamptz;
    if not pg_catalog.isfinite(clock_time) or clock_time < created_time or clock_time > updated_time then
      return false;
    end if;
  end loop;
  return true;
exception when invalid_datetime_format or datetime_field_overflow then
  return false;
end;
$$;

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
    or pg_catalog.jsonb_array_length(notes_value) > 100 then
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
        'updatedByParticipantId',
        'fieldUpdatedAt'
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

    if not private.has_valid_note_field_clocks(note_value) then
      return false;
    end if;

    note_ids := note_ids || pg_catalog.jsonb_build_object(note_id, true);
  end loop;

  -- History retention is bounded by the snapshot byte limit, never by dropping
  -- deletion IDs. Detect duplicates once instead of rebuilding a JSON object
  -- on every iteration of a potentially long history.
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(deleted_notes_value) as item(value)
    group by item.value ->> 'id' having count(*) > 1
  ) then
    return false;
  end if;

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
  end loop;

  return true;
end;
$$;

-- Old apps omit clocks, or spread their old map while changing a whole note.
-- Preserve their existing whole-note-write semantics, but never regress field
-- clocks. This does not infer unknown intent from a legacy full snapshot.
create or replace function private.normalize_note_field_clocks(p_old_state jsonb, p_new_state jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  old_event jsonb := p_old_state -> 'events' -> 0;
  new_event jsonb := p_new_state -> 'events' -> 0;
  old_by_id jsonb;
  candidate jsonb;
  previous jsonb;
  next_notes jsonb := '[]'::jsonb;
  clocks jsonb;
  field_name text;
  old_clock text;
  next_clock text;
  changed boolean;
begin
  if old_event ->> 'id' is distinct from new_event ->> 'id'
    or pg_catalog.jsonb_typeof(old_event -> 'notes') is distinct from 'array'
    or pg_catalog.jsonb_typeof(new_event -> 'notes') is distinct from 'array'
    or pg_catalog.jsonb_array_length(new_event -> 'notes') > 100 then
    return p_new_state;
  end if;
  select coalesce(pg_catalog.jsonb_object_agg(item ->> 'id', item), '{}'::jsonb)
    into old_by_id from pg_catalog.jsonb_array_elements(old_event -> 'notes') as item;
  for candidate in select item from pg_catalog.jsonb_array_elements(new_event -> 'notes') as item loop
    previous := old_by_id -> (candidate ->> 'id');
    -- Never launder malformed metadata. The existing validator rejects it.
    if previous is not null and (previous ? 'fieldUpdatedAt' or candidate ? 'fieldUpdatedAt')
      and private.has_valid_note_field_clocks(previous)
      and private.has_valid_note_field_clocks(candidate) then
      clocks := '{}'::jsonb;
      foreach field_name in array array['title','body','pinned'] loop
        old_clock := coalesce(previous -> 'fieldUpdatedAt' ->> field_name, previous ->> 'updatedAt');
        next_clock := coalesce(candidate -> 'fieldUpdatedAt' ->> field_name, candidate ->> 'updatedAt');
        changed := case when field_name = 'pinned'
          then coalesce(previous -> field_name, 'false'::jsonb) is distinct from coalesce(candidate -> field_name, 'false'::jsonb)
          else previous -> field_name is distinct from candidate -> field_name end;
        if not changed then
          -- An old full-note edit must not timestamp fields it did not change.
          if not (candidate ? 'fieldUpdatedAt') or next_clock::timestamptz < old_clock::timestamptz then
            next_clock := old_clock;
          end if;
        elsif next_clock::timestamptz <= old_clock::timestamptz then
          next_clock := candidate ->> 'updatedAt';
        end if;
        clocks := clocks || pg_catalog.jsonb_build_object(field_name, next_clock);
      end loop;
      candidate := pg_catalog.jsonb_set(candidate, '{fieldUpdatedAt}', clocks, true);
    end if;
    next_notes := next_notes || pg_catalog.jsonb_build_array(candidate);
  end loop;
  return pg_catalog.jsonb_set(p_new_state, '{events,0,notes}', next_notes, false);
exception when invalid_datetime_format or datetime_field_overflow then
  -- Leave invalid data to the validating/authorization triggers.
  return p_new_state;
end;
$$;

create or replace function private.normalize_shared_note_field_clocks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.snapshot_kind = 'shared_event' and new.snapshot_kind = 'shared_event' then
    new.state := private.normalize_note_field_clocks(old.state, new.state);
  end if;
  return new;
end;
$$;

drop trigger if exists aa_normalize_shared_note_field_clocks on public.app_snapshots;
create trigger aa_normalize_shared_note_field_clocks
  before update of state on public.app_snapshots
  for each row execute function private.normalize_shared_note_field_clocks();

revoke all on function private.has_valid_note_field_clocks(jsonb) from public, anon, authenticated;
revoke all on function private.normalize_note_field_clocks(jsonb,jsonb) from public, anon, authenticated;
revoke all on function private.normalize_shared_note_field_clocks() from public, anon, authenticated;
revoke all on function private.has_valid_shared_event_notes(jsonb) from public, anon, authenticated;
commit;
