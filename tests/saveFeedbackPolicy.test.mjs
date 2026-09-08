import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { saveFailureKind, saveFailureMessage, pendingSaveMessage, noticePresentation } from "../src/domain/userNoticePolicy.mjs";

for (const [error, kind] of [
  [{ status: 403 }, "permission"], [{ cause: { status: 401 } }, "auth"],
  [{ code: "LOCAL_STORAGE_UNAVAILABLE" }, "storage"], [{ name: "QuotaExceededError" }, "storage"],
  [{ code: "CLOUD_STATE_CONFLICT" }, "conflict"], [{ status: 422 }, "rejected"],
  [{ status: 404 }, "missing"], [{ status: 503 }, "server"], [{ status: 429 }, "server"],
  [{ code: "NETWORK_TIMEOUT" }, "connection"], [new TypeError("Failed to fetch"), "connection"],
  [new TypeError("Cannot read properties of null (reading 'connection')"), "unavailable"],
  [{ failures: [{ status: 403 }, { code: "ERR_NETWORK" }] }, "permission"]
]) test(`save failure classification: ${kind} ${JSON.stringify(error)}`, () => {
  assert.equal(saveFailureKind(error), kind);
});

test("cycles in nested errors terminate without losing the real cause", () => {
  const error = { cause: { status: 403 } }; error.failures = [error, null, "bad"];
  assert.equal(saveFailureKind(error), "permission");
});
test("only a durable accepted pending outcome suppresses failure text", () => {
  assert.equal(saveFailureMessage({ ok: true, pending: true, error: { status: 503 } }), "");
  assert.match(saveFailureMessage({ ok: false, error: { status: 503 } }), /השרת/);
});
test("offline browser state never turns a permission or code error into an internet excuse", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: false } });
  try {
    assert.match(saveFailureMessage({ error: { status: 403 } }), /הרשאה/);
    assert.doesNotMatch(saveFailureMessage({ error: new TypeError("bad code") }), /אינטרנט|חיבור/);
    assert.match(saveFailureMessage({ error: { code: "ERR_NETWORK" } }), /אין חיבור לאינטרנט/);
  } finally { if (previous) Object.defineProperty(globalThis, "navigator", previous); else delete globalThis.navigator; }
});
test("error wording preserves drafts without leaking server text", () => {
  const message = saveFailureMessage({ error: { status: 403, message: "private-payload" } }, "הפתק לא נשמר.", { draft: true });
  assert.match(message, /הטיוטה נשארה כאן/); assert.doesNotMatch(message, /private-payload|בדקו את החיבור/);
  assert.equal(noticePresentation(message).kind, "error");
});
test("pending authentication is actionable and never promises automatic completion", () => {
  assert.match(pendingSaveMessage("auth"), /התחברו מחדש/);
  assert.equal(pendingSaveMessage("", false), "");
  assert.match(pendingSaveMessage("permission"), /אין הרשאה/);
});

const layer = readFileSync(new URL("../src/publicSyncStatusLayer.mjs", import.meta.url), "utf8");
for (const online of [true, false]) {
  for (const failureKind of ["", "server", "connection"]) {
    test(`pending-sync regression: background delivery stays silent (${failureKind || "queued"}, online=${online})`, () => {
      assert.equal(pendingSaveMessage(failureKind, online), "");
    });
  }
  test(`pending-sync regression: restored outbox never adds a banner on any screen (online=${online})`, () => {
    const h = harness({ ok: true });
    h.context.navigator.onLine = online;
    h.context.pendingSync = true;
    h.context.pendingEventIds = ["event-a"];
    for (const eventId of [undefined, "event-a", "event-b"]) {
      h.target.dataset.syncEventId = eventId;
      h.context.syncInlineStatusTargets();
      h.expireGrace();
      assert.equal(h.target.hidden, true);
      assert.equal(h.target.textContent, "");
      assert.equal(h.context.pendingSync, true, "quiet UI must not acknowledge undelivered data");
      assert.deepEqual(h.context.pendingEventIds, ["event-a"]);
    }
  });
}
function functionSource(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(layer);
  assert.ok(match, name);
  const rest = layer.slice(match.index + 1), end = /\n(?:async )?function /.exec(rest);
  return layer.slice(match.index, end ? match.index + 1 + end.index : undefined);
}
function harness(result) {
  const statuses = [], target = { className: "hint", textContent: "", hidden: true, dataset: { syncEventId: "event-a" }, closest: () => null };
  const timers = new Map();
  let nextTimer = 0;
  const context = vm.createContext({
    window: { localStorage: {}, setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
      clearTimeout: id => timers.delete(id) },
    navigator: { onLine: true }, pendingSaveMessage, saveFailureKind,
    currentStatus: "", pendingSync: false, pendingEventIds: null, pendingFailureKind: "", connectivityRevision: 0,
    mutationLockReason: "offline", reconnectPromise: null, offlineProbePromise: null,
    flushPendingSharedState: async () => { if (result instanceof Error) throw result; return result; },
    loadRuntimeConfig: async () => ({ storage: { mode: "supabase" } }),
    pendingSharedSyncStatus: () => ({ pending: false, pendingEventIds: [] }),
    showStatus: status => statuses.push(status), syncMutationControls: () => {},
    activeSaveScreenSignature: "", screenSignature: () => "event:notes",
    document: { body: { classList: { toggle() {} } }, querySelector: () => null,
      querySelectorAll: selector => selector === "[data-inline-sync-status]" ? [target] : [] }
  });
  for (const name of ["recoverOnlineMutationAccess", "handleOffline", "handleSyncStatus", "syncInlineStatusTargets", "refreshPendingStatusFromStorage", "refreshPendingStatus"])
    vm.runInContext(functionSource(name), context);
  return { context, statuses, target, timers, expireGrace() {
    context.syncInlineStatusTargets();
    for (const [id, timer] of timers) {
      assert.equal(timer.delay, 5_000);
      timers.delete(id); timer.callback();
    }
  } };
}
for (const result of [{ ok: false, error: { status: 403 } }, { ok: false, error: { status: 503 } }, new TypeError("bad code")]) {
  test(`online recovery does not lock unrelated actions on ${JSON.stringify(result)}`, async () => {
    const h = harness(result); await h.context.recoverOnlineMutationAccess();
    assert.equal(h.context.mutationLockReason, "");
    assert.ok(!h.statuses.includes("offline"));
  });
}
test("pending delivery stays silent and is cleared only by an explicit completion", () => {
  const h = harness({ ok: true });
  h.context.handleSyncStatus({ detail: { status: "reconnecting", pending: true } });
  h.expireGrace();
  assert.equal(h.target.hidden, true); assert.equal(h.context.pendingSync, true);
  h.context.handleSyncStatus({ detail: { status: "saving" } });
  h.context.syncInlineStatusTargets(); assert.equal(h.target.hidden, true);
  assert.equal(h.context.pendingSync, true);
  h.context.handleSyncStatus({ detail: { status: "saved", pending: false } });
  h.context.syncInlineStatusTargets(); assert.equal(h.target.hidden, true);
  assert.equal(h.context.pendingSync, false);
});
test("a read failure without a durable outbox never claims a locally saved change", () => {
  const h = harness({ ok: true });
  h.context.handleSyncStatus({ detail: { status: "unavailable", pending: false } });
  h.context.syncInlineStatusTargets(); assert.equal(h.target.hidden, true);
});

test("an actionable failure in one event never labels another event", () => {
  const h = harness({ ok: true });
  h.context.handleSyncStatus({ detail: { status: "unavailable", pending: true, failureKind: "permission", pendingEventIds: ["event-a"] } });
  h.expireGrace();
  assert.equal(h.target.hidden, false);
  h.target.dataset.syncEventId = "event-b";
  h.context.syncInlineStatusTargets();
  assert.equal(h.target.hidden, true, "navigation to an unchanged event must not carry the warning");
  delete h.target.dataset.syncEventId;
  h.context.syncInlineStatusTargets();
  assert.equal(h.target.hidden, false, "the account overview must still show an actionable failure");
});

test("partial progress clears healthy event warnings while preserving the failed event", () => {
  const h = harness({ ok: true });
  h.context.handleSyncStatus({ detail: { status: "reconnecting", pending: true, pendingEventIds: ["event-a", "event-b"] } });
  h.context.handleSyncStatus({ detail: { status: "unavailable", pending: true, pendingEventIds: ["event-b"], failureKind: "permission" } });
  h.context.syncInlineStatusTargets();
  assert.equal(h.target.hidden, true);
  h.target.dataset.syncEventId = "event-b";
  h.context.syncInlineStatusTargets();
  assert.match(h.target.textContent, /הרשאה/);
  h.context.handleSyncStatus({ detail: { status: "", pending: false, pendingEventIds: [] } });
  h.context.syncInlineStatusTargets();
  assert.equal(h.target.hidden, true);
});

test("a pending personal receipt stays unacknowledged and silent on home and in confirmed groups", () => {
  const h = harness({ ok: true });
  h.context.handleSyncStatus({ detail: { status: "unavailable", pending: true, pendingEventIds: [], failureKind: "server" } });
  h.expireGrace();
  assert.equal(h.target.hidden, true, "this group has a canonical acknowledgement");
  delete h.target.dataset.syncEventId;
  h.context.syncInlineStatusTargets();
  assert.equal(h.target.hidden, true);
  assert.equal(h.context.pendingSync, true, "the personal backup has NOT been acknowledged");
  assert.equal(h.target.textContent, "");
  h.context.handleSyncStatus({ detail: { status: "saved", pending: false } });
  h.context.syncInlineStatusTargets();
  assert.equal(h.target.hidden, true);
});

test("another tab completing the outbox clears pending state without a new save", () => {
  const h = harness({ ok: true });
  h.context.handleSyncStatus({ detail: { status: "reconnecting", pending: true, pendingEventIds: ["event-a"] } });
  h.context.refreshPendingStatusFromStorage({ key: "settle-friends-pending-sync:space-a" });
  h.context.syncInlineStatusTargets();
  assert.equal(h.target.hidden, true);
  assert.equal(h.context.pendingSync, false);
});

test("account refresh replaces the old account's pending event scope", () => {
  const h = harness({ ok: true });
  h.context.handleSyncStatus({ detail: { status: "reconnecting", pending: true, pendingEventIds: ["event-a"] } });
  h.context.pendingSharedSyncStatus = () => ({ pending: true, pendingEventIds: ["event-b"] });
  h.context.refreshPendingStatus();
  h.expireGrace();
  assert.equal(h.target.hidden, true);
  h.target.dataset.syncEventId = "event-b";
  h.context.syncInlineStatusTargets();
  assert.equal(h.target.hidden, true);
  assert.equal(h.context.pendingSync, true);
  assert.deepEqual(Array.from(h.context.pendingEventIds), ["event-b"]);
});
test("a stale offline probe cannot relock controls after an online event", async () => {
  const h = harness({ ok: true }); let complete;
  h.context.navigator.onLine = false;
  h.context.confirmServerIsUnreachable = () => new Promise(resolve => { complete = resolve; });
  const request = h.context.handleOffline();
  h.context.navigator.onLine = true;
  await h.context.recoverOnlineMutationAccess(); complete(true); await request;
  assert.equal(h.context.mutationLockReason, "");
});

for (const failureKind of ["", "server", "connection"]) {
  test(`ordinary pending ${failureKind || "delivery"} stays quiet through every retry`, () => {
    const h = harness({ ok: true });
    h.context.handleSyncStatus({ detail: { status: "reconnecting", pending: true, failureKind } });
    h.context.syncInlineStatusTargets();
    assert.equal(h.target.hidden, true);
    for (let attempt = 0; attempt < 3; attempt++) {
      h.context.handleSyncStatus({ detail: { status: "saving" } });
      h.context.syncInlineStatusTargets();
    }
    h.expireGrace();
    assert.equal(h.target.hidden, true);
    assert.equal(h.context.pendingSync, true);
    assert.equal(h.timers.size, 0, "no timer may reveal a pending banner later");
  });
}

test("a cloud acknowledgement clears pending state without scheduling feedback", () => {
  const h = harness({ ok: true });
  h.context.handleSyncStatus({ detail: { status: "reconnecting", pending: true } });
  h.context.syncInlineStatusTargets();
  h.context.handleSyncStatus({ detail: { status: "saved", pending: false } });
  h.context.syncInlineStatusTargets();
  h.expireGrace();
  assert.equal(h.timers.size, 0);
  assert.equal(h.target.hidden, true);
  assert.equal(h.context.pendingSync, false);
});

for (const failureKind of ["auth", "permission", "rejected", "missing", "storage", "unavailable", "conflict"]) {
  test(`actionable ${failureKind} remains visible without pending-sync copy`, () => {
    const h = harness({ ok: true });
    h.context.handleSyncStatus({ detail: { status: "unavailable", pending: true, failureKind } });
    h.context.syncInlineStatusTargets();
    assert.equal(h.target.hidden, false);
    assert.doesNotMatch(h.target.textContent, /ממתינ|נשמר.{0,10}במכשיר|סנכר/);
    assert.equal(h.timers.size, 0);
  });
}

test("offline pending work stays silent and retains local-first state", () => {
  const h = harness({ ok: true });
  h.context.navigator.onLine = false;
  h.context.handleSyncStatus({ detail: { status: "reconnecting", pending: true } });
  h.context.syncInlineStatusTargets();
  assert.equal(h.target.hidden, true);
  assert.equal(h.context.pendingSync, true);
  assert.equal(h.timers.size, 0);
});

test("a new save stays silent after the previous outbox is acknowledged", () => {
  const h = harness({ ok: true });
  h.context.handleSyncStatus({ detail: { status: "reconnecting", pending: true } });
  h.expireGrace();
  h.context.handleSyncStatus({ detail: { status: "saved", pending: false } });
  h.context.syncInlineStatusTargets();
  h.context.handleSyncStatus({ detail: { status: "reconnecting", pending: true } });
  h.context.syncInlineStatusTargets();
  assert.equal(h.target.hidden, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.context.pendingSync, true);
});
