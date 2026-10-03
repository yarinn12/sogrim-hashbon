begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- The UI appends a participant-left receipt when leaving. The membership
-- guard previously treated that receipt as an unrelated content edit. This
-- exception applies only after the existing guard proves a self-leave with
-- another active admin; it never permits expense, note, profile or setting edits.
create or replace function private.is_safe_self_leave_content(
  p_old_state jsonb, p_new_state jsonb, p_actor text, p_snapshot_id text
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  old_event jsonb := p_old_state -> 'events' -> 0;
  new_event jsonb := p_new_state -> 'events' -> 0;
  excluded_fields text[] := array['participantIds','inactiveParticipantIds',
    'membershipUpdatedAt','membershipUpdatedAtByParticipant','adminIds','adminIdsUpdatedAt',
    'activityLog','participantAliases','distinctParticipantPairs'];
  expected_aliases jsonb := coalesce(old_event -> 'participantAliases', '{}'::jsonb);
  expected_pairs jsonb := coalesce(old_event -> 'distinctParticipantPairs', '[]'::jsonb);
  old_log jsonb := coalesce(old_event -> 'activityLog', '[]'::jsonb);
  new_log jsonb := coalesce(new_event -> 'activityLog', '[]'::jsonb);
  added_count integer;
  receipt jsonb;
begin
  if coalesce(p_actor, '') = '' or old_event is null or new_event is null
    or old_event - excluded_fields is distinct from new_event - excluded_fields then
    return false;
  end if;

  -- A member without financial history is removed entirely from participantIds.
  -- Only their own alias and duplicate-name pairs may then be cleaned up.
  if not coalesce((new_event -> 'participantIds') ? p_actor, false) then
    expected_aliases := expected_aliases - p_actor;
    select coalesce(pg_catalog.jsonb_agg(pair.value order by pair.position), '[]'::jsonb)
      into expected_pairs
    from pg_catalog.jsonb_array_elements(expected_pairs) with ordinality as pair(value, position)
    where not (p_actor = any(pg_catalog.string_to_array(pair.value #>> '{}', '~')));
  end if;
  if expected_aliases is distinct from coalesce(new_event -> 'participantAliases', '{}'::jsonb)
    or expected_pairs is distinct from coalesce(new_event -> 'distinctParticipantPairs', '[]'::jsonb) then
    return false;
  end if;
  if old_log = new_log then return true; end if;

  -- Keep every existing receipt immutable and enforce the existing newest-100
  -- overflow rule. Exactly one new receipt must describe this actor's leave.
  if not private.has_authorized_shared_activity(
    p_old_state, p_new_state, p_actor, p_snapshot_id, false
  ) then return false; end if;
  select count(*), min(entry.value::text)::jsonb into added_count, receipt
  from pg_catalog.jsonb_array_elements(new_log) as entry(value)
  where not exists (select 1 from pg_catalog.jsonb_array_elements(old_log) as previous(value)
    where previous.value ->> 'id' = entry.value ->> 'id');
  return coalesce(added_count = 1
    and receipt ->> 'kind' = 'participant-left'
    and receipt ->> 'actorParticipantId' = p_actor
    and receipt ->> 'subjectParticipantId' = p_actor
    and receipt - array['id','kind','occurredAt','actorParticipantId','subjectParticipantId'] = '{}'::jsonb, false);
end;
$$;
revoke all on function private.is_safe_self_leave_content(jsonb,jsonb,text,text)
  from public, anon, authenticated;

-- Patch the installed guard rather than replacing unrelated newer protections.
-- Fail closed if its expected membership comparison is missing. Safe to rerun.
do $$
declare
  previous_definition text;
  next_definition text;
  before_fragment text := E'\\][[:space:]]+then[[:space:]]+raise exception ''A membership update cannot change event content''';
  after_fragment text := E'] and not (actor_is_leaving and private.is_safe_self_leave_content(\n          old.state, new.state, actor_participant_id, new.id\n        )) then\n        raise exception ''A membership update cannot change event content''';
begin
  select pg_catalog.pg_get_functiondef('private.guard_shared_snapshot_update()'::regprocedure)
    into previous_definition;
  if pg_catalog.strpos(previous_definition, 'private.is_safe_self_leave_content(') > 0 then return; end if;
  next_definition := pg_catalog.regexp_replace(previous_definition, before_fragment, after_fragment);
  if next_definition = previous_definition then
    raise exception 'Self-leave content comparison could not be extended';
  end if;
  execute next_definition;
end;
$$;
commit;
