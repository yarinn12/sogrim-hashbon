do $$
declare
  overview jsonb;
begin
  if pg_catalog.to_regprocedure(
    'public.admin_operational_health(integer)'
  ) is null then
    raise exception 'admin_operational_health function is missing';
  end if;

  if has_function_privilege(
    'anon',
    'public.admin_operational_health(integer)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.admin_operational_health(integer)',
    'execute'
  ) then
    raise exception 'admin operational health is exposed to an app role';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.admin_operational_health(integer)',
    'execute'
  ) then
    raise exception 'service role cannot read admin operational health';
  end if;

  select public.admin_operational_health(30) into overview;
  if pg_catalog.jsonb_typeof(overview) <> 'object'
    or pg_catalog.jsonb_typeof(overview -> 'telemetry') <> 'object'
    or pg_catalog.jsonb_typeof(overview -> 'pushDelivery') <> 'object'
    or pg_catalog.jsonb_typeof(overview -> 'dataContinuity') <> 'object'
    or pg_catalog.jsonb_typeof(overview -> 'deferredOperations') <> 'array'
    or pg_catalog.jsonb_typeof(overview -> 'clientErrors') <> 'array' then
    raise exception 'admin operational health returned an invalid shape';
  end if;
end
$$;
