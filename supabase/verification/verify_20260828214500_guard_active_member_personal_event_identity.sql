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
      'personal_event.value -> ''participantIds'''
    ) = 0
    or pg_catalog.strpos(
      definition,
      'personal_event.value -> ''inactiveParticipantIds'''
    ) = 0
    or pg_catalog.strpos(
      definition,
      'Active shared member must remain active in its personal event'
    ) = 0 then
    raise exception 'Personal workspace guard does not protect active member identity';
  end if;
end;
$$;
