begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if pg_catalog.to_regclass('public.app_snapshots') is null then
    raise exception 'public.app_snapshots must exist before applying this migration';
  end if;
end;
$$;

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
  old_admin_ids text[] := private.event_admin_ids(old.state);
  new_admin_ids text[] := private.event_admin_ids(new.state);
  actor_is_admin boolean;
  actor_is_joining boolean;
  actor_is_leaving boolean;
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

  if (
    old_active_ids is distinct from new_active_ids
    or old_admin_ids is distinct from new_admin_ids
  ) and not actor_is_admin and not actor_is_leaving and not actor_is_joining then
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

revoke all on function private.event_text_ids(jsonb, text) from public, anon, authenticated;
revoke all on function private.is_shared_event_state(jsonb) from public, anon, authenticated;
revoke all on function private.classify_snapshot_kind() from public, anon, authenticated;
revoke all on function private.active_event_participant_ids(jsonb) from public, anon, authenticated;
revoke all on function private.event_admin_ids(jsonb) from public, anon, authenticated;
revoke all on function private.current_actor_participant_id() from public, anon, authenticated;
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

commit;
