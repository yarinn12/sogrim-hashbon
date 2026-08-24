do $$
declare
  direct_state jsonb := pg_catalog.jsonb_build_object(
    'participants', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', 'a'),
      pg_catalog.jsonb_build_object('id', 'b'),
      pg_catalog.jsonb_build_object('id', 'c')
    ),
    'events', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'pairwise-direct-verification',
        'participantIds', pg_catalog.jsonb_build_array('a', 'b', 'c'),
        'directSettlementTransfers', true,
        'roundSettlementTransfers', false,
        'expenses', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'a-paid-c',
            'total', 300,
            'sharedByParticipantIds', pg_catalog.jsonb_build_array('a', 'c'),
            'payers', pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object('participantId', 'a', 'amount', 300)
            )
          ),
          pg_catalog.jsonb_build_object(
            'id', 'b-paid-a',
            'total', 100,
            'sharedByParticipantIds', pg_catalog.jsonb_build_array('a'),
            'payers', pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object('participantId', 'b', 'amount', 100)
            )
          )
        ),
        'transfers', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'a-to-b',
            'fromParticipantId', 'a',
            'toParticipantId', 'b',
            'amount', 100,
            'status', 'pending'
          ),
          pg_catalog.jsonb_build_object(
            'id', 'c-to-a',
            'fromParticipantId', 'c',
            'toParticipantId', 'a',
            'amount', 150,
            'status', 'pending'
          )
        )
      )
    )
  );
begin
  if not private.has_valid_shared_event_transfer_totals(direct_state) then
    raise exception 'A balanced pairwise direct reimbursement is rejected';
  end if;

  if private.has_valid_shared_event_transfer_totals(
    pg_catalog.jsonb_set(
      direct_state,
      '{events,0,directSettlementTransfers}',
      'false'::jsonb
    )
  ) then
    raise exception 'A crossing route is accepted in optimized mode';
  end if;

  if private.has_valid_shared_event_transfer_totals(
    pg_catalog.jsonb_set(
      direct_state,
      '{events,0,transfers,0,amount}',
      '101'::jsonb
    )
  ) then
    raise exception 'An unbalanced direct reimbursement is accepted';
  end if;
end;
$$;
