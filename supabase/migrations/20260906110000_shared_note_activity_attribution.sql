-- Shared note and activity attribution (2026-09-06).
-- Apply in one transaction. No stored history is rewritten by this migration.

-- Global duplicate-guest merges predate event-scoped account links. A visible
-- merge tombstone and canonical admin membership are required; aliases alone
-- cannot authorize changing a connected account's historical identity.
create or replace function private.authorized_shared_attribution_remap(
  p_snapshot_id text, p_old_state jsonb, p_new_state jsonb, p_actor text
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  link jsonb := private.authorized_shared_event_account_link(p_snapshot_id, p_old_state, p_new_state, p_actor);
  deletion jsonb;
  source_id text;
  target_id text;
  source_record jsonb;
  target_record jsonb;
  old_event jsonb := p_old_state -> 'events' -> 0;
  new_event jsonb := p_new_state -> 'events' -> 0;
  expected_ids text[];
  actual_ids text[];
  candidate_count integer;
begin
  if link is not null then return link; end if;
  if old_event ->> 'id' is distinct from new_event ->> 'id'
    or not (p_actor = any(private.event_admin_ids(p_old_state)))
    or not exists (select 1 from private.shared_snapshot_members
      where snapshot_id = p_snapshot_id and participant_id = p_actor and status = 'active' and role = 'admin') then return null; end if;
  select count(*), min(item.value::text)::jsonb into candidate_count, deletion
  from pg_catalog.jsonb_array_elements(coalesce(p_new_state -> 'deletedParticipants', '[]'::jsonb)) as item(value)
  where item.value ->> 'reason' = 'merged' and not exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(p_old_state -> 'deletedParticipants', '[]'::jsonb)) as previous(value)
    where previous.value ->> 'id' = item.value ->> 'id'
      and previous.value ->> 'targetParticipantId' = item.value ->> 'targetParticipantId');
  if candidate_count <> 1 or pg_catalog.jsonb_typeof(deletion -> 'deletedAt') is distinct from 'string'
    or not pg_catalog.isfinite((deletion ->> 'deletedAt')::timestamptz) then return null; end if;
  source_id := deletion ->> 'id'; target_id := deletion ->> 'targetParticipantId';
  if coalesce(source_id, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    or coalesce(target_id, '') !~ '^[A-Za-z0-9_-]{1,128}$' or source_id = target_id then return null; end if;
  select value into source_record from pg_catalog.jsonb_array_elements(p_old_state -> 'participants')
    where value ->> 'id' = source_id;
  select value into target_record from pg_catalog.jsonb_array_elements(p_old_state -> 'participants')
    where value ->> 'id' = target_id;
  if target_record is null then
    select value into target_record from pg_catalog.jsonb_array_elements(p_new_state -> 'participants')
      where value ->> 'id' = target_id;
  end if;
  if source_record is null or target_record is null or source_id like 'account-%'
    or source_record @> '{"accountLinked":true}'::jsonb
    or (source_record ->> 'authProvider' in ('google','apple','email') and coalesce(source_record ->> 'authSubject', '') <> '')
    or exists (select 1 from pg_catalog.jsonb_array_elements(p_new_state -> 'participants') where value ->> 'id' = source_id)
    or not exists (select 1 from pg_catalog.jsonb_array_elements(p_new_state -> 'participants') where value ->> 'id' = target_id) then return null; end if;
  if target_id like 'account-%' or target_record @> '{"accountLinked":true}'::jsonb
    or (target_record ->> 'authProvider' in ('google','apple','email') and coalesce(target_record ->> 'authSubject', '') <> '') then
    if not exists (select 1 from private.shared_snapshot_members
      where snapshot_id = p_snapshot_id and participant_id = target_id and status = 'active') then return null; end if;
  else
    -- Match the UI's NFKC, whitespace, Hebrew-mark and case normalization.
    if coalesce(pg_catalog.btrim(source_record ->> 'displayName'), '') = '' or
      pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(pg_catalog.regexp_replace(
        pg_catalog.normalize(source_record ->> 'displayName', 'NFKC'), U&'[\0591-\05BD\05BF\05C1\05C2\05C4\05C5\05C7]', '', 'g')), '\s+', ' ', 'g'))
      is distinct from pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(pg_catalog.regexp_replace(
        pg_catalog.normalize(target_record ->> 'displayName', 'NFKC'), U&'[\0591-\05BD\05BF\05C1\05C2\05C4\05C5\05C7]', '', 'g')), '\s+', ' ', 'g')) then return null; end if;
  end if;
  select coalesce(pg_catalog.array_agg(distinct case when value = source_id then target_id else value end), array[]::text[])
    into expected_ids from pg_catalog.jsonb_array_elements_text(old_event -> 'participantIds');
  select coalesce(pg_catalog.array_agg(distinct value), array[]::text[]) into actual_ids
    from pg_catalog.jsonb_array_elements_text(new_event -> 'participantIds');
  if not (expected_ids @> actual_ids and actual_ids @> expected_ids) then return null; end if;
  return pg_catalog.jsonb_build_object('sourceParticipantId', source_id, 'targetParticipantId', target_id);
exception when invalid_datetime_format or datetime_field_overflow then return null;
end;
$$;
revoke all on function private.authorized_shared_attribution_remap(text,jsonb,jsonb,text) from public, anon, authenticated;

create or replace function private.remap_attribution_fields(
  p_record jsonb, p_source text, p_target text, p_fields text[]
)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  result jsonb := p_record;
  field_name text;
begin
  foreach field_name in array p_fields loop
    if result ->> field_name = p_source then
      result := pg_catalog.jsonb_set(result, array[field_name], pg_catalog.to_jsonb(p_target), false);
    end if;
  end loop;
  return result;
end;
$$;

-- p_link is supplied only by the canonical account-link proof, never trusted
-- directly from the request. Keep all content, creation clocks and IDs intact.
create or replace function private.remap_shared_note_attribution(p_state jsonb, p_link jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  result jsonb := p_state;
  records jsonb;
begin
  if p_link is null or p_state -> 'events' -> 0 is null then return p_state; end if;
  select coalesce(pg_catalog.jsonb_agg(private.remap_attribution_fields(
    item.value, p_link ->> 'sourceParticipantId', p_link ->> 'targetParticipantId',
    array['createdByParticipantId','updatedByParticipantId']
  ) order by item.position), '[]'::jsonb) into records
  from pg_catalog.jsonb_array_elements(coalesce(p_state #> '{events,0,notes}', '[]'::jsonb))
    with ordinality as item(value, position);
  result := pg_catalog.jsonb_set(result, '{events,0,notes}', records, true);
  select coalesce(pg_catalog.jsonb_agg(private.remap_attribution_fields(
    item.value, p_link ->> 'sourceParticipantId', p_link ->> 'targetParticipantId',
    array['deletedByParticipantId']
  ) order by item.position), '[]'::jsonb) into records
  from pg_catalog.jsonb_array_elements(coalesce(p_state #> '{events,0,deletedNotes}', '[]'::jsonb))
    with ordinality as item(value, position);
  return pg_catalog.jsonb_set(result, '{events,0,deletedNotes}', records, true);
end;
$$;

create or replace function private.is_safe_shared_event_notes_update(
  p_old_state jsonb, p_new_state jsonb, p_actor_participant_id text, p_snapshot_id text
)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_safe_shared_event_notes_update(
    private.remap_shared_note_attribution(p_old_state,
      private.authorized_shared_attribution_remap(p_snapshot_id, p_old_state, p_new_state, p_actor_participant_id)),
    p_new_state, p_actor_participant_id
  );
$$;

create or replace function private.normalize_repeated_shared_note_deletions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.snapshot_kind = 'shared_event' and new.snapshot_kind = 'shared_event' then
    new.state := private.preserve_committed_note_deletions(
      private.remap_shared_note_attribution(old.state,
        private.authorized_shared_attribution_remap(new.id, old.state, new.state, private.current_actor_participant_id())),
      new.state
    );
  end if;
  return new;
end;
$$;

-- First publication may carry genuine offline guest history. As with expense
-- attribution, it cannot claim that another connected account authored it.
create or replace function private.initial_shared_note_attribution_is_valid(p_state jsonb, p_actor text)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  item jsonb;
  field_name text;
begin
  for item in select value from pg_catalog.jsonb_array_elements(coalesce(p_state #> '{events,0,notes}', '[]'::jsonb)) loop
    foreach field_name in array array['createdByParticipantId','updatedByParticipantId'] loop
      if item ->> field_name is distinct from p_actor
        and private.is_account_linked_shared_participant(p_state, item ->> field_name) then return false; end if;
    end loop;
  end loop;
  for item in select value from pg_catalog.jsonb_array_elements(coalesce(p_state #> '{events,0,deletedNotes}', '[]'::jsonb)) loop
    if item ->> 'deletedByParticipantId' is distinct from p_actor
      and private.is_account_linked_shared_participant(p_state, item ->> 'deletedByParticipantId') then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.guard_shared_event_notes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.snapshot_kind <> 'shared_event' then return new; end if;
  if not private.has_valid_shared_event_notes(new.state) then
    raise exception 'Shared event notes are invalid' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if not private.initial_shared_note_attribution_is_valid(new.state, private.current_actor_participant_id()) then
      raise exception 'Initial shared note attribution is invalid' using errcode = '42501';
    end if;
  elsif not private.is_safe_shared_event_notes_update(old.state, new.state, private.current_actor_participant_id(), new.id) then
    raise exception 'Shared event note update is not authorized' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.has_valid_shared_activity_shape(p_activity jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  field_name text;
  item_time timestamptz;
begin
  if pg_catalog.jsonb_typeof(p_activity) is distinct from 'array' then return false; end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_activity) as entry(value)
    group by entry.value ->> 'id' having count(*) > 1) then return false; end if;
  for item in select value from pg_catalog.jsonb_array_elements(p_activity) loop
    if pg_catalog.jsonb_typeof(item) is distinct from 'object'
      or item - array['id','kind','occurredAt','actorParticipantId','subjectParticipantId','fromParticipantId','toParticipantId','entityId','label'] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(item -> 'id') is distinct from 'string'
      or (item ->> 'id') !~ '^[A-Za-z0-9_-]{1,128}$'
      or pg_catalog.jsonb_typeof(item -> 'kind') is distinct from 'string'
      or item ->> 'kind' not in ('event-created','event-closed','event-reopened','expense-created','expense-updated','expense-deleted','participant-added','participant-removed','participant-restored','participant-left','transfer-paid','transfer-pending')
      or pg_catalog.jsonb_typeof(item -> 'occurredAt') is distinct from 'string'
      or (item ? 'label' and (pg_catalog.jsonb_typeof(item -> 'label') is distinct from 'string' or pg_catalog.char_length(item ->> 'label') > 80)) then return false; end if;
    item_time := (item ->> 'occurredAt')::timestamptz;
    if item_time is null or not pg_catalog.isfinite(item_time) then return false; end if;
    foreach field_name in array array['actorParticipantId','subjectParticipantId','fromParticipantId','toParticipantId','entityId'] loop
      if item ? field_name and (pg_catalog.jsonb_typeof(item -> field_name) is distinct from 'string'
        or (item ->> field_name) !~ '^[A-Za-z0-9_-]{1,128}$') then return false; end if;
    end loop;
  end loop;
  return true;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

-- Date.parse serializes to milliseconds, truncating fractional digits BEFORE
-- PostgreSQL can round a nanosecond value into the next second.
create or replace function private.shared_activity_browser_time(p_value text)
returns timestamptz language sql immutable set search_path = '' as $$
  select pg_catalog.regexp_replace(p_value, '([.][0-9]{3})[0-9]+([zZ]|[+-][0-9]{2}:?[0-9]{2})$', '\1\2')::timestamptz;
$$;
revoke all on function private.shared_activity_browser_time(text) from public, anon, authenticated;

-- Accept only the same instant or the browser's existing millisecond
-- serialization of it; never a changed actor, content or action identity.
create or replace function private.same_shared_activity_record(p_old jsonb, p_new jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if p_old is not distinct from p_new then return true; end if;
  return coalesce(p_old - 'occurredAt' = p_new - 'occurredAt'
    and pg_catalog.isfinite((p_old ->> 'occurredAt')::timestamptz)
    and ((p_old ->> 'occurredAt')::timestamptz = (p_new ->> 'occurredAt')::timestamptz
      or private.shared_activity_browser_time(p_old ->> 'occurredAt') = (p_new ->> 'occurredAt')::timestamptz), false);
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

-- Attribution integrity, not proof of every intermediate offline action.
create or replace function private.has_authorized_shared_activity(
  p_old_state jsonb, p_new_state jsonb, p_actor text, p_snapshot_id text, p_initial boolean
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  old_log jsonb := coalesce(p_old_state #> '{events,0,activityLog}', '[]'::jsonb);
  new_log jsonb := coalesce(p_new_state #> '{events,0,activityLog}', '[]'::jsonb);
  old_by_id jsonb;
  new_by_id jsonb;
  item jsonb;
  previous jsonb;
  link jsonb;
  added_count integer := 0;
  removed_count integer := 0;
  oldest_kept timestamptz;
begin
  if p_new_state -> 'events' -> 0 is null then return true; end if;
  -- Unchanged legacy rows do not strand unrelated saves or account anonymization.
  if not p_initial and old_log is not distinct from new_log then return true; end if;
  if not private.has_valid_shared_activity_shape(new_log)
    or pg_catalog.jsonb_array_length(new_log) > 100 then return false; end if;
  if p_initial then
    for item in select value from pg_catalog.jsonb_array_elements(new_log) loop
      if item ->> 'actorParticipantId' is distinct from p_actor
        and ((item ->> 'actorParticipantId') like 'account-%'
          or private.is_account_linked_shared_participant(p_new_state, item ->> 'actorParticipantId')) then return false; end if;
    end loop;
    return true;
  end if;
  if not private.has_valid_shared_activity_shape(old_log) then return false; end if;
  link := private.authorized_shared_attribution_remap(p_snapshot_id, p_old_state, p_new_state, p_actor);
  select coalesce(pg_catalog.jsonb_object_agg(entry.value ->> 'id', entry.value), '{}'::jsonb)
    into old_by_id from pg_catalog.jsonb_array_elements(old_log) as entry(value);
  select coalesce(pg_catalog.jsonb_object_agg(entry.value ->> 'id', entry.value), '{}'::jsonb)
    into new_by_id from pg_catalog.jsonb_array_elements(new_log) as entry(value);
  for item in select value from pg_catalog.jsonb_array_elements(new_log) loop
    previous := old_by_id -> (item ->> 'id');
    if previous is null then
      added_count := added_count + 1;
      if coalesce(p_actor, '') = '' or item ->> 'actorParticipantId' is distinct from p_actor then return false; end if;
    else
      if link is not null then
        previous := private.remap_attribution_fields(previous, link ->> 'sourceParticipantId', link ->> 'targetParticipantId',
          array['actorParticipantId','subjectParticipantId','fromParticipantId','toParticipantId']);
      end if;
      if not private.same_shared_activity_record(previous, item) then return false; end if;
    end if;
  end loop;
  select min(private.shared_activity_browser_time(entry.value ->> 'occurredAt')) into oldest_kept
    from pg_catalog.jsonb_array_elements(new_log) as entry(value);
  for item in select value from pg_catalog.jsonb_array_elements(old_log) loop
    if not (new_by_id ? (item ->> 'id')) then
      removed_count := removed_count + 1;
      if oldest_kept is null or private.shared_activity_browser_time(item ->> 'occurredAt') > oldest_kept then return false; end if;
    end if;
  end loop;
  -- Only the overflow of the bounded newest-100 union may be removed. Equal
  -- timestamp ties are allowed because JS locale order differs from SQL collation.
  if removed_count > 0 and (
    pg_catalog.jsonb_array_length(new_log) <> 100
    or removed_count <> greatest(0, pg_catalog.jsonb_array_length(old_log) + added_count - 100)
  ) then return false; end if;
  return true;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

create or replace function private.guard_shared_activity_attribution()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.snapshot_kind = 'shared_event' and not private.has_authorized_shared_activity(
    case when tg_op = 'INSERT' then '{}'::jsonb else old.state end,
    new.state, private.current_actor_participant_id(), new.id, tg_op = 'INSERT'
  ) then
    raise exception 'Shared event activity attribution is invalid' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_shared_activity_attribution on public.app_snapshots;
create trigger guard_shared_activity_attribution before insert or update of state on public.app_snapshots
  for each row execute function private.guard_shared_activity_attribution();

revoke all on function private.remap_attribution_fields(jsonb,text,text,text[]) from public, anon, authenticated;
revoke all on function private.remap_shared_note_attribution(jsonb,jsonb) from public, anon, authenticated;
revoke all on function private.is_safe_shared_event_notes_update(jsonb,jsonb,text,text) from public, anon, authenticated;
revoke all on function private.initial_shared_note_attribution_is_valid(jsonb,text) from public, anon, authenticated;
revoke all on function private.has_valid_shared_activity_shape(jsonb) from public, anon, authenticated;
revoke all on function private.same_shared_activity_record(jsonb,jsonb) from public, anon, authenticated;
revoke all on function private.has_authorized_shared_activity(jsonb,jsonb,text,text,boolean) from public, anon, authenticated;
revoke all on function private.guard_shared_activity_attribution() from public, anon, authenticated;

-- Administration permits content edits, never arbitrary personal attribution.
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
  if not actor_is_admin and coalesce((old_event ->> 'adminsCanEditOnly')::boolean, false) then
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
        or (not actor_is_admin and new_note ->> 'createdAt' is distinct from new_note ->> 'updatedAt') then
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

-- Closed-history pruning/remapping must satisfy the same attribution guard;
-- newly introduced close entries still require the actual admin transition.
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
  ) and not private.has_authorized_shared_activity(
    old.state, new.state, actor_participant_id, new.id, false
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

revoke all on function private.is_safe_shared_event_notes_update(jsonb,jsonb,text) from public, anon, authenticated;
