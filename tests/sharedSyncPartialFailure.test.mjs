import assert from "node:assert/strict";
import test from "node:test";
import { buildSharedEventState, syncSharedEvents } from "../src/data/sharedEventStore.mjs";
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

async function fixture(run, { allFail = false, status = 403, workspaceStatus = 200, beforeWorkspaceResponse = null, beforeCanonicalResponse = null, canonicalStatus = null } = {}) {
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

test("no successful event never claims partial publication or accepts a forbidden foreground save", async () => fixture(async ({ config, pending, storage, workspaceId }) => {
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
