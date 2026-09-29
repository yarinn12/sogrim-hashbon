do $$
declare
  definition text := pg_catalog.pg_get_functiondef('private.guard_shared_event_future_merge_timestamps()'::regprocedure);
begin
  if pg_catalog.strpos(definition, 'participantAliasUpdatedAtByParticipant') = 0
    or pg_catalog.strpos(definition, 'Participant alias clocks must be timestamp strings') = 0
    or pg_catalog.strpos(definition, 'Participant alias clocks must be an object') = 0
    or not exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid = 'public.app_snapshots'::regclass
        and tgfoid = 'private.guard_shared_event_future_merge_timestamps()'::regprocedure
        and tgenabled = 'O'
    ) then
    raise exception 'Participant alias clock validation is not installed and enabled';
  end if;
  if pg_catalog.has_function_privilege('anon', 'private.guard_shared_event_future_merge_timestamps()', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'private.guard_shared_event_future_merge_timestamps()', 'EXECUTE') then
    raise exception 'Private alias clock guard must not be directly executable';
  end if;
end;
$$;

select 'participant alias versions verified' as verification_status;
