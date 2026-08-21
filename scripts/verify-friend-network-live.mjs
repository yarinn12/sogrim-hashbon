import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { signInWithPassword } from "../src/data/accountAuth.mjs";
import {
  loadFriendNetwork,
  manageFriendship,
  requestFriendship,
  requestFriendshipByUsername,
  setFriendUsername,
  syncFriendProfile
} from "../src/data/friendsStore.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const suffix = `${Date.now()}${randomBytes(3).toString("hex")}`;
const createdUserIds = [];

try {
  const owner = await createTemporaryAccount("owner", "QA Friend Owner");
  const peer = await createTemporaryAccount("peer", "QA Friend Peer");
  const ownerConfig = runtimeConfig(owner);
  const peerConfig = runtimeConfig(peer);
  const ownerUsername = `qa_owner_${suffix.slice(-10)}`;
  const peerUsername = `qa_peer_${suffix.slice(-10)}`;

  const ownerInitial = await loadFriendNetwork(ownerConfig);
  const peerInitial = await loadFriendNetwork(peerConfig);
  assert.match(ownerInitial.friendCode, /^[a-f0-9]{20}$/);
  assert.match(peerInitial.friendCode, /^[a-f0-9]{20}$/);
  assert.ok(ownerInitial.profiles.some((profile) => profile.user_id === owner.userId));
  assert.ok(peerInitial.profiles.some((profile) => profile.user_id === peer.userId));

  await setFriendUsername(ownerConfig, ownerUsername);
  await setFriendUsername(peerConfig, peerUsername);
  await syncFriendProfile(ownerConfig, {
    displayName: "QA Friend Owner Updated",
    avatarPreset: "avatar-1"
  });

  const ownerProfileNetwork = await loadFriendNetwork(ownerConfig);
  const ownerProfile = ownerProfileNetwork.profiles.find(
    (profile) => profile.user_id === owner.userId
  );
  assert.equal(ownerProfile?.username, ownerUsername);
  assert.equal(ownerProfile?.display_name, "QA Friend Owner Updated");
  assert.equal(ownerProfile?.avatar_preset, "avatar-1");

  const pending = await requestFriendshipByUsername(ownerConfig, peerUsername);
  assert.equal(pending.status, "pending");

  const peerPending = await loadFriendNetwork(peerConfig);
  const pendingRelationship = peerPending.friendships.find(
    (friendship) => friendship.id === pending.id
  );
  assert.equal(pendingRelationship?.requester_id, owner.userId);
  assert.equal(pendingRelationship?.addressee_id, peer.userId);
  assert.equal(pendingRelationship?.status, "pending");
  assert.ok(peerPending.profiles.some((profile) => profile.user_id === owner.userId));

  await manageFriendship(peerConfig, pending.id, "accept");
  await assertAcceptedFriendship(ownerConfig, owner.userId, peer.userId);
  await assertAcceptedFriendship(peerConfig, owner.userId, peer.userId);

  await manageFriendship(ownerConfig, pending.id, "remove");
  assert.equal((await loadFriendNetwork(ownerConfig)).friendships.length, 0);
  assert.equal((await loadFriendNetwork(peerConfig)).friendships.length, 0);

  const reversePending = await requestFriendship(
    peerConfig,
    ownerInitial.friendCode
  );
  assert.equal(reversePending.status, "pending");
  const mutual = await requestFriendshipByUsername(ownerConfig, peerUsername);
  assert.equal(mutual.status, "accepted");
  await assertAcceptedFriendship(ownerConfig, owner.userId, peer.userId);
  await assertAcceptedFriendship(peerConfig, owner.userId, peer.userId);

  console.log(JSON.stringify({
    ok: true,
    checks: {
      accountProfilesCreated: true,
      uniqueUsernamesSaved: true,
      profileSyncSaved: true,
      requestByUsernameDelivered: true,
      recipientAccepted: true,
      removalSynced: true,
      inviteCodeRequestDelivered: true,
      mutualRequestAutoAccepted: true,
      temporaryDataCleanup: true
    }
  }));
} finally {
  const cleanupErrors = [];
  for (const userId of createdUserIds.reverse()) {
    try {
      await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, "Friend network QA cleanup failed");
  }
}

async function assertAcceptedFriendship(config, firstUserId, secondUserId) {
  const network = await loadFriendNetwork(config);
  const relationship = network.friendships.find(
    (friendship) =>
      new Set([friendship.requester_id, friendship.addressee_id]).has(firstUserId) &&
      new Set([friendship.requester_id, friendship.addressee_id]).has(secondUserId)
  );
  assert.equal(relationship?.status, "accepted");
  assert.ok(network.profiles.some((profile) => profile.user_id === firstUserId));
  assert.ok(network.profiles.some((profile) => profile.user_id === secondUserId));
}

async function createTemporaryAccount(role, displayName) {
  const workspace = {
    id: `space-friend-${role}-${suffix}`,
    key: randomBytes(32).toString("base64url")
  };
  const email = `qa-friend-${role}-${suffix}@example.test`;
  const password = `${randomBytes(18).toString("base64url")}Aa1!`;
  const user = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
        account_space_id: workspace.id,
        account_space_key: workspace.key
      }
    }
  });
  createdUserIds.push(user.id);
  const session = await signInWithPassword(
    { storage: { mode: "supabase", url: supabaseUrl, anonKey } },
    { email, password }
  );
  assert.equal(session.user.id, user.id);
  return { session, userId: user.id, workspace };
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
        userId: account.userId,
        accessToken: account.session.access_token,
        spaceId: account.workspace.id
      }
    }
  };
}

async function adminRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json"
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
  if (!value) throw new Error(`${name} is required for friend network QA.`);
  return value;
}
