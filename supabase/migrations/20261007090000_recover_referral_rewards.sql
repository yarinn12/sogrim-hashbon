begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Keep referral activity beside the committed canonical financial write. The
-- later financial guard definition emits notifications, so this dedicated
-- trigger must remain independent of that guard's implementation.
create or replace function private.record_shared_event_referral_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  old_event jsonb := coalesce(old.state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
begin
  if old.snapshot_kind <> 'shared_event'
    or new.snapshot_kind <> 'shared_event'
    or new.owner_user_id is not null
    or actor_id is null
    or not private.is_active_shared_event_member(new.id, actor_id)
    or not exists (
      select 1 from private.shared_snapshot_members as other_member
      where other_member.snapshot_id = new.id
        and other_member.status = 'active'
        and other_member.user_id <> actor_id
    ) then
    return new;
  end if;

  insert into private.shared_event_qualification_activity (
    snapshot_id, event_id, actor_user_id, activity_kind, entity_id
  )
  select new.id, new_event ->> 'id', actor_id, 'expense_created', expense.value ->> 'id'
  from pg_catalog.jsonb_array_elements(coalesce(new_event -> 'expenses', '[]'::jsonb)) as expense(value)
  where expense.value ->> 'createdByParticipantId' = actor_participant_id
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(coalesce(old_event -> 'expenses', '[]'::jsonb)) as old_expense(value)
      where old_expense.value ->> 'id' = expense.value ->> 'id'
    )
  on conflict (snapshot_id, activity_kind, entity_id) do nothing;

  insert into private.shared_event_qualification_activity (
    snapshot_id, event_id, actor_user_id, activity_kind, entity_id
  )
  select new.id, new_event ->> 'id', actor_id, 'transfer_paid', status_update.value ->> 'id'
  from pg_catalog.jsonb_array_elements(coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)) as status_update(value)
  join pg_catalog.jsonb_array_elements(coalesce(new_event -> 'transfers', '[]'::jsonb)) as current_transfer(value)
    on current_transfer.value ->> 'id' = status_update.value ->> 'id'
  join pg_catalog.jsonb_array_elements(coalesce(old_event -> 'transfers', '[]'::jsonb)) as previous_transfer(value)
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
      from pg_catalog.jsonb_array_elements(coalesce(old_event -> 'transferStatusUpdates', '[]'::jsonb)) as old_status(value)
      where old_status.value ->> 'id' = status_update.value ->> 'id'
        and old_status.value ->> 'status' = 'paid'
    )
  on conflict (snapshot_id, activity_kind, entity_id) do nothing;

  return new;
end;
$$;

revoke all on function private.record_shared_event_referral_activity()
  from public, anon, authenticated;
drop trigger if exists record_shared_event_referral_activity on public.app_snapshots;
create trigger record_shared_event_referral_activity
after update of state on public.app_snapshots
for each row execute function private.record_shared_event_referral_activity();

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
  qualifying_snapshot_id text;
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  -- A confirmed invitee may resume on another device, which has no local
  -- qualification queue. Settle from the server's committed activity ledger.
  select activity.snapshot_id
  into qualifying_snapshot_id
  from public.referrals as referral
  join auth.users as account on account.id = referral.invited_user_id
  join private.shared_event_qualification_activity as activity
    on activity.actor_user_id = referral.invited_user_id
    and activity.recorded_at >= referral.claimed_at
    and activity.recorded_at <= referral.claimed_at + interval '30 days'
  where referral.invited_user_id = actor_id
    and referral.status in ('pending', 'qualified')
    and account.email_confirmed_at is not null
  order by activity.recorded_at, activity.snapshot_id
  limit 1;

  if qualifying_snapshot_id is not null then
    perform public.qualify_referral(qualifying_snapshot_id);
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

commit;
