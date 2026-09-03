do $$
declare
  definition text;
begin
  if to_regprocedure('private.project_canonical_notes_into_workspace()') is null then
    raise exception 'Canonical personal-note projection is missing';
  end if;

  definition := pg_catalog.pg_get_functiondef(
    'private.project_canonical_notes_into_workspace()'::regprocedure
  );
  if pg_catalog.strpos(definition, 'auth.uid() is distinct from new.owner_user_id') = 0
    or pg_catalog.strpos(definition, 'member.status = ''active''') = 0
    or pg_catalog.strpos(definition, 'member.removed_at is null') = 0
    or pg_catalog.strpos(definition, '''sharedSpaceId''') = 0
    or pg_catalog.strpos(definition, '''deletedNotes''') = 0
    or pg_catalog.strpos(definition, '''notes''') = 0 then
    raise exception 'Canonical personal-note projection is incomplete';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.app_snapshots'::regclass
      and tgname = 'zz_project_canonical_notes_into_workspace'
      and tgfoid = 'private.project_canonical_notes_into_workspace()'::regprocedure
      and tgenabled = 'O'
      and not tgisinternal
      and (tgtype::integer & 23) = 23 -- row + before + insert + update
  ) then
    raise exception 'Canonical personal-note projection trigger is missing or disabled';
  end if;

  if pg_catalog.has_function_privilege(
    'anon', 'private.project_canonical_notes_into_workspace()', 'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated', 'private.project_canonical_notes_into_workspace()', 'execute'
  ) then
    raise exception 'Canonical personal-note projection grants are unsafe';
  end if;
end;
$$;
