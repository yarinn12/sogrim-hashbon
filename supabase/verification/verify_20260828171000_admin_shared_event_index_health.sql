do $$
declare
  health jsonb;
begin
  if pg_catalog.to_regprocedure(
    'public.admin_shared_event_index_health()'
  ) is null then
    raise exception 'admin shared-event index health RPC is missing';
  end if;

  select public.admin_shared_event_index_health() into health;
  if not (health ? 'activeMembershipsMissingPersonalIndex')
    or not (health ? 'checkedAt') then
    raise exception 'admin shared-event index health payload is incomplete';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_shared_event_index_health()',
    'execute'
  ) then
    raise exception 'authenticated users can execute admin index health';
  end if;
end;
$$;
