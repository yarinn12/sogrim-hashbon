-- A stale or partially hydrated device must not erase an event that the
-- account still actively belongs to. Legitimate leave/delete flows update the
-- shared membership first, so their following personal-workspace save remains
-- allowed.
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

revoke all on function private.guard_personal_snapshot_write()
  from public, anon, authenticated;
