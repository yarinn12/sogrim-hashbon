begin;

alter table public.user_profiles
  add column if not exists avatar_image_updated_at timestamptz;

update public.user_profiles
set avatar_image_updated_at = updated_at
where avatar_image is not null
  and avatar_image_updated_at is null;

create or replace function private.preserve_versioned_profile_avatar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.avatar_image is distinct from old.avatar_image
    and (
      new.avatar_image_updated_at is null
      or new.avatar_image_updated_at is not distinct from old.avatar_image_updated_at
      or new.avatar_image_updated_at <= coalesce(
        old.avatar_image_updated_at,
        '-infinity'::timestamptz
      )
    ) then
    new.avatar_image := old.avatar_image;
    new.avatar_image_updated_at := old.avatar_image_updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_versioned_profile_avatar
  on public.user_profiles;
create trigger preserve_versioned_profile_avatar
  before update of avatar_image, avatar_image_updated_at
  on public.user_profiles
  for each row execute function private.preserve_versioned_profile_avatar();

create or replace function public.set_friend_username(
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
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if normalized_username !~ '^[a-z][a-z0-9_]{2,23}$' then
    raise exception 'Username is invalid'
      using errcode = '22023';
  end if;

  update public.user_profiles as profile
  set
    username = normalized_username,
    username_customized = true,
    updated_at = case
      when profile.username is distinct from normalized_username
        or profile.username_customized is distinct from true
        then pg_catalog.now()
      else profile.updated_at
    end
  where profile.user_id = actor_id;

  if not found then
    raise exception 'Profile was not found'
      using errcode = 'P0001';
  end if;

  return pg_catalog.jsonb_build_object(
    'username', normalized_username
  );
exception
  when unique_violation then
    raise exception 'Username is already taken'
      using errcode = 'P0001';
end;
$$;

commit;
