begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop policy if exists app_snapshots_update on public.app_snapshots;
create policy app_snapshots_update
  on public.app_snapshots
  for update
  to authenticated
  using (
    owner_user_id is null
    and access_key_hash = (select public.request_space_key_hash())
  )
  with check (
    access_key_hash = (select public.request_space_key_hash())
    and owner_user_id is null
  );

drop trigger if exists guard_shared_snapshot_update on public.app_snapshots;
drop trigger if exists sync_shared_snapshot_members on public.app_snapshots;
drop trigger if exists register_shared_snapshot_creator on public.app_snapshots;
drop trigger if exists classify_snapshot_kind on public.app_snapshots;

revoke all on function public.join_shared_event(text)
  from public, anon, authenticated;
revoke all on function public.can_write_shared_snapshot(text)
  from public, anon, authenticated;
revoke all on function public.can_bootstrap_shared_snapshot(text)
  from public, anon, authenticated;

commit;

-- Data is intentionally preserved: snapshot_kind and membership rows remain so a
-- corrected roll-forward can resume without reconstructing access history.
-- This rollback restores key-based shared writes and therefore reopens the
-- removed-member risk. Use it only during an incident window.
