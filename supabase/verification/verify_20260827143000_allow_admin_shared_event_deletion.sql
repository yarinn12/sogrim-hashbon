do $$
declare
  helper_definition text;
  guard_definition text;
  old_state jsonb := '{
    "currentParticipantId":"account-owner",
    "participants":[{"id":"account-owner"}],
    "groups":[],
    "events":[{
      "id":"event-paid",
      "participantIds":["account-owner"],
      "adminIds":["account-owner"],
      "transfers":[{"id":"transfer-paid","status":"paid"}],
      "transferStatusUpdates":[]
    }],
    "deletedEvents":[]
  }'::jsonb;
  valid_deletion jsonb := '{
    "currentParticipantId":"",
    "participants":[],
    "groups":[],
    "events":[],
    "deletedEvents":[{"id":"event-paid","deletedAt":"2026-08-27T14:30:00.000Z"}]
  }'::jsonb;
begin
  select pg_catalog.pg_get_functiondef(
    'private.is_safe_shared_event_deletion(jsonb,jsonb,text)'::regprocedure
  ) into helper_definition;
  select pg_catalog.pg_get_functiondef(
    'private.guard_shared_event_history_and_limits()'::regprocedure
  ) into guard_definition;

  if pg_catalog.strpos(guard_definition, 'is_safe_shared_event_deletion') = 0 then
    raise exception 'The paid-history guard does not permit verified admin deletion';
  end if;

  if not private.is_safe_shared_event_deletion(
    old_state,
    valid_deletion,
    'account-owner'
  ) then
    raise exception 'A valid administrator deletion was rejected';
  end if;

  if private.is_safe_shared_event_deletion(
    old_state,
    valid_deletion,
    'account-member'
  ) then
    raise exception 'A non-administrator can delete a shared event';
  end if;

  if private.is_safe_shared_event_deletion(
    old_state,
    pg_catalog.jsonb_set(
      valid_deletion,
      '{deletedEvents,0,id}',
      '"event-other"'::jsonb
    ),
    'account-owner'
  ) then
    raise exception 'A mismatched deletion tombstone was accepted';
  end if;

  if private.is_safe_shared_event_deletion(
    old_state,
    pg_catalog.jsonb_set(valid_deletion, '{events}', old_state -> 'events'),
    'account-owner'
  ) then
    raise exception 'A deletion that retains the live event was accepted';
  end if;

  if helper_definition is null then
    raise exception 'The shared-event deletion helper is missing';
  end if;
end;
$$;

select 'ready' as verification_status;
