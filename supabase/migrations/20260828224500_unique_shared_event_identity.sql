begin;

set local lock_timeout = '10s';
set local statement_timeout = '90s';

-- One logical event must have one canonical shared snapshot. Without this
-- boundary, two devices can publish the same local event under different
-- snapshot ids and split the participants between two invisible copies.
create unique index if not exists app_snapshots_shared_event_event_id_uidx
  on public.app_snapshots ((state #>> '{events,0,id}'))
  where snapshot_kind = 'shared_event'
    and nullif(state #>> '{events,0,id}', '') is not null;

comment on index public.app_snapshots_shared_event_event_id_uidx is
  'Prevents two active shared snapshots from representing the same logical event id.';

commit;
