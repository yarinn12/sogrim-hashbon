-- Direct reimbursement deliberately preserves who paid for whom. In that
-- mode a participant can be a net creditor overall and still owe another
-- participant inside their bilateral relationship. The aggregate balance
-- equality below remains mandatory for both modes.

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
    if coalesce(event_record ->> 'directSettlementTransfers', 'false') <> 'true'
      and (
        (outstanding_balances ->> from_id)::numeric >= 0
        or (outstanding_balances ->> to_id)::numeric <= 0
      ) then
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

revoke all on function private.has_valid_shared_event_transfer_totals(jsonb)
  from public, anon, authenticated;
