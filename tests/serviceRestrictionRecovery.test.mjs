import assert from "node:assert/strict";
import test from "node:test";

import { buildSharedEventState } from "../src/data/sharedEventStore.mjs";
import { isRetryablePendingSyncFailure } from "../src/data/localStore.mjs";
import { saveFailureKind, pendingSaveMessage } from "../src/domain/userNoticePolicy.mjs";

test("a project restriction is retryable without masking permanent rejections", () => {
  const restricted = Object.assign(new Error("Project restricted"), { status: 402 });
  assert.equal(isRetryablePendingSyncFailure(restricted), true);
  assert.equal(isRetryablePendingSyncFailure({ cause: restricted }), true);
  assert.equal(saveFailureKind(restricted), "server");
  assert.equal(pendingSaveMessage(saveFailureKind(restricted), true), "נשמר במכשיר · ממתין לסנכרון");
  for (const status of [400, 403, 404, 409, 410, 422]) {
    assert.equal(isRetryablePendingSyncFailure({ status }), false, `HTTP ${status}`);
  }
  assert.equal(isRetryablePendingSyncFailure(new TypeError("Broken code")), false);
});

for (const mutation of ["note", "expense", "settings"]) {
  test(`${mutation} changes saved during a project restriction survive and sync after recovery`, async () => {
    const previous = Object.fromEntries(
      ["window", "location", "localStorage", "fetch"].map(key => [key, globalThis[key]])
    );
    const values = new Map();
    const storage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key)
    };
    const spaceId = `space-restricted-${mutation}`;
    const sharedId = `shared-restricted-${mutation}`;
    const location = new URL("https://app.example.com/");
    const original = {
      currentParticipantId: "account-user-a",
      participants: [{ id: "account-user-a", displayName: "Test Account", kind: "user", accountLinked: true }],
      groups: [], friendContacts: [], deletedEvents: [], deletedParticipants: [],
      events: [{
        id: "event-recovery", name: "Recovery", eventType: "standard", currency: "ILS",
        participantIds: ["account-user-a"], adminIds: ["account-user-a"],
        createdByParticipantId: "account-user-a", createdAt: "2026-09-01T09:00:00.000Z",
        notes: [], expenses: [], transfers: [],
        sharedSpaceId: sharedId, sharedSpaceKey: "shared-restriction-test-key-long-enough"
      }]
    };
    const changed = structuredClone(original);
    const item = {
      id: `pending-${mutation}`, createdByParticipantId: "account-user-a",
      createdAt: "2026-09-01T09:01:00.000Z", updatedAt: "2026-09-01T09:01:00.000Z"
    };
    if (mutation === "note") {
      changed.events[0].notes.push({ ...item, title: "Test note", body: "Keep this change", pinned: false, updatedByParticipantId: "account-user-a" });
    } else if (mutation === "expense") {
      changed.events[0].expenses.push({ ...item, name: "Test expense", total: 100, payers: [{ participantId: "account-user-a", amount: 100 }], sharedByParticipantIds: ["account-user-a"] });
    } else {
      changed.participants[0].displayName = "Updated Account";
      changed.participants[0].profileUpdatedAt = item.updatedAt;
    }
    const spaceKey = "personal-restriction-test-key-long-enough";
    storage.setItem("settle-friends-account-session", JSON.stringify({
      access_token: "fixture-token", refresh_token: "fixture-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "user-a", user_metadata: { account_space_id: spaceId, account_space_key: spaceKey } }
    }));
    storage.setItem("settle-friends-cloud-space", spaceId);
    storage.setItem(`settle-friends-cloud-key:${spaceId}`, spaceKey);
    storage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(original));
    const pendingKey = `settle-friends-pending-sync:${spaceId}`;
    const timers = new Map(), delays = [], events = [];
    let timerId = 0, restricted = true, cloudWrites = 0;
    let canonical = buildSharedEventState(original, "event-recovery");
    let workspace = structuredClone(original);
    globalThis.window = {
      localStorage: storage, location, addEventListener() {}, dispatchEvent: event => events.push(event),
      setTimeout(callback, delay) { delays.push(delay); timers.set(++timerId, callback); return timerId; },
      clearTimeout: id => timers.delete(id)
    };
    globalThis.location = location;
    globalThis.localStorage = storage;
    globalThis.fetch = async (url, options = {}) => {
      const address = new URL(String(url), location);
      if (address.pathname === "/api/config") {
        return json({ storage: { mode: "supabase", url: "https://project.supabase.co", anonKey: "fixture-key", table: "shared_state" } });
      }
      assert.equal(address.origin, "https://project.supabase.co");
      if (restricted) return { ok: false, status: 402 };
      if (address.pathname.endsWith("/rpc/update_shared_event_snapshot")) {
        canonical = structuredClone(JSON.parse(options.body).p_state);
        cloudWrites += 1;
        return json({ status: "updated", updatedAt: "2026-09-01T09:02:00.000Z" });
      }
      const id = address.searchParams.get("id");
      assert.ok([`eq.${spaceId}`, `eq.${sharedId}`].includes(id));
      if (options.method === "PATCH") {
        assert.equal(id, `eq.${spaceId}`);
        workspace = structuredClone(JSON.parse(options.body).state);
        cloudWrites += 1;
        return json([{ updated_at: "2026-09-01T09:03:00.000Z" }]);
      }
      assert.ok(!options.method || options.method === "GET");
      return json([{ state: structuredClone(id === `eq.${spaceId}` ? workspace : canonical), updated_at: "2026-09-01T09:00:00.000Z" }]);
    };
    const runRetry = async () => {
      assert.equal(timers.size, 1, "only one recovery retry may be scheduled");
      const [id, callback] = timers.entries().next().value;
      timers.delete(id);
      await callback();
    };
    try {
      const store = await import(`../src/data/localStore.mjs?restriction-${mutation}=${Date.now()}`);
      const result = await store.saveSharedState(changed, { awaitCloud: true });
      assert.equal(result.ok, true);
      assert.equal(result.mode, "queued");
      assert.equal(result.pending, true);
      assert.equal(result.reverted, undefined);
      const { __pendingSync, ...queuedState } = JSON.parse(storage.getItem(pendingKey));
      assert.deepEqual(queuedState, changed);
      assert.deepEqual(__pendingSync, { version: 1, selection: { eventIds: ["event-recovery"], deletedEventIds: [] } });
      assert.deepEqual(JSON.parse(storage.getItem(`settle-friends-state:${spaceId}`)), changed);
      for (let attempt = 0; attempt < 8; attempt += 1) await runRetry();
      assert.deepEqual(delays, [1_200, 3_500, 8_000, 15_000, 30_000, 60_000, 120_000, 120_000, 120_000], "persistent restrictions use capped backoff, not a tight retry loop");
      assert.equal(cloudWrites, 0);
      assert.equal(events.some(event => event.type === "sogrim:shared-save-reverted"), false);
      assert.equal(events.some(event => event.detail?.status === "saved"), false);
      restricted = false;
      await runRetry();
      assert.equal(storage.getItem(pendingKey), null, "clear the outbox only after cloud persistence");
      assert.equal(timers.size, 0);
      if (mutation === "settings") {
        assert.equal(workspace.participants[0].displayName, "Updated Account");
      } else {
        const collection = mutation === "note" ? "notes" : "expenses";
        for (const state of [canonical, workspace, store.loadState()]) {
          assert.deepEqual(state.events[0][collection].map(entry => entry.id), [item.id]);
        }
      }
      const completedWrites = cloudWrites;
      assert.deepEqual(await store.flushPendingSharedState(), { ok: true, empty: true });
      assert.equal(cloudWrites, completedWrites, "a completed change is not sent again");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    }
  });
}

function json(payload) {
  return { ok: true, status: 200, async json() { return payload; } };
}
