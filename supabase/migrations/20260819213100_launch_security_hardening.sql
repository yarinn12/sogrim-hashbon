begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

alter table public.app_snapshots
  drop constraint if exists app_snapshots_state_size_check;
alter table public.app_snapshots
  add constraint app_snapshots_state_size_check
  check (pg_catalog.pg_column_size(state) <= 8388608) not valid;

-- Repair legacy account switching contamination without changing participants,
-- events, groups, or any financial history.
update public.app_snapshots as snapshot
set state = pg_catalog.jsonb_set(
  snapshot.state,
  '{currentParticipantId}',
  pg_catalog.to_jsonb('account-' || snapshot.owner_user_id::text),
  true
)
where snapshot.owner_user_id is not null
  and coalesce(snapshot.state ->> 'currentParticipantId', '')
    <> 'account-' || snapshot.owner_user_id::text
  and exists (
    select 1
    from pg_catalog.jsonb_array_elements(snapshot.state -> 'participants')
      as participant
    where participant ->> 'id' = 'account-' || snapshot.owner_user_id::text
  );

create or replace function private.guard_personal_snapshot_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  expected_participant_id text;
begin
  if new.owner_user_id is null then
    return new;
  end if;

  -- The signup claim trigger is the only trusted ownerless-to-owned transition.
  if tg_op = 'UPDATE'
    and old.owner_user_id is null
    and exists (
      select 1
      from private.signup_workspace_claims as claim
      where claim.snapshot_id = new.id
        and claim.access_key_hash = new.access_key_hash
    ) then
    return new;
  end if;

  if actor_id is null or actor_id <> new.owner_user_id then
    raise exception 'Personal workspace ownership is invalid'
      using errcode = '42501';
  end if;

  expected_participant_id := 'account-' || actor_id::text;
  if new.snapshot_kind <> 'workspace'
    or pg_catalog.jsonb_typeof(new.state) <> 'object'
    or pg_catalog.pg_column_size(new.state) > 8388608
    or coalesce(new.state ->> 'currentParticipantId', '') <> expected_participant_id then
    raise exception 'Personal workspace payload is invalid'
      using errcode = '22023';
  end if;

  if tg_op = 'INSERT' and exists (
    select 1
    from public.app_snapshots as existing
    where existing.owner_user_id = actor_id
      and existing.id <> new.id
  ) then
    raise exception 'A personal workspace already exists for this account'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_personal_snapshot_write on public.app_snapshots;
create trigger guard_personal_snapshot_write
  before insert or update of owner_user_id, snapshot_kind, state
  on public.app_snapshots
  for each row execute function private.guard_personal_snapshot_write();

revoke all on function private.guard_personal_snapshot_write()
  from public, anon, authenticated;

create or replace function private.is_active_shared_event_member(
  p_snapshot_id text,
  p_user_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_snapshots as snapshot
    join private.shared_snapshot_members as member
      on member.snapshot_id = snapshot.id
    where snapshot.id = p_snapshot_id
      and snapshot.owner_user_id is null
      and snapshot.snapshot_kind = 'shared_event'
      and member.user_id = p_user_id
      and member.participant_id = 'account-' || p_user_id::text
      and member.status = 'active'
  );
$$;

revoke all on function private.is_active_shared_event_member(text, uuid)
  from public, anon, authenticated;

create table if not exists private.shared_event_qualification_activity (
  snapshot_id text not null
    references public.app_snapshots(id) on delete cascade,
  event_id text not null check (char_length(event_id) between 1 and 160),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  activity_kind text not null
    check (activity_kind in ('expense_created', 'transfer_paid')),
  entity_id text not null check (entity_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (snapshot_id, activity_kind, entity_id)
);

create index if not exists shared_event_qualification_actor_idx
  on private.shared_event_qualification_activity (
    actor_user_id,
    snapshot_id,
    recorded_at
  );

alter table private.shared_event_qualification_activity enable row level security;
alter table private.shared_event_qualification_activity force row level security;
revoke all on table private.shared_event_qualification_activity
  from public, anon, authenticated;

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
  -- Empty transfers mean "calculate from expenses on read" in the current client.
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
      participant_balances,
      array[participant_record.id],
      '0'::jsonb,
      true
    );
    transfer_balances := pg_catalog.jsonb_set(
      transfer_balances,
      array[participant_record.id],
      '0'::jsonb,
      true
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

  for transfer_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(event_record -> 'transfers', '[]'::jsonb)
    ) as item(value)
  loop
    from_id := transfer_record ->> 'fromParticipantId';
    to_id := transfer_record ->> 'toParticipantId';
    transfer_amount := (transfer_record ->> 'amount')::numeric;
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
    if (participant_balances ->> participant_record.id)::numeric
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

    if coalesce(new_record ->> 'status', '') = 'pending'
      and old_record is null then
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
  previous_state jsonb := case when tg_op = 'UPDATE' then old.state else '{}'::jsonb end;
  old_event jsonb := coalesce(previous_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
  old_record jsonb;
  new_record jsonb;
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
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

  if tg_op = 'UPDATE' then
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
      where status_update.value ->> 'status' = 'paid'
        and status_update.value ->> 'markedPaidByParticipantId' = actor_participant_id
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

drop trigger if exists guard_shared_event_financial_integrity
  on public.app_snapshots;
create trigger guard_shared_event_financial_integrity
  before insert or update of state, owner_user_id, snapshot_kind
  on public.app_snapshots
  for each row execute function private.guard_shared_event_financial_integrity();

revoke all on function private.has_valid_shared_event_transfer_totals(jsonb)
  from public, anon, authenticated;
revoke all on function private.has_authorized_transfer_status_changes(jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_financial_integrity()
  from public, anon, authenticated;

create or replace function public.request_friendship_from_event(
  p_shared_space_id text,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_space_id text := pg_catalog.btrim(p_shared_space_id);
  friend_code text;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_target_user_id is null or p_target_user_id = actor_id then
    raise exception 'Friend account is invalid' using errcode = '22023';
  end if;
  if normalized_space_id !~ '^[a-zA-Z0-9_-]{3,80}$'
    or normalized_space_id = 'default' then
    raise exception 'Shared event is invalid' using errcode = '22023';
  end if;

  if not private.is_active_shared_event_member(normalized_space_id, actor_id)
    or not private.is_active_shared_event_member(
      normalized_space_id,
      p_target_user_id
    ) then
    raise exception 'Both accounts must be active participants in the shared event'
      using errcode = '42501';
  end if;

  select invite.code into friend_code
  from public.friend_invite_codes as invite
  where invite.user_id = p_target_user_id;

  if friend_code is null then
    raise exception 'Friend account was not found' using errcode = 'P0001';
  end if;

  return public.request_friendship(friend_code);
end;
$$;

create or replace function public.submit_user_report(
  p_shared_space_id text,
  p_target_user_id uuid,
  p_category text,
  p_details text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_space_id text := pg_catalog.btrim(p_shared_space_id);
  normalized_category text := pg_catalog.lower(pg_catalog.btrim(p_category));
  normalized_details text := pg_catalog.btrim(coalesce(p_details, ''));
  report_record public.content_reports%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_target_user_id is null or p_target_user_id = actor_id then
    raise exception 'Reported account is invalid' using errcode = '22023';
  end if;
  if normalized_space_id !~ '^[a-zA-Z0-9_-]{3,80}$'
    or normalized_space_id = 'default' then
    raise exception 'Shared event is invalid' using errcode = '22023';
  end if;
  if normalized_category not in (
    'harassment',
    'impersonation',
    'offensive_content',
    'spam',
    'other'
  ) then
    raise exception 'Report category is invalid' using errcode = '22023';
  end if;
  if pg_catalog.length(normalized_details) > 1000 then
    raise exception 'Report details are too long' using errcode = '22023';
  end if;

  if not private.is_active_shared_event_member(normalized_space_id, actor_id)
    or not private.is_active_shared_event_member(
      normalized_space_id,
      p_target_user_id
    ) then
    raise exception 'Both accounts must be active participants in the shared event'
      using errcode = '42501';
  end if;

  insert into public.content_reports (
    reporter_user_id,
    reported_user_id,
    shared_space_id,
    category,
    details
  ) values (
    actor_id,
    p_target_user_id,
    normalized_space_id,
    normalized_category,
    normalized_details
  )
  on conflict (
    reporter_user_id,
    reported_user_id,
    shared_space_id
  ) where status in ('new', 'reviewing')
  do update set
    category = excluded.category,
    details = excluded.details,
    updated_at = pg_catalog.now()
  returning * into report_record;

  return pg_catalog.jsonb_build_object(
    'id', report_record.id,
    'status', report_record.status
  );
end;
$$;

revoke all on function public.request_friendship_from_event(text, uuid)
  from public, anon;
grant execute on function public.request_friendship_from_event(text, uuid)
  to authenticated, service_role;
revoke all on function public.submit_user_report(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_user_report(text, uuid, text, text)
  to authenticated, service_role;

create or replace function public.qualify_referral(
  p_event_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_event_id text := pg_catalog.btrim(p_event_id);
  referral public.referrals%rowtype;
  account_created_at timestamptz;
  account_email_confirmed_at timestamptz;
  account_is_anonymous boolean := false;
  activity_found boolean := false;
  rewarded_last_year integer := 0;
  reward_start timestamptz;
  reward_end timestamptz;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if normalized_event_id !~ '^[A-Za-z0-9_-]{3,80}$'
    or normalized_event_id = 'default' then
    raise exception 'Event id is invalid' using errcode = '22023';
  end if;

  select existing.* into referral
  from public.referrals as existing
  where existing.invited_user_id = actor_id
  for update;

  if referral.id is null then
    return pg_catalog.jsonb_build_object('status', 'not_claimed');
  end if;
  if referral.status in ('rewarded', 'rejected') then
    return pg_catalog.jsonb_build_object('id', referral.id, 'status', referral.status);
  end if;

  if referral.claimed_at < pg_catalog.now() - interval '30 days' then
    update public.referrals
    set status = 'rejected',
        rejection_reason = 'qualification_window_expired',
        updated_at = pg_catalog.now()
    where id = referral.id;
    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', 'rejected',
      'reason', 'qualification_window_expired'
    );
  end if;

  select
    account.created_at,
    account.email_confirmed_at,
    coalesce(account.is_anonymous, false)
  into account_created_at, account_email_confirmed_at, account_is_anonymous
  from auth.users as account
  where account.id = actor_id;

  if account_created_at is null
    or referral.claimed_at > account_created_at + interval '1 hour'
    or account_is_anonymous then
    update public.referrals
    set status = 'rejected',
        rejection_reason = 'existing_account',
        updated_at = pg_catalog.now()
    where id = referral.id;
    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', 'rejected',
      'reason', 'existing_account'
    );
  end if;

  if account_email_confirmed_at is null then
    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', 'pending',
      'reason', 'email_not_confirmed'
    );
  end if;

  select exists (
    select 1
    from private.shared_event_qualification_activity as activity
    where activity.snapshot_id = normalized_event_id
      and activity.actor_user_id = actor_id
      and activity.recorded_at >= referral.claimed_at
      and activity.recorded_at <= referral.claimed_at + interval '30 days'
  ) into activity_found;
  if not activity_found then
    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', 'pending',
      'reason', 'qualifying_activity_not_found'
    );
  end if;

  perform 1
  from public.friend_invite_codes as invite
  where invite.user_id = referral.inviter_user_id
  for update;

  select pg_catalog.count(*)::integer into rewarded_last_year
  from public.referrals as rewarded
  where rewarded.inviter_user_id = referral.inviter_user_id
    and rewarded.status = 'rewarded'
    and rewarded.rewarded_at >= pg_catalog.now() - interval '365 days';

  if rewarded_last_year >= 12 then
    update public.referrals
    set status = 'rejected',
        qualification_event_id = normalized_event_id,
        qualified_at = pg_catalog.now(),
        rejection_reason = 'annual_reward_limit',
        updated_at = pg_catalog.now()
    where id = referral.id;
    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', 'rejected',
      'reason', 'annual_reward_limit'
    );
  end if;

  select greatest(
    pg_catalog.now(),
    coalesce(pg_catalog.max(entitlement.expires_at), pg_catalog.now())
  ) into reward_start
  from public.user_entitlements as entitlement
  where entitlement.user_id = referral.inviter_user_id
    and entitlement.entitlement_key = 'ad_free';

  reward_end := reward_start + pg_catalog.make_interval(days => referral.reward_days);
  insert into public.user_entitlements (
    user_id,
    entitlement_key,
    source,
    source_reference,
    starts_at,
    expires_at
  ) values (
    referral.inviter_user_id,
    'ad_free',
    'referral',
    referral.id::text,
    reward_start,
    reward_end
  )
  on conflict (user_id, entitlement_key, source, source_reference) do nothing;

  update public.referrals
  set status = 'rewarded',
      qualification_event_id = normalized_event_id,
      qualified_at = pg_catalog.now(),
      rewarded_at = pg_catalog.now(),
      rejection_reason = null,
      updated_at = pg_catalog.now()
  where id = referral.id;

  return pg_catalog.jsonb_build_object(
    'id', referral.id,
    'status', 'rewarded',
    'reward_days', referral.reward_days,
    'ad_free_until', reward_end
  );
end;
$$;

revoke all on function public.qualify_referral(text) from public, anon;
grant execute on function public.qualify_referral(text)
  to authenticated, service_role;

commit;
