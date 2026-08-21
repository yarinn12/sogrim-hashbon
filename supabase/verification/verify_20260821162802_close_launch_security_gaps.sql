begin;

do $$
declare
  insert_policy text;
  deleted_reader text;
begin
  if pg_catalog.to_regprocedure(
      'private.has_preserved_paid_transfer_history(jsonb,jsonb)'
    ) is null
    or pg_catalog.to_regprocedure(
      'private.guard_shared_event_history_and_limits()'
    ) is null then
    raise exception 'Shared payment-history guards are missing';
  end if;

  if private.has_preserved_paid_transfer_history(
    '{"events":[{"transfers":[{"id":"t1","status":"paid","fromParticipantId":"a","toParticipantId":"b","amount":100}],"transferStatusUpdates":[{"id":"t1","status":"paid"}]}]}'::jsonb,
    '{"events":[{"transfers":[],"transferStatusUpdates":[]}]}'::jsonb
  ) then
    raise exception 'Completed transfer history can still be removed';
  end if;

  if not private.has_preserved_paid_transfer_history(
    '{"events":[{"transfers":[{"id":"t1","status":"pending","fromParticipantId":"a","toParticipantId":"b","amount":100}],"transferStatusUpdates":[]}]}'::jsonb,
    '{"events":[{"transfers":[],"transferStatusUpdates":[]}]}'::jsonb
  ) then
    raise exception 'Pending settlement recomputation was blocked';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid = 'public.app_snapshots'::pg_catalog.regclass
      and trigger.tgname = 'guard_shared_event_history_and_limits'
      and not trigger.tgisinternal
  ) then
    raise exception 'Shared event history trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid = 'public.friendships'::pg_catalog.regclass
      and trigger.tgname = 'guard_friendship_pair_write'
      and not trigger.tgisinternal
  ) or not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid = 'public.user_blocks'::pg_catalog.regclass
      and trigger.tgname = 'lock_user_block_pair'
      and not trigger.tgisinternal
  ) then
    raise exception 'Friendship/block serialization triggers are missing';
  end if;

  select pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
  into insert_policy
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.app_snapshots'::pg_catalog.regclass
    and policy.polname = 'app_snapshots_insert';

  if insert_policy is null
    or pg_catalog.lower(insert_policy) not like '%owner_user_id = (select auth.uid())%'
    or pg_catalog.lower(insert_policy) like '%owner_user_id is null%' then
    raise exception 'Ownerless workspace insertion is still client-accessible';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.can_read_deleted_shared_snapshot(text)'::pg_catalog.regprocedure
  ) into deleted_reader;
  if pg_catalog.lower(deleted_reader) not like '%member.status = ''active''%' then
    raise exception 'Removed members can still read deleted event snapshots';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid = 'public.event_invite_tokens'::pg_catalog.regclass
      and trigger.tgname = 'prune_revoked_event_invites'
      and not trigger.tgisinternal
  ) then
    raise exception 'Revoked invitation retention trigger is missing';
  end if;

  if pg_catalog.to_regprocedure(
      'public.verify_shared_event_notification_parties(text,uuid,uuid)'
    ) is null then
    raise exception 'Canonical notification membership verification is missing';
  end if;

  if pg_catalog.has_function_privilege(
      'authenticated',
      'public.verify_shared_event_notification_parties(text,uuid,uuid)',
      'execute'
    ) then
    raise exception 'Authenticated clients can call notification membership verification';
  end if;
end;
$$;

select 'ready' as verification_status;

rollback;
