-- Run AFTER the migration and BEFORE COMMIT in the same transaction.
-- Read-only checks: no account data is returned or repaired automatically.
do $$
declare
  invalid_snapshot_count bigint;
  guard_name text;
begin
  if not exists (
    select 1 from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'private' and proc.proname = 'can_update_transfer_payment'
  ) then
    raise exception 'Payment-party guard is not installed';
  end if;
  foreach guard_name in array array[
    'guard_shared_event_financial_integrity',
    'guard_shared_event_notes',
    'guard_shared_snapshot_update',
    'aa_normalize_shared_note_field_clocks',
    'ab_normalize_repeated_shared_note_deletions'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid = 'public.app_snapshots'::regclass
        and tgname = guard_name and tgenabled in ('O','A')
    ) then
      raise exception 'Required integrity trigger is not active: %', guard_name;
    end if;
  end loop;
  if pg_catalog.has_function_privilege(
      'authenticated', 'private.can_update_transfer_payment(jsonb,text,text)', 'execute'
    ) or pg_catalog.has_function_privilege(
      'anon', 'public.update_shared_event_snapshot(text,text,timestamptz,jsonb)', 'execute'
    ) or not pg_catalog.has_function_privilege(
      'authenticated', 'public.update_shared_event_snapshot(text,text,timestamptz,jsonb)', 'execute'
    ) then
    raise exception 'Integrity function privileges are not as expected';
  end if;

  -- A stricter validator must not silently strand previously committed notes.
  -- Abort the rollout for an explicit data-repair decision; do not erase notes,
  -- invent authors/timestamps, or grant a bypass to invalid historical data.
  select count(*) into invalid_snapshot_count
  from public.app_snapshots
  where snapshot_kind = 'shared_event'
    and not private.has_valid_shared_event_notes(state);
  if invalid_snapshot_count > 0 then
    raise exception 'Rollout blocked: % shared snapshots need note-data review', invalid_snapshot_count;
  end if;
end;
$$;

select 'ready'::text as verification_status;
