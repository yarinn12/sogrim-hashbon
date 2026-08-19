do $$
declare
  valid_state jsonb := pg_catalog.jsonb_build_object(
    'currentParticipantId', '',
    'participants', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'account-a',
        'accountLinked', true
      ),
      pg_catalog.jsonb_build_object(
        'id', 'account-b',
        'accountLinked', true
      ),
      pg_catalog.jsonb_build_object('id', 'offline-c')
    ),
    'groups', '[]'::jsonb,
    'events', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'event-financial-integrity-test',
        'participantIds', pg_catalog.jsonb_build_array(
          'account-a',
          'account-b',
          'offline-c'
        ),
        'adminIds', pg_catalog.jsonb_build_array('account-a'),
        'createdByParticipantId', 'account-a',
        'roundSettlementTransfers', false,
        'expenses', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'expense-financial-integrity-test',
            'total', 100,
            'createdByParticipantId', 'account-a',
            'sharedByParticipantIds', pg_catalog.jsonb_build_array(
              'account-a',
              'account-b'
            ),
            'payers', pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object(
                'participantId', 'account-a',
                'amount', 100
              )
            )
          )
        ),
        'deletedExpenses', '[]'::jsonb,
        'transfers', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'transfer-financial-integrity-test',
            'fromParticipantId', 'account-b',
            'toParticipantId', 'account-a',
            'amount', 50,
            'status', 'pending'
          )
        ),
        'transferStatusUpdates', '[]'::jsonb
      )
    )
  );
  paid_at text := pg_catalog.statement_timestamp()::text;
  paid_state jsonb;
  oversized_records jsonb;
  guard_definition text;
begin
  if to_regprocedure(
    'private.is_account_linked_shared_participant(jsonb,text)'
  ) is null
    or to_regprocedure(
      'private.is_valid_shared_event_financials(jsonb)'
    ) is null
    or to_regprocedure(
      'private.has_valid_shared_event_transfer_totals(jsonb)'
    ) is null
    or to_regprocedure(
      'private.has_authorized_transfer_status_changes(jsonb,jsonb,text)'
    ) is null
    or to_regprocedure(
      'private.guard_shared_event_financial_integrity()'
    ) is null then
    raise exception 'Shared financial integrity helper is missing';
  end if;

  if not private.is_valid_shared_event_financials(valid_state)
    or not private.has_valid_shared_event_transfer_totals(valid_state) then
    raise exception 'A valid debtor-to-creditor settlement is rejected';
  end if;

  if not private.is_account_linked_shared_participant(
    valid_state,
    'account-a'
  ) then
    raise exception 'An account-linked participant is treated as offline';
  end if;
  if private.is_account_linked_shared_participant(
    valid_state,
    'offline-c'
  ) then
    raise exception 'An offline participant is treated as account-linked';
  end if;
  if private.is_account_linked_shared_participant(
    '{"participants": {"legacy": true}}'::jsonb,
    'account-a'
  ) then
    raise exception 'Malformed legacy participant JSON is not guarded';
  end if;

  if private.has_valid_shared_event_transfer_totals(
    pg_catalog.jsonb_set(
      valid_state,
      '{events,0,transfers}',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', 'transfer-forward-overpay',
          'fromParticipantId', 'account-b',
          'toParticipantId', 'account-a',
          'amount', 60,
          'status', 'pending'
        ),
        pg_catalog.jsonb_build_object(
          'id', 'transfer-synthetic-reverse',
          'fromParticipantId', 'account-a',
          'toParticipantId', 'account-b',
          'amount', 10,
          'status', 'pending'
        )
      )
    )
  ) then
    raise exception 'A synthetic reverse settlement route is accepted';
  end if;

  if private.has_valid_shared_event_transfer_totals(
    pg_catalog.jsonb_set(
      valid_state,
      '{events,0,transfers}',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', 'transfer-cycle-base',
          'fromParticipantId', 'account-b',
          'toParticipantId', 'account-a',
          'amount', 50,
          'status', 'pending'
        ),
        pg_catalog.jsonb_build_object(
          'id', 'transfer-cycle-out',
          'fromParticipantId', 'account-b',
          'toParticipantId', 'offline-c',
          'amount', 10,
          'status', 'pending'
        ),
        pg_catalog.jsonb_build_object(
          'id', 'transfer-cycle-back',
          'fromParticipantId', 'offline-c',
          'toParticipantId', 'account-b',
          'amount', 10,
          'status', 'pending'
        )
      )
    )
  ) then
    raise exception 'A cyclic settlement route is accepted';
  end if;

  if not private.has_valid_shared_event_transfer_totals(
    pg_catalog.jsonb_set(
      valid_state,
      '{events,0,transfers}',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', 'transfer-duplicate-first',
          'fromParticipantId', 'account-b',
          'toParticipantId', 'account-a',
          'amount', 20,
          'status', 'pending'
        ),
        pg_catalog.jsonb_build_object(
          'id', 'transfer-duplicate-second',
          'fromParticipantId', 'account-b',
          'toParticipantId', 'account-a',
          'amount', 30,
          'status', 'pending'
        )
      )
    )
  ) then
    raise exception 'A valid split settlement route is rejected';
  end if;

  paid_state := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          valid_state,
          '{events,0,transfers,0,status}',
          '"paid"'::jsonb
        ),
        '{events,0,transfers,0,markedPaidByParticipantId}',
        '"account-a"'::jsonb
      ),
      '{events,0,transfers,0,markedPaidAt}',
      pg_catalog.to_jsonb(paid_at)
    ),
    '{events,0,transfers,0,statusUpdatedAt}',
    pg_catalog.to_jsonb(paid_at)
  );
  paid_state := pg_catalog.jsonb_set(
    paid_state,
    '{events,0,transferStatusUpdates}',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'transfer-financial-integrity-test',
        'status', 'paid',
        'updatedAt', paid_at,
        'markedAt', paid_at,
        'markedPaidByParticipantId', 'account-a'
      )
    )
  );

  if not private.is_valid_shared_event_financials(paid_state)
    or not private.has_authorized_transfer_status_changes(
      valid_state,
      paid_state,
      'account-a'
    ) then
    raise exception 'A valid same-transfer payment update is rejected';
  end if;
  if not private.has_authorized_transfer_status_changes(
    paid_state,
    paid_state,
    'account-a'
  ) then
    raise exception 'Unchanged payment history is rejected during initial publish';
  end if;
  if private.has_authorized_transfer_status_changes(
    valid_state,
    pg_catalog.jsonb_set(
      paid_state,
      '{events,0,transferStatusUpdates,0,id}',
      '"orphan-transfer-status"'::jsonb
    ),
    'account-a'
  ) then
    raise exception 'A newly forged orphan transfer status update is accepted';
  end if;
  if private.has_authorized_transfer_status_changes(
    valid_state,
    pg_catalog.jsonb_set(
      paid_state,
      '{events,0,transfers,0,amount}',
      '51'::jsonb
    ),
    'account-a'
  ) then
    raise exception 'A same-ID transfer amount mutation is accepted';
  end if;
  if private.has_authorized_transfer_status_changes(
    valid_state,
    pg_catalog.jsonb_set(
      paid_state,
      '{events,0,transfers,0,fromParticipantId}',
      '"offline-c"'::jsonb
    ),
    'account-a'
  ) then
    raise exception 'A same-ID transfer party mutation is accepted';
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('id', 'participant-' || item.value)
  ) into oversized_records
  from pg_catalog.generate_series(1, 501) as item(value);
  if private.is_valid_shared_event_financials(
    pg_catalog.jsonb_set(valid_state, '{participants}', oversized_records)
  ) then
    raise exception 'The 500-participant practical cap is not enforced';
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('id', 'expense-' || item.value)
  ) into oversized_records
  from pg_catalog.generate_series(1, 2001) as item(value);
  if private.is_valid_shared_event_financials(
    pg_catalog.jsonb_set(valid_state, '{events,0,expenses}', oversized_records)
  ) then
    raise exception 'The 2000-record practical cap is not enforced';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private.guard_shared_event_financial_integrity()'::regprocedure
  ) into guard_definition;
  if pg_catalog.strpos(guard_definition, 'tg_op = ''INSERT''') = 0
    or pg_catalog.strpos(
      guard_definition,
      'is_account_linked_shared_participant'
    ) = 0
    or pg_catalog.strpos(guard_definition, 'current_transfer') = 0
    or pg_catalog.strpos(guard_definition, 'previous_transfer') = 0 then
    raise exception 'The shared-event table guard is missing hardened insert or referral checks';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'private.is_account_linked_shared_participant(jsonb,text)',
    'execute'
  ) then
    raise exception 'The account-linked participant helper is client-executable';
  end if;
end;
$$;

select 'ready' as verification_status;
