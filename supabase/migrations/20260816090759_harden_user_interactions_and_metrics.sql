begin;

create table if not exists private.product_metric_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  event_count integer not null check (event_count >= 0),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table private.product_metric_rate_limits enable row level security;
alter table private.product_metric_rate_limits force row level security;
revoke all on table private.product_metric_rate_limits
  from public, anon, authenticated;
grant select, insert, update, delete on table private.product_metric_rate_limits
  to service_role;

create or replace function public.reserve_product_metric_batch(
  p_user_id uuid,
  p_event_count integer,
  p_window_seconds integer default 60,
  p_event_limit integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  rate_limit private.product_metric_rate_limits%rowtype;
  current_time timestamptz := pg_catalog.clock_timestamp();
begin
  if p_user_id is null
    or p_event_count not between 1 and 20
    or p_window_seconds not between 10 and 3600
    or p_event_limit not between 20 and 1000 then
    raise exception 'Invalid product metric capacity request'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('product-metrics:' || p_user_id::text, 0)
  );

  select record.* into rate_limit
  from private.product_metric_rate_limits as record
  where record.user_id = p_user_id
  for update;

  if rate_limit.user_id is null
    or rate_limit.window_started_at <= current_time - pg_catalog.make_interval(secs => p_window_seconds) then
    insert into private.product_metric_rate_limits (
      user_id,
      window_started_at,
      event_count,
      updated_at
    ) values (
      p_user_id,
      current_time,
      p_event_count,
      current_time
    )
    on conflict (user_id) do update
    set
      window_started_at = excluded.window_started_at,
      event_count = excluded.event_count,
      updated_at = excluded.updated_at;
    return true;
  end if;

  if rate_limit.event_count + p_event_count > p_event_limit then
    return false;
  end if;

  update private.product_metric_rate_limits
  set
    event_count = event_count + p_event_count,
    updated_at = current_time
  where user_id = p_user_id;
  return true;
end;
$$;

revoke all on function public.reserve_product_metric_batch(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_product_metric_batch(uuid, integer, integer, integer)
  to service_role;

create or replace function public.block_user(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_profile public.user_profiles%rowtype;
  has_known_relationship boolean := false;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_target_user_id is null or p_target_user_id = actor_id then
    raise exception 'Blocked account is invalid'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.friendships as friendship
    where friendship.user_low = least(actor_id, p_target_user_id)
      and friendship.user_high = greatest(actor_id, p_target_user_id)
      and friendship.status in ('pending', 'accepted')
  ) or exists (
    select 1
    from private.shared_snapshot_members as actor_member
    join private.shared_snapshot_members as target_member
      on target_member.snapshot_id = actor_member.snapshot_id
    where actor_member.user_id = actor_id
      and target_member.user_id = p_target_user_id
  ) into has_known_relationship;

  if not has_known_relationship then
    raise exception 'Blocked account is not connected to this account'
      using errcode = '42501';
  end if;

  select profile.*
  into target_profile
  from public.user_profiles as profile
  where profile.user_id = p_target_user_id;

  if target_profile.user_id is null then
    raise exception 'Blocked account was not found'
      using errcode = 'P0001';
  end if;

  insert into public.user_blocks (
    blocker_user_id,
    blocked_user_id,
    blocked_display_name,
    blocked_username
  ) values (
    actor_id,
    p_target_user_id,
    target_profile.display_name,
    target_profile.username
  )
  on conflict (blocker_user_id, blocked_user_id)
  do update set
    blocked_display_name = excluded.blocked_display_name,
    blocked_username = excluded.blocked_username,
    created_at = pg_catalog.now();

  delete from public.friendships as friendship
  where friendship.user_low = least(actor_id, p_target_user_id)
    and friendship.user_high = greatest(actor_id, p_target_user_id);

  return pg_catalog.jsonb_build_object(
    'blocked_user_id', p_target_user_id,
    'status', 'blocked'
  );
end;
$$;

revoke all on function public.block_user(uuid) from public, anon, authenticated;
grant execute on function public.block_user(uuid) to authenticated, service_role;

create or replace function private.revoke_event_invites_after_member_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_active_ids text[];
  new_active_ids text[];
  removed_event_id text;
begin
  if new.snapshot_kind <> 'shared_event'
    or old.state -> 'events' -> 0 is null
    or new.state -> 'events' -> 0 is null then
    return new;
  end if;

  old_active_ids := private.active_event_participant_ids(old.state);
  new_active_ids := private.active_event_participant_ids(new.state);
  if not exists (
    select 1
    from pg_catalog.unnest(old_active_ids) as old_id(value)
    where not (old_id.value = any(new_active_ids))
  ) then
    return new;
  end if;

  removed_event_id := new.state -> 'events' -> 0 ->> 'id';
  update public.event_invite_tokens as invite
  set
    revoked_at = coalesce(revoked_at, pg_catalog.clock_timestamp()),
    updated_at = pg_catalog.clock_timestamp()
  where invite.event_id = removed_event_id
    and invite.revoked_at is null;
  return new;
end;
$$;

drop trigger if exists revoke_event_invites_after_member_removal
  on public.app_snapshots;
create trigger revoke_event_invites_after_member_removal
  after update of state on public.app_snapshots
  for each row execute function private.revoke_event_invites_after_member_removal();

revoke all on function private.revoke_event_invites_after_member_removal()
  from public, anon, authenticated;

commit;
