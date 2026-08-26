-- Safe rollback: restore update-only membership synchronization.  Existing
-- memberships are intentionally retained; removing them could revoke valid
-- event access.
drop trigger if exists sync_shared_snapshot_members on public.app_snapshots;
create trigger sync_shared_snapshot_members
  after update on public.app_snapshots
  for each row execute function private.sync_shared_snapshot_members();
