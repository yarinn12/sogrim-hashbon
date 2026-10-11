begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Clients predating fxConversion can replace an expense while changing only
-- its name. Normalize the final JSONB row at the common table boundary used
-- by both the personal PATCH and the shared-event RPC. No write privilege or
-- RLS policy changes are needed.
create or replace function private.fx_expense_payer_ledger(p_expense jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(payer.value ->> 'participantId', payer.value -> 'amount')
    order by payer.value ->> 'participantId', payer.value ->> 'amount'
  ), '[]'::jsonb)
  from pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(p_expense -> 'payers') = 'array'
      then p_expense -> 'payers' else '[]'::jsonb end
  ) as payer(value);
$$;

create or replace function private.reconcile_expense_fx_event(
  p_old_event jsonb, p_new_event jsonb, p_canonical_event jsonb default null
)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  source_event jsonb;
  old_expense jsonb;
  canonical_expense jsonb;
  source_expense jsonb;
  candidate jsonb;
  next_expenses jsonb := '[]'::jsonb;
  old_fx jsonb;
  old_removal text;
  candidate_removal text;
begin
  if pg_catalog.jsonb_typeof(p_new_event -> 'expenses') <> 'array' then
    return p_new_event;
  end if;

  for candidate in
    select value from pg_catalog.jsonb_array_elements(p_new_event -> 'expenses')
  loop
    old_expense := null;
    canonical_expense := null;
    if p_old_event ->> 'id' = p_new_event ->> 'id'
      and pg_catalog.jsonb_typeof(p_old_event -> 'expenses') = 'array' then
      select value into old_expense
      from pg_catalog.jsonb_array_elements(p_old_event -> 'expenses')
      where value ->> 'id' = candidate ->> 'id' limit 1;
    end if;
    if p_canonical_event ->> 'id' = p_new_event ->> 'id'
      and pg_catalog.jsonb_typeof(p_canonical_event -> 'expenses') = 'array' then
      select value into canonical_expense
      from pg_catalog.jsonb_array_elements(p_canonical_event -> 'expenses')
      where value ->> 'id' = candidate ->> 'id' limit 1;
    end if;

    -- The shared snapshot is authoritative for a connected event. A local
    -- workspace record still protects an unshared or not-yet-published edit.
    if canonical_expense ? 'fxConversion' or canonical_expense ? 'fxConversionRemovedAt' then
      source_expense := canonical_expense;
      source_event := p_canonical_event;
    else
      source_expense := old_expense;
      source_event := p_old_event;
    end if;
    old_fx := source_expense -> 'fxConversion';
    old_removal := source_expense ->> 'fxConversionRemovedAt';
    candidate_removal := candidate ->> 'fxConversionRemovedAt';

    if old_fx is not null then
      if source_event ->> 'currency' is distinct from p_new_event ->> 'currency' then
        raise exception 'Converted event currency changed while an FX expense exists'
          using errcode = 'PFX01';
      end if;
      if candidate -> 'fxConversion' is null then
        if candidate_removal is not null then
          if candidate_removal is distinct from candidate ->> 'updatedAt' then
            raise exception 'FX removal marker is not the expense edit timestamp'
              using errcode = 'PFX01';
          end if;
        elsif source_expense -> 'total' is not distinct from candidate -> 'total'
          and private.fx_expense_payer_ledger(source_expense)
            is not distinct from private.fx_expense_payer_ledger(candidate) then
          candidate := candidate || pg_catalog.jsonb_build_object('fxConversion', old_fx);
        else
          raise exception 'Converted expense ledger changed without a new conversion or explicit removal'
            using errcode = 'PFX01';
        end if;
      elsif candidate_removal is not null then
        raise exception 'Expense cannot contain FX conversion and removal marker together'
          using errcode = 'PFX01';
      end if;
    elsif old_removal is not null then
      if candidate -> 'fxConversion' is not null then
        if candidate ->> 'fxConversionRestoredAt' is distinct from candidate ->> 'updatedAt'
          or candidate ->> 'fxConversionRestoredAt' = old_removal
          or candidate_removal is not null then
          raise exception 'Previously removed FX conversion cannot be restored by a stale expense'
            using errcode = 'PFX01';
        end if;
      else
        candidate := candidate || pg_catalog.jsonb_build_object(
          'fxConversionRemovedAt', old_removal
        );
      end if;
    end if;

    if candidate -> 'fxConversion' is not null
      and ((candidate -> 'fxConversion' ->> 'targetCurrency')
        is distinct from p_new_event ->> 'currency'
      or (candidate -> 'fxConversion' ->> 'targetAmountMinorUnits')
        is distinct from candidate ->> 'total') then
      raise exception 'FX conversion does not match the event ledger'
        using errcode = 'PFX01';
    end if;
    next_expenses := next_expenses || pg_catalog.jsonb_build_array(candidate);
  end loop;
  return pg_catalog.jsonb_set(p_new_event, '{expenses}', next_expenses, false);
end;
$$;

create or replace function private.preserve_expense_fx_at_snapshot_boundary()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  candidate_event jsonb;
  prior_event jsonb;
  canonical_event jsonb;
  next_events jsonb := '[]'::jsonb;
begin
  if new.snapshot_kind not in ('workspace', 'shared_event')
    or pg_catalog.jsonb_typeof(new.state -> 'events') <> 'array' then
    return new;
  end if;
  for candidate_event in
    select value from pg_catalog.jsonb_array_elements(new.state -> 'events')
  loop
    prior_event := null;
    canonical_event := null;
    if tg_op = 'UPDATE' and pg_catalog.jsonb_typeof(old.state -> 'events') = 'array' then
      select value into prior_event
      from pg_catalog.jsonb_array_elements(old.state -> 'events')
      where value ->> 'id' = candidate_event ->> 'id' limit 1;
    end if;
    if new.snapshot_kind = 'workspace' and new.owner_user_id = auth.uid()
      and coalesce(candidate_event ->> 'sharedSpaceId', '') <> '' then
      select shared.state -> 'events' -> 0 into canonical_event
      from public.app_snapshots as shared
      join private.shared_snapshot_members as member
        on member.snapshot_id = shared.id
       and member.user_id = new.owner_user_id
       and member.status = 'active'
       and member.removed_at is null
      where shared.id = candidate_event ->> 'sharedSpaceId'
        and shared.snapshot_kind = 'shared_event'
        and shared.state -> 'events' -> 0 ->> 'id' = candidate_event ->> 'id'
        and coalesce(shared.state -> 'events' -> 0 -> 'participantIds', '[]'::jsonb)
          ? member.participant_id
        and not coalesce(shared.state -> 'events' -> 0 -> 'inactiveParticipantIds', '[]'::jsonb)
          ? member.participant_id
      limit 1;
    end if;
    next_events := next_events || pg_catalog.jsonb_build_array(
      private.reconcile_expense_fx_event(prior_event, candidate_event, canonical_event)
    );
  end loop;
  new.state := pg_catalog.jsonb_set(new.state, '{events}', next_events, false);
  return new;
end;
$$;

-- Run after existing validation and note projection, so the final JSONB row is
-- protected even when an older client bypasses modern JavaScript merge code.
drop trigger if exists zzz_preserve_expense_fx_at_snapshot_boundary on public.app_snapshots;
create trigger zzz_preserve_expense_fx_at_snapshot_boundary
  before insert or update of state on public.app_snapshots
  for each row execute function private.preserve_expense_fx_at_snapshot_boundary();

revoke all on function private.fx_expense_payer_ledger(jsonb) from public, anon, authenticated;
revoke all on function private.reconcile_expense_fx_event(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.preserve_expense_fx_at_snapshot_boundary()
  from public, anon, authenticated;
commit;
