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
immutable
set search_path = ''
as $$
declare
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
    ) or added_id !~ '^guest-[A-Za-z0-9_-]{1,120}$'
      or not exists (
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
  end loop;

  return true;
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

  if coalesce((old_event ->> 'adminsCanEditOnly')::boolean, false)
    and not actor_is_admin
    and not actor_is_leaving
    and not actor_is_joining
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
  active_ids text[];
  inactive_ids text[];
  admin_ids text[];
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

  if snapshot.id is null
    or snapshot.snapshot_kind <> 'shared_event'
    or snapshot.access_key_hash is distinct from public.request_space_key_hash() then
    raise exception 'Shared event invitation is invalid'
      using errcode = '42501';
  end if;

  if snapshot.state -> 'events' -> 0 is null then
    raise exception 'Shared event is no longer available'
      using errcode = '42501';
  end if;

  active_ids := private.active_event_participant_ids(snapshot.state);
  inactive_ids := private.event_text_ids(
    snapshot.state -> 'events' -> 0,
    'inactiveParticipantIds'
  );
  admin_ids := private.event_admin_ids(snapshot.state);

  select member.*
  into existing_member
  from private.shared_snapshot_members as member
  where member.snapshot_id = snapshot.id
    and member.user_id = actor_id
  for update;

  if existing_member.user_id is not null
    and existing_member.status = 'removed'
    and not (actor_participant_id = any(active_ids)) then
    raise exception 'You are no longer a member of this event'
      using errcode = '42501';
  end if;

  if actor_participant_id = any(inactive_ids) then
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

  return pg_catalog.jsonb_build_object(
    'status', 'active',
    'snapshotId', snapshot.id,
    'participantId', actor_participant_id
  );
end;
$$;

drop trigger if exists guard_shared_snapshot_update on public.app_snapshots;
create trigger guard_shared_snapshot_update
  before update on public.app_snapshots
  for each row execute function private.guard_shared_snapshot_update();

drop trigger if exists classify_snapshot_kind on public.app_snapshots;
create trigger classify_snapshot_kind
  before insert on public.app_snapshots
  for each row execute function private.classify_snapshot_kind();

drop trigger if exists sync_shared_snapshot_members on public.app_snapshots;
create trigger sync_shared_snapshot_members
  after update on public.app_snapshots
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
revoke all on function private.active_event_participant_ids(jsonb) from public, anon, authenticated;
revoke all on function private.event_admin_ids(jsonb) from public, anon, authenticated;
revoke all on function private.current_actor_participant_id() from public, anon, authenticated;
revoke all on function private.is_safe_account_deletion_anonymization(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.guard_shared_snapshot_update() from public, anon, authenticated;
revoke all on function private.sync_shared_snapshot_members() from public, anon, authenticated;
revoke all on function private.register_shared_snapshot_creator() from public, anon, authenticated;
revoke all on function public.can_write_shared_snapshot(text) from public, anon;
grant execute on function public.can_write_shared_snapshot(text) to authenticated;
revoke all on function public.can_bootstrap_shared_snapshot(text) from public, anon;
grant execute on function public.can_bootstrap_shared_snapshot(text) to authenticated;

revoke all on function public.join_shared_event(text) from public, anon;
grant execute on function public.join_shared_event(text) to authenticated;
grant execute on function public.join_shared_event(text) to service_role;

drop policy if exists app_snapshots_select on public.app_snapshots;
create policy app_snapshots_select
  on public.app_snapshots
  for select
  to anon, authenticated
  using (access_key_hash = (select public.request_space_key_hash()));

drop policy if exists app_snapshots_insert on public.app_snapshots;
create policy app_snapshots_insert
  on public.app_snapshots
  for insert
  to authenticated
  with check (
    access_key_hash = (select public.request_space_key_hash())
    and (owner_user_id is null or owner_user_id = (select auth.uid()))
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
begin
  profile_name := coalesce(
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(pg_catalog.split_part(new.email, '@', 1), ''),
    'משתמש חדש'
  );

  insert into public.user_profiles (
    user_id,
    username,
    username_customized,
    display_name
  )
  values (
    new.id,
    private.default_friend_username(new.id, new.email),
    false,
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
  actor_participant_id text;
  target_participant_id text;
  friend_code text;
  shares_active_event boolean := false;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_target_user_id is null or p_target_user_id = actor_id then
    raise exception 'Friend account is invalid'
      using errcode = '22023';
  end if;

  if p_shared_space_id is null
    or pg_catalog.btrim(p_shared_space_id) !~ '^[a-zA-Z0-9_-]{3,80}$'
    or pg_catalog.btrim(p_shared_space_id) = 'default' then
    raise exception 'Shared event is invalid'
      using errcode = '22023';
  end if;

  actor_participant_id := 'account-' || actor_id::text;
  target_participant_id := 'account-' || p_target_user_id::text;

  select exists (
    select 1
    from public.app_snapshots as snapshot
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(snapshot.state -> 'events', '[]'::jsonb)
    ) as event_record(value)
    where snapshot.id = pg_catalog.btrim(p_shared_space_id)
      and snapshot.owner_user_id is null
      and coalesce(event_record.value -> 'participantIds', '[]'::jsonb)
        ? actor_participant_id
      and coalesce(event_record.value -> 'participantIds', '[]'::jsonb)
        ? target_participant_id
      and not (
        coalesce(event_record.value -> 'inactiveParticipantIds', '[]'::jsonb)
          ? actor_participant_id
      )
      and not (
        coalesce(event_record.value -> 'inactiveParticipantIds', '[]'::jsonb)
          ? target_participant_id
      )
  ) into shares_active_event;

  if not shares_active_event then
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

  update public.user_profiles
  set
    username = normalized_username,
    username_customized = true,
    updated_at = pg_catalog.now()
  where user_id = actor_id;

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
  actor_participant_id text;
  target_participant_id text;
  shares_active_event boolean := false;
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

  actor_participant_id := 'account-' || actor_id::text;
  target_participant_id := 'account-' || p_target_user_id::text;

  select exists (
    select 1
    from public.app_snapshots as snapshot
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(snapshot.state -> 'events', '[]'::jsonb)
    ) as event_record(value)
    where snapshot.id = normalized_space_id
      and snapshot.owner_user_id is null
      and coalesce(event_record.value -> 'participantIds', '[]'::jsonb)
        ? actor_participant_id
      and coalesce(event_record.value -> 'participantIds', '[]'::jsonb)
        ? target_participant_id
      and not (
        coalesce(event_record.value -> 'inactiveParticipantIds', '[]'::jsonb)
          ? actor_participant_id
      )
      and not (
        coalesce(event_record.value -> 'inactiveParticipantIds', '[]'::jsonb)
          ? target_participant_id
      )
  ) into shares_active_event;

  if not shares_active_event then
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

create table if not exists public.event_activity_notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id text not null
    check (event_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  activity_id text not null
    check (activity_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  kind text not null
    constraint event_activity_notifications_kind_check
    check (kind in ('expense-created', 'participant-joined', 'event-invite')),
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
  check (kind in ('expense-created', 'participant-joined', 'event-invite'));

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
      'event-invite'
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
      event_name = 'operation_failure'
      and detail in (
        'auth',
        'state_load',
        'state_save',
        'event_invite',
        'friend_network',
        'notification_inbox',
        'feedback',
        'push',
        'ads',
        'share'
      )
    )
    or (event_name not in ('event_created', 'client_error', 'operation_failure') and detail = '')
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
      event_name = 'operation_failure'
      and detail in (
        'auth',
        'state_load',
        'state_save',
        'event_invite',
        'friend_network',
        'notification_inbox',
        'feedback',
        'push',
        'ads',
        'share'
      )
    )
    or (event_name not in ('event_created', 'client_error', 'operation_failure') and detail = '')
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
  participant_id text;
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

  if normalized_event_id = ''
    or pg_catalog.length(normalized_event_id) > 160 then
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

  participant_id := 'account-' || actor_id::text;

  select exists (
    select 1
    from public.app_snapshots as snapshot
    cross join lateral pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(snapshot.state -> 'events') = 'array'
          then snapshot.state -> 'events'
        else '[]'::jsonb
      end
    ) as event_record
    where snapshot.owner_user_id = actor_id
      and event_record ->> 'id' = normalized_event_id
      and pg_catalog.jsonb_typeof(event_record -> 'participantIds') = 'array'
      and pg_catalog.jsonb_array_length(event_record -> 'participantIds') >= 2
      and (
        exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(event_record -> 'expenses') = 'array'
                then event_record -> 'expenses'
              else '[]'::jsonb
            end
          ) as expense_record
          where expense_record ->> 'createdByParticipantId' = participant_id
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(event_record -> 'transfers') = 'array'
                then event_record -> 'transfers'
              else '[]'::jsonb
            end
          ) as transfer_record
          where transfer_record ->> 'status' = 'paid'
            and transfer_record ->> 'markedPaidByParticipantId' = participant_id
        )
      )
  )
  into activity_found;

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
