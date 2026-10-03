do $$
declare
  definition text := pg_catalog.pg_get_functiondef('private.guard_shared_snapshot_update()'::regprocedure);
begin
  if pg_catalog.strpos(definition, 'actor_is_leaving and private.is_safe_self_leave_content(') = 0
    or pg_catalog.strpos(definition, 'pg_catalog.cardinality(new_admin_ids) > 0') = 0
    or not exists (select 1 from pg_catalog.pg_trigger
      where tgrelid = 'public.app_snapshots'::regclass
        and tgname = 'guard_shared_snapshot_update' and tgenabled = 'O')
    or not exists (select 1 from pg_catalog.pg_trigger
      where tgrelid = 'public.app_snapshots'::regclass
        and tgname = 'guard_shared_activity_attribution' and tgenabled = 'O')
    or pg_catalog.has_function_privilege('anon', 'private.is_safe_self_leave_content(jsonb,jsonb,text,text)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'private.is_safe_self_leave_content(jsonb,jsonb,text,text)', 'execute') then
    raise exception 'Guarded self-leave receipt protection is missing or incorrectly exposed';
  end if;
end;
$$;
