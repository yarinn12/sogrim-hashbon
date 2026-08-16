begin;

create or replace function private.is_valid_shared_event_financials(p_state jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  event_record jsonb;
  expense_record jsonb;
  payer_record jsonb;
  transfer_record jsonb;
  transfer_status_update_record jsonb;
  participant_ids text[] := '{}'::text[];
  event_participant_ids text[] := '{}'::text[];
  ids text[];
  payer_total numeric;
  amount numeric;
begin
  if not private.is_shared_event_state(p_state)
    or pg_catalog.pg_column_size(p_state) > 2097152
    or pg_catalog.jsonb_typeof(p_state -> 'participants') <> 'array'
    or pg_catalog.jsonb_typeof(p_state -> 'events') <> 'array'
    or pg_catalog.jsonb_array_length(p_state -> 'participants') > 5000
    or pg_catalog.jsonb_array_length(p_state -> 'events') > 1 then
    return false;
  end if;

  if pg_catalog.jsonb_array_length(p_state -> 'events') = 0 then
    return pg_catalog.jsonb_typeof(p_state -> 'deletedEvents') = 'array'
      and pg_catalog.jsonb_array_length(p_state -> 'deletedEvents') between 1 and 100;
  end if;

  event_record := p_state -> 'events' -> 0;
  select coalesce(pg_catalog.array_agg(item.value ->> 'id'), '{}'::text[])
  into participant_ids
  from pg_catalog.jsonb_array_elements(p_state -> 'participants') as item(value);

  if exists (
      select 1
      from pg_catalog.unnest(participant_ids) as participant_id(value)
      where coalesce(participant_id.value, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    )
    or pg_catalog.cardinality(participant_ids) <> (
      select count(distinct participant_id.value)
      from pg_catalog.unnest(participant_ids) as participant_id(value)
    ) then
    return false;
  end if;

  event_participant_ids := private.event_text_ids(event_record, 'participantIds');
  if pg_catalog.cardinality(event_participant_ids) = 0
    or pg_catalog.cardinality(event_participant_ids) <> (
      select count(distinct participant_id.value)
      from pg_catalog.unnest(event_participant_ids) as participant_id(value)
    )
    or exists (
      select 1
      from pg_catalog.unnest(event_participant_ids) as participant_id(value)
      where not (participant_id.value = any(participant_ids))
    ) then
    return false;
  end if;

  if pg_catalog.jsonb_typeof(coalesce(event_record -> 'expenses', '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(event_record -> 'transfers', '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(event_record -> 'transferStatusUpdates', '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(event_record -> 'deletedExpenses', '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'expenses', '[]'::jsonb)) > 5000
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'transfers', '[]'::jsonb)) > 10000
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'transferStatusUpdates', '[]'::jsonb)) > 10000
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'deletedExpenses', '[]'::jsonb)) > 5000 then
    return false;
  end if;

  select coalesce(pg_catalog.array_agg(item.value ->> 'id'), '{}'::text[])
  into ids
  from pg_catalog.jsonb_array_elements(coalesce(event_record -> 'expenses', '[]'::jsonb)) as item(value);
  if exists (
      select 1 from pg_catalog.unnest(ids) as id(value)
      where coalesce(id.value, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    )
    or pg_catalog.cardinality(ids) <> (
      select count(distinct id.value) from pg_catalog.unnest(ids) as id(value)
    ) then
    return false;
  end if;

  for expense_record in
    select item.value
    from pg_catalog.jsonb_array_elements(coalesce(event_record -> 'expenses', '[]'::jsonb)) as item(value)
  loop
    if pg_catalog.jsonb_typeof(expense_record) <> 'object'
      or pg_catalog.jsonb_typeof(expense_record -> 'total') <> 'number'
      or (expense_record ->> 'total') !~ '^[0-9]+$'
      or (expense_record ->> 'total')::numeric <= 0
      or (expense_record ->> 'total')::numeric > 9007199254740991
      or pg_catalog.jsonb_typeof(expense_record -> 'payers') <> 'array'
      or pg_catalog.jsonb_typeof(expense_record -> 'sharedByParticipantIds') <> 'array'
      or pg_catalog.jsonb_array_length(expense_record -> 'payers') = 0
      or pg_catalog.jsonb_array_length(expense_record -> 'sharedByParticipantIds') = 0 then
      return false;
    end if;

    if coalesce(expense_record ->> 'createdByParticipantId', '') <> ''
      and not ((expense_record ->> 'createdByParticipantId') = any(event_participant_ids)) then
      return false;
    end if;

    select coalesce(pg_catalog.array_agg(shared.value), '{}'::text[])
    into ids
    from pg_catalog.jsonb_array_elements_text(expense_record -> 'sharedByParticipantIds') as shared(value);
    if pg_catalog.cardinality(ids) <> pg_catalog.jsonb_array_length(expense_record -> 'sharedByParticipantIds')
      or pg_catalog.cardinality(ids) <> (
        select count(distinct id.value) from pg_catalog.unnest(ids) as id(value)
      )
      or exists (
        select 1 from pg_catalog.unnest(ids) as id(value)
        where not (id.value = any(event_participant_ids))
      ) then
      return false;
    end if;

    select coalesce(pg_catalog.array_agg(item.value ->> 'participantId'), '{}'::text[])
    into ids
    from pg_catalog.jsonb_array_elements(expense_record -> 'payers') as item(value);
    if pg_catalog.cardinality(ids) <> pg_catalog.jsonb_array_length(expense_record -> 'payers')
      or pg_catalog.cardinality(ids) <> (
        select count(distinct id.value) from pg_catalog.unnest(ids) as id(value)
      )
      or exists (
        select 1 from pg_catalog.unnest(ids) as id(value)
        where not (id.value = any(event_participant_ids))
      ) then
      return false;
    end if;

    payer_total := 0;
    for payer_record in
      select item.value
      from pg_catalog.jsonb_array_elements(expense_record -> 'payers') as item(value)
    loop
      if pg_catalog.jsonb_typeof(payer_record) <> 'object'
        or pg_catalog.jsonb_typeof(payer_record -> 'amount') <> 'number'
        or (payer_record ->> 'amount') !~ '^[0-9]+$'
        or (payer_record ->> 'amount')::numeric <= 0
        or (payer_record ->> 'amount')::numeric > 9007199254740991 then
        return false;
      end if;
      payer_total := payer_total + (payer_record ->> 'amount')::numeric;
    end loop;
    if payer_total <> (expense_record ->> 'total')::numeric then
      return false;
    end if;
  end loop;

  select coalesce(pg_catalog.array_agg(item.value ->> 'id'), '{}'::text[])
  into ids
  from pg_catalog.jsonb_array_elements(coalesce(event_record -> 'transfers', '[]'::jsonb)) as item(value);
  if exists (
      select 1 from pg_catalog.unnest(ids) as id(value)
      where coalesce(id.value, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    )
    or pg_catalog.cardinality(ids) <> (
      select count(distinct id.value) from pg_catalog.unnest(ids) as id(value)
    ) then
    return false;
  end if;

  for transfer_record in
    select item.value
    from pg_catalog.jsonb_array_elements(coalesce(event_record -> 'transfers', '[]'::jsonb)) as item(value)
  loop
    if pg_catalog.jsonb_typeof(transfer_record) <> 'object'
      or pg_catalog.jsonb_typeof(transfer_record -> 'amount') <> 'number'
      or (transfer_record ->> 'amount') !~ '^[0-9]+$'
      or (transfer_record ->> 'amount')::numeric <= 0
      or (transfer_record ->> 'amount')::numeric > 9007199254740991
      or coalesce(transfer_record ->> 'status', '') not in ('pending', 'paid')
      or not ((transfer_record ->> 'fromParticipantId') = any(event_participant_ids))
      or not ((transfer_record ->> 'toParticipantId') = any(event_participant_ids))
      or transfer_record ->> 'fromParticipantId' = transfer_record ->> 'toParticipantId' then
      return false;
    end if;
  end loop;

  select coalesce(pg_catalog.array_agg(item.value ->> 'id'), '{}'::text[])
  into ids
  from pg_catalog.jsonb_array_elements(
    coalesce(event_record -> 'transferStatusUpdates', '[]'::jsonb)
  ) as item(value);
  if exists (
      select 1 from pg_catalog.unnest(ids) as id(value)
      where coalesce(id.value, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    )
    or pg_catalog.cardinality(ids) <> (
      select count(distinct id.value) from pg_catalog.unnest(ids) as id(value)
    ) then
    return false;
  end if;

  for transfer_status_update_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(event_record -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
  loop
    if pg_catalog.jsonb_typeof(transfer_status_update_record) <> 'object'
      or transfer_status_update_record - array[
        'id',
        'status',
        'updatedAt',
        'markedAt',
        'markedPaidByParticipantId'
      ] <> '{}'::jsonb
      or coalesce(transfer_status_update_record ->> 'status', '') not in ('pending', 'paid')
      or pg_catalog.jsonb_typeof(transfer_status_update_record -> 'updatedAt') <> 'string'
      or pg_catalog.jsonb_typeof(transfer_status_update_record -> 'markedAt') <> 'string'
      or char_length(transfer_status_update_record ->> 'updatedAt') not between 1 and 64
      or transfer_status_update_record ->> 'updatedAt'
        is distinct from transfer_status_update_record ->> 'markedAt'
      or (
        coalesce(transfer_status_update_record ->> 'markedPaidByParticipantId', '') <> ''
        and not (
          (transfer_status_update_record ->> 'markedPaidByParticipantId') = any(participant_ids)
        )
      )
      or (
        transfer_status_update_record ->> 'status' = 'pending'
        and transfer_status_update_record ? 'markedPaidByParticipantId'
      ) then
      return false;
    end if;
  end loop;

  select coalesce(pg_catalog.array_agg(item.value ->> 'id'), '{}'::text[])
  into ids
  from pg_catalog.jsonb_array_elements(coalesce(event_record -> 'deletedExpenses', '[]'::jsonb)) as item(value);
  if exists (
      select 1 from pg_catalog.unnest(ids) as id(value)
      where coalesce(id.value, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    )
    or pg_catalog.cardinality(ids) <> (
      select count(distinct id.value) from pg_catalog.unnest(ids) as id(value)
    ) then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function private.is_valid_shared_event_financials(jsonb)
  from public, anon, authenticated;

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
  old_participant_ids text[] := private.event_text_ids(old_event, 'participantIds');
  new_participant_ids text[] := private.event_text_ids(new_event, 'participantIds');
  old_inactive_ids text[] := private.event_text_ids(old_event, 'inactiveParticipantIds');
  new_inactive_ids text[] := private.event_text_ids(new_event, 'inactiveParticipantIds');
  old_admin_ids text[] := private.event_admin_ids(old.state);
  new_admin_ids text[] := private.event_admin_ids(new.state);
  actor_is_admin boolean;
  actor_is_joining boolean;
  actor_is_leaving boolean;
  actor_is_adding_offline_guests boolean;
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

  if coalesce(old_event -> 'transferStatusUpdates', '[]'::jsonb) = '[]'::jsonb
    and coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb) = '[]'::jsonb then
    old_event := old_event - 'transferStatusUpdates';
    new_event := new_event - 'transferStatusUpdates';
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

  actor_is_adding_offline_guests :=
    actor_participant_id = any(old_active_ids)
    and private.is_safe_offline_guest_addition(old.state, new.state);

  if (
    old_participant_ids is distinct from new_participant_ids
    or old_inactive_ids is distinct from new_inactive_ids
    or old_admin_ids is distinct from new_admin_ids
  ) and not actor_is_admin
    and not actor_is_leaving
    and not actor_is_joining
    and not actor_is_adding_offline_guests then
    raise exception 'Only an event admin can manage event membership'
      using errcode = '42501';
  end if;

  if not actor_is_admin then
    if old.state -> 'deletedParticipants' is distinct from
      new.state -> 'deletedParticipants' then
      raise exception 'Only an event admin can merge participant identities'
        using errcode = '42501';
    end if;

    if old.state - array['events', 'participants', 'deletedParticipants'] is distinct from
      new.state - array['events', 'participants', 'deletedParticipants'] then
      raise exception 'Only an event admin can change shared event metadata'
        using errcode = '42501';
    end if;

    if actor_is_joining or actor_is_leaving then
      if old_event - array[
          'participantIds',
          'inactiveParticipantIds',
          'membershipUpdatedAt',
          'membershipUpdatedAtByParticipant',
          'adminIds',
          'adminIdsUpdatedAt'
        ] is distinct from new_event - array[
          'participantIds',
          'inactiveParticipantIds',
          'membershipUpdatedAt',
          'membershipUpdatedAtByParticipant',
          'adminIds',
          'adminIdsUpdatedAt'
        ] then
        raise exception 'A membership update cannot change event content'
          using errcode = '42501';
      end if;

      if actor_is_leaving
        and old.state -> 'participants' is distinct from
          new.state -> 'participants' then
        raise exception 'Leaving cannot change participant profiles'
          using errcode = '42501';
      end if;

      if actor_is_joining and (
        pg_catalog.jsonb_array_length(
          case
            when pg_catalog.jsonb_typeof(new.state -> 'participants') = 'array'
              then new.state -> 'participants'
            else '[]'::jsonb
          end
        ) > pg_catalog.jsonb_array_length(
          case
            when pg_catalog.jsonb_typeof(old.state -> 'participants') = 'array'
              then old.state -> 'participants'
            else '[]'::jsonb
          end
        ) + 1
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(old.state -> 'participants') = 'array'
                then old.state -> 'participants'
              else '[]'::jsonb
            end
          ) as old_participant(value)
          where not exists (
            select 1
            from pg_catalog.jsonb_array_elements(
              case
                when pg_catalog.jsonb_typeof(new.state -> 'participants') = 'array'
                  then new.state -> 'participants'
                else '[]'::jsonb
              end
            ) as new_participant(value)
            where new_participant.value = old_participant.value
          )
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(new.state -> 'participants') = 'array'
                then new.state -> 'participants'
              else '[]'::jsonb
            end
          ) as new_participant(value)
          where not exists (
            select 1
            from pg_catalog.jsonb_array_elements(
              case
                when pg_catalog.jsonb_typeof(old.state -> 'participants') = 'array'
                  then old.state -> 'participants'
                else '[]'::jsonb
              end
            ) as old_participant(value)
            where old_participant.value = new_participant.value
          )
          and new_participant.value ->> 'id' is distinct from actor_participant_id
        )
      ) then
        raise exception 'Joining can add only the authenticated participant profile'
          using errcode = '42501';
      end if;
    else
      if not (actor_participant_id = any(old_active_ids)) then
        raise exception 'The event state must include the active member before editing'
          using errcode = '42501';
      end if;

      if not actor_is_adding_offline_guests
        and old.state -> 'participants' is distinct from
          new.state -> 'participants' then
        raise exception 'Only an event admin can change participant profiles'
          using errcode = '42501';
      end if;

      if old_event - (case
          when actor_is_adding_offline_guests then array[
            'participantIds',
            'inactiveParticipantIds',
            'membershipUpdatedAt',
            'membershipUpdatedAtByParticipant',
            'updatedAt',
            'expenses',
            'deletedExpenses',
            'transfers',
            'transferStatusUpdates',
            'activityLog'
          ]
          else array[
            'updatedAt',
            'expenses',
            'deletedExpenses',
            'transfers',
            'transferStatusUpdates',
            'activityLog'
          ]
        end) is distinct from new_event - (case
          when actor_is_adding_offline_guests then array[
            'participantIds',
            'inactiveParticipantIds',
            'membershipUpdatedAt',
            'membershipUpdatedAtByParticipant',
            'updatedAt',
            'expenses',
            'deletedExpenses',
            'transfers',
            'transferStatusUpdates',
            'activityLog'
          ]
          else array[
            'updatedAt',
            'expenses',
            'deletedExpenses',
            'transfers',
            'transferStatusUpdates',
            'activityLog'
          ]
        end) then
        raise exception 'Only an event admin can change event settings'
          using errcode = '42501';
      end if;

      if coalesce((old_event ->> 'locked')::boolean, false)
        and (
          old_event -> 'expenses' is distinct from new_event -> 'expenses'
          or old_event -> 'deletedExpenses' is distinct from
            new_event -> 'deletedExpenses'
        ) then
        raise exception 'Expenses cannot be changed while the event is locked'
          using errcode = '42501';
      end if;
    end if;
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

revoke all on function private.guard_shared_snapshot_update()
  from public, anon, authenticated;

commit;
