do $$
declare
  policy_definition text;
begin
  if to_regprocedure(
    'public.update_shared_event_snapshot(text,text,timestamp with time zone,jsonb)'
  ) is null then
    raise exception 'Atomic shared-event update function is missing';
  end if;
  if to_regprocedure('private.is_valid_shared_event_financials(jsonb)') is null then
    raise exception 'Shared-event financial validator is missing';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.update_shared_event_snapshot(text,text,timestamp with time zone,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated accounts cannot call the atomic update function';
  end if;
  if has_function_privilege(
    'anon',
    'public.update_shared_event_snapshot(text,text,timestamp with time zone,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous callers can execute the atomic update function';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.can_bootstrap_shared_snapshot(text)',
    'EXECUTE'
  ) then
    raise exception 'Legacy shared-key bootstrap remains executable';
  end if;

  select coalesce(qual, '') || ' ' || coalesce(with_check, '')
  into policy_definition
  from pg_policies
  where schemaname = 'public'
    and tablename = 'app_snapshots'
    and policyname = 'app_snapshots_update';
  if policy_definition is null
    or policy_definition like '%shared_event%'
    or policy_definition not like '%workspace%' then
    raise exception 'Direct shared-event table updates are still permitted';
  end if;

  if private.is_valid_shared_event_financials(
    jsonb_build_object(
      'participants', jsonb_build_array(jsonb_build_object('id', 'account-test')),
      'groups', '[]'::jsonb,
      'events', jsonb_build_array(jsonb_build_object(
        'id', 'event-test',
        'participantIds', jsonb_build_array('account-test'),
        'adminIds', jsonb_build_array('account-test'),
        'createdByParticipantId', 'account-test',
        'expenses', jsonb_build_array(jsonb_build_object(
          'id', 'expense-bad',
          'total', 100,
          'sharedByParticipantIds', jsonb_build_array('account-test'),
          'payers', jsonb_build_array(jsonb_build_object(
            'participantId', 'account-test',
            'amount', 99
          ))
        )),
        'transfers', '[]'::jsonb
      ))
    )
  ) then
    raise exception 'Malformed payer totals pass financial validation';
  end if;
end;
$$;

select 'ready' as verification_status;
