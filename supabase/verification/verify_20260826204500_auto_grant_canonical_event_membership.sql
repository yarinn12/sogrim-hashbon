do $$
declare
  trigger_definition text;
  function_definition text;
begin
  select pg_catalog.pg_get_triggerdef(trigger.oid)
  into trigger_definition
  from pg_catalog.pg_trigger as trigger
  where trigger.tgrelid = 'public.app_snapshots'::regclass
    and trigger.tgname = 'sync_shared_snapshot_members'
    and not trigger.tgisinternal;

  if trigger_definition is null
    or trigger_definition not like '%AFTER INSERT OR UPDATE%' then
    raise exception 'Shared-event membership sync is not active for inserts and updates';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private.sync_shared_snapshot_members()'::regprocedure
  ) into function_definition;

  if pg_catalog.lower(function_definition) not like '%join auth.users%'
    or function_definition not like '%active_participant.participant_id%'
    or pg_catalog.lower(function_definition) not like
      '%on conflict (snapshot_id, user_id) do update%' then
    raise exception 'Canonical account participants are not granted membership atomically';
  end if;
end;
$$;

select 'ready' as verification_status;
