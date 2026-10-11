-- Read-only rollout check. Run against an authorized staging database before
-- considering production; this file never changes a row or a permission.
do $$
declare
  invalid_count bigint;
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'app_snapshots'
      and trigger.tgname = 'zzz_preserve_expense_fx_at_snapshot_boundary'
      and trigger.tgenabled = 'O'
  ) then
    raise exception 'Expense FX snapshot guard is missing or disabled';
  end if;

  select count(*) into invalid_count
  from public.app_snapshots as snapshot
  cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(snapshot.state -> 'events') = 'array'
      then snapshot.state -> 'events' else '[]'::jsonb end
  ) as event(value)
  cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(event.value -> 'expenses') = 'array'
      then event.value -> 'expenses' else '[]'::jsonb end
  ) as expense(value)
  where expense.value ? 'fxConversion'
    and ((expense.value -> 'fxConversion' ->> 'targetCurrency')
      is distinct from event.value ->> 'currency'
      or (expense.value -> 'fxConversion' ->> 'targetAmountMinorUnits')
        is distinct from expense.value ->> 'total'
      or expense.value ? 'fxConversionRemovedAt');
  if invalid_count > 0 then
    raise exception 'Rollout blocked: % converted expenses contradict their ledger', invalid_count;
  end if;
end;
$$;

select 'ready'::text as verification_status;
