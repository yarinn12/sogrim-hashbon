-- An event participant with a linked account must receive read access in the
-- same database transaction that publishes the canonical shared event.  The
-- notification endpoint remains useful for inbox/push delivery, but access no
-- longer depends on the client staying open long enough to call it.
create or replace function private.sync_shared_snapshot_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  event_exists boolean := new.state -> 'events' -> 0 is not null;
  active_ids text[] := case
    when not event_exists then '{}'::text[]
    else private.active_event_participant_ids(new.state)
  end;
  admin_ids text[] := case
    when not event_exists then '{}'::text[]
    else private.event_admin_ids(new.state)
  end;
begin
  if new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if actor_id is not null
    and actor_participant_id is not null
    and actor_participant_id = any(active_ids) then
    insert into private.shared_snapshot_members (
      snapshot_id, user_id, participant_id, role, status, pending_join_until
    ) values (
      new.id,
      actor_id,
      actor_participant_id,
      case when actor_participant_id = any(admin_ids) then 'admin' else 'member' end,
      'active',
      null
    )
    on conflict (snapshot_id, user_id) do nothing;
  end if;

  -- Account participant ids are canonical identities.  Grant every active,
  -- existing account participant membership atomically with the snapshot
  -- write, so a dropped notification request cannot strand the recipient.
  insert into private.shared_snapshot_members (
    snapshot_id, user_id, participant_id, role, status, removed_at,
    pending_join_until, updated_at
  )
  select
    new.id,
    account.id,
    active_participant.participant_id,
    case
      when active_participant.participant_id = any(admin_ids) then 'admin'
      else 'member'
    end,
    'active',
    null,
    null,
    pg_catalog.clock_timestamp()
  from pg_catalog.unnest(active_ids) as active_participant(participant_id)
  join auth.users as account
    on account.id = case
      when active_participant.participant_id ~* (
        '^account-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-' ||
        '[0-9a-f]{4}-[0-9a-f]{12}$'
      ) then pg_catalog.substr(active_participant.participant_id, 9)::uuid
      else null
    end
  on conflict (snapshot_id, user_id) do update
  set
    participant_id = excluded.participant_id,
    role = excluded.role,
    status = 'active',
    removed_at = null,
    pending_join_until = null,
    updated_at = excluded.updated_at;

  update private.shared_snapshot_members as member
  set
    status = case
      when member.participant_id = any(active_ids) then 'active'
      when event_exists
        and member.status = 'active'
        and member.pending_join_until > pg_catalog.clock_timestamp() then 'active'
      else 'removed'
    end,
    role = case
      when member.participant_id = any(admin_ids) then 'admin'
      else 'member'
    end,
    removed_at = case
      when member.participant_id = any(active_ids) then null
      when event_exists
        and member.status = 'active'
        and member.pending_join_until > pg_catalog.clock_timestamp() then null
      else coalesce(member.removed_at, pg_catalog.clock_timestamp())
    end,
    pending_join_until = case
      when member.participant_id = any(active_ids) then null
      when not event_exists then null
      when member.pending_join_until <= pg_catalog.clock_timestamp() then null
      else member.pending_join_until
    end,
    updated_at = pg_catalog.clock_timestamp()
  where member.snapshot_id = new.id;

  return new;
end;
$$;

drop trigger if exists sync_shared_snapshot_members on public.app_snapshots;
create trigger sync_shared_snapshot_members
  after insert or update on public.app_snapshots
  for each row execute function private.sync_shared_snapshot_members();

revoke all on function private.sync_shared_snapshot_members()
  from public, anon, authenticated;
