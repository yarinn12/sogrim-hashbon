do $$
declare
  function_definition text;
begin
  function_definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.reconcile_shared_snapshot_member_workspaces()'::regprocedure
  ));

  if pg_catalog.strpos(function_definition, 'old_active_ids') = 0
    or pg_catalog.strpos(function_definition, 'lock_timeout') = 0
    or pg_catalog.strpos(function_definition, 'exception when others') = 0
    or pg_catalog.strpos(function_definition, 'raise warning') = 0
    or pg_catalog.strpos(function_definition, 'participantids') = 0
    or pg_catalog.strpos(function_definition, 'inactiveparticipantids') = 0 then
    raise exception 'Shared-event reconciliation isolation is incomplete';
  end if;

  if pg_catalog.strpos(function_definition, 'old.state -> ''participants''') > 0
    or pg_catalog.strpos(function_definition, 'participantaccountlinks') > 0 then
    raise exception 'Shared-event reconciliation still fans out for profile-only changes';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'private.reconcile_shared_snapshot_member_workspaces()',
    'execute'
  ) then
    raise exception 'Shared-event reconciliation trigger function is exposed';
  end if;
end;
$$;

select '20260902113000' as migration_version,
  'shared event index reconciliation isolation verified' as status;
