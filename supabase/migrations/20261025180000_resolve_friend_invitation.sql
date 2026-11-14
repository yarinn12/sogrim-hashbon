-- Read-only invitation landing. A code is a high-entropy shared capability;
-- only the authenticated recipient sees the minimal public identity. No writes,
-- automatic requests, acceptance, profile patch or probe-capacity mutation.
create or replace function public.resolve_friend_invitation(p_friend_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_id uuid;
  relation public.friendships%rowtype;
  person public.user_profiles%rowtype;
  relationship text := 'new';
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_friend_code is null or pg_catalog.lower(pg_catalog.btrim(p_friend_code)) !~ '^[a-f0-9]{20}$' then
    return pg_catalog.jsonb_build_object('status','unavailable');
  end if;
  select invite.user_id into target_id from public.friend_invite_codes as invite
  where invite.code = pg_catalog.lower(pg_catalog.btrim(p_friend_code));
  if target_id = actor_id then return pg_catalog.jsonb_build_object('status','self'); end if;
  if target_id is null or exists (
    select 1 from public.user_blocks as block
    where (block.blocker_user_id=actor_id and block.blocked_user_id=target_id)
       or (block.blocker_user_id=target_id and block.blocked_user_id=actor_id)
  ) then return pg_catalog.jsonb_build_object('status','unavailable'); end if;
  select profile.* into person from public.user_profiles as profile where profile.user_id=target_id;
  if person.user_id is null then return pg_catalog.jsonb_build_object('status','unavailable'); end if;
  select friendship.* into relation from public.friendships as friendship
  where friendship.user_low=least(actor_id,target_id) and friendship.user_high=greatest(actor_id,target_id);
  if relation.status='accepted' then relationship := 'accepted';
  elsif relation.status='pending' then
    relationship := case when relation.addressee_id=actor_id then 'incoming' else 'outgoing' end;
  elsif relation.status='declined' and coalesce(relation.responded_at,relation.updated_at) > pg_catalog.now()-interval '24 hours' then
    return pg_catalog.jsonb_build_object('status','unavailable');
  end if;
  return pg_catalog.jsonb_build_object('status','ready','relationship',relationship,'friendship_id',relation.id,
    'profile',pg_catalog.jsonb_build_object('user_id',person.user_id,'display_name',person.display_name,
      'username',case when person.username_customized then person.username else null end,
      'avatar_preset',person.avatar_preset,'avatar_image',person.avatar_image));
end;
$$;
revoke all on function public.resolve_friend_invitation(text) from public, anon;
grant execute on function public.resolve_friend_invitation(text) to authenticated;
