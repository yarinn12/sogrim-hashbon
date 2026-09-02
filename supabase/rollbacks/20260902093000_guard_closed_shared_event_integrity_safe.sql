drop trigger if exists guard_closed_shared_event_integrity
  on public.app_snapshots;
drop function if exists private.guard_closed_shared_event_integrity();
