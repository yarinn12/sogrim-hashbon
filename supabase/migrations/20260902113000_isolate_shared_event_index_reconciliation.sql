begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A member's damaged or temporarily locked personal workspace must never roll
-- back the canonical event membership that lets every device recover it. Keep
-- the immediate happy path, but isolate each personal-index repair and let the
-- existing foreground membership recovery retry any deferred member later.
create or replace function private.reconcile_shared_snapshot_member_workspaces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_actor_id uuid := auth.uid();
  old_active_ids text[] := '{}'::text[];
  active_member record;
  previous_lock_timeout text := pg_catalog.current_setting('lock_timeout', true);
begin
  if new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    old_active_ids := private.active_event_participant_ids(old.state);

    -- Profile, expense, note, settlement, settings and presentation edits do
    -- not change event discovery. Only a membership-set change needs this
    -- immediate index path.
    if old.snapshot_kind is not distinct from new.snapshot_kind
      and old.state #> '{events,0,participantIds}' is not distinct from
        new.state #> '{events,0,participantIds}'
      and old.state #> '{events,0,inactiveParticipantIds}' is not distinct from
        new.state #> '{events,0,inactiveParticipantIds}' then
      return new;
    end if;
  end if;

  for active_member in
    select distinct member.user_id, member.participant_id
    from private.shared_snapshot_members as member
    where member.snapshot_id = new.id
      and member.status = 'active'
      and member.removed_at is null
      and not (member.participant_id = any(old_active_ids))
      and (
        original_actor_id is null
        or member.user_id <> original_actor_id
      )
    order by member.user_id, member.participant_id
  loop
    begin
      perform pg_catalog.set_config('lock_timeout', '1s', true);
      perform public.reconcile_shared_event_indexes_for_member(
        active_member.user_id
      );
      perform pg_catalog.set_config(
        'request.jwt.claim.sub',
        coalesce(original_actor_id::text, ''),
        true
      );
      perform pg_catalog.set_config(
        'lock_timeout',
        coalesce(previous_lock_timeout, '0'),
        true
      );
    exception when others then
      perform pg_catalog.set_config(
        'request.jwt.claim.sub',
        coalesce(original_actor_id::text, ''),
        true
      );
      perform pg_catalog.set_config(
        'lock_timeout',
        coalesce(previous_lock_timeout, '0'),
        true
      );
      raise warning
        'Shared-event index reconciliation deferred for member % (%: %)',
        active_member.user_id,
        sqlstate,
        sqlerrm;
    end;
  end loop;

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(original_actor_id::text, ''),
    true
  );
  perform pg_catalog.set_config(
    'lock_timeout',
    coalesce(previous_lock_timeout, '0'),
    true
  );
  return new;
exception when others then
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(original_actor_id::text, ''),
    true
  );
  perform pg_catalog.set_config(
    'lock_timeout',
    coalesce(previous_lock_timeout, '0'),
    true
  );
  raise;
end;
$$;

revoke all on function private.reconcile_shared_snapshot_member_workspaces()
  from public, anon, authenticated;

commit;
