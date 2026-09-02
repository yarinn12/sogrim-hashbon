begin;

drop trigger if exists guard_shared_avatar_origins on public.app_snapshots;
drop function if exists private.guard_shared_avatar_origins();

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
  ) not valid;

commit;
