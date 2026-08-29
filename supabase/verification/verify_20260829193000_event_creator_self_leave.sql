do $$
declare
  guard_definition text;
begin
  if to_regprocedure('private.guard_shared_snapshot_update()') is null then
    raise exception 'Shared snapshot update guard is unavailable';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private.guard_shared_snapshot_update()'::regprocedure
  ) into guard_definition;

  if pg_catalog.strpos(
    guard_definition,
    'old_event ->> ''createdByParticipantId'' is distinct from actor_participant_id'
  ) > 0 then
    raise exception 'Event creators are still blocked from leaving after management transfer';
  end if;

  if pg_catalog.strpos(guard_definition, 'actor_is_leaving :=') = 0
    or pg_catalog.strpos(
      guard_definition,
      'pg_catalog.array_remove(old_active_ids, actor_participant_id) = new_active_ids'
    ) = 0
    or pg_catalog.strpos(
      guard_definition,
      'pg_catalog.cardinality(new_admin_ids) > 0'
    ) = 0 then
    raise exception 'Safe self-leave constraints are incomplete';
  end if;
end;
$$;
