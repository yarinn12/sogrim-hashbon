do $$
declare
  definition text;
  overview jsonb;
  expected_missing bigint;
begin
  select pg_catalog.pg_get_functiondef(
    'public.admin_operational_health(integer)'::pg_catalog.regprocedure
  ) into definition;

  if pg_catalog.lower(definition) not like
      '%where account.confirmed_at is not null%and not exists%' then
    raise exception 'Operational health still counts incomplete signups as missing workspaces';
  end if;

  select pg_catalog.count(*)::bigint
  into expected_missing
  from auth.users as account
  where account.confirmed_at is not null
    and not exists (
      select 1
      from public.app_snapshots as workspace
      where workspace.owner_user_id = account.id
        and workspace.snapshot_kind = 'workspace'
    );

  select public.admin_operational_health(30) into overview;
  if (overview -> 'dataContinuity' ->> 'accountsWithoutWorkspace')::bigint
      is distinct from expected_missing then
    raise exception 'Operational workspace continuity does not match confirmed accounts';
  end if;
end
$$;
