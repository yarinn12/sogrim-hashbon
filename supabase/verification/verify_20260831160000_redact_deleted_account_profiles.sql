do $$
declare
  tombstone jsonb;
  guard_definition text;
  deletion_definition text;
begin
  tombstone := private.account_deletion_participant_tombstone(
    pg_catalog.jsonb_build_object(
      'id', 'account-00000000-0000-4000-8000-000000000001',
      'displayName', 'שם אמיתי',
      'kind', 'user',
      'email', 'private@example.com',
      'avatarImage', 'data:image/jpeg;base64,private',
      'avatarPreset', 'avatar-1',
      'avatarImageUpdatedAt', '2026-08-31T10:00:00.000Z',
      'profileUpdatedAt', '2026-08-31T10:00:00.000Z',
      'accountLinked', true,
      'authProvider', 'email',
      'authSubject', '00000000-0000-4000-8000-000000000001'
    )
  );

  if tombstone is distinct from pg_catalog.jsonb_build_object(
    'id', 'account-00000000-0000-4000-8000-000000000001',
    'displayName', 'משתמש שנמחק',
    'kind', 'user',
    'accountDeleted', true
  ) then
    raise exception 'Account deletion tombstone retains direct profile data';
  end if;

  guard_definition := pg_catalog.pg_get_functiondef(
    'private.is_safe_account_deletion_anonymization(jsonb,jsonb)'::regprocedure
  );
  deletion_definition := pg_catalog.pg_get_functiondef(
    'public.delete_account_data(uuid)'::regprocedure
  );
  if pg_catalog.strpos(
      guard_definition,
      'account_deletion_participant_tombstone'
    ) = 0
    or pg_catalog.strpos(
      deletion_definition,
      'account_deletion_participant_tombstone'
    ) = 0 then
    raise exception 'Account deletion does not use the strict tombstone';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.app_snapshots'::regclass
      and tgname = 'aa_redact_deleted_account_participants'
      and not tgisinternal
  ) then
    raise exception 'Deleted-account redaction trigger is missing';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'private.redact_deleted_account_participants()',
    'execute'
  ) then
    raise exception 'Deleted-account redaction trigger is exposed';
  end if;
end;
$$;

select '20260831160000' as migration_version,
  'deleted account profile redaction verified' as status;
