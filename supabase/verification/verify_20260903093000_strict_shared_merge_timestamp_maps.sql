do $$
declare
  function_definition text;
begin
  function_definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.guard_shared_event_future_merge_timestamps()'::regprocedure
  ));

  if pg_catalog.strpos(
      function_definition,
      'shared merge timestamp key is invalid'
    ) = 0
    or pg_catalog.strpos(
      function_definition,
      'shared merge timestamp must use iso 8601 format'
    ) = 0
    or pg_catalog.strpos(function_definition, 'map_entry.key !~') = 0 then
    raise exception 'Shared merge timestamp map validation is incomplete';
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
end;
$$;

select '20260903093000' as migration_version,
  'strict shared merge timestamp maps verified' as status;
