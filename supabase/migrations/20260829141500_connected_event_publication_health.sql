begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

create or replace function public.admin_connected_event_publication_health()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'activeUnsharedMultiAccountCreatorEvents',
    pg_catalog.count(*)::bigint
  )
  from public.app_snapshots as snapshot
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(snapshot.state -> 'events', '[]'::jsonb)
  ) as event(value)
  where snapshot.snapshot_kind = 'workspace'
    and snapshot.owner_user_id is not null
    and coalesce(event.value ->> 'sharedSpaceId', '') = ''
    and event.value ->> 'createdByParticipantId' =
      'account-' || snapshot.owner_user_id::text
    and (event.value -> 'participantIds') ?
      ('account-' || snapshot.owner_user_id::text)
    and not coalesce(
      event.value -> 'inactiveParticipantIds',
      '[]'::jsonb
    ) ? ('account-' || snapshot.owner_user_id::text)
    and (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements_text(
        coalesce(event.value -> 'participantIds', '[]'::jsonb)
      ) as participant(participant_id)
      where participant.participant_id ~* '^account-[0-9a-f-]{36}$'
        and not coalesce(
          event.value -> 'inactiveParticipantIds',
          '[]'::jsonb
        ) ? participant.participant_id
    ) > 1;
$$;

revoke all on function public.admin_connected_event_publication_health()
  from public, anon, authenticated;
grant execute on function public.admin_connected_event_publication_health()
  to service_role;

commit;
