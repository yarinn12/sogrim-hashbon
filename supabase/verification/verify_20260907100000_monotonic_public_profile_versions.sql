-- Run AFTER the profile-version migration and BEFORE COMMIT in the same transaction.
-- Read-only catalog/data checks: no profile content is exported or rewritten.
do $$
declare
  guarded_columns text[];
  invalid_profile_count bigint;
begin
  select array_agg(attribute.attname::text order by attribute.attname)
  into guarded_columns
  from pg_catalog.pg_trigger as guard
  cross join lateral unnest(guard.tgattr::smallint[]) as column_number(attnum)
  join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = guard.tgrelid and attribute.attnum = column_number.attnum
  where guard.tgrelid = 'public.user_profiles'::regclass
    and guard.tgname = 'preserve_versioned_profile_avatar'
    and guard.tgfoid = pg_catalog.to_regprocedure('private.preserve_versioned_profile_avatar()')
    and guard.tgenabled in ('O', 'A')
    and guard.tgtype = 19; -- ROW + BEFORE + UPDATE
  if guarded_columns is distinct from array[
    'avatar_image', 'avatar_image_updated_at', 'avatar_preset', 'display_name', 'updated_at'
  ]::text[] then
    raise exception 'Profile version trigger is absent, disabled, or does not guard every versioned field';
  end if;

  select count(*) into invalid_profile_count from public.user_profiles
  where updated_at is null or not pg_catalog.isfinite(updated_at)
    or (avatar_image_updated_at is not null and not pg_catalog.isfinite(avatar_image_updated_at));
  if invalid_profile_count > 0 then
    raise exception 'Rollout blocked: % profiles have invalid historical version clocks; review before commit', invalid_profile_count;
  end if;
end;
$$;

select 'ready'::text as verification_status;
