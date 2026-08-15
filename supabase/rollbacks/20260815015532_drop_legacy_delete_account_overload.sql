begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.delete_account_data(
  p_user_id uuid,
  p_space_id text,
  p_space_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_snapshot public.app_snapshots%rowtype;
  participant_id text := 'account-' || p_user_id::text;
  anonymized_count integer := 0;
  workspace_deleted boolean := false;
begin
  select *
    into account_snapshot
    from public.app_snapshots
    where id = p_space_id
    for update;

  if found then
    if not (
      account_snapshot.owner_user_id = p_user_id
      or account_snapshot.access_key_hash = p_space_key_hash
    ) then
      raise exception 'workspace ownership mismatch';
    end if;

    delete from public.app_snapshots where id = p_space_id;
    workspace_deleted := true;
  end if;

  update public.app_snapshots as snapshot
    set state = pg_catalog.jsonb_set(
      snapshot.state,
      '{participants}',
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            case
              when participant ->> 'id' = participant_id then
                pg_catalog.jsonb_set(
                  participant - 'email' - 'authProvider' - 'authSubject',
                  '{displayName}',
                  pg_catalog.to_jsonb('משתמש שנמחק'::text),
                  true
                )
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
  where snapshot.id <> p_space_id
    and pg_catalog.jsonb_typeof(snapshot.state -> 'participants') = 'array'
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(snapshot.state -> 'participants') as participant
      where participant ->> 'id' = participant_id
    );

  get diagnostics anonymized_count = row_count;

  return pg_catalog.jsonb_build_object(
    'workspace_deleted', workspace_deleted,
    'shared_records_anonymized', anonymized_count
  );
end;
$$;

revoke all on function public.delete_account_data(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid, text, text)
  to service_role;

commit;
