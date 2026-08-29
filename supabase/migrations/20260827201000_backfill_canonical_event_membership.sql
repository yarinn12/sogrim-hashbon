-- Backfill canonical membership for shared events that existed before the
-- automatic account-member grant trigger was installed.
with active_account_members as (
  select
    snapshot.id as snapshot_id,
    account.id as user_id,
    active_participant.participant_id,
    case
      when active_participant.participant_id = any(
        private.event_admin_ids(snapshot.state)
      ) then 'admin'
      else 'member'
    end as role
  from public.app_snapshots as snapshot
  cross join lateral pg_catalog.unnest(
    private.active_event_participant_ids(snapshot.state)
  ) as active_participant(participant_id)
  join auth.users as account
    on account.id = case
      when active_participant.participant_id ~* (
        '^account-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-' ||
        '[0-9a-f]{4}-[0-9a-f]{12}$'
      ) then pg_catalog.substr(active_participant.participant_id, 9)::uuid
      else null
    end
  where snapshot.snapshot_kind = 'shared_event'
    and snapshot.state -> 'events' -> 0 is not null
)
insert into private.shared_snapshot_members (
  snapshot_id,
  user_id,
  participant_id,
  role,
  status,
  removed_at,
  pending_join_until,
  updated_at
)
select
  member.snapshot_id,
  member.user_id,
  member.participant_id,
  member.role,
  'active',
  null,
  null,
  pg_catalog.clock_timestamp()
from active_account_members as member
on conflict (snapshot_id, user_id) do update
set
  participant_id = excluded.participant_id,
  role = excluded.role,
  status = 'active',
  removed_at = null,
  pending_join_until = null,
  updated_at = excluded.updated_at;
