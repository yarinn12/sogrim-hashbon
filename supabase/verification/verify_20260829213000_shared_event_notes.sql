do $$
declare
  guard_definition text;
  old_state jsonb := $json$
    {
      "participants": [
        {"id": "owner", "name": "Owner"},
        {"id": "member", "name": "Member"}
      ],
      "events": [{
        "id": "event-notes-verification",
        "participantIds": ["owner", "member"],
        "adminIds": ["owner"],
        "adminsCanEditOnly": false,
        "notes": [{
          "id": "note-1",
          "title": "פרטי הטיסה",
          "body": "טרמינל 3",
          "createdAt": "2026-08-29T18:00:00.000Z",
          "updatedAt": "2026-08-29T18:00:00.000Z",
          "createdByParticipantId": "owner",
          "updatedByParticipantId": "owner"
        }]
      }]
    }
  $json$::jsonb;
  valid_member_edit jsonb;
  forged_member_edit jsonb;
begin
  if to_regprocedure('private.has_valid_shared_event_notes(jsonb)') is null
    or to_regprocedure(
      'private.is_safe_shared_event_notes_update(jsonb,jsonb,text)'
    ) is null
    or to_regprocedure('private.guard_shared_event_notes()') is null then
    raise exception 'Shared event note guards are missing';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private.guard_shared_snapshot_update()'::regprocedure
  ) into guard_definition;

  if (
    pg_catalog.char_length(guard_definition) -
    pg_catalog.char_length(
      pg_catalog.replace(guard_definition, '''deletedNotes''', '')
    )
  ) / pg_catalog.char_length('''deletedNotes''') < 4 then
    raise exception 'Ordinary event editors are still blocked from shared notes';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid = 'public.app_snapshots'::regclass
      and trigger.tgname = 'guard_shared_event_notes'
      and not trigger.tgisinternal
  ) then
    raise exception 'Shared event note trigger is missing';
  end if;

  if not private.has_valid_shared_event_notes(old_state) then
    raise exception 'A valid shared note was rejected';
  end if;

  valid_member_edit := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      old_state,
      '{events,0,notes,0,body}',
      '"טרמינל 3 · להגיע שלוש שעות לפני"'::jsonb
    ),
    '{events,0,notes,0,updatedAt}',
    '"2026-08-29T18:01:00.000Z"'::jsonb
  );
  valid_member_edit := pg_catalog.jsonb_set(
    valid_member_edit,
    '{events,0,notes,0,updatedByParticipantId}',
    '"member"'::jsonb
  );

  if not private.is_safe_shared_event_notes_update(
    old_state,
    valid_member_edit,
    'member'
  ) then
    raise exception 'A valid member note edit was rejected';
  end if;

  forged_member_edit := pg_catalog.jsonb_set(
    valid_member_edit,
    '{events,0,notes,0,updatedByParticipantId}',
    '"owner"'::jsonb
  );
  if private.is_safe_shared_event_notes_update(
    old_state,
    forged_member_edit,
    'member'
  ) then
    raise exception 'A forged note editor was accepted';
  end if;

  if private.has_valid_shared_event_notes(
    pg_catalog.jsonb_set(
      old_state,
      '{events,0,notes,0,title}',
      pg_catalog.to_jsonb(pg_catalog.repeat('x', 121))
    )
  ) then
    raise exception 'An oversized note title was accepted';
  end if;
end;
$$;
