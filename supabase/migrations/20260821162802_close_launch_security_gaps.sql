begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Preserve completed-payment history and bound the JSON work performed while
-- a shared event row is locked. These checks run before the existing financial
-- validator so unsafe payloads fail cheaply and consistently.
create or replace function private.has_preserved_paid_transfer_history(
  p_old_state jsonb,
  p_new_state jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with old_event as (
    select coalesce(p_old_state -> 'events' -> 0, '{}'::jsonb) as value
  ),
  new_event as (
    select coalesce(p_new_state -> 'events' -> 0, '{}'::jsonb) as value
  ),
  old_paid_transfers as (
    select transfer.value
    from old_event,
      pg_catalog.jsonb_array_elements(
        coalesce(old_event.value -> 'transfers', '[]'::jsonb)
      ) as transfer(value)
    where transfer.value ->> 'status' = 'paid'
  ),
  old_paid_statuses as (
    select status.value
    from old_event,
      pg_catalog.jsonb_array_elements(
        coalesce(old_event.value -> 'transferStatusUpdates', '[]'::jsonb)
      ) as status(value)
    where status.value ->> 'status' = 'paid'
  )
  select
    not exists (
      select 1
      from old_paid_transfers as old_transfer
      where not exists (
        select 1
        from new_event,
          pg_catalog.jsonb_array_elements(
            coalesce(new_event.value -> 'transfers', '[]'::jsonb)
          ) as new_transfer(value)
        where new_transfer.value ->> 'id' = old_transfer.value ->> 'id'
          and new_transfer.value is not distinct from old_transfer.value
      )
    )
    and not exists (
      select 1
      from old_paid_statuses as old_status
      where not exists (
        select 1
        from new_event,
          pg_catalog.jsonb_array_elements(
            coalesce(new_event.value -> 'transferStatusUpdates', '[]'::jsonb)
          ) as new_status(value)
        where new_status.value ->> 'id' = old_status.value ->> 'id'
          and new_status.value is not distinct from old_status.value
      )
    );
$$;

create or replace function private.guard_shared_event_history_and_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) > 500
    or pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) > 500 then
    raise exception 'Shared event transfer history is too large'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and not private.has_preserved_paid_transfer_history(old.state, new.state) then
    raise exception 'Completed payment history cannot be removed or rewritten'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_shared_event_history_and_limits
  on public.app_snapshots;
create trigger guard_shared_event_history_and_limits
  before insert or update of state, owner_user_id, snapshot_kind
  on public.app_snapshots
  for each row execute function private.guard_shared_event_history_and_limits();

revoke all on function private.has_preserved_paid_transfer_history(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_history_and_limits()
  from public, anon, authenticated;

-- Serialize friendship and block mutations on the same account pair. The
-- friendship trigger rechecks blocks while holding that lock, closing the
-- request-vs-block race without changing the public RPC contracts.
create or replace function private.guard_friendship_pair_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  low_user uuid := least(new.requester_id, new.addressee_id);
  high_user uuid := greatest(new.requester_id, new.addressee_id);
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'friendship:' || low_user::text || ':' || high_user::text,
      0
    )
  );

  if exists (
    select 1
    from public.user_blocks as user_block
    where (
      user_block.blocker_user_id = low_user
      and user_block.blocked_user_id = high_user
    ) or (
      user_block.blocker_user_id = high_user
      and user_block.blocked_user_id = low_user
    )
  ) then
    raise exception 'Friendship is unavailable for blocked accounts'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.lock_user_block_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'friendship:' || least(new.blocker_user_id, new.blocked_user_id)::text || ':' ||
      greatest(new.blocker_user_id, new.blocked_user_id)::text,
      0
    )
  );
  return new;
end;
$$;

drop trigger if exists guard_friendship_pair_write on public.friendships;
create trigger guard_friendship_pair_write
  before insert or update of requester_id, addressee_id, status
  on public.friendships
  for each row execute function private.guard_friendship_pair_write();

drop trigger if exists lock_user_block_pair on public.user_blocks;
create trigger lock_user_block_pair
  before insert or update of blocker_user_id, blocked_user_id
  on public.user_blocks
  for each row execute function private.lock_user_block_pair();

revoke all on function private.guard_friendship_pair_write()
  from public, anon, authenticated;
revoke all on function private.lock_user_block_pair()
  from public, anon, authenticated;

-- Removed members must not regain visibility merely because an event was
-- deleted. Active members retain the existing tombstone-read behavior.
create or replace function public.can_read_deleted_shared_snapshot(p_snapshot_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.shared_snapshot_members as member
      where member.snapshot_id = p_snapshot_id
        and member.user_id = (select auth.uid())
        and member.status = 'active'
    );
$$;

revoke all on function public.can_read_deleted_shared_snapshot(text)
  from public, anon;
grant execute on function public.can_read_deleted_shared_snapshot(text)
  to authenticated, service_role;

-- Ownerless workspaces are legacy/provisioned records. Authenticated clients
-- may create only their own personal workspace; service-role provisioning is
-- unaffected by RLS.
drop policy if exists app_snapshots_insert on public.app_snapshots;
create policy app_snapshots_insert
  on public.app_snapshots
  for insert
  to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and access_key_hash = (select public.request_space_key_hash())
  );

-- Keep a small audit tail for rotated open links instead of growing one row
-- forever on every rotation.
create or replace function private.prune_revoked_event_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'open' then
    delete from public.event_invite_tokens as invite
    where invite.id in (
      select stale.id
      from public.event_invite_tokens as stale
      where stale.event_id = new.event_id
        and stale.kind = 'open'
        and stale.revoked_at is not null
      order by stale.updated_at desc, stale.id desc
      offset 12
    );
  end if;
  return new;
end;
$$;

drop trigger if exists prune_revoked_event_invites on public.event_invite_tokens;
create trigger prune_revoked_event_invites
  after insert on public.event_invite_tokens
  for each row execute function private.prune_revoked_event_invites();

revoke all on function private.prune_revoked_event_invites()
  from public, anon, authenticated;

-- Notification delivery must be bound to the canonical shared membership
-- table, not only to account-shaped participant ids inside event JSON.
create or replace function public.verify_shared_event_notification_parties(
  p_snapshot_id text,
  p_sender_user_id uuid,
  p_recipient_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_snapshots as snapshot
    where snapshot.id = p_snapshot_id
      and snapshot.snapshot_kind = 'shared_event'
      and exists (
        select 1
        from private.shared_snapshot_members as sender
        where sender.snapshot_id = snapshot.id
          and sender.user_id = p_sender_user_id
          and sender.status = 'active'
      )
      and exists (
        select 1
        from private.shared_snapshot_members as recipient
        where recipient.snapshot_id = snapshot.id
          and recipient.user_id = p_recipient_user_id
          and recipient.status = 'active'
      )
  );
$$;

revoke all on function public.verify_shared_event_notification_parties(
  text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.verify_shared_event_notification_parties(
  text, uuid, uuid
) to service_role;

commit;
