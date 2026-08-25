do $$
declare
  actor_id text := 'account-00000000-0000-4000-8000-000000000022';
  other_id text := 'account-00000000-0000-4000-8000-000000000021';
  old_state jsonb;
  valid_state jsonb;
  forged_other_state jsonb;
  forged_identity_state jsonb;
  future_state jsonb;
  guard_definition text;
begin
  if pg_catalog.to_regprocedure(
      'private.is_safe_self_profile_update(jsonb,jsonb,text)'
    ) is null then
    raise exception 'Member self-profile helper is missing';
  end if;

  if pg_catalog.has_function_privilege(
      'anon',
      'private.is_safe_self_profile_update(jsonb,jsonb,text)',
      'execute'
    ) or pg_catalog.has_function_privilege(
      'authenticated',
      'private.is_safe_self_profile_update(jsonb,jsonb,text)',
      'execute'
    ) then
    raise exception 'Member self-profile helper is exposed to application roles';
  end if;

  old_state := pg_catalog.jsonb_build_object(
    'participants',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', actor_id,
        'displayName', 'Member Name',
        'kind', 'user',
        'avatarPreset', 'avatar-1',
        'accountLinked', true
      ),
      pg_catalog.jsonb_build_object(
        'id', other_id,
        'displayName', 'Event Owner',
        'kind', 'user',
        'avatarPreset', 'avatar-2',
        'accountLinked', true
      )
    )
  );
  valid_state := pg_catalog.jsonb_set(
    old_state,
    '{participants,0}',
    (old_state -> 'participants' -> 0) || pg_catalog.jsonb_build_object(
      'displayName', 'Updated Member',
      'avatarPreset', 'avatar-3',
      'profileUpdatedAt',
        pg_catalog.to_jsonb(
          (pg_catalog.statement_timestamp() - interval '1 minute')::text
        )
    )
  );

  if not private.is_safe_self_profile_update(
      old_state,
      valid_state,
      actor_id
    ) then
    raise exception 'A valid member self-profile update is rejected';
  end if;

  forged_other_state := pg_catalog.jsonb_set(
    valid_state,
    '{participants,1,profileUpdatedAt}',
    pg_catalog.to_jsonb(
      (pg_catalog.statement_timestamp() - interval '30 seconds')::text
    ),
    true
  );
  if private.is_safe_self_profile_update(
      old_state,
      forged_other_state,
      actor_id
    ) then
    raise exception 'A member can change another participant profile timestamp';
  end if;

  forged_identity_state := pg_catalog.jsonb_set(
    valid_state,
    '{participants,0,accountLinked}',
    'false'::jsonb,
    true
  );
  if private.is_safe_self_profile_update(
      old_state,
      forged_identity_state,
      actor_id
    ) then
    raise exception 'A member can change protected participant identity fields';
  end if;

  future_state := pg_catalog.jsonb_set(
    valid_state,
    '{participants,0,profileUpdatedAt}',
    pg_catalog.to_jsonb(
      (pg_catalog.statement_timestamp() + interval '6 minutes')::text
    ),
    true
  );
  if private.is_safe_self_profile_update(old_state, future_state, actor_id) then
    raise exception 'A member can publish a future profile version';
  end if;

  guard_definition := pg_catalog.pg_get_functiondef(
    'private.guard_shared_snapshot_update()'::regprocedure
  );
  if pg_catalog.strpos(
      guard_definition,
      'private.is_safe_self_profile_update'
    ) = 0
    or pg_catalog.strpos(
      guard_definition,
      'actor_is_updating_own_profile'
    ) = 0
    or pg_catalog.strpos(
      guard_definition,
      'old.state - ''participants'' is not distinct from'
    ) = 0 then
    raise exception 'Shared-event guard does not preserve the self-profile boundary';
  end if;
end;
$$;

select 'ready' as verification_status;
