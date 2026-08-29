begin;

do $$
declare
  changed_at text := pg_catalog.statement_timestamp()::text;
  old_state jsonb;
  new_state jsonb;
  admin_new_state jsonb;
begin
  old_state := pg_catalog.jsonb_build_object(
    'currentParticipantId', 'payer',
    'participants', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', 'payer'),
      pg_catalog.jsonb_build_object('id', 'receiver'),
      pg_catalog.jsonb_build_object('id', 'admin'),
      pg_catalog.jsonb_build_object('id', 'observer')
    ),
    'events', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'verification-event',
        'participantIds', pg_catalog.jsonb_build_array('payer', 'receiver', 'admin', 'observer'),
        'adminIds', pg_catalog.jsonb_build_array('admin'),
        'adminsCanEditOnly', true,
        'transfers', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'transfer-1',
            'fromParticipantId', 'payer',
            'toParticipantId', 'receiver',
            'amount', 25,
            'status', 'paid',
            'markedPaidByParticipantId', 'receiver',
            'markedPaidAt', changed_at,
            'statusUpdatedAt', changed_at
          )
        ),
        'transferStatusUpdates', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'transfer-1',
            'status', 'paid',
            'markedPaidByParticipantId', 'receiver',
            'updatedAt', changed_at
          )
        ),
        'activityLog', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'activity-paid',
            'kind', 'transfer-paid',
            'occurredAt', changed_at,
            'actorParticipantId', 'receiver',
            'fromParticipantId', 'payer',
            'toParticipantId', 'receiver',
            'entityId', 'transfer-1'
          )
        )
      )
    )
  );

  new_state := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      old_state,
      array['events', '0', 'transfers', '0'],
      pg_catalog.jsonb_build_object(
        'id', 'transfer-1',
        'fromParticipantId', 'payer',
        'toParticipantId', 'receiver',
        'amount', 25,
        'status', 'pending',
        'statusUpdatedAt', changed_at
      )
    ),
    array['events', '0', 'transferStatusUpdates', '0'],
    pg_catalog.jsonb_build_object(
      'id', 'transfer-1',
      'status', 'pending',
      'updatedAt', changed_at
    )
  );
  new_state := pg_catalog.jsonb_set(
    new_state,
    array['events', '0', 'activityLog'],
    (new_state -> 'events' -> 0 -> 'activityLog') || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'activity-pending',
        'kind', 'transfer-pending',
        'occurredAt', changed_at,
        'actorParticipantId', 'receiver',
        'fromParticipantId', 'payer',
        'toParticipantId', 'receiver',
        'entityId', 'transfer-1'
      )
    )
  );
  admin_new_state := pg_catalog.jsonb_set(
    new_state,
    array['events', '0', 'activityLog', '1', 'actorParticipantId'],
    '"admin"'::jsonb
  );

  if not private.is_safe_transfer_status_only_update(
    'verification-snapshot', old_state, new_state, 'receiver'
  ) then
    raise exception 'An involved participant cannot reverse a payment status';
  end if;

  if not private.is_safe_transfer_status_only_update(
    'verification-snapshot', old_state, admin_new_state, 'admin'
  ) then
    raise exception 'An event admin cannot reverse a payment status';
  end if;

  if private.is_safe_transfer_status_only_update(
    'verification-snapshot', old_state, new_state, 'observer'
  ) then
    raise exception 'An unrelated participant can rewrite a payment status';
  end if;
end;
$$;

select pg_catalog.set_config(
  'verification_status',
  'participant transfer status reversal ready',
  true
);

rollback;
