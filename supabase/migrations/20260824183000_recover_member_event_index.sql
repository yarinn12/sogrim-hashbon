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

revoke all on function public.update_shared_event_snapshot(text, text, timestamptz, jsonb)
  from public, anon;
grant execute on function public.update_shared_event_snapshot(text, text, timestamptz, jsonb)
  to authenticated, service_role;
