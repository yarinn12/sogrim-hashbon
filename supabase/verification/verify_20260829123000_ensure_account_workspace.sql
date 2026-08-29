do $$
declare
  function_definition text;
begin
  if pg_catalog.to_regprocedure(
    'public.ensure_account_workspace(text)'
  ) is null then
    raise exception 'Account workspace ensure RPC is missing';
  end if;

  select pg_catalog.pg_get_functiondef(function.oid)
  into function_definition
  from pg_catalog.pg_proc as function
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = function.pronamespace
  where namespace.nspname = 'public'
    and function.proname = 'ensure_account_workspace'
    and pg_catalog.pg_get_function_identity_arguments(function.oid) =
      'p_space_id text';

  if function_definition not like '%pg_advisory_xact_lock%'
    or function_definition not like '%for update%'
    or function_definition not like '%account_space_key%'
    or function_definition not like '%snapshot_kind%' then
    raise exception 'Account workspace ensure RPC is missing atomic safety checks';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.ensure_account_workspace(text)',
    'execute'
  ) then
    raise exception 'Anonymous users can execute account workspace ensure RPC';
  end if;
  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.ensure_account_workspace(text)',
    'execute'
  ) then
    raise exception 'Authenticated users cannot execute account workspace ensure RPC';
  end if;
end;
$$;
