begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Keep legacy rows readable while preventing every new profile write from
-- turning native clients into third-party tracking beacons. NOT VALID avoids
-- breaking an old account until its client naturally replaces an off-list URL.
alter table public.user_profiles
  drop constraint if exists user_profiles_avatar_image_safe;
alter table public.user_profiles
  add constraint user_profiles_avatar_image_safe
  check (
    avatar_image is null
    or (
      pg_catalog.char_length(avatar_image) <= 180000
      and avatar_image ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
    )
    or (
      pg_catalog.char_length(avatar_image) <= 2048
      and (
        avatar_image ~* '^https://([A-Za-z0-9-]+\.)*googleusercontent\.com(/|$)'
        or avatar_image ~* '^https://sogrim-hesbon-app\.vercel\.app(/|$)'
      )
    )
  ) not valid;

create or replace function private.guard_shared_avatar_origins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  participant jsonb;
  previous_avatar text;
  next_avatar text;
begin
  if new.snapshot_kind <> 'shared_event'
    or old.snapshot_kind is distinct from new.snapshot_kind then
    return new;
  end if;

  for participant in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(new.state -> 'participants', '[]'::jsonb)
    ) as item(value)
  loop
    next_avatar := nullif(participant ->> 'avatarImage', '');
    select nullif(previous.value ->> 'avatarImage', '')
    into previous_avatar
    from pg_catalog.jsonb_array_elements(
      coalesce(old.state -> 'participants', '[]'::jsonb)
    ) as previous(value)
    where previous.value ->> 'id' = participant ->> 'id'
    limit 1;

    if previous_avatar is not distinct from next_avatar or next_avatar is null then
      continue;
    end if;
    if (
      pg_catalog.char_length(next_avatar) <= 180000
      and next_avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
    ) or (
      pg_catalog.char_length(next_avatar) <= 2048
      and (
        next_avatar ~* '^https://([A-Za-z0-9-]+\.)*googleusercontent\.com(/|$)'
        or next_avatar ~* '^https://sogrim-hesbon-app\.vercel\.app(/|$)'
      )
    ) then
      continue;
    end if;

    raise exception 'Shared profile avatar origin is not trusted'
      using errcode = '22023';
  end loop;

  return new;
end;
$$;

drop trigger if exists guard_shared_avatar_origins on public.app_snapshots;
create trigger guard_shared_avatar_origins
  before update of state on public.app_snapshots
  for each row execute function private.guard_shared_avatar_origins();

revoke all on function private.guard_shared_avatar_origins()
  from public, anon, authenticated;

commit;
