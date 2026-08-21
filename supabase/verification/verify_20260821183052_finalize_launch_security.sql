begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if to_regclass('private.shared_snapshot_tombstone_recipients') is null
    or not exists (
      select 1
      from pg_catalog.pg_attribute
      where attrelid = 'private.shared_snapshot_members'::regclass
        and attname = 'pending_join_until'
        and not attisdropped
    ) then
    raise exception 'Shared-event deletion and join-race protection is missing';
  end if;

  if to_regprocedure('public.reserve_sensitive_api_capacity(text,text[],integer,integer,integer)') is null
    or to_regclass('private.api_rate_limit_buckets') is null
    or pg_catalog.has_function_privilege(
      'authenticated',
      'public.reserve_sensitive_api_capacity(text,text[],integer,integer,integer)',
      'execute'
    ) then
    raise exception 'Durable sensitive-route rate limiting is not private';
  end if;

  if to_regprocedure('public.submit_app_feedback(text,text,jsonb)') is null
    or not pg_catalog.has_function_privilege(
      'authenticated',
      'public.submit_app_feedback(text,text,jsonb)',
      'execute'
    )
    or pg_catalog.has_table_privilege(
      'authenticated', 'public.app_feedback', 'insert'
    ) then
    raise exception 'Feedback write boundary is not hardened';
  end if;

  if to_regclass('private.friend_request_attempts') is null
    or to_regprocedure('private.reserve_friend_request_capacity(uuid,uuid)') is null
    or pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'public.request_friendship(text)'::regprocedure
      ),
      'reserve_friend_request_capacity'
    ) = 0 then
    raise exception 'Friend request abuse protection is missing';
  end if;

  if to_regprocedure('public.verify_shared_event_invitation_parties(text,uuid,uuid)') is null
    or pg_catalog.has_function_privilege(
      'authenticated',
      'public.verify_shared_event_invitation_parties(text,uuid,uuid)',
      'execute'
    ) then
    raise exception 'Canonical invitation verification is not service-only';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'event_invite_tokens_one_open_link_idx'
      and indexdef like '%(space_id, event_id)%'
  ) or not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'event_invite_tokens_one_private_link_idx'
      and indexdef like '%(space_id, event_id, created_by, recipient_user_id)%'
  ) then
    raise exception 'Invite uniqueness is not scoped to its shared space';
  end if;

  if pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'public.register_push_device(text,text,jsonb,text)'::regprocedure
      ),
      'offset 8'
    ) = 0
    or pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'private.prune_revoked_event_invites()'::regprocedure
      ),
      'offset 200'
    ) = 0 then
    raise exception 'Push-device or invitation retention caps are missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'capture_shared_snapshot_tombstone_recipients'
      and tgrelid = 'public.app_snapshots'::regclass
      and not tgisinternal
  ) or not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'guard_initial_paid_transfer_attribution'
      and tgrelid = 'public.app_snapshots'::regclass
      and not tgisinternal
  ) then
    raise exception 'Shared-event security triggers are missing';
  end if;
end;
$$;

rollback;
