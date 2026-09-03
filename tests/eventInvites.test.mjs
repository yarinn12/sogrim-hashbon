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
  OPEN_INVITE_REQUEST_TIMEOUT_MS,
  redeemEventInvite
} from "../src/server/eventInvites.mjs";
import { buildEventInviteUrl } from "../src/domain/inviteLinks.mjs";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../src/data/fetchTimeout.mjs";

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
    "EVENT_INVITE_AUTH_REQUIRED",
    "EVENT_MEMBERSHIP_INDEX_PENDING",
    "PRIVATE_INVITE_RECIPIENT_MISMATCH"
  ]) {
    assert.equal(isEventInviteError({ code }), true, code);
  }

  assert.equal(isEventInviteError({ code: "AUTH_REQUIRED" }), true);
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

function redactedSharedSnapshot(state = serverState()) {
  const redactedState = structuredClone(state);
  delete redactedState.events[0].sharedSpaceKey;
  return sharedSnapshot(redactedState);
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

test("open invite creation keeps response JSON inside its request timeout", async () => {
  let requestSignal = null;

  await assert.rejects(
    Promise.race([
      ensureOpenEventInvite(
        runtimeConfig(),
        EVENT_ID,
        "",
        async (_url, options) => {
          requestSignal = options.signal;
          return {
            ok: true,
            status: 200,
            json: () => new Promise(() => {})
          };
        },
        { timeoutMs: 10 }
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("open invite response body stayed unbounded")), 250)
      )
    ]),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.equal(requestSignal?.aborted, true);
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

test("invite redemption honors a short startup timeout", async () => {
  const tokenUrl = buildEventInviteUrl(
    "https://sogrim.example/",
    EVENT_ID,
    null,
    { inviteToken: TOKEN }
  );
  const startedAt = Date.now();

  await assert.rejects(
    resolveEventInviteCredentials(
      runtimeConfig({ account: false }),
      tokenUrl,
      () => new Promise(() => {}),
      { timeoutMs: 10 }
    ),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.ok(Date.now() - startedAt < 500, "startup redemption must stay bounded");
});

test("invite redemption keeps response JSON inside the startup timeout", async () => {
  const tokenUrl = buildEventInviteUrl(
    "https://sogrim.example/",
    EVENT_ID,
    null,
    { inviteToken: TOKEN }
  );
  let requestSignal = null;

  await assert.rejects(
    Promise.race([
      resolveEventInviteCredentials(
        runtimeConfig({ account: false }),
        tokenUrl,
        async (_url, options) => {
          requestSignal = options.signal;
          return {
            ok: true,
            status: 200,
            json: () => new Promise(() => {})
          };
        },
        { timeoutMs: 10 }
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("invite response body stayed unbounded")), 250)
      )
    ]),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.equal(requestSignal?.aborted, true);
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

test("server bounds the entire open-link operation when Supabase stops responding", async () => {
  assert.ok(
    OPEN_INVITE_REQUEST_TIMEOUT_MS < DEFAULT_REQUEST_TIMEOUT_MS,
    "the server must give up before the mobile client request expires"
  );
  const startedAt = Date.now();
  await assert.rejects(
    manageOpenEventInvite({
      runtimeConfig: runtimeConfig(),
      env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
      authorization: "Bearer account-token",
      eventId: EVENT_ID,
      fetchImpl: async () => new Promise(() => {}),
      requestTimeoutMs: 20
    }),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.ok(
    Date.now() - startedAt < 500,
    "a hanging invite upstream must release the server promptly"
  );
});

test("server open-link deadline includes the authenticated-user response body", async () => {
  let requestSignal = null;

  await assert.rejects(
    Promise.race([
      manageOpenEventInvite({
        runtimeConfig: runtimeConfig(),
        env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
        authorization: "Bearer account-token",
        eventId: EVENT_ID,
        fetchImpl: async (_url, options) => {
          requestSignal = options.signal;
          return {
            ok: true,
            status: 200,
            json: () => new Promise(() => {})
          };
        },
        requestTimeoutMs: 20
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("server invite response body stayed unbounded")), 300)
      )
    ]),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.equal(requestSignal?.aborted, true);
});

test("server bounds the entire invite redemption when Supabase stops responding", async () => {
  const startedAt = Date.now();
  await assert.rejects(
    redeemEventInvite({
      runtimeConfig: runtimeConfig(),
      env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
      authorization: "Bearer account-token",
      eventId: EVENT_ID,
      token: TOKEN,
      fetchImpl: async () => new Promise(() => {}),
      requestTimeoutMs: 20
    }),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.ok(
    Date.now() - startedAt < 500,
    "a hanging invite redemption must release the server promptly"
  );
});

test("server batches independent open-invite verification reads", async () => {
  let activeVerificationReads = 0;
  let maxConcurrentVerificationReads = 0;
  const fetchImpl = async (url) => {
    const address = String(url);
    if (address.endsWith("/auth/v1/user")) {
      return jsonResponse({ id: USER_ID });
    }
    if (
      address.includes("/rest/v1/app_snapshots?") &&
      address.includes("owner_user_id")
    ) {
      return jsonResponse([{ state: serverState() }]);
    }
    if (
      address.includes("/rest/v1/app_snapshots?") ||
      address.includes("/rest/v1/event_invite_tokens?")
    ) {
      activeVerificationReads += 1;
      maxConcurrentVerificationReads = Math.max(
        maxConcurrentVerificationReads,
        activeVerificationReads
      );
      await new Promise((resolve) => setTimeout(resolve, 15));
      activeVerificationReads -= 1;
      return address.includes("/rest/v1/app_snapshots?")
        ? jsonResponse([sharedSnapshot()])
        : jsonResponse([]);
    }
    if (address.endsWith("/rest/v1/rpc/rotate_open_event_invite")) {
      return jsonResponse("33333333-3333-4333-8333-333333333333");
    }
    throw new Error(`Unexpected request: ${address}`);
  };

  const result = await manageOpenEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-token",
    eventId: EVENT_ID,
    operation: "ensure",
    fetchImpl
  });

  assert.equal(result.status, 200);
  assert.ok(
    maxConcurrentVerificationReads >= 3,
    `expected batched verification reads, observed ${maxConcurrentVerificationReads}`
  );
});

test("server recovers an active open link during ensure when this device lost its token", async () => {
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
        return address.includes("token_hash=eq.")
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

  assert.equal(result.status, 200);
  assert.equal(result.payload.rotated, true);
  assert.equal(rotationAttempted, true);
});

test("server recreates the same open link on another device without rotating it", async () => {
  const tokenHashes = [];
  let activeHash = "";
  let rotations = 0;
  const fetchImpl = async (url, options = {}) => {
    const address = String(url);
    if (address.endsWith("/auth/v1/user")) return jsonResponse({ id: USER_ID });
    if (address.includes("/rest/v1/app_snapshots?")) {
      return jsonResponse(
        address.includes("owner_user_id")
          ? [{ state: serverState() }]
          : [sharedSnapshot()]
      );
    }
    if (address.includes("/rest/v1/event_invite_tokens?")) {
      const requestedHash = new URL(address).searchParams
        .get("token_hash")
        ?.replace(/^eq\./, "");
      tokenHashes.push(requestedHash ?? "");
      if (requestedHash && requestedHash === activeHash) {
        return jsonResponse([{
          id: "33333333-3333-4333-8333-333333333333",
          event_id: EVENT_ID,
          kind: "open",
          created_by: USER_ID,
          space_id: SPACE_ID,
          space_key: SPACE_KEY,
          created_at: "2026-08-24T10:00:00.000Z"
        }]);
      }
      return jsonResponse([]);
    }
    if (address.endsWith("/rest/v1/rpc/rotate_open_event_invite")) {
      rotations += 1;
      activeHash = JSON.parse(options.body).p_token_hash;
      return jsonResponse("44444444-4444-4444-8444-444444444444");
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
  };
  const input = {
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-token",
    eventId: EVENT_ID,
    operation: "ensure",
    fetchImpl
  };

  const first = await manageOpenEventInvite(input);
  const second = await manageOpenEventInvite(input);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.payload.token, first.payload.token);
  assert.equal(rotations, 1);
  assert.ok(tokenHashes.includes(activeHash));
});

test("rotating the Supabase service role preserves links signed by the dedicated invite key", async () => {
  let activeHash = "";
  let rotations = 0;
  const fetchImpl = async (url, options = {}) => {
    const address = String(url);
    if (address.endsWith("/auth/v1/user")) return jsonResponse({ id: USER_ID });
    if (address.includes("/rest/v1/app_snapshots?")) {
      return jsonResponse(
        address.includes("owner_user_id")
          ? [{ state: serverState() }]
          : [sharedSnapshot()]
      );
    }
    if (address.includes("/rest/v1/event_invite_tokens?")) {
      const params = new URL(address).searchParams;
      const requestedHash = params.get("token_hash")?.replace(/^eq\./, "");
      if (params.get("select") === "space_id,space_key") {
        return jsonResponse(activeHash
          ? [{ space_id: SPACE_ID, space_key: SPACE_KEY }]
          : []);
      }
      if (!activeHash || (requestedHash && requestedHash !== activeHash)) {
        return jsonResponse([]);
      }
      return jsonResponse([{
        id: "33333333-3333-4333-8333-333333333333",
        event_id: EVENT_ID,
        kind: "open",
        created_by: USER_ID,
        space_id: SPACE_ID,
        space_key: SPACE_KEY,
        token_hash: activeHash,
        created_at: "2026-08-24T10:00:00.000Z"
      }]);
    }
    if (address.endsWith("/rest/v1/rpc/rotate_open_event_invite")) {
      rotations += 1;
      activeHash = JSON.parse(options.body).p_token_hash;
      return jsonResponse("44444444-4444-4444-8444-444444444444");
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
  };
  const common = {
    runtimeConfig: runtimeConfig(),
    authorization: "Bearer account-token",
    eventId: EVENT_ID,
    operation: "ensure",
    fetchImpl
  };

  const beforeRotation = await manageOpenEventInvite({
    ...common,
    env: {
      SUPABASE_SERVICE_ROLE_KEY: "service-role-before",
      INVITE_TOKEN_SIGNING_KEY: "stable-invite-signing-key"
    }
  });
  const afterRotation = await manageOpenEventInvite({
    ...common,
    env: {
      SUPABASE_SERVICE_ROLE_KEY: "service-role-after",
      INVITE_TOKEN_SIGNING_KEY: "stable-invite-signing-key"
    }
  });

  assert.equal(beforeRotation.status, 200);
  assert.equal(afterRotation.status, 200);
  assert.equal(afterRotation.payload.token, beforeRotation.payload.token);
  assert.equal(afterRotation.payload.rotated, false);
  assert.equal(rotations, 1);
});

test("a deliberately rotated link survives Postgres timestamp reserialization on another device", async () => {
  let activeInvite = null;
  let rotations = 0;
  const fetchImpl = async (url, options = {}) => {
    const address = String(url);
    if (address.endsWith("/auth/v1/user")) return jsonResponse({ id: USER_ID });
    if (address.includes("/rest/v1/app_snapshots?")) {
      return jsonResponse(
        address.includes("owner_user_id")
          ? [{ state: serverState() }]
          : [sharedSnapshot()]
      );
    }
    if (address.includes("/rest/v1/event_invite_tokens?")) {
      const params = new URL(address).searchParams;
      const requestedHash = params.get("token_hash")?.replace(/^eq\./, "");
      if (params.get("select") === "space_id,space_key") {
        return jsonResponse(activeInvite
          ? [{ space_id: SPACE_ID, space_key: SPACE_KEY }]
          : []);
      }
      if (!activeInvite) return jsonResponse([]);
      if (requestedHash && requestedHash !== activeInvite.token_hash) {
        return jsonResponse([]);
      }
      return jsonResponse([activeInvite]);
    }
    if (address.endsWith("/rest/v1/rpc/rotate_open_event_invite")) {
      const body = JSON.parse(options.body);
      rotations += 1;
      activeInvite = {
        id: "33333333-3333-4333-8333-333333333333",
        event_id: EVENT_ID,
        kind: "open",
        created_by: USER_ID,
        space_id: SPACE_ID,
        space_key: SPACE_KEY,
        token_hash: body.p_token_hash,
        // PostgREST can return the same timestamptz with an explicit offset
        // even though the creating device sent an ISO string ending in Z.
        created_at: body.p_created_at.replace(/Z$/, "+00:00")
      };
      return jsonResponse(activeInvite.id);
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
  };
  const common = {
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-token",
    eventId: EVENT_ID,
    fetchImpl
  };

  const rotated = await manageOpenEventInvite({ ...common, operation: "rotate" });
  const recovered = await manageOpenEventInvite({ ...common, operation: "ensure" });

  assert.equal(rotated.status, 200);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.payload.token, rotated.payload.token);
  assert.equal(recovered.payload.rotated, false);
  assert.equal(rotations, 1);
});

test("a recovered event member can recreate the stable open link without the raw space key", async () => {
  const recoveredState = serverState();
  recoveredState.events[0].sharedSpaceKey = "member_access_recovery_v1_key_0001";
  let membershipChecked = false;
  let rotations = 0;
  let rotationBody = null;

  const result = await manageOpenEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-token",
    eventId: EVENT_ID,
    operation: "ensure",
    fetchImpl: async (url, options = {}) => {
      const address = String(url);
      if (address.endsWith("/auth/v1/user")) return jsonResponse({ id: USER_ID });
      if (address.includes("/rest/v1/rpc/can_write_shared_snapshot")) {
        membershipChecked = true;
        assert.equal(options.headers.authorization, "Bearer account-token");
        assert.deepEqual(JSON.parse(options.body), { p_snapshot_id: SPACE_ID });
        return jsonResponse(true);
      }
      if (address.includes("/rest/v1/app_snapshots?")) {
        if (address.includes("owner_user_id")) return jsonResponse([{ state: recoveredState }]);
        if (address.includes("access_key_hash")) {
          return jsonResponse([redactedSharedSnapshot()]);
        }
        return jsonResponse([redactedSharedSnapshot()]);
      }
      if (address.includes("/rest/v1/event_invite_tokens?")) {
        const select = new URL(address).searchParams.get("select");
        return select === "space_id,space_key"
          ? jsonResponse([{ space_id: SPACE_ID, space_key: SPACE_KEY }])
          : jsonResponse([]);
      }
      if (address.endsWith("/rest/v1/rpc/rotate_open_event_invite")) {
        rotations += 1;
        rotationBody = JSON.parse(options.body);
        return jsonResponse("44444444-4444-4444-8444-444444444444");
      }
      throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
    }
  });

  assert.equal(result.status, 200);
  assert.equal(membershipChecked, true);
  assert.equal(rotations, 1);
  assert.equal(rotationBody.p_space_key, SPACE_KEY);
  assert.match(result.payload.token, /^[A-Za-z0-9_-]{32,128}$/);
});

test("a recovered member can create and redeem the first stable invite without prior invite history", async () => {
  const recoveryKey = "member_access_recovery_v1_key_0001";
  const recoveredState = serverState();
  recoveredState.events[0].sharedSpaceKey = recoveryKey;
  let authenticatedUserId = USER_ID;
  let activeInvite = null;
  let rotations = 0;
  let membershipActivated = false;
  let indexRequests = 0;

  const fetchImpl = async (url, options = {}) => {
    const address = String(url);
    if (address.endsWith("/auth/v1/user")) {
      return jsonResponse({ id: authenticatedUserId });
    }
    if (address.includes("/rest/v1/rpc/can_write_shared_snapshot")) {
      return jsonResponse(true);
    }
    if (address.includes("/rest/v1/app_snapshots?")) {
      return jsonResponse(
        address.includes("owner_user_id")
          ? [{ state: recoveredState }]
          : [redactedSharedSnapshot()]
      );
    }
    if (address.includes("/rest/v1/event_invite_tokens?")) {
      const params = new URL(address).searchParams;
      const requestedHash = params.get("token_hash")?.replace(/^eq\./, "");
      const select = params.get("select");
      if (select === "space_id,space_key") {
        return jsonResponse(activeInvite
          ? [{ space_id: SPACE_ID, space_key: recoveryKey }]
          : []);
      }
      if (!activeInvite) return jsonResponse([]);
      if (requestedHash && requestedHash !== activeInvite.token_hash) {
        return jsonResponse([]);
      }
      return jsonResponse([activeInvite]);
    }
    if (address.endsWith("/rest/v1/rpc/rotate_open_event_invite")) {
      const body = JSON.parse(options.body);
      rotations += 1;
      assert.equal(body.p_space_key, recoveryKey);
      activeInvite = {
        id: "33333333-3333-4333-8333-333333333333",
        event_id: EVENT_ID,
        kind: "open",
        created_by: USER_ID,
        recipient_user_id: null,
        space_id: SPACE_ID,
        space_key: recoveryKey,
        token_hash: body.p_token_hash,
        created_at: body.p_created_at,
        expires_at: null
      };
      return jsonResponse(activeInvite.id);
    }
    if (address.endsWith("/rest/v1/rpc/redeem_event_invite_membership")) {
      membershipActivated = true;
      return jsonResponse(true);
    }
    if (address.endsWith("/rest/v1/rpc/index_shared_event_for_member")) {
      indexRequests += 1;
      throw new Error("A fresh participant must join canonical state before indexing");
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
  };

  const input = {
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer creator-token",
    eventId: EVENT_ID,
    operation: "ensure",
    fetchImpl
  };
  const first = await manageOpenEventInvite(input);
  const second = await manageOpenEventInvite(input);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.payload.token, first.payload.token);
  assert.equal(rotations, 1);

  authenticatedUserId = OTHER_USER_ID;
  const redeemed = await redeemEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer recipient-token",
    eventId: EVENT_ID,
    token: first.payload.token,
    fetchImpl
  });

  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.payload.spaceId, SPACE_ID);
  assert.equal(redeemed.payload.spaceKey, recoveryKey);
  assert.equal(redeemed.payload.indexPending, true);
  assert.equal(membershipActivated, true);
  assert.equal(indexRequests, 0);
});

test("a recovered member replaces an existing invite with canonical credentials and the new link redeems", async () => {
  const recoveredState = serverState();
  recoveredState.events[0].sharedSpaceKey = "member_access_recovery_v1_key_0001";
  let activeTokenHash = createHash("sha256").update(TOKEN).digest("hex");
  let activeCreatedAt = "2026-08-23T10:00:00.000Z";
  let authenticatedUserId = USER_ID;
  let membershipActivated = false;

  const fetchImpl = async (url, options = {}) => {
    const address = String(url);
    if (address.endsWith("/auth/v1/user")) {
      return jsonResponse({ id: authenticatedUserId });
    }
    if (address.includes("/rest/v1/rpc/can_write_shared_snapshot")) {
      assert.equal(options.headers.authorization, "Bearer creator-token");
      return jsonResponse(true);
    }
    if (address.includes("/rest/v1/app_snapshots?")) {
      return jsonResponse(
        address.includes("owner_user_id")
          ? [{ state: recoveredState }]
          : [redactedSharedSnapshot()]
      );
    }
    if (address.includes("/rest/v1/event_invite_tokens?")) {
      const params = new URL(address).searchParams;
      const requestedHash = params.get("token_hash")?.replace(/^eq\./, "");
      const row = {
        id: "33333333-3333-4333-8333-333333333333",
        event_id: EVENT_ID,
        kind: "open",
        created_by: USER_ID,
        recipient_user_id: null,
        space_id: SPACE_ID,
        space_key: SPACE_KEY,
        created_at: activeCreatedAt,
        expires_at: null
      };
      if (requestedHash) {
        return jsonResponse(requestedHash === activeTokenHash ? [row] : []);
      }
      return jsonResponse([row]);
    }
    if (address.endsWith("/rest/v1/rpc/rotate_open_event_invite")) {
      const body = JSON.parse(options.body);
      assert.equal(body.p_space_key, SPACE_KEY);
      activeTokenHash = body.p_token_hash;
      activeCreatedAt = body.p_created_at;
      return jsonResponse("33333333-3333-4333-8333-333333333333");
    }
    if (address.endsWith("/rest/v1/rpc/redeem_event_invite_membership")) {
      const body = JSON.parse(options.body);
      assert.equal(body.p_token_hash, activeTokenHash);
      assert.equal(body.p_user_id, OTHER_USER_ID);
      membershipActivated = true;
      return jsonResponse(true);
    }
    if (address.endsWith("/rest/v1/rpc/index_shared_event_for_member")) {
      return jsonResponse({ status: "indexed", snapshotId: SPACE_ID });
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
  };

  const created = await manageOpenEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer creator-token",
    eventId: EVENT_ID,
    operation: "ensure",
    fetchImpl
  });
  assert.equal(created.status, 200);
  assert.equal(created.payload.rotated, true);

  authenticatedUserId = OTHER_USER_ID;
  const redeemed = await redeemEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer recipient-token",
    eventId: EVENT_ID,
    token: created.payload.token,
    fetchImpl
  });

  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.payload.spaceId, SPACE_ID);
  assert.equal(redeemed.payload.spaceKey, SPACE_KEY);
  assert.equal(membershipActivated, true);
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
    authorization: "Bearer account-token",
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
      if (address.endsWith("/auth/v1/user")) {
        return jsonResponse({ id: USER_ID });
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
    authorization: "Bearer account-token",
    eventId: EVENT_ID,
    token: TOKEN,
    fetchImpl: async (url) => {
      const address = String(url);
      if (address.endsWith("/auth/v1/user")) {
        return jsonResponse({ id: USER_ID });
      }
      if (address.includes("/rest/v1/event_invite_tokens?")) {
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

test("an open event invitation cannot be redeemed without a signed-in account", async () => {
  let inviteLookup = false;
  let sharedEventRead = false;
  const redemption = await redeemEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    eventId: EVENT_ID,
    token: TOKEN,
    fetchImpl: async (url) => {
      const address = String(url);
      if (address.includes("/rest/v1/event_invite_tokens?")) {
        inviteLookup = true;
        return jsonResponse([{
          id: "33333333-3333-4333-8333-333333333333",
          event_id: EVENT_ID,
          kind: "open",
          created_by: USER_ID,
          space_id: SPACE_ID,
          space_key: SPACE_KEY,
          expires_at: null
        }]);
      }
      if (address.includes("/rest/v1/app_snapshots?")) sharedEventRead = true;
      throw new Error(`Unexpected request: ${address}`);
    }
  });

  assert.equal(redemption.status, 401);
  assert.equal(redemption.payload.code, "EVENT_INVITE_AUTH_REQUIRED");
  assert.equal(inviteLookup, false);
  assert.equal(sharedEventRead, false);
});

test("an invalid account session is rejected before invite lookup", async () => {
  let inviteLookup = false;
  const redemption = await redeemEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer invalid-account-token",
    eventId: EVENT_ID,
    token: TOKEN,
    fetchImpl: async (url) => {
      const address = String(url);
      if (address.endsWith("/auth/v1/user")) {
        return new Response(null, { status: 401 });
      }
      if (address.includes("/rest/v1/event_invite_tokens?")) {
        inviteLookup = true;
      }
      throw new Error(`Unexpected request: ${address}`);
    }
  });

  assert.equal(redemption.status, 401);
  assert.equal(redemption.payload.code, "EVENT_INVITE_AUTH_REQUIRED");
  assert.equal(inviteLookup, false);
});

test("invite redemption keeps a membership error body inside its deadline", async () => {
  const recipientParticipantId = `account-${OTHER_USER_ID}`;
  const sharedState = serverState();
  sharedState.participants.push({
    id: recipientParticipantId,
    displayName: "Invited participant"
  });
  sharedState.events[0].participantIds.push(recipientParticipantId);
  let activationSignal = null;

  await assert.rejects(
    Promise.race([
      redeemEventInvite({
        runtimeConfig: runtimeConfig(),
        env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
        authorization: "Bearer recipient-token",
        eventId: EVENT_ID,
        token: TOKEN,
        requestTimeoutMs: 20,
        fetchImpl: async (url, options = {}) => {
          const address = String(url);
          if (address.endsWith("/auth/v1/user")) {
            return jsonResponse({ id: OTHER_USER_ID });
          }
          if (address.includes("/rest/v1/event_invite_tokens?")) {
            return jsonResponse([{
              id: "44444444-4444-4444-8444-444444444444",
              event_id: EVENT_ID,
              kind: "private",
              created_by: USER_ID,
              recipient_user_id: OTHER_USER_ID,
              space_id: SPACE_ID,
              space_key: SPACE_KEY,
              expires_at: "2099-01-01T00:00:00.000Z"
            }]);
          }
          if (address.includes("/rest/v1/app_snapshots?")) {
            return jsonResponse([sharedSnapshot(sharedState)]);
          }
          if (address.endsWith("/rest/v1/rpc/redeem_event_invite_membership")) {
            activationSignal = options.signal;
            return {
              ok: false,
              status: 503,
              text: () => new Promise(() => {})
            };
          }
          throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
        }
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("invite membership error body stayed unbounded")), 300)
      )
    ]),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.equal(activationSignal?.aborted, true);
});

test("an active participant can redeem a private event invite while friendship is pending", async () => {
  const recipientParticipantId = `account-${OTHER_USER_ID}`;
  const sharedState = serverState();
  sharedState.participants.push({
    id: recipientParticipantId,
    displayName: "Invited participant"
  });
  sharedState.events[0].participantIds.push(recipientParticipantId);
  const requests = [];

  const redemption = await redeemEventInvite({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer recipient-token",
    eventId: EVENT_ID,
    token: TOKEN,
    fetchImpl: async (url, options = {}) => {
      const address = String(url);
      requests.push({ address, options });
      if (
        address.includes("/rest/v1/event_invite_tokens?") &&
        options.method !== "PATCH"
      ) {
        return jsonResponse([
          {
            id: "44444444-4444-4444-8444-444444444444",
            event_id: EVENT_ID,
            kind: "private",
            created_by: USER_ID,
            recipient_user_id: OTHER_USER_ID,
            space_id: SPACE_ID,
            space_key: SPACE_KEY,
            expires_at: "2099-01-01T00:00:00.000Z"
          }
        ]);
      }
      if (address.endsWith("/auth/v1/user")) {
        return jsonResponse({ id: OTHER_USER_ID });
      }
      if (address.includes("/rest/v1/app_snapshots?")) {
        return jsonResponse([sharedSnapshot(sharedState)]);
      }
      if (address.endsWith("/rest/v1/rpc/redeem_event_invite_membership")) {
        return jsonResponse({ status: "active" });
      }
      if (address.endsWith("/rest/v1/rpc/index_shared_event_for_member")) {
        return jsonResponse({ status: "indexed", snapshotId: SPACE_ID });
      }
      if (
        address.includes("/rest/v1/event_invite_tokens?") &&
        options.method === "PATCH"
      ) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
    }
  });

  assert.equal(redemption.status, 200);
  assert.equal(redemption.payload.kind, "private");
  assert.equal(redemption.payload.spaceId, SPACE_ID);
  assert.equal(redemption.payload.indexPending, false);
  const activation = requests.find((request) =>
    request.address.endsWith("/rest/v1/rpc/redeem_event_invite_membership")
  );
  assert.deepEqual(JSON.parse(activation.options.body), {
    p_invite_id: "44444444-4444-4444-8444-444444444444",
    p_token_hash: "6aee57d3be56e70babaca8a2590d9da69566d8d629b0f46c02609af14fa82907",
    p_user_id: OTHER_USER_ID
  });
  assert.equal(
    requests.some((request) => request.address.includes("/rest/v1/friendships?")),
    false
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
