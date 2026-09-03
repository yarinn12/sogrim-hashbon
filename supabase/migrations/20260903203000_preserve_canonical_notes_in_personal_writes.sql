begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Account snapshots are startup projections, not another source of truth for
-- shared notes. A queued personal save may carry old notes even with a fresh
-- updated_at token (a background read can advance the client's version cache).
-- Preserve canonical notes at this second write boundary as well as replicating
-- them when the canonical event changes.
create or replace function private.project_canonical_notes_into_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  projected_events jsonb;
begin
  if new.snapshot_kind <> 'workspace'
    or new.owner_user_id is null
    or auth.uid() is distinct from new.owner_user_id then
    return new;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      case when canonical.event is null then personal_event.value
      else personal_event.value || pg_catalog.jsonb_build_object(
        'notes', coalesce(canonical.event -> 'notes', '[]'::jsonb),
        'deletedNotes', coalesce(canonical.event -> 'deletedNotes', '[]'::jsonb)
      ) end
      order by personal_event.ordinality
    ),
    '[]'::jsonb
  )
  into projected_events
  from pg_catalog.jsonb_array_elements(
    coalesce(new.state -> 'events', '[]'::jsonb)
  ) with ordinality as personal_event(value, ordinality)
  left join lateral (
    select shared.state -> 'events' -> 0 as event
    from public.app_snapshots as shared
    join private.shared_snapshot_members as member
      on member.snapshot_id = shared.id
     and member.user_id = new.owner_user_id
     and member.status = 'active'
     and member.removed_at is null
    where shared.id = personal_event.value ->> 'sharedSpaceId'
      and shared.snapshot_kind = 'shared_event'
      and shared.state -> 'events' -> 0 ->> 'id' =
        personal_event.value ->> 'id'
      and coalesce(
        shared.state -> 'events' -> 0 -> 'participantIds', '[]'::jsonb
      ) ? member.participant_id
      and not coalesce(
        shared.state -> 'events' -> 0 -> 'inactiveParticipantIds', '[]'::jsonb
      ) ? member.participant_id
  ) as canonical on true;

  -- Do not acquire a canonical row lock here: canonical writes lock the event
  -- before mirroring to this workspace. Taking the reverse order would deadlock.
  -- If a canonical write is in flight, its atomic mirror runs after this write
  -- releases the workspace; if it committed first, this projection sees it.
  if projected_events is distinct from new.state -> 'events' then
    new.state := pg_catalog.jsonb_set(
      new.state, '{events}', projected_events, true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists zz_project_canonical_notes_into_workspace
  on public.app_snapshots;
create trigger zz_project_canonical_notes_into_workspace
  before insert or update of state on public.app_snapshots
  for each row execute function private.project_canonical_notes_into_workspace();

revoke all on function private.project_canonical_notes_into_workspace()
  from public, anon, authenticated;

commit;
