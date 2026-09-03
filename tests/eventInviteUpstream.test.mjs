import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { activateEventInviteMembership, redeemEventInvite } from "../src/server/eventInvites.mjs";

const OWNER = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const INVITE = "33333333-3333-4333-8333-333333333333";
const KEY = "shared-event-test-secret-that-is-long-enough";
const TOKEN = "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456";
const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { "content-type": "application/json" }
});

function fixture(overrides = {}) {
  const invite = {
    id: INVITE, event_id: "event-test", kind: "open", created_by: OWNER,
    space_id: "space-test", space_key: KEY, expires_at: null
  };
  const snapshot = {
    access_key_hash: createHash("sha256").update(KEY).digest("hex"),
    state: {
      events: [{
        id: "event-test", participantIds: [`account-${OWNER}`],
        adminIds: [`account-${OWNER}`], createdByParticipantId: `account-${OWNER}`
      }]
    }
  };
  const replies = {
    auth: () => json({ id: MEMBER }),
    invite: () => json([invite]),
    snapshot: () => json([snapshot]),
    membership: () => json({
      status: "joined", canonicalParticipantReady: true, workspaceIndexed: true
    }),
    ...overrides
  };
  const calls = [];
  return {
    invite, snapshot, calls,
    run: () => redeemEventInvite({
      runtimeConfig: { storage: { url: "https://upstream.invalid", anonKey: "anon" } },
      env: { SUPABASE_SERVICE_ROLE_KEY: "test-service-secret" },
      authorization: "Bearer test-account-secret",
      eventId: "event-test", token: TOKEN,
      fetchImpl: async (url, options) => {
        const path = new URL(url).pathname;
        const stage = path === "/auth/v1/user" ? "auth"
          : path === "/rest/v1/event_invite_tokens" ? "invite"
          : path === "/rest/v1/app_snapshots" ? "snapshot"
          : path === "/rest/v1/rpc/redeem_event_invite_membership" ? "membership"
          : "unexpected";
        calls.push({ stage, method: options.method ?? "GET" });
        assert.ok(replies[stage], `Unexpected upstream path: ${path}`);
        return replies[stage]();
      }
    })
  };
}

for (const stage of ["auth", "invite", "snapshot", "membership"]) {
  for (const status of [408, 429, 500, 503]) {
    test(`${stage} HTTP ${status} is unavailable, never a dead invitation`, async () => {
      const probe = fixture({ [stage]: () => json({ message: "temporary" }, status) });
      const result = await probe.run();
      assert.equal(result.status, 503);
      assert.equal(result.payload.code, "EVENT_INVITES_UNAVAILABLE");
      assert.equal(result.payload.retryable, true);
      assert.equal(result.payload.stage, stage);
      assert.equal(result.payload.upstreamStatus, status);
      assert.equal(probe.calls.at(-1).stage, stage);
      assert.equal(probe.calls.filter((call) => call.stage === stage).length, 1);
    });
  }
  for (const body of ["not-json", "null", "[]", "{}"] ) {
    if (body === "[]" && ["invite", "snapshot"].includes(stage)) continue;
    test(`${stage} malformed success ${body} is not absence or activation`, async () => {
      const result = await fixture({ [stage]: () => new Response(body) }).run();
      assert.equal(result.status, 502);
      assert.equal(result.payload.code, "EVENT_INVITES_UNAVAILABLE");
      assert.equal(result.payload.retryable, true);
      assert.equal(result.payload.stage, stage);
    });
  }
}

for (const stage of ["invite", "snapshot", "membership"]) {
  for (const status of [401, 403, 404, 409]) {
    test(`${stage} unexplained HTTP ${status} does not revoke or auto-retry`, async () => {
      const result = await fixture({ [stage]: () => json({ message: "configuration failure" }, status) }).run();
      assert.equal(result.status, 502);
      assert.equal(result.payload.retryable, false);
      assert.equal(result.payload.code, "EVENT_INVITES_UNAVAILABLE");
    });
  }
}

for (const code of ["40001", "40P01", "55P03", "57014"]) {
  test(`membership SQL ${code} is retryable even on HTTP 400/409`, async () => {
    const result = await fixture({ membership: () => json({
      code, message: "private detail", details: TOKEN, hint: KEY
    }, code === "40001" ? 409 : 400) }).run();
    assert.equal(result.status, 503);
    assert.equal(result.payload.retryable, true);
    assert.equal(result.payload.upstreamCode, code);
    assert.ok(!JSON.stringify(result).includes(TOKEN));
    assert.ok(!JSON.stringify(result).includes(KEY));
    assert.ok(!JSON.stringify(result).includes("private detail"));
  });
}

for (const message of [
  "Event invitation is invalid", "Event invitation is no longer active",
  "You are no longer a member of this event", "Shared event is no longer available",
  "Invited account is unavailable"
]) {
  test(`confirmed membership denial stays permanent: ${message}`, async () => {
    const result = await fixture({ membership: () => json({ code: "42501", message }, 403) }).run();
    assert.equal(result.status, 410);
    assert.equal(result.payload.code, "EVENT_INVITE_INVALIDATED");
    assert.notEqual(result.payload.retryable, true);
  });
}

test("an internal permission failure is neither a revoked link nor retryable", async () => {
  const result = await fixture({ membership: () => json({
    code: "42501", message: "permission denied for table app_snapshots"
  }, 403) }).run();
  assert.equal(result.status, 502);
  assert.equal(result.payload.retryable, false);
  assert.equal(result.payload.upstreamCode, "42501");
});

for (const payload of [false, 1, [], {}, { status: "unknown" },
  { status: "joined", canonicalParticipantReady: true, workspaceIndexed: false }]) {
  test(`invalid membership receipt never fabricates success: ${JSON.stringify(payload)}`, async () => {
    const result = await fixture({ membership: () => json(payload) }).run();
    assert.equal(result.status, 502);
    assert.equal(result.payload.stage, "membership");
  });
}

for (const payload of [true, { status: "active" },
  { status: "existing", canonicalParticipantReady: true, workspaceIndexed: true }]) {
  test(`supported membership receipt remains compatible: ${JSON.stringify(payload)}`, async () => {
    const result = await fixture({ membership: () => json(payload) }).run();
    assert.equal(result.status, 200);
  });
}

test("a successful empty invite lookup still means revoked", async () => {
  const result = await fixture({ invite: () => json([]) }).run();
  assert.equal(result.status, 410);
  assert.equal(result.payload.code, "EVENT_INVITE_REVOKED");
});

test("a successful empty snapshot lookup still means unavailable event", async () => {
  const result = await fixture({ snapshot: () => json([]) }).run();
  assert.equal(result.status, 410);
  assert.equal(result.payload.code, "EVENT_INVITE_INVALIDATED");
});

test("a rotated access key is still a permanent invalidation", async () => {
  const probe = fixture();
  probe.snapshot.access_key_hash = "a".repeat(64);
  assert.equal((await probe.run()).payload.code, "EVENT_INVITE_INVALIDATED");
});

test("an expired invite is not retried", async () => {
  const probe = fixture();
  probe.invite.expires_at = "2020-01-01T00:00:00Z";
  assert.equal((await probe.run()).payload.code, "EVENT_INVITE_EXPIRED");
  assert.equal(probe.calls.at(-1).stage, "invite");
});

test("a private invitation still rejects the wrong recipient", async () => {
  const probe = fixture();
  probe.invite.kind = "private";
  probe.invite.recipient_user_id = OWNER;
  const result = await probe.run();
  assert.equal(result.status, 403);
  assert.equal(result.payload.code, "PRIVATE_INVITE_RECIPIENT_MISMATCH");
});

for (const status of [401, 403]) {
  test(`auth ${status} still requires the account to sign in`, async () => {
    const probe = fixture({ auth: () => new Response(null, { status }) });
    const result = await probe.run();
    assert.equal(result.status, 401);
    assert.equal(result.payload.code, "EVENT_INVITE_AUTH_REQUIRED");
    assert.equal(probe.calls.length, 1);
  });
}

test("a corrupt stored snapshot is not mistaken for a removed event", async () => {
  const probe = fixture();
  probe.snapshot.state = null;
  const result = await probe.run();
  assert.equal(result.status, 502);
  assert.equal(result.payload.stage, "snapshot");
});

for (const [status, payload] of [[503, {}], [403, { code: "42501",
  message: "Event invitation is no longer active" }], [200, null]]) {
  test(`notification membership helper keeps its boolean contract on ${status}/${JSON.stringify(payload)}`, async () => {
    let calls = 0;
    const activation = await activateEventInviteMembership({
      supabaseUrl: "https://upstream.invalid", serviceRoleKey: "secret",
      invite: { id: INVITE, token: TOKEN }, snapshotId: "space-test", userId: MEMBER,
      fetchImpl: async () => { calls += 1; return json(payload, status); }
    });
    assert.equal(activation, false);
    assert.equal(calls, 1, "a failed activation must not index or retry");
  });
}

test("notification membership helper still propagates a deadline timeout", async () => {
  await assert.rejects(activateEventInviteMembership({
    supabaseUrl: "https://upstream.invalid", serviceRoleKey: "secret",
    invite: { id: INVITE, token: TOKEN }, snapshotId: "space-test", userId: MEMBER,
    requestTimeoutMs: 20,
    fetchImpl: async () => new Promise(() => {})
  }), { code: "NETWORK_TIMEOUT" });
});
