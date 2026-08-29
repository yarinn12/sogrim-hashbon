do $$
begin
  if pg_catalog.to_regprocedure(
    'public.reconcile_shared_event_indexes_for_member(uuid)'
  ) is null then
    raise exception 'Shared event member index reconciliation RPC is missing';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    where trigger.tgname = 'zz_reconcile_shared_snapshot_member_workspaces'
      and trigger.tgrelid = 'public.app_snapshots'::pg_catalog.regclass
      and not trigger.tgisinternal
  ) then
    raise exception 'Atomic shared event member index trigger is missing';
  end if;
  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.reconcile_shared_event_indexes_for_member(uuid)',
    'execute'
  ) then
    raise exception 'Authenticated users must not execute index reconciliation';
  end if;
  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.reconcile_shared_event_indexes_for_member(uuid)',
    'execute'
  ) then
    raise exception 'Service role must execute index reconciliation';
  end if;
end;
$$;
