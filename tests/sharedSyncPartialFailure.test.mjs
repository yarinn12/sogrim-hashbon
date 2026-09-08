import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildSharedEventState, saveSharedEventState, syncSharedEvents } from "../src/data/sharedEventStore.mjs";
import { setEventAdminsCanEditOnly, setEventRoundSettlementTransfers, setEventCurrency, setEventCoverImage } from "../src/domain/appActions.mjs";
import { addEventNote, updateEventNote, removeEventNote } from "../src/domain/eventNotes.mjs";

const stamp = "2026-08-24T09:00:00.000Z";
function note(id) {
  return { id, title: id, body: id, pinned: false, createdAt: stamp, updatedAt: stamp,
    createdByParticipantId: "account-partial-a", updatedByParticipantId: "account-partial-a" };
}
const response = (payload) => ({ ok: true, status: 200, async json() { return structuredClone(payload); } });

function capturePendingRetryTimers() {
  let nextId = 0;
  const timers = new Map();
  window.setTimeout = (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; };
  window.clearTimeout = id => timers.delete(id);
  return {
    timers,
    async runNext() {
      assert.equal(timers.size, 1, "exactly one background retry must drive retained work");
      const [id, { callback, delay }] = timers.entries().next().value;
      assert.equal(delay, 1_200, "use the existing bounded retry schedule");
      timers.delete(id);
      await callback();
    }
  };
}

async function fixture(run, { allFail = false, status = 403, workspaceStatus = 200, beforeWorkspaceResponse = null, beforeCanonicalResponse = null, beforeSnapshotResponse = null, canonicalStatus = null } = {}) {
  const globals = Object.fromEntries(["window", "location", "localStorage", "fetch"].map((key) => [key, globalThis[key]]));
  const entries = new Map();
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key)
  };
  const location = { href: "https://sogrim-hesbon-app.vercel.app/", hostname: "sogrim-hesbon-app.vercel.app", protocol: "https:" };
  const workspaceId = "space-partial-a";
  const state = {
    currentParticipantId: "account-partial-a",
    participants: [{ id: "account-partial-a", displayName: "Partial A", kind: "user", accountLinked: true }],
    groups: [], events: ["healthy", "failing"].map((id) => ({
      id, name: id, eventType: "standard", currency: "ILS", createdAt: stamp,
      participantIds: ["account-partial-a"], adminIds: ["account-partial-a"],
      createdByParticipantId: "account-partial-a", notes: [], expenses: [], transfers: [],
      sharedSpaceId: `space-partial-${id}`, sharedSpaceKey: `partial-${id}-secret-long-enough-123456`
    }))
  };
  const pending = structuredClone(state);
  pending.events[0].notes.push(note("local-healthy-note"));
  pending.events[1].notes.push(note("local-failing-note"));
  const canonical = new Map(state.events.map((event) => [event.sharedSpaceId, buildSharedEventState(state, event.id)]));
  canonical.get("space-partial-healthy").events[0].notes.push(note("remote-healthy-note"));
  const workspaceWrites = [];
  const canonicalWrites = [];
  const canonicalAttempts = new Map();
  let failureEnabled = true;
  const config = { storage: {
    mode: "supabase", url: "https://partial-fixture.supabase.co", anonKey: "fixture-anon", table: "app_snapshots",
    spaceId: workspaceId, spaceKey: "partial-workspace-secret-long-enough-123456",
    account: { userId: "partial-a", accessToken: "fixture-token" }
  } };
  storage.setItem("settle-friends-account-session", JSON.stringify({
    access_token: "fixture-token", refresh_token: "fixture-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "partial-a", user_metadata: { account_space_id: workspaceId, account_space_key: config.storage.spaceKey } }
  }));
  storage.setItem("settle-friends-cloud-space", workspaceId);
  storage.setItem(`settle-friends-cloud-key:${workspaceId}`, config.storage.spaceKey);
  storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(state));
  globalThis.window = { localStorage: storage, location, addEventListener() {}, dispatchEvent() {} };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.fetch = async (url, options = {}) => {
    const address = new URL(String(url), location.href);
    if (address.pathname === "/api/config") return response(config);
    if (address.pathname.endsWith("/rpc/join_shared_event")) return response({ ok: true });
    if (address.pathname.endsWith("/rpc/update_shared_event_snapshot")) {
      const body = JSON.parse(options.body);
      await beforeCanonicalResponse?.({ storage, body, workspaceId });
      const attempt = (canonicalAttempts.get(body.p_snapshot_id) ?? 0) + 1;
      canonicalAttempts.set(body.p_snapshot_id, attempt);
      const writeStatus = canonicalStatus
        ? canonicalStatus(body.p_snapshot_id, attempt)
        : failureEnabled && (allFail || body.p_snapshot_id === "space-partial-failing") ? status : 200;
      if (writeStatus !== 200) return { ok: false, status: writeStatus };
      canonicalWrites.push(body.p_snapshot_id);
      canonical.set(body.p_snapshot_id, structuredClone(body.p_state));
      return response({ status: "updated", updatedAt: "2026-08-24T09:01:00.000Z" });
    }
    if (options.method === "PATCH" || options.method === "POST") {
      const body = JSON.parse(options.body);
      assert.equal(body.id, workspaceId);
      workspaceWrites.push(body.state);
      beforeWorkspaceResponse?.({ storage, pending, workspaceId });
      const personalStatus = typeof workspaceStatus === "function" ? workspaceStatus(workspaceWrites.length) : workspaceStatus;
      if (personalStatus !== 200) return { ok: false, status: personalStatus };
      return response([{ updated_at: "2026-08-24T09:02:00.000Z" }]);
    }
    const id = address.searchParams.get("id")?.replace(/^eq\./, "");
    assert.ok(id === workspaceId || canonical.has(id), "only fixture resources are accessible");
    await beforeSnapshotResponse?.({ storage, workspaceId, id });
    return response([{ state: id === workspaceId ? state : canonical.get(id), updated_at: stamp }]);
  };
  try {
    await run({ state, pending, canonical, storage, config, workspaceWrites, canonicalWrites, workspaceId,
      recover: () => { failureEnabled = false; } });
  } finally {
    for (const [key, value] of Object.entries(globals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
}

for (const fresh of [false, true]) {
  for (const workspaceStatus of [200, 503, "retry-receipt-failed"]) {
    test(`a ${fresh ? "new" : "published"} group invitation depends on its own publication and personal receipt, not an old rejected group (workspace ${workspaceStatus})`, async () => {
      await fixture(async ({ pending, storage, workspaceId, config, canonical, workspaceWrites }) => {
        const eventId = fresh ? "new-group" : "healthy";
        const spaceId = fresh ? "space-partial-new-group" : "space-partial-healthy";
        pending.participants.push({ id: "account-peer", kind: "user", displayName: "Peer", accountLinked: true });
        if (fresh) pending.events.push({ ...structuredClone(pending.events[0]), id: eventId,
          name: "New group", notes: [], sharedSpaceId: spaceId });
        pending.events.find(event => event.id === eventId).participantIds.push("account-peer");
        // Seed normal empty schema fields so the full-record preservation
        // assertion distinguishes user intent from harmless merge defaults.
        Object.assign(pending.events.find(event => event.id === "failing"), {
          inactiveParticipantIds: [], locked: false, closedAt: null, deletedNotes: [],
          participantAliases: {}, distinctParticipantPairs: [], deletedExpenses: [], activityLog: []
        });
        const legacyIntent = structuredClone(pending.events.find(event => event.id === "failing"));
        storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(pending));
        storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
        let creates = 0;
        const transport = globalThis.fetch;
        globalThis.fetch = async (url, options = {}) => {
          const address = new URL(String(url), location.href);
          if (fresh && address.pathname.endsWith("/rpc/create_shared_event_snapshot")) {
            const body = JSON.parse(options.body);
            assert.equal(body.p_snapshot_id, spaceId);
            assert.equal(body.p_state.events[0].id, eventId);
            assert.ok(body.p_state.events[0].participantIds.includes("account-peer"));
            assert.equal(canonical.has(spaceId), false, "create the new group only once");
            canonical.set(spaceId, structuredClone(body.p_state)); creates++;
            return response({ ok: true });
          }
          if (fresh && address.searchParams.get("id") === `eq.${spaceId}` && !canonical.has(spaceId)) return response([]);
          if (fresh && !address.searchParams.has("id") && address.searchParams.has("snapshot_kind")) return response([]);
          return transport(url, options);
        };
        const store = await import(`../src/data/localStore.mjs?invitation-sibling-${fresh}-${workspaceStatus}-${crypto.randomUUID()}`);
        const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
        const extract = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start) + start.length));
        let delivered = 0, forgotten = 0;
        const ctx = vm.createContext({
          state: store.loadState(), runtimeConfig: config, navigator: { onLine: true }, pendingMutationRecoveryRequest: null,
          getEvent: id => ctx.state.events.find(event => event.id === id), loadRuntimeConfig: async () => config,
          reconcileEventInviteAccountBoundary() {}, ensureEventShareCredentials() {},
          eventShareCredentials: event => ({ id: event.sharedSpaceId, key: event.sharedSpaceKey }),
          saveSharedEventState, saveSharedState: store.saveSharedState,
          accountUserIdFromParticipantId: id => id.startsWith("account-") ? id.slice(8) : "",
          rememberPendingEventMembershipInvitation() {}, forgetPendingEventMembershipInvitation() { forgotten++; },
          preparePrivateEventInvitation: id => ctx.prepareSharedEventForInvitation(id, { publishExisting: true }),
          sendEventActivityNotificationWithAccountRecovery: async payload => {
            assert.equal(payload.eventId, eventId);
            assert.equal(workspaceStatus, 200, "do not send before the personal event index is acknowledged");
            assert.ok(canonical.get(spaceId).events[0].participantIds.includes("account-peer"));
            assert.ok(workspaceWrites.at(-1).events.some(event => event.id === eventId && event.participantIds.includes("account-peer")));
            delivered++; return { ok: true, membershipRecipients: 1 };
          },
          updateParticipantInvitationMessage() {}, emitOperationFailure() {}, emitOperationDeferred() {},
          isRetryablePendingSyncFailure: () => true, schedulePendingMutationRecovery() {}
        });
        vm.runInContext(extract("async function prepareSharedEventForInvitation(", "async function rotateCurrentEventInvite(") +
          extract("async function publishEventInvitation(", "async function withNotificationAccountRecovery("), ctx);
        const result = await ctx.publishEventInvitation(eventId, { id: "account-peer", displayName: "Peer" });
        assert.equal(result.ok, workspaceStatus === 200, "old rejected group must not block an acknowledged invitation");
        assert.equal(delivered, workspaceStatus === 200 ? 1 : 0);
        assert.equal(forgotten, delivered);
        assert.equal(creates, fresh ? 1 : 0);
        const durable = JSON.parse(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
        assert.deepEqual(durable.events.find(event => event.id === "failing"), legacyIntent);
        assert.deepEqual(store.pendingSharedSyncStatus().pendingEventIds, ["failing"]);
      }, {
        workspaceStatus: workspaceStatus === "retry-receipt-failed" ? attempt => attempt === 1 ? 200 : 503 : workspaceStatus,
        status: workspaceStatus === "retry-receipt-failed" ? 503 : 403
      });
    });
  }
}

test("mixed shared sync carries successful merges separately from an authoritative receipt", async () => fixture(async ({ config, pending }) => {
  await assert.rejects(syncSharedEvents(config, pending), (error) => {
    assert.equal(error.code, "SHARED_EVENT_SYNC_FAILED");
    assert.deepEqual(error.partialSharedState.succeededEventIds, ["healthy"]);
    assert.deepEqual(error.partialSharedState.failedEventIds, ["failing"]);
    assert.ok(error.partialSharedState.state.events[0].notes.some(({ id }) => id === "remote-healthy-note"));
    assert.equal(error.persistedState, undefined, "optimistic failed items are not a cloud receipt");
    assert.equal(error.sharedEventPersisted, undefined);
    return true;
  });
}));

for (const path of ["flush", "load"]) {
  test(`a restarted ${path} retries only the events in the durable save scope`, async () => fixture(async ({ state, storage, workspaceId, canonicalWrites, workspaceWrites, recover }) => {
    const store = await import(`../src/data/localStore.mjs?durable-scope-save=${crypto.randomUUID()}`);
    const changed = addEventNote(state, "healthy", { id: "scoped-note", body: "Only this event changed" });
    assert.equal((await store.saveSharedState(changed, { awaitCloud: true })).pending, true);
    recover();
    const restarted = await import(`../src/data/localStore.mjs?durable-scope-restart=${crypto.randomUUID()}`);
    await (path === "flush" ? restarted.flushPendingSharedState() : restarted.loadSharedState());
    assert.ok(canonicalWrites.includes("space-partial-healthy"));
    assert.ok(!canonicalWrites.includes("space-partial-failing"), "recovery must not widen one queued edit to every group");
    assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
    for (const written of workspaceWrites) assert.equal(written.__pendingSync, undefined, "local delivery metadata must never enter cloud state");
  }, { allFail: true, status: 503 }));
}

test("legacy outbox partial success leaves only the failed event marked pending", async () => fixture(async ({ pending, storage, workspaceId }) => {
  storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
  const store = await import(`../src/data/localStore.mjs?legacy-partial-scope=${crypto.randomUUID()}`);
  assert.equal((await store.flushPendingSharedState()).ok, false);
  assert.deepEqual(store.pendingSharedSyncStatus().pendingEventIds, ["failing"]);
  const restarted = await import(`../src/data/localStore.mjs?legacy-partial-status=${crypto.randomUUID()}`);
  assert.deepEqual(restarted.pendingSharedSyncStatus().pendingEventIds, ["failing"]);
  assert.ok(JSON.parse(storage.getItem(`settle-friends-pending-sync:${workspaceId}`)).events[1].notes.length);
}));

for (const receiptStatus of [403, 503]) {
for (const path of ["save", "flush", "load"]) {
  test(`a failed personal receipt after confirmed shared writes retains only workspace delivery during ${path} HTTP ${receiptStatus}`, async () => {
    let personalStatus = receiptStatus;
    await fixture(async ({ pending, storage, workspaceId, canonical, canonicalWrites, workspaceWrites }) => {
      const store = await import(`../src/data/localStore.mjs?confirmed-shared-receipt-${path}=${crypto.randomUUID()}`);
      if (path === "save") await store.saveSharedState(pending, { awaitCloud: true });
      else {
        storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(pending));
        storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
        await (path === "flush" ? store.flushPendingSharedState() : store.loadSharedState());
      }
      // Assert final RPC payloads before checking the visible pending scope.
      for (const id of ["healthy", "failing"]) {
        assert.ok(canonical.get(`space-partial-${id}`).events[0].notes.some(n=>n.id===`local-${id}-note`));
      }
      const queued = JSON.parse(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
      assert.ok(queued, "the unconfirmed personal backup must remain durable");
      assert.deepEqual(store.pendingSharedSyncStatus(), { pending: true, pendingEventIds: [] },
        "server-confirmed groups must not be labelled undelivered just because the personal receipt failed");
      assert.deepEqual(queued.__pendingSync?.selection, { eventIds: [], deletedEventIds: [] });
      assert.ok(queued.events.find(e=>e.id==="healthy").notes.some(n=>n.id==="remote-healthy-note"));
      assert.ok(queued.events.find(e=>e.id==="failing").notes.some(n=>n.id==="local-failing-note"));
      const writesBeforeRestart = canonicalWrites.length;
      personalStatus = 200;
      const restarted = await import(`../src/data/localStore.mjs?confirmed-shared-receipt-restart=${crypto.randomUUID()}`);
      assert.deepEqual(restarted.pendingSharedSyncStatus(), { pending: true, pendingEventIds: [] });
      assert.equal((await restarted.flushPendingSharedState()).ok, true);
      assert.equal(canonicalWrites.length, writesBeforeRestart,
        "a personal receipt retry cannot republish already-confirmed group writes");
      assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
      for (const id of ["healthy", "failing"]) {
        assert.ok(workspaceWrites.at(-1).events.find(e=>e.id===id).notes.some(n=>n.id===`local-${id}-note`));
      }
    }, { canonicalStatus: () => 200, workspaceStatus: () => personalStatus });
  });
}
}

test("an empty recovery explicitly clears a stale pending indicator", async () => fixture(async () => {
  const statuses = [];
  window.dispatchEvent = event => statuses.push(event.detail);
  const store = await import(`../src/data/localStore.mjs?empty-pending-status=${crypto.randomUUID()}`);
  assert.equal((await store.flushPendingSharedState()).empty, true);
  assert.ok(statuses.some(detail => detail?.pending === false), "an empty outbox must acknowledge that no delivery remains");
}));

test("a new rejected edit cannot discard an older confirmed group's pending personal receipt", async () => {
  let rejectNewWrite = false, personalStatus = 403;
  await fixture(async ({ state, storage, workspaceId, canonical, canonicalWrites, workspaceWrites }) => {
    const store = await import(`../src/data/localStore.mjs?new-edit-after-receipt=${crypto.randomUUID()}`);
    await store.saveSharedState(addEventNote(state,"healthy",{id:"confirmed-before-receipt",body:"Already shared"}),{awaitCloud:true});
    const prior = storage.getItem(`settle-friends-pending-sync:${workspaceId}`);
    assert.deepEqual(store.pendingSharedSyncStatus(),{pending:true,pendingEventIds:[]});
    rejectNewWrite = true;
    const rejected = await store.saveSharedState(addEventNote(store.loadState(),"failing",{id:"rejected-new-note",body:"Not accepted"}),{awaitCloud:true});
    assert.equal(rejected.ok,false);
    assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`),prior,
      "a different rejected action cannot discard the earlier personal receipt");
    assert.ok(canonical.get("space-partial-healthy").events[0].notes.some(n=>n.id==="confirmed-before-receipt"));
    assert.ok(!canonical.get("space-partial-failing").events[0].notes.some(n=>n.id==="rejected-new-note"));
    const acknowledgedWrites=canonicalWrites.length;
    personalStatus=200;
    assert.equal((await store.flushPendingSharedState()).ok,true);
    assert.equal(canonicalWrites.length,acknowledgedWrites);
    assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`),null);
    assert.ok(workspaceWrites.at(-1).events.find(e=>e.id==="healthy").notes.some(n=>n.id==="confirmed-before-receipt"));
    assert.ok(!workspaceWrites.at(-1).events.find(e=>e.id==="failing").notes.some(n=>n.id==="rejected-new-note"));
  },{canonicalStatus:()=>rejectNewWrite?403:200,workspaceStatus:()=>personalStatus});
});

test("a later rejected save cannot discard an older accepted outbox", async () => fixture(async ({ pending, storage, workspaceId }) => {
  storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
  const store = await import(`../src/data/localStore.mjs?retain-rejected-prior=${crypto.randomUUID()}`);
  await store.flushPendingSharedState();
  const priorPayload = storage.getItem(`settle-friends-pending-sync:${workspaceId}`);
  assert.deepEqual(store.pendingSharedSyncStatus().pendingEventIds, ["failing"]);
  const next = { ...store.loadState(), groups: [{ id: "private-group", name: "Private", participantIds: [pending.currentParticipantId] }] };
  const result = await store.saveSharedState(next, { awaitCloud: true });
  assert.equal(result.ok, false, "a permanent rejection must not be advertised as a successful cloud save");
  assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), priorPayload, "previously accepted notes must stay queued after a later rejection");
  assert.deepEqual(store.pendingSharedSyncStatus().pendingEventIds, ["failing"]);
}));

test("malformed delivery metadata never silently narrows a legacy outbox", async () => fixture(async ({ pending, storage, workspaceId }) => {
  const saved = { ...pending, __pendingSync: { version: 1, selection: { eventIds: [], deletedEventIds: "invalid" } } };
  storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(saved));
  const store = await import(`../src/data/localStore.mjs?malformed-scope=${crypto.randomUUID()}`);
  assert.deepEqual(new Set(store.pendingSharedSyncStatus().pendingEventIds), new Set(["healthy", "failing"]));
  assert.ok(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
}));

test("a personal-only conflict retry does not republish unchanged shared groups", async () => fixture(async ({ state, canonicalWrites, workspaceWrites }) => {
  const store = await import(`../src/data/localStore.mjs?personal-conflict-scope=${crypto.randomUUID()}`);
  const changed = { ...state, groups: [{ id: "private-group", name: "Private", participantIds: [state.currentParticipantId] }] };
  const result = await store.saveSharedState(changed, { awaitCloud: true });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "cloud");
  assert.ok(workspaceWrites.length >= 2, "the personal snapshot actually exercised conflict recovery");
  assert.deepEqual(canonicalWrites, [], "a private change cannot turn an old group's permission into a failed save");
}, { workspaceStatus: attempt => attempt === 1 ? 409 : 200 }));

test("partial deletion progress preserves only the unacknowledged deletion scope", async () => fixture(async ({ pending, storage, workspaceId }) => {
  pending.deletedEvents = pending.events.map(event => ({ id: event.id, sharedSpaceId: event.sharedSpaceId,
    sharedSpaceKey: event.sharedSpaceKey, deletedAt: "2026-08-24T09:01:00.000Z" }));
  pending.events = [];
  storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
  const store = await import(`../src/data/localStore.mjs?deletion-scope=${crypto.randomUUID()}`);
  await store.flushPendingSharedState();
  const saved = JSON.parse(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
  assert.deepEqual(saved.__pendingSync.selection, { eventIds: [], deletedEventIds: ["failing"] });
  assert.ok(saved.deletedEvents.some(event => event.id === "failing"));
}));

for (const path of ["save", "flush", "load"]) {
  test(`a mixed permanent failure preserves healthy work and advances the workspace during ${path}`, async () => fixture(async ({ pending, storage, workspaceWrites, workspaceId }) => {
    const store = await import(`../src/data/localStore.mjs?partial-${path}=${Date.now()}`);
    let result;
    if (path === "save") result = await store.saveSharedState(pending, { awaitCloud: true });
    else {
      storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(pending));
      storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
      result = path === "flush" ? await store.flushPendingSharedState() : await store.loadSharedState();
    }
    assert.ok(workspaceWrites.length > 0, "one failing event must not block personal persistence");
    const local = store.loadState();
    assert.ok(local.events.find(({ id }) => id === "healthy").notes.some(({ id }) => id === "local-healthy-note"));
    assert.ok(local.events.find(({ id }) => id === "healthy").notes.some(({ id }) => id === "remote-healthy-note"));
    const queued = JSON.parse(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
    assert.ok(queued.events.find(({ id }) => id === "failing").notes.some(({ id }) => id === "local-failing-note"));
    if (path === "save") {
      assert.equal(result.pending, true);
      assert.equal(result.reverted, undefined);
      assert.equal(result.persistedState, undefined);
      assert.deepEqual(result.failedEventIds, ["failing"]);
    }
  }));
}

test("no successful event never claims partial publication or accepts a forbidden foreground save", async () => fixture(async ({ config, pending, storage, workspaceId, workspaceWrites }) => {
  await assert.rejects(syncSharedEvents(config, pending), (error) => {
    assert.deepEqual(error.partialSharedState.succeededEventIds, []);
    assert.equal(error.persistedState, undefined);
    assert.equal(error.sharedEventPersisted, undefined);
    return true;
  });
  const store = await import(`../src/data/localStore.mjs?partial-none=${Date.now()}`);
  const result = await store.saveSharedState(pending, { awaitCloud: true });
  assert.equal(result.ok, false);
  assert.equal(result.reverted, true);
  assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
  assert.equal(workspaceWrites.length, 0, "a wholly rejected shared mutation must not leak into the personal cloud replica");
}, { allFail: true }));

for (const failure of ["shared sibling", "personal receipt"]) {
  for (const recovers of [true, false]) {
    test(`accepted partial ${failure} schedules a bounded retry when the failure ${recovers ? "recovers" : "persists"}`, async () => {
      let personalStatus = failure === "personal receipt" ? 403 : 200;
      await fixture(async ({ pending, storage, workspaceId, canonical, workspaceWrites, recover }) => {
        const clock = capturePendingRetryTimers();
        const store = await import(`../src/data/localStore.mjs?partial-scheduled=${crypto.randomUUID()}`);
        const result = await store.saveSharedState(pending, { awaitCloud: true });
        assert.equal(result.ok, true);
        assert.equal(result.partial, true);
        assert.equal(result.pending, true);
        assert.ok(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
        assert.equal(clock.timers.size, 1, "accepted pending work must not be left without a recovery attempt");
        if (recovers) { recover(); personalStatus = 200; }
        await clock.runNext();
        if (recovers) {
          assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
          assert.ok(canonical.get("space-partial-failing").events[0].notes.some(note => note.id === "local-failing-note"));
          assert.ok(workspaceWrites.at(-1).events.find(event => event.id === "failing").notes.some(note => note.id === "local-failing-note"));
        } else {
          assert.ok(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), "still-forbidden work stays durable");
        }
        assert.equal(clock.timers.size, 0, "a persistent permanent rejection must not start a retry storm");
      }, {
        status: 403,
        ...(failure === "personal receipt" ? { canonicalStatus: () => 200 } : {}),
        workspaceStatus: () => personalStatus
      });
    });
  }
}

test("a wholly rejected permanent save does not schedule background retries", async () => fixture(async ({ pending, storage, workspaceId }) => {
  const clock = capturePendingRetryTimers();
  const store = await import(`../src/data/localStore.mjs?rejected-unscheduled=${crypto.randomUUID()}`);
  const result = await store.saveSharedState(pending, { awaitCloud: true });
  assert.equal(result.ok, false);
  assert.equal(clock.timers.size, 0);
  assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
}, { allFail: true, status: 403 }));

for (const mutation of ["create", "edit", "delete"]) {
  test(`permanent note ${mutation} rejection preserves a concurrent durable refresh and clears rejected intent`, async () => {
    let refreshDuringWrite = () => {};
    await fixture(async ({ state, storage, workspaceId }) => {
      const store = await import(`../src/data/localStore.mjs?note-rollback-${mutation}=${Date.now()}`);
      const before = addEventNote(state, "healthy", {
        id: "existing-note", title: "Before", body: "Original", createdAt: stamp
      });
      store.saveState(before);
      const attempted = mutation === "create"
        ? addEventNote(before, "healthy", { id: "rejected-note", body: "Rejected creation" })
        : mutation === "edit"
          ? updateEventNote(before, "healthy", "existing-note", { title: "Rejected title" })
          : removeEventNote(before, "healthy", "existing-note");
      const refreshed = addEventNote(structuredClone(attempted), "healthy", { id: "incoming-note", body: "Other device" });
      refreshed.events[0].currency = "USD";
      refreshed.events[1].name = "Updated elsewhere";
      refreshDuringWrite = () => store.saveState(refreshed);
      let snapshotAtNotice;
      globalThis.window.dispatchEvent = event => {
        if (event.type === "sogrim:shared-save-reverted") snapshotAtNotice = store.loadState();
      };
      const result = await store.saveSharedState(attempted, { awaitCloud: true, foregroundMutation: true });
      assert.ok(snapshotAtNotice, "the revert notice was dispatched");
      assert.equal(result.ok, false);
      assert.equal(result.reverted, true);
      const durable = store.loadState();
      const event = durable.events.find(event => event.id === "healthy");
      assert.ok(event.notes.some(note => note.id === "incoming-note"));
      assert.equal(event.currency, "USD");
      assert.equal(durable.events[1].name, "Updated elsewhere");
      assert.equal(event.notes.find(note => note.id === "existing-note").title, "Before");
      assert.equal(event.notes.some(note => note.id === "rejected-note"), false);
      assert.equal((event.deletedNotes ?? []).some(note => note.id === "existing-note"), false);
      assert.deepEqual(snapshotAtNotice, durable, "the UI reload sees the corrected durable state");
      assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
    }, { allFail: true, beforeCanonicalResponse: () => refreshDuringWrite() });
  });
}

for (const [field, change] of [
  ["adminsCanEditOnly", state => setEventAdminsCanEditOnly(state, "healthy", true)],
  ["roundSettlementTransfers", state => setEventRoundSettlementTransfers(state, "healthy", false)],
  ["currency", state => setEventCurrency(state, "healthy", "USD")],
  ["coverImage", state => setEventCoverImage(state, "healthy", "new-cover")]
]) {
  test(`a rejected ${field} write preserves incoming notes in durable storage before the UI revert event`, async () => {
    let duringWrite = () => {};
    await fixture(async ({ state }) => {
      const store = await import(`../src/data/localStore.mjs?settings-rollback-${field}=${Date.now()}`);
      const before = structuredClone(state);
      Object.assign(before.events[0], { adminsCanEditOnly: false, roundSettlementTransfers: true, currency: "ILS", coverImage: "" });
      store.saveState(before);
      const attempted = change(before);
      const latest = addEventNote(structuredClone(attempted), "healthy", { id: "incoming-setting-note", body: "Other device note" });
      latest.events[1].name = "Other device rename";
      duringWrite = () => store.saveState(latest);
      let atNotice;
      globalThis.window.dispatchEvent = event => { if (event.type === "sogrim:shared-save-reverted") atNotice = store.loadState(); };
      const result = await store.saveSharedState(attempted, { awaitCloud: true, foregroundMutation: true });
      assert.equal(result.ok, false); assert.equal(result.reverted, true);
      const durable = store.loadState();
      assert.equal(durable.events[0][field], before.events[0][field]);
      assert.ok(durable.events[0].notes.some(note => note.id === "incoming-setting-note"));
      assert.equal(durable.events[1].name, "Other device rename");
      assert.deepEqual(atNotice, durable);
    }, { allFail: true, beforeCanonicalResponse: () => duringWrite() });
  });
}

test("the outbox clears only after every previously failing event is delivered", async () => fixture(async ({ pending, storage, workspaceId, canonical, recover }) => {
  storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(pending));
  storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
  const store = await import(`../src/data/localStore.mjs?partial-recovery=${Date.now()}`);
  assert.equal((await store.flushPendingSharedState()).ok, false);
  assert.ok(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
  recover();
  assert.deepEqual(await store.flushPendingSharedState(), { ok: true });
  assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
  assert.equal(canonical.get("space-partial-failing").events[0].notes[0].id, "local-failing-note");
  const healthyIds = canonical.get("space-partial-healthy").events[0].notes.map(({ id }) => id);
  assert.equal(new Set(healthyIds).size, healthyIds.length);
}));

for (const recovered of [false, true]) {
  test(`saving another event cannot acknowledge an earlier queued note when its server ${recovered ? "recovers" : "still fails"}`, async () => fixture(async ({ state, storage, workspaceId, canonical, recover }) => {
    const store = await import(`../src/data/localStore.mjs?pending-selection-${recovered}=${crypto.randomUUID()}`);
    const first = addEventNote(state, "failing", { id: "queued-first-note", body: "Must reach the shared event" });
    assert.equal((await store.saveSharedState(first, { awaitCloud: true })).pending, true);
    if (recovered) recover();
    const second = addEventNote(store.loadState(), "healthy", { id: "second-event-note", body: "A separate successful save" });
    const result = await store.saveSharedState(second, { awaitCloud: true });
    assert.ok(canonical.get("space-partial-healthy").events[0].notes.some(note => note.id === "second-event-note"));
    if (recovered) {
      assert.ok(canonical.get("space-partial-failing").events[0].notes.some(note => note.id === "queued-first-note"), "the first note must be canonical before the new whole-state outbox is acknowledged");
      assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
    } else {
      const pending = JSON.parse(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
      assert.ok(pending?.events.find(event => event.id === "failing").notes.some(note => note.id === "queued-first-note"), "a different event's success cannot clear undelivered intent");
      assert.equal(result.pending, true);
    }
  }, { status: 503 }));
}

test("overlapping event saves carry undelivered targets into the later queued write", async () => {
  let release, signalStarted;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { signalStarted = resolve; });
  let paused = false;
  await fixture(async ({ state, storage, workspaceId, canonical }) => {
    const store = await import(`../src/data/localStore.mjs?overlapping-targets=${crypto.randomUUID()}`);
    const first = store.saveSharedState(addEventNote(state, "failing", { id: "overlap-first", body: "First intent" }), { awaitCloud: true });
    let second;
    try {
      await started;
      second = store.saveSharedState(addEventNote(store.loadState(), "healthy", { id: "overlap-second", body: "Second intent" }), { awaitCloud: true });
      release();
      await Promise.all([first, second]);
      assert.ok(canonical.get("space-partial-failing").events[0].notes.some(note => note.id === "overlap-first"));
      assert.ok(canonical.get("space-partial-healthy").events[0].notes.some(note => note.id === "overlap-second"));
      assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
    } finally { release(); await Promise.allSettled([first, second]); }
  }, {
    async beforeCanonicalResponse({ body }) {
      if (!paused && body.p_snapshot_id === "space-partial-failing") { paused = true; signalStarted(); await gate; }
    },
    canonicalStatus(id, attempt) { return id === "space-partial-failing" && attempt <= 2 ? 503 : 200; }
  });
});

test("a new save after restart reconciles the older outbox even without its in-memory selection", async () => fixture(async ({ state, storage, workspaceId, canonical, recover }) => {
  const queued = addEventNote(state, "failing", { id: "restarted-pending-note", body: "Durable intent" });
  storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(queued));
  storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(queued));
  recover();
  const store = await import(`../src/data/localStore.mjs?restored-targets=${crypto.randomUUID()}`);
  await store.saveSharedState(addEventNote(store.loadState(), "healthy", { id: "post-restart-note", body: "New intent" }), { awaitCloud: true });
  assert.ok(canonical.get("space-partial-failing").events[0].notes.some(note => note.id === "restarted-pending-note"));
  assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
}));

test("tracked pending targets do not make a new save republish unrelated events", async () => fixture(async ({ state, storage, workspaceId, canonical, canonicalWrites, recover }) => {
  state.events.push({ ...structuredClone(state.events[0]), id: "untouched", sharedSpaceId: "space-partial-untouched" });
  canonical.set("space-partial-untouched", buildSharedEventState(state, "untouched"));
  storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(state));
  const store = await import(`../src/data/localStore.mjs?bounded-targets=${crypto.randomUUID()}`);
  await store.saveSharedState(addEventNote(state, "failing", { id: "bounded-first", body: "Pending" }), { awaitCloud: true });
  recover();
  await store.saveSharedState(addEventNote(store.loadState(), "healthy", { id: "bounded-second", body: "New" }), { awaitCloud: true });
  assert.ok(canonicalWrites.includes("space-partial-failing"));
  assert.ok(canonicalWrites.includes("space-partial-healthy"));
  assert.equal(canonicalWrites.includes("space-partial-untouched"), false);
}, { status: 503 }));

test("a personal-only save cannot clear a still-undelivered shared note", async () => fixture(async ({ state, storage, workspaceId, canonical, recover }) => {
  const store = await import(`../src/data/localStore.mjs?personal-pending-targets=${crypto.randomUUID()}`);
  await store.saveSharedState(addEventNote(state, "failing", { id: "before-private-save", body: "Pending shared note" }), { awaitCloud: true });
  recover();
  await store.saveSharedState({ ...store.loadState(), groups: [{ id: "private-group", name: "Private group", participantIds: [state.currentParticipantId] }] }, { awaitCloud: true });
  assert.ok(canonical.get("space-partial-failing").events[0].notes.some(note => note.id === "before-private-save"));
  assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
}, { status: 503 }));

test("healthy canonical progress survives simultaneous shared and personal failures", async () => fixture(async ({ pending, storage, workspaceId }) => {
  storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(pending));
  storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
  const store = await import(`../src/data/localStore.mjs?partial-personal-failure=${Date.now()}`);
  const result = await store.flushPendingSharedState();
  assert.equal(result.ok, false);
  assert.ok(result.error.failures.some((error) => error.status === 503));
  const queued = JSON.parse(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
  assert.ok(queued.events[0].notes.some(({ id }) => id === "remote-healthy-note"));
  assert.ok(queued.events[1].notes.some(({ id }) => id === "local-failing-note"));
}, { workspaceStatus: 503 }));

test("shared deletion outcomes use event ids and never claim a failed deletion succeeded", async () => fixture(async ({ config, pending }) => {
  pending.deletedEvents = pending.events.map((event) => ({
    id: event.id, sharedSpaceId: event.sharedSpaceId, sharedSpaceKey: event.sharedSpaceKey,
    deletedAt: "2026-08-24T09:01:00.000Z"
  }));
  pending.events = [];
  await assert.rejects(syncSharedEvents(config, pending), (error) => {
    assert.deepEqual(error.partialSharedState.succeededEventIds, ["healthy"]);
    assert.deepEqual(error.partialSharedState.failedEventIds, ["failing"]);
    assert.equal(error.persistedState, undefined);
    return true;
  });
}));

test("a stale partial flush cannot replace a newer outbox or its local state", async () => fixture(async ({ pending, storage, workspaceId }) => {
  storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(pending));
  storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
  const store = await import(`../src/data/localStore.mjs?partial-superseded=${Date.now()}`);
  await store.flushPendingSharedState();
  assert.ok(store.loadState().events[1].notes.some(({ id }) => id === "newer-note"));
  const queued = JSON.parse(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
  assert.ok(queued.events[1].notes.some(({ id }) => id === "newer-note"));
}, { beforeWorkspaceResponse({ storage, pending, workspaceId }) {
  const newer = structuredClone(pending);
  newer.events[1].notes.push(note("newer-note"));
  storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(newer));
  storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(newer));
} }));

for (const outcome of ["success", "partial", "rejected", "temporary"]) {
  test(`a late ${outcome} save cannot overwrite another tab's newer local note`, async () => fixture(async ({ pending, storage, workspaceId, recover }) => {
    if (outcome === "success") recover();
    const store = await import(`../src/data/localStore.mjs?other-tab-${outcome}=${crypto.randomUUID()}`);
    await store.saveSharedState(pending, { awaitCloud: true });
    assert.ok(store.loadState().events[1].notes.some(item => item.id === "newer-tab-note"), "an older response must not replace the other tab's visible state");
    const queued = JSON.parse(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
    assert.ok(queued?.events[1].notes.some(item => item.id === "newer-tab-note"), "the newer durable outbox must not be replaced or acknowledged");
  }, {
    allFail: ["rejected", "temporary"].includes(outcome),
    status: outcome === "temporary" ? 503 : 403,
    beforeCanonicalResponse({ storage, workspaceId }) {
      const key = `settle-friends-pending-sync:${workspaceId}`;
      const newer = JSON.parse(storage.getItem(key));
      if (newer?.events[1].notes.some(item => item.id === "newer-tab-note")) return;
      delete newer.__pendingSync;
      newer.events[1].notes.push(note("newer-tab-note"));
      storage.setItem(key, JSON.stringify(newer));
      storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(newer));
    }
  }));
}

for (const path of ["save", "flush", "load"]) {
  for (const newerPending of [false, true]) {
    for (const status of [403, 503]) {
      test(`late HTTP ${status} during ${path} cannot label another tab's ${newerPending ? "new outbox" : "completed save"} as failed`, async () => {
        let replaced = false;
        await fixture(async ({ pending, storage, workspaceId }) => {
          const clock = capturePendingRetryTimers();
          const statuses = [];
          window.dispatchEvent = event => { if (event.type === "sogrim:sync-status") statuses.push(event.detail); };
          const store = await import(`../src/data/localStore.mjs?obsolete-status-${crypto.randomUUID()}`);
          if (path !== "save") {
            storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(pending));
            storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
          }
          const result = await (path === "save" ? store.saveSharedState(pending, { awaitCloud: true })
            : path === "flush" ? store.flushPendingSharedState() : store.loadSharedState());
          assert.ok(replaced, "the other tab changed durable state while this request was in flight");
          assert.equal(statuses.at(-1)?.pending, newerPending);
          assert.ok(!statuses.at(-1)?.failureKind, "an obsolete failure is not evidence about newer work");
          assert.equal(clock.timers.size, newerPending ? 1 : 0, "retry current work, never resurrect a completed outbox");
          if (path === "load") assert.ok(result.events[1].notes.some(item => item.id === "newer-tab-note"), "a failed old load must return current durable state");
        }, {
          allFail: true, status,
          beforeCanonicalResponse({ storage, workspaceId }) {
            if (replaced) return;
            replaced = true;
            const key = `settle-friends-pending-sync:${workspaceId}`;
            const newer = JSON.parse(storage.getItem(key));
            newer.events[1].notes.push(note("newer-tab-note"));
            storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(newer));
            if (newerPending) storage.setItem(key, JSON.stringify(newer));
            else storage.removeItem(key);
          }
        });
      });
    }
  }
}

for (const readFails of [false, true]) {
  for (const newerPending of [false, true]) {
    test(`a ${readFails ? "failed" : "successful"} read during retry backoff preserves another tab's ${newerPending ? "pending" : "acknowledged"} note`, async () => {
      let armed = false, replaced = false;
      await fixture(async ({ pending, storage, workspaceId }) => {
        const clock = capturePendingRetryTimers();
        const store = await import(`../src/data/localStore.mjs?backoff-tab-${crypto.randomUUID()}`);
        await store.saveSharedState(pending, { awaitCloud: true });
        assert.equal(clock.timers.size, 1, "exercise a read during actual retry backoff");
        armed = true;
        const loaded = await store.loadSharedState();
        for (const snapshot of [loaded, store.loadState()]) {
          assert.ok(snapshot.events[1].notes.some(item => item.id === "backoff-other-tab-note"));
        }
        assert.equal(Boolean(storage.getItem(`settle-friends-pending-sync:${workspaceId}`)), newerPending);
        assert.equal(clock.timers.size, newerPending ? 1 : 0);
      }, {
        allFail: true, status: 503,
        beforeSnapshotResponse({ storage, workspaceId }) {
          if (!armed) return;
          if (!replaced) {
            replaced = true;
            const key = `settle-friends-pending-sync:${workspaceId}`;
            const newer = JSON.parse(storage.getItem(key));
            newer.events[1].notes.push(note("backoff-other-tab-note"));
            storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(newer));
            if (newerPending) storage.setItem(key, JSON.stringify(newer));
            else storage.removeItem(key);
          }
          if (readFails) throw Object.assign(new Error("Synthetic temporary read failure"), { status: 503 });
        }
      });
    });
  }
}

for (const driver of ["save", "flush"]) {
  test(`a foreground read cannot duplicate the canonical write owned by an in-flight ${driver}`, async () => {
    let release, signalStarted, held = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { signalStarted = resolve; });
    await fixture(async ({ state, pending, storage, workspaceId, canonicalWrites, workspaceWrites, recover }) => {
      recover();
      const store = await import(`../src/data/localStore.mjs?read-during-write-${crypto.randomUUID()}`);
      if (driver === "flush") {
        storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(pending));
        storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
      }
      const saving = driver === "save" ? store.saveSharedState(pending, { awaitCloud: true }) : store.flushPendingSharedState();
      try {
        await started;
        state.events[0].notes.push(note("remote-personal-note"));
        const readsBefore = canonicalWrites.length;
        const loaded = await store.loadSharedState();
        assert.equal(canonicalWrites.length, readsBefore, "refresh may read but cannot start another publication");
        assert.equal(workspaceWrites.length, 0);
        assert.ok(loaded.events[0].notes.some(item => item.id === "remote-personal-note"), "remote account updates still reach the UI while saving");
      } finally { release(); await saving; }
      assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
    }, { beforeCanonicalResponse: async () => {
      if (held >= 2) return;
      held++;
      if (held === 2) signalStarted();
      await gate;
    } });
  });
}

for (const driver of ["save", "flush"]) {
  test(`startup outbox recovery owns publication before a later ${driver}`, async () => {
    let release, signalStarted, held = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { signalStarted = resolve; });
    await fixture(async ({ pending, storage, workspaceId, canonicalWrites, workspaceWrites, recover }) => {
      recover();
      const store = await import(`../src/data/localStore.mjs?write-during-startup-${crypto.randomUUID()}`);
      storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(pending));
      storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
      const loading = store.loadSharedState();
      let saving;
      const newer = structuredClone(pending);
      newer.events[0].notes.push(note("edit-during-startup"));
      try {
        await started;
        const writesBefore = canonicalWrites.length;
        saving = driver === "save"
          ? store.saveSharedState(newer, { awaitCloud: true })
          : store.flushPendingSharedState();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(canonicalWrites.length, writesBefore, "startup and foreground cannot publish the same outbox in parallel");
        assert.equal(workspaceWrites.length, 0);
      } finally { release(); await Promise.all([loading, saving]); }
      assert.equal(storage.getItem(`settle-friends-pending-sync:${workspaceId}`), null);
      if (driver === "save") assert.ok(store.loadState().events.find(event => event.id === "healthy").notes.some(item => item.id === "edit-during-startup"));
    }, { beforeCanonicalResponse: async () => {
      if (held >= 2) return;
      held++;
      if (held === 2) signalStarted();
      await gate;
    } });
  });
}

for (const firstResult of ["mixed", "complete"]) {
for (const path of ["save", "flush", "load"]) {
  test(`an unsuccessful immediate retry preserves the previous ${firstResult} attempt's healthy progress during ${path}`, async () => fixture(async ({ pending, storage, workspaceId, workspaceWrites }) => {
    const store = await import(`../src/data/localStore.mjs?partial-retry-${path}=${Date.now()}`);
    let result;
    if (path === "save") result = await store.saveSharedState(pending, { awaitCloud: true });
    else {
      storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(pending));
      storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(pending));
      result = path === "flush" ? await store.flushPendingSharedState() : await store.loadSharedState();
    }
    const queued = JSON.parse(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
    assert.ok(queued, "a later failed attempt cannot erase a partially committed outbox");
    assert.ok(workspaceWrites[0].events.find(({ id }) => id === "healthy").notes.some(({ id }) => id === "remote-healthy-note"), "the first canonical pass merged the remote note");
    assert.ok(queued.events.find(({ id }) => id === "healthy").notes.some(({ id }) => id === "remote-healthy-note"));
    assert.ok(queued.events.find(({ id }) => id === "failing").notes.some(({ id }) => id === "local-failing-note"));
    assert.ok(store.loadState().events.find(({ id }) => id === "healthy").notes.some(({ id }) => id === "remote-healthy-note"));
    if (path === "save") {
      assert.equal(result.pending, true);
      assert.equal(result.reverted, undefined);
      assert.equal(result.persistedState, undefined);
      assert.deepEqual(new Set(result.failedEventIds), new Set(["healthy", "failing"]));
    }
  }, {
    canonicalStatus(id, attempt) {
      return attempt === 1 ? firstResult === "complete" || id === "space-partial-healthy" ? 200 : 503 : 403;
    },
    workspaceStatus(attempt) { return firstResult === "complete" && attempt === 1 ? 503 : 200; }
  }));
}
}
