import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { mergeSharedEventIntoState, eventShareCredentials } from "../src/data/sharedEventStore.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const syncFunction = source.slice(source.indexOf("function requestVisibleEventSync()"), source.indexOf("\nbootstrapApp();", source.indexOf("function requestVisibleEventSync()")));

for (const outcome of ["success", "failure"]) {
  test(`a late ${outcome} for account A cannot change account B or start its recovery`, async () => {
    const response = deferred(), started = deferred();
    const h = harness({ read: async () => { started.resolve(); return response.promise; } });
    const request = h.context.requestVisibleEventSync();
    await started.promise;
    h.switchAccount("b");
    if (outcome === "success") response.resolve(changed("a"));
    else response.reject(new Error("Old request failed"));
    await request;
    assert.deepEqual(h.context.state, accountState("b"));
    assert.equal(h.saved.length, 0);
    assert.equal(h.rendered.length, 0);
    assert.equal(h.recovery.length, 0);
    assert.equal(h.errors.length, 0);
  });
}

test("a config request started by A cannot read A's event using B's credentials", async () => {
  const config = deferred();
  const h = harness({ config: () => config.promise });
  const request = h.context.requestVisibleEventSync();
  h.switchAccount("b");
  config.resolve(configFor("b"));
  await request;
  assert.equal(h.reads.length, 0);
  assert.equal(h.saved.length, 0);
});

test("sync waits while the previous account's screen is still being replaced", async () => {
  const h = harness();
  h.context.session = { user: { id: "b" } };
  await h.context.requestVisibleEventSync();
  assert.equal(h.reads.length, 0);
  assert.equal(h.saved.length, 0);
});

test("B's event sync starts immediately and an old completion cannot release B's in-flight request", async () => {
  const old = deferred(), current = deferred(), oldStarted = deferred(), currentStarted = deferred();
  const h = harness({ read: async config => {
    if (config.storage.account.userId === "a") { oldStarted.resolve(); return old.promise; }
    currentStarted.resolve();
    return current.promise;
  } });
  const first = h.context.requestVisibleEventSync();
  await oldStarted.promise;
  h.switchAccount("b");
  const second = h.context.requestVisibleEventSync();
  assert.notEqual(second, first, "B must not wait behind A's request");
  await currentStarted.promise;
  old.resolve(changed("a"));
  await first;
  assert.equal(h.context.visibleEventSyncRequest, second);
  assert.equal(h.context.requestVisibleEventSync(), second, "same-account requests still coalesce");
  current.resolve(changed("b"));
  await second;
  assert.deepEqual(h.context.state.events.map(event => event.id), ["event-b"]);
  assert.equal(h.context.state.events[0].notes[0].id, "note-b");
  assert.equal(h.saved.length, 1);
});

test("a same-account sign-out/sign-in rejects the previous session's late event response", async () => {
  const response = deferred(), started = deferred();
  const h = harness({ read: async () => { started.resolve(); return response.promise; } });
  const request = h.context.requestVisibleEventSync();
  await started.promise;
  h.context.sessionGeneration += 1;
  response.resolve(changed("a"));
  await request;
  assert.equal(h.saved.length, 0);
  assert.deepEqual(h.context.state.events[0].notes, []);
});

test("same-account sync applies peer notes while keeping a newer local expense", async () => {
  const response = deferred(), started = deferred();
  const h = harness({ read: async () => { started.resolve(); return response.promise; } });
  const request = h.context.requestVisibleEventSync();
  await started.promise;
  h.context.revision += 1;
  h.context.state.events[0].expenses.push({ id: "local-expense", name: "Local", total: 100,
    payers: [{ participantId: "account-a", amount: 100 }], sharedByParticipantIds: ["account-a"] });
  response.resolve(changed("a"));
  await request;
  assert.equal(h.context.state.events[0].notes[0].id, "note-a");
  assert.equal(h.context.state.events[0].expenses[0].id, "local-expense");
  assert.equal(h.saved.length, 1);
  assert.equal(h.recovery.length, 1);
});

function harness({ read, config } = {}) {
  const saved = [], rendered = [], recovery = [], reads = [], errors = [];
  const context = vm.createContext({
    document: { visibilityState: "visible" }, window: { localStorage: {} },
    appBootHydrated: true, VISIBLE_BACKGROUND_SYNC_SCREENS: new Set(["event"]),
    screen: { name: "event", eventId: "event-a" }, state: accountState("a"),
    session: { user: { id: "a" } }, sessionGeneration: 0, revision: 0,
    runtimeConfig: configFor("a"), visibleEventSyncRequest: null, visibleEventSyncScope: "",
    expenseDraft: null, eventDialog: null, profileNameEditing: false, profileUsernameEditing: false,
    groupDraft: null, editingGroupDraft: null, mergeParticipantsDraft: null,
    lastBackgroundAccountSyncAt: 0, BACKGROUND_ACCOUNT_SYNC_INTERVAL_MS: 15_000,
    eventShareCredentials, mergeSharedEventIntoState,
    syncLocalProfile: state => state, hasSharedStateChanged: (a, b) => JSON.stringify(a) !== JSON.stringify(b),
    saveState: state => saved.push(structuredClone(state)), render: () => rendered.push(true),
    requestResumeSync: async () => recovery.push("resume"), queueForcedResumeSync: async () => recovery.push("forced"),
    emitOperationDeferred: (...args) => errors.push(args)
  });
  Object.assign(context, {
    getEvent: id => context.state.events.find(event => event.id === id),
    loadStoredAccountSession: () => context.session,
    versionedReadCacheSessionGeneration: () => context.sessionGeneration,
    sharedStateSaveRevision: () => context.revision,
    loadRuntimeConfig: async () => config ? config() : configFor(context.session.user.id),
    readSharedEventStateIfChanged: async (...args) => { reads.push(args); return read ? read(...args) : changed(context.session.user.id); }
  });
  vm.runInContext(syncFunction, context);
  return { context, saved, rendered, recovery, reads, errors, switchAccount(id) {
    context.session = { user: { id } };
    context.state = accountState(id);
    context.screen = { name: "event", eventId: `event-${id}` };
    context.runtimeConfig = configFor(id);
    context.sessionGeneration += 1;
  } };
}
function accountState(id) {
  return { currentParticipantId: `account-${id}`, participants: [{ id: `account-${id}`, displayName: `Test ${id}`, kind: "user" }], groups: [],
    events: [{ id: `event-${id}`, name: `Event ${id}`, eventType: "standard", currency: "ILS",
      participantIds: [`account-${id}`], adminIds: [`account-${id}`], createdByParticipantId: `account-${id}`,
      sharedSpaceId: `shared-event-${id}`, sharedSpaceKey: "fixture-shared-key-long-enough-for-sync", notes: [], expenses: [], transfers: [] }] };
}
function changed(id) {
  const state = accountState(id);
  state.events[0].notes.push({ id: `note-${id}`, title: "Peer note", body: "New note", pinned: false,
    createdAt: "2026-09-06T10:00:00.000Z", updatedAt: "2026-09-06T10:00:00.000Z", createdByParticipantId: `account-${id}` });
  return { changed: true, missing: false, state };
}
function configFor(userId) { return { storage: { account: { userId, accessToken: `fixture-token-${userId}` } } }; }
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
