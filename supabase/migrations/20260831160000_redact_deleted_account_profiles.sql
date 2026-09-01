begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.account_deletion_participant_tombstone(
  p_participant jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', p_participant ->> 'id',
    'displayName', 'משתמש שנמחק',
    'kind', 'user',
    'accountDeleted', true
  );
$$;

create or replace function private.is_safe_account_deletion_anonymization(
  p_old_state jsonb,
  p_new_state jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with old_participants as (
    select participant, position
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(p_old_state -> 'participants') = 'array'
          then p_old_state -> 'participants'
        else '[]'::jsonb
      end
    ) with ordinality as item(participant, position)
  ),
  new_participants as (
    select participant, position
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
          then p_new_state -> 'participants'
        else '[]'::jsonb
      end
    ) with ordinality as item(participant, position)
  )
  select
    pg_catalog.jsonb_typeof(p_old_state -> 'participants') = 'array'
    and pg_catalog.jsonb_typeof(p_new_state -> 'participants') = 'array'
    and (p_old_state - 'participants') = (p_new_state - 'participants')
    and pg_catalog.jsonb_array_length(p_old_state -> 'participants') =
      pg_catalog.jsonb_array_length(p_new_state -> 'participants')
    and p_old_state -> 'participants' is distinct from p_new_state -> 'participants'
    and not exists (
      select 1
      from old_participants as old_item
      full join new_participants as new_item using (position)
      where old_item.participant is null
        or new_item.participant is null
        or (
          new_item.participant is distinct from old_item.participant
          and new_item.participant is distinct from
            private.account_deletion_participant_tombstone(
              old_item.participant
            )
        )
    );
$$;

create or replace function private.redact_deleted_account_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.snapshot_kind <> 'shared_event'
    or pg_catalog.jsonb_typeof(new.state -> 'participants') <> 'array' then
    return new;
  end if;

  new.state := pg_catalog.jsonb_set(
    new.state,
    '{participants}',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          case
            when participant.value ->> 'id' ~
              '^account-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              and not exists (
                select 1
                from auth.users as account
                where account.id = pg_catalog.substring(
                  participant.value ->> 'id',
                  9
                )::uuid
              ) then private.account_deletion_participant_tombstone(
                participant.value
              )
            else participant.value
          end
          order by participant.position
        )
        from pg_catalog.jsonb_array_elements(new.state -> 'participants')
          with ordinality as participant(value, position)
      ),
      '[]'::jsonb
    ),
    true
  );
  return new;
end;
$$;

create or replace function public.delete_account_data(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  participant_id text := 'account-' || p_user_id::text;
  anonymized_count integer := 0;
begin
  update public.app_snapshots as snapshot
    set state = pg_catalog.jsonb_set(
      snapshot.state,
      '{participants}',
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            case
              when participant ->> 'id' = participant_id then
                private.account_deletion_participant_tombstone(participant)
              else participant
            end
          )
          from pg_catalog.jsonb_array_elements(
            coalesce(snapshot.state -> 'participants', '[]'::jsonb)
          ) as participant
        ),
        '[]'::jsonb
      ),
      true
    ),
    updated_at = pg_catalog.now()
  where snapshot.owner_user_id is distinct from p_user_id
    and pg_catalog.jsonb_typeof(snapshot.state -> 'participants') = 'array'
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(snapshot.state -> 'participants') as participant
      where participant ->> 'id' = participant_id
    );

  get diagnostics anonymized_count = row_count;

  return pg_catalog.jsonb_build_object(
    'workspace_owned_by_user', exists (
      select 1
      from public.app_snapshots
      where owner_user_id = p_user_id
    ),
    'shared_records_anonymized', anonymized_count
  );
end;
$$;

drop trigger if exists aa_redact_deleted_account_participants
  on public.app_snapshots;
create trigger aa_redact_deleted_account_participants
  before insert or update of snapshot_kind, state on public.app_snapshots
  for each row execute function private.redact_deleted_account_participants();

revoke all on function private.account_deletion_participant_tombstone(jsonb)
  from public, anon, authenticated;
revoke all on function private.is_safe_account_deletion_anonymization(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function private.redact_deleted_account_participants()
  from public, anon, authenticated;
revoke all on function public.delete_account_data(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;

-- Repair existing shared snapshots that still contain profile metadata for an
-- account that has already been deleted. The trigger applies the same
-- allowlisted tombstone used by future writes.
alter table public.app_snapshots
  disable trigger guard_shared_snapshot_update;

update public.app_snapshots as snapshot
set state = snapshot.state,
  updated_at = snapshot.updated_at
where snapshot.snapshot_kind = 'shared_event'
  and pg_catalog.jsonb_typeof(snapshot.state -> 'participants') = 'array'
  and exists (
    select 1
    from pg_catalog.jsonb_array_elements(snapshot.state -> 'participants')
      as participant
    where participant ->> 'id' ~
      '^account-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and not exists (
        select 1
        from auth.users as account
        where account.id = pg_catalog.substring(participant ->> 'id', 9)::uuid
      )
      and participant is distinct from
        private.account_deletion_participant_tombstone(participant)
  );

alter table public.app_snapshots
  enable trigger guard_shared_snapshot_update;

commit;
