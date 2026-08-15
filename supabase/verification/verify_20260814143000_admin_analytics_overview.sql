do $$
begin
  if to_regprocedure('public.admin_analytics_overview(integer)') is null then
    raise exception 'admin analytics function is missing';
  end if;
  if pg_catalog.has_function_privilege(
    'anon', 'public.admin_analytics_overview(integer)', 'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated', 'public.admin_analytics_overview(integer)', 'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role', 'public.admin_analytics_overview(integer)', 'execute'
  ) then
    raise exception 'admin analytics function privileges are unsafe';
  end if;
end;
$$;
