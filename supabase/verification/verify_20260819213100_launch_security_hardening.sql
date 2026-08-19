do $$
declare
  trigger_count integer;
  valid_state jsonb := pg_catalog.jsonb_build_object(
    'currentParticipantId', 'account-a',
    'participants', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', 'account-a'),
      pg_catalog.jsonb_build_object('id', 'account-b')
    ),
    'groups', '[]'::jsonb,
    'events', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'event-security-test',
        'participantIds', pg_catalog.jsonb_build_array('account-a', 'account-b'),
        'adminIds', pg_catalog.jsonb_build_array('account-a'),
        'createdByParticipantId', 'account-a',
        'roundSettlementTransfers', false,
        'expenses', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'expense-security-test',
            'total', 100,
            'createdByParticipantId', 'account-a',
            'sharedByParticipantIds', pg_catalog.jsonb_build_array(
              'account-a', 'account-b'
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
            'id', 'transfer-security-test',
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
  empty_transfer_state jsonb;
  paid_at text := pg_catalog.statement_timestamp()::text;
  old_status_state jsonb;
  paid_status_state jsonb;
begin
  if to_regprocedure('private.guard_personal_snapshot_write()') is null
    or to_regprocedure('private.is_active_shared_event_member(text,uuid)') is null
    or to_regprocedure('private.has_valid_shared_event_transfer_totals(jsonb)') is null
    or to_regprocedure(
      'private.has_authorized_transfer_status_changes(jsonb,jsonb,text)'
    ) is null
    or to_regprocedure('private.guard_shared_event_financial_integrity()') is null then
    raise exception 'Launch security helper is missing';
  end if;
  if to_regclass('private.shared_event_qualification_activity') is null then
    raise exception 'Trusted referral qualification ledger is missing';
  end if;
  if exists (
    select 1
    from public.app_snapshots as snapshot
    where snapshot.owner_user_id is not null
      and coalesce(snapshot.state ->> 'currentParticipantId', '')
        <> 'account-' || snapshot.owner_user_id::text
  ) then
    raise exception 'A personal workspace still points at another account';
  end if;

  select count(*) into trigger_count
  from pg_catalog.pg_trigger as trigger
  where trigger.tgrelid = 'public.app_snapshots'::regclass
    and trigger.tgname in (
      'guard_personal_snapshot_write',
      'guard_shared_event_financial_integrity'
    )
    and not trigger.tgisinternal;
  if trigger_count <> 2 then
    raise exception 'Launch security triggers are missing or duplicated';
  end if;

  if not private.has_valid_shared_event_transfer_totals(valid_state) then
    raise exception 'A correct settlement transfer plan is rejected';
  end if;
  if private.has_valid_shared_event_transfer_totals(
    pg_catalog.jsonb_set(valid_state, '{events,0,transfers,0,amount}', '60'::jsonb)
  ) then
    raise exception 'A forged settlement amount is accepted';
  end if;

  empty_transfer_state := pg_catalog.jsonb_set(
    valid_state,
    '{events,0,transfers}',
    '[]'::jsonb
  );
  if not private.has_valid_shared_event_transfer_totals(empty_transfer_state) then
    raise exception 'The calculate-on-read empty transfer state is rejected';
  end if;

  old_status_state := valid_state;
  paid_status_state := pg_catalog.jsonb_set(
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
  paid_status_state := pg_catalog.jsonb_set(
    paid_status_state,
    '{events,0,transferStatusUpdates}',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'transfer-security-test',
        'status', 'paid',
        'updatedAt', paid_at,
        'markedAt', paid_at,
        'markedPaidByParticipantId', 'account-a'
      )
    )
  );

  if not private.has_authorized_transfer_status_changes(
    old_status_state,
    paid_status_state,
    'account-a'
  ) then
    raise exception 'A correctly attributed payment status is rejected';
  end if;
  if private.has_authorized_transfer_status_changes(
    old_status_state,
    paid_status_state,
    'account-b'
  ) then
    raise exception 'A forged payment attribution is accepted';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'private.has_valid_shared_event_transfer_totals(jsonb)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'private.is_active_shared_event_member(text,uuid)',
    'execute'
  ) then
    raise exception 'Private launch security helpers are client-executable';
  end if;
  if pg_catalog.has_table_privilege(
    'authenticated',
    'private.shared_event_qualification_activity',
    'select'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'private.shared_event_qualification_activity',
    'insert'
  ) then
    raise exception 'Trusted referral qualification ledger is client-accessible';
  end if;
end;
$$;

select 'ready' as verification_status;
