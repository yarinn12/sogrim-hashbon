create or replace function public.admin_shared_event_index_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'activeMembershipsMissingPersonalIndex', pg_catalog.count(*)::integer,
    'checkedAt', pg_catalog.now()
  )
  from private.shared_snapshot_members as member
  join public.app_snapshots as shared
    on shared.id = member.snapshot_id
   and shared.snapshot_kind = 'shared_event'
  join auth.users as account on account.id = member.user_id
  join public.app_snapshots as workspace
    on workspace.id = account.raw_user_meta_data ->> 'account_space_id'
   and workspace.snapshot_kind = 'workspace'
   and workspace.owner_user_id = account.id
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(shared.state -> 'events', '[]'::jsonb)
  ) as shared_event(value)
  where member.status = 'active'
    and coalesce(shared_event.value -> 'participantIds', '[]'::jsonb)
      ? member.participant_id
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(workspace.state -> 'events', '[]'::jsonb)
      ) as personal_event(value)
      where personal_event.value ->> 'id' = shared_event.value ->> 'id'
    );
$$;

revoke all on function public.admin_shared_event_index_health()
  from public, anon, authenticated;
grant execute on function public.admin_shared_event_index_health()
  to service_role;
