do $$
declare
  select_policy text;
  read_function text;
begin
  if to_regprocedure(
    'public.can_read_deleted_shared_snapshot(text)'
  ) is null then
    raise exception 'Deleted shared-event read function is missing';
  end if;

  read_function := pg_catalog.pg_get_functiondef(
    'public.can_read_deleted_shared_snapshot(text)'::regprocedure
  );
  if pg_catalog.strpos(read_function, 'private.shared_snapshot_members') = 0
    or pg_catalog.strpos(read_function, 'auth.uid()') = 0 then
    raise exception 'Deleted shared-event reads are not membership-bound';
  end if;

  if pg_catalog.has_function_privilege(
      'anon',
      'public.can_read_deleted_shared_snapshot(text)',
      'execute'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated',
      'public.can_read_deleted_shared_snapshot(text)',
      'execute'
    ) then
    raise exception 'Deleted shared-event read grants are unsafe';
  end if;

  select policy.qual
  into select_policy
  from pg_catalog.pg_policies as policy
  where policy.schemaname = 'public'
    and policy.tablename = 'app_snapshots'
    and policy.policyname = 'app_snapshots_member_select';

  if select_policy is null
    or pg_catalog.strpos(
      select_policy,
      'can_read_deleted_shared_snapshot'
    ) = 0
    or pg_catalog.strpos(select_policy, 'deletedEvents') = 0 then
    raise exception 'Deleted shared-event select policy is incomplete';
  end if;
end;
$$;

select 'ready' as verification_status;
