begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.authorized_shared_event_account_link(
  p_snapshot_id text,
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  old_event jsonb := coalesce(p_old_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(p_new_state -> 'events' -> 0, '{}'::jsonb);
  link_record jsonb;
  link_count integer := 0;
  source_id text;
  target_id text;
  old_active_ids text[] := private.active_event_participant_ids(p_old_state);
  new_active_ids text[] := private.active_event_participant_ids(p_new_state);
begin
  if coalesce(p_snapshot_id, '') = ''
    or coalesce(p_actor_participant_id, '') = ''
    or coalesce(old_event ->> 'id', '') = ''
    or old_event ->> 'id' is distinct from new_event ->> 'id'
    or pg_catalog.jsonb_typeof(coalesce(new_event -> 'participantAccountLinks', '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(old_event -> 'participantAccountLinks', '[]'::jsonb)) <> 'array' then
    return null;
  end if;

  select count(*), min(candidate.value::text)::jsonb
  into link_count, link_record
  from pg_catalog.jsonb_array_elements(
    coalesce(new_event -> 'participantAccountLinks', '[]'::jsonb)
  ) as candidate(value)
  where candidate.value ->> 'linkedByParticipantId' = p_actor_participant_id
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(old_event -> 'participantAccountLinks', '[]'::jsonb)
      ) as previous(value)
      where previous.value ->> 'sourceParticipantId'
          = candidate.value ->> 'sourceParticipantId'
        and previous.value ->> 'targetParticipantId'
          = candidate.value ->> 'targetParticipantId'
    );
  if link_count <> 1
    or pg_catalog.jsonb_typeof(link_record) <> 'object'
    or link_record - array[
      'sourceParticipantId',
      'targetParticipantId',
      'linkedByParticipantId',
      'linkedAt'
    ] <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(link_record -> 'linkedAt') <> 'string' then
    return null;
  end if;

  source_id := link_record ->> 'sourceParticipantId';
  target_id := link_record ->> 'targetParticipantId';
  perform (link_record ->> 'linkedAt')::timestamptz;
  if coalesce(source_id, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    or coalesce(target_id, '') !~ '^account-[0-9a-fA-F-]{36}$'
    or source_id = target_id
    or not (source_id = any(old_active_ids))
    or not (target_id = any(old_active_ids))
    or source_id = any(new_active_ids)
    or not (target_id = any(new_active_ids))
    or 1 <> (
      select count(*)
      from pg_catalog.unnest(old_active_ids) as old_id(value)
      where not (old_id.value = any(new_active_ids))
    )
    or 0 <> (
      select count(*)
      from pg_catalog.unnest(new_active_ids) as new_id(value)
      where not (new_id.value = any(old_active_ids))
    ) then
    return null;
  end if;

  if not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_old_state -> 'participants') as participant(value)
      where participant.value ->> 'id' = source_id
        and source_id not like 'account-%'
        and not (participant.value @> '{"accountLinked": true}'::jsonb)
    )
    or not private.is_account_linked_shared_participant(p_old_state, target_id)
    or not exists (
      select 1
      from private.shared_snapshot_members as actor_member
      where actor_member.snapshot_id = p_snapshot_id
        and actor_member.participant_id = p_actor_participant_id
        and actor_member.status = 'active'
        and actor_member.role = 'admin'
    )
    or not exists (
      select 1
      from private.shared_snapshot_members as target_member
      where target_member.snapshot_id = p_snapshot_id
        and target_member.participant_id = target_id
        and target_member.status = 'active'
    ) then
    return null;
  end if;

  return link_record;
exception
  when others then
    return null;
end;
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
  account_link jsonb := case when tg_op = 'UPDATE' then
    private.authorized_shared_event_account_link(
      new.id,
      previous_state,
      new.state,
      actor_participant_id
    )
  else null end;
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
    actor_participant_id,
    new.id
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
        is distinct from new_record ->> 'createdByParticipantId'
        and not (
          account_link is not null
          and old_record ->> 'createdByParticipantId'
            = account_link ->> 'sourceParticipantId'
          and new_record ->> 'createdByParticipantId'
            = account_link ->> 'targetParticipantId'
        ) then
        raise exception 'Expense creator attribution is immutable'
          using errcode = '42501';
      end if;
    end loop;

    if pg_catalog.to_regclass('private.shared_event_activity_notifications') is not null
      and actor_id is not null
      and private.is_active_shared_event_member(new.id, actor_id)
      and exists (
        select 1
        from private.shared_snapshot_members as other_member
        where other_member.snapshot_id = new.id
          and other_member.status = 'active'
          and other_member.user_id <> actor_id
      ) then
      insert into private.shared_event_activity_notifications (
        snapshot_id,
        event_id,
        actor_user_id,
        activity_kind,
        entity_id
      )
      select
        new.id,
        new_event ->> 'id',
        actor_id,
        'expense_added',
        new_record ->> 'id'
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'expenses', '[]'::jsonb)
      ) as new_record(value)
      where not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(old_event -> 'expenses', '[]'::jsonb)
        ) as old_record(value)
        where old_record.value ->> 'id' = new_record.value ->> 'id'
      )
      on conflict (snapshot_id, activity_kind, entity_id) do nothing;

      insert into private.shared_event_activity_notifications (
        snapshot_id,
        event_id,
        actor_user_id,
        activity_kind,
        entity_id
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

create or replace function private.revoke_event_invites_after_member_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_active_ids text[];
  new_active_ids text[];
  removed_event_id text;
begin
  if new.snapshot_kind <> 'shared_event'
    or old.state -> 'events' -> 0 is null
    or new.state -> 'events' -> 0 is null then
    return new;
  end if;

  old_active_ids := private.active_event_participant_ids(old.state);
  new_active_ids := private.active_event_participant_ids(new.state);
  if not exists (
    select 1
    from pg_catalog.unnest(old_active_ids) as old_id(value)
    where not (old_id.value = any(new_active_ids))
  ) then
    return new;
  end if;

  if private.authorized_shared_event_account_link(
    new.id,
    old.state,
    new.state,
    private.current_actor_participant_id()
  ) is not null then
    return new;
  end if;

  removed_event_id := new.state -> 'events' -> 0 ->> 'id';
  update public.event_invite_tokens as invite
  set
    revoked_at = coalesce(revoked_at, pg_catalog.clock_timestamp()),
    updated_at = pg_catalog.clock_timestamp()
  where invite.event_id = removed_event_id
    and invite.revoked_at is null;
  return new;
end;
$$;

create or replace function private.has_preserved_paid_history_for_account_link(
  p_old_state jsonb,
  p_new_state jsonb,
  p_account_link jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  old_event jsonb := coalesce(p_old_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(p_new_state -> 'events' -> 0, '{}'::jsonb);
  old_record jsonb;
  new_record jsonb;
  link_source text := p_account_link ->> 'sourceParticipantId';
  link_target text := p_account_link ->> 'targetParticipantId';
begin
  if p_account_link is null then
    return false;
  end if;

  for old_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(old_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'status' = 'paid'
  loop
    new_record := null;
    select item.value into new_record
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = old_record ->> 'id'
    limit 1;
    if new_record is null
      or new_record ->> 'fromParticipantId' is distinct from (
        case when old_record ->> 'fromParticipantId' = link_source
          then link_target else old_record ->> 'fromParticipantId' end
      )
      or new_record ->> 'toParticipantId' is distinct from (
        case when old_record ->> 'toParticipantId' = link_source
          then link_target else old_record ->> 'toParticipantId' end
      )
      or new_record ->> 'markedPaidByParticipantId' is distinct from (
        case when old_record ->> 'markedPaidByParticipantId' = link_source
          then link_target else old_record ->> 'markedPaidByParticipantId' end
      )
      or new_record - array[
        'fromParticipantId',
        'toParticipantId',
        'markedPaidByParticipantId',
        'updatedAt'
      ] <> old_record - array[
        'fromParticipantId',
        'toParticipantId',
        'markedPaidByParticipantId',
        'updatedAt'
      ]
      or not (
        new_record ->> 'updatedAt' is not distinct from old_record ->> 'updatedAt'
        or new_record ->> 'updatedAt' = p_account_link ->> 'linkedAt'
      ) then
      return false;
    end if;
  end loop;

  for old_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(old_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'status' = 'paid'
  loop
    new_record := null;
    select item.value into new_record
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = old_record ->> 'id'
    limit 1;
    if new_record is null
      or new_record - 'markedPaidByParticipantId'
        <> old_record - 'markedPaidByParticipantId'
      or new_record ->> 'markedPaidByParticipantId' is distinct from (
        case when old_record ->> 'markedPaidByParticipantId' = link_source
          then link_target else old_record ->> 'markedPaidByParticipantId' end
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

create or replace function private.guard_shared_event_history_and_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
  account_link jsonb := case when tg_op = 'UPDATE' then
    private.authorized_shared_event_account_link(
      new.id,
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
  else null end;
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) > 500
    or pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) > 500 then
    raise exception 'Shared event transfer history is too large'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and not private.has_preserved_paid_transfer_history(old.state, new.state)
    and not private.has_preserved_paid_history_for_account_link(
      old.state,
      new.state,
      account_link
    ) then
    raise exception 'Completed payment history cannot be removed or rewritten'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.authorized_shared_event_account_link(text, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function private.has_authorized_transfer_status_changes(jsonb, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_financial_integrity()
  from public, anon, authenticated;
revoke all on function private.revoke_event_invites_after_member_removal()
  from public, anon, authenticated;
revoke all on function private.has_preserved_paid_history_for_account_link(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_history_and_limits()
  from public, anon, authenticated;

commit;
