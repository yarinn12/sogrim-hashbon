import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  ensureOpenEventInvite,
  isEventInviteError,
  resolveEventInviteCredentials
} from "../src/data/eventInvites.mjs";
import {
  createPrivateEventInvite,
  manageOpenEventInvite,
  redeemEventInvite
} from "../src/server/eventInvites.mjs";
import { buildEventInviteUrl } from "../src/domain/inviteLinks.mjs";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "event-secure";
const SPACE_ID = "shared-event-space";
const SPACE_KEY = "shared-event-secret-that-is-long-enough-123";
const TOKEN = "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456";
const TOKEN_TWO = "zyxwvutsrqponmlkjihgfedcba_ABCDEFGHIJKLMNOPQRSTUVWXYZ_654321";

test("invite failures are distinguishable from account session failures", () => {
  for (const code of [
    "INVALID_EVENT_INVITE",
    "INVALID_INVITE_RESPONSE",
    "LEGACY_INVITE_REPLACED",
    "EVENT_INVITE_REVOKED",
    "EVENT_INVITE_EXPIRED",
    "PRIVATE_INVITE_RECIPIENT_MISMATCH"
  ]) {
    assert.equal(isEventInviteError({ code }), true, code);
  }

  assert.equal(isEventInviteError({ code: "AUTH_REQUIRED" }), false);
  assert.equal(isEventInviteError(new TypeError("Failed to fetch")), false);
});

function runtimeConfig({ account = true } = {}) {
  return {
    apiBaseUrl: "https://sogrim.example",
    publicUrl: "https://sogrim.example",
    storage: {
      mode: "supabase",
      url: "https://demo.supabase.co",
      anonKey: "anon-key",
      ...(account
        ? {
            account: {
              userId: USER_ID,
              accessToken: "account-token"
            }
          }
        : {})
    }
  };
}

function serverState() {
  const participantId = `account-${USER_ID}`;
  return {
    currentParticipantId: participantId,
    participants: [{ id: participantId, displayName: "Test User" }],
    groups: [],
    events: [
      {
        id: EVENT_ID,
        name: "Secure event",
        participantIds: [participantId],
        adminIds: [participantId],
        createdByParticipantId: participantId,
        sharedSpaceId: SPACE_ID,
        sharedSpaceKey: SPACE_KEY,
        expenses: [],
        transfers: []
      }
    ]
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function sharedSnapshot(state = serverState()) {
  return {
    state,
    access_key_hash: createHash("sha256").update(SPACE_KEY).digest("hex")
  };
}

test("client creates an authenticated open invite without sending event credentials", async () => {
  let request = null;
  const result = await ensureOpenEventInvite(
    runtimeConfig(),
    EVENT_ID,
    "",
    async (url, options) => {
      request = { url: String(url), options };
      return jsonResponse({
        ok: true,
        eventId: EVENT_ID,
        token: TOKEN,
        createdAt: "2026-07-29T10:00:00.000Z"
      });
    }
  );

  assert.equal(result.token, TOKEN);
  assert.equal(request.url, "https://sogrim.example/api/event-invites/open-link");
  assert.equal(request.options.headers.authorization, "Bearer account-token");
  const body = JSON.parse(request.options.body);
  assert.equal(body.eventId, EVENT_ID);
  assert.equal(body.operation, "ensure");
  assert.equal("spaceId" in body, false);
  assert.equal("spaceKey" in body, false);
});

test("client redeems token links and still accepts legacy invite credentials", async () => {
  const tokenUrl = buildEventInviteUrl(
    "https://sogrim.example/",
    EVENT_ID,
    null,
    { inviteToken: TOKEN }
  );
  const redeemed = await resolveEventInviteCredentials(
    runtimeConfig({ account: false }),
    tokenUrl,
    async () =>
      jsonResponse({
        ok: true,
        eventId: EVENT_ID,
        kind: "open",
        spaceId: SPACE_ID,
        spaceKey: SPACE_KEY
      })
  );
  assert.deepEqual(redeemed, {
    id: SPACE_ID,
    key: SPACE_KEY,
    eventId: EVENT_ID,
    source: "open"
  });

  const legacy = await resolveEventInviteCredentials(
    { storage: { mode: "local" } },
    `https://sogrim.example/?event=${EVENT_ID}&space=${SPACE_ID}&key=${SPACE_KEY}`,
    async () => {
      throw new Error("Legacy invites must not call the redemption API");
    }
  );
  assert.equal(legacy.source, "legacy");

  await assert.rejects(
    resolveEventInviteCredentials(
      runtimeConfig({ account: false }),
      `https://sogrim.example/?event=${EVENT_ID}&space=${SPACE_ID}&key=${SPACE_KEY}`,
      async () => {
        throw new Error("Production legacy invites must not reach the network");
      }
    ),
    (error) => error.code === "LEGACY_INVITE_REPLACED"
  );
});

test("client explains revoked and account-bound invites in Hebrew", async () => {
  const tokenUrl = buildEventInviteUrl(
    "https://sogrim.example/",
    EVENT_ID,
    null,
    { inviteToken: TOKEN }
  );
  const mixedUrl = new URL(tokenUrl);
  mixedUrl.searchParams.set("space", SPACE_ID);
  mixedUrl.searchParams.set("key", SPACE_KEY);
  let redemptionRequests = 0;
  await assert.rejects(
    resolveEventInviteCredentials(
      runtimeConfig({ account: false }),
      mixedUrl,
      async () => {
        redemptionRequests += 1;
        return (
        jsonResponse(
          {
            ok: false,
            code: "EVENT_INVITE_REVOKED",
            error: "Internal server wording must not reach the interface"
          },
          410
        )
        );
      }
    ),
    (error) =>
      error.code === "EVENT_INVITE_REVOKED" &&
      error.message === "קישור ההצטרפות הזה בוטל. צריך לבקש קישור חדש."
  );
  assert.equal(
    redemptionRequests,
    1,
    "legacy credentials must never bypass a token in the same URL"
  );
});

test("server rotates open links atomically and stores only the token hash", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const address = String(url);
    requests.push({ address, options });
    if (address.endsWith("/auth/v1/user")) {
      return jsonResponse({ id: USER_ID });
    }
    if (address.includes("/rest/v1/app_snapshots?")) {
      return jsonResponse(
        address.includes("owner_user_id")
          ? [{ state: serverState() }]
          : [sharedSnapshot()]
      );
    }
    if (address.includes("/rest/v1/event_invite_tokens?")) {
      return jsonResponse([]);
    }
    if (address.endsWith("/rest/v1/rpc/rotate_open_event_invite")) {
      return jsonResponse("33333333-3333-4333-8333-333333333333");
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
  };

  const result = await manageOpenEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-token",
    eventId: EVENT_ID,
    operation: "rotate",
    fetchImpl,
    tokenFactory: () => TOKEN
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.token, TOKEN);
  const rotation = requests.find((item) =>
    item.address.endsWith("/rest/v1/rpc/rotate_open_event_invite")
  );
  const body = JSON.parse(rotation.options.body);
  assert.equal(body.p_event_id, EVENT_ID);
  assert.equal(body.p_space_id, SPACE_ID);
  assert.equal(body.p_space_key, SPACE_KEY);
  assert.match(body.p_token_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(body.p_token_hash, TOKEN);
});

test("server never rotates an active open link during ensure without its token", async () => {
  let rotationAttempted = false;
  const result = await manageOpenEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-token",
    eventId: EVENT_ID,
    operation: "ensure",
    fetchImpl: async (url) => {
      const address = String(url);
      if (address.endsWith("/auth/v1/user")) {
        return jsonResponse({ id: USER_ID });
      }
      if (address.includes("/rest/v1/app_snapshots?")) {
        return jsonResponse(
          address.includes("owner_user_id")
            ? [{ state: serverState() }]
            : [sharedSnapshot()]
        );
      }
      if (address.includes("/rest/v1/event_invite_tokens?")) {
        return address.includes("select=space_id%2Cspace_key")
          ? jsonResponse([])
          : jsonResponse([
              {
                id: "33333333-3333-4333-8333-333333333333",
                event_id: EVENT_ID,
                kind: "open",
                created_by: OTHER_USER_ID,
                space_id: SPACE_ID,
                space_key: SPACE_KEY,
                created_at: "2026-07-29T10:00:00.000Z"
              }
            ]);
      }
      if (address.endsWith("/rest/v1/rpc/rotate_open_event_invite")) {
        rotationAttempted = true;
        return jsonResponse("44444444-4444-4444-8444-444444444444");
      }
      throw new Error(`Unexpected request: ${address}`);
    }
  });

  assert.equal(result.status, 409);
  assert.equal(
    result.payload.code,
    "EVENT_INVITE_ACTIVE_REQUIRES_ROTATION"
  );
  assert.equal(rotationAttempted, false);
});

test("collaborative participants reuse the event open link instead of creating parallel links", async () => {
  const participantId = `account-${USER_ID}`;
  const otherParticipantId = `account-${OTHER_USER_ID}`;
  const collaborativeState = serverState();
  collaborativeState.participants.push({
    id: otherParticipantId,
    displayName: "Event manager"
  });
  collaborativeState.events[0] = {
    ...collaborativeState.events[0],
    participantIds: [participantId, otherParticipantId],
    adminIds: [otherParticipantId],
    createdByParticipantId: otherParticipantId,
    adminsCanEditOnly: false
  };
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const address = String(url);
    requests.push({ address, options });
    if (address.endsWith("/auth/v1/user")) {
      return jsonResponse({ id: USER_ID });
    }
    if (address.includes("/rest/v1/app_snapshots?")) {
      return jsonResponse(
        address.includes("owner_user_id")
          ? [{ state: collaborativeState }]
          : [sharedSnapshot(collaborativeState)]
      );
    }
    if (address.includes("/rest/v1/event_invite_tokens?")) {
      return address.includes("token_hash")
        ? jsonResponse([
            {
              id: "33333333-3333-4333-8333-333333333333",
              event_id: EVENT_ID,
              kind: "open",
              created_by: OTHER_USER_ID,
              space_id: SPACE_ID,
              space_key: SPACE_KEY,
              created_at: "2026-07-29T10:00:00.000Z"
            }
          ])
        : jsonResponse([]);
    }
    if (address.endsWith("/rest/v1/rpc/rotate_open_event_invite")) {
      return jsonResponse("44444444-4444-4444-8444-444444444444");
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
  };

  const result = await manageOpenEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-token",
    eventId: EVENT_ID,
    candidateToken: TOKEN,
    operation: "ensure",
    fetchImpl,
    tokenFactory: () => TOKEN_TWO
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.token, TOKEN);
  assert.equal(result.payload.rotated, false);
  assert.equal(
    requests.some((request) =>
      request.address.endsWith("/rest/v1/rpc/rotate_open_event_invite")
    ),
    false,
    "one event must never keep parallel open links"
  );

  collaborativeState.events[0].adminsCanEditOnly = true;
  const blocked = await manageOpenEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-token",
    eventId: EVENT_ID,
    operation: "rotate",
    fetchImpl
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.payload.code, "EVENT_INVITE_NOT_ALLOWED");
});

test("server authorizes invitations from the shared event instead of editable account data", async () => {
  const tamperedAccountState = serverState();
  const sharedState = serverState();
  sharedState.events[0] = {
    ...sharedState.events[0],
    participantIds: [`account-${OTHER_USER_ID}`],
    adminIds: [`account-${OTHER_USER_ID}`],
    createdByParticipantId: `account-${OTHER_USER_ID}`
  };
  let rotationAttempted = false;
  const result = await manageOpenEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-token",
    eventId: EVENT_ID,
    operation: "rotate",
    fetchImpl: async (url) => {
      const address = String(url);
      if (address.endsWith("/auth/v1/user")) {
        return jsonResponse({ id: USER_ID });
      }
      if (address.includes("/rest/v1/app_snapshots?")) {
        return jsonResponse(
          address.includes("owner_user_id")
            ? [{ state: tamperedAccountState }]
            : [sharedSnapshot(sharedState)]
        );
      }
      if (address.endsWith("/rest/v1/rpc/rotate_open_event_invite")) {
        rotationAttempted = true;
        return jsonResponse("66666666-6666-4666-8666-666666666666");
      }
      throw new Error(`Unexpected request: ${address}`);
    }
  });

  assert.equal(result.status, 403);
  assert.equal(result.payload.code, "EVENT_INVITE_NOT_ALLOWED");
  assert.equal(rotationAttempted, false);
});

test("closed events cannot create or redeem an open invitation", async () => {
  const closedState = serverState();
  closedState.events[0] = {
    ...closedState.events[0],
    locked: true,
    closedAt: "2026-08-02T08:00:00.000Z"
  };
  const creation = await manageOpenEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-token",
    eventId: EVENT_ID,
    operation: "rotate",
    fetchImpl: async (url) => {
      const address = String(url);
      if (address.endsWith("/auth/v1/user")) return jsonResponse({ id: USER_ID });
      if (address.includes("/rest/v1/app_snapshots?")) {
        return jsonResponse(
          address.includes("owner_user_id")
            ? [{ state: closedState }]
            : [sharedSnapshot(closedState)]
        );
      }
      throw new Error(`Unexpected request: ${address}`);
    }
  });

  assert.equal(creation.status, 403);
  assert.equal(creation.payload.code, "EVENT_INVITE_NOT_ALLOWED");

  let revoked = false;
  const redemption = await redeemEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    eventId: EVENT_ID,
    token: TOKEN,
    fetchImpl: async (url, options = {}) => {
      const address = String(url);
      if (address.includes("/rest/v1/event_invite_tokens?") && options.method !== "PATCH") {
        return jsonResponse([
          {
            id: "33333333-3333-4333-8333-333333333333",
            event_id: EVENT_ID,
            kind: "open",
            created_by: USER_ID,
            space_id: SPACE_ID,
            space_key: SPACE_KEY,
            expires_at: null
          }
        ]);
      }
      if (address.includes("/rest/v1/app_snapshots?")) {
        return jsonResponse([sharedSnapshot(closedState)]);
      }
      if (address.includes("/rest/v1/event_invite_tokens") && options.method === "PATCH") {
        revoked = true;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
    }
  });

  assert.equal(redemption.status, 410);
  assert.equal(redemption.payload.code, "EVENT_INVITE_REVOKED");
  assert.equal(revoked, true);
});

test("server rejects revoked links and protects private invitations by account", async () => {
  const revoked = await redeemEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    eventId: EVENT_ID,
    token: TOKEN,
    fetchImpl: async (url) => {
      if (String(url).includes("/rest/v1/event_invite_tokens?")) {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });
  assert.equal(revoked.status, 410);
  assert.equal(revoked.payload.code, "EVENT_INVITE_REVOKED");

  const privateInvite = await redeemEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer wrong-account",
    eventId: EVENT_ID,
    token: TOKEN,
    fetchImpl: async (url) => {
      const address = String(url);
      if (address.includes("/rest/v1/event_invite_tokens?")) {
        return jsonResponse([
          {
            id: "33333333-3333-4333-8333-333333333333",
            event_id: EVENT_ID,
            kind: "private",
            space_id: SPACE_ID,
            space_key: SPACE_KEY,
            recipient_user_id: USER_ID,
            created_at: "2026-07-29T10:00:00.000Z",
            expires_at: null
          }
        ]);
      }
      if (address.endsWith("/auth/v1/user")) {
        return jsonResponse({ id: OTHER_USER_ID });
      }
      throw new Error(`Unexpected request: ${address}`);
    }
  });
  assert.equal(privateInvite.status, 403);
  assert.equal(
    privateInvite.payload.code,
    "PRIVATE_INVITE_RECIPIENT_MISMATCH"
  );
});

test("private invites expire atomically and stop working after participant removal", async () => {
  const senderParticipantId = `account-${USER_ID}`;
  const recipientParticipantId = `account-${OTHER_USER_ID}`;
  const sharedState = serverState();
  sharedState.participants.push({
    id: recipientParticipantId,
    displayName: "Invited friend"
  });
  sharedState.events[0].participantIds.push(recipientParticipantId);
  const requests = [];
  const created = await createPrivateEventInvite({
    supabaseUrl: "https://demo.supabase.co",
    serviceRoleKey: "service-role",
    event: sharedState.events[0],
    senderUserId: USER_ID,
    recipientUserId: OTHER_USER_ID,
    fetchImpl: async (url, options = {}) => {
      const address = String(url);
      requests.push({ address, options });
      if (address.includes("/rest/v1/app_snapshots?")) {
        return jsonResponse([sharedSnapshot(sharedState)]);
      }
      if (address.includes("/rest/v1/event_invite_tokens?")) {
        return jsonResponse([]);
      }
      if (address.endsWith("/rest/v1/rpc/rotate_private_event_invite")) {
        return jsonResponse("55555555-5555-4555-8555-555555555555");
      }
      throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
    },
    tokenFactory: () => TOKEN
  });

  assert.equal(created.token, TOKEN);
  assert.ok(Date.parse(created.expiresAt) > Date.parse(created.createdAt));
  const rotation = requests.find((request) =>
    request.address.endsWith("/rest/v1/rpc/rotate_private_event_invite")
  );
  const rotationBody = JSON.parse(rotation.options.body);
  assert.equal(rotationBody.p_created_by, USER_ID);
  assert.equal(rotationBody.p_recipient_user_id, OTHER_USER_ID);
  assert.equal(
    requests.some(
      (request) =>
        request.address.includes("/rest/v1/event_invite_tokens?") &&
        request.options.method === "PATCH"
    ),
    false,
    "private replacement must happen inside the atomic RPC"
  );

  sharedState.events[0].inactiveParticipantIds = [recipientParticipantId];
  let revoked = false;
  const redemption = await redeemEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer recipient-token",
    eventId: EVENT_ID,
    token: TOKEN,
    fetchImpl: async (url, options = {}) => {
      const address = String(url);
      if (
        address.includes("/rest/v1/event_invite_tokens") &&
        options.method === "PATCH"
      ) {
        revoked = true;
        return new Response(null, { status: 204 });
      }
      if (address.includes("/rest/v1/event_invite_tokens?")) {
        return jsonResponse([
          {
            id: "55555555-5555-4555-8555-555555555555",
            event_id: EVENT_ID,
            kind: "private",
            created_by: USER_ID,
            recipient_user_id: OTHER_USER_ID,
            space_id: SPACE_ID,
            space_key: SPACE_KEY,
            expires_at: created.expiresAt
          }
        ]);
      }
      if (address.endsWith("/auth/v1/user")) {
        return jsonResponse({ id: OTHER_USER_ID });
      }
      if (address.includes("/rest/v1/app_snapshots?")) {
        return jsonResponse([sharedSnapshot(sharedState)]);
      }
      throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
    }
  });

  assert.equal(redemption.status, 410);
  assert.equal(redemption.payload.code, "EVENT_INVITE_REVOKED");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(revoked, true);
  assert.equal(senderParticipantId, sharedState.currentParticipantId);
});
