do $$
declare
  guard_definition text;
  valid_state jsonb := pg_catalog.jsonb_build_object(
    'participants', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', 'account-owner'),
      pg_catalog.jsonb_build_object('id', 'account-friend')
    ),
    'groups', '[]'::jsonb,
    'events', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'event-test',
        'participantIds', pg_catalog.jsonb_build_array('account-owner', 'account-friend'),
        'adminIds', pg_catalog.jsonb_build_array('account-owner'),
        'createdByParticipantId', 'account-owner',
        'expenses', '[]'::jsonb,
        'deletedExpenses', '[]'::jsonb,
        'transfers', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'transfer-test',
            'fromParticipantId', 'account-friend',
            'toParticipantId', 'account-owner',
            'amount', 100,
            'status', 'paid'
          )
        ),
        'transferStatusUpdates', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'transfer-test',
            'status', 'paid',
            'updatedAt', '2026-08-16T12:00:00.000Z',
            'markedAt', '2026-08-16T12:00:00.000Z',
            'markedPaidByParticipantId', 'account-owner'
          )
        )
      )
    )
  );
begin
  if to_regprocedure('private.is_valid_shared_event_financials(jsonb)') is null then
    raise exception 'Shared-event financial validator is missing';
  end if;

  if not private.is_valid_shared_event_financials(valid_state) then
    raise exception 'A valid transfer status history is rejected';
  end if;

  if private.is_valid_shared_event_financials(
    pg_catalog.jsonb_set(
      valid_state,
      '{events,0,transferStatusUpdates,0,markedPaidByParticipantId}',
      '"account-outsider"'::jsonb
    )
  ) then
    raise exception 'An unknown participant can mark a transfer as paid';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private.guard_shared_snapshot_update()'::regprocedure
  ) into guard_definition;

  if pg_catalog.strpos(guard_definition, '''transferStatusUpdates''') = 0
    or pg_catalog.strpos(
      guard_definition,
      'old_event := old_event - ''transferStatusUpdates'''
    ) = 0 then
    raise exception 'Shared-event guard is missing transfer status compatibility';
  end if;
end;
$$;

select 'ready' as verification_status;
