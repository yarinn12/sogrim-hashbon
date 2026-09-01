begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.reconcile_shared_snapshot_member_workspaces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_actor_id uuid := auth.uid();
  active_member record;
begin
  if new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  -- Expense, note, settlement and presentation edits do not change who can
  -- discover an event. Avoid scanning every member workspace for those very
  -- frequent writes; membership changes still reconcile atomically below.
  if tg_op = 'UPDATE'
    and old.snapshot_kind is not distinct from new.snapshot_kind
    and old.state -> 'participants' is not distinct from
      new.state -> 'participants'
    and old.state #> '{events,0,participantIds}' is not distinct from
      new.state #> '{events,0,participantIds}'
    and old.state #> '{events,0,inactiveParticipantIds}' is not distinct from
      new.state #> '{events,0,inactiveParticipantIds}'
    and old.state #> '{events,0,participantAccountLinks}' is not distinct from
      new.state #> '{events,0,participantAccountLinks}' then
    return new;
  end if;

  for active_member in
    select distinct member.user_id
    from private.shared_snapshot_members as member
    where member.snapshot_id = new.id
      and member.status = 'active'
      and member.removed_at is null
      and (
        original_actor_id is null
        or member.user_id <> original_actor_id
      )
    order by member.user_id
  loop
    perform public.reconcile_shared_event_indexes_for_member(
      active_member.user_id
    );
  end loop;

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(original_actor_id::text, ''),
    true
  );
  return new;
exception when others then
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(original_actor_id::text, ''),
    true
  );
  raise;
end;
$$;

revoke all on function private.reconcile_shared_snapshot_member_workspaces()
  from public, anon, authenticated;

commit;
