begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- The client permits any active participant to leave when another active
-- administrator remains. The database guard used to reject the event creator
-- even after management had been transferred, leaving the optimistic client
-- state out of sync with every other device.
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

  next_definition := pg_catalog.regexp_replace(
    previous_definition,
    E'\\n[[:space:]]*and old_event ->> ''createdByParticipantId'' is distinct from actor_participant_id',
    '',
    'g'
  );

  if next_definition = previous_definition then
    if pg_catalog.strpos(previous_definition, 'actor_is_leaving :=') = 0
      or pg_catalog.strpos(
        previous_definition,
        'pg_catalog.cardinality(new_admin_ids) > 0'
      ) = 0 then
      raise exception 'Safe creator self-leave guard is incomplete';
    end if;
    return;
  end if;

  execute next_definition;
end;
$$;

commit;
