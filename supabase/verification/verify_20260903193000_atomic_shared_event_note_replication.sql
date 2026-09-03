do $$
declare
  sync_definition text;
  trigger_definition text;
begin
  if to_regprocedure(
    'private.sync_shared_event_notes_to_workspaces(text,jsonb,timestamptz)'
  ) is null
    or to_regprocedure('private.mirror_shared_event_notes()') is null then
    raise exception 'Atomic shared-event note replication functions are missing';
  end if;

  sync_definition := pg_catalog.pg_get_functiondef(
    'private.sync_shared_event_notes_to_workspaces(text,jsonb,timestamptz)'
      ::regprocedure
  );
  if pg_catalog.strpos(sync_definition, 'canonical_notes') = 0
    or pg_catalog.strpos(sync_definition, 'canonical_deleted_notes') = 0
    or pg_catalog.strpos(sync_definition, 'for update of personal') = 0
    or pg_catalog.strpos(sync_definition, '''{events}''') = 0
    or pg_catalog.strpos(sync_definition, '''{participants}''') = 0
    or pg_catalog.strpos(sync_definition, 'member.status = ''active''') = 0
    or pg_catalog.strpos(sync_definition, 'request.jwt.claim.sub') = 0 then
    raise exception 'Shared-event notes are not replicated transactionally';
  end if;

  select pg_catalog.pg_get_triggerdef(trigger.oid)
  into trigger_definition
  from pg_catalog.pg_trigger as trigger
  join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'app_snapshots'
    and trigger.tgname = 'zzz_mirror_shared_event_notes'
    and not trigger.tgisinternal;

  if trigger_definition is null
    or pg_catalog.strpos(
      trigger_definition,
      'EXECUTE FUNCTION private.mirror_shared_event_notes()'
    ) = 0 then
    raise exception 'Shared-event note replication trigger is missing';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'private.sync_shared_event_notes_to_workspaces(text,jsonb,timestamptz)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'private.sync_shared_event_notes_to_workspaces(text,jsonb,timestamptz)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'private.mirror_shared_event_notes()',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'private.mirror_shared_event_notes()',
    'execute'
  ) then
    raise exception 'Shared-event note replication grants are unsafe';
  end if;
end;
$$;
