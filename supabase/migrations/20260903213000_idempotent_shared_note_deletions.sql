begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Older clients merge deletion records by device time. A second deletion of
-- an already deleted note is a no-op, not an attempt to rewrite its authorship.
-- Normalize only matching committed IDs; authorization/validation still run
-- afterwards on every new deletion, note edit, and omitted historical record.
create or replace function private.preserve_committed_note_deletions(
  p_old_state jsonb,
  p_new_state jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  old_event jsonb := p_old_state -> 'events' -> 0;
  new_event jsonb := p_new_state -> 'events' -> 0;
  committed_deletions jsonb := old_event -> 'deletedNotes';
  candidate_deletions jsonb := new_event -> 'deletedNotes';
  next_deletions jsonb;
begin
  if old_event ->> 'id' is distinct from new_event ->> 'id'
    or pg_catalog.jsonb_typeof(committed_deletions) is distinct from 'array'
    or pg_catalog.jsonb_typeof(candidate_deletions) is distinct from 'array' then
    return p_new_state;
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    coalesce((
      select committed.value
      from pg_catalog.jsonb_array_elements(committed_deletions) as committed(value)
      where committed.value ->> 'id' = candidate.value ->> 'id'
      limit 1
    ), candidate.value)
    order by candidate.ordinality
  ), '[]'::jsonb)
  into next_deletions
  from pg_catalog.jsonb_array_elements(candidate_deletions)
    with ordinality as candidate(value, ordinality);

  if next_deletions is not distinct from candidate_deletions then
    return p_new_state;
  end if;
  return pg_catalog.jsonb_set(
    p_new_state, '{events,0,deletedNotes}', next_deletions, false
  );
end;
$$;

create or replace function private.normalize_repeated_shared_note_deletions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.snapshot_kind = 'shared_event' and new.snapshot_kind = 'shared_event' then
    new.state := private.preserve_committed_note_deletions(old.state, new.state);
  end if;
  return new;
end;
$$;

-- Runs before guard_shared_event_notes; no membership or edit guard is removed.
drop trigger if exists ab_normalize_repeated_shared_note_deletions
  on public.app_snapshots;
create trigger ab_normalize_repeated_shared_note_deletions
  before update of state on public.app_snapshots
  for each row execute function private.normalize_repeated_shared_note_deletions();

revoke all on function private.preserve_committed_note_deletions(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.normalize_repeated_shared_note_deletions()
  from public, anon, authenticated;

commit;
