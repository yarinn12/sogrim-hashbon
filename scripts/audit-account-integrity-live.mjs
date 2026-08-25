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
  const [accounts] = await sql`
    select
      count(*)::integer as total,
      count(*) filter (where account.email_confirmed_at is null)::integer as unconfirmed,
      count(*) filter (
        where account.email_confirmed_at is null
          and account.created_at < pg_catalog.now() - interval '24 hours'
      )::integer as stale_unconfirmed,
      count(*) filter (where profile.user_id is null)::integer as missing_profile,
      count(*) filter (where invite.user_id is null)::integer as missing_friend_code,
      count(*) filter (
        where nullif(account.raw_user_meta_data ->> 'account_space_id', '') is null
      )::integer as missing_workspace_metadata,
      count(*) filter (
        where nullif(account.raw_user_meta_data ->> 'account_space_id', '') is null
          and account.email_confirmed_at is not null
          and account.last_sign_in_at is not null
          and account.updated_at < pg_catalog.now() - interval '10 minutes'
      )::integer as active_accounts_missing_workspace_metadata,
      count(*) filter (
        where nullif(account.raw_user_meta_data ->> 'account_space_id', '') is null
          and account.email_confirmed_at is not null
          and account.last_sign_in_at is not null
          and account.updated_at < pg_catalog.now() - interval '10 minutes'
          and account.email not like 'qa-%@example.test'
          and account.email <> 'store-review@sogrimhashbon.app'
      )::integer as active_non_test_accounts_missing_workspace_metadata,
      count(*) filter (
        where nullif(account.raw_user_meta_data ->> 'account_space_id', '') is not null
          and snapshot.id is null
          and account.last_sign_in_at is not null
      )::integer as initialized_accounts_missing_workspace,
      count(*) filter (
        where snapshot.id is not null
          and snapshot.owner_user_id is distinct from account.id
      )::integer as wrong_workspace_owner,
      count(*) filter (
        where snapshot.id is not null
          and snapshot.state ->> 'currentParticipantId'
            is distinct from 'account-' || account.id::text
      )::integer as wrong_current_participant
    from auth.users as account
    left join public.user_profiles as profile on profile.user_id = account.id
    left join public.friend_invite_codes as invite on invite.user_id = account.id
    left join public.app_snapshots as snapshot
      on snapshot.id = account.raw_user_meta_data ->> 'account_space_id'
  `;

  const [duplicates] = await sql`
    select
      (
        select count(*)::integer
        from (
          select pg_catalog.lower(email)
          from auth.users
          where email is not null
          group by pg_catalog.lower(email)
          having count(*) > 1
        ) as duplicate_email
      ) as duplicate_email_groups,
      (
        select count(*)::integer
        from (
          select username
          from public.user_profiles
          group by username
          having count(*) > 1
        ) as duplicate_username
      ) as duplicate_username_groups,
      (
        select count(*)::integer
        from (
          select least(requester_id, addressee_id), greatest(requester_id, addressee_id)
          from public.friendships
          group by least(requester_id, addressee_id), greatest(requester_id, addressee_id)
          having count(*) > 1
        ) as duplicate_friendship
      ) as duplicate_friendship_pairs,
      (
        select count(*)::integer
        from (
          select owner_user_id
          from public.app_snapshots
          where snapshot_kind = 'workspace' and owner_user_id is not null
          group by owner_user_id
          having count(*) > 1
        ) as duplicate_workspace
      ) as accounts_with_multiple_owned_workspaces,
      (
        select count(*)::integer
        from (
          select snapshot.id, participant ->> 'authSubject'
          from public.app_snapshots as snapshot
          cross join lateral pg_catalog.jsonb_array_elements(
            coalesce(snapshot.state -> 'participants', '[]'::jsonb)
          ) as participant
          where nullif(participant ->> 'authSubject', '') is not null
          group by snapshot.id, participant ->> 'authSubject'
          having count(*) > 1
        ) as duplicate_identity
      ) as snapshots_with_duplicate_account_identity
  `;

  const details = process.argv.includes("--details")
    ? await sql`
        select
          account.id as user_id,
          coalesce(account.raw_app_meta_data ->> 'provider', '') as provider,
          account.created_at,
          account.updated_at,
          account.last_sign_in_at,
          account.email_confirmed_at is not null as email_confirmed,
          coalesce(account.raw_user_meta_data ? 'full_name', false) as has_full_name,
          coalesce(account.raw_user_meta_data ? 'username', false) as has_username
        from auth.users as account
        where nullif(account.raw_user_meta_data ->> 'account_space_id', '') is null
        order by account.created_at
      `
    : undefined;

  const failures = Object.entries({ ...accounts, ...duplicates })
    .filter(([key, value]) =>
      ![
        "total",
        "unconfirmed",
        "stale_unconfirmed",
        "missing_workspace_metadata",
        "active_accounts_missing_workspace_metadata",
        "active_non_test_accounts_missing_workspace_metadata"
      ].includes(key) && Number(value) > 0
    )
    .map(([key]) => key);
  const warnings = [
    ...(Number(accounts.stale_unconfirmed) > 0 ? ["stale_unconfirmed"] : []),
    ...(Number(accounts.active_accounts_missing_workspace_metadata) > 0
      ? ["incomplete_first_login_repaired_on_next_sign_in"]
      : [])
  ];

  console.log(JSON.stringify({
    ok: failures.length === 0,
    accounts,
    duplicates,
    failures,
    warnings,
    ...(details ? { details } : {})
  }));
  if (failures.length) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
