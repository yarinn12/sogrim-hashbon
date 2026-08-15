do $$
declare
  old_state jsonb := '{
    "participants": [
      {"id":"account-11111111-1111-1111-1111-111111111111","kind":"user","accountLinked":true}
    ],
    "events": [{
      "id":"event-1",
      "participantIds":["account-11111111-1111-1111-1111-111111111111"],
      "inactiveParticipantIds":[],
      "adminIds":["account-11111111-1111-1111-1111-111111111111"]
    }],
    "deletedParticipants": [{
      "id":"guest-merged-1",
      "reason":"merged",
      "targetParticipantId":"account-11111111-1111-1111-1111-111111111111",
      "deletedAt":"2026-08-15T00:00:00.000Z"
    }]
  }'::jsonb;
  safe_new_state jsonb;
  resurrected_state jsonb;
begin
  safe_new_state := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      old_state,
      '{participants}',
      (old_state -> 'participants') ||
        '[{"id":"guest-new-1","kind":"guest","accountLinked":false}]'::jsonb
    ),
    '{events,0,participantIds}',
    (old_state #> '{events,0,participantIds}') || '"guest-new-1"'::jsonb
  );
  resurrected_state := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      old_state,
      '{participants}',
      (old_state -> 'participants') ||
        '[{"id":"guest-merged-1","kind":"guest","accountLinked":false}]'::jsonb
    ),
    '{events,0,participantIds}',
    (old_state #> '{events,0,participantIds}') || '"guest-merged-1"'::jsonb
  );

  if not private.is_safe_offline_guest_addition(old_state, safe_new_state) then
    raise exception 'new offline guest was incorrectly rejected';
  end if;
  if private.is_safe_offline_guest_addition(old_state, resurrected_state) then
    raise exception 'merged offline guest was allowed to return';
  end if;
end;
$$;

select 'ready' as verification_status;
