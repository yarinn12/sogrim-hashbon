import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { reconcileSettlementTransfers, settlementOptionsForEvent } from "../src/domain/settlement.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
const prepare = section("function prepareSettlement(eventId)", "function requestCloseCurrentEvent(eventId)");
const transfers = section("function prepareEventTransfers(event)", "async function toggleEventLock(eventId)");
const persist = section("function persistState(options = {})", "function persistLocalProfile(");
const settleAction = section('  if (action === "settle") {', '  if (action === "toggle-lock") {');
const clone = value => structuredClone(value);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

// Execute the actual app navigation/preparation code and the real localStore →
// cloudStore writer. Only transport, account storage and DOM adapters are fake.
async function fixture(run, { legacyTransfers = false, reject = false, rejectStatus = 403, holdBody = false } = {}) {
  const keys = ["window", "location", "localStorage", "fetch", "SogrimAccountSession"];
  const old = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const entries = new Map(), writes = [], requests = [];
  const actor = "summary-view-owner", id = `account-${actor}`, peer = "summary-view-peer";
  const space = "summary-view-workspace", origin = "https://summary-view-fixture.supabase.co";
  const location = { href: "https://summary-view.example.invalid/", hostname: "summary-view.example.invalid", protocol: "https:" };
  const config = { storage: { mode: "supabase", url: origin, anonKey: "synthetic-anon", table: "app_snapshots",
    spaceId: space, spaceKey: "synthetic-summary-view-workspace-key-123456", account: { userId: actor, accessToken: "synthetic-token" } } };
  const state = { currentParticipantId: id,
    participants: [{ id, displayName: "Summary owner", kind: "user" }, { id: peer, displayName: "Peer", kind: "guest" }],
    groups: [], friendContacts: [], deletedEvents: [], deletedParticipants: [], events: [{
      id: "summary-view-event", name: "Summary", eventType: "standard", currency: "ILS", locked: true,
      adminIds: [peer], createdByParticipantId: peer, adminsCanEditOnly: true, participantIds: [id, peer],
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
      expenses: [{ id: "summary-expense", name: "Dinner", total: 10000,
        payers: [{ participantId: id, amount: 10000 }], sharedByParticipantIds: [id, peer],
        createdByParticipantId: id, updatedAt: "2026-09-01T00:00:00.000Z" }],
      transfers: [], notes: []
    }] };
  const event = state.events[0];
  if (!legacyTransfers) event.transfers = reconcileSettlementTransfers(state.participants, event.expenses, [], settlementOptionsForEvent(event)).transfers;
  let remote = clone(state), version = "2026-09-01T00:00:00.000Z", rejectWrites = reject, pausedBody = holdBody;
  const bodyGate = deferred(), headerSeen = deferred();
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key) };
  storage.setItem("settle-friends-account-session", JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: actor, user_metadata: { account_space_id: space, account_space_key: config.storage.spaceKey } } }));
  storage.setItem("settle-friends-cloud-space", space);
  storage.setItem(`settle-friends-cloud-key:${space}`, config.storage.spaceKey);
  storage.setItem(`settle-friends-state:${space}`, JSON.stringify(state));
  globalThis.window = { location, localStorage: storage, addEventListener() {}, dispatchEvent() {} };
  globalThis.location = location; globalThis.localStorage = storage;
  globalThis.SogrimAccountSession = { async refresh() { return null; } };
  const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return clone(value); } });
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), location.href), method = options.method || "GET";
    requests.push({ origin: url.origin, path: url.pathname, method });
    if (url.origin === location.href.slice(0, -1) && url.pathname === "/api/config") return response(config);
    assert.equal(url.origin, origin, "transport is limited to the synthetic account");
    assert.ok(url.pathname.endsWith("/app_snapshots"));
    if (method === "GET") {
      if (url.searchParams.has("snapshot_kind")) return response([]);
      assert.equal(url.searchParams.get("id"), `eq.${space}`);
      return response([{ id: space, state: clone(remote), updated_at: version }]);
    }
    assert.ok(["PATCH", "POST"].includes(method));
    const body = JSON.parse(options.body);
    assert.ok(url.searchParams.get("id") === `eq.${space}` || body.id === space);
    writes.push({ method, expectedVersion: url.searchParams.get("updated_at"), state: clone(body.state) });
    if (rejectWrites) return response({ message: "Synthetic unavailable write" }, rejectStatus);
    if (method === "PATCH" && url.searchParams.get("updated_at") !== `eq.${version}`) return response([]);
    remote = clone(body.state);
    version = new Date(Date.parse(version) + 1).toISOString();
    const savedVersion = version;
    headerSeen.resolve();
    return { ok: true, status: 200, async json() {
      if (pausedBody) await bodyGate.promise;
      return [{ updated_at: savedVersion }];
    } };
  };
  const completions = [];
  let resumeCallback;
  try {
    const store = await import(`../src/data/localStore.mjs?summary-view=${crypto.randomUUID()}`);
    await store.loadRuntimeConfig();
    const ctx = vm.createContext({
      state, notice: "", eventDialog: null, screen: { name: "event", eventId: event.id },
      settlementCloseConfirmation: null, action: "settle", target: { dataset: { eventId: event.id } },
      getEvent: eventId => ctx.state.events.find(e => e.id === eventId),
      eventParticipants: e => ctx.state.participants.filter(person => e.participantIds.includes(person.id)),
      reconcileSettlementTransfers, settlementOptionsForEvent,
      saveSharedState: (next, options) => {
        const request = store.saveSharedState(next, options);
        completions.push(request.then(result => result.completion ?? result));
        return request;
      },
      render() {}, emitProductMetric() {},
      requestResumeSyncAfterPaint(options, callback) {
        assert.deepEqual(clone(options), { force: true, includeSecondary: false });
        resumeCallback = callback;
      }
    });
    vm.runInContext(prepare + transfers + persist, ctx);
    const invoke = vm.runInContext(`(async function invoke() { ${settleAction} })`, ctx);
    const drain = async () => { for (let i = 0; i < completions.length; i++) await completions[i]; };
    await run({ ctx, store, storage, writes, requests, headerSeen,
      open: () => invoke(), prepare: () => ctx.prepareSettlement(event.id), drain,
      pendingRaw: () => storage.getItem(`settle-friends-pending-sync:${space}`),
      remote: () => clone(remote), rejectWrites: value => { rejectWrites = value; },
      releaseBody: () => { pausedBody = false; bodyGate.resolve(); },
      resume: async () => { await store.flushPendingSharedState(); resumeCallback?.({ ok: true }); await drain(); }
    });
    await drain();
  } finally {
    pausedBody = false; bodyGate.resolve();
    await Promise.allSettled(completions);
    for (const key of keys) { if (old[key] === undefined) delete globalThis[key]; else globalThis[key] = old[key]; }
  }
}

for (const entry of ["open", "prepare"]) {
  test(`an unchanged closed summary via ${entry} creates no cloud write or outbox generation`, async () => fixture(async h => {
    const before = clone(h.ctx.state), generation = h.store.sharedStateSaveRevision();
    await h[entry](); await h.drain();
    if (entry === "open") await h.resume();
    assert.deepEqual(h.writes, [], "a read-only summary must not write an identical snapshot");
    assert.equal(h.store.sharedStateSaveRevision(), generation);
    assert.equal(h.pendingRaw(), null);
    assert.deepEqual(h.ctx.state, before);
  }));
}

test("unchanged summary refresh creates no permission failure or retry queue", async () => fixture(async h => {
  await h.open(); await h.drain(); await h.resume();
  assert.deepEqual(h.writes, []);
  assert.equal(h.store.pendingSharedSyncStatus().pending, false);
}, { reject: true }));

test("legacy transfer preparation sends exactly one final payload and an unchanged resume does not repeat it", async () => fixture(async h => {
  await h.open(); await h.drain();
  const first = h.remote();
  assert.equal(first.events[0].transfers.length, 1);
  assert.equal(first.events[0].transfers[0].amount, 5000);
  await h.resume();
  assert.equal(h.writes.length, 1, "resume with the same transfer plan must not enqueue another save");
  assert.deepEqual(h.remote(), first);
  assert.equal(h.pendingRaw(), null);
}, { legacyTransfers: true }));

test("a needed transfer save retains its outbox through delayed response-body acknowledgement", async () => fixture(async h => {
  await h.open(); await h.headerSeen.promise;
  assert.ok(h.pendingRaw(), "200 headers alone are not an acknowledgement");
  assert.equal(h.store.pendingSharedSyncStatus().pending, true);
  h.releaseBody(); await h.drain();
  assert.equal(h.pendingRaw(), null);
  assert.equal(h.remote().events[0].transfers[0].amount, 5000);
}, { legacyTransfers: true, holdBody: true }));

test("a real refreshed expense change still persists its recomputed transfer payload", async () => fixture(async h => {
  await h.open(); await h.drain();
  h.ctx.state.events[0].expenses[0].total = 14000;
  h.ctx.state.events[0].expenses[0].payers[0].amount = 14000;
  h.ctx.state.events[0].expenses[0].updatedAt = "2026-09-02T00:00:00.000Z";
  await h.resume();
  assert.equal(h.remote().events[0].transfers[0].amount, 7000);
  assert.equal(h.remote().events[0].expenses[0].total, 14000);
  assert.equal(h.pendingRaw(), null);
}));

test("opening a stable summary preserves an existing offline outbox and resume later delivers it", async () => fixture(async h => {
  h.ctx.state.events[0].notes.push({ id: "pending-note", body: "Retain my offline change", updatedAt: "2026-09-02T00:00:00.000Z" });
  const saved = await h.store.saveSharedState(h.ctx.state, { awaitCloud: true });
  assert.equal(saved.ok, true, "the offline change is accepted durably for retry");
  assert.equal(saved.pending, true, "a queued result is not a cloud acknowledgement");
  const raw = h.pendingRaw(), beforeWrites = h.writes.length, generation = h.store.sharedStateSaveRevision();
  assert.ok(raw);
  await h.open(); await h.drain();
  assert.equal(h.writes.length, beforeWrites, "viewing must not create another rejected save");
  assert.equal(h.pendingRaw(), raw, "viewing must preserve pending bytes");
  assert.equal(h.store.sharedStateSaveRevision(), generation);
  h.rejectWrites(false); await h.resume();
  assert.equal(h.remote().events[0].notes[0].body, "Retain my offline change");
  assert.equal(h.pendingRaw(), null);
}, { reject: true, rejectStatus: 503 }));

test("leaving the summary before resume does not enqueue a save on the destination screen", async () => fixture(async h => {
  await h.open(); await h.drain();
  const before = h.writes.length;
  h.ctx.screen = { name: "home" };
  await h.resume();
  assert.equal(h.writes.length, before);
}));
