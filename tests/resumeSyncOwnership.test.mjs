import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { mergeSharedStates } from "../src/domain/sharedStateMerge.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const functions = source.slice(source.indexOf("function requestResumeSync("), source.indexOf("function requestVisibleEventSync("));

for (const outcome of ["success", "failure"]) {
  test(`resume sync ignores a previous account's late ${outcome}`, async () => {
    const old = deferred();
    const h = harness(() => old.promise);
    const request = h.context.requestResumeSync();
    h.switchAccount("b");
    if (outcome === "success") old.resolve(accountState("a", "old-note"));
    else old.reject(new Error("old session failed"));
    await request;
    assert.deepEqual(h.context.state, accountState("b"));
    assert.equal(h.rendered.length, 0);
    assert.equal(h.secondary.length, 0);
    assert.equal(h.failures.length, 0);
  });
}

test("a new account refresh starts immediately and an old completion cannot release its request slot", async () => {
  const old = deferred(), current = deferred();
  const h = harness(id => id === "a" ? old.promise : current.promise);
  const first = h.context.requestResumeSync();
  h.switchAccount("b");
  const second = h.context.requestResumeSync();
  try {
    assert.notEqual(second, first, "B must not wait for A's slow network timeout");
    assert.deepEqual(h.reads, ["a", "b"]);
    old.resolve(accountState("a"));
    await first;
    assert.equal(h.context.resumeSyncRequest, second);
    current.resolve(accountState("b", "peer-note"));
    await second;
    assert.equal(h.context.state.events[0].notes[0].id, "peer-note");
    assert.deepEqual(h.secondary, ["friends", "inbox"]);
  } finally {
    old.resolve(accountState("a"));
    current.resolve(accountState("b"));
    await Promise.allSettled([first, second]);
  }
});

test("a queued forced refresh from a previous session cannot enqueue work for the next one", async () => {
  const old = deferred(), current = deferred();
  const h = harness(id => id === "a" ? old.promise : current.promise);
  const first = h.context.requestResumeSync();
  const followUp = h.context.requestResumeSync({ force: true });
  h.switchAccount("b");
  const second = h.context.requestResumeSync();
  old.resolve(accountState("a"));
  current.resolve(accountState("b"));
  await Promise.all([first, followUp, second]);
  assert.deepEqual(h.reads, ["a", "b"]);
  assert.deepEqual(h.secondary, ["friends", "inbox"]);
});

test("sign-out/sign-in of the same account invalidates the old resume response", async () => {
  const response = deferred();
  const h = harness(() => response.promise);
  const request = h.context.requestResumeSync();
  h.context.generation += 1;
  response.resolve(accountState("a", "old-session-note"));
  await request;
  assert.equal(h.rendered.length, 0);
  assert.equal(h.secondary.length, 0);
});

test("an obsolete forced follow-up is dropped even before the new account starts a refresh", async () => {
  const old = deferred();
  const h = harness(id => id === "a" ? old.promise : Promise.resolve(accountState("b")));
  const first = h.context.requestResumeSync();
  const followUp = h.context.requestResumeSync({ force: true });
  h.switchAccount("b");
  old.resolve(accountState("a"));
  await Promise.all([first, followUp]);
  // Drain the obsolete finally callback's possible follow-up request too.
  if (h.context.resumeSyncFollowUpRequest) await h.context.resumeSyncFollowUpRequest;
  assert.deepEqual(h.reads, ["a"], "cancellation must not recursively reschedule old work");
  assert.equal(h.secondary.length, 0);
  assert.equal(h.context.resumeSyncFollowUpPending, false);
});

test("same-session force requests coalesce into one follow-up and preserve peer changes", async () => {
  const firstResponse = deferred();
  let reads = 0;
  const h = harness(() => ++reads === 1 ? firstResponse.promise : Promise.resolve(accountState("a", "latest")));
  const first = h.context.requestResumeSync({ includeSecondary: false });
  const second = h.context.requestResumeSync({ force: true });
  assert.equal(h.context.requestResumeSync({ force: true }), second);
  firstResponse.resolve(accountState("a", "first"));
  await Promise.all([first, second]);
  assert.equal(reads, 2);
  assert.equal(h.context.state.events[0].notes[0].id, "latest");
  assert.deepEqual(h.secondary, ["friends", "inbox"]);
});

test("resume sync waits for the visible account to match the signed-in account", async () => {
  const h = harness(() => Promise.resolve(accountState("b")));
  h.context.session = { user: { id: "b" } };
  await h.context.requestResumeSync();
  assert.equal(h.reads.length, 0);
  assert.equal(h.rendered.length, 0);
});

function nativeResumeHandler(context) {
  let listener;
  context.NATIVE_RESUME_EVENT = "settle-friends:native-resume";
  context.window.addEventListener = (_name, callback) => { listener = callback; };
  const start = source.indexOf("window.addEventListener(NATIVE_RESUME_EVENT,");
  vm.runInContext(source.slice(start, source.indexOf("\n", start)), context);
  return () => listener({ type: context.NATIVE_RESUME_EVENT });
}

function onlineHandler(context) {
  let listener;
  context.appBootHydrated = true;
  context.accountEventsHydrationStatus = "ready";
  context.ACCOUNT_EVENT_HYDRATION_READY = "ready";
  context.recoverPendingMutations = async () => {};
  context.retryAccountEventHydration = async () => {};
  context.window.addEventListener = (_name, callback) => { listener = callback; };
  const start = source.indexOf('window.addEventListener("online",');
  const end = source.indexOf('\nwindow.addEventListener("sogrim:shared-save-reverted"', start);
  vm.runInContext(source.slice(start, end), context);
  return () => {
    listener({ type: "online" });
    return context.resumeSyncFollowUpRequest ?? context.resumeSyncRequest ?? Promise.resolve();
  };
}

test("network return refreshes a hydrated recipient with no pending local mutation", async () => {
  const h = harness(() => Promise.resolve(stateWithPeerExpense()));
  await onlineHandler(h.context)();
  assert.equal(h.reads.length, 1);
  assert.equal(h.context.state.events[0].expenses[0]?.id, "peer-expense");
});

test("network return queues fresh data behind a stale request and coalesces with native return", async () => {
  const old = deferred(); let count = 0;
  const h = harness(() => ++count === 1 ? old.promise : Promise.resolve(stateWithPeerExpense()));
  const first = h.context.requestResumeSync({ includeSecondary: false });
  const online = onlineHandler(h.context)();
  const native = nativeResumeHandler(h.context)();
  old.resolve(accountState("a"));
  await Promise.all([first, online, native]);
  assert.equal(h.reads.length, 2);
  assert.equal(h.context.state.events[0].expenses.length, 1);
});

test("network return before startup hydration does not read into the provisional account", async () => {
  const h = harness(() => Promise.resolve(stateWithPeerExpense()));
  const online = onlineHandler(h.context);
  h.context.appBootHydrated = false;
  await online();
  assert.equal(h.reads.length, 0);
});

function stateWithPeerExpense() {
  const state = accountState("a");
  state.events[0].expenses.push({ id: "peer-expense", name: "Tickets", total: 7000,
    payers: [{ participantId: "account-a", amount: 7000 }], sharedByParticipantIds: ["account-a"] });
  return state;
}

test("native return requests a fresh expense snapshot after a pre-background read finishes", async () => {
  const oldRead = deferred(); let count = 0;
  const h = harness(() => ++count === 1 ? oldRead.promise : Promise.resolve(stateWithPeerExpense()));
  const startedBeforeBackground = h.context.requestResumeSync({ includeSecondary: false });
  const resumed = nativeResumeHandler(h.context)();
  oldRead.resolve(accountState("a"));
  await Promise.all([startedBeforeBackground, resumed]);
  assert.equal(h.reads.length, 2, "a pre-background response cannot satisfy the native return");
  assert.equal(h.context.state.events[0].expenses[0]?.id, "peer-expense");
});

test("native return bypasses a recent-read cooldown to show a newly shared expense", async () => {
  let count = 0;
  const h = harness(() => Promise.resolve(++count === 1 ? accountState("a") : stateWithPeerExpense()));
  await h.context.requestResumeSync({ includeSecondary: false });
  await nativeResumeHandler(h.context)();
  assert.equal(h.reads.length, 2);
  assert.equal(h.context.state.events[0].expenses[0]?.id, "peer-expense");
});

test("twenty native returns during one stale read coalesce into exactly one fresh follow-up", async () => {
  const oldRead = deferred(); let count = 0;
  const h = harness(() => ++count === 1 ? oldRead.promise : Promise.resolve(stateWithPeerExpense()));
  const first = h.context.requestResumeSync({ includeSecondary: false });
  const resume = nativeResumeHandler(h.context);
  const returns = Array.from({ length: 20 }, () => resume());
  oldRead.resolve(accountState("a"));
  await Promise.all([first, ...returns]);
  assert.equal(h.reads.length, 2);
  assert.equal(h.context.state.events[0].expenses.length, 1);
  assert.deepEqual(h.secondary, ["friends", "inbox"]);
});

test("a failed pre-return read releases the queue and the fresh follow-up receives the expense", async () => {
  const oldRead = deferred(); let count = 0;
  const h = harness(() => ++count === 1 ? oldRead.promise : Promise.resolve(stateWithPeerExpense()));
  const first = h.context.requestResumeSync({ includeSecondary: false });
  const resumed = nativeResumeHandler(h.context)();
  oldRead.reject(new TypeError("Failed to fetch"));
  await Promise.all([first, resumed]);
  assert.equal(h.reads.length, 2);
  assert.equal(h.context.state.events[0].expenses[0]?.id, "peer-expense");
  assert.equal(h.context.resumeSyncRequest, null);
  assert.equal(h.context.resumeSyncFollowUpRequest, null);
  assert.equal(h.failures.length, 1);
});

function harness(read) {
  const reads = [], rendered = [], secondary = [], failures = [];
  const context = vm.createContext({
    state: accountState("a"), session: { user: { id: "a" } }, generation: 0, revision: 0,
    window: { localStorage: {} }, resumeSyncRequest: null, resumeSyncScope: "",
    resumeSyncFollowUpRequest: null, resumeSyncFollowUpPending: false,
    resumeSyncFollowUpIncludeSecondary: false, lastResumeSyncAt: 0, RESUME_SYNC_COOLDOWN_MS: 2_000,
    syncLocalProfile: state => state, mergeSharedStates,
    hasSharedStateChanged: (a, b) => JSON.stringify(a) !== JSON.stringify(b),
    saveState() {}, render: () => rendered.push(true),
    refreshFriendNetwork: async () => secondary.push("friends"),
    refreshNotificationInbox: async () => secondary.push("inbox"),
    emitOperationDeferred: (...args) => failures.push(args)
  });
  Object.assign(context, {
    loadStoredAccountSession: () => context.session,
    versionedReadCacheSessionGeneration: () => context.generation,
    sharedStateSaveRevision: () => context.revision,
    loadSharedState: () => { const id = context.session.user.id; reads.push(id); return read(id); }
  });
  vm.runInContext(functions, context);
  return { context, reads, rendered, secondary, failures, switchAccount(id) {
    context.session = { user: { id } };
    context.state = accountState(id);
    context.generation += 1;
  } };
}
function accountState(id, noteId = "") {
  return { currentParticipantId: `account-${id}`, participants: [{ id: `account-${id}`, displayName: `Test ${id}` }],
    groups: [], events: [{ id: `event-${id}`, name: "Test Event", participantIds: [`account-${id}`],
      expenses: [], transfers: [], notes: noteId ? [{ id: noteId, title: "Peer note", body: "Test" }] : [] }] };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
