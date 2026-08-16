do $$
declare
  creation_definition text;
  guard_definition text;
begin
  if to_regprocedure('public.create_shared_event_snapshot(text,text,jsonb)') is null then
    raise exception 'Atomic shared-event creation function is missing';
  end if;

  if pg_catalog.has_function_privilege(
      'anon',
      'public.create_shared_event_snapshot(text,text,jsonb)',
      'execute'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated',
      'public.create_shared_event_snapshot(text,text,jsonb)',
      'execute'
    ) then
    raise exception 'Atomic shared-event creation grants are unsafe';
  end if;

  creation_definition := pg_catalog.pg_get_functiondef(
    'public.create_shared_event_snapshot(text,text,jsonb)'::regprocedure
  );
  if pg_catalog.strpos(creation_definition, 'auth.uid()') = 0
    or pg_catalog.strpos(creation_definition, 'private.current_actor_participant_id()') = 0
    or pg_catalog.strpos(creation_definition, 'private.is_shared_event_state(p_state)') = 0
    or pg_catalog.strpos(creation_definition, 'createdByParticipantId') = 0 then
    raise exception 'Atomic shared-event creation does not bind the authenticated creator';
  end if;

  guard_definition := pg_catalog.pg_get_functiondef(
    'private.guard_shared_snapshot_update()'::regprocedure
  );
  if pg_catalog.strpos(guard_definition, 'actor_is_adding_offline_guests') = 0
    or pg_catalog.strpos(guard_definition, '''updatedAt''') = 0
    or pg_catalog.strpos(guard_definition, 'Only an event admin can change event settings') = 0 then
    raise exception 'Shared-event update guard is missing the safe content boundary';
  end if;
end;
$$;
