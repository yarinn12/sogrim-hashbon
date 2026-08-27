do $$
declare
  guard_is_security_definer boolean;
  private_schema_is_locked boolean;
begin
  select procedure.prosecdef
    into guard_is_security_definer
  from pg_catalog.pg_proc as procedure
  where procedure.oid =
    'private.guard_shared_event_history_and_limits()'::pg_catalog.regprocedure;

  select
    not pg_catalog.has_schema_privilege('anon', 'private', 'usage')
    and not pg_catalog.has_schema_privilege('authenticated', 'private', 'usage')
    into private_schema_is_locked;

  if guard_is_security_definer is not true then
    raise exception 'Shared-event history guard cannot execute private helpers';
  end if;
  if private_schema_is_locked is not true then
    raise exception 'Private schema access was weakened';
  end if;
end;
$$;
