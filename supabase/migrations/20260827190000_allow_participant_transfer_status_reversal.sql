begin;

create or replace function private.is_safe_transfer_status_only_update(
  p_snapshot_id text,
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
  old_event jsonb := coalesce(p_old_state -> 'events' -> 0, '{}'::jsonb);
  new_event jsonb := coalesce(p_new_state -> 'events' -> 0, '{}'::jsonb);
  old_activity jsonb := case
    when pg_catalog.jsonb_typeof(old_event -> 'activityLog') = 'array'
      then old_event -> 'activityLog'
    else '[]'::jsonb
  end;
  new_activity jsonb := case
    when pg_catalog.jsonb_typeof(new_event -> 'activityLog') = 'array'
      then new_event -> 'activityLog'
    else '[]'::jsonb
  end;
  changed_transfer_count integer := 0;
  added_activity_count integer := 0;
  removed_activity_count integer := 0;
begin
  if coalesce(p_snapshot_id, '') = ''
    or coalesce(p_actor_participant_id, '') = ''
    or p_old_state - 'events' is distinct from p_new_state - 'events'
    or old_event - array[
      'updatedAt',
      'transfers',
      'transferStatusUpdates',
      'activityLog'
    ] is distinct from new_event - array[
      'updatedAt',
      'transfers',
      'transferStatusUpdates',
      'activityLog'
    ]
    or pg_catalog.jsonb_typeof(old_event -> 'transfers') <> 'array'
    or pg_catalog.jsonb_typeof(new_event -> 'transfers') <> 'array'
    or pg_catalog.jsonb_typeof(new_event -> 'transferStatusUpdates') <> 'array'
    or pg_catalog.jsonb_array_length(old_event -> 'transfers')
      <> pg_catalog.jsonb_array_length(new_event -> 'transfers')
    or not (
      p_actor_participant_id = any(private.active_event_participant_ids(p_old_state))
    ) then
    return false;
  end if;

  if not private.has_authorized_transfer_status_changes(
    p_old_state,
    p_new_state,
    p_actor_participant_id,
    p_snapshot_id
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(old_event -> 'transfers') as old_item(value)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(new_event -> 'transfers') as new_item(value)
      where new_item.value ->> 'id' = old_item.value ->> 'id'
    )
  ) then
    return false;
  end if;

  select count(*) into changed_transfer_count
  from pg_catalog.jsonb_array_elements(new_event -> 'transfers') as new_item(value)
  join pg_catalog.jsonb_array_elements(old_event -> 'transfers') as old_item(value)
    on old_item.value ->> 'id' = new_item.value ->> 'id'
  where old_item.value is distinct from new_item.value;

  if changed_transfer_count < 1 then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(new_event -> 'transfers') as new_item(value)
    join pg_catalog.jsonb_array_elements(old_event -> 'transfers') as old_item(value)
      on old_item.value ->> 'id' = new_item.value ->> 'id'
    where old_item.value is distinct from new_item.value
      and p_actor_participant_id is distinct from new_item.value ->> 'fromParticipantId'
      and p_actor_participant_id is distinct from new_item.value ->> 'toParticipantId'
      and not (
        p_actor_participant_id = any(private.event_admin_ids(p_old_state))
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(new_activity) as current_entry(value)
    join pg_catalog.jsonb_array_elements(old_activity) as previous_entry(value)
      on previous_entry.value ->> 'id' = current_entry.value ->> 'id'
    where previous_entry.value is distinct from current_entry.value
  ) then
    return false;
  end if;

  select count(*) into added_activity_count
  from pg_catalog.jsonb_array_elements(new_activity) as current_entry(value)
  where not exists (
    select 1
    from pg_catalog.jsonb_array_elements(old_activity) as previous_entry(value)
    where previous_entry.value = current_entry.value
  );

  select count(*) into removed_activity_count
  from pg_catalog.jsonb_array_elements(old_activity) as previous_entry(value)
  where not exists (
    select 1
    from pg_catalog.jsonb_array_elements(new_activity) as current_entry(value)
    where current_entry.value = previous_entry.value
  );

  if added_activity_count <> changed_transfer_count
    or (
      removed_activity_count > 0
      and not (
        pg_catalog.jsonb_array_length(old_activity) = 100
        and pg_catalog.jsonb_array_length(new_activity) = 100
        and removed_activity_count = added_activity_count
      )
    ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(new_activity) as activity(value)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(old_activity) as previous(value)
      where previous.value = activity.value
    )
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(new_event -> 'transferStatusUpdates') as status(value)
        join pg_catalog.jsonb_array_elements(new_event -> 'transfers') as transfer(value)
          on transfer.value ->> 'id' = status.value ->> 'id'
        join pg_catalog.jsonb_array_elements(old_event -> 'transfers') as old_transfer(value)
          on old_transfer.value ->> 'id' = transfer.value ->> 'id'
        where old_transfer.value is distinct from transfer.value
          and activity.value ->> 'entityId' = transfer.value ->> 'id'
          and activity.value ->> 'actorParticipantId' = p_actor_participant_id
          and activity.value ->> 'fromParticipantId' = transfer.value ->> 'fromParticipantId'
          and activity.value ->> 'toParticipantId' = transfer.value ->> 'toParticipantId'
          and activity.value ->> 'occurredAt' = status.value ->> 'updatedAt'
          and activity.value ->> 'kind' = case
            when status.value ->> 'status' = 'paid' then 'transfer-paid'
            else 'transfer-pending'
          end
      )
  ) then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

-- next function --

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
  actor_is_updating_transfer_status boolean;
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

  actor_is_updating_transfer_status :=
    actor_participant_id = any(old_active_ids)
    and private.is_safe_transfer_status_only_update(
      new.id,
      old.state,
      new.state,
      actor_participant_id
    );

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
    and not actor_is_updating_transfer_status
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

-- next function --

create or replace function private.guard_shared_event_history_and_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_event jsonb := coalesce(new.state -> 'events' -> 0, '{}'::jsonb);
  account_link jsonb := case when tg_op = 'UPDATE' then
    private.authorized_shared_event_account_link(
      new.id,
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
  else null end;
begin
  if new.owner_user_id is not null or new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  if pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transfers', '[]'::jsonb)
    ) > 500
    or pg_catalog.jsonb_array_length(
      coalesce(new_event -> 'transferStatusUpdates', '[]'::jsonb)
    ) > 500 then
    raise exception 'Shared event transfer history is too large'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and not private.is_safe_shared_event_deletion(
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
    and not private.is_safe_transfer_status_only_update(
      new.id,
      old.state,
      new.state,
      private.current_actor_participant_id()
    )
    and not private.has_preserved_paid_transfer_history(old.state, new.state)
    and not private.has_preserved_paid_history_for_account_link(
      old.state,
      new.state,
      account_link
    ) then
    raise exception 'Completed payment history cannot be removed or rewritten'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.is_safe_transfer_status_only_update(text, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function private.guard_shared_snapshot_update()
  from public, anon, authenticated;
revoke all on function private.guard_shared_event_history_and_limits()
  from public, anon, authenticated;

commit;
