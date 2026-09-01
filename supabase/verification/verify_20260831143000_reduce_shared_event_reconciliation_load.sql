do $$
declare
  function_definition text;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'private.reconcile_shared_snapshot_member_workspaces()'::regprocedure
  );

  function_definition := pg_catalog.lower(function_definition);

  if pg_catalog.strpos(function_definition, 'tg_op = ''update''') = 0
    or pg_catalog.strpos(function_definition, '''participants''') = 0
    or pg_catalog.strpos(function_definition, 'participantids') = 0
    or pg_catalog.strpos(function_definition, 'inactiveparticipantids') = 0
    or pg_catalog.strpos(function_definition, 'participantaccountlinks') = 0 then
    raise exception 'Shared-event workspace reconciliation is not load-gated';
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

select '20260831143000' as migration_version,
  'shared event reconciliation load guard verified' as status;
