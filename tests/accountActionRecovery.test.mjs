import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { saveFailureMessage } from "../src/domain/userNoticePolicy.mjs";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const configFor = id => ({ storage: { account: { userId: id, accessToken: "synthetic-token" } } });
function extract(start, end) {
  const offset = source.indexOf(start);
  return offset < 0 ? "" : source.slice(offset, source.indexOf(end, offset));
}
const helper = extract("async function withNotificationAccountRecovery(", "async function sendEventActivityNotificationWithAccountRecovery(");
const activity = extract("async function sendEventActivityNotificationWithAccountRecovery(", "function pendingEventMembershipOwnerId(");
const inbox = extract("async function refreshNotificationInbox(", "function openInboxNotificationDestination(");
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; }
function harness({ config, refresh, send, load, markAll, markOne } = {}) {
  const calls = [], renders = [], refreshes = [];
  const context = vm.createContext({
    session: { user: { id: A } }, generation: 0,
    versionedReadCacheSessionGeneration: () => context.generation,
    state: { currentParticipantId: `account-${A}` }, saveFailureMessage,
    window: { localStorage: {} }, loadStoredAccountSession: () => context.session,
    pendingMutationOwnerIsActive: id => context.session?.user?.id === id,
    runtimeConfig: configFor(A),
    loadRuntimeConfig: () => config ? config(context) : Promise.resolve(configFor(context.session?.user?.id)),
    eventInviteAuthRefreshRequired: error => error?.status === 401 || error?.code === "AUTH_REQUIRED",
    SogrimAccountSession: { refresh: async () => { refreshes.push(true); return refresh ? refresh(context) : { access_token: "synthetic-fresh", user: { id: A } }; } },
    sendEventActivityNotification: async (cfg, payload) => {
      if (!cfg?.storage?.account?.accessToken) return { ok: false, reason: "unavailable" };
      calls.push({ action: "send", userId: cfg.storage.account.userId, payload });
      return send ? send(cfg, payload) : { ok: true };
    },
    notificationInboxOwnerId: A, notificationInboxGeneration: 0,
    lastNotificationInboxRefreshAt: 0,
    notificationInboxFollowUpRequest: null,
    notificationInboxReadRequests: new Map(), notificationInboxRequest: null, notificationInboxRefreshQueued: false,
    notificationInbox: { status: "ready", available: true, error: "", items: [{ id: "item-a", eventId: "event-a", readAt: "" }] },
    loadNotificationInbox: async cfg => load ? load(cfg) : ({ available: true, items: [{ id: `item-${cfg.storage.account.userId}`, readAt: "" }] }),
    markAllNotificationsRead: async cfg => { calls.push({ action: "mark-all", userId: cfg.storage.account.userId }); return markAll ? markAll(cfg) : true; },
    markNotificationRead: async (cfg, id) => { calls.push({ action: "mark-one", userId: cfg.storage.account.userId, id }); return markOne ? markOne(cfg, id) : true; },
    screen: { name: "notifications" }, profileNameEditing: false, profileUsernameEditing: false,
    notice: "", render: () => renders.push(true),
    emitOperationDeferred: () => {}, readFriendRequestNotificationIds: new Set(),
    friendRelationships: () => [], app: { dataset: {} }, document: { dispatchEvent: () => {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } }
  });
  vm.runInContext(helper + activity + inbox, context);
  context.completedSaveResult = request => Promise.resolve(request).then(result => result?.completion ?? result);
  vm.runInContext(extract("function publishEventActivityAfterSave(", "function completedSaveResult("), context);
  return { context, calls, renders, refreshes,
    switchToB() { context.generation++; context.session = { user: { id: B } }; context.state.currentParticipantId = `account-${B}`; },
    send: () => context.sendEventActivityNotificationWithAccountRecovery({ eventId: "event-a", activityId: "expense-a", kind: "expense-created" }) };
}

test("event activity recovers a locally expired token before reporting unavailable", async () => {
  let fresh = false;
  const h = harness({ config: async () => fresh ? configFor(A) : { storage: {} }, refresh: async () => { fresh = true; return { access_token: "synthetic-fresh", user: { id: A } }; } });
  assert.equal((await h.send()).ok, true);
  assert.equal(h.refreshes.length, 1);
  assert.equal(h.calls.length, 1);
});

test("event activity captured for A cannot be sent as B after config loading", async () => {
  const gate = deferred();
  const h = harness({ config: () => gate.promise });
  const request = h.send();
  h.switchToB(); gate.resolve(configFor(B));
  await assert.rejects(request, { code: "STALE_ACCOUNT" });
  assert.equal(h.calls.length, 0);
});

test("event activity retries explicit authentication rejection once, not ambiguous delivery", async () => {
  let attempts = 0;
  const h = harness({ send: async () => { if (++attempts === 1) throw Object.assign(new Error("Expired"), { status: 401 }); return { ok: true }; } });
  assert.equal((await h.send()).ok, true);
  assert.equal(h.calls.length, 2);
  const failed = harness({ send: async () => { throw Object.assign(new Error("Unknown"), { status: 502 }); } });
  await assert.rejects(failed.send(), { status: 502 });
  assert.equal(failed.calls.length, 1);
  assert.equal(failed.refreshes.length, 0);
});

test("a late inbox response for A cannot replace B's notifications", async () => {
  const gate = deferred(), started = deferred();
  const h = harness({ load: () => { started.resolve(); return gate.promise; } });
  const request = h.context.refreshNotificationInbox(); await started.promise;
  h.switchToB();
  h.context.notificationInbox = { status: "ready", available: true, items: [{ id: "item-b", readAt: "" }], error: "" };
  gate.resolve({ available: true, items: [{ id: "private-item-a", readAt: "" }] });
  await request;
  assert.equal(h.context.notificationInbox.items[0].id, "item-b");
});

test("a late failed inbox request for A cannot restore A's previous inbox over B", async () => {
  const gate = deferred(), started = deferred();
  const h = harness({ load: () => { started.resolve(); return gate.promise; } });
  const request = h.context.refreshNotificationInbox(); await started.promise;
  h.switchToB(); h.context.notificationInbox = { status: "ready", items: [{ id: "item-b" }], error: "" };
  gate.reject(new Error("Offline")); await request;
  assert.equal(h.context.notificationInbox.items[0].id, "item-b");
});

test("B can load its inbox while A's old request remains in flight", async () => {
  const gate = deferred(), started = deferred();
  const h = harness({ load: cfg => cfg.storage.account.userId === A ? (started.resolve(), gate.promise) : Promise.resolve({ available: true, items: [{ id: "item-b" }] }) });
  const old = h.context.refreshNotificationInbox(); await started.promise;
  h.switchToB();
  const current = h.context.refreshNotificationInbox();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const observed = h.context.notificationInbox.items[0]?.id;
  gate.resolve({ available: true, items: [{ id: "item-a" }] });
  await Promise.all([old, current]);
  assert.equal(observed, "item-b");
  assert.equal(h.context.notificationInbox.items[0].id, "item-b");
});

test("mark-all captured for A cannot mark B's entire inbox after a config race", async () => {
  const gate = deferred(); const h = harness({ config: () => gate.promise });
  const request = h.context.markAllInboxItemsRead();
  h.switchToB(); h.context.notice = "message-b";
  gate.resolve(configFor(B)); await request;
  assert.equal(h.calls.length, 0);
  assert.equal(h.context.notice, "message-b");
});

test("failed mark-all restores unread state and never promises a nonexistent retry queue", async () => {
  const h = harness({ markAll: async () => false, load: async () => { throw new Error("Offline"); } });
  await h.context.markAllInboxItemsRead();
  assert.equal(h.context.notificationInbox.items[0].readAt, "");
  assert.doesNotMatch(h.context.notice, /יסתנכרן בחיבור הבא/);
});

test("account A inbox rows are not visible during the transition to B", () => {
  const h = harness(); h.switchToB();
  assert.equal(h.context.visibleNotificationInboxItems().length, 0);
});

test("a failed single-item read is not left marked read only on this device", async () => {
  const h = harness({ markOne: async () => false });
  assert.equal(await h.context.markInboxItemRead("item-a"), false);
  assert.equal(h.context.notificationInbox.items[0].readAt, "");
});

test("a single-item read cannot migrate to another account during config loading", async () => {
  const gate = deferred(); const h = harness({ config: () => gate.promise });
  const request = h.context.markInboxItemRead("item-a");
  h.switchToB(); gate.resolve(configFor(B)); await request;
  assert.equal(h.calls.length, 0);
});

test("an old A request cannot overwrite fresh A data after an A-B-A account round trip", async () => {
  const old = deferred(), started = deferred(); let loads = 0;
  const h = harness({ load: async () => {
    if (++loads === 1) { started.resolve(); return old.promise; }
    return { available: true, items: [{ id: `fresh-${loads}` }] };
  } });
  const request = h.context.refreshNotificationInbox(); await started.promise;
  h.switchToB(); await h.context.refreshNotificationInbox();
  h.context.session = { user: { id: A } }; h.context.state.currentParticipantId = `account-${A}`;
  await h.context.refreshNotificationInbox();
  old.resolve({ available: true, items: [{ id: "old-a" }] }); await request;
  assert.equal(h.context.notificationInbox.items[0].id, "fresh-3");
});

test("same-account forced inbox refresh coalesces overlapping requests into one follow-up", async () => {
  const gate = deferred(), started = deferred(); let loads = 0;
  const h = harness({ load: async () => {
    if (++loads === 1) { started.resolve(); return gate.promise; }
    return { available: true, items: [{ id: "fresh" }] };
  } });
  const first = h.context.refreshNotificationInbox(); await started.promise;
  const second = h.context.refreshNotificationInbox({ force: true });
  const third = h.context.refreshNotificationInbox({ force: true });
  gate.resolve({ available: true, items: [{ id: "old" }] });
  await Promise.all([first, second, third]);
  assert.equal(loads, 2);
  assert.equal(h.context.notificationInbox.items[0].id, "fresh");
});

test("deferred expense activity cannot be sent by a different account after the save completes", async () => {
  const gate = deferred(); const h = harness();
  h.context.publishEventActivityAfterSave({ ok: true, completion: gate.promise }, "event-a", "expense-created", "expense-a");
  h.switchToB(); gate.resolve({ ok: true, mode: "cloud" });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(h.calls.length, 0);
});

test("device-local friend-request read markers reset with the inbox account owner", async () => {
  const h = harness(); h.context.readFriendRequestNotificationIds.add("friend-request:old");
  h.switchToB(); await h.context.refreshNotificationInbox();
  assert.equal(h.context.readFriendRequestNotificationIds.size, 0);
});

for (const operation of ["one", "all"]) {
  const markRead = (h) => operation === "one"
    ? h.context.markInboxItemRead("item-a")
    : h.context.markAllInboxItemsRead();

  for (const refreshFails of [false, true]) {
    test(`a ${refreshFails ? "failed" : "stale"} inbox refresh cannot undo a confirmed ${operation}-item read`, async () => {
      const gate = deferred(), started = deferred();
      const h = harness({ load: () => { started.resolve(); return gate.promise; } });
      const refreshing = h.context.refreshNotificationInbox();
      await started.promise;
      await markRead(h);
      const confirmedReadAt = h.context.notificationInbox.items[0].readAt;
      assert.ok(confirmedReadAt);
      if (refreshFails) gate.reject(new Error("temporary refresh failure"));
      else gate.resolve({ available: true, items: [{ id: "item-a", eventId: "event-a", readAt: "" }] });
      await refreshing;
      assert.equal(h.context.notificationInbox.items[0].readAt, confirmedReadAt);
      assert.equal(h.context.notificationUnreadCount(), 0);
    });
  }

  test(`failed inbox refresh cannot resurrect a rolled-back ${operation}-item optimistic read`, async () => {
    const loadGate = deferred(), loadStarted = deferred();
    const writeGate = deferred(), writeStarted = deferred();
    const write = () => { writeStarted.resolve(); return writeGate.promise; };
    const h = harness({
      load: () => { loadStarted.resolve(); return loadGate.promise; },
      markOne: write, markAll: write
    });
    const marking = markRead(h);
    await writeStarted.promise;
    const refreshing = h.context.refreshNotificationInbox();
    await loadStarted.promise;
    writeGate.resolve(false);
    await marking;
    assert.equal(h.context.notificationInbox.items[0].readAt, "");
    loadGate.reject(new Error("offline"));
    await refreshing;
    assert.equal(h.context.notificationInbox.items[0].readAt, "", "failure must preserve the rollback, not the captured optimistic snapshot");
    assert.equal(h.context.notificationUnreadCount(), 1);
  });

  test(`a pending ${operation}-item read survives stale refresh and still rolls back on write rejection`, async () => {
    const gate = deferred(), started = deferred(), writeGate = deferred();
    const h = harness({
      load: () => { started.resolve(); return gate.promise; },
      markOne: () => writeGate.promise, markAll: () => writeGate.promise
    });
    const refreshing = h.context.refreshNotificationInbox();
    await started.promise;
    const marking = markRead(h);
    const pendingReadAt = h.context.notificationInbox.items[0].readAt;
    gate.resolve({ available: true, items: [{ id: "item-a", eventId: "event-a", readAt: "" }] });
    await refreshing;
    const readAtAfterRefresh = h.context.notificationInbox.items[0].readAt;
    writeGate.resolve(false);
    await marking;
    assert.equal(readAtAfterRefresh, pendingReadAt);
    assert.equal(h.context.notificationInbox.items[0].readAt, "", "a rejected write is not reported as confirmed");
  });
}

test("inbox reconciliation still receives new notifications, remote reads and deletions", async () => {
  const remoteReadAt = "2026-09-07T00:10:00.000Z";
  const h = harness({ load: async () => ({ available: true, items: [
    { id: "remote-read", readAt: remoteReadAt },
    { id: "new-item", readAt: "" }
  ] }) });
  h.context.notificationInbox.items = [
    { id: "remote-read", readAt: "" },
    { id: "removed-item", readAt: remoteReadAt }
  ];
  await h.context.refreshNotificationInbox();
  assert.deepEqual(Array.from(h.context.notificationInbox.items, (item) => item.id), ["remote-read", "new-item"]);
  assert.equal(h.context.notificationInbox.items[0].readAt, remoteReadAt);
  assert.equal(h.context.notificationUnreadCount(), 1);
});

for (const editingFlag of ["profileNameEditing", "profileUsernameEditing"]) {
  test(`an in-flight inbox refresh does not rerender a profile editor opened later: ${editingFlag}`, async () => {
    const gate = deferred(), started = deferred();
    const h = harness({ load: () => { started.resolve(); return gate.promise; } });
    h.context.screen = { name: "profile" };
    const refreshing = h.context.refreshNotificationInbox(); await started.promise;
    h.context[editingFlag] = true;
    gate.resolve({ available: true, items: [{ id: "new-item", readAt: "" }] }); await refreshing;
    assert.equal(h.renders.length, 0);
    assert.equal(h.context.notificationInbox.items[0].id, "new-item");
  });
}

test("same-account re-login discards an old inbox response even before the next refresh", async () => {
  const gate = deferred(), started = deferred();
  const h = harness({ load: () => { started.resolve(); return gate.promise; } });
  const old = h.context.refreshNotificationInbox(); await started.promise;
  h.context.generation++;
  gate.resolve({ available: true, items: [{ id: "obsolete-session" }] }); await old;
  assert.notEqual(h.context.notificationInbox.items[0]?.id, "obsolete-session");
  assert.equal(h.context.visibleNotificationInboxItems().length, 0);
});

test("same-account re-login starts a fresh inbox read without waiting for the old session", async () => {
  const gate = deferred(), started = deferred(); let loads = 0;
  const h = harness({ load: async () => {
    if (++loads === 1) { started.resolve(); return gate.promise; }
    return { available: true, items: [{ id: "fresh-session" }] };
  } });
  const old = h.context.refreshNotificationInbox(); await started.promise;
  h.context.generation++;
  const current = h.context.refreshNotificationInbox();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  const observed = h.context.notificationInbox.items[0]?.id;
  gate.resolve({ available: true, items: [{ id: "old-session" }] });
  await Promise.all([old, current]);
  assert.equal(loads, 2); assert.equal(observed, "fresh-session");
  assert.equal(h.context.notificationInbox.items[0].id, "fresh-session");
});

test("obsolete forced inbox refresh cannot enqueue work for a new login of the same account", async () => {
  const gate = deferred(), started = deferred(); let loads = 0;
  const h = harness({ load: () => { loads++; started.resolve(); return gate.promise; } });
  const old = h.context.refreshNotificationInbox(); await started.promise;
  const queued = h.context.refreshNotificationInbox({ force: true });
  h.context.generation++;
  gate.resolve({ available: true, items: [] }); await Promise.all([old, queued]);
  assert.equal(loads, 1);
});

test("every overlapping forced caller waits for the shared fresh inbox response", async () => {
  const firstGate = deferred(), secondGate = deferred(), firstStarted = deferred(), secondStarted = deferred();
  let loads = 0, thirdSettled = false;
  const h = harness({ load: () => {
    if (++loads === 1) { firstStarted.resolve(); return firstGate.promise; }
    secondStarted.resolve(); return secondGate.promise;
  } });
  const first = h.context.refreshNotificationInbox(); await firstStarted.promise;
  const second = h.context.refreshNotificationInbox({ force: true });
  const third = h.context.refreshNotificationInbox({ force: true }).then(() => { thirdSettled = true; });
  try {
    firstGate.resolve({ available: true, items: [{ id: "old" }] }); await secondStarted.promise;
    for (let i = 0; i < 30; i++) await Promise.resolve();
    assert.equal(thirdSettled, false, "a concurrent push must not report inbox synchronization before the queued read");
  } finally {
    secondGate.resolve({ available: true, items: [{ id: "latest" }] });
    await Promise.all([first, second, third]);
  }
  assert.equal(loads, 2); assert.equal(h.context.notificationInbox.items[0].id, "latest");
});

test("a push arriving during the follow-up read gets one further fresh read", async () => {
  const gates = [deferred(), deferred(), deferred()], started = [deferred(), deferred(), deferred()];
  let loads = 0;
  const h = harness({ load: () => { const index = loads++; started[index].resolve(); return gates[index].promise; } });
  const first = h.context.refreshNotificationInbox(); await started[0].promise;
  const second = h.context.refreshNotificationInbox({ force: true });
  gates[0].resolve({ available: true, items: [{ id: "first" }] }); await started[1].promise;
  const third = h.context.refreshNotificationInbox({ force: true });
  gates[1].resolve({ available: true, items: [{ id: "second" }] });
  await started[2].promise;
  gates[2].resolve({ available: true, items: [{ id: "third" }] });
  await Promise.all([first, second, third]);
  assert.equal(loads, 3); assert.equal(h.context.notificationInbox.items[0].id, "third");
  assert.equal(h.context.notificationInboxFollowUpRequest, null);
});

test("concurrent push handlers publish synchronization only after their shared fresh inbox arrives", async () => {
  const gates = [deferred(), deferred()], started = [deferred(), deferred()], synchronized = [];
  let loads = 0;
  const h = harness({ load: () => { const index = loads++; started[index].resolve(); return gates[index].promise; } });
  Object.assign(h.context, {
    notificationTargetFromPayload: () => ({ eventId: "event-a" }),
    refreshIncomingPushState: async () => true,
    PUSH_SYNCHRONIZED_EVENT: "settle-friends:push-synchronized"
  });
  h.context.document.dispatchEvent = event => {
    if (event.type === h.context.PUSH_SYNCHRONIZED_EVENT) synchronized.push(event.detail);
  };
  vm.runInContext(extract("async function synchronizeIncomingPush(", "async function refreshIncomingPushState("), h.context);
  const reading = h.context.refreshNotificationInbox(); await started[0].promise;
  const pushes = [h.context.synchronizeIncomingPush({}), h.context.synchronizeIncomingPush({})];
  for (let i = 0; i < 20; i++) await Promise.resolve();
  gates[0].resolve({ available: true, items: [] }); await started[1].promise;
  try {
    for (let i = 0; i < 30; i++) await Promise.resolve();
    assert.equal(synchronized.length, 0);
  } finally {
    gates[1].resolve({ available: true, items: [{ id: "arrived" }] });
    await Promise.all([reading, ...pushes]);
  }
  assert.equal(synchronized.length, 2);
  assert.ok(synchronized.every(item => item.ready && item.eventId === "event-a"));
  assert.equal(h.context.notificationInbox.items[0].id, "arrived");
});

test("notification auth recovery cannot revive an operation from before same-account re-login", async () => {
  const gate = deferred(); const h = harness({ config: () => gate.promise });
  const request = h.send(); h.context.generation++;
  gate.resolve(configFor(A));
  await assert.rejects(request, { code: "STALE_ACCOUNT" });
  assert.equal(h.calls.length, 0); assert.equal(h.refreshes.length, 0);
});

test("deferred activity from an ended session cannot send after re-login as the same account", async () => {
  const gate = deferred(); const h = harness();
  h.context.publishEventActivityAfterSave({ ok: true, completion: gate.promise }, "event-a", "expense-created", "expense-a");
  h.context.generation++;
  gate.resolve({ ok: true, mode: "cloud" });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(h.calls.length, 0);
});

for (const operation of ["one", "all"]) {
  test(`a rejected ${operation}-item read cannot undo a server-confirmed read with the same timestamp`, async () => {
    const gate = deferred(), started = deferred(); let confirmedReadAt;
    const write = () => { started.resolve(); return gate.promise; };
    const h = harness({ markOne: write, markAll: write,
      load: async () => ({ available: true, items: [{ id: "item-a", readAt: confirmedReadAt }] }) });
    const marking = operation === "one" ? h.context.markInboxItemRead("item-a") : h.context.markAllInboxItemsRead();
    await started.promise;
    confirmedReadAt = h.context.notificationInbox.items[0].readAt;
    await h.context.refreshNotificationInbox();
    gate.resolve(false); await marking;
    assert.equal(h.context.notificationInbox.items[0].readAt, confirmedReadAt);
    assert.equal(h.context.notificationUnreadCount(), 0);
    assert.equal(h.context.notice, "");
  });

  test(`late ${operation}-item rejection cannot roll back a new login's matching read marker`, async () => {
    const gate = deferred(), started = deferred();
    const write = () => { started.resolve(); return gate.promise; };
    const h = harness({ markOne: write, markAll: write });
    const marking = operation === "one" ? h.context.markInboxItemRead("item-a") : h.context.markAllInboxItemsRead();
    await started.promise;
    const readAt = h.context.notificationInbox.items[0].readAt;
    h.context.generation++;
    h.context.notificationInbox = { status: "ready", items: [{ id: "item-a", readAt }] };
    h.context.notice = "New session notice";
    gate.resolve(false); await marking;
    assert.equal(h.context.notificationInbox.items[0].readAt, readAt);
    assert.equal(h.context.notice, "New session notice");
  });
}
