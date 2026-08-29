do $$
begin
  if to_regclass('public.broadcast_notification_deliveries') is null then
    raise exception 'broadcast_notification_deliveries table is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.broadcast_notification_deliveries'::regclass
      and contype = 'p'
  ) then
    raise exception 'broadcast_notification_deliveries primary key is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class
    where oid = 'public.broadcast_notification_deliveries'::regclass
      and relrowsecurity
      and relforcerowsecurity
  ) then
    raise exception 'broadcast_notification_deliveries RLS is not forced';
  end if;

  if has_table_privilege('anon', 'public.broadcast_notification_deliveries', 'select')
     or has_table_privilege('authenticated', 'public.broadcast_notification_deliveries', 'select') then
    raise exception 'broadcast_notification_deliveries is readable by an app role';
  end if;

  if not has_table_privilege('service_role', 'public.broadcast_notification_deliveries', 'select,insert,update,delete') then
    raise exception 'broadcast_notification_deliveries service role privileges are incomplete';
  end if;
end
$$;
