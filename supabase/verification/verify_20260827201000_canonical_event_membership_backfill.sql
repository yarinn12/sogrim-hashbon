do $$
declare
  missing_members integer;
begin
  with active_account_members as (
    select
      snapshot.id as snapshot_id,
      account.id as user_id
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
  select pg_catalog.count(*)
  into missing_members
  from active_account_members as active
  left join private.shared_snapshot_members as member
    on member.snapshot_id = active.snapshot_id
    and member.user_id = active.user_id
    and member.status = 'active'
  where member.user_id is null;

  if missing_members <> 0 then
    raise exception
      'Canonical shared-event membership backfill left % active accounts missing',
      missing_members;
  end if;
end;
$$;

select 'ready' as verification_status;
