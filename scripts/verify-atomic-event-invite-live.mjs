import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

import {
  accountProfileFromUser,
  signInWithPassword
} from "../src/data/accountAuth.mjs";
import { saveCloudState } from "../src/data/cloudStore.mjs";
import { saveSharedEventState } from "../src/data/sharedEventStore.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");

const origin = String(
  process.env.TWO_ACCOUNT_QA_ORIGIN || "https://sogrim-hesbon-app.vercel.app"
).replace(/\/+$/, "");
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const eventId = `event-atomic-invite-${suffix}`;
const eventSpace = {
  id: `space-atomic-invite-event-${suffix}`,
  key: randomBytes(32).toString("base64url")
};
const createdUserIds = [];
const createdSpaceIds = new Set([eventSpace.id]);
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const owner = await createAccount("owner", "בעל בדיקה אטומית");
  const joiner = await createAccount("joiner", "מצטרף בדיקה אטומית");
  const ownerProfile = accountProfileFromUser(owner.session.user);
  const joinerProfile = accountProfileFromUser(joiner.session.user);
  const ownerConfig = runtimeConfig(owner);
  const joinerConfig = runtimeConfig(joiner);

  let ownerState = accountState(ownerProfile);
  await saveCloudState(ownerConfig, ownerState);
  await saveCloudState(joinerConfig, accountState(joinerProfile));

  ownerState.events = [{
    id: eventId,
    name: "בדיקת פדיון אטומי",
    eventType: "standard",
    currency: "ILS",
    participantIds: [ownerProfile.participantId],
    adminIds: [ownerProfile.participantId],
    createdByParticipantId: ownerProfile.participantId,
    adminsCanEditOnly: false,
    roundSettlementTransfers: false,
    locked: false,
    closedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sharedSpaceId: eventSpace.id,
    sharedSpaceKey: eventSpace.key,
    inactiveParticipantIds: [],
    participantAliases: {},
    distinctParticipantPairs: [],
    expenses: [],
    deletedExpenses: [],
    activityLog: [],
    transfers: []
  }];
  await saveCloudState(ownerConfig, ownerState);
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);

  const inviteResponse = await fetch(`${origin}/api/event-invites/open-link`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${owner.session.access_token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ eventId, candidateToken: "", operation: "ensure" })
  });
  const invite = await inviteResponse.json().catch(() => ({}));
  assert.equal(inviteResponse.ok, true, JSON.stringify(invite));
  assert.match(String(invite.token ?? ""), /^[A-Za-z0-9_-]{32,128}$/);

  // Stop at the production redeem response. No browser hydration, shared save
  // or personal-workspace save runs after this request.
  const startedAt = performance.now();
  const redeemResponse = await fetch(`${origin}/api/event-invites/redeem`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${joiner.session.access_token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ eventId, token: invite.token })
  });
  const redeem = await redeemResponse.json().catch(() => ({}));
  const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
  assert.equal(redeemResponse.ok, true, JSON.stringify(redeem));

  const [result] = await sql`
    select
      exists (
        select 1
        from private.shared_snapshot_members as member
        where member.snapshot_id = ${eventSpace.id}
          and member.user_id = ${joiner.session.user.id}::uuid
          and member.status = 'active'
          and member.removed_at is null
          and member.pending_join_until is null
      ) as membership_committed,
      exists (
        select 1
        from public.app_snapshots as shared
        where shared.id = ${eventSpace.id}
          and shared.snapshot_kind = 'shared_event'
          and shared.state -> 'events' -> 0 -> 'participantIds'
            ? ${joinerProfile.participantId}
      ) as canonical_participant_committed,
      exists (
        select 1
        from public.app_snapshots as workspace
        cross join lateral pg_catalog.jsonb_array_elements(
          coalesce(workspace.state -> 'events', '[]'::jsonb)
        ) as personal_event(value)
        where workspace.id = ${joiner.workspace.id}
          and workspace.owner_user_id = ${joiner.session.user.id}::uuid
          and personal_event.value ->> 'id' = ${eventId}
          and personal_event.value ->> 'sharedSpaceId' = ${eventSpace.id}
          and personal_event.value -> 'participantIds'
            ? ${joinerProfile.participantId}
      ) as personal_event_committed
  `;

  assert.equal(result?.membership_committed, true);
  assert.equal(result?.canonical_participant_committed, true);
  assert.equal(result?.personal_event_committed, true);
  console.log(JSON.stringify({
    ok: true,
    elapsedMs,
    stoppedAfterProductionRedeem: true,
    membershipCommitted: true,
    canonicalParticipantCommitted: true,
    personalEventCommitted: true
  }));
} finally {
  const cleanupErrors = [];
  for (const spaceId of createdSpaceIds) {
    try {
      await adminRequest(`/rest/v1/app_snapshots?id=eq.${encodeURIComponent(spaceId)}`, {
        method: "DELETE"
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  for (const userId of createdUserIds) {
    try {
      await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  await sql.end({ timeout: 5 });
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, "Atomic invite QA cleanup failed");
  }
}

async function createAccount(role, displayName) {
  const workspace = {
    id: `space-atomic-invite-${role}-${suffix}`,
    key: randomBytes(32).toString("base64url")
  };
  const email = `qa-atomic-invite-${role}-${suffix}@example.test`;
  const password = `${randomBytes(18).toString("base64url")}Aa1!`;
  const username = `qa_atomic_${role}_${randomBytes(4).toString("hex")}`;
  const user = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
        username,
        account_space_id: workspace.id,
        account_space_key: workspace.key
      }
    }
  });
  createdUserIds.push(user.id);
  createdSpaceIds.add(workspace.id);
  const session = await signInWithPassword(
    { storage: { mode: "supabase", url: supabaseUrl, anonKey } },
    { email, password }
  );
  assert.equal(session.user.id, user.id);
  return { session, workspace };
}

function runtimeConfig(account) {
  return {
    storage: {
      mode: "supabase",
      url: supabaseUrl,
      anonKey,
      table: "app_snapshots",
      spaceId: account.workspace.id,
      spaceKey: account.workspace.key,
      account: {
        userId: account.session.user.id,
        accessToken: account.session.access_token,
        spaceId: account.workspace.id
      }
    }
  };
}

function accountState(profile) {
  return {
    currentParticipantId: profile.participantId,
    participants: [{
      id: profile.participantId,
      displayName: profile.displayName,
      kind: "user",
      authProvider: profile.authProvider,
      authSubject: profile.authSubject,
      email: profile.email,
      accountLinked: true
    }],
    groups: [],
    events: [],
    deletedEvents: [],
    deletedParticipants: []
  };
}

async function adminRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (response.status === 204) return {};
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.message || payload.msg || payload.error ||
        `Supabase request failed (${response.status})`
    );
  }
  return payload;
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required for atomic invite QA.`);
  return value;
}
