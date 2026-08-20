do $$
declare
  guard_function text;
begin
  if pg_catalog.to_regprocedure(
    'private.is_safe_account_deletion_anonymization(jsonb,jsonb)'
  ) is null then
    raise exception 'account deletion compatibility helper is missing';
  end if;

  guard_function := pg_catalog.pg_get_functiondef(
    'private.guard_personal_snapshot_write()'::regprocedure
  );
  if pg_catalog.strpos(guard_function, 'pg_trigger_depth() > 1') = 0
    or pg_catalog.strpos(
      guard_function,
      'is_safe_account_deletion_anonymization'
    ) = 0 then
    raise exception 'personal workspace guard does not preserve account deletion';
  end if;
end;
$$;

select
  '20260820025646' as migration_version,
  'ready' as verification_status;
