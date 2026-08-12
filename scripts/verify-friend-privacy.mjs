import { resolve } from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

const root = process.cwd();
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  await sql.unsafe("begin");
  const users = await sql`
    select id
    from auth.users
    order by created_at
    limit 3
  `;
  if (users.length < 3) {
    throw new Error("Friend privacy verification requires three test accounts");
  }

  const [first, second, outsider] = users.map((user) => user.id);
  await sql`
    delete from public.friendships
    where requester_id in (${first}, ${second}, ${outsider})
       or addressee_id in (${first}, ${second}, ${outsider})
  `;
  const [secondProfile] = await sql`
    select username
    from public.user_profiles
    where user_id = ${second}
  `;
  if (!secondProfile?.username) throw new Error("Friend username is missing");

  const directPrivileges = await sql`
    select
      has_table_privilege('authenticated', 'public.friendships', 'INSERT') as can_insert,
      has_table_privilege('authenticated', 'public.friendships', 'UPDATE') as can_update,
      has_table_privilege('authenticated', 'public.friendships', 'DELETE') as can_delete
  `;
  if (
    directPrivileges[0]?.can_insert ||
    directPrivileges[0]?.can_update ||
    directPrivileges[0]?.can_delete
  ) {
    throw new Error("Authenticated users have unsafe direct friendship mutation grants");
  }

  await assumeAuthenticatedUser(sql, first);
  const profilesBeforeRequest = await sql`
    select user_id
    from public.user_profiles
    where user_id in (${first}, ${second}, ${outsider})
  `;
  assertIds(profilesBeforeRequest, [first], "profile privacy before request");

  const [requestResult] = await sql`
    select public.request_friendship_by_username(
      ${secondProfile.username}
    ) as friendship
  `;
  const friendshipId = requestResult?.friendship?.id;
  if (!friendshipId) throw new Error("Friend request RPC did not return an id");

  const profilesAfterRequest = await sql`
    select user_id
    from public.user_profiles
    where user_id in (${first}, ${second}, ${outsider})
  `;
  assertIds(
    profilesAfterRequest,
    [first, second],
    "profile privacy after pending request"
  );

  await assumeAuthenticatedUser(sql, outsider);
  const outsiderFriendships = await sql`
    select id
    from public.friendships
    where id = ${friendshipId}
  `;
  if (outsiderFriendships.length) {
    throw new Error("An unrelated user can read another friendship");
  }
  const outsiderProfiles = await sql`
    select user_id
    from public.user_profiles
    where user_id in (${first}, ${second}, ${outsider})
  `;
  assertIds(outsiderProfiles, [outsider], "unrelated profile privacy");

  await assumeAuthenticatedUser(sql, second);
  const [acceptResult] = await sql`
    select public.manage_friendship(${friendshipId}, 'accept') as friendship
  `;
  if (acceptResult?.friendship?.status !== "accepted") {
    throw new Error("Friend request was not accepted by the recipient");
  }

  await assumeAuthenticatedUser(sql, first);
  const [acceptedRelation] = await sql`
    select status
    from public.friendships
    where id = ${friendshipId}
  `;
  if (acceptedRelation?.status !== "accepted") {
    throw new Error("Accepted friendship is not visible to its requester");
  }

  await sql.unsafe("rollback");
  console.log("Friend privacy RLS and approval flow are verified.");
} catch (error) {
  await sql.unsafe("rollback").catch(() => {});
  throw error;
} finally {
  await sql.end({ timeout: 5 });
}

async function assumeAuthenticatedUser(sql, userId) {
  await sql.unsafe("reset role");
  await sql`select set_config('request.jwt.claim.sub', ${userId}, true)`;
  await sql.unsafe("set local role authenticated");
}

function assertIds(rows, expectedIds, label) {
  const actual = rows.map((row) => row.user_id).sort();
  const expected = [...expectedIds].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} failed: ${JSON.stringify(actual)}`);
  }
}
