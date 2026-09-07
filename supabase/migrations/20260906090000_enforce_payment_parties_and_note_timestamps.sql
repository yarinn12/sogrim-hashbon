-- Mandatory payment parties and finite note envelopes (2026-09-06).
-- Existing account-link proofs and unchanged historical receipts stay intact.
-- No historical rows are rewritten; the checks govern subsequent writes.

create or replace function private.can_update_transfer_payment(
  p_state jsonb,
  p_transfer_id text,
  p_actor_participant_id text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_actor_participant_id = any(private.active_event_participant_ids(p_state))
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(p_state -> 'events' -> 0 -> 'transfers', '[]'::jsonb)
      ) as item(value)
      where item.value ->> 'id' = p_transfer_id
        and (
          p_actor_participant_id = item.value ->> 'fromParticipantId'
          or p_actor_participant_id = item.value ->> 'toParticipantId'
          or p_actor_participant_id = any(private.event_admin_ids(p_state))
        )
    ), false
  );
$$;

create or replace function private.has_authorized_transfer_status_changes(
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text,
  p_snapshot_id text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  old_event jsonb := coalesce(p_old_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(p_new_state -> 'events' -> 0, '{}'::jsonb);
  old_record jsonb;
  new_record jsonb;
  status_record jsonb;
  transfer_record jsonb;
  changed_at timestamptz;
  account_link jsonb := private.authorized_shared_event_account_link(
    p_snapshot_id,
    p_old_state,
    p_new_state,
    p_actor_participant_id
  );
  link_source text := account_link ->> 'sourceParticipantId';
  link_target text := account_link ->> 'targetParticipantId';
begin
  for new_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
  loop
    old_record := null;
    select item.value into old_record
    from pg_catalog.jsonb_array_elements(
      coalesce(old_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;
    if old_record is not distinct from new_record then
      continue;
    end if;
    if account_link is not null
      and old_record is not null
      and old_record - 'markedPaidByParticipantId'
        = new_record - 'markedPaidByParticipantId'
      and new_record ->> 'markedPaidByParticipantId' is not distinct from (
        case
          when old_record ->> 'markedPaidByParticipantId' = link_source
            then link_target
          else old_record ->> 'markedPaidByParticipantId'
        end
      ) then
      continue;
    end if;

    transfer_record := null;
    select item.value into transfer_record
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;
    if transfer_record is null
      or transfer_record ->> 'status' is distinct from new_record ->> 'status'
      or coalesce(p_actor_participant_id, '') = '' then
      return false;
    end if;

    -- Authority comes from the committed event, never the proposed endpoints/admins.
    if not private.can_update_transfer_payment(
      p_old_state, new_record ->> 'id', p_actor_participant_id
    ) then
      -- A locally generated transfer can be marked and undone before its first
      -- commit. Its final pending receipt is not a payment of an existing debt.
      -- Only that no-payment case may derive its parties from the new transfer.
      if not coalesce((
        new_record ->> 'status' = 'pending'
        and not (new_record ? 'markedPaidByParticipantId')
        and p_actor_participant_id = any(private.active_event_participant_ids(p_old_state))
        and (
          p_actor_participant_id = transfer_record ->> 'fromParticipantId'
          or p_actor_participant_id = transfer_record ->> 'toParticipantId'
          or p_actor_participant_id = any(private.event_admin_ids(p_old_state))
        )
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(coalesce(old_event -> 'transfers', '[]'::jsonb)) as previous(value)
          where previous.value ->> 'id' = new_record ->> 'id'
        )
      ), false) then
        return false;
      end if;
    end if;

    changed_at := (new_record ->> 'updatedAt')::timestamptz;
    if changed_at < pg_catalog.statement_timestamp() - interval '15 minutes'
      or changed_at > pg_catalog.statement_timestamp() + interval '2 minutes' then
      return false;
    end if;
    if new_record ->> 'status' = 'paid' then
      if new_record ->> 'markedPaidByParticipantId'
        is distinct from p_actor_participant_id then
        return false;
      end if;
    elsif new_record ? 'markedPaidByParticipantId' then
      return false;
    end if;
  end loop;

  for new_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
  loop
    old_record := null;
    select item.value into old_record
    from pg_catalog.jsonb_array_elements(
      coalesce(old_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;

    if old_record is null then
      if coalesce(new_record ->> 'status', '') = 'pending' then
        continue;
      end if;
      return false;
    end if;

    if account_link is not null
      and new_record ->> 'fromParticipantId' is not distinct from (
        case when old_record ->> 'fromParticipantId' = link_source
          then link_target else old_record ->> 'fromParticipantId' end
      )
      and new_record ->> 'toParticipantId' is not distinct from (
        case when old_record ->> 'toParticipantId' = link_source
          then link_target else old_record ->> 'toParticipantId' end
      )
      and new_record ->> 'markedPaidByParticipantId' is not distinct from (
        case when old_record ->> 'markedPaidByParticipantId' = link_source
          then link_target else old_record ->> 'markedPaidByParticipantId' end
      )
      and new_record - array[
        'fromParticipantId',
        'toParticipantId',
        'markedPaidByParticipantId',
        'updatedAt'
      ] = old_record - array[
        'fromParticipantId',
        'toParticipantId',
        'markedPaidByParticipantId',
        'updatedAt'
      ]
      and (
        new_record ->> 'updatedAt' is not distinct from old_record ->> 'updatedAt'
        or new_record ->> 'updatedAt' = account_link ->> 'linkedAt'
      ) then
      continue;
    end if;

    if old_record ->> 'fromParticipantId'
        is distinct from new_record ->> 'fromParticipantId'
      or old_record ->> 'toParticipantId'
        is distinct from new_record ->> 'toParticipantId'
      or old_record -> 'amount' is distinct from new_record -> 'amount' then
      return false;
    end if;

    if old_record ->> 'status' is not distinct from new_record ->> 'status'
      and old_record ->> 'markedPaidByParticipantId'
        is not distinct from new_record ->> 'markedPaidByParticipantId'
      and old_record ->> 'markedPaidAt'
        is not distinct from new_record ->> 'markedPaidAt'
      and old_record ->> 'statusUpdatedAt'
        is not distinct from new_record ->> 'statusUpdatedAt' then
      continue;
    end if;
    if not private.can_update_transfer_payment(
      p_old_state, new_record ->> 'id', p_actor_participant_id
    ) then
      return false;
    end if;
    status_record := null;
    select item.value into status_record
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;

    if status_record is null
      or status_record ->> 'status' is distinct from new_record ->> 'status'
      or (
        new_record ->> 'status' = 'paid'
        and (
          status_record ->> 'markedPaidByParticipantId'
            is distinct from p_actor_participant_id
          or new_record ->> 'markedPaidByParticipantId'
            is distinct from p_actor_participant_id
          or new_record ->> 'markedPaidAt'
            is distinct from status_record ->> 'updatedAt'
          or new_record ->> 'statusUpdatedAt'
            is distinct from status_record ->> 'updatedAt'
        )
      )
      or (
        new_record ->> 'status' = 'pending'
        and new_record ? 'markedPaidByParticipantId'
      ) then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

-- Keep the historical overload on the same mandatory authorization path.
-- Without a snapshot ID it cannot manufacture an account-link exception.
create or replace function private.has_authorized_transfer_status_changes(
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.has_authorized_transfer_status_changes(
    p_old_state, p_new_state, p_actor_participant_id, null::text
  );
$$;

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
  -- Legacy notes may omit per-field clocks, but never their envelope dates.
  if pg_catalog.jsonb_typeof(p_note -> 'createdAt') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_note -> 'updatedAt') is distinct from 'string' then
    return false;
  end if;
  created_time := (p_note ->> 'createdAt')::timestamptz;
  updated_time := (p_note ->> 'updatedAt')::timestamptz;
  if created_time is null or updated_time is null
    or not pg_catalog.isfinite(created_time) or not pg_catalog.isfinite(updated_time)
    or created_time > updated_time then
    return false;
  end if;
  if not (p_note ? 'fieldUpdatedAt') then return true; end if;
  if pg_catalog.jsonb_typeof(clocks) is distinct from 'object'
    or clocks - array['title','body','pinned'] <> '{}'::jsonb
    or not (clocks ?& array['title','body','pinned']) then
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

  if pg_catalog.jsonb_typeof(notes_value) is distinct from 'array'
    or pg_catalog.jsonb_typeof(deleted_notes_value) is distinct from 'array'
    or pg_catalog.jsonb_array_length(notes_value) > 100 then
    return false;
  end if;

  for note_value in
    select item.value
    from pg_catalog.jsonb_array_elements(notes_value) as item(value)
  loop
    if pg_catalog.jsonb_typeof(note_value) is distinct from 'object'
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
      or pg_catalog.jsonb_typeof(note_value -> 'id') is distinct from 'string'
      or pg_catalog.jsonb_typeof(note_value -> 'title') is distinct from 'string'
      or pg_catalog.jsonb_typeof(note_value -> 'body') is distinct from 'string'
      or pg_catalog.jsonb_typeof(note_value -> 'createdAt') is distinct from 'string'
      or pg_catalog.jsonb_typeof(note_value -> 'updatedAt') is distinct from 'string'
      or pg_catalog.jsonb_typeof(note_value -> 'createdByParticipantId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(note_value -> 'updatedByParticipantId') is distinct from 'string'
      or (
        note_value ? 'pinned'
        and pg_catalog.jsonb_typeof(note_value -> 'pinned') is distinct from 'boolean'
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
    if pg_catalog.jsonb_typeof(deletion_value) is distinct from 'object'
      or deletion_value - array[
        'id',
        'deletedAt',
        'deletedByParticipantId'
      ] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(deletion_value -> 'id') is distinct from 'string'
      or pg_catalog.jsonb_typeof(deletion_value -> 'deletedAt') is distinct from 'string'
      or pg_catalog.jsonb_typeof(deletion_value -> 'deletedByParticipantId') is distinct from 'string' then
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
      if not pg_catalog.isfinite((deletion_value ->> 'deletedAt')::timestamptz) then
        return false;
      end if;
    exception when others then
      return false;
    end;
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
  -- Do not turn malformed client input into valid data before validation runs.
  if pg_catalog.jsonb_typeof(p_deletion -> 'deletedAt') is distinct from 'string'
    or p_note_updated_at is null
    or not pg_catalog.isfinite((p_deletion ->> 'deletedAt')::timestamptz)
    or not pg_catalog.isfinite(p_note_updated_at::timestamptz) then
    return p_deletion;
  end if;
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

revoke all on function private.can_update_transfer_payment(jsonb,text,text) from public, anon, authenticated;
revoke all on function private.has_authorized_transfer_status_changes(jsonb,jsonb,text,text) from public, anon, authenticated;
revoke all on function private.has_authorized_transfer_status_changes(jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function private.has_valid_note_field_clocks(jsonb) from public, anon, authenticated;
revoke all on function private.has_valid_shared_event_notes(jsonb) from public, anon, authenticated;
revoke all on function private.rebase_note_deletion_timestamp(jsonb,text) from public, anon, authenticated;
