import postgres from "postgres";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const [audit] = await sql`
    with account_workspaces as (
      select
        users.id as user_id,
        nullif(users.raw_user_meta_data ->> 'account_space_id', '') as space_id
      from auth.users as users
    ), joined as (
      select
        account.user_id,
        account.space_id,
        snapshot.owner_user_id,
        snapshot.state,
        snapshot.id is not null as snapshot_exists
      from account_workspaces as account
      left join public.app_snapshots as snapshot
        on snapshot.id = account.space_id
      where account.space_id is not null
    )
    select
      count(*)::integer as accounts_with_workspace,
      count(*) filter (where not snapshot_exists)::integer as missing_snapshot,
      count(*) filter (where snapshot_exists and owner_user_id is null)::integer as ownerless_snapshot,
      count(*) filter (
        where owner_user_id is not null and owner_user_id <> user_id
      )::integer as wrong_owner,
      count(*) filter (
        where owner_user_id is null
          and state ->> 'currentParticipantId' = 'account-' || user_id::text
          and exists (
            select 1
            from jsonb_array_elements(coalesce(state -> 'participants', '[]'::jsonb)) as participant
            where participant ->> 'id' = 'account-' || user_id::text
              and participant ->> 'authSubject' = user_id::text
          )
      )::integer as safely_repairable_ownerless
    from joined
  `;
  const mismatches = await sql`
    with account_workspaces as (
      select
        users.id as user_id,
        users.created_at,
        coalesce(users.raw_user_meta_data ->> 'full_name', '') as display_name,
        nullif(users.raw_user_meta_data ->> 'account_space_id', '') as configured_space_id
      from auth.users as users
    )
    select
      account.user_id,
      account.created_at,
      account.display_name,
      account.configured_space_id,
      configured.owner_user_id as configured_owner_user_id,
      configured.state ->> 'currentParticipantId' as configured_current_participant_id,
      coalesce(owned.owned_spaces, array[]::text[]) as owned_spaces,
      coalesce(referenced.referenced_spaces, array[]::text[]) as referenced_spaces
    from account_workspaces as account
    join public.app_snapshots as configured
      on configured.id = account.configured_space_id
    left join lateral (
      select array_agg(snapshot.id order by snapshot.updated_at desc) as owned_spaces
      from public.app_snapshots as snapshot
      where snapshot.owner_user_id = account.user_id
        and snapshot.snapshot_kind = 'workspace'
    ) as owned on true
    left join lateral (
      select array_agg(snapshot.id order by snapshot.updated_at desc) as referenced_spaces
      from public.app_snapshots as snapshot
      where snapshot.snapshot_kind = 'workspace'
        and exists (
          select 1
          from jsonb_array_elements(coalesce(snapshot.state -> 'participants', '[]'::jsonb)) as participant
          where participant ->> 'authSubject' = account.user_id::text
        )
    ) as referenced on true
    where configured.owner_user_id is not null
      and configured.owner_user_id <> account.user_id
    order by account.created_at
  `;
  const missing = await sql`
    select
      users.id as user_id,
      users.created_at,
      coalesce(users.raw_user_meta_data ->> 'full_name', '') as display_name,
      users.raw_user_meta_data ->> 'account_space_id' as configured_space_id,
      char_length(coalesce(users.raw_user_meta_data ->> 'account_space_key', '')) as configured_key_length
    from auth.users as users
    left join public.app_snapshots as snapshot
      on snapshot.id = users.raw_user_meta_data ->> 'account_space_id'
    where nullif(users.raw_user_meta_data ->> 'account_space_id', '') is not null
      and snapshot.id is null
    order by users.created_at
  `;
  console.log(JSON.stringify({ audit, mismatches, missing }));
} finally {
  await sql.end({ timeout: 5 });
}
