begin;

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
  current_time timestamptz := pg_catalog.clock_timestamp();
  window_start timestamptz;
  retry_after integer;
  global_count integer;
  subject_count integer;
  subject_hash text;
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
      extract(epoch from current_time) / p_window_seconds
    ) * p_window_seconds
  );
  retry_after := greatest(
    1,
    pg_catalog.ceil(
      extract(epoch from window_start +
        pg_catalog.make_interval(secs => p_window_seconds) - current_time)
    )::integer
  );

  insert into private.api_rate_limit_buckets (
    namespace, subject_hash, window_started_at, request_count, updated_at
  ) values (
    p_namespace, global_hash, window_start, 1, current_time
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

  foreach subject_hash in array normalized_subjects loop
    insert into private.api_rate_limit_buckets (
      namespace, subject_hash, window_started_at, request_count, updated_at
    ) values (
      p_namespace, subject_hash, window_start, 1, current_time
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
  where window_started_at < current_time - interval '2 days';

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

  perform private.reserve_friend_request_capacity(actor_id, target_id);
  if friendship.status = 'declined'
    and coalesce(friendship.responded_at, friendship.updated_at) >
      pg_catalog.clock_timestamp() - interval '24 hours' then
    raise exception 'Please wait before sending another friend request'
      using errcode = 'P0001';
  end if;

  if friendship.id is null then
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
  elsif friendship.status <> 'pending'
    or friendship.requester_id <> actor_id then
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
  perform private.reserve_friend_request_capacity(actor_id, null);

  select invite.code into friend_code
  from public.user_profiles as profile
  join public.friend_invite_codes as invite on invite.user_id = profile.user_id
  where profile.username = normalized_username
    and profile.username_customized = true;
  if friend_code is null then
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

commit;
