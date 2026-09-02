do $$
declare
  profile_constraint_validated boolean;
begin
  if to_regprocedure('private.guard_shared_avatar_origins()') is null then
    raise exception 'shared avatar origin guard is missing';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.app_snapshots'::regclass
      and tgname = 'guard_shared_avatar_origins'
      and not tgisinternal
  ) then
    raise exception 'shared avatar origin trigger is missing';
  end if;
  select convalidated into profile_constraint_validated
  from pg_catalog.pg_constraint
  where conrelid = 'public.user_profiles'::regclass
    and conname = 'user_profiles_avatar_image_safe';
  if profile_constraint_validated is null then
    raise exception 'profile avatar origin constraint is missing';
  end if;
  if has_function_privilege('authenticated', 'private.guard_shared_avatar_origins()', 'EXECUTE') then
    raise exception 'shared avatar guard is directly executable';
  end if;
end;
$$;
