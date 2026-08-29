do $$
declare
  function_definition text;
begin
  if pg_catalog.to_regprocedure(
    'public.admin_connected_event_publication_health()'
  ) is null then
    raise exception 'Connected event publication health RPC is missing';
  end if;

  select pg_catalog.pg_get_functiondef(function.oid)
  into function_definition
  from pg_catalog.pg_proc as function
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = function.pronamespace
  where namespace.nspname = 'public'
    and function.proname = 'admin_connected_event_publication_health'
    and pg_catalog.pg_get_function_identity_arguments(function.oid) = '';

  if function_definition not like '%activeUnsharedMultiAccountCreatorEvents%'
    or function_definition not like '%createdByParticipantId%'
    or function_definition not like '%inactiveParticipantIds%'
    or function_definition not like '%sharedSpaceId%' then
    raise exception 'Connected event publication health RPC is incomplete';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.admin_connected_event_publication_health()',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_connected_event_publication_health()',
    'execute'
  ) then
    raise exception 'Connected event publication health RPC is exposed';
  end if;
  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_connected_event_publication_health()',
    'execute'
  ) then
    raise exception 'Connected event publication health RPC is unavailable';
  end if;
end;
$$;
