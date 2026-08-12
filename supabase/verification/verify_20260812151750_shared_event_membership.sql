do $$
declare
  update_policy_using text;
  update_policy_check text;
  join_function text;
  guard_function text;
begin
  if pg_catalog.to_regclass('private.shared_snapshot_members') is null then
    raise exception 'shared snapshot membership table is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    where relation.oid = 'private.shared_snapshot_members'::regclass
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ) then
    raise exception 'shared snapshot membership RLS is not forced';
  end if;

  if pg_catalog.has_table_privilege(
    'anon',
    'private.shared_snapshot_members',
    'select,insert,update,delete'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'private.shared_snapshot_members',
    'select,insert,update,delete'
  ) then
    raise exception 'shared snapshot memberships are exposed to a client role';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.app_snapshots'::regclass
      and attribute.attname = 'snapshot_kind'
      and not attribute.attisdropped
  ) then
    raise exception 'snapshot kind discriminator is missing';
  end if;

  select policy.qual, policy.with_check
  into update_policy_using, update_policy_check
  from pg_catalog.pg_policies as policy
  where policy.schemaname = 'public'
    and policy.tablename = 'app_snapshots'
    and policy.policyname = 'app_snapshots_update';

  if update_policy_using is null
    or pg_catalog.strpos(update_policy_using, 'snapshot_kind') = 0
    or pg_catalog.strpos(update_policy_using, 'can_write_shared_snapshot') = 0
    or pg_catalog.strpos(update_policy_using, 'can_bootstrap_shared_snapshot') = 0
    or update_policy_check is null
    or pg_catalog.strpos(update_policy_check, 'can_write_shared_snapshot') = 0
    or pg_catalog.strpos(update_policy_check, 'can_bootstrap_shared_snapshot') = 0 then
    raise exception 'shared snapshot update policy does not require active membership';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid = 'public.app_snapshots'::regclass
      and trigger.tgname = 'guard_shared_snapshot_update'
      and not trigger.tgisinternal
  ) or not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid = 'public.app_snapshots'::regclass
      and trigger.tgname = 'sync_shared_snapshot_members'
      and not trigger.tgisinternal
  ) then
    raise exception 'shared snapshot membership triggers are incomplete';
  end if;

  join_function := pg_catalog.pg_get_functiondef(
    'public.join_shared_event(text)'::regprocedure
  );
  guard_function := pg_catalog.pg_get_functiondef(
    'private.guard_shared_snapshot_update()'::regprocedure
  );

  if pg_catalog.strpos(join_function, 'existing_member.status = ''removed''') = 0
    or pg_catalog.strpos(join_function, 'request_space_key_hash') = 0 then
    raise exception 'shared event join does not reject removed members safely';
  end if;

  if pg_catalog.strpos(guard_function, 'Only an event admin can manage event membership') = 0
    or pg_catalog.strpos(guard_function, 'Only an event admin can delete a shared event') = 0 then
    raise exception 'shared event membership guard is incomplete';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.join_shared_event(text)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'authenticated',
    'public.join_shared_event(text)',
    'execute'
  ) then
    raise exception 'shared event join grants are incorrect';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.can_bootstrap_shared_snapshot(text)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'authenticated',
    'public.can_bootstrap_shared_snapshot(text)',
    'execute'
  ) then
    raise exception 'legacy shared membership bootstrap grants are incorrect';
  end if;
end;
$$;

select
  '20260812151750' as migration_version,
  count(*) filter (where snapshot_kind = 'shared_event') as shared_snapshots,
  count(*) filter (
    where snapshot_kind = 'shared_event'
      and not exists (
        select 1
        from private.shared_snapshot_members as member
        where member.snapshot_id = app_snapshots.id
          and member.status = 'active'
      )
  ) as legacy_shared_snapshots_awaiting_first_member,
  'ready' as verification_status
from public.app_snapshots;
