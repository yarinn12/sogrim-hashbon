alter table public.user_profiles
  add column if not exists avatar_image text;

alter table public.user_profiles
  drop constraint if exists user_profiles_avatar_image_safe;
alter table public.user_profiles
  add constraint user_profiles_avatar_image_safe
  check (
    avatar_image is null
    or (
      pg_catalog.char_length(avatar_image) <= 180000
      and (
        avatar_image ~ '^https://'
        or avatar_image ~ '^data:image/(jpeg|png|webp);base64,'
      )
    )
  );

create or replace function private.create_user_friend_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
  requested_username text;
begin
  profile_name := coalesce(
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(pg_catalog.split_part(new.email, '@', 1), ''),
    'משתמש חדש'
  );
  requested_username := pg_catalog.lower(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'username', '')),
      '^@+',
      ''
    )
  );

  insert into public.user_profiles (
    user_id,
    username,
    username_customized,
    display_name
  )
  values (
    new.id,
    case
      when requested_username ~ '^[a-z][a-z0-9_]{2,23}$'
        then requested_username
      else private.default_friend_username(new.id, new.email)
    end,
    requested_username ~ '^[a-z][a-z0-9_]{2,23}$',
    profile_name
  )
  on conflict (user_id) do nothing;

  insert into public.friend_invite_codes (user_id, code)
  values (
    new.id,
    pg_catalog.encode(extensions.gen_random_bytes(10), 'hex')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;
