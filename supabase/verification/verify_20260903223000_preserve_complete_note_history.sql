do $$
declare
  old_state jsonb;
  candidate jsonb;
  normalized jsonb;
  history jsonb;
  poisoned jsonb;
begin
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', 'old-' || item::text,
    'deletedAt', '2026-09-03T07:00:00Z',
    'deletedByParticipantId', 'member'
  ) order by item) into history from pg_catalog.generate_series(1, 500) as item;
  old_state := pg_catalog.jsonb_build_object(
    'participants', '[{"id":"owner"},{"id":"member"}]'::jsonb,
    'events', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', 'event-history-probe', 'participantIds', '["owner","member"]'::jsonb,
      'adminIds', '["owner"]'::jsonb, 'adminsCanEditOnly', false,
      'deletedNotes', history,
      'notes', '[{"id":"current","title":"","body":"A newer edit",
        "createdAt":"2026-09-03T08:00:00Z","updatedAt":"2026-09-03T08:02:00Z",
        "createdByParticipantId":"owner","updatedByParticipantId":"owner"}]'::jsonb
    ))
  );
  candidate := pg_catalog.jsonb_set(old_state, '{events,0,notes}', '[]'::jsonb);
  candidate := pg_catalog.jsonb_set(candidate, '{events,0,deletedNotes}',
    '[{"id":"current","deletedAt":"2026-09-03T08:01:00Z","deletedByParticipantId":"member"}]'::jsonb
    || (history - 499));
  normalized := private.preserve_committed_note_deletions(old_state, candidate);
  if pg_catalog.jsonb_array_length(normalized #> '{events,0,deletedNotes}') <> 501
    or normalized #>> '{events,0,deletedNotes,0,deletedAt}' <> '2026-09-03T08:02:00Z'
    or not private.has_valid_shared_event_notes(normalized)
    or not private.is_safe_shared_event_notes_update(old_state, normalized, 'member') then
    raise exception 'Long note history or delete/edit reconciliation is broken';
  end if;

  poisoned := pg_catalog.jsonb_set(candidate,
    '{events,0,deletedNotes,0,deletedByParticipantId}', '"owner"'::jsonb);
  if private.is_safe_shared_event_notes_update(old_state,
    private.preserve_committed_note_deletions(old_state, poisoned), 'member') then
    raise exception 'Rebasing bypassed deletion authorship permissions';
  end if;

  poisoned := pg_catalog.jsonb_set(normalized, '{events,0,deletedNotes}',
    (normalized #> '{events,0,deletedNotes}') ||
    (normalized #> '{events,0,deletedNotes}' -> 0));
  if private.has_valid_shared_event_notes(poisoned) then
    raise exception 'Long history permits duplicate deletion identifiers';
  end if;

  poisoned := pg_catalog.jsonb_set(normalized, '{events,0,notes}', old_state #> '{events,0,notes}');
  if private.has_valid_shared_event_notes(poisoned) then
    raise exception 'A retained tombstone permits note resurrection';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_set(
    old_state #> '{events,0,notes,0}', '{id}', pg_catalog.to_jsonb('active-' || item::text)
  )) into history from pg_catalog.generate_series(1, 101) as item;
  poisoned := pg_catalog.jsonb_set(normalized, '{events,0,notes}', history);
  if private.has_valid_shared_event_notes(poisoned) then
    raise exception 'The active note count limit was removed';
  end if;

  poisoned := pg_catalog.jsonb_set(candidate, '{events,0,deletedNotes,0,deletedAt}', '"invalid"'::jsonb);
  if private.has_valid_shared_event_notes(
    private.preserve_committed_note_deletions(old_state, poisoned)) then
    raise exception 'Timestamp rebasing hides invalid timestamps';
  end if;

  if pg_catalog.has_function_privilege('authenticated',
    'private.rebase_note_deletion_timestamp(jsonb,text)', 'execute')
    or pg_catalog.has_function_privilege('anon',
    'private.rebase_note_deletion_timestamp(jsonb,text)', 'execute') then
    raise exception 'Note timestamp helper grants are unsafe';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.app_snapshots'::regclass
      and tgname = 'ab_normalize_repeated_shared_note_deletions' and tgenabled <> 'D'
  ) then
    raise exception 'The note history normalization trigger is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.app_snapshots'::regclass and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) like '%pg_column_size%8388608%'
  ) then
    raise exception 'The snapshot storage byte bound is missing';
  end if;
end;
$$;
