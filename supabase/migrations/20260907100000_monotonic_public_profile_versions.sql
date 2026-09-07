-- Monotonic public profile versions (2026-09-07).
-- Apply in one transaction. Existing profiles and permissions are not rewritten.
-- Keep the existing trigger identity, but protect the two independent version
-- domains in one place: display name/preset and explicit avatar decisions.
create or replace function private.preserve_versioned_profile_avatar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A delayed request (or username RPC with an earlier server clock) must not
  -- rewind the identity clock. Equal-version retries retain the canonical row.
  if new.updated_at is null
    or not pg_catalog.isfinite(new.updated_at)
    or new.updated_at <= old.updated_at then
    new.display_name := old.display_name;
    new.avatar_preset := old.avatar_preset;
    new.updated_at := old.updated_at;
  end if;

  -- Guard the clock even when the image bytes are unchanged. Otherwise an old
  -- same-image write can lower the clock and let a later stale image through.
  -- Avatar updates remain independent of a rejected/stale identity update.
  if new.avatar_image_updated_at is null
    or not pg_catalog.isfinite(new.avatar_image_updated_at)
    or new.avatar_image_updated_at <= coalesce(
      old.avatar_image_updated_at, '-infinity'::timestamptz
    ) then
    new.avatar_image := old.avatar_image;
    new.avatar_image_updated_at := old.avatar_image_updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_versioned_profile_avatar on public.user_profiles;
create trigger preserve_versioned_profile_avatar
  before update of display_name, avatar_preset, updated_at, avatar_image, avatar_image_updated_at
  on public.user_profiles
  for each row execute function private.preserve_versioned_profile_avatar();
