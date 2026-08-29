begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $$
declare
  previous_definition text;
  next_definition text;
begin
  if to_regprocedure('private.guard_shared_snapshot_update()') is null then
    raise exception 'Shared snapshot update guard is unavailable';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private.guard_shared_snapshot_update()'::regprocedure
  ) into previous_definition;

  if pg_catalog.strpos(
    previous_definition,
    'old_event ->> ''createdByParticipantId'' is distinct from actor_participant_id'
  ) > 0 then
    return;
  end if;

  next_definition := pg_catalog.replace(
    previous_definition,
    'and pg_catalog.array_remove(old_active_ids, actor_participant_id) = new_active_ids',
    E'and pg_catalog.array_remove(old_active_ids, actor_participant_id) = new_active_ids\\n    and old_event ->> ''createdByParticipantId'' is distinct from actor_participant_id'
  );

  if next_definition = previous_definition then
    raise exception 'Safe self-leave rollback anchor was not found';
  end if;

  execute next_definition;
end;
$$;

commit;
