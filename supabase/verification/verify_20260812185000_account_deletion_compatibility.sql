do $$
declare
  guard_function text;
  helper_function text;
begin
  if pg_catalog.to_regprocedure(
    'private.is_safe_account_deletion_anonymization(jsonb,jsonb)'
  ) is null then
    raise exception 'account deletion compatibility helper is missing';
  end if;

  guard_function := pg_catalog.pg_get_functiondef(
    'private.guard_shared_snapshot_update()'::regprocedure
  );
  helper_function := pg_catalog.pg_get_functiondef(
    'private.is_safe_account_deletion_anonymization(jsonb,jsonb)'::regprocedure
  );

  if pg_catalog.strpos(guard_function, 'pg_trigger_depth() > 1') = 0
    or pg_catalog.strpos(
      guard_function,
      'is_safe_account_deletion_anonymization'
    ) = 0 then
    raise exception 'shared event guard does not preserve account deletion';
  end if;

  if pg_catalog.strpos(helper_function, 'p_old_state - ''participants''') = 0
    or pg_catalog.strpos(helper_function, 'p_new_state - ''participants''') = 0
    or pg_catalog.strpos(helper_function, 'משתמש שנמחק') = 0
    or pg_catalog.strpos(helper_function, '''authSubject''') = 0 then
    raise exception 'account deletion compatibility helper is too broad or incomplete';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'private.is_safe_account_deletion_anonymization(jsonb,jsonb)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'private.is_safe_account_deletion_anonymization(jsonb,jsonb)',
    'execute'
  ) then
    raise exception 'account deletion compatibility helper is exposed to clients';
  end if;
end;
$$;

select
  '20260812185000' as migration_version,
  'ready' as verification_status;
