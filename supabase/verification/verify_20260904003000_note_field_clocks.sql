do $$
declare
  baseline jsonb := '{"participants":[{"id":"owner"},{"id":"member"}],"events":[{
    "id":"field-clock-probe","participantIds":["owner","member"],"adminIds":["owner"],
    "adminsCanEditOnly":false,"deletedNotes":[],"notes":[{
      "id":"n","title":"Title","body":"Body","createdAt":"2026-09-04T00:00:00Z",
      "updatedAt":"2026-09-04T00:00:02Z","createdByParticipantId":"owner","updatedByParticipantId":"owner",
      "fieldUpdatedAt":{"title":"2026-09-04T00:00:02Z","body":"2026-09-04T00:00:00Z","pinned":"2026-09-04T00:00:00Z"}
    }]}]}'::jsonb;
  candidate jsonb;
  normalized jsonb;
  malformed jsonb;
  bad_map jsonb;
begin
  if not private.has_valid_shared_event_notes(baseline) then raise exception 'Valid field clocks rejected'; end if;
  candidate := pg_catalog.jsonb_set(baseline, '{events,0,notes,0,body}', '"Member body"');
  candidate := pg_catalog.jsonb_set(candidate, '{events,0,notes,0,updatedAt}', '"2026-09-04T00:00:03Z"');
  candidate := pg_catalog.jsonb_set(candidate, '{events,0,notes,0,updatedByParticipantId}', '"member"');
  candidate := pg_catalog.jsonb_set(candidate, '{events,0,notes,0,fieldUpdatedAt,body}', '"2026-09-04T00:00:03Z"');
  normalized := private.normalize_note_field_clocks(baseline, candidate);
  if normalized <> candidate or not private.is_safe_shared_event_notes_update(baseline, normalized, 'member') then
    raise exception 'New protocol edit rejected or changed';
  end if;
  -- Legacy apps may omit metadata or spread it unchanged. Both remain writable.
  candidate := candidate #- '{events,0,notes,0,fieldUpdatedAt}';
  normalized := private.normalize_note_field_clocks(baseline, candidate);
  if normalized #>> '{events,0,notes,0,fieldUpdatedAt,title}' <> '2026-09-04T00:00:02Z'
    or normalized #>> '{events,0,notes,0,fieldUpdatedAt,body}' <> '2026-09-04T00:00:03Z'
    or normalized #>> '{events,0,notes,0,fieldUpdatedAt,pinned}' <> '2026-09-04T00:00:00Z'
    or not private.is_safe_shared_event_notes_update(baseline, normalized, 'member') then
    raise exception 'Legacy omitted-clock write is incompatible';
  end if;
  candidate := pg_catalog.jsonb_set(candidate, '{events,0,notes,0,fieldUpdatedAt}', baseline #> '{events,0,notes,0,fieldUpdatedAt}');
  if private.normalize_note_field_clocks(baseline, candidate) <> normalized then
    raise exception 'Legacy spread-clock write is incompatible';
  end if;
  if private.normalize_note_field_clocks(normalized, normalized) <> normalized then
    raise exception 'Field clock normalization is not idempotent';
  end if;
  -- Normalization must not confer edit, authorship, or creation privileges.
  if private.is_safe_shared_event_notes_update(baseline, normalized, 'outsider') then
    raise exception 'Outsider gained note write access';
  end if;
  malformed := pg_catalog.jsonb_set(normalized, '{events,0,notes,0,updatedByParticipantId}', '"owner"');
  if private.is_safe_shared_event_notes_update(baseline, malformed, 'member') then
    raise exception 'Member can forge editor';
  end if;
  malformed := pg_catalog.jsonb_set(normalized, '{events,0,notes,0,createdByParticipantId}', '"member"');
  if private.is_safe_shared_event_notes_update(baseline, malformed, 'member') then
    raise exception 'Member can rewrite creator';
  end if;
  malformed := pg_catalog.jsonb_set(baseline, '{events,0,adminsCanEditOnly}', 'true');
  if private.is_safe_shared_event_notes_update(malformed, normalized, 'member') then
    raise exception 'Admin-only notes became editable';
  end if;
  for bad_map in select value from pg_catalog.jsonb_array_elements('[
    null, [], {}, {"title":null,"body":"2026-09-04T00:00:00Z","pinned":"2026-09-04T00:00:00Z"},
    {"title":"infinity","body":"2026-09-04T00:00:00Z","pinned":"2026-09-04T00:00:00Z"},
    {"title":"2026-09-04T00:00:04Z","body":"2026-09-04T00:00:00Z","pinned":"2026-09-04T00:00:00Z"},
    {"title":"2026-09-03T00:00:00Z","body":"2026-09-04T00:00:00Z","pinned":"2026-09-04T00:00:00Z"},
    {"title":"2026-09-04T00:00:00Z","body":"2026-09-04T00:00:00Z","pinned":"2026-09-04T00:00:00Z","unknown":"2026-09-04T00:00:00Z"}
  ]'::jsonb) loop
    malformed := pg_catalog.jsonb_set(normalized, '{events,0,notes,0,fieldUpdatedAt}', bad_map);
    if private.has_valid_shared_event_notes(private.normalize_note_field_clocks(baseline, malformed)) then
      raise exception 'Invalid clocks laundered by normalization';
    end if;
  end loop;
  malformed := pg_catalog.jsonb_set(normalized, '{events,0,notes,0,unknown}', 'true');
  if private.has_valid_shared_event_notes(malformed) then raise exception 'Note allowlist widened beyond clocks'; end if;
  if pg_catalog.has_function_privilege('authenticated', 'private.normalize_note_field_clocks(jsonb,jsonb)', 'execute')
    or pg_catalog.has_function_privilege('anon', 'private.has_valid_note_field_clocks(jsonb)', 'execute') then
    raise exception 'Private clock helpers exposed';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.app_snapshots'::regclass
    and tgname = 'aa_normalize_shared_note_field_clocks' and tgenabled <> 'D') then
    raise exception 'Clock normalization trigger missing';
  end if;
end;
$$;
