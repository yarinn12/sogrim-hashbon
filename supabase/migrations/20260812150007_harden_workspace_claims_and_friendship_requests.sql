begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if pg_catalog.to_regclass('public.app_snapshots') is null then
    raise exception 'public.app_snapshots must exist before applying this migration';
  end if;

  if pg_catalog.to_regclass('public.friendships') is null
    or pg_catalog.to_regclass('public.friend_invite_codes') is null
    or pg_catalog.to_regclass('public.user_blocks') is null then
    raise exception 'friendship tables must exist before applying this migration';
  end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.signup_workspace_claims (
  snapshot_id text primary key
    references public.app_snapshots(id) on delete cascade,
  access_key_hash text not null check (char_length(access_key_hash) = 64),
  created_at timestamptz not null default pg_catalog.now()
);

alter table private.signup_workspace_claims enable row level security;
alter table private.signup_workspace_claims force row level security;

revoke all on table private.signup_workspace_claims
  from public, anon, authenticated;

create or replace function private.claim_signup_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  space_id text := nullif(new.raw_user_meta_data ->> 'account_space_id', '');
  space_key text := nullif(new.raw_user_meta_data ->> 'account_space_key', '');
  claimed_snapshot_id text;
begin
  if space_id is null or space_key is null then
    return new;
  end if;

  update public.app_snapshots as snapshot
  set owner_user_id = new.id
  from private.signup_workspace_claims as claim
  where snapshot.owner_user_id is null
    and snapshot.id = space_id
    and claim.snapshot_id = snapshot.id
    and claim.access_key_hash = snapshot.access_key_hash
    and snapshot.access_key_hash = pg_catalog.encode(
      extensions.digest(space_key, 'sha256'),
      'hex'
    )
  returning snapshot.id into claimed_snapshot_id;

  if claimed_snapshot_id is not null then
    delete from private.signup_workspace_claims
    where snapshot_id = claimed_snapshot_id;
  end if;

  return new;
end;
$$;

revoke all on function private.claim_signup_workspace()
  from public, anon, authenticated;

drop trigger if exists claim_signup_workspace_on_user_create on auth.users;
create trigger claim_signup_workspace_on_user_create
  after insert on auth.users
  for each row execute function private.claim_signup_workspace();

drop policy if exists app_snapshots_update on public.app_snapshots;
create policy app_snapshots_update
  on public.app_snapshots
  for update
  to authenticated
  using (
    owner_user_id is null
    and access_key_hash = (select public.request_space_key_hash())
  )
  with check (
    access_key_hash = (select public.request_space_key_hash())
    and owner_user_id is null
  );

create or replace function public.request_friendship(
  p_friend_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_id uuid;
  friendship public.friendships%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select invite.user_id
  into target_id
  from public.friend_invite_codes as invite
  where invite.code = pg_catalog.lower(pg_catalog.btrim(p_friend_code));

  if target_id is null then
    raise exception 'Friend code was not found'
      using errcode = 'P0001';
  end if;

  if target_id = actor_id then
    raise exception 'You cannot send a friend request to yourself'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.user_blocks as user_block
    where (
      user_block.blocker_user_id = actor_id
      and user_block.blocked_user_id = target_id
    ) or (
      user_block.blocker_user_id = target_id
      and user_block.blocked_user_id = actor_id
    )
  ) then
    raise exception 'Friendship is unavailable for blocked accounts'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'friendship:' || least(actor_id, target_id)::text || ':' ||
      greatest(actor_id, target_id)::text,
      0
    )
  );

  select relation.*
  into friendship
  from public.friendships as relation
  where relation.user_low = least(actor_id, target_id)
    and relation.user_high = greatest(actor_id, target_id)
  for update;

  if friendship.id is null then
    insert into public.friendships (
      requester_id,
      addressee_id,
      status
    )
    values (
      actor_id,
      target_id,
      'pending'
    )
    returning * into friendship;
  elsif friendship.status = 'accepted' then
    null;
  elsif (
    friendship.status = 'pending'
    and friendship.requester_id = target_id
    and friendship.addressee_id = actor_id
  ) then
    update public.friendships
    set
      status = 'accepted',
      responded_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where id = friendship.id
    returning * into friendship;
  elsif (
    friendship.status <> 'pending'
    or friendship.requester_id <> actor_id
  ) then
    update public.friendships
    set
      requester_id = actor_id,
      addressee_id = target_id,
      status = 'pending',
      requested_at = pg_catalog.now(),
      responded_at = null,
      updated_at = pg_catalog.now()
    where id = friendship.id
    returning * into friendship;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', friendship.id,
    'status', friendship.status
  );
end;
$$;

revoke all on function public.request_friendship(text) from public, anon;
grant execute on function public.request_friendship(text) to authenticated;
grant execute on function public.request_friendship(text) to service_role;

commit;
