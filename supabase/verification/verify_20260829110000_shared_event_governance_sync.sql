do $$
declare
  mismatch_count integer;
begin
  if pg_catalog.to_regprocedure(
    'private.sync_shared_event_governance_to_workspaces(text,jsonb,timestamptz)'
  ) is null then
    raise exception 'Shared-event governance workspace sync helper is missing';
  end if;

  if pg_catalog.to_regprocedure(
    'private.mirror_shared_event_governance()'
  ) is null then
    raise exception 'Shared-event governance mirror trigger function is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'app_snapshots'
      and trigger.tgname = 'zz_mirror_shared_event_governance'
      and not trigger.tgisinternal
  ) then
    raise exception 'Shared-event governance mirror trigger is missing';
  end if;

  if (
    select function.provolatile
    from pg_catalog.pg_proc as function
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = function.pronamespace
    where namespace.nspname = 'private'
      and function.proname = 'is_safe_offline_guest_addition'
      and pg_catalog.pg_get_function_identity_arguments(function.oid) =
        'p_old_state jsonb, p_new_state jsonb'
  ) <> 's' then
    raise exception 'Participant-addition authorization helper must be stable';
  end if;

  select pg_catalog.count(*)::integer
  into mismatch_count
  from private.shared_snapshot_members as member
  join public.app_snapshots as shared
    on shared.id = member.snapshot_id
   and shared.snapshot_kind = 'shared_event'
  join public.app_snapshots as personal
    on personal.owner_user_id = member.user_id
   and personal.snapshot_kind = 'workspace'
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(personal.state -> 'events', '[]'::jsonb)
  ) as personal_event(value)
  where member.status = 'active'
    and member.removed_at is null
    and personal_event.value ->> 'id' =
      shared.state -> 'events' -> 0 ->> 'id'
    and (
      private.event_text_ids(personal_event.value, 'adminIds') is distinct from
        private.event_admin_ids(shared.state)
      or coalesce(
        (personal_event.value ->> 'adminsCanEditOnly')::boolean,
        false
      ) is distinct from coalesce(
        (shared.state -> 'events' -> 0 ->> 'adminsCanEditOnly')::boolean,
        false
      )
    );

  if mismatch_count <> 0 then
    raise exception 'Found % stale personal governance indexes', mismatch_count;
  end if;
end;
$$;
