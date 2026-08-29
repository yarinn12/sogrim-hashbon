create schema if not exists extensions;
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

revoke all on schema private from public, anon, authenticated;

create table if not exists public.app_snapshots (
  id text primary key,
  access_key_hash text not null check (char_length(access_key_hash) = 64),
  owner_user_id uuid references auth.users(id) on delete cascade,
  snapshot_kind text not null default 'workspace'
    check (snapshot_kind in ('workspace', 'shared_event')),
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_snapshots
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

alter table public.app_snapshots
  add column if not exists snapshot_kind text not null default 'workspace';

alter table public.app_snapshots
  drop constraint if exists app_snapshots_snapshot_kind_check;
alter table public.app_snapshots
  add constraint app_snapshots_snapshot_kind_check
  check (snapshot_kind in ('workspace', 'shared_event'));

update public.app_snapshots
set snapshot_kind = 'shared_event'
where owner_user_id is null
  and snapshot_kind = 'workspace'
  and coalesce(state ->> 'currentParticipantId', '') = ''
  and pg_catalog.jsonb_typeof(state -> 'events') = 'array'
  and pg_catalog.jsonb_array_length(state -> 'events') <= 1
  and (
    state -> 'groups' is null
    or (
      pg_catalog.jsonb_typeof(state -> 'groups') = 'array'
      and pg_catalog.jsonb_array_length(state -> 'groups') = 0
    )
  )
  and (
    pg_catalog.jsonb_array_length(state -> 'events') = 1
    or (
      pg_catalog.jsonb_typeof(state -> 'deletedEvents') = 'array'
      and pg_catalog.jsonb_array_length(state -> 'deletedEvents') > 0
    )
  );

create index if not exists app_snapshots_owner_user_id_idx
  on public.app_snapshots (owner_user_id)
  where owner_user_id is not null;

create unique index if not exists app_snapshots_shared_event_event_id_uidx
  on public.app_snapshots ((state #>> '{events,0,id}'))
  where snapshot_kind = 'shared_event'
    and nullif(state #>> '{events,0,id}', '') is not null;

alter table public.app_snapshots
  drop constraint if exists app_snapshots_state_size_check;
alter table public.app_snapshots
  add constraint app_snapshots_state_size_check
  check (pg_catalog.pg_column_size(state) <= 8388608) not valid;

create table if not exists private.signup_workspace_claims (
  snapshot_id text primary key
    references public.app_snapshots(id) on delete cascade,
  access_key_hash text not null check (char_length(access_key_hash) = 64),
  created_at timestamptz not null default pg_catalog.now()
);

-- Populate only from trusted provisioning or an independently verified legacy backfill.
alter table private.signup_workspace_claims enable row level security;
alter table private.signup_workspace_claims force row level security;

revoke all on table private.signup_workspace_claims
  from public, anon, authenticated;

create table if not exists private.shared_snapshot_members (
  snapshot_id text not null
    references public.app_snapshots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_id text not null
    check (participant_id = 'account-' || user_id::text),
  role text not null default 'member'
    check (role in ('member', 'admin')),
  status text not null default 'active'
    check (status in ('active', 'removed')),
  joined_at timestamptz not null default pg_catalog.now(),
  removed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (snapshot_id, user_id),
  unique (snapshot_id, participant_id)
);

create index if not exists shared_snapshot_members_active_user_idx
  on private.shared_snapshot_members (user_id, snapshot_id)
  where status = 'active';

alter table private.shared_snapshot_members enable row level security;
alter table private.shared_snapshot_members force row level security;

revoke all on table private.shared_snapshot_members
  from public, anon, authenticated;

create table if not exists private.shared_event_qualification_activity (
  snapshot_id text not null
    references public.app_snapshots(id) on delete cascade,
  event_id text not null check (char_length(event_id) between 1 and 160),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  activity_kind text not null
    check (activity_kind in ('expense_created', 'transfer_paid')),
  entity_id text not null check (entity_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (snapshot_id, activity_kind, entity_id)
);

create index if not exists shared_event_qualification_actor_idx
  on private.shared_event_qualification_activity (
    actor_user_id,
    snapshot_id,
    recorded_at
  );

alter table private.shared_event_qualification_activity enable row level security;
alter table private.shared_event_qualification_activity force row level security;
revoke all on table private.shared_event_qualification_activity
  from public, anon, authenticated;

create or replace function private.claim_signup_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  space_id text := nullif(new.raw_user_meta_data ->> 'account_space_id', '');
  space_key text := nullif(new.raw_user_meta_data ->> 'account_space_key', '');
  claimed_snapshot_id text;
begin
  if space_id is null or space_key is null then
    return new;
  end if;

  update public.app_snapshots as snapshot
  set owner_user_id = new.id
  from private.signup_workspace_claims as claim
  where snapshot.owner_user_id is null
    and snapshot.id = space_id
    and claim.snapshot_id = snapshot.id
    and claim.access_key_hash = snapshot.access_key_hash
    and snapshot.access_key_hash = pg_catalog.encode(
      extensions.digest(space_key, 'sha256'),
      'hex'
    )
  returning snapshot.id into claimed_snapshot_id;

  if claimed_snapshot_id is not null then
    delete from private.signup_workspace_claims
    where snapshot_id = claimed_snapshot_id;
  end if;

  return new;
end;
$$;

revoke all on function private.claim_signup_workspace() from public, anon, authenticated;

drop trigger if exists claim_signup_workspace_on_user_create on auth.users;
create trigger claim_signup_workspace_on_user_create
  after insert on auth.users
  for each row execute function private.claim_signup_workspace();

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

-- Repair legacy account switching contamination without changing participants,
-- events, groups, or any financial history.
update public.app_snapshots as snapshot
set state = pg_catalog.jsonb_set(
  snapshot.state,
  '{currentParticipantId}',
  pg_catalog.to_jsonb('account-' || snapshot.owner_user_id::text),
  true
)
where snapshot.owner_user_id is not null
  and coalesce(snapshot.state ->> 'currentParticipantId', '')
    <> 'account-' || snapshot.owner_user_id::text
  and exists (
    select 1
    from pg_catalog.jsonb_array_elements(snapshot.state -> 'participants')
      as participant
    where participant ->> 'id' = 'account-' || snapshot.owner_user_id::text
  );

create or replace function private.guard_personal_snapshot_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  expected_participant_id text;
  invalid_active_event_id text;
begin
  if new.owner_user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.owner_user_id is null
    and exists (
      select 1
      from private.signup_workspace_claims as claim
      where claim.snapshot_id = new.id
        and claim.access_key_hash = new.access_key_hash
    ) then
    return new;
  end if;
  if actor_id is null or actor_id <> new.owner_user_id then
    if tg_op = 'UPDATE'
      and pg_catalog.pg_trigger_depth() > 1
      and private.is_safe_account_deletion_anonymization(old.state, new.state) then
      return new;
    end if;
    raise exception 'Personal workspace ownership is invalid'
      using errcode = '42501';
  end if;

  expected_participant_id := 'account-' || actor_id::text;
  if new.snapshot_kind <> 'workspace'
    or pg_catalog.jsonb_typeof(new.state) <> 'object'
    or pg_catalog.pg_column_size(new.state) > 8388608
    or coalesce(new.state ->> 'currentParticipantId', '') <> expected_participant_id then
    raise exception 'Personal workspace payload is invalid'
      using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    select shared_event.value ->> 'id'
    into invalid_active_event_id
    from private.shared_snapshot_members as member
    join public.app_snapshots as shared
      on shared.id = member.snapshot_id
     and shared.snapshot_kind = 'shared_event'
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(shared.state -> 'events', '[]'::jsonb)
    ) as shared_event(value)
    where member.user_id = actor_id
      and member.status = 'active'
      and member.removed_at is null
      and coalesce(shared_event.value -> 'participantIds', '[]'::jsonb)
        ? member.participant_id
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(new.state -> 'events', '[]'::jsonb)
        ) as personal_event(value)
          where personal_event.value ->> 'id' = shared_event.value ->> 'id'
            and coalesce(
              personal_event.value -> 'participantIds',
              '[]'::jsonb
            ) ? member.participant_id
            and not (
              coalesce(
                personal_event.value -> 'inactiveParticipantIds',
                '[]'::jsonb
              ) ? member.participant_id
            )
      )
    limit 1;

    if invalid_active_event_id is not null then
      raise exception 'Active shared member must remain active in its personal event'
        using errcode = '23503',
          detail = invalid_active_event_id;
    end if;
  end if;
  if tg_op = 'INSERT' and exists (
    select 1
    from public.app_snapshots as existing
    where existing.owner_user_id = actor_id
      and existing.id <> new.id
  ) then
    raise exception 'A personal workspace already exists for this account'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_personal_snapshot_write on public.app_snapshots;
create trigger guard_personal_snapshot_write
  before insert or update of owner_user_id, snapshot_kind, state
  on public.app_snapshots
  for each row execute function private.guard_personal_snapshot_write();

revoke all on function private.guard_personal_snapshot_write()
  from public, anon, authenticated;

alter table public.app_snapshots enable row level security;
alter table public.app_snapshots force row level security;

create or replace function public.request_space_key_hash()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when nullif(
      pg_catalog.current_setting('request.headers', true)::json ->> 'x-space-key',
      ''
    ) is null then null
    else pg_catalog.encode(
      extensions.digest(
        pg_catalog.current_setting('request.headers', true)::json ->> 'x-space-key',
        'sha256'
      ),
      'hex'
    )
  end;
$$;

create or replace function private.is_shared_event_state(p_state jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    coalesce(p_state ->> 'currentParticipantId', '') = ''
    and pg_catalog.jsonb_typeof(p_state -> 'events') = 'array'
    and pg_catalog.jsonb_array_length(p_state -> 'events') <= 1
    and (
      p_state -> 'groups' is null
      or (
        pg_catalog.jsonb_typeof(p_state -> 'groups') = 'array'
        and pg_catalog.jsonb_array_length(p_state -> 'groups') = 0
      )
    )
    and (
      pg_catalog.jsonb_array_length(p_state -> 'events') = 1
      or (
        pg_catalog.jsonb_typeof(p_state -> 'deletedEvents') = 'array'
        and pg_catalog.jsonb_array_length(p_state -> 'deletedEvents') > 0
      )
    );
$$;

create or replace function private.classify_snapshot_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_user_id is not null then
    new.snapshot_kind := 'workspace';
  elsif private.is_shared_event_state(new.state) then
    new.snapshot_kind := 'shared_event';
  end if;
  return new;
end;
$$;

create or replace function private.event_text_ids(
  p_event jsonb,
  p_field text
)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    pg_catalog.array_agg(distinct item.value order by item.value),
    '{}'::text[]
  )
  from pg_catalog.jsonb_array_elements_text(
    case
      when pg_catalog.jsonb_typeof(p_event -> p_field) = 'array'
        then p_event -> p_field
      else '[]'::jsonb
    end
  ) as item(value);
$$;

create or replace function private.active_event_participant_ids(p_state jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    pg_catalog.array_agg(participant_id order by participant_id),
    '{}'::text[]
  )
  from pg_catalog.unnest(
    private.event_text_ids(p_state -> 'events' -> 0, 'participantIds')
  ) as participant(participant_id)
  where not (
    participant_id = any (
      private.event_text_ids(
        p_state -> 'events' -> 0,
        'inactiveParticipantIds'
      )
    )
  );
$$;

create or replace function private.event_admin_ids(p_state jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  with explicit_ids as (
    select private.event_text_ids(
      p_state -> 'events' -> 0,
      'adminIds'
    ) as ids
  )
  select case
    when pg_catalog.cardinality(explicit_ids.ids) > 0 then explicit_ids.ids
    when coalesce(p_state -> 'events' -> 0 ->> 'createdByParticipantId', '') <> ''
      then array[p_state -> 'events' -> 0 ->> 'createdByParticipantId']
    else '{}'::text[]
  end
  from explicit_ids;
$$;

create or replace function private.current_actor_participant_id()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then null
    else 'account-' || (select auth.uid())::text
  end;
$$;

create or replace function private.is_safe_account_deletion_anonymization(
  p_old_state jsonb,
  p_new_state jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with old_participants as (
    select participant, position
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(p_old_state -> 'participants') = 'array'
          then p_old_state -> 'participants'
        else '[]'::jsonb
      end
    ) with ordinality as item(participant, position)
  ),
  new_participants as (
    select participant, position
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
          then p_new_state -> 'participants'
        else '[]'::jsonb
      end
    ) with ordinality as item(participant, position)
  )
  select
    pg_catalog.jsonb_typeof(p_old_state -> 'participants') = 'array'
    and pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
    and (p_old_state - 'participants') = (p_new_state - 'participants')
    and pg_catalog.jsonb_array_length(p_old_state -> 'participants') =
      pg_catalog.jsonb_array_length(p_new_state -> 'participants')
    and p_old_state -> 'participants' is distinct from p_new_state -> 'participants'
    and not exists (
      select 1
      from old_participants as old_item
      full join new_participants as new_item using (position)
      where old_item.participant is null
        or new_item.participant is null
        or (
          new_item.participant is distinct from old_item.participant
          and new_item.participant is distinct from pg_catalog.jsonb_set(
            old_item.participant - 'email' - 'authProvider' - 'authSubject',
            '{displayName}',
            pg_catalog.to_jsonb('משתמש שנמחק'::text),
            true
          )
        )
    );
$$;

create or replace function public.can_write_shared_snapshot(p_snapshot_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.shared_snapshot_members as member
      where member.snapshot_id = p_snapshot_id
        and member.user_id = (select auth.uid())
        and member.status = 'active'
    );
$$;

create or replace function public.can_read_deleted_shared_snapshot(p_snapshot_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.shared_snapshot_members as member
      where member.snapshot_id = p_snapshot_id
        and member.user_id = (select auth.uid())
        and member.status = 'active'
    );
$$;

create or replace function public.can_bootstrap_shared_snapshot(p_snapshot_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.app_snapshots as snapshot
      where snapshot.id = p_snapshot_id
        and snapshot.owner_user_id is null
        and snapshot.snapshot_kind = 'shared_event'
        and snapshot.state -> 'events' -> 0 is not null
        and snapshot.access_key_hash = public.request_space_key_hash()
        and not (
          private.current_actor_participant_id() = any (
            private.event_text_ids(
              snapshot.state -> 'events' -> 0,
              'inactiveParticipantIds'
            )
          )
        )
        and not exists (
          select 1
          from private.shared_snapshot_members as member
          where member.snapshot_id = snapshot.id
            and member.user_id = (select auth.uid())
        )
    );
$$;

create or replace function private.is_safe_offline_guest_addition(
  p_old_state jsonb,
  p_new_state jsonb
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  old_event jsonb := p_old_state -> 'events' -> 0;
  new_event jsonb := p_new_state -> 'events' -> 0;
  old_participant_ids text[] := private.event_text_ids(
    old_event,
    'participantIds'
  );
  new_participant_ids text[] := private.event_text_ids(
    new_event,
    'participantIds'
  );
  old_inactive_ids text[] := private.event_text_ids(
    old_event,
    'inactiveParticipantIds'
  );
  new_inactive_ids text[] := private.event_text_ids(
    new_event,
    'inactiveParticipantIds'
  );
  added_ids text[];
  added_id text;
  added_user_id uuid;
begin
  if old_event is null or new_event is null then
    return false;
  end if;

  select coalesce(
    pg_catalog.array_agg(candidate.participant_id order by candidate.participant_id),
    '{}'::text[]
  )
  into added_ids
  from (
    select participant_id
    from pg_catalog.unnest(new_participant_ids) as new_id(participant_id)
    except
    select participant_id
    from pg_catalog.unnest(old_participant_ids) as old_id(participant_id)
  ) as candidate;

  if pg_catalog.cardinality(added_ids) = 0
    or not (old_participant_ids <@ new_participant_ids)
    or pg_catalog.cardinality(new_participant_ids) <>
      pg_catalog.cardinality(old_participant_ids) +
      pg_catalog.cardinality(added_ids)
    or old_inactive_ids is distinct from new_inactive_ids
    or private.event_admin_ids(p_old_state) is distinct from
      private.event_admin_ids(p_new_state) then
    return false;
  end if;

  if pg_catalog.jsonb_array_length(
      case
        when pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
          then p_new_state -> 'participants'
        else '[]'::jsonb
      end
    ) <> pg_catalog.jsonb_array_length(
      case
        when pg_catalog.jsonb_typeof(p_old_state -> 'participants') = 'array'
          then p_old_state -> 'participants'
        else '[]'::jsonb
      end
    ) + pg_catalog.cardinality(added_ids)
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        case
          when pg_catalog.jsonb_typeof(p_old_state -> 'participants') = 'array'
            then p_old_state -> 'participants'
          else '[]'::jsonb
        end
      ) as old_participant(value)
      where not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          case
            when pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
              then p_new_state -> 'participants'
            else '[]'::jsonb
          end
        ) as new_participant(value)
        where new_participant.value = old_participant.value
      )
    ) then
    return false;
  end if;

  foreach added_id in array added_ids loop
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        case
          when pg_catalog.jsonb_typeof(p_old_state -> 'deletedParticipants') = 'array'
            then p_old_state -> 'deletedParticipants'
          else '[]'::jsonb
        end
      ) as deletion(value)
      where deletion.value ->> 'id' = added_id
    ) then
      return false;
    end if;

    if added_id ~ '^guest-[A-Za-z0-9_-]{1,120}$' then
      if not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          case
            when pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
              then p_new_state -> 'participants'
            else '[]'::jsonb
          end
        ) as participant(value)
        where participant.value ->> 'id' = added_id
          and participant.value ->> 'kind' = 'guest'
          and coalesce(participant.value -> 'accountLinked', 'false'::jsonb)
            is distinct from 'true'::jsonb
          and coalesce(participant.value ->> 'authProvider', '') = ''
          and coalesce(participant.value ->> 'authSubject', '') = ''
          and coalesce(participant.value ->> 'email', '') = ''
      ) then
        return false;
      end if;
    elsif added_id ~ '^account-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      if actor_id is null
        or pg_catalog.cardinality(added_ids) <> 1
        or coalesce((old_event ->> 'adminsCanEditOnly')::boolean, false)
        or coalesce((old_event ->> 'locked')::boolean, false)
        or coalesce(old_event ->> 'closedAt', '') <> '' then
        return false;
      end if;

      added_user_id := pg_catalog.substr(added_id, 9)::uuid;
      if not exists (
        select 1
        from public.friendships as friendship
        where friendship.user_low = least(actor_id, added_user_id)
          and friendship.user_high = greatest(actor_id, added_user_id)
          and friendship.status = 'accepted'
      ) or not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          case
            when pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
              then p_new_state -> 'participants'
            else '[]'::jsonb
          end
        ) as participant(value)
        where participant.value ->> 'id' = added_id
          and participant.value ->> 'kind' = 'user'
          and coalesce(participant.value -> 'accountLinked', 'false'::jsonb) =
            'true'::jsonb
      ) then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function private.is_safe_self_profile_update(
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  old_participants jsonb := p_old_state -> 'participants';
  new_participants jsonb := p_new_state -> 'participants';
  old_actor jsonb;
  new_actor jsonb;
  old_profile_updated_at timestamptz;
  new_profile_updated_at timestamptz;
  old_avatar_updated_at timestamptz;
  new_avatar_updated_at timestamptz;
  normalized_display_name text;
  avatar_image text;
begin
  if coalesce(p_actor_participant_id, '') !~
      '^account-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or pg_catalog.jsonb_typeof(old_participants) <> 'array'
    or pg_catalog.jsonb_typeof(new_participants) <> 'array'
    or pg_catalog.jsonb_array_length(old_participants) <>
      pg_catalog.jsonb_array_length(new_participants)
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(old_participants) as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'object'
        or coalesce(item.value ->> 'id', '') = ''
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(new_participants) as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'object'
        or coalesce(item.value ->> 'id', '') = ''
    )
    or (
      select pg_catalog.count(*) <> pg_catalog.count(distinct item.value ->> 'id')
      from pg_catalog.jsonb_array_elements(old_participants) as item(value)
    )
    or (
      select pg_catalog.count(*) <> pg_catalog.count(distinct item.value ->> 'id')
      from pg_catalog.jsonb_array_elements(new_participants) as item(value)
    ) then
    return false;
  end if;

  select item.value
  into old_actor
  from pg_catalog.jsonb_array_elements(old_participants) as item(value)
  where item.value ->> 'id' = p_actor_participant_id;

  select item.value
  into new_actor
  from pg_catalog.jsonb_array_elements(new_participants) as item(value)
  where item.value ->> 'id' = p_actor_participant_id;

  if old_actor is null
    or new_actor is null
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(old_participants) as old_item(value)
      where old_item.value ->> 'id' <> p_actor_participant_id
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(new_participants) as new_item(value)
          where new_item.value = old_item.value
        )
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(new_participants) as new_item(value)
      where new_item.value ->> 'id' <> p_actor_participant_id
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(old_participants) as old_item(value)
          where old_item.value = new_item.value
        )
    )
    or old_actor - array[
        'displayName',
        'avatarPreset',
        'avatarImage',
        'avatarImageUpdatedAt',
        'profileUpdatedAt'
      ] is distinct from new_actor - array[
        'displayName',
        'avatarPreset',
        'avatarImage',
        'avatarImageUpdatedAt',
        'profileUpdatedAt'
      ] then
    return false;
  end if;

  if old_actor -> 'displayName' is distinct from new_actor -> 'displayName' then
    if pg_catalog.jsonb_typeof(new_actor -> 'displayName') <> 'string' then
      return false;
    end if;
    normalized_display_name := pg_catalog.regexp_replace(
      pg_catalog.btrim(new_actor ->> 'displayName'),
      '[[:space:]]+',
      ' ',
      'g'
    );
    if normalized_display_name is distinct from new_actor ->> 'displayName'
      or pg_catalog.char_length(normalized_display_name) not between 2 and 80
      or normalized_display_name !~ '^[^[:space:]]+ [^[:space:]]+( [^[:space:]]+)*$' then
      return false;
    end if;
  end if;

  if old_actor -> 'avatarPreset' is distinct from new_actor -> 'avatarPreset'
    and (
      new_actor ? 'avatarPreset'
      and (
        pg_catalog.jsonb_typeof(new_actor -> 'avatarPreset') <> 'string'
        or new_actor ->> 'avatarPreset' !~ '^avatar-[1-6]$'
      )
    ) then
    return false;
  end if;

  if old_actor -> 'avatarImage' is distinct from new_actor -> 'avatarImage'
    and new_actor ? 'avatarImage' then
    if pg_catalog.jsonb_typeof(new_actor -> 'avatarImage') <> 'string' then
      return false;
    end if;
    avatar_image := new_actor ->> 'avatarImage';
    if not (
      pg_catalog.char_length(avatar_image) <= 180000
      and avatar_image ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
    ) and not (
      pg_catalog.char_length(avatar_image) <= 2048
      and avatar_image ~ '^https://[^[:space:]]+$'
    ) then
      return false;
    end if;
  end if;

  if new_actor ? 'profileUpdatedAt' then
    if pg_catalog.jsonb_typeof(new_actor -> 'profileUpdatedAt') <> 'string' then
      return false;
    end if;
    new_profile_updated_at := (new_actor ->> 'profileUpdatedAt')::timestamptz;
  end if;
  if old_actor ? 'profileUpdatedAt' then
    old_profile_updated_at := (old_actor ->> 'profileUpdatedAt')::timestamptz;
  end if;
  if old_actor -> 'profileUpdatedAt' is distinct from
      new_actor -> 'profileUpdatedAt'
    and (
      new_profile_updated_at is null
      or new_profile_updated_at <= coalesce(
        old_profile_updated_at,
        '-infinity'::timestamptz
      )
      or new_profile_updated_at > pg_catalog.statement_timestamp() + interval '5 minutes'
    ) then
    return false;
  end if;

  if new_actor ? 'avatarImageUpdatedAt' then
    if pg_catalog.jsonb_typeof(new_actor -> 'avatarImageUpdatedAt') <> 'string' then
      return false;
    end if;
    new_avatar_updated_at := (new_actor ->> 'avatarImageUpdatedAt')::timestamptz;
  end if;
  if old_actor ? 'avatarImageUpdatedAt' then
    old_avatar_updated_at := (old_actor ->> 'avatarImageUpdatedAt')::timestamptz;
  end if;
  if old_actor -> 'avatarImageUpdatedAt' is distinct from
      new_actor -> 'avatarImageUpdatedAt'
    and (
      new_avatar_updated_at is null
      or new_avatar_updated_at <= coalesce(
        old_avatar_updated_at,
        '-infinity'::timestamptz
      )
      or new_avatar_updated_at > pg_catalog.statement_timestamp() + interval '5 minutes'
    ) then
    return false;
  end if;

  if (
      old_actor -> 'displayName' is distinct from new_actor -> 'displayName'
      or old_actor -> 'avatarPreset' is distinct from new_actor -> 'avatarPreset'
      or old_actor -> 'avatarImage' is distinct from new_actor -> 'avatarImage'
    ) and (
      new_profile_updated_at is null
      or new_profile_updated_at <= coalesce(
        old_profile_updated_at,
        '-infinity'::timestamptz
      )
    ) then
    return false;
  end if;

  if old_actor -> 'avatarImage' is distinct from new_actor -> 'avatarImage'
    and (
      new_avatar_updated_at is null
      or new_avatar_updated_at <= coalesce(
        old_avatar_updated_at,
        '-infinity'::timestamptz
      )
    ) then
    return false;
  end if;

  return old_participants is distinct from new_participants;
exception
  when others then
    return false;
end;
$$;

create or replace function private.is_safe_transfer_status_only_update(
  p_snapshot_id text,
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  old_event jsonb := coalesce(p_old_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(p_new_state -> 'events' -> 0, '{}'::jsonb);
  old_activity jsonb := case
    when pg_catalog.jsonb_typeof(old_event -> 'activityLog') = 'array'
      then old_event -> 'activityLog'
    else '[]'::jsonb
  end;
  new_activity jsonb := case
    when pg_catalog.jsonb_typeof(new_event -> 'activityLog') = 'array'
      then new_event -> 'activityLog'
    else '[]'::jsonb
  end;
  changed_transfer_count integer := 0;
  added_activity_count integer := 0;
  removed_activity_count integer := 0;
begin
  if coalesce(p_snapshot_id, '') = ''
    or coalesce(p_actor_participant_id, '') = ''
    or p_old_state - 'events' is distinct from p_new_state - 'events'
    or old_event - array[
      'updatedAt',
      'transfers',
      'transferStatusUpdates',
      'activityLog'
    ] is distinct from new_event - array[
      'updatedAt',
      'transfers',
      'transferStatusUpdates',
      'activityLog'
    ]
    or pg_catalog.jsonb_typeof(old_event -> 'transfers') <> 'array'
    or pg_catalog.jsonb_typeof(new_event -> 'transfers') <> 'array'
    or pg_catalog.jsonb_typeof(new_event -> 'transferStatusUpdates') <> 'array'
    or pg_catalog.jsonb_array_length(old_event -> 'transfers')
      <> pg_catalog.jsonb_array_length(new_event -> 'transfers')
    or not (
      p_actor_participant_id = any(private.active_event_participant_ids(p_old_state))
    ) then
    return false;
  end if;

  if not private.has_authorized_transfer_status_changes(
    p_old_state,
    p_new_state,
    p_actor_participant_id,
    p_snapshot_id
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(old_event -> 'transfers') as old_item(value)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(new_event -> 'transfers') as new_item(value)
      where new_item.value ->> 'id' = old_item.value ->> 'id'
    )
  ) then
    return false;
  end if;

  select count(*) into changed_transfer_count
  from pg_catalog.jsonb_array_elements(new_event -> 'transfers') as new_item(value)
  join pg_catalog.jsonb_array_elements(old_event -> 'transfers') as old_item(value)
    on old_item.value ->> 'id' = new_item.value ->> 'id'
  where old_item.value is distinct from new_item.value;

  if changed_transfer_count < 1 then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(new_event -> 'transfers') as new_item(value)
    join pg_catalog.jsonb_array_elements(old_event -> 'transfers') as old_item(value)
      on old_item.value ->> 'id' = new_item.value ->> 'id'
    where old_item.value is distinct from new_item.value
      and p_actor_participant_id is distinct from new_item.value ->> 'fromParticipantId'
      and p_actor_participant_id is distinct from new_item.value ->> 'toParticipantId'
      and not (
        p_actor_participant_id = any(private.event_admin_ids(p_old_state))
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(new_activity) as current_entry(value)
    join pg_catalog.jsonb_array_elements(old_activity) as previous_entry(value)
      on previous_entry.value ->> 'id' = current_entry.value ->> 'id'
    where previous_entry.value is distinct from current_entry.value
  ) then
    return false;
  end if;

  select count(*) into added_activity_count
  from pg_catalog.jsonb_array_elements(new_activity) as current_entry(value)
  where not exists (
    select 1
    from pg_catalog.jsonb_array_elements(old_activity) as previous_entry(value)
    where previous_entry.value = current_entry.value
  );

  select count(*) into removed_activity_count
  from pg_catalog.jsonb_array_elements(old_activity) as previous_entry(value)
  where not exists (
    select 1
    from pg_catalog.jsonb_array_elements(new_activity) as current_entry(value)
    where current_entry.value = previous_entry.value
  );

  if added_activity_count <> changed_transfer_count
    or (
      removed_activity_count > 0
      and not (
        pg_catalog.jsonb_array_length(old_activity) = 100
        and pg_catalog.jsonb_array_length(new_activity) = 100
        and removed_activity_count = added_activity_count
      )
    ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(new_activity) as activity(value)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(old_activity) as previous(value)
      where previous.value = activity.value
    )
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(new_event -> 'transferStatusUpdates') as status(value)
        join pg_catalog.jsonb_array_elements(new_event -> 'transfers') as transfer(value)
          on transfer.value ->> 'id' = status.value ->> 'id'
        join pg_catalog.jsonb_array_elements(old_event -> 'transfers') as old_transfer(value)
          on old_transfer.value ->> 'id' = transfer.value ->> 'id'
        where old_transfer.value is distinct from transfer.value
          and activity.value ->> 'entityId' = transfer.value ->> 'id'
          and activity.value ->> 'actorParticipantId' = p_actor_participant_id
          and activity.value ->> 'fromParticipantId' = transfer.value ->> 'fromParticipantId'
          and activity.value ->> 'toParticipantId' = transfer.value ->> 'toParticipantId'
          and activity.value ->> 'occurredAt' = status.value ->> 'updatedAt'
          and activity.value ->> 'kind' = case
            when status.value ->> 'status' = 'paid' then 'transfer-paid'
            else 'transfer-pending'
          end
      )
  ) then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function private.guard_shared_snapshot_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  old_event jsonb := old.state -> 'events' -> 0;
  new_event jsonb := new.state -> 'events' -> 0;
  old_active_ids text[] := private.active_event_participant_ids(old.state);
  new_active_ids text[] := private.active_event_participant_ids(new.state);
  old_participant_ids text[] := private.event_text_ids(old_event, 'participantIds');
  new_participant_ids text[] := private.event_text_ids(new_event, 'participantIds');
  old_inactive_ids text[] := private.event_text_ids(old_event, 'inactiveParticipantIds');
  new_inactive_ids text[] := private.event_text_ids(new_event, 'inactiveParticipantIds');
  old_admin_ids text[] := private.event_admin_ids(old.state);
  new_admin_ids text[] := private.event_admin_ids(new.state);
  actor_is_admin boolean;
  actor_is_joining boolean;
  actor_is_leaving boolean;
  actor_is_adding_offline_guests boolean;
  actor_is_updating_own_profile boolean;
  actor_is_updating_transfer_status boolean;
begin
  if old.snapshot_kind <> new.snapshot_kind then
    raise exception 'Snapshot kind cannot be changed'
      using errcode = '42501';
  end if;

  if old.access_key_hash <> new.access_key_hash then
    raise exception 'Snapshot access key cannot be changed through a state update'
      using errcode = '42501';
  end if;

  if old.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if actor_id is null or actor_participant_id is null then
    if pg_catalog.pg_trigger_depth() > 1
      and private.is_safe_account_deletion_anonymization(old.state, new.state) then
      return new;
    end if;
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if old_event is null then
    raise exception 'Shared event state is invalid'
      using errcode = '22023';
  end if;

  actor_is_admin := actor_participant_id = any(old_admin_ids);

  if new_event is null then
    if not actor_is_admin then
      raise exception 'Only an event admin can delete a shared event'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if coalesce(old_event ->> 'id', '') = ''
    or old_event ->> 'id' is distinct from new_event ->> 'id' then
    raise exception 'Shared event identity cannot be changed'
      using errcode = '22023';
  end if;

  if coalesce(old_event -> 'transferStatusUpdates', '[]'::jsonb) = '[]'::jsonb
    and coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb) = '[]'::jsonb then
    old_event := old_event - 'transferStatusUpdates';
    new_event := new_event - 'transferStatusUpdates';
  end if;

  actor_is_updating_transfer_status :=
    actor_participant_id = any(old_active_ids)
    and private.is_safe_transfer_status_only_update(
      new.id,
      old.state,
      new.state,
      actor_participant_id
    );

  if exists (
    select 1
    from pg_catalog.unnest(new_admin_ids) as admin_id(value)
    where not (admin_id.value = any(new_active_ids))
  ) then
    raise exception 'Event admins must be active participants'
      using errcode = '22023';
  end if;

  if pg_catalog.cardinality(new_active_ids) > 0
    and pg_catalog.cardinality(new_admin_ids) = 0 then
    raise exception 'A shared event must keep at least one active admin'
      using errcode = '22023';
  end if;

  actor_is_leaving :=
    actor_participant_id = any(old_active_ids)
    and not (actor_participant_id = any(new_active_ids))
    and pg_catalog.array_remove(old_active_ids, actor_participant_id) = new_active_ids
    and old_event ->> 'createdByParticipantId' is distinct from actor_participant_id
    and pg_catalog.cardinality(new_admin_ids) > 0
    and (
      old_admin_ids = new_admin_ids
      or pg_catalog.array_remove(old_admin_ids, actor_participant_id) = new_admin_ids
    );

  actor_is_joining :=
    not (actor_participant_id = any(old_active_ids))
    and actor_participant_id = any(new_active_ids)
    and pg_catalog.cardinality(new_active_ids) =
      pg_catalog.cardinality(old_active_ids) + 1
    and old_active_ids <@ new_active_ids
    and old_admin_ids = new_admin_ids;

  actor_is_adding_offline_guests :=
    actor_participant_id = any(old_active_ids)
    and private.is_safe_offline_guest_addition(old.state, new.state);

  actor_is_updating_own_profile :=
    actor_participant_id = any(old_active_ids)
    and private.is_safe_self_profile_update(
      old.state,
      new.state,
      actor_participant_id
    );

  if (
    old_participant_ids is distinct from new_participant_ids
    or old_inactive_ids is distinct from new_inactive_ids
    or old_admin_ids is distinct from new_admin_ids
  ) and not actor_is_admin
    and not actor_is_leaving
    and not actor_is_joining
    and not actor_is_adding_offline_guests then
    raise exception 'Only an event admin can manage event membership'
      using errcode = '42501';
  end if;

  if not actor_is_admin then
    if old.state -> 'deletedParticipants' is distinct from
      new.state -> 'deletedParticipants' then
      raise exception 'Only an event admin can merge participant identities'
        using errcode = '42501';
    end if;

    if old.state - array['events', 'participants', 'deletedParticipants'] is distinct from
      new.state - array['events', 'participants', 'deletedParticipants'] then
      raise exception 'Only an event admin can change shared event metadata'
        using errcode = '42501';
    end if;

    if actor_is_joining or actor_is_leaving then
      if old_event - array[
          'participantIds',
          'inactiveParticipantIds',
          'membershipUpdatedAt',
          'membershipUpdatedAtByParticipant',
          'adminIds',
          'adminIdsUpdatedAt'
        ] is distinct from new_event - array[
          'participantIds',
          'inactiveParticipantIds',
          'membershipUpdatedAt',
          'membershipUpdatedAtByParticipant',
          'adminIds',
          'adminIdsUpdatedAt'
        ] then
        raise exception 'A membership update cannot change event content'
          using errcode = '42501';
      end if;

      if actor_is_leaving
        and old.state -> 'participants' is distinct from
          new.state -> 'participants' then
        raise exception 'Leaving cannot change participant profiles'
          using errcode = '42501';
      end if;

      if actor_is_joining and (
        pg_catalog.jsonb_array_length(
          case
            when pg_catalog.jsonb_typeof(new.state -> 'participants') = 'array'
              then new.state -> 'participants'
            else '[]'::jsonb
          end
        ) > pg_catalog.jsonb_array_length(
          case
            when pg_catalog.jsonb_typeof(old.state -> 'participants') = 'array'
              then old.state -> 'participants'
            else '[]'::jsonb
          end
        ) + 1
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(old.state -> 'participants') = 'array'
                then old.state -> 'participants'
              else '[]'::jsonb
            end
          ) as old_participant(value)
          where not exists (
            select 1
            from pg_catalog.jsonb_array_elements(
              case
                when pg_catalog.jsonb_typeof(new.state -> 'participants') = 'array'
                  then new.state -> 'participants'
                else '[]'::jsonb
              end
            ) as new_participant(value)
            where new_participant.value = old_participant.value
          )
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(new.state -> 'participants') = 'array'
                then new.state -> 'participants'
              else '[]'::jsonb
            end
          ) as new_participant(value)
          where not exists (
            select 1
            from pg_catalog.jsonb_array_elements(
              case
                when pg_catalog.jsonb_typeof(old.state -> 'participants') = 'array'
                  then old.state -> 'participants'
                else '[]'::jsonb
              end
            ) as old_participant(value)
            where old_participant.value = new_participant.value
          )
          and new_participant.value ->> 'id' is distinct from actor_participant_id
        )
      ) then
        raise exception 'Joining can add only the authenticated participant profile'
          using errcode = '42501';
      end if;
    else
      if not (actor_participant_id = any(old_active_ids)) then
        raise exception 'The event state must include the active member before editing'
          using errcode = '42501';
      end if;

      if not actor_is_adding_offline_guests
        and not actor_is_updating_own_profile
        and old.state -> 'participants' is distinct from
          new.state -> 'participants' then
        raise exception 'Only an event admin can change participant profiles'
          using errcode = '42501';
      end if;

      if old_event - (case
          when actor_is_adding_offline_guests then array[
            'participantIds',
            'inactiveParticipantIds',
            'membershipUpdatedAt',
            'membershipUpdatedAtByParticipant',
            'updatedAt',
            'expenses',
            'deletedExpenses',
            'transfers',
            'transferStatusUpdates',
            'activityLog'
          ]
          else array[
            'updatedAt',
            'expenses',
            'deletedExpenses',
            'transfers',
            'transferStatusUpdates',
            'activityLog'
          ]
        end) is distinct from new_event - (case
          when actor_is_adding_offline_guests then array[
            'participantIds',
            'inactiveParticipantIds',
            'membershipUpdatedAt',
            'membershipUpdatedAtByParticipant',
            'updatedAt',
            'expenses',
            'deletedExpenses',
            'transfers',
            'transferStatusUpdates',
            'activityLog'
          ]
          else array[
            'updatedAt',
            'expenses',
            'deletedExpenses',
            'transfers',
            'transferStatusUpdates',
            'activityLog'
          ]
        end) then
        raise exception 'Only an event admin can change event settings'
          using errcode = '42501';
      end if;

      if coalesce((old_event ->> 'locked')::boolean, false)
        and (
          old_event -> 'expenses' is distinct from new_event -> 'expenses'
          or old_event -> 'deletedExpenses' is distinct from
            new_event -> 'deletedExpenses'
        ) then
        raise exception 'Expenses cannot be changed while the event is locked'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if coalesce((old_event ->> 'adminsCanEditOnly')::boolean, false)
    and not actor_is_admin
    and not actor_is_leaving
    and not actor_is_joining
    and not actor_is_updating_transfer_status
    and not (
      actor_is_updating_own_profile
      and old.state - 'participants' is not distinct from
        new.state - 'participants'
    )
    and old.state is distinct from new.state then
    raise exception 'Only an event admin can edit this event'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.sync_shared_snapshot_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  active_ids text[] := case
    when new.state -> 'events' -> 0 is null then '{}'::text[]
    else private.active_event_participant_ids(new.state)
  end;
  admin_ids text[] := case
    when new.state -> 'events' -> 0 is null then '{}'::text[]
    else private.event_admin_ids(new.state)
  end;
begin
  if new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if actor_id is not null
    and actor_participant_id is not null
    and actor_participant_id = any(active_ids) then
    insert into private.shared_snapshot_members (
      snapshot_id,
      user_id,
      participant_id,
      role,
      status
    )
    values (
      new.id,
      actor_id,
      actor_participant_id,
      case when actor_participant_id = any(admin_ids) then 'admin' else 'member' end,
      'active'
    )
    on conflict (snapshot_id, user_id) do nothing;
  end if;

  update private.shared_snapshot_members as member
  set
    status = case
      when member.participant_id = any(active_ids) then 'active'
      else 'removed'
    end,
    role = case
      when member.participant_id = any(admin_ids) then 'admin'
      else 'member'
    end,
    removed_at = case
      when member.participant_id = any(active_ids) then null
      else coalesce(member.removed_at, pg_catalog.now())
    end,
    updated_at = pg_catalog.now()
  where member.snapshot_id = new.id;

  return new;
end;
$$;

create or replace function private.register_shared_snapshot_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  active_ids text[] := private.active_event_participant_ids(new.state);
  admin_ids text[] := private.event_admin_ids(new.state);
begin
  if new.snapshot_kind <> 'shared_event'
    or actor_id is null
    or actor_participant_id is null
    or not (actor_participant_id = any(active_ids)) then
    return new;
  end if;

  insert into private.shared_snapshot_members (
    snapshot_id,
    user_id,
    participant_id,
    role,
    status
  )
  values (
    new.id,
    actor_id,
    actor_participant_id,
    case when actor_participant_id = any(admin_ids) then 'admin' else 'member' end,
    'active'
  )
  on conflict (snapshot_id, user_id) do update
  set
    participant_id = excluded.participant_id,
    role = excluded.role,
    status = 'active',
    removed_at = null,
    updated_at = pg_catalog.now();

  return new;
end;
$$;

create or replace function public.join_shared_event(p_snapshot_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  snapshot public.app_snapshots%rowtype;
  existing_member private.shared_snapshot_members%rowtype;
  inactive_ids text[];
begin
  if actor_id is null or actor_participant_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select record.*
  into snapshot
  from public.app_snapshots as record
  where record.id = p_snapshot_id
  for update;

  if snapshot.id is null or snapshot.snapshot_kind <> 'shared_event' then
    raise exception 'Shared event membership is invalid'
      using errcode = '42501';
  end if;

  if snapshot.state -> 'events' -> 0 is null then
    raise exception 'Shared event is no longer available'
      using errcode = '42501';
  end if;

  inactive_ids := private.event_text_ids(
    snapshot.state -> 'events' -> 0,
    'inactiveParticipantIds'
  );
  select member.*
  into existing_member
  from private.shared_snapshot_members as member
  where member.snapshot_id = snapshot.id
    and member.user_id = actor_id
  for update;

  if existing_member.user_id is null
    or existing_member.status <> 'active'
    or existing_member.participant_id <> actor_participant_id then
    raise exception 'You are no longer a member of this event'
      using errcode = '42501';
  end if;

  if actor_participant_id = any(inactive_ids) then
    raise exception 'You are no longer a member of this event'
      using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'active',
    'snapshotId', snapshot.id,
    'participantId', actor_participant_id
  );
end;
$$;

create or replace function public.create_shared_event_snapshot(
  p_snapshot_id text,
  p_space_key text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  event_record jsonb := p_state -> 'events' -> 0;
  existing_snapshot public.app_snapshots%rowtype;
  existing_member private.shared_snapshot_members%rowtype;
  expected_hash text;
begin
  if actor_id is null or actor_participant_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if coalesce(p_snapshot_id, '') !~ '^[A-Za-z0-9_-]{3,80}$'
    or char_length(coalesce(p_space_key, '')) < 24
    or char_length(p_space_key) > 256
    or not private.is_shared_event_state(p_state)
    or event_record is null then
    raise exception 'Shared event creation payload is invalid'
      using errcode = '22023';
  end if;

  if not (
      actor_participant_id = any(private.active_event_participant_ids(p_state))
      and actor_participant_id = any(private.event_admin_ids(p_state))
      and event_record ->> 'createdByParticipantId' = actor_participant_id
    ) then
    raise exception 'Only the authenticated event creator can create this event'
      using errcode = '42501';
  end if;

  expected_hash := pg_catalog.encode(
    extensions.digest(p_space_key, 'sha256'),
    'hex'
  );

  select snapshot.*
  into existing_snapshot
  from public.app_snapshots as snapshot
  where snapshot.id = p_snapshot_id
  for update;

  if existing_snapshot.id is not null then
    select member.*
    into existing_member
    from private.shared_snapshot_members as member
    where member.snapshot_id = p_snapshot_id
      and member.user_id = actor_id
    for update;

    if existing_snapshot.snapshot_kind <> 'shared_event'
      or existing_snapshot.access_key_hash <> expected_hash
      or existing_snapshot.state -> 'events' -> 0 ->> 'id'
        is distinct from event_record ->> 'id'
      or existing_member.user_id is null
      or existing_member.status <> 'active'
      or existing_member.participant_id <> actor_participant_id then
      raise exception 'Shared event identifier is already in use'
        using errcode = '42501';
    end if;

    return pg_catalog.jsonb_build_object(
      'status', 'existing',
      'snapshotId', existing_snapshot.id,
      'updatedAt', existing_snapshot.updated_at
    );
  end if;

  insert into public.app_snapshots (
    id,
    access_key_hash,
    owner_user_id,
    snapshot_kind,
    state,
    updated_at
  )
  values (
    p_snapshot_id,
    expected_hash,
    null,
    'shared_event',
    p_state,
    pg_catalog.now()
  );

  return pg_catalog.jsonb_build_object(
    'status', 'created',
    'snapshotId', p_snapshot_id
  );
end;
$$;

drop trigger if exists guard_shared_snapshot_update on public.app_snapshots;
create trigger guard_shared_snapshot_update
  before update on public.app_snapshots
  for each row execute function private.guard_shared_snapshot_update();

create or replace function private.prevent_locked_event_expense_updates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_event jsonb := old.state -> 'events' -> 0;
  new_event jsonb := new.state -> 'events' -> 0;
begin
  if old.snapshot_kind <> 'shared_event'
    or old_event is null
    or new_event is null then
    return new;
  end if;

  if coalesce((old_event ->> 'locked')::boolean, false)
    and (
      coalesce(old_event -> 'expenses', '[]'::jsonb) is distinct from
        coalesce(new_event -> 'expenses', '[]'::jsonb)
      or coalesce(old_event -> 'deletedExpenses', '[]'::jsonb) is distinct from
        coalesce(new_event -> 'deletedExpenses', '[]'::jsonb)
    ) then
    raise exception 'Expenses cannot be changed while the event is locked'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_locked_event_expense_updates on public.app_snapshots;
create trigger prevent_locked_event_expense_updates
  before update on public.app_snapshots
  for each row execute function private.prevent_locked_event_expense_updates();

drop trigger if exists classify_snapshot_kind on public.app_snapshots;
create trigger classify_snapshot_kind
  before insert on public.app_snapshots
  for each row execute function private.classify_snapshot_kind();

drop trigger if exists sync_shared_snapshot_members on public.app_snapshots;
create trigger sync_shared_snapshot_members
  after insert or update on public.app_snapshots
  for each row execute function private.sync_shared_snapshot_members();

drop trigger if exists register_shared_snapshot_creator on public.app_snapshots;
create trigger register_shared_snapshot_creator
  after insert on public.app_snapshots
  for each row execute function private.register_shared_snapshot_creator();

revoke all on table public.app_snapshots from public, anon, authenticated;
grant select on table public.app_snapshots to anon, authenticated;
grant insert, update on table public.app_snapshots to authenticated;

revoke all on function public.request_space_key_hash() from public;
grant execute on function public.request_space_key_hash() to anon, authenticated;

revoke all on function private.event_text_ids(jsonb, text) from public, anon, authenticated;
revoke all on function private.is_shared_event_state(jsonb) from public, anon, authenticated;
revoke all on function private.classify_snapshot_kind() from public, anon, authenticated;
revoke all on function private.is_safe_offline_guest_addition(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.is_safe_self_profile_update(jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function private.active_event_participant_ids(jsonb) from public, anon, authenticated;
revoke all on function private.event_admin_ids(jsonb) from public, anon, authenticated;
revoke all on function private.current_actor_participant_id() from public, anon, authenticated;
revoke all on function private.is_safe_account_deletion_anonymization(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.guard_shared_snapshot_update() from public, anon, authenticated;
revoke all on function private.prevent_locked_event_expense_updates()
  from public, anon, authenticated;
revoke all on function private.sync_shared_snapshot_members() from public, anon, authenticated;
revoke all on function private.register_shared_snapshot_creator() from public, anon, authenticated;
revoke all on function public.can_write_shared_snapshot(text) from public, anon;
grant execute on function public.can_write_shared_snapshot(text) to authenticated;
revoke all on function public.can_read_deleted_shared_snapshot(text)
  from public, anon;
grant execute on function public.can_read_deleted_shared_snapshot(text)
  to authenticated;
revoke all on function public.can_bootstrap_shared_snapshot(text) from public, anon;
grant execute on function public.can_bootstrap_shared_snapshot(text) to authenticated;

revoke all on function public.join_shared_event(text) from public, anon;
grant execute on function public.join_shared_event(text) to authenticated;
grant execute on function public.join_shared_event(text) to service_role;

revoke all on function public.create_shared_event_snapshot(text, text, jsonb)
  from public, anon;
grant execute on function public.create_shared_event_snapshot(text, text, jsonb)
  to authenticated;
grant execute on function public.create_shared_event_snapshot(text, text, jsonb)
  to service_role;

drop policy if exists app_snapshots_select on public.app_snapshots;
create policy app_snapshots_select
  on public.app_snapshots
  for select
  to anon, authenticated
  using (
    owner_user_id is null
    and snapshot_kind = 'workspace'
    and access_key_hash = (select public.request_space_key_hash())
  );

drop policy if exists app_snapshots_member_select on public.app_snapshots;
create policy app_snapshots_member_select
  on public.app_snapshots
  for select
  to authenticated
  using (
    snapshot_kind = 'shared_event'
    and (
      (select public.can_write_shared_snapshot(id))
      or (
        state -> 'events' -> 0 is null
        and pg_catalog.jsonb_typeof(state -> 'deletedEvents') = 'array'
        and pg_catalog.jsonb_array_length(state -> 'deletedEvents') > 0
        and (select public.can_read_deleted_shared_snapshot(id))
      )
    )
  );

drop policy if exists app_snapshots_insert on public.app_snapshots;
create policy app_snapshots_insert
  on public.app_snapshots
  for insert
  to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and access_key_hash = (select public.request_space_key_hash())
  );

drop policy if exists app_snapshots_update on public.app_snapshots;
create policy app_snapshots_update
  on public.app_snapshots
  for update
  to authenticated
  using (
    owner_user_id is null
    and (
      (
        snapshot_kind = 'workspace'
        and access_key_hash = (select public.request_space_key_hash())
      )
      or (
        snapshot_kind = 'shared_event'
        and (
          (select public.can_write_shared_snapshot(id))
          or (select public.can_bootstrap_shared_snapshot(id))
        )
      )
    )
  )
  with check (
    owner_user_id is null
    and (
      (
        snapshot_kind = 'workspace'
        and access_key_hash = (select public.request_space_key_hash())
      )
      or (
        snapshot_kind = 'shared_event'
        and (
          (select public.can_write_shared_snapshot(id))
          or (select public.can_bootstrap_shared_snapshot(id))
        )
      )
    )
  );

drop policy if exists app_snapshots_owner_select on public.app_snapshots;
create policy app_snapshots_owner_select
  on public.app_snapshots
  for select
  to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists app_snapshots_owner_insert on public.app_snapshots;
create policy app_snapshots_owner_insert
  on public.app_snapshots
  for insert
  to authenticated
  with check (owner_user_id = (select auth.uid()));

drop policy if exists app_snapshots_owner_update on public.app_snapshots;
create policy app_snapshots_owner_update
  on public.app_snapshots
  for update
  to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
    check (char_length(pg_catalog.btrim(display_name)) between 2 and 80),
  avatar_preset text,
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists username text;

alter table public.user_profiles
  add column if not exists username_customized boolean not null default false;

alter table public.user_profiles
  add column if not exists avatar_image text;

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

create or replace function private.default_friend_username(
  p_user_id uuid,
  p_email text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  base_name text;
begin
  base_name := pg_catalog.regexp_replace(
    pg_catalog.lower(
      pg_catalog.split_part(coalesce(p_email, ''), '@', 1)
    ),
    '[^a-z0-9_]+',
    '_',
    'g'
  );
  base_name := pg_catalog.regexp_replace(base_name, '^_+|_+$', '', 'g');

  if base_name !~ '^[a-z]' then
    base_name := 'user_' || base_name;
  end if;
  if pg_catalog.char_length(base_name) < 3 then
    base_name := 'user';
  end if;

  return pg_catalog.left(base_name, 15) || '_' ||
    pg_catalog.substring(pg_catalog.md5(p_user_id::text), 1, 8);
end;
$$;

update public.user_profiles as profile
set username = private.default_friend_username(profile.user_id, account.email)
from auth.users as account
where account.id = profile.user_id
  and profile.username is null;

update public.user_profiles as profile
set username_customized = (
  profile.username !~ (
    '_' || pg_catalog.substring(pg_catalog.md5(profile.user_id::text), 1, 8) || '$'
  )
);

alter table public.user_profiles
  alter column username set not null;
alter table public.user_profiles
  drop constraint if exists user_profiles_username_format;
alter table public.user_profiles
  add constraint user_profiles_username_format
  check (
    username = pg_catalog.lower(username)
    and username ~ '^[a-z][a-z0-9_]{2,23}$'
  );

create unique index if not exists user_profiles_username_unique_idx
  on public.user_profiles (username);

create table if not exists public.friend_invite_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique
    check (code ~ '^[a-f0-9]{20}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default extensions.gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  user_low uuid generated always as (
    least(requester_id, addressee_id)
  ) stored,
  user_high uuid generated always as (
    greatest(requester_id, addressee_id)
  ) stored,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (user_low, user_high)
);

create index if not exists friendships_requester_id_idx
  on public.friendships (requester_id);
create index if not exists friendships_addressee_id_idx
  on public.friendships (addressee_id);
create index if not exists friendships_status_idx
  on public.friendships (status);

create table if not exists public.user_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_display_name text not null
    check (pg_catalog.length(blocked_display_name) between 1 and 80),
  blocked_username text
    check (
      blocked_username is null
      or blocked_username ~ '^[a-z][a-z0-9_]{2,23}$'
    ),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create index if not exists user_blocks_blocked_user_id_idx
  on public.user_blocks (blocked_user_id);

create table if not exists public.content_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  shared_space_id text not null
    check (shared_space_id ~ '^[a-zA-Z0-9_-]{3,80}$'),
  category text not null
    check (category in ('harassment', 'impersonation', 'offensive_content', 'spam', 'other')),
  details text not null default ''
    check (pg_catalog.length(details) <= 1000),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (reporter_user_id <> reported_user_id)
);

create index if not exists content_reports_reporter_created_idx
  on public.content_reports (reporter_user_id, created_at desc);
create index if not exists content_reports_status_created_idx
  on public.content_reports (status, created_at);
create unique index if not exists content_reports_one_open_report_idx
  on public.content_reports (
    reporter_user_id,
    reported_user_id,
    shared_space_id
  )
  where status in ('new', 'reviewing');

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

drop trigger if exists create_user_friend_profile on auth.users;
create trigger create_user_friend_profile
  after insert on auth.users
  for each row execute function private.create_user_friend_profile();

insert into public.user_profiles (
  user_id,
  username,
  username_customized,
  display_name
)
select
  account.id,
  private.default_friend_username(account.id, account.email),
  false,
  coalesce(
    nullif(pg_catalog.btrim(account.raw_user_meta_data ->> 'full_name'), ''),
    nullif(pg_catalog.btrim(account.raw_user_meta_data ->> 'name'), ''),
    'משתמש חדש'
  )
from auth.users as account
on conflict (user_id) do nothing;

insert into public.friend_invite_codes (user_id, code)
select
  account.id,
  pg_catalog.encode(extensions.gen_random_bytes(10), 'hex')
from auth.users as account
on conflict (user_id) do nothing;

alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;
alter table public.friend_invite_codes enable row level security;
alter table public.friend_invite_codes force row level security;
alter table public.friendships enable row level security;
alter table public.friendships force row level security;
alter table public.user_blocks enable row level security;
alter table public.user_blocks force row level security;
alter table public.content_reports enable row level security;
alter table public.content_reports force row level security;

revoke all on table public.user_profiles from public, anon, authenticated;
revoke all on table public.friend_invite_codes from public, anon, authenticated;
revoke all on table public.friendships from public, anon, authenticated;
revoke all on table public.user_blocks from public, anon, authenticated;
revoke all on table public.content_reports from public, anon, authenticated;

grant select, insert, update on table public.user_profiles to authenticated;
grant select on table public.friend_invite_codes to authenticated;
grant select on table public.friendships to authenticated;
grant select on table public.user_blocks to authenticated;
grant select on table public.content_reports to authenticated;
grant select, insert, update, delete on table public.user_profiles to service_role;
grant select, insert, update, delete on table public.friend_invite_codes to service_role;
grant select, insert, update, delete on table public.friendships to service_role;
grant select, insert, update, delete on table public.user_blocks to service_role;
grant select, insert, update, delete on table public.content_reports to service_role;

drop policy if exists user_profiles_select_private_network on public.user_profiles;
create policy user_profiles_select_private_network
  on public.user_profiles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.friendships as friendship
      where friendship.status in ('pending', 'accepted')
        and (
          (
            friendship.requester_id = (select auth.uid())
            and friendship.addressee_id = user_profiles.user_id
          )
          or (
            friendship.addressee_id = (select auth.uid())
            and friendship.requester_id = user_profiles.user_id
          )
        )
    )
  );

drop policy if exists user_profiles_insert_self on public.user_profiles;
create policy user_profiles_insert_self
  on public.user_profiles
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_profiles_update_self on public.user_profiles;
create policy user_profiles_update_self
  on public.user_profiles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists friend_invite_codes_select_self on public.friend_invite_codes;
create policy friend_invite_codes_select_self
  on public.friend_invite_codes
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists friendships_select_parties on public.friendships;
create policy friendships_select_parties
  on public.friendships
  for select
  to authenticated
  using (
    requester_id = (select auth.uid())
    or addressee_id = (select auth.uid())
  );

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own
  on public.user_blocks
  for select
  to authenticated
  using (blocker_user_id = (select auth.uid()));

drop policy if exists content_reports_select_own on public.content_reports;
create policy content_reports_select_own
  on public.content_reports
  for select
  to authenticated
  using (reporter_user_id = (select auth.uid()));

create or replace function public.request_friendship(
  p_friend_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_id uuid;
  friendship public.friendships%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select invite.user_id
  into target_id
  from public.friend_invite_codes as invite
  where invite.code = pg_catalog.lower(pg_catalog.btrim(p_friend_code));

  if target_id is null then
    raise exception 'Friend code was not found'
      using errcode = 'P0001';
  end if;

  if target_id = actor_id then
    raise exception 'You cannot send a friend request to yourself'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.user_blocks as user_block
    where (
      user_block.blocker_user_id = actor_id
      and user_block.blocked_user_id = target_id
    ) or (
      user_block.blocker_user_id = target_id
      and user_block.blocked_user_id = actor_id
    )
  ) then
    raise exception 'Friendship is unavailable for blocked accounts'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'friendship:' || least(actor_id, target_id)::text || ':' ||
      greatest(actor_id, target_id)::text,
      0
    )
  );

  select relation.*
  into friendship
  from public.friendships as relation
  where relation.user_low = least(actor_id, target_id)
    and relation.user_high = greatest(actor_id, target_id)
  for update;

  if friendship.id is null then
    insert into public.friendships (
      requester_id,
      addressee_id,
      status
    )
    values (
      actor_id,
      target_id,
      'pending'
    )
    returning * into friendship;
  elsif friendship.status = 'accepted' then
    null;
  elsif (
    friendship.status = 'pending'
    and friendship.requester_id = target_id
    and friendship.addressee_id = actor_id
  ) then
    update public.friendships
    set
      status = 'accepted',
      responded_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where id = friendship.id
    returning * into friendship;
  elsif (
    friendship.status <> 'pending'
    or friendship.requester_id <> actor_id
  ) then
    update public.friendships
    set
      requester_id = actor_id,
      addressee_id = target_id,
      status = 'pending',
      requested_at = pg_catalog.now(),
      responded_at = null,
      updated_at = pg_catalog.now()
    where id = friendship.id
    returning * into friendship;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', friendship.id,
    'status', friendship.status
  );
end;
$$;

create or replace function public.request_friendship_by_username(
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_username text := pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(p_username), '^@+', '')
  );
  friend_code text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if normalized_username !~ '^[a-z][a-z0-9_]{2,23}$' then
    raise exception 'Username is invalid'
      using errcode = '22023';
  end if;

  select invite.code
  into friend_code
  from public.user_profiles as profile
  join public.friend_invite_codes as invite
    on invite.user_id = profile.user_id
  where profile.username = normalized_username
    and profile.username_customized = true;

  if friend_code is null then
    raise exception 'Username was not found'
      using errcode = 'P0001';
  end if;

  return public.request_friendship(friend_code);
end;
$$;

create or replace function private.is_active_shared_event_member(
  p_snapshot_id text,
  p_user_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_snapshots as snapshot
    join private.shared_snapshot_members as member
      on member.snapshot_id = snapshot.id
    where snapshot.id = p_snapshot_id
      and snapshot.owner_user_id is null
      and snapshot.snapshot_kind = 'shared_event'
      and member.user_id = p_user_id
      and member.participant_id = 'account-' || p_user_id::text
      and member.status = 'active'
  );
$$;

revoke all on function private.is_active_shared_event_member(text, uuid)
  from public, anon, authenticated;

create or replace function public.request_friendship_from_event(
  p_shared_space_id text,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_space_id text := pg_catalog.btrim(p_shared_space_id);
  friend_code text;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_target_user_id is null or p_target_user_id = actor_id then
    raise exception 'Friend account is invalid'
      using errcode = '22023';
  end if;

  if normalized_space_id !~ '^[a-zA-Z0-9_-]{3,80}$'
    or normalized_space_id = 'default' then
    raise exception 'Shared event is invalid'
      using errcode = '22023';
  end if;

  if not private.is_active_shared_event_member(normalized_space_id, actor_id)
    or not private.is_active_shared_event_member(
      normalized_space_id,
      p_target_user_id
    ) then
    raise exception 'Both accounts must be active participants in the shared event'
      using errcode = '42501';
  end if;

  select invite.code
  into friend_code
  from public.friend_invite_codes as invite
  where invite.user_id = p_target_user_id;

  if friend_code is null then
    raise exception 'Friend account was not found'
      using errcode = 'P0001';
  end if;

  return public.request_friendship(friend_code);
end;
$$;

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

create or replace function public.manage_friendship(
  p_friendship_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  action_name text := pg_catalog.lower(pg_catalog.btrim(p_action));
  friendship public.friendships%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select relation.*
  into friendship
  from public.friendships as relation
  where relation.id = p_friendship_id
  for update;

  if friendship.id is null
    or actor_id not in (friendship.requester_id, friendship.addressee_id) then
    raise exception 'Friendship was not found'
      using errcode = 'P0001';
  end if;

  if action_name = 'accept' then
    if friendship.status <> 'pending'
      or friendship.addressee_id <> actor_id then
      raise exception 'Only the recipient can accept a pending request'
        using errcode = '42501';
    end if;

    update public.friendships
    set
      status = 'accepted',
      responded_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where id = friendship.id
    returning * into friendship;
  elsif action_name = 'decline' then
    if friendship.status <> 'pending'
      or friendship.addressee_id <> actor_id then
      raise exception 'Only the recipient can decline a pending request'
        using errcode = '42501';
    end if;

    update public.friendships
    set
      status = 'declined',
      responded_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where id = friendship.id
    returning * into friendship;
  elsif action_name = 'cancel' then
    if friendship.status <> 'pending'
      or friendship.requester_id <> actor_id then
      raise exception 'Only the requester can cancel a pending request'
        using errcode = '42501';
    end if;

    delete from public.friendships
    where id = friendship.id;
    return pg_catalog.jsonb_build_object(
      'id', friendship.id,
      'status', 'cancelled'
    );
  elsif action_name = 'remove' then
    if friendship.status <> 'accepted' then
      raise exception 'Only an accepted friendship can be removed'
        using errcode = 'P0001';
    end if;

    delete from public.friendships
    where id = friendship.id;
    return pg_catalog.jsonb_build_object(
      'id', friendship.id,
      'status', 'removed'
    );
  else
    raise exception 'Unsupported friendship action'
      using errcode = 'P0001';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', friendship.id,
    'status', friendship.status
  );
end;
$$;

create or replace function public.block_user(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_profile public.user_profiles%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_target_user_id is null or p_target_user_id = actor_id then
    raise exception 'Blocked account is invalid'
      using errcode = '22023';
  end if;

  select profile.*
  into target_profile
  from public.user_profiles as profile
  where profile.user_id = p_target_user_id;

  if target_profile.user_id is null then
    raise exception 'Blocked account was not found'
      using errcode = 'P0001';
  end if;

  insert into public.user_blocks (
    blocker_user_id,
    blocked_user_id,
    blocked_display_name,
    blocked_username
  ) values (
    actor_id,
    p_target_user_id,
    target_profile.display_name,
    target_profile.username
  )
  on conflict (blocker_user_id, blocked_user_id)
  do update set
    blocked_display_name = excluded.blocked_display_name,
    blocked_username = excluded.blocked_username,
    created_at = pg_catalog.now();

  delete from public.friendships as friendship
  where friendship.user_low = least(actor_id, p_target_user_id)
    and friendship.user_high = greatest(actor_id, p_target_user_id);

  return pg_catalog.jsonb_build_object(
    'blocked_user_id', p_target_user_id,
    'status', 'blocked'
  );
end;
$$;

create or replace function public.unblock_user(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_target_user_id is null or p_target_user_id = actor_id then
    raise exception 'Blocked account is invalid'
      using errcode = '22023';
  end if;

  delete from public.user_blocks
  where blocker_user_id = actor_id
    and blocked_user_id = p_target_user_id;

  return pg_catalog.jsonb_build_object(
    'blocked_user_id', p_target_user_id,
    'status', 'unblocked'
  );
end;
$$;

create or replace function public.submit_user_report(
  p_shared_space_id text,
  p_target_user_id uuid,
  p_category text,
  p_details text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_space_id text := pg_catalog.btrim(p_shared_space_id);
  normalized_category text := pg_catalog.lower(pg_catalog.btrim(p_category));
  normalized_details text := pg_catalog.btrim(coalesce(p_details, ''));
  report_record public.content_reports%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_target_user_id is null or p_target_user_id = actor_id then
    raise exception 'Reported account is invalid'
      using errcode = '22023';
  end if;

  if normalized_space_id !~ '^[a-zA-Z0-9_-]{3,80}$'
    or normalized_space_id = 'default' then
    raise exception 'Shared event is invalid'
      using errcode = '22023';
  end if;

  if normalized_category not in (
    'harassment',
    'impersonation',
    'offensive_content',
    'spam',
    'other'
  ) then
    raise exception 'Report category is invalid'
      using errcode = '22023';
  end if;

  if pg_catalog.length(normalized_details) > 1000 then
    raise exception 'Report details are too long'
      using errcode = '22023';
  end if;

  if not private.is_active_shared_event_member(normalized_space_id, actor_id)
    or not private.is_active_shared_event_member(
      normalized_space_id,
      p_target_user_id
    ) then
    raise exception 'Both accounts must be active participants in the shared event'
      using errcode = '42501';
  end if;

  insert into public.content_reports (
    reporter_user_id,
    reported_user_id,
    shared_space_id,
    category,
    details
  ) values (
    actor_id,
    p_target_user_id,
    normalized_space_id,
    normalized_category,
    normalized_details
  )
  on conflict (
    reporter_user_id,
    reported_user_id,
    shared_space_id
  ) where status in ('new', 'reviewing')
  do update set
    category = excluded.category,
    details = excluded.details,
    updated_at = pg_catalog.now()
  returning * into report_record;

  return pg_catalog.jsonb_build_object(
    'id', report_record.id,
    'status', report_record.status
  );
end;
$$;

revoke all on function private.create_user_friend_profile() from public, anon, authenticated;
revoke all on function private.default_friend_username(uuid, text) from public, anon, authenticated;
revoke all on function public.request_friendship(text) from public, anon;
revoke all on function public.request_friendship_by_username(text) from public, anon;
revoke all on function public.request_friendship_from_event(text, uuid) from public, anon;
revoke all on function public.set_friend_username(text) from public, anon;
revoke all on function public.manage_friendship(uuid, text) from public, anon;
revoke all on function public.block_user(uuid) from public, anon, authenticated;
revoke all on function public.unblock_user(uuid) from public, anon, authenticated;
revoke all on function public.submit_user_report(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_friendship(text) to authenticated;
grant execute on function public.request_friendship_by_username(text) to authenticated;
grant execute on function public.request_friendship_from_event(text, uuid) to authenticated;
grant execute on function public.set_friend_username(text) to authenticated;
grant execute on function public.manage_friendship(uuid, text) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.submit_user_report(text, uuid, text, text) to authenticated;
grant execute on function public.request_friendship(text) to service_role;
grant execute on function public.request_friendship_by_username(text) to service_role;
grant execute on function public.request_friendship_from_event(text, uuid) to service_role;
grant execute on function public.set_friend_username(text) to service_role;
grant execute on function public.manage_friendship(uuid, text) to service_role;
grant execute on function public.block_user(uuid) to service_role;
grant execute on function public.unblock_user(uuid) to service_role;
grant execute on function public.submit_user_report(text, uuid, text, text) to service_role;

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null,
  enabled boolean not null default true,
  preferences jsonb not null default '{}'::jsonb,
  app_version text,
  last_seen_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint push_devices_token_length check (
    pg_catalog.length(token) between 20 and 4096
  ),
  constraint push_devices_platform check (
    platform in ('android', 'ios')
  ),
  constraint push_devices_preferences_object check (
    pg_catalog.jsonb_typeof(preferences) = 'object'
  )
);

create unique index if not exists push_devices_token_key
  on public.push_devices (token);
create index if not exists push_devices_user_enabled_idx
  on public.push_devices (user_id, enabled);

create table if not exists public.broadcast_notification_deliveries (
  campaign_id text not null,
  device_id uuid not null references public.push_devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reserved_at timestamptz not null default now(),
  delivered_at timestamptz,
  primary key (campaign_id, device_id),
  constraint broadcast_notification_campaign_id_check check (
    char_length(campaign_id) between 1 and 80
    and campaign_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
  )
);

create index if not exists broadcast_notification_deliveries_user_idx
  on public.broadcast_notification_deliveries (user_id, reserved_at desc);

alter table public.broadcast_notification_deliveries enable row level security;
alter table public.broadcast_notification_deliveries force row level security;
revoke all on table public.broadcast_notification_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.broadcast_notification_deliveries to service_role;

alter table public.push_devices enable row level security;
alter table public.push_devices force row level security;

revoke all on table public.push_devices from public, anon, authenticated;
grant select, delete on table public.push_devices to authenticated;
grant select, insert, update, delete on table public.push_devices to service_role;

drop policy if exists push_devices_select_self on public.push_devices;
create policy push_devices_select_self
  on public.push_devices
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists push_devices_delete_self on public.push_devices;
create policy push_devices_delete_self
  on public.push_devices
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.register_push_device(
  p_token text,
  p_platform text,
  p_preferences jsonb default '{}'::jsonb,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_token text := pg_catalog.btrim(p_token);
  normalized_platform text := pg_catalog.lower(pg_catalog.btrim(p_platform));
  normalized_preferences jsonb := coalesce(p_preferences, '{}'::jsonb);
  device_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if pg_catalog.length(normalized_token) not between 20 and 4096 then
    raise exception 'Invalid push token'
      using errcode = '22023';
  end if;

  if normalized_platform not in ('android', 'ios') then
    raise exception 'Unsupported push platform'
      using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(normalized_preferences) <> 'object'
    or pg_catalog.pg_column_size(normalized_preferences) > 4096 then
    raise exception 'Invalid push preferences'
      using errcode = '22023';
  end if;

  insert into public.push_devices (
    user_id,
    token,
    platform,
    enabled,
    preferences,
    app_version,
    last_seen_at,
    updated_at
  )
  values (
    actor_id,
    normalized_token,
    normalized_platform,
    true,
    normalized_preferences,
    nullif(pg_catalog.left(pg_catalog.btrim(p_app_version), 32), ''),
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (token) do update
  set
    user_id = excluded.user_id,
    platform = excluded.platform,
    enabled = true,
    preferences = excluded.preferences,
    app_version = excluded.app_version,
    last_seen_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  returning id into device_id;

  return device_id;
end;
$$;

create or replace function public.disable_push_device(
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  updated_count integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  update public.push_devices
  set
    enabled = false,
    updated_at = pg_catalog.now()
  where user_id = actor_id
    and token = pg_catalog.btrim(p_token);

  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$$;

revoke all on function public.register_push_device(text, text, jsonb, text)
  from public, anon;
revoke all on function public.disable_push_device(text)
  from public, anon;
grant execute on function public.register_push_device(text, text, jsonb, text)
  to authenticated, service_role;
grant execute on function public.disable_push_device(text)
  to authenticated, service_role;

create table if not exists public.payment_reminders (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id text not null
    check (event_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  transfer_id text not null
    check (transfer_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default pg_catalog.now(),
  delivered_devices integer not null default 0
    check (delivered_devices >= 0),
  check (sender_user_id <> recipient_user_id)
);

create index if not exists payment_reminders_cooldown_idx
  on public.payment_reminders (
    event_id,
    transfer_id,
    recipient_user_id,
    sent_at desc
  );

alter table public.payment_reminders enable row level security;
alter table public.payment_reminders force row level security;

revoke all on table public.payment_reminders from public, anon, authenticated;
grant select, insert, update, delete
  on table public.payment_reminders
  to service_role;

create or replace function public.reserve_payment_reminder(
  p_event_id text,
  p_transfer_id text,
  p_sender_user_id uuid,
  p_recipient_user_id uuid,
  p_cooldown_minutes integer default 720
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_event_id text := pg_catalog.btrim(p_event_id);
  normalized_transfer_id text := pg_catalog.btrim(p_transfer_id);
  latest_sent_at timestamptz;
  retry_at timestamptz;
  reminder_id uuid;
begin
  if normalized_event_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or normalized_transfer_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_sender_user_id is null
    or p_recipient_user_id is null
    or p_sender_user_id = p_recipient_user_id
    or p_cooldown_minutes not between 1 and 1440 then
    raise exception 'Invalid payment reminder reservation'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      normalized_event_id || ':' ||
      normalized_transfer_id || ':' ||
      p_recipient_user_id::text,
      0
    )
  );

  select reminder.sent_at
  into latest_sent_at
  from public.payment_reminders as reminder
  where reminder.event_id = normalized_event_id
    and reminder.transfer_id = normalized_transfer_id
    and reminder.recipient_user_id = p_recipient_user_id
  order by reminder.sent_at desc
  limit 1;

  retry_at := latest_sent_at + p_cooldown_minutes * interval '1 minute';
  if latest_sent_at is not null and retry_at > pg_catalog.now() then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'retry_at', retry_at
    );
  end if;

  insert into public.payment_reminders (
    event_id,
    transfer_id,
    sender_user_id,
    recipient_user_id
  )
  values (
    normalized_event_id,
    normalized_transfer_id,
    p_sender_user_id,
    p_recipient_user_id
  )
  returning id into reminder_id;

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'reminder_id', reminder_id
  );
end;
$$;

revoke all on function public.reserve_payment_reminder(
  text,
  text,
  uuid,
  uuid,
  integer
) from public, anon, authenticated;
grant execute on function public.reserve_payment_reminder(
  text,
  text,
  uuid,
  uuid,
  integer
) to service_role;

create table if not exists public.event_invite_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id text not null
    check (event_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  kind text not null
    check (kind in ('open', 'private')),
  token_hash text not null unique
    check (char_length(token_hash) = 64),
  space_id text not null
    check (space_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  space_key text not null
    check (space_key ~ '^[A-Za-z0-9_-]{1,128}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  revoked_at timestamptz,
  expires_at timestamptz,
  last_redeemed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    (kind = 'open' and recipient_user_id is null)
    or
    (kind = 'private' and recipient_user_id is not null)
  )
);

with ranked_open_invites as (
  select
    id,
    pg_catalog.row_number() over (
      partition by event_id
      order by created_at desc, id desc
    ) as invite_rank
  from public.event_invite_tokens
  where kind = 'open' and revoked_at is null
)
update public.event_invite_tokens as invite
set
  revoked_at = pg_catalog.now(),
  updated_at = pg_catalog.now()
from ranked_open_invites
where invite.id = ranked_open_invites.id
  and ranked_open_invites.invite_rank > 1;

drop index if exists public.event_invite_tokens_one_open_link_per_creator_idx;
drop index if exists public.event_invite_tokens_one_open_link_idx;
create unique index if not exists event_invite_tokens_one_open_link_idx
  on public.event_invite_tokens (event_id)
  where kind = 'open' and revoked_at is null;
create index if not exists event_invite_tokens_recipient_idx
  on public.event_invite_tokens (recipient_user_id, created_at desc)
  where kind = 'private';
create unique index if not exists event_invite_tokens_one_private_link_idx
  on public.event_invite_tokens (event_id, created_by, recipient_user_id)
  where kind = 'private' and revoked_at is null;

alter table public.event_invite_tokens enable row level security;
alter table public.event_invite_tokens force row level security;

revoke all on table public.event_invite_tokens
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.event_invite_tokens
  to service_role;

create or replace function public.rotate_open_event_invite(
  p_event_id text,
  p_created_by uuid,
  p_token_hash text,
  p_space_id text,
  p_space_key text,
  p_created_at timestamptz default pg_catalog.now()
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invite_id uuid;
begin
  if p_event_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_space_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_space_key !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_created_by is null then
    raise exception 'Invalid open event invitation'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'event-invite:' || p_event_id,
      0
    )
  );

  update public.event_invite_tokens
  set
    revoked_at = coalesce(revoked_at, p_created_at),
    updated_at = p_created_at
  where event_id = p_event_id
    and kind = 'open'
    and revoked_at is null;

  insert into public.event_invite_tokens (
    event_id,
    kind,
    token_hash,
    space_id,
    space_key,
    created_by,
    created_at,
    updated_at
  )
  values (
    p_event_id,
    'open',
    p_token_hash,
    p_space_id,
    p_space_key,
    p_created_by,
    p_created_at,
    p_created_at
  )
  returning id into invite_id;

  return invite_id;
end;
$$;

revoke all on function public.rotate_open_event_invite(
  text,
  uuid,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.rotate_open_event_invite(
  text,
  uuid,
  text,
  text,
  text,
  timestamptz
) to service_role;

create or replace function public.rotate_private_event_invite(
  p_event_id text,
  p_created_by uuid,
  p_recipient_user_id uuid,
  p_token_hash text,
  p_space_id text,
  p_space_key text,
  p_created_at timestamptz,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invite_id uuid;
begin
  if p_event_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_space_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_space_key !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_created_by is null
    or p_recipient_user_id is null
    or p_created_by = p_recipient_user_id
    or p_expires_at <= p_created_at then
    raise exception 'Invalid private event invitation'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'event-private-invite:' || p_event_id || ':' ||
      p_created_by::text || ':' || p_recipient_user_id::text,
      0
    )
  );

  update public.event_invite_tokens
  set
    revoked_at = coalesce(revoked_at, p_created_at),
    updated_at = p_created_at
  where event_id = p_event_id
    and kind = 'private'
    and created_by = p_created_by
    and recipient_user_id = p_recipient_user_id
    and revoked_at is null;

  insert into public.event_invite_tokens (
    event_id,
    kind,
    token_hash,
    space_id,
    space_key,
    created_by,
    recipient_user_id,
    expires_at,
    created_at,
    updated_at
  )
  values (
    p_event_id,
    'private',
    p_token_hash,
    p_space_id,
    p_space_key,
    p_created_by,
    p_recipient_user_id,
    p_expires_at,
    p_created_at,
    p_created_at
  )
  returning id into invite_id;

  return invite_id;
end;
$$;

revoke all on function public.rotate_private_event_invite(
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.rotate_private_event_invite(
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) to service_role;

create or replace function public.redeem_event_invite_membership(
  p_invite_id uuid,
  p_token_hash text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.event_invite_tokens%rowtype;
  snapshot public.app_snapshots%rowtype;
  existing_member private.shared_snapshot_members%rowtype;
  event_record jsonb;
  actor_participant_id text := 'account-' || p_user_id::text;
  creator_participant_id text;
  active_ids text[];
  inactive_ids text[];
  admin_ids text[];
begin
  if p_invite_id is null
    or p_user_id is null
    or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Event invitation is invalid'
      using errcode = '42501';
  end if;

  select record.*
  into invite
  from public.event_invite_tokens as record
  where record.id = p_invite_id
  for update;

  if invite.id is null
    or invite.token_hash <> p_token_hash
    or invite.revoked_at is not null
    or (invite.expires_at is not null and invite.expires_at <= pg_catalog.now())
    or (invite.kind = 'private' and invite.recipient_user_id <> p_user_id) then
    raise exception 'Event invitation is no longer active'
      using errcode = '42501';
  end if;

  select record.*
  into snapshot
  from public.app_snapshots as record
  where record.id = invite.space_id
    and record.snapshot_kind = 'shared_event'
  for update;

  event_record := snapshot.state -> 'events' -> 0;
  if snapshot.id is null
    or event_record is null
    or event_record ->> 'id' <> invite.event_id
    or coalesce((event_record ->> 'locked')::boolean, false)
    or nullif(event_record ->> 'closedAt', '') is not null then
    raise exception 'Shared event is no longer available'
      using errcode = '42501';
  end if;

  active_ids := private.active_event_participant_ids(snapshot.state);
  inactive_ids := private.event_text_ids(event_record, 'inactiveParticipantIds');
  admin_ids := private.event_admin_ids(snapshot.state);
  creator_participant_id := 'account-' || invite.created_by::text;

  if not (creator_participant_id = any(active_ids))
    or actor_participant_id = any(inactive_ids)
    or (
      invite.kind = 'private'
      and not (actor_participant_id = any(active_ids))
    ) then
    raise exception 'Event invitation is no longer active'
      using errcode = '42501';
  end if;

  select member.*
  into existing_member
  from private.shared_snapshot_members as member
  where member.snapshot_id = snapshot.id
    and member.user_id = p_user_id
  for update;

  if existing_member.user_id is not null
    and existing_member.status = 'removed' then
    raise exception 'You are no longer a member of this event'
      using errcode = '42501';
  end if;

  insert into private.shared_snapshot_members (
    snapshot_id,
    user_id,
    participant_id,
    role,
    status
  )
  values (
    snapshot.id,
    p_user_id,
    actor_participant_id,
    case when actor_participant_id = any(admin_ids) then 'admin' else 'member' end,
    'active'
  )
  on conflict (snapshot_id, user_id) do update
  set
    participant_id = excluded.participant_id,
    role = excluded.role,
    status = 'active',
    removed_at = null,
    updated_at = pg_catalog.now();

  update public.event_invite_tokens
  set
    last_redeemed_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  where id = invite.id;

  return pg_catalog.jsonb_build_object(
    'status', 'active',
    'snapshotId', snapshot.id,
    'participantId', actor_participant_id
  );
end;
$$;

revoke all on function public.redeem_event_invite_membership(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.redeem_event_invite_membership(uuid, text, uuid)
  to service_role;

create table if not exists public.event_activity_notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id text not null
    check (event_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  activity_id text not null
    check (activity_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  kind text not null
    constraint event_activity_notifications_kind_check
    check (kind in ('expense-created', 'participant-joined', 'event-invite', 'event-closed')),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'reserved'
    check (status in ('reserved', 'delivered', 'suppressed')),
  delivered_devices integer not null default 0
    check (delivered_devices >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  delivered_at timestamptz,
  check (sender_user_id <> recipient_user_id),
  unique (event_id, activity_id, kind, recipient_user_id)
);

alter table public.event_activity_notifications
  drop constraint if exists event_activity_notifications_kind_check;
alter table public.event_activity_notifications
  add constraint event_activity_notifications_kind_check
  check (kind in ('expense-created', 'participant-joined', 'event-invite', 'event-closed'));

create index if not exists event_activity_notifications_rate_idx
  on public.event_activity_notifications (
    event_id,
    kind,
    recipient_user_id,
    created_at desc
  );

alter table public.event_activity_notifications enable row level security;
alter table public.event_activity_notifications force row level security;

revoke all on table public.event_activity_notifications
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.event_activity_notifications
  to service_role;

create or replace function public.reserve_event_activity_notification(
  p_event_id text,
  p_activity_id text,
  p_kind text,
  p_sender_user_id uuid,
  p_recipient_user_id uuid,
  p_min_interval_seconds integer default 45
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_event_id text := pg_catalog.btrim(p_event_id);
  normalized_activity_id text := pg_catalog.btrim(p_activity_id);
  normalized_kind text := pg_catalog.btrim(p_kind);
  existing_status text;
  notification_id uuid;
  recent_notification_at timestamptz;
begin
  if normalized_event_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or normalized_activity_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or normalized_kind not in (
      'expense-created',
      'participant-joined',
      'event-invite',
      'event-closed'
    )
    or p_sender_user_id is null
    or p_recipient_user_id is null
    or p_sender_user_id = p_recipient_user_id
    or p_min_interval_seconds not between 0 and 600 then
    raise exception 'Invalid event activity notification reservation'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      normalized_event_id || ':' ||
      normalized_activity_id || ':' ||
      normalized_kind || ':' ||
      p_recipient_user_id::text,
      0
    )
  );

  select notification.status
  into existing_status
  from public.event_activity_notifications as notification
  where notification.event_id = normalized_event_id
    and notification.activity_id = normalized_activity_id
    and notification.kind = normalized_kind
    and notification.recipient_user_id = p_recipient_user_id
  limit 1;

  if existing_status is not null then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'reason', 'duplicate'
    );
  end if;

  if p_min_interval_seconds > 0 then
    select notification.created_at
    into recent_notification_at
    from public.event_activity_notifications as notification
    where notification.event_id = normalized_event_id
      and notification.kind = normalized_kind
      and notification.recipient_user_id = p_recipient_user_id
      and notification.status in ('reserved', 'delivered')
      and notification.created_at >
        pg_catalog.now() - pg_catalog.make_interval(
          secs => p_min_interval_seconds
        )
    order by notification.created_at desc
    limit 1;
  end if;

  insert into public.event_activity_notifications (
    event_id,
    activity_id,
    kind,
    sender_user_id,
    recipient_user_id,
    status
  )
  values (
    normalized_event_id,
    normalized_activity_id,
    normalized_kind,
    p_sender_user_id,
    p_recipient_user_id,
    case
      when recent_notification_at is null then 'reserved'
      else 'suppressed'
    end
  )
  returning id into notification_id;

  if recent_notification_at is not null then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'reason', 'rate-limited'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'notification_id', notification_id
  );
end;
$$;

revoke all on function public.reserve_event_activity_notification(
  text,
  text,
  text,
  uuid,
  uuid,
  integer
) from public, anon, authenticated;
grant execute on function public.reserve_event_activity_notification(
  text,
  text,
  text,
  uuid,
  uuid,
  integer
) to service_role;

create table if not exists public.notification_inbox (
  id uuid primary key default extensions.gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  event_id text not null
    check (event_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  activity_id text not null
    check (activity_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  kind text not null
    constraint notification_inbox_kind_check
    check (kind in (
      'expense-created',
      'participant-joined',
      'event-invite',
      'event-closed',
      'payment-reminder'
    )),
  title text not null
    check (pg_catalog.char_length(title) between 1 and 90),
  body text not null
    check (pg_catalog.char_length(body) between 1 and 240),
  view text not null default 'event'
    check (view in ('event', 'summary')),
  action_url text not null default ''
    constraint notification_inbox_action_url_check
    check (pg_catalog.char_length(action_url) <= 2048),
  created_at timestamptz not null default pg_catalog.now(),
  read_at timestamptz,
  unique (recipient_user_id, event_id, activity_id, kind)
);

alter table public.notification_inbox
  add column if not exists action_url text not null default '';
alter table public.notification_inbox
  drop constraint if exists notification_inbox_kind_check;
alter table public.notification_inbox
  add constraint notification_inbox_kind_check
  check (kind in (
    'expense-created',
    'participant-joined',
    'event-invite',
    'event-closed',
    'payment-reminder'
  ));
alter table public.notification_inbox
  drop constraint if exists notification_inbox_action_url_check;
alter table public.notification_inbox
  add constraint notification_inbox_action_url_check
  check (pg_catalog.char_length(action_url) <= 2048);

create index if not exists notification_inbox_recipient_idx
  on public.notification_inbox (recipient_user_id, created_at desc);

alter table public.notification_inbox enable row level security;
alter table public.notification_inbox force row level security;

revoke all on table public.notification_inbox
  from public, anon, authenticated;
grant select on table public.notification_inbox to authenticated;
grant update (read_at) on table public.notification_inbox to authenticated;
grant select, insert, update, delete
  on table public.notification_inbox
  to service_role;

drop policy if exists notification_inbox_select_self
  on public.notification_inbox;
create policy notification_inbox_select_self
  on public.notification_inbox
  for select
  to authenticated
  using ((select auth.uid()) = recipient_user_id);

drop policy if exists notification_inbox_mark_read_self
  on public.notification_inbox;
create policy notification_inbox_mark_read_self
  on public.notification_inbox
  for update
  to authenticated
  using ((select auth.uid()) = recipient_user_id)
  with check ((select auth.uid()) = recipient_user_id);

create table if not exists public.app_feedback (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null
    check (category in ('bug', 'clarity', 'idea')),
  message text not null
    check (pg_catalog.char_length(pg_catalog.btrim(message)) between 10 and 1200),
  context jsonb not null default '{}'::jsonb
    check (
      pg_catalog.jsonb_typeof(context) = 'object'
      and pg_catalog.octet_length(context::text) <= 4096
    ),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'resolved')),
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists app_feedback_created_at_idx
  on public.app_feedback (created_at desc);
create index if not exists app_feedback_user_id_idx
  on public.app_feedback (user_id, created_at desc);

alter table public.app_feedback enable row level security;
alter table public.app_feedback force row level security;

revoke all on table public.app_feedback from public, anon, authenticated;
grant insert on table public.app_feedback to authenticated;
grant select, insert, update, delete
  on table public.app_feedback
  to service_role;

drop policy if exists app_feedback_insert_self on public.app_feedback;
create policy app_feedback_insert_self
  on public.app_feedback
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create table if not exists public.product_metrics (
  id uuid primary key,
  session_id uuid,
  event_name text not null
    check (event_name in (
      'app_ready',
      'event_creation_started',
      'event_created',
      'expense_started',
      'expense_created',
      'settlement_opened',
      'invite_shared',
      'invite_joined',
      'transfer_marked_paid',
      'operation_deferred',
      'operation_failure',
      'client_error'
    )),
  screen text not null
    check (screen in (
      'boot',
      'auth',
      'home',
      'new_event',
      'event',
      'expense',
      'settlement',
      'invite',
      'groups',
      'profile',
      'notifications',
      'unknown'
    )),
  platform text not null
    check (platform in ('web', 'android', 'ios')),
  app_version text not null default ''
    check (
      pg_catalog.char_length(app_version) <= 24
      and app_version ~ '^[0-9A-Za-z._-]*$'
    ),
  build_number integer not null default 0
    check (build_number between 0 and 10000000),
  detail text not null default ''
    check (pg_catalog.char_length(detail) <= 96),
  occurred_at timestamptz not null,
  received_at timestamptz not null default pg_catalog.now(),
  check (
    (event_name = 'event_created' and detail in ('standard', 'trip', 'restaurant'))
    or (
      event_name = 'client_error'
      and detail ~ '^(Error|TypeError|ReferenceError|RangeError|SyntaxError|ResourceError|UnhandledRejection):(app|public-layer|vendor|resource|unknown):[0-9]{1,6}(:[0-9]{1,6}:[0-9a-f]{8})?$'
    )
    or (
      event_name in ('operation_deferred', 'operation_failure')
      and detail ~ '^(auth|state_load|state_save|account_link|event_invite|friend_network|notification_inbox|feedback|push|ads|share)(:(offline|network|timeout|auth|permission|conflict|validation|storage|server|unavailable|unknown))?$'
    )
    or (event_name not in ('event_created', 'client_error', 'operation_deferred', 'operation_failure') and detail = '')
  )
);

alter table public.product_metrics
  add column if not exists session_id uuid;

alter table public.product_metrics
  drop constraint if exists product_metrics_event_name_check;
alter table public.product_metrics
  add constraint product_metrics_event_name_check
  check (event_name in (
    'app_ready',
    'event_creation_started',
    'event_created',
    'expense_started',
    'expense_created',
    'settlement_opened',
    'invite_shared',
    'invite_joined',
    'transfer_marked_paid',
    'operation_deferred',
    'operation_failure',
    'client_error'
  ));

alter table public.product_metrics
  drop constraint if exists product_metrics_check;
alter table public.product_metrics
  add constraint product_metrics_check
  check (
    (event_name = 'event_created' and detail in ('standard', 'trip', 'restaurant'))
    or (
      event_name = 'client_error'
      and detail ~ '^(Error|TypeError|ReferenceError|RangeError|SyntaxError|ResourceError|UnhandledRejection):(app|public-layer|vendor|resource|unknown):[0-9]{1,6}(:[0-9]{1,6}:[0-9a-f]{8})?$'
    )
    or (
      event_name in ('operation_deferred', 'operation_failure')
      and detail ~ '^(auth|state_load|state_save|account_link|event_invite|friend_network|notification_inbox|feedback|push|ads|share)(:(offline|network|timeout|auth|permission|conflict|validation|storage|server|unavailable|unknown))?$'
    )
    or (event_name not in ('event_created', 'client_error', 'operation_deferred', 'operation_failure') and detail = '')
  );

create index if not exists product_metrics_event_received_idx
  on public.product_metrics (event_name, received_at desc);

create index if not exists product_metrics_session_received_idx
  on public.product_metrics (session_id, received_at desc)
  where session_id is not null;

alter table public.product_metrics enable row level security;
alter table public.product_metrics force row level security;

revoke all on table public.product_metrics from public, anon, authenticated;
grant select, insert, delete on table public.product_metrics to service_role;

create or replace function public.admin_analytics_overview(
  p_window_days integer default 30
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with parameters as (
    select least(
      90,
      greatest(1, coalesce(p_window_days, 30))
    )::integer as window_days
  ),
  window_metrics as (
    select metric.*
    from public.product_metrics as metric
    cross join parameters
    where metric.received_at >= pg_catalog.now()
      - pg_catalog.make_interval(days => parameters.window_days)
  ),
  metric_counts as (
    select event_name, pg_catalog.count(*)::bigint as event_count
    from window_metrics
    group by event_name
  ),
  session_health as (
    select
      pg_catalog.count(distinct session_id)::bigint as sessions,
      pg_catalog.count(distinct session_id) filter (
        where event_name in ('client_error', 'operation_failure')
      )::bigint as affected_sessions
    from window_metrics
    where session_id is not null
  ),
  platform_health as (
    select
      platform,
      pg_catalog.count(distinct session_id)::bigint as sessions,
      pg_catalog.count(distinct session_id) filter (
        where event_name in ('client_error', 'operation_failure')
      )::bigint as affected_sessions
    from window_metrics
    where session_id is not null
    group by platform
  ),
  operation_failures as (
    select detail, pg_catalog.count(*)::bigint as failure_count
    from window_metrics
    where event_name = 'operation_failure'
    group by detail
    order by failure_count desc, detail
  )
  select pg_catalog.jsonb_build_object(
    'generatedAt', pg_catalog.now(),
    'windowDays', parameters.window_days,
    'accounts', pg_catalog.jsonb_build_object(
      'registered', (select pg_catalog.count(*)::bigint from auth.users),
      'confirmed', (
        select pg_catalog.count(*)::bigint
        from auth.users
        where confirmed_at is not null
      ),
      'createdDuringWindow', (
        select pg_catalog.count(*)::bigint
        from auth.users
        where created_at >= pg_catalog.now()
          - pg_catalog.make_interval(days => parameters.window_days)
      ),
      'signedInLast24Hours', (
        select pg_catalog.count(*)::bigint
        from auth.users
        where last_sign_in_at >= pg_catalog.now() - interval '24 hours'
      ),
      'signedInLast7Days', (
        select pg_catalog.count(*)::bigint
        from auth.users
        where last_sign_in_at >= pg_catalog.now() - interval '7 days'
      ),
      'signedInDuringWindow', (
        select pg_catalog.count(*)::bigint
        from auth.users
        where last_sign_in_at >= pg_catalog.now()
          - pg_catalog.make_interval(days => parameters.window_days)
      )
    ),
    'storage', pg_catalog.jsonb_build_object(
      'workspaces', (
        select pg_catalog.count(*)::bigint
        from public.app_snapshots
        where snapshot_kind = 'workspace'
      ),
      'sharedEvents', (
        select pg_catalog.count(*)::bigint
        from public.app_snapshots
        where snapshot_kind = 'shared_event'
      ),
      'activeSharedEventsDuringWindow', (
        select pg_catalog.count(*)::bigint
        from public.app_snapshots
        where snapshot_kind = 'shared_event'
          and updated_at >= pg_catalog.now()
            - pg_catalog.make_interval(days => parameters.window_days)
      ),
      'snapshotBytes', (
        select coalesce(pg_catalog.sum(pg_catalog.pg_column_size(state)), 0)::bigint
        from public.app_snapshots
      ),
      'databaseBytes', pg_catalog.pg_database_size(pg_catalog.current_database())::bigint
    ),
    'push', pg_catalog.jsonb_build_object(
      'reachableUsers', (
        select pg_catalog.count(distinct user_id)::bigint
        from public.push_devices
        where enabled
      ),
      'enabledDevices', (
        select pg_catalog.count(*)::bigint
        from public.push_devices
        where enabled
      ),
      'androidDevices', (
        select pg_catalog.count(*)::bigint
        from public.push_devices
        where enabled and platform = 'android'
      ),
      'iosDevices', (
        select pg_catalog.count(*)::bigint
        from public.push_devices
        where enabled and platform = 'ios'
      ),
      'disabledDevices', (
        select pg_catalog.count(*)::bigint
        from public.push_devices
        where not enabled
      )
    ),
    'notifications', pg_catalog.jsonb_build_object(
      'inboxItems', (
        select pg_catalog.count(*)::bigint
        from public.notification_inbox
      ),
      'unreadItems', (
        select pg_catalog.count(*)::bigint
        from public.notification_inbox
        where read_at is null
      ),
      'createdDuringWindow', (
        select pg_catalog.count(*)::bigint
        from public.notification_inbox
        where created_at >= pg_catalog.now()
          - pg_catalog.make_interval(days => parameters.window_days)
      )
    ),
    'invites', pg_catalog.jsonb_build_object(
      'activeLinks', (
        select pg_catalog.count(*)::bigint
        from public.event_invite_tokens
        where revoked_at is null
          and (expires_at is null or expires_at > pg_catalog.now())
      ),
      'redeemedDuringWindow', (
        select pg_catalog.count(*)::bigint
        from public.event_invite_tokens
        where last_redeemed_at >= pg_catalog.now()
          - pg_catalog.make_interval(days => parameters.window_days)
      )
    ),
    'feedback', pg_catalog.jsonb_build_object(
      'new', (
        select pg_catalog.count(*)::bigint
        from public.app_feedback
        where status = 'new'
      ),
      'reviewing', (
        select pg_catalog.count(*)::bigint
        from public.app_feedback
        where status = 'reviewing'
      ),
      'resolved', (
        select pg_catalog.count(*)::bigint
        from public.app_feedback
        where status = 'resolved'
      )
    ),
    'metrics', coalesce(
      (
        select pg_catalog.jsonb_object_agg(event_name, event_count)
        from metric_counts
      ),
      '{}'::jsonb
    ),
    'sessions', (
      select pg_catalog.jsonb_build_object(
        'total', sessions,
        'affected', affected_sessions,
        'errorFreeRate', case
          when sessions = 0 then null
          else pg_catalog.round((sessions - affected_sessions)::numeric / sessions, 4)
        end
      )
      from session_health
    ),
    'platforms', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'platform', platform,
            'sessions', sessions,
            'affected', affected_sessions
          )
          order by platform
        )
        from platform_health
      ),
      '[]'::jsonb
    ),
    'operationFailures', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'operation', detail,
            'count', failure_count
          )
          order by failure_count desc, detail
        )
        from operation_failures
      ),
      '[]'::jsonb
    )
  )
  from parameters;
$$;

revoke all on function public.admin_analytics_overview(integer)
  from public, anon, authenticated;
grant execute on function public.admin_analytics_overview(integer)
  to service_role;

create or replace function public.admin_connected_event_publication_health()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'activeUnsharedMultiAccountCreatorEvents',
    pg_catalog.count(*)::bigint
  )
  from public.app_snapshots as snapshot
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(snapshot.state -> 'events', '[]'::jsonb)
  ) as event(value)
  where snapshot.snapshot_kind = 'workspace'
    and snapshot.owner_user_id is not null
    and coalesce(event.value ->> 'sharedSpaceId', '') = ''
    and event.value ->> 'createdByParticipantId' =
      'account-' || snapshot.owner_user_id::text
    and (event.value -> 'participantIds') ?
      ('account-' || snapshot.owner_user_id::text)
    and not coalesce(
      event.value -> 'inactiveParticipantIds',
      '[]'::jsonb
    ) ? ('account-' || snapshot.owner_user_id::text)
    and (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements_text(
        coalesce(event.value -> 'participantIds', '[]'::jsonb)
      ) as participant(participant_id)
      where participant.participant_id ~* '^account-[0-9a-f-]{36}$'
        and not coalesce(
          event.value -> 'inactiveParticipantIds',
          '[]'::jsonb
        ) ? participant.participant_id
    ) > 1;
$$;

revoke all on function public.admin_connected_event_publication_health()
  from public, anon, authenticated;
grant execute on function public.admin_connected_event_publication_health()
  to service_role;

create or replace function public.admin_operational_health(
  p_window_days integer default 30
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with parameters as (
    select least(90, greatest(1, coalesce(p_window_days, 30)))::integer
      as window_days
  ),
  window_metrics as (
    select metric.*
    from public.product_metrics as metric
    cross join parameters
    where metric.received_at >= pg_catalog.now()
      - pg_catalog.make_interval(days => parameters.window_days)
  ),
  deferred_operations as (
    select detail, pg_catalog.count(*)::bigint as deferred_count
    from window_metrics
    where event_name = 'operation_deferred'
    group by detail
    order by deferred_count desc, detail
  ),
  client_error_groups as (
    select platform, screen, pg_catalog.count(*)::bigint as error_count
    from window_metrics
    where event_name = 'client_error'
    group by platform, screen
    order by error_count desc, platform, screen
    limit 10
  ),
  delivery_health as (
    select
      pg_catalog.count(*) filter (
        where delivery.reserved_at >= pg_catalog.now()
          - pg_catalog.make_interval(days => parameters.window_days)
      )::bigint as reserved,
      pg_catalog.count(*) filter (
        where delivery.reserved_at >= pg_catalog.now()
          - pg_catalog.make_interval(days => parameters.window_days)
          and delivery.delivered_at is not null
      )::bigint as delivered,
      pg_catalog.count(*) filter (
        where delivery.delivered_at is null
          and delivery.reserved_at < pg_catalog.now() - interval '10 minutes'
      )::bigint as stale_pending
    from public.broadcast_notification_deliveries as delivery
    cross join parameters
  ),
  continuity_health as (
    select
      (select pg_catalog.max(snapshot.updated_at) from public.app_snapshots as snapshot)
        as latest_snapshot_at,
      (
        select pg_catalog.count(*)::bigint
        from auth.users as account
        where not exists (
          select 1
          from public.app_snapshots as workspace
          where workspace.owner_user_id = account.id
            and workspace.snapshot_kind = 'workspace'
        )
      ) as accounts_without_workspace,
      (
        select pg_catalog.count(*)::bigint
        from public.app_snapshots as snapshot
        where snapshot.snapshot_kind = 'shared_event'
          and pg_catalog.jsonb_typeof(snapshot.state -> 'events') = 'array'
          and pg_catalog.jsonb_array_length(snapshot.state -> 'events') = 1
          and exists (
            select 1
            from pg_catalog.jsonb_array_elements(
              case
                when pg_catalog.jsonb_typeof(snapshot.state -> 'participants') = 'array'
                  then snapshot.state -> 'participants'
                else '[]'::jsonb
              end
            ) as participant(value)
            join auth.users as account
              on participant.value ->> 'id' = 'account-' || account.id::text
          )
          and (
            exists (
              select 1
              from public.app_snapshots as workspace
              cross join lateral pg_catalog.jsonb_array_elements(
                case
                  when pg_catalog.jsonb_typeof(workspace.state -> 'events') = 'array'
                    then workspace.state -> 'events'
                  else '[]'::jsonb
                end
              ) as workspace_event(value)
              where workspace.snapshot_kind = 'workspace'
                and workspace_event.value ->> 'sharedSpaceId' = snapshot.id
            )
            or exists (
              select 1
              from public.event_invite_tokens as invite
              where invite.space_id = snapshot.id
                and invite.revoked_at is null
                and (invite.expires_at is null or invite.expires_at > pg_catalog.now())
            )
          )
          and not exists (
            select 1
            from private.shared_snapshot_members as member
            where member.snapshot_id = snapshot.id
              and member.status = 'active'
              and member.removed_at is null
          )
      ) as events_without_active_members
  )
  select pg_catalog.jsonb_build_object(
    'telemetry', pg_catalog.jsonb_build_object(
      'lastReceivedAt', (
        select pg_catalog.max(metric.received_at) from public.product_metrics as metric
      ),
      'eventsLast24Hours', (
        select pg_catalog.count(*)::bigint
        from public.product_metrics as metric
        where metric.received_at >= pg_catalog.now() - interval '24 hours'
      ),
      'failuresLast24Hours', (
        select pg_catalog.count(*)::bigint
        from public.product_metrics as metric
        where metric.event_name in ('client_error', 'operation_failure')
          and metric.received_at >= pg_catalog.now() - interval '24 hours'
      ),
      'deferredLast24Hours', (
        select pg_catalog.count(*)::bigint
        from public.product_metrics as metric
        where metric.event_name = 'operation_deferred'
          and metric.received_at >= pg_catalog.now() - interval '24 hours'
      ),
      'clientErrorsDuringWindow', (
        select pg_catalog.count(*)::bigint
        from window_metrics
        where event_name = 'client_error'
      )
    ),
    'pushDelivery', (
      select pg_catalog.jsonb_build_object(
        'reservedDuringWindow', reserved,
        'deliveredDuringWindow', delivered,
        'stalePending', stale_pending,
        'deliveryRate', case
          when reserved = 0 then null
          else pg_catalog.round(delivered::numeric / reserved, 4)
        end
      )
      from delivery_health
    ),
    'dataContinuity', (
      select pg_catalog.jsonb_build_object(
        'latestSnapshotAt', latest_snapshot_at,
        'accountsWithoutWorkspace', accounts_without_workspace,
        'eventsWithoutActiveMembers', events_without_active_members
      )
      from continuity_health
    ),
    'deferredOperations', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('operation', detail, 'count', deferred_count)
          order by deferred_count desc, detail
        )
        from deferred_operations
      ),
      '[]'::jsonb
    ),
    'clientErrors', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'platform', platform,
            'screen', screen,
            'count', error_count
          )
          order by error_count desc, platform, screen
        )
        from client_error_groups
      ),
      '[]'::jsonb
    )
  )
  from parameters;
$$;

revoke all on function public.admin_operational_health(integer)
  from public, anon, authenticated;
grant execute on function public.admin_operational_health(integer)
  to service_role;

create or replace function public.delete_account_data(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  participant_id text := 'account-' || p_user_id::text;
  anonymized_count integer := 0;
begin
  update public.app_snapshots as snapshot
    set state = pg_catalog.jsonb_set(
      snapshot.state,
      '{participants}',
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            case
              when participant ->> 'id' = participant_id then
                pg_catalog.jsonb_set(
                  participant - 'email' - 'authProvider' - 'authSubject',
                  '{displayName}',
                  pg_catalog.to_jsonb('משתמש שנמחק'::text),
                  true
                )
              else participant
            end
          )
          from pg_catalog.jsonb_array_elements(
            coalesce(snapshot.state -> 'participants', '[]'::jsonb)
          ) as participant
        ),
        '[]'::jsonb
      ),
      true
    ),
    updated_at = pg_catalog.now()
  where snapshot.owner_user_id is distinct from p_user_id
    and pg_catalog.jsonb_typeof(snapshot.state -> 'participants') = 'array'
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(snapshot.state -> 'participants') as participant
      where participant ->> 'id' = participant_id
    );

  get diagnostics anonymized_count = row_count;

  return pg_catalog.jsonb_build_object(
    'workspace_owned_by_user', exists (
      select 1
      from public.app_snapshots
      where owner_user_id = p_user_id
    ),
    'shared_records_anonymized', anonymized_count
  );
end;
$$;

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;

create or replace function private.anonymize_account_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.delete_account_data(old.id);
  return old;
end;
$$;

revoke all on function private.anonymize_account_before_delete()
  from public, anon, authenticated;

drop trigger if exists anonymize_account_before_delete on auth.users;
create trigger anonymize_account_before_delete
  before delete on auth.users
  for each row execute function private.anonymize_account_before_delete();

create table if not exists public.referrals (
  id uuid primary key default extensions.gen_random_uuid(),
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invited_user_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null
    check (referral_code ~ '^[a-f0-9]{20}$'),
  status text not null default 'pending'
    check (status in ('pending', 'qualified', 'rewarded', 'rejected')),
  reward_days integer not null default 30
    check (reward_days between 1 and 365),
  qualification_event_id text,
  rejection_reason text,
  claimed_at timestamptz not null default pg_catalog.now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  check (inviter_user_id <> invited_user_id)
);

create index if not exists referrals_inviter_status_idx
  on public.referrals (inviter_user_id, status, rewarded_at desc);
create index if not exists referrals_invited_status_idx
  on public.referrals (invited_user_id, status);

update public.referrals as referral
set
  status = 'rejected',
  rejection_reason = 'existing_account',
  updated_at = pg_catalog.now()
from auth.users as account
where referral.invited_user_id = account.id
  and referral.status in ('pending', 'qualified')
  and (
    coalesce(account.is_anonymous, false)
    or referral.claimed_at > account.created_at + interval '1 hour'
  );

create table if not exists public.user_entitlements (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_key text not null
    check (entitlement_key ~ '^[a-z0-9_]{2,40}$'),
  source text not null
    check (source in ('referral', 'subscription', 'promotion', 'admin')),
  source_reference text not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  check (expires_at > starts_at),
  unique (user_id, entitlement_key, source, source_reference)
);

create index if not exists user_entitlements_active_idx
  on public.user_entitlements (user_id, entitlement_key, expires_at desc);

create table if not exists public.subscription_purchases (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null
    check (provider in ('google_play', 'app_store')),
  product_id text not null
    check (product_id ~ '^[A-Za-z0-9._-]{3,200}$'),
  purchase_token_hash text not null
    check (purchase_token_hash ~ '^[a-f0-9]{64}$'),
  status text not null
    check (
      status in (
        'pending',
        'active',
        'grace',
        'paused',
        'expired',
        'cancelled',
        'revoked'
      )
    ),
  entitlement_expires_at timestamptz,
  auto_renewing boolean not null default false,
  provider_order_id text
    check (
      provider_order_id is null
      or pg_catalog.char_length(provider_order_id) between 1 and 200
    ),
  verified_at timestamptz not null,
  last_event_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (provider, purchase_token_hash)
);

create index if not exists subscription_purchases_user_status_idx
  on public.subscription_purchases (
    user_id,
    status,
    entitlement_expires_at desc
  );

alter table public.referrals enable row level security;
alter table public.referrals force row level security;
alter table public.user_entitlements enable row level security;
alter table public.user_entitlements force row level security;
alter table public.subscription_purchases enable row level security;
alter table public.subscription_purchases force row level security;

revoke all on table public.referrals from public, anon, authenticated;
revoke all on table public.user_entitlements from public, anon, authenticated;
revoke all on table public.subscription_purchases from public, anon, authenticated;
grant select on table public.referrals to authenticated;
grant select on table public.user_entitlements to authenticated;
grant select, insert, update, delete on table public.referrals to service_role;
grant select, insert, update, delete on table public.user_entitlements to service_role;
grant select, insert, update, delete on table public.subscription_purchases to service_role;

drop policy if exists referrals_select_parties on public.referrals;
create policy referrals_select_parties
  on public.referrals
  for select
  to authenticated
  using (
    inviter_user_id = (select auth.uid())
    or invited_user_id = (select auth.uid())
  );

drop policy if exists user_entitlements_select_self on public.user_entitlements;
create policy user_entitlements_select_self
  on public.user_entitlements
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.claim_referral(
  p_referral_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_code text := pg_catalog.lower(pg_catalog.btrim(p_referral_code));
  inviter_id uuid;
  actor_created_at timestamptz;
  actor_is_anonymous boolean := false;
  referral public.referrals%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if normalized_code !~ '^[a-f0-9]{20}$' then
    raise exception 'Referral code is invalid'
      using errcode = '22023';
  end if;

  select
    account.created_at,
    coalesce(account.is_anonymous, false)
  into
    actor_created_at,
    actor_is_anonymous
  from auth.users as account
  where account.id = actor_id;

  if actor_created_at is null
    or actor_created_at < pg_catalog.now() - interval '1 hour'
    or actor_is_anonymous then
    raise exception 'Referral rewards are available to new accounts only'
      using errcode = 'P0001';
  end if;

  select invite.user_id
  into inviter_id
  from public.friend_invite_codes as invite
  where invite.code = normalized_code;

  if inviter_id is null then
    raise exception 'Referral code was not found'
      using errcode = 'P0001';
  end if;

  if inviter_id = actor_id then
    raise exception 'You cannot refer yourself'
      using errcode = 'P0001';
  end if;

  select existing.*
  into referral
  from public.referrals as existing
  where existing.invited_user_id = actor_id
  for update;

  if referral.id is not null then
    if referral.inviter_user_id <> inviter_id then
      raise exception 'This account already has a referral attribution'
        using errcode = 'P0001';
    end if;

    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', referral.status,
      'claimed', false
    );
  end if;

  insert into public.referrals (
    inviter_user_id,
    invited_user_id,
    referral_code
  )
  values (
    inviter_id,
    actor_id,
    normalized_code
  )
  on conflict (invited_user_id) do nothing
  returning * into referral;

  if referral.id is null then
    select existing.*
    into referral
    from public.referrals as existing
    where existing.invited_user_id = actor_id
    for update;

    if referral.inviter_user_id <> inviter_id then
      raise exception 'This account already has a referral attribution'
        using errcode = 'P0001';
    end if;

    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', referral.status,
      'claimed', false
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'id', referral.id,
    'status', referral.status,
    'claimed', true
  );
end;
$$;

create or replace function public.qualify_referral(
  p_event_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_event_id text := pg_catalog.btrim(p_event_id);
  referral public.referrals%rowtype;
  account_created_at timestamptz;
  account_email_confirmed_at timestamptz;
  account_is_anonymous boolean := false;
  activity_found boolean := false;
  rewarded_last_year integer := 0;
  reward_start timestamptz;
  reward_end timestamptz;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if normalized_event_id !~ '^[A-Za-z0-9_-]{3,80}$'
    or normalized_event_id = 'default' then
    raise exception 'Event id is invalid'
      using errcode = '22023';
  end if;

  select existing.*
  into referral
  from public.referrals as existing
  where existing.invited_user_id = actor_id
  for update;

  if referral.id is null then
    return pg_catalog.jsonb_build_object('status', 'not_claimed');
  end if;

  if referral.status in ('rewarded', 'rejected') then
    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', referral.status
    );
  end if;

  if referral.claimed_at < pg_catalog.now() - interval '30 days' then
    update public.referrals
    set
      status = 'rejected',
      rejection_reason = 'qualification_window_expired',
      updated_at = pg_catalog.now()
    where id = referral.id;

    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', 'rejected',
      'reason', 'qualification_window_expired'
    );
  end if;

  select
    account.created_at,
    account.email_confirmed_at,
    coalesce(account.is_anonymous, false)
  into
    account_created_at,
    account_email_confirmed_at,
    account_is_anonymous
  from auth.users as account
  where account.id = actor_id;

  if account_created_at is null
    or referral.claimed_at > account_created_at + interval '1 hour'
    or account_is_anonymous then
    update public.referrals
    set
      status = 'rejected',
      rejection_reason = 'existing_account',
      updated_at = pg_catalog.now()
    where id = referral.id;

    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', 'rejected',
      'reason', 'existing_account'
    );
  end if;

  if account_email_confirmed_at is null then
    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', 'pending',
      'reason', 'email_not_confirmed'
    );
  end if;

  select exists (
    select 1
    from private.shared_event_qualification_activity as activity
    where activity.snapshot_id = normalized_event_id
      and activity.actor_user_id = actor_id
      and activity.recorded_at >= referral.claimed_at
      and activity.recorded_at <= referral.claimed_at + interval '30 days'
  ) into activity_found;

  if not activity_found then
    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', 'pending',
      'reason', 'qualifying_activity_not_found'
    );
  end if;

  perform 1
  from public.friend_invite_codes as invite
  where invite.user_id = referral.inviter_user_id
  for update;

  select pg_catalog.count(*)::integer
  into rewarded_last_year
  from public.referrals as rewarded
  where rewarded.inviter_user_id = referral.inviter_user_id
    and rewarded.status = 'rewarded'
    and rewarded.rewarded_at >= pg_catalog.now() - interval '365 days';

  if rewarded_last_year >= 12 then
    update public.referrals
    set
      status = 'rejected',
      qualification_event_id = normalized_event_id,
      qualified_at = pg_catalog.now(),
      rejection_reason = 'annual_reward_limit',
      updated_at = pg_catalog.now()
    where id = referral.id;

    return pg_catalog.jsonb_build_object(
      'id', referral.id,
      'status', 'rejected',
      'reason', 'annual_reward_limit'
    );
  end if;

  select greatest(
    pg_catalog.now(),
    coalesce(pg_catalog.max(entitlement.expires_at), pg_catalog.now())
  )
  into reward_start
  from public.user_entitlements as entitlement
  where entitlement.user_id = referral.inviter_user_id
    and entitlement.entitlement_key = 'ad_free';

  reward_end := reward_start + pg_catalog.make_interval(days => referral.reward_days);

  insert into public.user_entitlements (
    user_id,
    entitlement_key,
    source,
    source_reference,
    starts_at,
    expires_at
  )
  values (
    referral.inviter_user_id,
    'ad_free',
    'referral',
    referral.id::text,
    reward_start,
    reward_end
  )
  on conflict (user_id, entitlement_key, source, source_reference) do nothing;

  update public.referrals
  set
    status = 'rewarded',
    qualification_event_id = normalized_event_id,
    qualified_at = pg_catalog.now(),
    rewarded_at = pg_catalog.now(),
    rejection_reason = null,
    updated_at = pg_catalog.now()
  where id = referral.id;

  return pg_catalog.jsonb_build_object(
    'id', referral.id,
    'status', 'rewarded',
    'reward_days', referral.reward_days,
    'ad_free_until', reward_end
  );
end;
$$;

create or replace function public.record_verified_subscription(
  p_user_id uuid,
  p_provider text,
  p_product_id text,
  p_purchase_token_hash text,
  p_status text,
  p_entitlement_expires_at timestamptz default null,
  p_auto_renewing boolean default false,
  p_provider_order_id text default null,
  p_verified_at timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_provider text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_provider, '')));
  normalized_product_id text := pg_catalog.btrim(coalesce(p_product_id, ''));
  normalized_token_hash text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_purchase_token_hash, ''))
  );
  normalized_status text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_status, '')));
  normalized_order_id text := nullif(pg_catalog.btrim(coalesce(p_provider_order_id, '')), '');
  source_reference_value text;
  entitlement_starts_at timestamptz;
  entitlement_is_active boolean := false;
  purchase_record public.subscription_purchases%rowtype;
begin
  if p_user_id is null then
    raise exception 'A subscription owner is required'
      using errcode = '22023';
  end if;

  if normalized_provider not in ('google_play', 'app_store') then
    raise exception 'Subscription provider is invalid'
      using errcode = '22023';
  end if;

  if normalized_product_id !~ '^[A-Za-z0-9._-]{3,200}$' then
    raise exception 'Subscription product is invalid'
      using errcode = '22023';
  end if;

  if normalized_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Subscription purchase fingerprint is invalid'
      using errcode = '22023';
  end if;

  if normalized_status not in (
    'pending',
    'active',
    'grace',
    'paused',
    'expired',
    'cancelled',
    'revoked'
  ) then
    raise exception 'Subscription status is invalid'
      using errcode = '22023';
  end if;

  if normalized_order_id is not null
    and pg_catalog.char_length(normalized_order_id) > 200 then
    raise exception 'Subscription order identifier is too long'
      using errcode = '22023';
  end if;

  if p_verified_at is null
    or p_verified_at > pg_catalog.now() + interval '5 minutes' then
    raise exception 'Subscription verification time is invalid'
      using errcode = '22023';
  end if;

  if normalized_status in ('active', 'grace', 'cancelled')
    and p_entitlement_expires_at is null then
    raise exception 'Subscription expiration is required'
      using errcode = '22023';
  end if;

  insert into public.subscription_purchases (
    user_id,
    provider,
    product_id,
    purchase_token_hash,
    status,
    entitlement_expires_at,
    auto_renewing,
    provider_order_id,
    verified_at,
    last_event_at
  )
  values (
    p_user_id,
    normalized_provider,
    normalized_product_id,
    normalized_token_hash,
    normalized_status,
    p_entitlement_expires_at,
    coalesce(p_auto_renewing, false),
    normalized_order_id,
    p_verified_at,
    p_verified_at
  )
  on conflict (provider, purchase_token_hash) do update
  set
    product_id = excluded.product_id,
    status = excluded.status,
    entitlement_expires_at = excluded.entitlement_expires_at,
    auto_renewing = excluded.auto_renewing,
    provider_order_id = excluded.provider_order_id,
    verified_at = excluded.verified_at,
    last_event_at = greatest(
      public.subscription_purchases.last_event_at,
      excluded.last_event_at
    ),
    updated_at = pg_catalog.now()
  where public.subscription_purchases.user_id = excluded.user_id
  returning *
  into purchase_record;

  if purchase_record.id is null then
    raise exception 'Subscription purchase belongs to another account'
      using errcode = '23505';
  end if;

  source_reference_value :=
    normalized_provider || ':' || normalized_token_hash;
  entitlement_is_active :=
    normalized_status in ('active', 'grace', 'cancelled')
    and p_entitlement_expires_at > pg_catalog.now();

  if entitlement_is_active then
    entitlement_starts_at := least(
      p_verified_at,
      p_entitlement_expires_at - interval '1 second'
    );

    insert into public.user_entitlements (
      user_id,
      entitlement_key,
      source,
      source_reference,
      starts_at,
      expires_at
    )
    values (
      p_user_id,
      'ad_free',
      'subscription',
      source_reference_value,
      entitlement_starts_at,
      p_entitlement_expires_at
    )
    on conflict (user_id, entitlement_key, source, source_reference) do update
    set
      starts_at = least(
        public.user_entitlements.starts_at,
        excluded.starts_at
      ),
      expires_at = excluded.expires_at;
  else
    delete from public.user_entitlements
    where user_id = p_user_id
      and entitlement_key = 'ad_free'
      and source = 'subscription'
      and source_reference = source_reference_value;
  end if;

  return pg_catalog.jsonb_build_object(
    'purchase_id', purchase_record.id,
    'provider', purchase_record.provider,
    'product_id', purchase_record.product_id,
    'status', purchase_record.status,
    'entitlement_expires_at', purchase_record.entitlement_expires_at,
    'entitlement_active', entitlement_is_active
  );
end;
$$;

create or replace function public.get_referral_program_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invite_code text;
  ad_free_until timestamptz;
  active_entitlement_sources text[] := array[]::text[];
  rewarded_count integer := 0;
  pending_count integer := 0;
  rejected_count integer := 0;
  earned_days integer := 0;
  lifetime_rewarded_count integer := 0;
  lifetime_earned_days integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select invite.code
  into invite_code
  from public.friend_invite_codes as invite
  where invite.user_id = actor_id;

  select
    pg_catalog.max(entitlement.expires_at),
    coalesce(
      pg_catalog.array_agg(distinct entitlement.source)
        filter (where entitlement.expires_at > pg_catalog.now()),
      array[]::text[]
    )
  into ad_free_until, active_entitlement_sources
  from public.user_entitlements as entitlement
  where entitlement.user_id = actor_id
    and entitlement.entitlement_key = 'ad_free';

  select
    pg_catalog.count(*) filter (
      where referral.status = 'rewarded'
        and referral.rewarded_at >= pg_catalog.now() - interval '365 days'
    )::integer,
    pg_catalog.count(*) filter (
      where referral.status in ('pending', 'qualified')
        and referral.claimed_at >= pg_catalog.now() - interval '30 days'
    )::integer,
    pg_catalog.count(*) filter (where referral.status = 'rejected')::integer,
    coalesce(
      pg_catalog.sum(referral.reward_days) filter (
        where referral.status = 'rewarded'
          and referral.rewarded_at >= pg_catalog.now() - interval '365 days'
      ),
      0::bigint
    )::integer
  into rewarded_count, pending_count, rejected_count, earned_days
  from public.referrals as referral
  where referral.inviter_user_id = actor_id;

  select
    pg_catalog.count(*) filter (where referral.status = 'rewarded')::integer,
    coalesce(
      pg_catalog.sum(referral.reward_days) filter (where referral.status = 'rewarded'),
      0::bigint
    )::integer
  into lifetime_rewarded_count, lifetime_earned_days
  from public.referrals as referral
  where referral.inviter_user_id = actor_id;

  return pg_catalog.jsonb_build_object(
    'referral_code', invite_code,
    'reward_days', 30,
    'annual_reward_limit', 12,
    'rewarded_referrals', rewarded_count,
    'pending_referrals', pending_count,
    'rejected_referrals', rejected_count,
    'days_earned', earned_days,
    'lifetime_rewarded_referrals', lifetime_rewarded_count,
    'lifetime_days_earned', lifetime_earned_days,
    'ad_free_until', ad_free_until,
    'ad_free_active', ad_free_until is not null and ad_free_until > pg_catalog.now(),
    'subscription_active', 'subscription' = any(active_entitlement_sources),
    'active_entitlement_sources', pg_catalog.to_jsonb(active_entitlement_sources)
  );
end;
$$;

revoke all on function public.record_verified_subscription(
  uuid,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean,
  text,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.claim_referral(text) from public, anon;
revoke all on function public.qualify_referral(text) from public, anon;
revoke all on function public.get_referral_program_status() from public, anon;
grant execute on function public.record_verified_subscription(
  uuid,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean,
  text,
  timestamptz
) to service_role;
grant execute on function public.claim_referral(text) to authenticated, service_role;
grant execute on function public.qualify_referral(text) to authenticated, service_role;
grant execute on function public.get_referral_program_status() to authenticated, service_role;


-- Release hardening: keep aggregate schema aligned with the production migrations.
create table if not exists private.product_metric_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  event_count integer not null check (event_count >= 0),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table private.product_metric_rate_limits enable row level security;
alter table private.product_metric_rate_limits force row level security;
revoke all on table private.product_metric_rate_limits
  from public, anon, authenticated;
grant select, insert, update, delete on table private.product_metric_rate_limits
  to service_role;

create or replace function public.reserve_product_metric_batch(
  p_user_id uuid,
  p_event_count integer,
  p_window_seconds integer default 60,
  p_event_limit integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  rate_limit private.product_metric_rate_limits%rowtype;
  current_time timestamptz := pg_catalog.clock_timestamp();
begin
  if p_user_id is null
    or p_event_count not between 1 and 20
    or p_window_seconds not between 10 and 3600
    or p_event_limit not between 20 and 1000 then
    raise exception 'Invalid product metric capacity request'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('product-metrics:' || p_user_id::text, 0)
  );

  select record.* into rate_limit
  from private.product_metric_rate_limits as record
  where record.user_id = p_user_id
  for update;

  if rate_limit.user_id is null
    or rate_limit.window_started_at <= current_time - pg_catalog.make_interval(secs => p_window_seconds) then
    insert into private.product_metric_rate_limits (
      user_id,
      window_started_at,
      event_count,
      updated_at
    ) values (
      p_user_id,
      current_time,
      p_event_count,
      current_time
    )
    on conflict (user_id) do update
    set
      window_started_at = excluded.window_started_at,
      event_count = excluded.event_count,
      updated_at = excluded.updated_at;
    return true;
  end if;

  if rate_limit.event_count + p_event_count > p_event_limit then
    return false;
  end if;

  update private.product_metric_rate_limits
  set
    event_count = event_count + p_event_count,
    updated_at = current_time
  where user_id = p_user_id;
  return true;
end;
$$;

revoke all on function public.reserve_product_metric_batch(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_product_metric_batch(uuid, integer, integer, integer)
  to service_role;

create or replace function public.block_user(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_profile public.user_profiles%rowtype;
  has_known_relationship boolean := false;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_target_user_id is null or p_target_user_id = actor_id then
    raise exception 'Blocked account is invalid'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.friendships as friendship
    where friendship.user_low = least(actor_id, p_target_user_id)
      and friendship.user_high = greatest(actor_id, p_target_user_id)
      and friendship.status in ('pending', 'accepted')
  ) or exists (
    select 1
    from private.shared_snapshot_members as actor_member
    join private.shared_snapshot_members as target_member
      on target_member.snapshot_id = actor_member.snapshot_id
    where actor_member.user_id = actor_id
      and target_member.user_id = p_target_user_id
  ) into has_known_relationship;

  if not has_known_relationship then
    raise exception 'Blocked account is not connected to this account'
      using errcode = '42501';
  end if;

  select profile.*
  into target_profile
  from public.user_profiles as profile
  where profile.user_id = p_target_user_id;

  if target_profile.user_id is null then
    raise exception 'Blocked account was not found'
      using errcode = 'P0001';
  end if;

  insert into public.user_blocks (
    blocker_user_id,
    blocked_user_id,
    blocked_display_name,
    blocked_username
  ) values (
    actor_id,
    p_target_user_id,
    target_profile.display_name,
    target_profile.username
  )
  on conflict (blocker_user_id, blocked_user_id)
  do update set
    blocked_display_name = excluded.blocked_display_name,
    blocked_username = excluded.blocked_username,
    created_at = pg_catalog.now();

  delete from public.friendships as friendship
  where friendship.user_low = least(actor_id, p_target_user_id)
    and friendship.user_high = greatest(actor_id, p_target_user_id);

  return pg_catalog.jsonb_build_object(
    'blocked_user_id', p_target_user_id,
    'status', 'blocked'
  );
end;
$$;

revoke all on function public.block_user(uuid) from public, anon, authenticated;
grant execute on function public.block_user(uuid) to authenticated, service_role;

create or replace function private.revoke_event_invites_after_member_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_active_ids text[];
  new_active_ids text[];
  removed_event_id text;
begin
  if new.snapshot_kind <> 'shared_event'
    or old.state -> 'events' -> 0 is null
    or new.state -> 'events' -> 0 is null then
    return new;
  end if;

  old_active_ids := private.active_event_participant_ids(old.state);
  new_active_ids := private.active_event_participant_ids(new.state);
  if not exists (
    select 1
    from pg_catalog.unnest(old_active_ids) as old_id(value)
    where not (old_id.value = any(new_active_ids))
  ) then
    return new;
  end if;

  if private.authorized_shared_event_account_link(
    new.id,
    old.state,
    new.state,
    private.current_actor_participant_id()
  ) is not null then
    return new;
  end if;

  removed_event_id := new.state -> 'events' -> 0 ->> 'id';
  update public.event_invite_tokens as invite
  set
    revoked_at = coalesce(revoked_at, pg_catalog.clock_timestamp()),
    updated_at = pg_catalog.clock_timestamp()
  where invite.event_id = removed_event_id
    and invite.revoked_at is null;
  return new;
end;
$$;
drop trigger if exists revoke_event_invites_after_member_removal
  on public.app_snapshots;
create trigger revoke_event_invites_after_member_removal
  after update of state on public.app_snapshots
  for each row execute function private.revoke_event_invites_after_member_removal();
revoke all on function private.revoke_event_invites_after_member_removal()
  from public, anon, authenticated;

create or replace function private.is_account_linked_shared_participant(
  p_state jsonb,
  p_participant_id text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(p_state -> 'participants') = 'array'
          then p_state -> 'participants'
        else '[]'::jsonb
      end
    ) as participant(value)
    where participant.value ->> 'id' = p_participant_id
      and (
        p_participant_id like 'account-%'
        or participant.value @> '{"accountLinked": true}'::jsonb
      )
  );
$$;

create or replace function private.is_valid_shared_event_financials(p_state jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  event_record jsonb;
  expense_record jsonb;
  payer_record jsonb;
  transfer_record jsonb;
  transfer_status_update_record jsonb;
  participant_ids text[] := '{}'::text[];
  event_participant_ids text[] := '{}'::text[];
  ids text[];
  payer_total numeric;
  amount numeric;
begin
  if not private.is_shared_event_state(p_state)
    or pg_catalog.pg_column_size(p_state) > 2097152
    or pg_catalog.jsonb_typeof(p_state -> 'participants') <> 'array'
    or pg_catalog.jsonb_typeof(p_state -> 'events') <> 'array'
    or pg_catalog.jsonb_array_length(p_state -> 'participants') > 500
    or pg_catalog.jsonb_array_length(p_state -> 'events') > 1 then
    return false;
  end if;

  if pg_catalog.jsonb_array_length(p_state -> 'events') = 0 then
    return pg_catalog.jsonb_typeof(p_state -> 'deletedEvents') = 'array'
      and pg_catalog.jsonb_array_length(p_state -> 'deletedEvents') between 1 and 100;
  end if;

  event_record := p_state -> 'events' -> 0;
  select coalesce(pg_catalog.array_agg(item.value ->> 'id'), '{}'::text[])
  into participant_ids
  from pg_catalog.jsonb_array_elements(
    case
      when pg_catalog.jsonb_typeof(p_state -> 'participants') = 'array'
        then p_state -> 'participants'
      else '[]'::jsonb
    end
  ) as item(value);

  if exists (
      select 1
      from pg_catalog.unnest(participant_ids) as participant_id(value)
      where coalesce(participant_id.value, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    )
    or pg_catalog.cardinality(participant_ids) <> (
      select count(distinct participant_id.value)
      from pg_catalog.unnest(participant_ids) as participant_id(value)
    ) then
    return false;
  end if;

  event_participant_ids := private.event_text_ids(event_record, 'participantIds');
  if pg_catalog.cardinality(event_participant_ids) = 0
    or pg_catalog.cardinality(event_participant_ids) <> (
      select count(distinct participant_id.value)
      from pg_catalog.unnest(event_participant_ids) as participant_id(value)
    )
    or exists (
      select 1
      from pg_catalog.unnest(event_participant_ids) as participant_id(value)
      where not (participant_id.value = any(participant_ids))
    ) then
    return false;
  end if;

  if pg_catalog.jsonb_typeof(coalesce(event_record -> 'expenses', '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(event_record -> 'transfers', '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(event_record -> 'transferStatusUpdates', '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(event_record -> 'deletedExpenses', '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'expenses', '[]'::jsonb)) > 2000
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'transfers', '[]'::jsonb)) > 2000
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'transferStatusUpdates', '[]'::jsonb)) > 2000
    or pg_catalog.jsonb_array_length(coalesce(event_record -> 'deletedExpenses', '[]'::jsonb)) > 2000 then
    return false;
  end if;

  select coalesce(pg_catalog.array_agg(item.value ->> 'id'), '{}'::text[])
  into ids
  from pg_catalog.jsonb_array_elements(coalesce(event_record -> 'expenses', '[]'::jsonb)) as item(value);
  if exists (
      select 1 from pg_catalog.unnest(ids) as id(value)
      where coalesce(id.value, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    )
    or pg_catalog.cardinality(ids) <> (
      select count(distinct id.value) from pg_catalog.unnest(ids) as id(value)
    ) then
    return false;
  end if;

  for expense_record in
    select item.value
    from pg_catalog.jsonb_array_elements(coalesce(event_record -> 'expenses', '[]'::jsonb)) as item(value)
  loop
    if pg_catalog.jsonb_typeof(expense_record) <> 'object'
      or pg_catalog.jsonb_typeof(expense_record -> 'total') <> 'number'
      or (expense_record ->> 'total') !~ '^[0-9]+$'
      or (expense_record ->> 'total')::numeric <= 0
      or (expense_record ->> 'total')::numeric > 9007199254740991
      or pg_catalog.jsonb_typeof(expense_record -> 'payers') <> 'array'
      or pg_catalog.jsonb_typeof(expense_record -> 'sharedByParticipantIds') <> 'array'
      or pg_catalog.jsonb_array_length(expense_record -> 'payers') = 0
      or pg_catalog.jsonb_array_length(expense_record -> 'sharedByParticipantIds') = 0 then
      return false;
    end if;

    if coalesce(expense_record ->> 'createdByParticipantId', '') <> ''
      and not ((expense_record ->> 'createdByParticipantId') = any(event_participant_ids)) then
      return false;
    end if;

    select coalesce(pg_catalog.array_agg(shared.value), '{}'::text[])
    into ids
    from pg_catalog.jsonb_array_elements_text(expense_record -> 'sharedByParticipantIds') as shared(value);
    if pg_catalog.cardinality(ids) <> pg_catalog.jsonb_array_length(expense_record -> 'sharedByParticipantIds')
      or pg_catalog.cardinality(ids) <> (
        select count(distinct id.value) from pg_catalog.unnest(ids) as id(value)
      )
      or exists (
        select 1 from pg_catalog.unnest(ids) as id(value)
        where not (id.value = any(event_participant_ids))
      ) then
      return false;
    end if;

    select coalesce(pg_catalog.array_agg(item.value ->> 'participantId'), '{}'::text[])
    into ids
    from pg_catalog.jsonb_array_elements(expense_record -> 'payers') as item(value);
    if pg_catalog.cardinality(ids) <> pg_catalog.jsonb_array_length(expense_record -> 'payers')
      or pg_catalog.cardinality(ids) <> (
        select count(distinct id.value) from pg_catalog.unnest(ids) as id(value)
      )
      or exists (
        select 1 from pg_catalog.unnest(ids) as id(value)
        where not (id.value = any(event_participant_ids))
      ) then
      return false;
    end if;

    payer_total := 0;
    for payer_record in
      select item.value
      from pg_catalog.jsonb_array_elements(expense_record -> 'payers') as item(value)
    loop
      if pg_catalog.jsonb_typeof(payer_record) <> 'object'
        or pg_catalog.jsonb_typeof(payer_record -> 'amount') <> 'number'
        or (payer_record ->> 'amount') !~ '^[0-9]+$'
        or (payer_record ->> 'amount')::numeric <= 0
        or (payer_record ->> 'amount')::numeric > 9007199254740991 then
        return false;
      end if;
      payer_total := payer_total + (payer_record ->> 'amount')::numeric;
    end loop;
    if payer_total <> (expense_record ->> 'total')::numeric then
      return false;
    end if;
  end loop;

  select coalesce(pg_catalog.array_agg(item.value ->> 'id'), '{}'::text[])
  into ids
  from pg_catalog.jsonb_array_elements(coalesce(event_record -> 'transfers', '[]'::jsonb)) as item(value);
  if exists (
      select 1 from pg_catalog.unnest(ids) as id(value)
      where coalesce(id.value, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    )
    or pg_catalog.cardinality(ids) <> (
      select count(distinct id.value) from pg_catalog.unnest(ids) as id(value)
    ) then
    return false;
  end if;

  for transfer_record in
    select item.value
    from pg_catalog.jsonb_array_elements(coalesce(event_record -> 'transfers', '[]'::jsonb)) as item(value)
  loop
    if pg_catalog.jsonb_typeof(transfer_record) <> 'object'
      or pg_catalog.jsonb_typeof(transfer_record -> 'amount') <> 'number'
      or (transfer_record ->> 'amount') !~ '^[0-9]+$'
      or (transfer_record ->> 'amount')::numeric <= 0
      or (transfer_record ->> 'amount')::numeric > 9007199254740991
      or coalesce(transfer_record ->> 'status', '') not in ('pending', 'paid')
      or not ((transfer_record ->> 'fromParticipantId') = any(event_participant_ids))
      or not ((transfer_record ->> 'toParticipantId') = any(event_participant_ids))
      or transfer_record ->> 'fromParticipantId' = transfer_record ->> 'toParticipantId' then
      return false;
    end if;
  end loop;

  select coalesce(pg_catalog.array_agg(item.value ->> 'id'), '{}'::text[])
  into ids
  from pg_catalog.jsonb_array_elements(
    coalesce(event_record -> 'transferStatusUpdates', '[]'::jsonb)
  ) as item(value);
  if exists (
      select 1 from pg_catalog.unnest(ids) as id(value)
      where coalesce(id.value, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    )
    or pg_catalog.cardinality(ids) <> (
      select count(distinct id.value) from pg_catalog.unnest(ids) as id(value)
    ) then
    return false;
  end if;

  for transfer_status_update_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(event_record -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
  loop
    if pg_catalog.jsonb_typeof(transfer_status_update_record) <> 'object'
      or transfer_status_update_record - array[
        'id',
        'status',
        'updatedAt',
        'markedAt',
        'markedPaidByParticipantId'
      ] <> '{}'::jsonb
      or coalesce(transfer_status_update_record ->> 'status', '') not in ('pending', 'paid')
      or pg_catalog.jsonb_typeof(transfer_status_update_record -> 'updatedAt') <> 'string'
      or pg_catalog.jsonb_typeof(transfer_status_update_record -> 'markedAt') <> 'string'
      or char_length(transfer_status_update_record ->> 'updatedAt') not between 1 and 64
      or transfer_status_update_record ->> 'updatedAt'
        is distinct from transfer_status_update_record ->> 'markedAt'
      or (
        coalesce(transfer_status_update_record ->> 'markedPaidByParticipantId', '') <> ''
        and not (
          (transfer_status_update_record ->> 'markedPaidByParticipantId') = any(participant_ids)
        )
      )
      or (
        transfer_status_update_record ->> 'status' = 'pending'
        and transfer_status_update_record ? 'markedPaidByParticipantId'
      ) then
      return false;
    end if;

  end loop;

  select coalesce(pg_catalog.array_agg(item.value ->> 'id'), '{}'::text[])
  into ids
  from pg_catalog.jsonb_array_elements(coalesce(event_record -> 'deletedExpenses', '[]'::jsonb)) as item(value);
  if exists (
      select 1 from pg_catalog.unnest(ids) as id(value)
      where coalesce(id.value, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    )
    or pg_catalog.cardinality(ids) <> (
      select count(distinct id.value) from pg_catalog.unnest(ids) as id(value)
    ) then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function private.has_valid_shared_event_transfer_totals(
  p_state jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  event_record jsonb;
  expense_record jsonb;
  payer_record jsonb;
  transfer_record jsonb;
  participant_record record;
  shared_record record;
  participant_balances jsonb := '{}'::jsonb;
  outstanding_balances jsonb := '{}'::jsonb;
  transfer_balances jsonb := '{}'::jsonb;
  participant_id text;
  payer_id text;
  from_id text;
  to_id text;
  total_amount numeric;
  payer_amount numeric;
  transfer_amount numeric;
  share_count integer;
  base_share numeric;
  remainder integer;
  next_balance numeric;
  floor_units numeric;
  units_to_distribute integer;
begin
  if pg_catalog.jsonb_typeof(p_state -> 'events') <> 'array' then
    return false;
  end if;
  if pg_catalog.jsonb_array_length(p_state -> 'events') = 0 then
    return true;
  end if;

  event_record := p_state -> 'events' -> 0;
  if pg_catalog.jsonb_array_length(
    coalesce(event_record -> 'transfers', '[]'::jsonb)
  ) = 0 then
    return true;
  end if;

  for participant_record in
    select item.value ->> 'id' as id, item.ordinality
    from pg_catalog.jsonb_array_elements(p_state -> 'participants')
      with ordinality as item(value, ordinality)
    where coalesce(event_record -> 'participantIds', '[]'::jsonb)
      ? (item.value ->> 'id')
    order by item.ordinality
  loop
    participant_balances := pg_catalog.jsonb_set(
      participant_balances, array[participant_record.id], '0'::jsonb, true
    );
    transfer_balances := pg_catalog.jsonb_set(
      transfer_balances, array[participant_record.id], '0'::jsonb, true
    );
  end loop;

  for expense_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(event_record -> 'expenses', '[]'::jsonb)
    ) as item(value)
  loop
    total_amount := (expense_record ->> 'total')::numeric;
    share_count := pg_catalog.jsonb_array_length(
      expense_record -> 'sharedByParticipantIds'
    );
    base_share := pg_catalog.floor(total_amount / share_count);
    remainder := (total_amount - (base_share * share_count))::integer;

    for shared_record in
      select item.value as id, item.ordinality
      from pg_catalog.jsonb_array_elements_text(
        expense_record -> 'sharedByParticipantIds'
      ) with ordinality as item(value, ordinality)
      order by item.ordinality
    loop
      participant_id := shared_record.id;
      next_balance := (participant_balances ->> participant_id)::numeric
        - base_share
        - case when shared_record.ordinality <= remainder then 1 else 0 end;
      participant_balances := pg_catalog.jsonb_set(
        participant_balances,
        array[participant_id],
        pg_catalog.to_jsonb(next_balance),
        true
      );
    end loop;

    for payer_record in
      select item.value
      from pg_catalog.jsonb_array_elements(expense_record -> 'payers') as item(value)
    loop
      payer_id := payer_record ->> 'participantId';
      payer_amount := (payer_record ->> 'amount')::numeric;
      next_balance := (participant_balances ->> payer_id)::numeric + payer_amount;
      participant_balances := pg_catalog.jsonb_set(
        participant_balances,
        array[payer_id],
        pg_catalog.to_jsonb(next_balance),
        true
      );
    end loop;
  end loop;

  if coalesce(event_record ->> 'roundSettlementTransfers', 'true') <> 'false' then
    select -pg_catalog.sum(
      pg_catalog.floor((participant_balances ->> participant.value)::numeric / 100)
    )::integer
    into units_to_distribute
    from pg_catalog.jsonb_array_elements_text(event_record -> 'participantIds')
      as participant(value);

    for participant_record in
      select
        item.value ->> 'id' as id,
        item.ordinality,
        pg_catalog.floor(
          (participant_balances ->> (item.value ->> 'id'))::numeric / 100
        ) as floor_units,
        (participant_balances ->> (item.value ->> 'id'))::numeric
          - pg_catalog.floor(
            (participant_balances ->> (item.value ->> 'id'))::numeric / 100
          ) * 100 as fractional_remainder
      from pg_catalog.jsonb_array_elements(p_state -> 'participants')
        with ordinality as item(value, ordinality)
      where coalesce(event_record -> 'participantIds', '[]'::jsonb)
        ? (item.value ->> 'id')
      order by fractional_remainder desc, item.ordinality
    loop
      floor_units := participant_record.floor_units;
      if units_to_distribute > 0 then
        floor_units := floor_units + 1;
        units_to_distribute := units_to_distribute - 1;
      end if;
      participant_balances := pg_catalog.jsonb_set(
        participant_balances,
        array[participant_record.id],
        pg_catalog.to_jsonb(floor_units * 100),
        true
      );
    end loop;
  end if;

  outstanding_balances := participant_balances;

  -- Completed transfers are immutable payment history. Apply them first so
  -- only the remaining, pending settlement must point from current debtors
  -- to current creditors. This also permits a legitimate later expense to
  -- reverse a route that had already been paid.
  for transfer_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(event_record -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'status' = 'paid'
  loop
    from_id := transfer_record ->> 'fromParticipantId';
    to_id := transfer_record ->> 'toParticipantId';
    transfer_amount := (transfer_record ->> 'amount')::numeric;
    outstanding_balances := pg_catalog.jsonb_set(
      outstanding_balances,
      array[from_id],
      pg_catalog.to_jsonb(
        (outstanding_balances ->> from_id)::numeric + transfer_amount
      ),
      true
    );
    outstanding_balances := pg_catalog.jsonb_set(
      outstanding_balances,
      array[to_id],
      pg_catalog.to_jsonb(
        (outstanding_balances ->> to_id)::numeric - transfer_amount
      ),
      true
    );
  end loop;

  for transfer_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(event_record -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'status' = 'pending'
  loop
    from_id := transfer_record ->> 'fromParticipantId';
    to_id := transfer_record ->> 'toParticipantId';
    transfer_amount := (transfer_record ->> 'amount')::numeric;
    if coalesce(event_record ->> 'directSettlementTransfers', 'false') <> 'true'
      and (
        (outstanding_balances ->> from_id)::numeric >= 0
        or (outstanding_balances ->> to_id)::numeric <= 0
      ) then
      return false;
    end if;
    transfer_balances := pg_catalog.jsonb_set(
      transfer_balances,
      array[from_id],
      pg_catalog.to_jsonb((transfer_balances ->> from_id)::numeric - transfer_amount),
      true
    );
    transfer_balances := pg_catalog.jsonb_set(
      transfer_balances,
      array[to_id],
      pg_catalog.to_jsonb((transfer_balances ->> to_id)::numeric + transfer_amount),
      true
    );
  end loop;

  for participant_record in
    select item.value ->> 'id' as id
    from pg_catalog.jsonb_array_elements(p_state -> 'participants') as item(value)
    where coalesce(event_record -> 'participantIds', '[]'::jsonb)
      ? (item.value ->> 'id')
  loop
    if (outstanding_balances ->> participant_record.id)::numeric
      <> (transfer_balances ->> participant_record.id)::numeric then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function private.has_authorized_transfer_status_changes(
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  old_event jsonb := coalesce(p_old_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(p_new_state -> 'events' -> 0, '{}'::jsonb);
  old_record jsonb;
  new_record jsonb;
  status_record jsonb;
  transfer_record jsonb;
  changed_at timestamptz;
begin
  for new_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
  loop
    old_record := null;
    select item.value into old_record
    from pg_catalog.jsonb_array_elements(
      coalesce(old_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;
    if old_record is not distinct from new_record then
      continue;
    end if;

    transfer_record := null;
    select item.value into transfer_record
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;
    if transfer_record is null
      or transfer_record ->> 'status' is distinct from new_record ->> 'status' then
      return false;
    end if;
    if coalesce(p_actor_participant_id, '') = '' then
      return false;
    end if;

    changed_at := (new_record ->> 'updatedAt')::timestamptz;
    if changed_at < pg_catalog.statement_timestamp() - interval '15 minutes'
      or changed_at > pg_catalog.statement_timestamp() + interval '2 minutes' then
      return false;
    end if;
    if new_record ->> 'status' = 'paid' then
      if new_record ->> 'markedPaidByParticipantId'
        is distinct from p_actor_participant_id then
        return false;
      end if;
    elsif new_record ? 'markedPaidByParticipantId' then
      return false;
    end if;
  end loop;

  for new_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
  loop
    old_record := null;
    select item.value into old_record
    from pg_catalog.jsonb_array_elements(
      coalesce(old_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;

    if old_record is null then
      if coalesce(new_record ->> 'status', '') = 'pending' then
        continue;
      end if;
      return false;
    end if;

    if (
        old_record ->> 'fromParticipantId'
          is distinct from new_record ->> 'fromParticipantId'
        or old_record ->> 'toParticipantId'
          is distinct from new_record ->> 'toParticipantId'
        or old_record -> 'amount' is distinct from new_record -> 'amount'
      ) then
      return false;
    end if;

    if old_record is not null
      and old_record ->> 'status' is not distinct from new_record ->> 'status'
      and old_record ->> 'markedPaidByParticipantId'
        is not distinct from new_record ->> 'markedPaidByParticipantId'
      and old_record ->> 'markedPaidAt'
        is not distinct from new_record ->> 'markedPaidAt'
      and old_record ->> 'statusUpdatedAt'
        is not distinct from new_record ->> 'statusUpdatedAt' then
      continue;
    end if;
    status_record := null;
    select item.value into status_record
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;

    if status_record is null
      or status_record ->> 'status' is distinct from new_record ->> 'status'
      or (
        new_record ->> 'status' = 'paid'
        and (
          status_record ->> 'markedPaidByParticipantId'
            is distinct from p_actor_participant_id
          or new_record ->> 'markedPaidByParticipantId'
            is distinct from p_actor_participant_id
          or new_record ->> 'markedPaidAt'
            is distinct from status_record ->> 'updatedAt'
          or new_record ->> 'statusUpdatedAt'
            is distinct from status_record ->> 'updatedAt'
        )
      )
      or (
        new_record ->> 'status' = 'pending'
        and new_record ? 'markedPaidByParticipantId'
      ) then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function private.guard_shared_event_financial_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  previous_state jsonb := case when tg_op = 'UPDATE' then old.state else new.state end;
  old_event jsonb := coalesce(previous_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
  old_record jsonb;
  new_record jsonb;
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
  end if;
  if not private.is_valid_shared_event_financials(new.state) then
    raise exception 'Shared event financial payload is invalid'
      using errcode = '22023';
  end if;
  if not private.has_valid_shared_event_transfer_totals(new.state) then
    raise exception 'Shared event transfers do not match its expenses'
      using errcode = '22023';
  end if;
  if not private.has_authorized_transfer_status_changes(
    previous_state,
    new.state,
    actor_participant_id
  ) then
    raise exception 'Shared event payment status attribution is invalid'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    for new_record in
      select item.value
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'expenses', '[]'::jsonb)
      ) as item(value)
    loop
      if new_record ->> 'createdByParticipantId'
          is distinct from actor_participant_id
        and private.is_account_linked_shared_participant(
          new.state,
          new_record ->> 'createdByParticipantId'
        ) then
        raise exception 'An account-linked expense must be attributed to the authenticated creator'
          using errcode = '42501';
      end if;
    end loop;
  elsif tg_op = 'UPDATE' then
    for new_record in
      select item.value
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'expenses', '[]'::jsonb)
      ) as item(value)
    loop
      old_record := null;
      select item.value into old_record
      from pg_catalog.jsonb_array_elements(
        coalesce(old_event -> 'expenses', '[]'::jsonb)
      ) as item(value)
      where item.value ->> 'id' = new_record ->> 'id'
      limit 1;
      if old_record is null then
        if coalesce(actor_participant_id, '') = ''
          or new_record ->> 'createdByParticipantId'
            is distinct from actor_participant_id then
          raise exception 'A new expense must be attributed to its authenticated creator'
            using errcode = '42501';
        end if;
      elsif old_record ->> 'createdByParticipantId'
        is distinct from new_record ->> 'createdByParticipantId' then
        raise exception 'Expense creator attribution is immutable'
          using errcode = '42501';
      end if;
    end loop;

    if actor_id is not null
      and private.is_active_shared_event_member(new.id, actor_id)
      and exists (
        select 1
        from private.shared_snapshot_members as other_member
        where other_member.snapshot_id = new.id
          and other_member.status = 'active'
          and other_member.user_id <> actor_id
      ) then
      insert into private.shared_event_qualification_activity (
        snapshot_id, event_id, actor_user_id, activity_kind, entity_id
      )
      select
        new.id,
        new_event ->> 'id',
        actor_id,
        'expense_created',
        expense.value ->> 'id'
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'expenses', '[]'::jsonb)
      ) as expense(value)
      where expense.value ->> 'createdByParticipantId' = actor_participant_id
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(old_event -> 'expenses', '[]'::jsonb)
          ) as old_expense(value)
          where old_expense.value ->> 'id' = expense.value ->> 'id'
        )
      on conflict (snapshot_id, activity_kind, entity_id) do nothing;

      insert into private.shared_event_qualification_activity (
        snapshot_id, event_id, actor_user_id, activity_kind, entity_id
      )
      select
        new.id,
        new_event ->> 'id',
        actor_id,
        'transfer_paid',
        status_update.value ->> 'id'
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
      ) as status_update(value)
      join pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'transfers', '[]'::jsonb)
      ) as current_transfer(value)
        on current_transfer.value ->> 'id' = status_update.value ->> 'id'
      join pg_catalog.jsonb_array_elements(
        coalesce(old_event -> 'transfers', '[]'::jsonb)
      ) as previous_transfer(value)
        on previous_transfer.value ->> 'id' = status_update.value ->> 'id'
      where status_update.value ->> 'status' = 'paid'
        and status_update.value ->> 'markedPaidByParticipantId' = actor_participant_id
        and current_transfer.value ->> 'status' = 'paid'
        and previous_transfer.value ->> 'fromParticipantId'
          is not distinct from current_transfer.value ->> 'fromParticipantId'
        and previous_transfer.value ->> 'toParticipantId'
          is not distinct from current_transfer.value ->> 'toParticipantId'
        and previous_transfer.value -> 'amount'
          is not distinct from current_transfer.value -> 'amount'
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(old_event -> 'transferStatusUpdates', '[]'::jsonb)
          ) as old_status(value)
          where old_status.value ->> 'id' = status_update.value ->> 'id'
            and old_status.value ->> 'status' = 'paid'
        )
      on conflict (snapshot_id, activity_kind, entity_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_shared_event_financial_integrity
  on public.app_snapshots;
create trigger guard_shared_event_financial_integrity
  before insert or update of state, owner_user_id, snapshot_kind
  on public.app_snapshots
  for each row execute function private.guard_shared_event_financial_integrity();

revoke all on function private.has_valid_shared_event_transfer_totals(jsonb)
  from public, anon, authenticated;
revoke all on function private.has_authorized_transfer_status_changes(jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function private.is_account_linked_shared_participant(jsonb, text)
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_financial_integrity()
  from public, anon, authenticated;

create or replace function public.update_shared_event_snapshot(
  p_snapshot_id text,
  p_space_key text,
  p_expected_updated_at timestamptz,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot public.app_snapshots%rowtype;
  expected_hash text;
  next_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if coalesce(p_snapshot_id, '') !~ '^[A-Za-z0-9_-]{3,80}$'
    or char_length(coalesce(p_space_key, '')) not between 24 and 256
    or p_expected_updated_at is null
    or not private.is_valid_shared_event_financials(p_state) then
    raise exception 'Shared event update payload is invalid' using errcode = '22023';
  end if;

  expected_hash := pg_catalog.encode(extensions.digest(p_space_key, 'sha256'), 'hex');
  select record.* into snapshot
  from public.app_snapshots as record
  where record.id = p_snapshot_id
  for update;

  if snapshot.id is null
    or snapshot.owner_user_id is not null
    or snapshot.snapshot_kind <> 'shared_event'
    or (
      snapshot.access_key_hash <> expected_hash
      and p_space_key <> 'member_access_recovery_v1_key_0001'
    )
    or not public.can_write_shared_snapshot(p_snapshot_id) then
    raise exception 'Shared event update is not authorized' using errcode = '42501';
  end if;
  if snapshot.updated_at is distinct from p_expected_updated_at then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'updatedAt', snapshot.updated_at
    );
  end if;

  next_updated_at := pg_catalog.clock_timestamp();
  update public.app_snapshots
  set state = p_state,
      updated_at = next_updated_at
  where id = p_snapshot_id;

  return pg_catalog.jsonb_build_object(
    'status', 'updated',
    'updatedAt', next_updated_at
  );
end;
$$;

revoke all on function private.is_valid_shared_event_financials(jsonb)
  from public, anon, authenticated;
revoke all on function private.is_account_linked_shared_participant(jsonb, text)
  from public, anon, authenticated;
revoke all on function public.update_shared_event_snapshot(text, text, timestamptz, jsonb)
  from public, anon;
grant execute on function public.update_shared_event_snapshot(text, text, timestamptz, jsonb)
  to authenticated, service_role;
revoke execute on function public.can_bootstrap_shared_snapshot(text)
  from authenticated;

drop policy if exists app_snapshots_insert on public.app_snapshots;
create policy app_snapshots_insert
  on public.app_snapshots
  for insert
  to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and access_key_hash = (select public.request_space_key_hash())
  );

drop policy if exists app_snapshots_update on public.app_snapshots;
create policy app_snapshots_update
  on public.app_snapshots
  for update
  to authenticated
  using (
    owner_user_id is null
    and snapshot_kind = 'workspace'
    and access_key_hash = (select public.request_space_key_hash())
  )
  with check (
    owner_user_id is null
    and snapshot_kind = 'workspace'
    and access_key_hash = (select public.request_space_key_hash())
  );

create or replace function public.create_shared_event_snapshot(
  p_snapshot_id text,
  p_space_key text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  event_record jsonb := p_state -> 'events' -> 0;
  existing_snapshot public.app_snapshots%rowtype;
  existing_member private.shared_snapshot_members%rowtype;
  expected_hash text;
begin
  if actor_id is null or actor_participant_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if coalesce(p_snapshot_id, '') !~ '^[A-Za-z0-9_-]{3,80}$'
    or char_length(coalesce(p_space_key, '')) not between 24 and 256
    or not private.is_valid_shared_event_financials(p_state)
    or event_record is null then
    raise exception 'Shared event creation payload is invalid' using errcode = '22023';
  end if;
  if not (
    actor_participant_id = any(private.active_event_participant_ids(p_state))
    and actor_participant_id = any(private.event_admin_ids(p_state))
    and event_record ->> 'createdByParticipantId' = actor_participant_id
  ) then
    raise exception 'Only the authenticated event creator can create this event'
      using errcode = '42501';
  end if;

  expected_hash := pg_catalog.encode(extensions.digest(p_space_key, 'sha256'), 'hex');
  select record.* into existing_snapshot
  from public.app_snapshots as record
  where record.id = p_snapshot_id
  for update;

  if existing_snapshot.id is not null then
    select member.* into existing_member
    from private.shared_snapshot_members as member
    where member.snapshot_id = p_snapshot_id
      and member.user_id = actor_id
    for update;
    if existing_snapshot.snapshot_kind <> 'shared_event'
      or existing_snapshot.access_key_hash <> expected_hash
      or existing_snapshot.state -> 'events' -> 0 ->> 'id' is distinct from event_record ->> 'id'
      or existing_member.user_id is null
      or existing_member.status <> 'active'
      or existing_member.participant_id <> actor_participant_id then
      raise exception 'Shared event identifier is already in use' using errcode = '42501';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'existing',
      'snapshotId', existing_snapshot.id,
      'updatedAt', existing_snapshot.updated_at
    );
  end if;

  insert into public.app_snapshots (
    id, access_key_hash, owner_user_id, snapshot_kind, state, updated_at
  ) values (
    p_snapshot_id, expected_hash, null, 'shared_event', p_state, pg_catalog.now()
  );
  return pg_catalog.jsonb_build_object('status', 'created', 'snapshotId', p_snapshot_id);
end;
$$;

revoke all on function public.create_shared_event_snapshot(text, text, jsonb)
  from public, anon;
grant execute on function public.create_shared_event_snapshot(text, text, jsonb)
  to authenticated, service_role;

create or replace function private.has_preserved_paid_transfer_history(
  p_old_state jsonb,
  p_new_state jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with old_event as (
    select coalesce(p_old_state -> 'events' -> 0, '{}'::jsonb) as value
  ),
  new_event as (
    select coalesce(p_new_state -> 'events' -> 0, '{}'::jsonb) as value
  ),
  old_paid_transfers as (
    select transfer.value
    from old_event,
      pg_catalog.jsonb_array_elements(
        coalesce(old_event.value -> 'transfers', '[]'::jsonb)
      ) as transfer(value)
    where transfer.value ->> 'status' = 'paid'
  ),
  old_paid_statuses as (
    select status.value
    from old_event,
      pg_catalog.jsonb_array_elements(
        coalesce(old_event.value -> 'transferStatusUpdates', '[]'::jsonb)
      ) as status(value)
    where status.value ->> 'status' = 'paid'
  )
  select
    not exists (
      select 1
      from old_paid_transfers as old_transfer
      where not exists (
        select 1
        from new_event,
          pg_catalog.jsonb_array_elements(
            coalesce(new_event.value -> 'transfers', '[]'::jsonb)
          ) as new_transfer(value)
        where new_transfer.value ->> 'id' = old_transfer.value ->> 'id'
          and new_transfer.value is not distinct from old_transfer.value
      )
    )
    and not exists (
      select 1
      from old_paid_statuses as old_status
      where not exists (
        select 1
        from new_event,
          pg_catalog.jsonb_array_elements(
            coalesce(new_event.value -> 'transferStatusUpdates', '[]'::jsonb)
          ) as new_status(value)
        where new_status.value ->> 'id' = old_status.value ->> 'id'
          and new_status.value is not distinct from old_status.value
      )
    );
$$;

create or replace function private.guard_shared_event_history_and_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) > 500
    or pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) > 500 then
    raise exception 'Shared event transfer history is too large'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and not private.has_preserved_paid_transfer_history(old.state, new.state) then
    raise exception 'Completed payment history cannot be removed or rewritten'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_shared_event_history_and_limits
  on public.app_snapshots;
create trigger guard_shared_event_history_and_limits
  before insert or update of state, owner_user_id, snapshot_kind
  on public.app_snapshots
  for each row execute function private.guard_shared_event_history_and_limits();

revoke all on function private.has_preserved_paid_transfer_history(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_history_and_limits()
  from public, anon, authenticated;


-- A payment reversal keeps its audit entries and is authorized independently
-- from ordinary event editing, including centrally managed events.
create or replace function private.guard_shared_event_history_and_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
  account_link jsonb := case when tg_op = 'UPDATE' then
    private.authorized_shared_event_account_link(
      new.id,
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
  else null end;
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) > 500
    or pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) > 500 then
    raise exception 'Shared event transfer history is too large'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and not private.is_safe_shared_event_deletion(
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
    and not private.is_safe_transfer_status_only_update(
      new.id,
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
    and not private.has_preserved_paid_transfer_history(old.state, new.state)
    and not private.has_preserved_paid_history_for_account_link(
      old.state,
      new.state,
      account_link
    ) then
    raise exception 'Completed payment history cannot be removed or rewritten'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_shared_event_history_and_limits()
  from public, anon, authenticated;


-- An administrator may delete a whole shared event, including one with paid
-- history, only when the live payload is replaced by one exact tombstone.
-- Every partial edit still has to preserve completed payment history.
create or replace function private.is_safe_shared_event_deletion(
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  old_event jsonb := p_old_state -> 'events' -> 0;
  old_event_id text := old_event ->> 'id';
  target_tombstone jsonb;
  target_deleted_at timestamptz;
begin
  if old_event is null
    or coalesce(old_event_id, '') = ''
    or coalesce(p_actor_participant_id, '') = ''
    or not (
      p_actor_participant_id = any(private.event_admin_ids(p_old_state))
    )
    or pg_catalog.jsonb_typeof(p_new_state -> 'events') <> 'array'
    or p_new_state -> 'events' is distinct from '[]'::jsonb
    or p_new_state -> 'participants' is distinct from '[]'::jsonb
    or p_new_state -> 'groups' is distinct from '[]'::jsonb
    or coalesce(p_new_state ->> 'currentParticipantId', '') <> ''
    or pg_catalog.jsonb_typeof(p_new_state -> 'deletedEvents') <> 'array'
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(p_old_state -> 'deletedEvents', '[]'::jsonb)
      ) as old_deletion(value)
      where old_deletion.value ->> 'id' = old_event_id
    )
    or p_new_state - array[
      'events',
      'participants',
      'groups',
      'currentParticipantId',
      'deletedEvents'
    ] is distinct from p_old_state - array[
      'events',
      'participants',
      'groups',
      'currentParticipantId',
      'deletedEvents'
    ] then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      coalesce(p_old_state -> 'deletedEvents', '[]'::jsonb)
    ) as old_deletion(value)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_new_state -> 'deletedEvents')
        as new_deletion(value)
      where new_deletion.value = old_deletion.value
    )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_new_state -> 'deletedEvents')
      as new_deletion(value)
    where new_deletion.value ->> 'id' is distinct from old_event_id
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(p_old_state -> 'deletedEvents', '[]'::jsonb)
        ) as old_deletion(value)
        where old_deletion.value = new_deletion.value
      )
  ) then
    return false;
  end if;

  select deletion.value into target_tombstone
  from pg_catalog.jsonb_array_elements(p_new_state -> 'deletedEvents')
    as deletion(value)
  where deletion.value ->> 'id' = old_event_id;

  if target_tombstone is null
    or target_tombstone - array['id', 'deletedAt'] <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(target_tombstone -> 'deletedAt') <> 'string'
    or (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(p_new_state -> 'deletedEvents')
        as deletion(value)
      where deletion.value ->> 'id' = old_event_id
    ) <> 1 then
    return false;
  end if;

  target_deleted_at := (target_tombstone ->> 'deletedAt')::timestamptz;
  return target_deleted_at is not null;
exception
  when others then
    return false;
end;
$$;

create or replace function private.guard_shared_event_history_and_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
  account_link jsonb := case when tg_op = 'UPDATE' then
    private.authorized_shared_event_account_link(
      new.id,
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
  else null end;
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) > 500
    or pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) > 500 then
    raise exception 'Shared event transfer history is too large'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and not private.is_safe_shared_event_deletion(
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
    and not private.has_preserved_paid_transfer_history(old.state, new.state)
    and not private.has_preserved_paid_history_for_account_link(
      old.state,
      new.state,
      account_link
    ) then
    raise exception 'Completed payment history cannot be removed or rewritten'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.is_safe_shared_event_deletion(jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_history_and_limits()
  from public, anon, authenticated;
create or replace function private.guard_friendship_pair_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  low_user uuid := least(new.requester_id, new.addressee_id);
  high_user uuid := greatest(new.requester_id, new.addressee_id);
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'friendship:' || low_user::text || ':' || high_user::text,
      0
    )
  );

  if exists (
    select 1
    from public.user_blocks as user_block
    where (
      user_block.blocker_user_id = low_user
      and user_block.blocked_user_id = high_user
    ) or (
      user_block.blocker_user_id = high_user
      and user_block.blocked_user_id = low_user
    )
  ) then
    raise exception 'Friendship is unavailable for blocked accounts'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.lock_user_block_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'friendship:' || least(new.blocker_user_id, new.blocked_user_id)::text || ':' ||
      greatest(new.blocker_user_id, new.blocked_user_id)::text,
      0
    )
  );
  return new;
end;
$$;

drop trigger if exists guard_friendship_pair_write on public.friendships;
create trigger guard_friendship_pair_write
  before insert or update of requester_id, addressee_id, status
  on public.friendships
  for each row execute function private.guard_friendship_pair_write();

drop trigger if exists lock_user_block_pair on public.user_blocks;
create trigger lock_user_block_pair
  before insert or update of blocker_user_id, blocked_user_id
  on public.user_blocks
  for each row execute function private.lock_user_block_pair();

revoke all on function private.guard_friendship_pair_write()
  from public, anon, authenticated;
revoke all on function private.lock_user_block_pair()
  from public, anon, authenticated;

create or replace function private.prune_revoked_event_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'open' then
    delete from public.event_invite_tokens as invite
    where invite.id in (
      select stale.id
      from public.event_invite_tokens as stale
      where stale.event_id = new.event_id
        and stale.kind = 'open'
        and stale.revoked_at is not null
      order by stale.updated_at desc, stale.id desc
      offset 12
    );
  end if;
  return new;
end;
$$;

drop trigger if exists prune_revoked_event_invites on public.event_invite_tokens;
create trigger prune_revoked_event_invites
  after insert on public.event_invite_tokens
  for each row execute function private.prune_revoked_event_invites();

revoke all on function private.prune_revoked_event_invites()
  from public, anon, authenticated;

create or replace function public.verify_shared_event_notification_parties(
  p_snapshot_id text,
  p_sender_user_id uuid,
  p_recipient_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_snapshots as snapshot
    where snapshot.id = p_snapshot_id
      and snapshot.snapshot_kind = 'shared_event'
      and exists (
        select 1
        from private.shared_snapshot_members as sender
        where sender.snapshot_id = snapshot.id
          and sender.user_id = p_sender_user_id
          and sender.status = 'active'
      )
      and exists (
        select 1
        from private.shared_snapshot_members as recipient
        where recipient.snapshot_id = snapshot.id
          and recipient.user_id = p_recipient_user_id
          and recipient.status = 'active'
      )
  );
$$;

revoke all on function public.verify_shared_event_notification_parties(
  text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.verify_shared_event_notification_parties(
  text, uuid, uuid
) to service_role;

-- Final launch-security definitions. Keep this block aligned with
-- 20260821183052_finalize_launch_security.sql.
set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- Preserve the exact audience that was active when a shared event was
-- deleted. The regular membership sync intentionally marks those members as
-- removed, so tombstone visibility cannot depend on the mutable member row.
alter table private.shared_snapshot_members
  add column if not exists pending_join_until timestamptz;

create table if not exists private.shared_snapshot_tombstone_recipients (
  snapshot_id text not null
    references public.app_snapshots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_id text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (snapshot_id, user_id)
);

create index if not exists shared_snapshot_tombstone_recipient_user_idx
  on private.shared_snapshot_tombstone_recipients (user_id, snapshot_id);

alter table private.shared_snapshot_tombstone_recipients enable row level security;
alter table private.shared_snapshot_tombstone_recipients force row level security;
revoke all on table private.shared_snapshot_tombstone_recipients
  from public, anon, authenticated;

create or replace function private.capture_shared_snapshot_tombstone_recipients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.snapshot_kind = 'shared_event'
    and old.state -> 'events' -> 0 is not null
    and new.state -> 'events' -> 0 is null then
    insert into private.shared_snapshot_tombstone_recipients (
      snapshot_id,
      user_id,
      participant_id
    )
    select
      member.snapshot_id,
      member.user_id,
      member.participant_id
    from private.shared_snapshot_members as member
    where member.snapshot_id = old.id
      and member.status = 'active'
    on conflict (snapshot_id, user_id) do nothing;
  elsif new.state -> 'events' -> 0 is not null then
    delete from private.shared_snapshot_tombstone_recipients
    where snapshot_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists capture_shared_snapshot_tombstone_recipients
  on public.app_snapshots;
create trigger capture_shared_snapshot_tombstone_recipients
  before update of state on public.app_snapshots
  for each row execute function private.capture_shared_snapshot_tombstone_recipients();

revoke all on function private.capture_shared_snapshot_tombstone_recipients()
  from public, anon, authenticated;

-- Safely recover recipients for tombstones created immediately before this
-- migration. A narrow timestamp window excludes members removed earlier.
insert into private.shared_snapshot_tombstone_recipients (
  snapshot_id,
  user_id,
  participant_id,
  created_at
)
select
  snapshot.id,
  member.user_id,
  member.participant_id,
  coalesce(member.removed_at, snapshot.updated_at)
from public.app_snapshots as snapshot
join private.shared_snapshot_members as member
  on member.snapshot_id = snapshot.id
where snapshot.snapshot_kind = 'shared_event'
  and snapshot.state -> 'events' -> 0 is null
  and pg_catalog.jsonb_array_length(
    coalesce(snapshot.state -> 'deletedEvents', '[]'::jsonb)
  ) > 0
  and member.status = 'removed'
  and member.removed_at between
    snapshot.updated_at - interval '10 seconds'
    and snapshot.updated_at + interval '10 seconds'
on conflict (snapshot_id, user_id) do nothing;

create or replace function public.can_read_deleted_shared_snapshot(p_snapshot_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.shared_snapshot_tombstone_recipients as recipient
      where recipient.snapshot_id = p_snapshot_id
        and recipient.user_id = (select auth.uid())
    );
$$;

revoke all on function public.can_read_deleted_shared_snapshot(text)
  from public, anon, authenticated;
grant execute on function public.can_read_deleted_shared_snapshot(text)
  to authenticated, service_role;

-- Invite redemption and the following event-state write are separate HTTP
-- operations. Keep a freshly redeemed member active briefly so an unrelated
-- concurrent save cannot remove them before their participant reaches JSON.
create or replace function private.sync_shared_snapshot_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  event_exists boolean := new.state -> 'events' -> 0 is not null;
  active_ids text[] := case
    when not event_exists then '{}'::text[]
    else private.active_event_participant_ids(new.state)
  end;
  admin_ids text[] := case
    when not event_exists then '{}'::text[]
    else private.event_admin_ids(new.state)
  end;
begin
  if new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if actor_id is not null
    and actor_participant_id is not null
    and actor_participant_id = any(active_ids) then
    insert into private.shared_snapshot_members (
      snapshot_id, user_id, participant_id, role, status, pending_join_until
    ) values (
      new.id,
      actor_id,
      actor_participant_id,
      case when actor_participant_id = any(admin_ids) then 'admin' else 'member' end,
      'active',
      null
    )
    on conflict (snapshot_id, user_id) do nothing;
  end if;

  insert into private.shared_snapshot_members (
    snapshot_id, user_id, participant_id, role, status, removed_at,
    pending_join_until, updated_at
  )
  select
    new.id,
    account.id,
    active_participant.participant_id,
    case
      when active_participant.participant_id = any(admin_ids) then 'admin'
      else 'member'
    end,
    'active',
    null,
    null,
    pg_catalog.clock_timestamp()
  from pg_catalog.unnest(active_ids) as active_participant(participant_id)
  join auth.users as account
    on account.id = case
      when active_participant.participant_id ~* (
        '^account-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-' ||
        '[0-9a-f]{4}-[0-9a-f]{12}$'
      ) then pg_catalog.substr(active_participant.participant_id, 9)::uuid
      else null
    end
  on conflict (snapshot_id, user_id) do update
  set
    participant_id = excluded.participant_id,
    role = excluded.role,
    status = 'active',
    removed_at = null,
    pending_join_until = null,
    updated_at = excluded.updated_at;

  update private.shared_snapshot_members as member
  set
    status = case
      when member.participant_id = any(active_ids) then 'active'
      when event_exists
        and member.status = 'active'
        and member.pending_join_until > pg_catalog.clock_timestamp() then 'active'
      else 'removed'
    end,
    role = case
      when member.participant_id = any(admin_ids) then 'admin'
      else 'member'
    end,
    removed_at = case
      when member.participant_id = any(active_ids) then null
      when event_exists
        and member.status = 'active'
        and member.pending_join_until > pg_catalog.clock_timestamp() then null
      else coalesce(member.removed_at, pg_catalog.clock_timestamp())
    end,
    pending_join_until = case
      when member.participant_id = any(active_ids) then null
      when not event_exists then null
      when member.pending_join_until <= pg_catalog.clock_timestamp() then null
      else member.pending_join_until
    end,
    updated_at = pg_catalog.clock_timestamp()
  where member.snapshot_id = new.id;

  return new;
end;
$$;

revoke all on function private.sync_shared_snapshot_members()
  from public, anon, authenticated;

-- Shared-event governance is canonical. Mirror role and collaboration changes
-- into every active member's personal event index so a device cannot keep
-- showing stale manager permissions while waiting for its next full refresh.
create or replace function private.sync_shared_event_governance_to_workspaces(
  p_snapshot_id text,
  p_shared_state jsonb,
  p_canonical_updated_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  shared_event jsonb := p_shared_state -> 'events' -> 0;
  shared_event_id text := shared_event ->> 'id';
  canonical_updated_at text := coalesce(
    shared_event ->> 'adminIdsUpdatedAt',
    shared_event ->> 'settingsUpdatedAt',
    p_canonical_updated_at::text
  );
  governance_patch jsonb;
  workspace record;
  previous_subject text := pg_catalog.current_setting(
    'request.jwt.claim.sub',
    true
  );
  synced_count integer := 0;
begin
  if coalesce(p_snapshot_id, '') = ''
    or shared_event is null
    or coalesce(shared_event_id, '') = '' then
    return 0;
  end if;

  governance_patch := pg_catalog.jsonb_build_object(
    'adminIds', pg_catalog.to_jsonb(private.event_admin_ids(p_shared_state)),
    'adminIdsScopedToEvent', true,
    'adminIdsUpdatedAt', canonical_updated_at,
    'adminsCanEditOnly', coalesce(
      (shared_event ->> 'adminsCanEditOnly')::boolean,
      false
    ),
    'settingsUpdatedAt', coalesce(
      shared_event ->> 'settingsUpdatedAt',
      canonical_updated_at
    ),
    'settingsFieldUpdatedAt',
      coalesce(shared_event -> 'settingsFieldUpdatedAt', '{}'::jsonb) ||
      pg_catalog.jsonb_build_object(
        'adminsCanEditOnly',
        coalesce(
          shared_event -> 'settingsFieldUpdatedAt' ->> 'adminsCanEditOnly',
          shared_event ->> 'settingsUpdatedAt',
          canonical_updated_at
        )
      )
  );

  for workspace in
    select distinct personal.id, personal.owner_user_id
    from private.shared_snapshot_members as member
    join public.app_snapshots as personal
      on personal.owner_user_id = member.user_id
     and personal.snapshot_kind = 'workspace'
    where member.snapshot_id = p_snapshot_id
      and member.status = 'active'
      and member.removed_at is null
      and exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(personal.state -> 'events', '[]'::jsonb)
        ) as indexed_event(value)
        where indexed_event.value ->> 'id' = shared_event_id
          and coalesce(
            indexed_event.value ->> 'sharedSpaceId',
            p_snapshot_id
          ) = p_snapshot_id
      )
  loop
    perform pg_catalog.set_config(
      'request.jwt.claim.sub',
      workspace.owner_user_id::text,
      true
    );
    update public.app_snapshots as personal
      set state = pg_catalog.jsonb_set(
            personal.state,
            '{events}',
            (
              select pg_catalog.jsonb_agg(
                case
                  when indexed_event.value ->> 'id' = shared_event_id
                    and coalesce(
                      indexed_event.value ->> 'sharedSpaceId',
                      p_snapshot_id
                    ) = p_snapshot_id
                  then indexed_event.value || governance_patch
                  else indexed_event.value
                end
                order by indexed_event.ordinality
              )
              from pg_catalog.jsonb_array_elements(
                coalesce(personal.state -> 'events', '[]'::jsonb)
              ) with ordinality as indexed_event(value, ordinality)
            ),
            true
          ),
          updated_at = greatest(
            pg_catalog.clock_timestamp(),
            p_canonical_updated_at
          )
    where personal.id = workspace.id;
    synced_count := synced_count + 1;
  end loop;

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(previous_subject, ''),
    true
  );
  return synced_count;
exception
  when others then
    perform pg_catalog.set_config(
      'request.jwt.claim.sub',
      coalesce(previous_subject, ''),
      true
    );
    raise;
end;
$$;

create or replace function private.mirror_shared_event_governance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_event jsonb := old.state -> 'events' -> 0;
  new_event jsonb := new.state -> 'events' -> 0;
begin
  if new.snapshot_kind <> 'shared_event' or new_event is null then
    return new;
  end if;

  if old_event is null
    or old_event -> 'adminIds' is distinct from new_event -> 'adminIds'
    or old_event -> 'adminIdsScopedToEvent' is distinct from
      new_event -> 'adminIdsScopedToEvent'
    or old_event -> 'adminIdsUpdatedAt' is distinct from
      new_event -> 'adminIdsUpdatedAt'
    or old_event -> 'adminsCanEditOnly' is distinct from
      new_event -> 'adminsCanEditOnly' then
    perform private.sync_shared_event_governance_to_workspaces(
      new.id,
      new.state,
      new.updated_at
    );
  end if;
  return new;
end;
$$;

drop trigger if exists zz_mirror_shared_event_governance
  on public.app_snapshots;
create trigger zz_mirror_shared_event_governance
  after update of state on public.app_snapshots
  for each row execute function private.mirror_shared_event_governance();

revoke all on function private.sync_shared_event_governance_to_workspaces(
  text,
  jsonb,
  timestamptz
) from public, anon, authenticated;
revoke all on function private.mirror_shared_event_governance()
  from public, anon, authenticated;

-- Event ids are only unique inside a shared-space namespace.
drop index if exists public.event_invite_tokens_one_open_link_idx;
drop index if exists public.event_invite_tokens_one_private_link_idx;
create unique index event_invite_tokens_one_open_link_idx
  on public.event_invite_tokens (space_id, event_id)
  where kind = 'open' and revoked_at is null;
create unique index event_invite_tokens_one_private_link_idx
  on public.event_invite_tokens (
    space_id, event_id, created_by, recipient_user_id
  )
  where kind = 'private' and revoked_at is null;

create or replace function public.rotate_open_event_invite(
  p_event_id text,
  p_created_by uuid,
  p_token_hash text,
  p_space_id text,
  p_space_key text,
  p_created_at timestamptz default pg_catalog.now()
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invite_id uuid;
begin
  if p_event_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_space_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_space_key !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_created_by is null then
    raise exception 'Invalid open event invitation' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'event-invite:' || p_space_id || ':' || p_event_id,
      0
    )
  );

  update public.event_invite_tokens
  set
    revoked_at = coalesce(revoked_at, p_created_at),
    updated_at = p_created_at
  where space_id = p_space_id
    and event_id = p_event_id
    and kind = 'open'
    and revoked_at is null;

  insert into public.event_invite_tokens (
    event_id, kind, token_hash, space_id, space_key, created_by,
    created_at, updated_at
  ) values (
    p_event_id, 'open', p_token_hash, p_space_id, p_space_key, p_created_by,
    p_created_at, p_created_at
  )
  returning id into invite_id;
  return invite_id;
end;
$$;

create or replace function public.rotate_private_event_invite(
  p_event_id text,
  p_created_by uuid,
  p_recipient_user_id uuid,
  p_token_hash text,
  p_space_id text,
  p_space_key text,
  p_created_at timestamptz,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invite_id uuid;
begin
  if p_event_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_space_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_space_key !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_created_by is null
    or p_recipient_user_id is null
    or p_created_by = p_recipient_user_id
    or p_expires_at <= p_created_at then
    raise exception 'Invalid private event invitation' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'event-private-invite:' || p_space_id || ':' || p_event_id || ':' ||
      p_created_by::text || ':' || p_recipient_user_id::text,
      0
    )
  );

  update public.event_invite_tokens
  set
    revoked_at = coalesce(revoked_at, p_created_at),
    updated_at = p_created_at
  where space_id = p_space_id
    and event_id = p_event_id
    and kind = 'private'
    and created_by = p_created_by
    and recipient_user_id = p_recipient_user_id
    and revoked_at is null;

  insert into public.event_invite_tokens (
    event_id, kind, token_hash, space_id, space_key, created_by,
    recipient_user_id, expires_at, created_at, updated_at
  ) values (
    p_event_id, 'private', p_token_hash, p_space_id, p_space_key, p_created_by,
    p_recipient_user_id, p_expires_at, p_created_at, p_created_at
  )
  returning id into invite_id;
  return invite_id;
end;
$$;

revoke all on function public.rotate_open_event_invite(
  text, uuid, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.rotate_open_event_invite(
  text, uuid, text, text, text, timestamptz
) to service_role;
revoke all on function public.rotate_private_event_invite(
  text, uuid, uuid, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.rotate_private_event_invite(
  text, uuid, uuid, text, text, text, timestamptz, timestamptz
) to service_role;

create or replace function public.redeem_event_invite_membership(
  p_invite_id uuid,
  p_token_hash text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.event_invite_tokens%rowtype;
  snapshot public.app_snapshots%rowtype;
  existing_member private.shared_snapshot_members%rowtype;
  event_record jsonb;
  actor_participant_id text := 'account-' || p_user_id::text;
  creator_participant_id text;
  active_ids text[];
  inactive_ids text[];
  admin_ids text[];
begin
  if p_invite_id is null
    or p_user_id is null
    or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Event invitation is invalid' using errcode = '42501';
  end if;

  select record.* into invite
  from public.event_invite_tokens as record
  where record.id = p_invite_id
  for update;

  if invite.id is null
    or invite.token_hash <> p_token_hash
    or invite.revoked_at is not null
    or (invite.expires_at is not null and invite.expires_at <= pg_catalog.now())
    or (invite.kind = 'private' and invite.recipient_user_id <> p_user_id) then
    raise exception 'Event invitation is no longer active' using errcode = '42501';
  end if;

  select record.* into snapshot
  from public.app_snapshots as record
  where record.id = invite.space_id
    and record.snapshot_kind = 'shared_event'
  for update;

  event_record := snapshot.state -> 'events' -> 0;
  if snapshot.id is null
    or event_record is null
    or event_record ->> 'id' <> invite.event_id
    or coalesce((event_record ->> 'locked')::boolean, false)
    or nullif(event_record ->> 'closedAt', '') is not null then
    raise exception 'Shared event is no longer available' using errcode = '42501';
  end if;

  active_ids := private.active_event_participant_ids(snapshot.state);
  inactive_ids := private.event_text_ids(event_record, 'inactiveParticipantIds');
  admin_ids := private.event_admin_ids(snapshot.state);
  creator_participant_id := 'account-' || invite.created_by::text;

  if not (creator_participant_id = any(active_ids))
    or actor_participant_id = any(inactive_ids)
    or (invite.kind = 'private' and not (actor_participant_id = any(active_ids))) then
    raise exception 'Event invitation is no longer active' using errcode = '42501';
  end if;

  select member.* into existing_member
  from private.shared_snapshot_members as member
  where member.snapshot_id = snapshot.id
    and member.user_id = p_user_id
  for update;

  if existing_member.user_id is not null
    and existing_member.status = 'removed' then
    raise exception 'You are no longer a member of this event' using errcode = '42501';
  end if;

  insert into private.shared_snapshot_members (
    snapshot_id, user_id, participant_id, role, status, pending_join_until
  ) values (
    snapshot.id,
    p_user_id,
    actor_participant_id,
    case when actor_participant_id = any(admin_ids) then 'admin' else 'member' end,
    'active',
    pg_catalog.clock_timestamp() + interval '10 minutes'
  )
  on conflict (snapshot_id, user_id) do update
  set
    participant_id = excluded.participant_id,
    role = excluded.role,
    status = 'active',
    removed_at = null,
    pending_join_until = excluded.pending_join_until,
    updated_at = pg_catalog.clock_timestamp();

  update public.event_invite_tokens
  set
    last_redeemed_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where id = invite.id;

  return pg_catalog.jsonb_build_object(
    'status', 'active',
    'snapshotId', snapshot.id,
    'participantId', actor_participant_id
  );
end;
$$;

revoke all on function public.redeem_event_invite_membership(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.redeem_event_invite_membership(uuid, text, uuid)
  to service_role;

-- Initial offline sync may legitimately contain completed transfers, but one
-- account must never be allowed to claim that another account marked them.
create or replace function private.initial_paid_transfer_attribution_is_valid(
  p_state jsonb,
  p_actor_participant_id text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  with event_record as (
    select coalesce(p_state -> 'events' -> 0, '{}'::jsonb) as value
  )
  select coalesce(p_actor_participant_id, '') <> ''
    and not exists (
      select 1
      from event_record,
        pg_catalog.jsonb_array_elements(
          coalesce(event_record.value -> 'transfers', '[]'::jsonb)
        ) as transfer(value)
      where transfer.value ->> 'status' = 'paid'
        and transfer.value ->> 'markedPaidByParticipantId'
          is distinct from p_actor_participant_id
    )
    and not exists (
      select 1
      from event_record,
        pg_catalog.jsonb_array_elements(
          coalesce(event_record.value -> 'transferStatusUpdates', '[]'::jsonb)
        ) as status_update(value)
      where status_update.value ->> 'status' = 'paid'
        and status_update.value ->> 'markedPaidByParticipantId'
          is distinct from p_actor_participant_id
    );
$$;

create or replace function private.guard_initial_paid_transfer_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.snapshot_kind = 'shared_event'
    and new.owner_user_id is null
    and not private.initial_paid_transfer_attribution_is_valid(
      new.state,
      private.current_actor_participant_id()
    ) then
    raise exception 'Initial payment status attribution is invalid'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_initial_paid_transfer_attribution
  on public.app_snapshots;
create trigger guard_initial_paid_transfer_attribution
  before insert on public.app_snapshots
  for each row execute function private.guard_initial_paid_transfer_attribution();

revoke all on function private.initial_paid_transfer_attribution_is_valid(jsonb, text)
  from public, anon, authenticated;
revoke all on function private.guard_initial_paid_transfer_attribution()
  from public, anon, authenticated;

-- Bound the number of push endpoints an account can fan out to. The newest
-- eight devices win deterministically.
create or replace function public.register_push_device(
  p_token text,
  p_platform text,
  p_preferences jsonb default '{}'::jsonb,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_token text := pg_catalog.btrim(p_token);
  normalized_platform text := pg_catalog.lower(pg_catalog.btrim(p_platform));
  normalized_preferences jsonb := coalesce(p_preferences, '{}'::jsonb);
  device_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if pg_catalog.length(normalized_token) not between 20 and 4096 then
    raise exception 'Invalid push token' using errcode = '22023';
  end if;
  if normalized_platform not in ('android', 'ios') then
    raise exception 'Unsupported push platform' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(normalized_preferences) <> 'object'
    or pg_catalog.pg_column_size(normalized_preferences) > 4096 then
    raise exception 'Invalid push preferences' using errcode = '22023';
  end if;

  insert into public.push_devices (
    user_id, token, platform, enabled, preferences, app_version,
    last_seen_at, updated_at
  ) values (
    actor_id,
    normalized_token,
    normalized_platform,
    true,
    normalized_preferences,
    nullif(pg_catalog.left(pg_catalog.btrim(p_app_version), 32), ''),
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  )
  on conflict (token) do update
  set
    user_id = excluded.user_id,
    platform = excluded.platform,
    enabled = true,
    preferences = excluded.preferences,
    app_version = excluded.app_version,
    last_seen_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  returning id into device_id;

  delete from public.push_devices as device
  where device.user_id = actor_id
    and device.id in (
      select stale.id
      from public.push_devices as stale
      where stale.user_id = actor_id
      order by stale.last_seen_at desc, stale.updated_at desc, stale.id desc
      offset 8
    );

  return device_id;
end;
$$;

revoke all on function public.register_push_device(text, text, jsonb, text)
  from public, anon;
grant execute on function public.register_push_device(text, text, jsonb, text)
  to authenticated, service_role;

-- A distributed fixed-window limiter shared by every Vercel instance. Only
-- SHA-256 subjects are stored; raw IP addresses and bearer tokens never enter
-- the database.
create table if not exists private.api_rate_limit_buckets (
  namespace text not null check (namespace ~ '^[a-z0-9:-]{3,160}$'),
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (namespace, subject_hash, window_started_at)
);

create index if not exists api_rate_limit_buckets_window_idx
  on private.api_rate_limit_buckets (window_started_at);
alter table private.api_rate_limit_buckets enable row level security;
alter table private.api_rate_limit_buckets force row level security;
revoke all on table private.api_rate_limit_buckets
  from public, anon, authenticated;

create or replace function public.reserve_sensitive_api_capacity(
  p_namespace text,
  p_subject_hashes text[],
  p_client_limit integer,
  p_global_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_timestamp_value timestamptz := pg_catalog.clock_timestamp();
  window_start timestamptz;
  retry_after integer;
  global_count integer;
  subject_count integer;
  subject_hash_value text;
  normalized_subjects text[];
  global_hash constant text := '0000000000000000000000000000000000000000000000000000000000000000';
begin
  normalized_subjects := array(
    select distinct pg_catalog.lower(value)
    from pg_catalog.unnest(coalesce(p_subject_hashes, '{}'::text[])) as item(value)
    order by pg_catalog.lower(value)
  );

  if coalesce(p_namespace, '') !~ '^[a-z0-9:-]{3,160}$'
    or p_client_limit not between 1 and 10000
    or p_global_limit not between p_client_limit and 1000000
    or p_window_seconds not between 10 and 3600
    or coalesce(pg_catalog.array_length(normalized_subjects, 1), 0)
      not between 1 and 2
    or exists (
      select 1
      from pg_catalog.unnest(normalized_subjects) as item(value)
      where item.value !~ '^[a-f0-9]{64}$'
    ) then
    raise exception 'Invalid sensitive API capacity request'
      using errcode = '22023';
  end if;

  window_start := pg_catalog.to_timestamp(
    pg_catalog.floor(
      extract(epoch from current_timestamp_value) / p_window_seconds
    ) * p_window_seconds
  );
  retry_after := greatest(
    1,
    pg_catalog.ceil(
      extract(epoch from window_start +
        pg_catalog.make_interval(secs => p_window_seconds) - current_timestamp_value)
    )::integer
  );

  insert into private.api_rate_limit_buckets (
    namespace, subject_hash, window_started_at, request_count, updated_at
  ) values (
    p_namespace, global_hash, window_start, 1, current_timestamp_value
  )
  on conflict (namespace, subject_hash, window_started_at) do update
  set
    request_count = private.api_rate_limit_buckets.request_count + 1,
    updated_at = excluded.updated_at
  returning request_count into global_count;

  if global_count > p_global_limit then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'retryAfterSeconds', retry_after
    );
  end if;

  foreach subject_hash_value in array normalized_subjects loop
    insert into private.api_rate_limit_buckets (
      namespace, subject_hash, window_started_at, request_count, updated_at
    ) values (
      p_namespace, subject_hash_value, window_start, 1, current_timestamp_value
    )
    on conflict (namespace, subject_hash, window_started_at) do update
    set
      request_count = private.api_rate_limit_buckets.request_count + 1,
      updated_at = excluded.updated_at
    returning request_count into subject_count;

    if subject_count > p_client_limit then
      return pg_catalog.jsonb_build_object(
        'allowed', false,
        'retryAfterSeconds', retry_after
      );
    end if;
  end loop;

  delete from private.api_rate_limit_buckets
  where window_started_at < current_timestamp_value - interval '2 days';

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'retryAfterSeconds', 0
  );
end;
$$;

revoke all on function public.reserve_sensitive_api_capacity(
  text, text[], integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.reserve_sensitive_api_capacity(
  text, text[], integer, integer, integer
) to service_role;

-- Feedback is accepted through a bounded RPC. Clients no longer choose the
-- user id and cannot flood the table with direct inserts.
drop policy if exists app_feedback_insert_self on public.app_feedback;
revoke insert on table public.app_feedback from authenticated;

create or replace function public.submit_app_feedback(
  p_category text,
  p_message text,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_category text := pg_catalog.lower(pg_catalog.btrim(p_category));
  normalized_message text := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_message), '\s+', ' ', 'g'
  );
  normalized_context jsonb := coalesce(p_context, '{}'::jsonb);
  feedback_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if normalized_category not in ('bug', 'clarity', 'idea')
    or pg_catalog.char_length(normalized_message) not between 10 and 1200
    or pg_catalog.jsonb_typeof(normalized_context) <> 'object'
    or pg_catalog.octet_length(normalized_context::text) > 4096 then
    raise exception 'Feedback payload is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('app-feedback:' || actor_id::text, 0)
  );
  if (
      select pg_catalog.count(*)
      from public.app_feedback
      where user_id = actor_id
        and created_at >= pg_catalog.clock_timestamp() - interval '1 hour'
    ) >= 3
    or (
      select pg_catalog.count(*)
      from public.app_feedback
      where user_id = actor_id
        and created_at >= pg_catalog.clock_timestamp() - interval '1 day'
    ) >= 20 then
    raise exception 'Too many feedback submissions' using errcode = 'P0001';
  end if;

  insert into public.app_feedback (user_id, category, message, context)
  values (actor_id, normalized_category, normalized_message, normalized_context)
  returning id into feedback_id;
  return feedback_id;
end;
$$;

revoke all on function public.submit_app_feedback(text, text, jsonb)
  from public, anon;
grant execute on function public.submit_app_feedback(text, text, jsonb)
  to authenticated, service_role;

-- Bound friend-code and username probing as well as repeated requests to the
-- same account pair.
create table if not exists private.friend_request_attempts (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index if not exists friend_request_attempts_actor_created_idx
  on private.friend_request_attempts (actor_user_id, created_at desc);
create index if not exists friend_request_attempts_pair_created_idx
  on private.friend_request_attempts (
    actor_user_id, target_user_id, created_at desc
  ) where target_user_id is not null;
alter table private.friend_request_attempts enable row level security;
alter table private.friend_request_attempts force row level security;
revoke all on table private.friend_request_attempts
  from public, anon, authenticated;

create or replace function private.reserve_friend_request_capacity(
  p_actor_user_id uuid,
  p_target_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id is null
    or p_target_user_id = p_actor_user_id then
    raise exception 'Friend request capacity input is invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('friend-request:' || p_actor_user_id::text, 0)
  );
  if (
    select pg_catalog.count(*)
    from private.friend_request_attempts
    where actor_user_id = p_actor_user_id
      and created_at >= pg_catalog.clock_timestamp() - interval '1 day'
  ) >= 120 then
    raise exception 'Too many friend requests' using errcode = 'P0001';
  end if;

  if p_target_user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'friend-request-pair:' || p_actor_user_id::text || ':' ||
        p_target_user_id::text,
        0
      )
    );
    if exists (
      select 1
      from private.friend_request_attempts
      where actor_user_id = p_actor_user_id
        and target_user_id = p_target_user_id
        and created_at >= pg_catalog.clock_timestamp() - interval '1 minute'
    ) or (
      select pg_catalog.count(*)
      from private.friend_request_attempts
      where actor_user_id = p_actor_user_id
        and target_user_id = p_target_user_id
        and created_at >= pg_catalog.clock_timestamp() - interval '1 day'
    ) >= 3 then
      raise exception 'Please wait before sending another friend request'
        using errcode = 'P0001';
    end if;
  end if;

  insert into private.friend_request_attempts (actor_user_id, target_user_id)
  values (p_actor_user_id, p_target_user_id);
  delete from private.friend_request_attempts
  where created_at < pg_catalog.clock_timestamp() - interval '2 days';
end;
$$;

revoke all on function private.reserve_friend_request_capacity(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.request_friendship(
  p_friend_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_id uuid;
  friendship public.friendships%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  perform private.reserve_friend_request_capacity(actor_id, null);

  select invite.user_id into target_id
  from public.friend_invite_codes as invite
  where invite.code = pg_catalog.lower(pg_catalog.btrim(p_friend_code));
  if target_id is null then
    raise exception 'Friend code was not found' using errcode = 'P0001';
  end if;
  if target_id = actor_id then
    raise exception 'You cannot send a friend request to yourself'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.user_blocks as user_block
    where (
      user_block.blocker_user_id = actor_id
      and user_block.blocked_user_id = target_id
    ) or (
      user_block.blocker_user_id = target_id
      and user_block.blocked_user_id = actor_id
    )
  ) then
    raise exception 'Friendship is unavailable for blocked accounts'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'friendship:' || least(actor_id, target_id)::text || ':' ||
      greatest(actor_id, target_id)::text,
      0
    )
  );
  select relation.* into friendship
  from public.friendships as relation
  where relation.user_low = least(actor_id, target_id)
    and relation.user_high = greatest(actor_id, target_id)
  for update;

  if friendship.id is null then
    perform private.reserve_friend_request_capacity(actor_id, target_id);
    insert into public.friendships (requester_id, addressee_id, status)
    values (actor_id, target_id, 'pending')
    returning * into friendship;
  elsif friendship.status = 'accepted' then
    null;
  elsif friendship.status = 'pending'
    and friendship.requester_id = target_id
    and friendship.addressee_id = actor_id then
    update public.friendships
    set
      status = 'accepted',
      responded_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where id = friendship.id
    returning * into friendship;
  elsif friendship.status = 'pending'
    and friendship.requester_id = actor_id then
    null;
  else
    if friendship.status = 'declined'
      and coalesce(friendship.responded_at, friendship.updated_at) >
        pg_catalog.clock_timestamp() - interval '24 hours' then
      raise exception 'Please wait before sending another friend request'
        using errcode = 'P0001';
    end if;
    perform private.reserve_friend_request_capacity(actor_id, target_id);
    update public.friendships
    set
      requester_id = actor_id,
      addressee_id = target_id,
      status = 'pending',
      requested_at = pg_catalog.clock_timestamp(),
      responded_at = null,
      updated_at = pg_catalog.clock_timestamp()
    where id = friendship.id
    returning * into friendship;
  end if;

  return pg_catalog.jsonb_build_object('id', friendship.id, 'status', friendship.status);
end;
$$;

create or replace function public.request_friendship_by_username(
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
  friend_code text;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if normalized_username !~ '^[a-z][a-z0-9_]{2,23}$' then
    raise exception 'Username is invalid' using errcode = '22023';
  end if;

  select invite.code into friend_code
  from public.user_profiles as profile
  join public.friend_invite_codes as invite on invite.user_id = profile.user_id
  where profile.username = normalized_username
    and profile.username_customized = true;
  if friend_code is null then
    perform private.reserve_friend_request_capacity(actor_id, null);
    raise exception 'Username was not found' using errcode = 'P0001';
  end if;
  return public.request_friendship(friend_code);
end;
$$;

revoke all on function public.request_friendship(text) from public, anon;
revoke all on function public.request_friendship_by_username(text) from public, anon;
grant execute on function public.request_friendship(text)
  to authenticated, service_role;
grant execute on function public.request_friendship_by_username(text)
  to authenticated, service_role;

-- Retain only a small audit tail for both open and private links.
create or replace function private.prune_revoked_event_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.event_invite_tokens as invite
  set
    revoked_at = coalesce(invite.revoked_at, pg_catalog.clock_timestamp()),
    updated_at = pg_catalog.clock_timestamp()
  where invite.space_id = new.space_id
    and invite.event_id = new.event_id
    and invite.kind = 'private'
    and invite.revoked_at is null
    and invite.expires_at <= pg_catalog.clock_timestamp();

  if new.kind = 'open' then
    delete from public.event_invite_tokens as invite
    where invite.id in (
      select stale.id
      from public.event_invite_tokens as stale
      where stale.space_id = new.space_id
        and stale.event_id = new.event_id
        and stale.kind = 'open'
        and stale.revoked_at is not null
      order by stale.updated_at desc, stale.id desc
      offset 12
    );
  else
    delete from public.event_invite_tokens as invite
    where invite.id in (
      select stale.id
      from public.event_invite_tokens as stale
      where stale.space_id = new.space_id
        and stale.event_id = new.event_id
        and stale.kind = 'private'
        and stale.created_by = new.created_by
        and stale.recipient_user_id = new.recipient_user_id
        and stale.revoked_at is not null
      order by stale.updated_at desc, stale.id desc
      offset 4
    );

    delete from public.event_invite_tokens as invite
    where invite.id in (
      select stale.id
      from public.event_invite_tokens as stale
      where stale.space_id = new.space_id
        and stale.event_id = new.event_id
        and stale.kind = 'private'
        and stale.revoked_at is not null
      order by stale.updated_at desc, stale.id desc
      offset 200
    );
  end if;
  return new;
end;
$$;

drop trigger if exists prune_revoked_event_invites on public.event_invite_tokens;
create trigger prune_revoked_event_invites
  after insert on public.event_invite_tokens
  for each row execute function private.prune_revoked_event_invites();
revoke all on function private.prune_revoked_event_invites()
  from public, anon, authenticated;

-- Revoking invitations after a member removal must stay inside the same
-- shared-space namespace even if another event happens to reuse the event id.
create or replace function private.revoke_event_invites_after_member_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_active_ids text[];
  new_active_ids text[];
  removed_event_id text;
begin
  if new.snapshot_kind <> 'shared_event'
    or old.state -> 'events' -> 0 is null
    or new.state -> 'events' -> 0 is null then
    return new;
  end if;
  old_active_ids := private.active_event_participant_ids(old.state);
  new_active_ids := private.active_event_participant_ids(new.state);
  if not exists (
    select 1
    from pg_catalog.unnest(old_active_ids) as old_id(value)
    where not (old_id.value = any(new_active_ids))
  ) then
    return new;
  end if;

  removed_event_id := new.state -> 'events' -> 0 ->> 'id';
  update public.event_invite_tokens as invite
  set
    revoked_at = coalesce(revoked_at, pg_catalog.clock_timestamp()),
    updated_at = pg_catalog.clock_timestamp()
  where invite.space_id = new.id
    and invite.event_id = removed_event_id
    and invite.revoked_at is null;
  return new;
end;
$$;

revoke all on function private.revoke_event_invites_after_member_removal()
  from public, anon, authenticated;

-- A direct event invite is valid before the recipient has a canonical member
-- row, but only when the sender is a member, both accounts are friends, and
-- the target account is already represented as active event participant.
create or replace function public.verify_shared_event_invitation_parties(
  p_snapshot_id text,
  p_sender_user_id uuid,
  p_recipient_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_sender_user_id is not null
    and p_recipient_user_id is not null
    and p_sender_user_id <> p_recipient_user_id
    and exists (
      select 1
      from public.app_snapshots as snapshot
      where snapshot.id = p_snapshot_id
        and snapshot.snapshot_kind = 'shared_event'
        and snapshot.state -> 'events' -> 0 is not null
        and exists (
          select 1
          from private.shared_snapshot_members as sender
          where sender.snapshot_id = snapshot.id
            and sender.user_id = p_sender_user_id
            and sender.status = 'active'
        )
        and exists (
          select 1
          from public.friendships as friendship
          where friendship.user_low = least(p_sender_user_id, p_recipient_user_id)
            and friendship.user_high = greatest(p_sender_user_id, p_recipient_user_id)
            and friendship.status = 'accepted'
        )
        and ('account-' || p_recipient_user_id::text) = any(
          private.active_event_participant_ids(snapshot.state)
        )
    );
$$;

revoke all on function public.verify_shared_event_invitation_parties(
  text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.verify_shared_event_invitation_parties(
  text, uuid, uuid
) to service_role;

-- Guarded event-scoped offline-to-account linking (20260826223000).

create or replace function private.authorized_shared_event_account_link(
  p_snapshot_id text,
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  old_event jsonb := coalesce(p_old_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(p_new_state -> 'events' -> 0, '{}'::jsonb);
  link_record jsonb;
  link_count integer := 0;
  source_id text;
  target_id text;
  old_active_ids text[] := private.active_event_participant_ids(p_old_state);
  new_active_ids text[] := private.active_event_participant_ids(p_new_state);
begin
  if coalesce(p_snapshot_id, '') = ''
    or coalesce(p_actor_participant_id, '') = ''
    or coalesce(old_event ->> 'id', '') = ''
    or old_event ->> 'id' is distinct from new_event ->> 'id'
    or pg_catalog.jsonb_typeof(coalesce(new_event -> 'participantAccountLinks', '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(old_event -> 'participantAccountLinks', '[]'::jsonb)) <> 'array' then
    return null;
  end if;

  select count(*), min(candidate.value::text)::jsonb
  into link_count, link_record
  from pg_catalog.jsonb_array_elements(
    coalesce(new_event -> 'participantAccountLinks', '[]'::jsonb)
  ) as candidate(value)
  where candidate.value ->> 'linkedByParticipantId' = p_actor_participant_id
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(old_event -> 'participantAccountLinks', '[]'::jsonb)
      ) as previous(value)
      where previous.value ->> 'sourceParticipantId'
          = candidate.value ->> 'sourceParticipantId'
        and previous.value ->> 'targetParticipantId'
          = candidate.value ->> 'targetParticipantId'
    );
  if link_count <> 1
    or pg_catalog.jsonb_typeof(link_record) <> 'object'
    or link_record - array[
      'sourceParticipantId',
      'targetParticipantId',
      'linkedByParticipantId',
      'linkedAt'
    ] <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(link_record -> 'linkedAt') <> 'string' then
    return null;
  end if;

  source_id := link_record ->> 'sourceParticipantId';
  target_id := link_record ->> 'targetParticipantId';
  perform (link_record ->> 'linkedAt')::timestamptz;
  if coalesce(source_id, '') !~ '^[A-Za-z0-9_-]{1,128}$'
    or coalesce(target_id, '') !~ '^account-[0-9a-fA-F-]{36}$'
    or source_id = target_id
    or not (source_id = any(old_active_ids))
    or not (target_id = any(old_active_ids))
    or source_id = any(new_active_ids)
    or not (target_id = any(new_active_ids))
    or 1 <> (
      select count(*)
      from pg_catalog.unnest(old_active_ids) as old_id(value)
      where not (old_id.value = any(new_active_ids))
    )
    or 0 <> (
      select count(*)
      from pg_catalog.unnest(new_active_ids) as new_id(value)
      where not (new_id.value = any(old_active_ids))
    ) then
    return null;
  end if;

  if not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_old_state -> 'participants') as participant(value)
      where participant.value ->> 'id' = source_id
        and source_id not like 'account-%'
        and not (participant.value @> '{"accountLinked": true}'::jsonb)
    )
    or not private.is_account_linked_shared_participant(p_old_state, target_id)
    or not exists (
      select 1
      from private.shared_snapshot_members as actor_member
      where actor_member.snapshot_id = p_snapshot_id
        and actor_member.participant_id = p_actor_participant_id
        and actor_member.status = 'active'
        and actor_member.role = 'admin'
    )
    or not exists (
      select 1
      from private.shared_snapshot_members as target_member
      where target_member.snapshot_id = p_snapshot_id
        and target_member.participant_id = target_id
        and target_member.status = 'active'
    ) then
    return null;
  end if;

  return link_record;
exception
  when others then
    return null;
end;
$$;

create or replace function private.has_authorized_transfer_status_changes(
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text,
  p_snapshot_id text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  old_event jsonb := coalesce(p_old_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(p_new_state -> 'events' -> 0, '{}'::jsonb);
  old_record jsonb;
  new_record jsonb;
  status_record jsonb;
  transfer_record jsonb;
  changed_at timestamptz;
  account_link jsonb := private.authorized_shared_event_account_link(
    p_snapshot_id,
    p_old_state,
    p_new_state,
    p_actor_participant_id
  );
  link_source text := account_link ->> 'sourceParticipantId';
  link_target text := account_link ->> 'targetParticipantId';
begin
  for new_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
  loop
    old_record := null;
    select item.value into old_record
    from pg_catalog.jsonb_array_elements(
      coalesce(old_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;
    if old_record is not distinct from new_record then
      continue;
    end if;
    if account_link is not null
      and old_record is not null
      and old_record - 'markedPaidByParticipantId'
        = new_record - 'markedPaidByParticipantId'
      and new_record ->> 'markedPaidByParticipantId' is not distinct from (
        case
          when old_record ->> 'markedPaidByParticipantId' = link_source
            then link_target
          else old_record ->> 'markedPaidByParticipantId'
        end
      ) then
      continue;
    end if;

    transfer_record := null;
    select item.value into transfer_record
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;
    if transfer_record is null
      or transfer_record ->> 'status' is distinct from new_record ->> 'status'
      or coalesce(p_actor_participant_id, '') = '' then
      return false;
    end if;

    changed_at := (new_record ->> 'updatedAt')::timestamptz;
    if changed_at < pg_catalog.statement_timestamp() - interval '15 minutes'
      or changed_at > pg_catalog.statement_timestamp() + interval '2 minutes' then
      return false;
    end if;
    if new_record ->> 'status' = 'paid' then
      if new_record ->> 'markedPaidByParticipantId'
        is distinct from p_actor_participant_id then
        return false;
      end if;
    elsif new_record ? 'markedPaidByParticipantId' then
      return false;
    end if;
  end loop;

  for new_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
  loop
    old_record := null;
    select item.value into old_record
    from pg_catalog.jsonb_array_elements(
      coalesce(old_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;

    if old_record is null then
      if coalesce(new_record ->> 'status', '') = 'pending' then
        continue;
      end if;
      return false;
    end if;

    if account_link is not null
      and new_record ->> 'fromParticipantId' is not distinct from (
        case when old_record ->> 'fromParticipantId' = link_source
          then link_target else old_record ->> 'fromParticipantId' end
      )
      and new_record ->> 'toParticipantId' is not distinct from (
        case when old_record ->> 'toParticipantId' = link_source
          then link_target else old_record ->> 'toParticipantId' end
      )
      and new_record ->> 'markedPaidByParticipantId' is not distinct from (
        case when old_record ->> 'markedPaidByParticipantId' = link_source
          then link_target else old_record ->> 'markedPaidByParticipantId' end
      )
      and new_record - array[
        'fromParticipantId',
        'toParticipantId',
        'markedPaidByParticipantId',
        'updatedAt'
      ] = old_record - array[
        'fromParticipantId',
        'toParticipantId',
        'markedPaidByParticipantId',
        'updatedAt'
      ]
      and (
        new_record ->> 'updatedAt' is not distinct from old_record ->> 'updatedAt'
        or new_record ->> 'updatedAt' = account_link ->> 'linkedAt'
      ) then
      continue;
    end if;

    if old_record ->> 'fromParticipantId'
        is distinct from new_record ->> 'fromParticipantId'
      or old_record ->> 'toParticipantId'
        is distinct from new_record ->> 'toParticipantId'
      or old_record -> 'amount' is distinct from new_record -> 'amount' then
      return false;
    end if;

    if old_record ->> 'status' is not distinct from new_record ->> 'status'
      and old_record ->> 'markedPaidByParticipantId'
        is not distinct from new_record ->> 'markedPaidByParticipantId'
      and old_record ->> 'markedPaidAt'
        is not distinct from new_record ->> 'markedPaidAt'
      and old_record ->> 'statusUpdatedAt'
        is not distinct from new_record ->> 'statusUpdatedAt' then
      continue;
    end if;
    status_record := null;
    select item.value into status_record
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = new_record ->> 'id'
    limit 1;

    if status_record is null
      or status_record ->> 'status' is distinct from new_record ->> 'status'
      or (
        new_record ->> 'status' = 'paid'
        and (
          status_record ->> 'markedPaidByParticipantId'
            is distinct from p_actor_participant_id
          or new_record ->> 'markedPaidByParticipantId'
            is distinct from p_actor_participant_id
          or new_record ->> 'markedPaidAt'
            is distinct from status_record ->> 'updatedAt'
          or new_record ->> 'statusUpdatedAt'
            is distinct from status_record ->> 'updatedAt'
        )
      )
      or (
        new_record ->> 'status' = 'pending'
        and new_record ? 'markedPaidByParticipantId'
      ) then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function private.guard_shared_event_financial_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  previous_state jsonb := case when tg_op = 'UPDATE' then old.state else new.state end;
  old_event jsonb := coalesce(previous_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
  old_record jsonb;
  new_record jsonb;
  account_link jsonb := case when tg_op = 'UPDATE' then
    private.authorized_shared_event_account_link(
      new.id,
      previous_state,
      new.state,
      actor_participant_id
    )
  else null end;
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
  end if;
  if not private.is_valid_shared_event_financials(new.state) then
    raise exception 'Shared event financial payload is invalid'
      using errcode = '22023';
  end if;
  if not private.has_valid_shared_event_transfer_totals(new.state) then
    raise exception 'Shared event transfers do not match its expenses'
      using errcode = '22023';
  end if;
  if not private.has_authorized_transfer_status_changes(
    previous_state,
    new.state,
    actor_participant_id,
    new.id
  ) then
    raise exception 'Shared event payment status attribution is invalid'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    for new_record in
      select item.value
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'expenses', '[]'::jsonb)
      ) as item(value)
    loop
      if new_record ->> 'createdByParticipantId'
          is distinct from actor_participant_id
        and private.is_account_linked_shared_participant(
          new.state,
          new_record ->> 'createdByParticipantId'
        ) then
        raise exception 'An account-linked expense must be attributed to the authenticated creator'
          using errcode = '42501';
      end if;
    end loop;
  elsif tg_op = 'UPDATE' then
    for new_record in
      select item.value
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'expenses', '[]'::jsonb)
      ) as item(value)
    loop
      old_record := null;
      select item.value into old_record
      from pg_catalog.jsonb_array_elements(
        coalesce(old_event -> 'expenses', '[]'::jsonb)
      ) as item(value)
      where item.value ->> 'id' = new_record ->> 'id'
      limit 1;
      if old_record is null then
        if coalesce(actor_participant_id, '') = ''
          or new_record ->> 'createdByParticipantId'
            is distinct from actor_participant_id then
          raise exception 'A new expense must be attributed to its authenticated creator'
            using errcode = '42501';
        end if;
      elsif old_record ->> 'createdByParticipantId'
        is distinct from new_record ->> 'createdByParticipantId'
        and not (
          account_link is not null
          and old_record ->> 'createdByParticipantId'
            = account_link ->> 'sourceParticipantId'
          and new_record ->> 'createdByParticipantId'
            = account_link ->> 'targetParticipantId'
        ) then
        raise exception 'Expense creator attribution is immutable'
          using errcode = '42501';
      end if;
    end loop;

    if pg_catalog.to_regclass('private.shared_event_activity_notifications') is not null
      and actor_id is not null
      and private.is_active_shared_event_member(new.id, actor_id)
      and exists (
        select 1
        from private.shared_snapshot_members as other_member
        where other_member.snapshot_id = new.id
          and other_member.status = 'active'
          and other_member.user_id <> actor_id
      ) then
      insert into private.shared_event_activity_notifications (
        snapshot_id,
        event_id,
        actor_user_id,
        activity_kind,
        entity_id
      )
      select
        new.id,
        new_event ->> 'id',
        actor_id,
        'expense_added',
        new_record ->> 'id'
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'expenses', '[]'::jsonb)
      ) as new_record(value)
      where not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(old_event -> 'expenses', '[]'::jsonb)
        ) as old_record(value)
        where old_record.value ->> 'id' = new_record.value ->> 'id'
      )
      on conflict (snapshot_id, activity_kind, entity_id) do nothing;

      insert into private.shared_event_activity_notifications (
        snapshot_id,
        event_id,
        actor_user_id,
        activity_kind,
        entity_id
      )
      select
        new.id,
        new_event ->> 'id',
        actor_id,
        'transfer_paid',
        status_update.value ->> 'id'
      from pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
      ) as status_update(value)
      join pg_catalog.jsonb_array_elements(
        coalesce(new_event -> 'transfers', '[]'::jsonb)
      ) as current_transfer(value)
        on current_transfer.value ->> 'id' = status_update.value ->> 'id'
      join pg_catalog.jsonb_array_elements(
        coalesce(old_event -> 'transfers', '[]'::jsonb)
      ) as previous_transfer(value)
        on previous_transfer.value ->> 'id' = status_update.value ->> 'id'
      where status_update.value ->> 'status' = 'paid'
        and status_update.value ->> 'markedPaidByParticipantId' = actor_participant_id
        and current_transfer.value ->> 'status' = 'paid'
        and previous_transfer.value ->> 'fromParticipantId'
          is not distinct from current_transfer.value ->> 'fromParticipantId'
        and previous_transfer.value ->> 'toParticipantId'
          is not distinct from current_transfer.value ->> 'toParticipantId'
        and previous_transfer.value -> 'amount'
          is not distinct from current_transfer.value -> 'amount'
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(old_event -> 'transferStatusUpdates', '[]'::jsonb)
          ) as old_status(value)
          where old_status.value ->> 'id' = status_update.value ->> 'id'
            and old_status.value ->> 'status' = 'paid'
        )
      on conflict (snapshot_id, activity_kind, entity_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.revoke_event_invites_after_member_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_active_ids text[];
  new_active_ids text[];
  removed_event_id text;
begin
  if new.snapshot_kind <> 'shared_event'
    or old.state -> 'events' -> 0 is null
    or new.state -> 'events' -> 0 is null then
    return new;
  end if;

  old_active_ids := private.active_event_participant_ids(old.state);
  new_active_ids := private.active_event_participant_ids(new.state);
  if not exists (
    select 1
    from pg_catalog.unnest(old_active_ids) as old_id(value)
    where not (old_id.value = any(new_active_ids))
  ) then
    return new;
  end if;

  if private.authorized_shared_event_account_link(
    new.id,
    old.state,
    new.state,
    private.current_actor_participant_id()
  ) is not null then
    return new;
  end if;

  removed_event_id := new.state -> 'events' -> 0 ->> 'id';
  update public.event_invite_tokens as invite
  set
    revoked_at = coalesce(revoked_at, pg_catalog.clock_timestamp()),
    updated_at = pg_catalog.clock_timestamp()
  where invite.event_id = removed_event_id
    and invite.revoked_at is null;
  return new;
end;
$$;

create or replace function private.has_preserved_paid_history_for_account_link(
  p_old_state jsonb,
  p_new_state jsonb,
  p_account_link jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  old_event jsonb := coalesce(p_old_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(p_new_state -> 'events' -> 0, '{}'::jsonb);
  old_record jsonb;
  new_record jsonb;
  link_source text := p_account_link ->> 'sourceParticipantId';
  link_target text := p_account_link ->> 'targetParticipantId';
begin
  if p_account_link is null then
    return false;
  end if;

  for old_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(old_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'status' = 'paid'
  loop
    new_record := null;
    select item.value into new_record
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = old_record ->> 'id'
    limit 1;
    if new_record is null
      or new_record ->> 'fromParticipantId' is distinct from (
        case when old_record ->> 'fromParticipantId' = link_source
          then link_target else old_record ->> 'fromParticipantId' end
      )
      or new_record ->> 'toParticipantId' is distinct from (
        case when old_record ->> 'toParticipantId' = link_source
          then link_target else old_record ->> 'toParticipantId' end
      )
      or new_record ->> 'markedPaidByParticipantId' is distinct from (
        case when old_record ->> 'markedPaidByParticipantId' = link_source
          then link_target else old_record ->> 'markedPaidByParticipantId' end
      )
      or new_record - array[
        'fromParticipantId',
        'toParticipantId',
        'markedPaidByParticipantId',
        'updatedAt'
      ] <> old_record - array[
        'fromParticipantId',
        'toParticipantId',
        'markedPaidByParticipantId',
        'updatedAt'
      ]
      or not (
        new_record ->> 'updatedAt' is not distinct from old_record ->> 'updatedAt'
        or new_record ->> 'updatedAt' = p_account_link ->> 'linkedAt'
      ) then
      return false;
    end if;
  end loop;

  for old_record in
    select item.value
    from pg_catalog.jsonb_array_elements(
      coalesce(old_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'status' = 'paid'
  loop
    new_record := null;
    select item.value into new_record
    from pg_catalog.jsonb_array_elements(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) as item(value)
    where item.value ->> 'id' = old_record ->> 'id'
    limit 1;
    if new_record is null
      or new_record - 'markedPaidByParticipantId'
        <> old_record - 'markedPaidByParticipantId'
      or new_record ->> 'markedPaidByParticipantId' is distinct from (
        case when old_record ->> 'markedPaidByParticipantId' = link_source
          then link_target else old_record ->> 'markedPaidByParticipantId' end
      ) then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function private.guard_shared_event_history_and_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
  account_link jsonb := case when tg_op = 'UPDATE' then
    private.authorized_shared_event_account_link(
      new.id,
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
  else null end;
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) > 500
    or pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) > 500 then
    raise exception 'Shared event transfer history is too large'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and not private.is_safe_shared_event_deletion(
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
    and not private.has_preserved_paid_transfer_history(old.state, new.state)
    and not private.has_preserved_paid_history_for_account_link(
      old.state,
      new.state,
      account_link
    ) then
    raise exception 'Completed payment history cannot be removed or rewritten'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.authorized_shared_event_account_link(text, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function private.has_authorized_transfer_status_changes(jsonb, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function private.is_safe_transfer_status_only_update(text, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_financial_integrity()
  from public, anon, authenticated;
revoke all on function private.revoke_event_invites_after_member_removal()
  from public, anon, authenticated;
revoke all on function private.has_preserved_paid_history_for_account_link(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_history_and_limits()
  from public, anon, authenticated;


-- A payment reversal keeps its audit entries and is authorized independently
-- from ordinary event editing, including centrally managed events.
create or replace function private.guard_shared_event_history_and_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
  account_link jsonb := case when tg_op = 'UPDATE' then
    private.authorized_shared_event_account_link(
      new.id,
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
  else null end;
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) > 500
    or pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) > 500 then
    raise exception 'Shared event transfer history is too large'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and not private.is_safe_shared_event_deletion(
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
    and not private.is_safe_transfer_status_only_update(
      new.id,
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
    and not private.has_preserved_paid_transfer_history(old.state, new.state)
    and not private.has_preserved_paid_history_for_account_link(
      old.state,
      new.state,
      account_link
    ) then
    raise exception 'Completed payment history cannot be removed or rewritten'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_shared_event_history_and_limits()
  from public, anon, authenticated;
-- Operational guard: active shared-event memberships must be visible from
-- their owners' personal workspace indexes.
create or replace function public.admin_shared_event_index_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'activeMembershipsMissingPersonalIndex', pg_catalog.count(*)::integer,
    'checkedAt', pg_catalog.now()
  )
  from private.shared_snapshot_members as member
  join public.app_snapshots as shared
    on shared.id = member.snapshot_id
   and shared.snapshot_kind = 'shared_event'
  join auth.users as account on account.id = member.user_id
  join public.app_snapshots as workspace
    on workspace.id = account.raw_user_meta_data ->> 'account_space_id'
   and workspace.snapshot_kind = 'workspace'
   and workspace.owner_user_id = account.id
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(shared.state -> 'events', '[]'::jsonb)
  ) as shared_event(value)
  where member.status = 'active'
    and coalesce(shared_event.value -> 'participantIds', '[]'::jsonb)
      ? member.participant_id
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(workspace.state -> 'events', '[]'::jsonb)
      ) as personal_event(value)
      where personal_event.value ->> 'id' = shared_event.value ->> 'id'
    );
$$;

revoke all on function public.admin_shared_event_index_health()
  from public, anon, authenticated;
grant execute on function public.admin_shared_event_index_health()
  to service_role;

-- Keep a newly activated shared-event membership visible in the member's
-- personal workspace immediately. Canonical membership remains the authority;
-- the personal event entry is only the device-facing index.
create or replace function public.index_shared_event_for_member(
  p_snapshot_id text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member private.shared_snapshot_members%rowtype;
  shared_state jsonb;
  shared_event jsonb;
  workspace public.app_snapshots%rowtype;
  existing_event jsonb;
  indexed_event jsonb;
  missing_participants jsonb := '[]'::jsonb;
  next_state jsonb;
begin
  select row.* into member
  from private.shared_snapshot_members as row
  where row.snapshot_id = p_snapshot_id
    and row.user_id = p_user_id
    and row.status = 'active'
  for update;

  if member.user_id is null then
    raise exception 'Active shared event membership is required'
      using errcode = '42501';
  end if;

  select snapshot.state into shared_state
  from public.app_snapshots as snapshot
  where snapshot.id = p_snapshot_id
    and snapshot.snapshot_kind = 'shared_event'
    and snapshot.owner_user_id is null
  for update;

  shared_event := shared_state -> 'events' -> 0;
  if shared_event is null
    or not coalesce(shared_event -> 'participantIds', '[]'::jsonb)
      ? member.participant_id then
    raise exception 'Shared event membership payload is invalid'
      using errcode = '22023';
  end if;

  select snapshot.* into workspace
  from public.app_snapshots as snapshot
  left join auth.users as account on account.id = snapshot.owner_user_id
  where snapshot.owner_user_id = p_user_id
    and snapshot.snapshot_kind = 'workspace'
  order by
    case
      when snapshot.id = account.raw_user_meta_data ->> 'account_space_id'
      then 0 else 1
    end,
    snapshot.updated_at desc
  limit 1
  for update of snapshot;

  if workspace.id is null then
    raise exception 'Account workspace is unavailable'
      using errcode = 'P0002';
  end if;

  select event.value into existing_event
  from pg_catalog.jsonb_array_elements(
    coalesce(workspace.state -> 'events', '[]'::jsonb)
  ) as event(value)
  where event.value ->> 'id' = shared_event ->> 'id'
  limit 1;

  if existing_event is not null then
    if coalesce(existing_event ->> 'sharedSpaceId', p_snapshot_id)
      <> p_snapshot_id then
      raise exception 'Event identifier belongs to another shared snapshot'
        using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'existing',
      'snapshotId', p_snapshot_id,
      'workspaceId', workspace.id
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(candidate.value), '[]'::jsonb)
  into missing_participants
  from pg_catalog.jsonb_array_elements(
    coalesce(shared_state -> 'participants', '[]'::jsonb)
  ) as candidate(value)
  where not exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      coalesce(workspace.state -> 'participants', '[]'::jsonb)
    ) as current_participant(value)
    where current_participant.value ->> 'id' = candidate.value ->> 'id'
  );

  indexed_event := shared_event || pg_catalog.jsonb_build_object(
    'sharedSpaceId', p_snapshot_id,
    'sharedSpaceKey', 'member_access_recovery_v1_key_0001'
  );
  next_state := pg_catalog.jsonb_set(
    workspace.state,
    '{participants}',
    coalesce(workspace.state -> 'participants', '[]'::jsonb)
      || missing_participants,
    true
  );
  next_state := pg_catalog.jsonb_set(
    next_state,
    '{events}',
    pg_catalog.jsonb_build_array(indexed_event)
      || coalesce(workspace.state -> 'events', '[]'::jsonb),
    true
  );

  -- Workspace update guards intentionally require the exact owner subject.
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    p_user_id::text,
    true
  );
  update public.app_snapshots
  set state = next_state,
      updated_at = pg_catalog.now()
  where id = workspace.id;

  return pg_catalog.jsonb_build_object(
    'status', 'indexed',
    'snapshotId', p_snapshot_id,
    'workspaceId', workspace.id,
    'eventId', shared_event ->> 'id'
  );
end;
$$;

revoke all on function public.index_shared_event_for_member(text, uuid)
  from public, anon, authenticated;
grant execute on function public.index_shared_event_for_member(text, uuid)
  to service_role;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- Rebuild the device-facing event index from every active canonical
-- membership in one workspace update. Doing this in one write is important:
-- the personal-workspace guard correctly rejects an intermediate state that
-- still omits a different active event for the same account.
create or replace function public.reconcile_shared_event_indexes_for_member(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.app_snapshots%rowtype;
  canonical_events jsonb := '[]'::jsonb;
  canonical_event_ids text[] := '{}'::text[];
  missing_participants jsonb := '[]'::jsonb;
  retained_events jsonb := '[]'::jsonb;
  next_state jsonb;
begin
  select snapshot.* into workspace
  from public.app_snapshots as snapshot
  left join auth.users as account on account.id = snapshot.owner_user_id
  where snapshot.owner_user_id = p_user_id
    and snapshot.snapshot_kind = 'workspace'
  order by
    case
      when snapshot.id = account.raw_user_meta_data ->> 'account_space_id'
      then 0 else 1
    end,
    snapshot.updated_at desc
  limit 1
  for update of snapshot;

  if workspace.id is null then
    raise exception 'Account workspace is unavailable'
      using errcode = 'P0002';
  end if;

  select
    coalesce(
      pg_catalog.jsonb_agg(
        canonical.event_value || pg_catalog.jsonb_build_object(
          'sharedSpaceId', canonical.snapshot_id,
          'sharedSpaceKey', coalesce(
            (
              select personal_event.value ->> 'sharedSpaceKey'
              from pg_catalog.jsonb_array_elements(
                coalesce(workspace.state -> 'events', '[]'::jsonb)
              ) as personal_event(value)
              where personal_event.value ->> 'id' = canonical.event_id
                and personal_event.value ->> 'sharedSpaceId' =
                  canonical.snapshot_id
                and char_length(
                  coalesce(personal_event.value ->> 'sharedSpaceKey', '')
                ) between 24 and 256
              limit 1
            ),
            'member_access_recovery_v1_key_0001'
          )
        )
        order by canonical.shared_updated_at desc, canonical.event_id
      ),
      '[]'::jsonb
    ),
    coalesce(
      pg_catalog.array_agg(
        canonical.event_id order by canonical.shared_updated_at desc,
        canonical.event_id
      ),
      '{}'::text[]
    )
  into canonical_events, canonical_event_ids
  from (
    select distinct on (shared_event.value ->> 'id')
      shared.id as snapshot_id,
      shared.updated_at as shared_updated_at,
      shared_event.value ->> 'id' as event_id,
      shared_event.value as event_value
    from private.shared_snapshot_members as member
    join public.app_snapshots as shared
      on shared.id = member.snapshot_id
     and shared.snapshot_kind = 'shared_event'
     and shared.owner_user_id is null
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(shared.state -> 'events', '[]'::jsonb)
    ) as shared_event(value)
    where member.user_id = p_user_id
      and member.status = 'active'
      and member.removed_at is null
      and coalesce(shared_event.value -> 'participantIds', '[]'::jsonb)
        ? member.participant_id
      and not coalesce(
        shared_event.value -> 'inactiveParticipantIds',
        '[]'::jsonb
      ) ? member.participant_id
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(workspace.state -> 'events', '[]'::jsonb)
        ) as personal_event(value)
        where personal_event.value ->> 'id' = shared_event.value ->> 'id'
          and coalesce(
            personal_event.value -> 'participantIds',
            '[]'::jsonb
          ) ? member.participant_id
          and not coalesce(
            personal_event.value -> 'inactiveParticipantIds',
            '[]'::jsonb
          ) ? member.participant_id
      )
    order by
      shared_event.value ->> 'id',
      shared.updated_at desc,
      shared.id
  ) as canonical;

  if pg_catalog.cardinality(canonical_event_ids) = 0 then
    return pg_catalog.jsonb_build_object(
      'status', 'unchanged',
      'workspaceId', workspace.id,
      'eventCount', 0
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(candidate.value), '[]'::jsonb)
  into missing_participants
  from (
    select distinct on (participant.value ->> 'id') participant.value
    from private.shared_snapshot_members as member
    join public.app_snapshots as shared
      on shared.id = member.snapshot_id
     and shared.snapshot_kind = 'shared_event'
     and shared.owner_user_id is null
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(shared.state -> 'events', '[]'::jsonb)
    ) as shared_event(value)
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(shared.state -> 'participants', '[]'::jsonb)
    ) as participant(value)
    where member.user_id = p_user_id
      and member.status = 'active'
      and member.removed_at is null
      and coalesce(shared_event.value -> 'participantIds', '[]'::jsonb)
        ? member.participant_id
      and not coalesce(
        shared_event.value -> 'inactiveParticipantIds',
        '[]'::jsonb
      ) ? member.participant_id
      and shared_event.value ->> 'id' = any(canonical_event_ids)
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(workspace.state -> 'participants', '[]'::jsonb)
        ) as current_participant(value)
        where current_participant.value ->> 'id' = participant.value ->> 'id'
      )
    order by participant.value ->> 'id'
  ) as candidate;

  select coalesce(
    pg_catalog.jsonb_agg(personal_event.value order by personal_event.ordinality),
    '[]'::jsonb
  )
  into retained_events
  from pg_catalog.jsonb_array_elements(
    coalesce(workspace.state -> 'events', '[]'::jsonb)
  ) with ordinality as personal_event(value, ordinality)
  where not (
    personal_event.value ->> 'id' = any(canonical_event_ids)
  );

  next_state := pg_catalog.jsonb_set(
    workspace.state,
    '{participants}',
    coalesce(workspace.state -> 'participants', '[]'::jsonb)
      || missing_participants,
    true
  );
  next_state := pg_catalog.jsonb_set(
    next_state,
    '{events}',
    canonical_events || retained_events,
    true
  );

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    p_user_id::text,
    true
  );
  update public.app_snapshots
  set state = next_state,
      updated_at = pg_catalog.clock_timestamp()
  where id = workspace.id;

  return pg_catalog.jsonb_build_object(
    'status', 'reconciled',
    'workspaceId', workspace.id,
    'eventCount', pg_catalog.cardinality(canonical_event_ids)
  );
end;
$$;

revoke all on function public.reconcile_shared_event_indexes_for_member(uuid)
  from public, anon, authenticated;
grant execute on function public.reconcile_shared_event_indexes_for_member(uuid)
  to service_role;

create or replace function private.reconcile_shared_snapshot_member_workspaces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_actor_id uuid := auth.uid();
  active_member record;
begin
  if new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  for active_member in
    select distinct member.user_id
    from private.shared_snapshot_members as member
    where member.snapshot_id = new.id
      and member.status = 'active'
      and member.removed_at is null
      and (
        original_actor_id is null
        or member.user_id <> original_actor_id
      )
    order by member.user_id
  loop
    perform public.reconcile_shared_event_indexes_for_member(
      active_member.user_id
    );
  end loop;

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(original_actor_id::text, ''),
    true
  );
  return new;
exception when others then
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(original_actor_id::text, ''),
    true
  );
  raise;
end;
$$;

drop trigger if exists zz_reconcile_shared_snapshot_member_workspaces
  on public.app_snapshots;
create trigger zz_reconcile_shared_snapshot_member_workspaces
  after insert or update of state on public.app_snapshots
  for each row
  execute function private.reconcile_shared_snapshot_member_workspaces();

revoke all on function private.reconcile_shared_snapshot_member_workspaces()
  from public, anon, authenticated;
