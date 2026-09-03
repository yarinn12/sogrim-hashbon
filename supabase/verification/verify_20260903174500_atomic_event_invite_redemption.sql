do $$
declare
  definition text;
begin
  if to_regprocedure(
    'public.redeem_event_invite_membership(uuid,text,uuid)'
  ) is null then
    raise exception 'Atomic event invite redemption RPC is missing';
  end if;

  definition := pg_catalog.pg_get_functiondef(
    'public.redeem_event_invite_membership(uuid,text,uuid)'::regprocedure
  );
  if pg_catalog.strpos(definition, 'next_shared_state') = 0
    or pg_catalog.strpos(
      definition,
      'public.index_shared_event_for_member(snapshot.id, p_user_id)'
    ) = 0
    or pg_catalog.strpos(definition, '''canonicalParticipantReady'', true') = 0
    or pg_catalog.strpos(definition, '''workspaceIndexed'', true') = 0 then
    raise exception 'Event invite redemption is not atomic';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.redeem_event_invite_membership(uuid,text,uuid)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.redeem_event_invite_membership(uuid,text,uuid)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.redeem_event_invite_membership(uuid,text,uuid)',
    'execute'
  ) then
    raise exception 'Atomic event invite redemption RPC grants are unsafe';
  end if;
end;
$$;
