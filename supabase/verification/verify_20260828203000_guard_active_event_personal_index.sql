do $$
declare
  definition text;
begin
  if pg_catalog.to_regprocedure(
    'private.guard_personal_snapshot_write()'
  ) is null then
    raise exception 'Personal workspace guard is missing';
  end if;

  definition := pg_catalog.pg_get_functiondef(
    'private.guard_personal_snapshot_write()'::regprocedure
  );
  if pg_catalog.strpos(definition, 'member.status = ''active''') = 0
    or pg_catalog.strpos(definition, 'member.removed_at is null') = 0
    or pg_catalog.strpos(
      definition,
      'Active shared member must remain active in its personal event'
    ) = 0
    or pg_catalog.strpos(
      definition,
      'personal_event.value -> ''participantIds'''
    ) = 0
    or pg_catalog.strpos(
      definition,
      'personal_event.value -> ''inactiveParticipantIds'''
    ) = 0 then
    raise exception 'Personal workspace guard does not protect active member identity';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'app_snapshots'
      and trigger.tgname = 'guard_personal_snapshot_write'
      and not trigger.tgisinternal
  ) then
    raise exception 'Personal workspace guard trigger is missing';
  end if;
end;
$$;
