import test from "node:test";
import assert from "node:assert/strict";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function within(promise, ms = 500) {
  let timer;
  try {
    return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(null), ms); })]);
  } finally { clearTimeout(timer); }
}

async function fixture(run, { paused = ["a"], status = 200 } = {}) {
  const names = ["window", "location", "localStorage", "fetch", "SogrimAccountSession"];
  const previous = new Map(names.map(name => [name, globalThis[name]]));
  const entries = new Map(), timers = new Map(), calls = [], requests = [], listeners = new Map();
  const scheduled = [], cancelled = [];
  let timerId = 0;
  const storage = { getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key) };
  const location = { href: "https://sogrim-hesbon-app.vercel.app/", hostname: "sogrim-hesbon-app.vercel.app", protocol: "https:" };
  const states = Object.fromEntries(["a", "b"].map(id => [id, {
    currentParticipantId: `account-queue-${id}`,
    participants: [{ id: `account-queue-${id}`, displayName: `Queue ${id.toUpperCase()}`, kind: "user" }], groups: [], events: []
  }]));
  const started = { a: deferred(), b: deferred() }, gates = { a: deferred(), b: deferred() };
  const activate = id => {
    const spaceId = `queue-space-${id}`;
    storage.setItem("settle-friends-account-session", JSON.stringify({
      access_token: `token-${id}`, refresh_token: `refresh-${id}`, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: `queue-${id}`, user_metadata: { account_space_id: spaceId, account_space_key: `synthetic-${id}-workspace-key-long-enough` } }
    }));
    storage.setItem("settle-friends-cloud-space", spaceId);
    storage.setItem(`settle-friends-cloud-key:${spaceId}`, `synthetic-${id}-workspace-key-long-enough`);
    storage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(states[id]));
  };
  activate("a");
  globalThis.window = { location, localStorage: storage, addEventListener(name, callback) { listeners.set(name, callback); }, dispatchEvent() {},
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, callback); scheduled.push({ id, delay }); return id; },
    clearTimeout(id) { cancelled.push(id); timers.delete(id); }
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.SogrimAccountSession = { async refresh() { return null; } };
  const response = data => ({ ok: true, status: 200, async json() { return structuredClone(data); } });
  const cloudOrigin = `https://queue-${crypto.randomUUID()}.supabase.co`;
  globalThis.fetch = async (url, options = {}) => {
    const address = new URL(String(url), location.href);
    if (address.pathname === "/api/config") return response({ storage: {
      mode: "supabase", url: cloudOrigin, anonKey: "synthetic-anon", table: "app_snapshots"
    } });
    assert.equal(address.origin, cloudOrigin, "only the synthetic backend is accessible");
    const id = options.headers.authorization === "Bearer token-a" ? "a" : "b";
    if (!["POST", "PATCH"].includes(options.method)) return response([{ state: states[id], updated_at: "2026-09-04T00:00:00.000Z" }]);
    calls.push({ id, state: JSON.parse(options.body).state });
    started[id].resolve();
    if (paused.includes(id)) await gates[id].promise;
    if (status !== 200) return { ok: false, status };
    return response([{ updated_at: "2026-09-04T01:00:00.000Z" }]);
  };
  try {
    const store = await import(`../src/data/localStore.mjs?scoped-queue=${crypto.randomUUID()}`);
    await run({ store, states, storage, activate, started, gates, calls, timers, scheduled, cancelled, listeners,
      pause(id) { paused.push(id); gates[id] = deferred(); started[id] = deferred(); },
      track(promise) { requests.push(promise); return promise; },
      queue(id) { storage.setItem(`settle-friends-pending-sync:queue-space-${id}`, JSON.stringify(states[id])); }
    });
  } finally {
    gates.a.resolve(); gates.b.resolve();
    await Promise.allSettled(requests);
    for (const [name, value] of previous) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; }
  }
}

for (const operation of ["save", "flush"]) {
  test(`a new account's ${operation} does not wait behind the old account's stalled network request`, async () => fixture(async h => {
    h.queue("a");
    const first = h.track(operation === "save" ? h.store.saveSharedState(h.states.a, { awaitCloud: true }) : h.store.flushPendingSharedState());
    await h.started.a.promise;
    h.activate("b");
    h.queue("b");
    const second = h.track(operation === "save" ? h.store.saveSharedState(h.states.b, { awaitCloud: true }) : h.store.flushPendingSharedState());
    const result = await within(second);
    assert.ok(result, "B must complete while A's response is still gated, not after its network timeout");
    assert.equal(result.ok, true);
    assert.ok(h.calls.some(call => call.id === "b"), "B's personal writes reached the server before A finished");
    h.gates.a.resolve();
    assert.equal((await first).mode, "stale-account");
  }));
}

test("a new account starts with its own retry timer and initial backoff", async () => fixture(async h => {
  const first = await h.store.saveSharedState(h.states.a, { awaitCloud: true });
  assert.equal(first.pending, true);
  const oldTimer = h.scheduled[0];
  h.activate("b");
  const second = await h.store.saveSharedState(h.states.b, { awaitCloud: true });
  assert.equal(second.pending, true);
  assert.ok(h.cancelled.includes(oldTimer.id), "account A's timer is cancelled when ownership changes");
  assert.equal(h.scheduled.length, 2, "B has its own retry instead of relying on A's callback");
  assert.equal(h.scheduled[1].delay, oldTimer.delay, "A's backoff must not delay B's first retry");
  assert.equal(h.timers.size, 1);
}, { paused: [], status: 401 }));

test("an obsolete same-account retry callback cannot replace the new online-recovery timer", async () => fixture(async h => {
  await h.store.saveSharedState(h.states.a, { awaitCloud: true });
  const oldCallback = h.timers.get(h.scheduled[0].id);
  h.listeners.get("online")();
  await h.store.flushPendingSharedState();
  assert.equal(h.scheduled.length, 2, "online recovery replaced the original timer");
  const timersBefore = [...h.timers.keys()];
  const writesBefore = h.calls.length;
  await oldCallback();
  assert.equal(h.calls.length, writesBefore, "an already-queued cancelled callback cannot duplicate recovery");
  assert.deepEqual([...h.timers.keys()], timersBefore, "the replacement remains the only tracked retry");
}, { paused: [], status: 401 }));

test("an already-running old retry cannot alter the new account's retry after its await", async () => fixture(async h => {
  await h.store.saveSharedState(h.states.a, { awaitCloud: true });
  const oldTimer = h.scheduled[0].id;
  const oldCallback = h.timers.get(oldTimer);
  h.timers.delete(oldTimer);
  h.pause("a");
  const oldRetry = h.track(oldCallback());
  await h.started.a.promise;
  h.activate("b");
  await h.store.saveSharedState(h.states.b, { awaitCloud: true });
  const timerIdsBefore = [...h.timers.keys()];
  h.gates.a.resolve();
  await oldRetry;
  assert.deepEqual([...h.timers.keys()], timerIdsBefore);
  assert.equal(timerIdsBefore.length, 1);
  assert.equal(h.scheduled.length, 2, "completion of A's retry cannot create or reset B's retry");
}, { paused: [], status: 401 }));

test("an old flush finalizer cannot clear another account's in-flight recovery", async () => fixture(async h => {
  h.queue("a");
  const first = h.track(h.store.flushPendingSharedState());
  await h.started.a.promise;
  h.activate("b");
  h.queue("b");
  const second = h.track(h.store.flushPendingSharedState());
  assert.ok(await within(h.started.b.promise.then(() => true)), "B starts independently");
  h.gates.a.resolve();
  assert.equal((await first).mode, "stale-account");
  const third = h.track(h.store.flushPendingSharedState());
  h.gates.b.resolve();
  assert.equal(await third, await second, "same-account callers still share the exact recovery result");
}, { paused: ["a", "b"] }));

test("overlapping recovery calls in one account remain deduplicated", async () => fixture(async h => {
  h.queue("a");
  const first = h.track(h.store.flushPendingSharedState());
  await h.started.a.promise;
  const second = h.track(h.store.flushPendingSharedState());
  h.gates.a.resolve();
  assert.equal(await second, await first);
}));

test("a cancelled retry callback that was already queued cannot run under a new account", async () => fixture(async h => {
  await h.store.saveSharedState(h.states.a, { awaitCloud: true });
  const oldCallback = h.timers.get(h.scheduled[0].id);
  h.activate("b");
  await h.store.saveSharedState(h.states.b, { awaitCloud: true });
  const callsBefore = h.calls.length;
  const activeTimersBefore = [...h.timers.keys()];
  await oldCallback();
  assert.equal(h.calls.length, callsBefore, "old timer never starts recovery using the new account");
  assert.deepEqual([...h.timers.keys()], activeTimersBefore, "old callback does not clear B's timer slot");
}, { paused: [], status: 401 }));
