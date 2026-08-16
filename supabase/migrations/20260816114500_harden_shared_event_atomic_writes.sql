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
    or pg_catalog.jsonb_typeof(coalesce(event_record -> 'deletedExpenses', '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'expenses', '[]'::jsonb)) > 5000
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'transfers', '[]'::jsonb)) > 10000
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

create or replace function public.update_shared_event_snapshot(
  p_snapshot_id text,
  p_space_key text,
  p_expected_updated_at timestamptz,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot public.app_snapshots%rowtype;
  expected_hash text;
  next_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if coalesce(p_snapshot_id, '') !~ '^[A-Za-z0-9_-]{3,80}$'
    or char_length(coalesce(p_space_key, '')) not between 24 and 256
    or p_expected_updated_at is null
    or not private.is_valid_shared_event_financials(p_state) then
    raise exception 'Shared event update payload is invalid' using errcode = '22023';
  end if;

  expected_hash := pg_catalog.encode(extensions.digest(p_space_key, 'sha256'), 'hex');
  select record.* into snapshot
  from public.app_snapshots as record
  where record.id = p_snapshot_id
  for update;

  if snapshot.id is null
    or snapshot.owner_user_id is not null
    or snapshot.snapshot_kind <> 'shared_event'
    or snapshot.access_key_hash <> expected_hash
    or not public.can_write_shared_snapshot(p_snapshot_id) then
    raise exception 'Shared event update is not authorized' using errcode = '42501';
  end if;
  if snapshot.updated_at is distinct from p_expected_updated_at then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'updatedAt', snapshot.updated_at
    );
  end if;

  next_updated_at := pg_catalog.clock_timestamp();
  update public.app_snapshots
  set state = p_state,
      updated_at = next_updated_at
  where id = p_snapshot_id;

  return pg_catalog.jsonb_build_object(
    'status', 'updated',
    'updatedAt', next_updated_at
  );
end;
$$;

revoke all on function private.is_valid_shared_event_financials(jsonb)
  from public, anon, authenticated;
revoke all on function public.update_shared_event_snapshot(text, text, timestamptz, jsonb)
  from public, anon;
grant execute on function public.update_shared_event_snapshot(text, text, timestamptz, jsonb)
  to authenticated, service_role;
revoke execute on function public.can_bootstrap_shared_snapshot(text)
  from authenticated;

drop policy if exists app_snapshots_insert on public.app_snapshots;
create policy app_snapshots_insert
  on public.app_snapshots
  for insert
  to authenticated
  with check (
    access_key_hash = (select public.request_space_key_hash())
    and (
      owner_user_id = (select auth.uid())
      or (
        owner_user_id is null
        and snapshot_kind = 'workspace'
      )
    )
  );

drop policy if exists app_snapshots_update on public.app_snapshots;
create policy app_snapshots_update
  on public.app_snapshots
  for update
  to authenticated
  using (
    owner_user_id is null
    and snapshot_kind = 'workspace'
    and access_key_hash = (select public.request_space_key_hash())
  )
  with check (
    owner_user_id is null
    and snapshot_kind = 'workspace'
    and access_key_hash = (select public.request_space_key_hash())
  );

create or replace function public.create_shared_event_snapshot(
  p_snapshot_id text,
  p_space_key text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  event_record jsonb := p_state -> 'events' -> 0;
  existing_snapshot public.app_snapshots%rowtype;
  existing_member private.shared_snapshot_members%rowtype;
  expected_hash text;
begin
  if actor_id is null or actor_participant_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if coalesce(p_snapshot_id, '') !~ '^[A-Za-z0-9_-]{3,80}$'
    or char_length(coalesce(p_space_key, '')) not between 24 and 256
    or not private.is_valid_shared_event_financials(p_state)
    or event_record is null then
    raise exception 'Shared event creation payload is invalid' using errcode = '22023';
  end if;
  if not (
    actor_participant_id = any(private.active_event_participant_ids(p_state))
    and actor_participant_id = any(private.event_admin_ids(p_state))
    and event_record ->> 'createdByParticipantId' = actor_participant_id
  ) then
    raise exception 'Only the authenticated event creator can create this event'
      using errcode = '42501';
  end if;

  expected_hash := pg_catalog.encode(extensions.digest(p_space_key, 'sha256'), 'hex');
  select record.* into existing_snapshot
  from public.app_snapshots as record
  where record.id = p_snapshot_id
  for update;

  if existing_snapshot.id is not null then
    select member.* into existing_member
    from private.shared_snapshot_members as member
    where member.snapshot_id = p_snapshot_id
      and member.user_id = actor_id
    for update;
    if existing_snapshot.snapshot_kind <> 'shared_event'
      or existing_snapshot.access_key_hash <> expected_hash
      or existing_snapshot.state -> 'events' -> 0 ->> 'id' is distinct from event_record ->> 'id'
      or existing_member.user_id is null
      or existing_member.status <> 'active'
      or existing_member.participant_id <> actor_participant_id then
      raise exception 'Shared event identifier is already in use' using errcode = '42501';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'existing',
      'snapshotId', existing_snapshot.id,
      'updatedAt', existing_snapshot.updated_at
    );
  end if;

  insert into public.app_snapshots (
    id, access_key_hash, owner_user_id, snapshot_kind, state, updated_at
  ) values (
    p_snapshot_id, expected_hash, null, 'shared_event', p_state, pg_catalog.now()
  );
  return pg_catalog.jsonb_build_object('status', 'created', 'snapshotId', p_snapshot_id);
end;
$$;

revoke all on function public.create_shared_event_snapshot(text, text, jsonb)
  from public, anon;
grant execute on function public.create_shared_event_snapshot(text, text, jsonb)
  to authenticated, service_role;

commit;
