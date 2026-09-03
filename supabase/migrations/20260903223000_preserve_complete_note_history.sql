begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Deletion records cannot be pruned without a causal compaction watermark.
-- Retain them under the existing 8 MiB snapshot bound, and use indexed history
-- lookups so long-lived events do not incur quadratic authorization scans.

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
  old_deletions_by_id jsonb;
  new_deletions_by_id jsonb;
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

  -- Index immutable deletion records once; avoid scanning the entire history
  -- again for each old or new tombstone.
  select coalesce(pg_catalog.jsonb_object_agg(item.value ->> 'id', item.value), '{}'::jsonb)
  into old_deletions_by_id
  from pg_catalog.jsonb_array_elements(old_deletions) as item(value);
  select coalesce(pg_catalog.jsonb_object_agg(item.value ->> 'id', item.value), '{}'::jsonb)
  into new_deletions_by_id
  from pg_catalog.jsonb_array_elements(new_deletions) as item(value);

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
      new_deletion := new_deletions_by_id -> (old_note ->> 'id');

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
    if new_deletions_by_id -> (old_deletion ->> 'id') is distinct from old_deletion then
      return false;
    end if;
  end loop;

  for new_deletion in
    select item.value
    from pg_catalog.jsonb_array_elements(new_deletions) as item(value)
  loop
    old_deletion := old_deletions_by_id -> (new_deletion ->> 'id');

    if old_deletion is null
      and new_deletion ->> 'deletedByParticipantId' is distinct from
        p_actor_participant_id then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function private.rebase_note_deletion_timestamp(
  p_deletion jsonb,
  p_note_updated_at text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if (p_deletion ->> 'deletedAt')::timestamptz < p_note_updated_at::timestamptz then
    return pg_catalog.jsonb_set(
      p_deletion, '{deletedAt}', pg_catalog.to_jsonb(p_note_updated_at), false
    );
  end if;
  return p_deletion;
exception when invalid_datetime_format or datetime_field_overflow then
  -- Invalid input still reaches the existing validation guard unchanged.
  return p_deletion;
end;
$$;

create or replace function private.preserve_committed_note_deletions(
  p_old_state jsonb,
  p_new_state jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  old_event jsonb := p_old_state -> 'events' -> 0;
  new_event jsonb := p_new_state -> 'events' -> 0;
  committed_deletions jsonb := coalesce(old_event -> 'deletedNotes', '[]'::jsonb);
  candidate_deletions jsonb := coalesce(new_event -> 'deletedNotes', '[]'::jsonb);
  committed_by_id jsonb;
  candidate_ids jsonb;
  old_notes_by_id jsonb;
  next_deletions jsonb;
begin
  if old_event ->> 'id' is distinct from new_event ->> 'id'
    or new_event is null
    or pg_catalog.jsonb_typeof(committed_deletions) is distinct from 'array'
    or pg_catalog.jsonb_typeof(candidate_deletions) is distinct from 'array' then
    return p_new_state;
  end if;

  select coalesce(pg_catalog.jsonb_object_agg(item.value ->> 'id', item.value), '{}'::jsonb)
  into committed_by_id
  from pg_catalog.jsonb_array_elements(committed_deletions) as item(value);
  select coalesce(pg_catalog.jsonb_object_agg(item.value ->> 'id', true), '{}'::jsonb)
  into candidate_ids
  from pg_catalog.jsonb_array_elements(candidate_deletions) as item(value)
  where item.value ->> 'id' is not null;
  select coalesce(pg_catalog.jsonb_object_agg(item.value ->> 'id', item.value), '{}'::jsonb)
  into old_notes_by_id
  from pg_catalog.jsonb_array_elements(coalesce(old_event -> 'notes', '[]'::jsonb)) as item(value);

  select coalesce(pg_catalog.jsonb_agg(item.value order by item.position), '[]'::jsonb)
  into next_deletions
  from (
    select coalesce(
      committed_by_id -> (candidate.value ->> 'id'),
      private.rebase_note_deletion_timestamp(
        candidate.value,
        old_notes_by_id -> (candidate.value ->> 'id') ->> 'updatedAt'
      )
    ) as value, candidate.ordinality as position
    from pg_catalog.jsonb_array_elements(candidate_deletions)
      with ordinality as candidate(value, ordinality)
    union all
    -- Legacy clients keep only their newest 500 records. Restore omitted
    -- committed history instead of either losing it or rejecting the save.
    select committed.value,
      pg_catalog.jsonb_array_length(candidate_deletions) + committed.ordinality
    from pg_catalog.jsonb_array_elements(committed_deletions)
      with ordinality as committed(value, ordinality)
    where not candidate_ids ? (committed.value ->> 'id')
  ) as item;

  if next_deletions is not distinct from candidate_deletions then
    return p_new_state;
  end if;
  return pg_catalog.jsonb_set(
    p_new_state, '{events,0,deletedNotes}', next_deletions, true
  );
end;
$$;

revoke all on function private.rebase_note_deletion_timestamp(jsonb, text)
  from public, anon, authenticated;
revoke all on function private.preserve_committed_note_deletions(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.has_valid_shared_event_notes(jsonb)
  from public, anon, authenticated;
revoke all on function private.is_safe_shared_event_notes_update(jsonb, jsonb, text)
  from public, anon, authenticated;

commit;
