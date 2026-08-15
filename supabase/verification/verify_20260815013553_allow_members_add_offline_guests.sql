do $$
declare
  guard_function text;
  old_state jsonb := '{
    "participants": [
      {"id":"account-11111111-1111-1111-1111-111111111111","kind":"user","accountLinked":true}
    ],
    "events": [{
      "id":"event-1",
      "participantIds":["account-11111111-1111-1111-1111-111111111111"],
      "inactiveParticipantIds":[],
      "adminIds":["account-11111111-1111-1111-1111-111111111111"]
    }]
  }'::jsonb;
  safe_guest_state jsonb := '{
    "participants": [
      {"id":"account-11111111-1111-1111-1111-111111111111","kind":"user","accountLinked":true},
      {"id":"guest-safe-1","kind":"guest","accountLinked":false}
    ],
    "events": [{
      "id":"event-1",
      "participantIds":["account-11111111-1111-1111-1111-111111111111","guest-safe-1"],
      "inactiveParticipantIds":[],
      "adminIds":["account-11111111-1111-1111-1111-111111111111"]
    }]
  }'::jsonb;
  connected_user_state jsonb := '{
    "participants": [
      {"id":"account-11111111-1111-1111-1111-111111111111","kind":"user","accountLinked":true},
      {"id":"guest-unsafe-1","kind":"user","accountLinked":true,"authProvider":"google","authSubject":"other-user"}
    ],
    "events": [{
      "id":"event-1",
      "participantIds":["account-11111111-1111-1111-1111-111111111111","guest-unsafe-1"],
      "inactiveParticipantIds":[],
      "adminIds":["account-11111111-1111-1111-1111-111111111111"]
    }]
  }'::jsonb;
begin
  if to_regprocedure(
    'private.is_safe_offline_guest_addition(jsonb,jsonb)'
  ) is null then
    raise exception 'offline guest safety helper is missing';
  end if;

  guard_function := pg_catalog.pg_get_functiondef(
    'private.guard_shared_snapshot_update()'::regprocedure
  );
  if pg_catalog.strpos(guard_function, 'actor_is_adding_offline_guests') = 0
    or pg_catalog.strpos(guard_function, 'old_participant_ids is distinct from new_participant_ids') = 0
    or pg_catalog.strpos(guard_function, 'old_inactive_ids is distinct from new_inactive_ids') = 0 then
    raise exception 'shared event guard does not handle offline guest additions safely';
  end if;

  if not private.is_safe_offline_guest_addition(old_state, safe_guest_state) then
    raise exception 'safe offline guest addition was rejected';
  end if;

  if private.is_safe_offline_guest_addition(old_state, connected_user_state) then
    raise exception 'connected user addition was incorrectly accepted as an offline guest';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid = 'public.app_snapshots'::regclass
      and trigger.tgname = 'guard_shared_snapshot_update'
      and not trigger.tgisinternal
  ) then
    raise exception 'shared event update guard trigger is missing';
  end if;
end;
$$;

select 'ready' as verification_status;
