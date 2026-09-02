do $$
begin
  if to_regprocedure('private.guard_closed_shared_event_integrity()') is null then
    raise exception 'Closed shared-event integrity guard is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'guard_closed_shared_event_integrity'
      and tgrelid = 'public.app_snapshots'::regclass
      and not tgisinternal
  ) then
    raise exception 'Closed shared-event integrity trigger is missing';
  end if;
end;
$$;
