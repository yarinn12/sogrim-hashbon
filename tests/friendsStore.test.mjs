import test from "node:test";
import assert from "node:assert/strict";

import {
  blockConnectedUser,
  buildFriendInviteUrl,
  friendInviteCodeFromUrl,
  loadFriendNetwork,
  manageFriendship,
  normalizeFriendCode,
  requestFriendship,
  requestFriendshipByUsername,
  requestFriendshipFromEvent,
  setFriendUsername,
  submitUserReport,
  unblockConnectedUser,
  syncFriendProfile
} from "../src/data/friendsStore.mjs";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../src/data/fetchTimeout.mjs";

const userId = "11111111-1111-4111-8111-111111111111";
const friendId = "22222222-2222-4222-8222-222222222222";
const friendshipId = "33333333-3333-4333-8333-333333333333";
const friendCode = "0123456789abcdefabcd";

function accountConfig() {
  return {
    publicUrl: "https://sogrim-hesbon-app.vercel.app/",
    storage: {
      mode: "supabase",
      url: "https://demo.supabase.co",
      anonKey: "anon-key",
      account: {
        userId,
        accessToken: "private-user-token"
      }
    }
  };
}

test("friend codes support a private link without exposing an email address", () => {
  const link = buildFriendInviteUrl("https://example.com/app", friendCode);

  assert.equal(normalizeFriendCode(friendCode.toUpperCase()), friendCode);
  assert.equal(friendInviteCodeFromUrl(link), friendCode);
  assert.equal(new URL(link).searchParams.get("friend"), friendCode);
  assert.ok(!link.includes("@"));
});

test("friend links migrate the retired production origin", () => {
  const link = buildFriendInviteUrl(
    "https://sogrim-hashbon.vercel.app",
    friendCode
  );

  assert.equal(new URL(link).origin, "https://sogrim-hesbon-app.vercel.app");
  assert.equal(new URL(link).searchParams.get("friend"), friendCode);
});

test("a compact referral path is also recognized as a friend invitation", () => {
  const link = `https://example.com/r/${friendCode}`;

  assert.equal(friendInviteCodeFromUrl(link), friendCode);
});

test("friend network reads only the signed-in user's visible relationships", async () => {
  const requests = [];
  const relationship = {
    id: friendshipId,
    requester_id: userId,
    addressee_id: friendId,
    status: "accepted",
    requested_at: "2026-07-26T10:00:00.000Z",
    responded_at: "2026-07-26T10:01:00.000Z",
    updated_at: "2026-07-26T10:01:00.000Z"
  };
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/friendships")) return jsonResponse([relationship]);
    if (pathname.endsWith("/friend_invite_codes")) {
      return jsonResponse([{ code: friendCode }]);
    }
    if (pathname.endsWith("/user_blocks")) return jsonResponse([]);
    if (pathname.endsWith("/user_profiles")) {
      return jsonResponse([
        {
          user_id: friendId,
          username: "friend_user",
          username_customized: true,
          display_name: "Friend User",
          avatar_preset: "avatar-2",
          updated_at: "2026-07-26T10:01:00.000Z"
        }
      ]);
    }
    return jsonResponse([], false);
  };

  const network = await loadFriendNetwork(accountConfig(), fetchImpl);

  assert.equal(network.status, "ready");
  assert.equal(network.userId, userId);
  assert.equal(network.friendCode, friendCode);
  assert.equal(network.friendships[0].id, friendshipId);
  assert.deepEqual(network.blockedUsers, []);
  assert.equal(network.profiles[0].display_name, "Friend User");
  assert.equal(network.profiles[0].username, "friend_user");
  assert.equal(network.profiles[0].username_customized, true);
  for (const request of requests) {
    assert.equal(request.options.headers.authorization, "Bearer private-user-token");
    assert.equal(request.options.headers.apikey, "anon-key");
  }
  const profileRequest = requests.find(({ url }) =>
    new URL(url).pathname.endsWith("/user_profiles")
  );
  assert.match(
    profileRequest.url,
    /select=user_id%2Cusername%2Cusername_customized%2Cdisplay_name%2Cavatar_preset%2Cavatar_image%2Cupdated_at/
  );
  assert.ok(!profileRequest.url.includes("email"));
});

test("a stalled friend network load times out and allows a retry", async (t) => {
  const stalledSignals = [];
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const stalledLoad = loadFriendNetwork(accountConfig(), async (_url, options = {}) => {
    stalledSignals.push(options.signal);
    return new Promise(() => {});
  });

  await Promise.resolve();
  t.mock.timers.tick(DEFAULT_REQUEST_TIMEOUT_MS);
  await assert.rejects(stalledLoad, (error) => error?.code === "NETWORK_TIMEOUT");
  assert.equal(stalledSignals.length, 3);
  assert.equal(stalledSignals.every((signal) => signal?.aborted), true);
  t.mock.timers.reset();

  let retryCalls = 0;
  const network = await loadFriendNetwork(accountConfig(), async () => {
    retryCalls += 1;
    return jsonResponse([]);
  });

  assert.equal(network.status, "ready");
  assert.equal(retryCalls, 4);
});

test("profile refresh patches the existing triggered row without inserting a null username", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return jsonResponse([
      {
        user_id: userId,
        username: "current_user",
        username_customized: true,
        display_name: "Current User",
        avatar_preset: "avatar-3",
        updated_at: "2026-08-02T10:00:00.000Z"
      }
    ]);
  };

  const profile = await syncFriendProfile(
    accountConfig(),
    {
      displayName: "Current User",
      avatarPreset: "avatar-3",
      avatarImage: "https://images.example.com/avatar.jpg"
    },
    fetchImpl
  );

  assert.equal(profile.username, "current_user");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.headers.prefer, "return=representation");
  assert.equal(new URL(calls[0].url).searchParams.get("user_id"), `eq.${userId}`);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.display_name, "Current User");
  assert.equal(body.avatar_preset, "avatar-3");
  assert.equal(body.avatar_image, "https://images.example.com/avatar.jpg");
  assert.ok(!("user_id" in body));
  assert.ok(!("username" in body));
});

test("a stalled friend profile sync times out and allows a retry", async (t) => {
  let stalledSignal = null;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const stalledSync = syncFriendProfile(
    accountConfig(),
    { displayName: "Current User", avatarPreset: "avatar-3" },
    async (_url, options) => {
      stalledSignal = options.signal;
      return new Promise(() => {});
    }
  );

  await Promise.resolve();
  t.mock.timers.tick(DEFAULT_REQUEST_TIMEOUT_MS);
  await assert.rejects(stalledSync, (error) => error?.code === "NETWORK_TIMEOUT");
  assert.equal(stalledSignal?.aborted, true);
  t.mock.timers.reset();

  let retryCalls = 0;
  const profile = await syncFriendProfile(
    accountConfig(),
    { displayName: "Current User", avatarPreset: "avatar-3" },
    async () => {
      retryCalls += 1;
      return jsonResponse([{ user_id: userId, display_name: "Current User" }]);
    }
  );

  assert.equal(profile.user_id, userId);
  assert.equal(retryCalls, 1);
});

test("friend requests and approvals use guarded RPC endpoints", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ id: friendshipId, status: "pending" });
  };

  await requestFriendship(accountConfig(), friendCode, fetchImpl);
  await manageFriendship(accountConfig(), friendshipId, "accept", fetchImpl);

  assert.match(calls[0].url, /\/rpc\/request_friendship$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_friend_code: friendCode
  });
  assert.match(calls[1].url, /\/rpc\/manage_friendship$/);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    p_friendship_id: friendshipId,
    p_action: "accept"
  });
});

test("username lookup and username changes use exact guarded RPC endpoints", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ id: friendshipId, status: "pending" });
  };

  await requestFriendshipByUsername(accountConfig(), "@Friend_User", fetchImpl);
  await setFriendUsername(accountConfig(), "@Yarin_12", fetchImpl);

  assert.match(calls[0].url, /\/rpc\/request_friendship_by_username$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_username: "friend_user"
  });
  assert.match(calls[1].url, /\/rpc\/set_friend_username$/);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    p_username: "yarin_12"
  });
});

test("event participants can request friendship through the guarded shared-event RPC", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ id: friendshipId, status: "pending" });
  };

  await requestFriendshipFromEvent(
    accountConfig(),
    "space-event-123",
    friendId,
    fetchImpl
  );

  assert.match(calls[0].url, /\/rpc\/request_friendship_from_event$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_shared_space_id: "space-event-123",
    p_target_user_id: friendId
  });
});

test("blocking, unblocking and reporting use authenticated guarded RPC endpoints", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ status: "ok" });
  };

  await blockConnectedUser(accountConfig(), friendId, fetchImpl);
  await unblockConnectedUser(accountConfig(), friendId, fetchImpl);
  await submitUserReport(
    accountConfig(),
    {
      sharedSpaceId: "space-event-123",
      targetUserId: friendId,
      category: "spam",
      details: "Repeated unwanted invitations"
    },
    fetchImpl
  );

  assert.match(calls[0].url, /\/rpc\/block_user$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_target_user_id: friendId
  });
  assert.match(calls[1].url, /\/rpc\/unblock_user$/);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    p_target_user_id: friendId
  });
  assert.match(calls[2].url, /\/rpc\/submit_user_report$/);
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    p_shared_space_id: "space-event-123",
    p_target_user_id: friendId,
    p_category: "spam",
    p_details: "Repeated unwanted invitations"
  });
});

test("reports reject unsupported categories and oversized details before the network", async () => {
  let callCount = 0;
  const fetchImpl = async () => {
    callCount += 1;
    return jsonResponse({});
  };

  await assert.rejects(
    submitUserReport(
      accountConfig(),
      {
        sharedSpaceId: "space-event-123",
        targetUserId: friendId,
        category: "unknown"
      },
      fetchImpl
    ),
    /category is invalid/
  );
  await assert.rejects(
    submitUserReport(
      accountConfig(),
      {
        sharedSpaceId: "space-event-123",
        targetUserId: friendId,
        category: "other",
        details: "x".repeat(1001)
      },
      fetchImpl
    ),
    /too long/
  );
  assert.equal(callCount, 0);
});

function jsonResponse(payload, ok = true) {
  return {
    ok,
    async json() {
      return payload;
    }
  };
}
