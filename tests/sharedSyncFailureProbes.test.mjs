import test from "node:test";
import assert from "node:assert/strict";
import { saveSharedEventState, syncSharedEvents } from "../src/data/sharedEventStore.mjs";

const config = { storage: { mode: "supabase", url: "https://fixture.supabase.test", table: "app_snapshots",
  anonKey: "fixture-public-key", account: { userId: "owner", accessToken: "fixture-token" } } };
function state() {
  return { currentParticipantId: "account-owner", groups: [],
    participants: [{ id: "account-owner", displayName: "Test Owner" }],
    events: [{ id: "event-fixture", name: "Test Event", participantIds: ["account-owner"],
      adminIds: ["account-owner"], notes: [], expenses: [], transfers: [],
      sharedSpaceId: "shared-fixture", sharedSpaceKey: "fixture-share-key-long-enough-for-sync" }] };
}

test("a stale outbox cannot recreate an event after the server confirms that its member left", async () => {
  const local = state();
  local.events[0].expenses = [{ id: "expense-retained", total: 1200,
    payers: [{ participantId: "account-owner", amount: 1200 }],
    sharedByParticipantIds: ["account-owner"] }];
  const original = structuredClone(local), writes = [], membershipChecks = [];
  const outcome = await saveSharedEventState(config, local, "event-fixture", async (url, options = {}) => {
    if (String(url).endsWith("/rpc/join_shared_event")) {
      membershipChecks.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ message: "You are no longer a member of this event" }), { status: 403 });
    }
    if (options.method && options.method !== "GET") {
      writes.push({ url: String(url), body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ message: "Unexpected attempt to recreate a departed member's event" }), { status: 501 });
    }
    return new Response("[]", { status: 200 });
  }).then(value => ({ value }), error => ({ error }));
  assert.deepEqual(writes, [], "revoked membership must be established before any create/write request");
  assert.equal(outcome.error, undefined);
  assert.deepEqual(membershipChecks, [{ p_snapshot_id: "shared-fixture" }]);
  const event = outcome.value.events[0];
  assert.deepEqual(event.expenses, original.events[0].expenses, "financial history remains available locally");
  assert.deepEqual(event.inactiveParticipantIds, ["account-owner"]);
  assert.equal(event.sharedSpaceId, undefined);
  assert.equal(event.sharedSpaceKey, undefined);
  assert.deepEqual(local, original, "the input and any pending intent are not mutated");
});

for (const status of [401, 402, 408, 429, 500, 503]) {
  test(`HTTP ${status} save failures do not launch a redundant membership request`, async () => {
    const local = state(), calls = [];
    await assert.rejects(syncSharedEvents(config, local, async url => {
      calls.push(String(url));
      return new Response("{}", { status });
    }), error => error.code === "SHARED_EVENT_SYNC_FAILED" && error.cause.status === status);
    assert.equal(calls.length, 1, "auth/quota/transport failures are not evidence of revoked membership");
    assert.ok(local.events[0].sharedSpaceKey, "local intent and membership must remain intact");
  });
}

test("a network failure is preserved without a second membership round trip", async () => {
  let calls = 0;
  const failure = new TypeError("Failed to fetch");
  await assert.rejects(syncSharedEvents(config, state(), async () => {
    calls += 1;
    throw failure;
  }), error => error.cause === failure);
  assert.equal(calls, 1);
});

for (const revoked of [false, true]) {
  test(`a forbidden write still verifies explicit membership revocation (${revoked})`, async () => {
    const calls = [];
    const operation = syncSharedEvents(config, state(), async url => {
      calls.push(String(url));
      if (String(url).endsWith("/rpc/join_shared_event")) {
        return new Response(JSON.stringify(revoked
          ? { message: "You are no longer a member of this event" }
          : {}), { status: revoked ? 403 : 200 });
      }
      return new Response("{}", { status: 403 });
    });
    if (revoked) {
      const result = await operation;
      assert.equal(result.events[0].sharedSpaceKey, undefined);
    } else {
      await assert.rejects(operation, error => error.cause.status === 403);
    }
    assert.equal(calls.length, 2);
  });
}
