begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.is_safe_offline_guest_addition(
  p_old_state jsonb,
  p_new_state jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  old_event jsonb := p_old_state -> 'events' -> 0;
  new_event jsonb := p_new_state -> 'events' -> 0;
  old_participant_ids text[] := private.event_text_ids(
    old_event,
    'participantIds'
  );
  new_participant_ids text[] := private.event_text_ids(
    new_event,
    'participantIds'
  );
  old_inactive_ids text[] := private.event_text_ids(
    old_event,
    'inactiveParticipantIds'
  );
  new_inactive_ids text[] := private.event_text_ids(
    new_event,
    'inactiveParticipantIds'
  );
  added_ids text[];
  added_id text;
begin
  if old_event is null or new_event is null then
    return false;
  end if;

  select coalesce(
    pg_catalog.array_agg(candidate.participant_id order by candidate.participant_id),
    '{}'::text[]
  )
  into added_ids
  from (
    select participant_id
    from pg_catalog.unnest(new_participant_ids) as new_id(participant_id)
    except
    select participant_id
    from pg_catalog.unnest(old_participant_ids) as old_id(participant_id)
  ) as candidate;

  if pg_catalog.cardinality(added_ids) = 0
    or not (old_participant_ids <@ new_participant_ids)
    or pg_catalog.cardinality(new_participant_ids) <>
      pg_catalog.cardinality(old_participant_ids) +
      pg_catalog.cardinality(added_ids)
    or old_inactive_ids is distinct from new_inactive_ids
    or private.event_admin_ids(p_old_state) is distinct from
      private.event_admin_ids(p_new_state) then
    return false;
  end if;

  foreach added_id in array added_ids loop
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        case
          when pg_catalog.jsonb_typeof(p_old_state -> 'deletedParticipants') = 'array'
            then p_old_state -> 'deletedParticipants'
          else '[]'::jsonb
        end
      ) as deletion(value)
      where deletion.value ->> 'id' = added_id
    ) or added_id !~ '^guest-[A-Za-z0-9_-]{1,120}$'
      or not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          case
            when pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
              then p_new_state -> 'participants'
            else '[]'::jsonb
          end
        ) as participant(value)
        where participant.value ->> 'id' = added_id
          and participant.value ->> 'kind' = 'guest'
          and coalesce(participant.value -> 'accountLinked', 'false'::jsonb)
            is distinct from 'true'::jsonb
          and coalesce(participant.value ->> 'authProvider', '') = ''
          and coalesce(participant.value ->> 'authSubject', '') = ''
          and coalesce(participant.value ->> 'email', '') = ''
      ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function private.is_safe_offline_guest_addition(jsonb, jsonb)
  from public, anon, authenticated;

commit;
