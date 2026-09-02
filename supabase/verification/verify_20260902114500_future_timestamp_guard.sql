do $$
declare
  function_definition text;
begin
  function_definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.guard_shared_event_future_merge_timestamps()'::regprocedure
  ));

  if pg_catalog.strpos(function_definition, 'statement_timestamp()') = 0
    or pg_catalog.strpos(function_definition, '5 minutes') = 0
    or pg_catalog.strpos(function_definition, 'membershipupdatedat') = 0
    or pg_catalog.strpos(function_definition, 'statusupdatedat') = 0
    or pg_catalog.strpos(function_definition, 'adminidsupdatedat') = 0
    or pg_catalog.strpos(function_definition, 'settingsupdatedat') = 0
    or pg_catalog.strpos(function_definition, 'membershipupdatedatbyparticipant') = 0
    or pg_catalog.strpos(function_definition, 'settingsfieldupdatedat') = 0 then
    raise exception 'Shared-event future timestamp guard is incomplete';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_record
    where trigger_record.tgrelid = 'public.app_snapshots'::regclass
      and trigger_record.tgname = 'guard_shared_event_future_merge_timestamps'
      and not trigger_record.tgisinternal
  ) then
    raise exception 'Shared-event future timestamp trigger is missing';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'private.guard_shared_event_future_merge_timestamps()',
    'execute'
  ) then
    raise exception 'Shared-event future timestamp guard is exposed';
  end if;
end;
$$;

select '20260902114500' as migration_version,
  'shared event future timestamp guard verified' as status;
