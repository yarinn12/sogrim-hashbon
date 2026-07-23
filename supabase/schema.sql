create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_snapshots (
  id text primary key,
  access_key_hash text not null check (char_length(access_key_hash) = 64),
  owner_user_id uuid references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_snapshots
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

create index if not exists app_snapshots_owner_user_id_idx
  on public.app_snapshots (owner_user_id)
  where owner_user_id is not null;

update public.app_snapshots as snapshot
set owner_user_id = account.id
from auth.users as account
where snapshot.owner_user_id is null
  and account.raw_user_meta_data ->> 'account_space_id' = snapshot.id
  and snapshot.access_key_hash = pg_catalog.encode(
    extensions.digest(
      account.raw_user_meta_data ->> 'account_space_key',
      'sha256'
    ),
    'hex'
  );

alter table public.app_snapshots enable row level security;
alter table public.app_snapshots force row level security;

create or replace function public.request_space_key_hash()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when nullif(
      pg_catalog.current_setting('request.headers', true)::json ->> 'x-space-key',
      ''
    ) is null then null
    else pg_catalog.encode(
      extensions.digest(
        pg_catalog.current_setting('request.headers', true)::json ->> 'x-space-key',
        'sha256'
      ),
      'hex'
    )
  end;
$$;

revoke all on table public.app_snapshots from public, anon, authenticated;
grant select on table public.app_snapshots to anon, authenticated;
grant insert, update on table public.app_snapshots to authenticated;

revoke all on function public.request_space_key_hash() from public;
grant execute on function public.request_space_key_hash() to anon, authenticated;

drop policy if exists app_snapshots_select on public.app_snapshots;
create policy app_snapshots_select
  on public.app_snapshots
  for select
  to anon, authenticated
  using (access_key_hash = (select public.request_space_key_hash()));

drop policy if exists app_snapshots_insert on public.app_snapshots;
create policy app_snapshots_insert
  on public.app_snapshots
  for insert
  to authenticated
  with check (
    access_key_hash = (select public.request_space_key_hash())
    and (owner_user_id is null or owner_user_id = (select auth.uid()))
  );

drop policy if exists app_snapshots_update on public.app_snapshots;
create policy app_snapshots_update
  on public.app_snapshots
  for update
  to authenticated
  using (access_key_hash = (select public.request_space_key_hash()))
  with check (
    access_key_hash = (select public.request_space_key_hash())
    and (owner_user_id is null or owner_user_id = (select auth.uid()))
  );

drop policy if exists app_snapshots_owner_select on public.app_snapshots;
create policy app_snapshots_owner_select
  on public.app_snapshots
  for select
  to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists app_snapshots_owner_insert on public.app_snapshots;
create policy app_snapshots_owner_insert
  on public.app_snapshots
  for insert
  to authenticated
  with check (owner_user_id = (select auth.uid()));

drop policy if exists app_snapshots_owner_update on public.app_snapshots;
create policy app_snapshots_owner_update
  on public.app_snapshots
  for update
  to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

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
      pg_catalog.coalesce(
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
            pg_catalog.coalesce(snapshot.state -> 'participants', '[]'::jsonb)
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

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
