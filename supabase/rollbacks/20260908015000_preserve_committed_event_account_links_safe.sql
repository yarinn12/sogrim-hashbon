begin;
set local lock_timeout = '5s';
-- Restore prior receipt-update behavior; existing receipts and money are retained.
drop trigger if exists aa_preserve_committed_event_account_links on public.app_snapshots;
drop function if exists private.preserve_committed_event_account_links();
commit;
