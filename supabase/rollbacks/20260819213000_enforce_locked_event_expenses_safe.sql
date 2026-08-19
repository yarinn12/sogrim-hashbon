begin;

drop trigger if exists prevent_locked_event_expense_updates on public.app_snapshots;
drop function if exists private.prevent_locked_event_expense_updates();

commit;
