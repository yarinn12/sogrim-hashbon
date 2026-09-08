begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- An identity link is historical evidence. Old clients replace this array
-- while merging an unrelated update; omissions must not erase committed links.
create or replace function private.preserve_committed_event_account_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_event jsonb := old.state -> 'events' -> 0;
  new_event jsonb := new.state -> 'events' -> 0;
  old_links jsonb := coalesce(old_event -> 'participantAccountLinks', '[]'::jsonb);
  next_links jsonb := coalesce(new_event -> 'participantAccountLinks', '[]'::jsonb);
  committed_link jsonb;
  candidate_link jsonb;
  matching_count integer;
begin
  if new.snapshot_kind <> 'shared_event' or new.owner_user_id is not null
    or new_event is null
    or old_event ->> 'id' is distinct from new_event ->> 'id'
    or jsonb_typeof(old_links) <> 'array'
    or old_links = '[]'::jsonb then
    return new;
  end if;
  if jsonb_typeof(next_links) <> 'array' then
    raise exception 'Participant account links must be an array' using errcode = '22023';
  end if;
  for committed_link in select value from jsonb_array_elements(old_links)
  loop
    if coalesce(new_event -> 'participantIds', '[]'::jsonb)
      ? (committed_link ->> 'sourceParticipantId') then
      raise exception 'A linked offline participant cannot be re-added' using errcode = '42501';
    end if;
    select count(*), min(value::text)::jsonb into matching_count, candidate_link
    from jsonb_array_elements(next_links)
    where value ->> 'sourceParticipantId' = committed_link ->> 'sourceParticipantId';
    if matching_count = 0 then
      next_links := next_links || jsonb_build_array(committed_link);
    elsif matching_count <> 1 or candidate_link is distinct from committed_link then
      raise exception 'Committed participant account links cannot be changed' using errcode = '42501';
    end if;
  end loop;
  if next_links is distinct from new_event -> 'participantAccountLinks' then
    new.state := jsonb_set(new.state, '{events,0,participantAccountLinks}', next_links, true);
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_committed_event_account_links() from public, anon, authenticated;
drop trigger if exists aa_preserve_committed_event_account_links on public.app_snapshots;
create trigger aa_preserve_committed_event_account_links
before update of state on public.app_snapshots
for each row execute function private.preserve_committed_event_account_links();
commit;
