do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename = 'app_snapshots'
      and policy.policyname = 'app_snapshots_select'
      and pg_catalog.lower(policy.qual) like '%owner_user_id is null%'
      and pg_catalog.lower(policy.qual) like '%snapshot_kind = ''workspace''%'
  ) then
    raise exception 'Legacy workspace reads are not scoped to ownerless workspaces';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename = 'app_snapshots'
      and policy.policyname = 'app_snapshots_member_select'
      and pg_catalog.lower(policy.qual) like '%snapshot_kind = ''shared_event''%'
      and pg_catalog.lower(policy.qual) like '%can_write_shared_snapshot%'
  ) then
    raise exception 'Shared-event reads do not require active membership';
  end if;

  if to_regprocedure('public.redeem_event_invite_membership(uuid,text,uuid)') is null
    or pg_catalog.has_function_privilege(
      'anon',
      'public.redeem_event_invite_membership(uuid,text,uuid)',
      'execute'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      'public.redeem_event_invite_membership(uuid,text,uuid)',
      'execute'
    )
    or not pg_catalog.has_function_privilege(
      'service_role',
      'public.redeem_event_invite_membership(uuid,text,uuid)',
      'execute'
    ) then
    raise exception 'Invite membership redemption privileges are unsafe';
  end if;

  if pg_catalog.strpos(
      pg_catalog.pg_get_functiondef('public.join_shared_event(text)'::regprocedure),
      'request_space_key_hash'
    ) > 0
    or pg_catalog.strpos(
      pg_catalog.pg_get_functiondef('public.join_shared_event(text)'::regprocedure),
      'existing_member.status <> ''active'''
    ) = 0 then
    raise exception 'Retained keys can still bootstrap shared-event membership';
  end if;

  if pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'public.redeem_event_invite_membership(uuid,text,uuid)'::regprocedure
      ),
      'invite.revoked_at is not null'
    ) = 0
    or pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'public.redeem_event_invite_membership(uuid,text,uuid)'::regprocedure
      ),
      'existing_member.status = ''removed'''
    ) = 0 then
    raise exception 'Invite redemption does not fail closed';
  end if;
end;
$$;
