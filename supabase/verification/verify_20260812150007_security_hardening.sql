do $$
declare
  update_policy_using text;
  update_policy_check text;
begin
  if pg_catalog.to_regclass('private.signup_workspace_claims') is null then
    raise exception 'signup workspace claims table is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    where relation.oid = 'private.signup_workspace_claims'::regclass
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ) then
    raise exception 'signup workspace claims RLS is not forced';
  end if;

  if pg_catalog.has_schema_privilege('anon', 'private', 'usage')
    or pg_catalog.has_schema_privilege('authenticated', 'private', 'usage')
    or pg_catalog.has_table_privilege(
      'anon', 'private.signup_workspace_claims', 'select'
    )
    or pg_catalog.has_table_privilege(
      'authenticated', 'private.signup_workspace_claims', 'select'
    ) then
    raise exception 'signup workspace claims are exposed to a client role';
  end if;

  if pg_catalog.to_regprocedure('private.claim_signup_workspace()') is null
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger
      where trigger.tgname = 'claim_signup_workspace_on_user_create'
        and trigger.tgrelid = 'auth.users'::regclass
        and not trigger.tgisinternal
    ) then
    raise exception 'signup workspace claim trigger is incomplete';
  end if;

  if pg_catalog.has_function_privilege(
    'anon', 'private.claim_signup_workspace()', 'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated', 'private.claim_signup_workspace()', 'execute'
  ) then
    raise exception 'signup workspace claim function is exposed to a client role';
  end if;

  select policy.qual, policy.with_check
  into update_policy_using, update_policy_check
  from pg_catalog.pg_policies as policy
  where policy.schemaname = 'public'
    and policy.tablename = 'app_snapshots'
    and policy.policyname = 'app_snapshots_update';

  if update_policy_using is null
    or pg_catalog.lower(update_policy_using) not like '%owner_user_id is null%'
    or update_policy_check is null
    or pg_catalog.lower(update_policy_check) not like '%owner_user_id is null%' then
    raise exception 'shared snapshot update policy does not isolate owned workspaces';
  end if;

  if pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.request_friendship(text)'::regprocedure
    ),
    'pg_advisory_xact_lock'
  ) = 0 then
    raise exception 'friendship pair transaction lock is missing';
  end if;

  if pg_catalog.has_function_privilege(
    'anon', 'public.request_friendship(text)', 'execute'
  ) or not pg_catalog.has_function_privilege(
    'authenticated', 'public.request_friendship(text)', 'execute'
  ) then
    raise exception 'friendship function grants are incorrect';
  end if;
end;
$$;

select
  '20260812150007' as migration_version,
  'ready' as verification_status;
