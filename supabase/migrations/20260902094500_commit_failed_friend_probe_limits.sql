-- A PostgreSQL exception rolls back the rate-limit row written earlier in the
-- same transaction. Not-found probes therefore return a typed sentinel; the
-- client maps it back to the same user-facing error after the quota commits.
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
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  perform private.reserve_friend_request_capacity(actor_id, null);

  select invite.user_id into target_id
  from public.friend_invite_codes as invite
  where invite.code = pg_catalog.lower(pg_catalog.btrim(p_friend_code));
  if target_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'FRIEND_NOT_FOUND',
      'message', 'Friend code was not found'
    );
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
  select relation.* into friendship
  from public.friendships as relation
  where relation.user_low = least(actor_id, target_id)
    and relation.user_high = greatest(actor_id, target_id)
  for update;

  if friendship.id is null then
    perform private.reserve_friend_request_capacity(actor_id, target_id);
    insert into public.friendships (requester_id, addressee_id, status)
    values (actor_id, target_id, 'pending')
    returning * into friendship;
  elsif friendship.status = 'accepted' then
    null;
  elsif friendship.status = 'pending'
    and friendship.requester_id = target_id
    and friendship.addressee_id = actor_id then
    update public.friendships
    set
      status = 'accepted',
      responded_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where id = friendship.id
    returning * into friendship;
  elsif friendship.status = 'pending'
    and friendship.requester_id = actor_id then
    null;
  else
    if friendship.status = 'declined'
      and coalesce(friendship.responded_at, friendship.updated_at) >
        pg_catalog.clock_timestamp() - interval '24 hours' then
      raise exception 'Please wait before sending another friend request'
        using errcode = 'P0001';
    end if;
    perform private.reserve_friend_request_capacity(actor_id, target_id);
    update public.friendships
    set
      requester_id = actor_id,
      addressee_id = target_id,
      status = 'pending',
      requested_at = pg_catalog.clock_timestamp(),
      responded_at = null,
      updated_at = pg_catalog.clock_timestamp()
    where id = friendship.id
    returning * into friendship;
  end if;

  return pg_catalog.jsonb_build_object('id', friendship.id, 'status', friendship.status);
end;
$$;

create or replace function public.request_friendship_by_username(
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_username text := pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(p_username), '^@+', '')
  );
  friend_code text;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if normalized_username !~ '^[a-z][a-z0-9_]{2,23}$' then
    raise exception 'Username is invalid' using errcode = '22023';
  end if;

  select invite.code into friend_code
  from public.user_profiles as profile
  join public.friend_invite_codes as invite on invite.user_id = profile.user_id
  where profile.username = normalized_username
    and profile.username_customized = true;
  if friend_code is null then
    perform private.reserve_friend_request_capacity(actor_id, null);
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'USERNAME_NOT_FOUND',
      'message', 'Username was not found'
    );
  end if;
  return public.request_friendship(friend_code);
end;
$$;

revoke all on function public.request_friendship(text) from public, anon;
revoke all on function public.request_friendship_by_username(text) from public, anon;
grant execute on function public.request_friendship(text)
  to authenticated, service_role;
grant execute on function public.request_friendship_by_username(text)
  to authenticated, service_role;
