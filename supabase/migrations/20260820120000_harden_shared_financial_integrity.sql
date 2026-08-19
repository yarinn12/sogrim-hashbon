begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

create or replace function private.is_account_linked_shared_participant(
  p_state jsonb,
  p_participant_id text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(p_state -> 'participants') = 'array'
          then p_state -> 'participants'
        else '[]'::jsonb
      end
    ) as participant(value)
    where participant.value ->> 'id' = p_participant_id
      and (
        p_participant_id like 'account-%'
        or participant.value @> '{"accountLinked": true}'::jsonb
      )
  );
$$;

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
    or pg_catalog.jsonb_array_length(p_state -> 'participants') > 500
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
  from pg_catalog.jsonb_array_elements(
    case
      when pg_catalog.jsonb_typeof(p_state -> 'participants') = 'array'
        then p_state -> 'participants'
      else '[]'::jsonb
    end
  ) as item(value);

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
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'expenses', '[]'::jsonb)) > 2000
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'transfers', '[]'::jsonb)) > 2000
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'transferStatusUpdates', '[]'::jsonb)) > 2000
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'deletedExpenses', '[]'::jsonb)) > 2000 then
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

create or replace function private.has_valid_shared_event_transfer_totals(
  p_state jsonb
)
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
  participant_record record;
  shared_record record;
  participant_balances jsonb := '{}'::jsonb;
  outstanding_balances jsonb := '{}'::jsonb;
  transfer_balances jsonb := '{}'::jsonb;
  participant_id text;
  payer_id text;
  from_id text;
  to_id text;
  total_amount numeric;
  payer_amount numeric;
  transfer_amount numeric;
  share_count integer;
  base_share numeric;
  remainder integer;
  next_balance numeric;
  floor_units numeric;
  units_to_distribute integer;
begin
  if pg_catalog.jsonb_typeof(p_state -> 'events') <> 'array' then
    return false;
  end if;
  if pg_catalog.jsonb_array_length(p_state -> 'events') = 0 then
    return true;
  end if;

  event_record := p_state -> 'events' -> 0;
  if pg_catalog.jsonb_array_length(
    coalesce(event_record -> 'transfers', '[]'::jsonb)
  ) = 0 then
    return true;
  end if;

  for participant_record in
    select item.value ->> 'id' as id, item.ordinality
    from pg_catalog.jsonb_array_elements(p_state -> 'participants')
      with ordinality as item(value, ordinality)
    where coalesce(event_record -> 'participantIds', '[]'::jsonb)
      ? (item.value ->> 'id')
    order by item.ordinality
  loop
    participant_balances := pg_catalog.jsonb_set(
      participant_balances, array[participant_record.id], '0'::jsonb, true
    );
    transfer_balances := pg_catalog.jsonb_set(
      transfer_balances, array[participant_record.id], '0'::jsonb, true
    );
  end loop;

  for expense_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(event_record -> 'expenses', '[]'::jsonb)
    ) as item(value)
  loop
    total_amount := (expense_record ->> 'total')::numeric;
    share_count := pg_catalog.jsonb_array_length(
      expense_record -> 'sharedByParticipantIds'
    );
    base_share := pg_catalog.floor(total_amount / share_count);
    remainder := (total_amount - (base_share * share_count))::integer;

    for shared_record in
      select item.value as id, item.ordinality
      from pg_catalog.jsonb_array_elements_text(
        expense_record -> 'sharedByParticipantIds'
      ) with ordinality as item(value, ordinality)
      order by item.ordinality
    loop
      participant_id := shared_record.id;
      next_balance := (participant_balances ->> participant_id)::numeric
        - base_share
        - case when shared_record.ordinality <= remainder then 1 else 0 end;
      participant_balances := pg_catalog.jsonb_set(
        participant_balances,
        array[participant_id],
        pg_catalog.to_jsonb(next_balance),
        true
      );
    end loop;

    for payer_record in
      select item.value
      from pg_catalog.jsonb_array_elements(expense_record -> 'payers') as item(value)
    loop
      payer_id := payer_record ->> 'participantId';
      payer_amount := (payer_record ->> 'amount')::numeric;
      next_balance := (participant_balances ->> payer_id)::numeric + payer_amount;
      participant_balances := pg_catalog.jsonb_set(
        participant_balances,
        array[payer_id],
        pg_catalog.to_jsonb(next_balance),
        true
      );
    end loop;
  end loop;

  if coalesce(event_record ->> 'roundSettlementTransfers', 'true') <> 'false' then
    select -pg_catalog.sum(
      pg_catalog.floor((participant_balances ->> participant.value)::numeric / 100)
    )::integer
    into units_to_distribute
    from pg_catalog.jsonb_array_elements_text(event_record -> 'participantIds')
      as participant(value);

    for participant_record in
      select
        item.value ->> 'id' as id,
        item.ordinality,
        pg_catalog.floor(
          (participant_balances ->> (item.value ->> 'id'))::numeric / 100
        ) as floor_units,
        (participant_balances ->> (item.value ->> 'id'))::numeric
          - pg_catalog.floor(
            (participant_balances ->> (item.value ->> 'id'))::numeric / 100
          ) * 100 as fractional_remainder
      from pg_catalog.jsonb_array_elements(p_state -> 'participants')
        with ordinality as item(value, ordinality)
      where coalesce(event_record -> 'participantIds', '[]'::jsonb)
        ? (item.value ->> 'id')
      order by fractional_remainder desc, item.ordinality
    loop
      floor_units := participant_record.floor_units;
      if units_to_distribute > 0 then
        floor_units := floor_units + 1;
        units_to_distribute := units_to_distribute - 1;
      end if;
      participant_balances := pg_catalog.jsonb_set(
        participant_balances,
        array[participant_record.id],
        pg_catalog.to_jsonb(floor_units * 100),
        true
      );
    end loop;
  end if;

  outstanding_balances := participant_balances;

  -- Completed transfers are immutable payment history. Apply them first so
  -- only the remaining, pending settlement must point from current debtors
  -- to current creditors. This also permits a legitimate later expense to
  -- reverse a route that had already been paid.
  for transfer_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(event_record -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'status' = 'paid'
  loop
    from_id := transfer_record ->> 'fromParticipantId';
    to_id := transfer_record ->> 'toParticipantId';
    transfer_amount := (transfer_record ->> 'amount')::numeric;
    outstanding_balances := pg_catalog.jsonb_set(
      outstanding_balances,
      array[from_id],
      pg_catalog.to_jsonb(
        (outstanding_balances ->> from_id)::numeric + transfer_amount
      ),
      true
    );
    outstanding_balances := pg_catalog.jsonb_set(
      outstanding_balances,
      array[to_id],
      pg_catalog.to_jsonb(
        (outstanding_balances ->> to_id)::numeric - transfer_amount
      ),
      true
    );
  end loop;

  for transfer_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(event_record -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'status' = 'pending'
  loop
    from_id := transfer_record ->> 'fromParticipantId';
    to_id := transfer_record ->> 'toParticipantId';
    transfer_amount := (transfer_record ->> 'amount')::numeric;
    if (outstanding_balances ->> from_id)::numeric >= 0
      or (outstanding_balances ->> to_id)::numeric <= 0 then
      return false;
    end if;
    transfer_balances := pg_catalog.jsonb_set(
      transfer_balances,
      array[from_id],
      pg_catalog.to_jsonb((transfer_balances ->> from_id)::numeric - transfer_amount),
      true
    );
    transfer_balances := pg_catalog.jsonb_set(
      transfer_balances,
      array[to_id],
      pg_catalog.to_jsonb((transfer_balances ->> to_id)::numeric + transfer_amount),
      true
    );
  end loop;

  for participant_record in
    select item.value ->> 'id' as id
    from pg_catalog.jsonb_array_elements(p_state -> 'participants') as item(value)
    where coalesce(event_record -> 'participantIds', '[]'::jsonb)
      ? (item.value ->> 'id')
  loop
    if (outstanding_balances ->> participant_record.id)::numeric
      <> (transfer_balances ->> participant_record.id)::numeric then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function private.has_authorized_transfer_status_changes(
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text
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

    transfer_record := null;
    select item.value into transfer_record
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;
    if transfer_record is null
      or transfer_record ->> 'status' is distinct from new_record ->> 'status' then
      return false;
    end if;
    if coalesce(p_actor_participant_id, '') = '' then
      return false;
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

    if (
        old_record ->> 'fromParticipantId'
          is distinct from new_record ->> 'fromParticipantId'
        or old_record ->> 'toParticipantId'
          is distinct from new_record ->> 'toParticipantId'
        or old_record -> 'amount' is distinct from new_record -> 'amount'
      ) then
      return false;
    end if;

    if old_record is not null
      and old_record ->> 'status' is not distinct from new_record ->> 'status'
      and old_record ->> 'markedPaidByParticipantId'
        is not distinct from new_record ->> 'markedPaidByParticipantId'
      and old_record ->> 'markedPaidAt'
        is not distinct from new_record ->> 'markedPaidAt'
      and old_record ->> 'statusUpdatedAt'
        is not distinct from new_record ->> 'statusUpdatedAt' then
      continue;
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

create or replace function private.guard_shared_event_financial_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  previous_state jsonb := case when tg_op = 'UPDATE' then old.state else new.state end;
  old_event jsonb := coalesce(previous_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
  old_record jsonb;
  new_record jsonb;
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
  end if;
  if not private.is_valid_shared_event_financials(new.state) then
    raise exception 'Shared event financial payload is invalid'
      using errcode = '22023';
  end if;
  if not private.has_valid_shared_event_transfer_totals(new.state) then
    raise exception 'Shared event transfers do not match its expenses'
      using errcode = '22023';
  end if;
  if not private.has_authorized_transfer_status_changes(
    previous_state,
    new.state,
    actor_participant_id
  ) then
    raise exception 'Shared event payment status attribution is invalid'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    for new_record in
      select item.value
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'expenses', '[]'::jsonb)
      ) as item(value)
    loop
      if new_record ->> 'createdByParticipantId'
          is distinct from actor_participant_id
        and private.is_account_linked_shared_participant(
          new.state,
          new_record ->> 'createdByParticipantId'
        ) then
        raise exception 'An account-linked expense must be attributed to the authenticated creator'
          using errcode = '42501';
      end if;
    end loop;
  elsif tg_op = 'UPDATE' then
    for new_record in
      select item.value
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'expenses', '[]'::jsonb)
      ) as item(value)
    loop
      old_record := null;
      select item.value into old_record
      from pg_catalog.jsonb_array_elements(
        coalesce(old_event -> 'expenses', '[]'::jsonb)
      ) as item(value)
      where item.value ->> 'id' = new_record ->> 'id'
      limit 1;
      if old_record is null then
        if coalesce(actor_participant_id, '') = ''
          or new_record ->> 'createdByParticipantId'
            is distinct from actor_participant_id then
          raise exception 'A new expense must be attributed to its authenticated creator'
            using errcode = '42501';
        end if;
      elsif old_record ->> 'createdByParticipantId'
        is distinct from new_record ->> 'createdByParticipantId' then
        raise exception 'Expense creator attribution is immutable'
          using errcode = '42501';
      end if;
    end loop;

    if actor_id is not null
      and private.is_active_shared_event_member(new.id, actor_id)
      and exists (
        select 1
        from private.shared_snapshot_members as other_member
        where other_member.snapshot_id = new.id
          and other_member.status = 'active'
          and other_member.user_id <> actor_id
      ) then
      insert into private.shared_event_qualification_activity (
        snapshot_id, event_id, actor_user_id, activity_kind, entity_id
      )
      select
        new.id,
        new_event ->> 'id',
        actor_id,
        'expense_created',
        expense.value ->> 'id'
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'expenses', '[]'::jsonb)
      ) as expense(value)
      where expense.value ->> 'createdByParticipantId' = actor_participant_id
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(old_event -> 'expenses', '[]'::jsonb)
          ) as old_expense(value)
          where old_expense.value ->> 'id' = expense.value ->> 'id'
        )
      on conflict (snapshot_id, activity_kind, entity_id) do nothing;

      insert into private.shared_event_qualification_activity (
        snapshot_id, event_id, actor_user_id, activity_kind, entity_id
      )
      select
        new.id,
        new_event ->> 'id',
        actor_id,
        'transfer_paid',
        status_update.value ->> 'id'
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
      ) as status_update(value)
      join pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'transfers', '[]'::jsonb)
      ) as current_transfer(value)
        on current_transfer.value ->> 'id' = status_update.value ->> 'id'
      join pg_catalog.jsonb_array_elements(
        coalesce(old_event -> 'transfers', '[]'::jsonb)
      ) as previous_transfer(value)
        on previous_transfer.value ->> 'id' = status_update.value ->> 'id'
      where status_update.value ->> 'status' = 'paid'
        and status_update.value ->> 'markedPaidByParticipantId' = actor_participant_id
        and current_transfer.value ->> 'status' = 'paid'
        and previous_transfer.value ->> 'fromParticipantId'
          is not distinct from current_transfer.value ->> 'fromParticipantId'
        and previous_transfer.value ->> 'toParticipantId'
          is not distinct from current_transfer.value ->> 'toParticipantId'
        and previous_transfer.value -> 'amount'
          is not distinct from current_transfer.value -> 'amount'
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(old_event -> 'transferStatusUpdates', '[]'::jsonb)
          ) as old_status(value)
          where old_status.value ->> 'id' = status_update.value ->> 'id'
            and old_status.value ->> 'status' = 'paid'
        )
      on conflict (snapshot_id, activity_kind, entity_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.is_account_linked_shared_participant(jsonb, text)
  from public, anon, authenticated;
revoke all on function private.is_valid_shared_event_financials(jsonb)
  from public, anon, authenticated;
revoke all on function private.has_valid_shared_event_transfer_totals(jsonb)
  from public, anon, authenticated;
revoke all on function private.has_authorized_transfer_status_changes(jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_financial_integrity()
  from public, anon, authenticated;

commit;
