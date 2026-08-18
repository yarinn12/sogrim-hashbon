begin;

create or replace function public.can_read_deleted_shared_snapshot(p_snapshot_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.shared_snapshot_members as member
      where member.snapshot_id = p_snapshot_id
        and member.user_id = (select auth.uid())
    );
$$;

revoke all on function public.can_read_deleted_shared_snapshot(text)
  from public, anon;
grant execute on function public.can_read_deleted_shared_snapshot(text)
  to authenticated;

drop policy if exists app_snapshots_member_select on public.app_snapshots;
create policy app_snapshots_member_select
  on public.app_snapshots
  for select
  to authenticated
  using (
    snapshot_kind = 'shared_event'
    and (
      (select public.can_write_shared_snapshot(id))
      or (
        state -> 'events' -> 0 is null
        and pg_catalog.jsonb_typeof(state -> 'deletedEvents') = 'array'
        and pg_catalog.jsonb_array_length(state -> 'deletedEvents') > 0
        and (select public.can_read_deleted_shared_snapshot(id))
      )
    )
  );

commit;
