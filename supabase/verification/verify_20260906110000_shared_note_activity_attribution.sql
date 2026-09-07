-- Run AFTER both 20260906 migrations and BEFORE COMMIT in the same transaction.
-- Read-only checks; no user content is exported or automatically rewritten.
do $$
declare
  guard_name text;
  signature text;
  invalid_snapshot_count bigint;
begin
  foreach guard_name in array array[
    'guard_shared_activity_attribution', 'guard_shared_event_notes',
    'guard_closed_shared_event_integrity', 'guard_shared_snapshot_update',
    'ab_normalize_repeated_shared_note_deletions'
  ] loop
    if not exists (select 1 from pg_catalog.pg_trigger
      where tgrelid = 'public.app_snapshots'::regclass and tgname = guard_name
        and tgenabled in ('O','A')) then
      raise exception 'Required attribution trigger is not active: %', guard_name;
    end if;
  end loop;
  foreach signature in array array[
    'private.authorized_shared_attribution_remap(text,jsonb,jsonb,text)',
    'private.is_safe_shared_event_notes_update(jsonb,jsonb,text,text)',
    'private.has_authorized_shared_activity(jsonb,jsonb,text,text,boolean)',
    'private.remap_shared_note_attribution(jsonb,jsonb)',
    'private.shared_activity_browser_time(text)'
  ] loop
    if pg_catalog.to_regprocedure(signature) is null
      or pg_catalog.has_function_privilege('authenticated', signature, 'execute')
      or pg_catalog.has_function_privilege('anon', signature, 'execute') then
      raise exception 'Attribution helper is absent or exposed: %', signature;
    end if;
  end loop;
  select count(*) into invalid_snapshot_count from public.app_snapshots
  where snapshot_kind = 'shared_event' and (
    not private.has_valid_shared_event_notes(state)
    or not private.has_valid_shared_activity_shape(coalesce(state #> '{events,0,activityLog}', '[]'::jsonb))
  );
  if invalid_snapshot_count > 0 then
    raise exception 'Rollout blocked: % shared snapshots need historical note/activity review', invalid_snapshot_count;
  end if;
end;
$$;

select 'ready'::text as verification_status;
