do $$
begin
  if to_regprocedure(
    'public.index_shared_event_for_member(text,uuid)'
  ) is null then
    raise exception 'Shared event membership index RPC is missing';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.index_shared_event_for_member(text,uuid)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.index_shared_event_for_member(text,uuid)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.index_shared_event_for_member(text,uuid)',
    'execute'
  ) then
    raise exception 'Shared event membership index RPC grants are unsafe';
  end if;

  if pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.index_shared_event_for_member(text,uuid)'::regprocedure
    ),
    'row.status = ''active'''
  ) = 0 or pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.index_shared_event_for_member(text,uuid)'::regprocedure
    ),
    'member_access_recovery_v1_key_0001'
  ) = 0 then
    raise exception 'Shared event membership index RPC is incomplete';
  end if;
end;
$$;
