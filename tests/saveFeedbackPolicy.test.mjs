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
  assert.match(pendingSaveMessage("", false), /כשהחיבור יחזור/);
  assert.match(pendingSaveMessage("permission"), /אין הרשאה/);
});

const layer = readFileSync(new URL("../src/publicSyncStatusLayer.mjs", import.meta.url), "utf8");
function functionSource(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(layer);
  assert.ok(match, name);
  const rest = layer.slice(match.index + 1), end = /\n(?:async )?function /.exec(rest);
  return layer.slice(match.index, end ? match.index + 1 + end.index : undefined);
}
function harness(result) {
  const statuses = [], target = { className: "hint", textContent: "", hidden: true, closest: () => null };
  const context = vm.createContext({
    navigator: { onLine: true }, pendingSaveMessage, saveFailureKind,
    currentStatus: "", pendingSync: false, pendingFailureKind: "", connectivityRevision: 0,
    mutationLockReason: "offline", reconnectPromise: null, offlineProbePromise: null,
    flushPendingSharedState: async () => { if (result instanceof Error) throw result; return result; },
    loadRuntimeConfig: async () => ({ storage: { mode: "supabase" } }),
    showStatus: status => statuses.push(status), syncMutationControls: () => {},
    activeSaveScreenSignature: "", screenSignature: () => "event:notes",
    document: { body: { classList: { toggle() {} } }, querySelector: () => null,
      querySelectorAll: selector => selector === "[data-inline-sync-status]" ? [target] : [] }
  });
  for (const name of ["recoverOnlineMutationAccess", "handleOffline", "handleSyncStatus", "syncInlineStatusTargets"])
    vm.runInContext(functionSource(name), context);
  return { context, statuses, target };
}
for (const result of [{ ok: false, error: { status: 403 } }, { ok: false, error: { status: 503 } }, new TypeError("bad code")]) {
  test(`online recovery does not lock unrelated actions on ${JSON.stringify(result)}`, async () => {
    const h = harness(result); await h.context.recoverOnlineMutationAccess();
    assert.equal(h.context.mutationLockReason, "");
    assert.ok(!h.statuses.includes("offline"));
  });
}
test("pending delivery has a passive inline indicator, cleared only by an explicit completion", () => {
  const h = harness({ ok: true });
  h.context.handleSyncStatus({ detail: { status: "reconnecting", pending: true } });
  h.context.syncInlineStatusTargets();
  assert.equal(h.target.hidden, false); assert.match(h.target.textContent, /ממתין לסנכרון/);
  h.context.handleSyncStatus({ detail: { status: "saving" } });
  h.context.syncInlineStatusTargets(); assert.equal(h.target.hidden, false);
  h.context.handleSyncStatus({ detail: { status: "saved", pending: false } });
  h.context.syncInlineStatusTargets(); assert.equal(h.target.hidden, true);
});
test("a read failure without a durable outbox never claims a locally saved change", () => {
  const h = harness({ ok: true });
  h.context.handleSyncStatus({ detail: { status: "unavailable", pending: false } });
  h.context.syncInlineStatusTargets(); assert.equal(h.target.hidden, true);
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
