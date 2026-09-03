do $$
declare
  old_state jsonb := '{
    "participants":[{"id":"owner"},{"id":"member"}],
    "events":[{
      "id":"event-note-probe","participantIds":["owner","member"],
      "adminIds":["owner"],"adminsCanEditOnly":false,"notes":[],
      "deletedNotes":[{"id":"gone","deletedAt":"2026-09-03T08:00:00Z","deletedByParticipantId":"owner"}]
    }]
  }'::jsonb;
  candidate jsonb;
  normalized jsonb;
  tampered jsonb;
begin
  if to_regprocedure('private.preserve_committed_note_deletions(jsonb,jsonb)') is null
    or to_regprocedure('private.normalize_repeated_shared_note_deletions()') is null then
    raise exception 'Idempotent note-deletion functions are missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.app_snapshots'::regclass
      and tgname = 'ab_normalize_repeated_shared_note_deletions'
      and tgfoid = 'private.normalize_repeated_shared_note_deletions()'::regprocedure
      and tgenabled = 'O' and not tgisinternal
      and (tgtype::integer & 19) = 19
  ) then
    raise exception 'Idempotent note-deletion trigger is missing or disabled';
  end if;
  if pg_catalog.has_function_privilege(
    'authenticated', 'private.preserve_committed_note_deletions(jsonb,jsonb)', 'execute'
  ) or pg_catalog.has_function_privilege(
    'anon', 'private.preserve_committed_note_deletions(jsonb,jsonb)', 'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated', 'private.normalize_repeated_shared_note_deletions()', 'execute'
  ) or pg_catalog.has_function_privilege(
    'anon', 'private.normalize_repeated_shared_note_deletions()', 'execute'
  ) then
    raise exception 'Idempotent note-deletion helper grants are unsafe';
  end if;

  candidate := pg_catalog.jsonb_set(old_state, '{events,0,deletedNotes}',
    '[{"id":"gone","deletedAt":"2026-09-03T08:01:00Z","deletedByParticipantId":"member"}]'::jsonb);
  candidate := pg_catalog.jsonb_set(candidate, '{events,0,notes}', '[{
    "id":"companion","title":"","body":"A pending note must survive",
    "createdAt":"2026-09-03T08:02:00Z","updatedAt":"2026-09-03T08:02:00Z",
    "createdByParticipantId":"member","updatedByParticipantId":"member"
  }]'::jsonb);
  normalized := private.preserve_committed_note_deletions(old_state, candidate);
  if normalized #> '{events,0,deletedNotes}' is distinct from old_state #> '{events,0,deletedNotes}'
    or normalized #> '{events,0,notes}' is distinct from candidate #> '{events,0,notes}'
    or not private.is_safe_shared_event_notes_update(old_state, normalized, 'member')
    or private.is_safe_shared_event_notes_update(old_state, candidate, 'member') then
    raise exception 'A duplicate deletion still blocks the companion note';
  end if;

  tampered := pg_catalog.jsonb_set(normalized,
    '{events,0,notes,0,createdByParticipantId}', '"owner"'::jsonb);
  if private.is_safe_shared_event_notes_update(old_state,
    private.preserve_committed_note_deletions(old_state, tampered), 'member') then
    raise exception 'Normalization bypassed note authorship permissions';
  end if;

  tampered := pg_catalog.jsonb_set(normalized, '{events,0,deletedNotes}', '[]'::jsonb);
  if private.preserve_committed_note_deletions(old_state, tampered)
    #> '{events,0,deletedNotes}' is distinct from old_state #> '{events,0,deletedNotes}' then
    raise exception 'Normalization allowed committed deletion history to disappear';
  end if;

  tampered := pg_catalog.jsonb_set(normalized, '{events,0,deletedNotes}',
    (normalized #> '{events,0,deletedNotes}') ||
    '[{"id":"other","deletedAt":"2026-09-03T08:03:00Z","deletedByParticipantId":"owner"}]'::jsonb);
  if private.is_safe_shared_event_notes_update(old_state,
    private.preserve_committed_note_deletions(old_state, tampered), 'member') then
    raise exception 'Normalization bypassed permissions on a different deletion';
  end if;

  tampered := pg_catalog.jsonb_set(candidate, '{events,0,id}', '"different-event"'::jsonb);
  if private.preserve_committed_note_deletions(old_state, tampered) is distinct from tampered then
    raise exception 'Normalization crossed event identity boundaries';
  end if;
end;
$$;
