import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function harness() {
  const match = /function requestVisibleNotificationInboxSync\(/.exec(source);
  assert.ok(match, "The visible app must poll the inbox without requiring push or navigation");
  const end = /\n(?:async )?function /.exec(source.slice(match.index + 1));
  const calls = [];
  const context = vm.createContext({
    document: { visibilityState: "visible" }, navigator: { onLine: true }, appBootHydrated: true,
    profileNameEditing: false, profileUsernameEditing: false,
    notificationInboxOwnerId: "a", notificationInboxGeneration: 1, generation: 1,
    state: { currentParticipantId: "account-a" }, session: { user: { id: "a" } },
    lastNotificationInboxRefreshAt: 0, NOTIFICATION_INBOX_SYNC_INTERVAL_MS: 12_000,
    window: { localStorage: {} }, Date: { now: () => 50_000 },
    loadStoredAccountSession: () => context.session,
    versionedReadCacheSessionGeneration: () => context.generation,
    refreshNotificationInbox: options => { calls.push(options); return Promise.resolve(); }
  });
  vm.runInContext(source.slice(match.index, match.index + 1 + end.index), context);
  return { context, calls };
}

test("inbox fallback is registered independently of event/friend screen eligibility", async () => {
  const h = harness();
  assert.match(source, /window\.setInterval\(requestVisibleNotificationInboxSync, ACTIVE_EVENT_SYNC_INTERVAL_MS\)/);
  await h.context.requestVisibleNotificationInboxSync();
  assert.equal(h.calls.length, 1);
  assert.notEqual(h.calls[0]?.force, true, "timer must coalesce, not queue forced reads");
});

for (const inactive of ["hidden", "offline", "booting", "signed-out", "account-transition", "profile-editing"]) {
  test(`inbox fallback does no work while ${inactive}`, async () => {
    const h = harness();
    if (inactive === "hidden") h.context.document.visibilityState = "hidden";
    if (inactive === "offline") h.context.navigator.onLine = false;
    if (inactive === "booting") h.context.appBootHydrated = false;
    if (inactive === "signed-out") h.context.session = null;
    if (inactive === "account-transition") h.context.state.currentParticipantId = "account-b";
    if (inactive === "profile-editing") h.context.profileNameEditing = true;
    await h.context.requestVisibleNotificationInboxSync();
    assert.equal(h.calls.length, 0);
  });
}

test("a manual/push refresh suppresses the adjacent scheduled read", async () => {
  const h = harness(); h.context.lastNotificationInboxRefreshAt = 49_000;
  await h.context.requestVisibleNotificationInboxSync();
  assert.equal(h.calls.length, 0);
});

test("an old session cooldown does not delay the new session", async () => {
  const h = harness(); h.context.lastNotificationInboxRefreshAt = 49_000; h.context.generation++;
  await h.context.requestVisibleNotificationInboxSync();
  assert.equal(h.calls.length, 1);
});

test("a backward device clock jump does not freeze inbox polling", async () => {
  const h = harness(); h.context.lastNotificationInboxRefreshAt = 60_000;
  await h.context.requestVisibleNotificationInboxSync();
  assert.equal(h.calls.length, 1);
});
