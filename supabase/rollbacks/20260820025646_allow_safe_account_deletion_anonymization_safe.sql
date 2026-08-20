begin;

create or replace function private.guard_personal_snapshot_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  expected_participant_id text;
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

commit;
