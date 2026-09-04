import test from "node:test";
import assert from "node:assert/strict";
import { addEventNote } from "../src/domain/eventNotes.mjs";
import { buildSharedEventState } from "../src/data/sharedEventStore.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const response = data => ({ ok: true, status: 200, async json() { return structuredClone(data); } });
async function within(request, milliseconds = 500) {
  let timeout;
  try {
    return await Promise.race([request, new Promise(resolve => { timeout = setTimeout(() => resolve(null), milliseconds); })]);
  } finally { clearTimeout(timeout); }
}

async function fixture(run, { pauseConfig = false, pausePersonal = false, pauseCanonical = false, canonicalStatus = 200, personalStatus = 200, unavailableStorage = false } = {}) {
  const keys = ["window", "location", "localStorage", "fetch", "SogrimAccountSession"];
  const globals = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const entries = new Map();
  const storage = { getItem: key => entries.get(key) ?? null,
    setItem: (key, val) => {
      if (unavailableStorage && key.includes("pending-sync")) throw new Error("Quota exceeded");
      entries.set(key, String(val));
    }, removeItem: key => entries.delete(key) };
  const location = { href: "https://sogrim-hesbon-app.vercel.app/", hostname: "sogrim-hesbon-app.vercel.app", protocol: "https:" };
  const config = { storage: { mode: "supabase", url: "https://latency-fixture.supabase.co", anonKey: "fixture-anon", table: "app_snapshots",
    spaceId: "latency-workspace", spaceKey: "fixture-workspace-secret-long-enough-123456", account: { userId: "latency-a", accessToken: "fixture-token" } } };
  const state = { currentParticipantId: "account-latency-a", participants: [{ id: "account-latency-a", displayName: "Latency A", kind: "user" }], groups: [],
    events: [{ id: "latency-event", name: "Latency", eventType: "standard", currency: "ILS", participantIds: ["account-latency-a"],
      adminIds: ["account-latency-a"], createdByParticipantId: "account-latency-a", createdAt: "2026-09-01T00:00:00.000Z", expenses: [], transfers: [], notes: [],
      sharedSpaceId: "latency-shared", sharedSpaceKey: "fixture-shared-secret-long-enough-123456" }] };
  const changed = addEventNote(state, "latency-event", { id: "latency-note", body: "Save me" });
  let canonical = buildSharedEventState(state, "latency-event");
  let personal = structuredClone(state);
  const configGate = deferred(), configStarted = deferred();
  const personalGate = deferred(), personalStarted = deferred();
  const canonicalGate = deferred(), canonicalStarted = deferred();
  const events = [];
  let canonicalWrites = 0, personalWrites = 0;
  storage.setItem("settle-friends-account-session", JSON.stringify({ access_token: "fixture-token", refresh_token: "fixture-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "latency-a", user_metadata: { account_space_id: config.storage.spaceId, account_space_key: config.storage.spaceKey } } }));
  storage.setItem("settle-friends-cloud-space", config.storage.spaceId);
  storage.setItem(`settle-friends-cloud-key:${config.storage.spaceId}`, config.storage.spaceKey);
  storage.setItem(`settle-friends-state:${config.storage.spaceId}`, JSON.stringify(state));
  globalThis.window = { location, localStorage: storage, addEventListener() {}, dispatchEvent: event => events.push(event) };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.SogrimAccountSession = { async refresh() { return null; } };
  globalThis.fetch = async (url, options = {}) => {
    const address = new URL(String(url), location.href);
    if (address.pathname === "/api/config") {
      configStarted.resolve();
      if (pauseConfig) await configGate.promise;
      return response(config);
    }
    if (address.pathname.endsWith("/rpc/join_shared_event")) return response({ ok: true });
    if (address.pathname.endsWith("/rpc/update_shared_event_snapshot")) {
      canonicalStarted.resolve();
      if (pauseCanonical) await canonicalGate.promise;
      if (canonicalStatus !== 200) return { ok: false, status: canonicalStatus };
      canonical = JSON.parse(options.body).p_state;
      canonicalWrites++;
      return response({ status: "updated", updatedAt: "2026-09-04T12:00:00.000Z" });
    }
    if (["POST", "PATCH"].includes(options.method)) {
      personalStarted.resolve();
      if (pausePersonal) await personalGate.promise;
      if (personalStatus !== 200) return { ok: false, status: personalStatus };
      personal = JSON.parse(options.body).state;
      personalWrites++;
      return response([{ updated_at: "2026-09-04T12:01:00.000Z" }]);
    }
    const id = address.searchParams.get("id")?.replace(/^eq\./, "");
    assert.ok(id === "latency-shared" || id === "latency-workspace", "only synthetic data is accessible");
    return response([{ state: id === "latency-shared" ? canonical : personal, updated_at: "2026-09-01T00:00:00.000Z" }]);
  };
  try {
    const store = await import(`../src/data/localStore.mjs?save-latency=${crypto.randomUUID()}`);
    await run({ store, state, changed, storage, events, configStarted, configGate, personalStarted, personalGate, canonicalStarted, canonicalGate,
      canonical: () => canonical, personal: () => personal, writes: () => ({ canonical: canonicalWrites, personal: personalWrites }) });
  } finally {
    configGate.resolve(); personalGate.resolve(); canonicalGate.resolve();
    for (const key of keys) { if (globals[key] === undefined) delete globalThis[key]; else globalThis[key] = globals[key]; }
  }
}

for (const delayed of [false, true]) {
  test(`a ${delayed ? "background" : "foreground"} rejected save has exactly one feedback owner`, async () => fixture(async h => {
    const request = h.store.saveSharedState(h.changed, {
      foregroundMutation: true, handlesSaveFailure: true,
      foregroundSaveBudgetMs: 10, awaitCloud: !delayed
    });
    if (delayed) await h.canonicalStarted.promise;
    const result = await request;
    if (delayed) {
      assert.equal(result.pending, true);
      h.canonicalGate.resolve();
      assert.equal((await result.completion).reverted, true);
    } else assert.equal(result.reverted, true);
    const notices = h.events.filter(event => event.type === "sogrim:shared-save-reverted");
    assert.equal(notices.length, 1, "state reconciliation still reaches the app");
    assert.equal(notices[0].detail.foregroundMutation, delayed,
      "only a failure after the editor has yielded needs general feedback");
    assert.equal(notices[0].detail.failureKind, "permission");
  }, { pauseCanonical: delayed, canonicalStatus: 403 }));
}

test("the UI save budget includes a stalled runtime-config request after durable local persistence", async () => fixture(async h => {
  const started = performance.now();
  const request = h.store.saveSharedState(h.changed, { foregroundSaveBudgetMs: 25 });
  let result;
  try {
    await h.configStarted.promise;
    result = await within(request);
    assert.ok(result, "config must not postpone the foreground budget until after the network wait");
    assert.equal(result.ok, true);
    assert.equal(result.pending, true, "early return is local pending, never a cloud receipt");
    assert.equal(result.mode, "queued");
    assert.ok(result.completion);
    assert.ok(h.storage.getItem("settle-friends-pending-sync:latency-workspace"));
    assert.equal(h.store.loadState().events[0].notes[0].id, "latency-note");
    assert.equal(h.writes().canonical, 0);
    console.log(`Save response with config paused: ${(performance.now() - started).toFixed(1)} ms`);
  } finally {
    h.configGate.resolve();
    const eventual = result ?? await request;
    const completed = eventual.completion ? await eventual.completion : eventual;
    assert.equal(completed.mode, "cloud");
    assert.equal(completed.completion, undefined, "completion must be final, not another timed UI response");
  }
}, { pauseConfig: true }));

test("a full cloud-confirmed caller still waits through config and canonical persistence", async () => fixture(async h => {
  const request = h.store.saveSharedState(h.changed, { awaitCloud: true, foregroundSaveBudgetMs: 1 });
  try {
    await h.configStarted.promise;
    assert.equal(await within(request, 30), null);
  } finally { h.configGate.resolve(); await request; }
}, { pauseConfig: true }));

test("failed durable outbox storage never produces an optimistic queued acknowledgement", async () => fixture(async h => {
  const result = await h.store.saveSharedState(h.changed, { foregroundSaveBudgetMs: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.pending, undefined);
  assert.equal(h.store.loadState().events[0].notes.length, 0);
}, { unavailableStorage: true }));

test("a queued save exposes a later permanent rejection and clears its rejected outbox", async () => fixture(async h => {
  const request = h.store.saveSharedState(h.changed, { foregroundSaveBudgetMs: 10 });
  let result;
  try {
    await h.canonicalStarted.promise;
    result = await within(request);
    assert.equal(result?.mode, "queued");
    assert.equal(result.pending, true);
    assert.equal(h.writes().canonical, 0);
  } finally {
    h.canonicalGate.resolve();
    const eventual = result ?? await request;
    const completed = await (eventual.completion ?? eventual);
    assert.equal(completed.ok, false);
    assert.equal(completed.reverted, true);
    assert.equal(h.storage.getItem("settle-friends-pending-sync:latency-workspace"), null);
    assert.equal(h.store.loadState().events[0].notes.length, 0);
  }
}, { pauseCanonical: true, canonicalStatus: 403 }));

test("cloud-confirmed saves still wait for both canonical and personal writes", async () => fixture(async h => {
  const request = h.store.saveSharedState(h.changed, { awaitCloud: true, foregroundSaveBudgetMs: 1 });
  try {
    await h.canonicalStarted.promise;
    assert.equal(await within(request, 30), null);
    h.canonicalGate.resolve();
    await h.personalStarted.promise;
    assert.equal(h.writes().canonical, 1);
    assert.equal(await within(request, 30), null, "canonical success alone is not a full cloud receipt");
  } finally {
    h.canonicalGate.resolve(); h.personalGate.resolve();
    const result = await request;
    assert.equal(result.mode, "cloud");
    assert.equal(result.pending, undefined);
    assert.equal(result.persistedState.events[0].notes[0].id, "latency-note");
  }
}, { pauseCanonical: true, pausePersonal: true }));

test("the UI budget includes time queued behind an earlier personal write", async () => fixture(async h => {
  const first = h.store.saveSharedState(h.state, { awaitCloud: true });
  let second;
  try {
    await h.personalStarted.promise;
    second = h.store.saveSharedState(h.changed, { foregroundSaveBudgetMs: 10 });
    const result = await within(second);
    assert.equal(result?.mode, "queued");
    assert.equal(result.pending, true);
    assert.equal(h.writes().canonical, 0, "serialized ordering is unchanged");
    assert.ok(h.storage.getItem("settle-friends-pending-sync:latency-workspace"));
    h.personalGate.resolve();
    await first;
    const completed = await result.completion;
    assert.equal(completed.mode, "cloud");
    assert.equal(h.personal().events[0].notes[0].id, "latency-note");
    assert.equal(h.storage.getItem("settle-friends-pending-sync:latency-workspace"), null);
  } finally {
    h.personalGate.resolve();
    await first;
    if (second) { const result = await second; await result.completion; }
  }
}, { pausePersonal: true }));

test("switching accounts before budget expiry cannot report the old user's save as accepted", async () => fixture(async h => {
  const request = h.store.saveSharedState(h.changed, { foregroundSaveBudgetMs: 10 });
  try {
    await h.configStarted.promise;
    const session = JSON.parse(h.storage.getItem("settle-friends-account-session"));
    session.user.id = "latency-b";
    session.user.user_metadata.account_space_id = "latency-workspace-b";
    session.user.user_metadata.account_space_key = "fixture-other-workspace-key-long-enough";
    h.storage.setItem("settle-friends-account-session", JSON.stringify(session));
    assert.equal(await within(request, 30), null, "wait for stale-account result, not queued success");
  } finally {
    h.configGate.resolve();
    const result = await request;
    assert.equal(result.ok, false);
    assert.equal(result.mode, "stale-account");
    assert.equal(result.completion, undefined);
    assert.deepEqual(h.writes(), { canonical: 0, personal: 0 });
  }
}, { pauseConfig: true }));

test("a second edit during stalled config keeps both changes in the durable outbox and final cloud state", async () => fixture(async h => {
  const requests = [];
  try {
    requests.push(h.store.saveSharedState(h.changed, { foregroundSaveBudgetMs: 10 }));
    assert.equal((await within(requests[0]))?.mode, "queued");
    const next = addEventNote(h.store.loadState(), "latency-event", { id: "latency-second-note", body: "Second save" });
    requests.push(h.store.saveSharedState(next, { foregroundSaveBudgetMs: 10 }));
    assert.equal((await within(requests[1]))?.mode, "queued");
    const pending = h.storage.getItem("settle-friends-pending-sync:latency-workspace");
    assert.ok(pending.includes("latency-note"));
    assert.ok(pending.includes("latency-second-note"));
    assert.equal(h.writes().canonical, 0);
  } finally {
    h.configGate.resolve();
    for (const request of requests) { const result = await request; await result.completion; }
  }
  assert.deepEqual(h.canonical().events[0].notes.map(note => note.id).sort(), ["latency-note", "latency-second-note"]);
  assert.deepEqual(h.personal().events[0].notes.map(note => note.id).sort(), ["latency-note", "latency-second-note"]);
  assert.equal(h.storage.getItem("settle-friends-pending-sync:latency-workspace"), null);
  assert.equal(h.events.filter(event => event.type === "sogrim:sync-status" && event.detail.status === "saved").length, 1,
    "the first completed save must not clear the second save's pending indicator");
}, { pauseConfig: true }));
