begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

create or replace function public.ensure_account_workspace(p_space_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  account_metadata jsonb;
  account_app_metadata jsonb;
  account_email text;
  configured_space_id text;
  configured_space_key text;
  access_key_hash text;
  participant_id text;
  display_name text;
  provider_name text;
  participant jsonb;
  initial_state jsonb;
  existing_snapshot public.app_snapshots%rowtype;
begin
  if actor_id is null then
    raise exception 'Account session is required'
      using errcode = '42501';
  end if;
  if p_space_id is null
    or pg_catalog.char_length(p_space_id) not between 8 and 128
    or p_space_id !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Account workspace id is invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_space_id, 0)
  );

  select
    coalesce(account.raw_user_meta_data, '{}'::jsonb),
    coalesce(account.raw_app_meta_data, '{}'::jsonb),
    pg_catalog.lower(account.email)
  into account_metadata, account_app_metadata, account_email
  from auth.users as account
  where account.id = actor_id
  for update;

  if not found then
    raise exception 'Account record is unavailable'
      using errcode = '42501';
  end if;

  configured_space_id := nullif(account_metadata ->> 'account_space_id', '');
  configured_space_key := nullif(account_metadata ->> 'account_space_key', '');
  if configured_space_id is distinct from p_space_id
    or configured_space_key is null
    or pg_catalog.char_length(configured_space_key) not between 24 and 256 then
    raise exception 'Account workspace metadata is invalid'
      using errcode = '22023';
  end if;

  access_key_hash := pg_catalog.encode(
    extensions.digest(configured_space_key, 'sha256'),
    'hex'
  );

  select snapshot.*
  into existing_snapshot
  from public.app_snapshots as snapshot
  where snapshot.id = p_space_id;

  if found then
    if existing_snapshot.owner_user_id is distinct from actor_id
      or existing_snapshot.snapshot_kind <> 'workspace'
      or existing_snapshot.access_key_hash <> access_key_hash then
      raise exception 'Account workspace ownership is invalid'
        using errcode = '42501';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'existing',
      'workspaceId', p_space_id
    );
  end if;

  if exists (
    select 1
    from public.app_snapshots as snapshot
    where snapshot.owner_user_id = actor_id
      and snapshot.snapshot_kind = 'workspace'
  ) then
    raise exception 'Account already owns a different workspace'
      using errcode = '23505';
  end if;

  participant_id := 'account-' || actor_id::text;
  display_name := coalesce(
    nullif(pg_catalog.btrim(account_metadata ->> 'full_name'), ''),
    nullif(pg_catalog.btrim(account_metadata ->> 'name'), ''),
    nullif(pg_catalog.btrim(account_metadata ->> 'username'), ''),
    nullif(pg_catalog.split_part(account_email, '@', 1), ''),
    'משתמש'
  );
  provider_name := case
    when account_app_metadata ->> 'provider' in ('google', 'apple')
      then account_app_metadata ->> 'provider'
    else 'email'
  end;
  participant := pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'id', participant_id,
      'displayName', display_name,
      'kind', 'user',
      'authProvider', provider_name,
      'authSubject', actor_id::text,
      'email', nullif(account_email, ''),
      'username', nullif(account_metadata ->> 'username', ''),
      'avatarImage', nullif(account_metadata ->> 'avatar_image', '')
    )
  );
  initial_state := pg_catalog.jsonb_build_object(
    'currentParticipantId', participant_id,
    'participants', pg_catalog.jsonb_build_array(participant),
    'friendContacts', '[]'::jsonb,
    'groups', '[]'::jsonb,
    'events', '[]'::jsonb,
    'deletedEvents', '[]'::jsonb
  );

  insert into public.app_snapshots (
    id,
    access_key_hash,
    owner_user_id,
    snapshot_kind,
    state,
    updated_at
  ) values (
    p_space_id,
    access_key_hash,
    actor_id,
    'workspace',
    initial_state,
    pg_catalog.clock_timestamp()
  );

  return pg_catalog.jsonb_build_object(
    'status', 'created',
    'workspaceId', p_space_id
  );
end;
$$;

revoke all on function public.ensure_account_workspace(text)
  from public, anon;
grant execute on function public.ensure_account_workspace(text)
  to authenticated;

commit;
