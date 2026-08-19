do $$
declare
  trigger_count integer;
  function_definition text;
begin
  if to_regprocedure('private.prevent_locked_event_expense_updates()') is null then
    raise exception 'Locked-event expense guard is missing';
  end if;

  select count(*)
  into trigger_count
  from pg_catalog.pg_trigger as trigger
  join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'app_snapshots'
    and trigger.tgname = 'prevent_locked_event_expense_updates'
    and not trigger.tgisinternal;

  if trigger_count <> 1 then
    raise exception 'Locked-event expense trigger is missing or duplicated';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private.prevent_locked_event_expense_updates()'::regprocedure
  ) into function_definition;

  if pg_catalog.strpos(function_definition, 'old_event ->> ''locked''') = 0
    or pg_catalog.strpos(function_definition, 'old_event -> ''expenses''') = 0
    or pg_catalog.strpos(function_definition, 'old_event -> ''deletedExpenses''') = 0 then
    raise exception 'Locked-event expense guard is incomplete';
  end if;
end;
$$;

select 'ready' as verification_status;
