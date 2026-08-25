begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.is_safe_self_profile_update(
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  old_participants jsonb := p_old_state -> 'participants';
  new_participants jsonb := p_new_state -> 'participants';
  old_actor jsonb;
  new_actor jsonb;
  old_profile_updated_at timestamptz;
  new_profile_updated_at timestamptz;
  old_avatar_updated_at timestamptz;
  new_avatar_updated_at timestamptz;
  normalized_display_name text;
  avatar_image text;
begin
  if coalesce(p_actor_participant_id, '') !~
      '^account-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or pg_catalog.jsonb_typeof(old_participants) <> 'array'
    or pg_catalog.jsonb_typeof(new_participants) <> 'array'
    or pg_catalog.jsonb_array_length(old_participants) <>
      pg_catalog.jsonb_array_length(new_participants)
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(old_participants) as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'object'
        or coalesce(item.value ->> 'id', '') = ''
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(new_participants) as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'object'
        or coalesce(item.value ->> 'id', '') = ''
    )
    or (
      select pg_catalog.count(*) <> pg_catalog.count(distinct item.value ->> 'id')
      from pg_catalog.jsonb_array_elements(old_participants) as item(value)
    )
    or (
      select pg_catalog.count(*) <> pg_catalog.count(distinct item.value ->> 'id')
      from pg_catalog.jsonb_array_elements(new_participants) as item(value)
    ) then
    return false;
  end if;

  select item.value
  into old_actor
  from pg_catalog.jsonb_array_elements(old_participants) as item(value)
  where item.value ->> 'id' = p_actor_participant_id;

  select item.value
  into new_actor
  from pg_catalog.jsonb_array_elements(new_participants) as item(value)
  where item.value ->> 'id' = p_actor_participant_id;

  if old_actor is null
    or new_actor is null
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(old_participants) as old_item(value)
      where old_item.value ->> 'id' <> p_actor_participant_id
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(new_participants) as new_item(value)
          where new_item.value = old_item.value
        )
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(new_participants) as new_item(value)
      where new_item.value ->> 'id' <> p_actor_participant_id
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(old_participants) as old_item(value)
          where old_item.value = new_item.value
        )
    )
    or old_actor - array[
        'displayName',
        'avatarPreset',
        'avatarImage',
        'avatarImageUpdatedAt',
        'profileUpdatedAt'
      ] is distinct from new_actor - array[
        'displayName',
        'avatarPreset',
        'avatarImage',
        'avatarImageUpdatedAt',
        'profileUpdatedAt'
      ] then
    return false;
  end if;

  if old_actor -> 'displayName' is distinct from new_actor -> 'displayName' then
    if pg_catalog.jsonb_typeof(new_actor -> 'displayName') <> 'string' then
      return false;
    end if;
    normalized_display_name := pg_catalog.regexp_replace(
      pg_catalog.btrim(new_actor ->> 'displayName'),
      '[[:space:]]+',
      ' ',
      'g'
    );
    if normalized_display_name is distinct from new_actor ->> 'displayName'
      or pg_catalog.char_length(normalized_display_name) not between 2 and 80
      or normalized_display_name !~ '^[^[:space:]]+ [^[:space:]]+( [^[:space:]]+)*$' then
      return false;
    end if;
  end if;

  if old_actor -> 'avatarPreset' is distinct from new_actor -> 'avatarPreset'
    and (
      new_actor ? 'avatarPreset'
      and (
        pg_catalog.jsonb_typeof(new_actor -> 'avatarPreset') <> 'string'
        or new_actor ->> 'avatarPreset' !~ '^avatar-[1-6]$'
      )
    ) then
    return false;
  end if;

  if old_actor -> 'avatarImage' is distinct from new_actor -> 'avatarImage'
    and new_actor ? 'avatarImage' then
    if pg_catalog.jsonb_typeof(new_actor -> 'avatarImage') <> 'string' then
      return false;
    end if;
    avatar_image := new_actor ->> 'avatarImage';
    if not (
      pg_catalog.char_length(avatar_image) <= 180000
      and avatar_image ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
    ) and not (
      pg_catalog.char_length(avatar_image) <= 2048
      and avatar_image ~ '^https://[^[:space:]]+$'
    ) then
      return false;
    end if;
  end if;

  if new_actor ? 'profileUpdatedAt' then
    if pg_catalog.jsonb_typeof(new_actor -> 'profileUpdatedAt') <> 'string' then
      return false;
    end if;
    new_profile_updated_at := (new_actor ->> 'profileUpdatedAt')::timestamptz;
  end if;
  if old_actor ? 'profileUpdatedAt' then
    old_profile_updated_at := (old_actor ->> 'profileUpdatedAt')::timestamptz;
  end if;
  if old_actor -> 'profileUpdatedAt' is distinct from
      new_actor -> 'profileUpdatedAt'
    and (
      new_profile_updated_at is null
      or new_profile_updated_at <= coalesce(
        old_profile_updated_at,
        '-infinity'::timestamptz
      )
      or new_profile_updated_at > pg_catalog.statement_timestamp() + interval '5 minutes'
    ) then
    return false;
  end if;

  if new_actor ? 'avatarImageUpdatedAt' then
    if pg_catalog.jsonb_typeof(new_actor -> 'avatarImageUpdatedAt') <> 'string' then
      return false;
    end if;
    new_avatar_updated_at := (new_actor ->> 'avatarImageUpdatedAt')::timestamptz;
  end if;
  if old_actor ? 'avatarImageUpdatedAt' then
    old_avatar_updated_at := (old_actor ->> 'avatarImageUpdatedAt')::timestamptz;
  end if;
  if old_actor -> 'avatarImageUpdatedAt' is distinct from
      new_actor -> 'avatarImageUpdatedAt'
    and (
      new_avatar_updated_at is null
      or new_avatar_updated_at <= coalesce(
        old_avatar_updated_at,
        '-infinity'::timestamptz
      )
      or new_avatar_updated_at > pg_catalog.statement_timestamp() + interval '5 minutes'
    ) then
    return false;
  end if;

  if (
      old_actor -> 'displayName' is distinct from new_actor -> 'displayName'
      or old_actor -> 'avatarPreset' is distinct from new_actor -> 'avatarPreset'
      or old_actor -> 'avatarImage' is distinct from new_actor -> 'avatarImage'
    ) and (
      new_profile_updated_at is null
      or new_profile_updated_at <= coalesce(
        old_profile_updated_at,
        '-infinity'::timestamptz
      )
    ) then
    return false;
  end if;

  if old_actor -> 'avatarImage' is distinct from new_actor -> 'avatarImage'
    and (
      new_avatar_updated_at is null
      or new_avatar_updated_at <= coalesce(
        old_avatar_updated_at,
        '-infinity'::timestamptz
      )
    ) then
    return false;
  end if;

  return old_participants is distinct from new_participants;
exception
  when others then
    return false;
end;
$$;

create or replace function private.guard_shared_snapshot_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_participant_id text := private.current_actor_participant_id();
  old_event jsonb := old.state -> 'events' -> 0;
  new_event jsonb := new.state -> 'events' -> 0;
  old_active_ids text[] := private.active_event_participant_ids(old.state);
  new_active_ids text[] := private.active_event_participant_ids(new.state);
  old_participant_ids text[] := private.event_text_ids(old_event, 'participantIds');
  new_participant_ids text[] := private.event_text_ids(new_event, 'participantIds');
  old_inactive_ids text[] := private.event_text_ids(old_event, 'inactiveParticipantIds');
  new_inactive_ids text[] := private.event_text_ids(new_event, 'inactiveParticipantIds');
  old_admin_ids text[] := private.event_admin_ids(old.state);
  new_admin_ids text[] := private.event_admin_ids(new.state);
  actor_is_admin boolean;
  actor_is_joining boolean;
  actor_is_leaving boolean;
  actor_is_adding_offline_guests boolean;
  actor_is_updating_own_profile boolean;
begin
  if old.snapshot_kind <> new.snapshot_kind then
    raise exception 'Snapshot kind cannot be changed'
      using errcode = '42501';
  end if;

  if old.access_key_hash <> new.access_key_hash then
    raise exception 'Snapshot access key cannot be changed through a state update'
      using errcode = '42501';
  end if;

  if old.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if actor_id is null or actor_participant_id is null then
    if pg_catalog.pg_trigger_depth() > 1
      and private.is_safe_account_deletion_anonymization(old.state, new.state) then
      return new;
    end if;
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if old_event is null then
    raise exception 'Shared event state is invalid'
      using errcode = '22023';
  end if;

  actor_is_admin := actor_participant_id = any(old_admin_ids);

  if new_event is null then
    if not actor_is_admin then
      raise exception 'Only an event admin can delete a shared event'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if coalesce(old_event ->> 'id', '') = ''
    or old_event ->> 'id' is distinct from new_event ->> 'id' then
    raise exception 'Shared event identity cannot be changed'
      using errcode = '22023';
  end if;

  if coalesce(old_event -> 'transferStatusUpdates', '[]'::jsonb) = '[]'::jsonb
    and coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb) = '[]'::jsonb then
    old_event := old_event - 'transferStatusUpdates';
    new_event := new_event - 'transferStatusUpdates';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(new_admin_ids) as admin_id(value)
    where not (admin_id.value = any(new_active_ids))
  ) then
    raise exception 'Event admins must be active participants'
      using errcode = '22023';
  end if;

  if pg_catalog.cardinality(new_active_ids) > 0
    and pg_catalog.cardinality(new_admin_ids) = 0 then
    raise exception 'A shared event must keep at least one active admin'
      using errcode = '22023';
  end if;

  actor_is_leaving :=
    actor_participant_id = any(old_active_ids)
    and not (actor_participant_id = any(new_active_ids))
    and pg_catalog.array_remove(old_active_ids, actor_participant_id) = new_active_ids
    and old_event ->> 'createdByParticipantId' is distinct from actor_participant_id
    and pg_catalog.cardinality(new_admin_ids) > 0
    and (
      old_admin_ids = new_admin_ids
      or pg_catalog.array_remove(old_admin_ids, actor_participant_id) = new_admin_ids
    );

  actor_is_joining :=
    not (actor_participant_id = any(old_active_ids))
    and actor_participant_id = any(new_active_ids)
    and pg_catalog.cardinality(new_active_ids) =
      pg_catalog.cardinality(old_active_ids) + 1
    and old_active_ids <@ new_active_ids
    and old_admin_ids = new_admin_ids;

  actor_is_adding_offline_guests :=
    actor_participant_id = any(old_active_ids)
    and private.is_safe_offline_guest_addition(old.state, new.state);

  actor_is_updating_own_profile :=
    actor_participant_id = any(old_active_ids)
    and private.is_safe_self_profile_update(
      old.state,
      new.state,
      actor_participant_id
    );

  if (
    old_participant_ids is distinct from new_participant_ids
    or old_inactive_ids is distinct from new_inactive_ids
    or old_admin_ids is distinct from new_admin_ids
  ) and not actor_is_admin
    and not actor_is_leaving
    and not actor_is_joining
    and not actor_is_adding_offline_guests then
    raise exception 'Only an event admin can manage event membership'
      using errcode = '42501';
  end if;

  if not actor_is_admin then
    if old.state -> 'deletedParticipants' is distinct from
      new.state -> 'deletedParticipants' then
      raise exception 'Only an event admin can merge participant identities'
        using errcode = '42501';
    end if;

    if old.state - array['events', 'participants', 'deletedParticipants'] is distinct from
      new.state - array['events', 'participants', 'deletedParticipants'] then
      raise exception 'Only an event admin can change shared event metadata'
        using errcode = '42501';
    end if;

    if actor_is_joining or actor_is_leaving then
      if old_event - array[
          'participantIds',
          'inactiveParticipantIds',
          'membershipUpdatedAt',
          'membershipUpdatedAtByParticipant',
          'adminIds',
          'adminIdsUpdatedAt'
        ] is distinct from new_event - array[
          'participantIds',
          'inactiveParticipantIds',
          'membershipUpdatedAt',
          'membershipUpdatedAtByParticipant',
          'adminIds',
          'adminIdsUpdatedAt'
        ] then
        raise exception 'A membership update cannot change event content'
          using errcode = '42501';
      end if;

      if actor_is_leaving
        and old.state -> 'participants' is distinct from
          new.state -> 'participants' then
        raise exception 'Leaving cannot change participant profiles'
          using errcode = '42501';
      end if;

      if actor_is_joining and (
        pg_catalog.jsonb_array_length(
          case
            when pg_catalog.jsonb_typeof(new.state -> 'participants') = 'array'
              then new.state -> 'participants'
            else '[]'::jsonb
          end
        ) > pg_catalog.jsonb_array_length(
          case
            when pg_catalog.jsonb_typeof(old.state -> 'participants') = 'array'
              then old.state -> 'participants'
            else '[]'::jsonb
          end
        ) + 1
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(old.state -> 'participants') = 'array'
                then old.state -> 'participants'
              else '[]'::jsonb
            end
          ) as old_participant(value)
          where not exists (
            select 1
            from pg_catalog.jsonb_array_elements(
              case
                when pg_catalog.jsonb_typeof(new.state -> 'participants') = 'array'
                  then new.state -> 'participants'
                else '[]'::jsonb
              end
            ) as new_participant(value)
            where new_participant.value = old_participant.value
          )
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(new.state -> 'participants') = 'array'
                then new.state -> 'participants'
              else '[]'::jsonb
            end
          ) as new_participant(value)
          where not exists (
            select 1
            from pg_catalog.jsonb_array_elements(
              case
                when pg_catalog.jsonb_typeof(old.state -> 'participants') = 'array'
                  then old.state -> 'participants'
                else '[]'::jsonb
              end
            ) as old_participant(value)
            where old_participant.value = new_participant.value
          )
          and new_participant.value ->> 'id' is distinct from actor_participant_id
        )
      ) then
        raise exception 'Joining can add only the authenticated participant profile'
          using errcode = '42501';
      end if;
    else
      if not (actor_participant_id = any(old_active_ids)) then
        raise exception 'The event state must include the active member before editing'
          using errcode = '42501';
      end if;

      if not actor_is_adding_offline_guests
        and not actor_is_updating_own_profile
        and old.state -> 'participants' is distinct from
          new.state -> 'participants' then
        raise exception 'Only an event admin can change participant profiles'
          using errcode = '42501';
      end if;

      if old_event - (case
          when actor_is_adding_offline_guests then array[
            'participantIds',
            'inactiveParticipantIds',
            'membershipUpdatedAt',
            'membershipUpdatedAtByParticipant',
            'updatedAt',
            'expenses',
            'deletedExpenses',
            'transfers',
            'transferStatusUpdates',
            'activityLog'
          ]
          else array[
            'updatedAt',
            'expenses',
            'deletedExpenses',
            'transfers',
            'transferStatusUpdates',
            'activityLog'
          ]
        end) is distinct from new_event - (case
          when actor_is_adding_offline_guests then array[
            'participantIds',
            'inactiveParticipantIds',
            'membershipUpdatedAt',
            'membershipUpdatedAtByParticipant',
            'updatedAt',
            'expenses',
            'deletedExpenses',
            'transfers',
            'transferStatusUpdates',
            'activityLog'
          ]
          else array[
            'updatedAt',
            'expenses',
            'deletedExpenses',
            'transfers',
            'transferStatusUpdates',
            'activityLog'
          ]
        end) then
        raise exception 'Only an event admin can change event settings'
          using errcode = '42501';
      end if;

      if coalesce((old_event ->> 'locked')::boolean, false)
        and (
          old_event -> 'expenses' is distinct from new_event -> 'expenses'
          or old_event -> 'deletedExpenses' is distinct from
            new_event -> 'deletedExpenses'
        ) then
        raise exception 'Expenses cannot be changed while the event is locked'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if coalesce((old_event ->> 'adminsCanEditOnly')::boolean, false)
    and not actor_is_admin
    and not actor_is_leaving
    and not actor_is_joining
    and not (
      actor_is_updating_own_profile
      and old.state - 'participants' is not distinct from
        new.state - 'participants'
    )
    and old.state is distinct from new.state then
    raise exception 'Only an event admin can edit this event'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.is_safe_self_profile_update(jsonb, jsonb, text)
  from public, anon, authenticated;

commit;
