import assert from "node:assert/strict";
import test from "node:test";
import { loadCloudState, readCloudState } from "../src/data/cloudStore.mjs";
import { invalidateVersionedReadCacheSession } from "../src/data/versionedReadCache.mjs";

for (const collection of ["notes", "expenses", "groups"]) {
  for (const cacheMode of ["warm", "cold", "invalidated"]) {
  test(`saving personal ${collection} preserves peer changes with a ${cacheMode} write cache`, async () => {
    const previous = Object.fromEntries(["window", "location", "localStorage", "fetch"].map(key => [key, globalThis[key]]));
    const fixture = createFixture(`${collection}-${cacheMode}`);
    const { config, storage, location, original } = fixture;
    let serverState = structuredClone(original), serverVersion = version(0);
    const requests = [];
    const fetchImpl = async (url, options = {}) => {
      const address = new URL(String(url), location);
      if (address.pathname === "/api/config") return json(config);
      assert.equal(address.origin, config.storage.url);
      const method = options.method ?? "GET";
      requests.push({ method, select: address.searchParams.get("select") });
      if (method === "PATCH") {
        if (address.searchParams.get("updated_at") !== `eq.${serverVersion}`) return json([]);
        serverState = structuredClone(JSON.parse(options.body).state);
        serverVersion = version(4);
        return json([{ updated_at: serverVersion }]);
      }
      if (method === "POST") return { ok: false, status: 409 };
      assert.equal(method, "GET");
      return json([address.searchParams.get("select") === "updated_at"
        ? { updated_at: serverVersion }
        : { state: structuredClone(serverState), updated_at: serverVersion }]);
    };
    globalThis.window = { localStorage: storage, location, addEventListener() {}, dispatchEvent() {} };
    globalThis.location = location;
    globalThis.localStorage = storage;
    globalThis.fetch = fetchImpl;
    try {
      const store = await import(`../src/data/localStore.mjs?personal-race-${collection}-${cacheMode}=${Date.now()}`);
      if (cacheMode !== "cold") await readCloudState(config, fetchImpl, { preferCached: true });
      const draft = structuredClone(original);
      entries(draft, collection).push(item(collection, "local", 3));
      entries(serverState, collection).push(item(collection, "peer", 2));
      serverVersion = version(2);
      // This caller downloaded the newer workspace, but its UI has not applied
      // it to the draft. Its read must not authorize an older replacement body.
      if (cacheMode !== "cold") await readCloudState(config, fetchImpl);
      if (cacheMode === "invalidated") invalidateVersionedReadCacheSession();
      const beforeSave = requests.length;
      const result = await store.saveSharedState(draft, { awaitCloud: true });
      assert.equal(result.ok, true);
      assert.equal(result.mode, "cloud");
      for (const state of [serverState, result.persistedState, store.loadState()]) {
        assert.deepEqual(entries(state, collection).map(entry => entry.id).sort(), ["local", "peer"]);
      }
      assert.equal(requests.slice(beforeSave).filter(request => request.method === "GET").length, cacheMode === "warm" ? 0 : 1,
        "reuse a confirmed cached baseline; otherwise fetch exactly one source payload");
      assert.equal(storage.getItem(`settle-friends-pending-sync:${config.storage.spaceId}`), null);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    }
  });
  }
}

test("workspace initialization cannot overwrite a row concurrently created by another device", async () => {
  const { config, original } = createFixture("concurrent-creation");
  const ready = deferred(), missingResponse = deferred(), backgroundReady = deferred(), backgroundResponse = deferred();
  const createdByPeer = structuredClone(original);
  createdByPeer.events[0].notes.push(item("notes", "peer", 2));
  let serverState = createdByPeer, readCount = 0;
  const writes = [];
  const startup = loadCloudState(config, original, async (_url, options = {}) => {
    if (options.method === "POST") { writes.push("POST"); return { ok: false, status: 409 }; }
    if (options.method === "PATCH") {
      writes.push("PATCH");
      serverState = JSON.parse(options.body).state;
      return json([{ updated_at: version(3) }]);
    }
    if (++readCount === 1) { ready.resolve(); return missingResponse.promise; }
    return json([{ state: serverState, updated_at: version(2) }]);
  });
  await ready.promise;
  const background = readCloudState(config, async () => { backgroundReady.resolve(); return backgroundResponse.promise; });
  await backgroundReady.promise;
  missingResponse.resolve(json([]));
  backgroundResponse.resolve(json([{ state: createdByPeer, updated_at: version(2) }]));
  const [loaded] = await Promise.all([startup, background]);
  assert.deepEqual(writes, ["POST"], "a missing-row read authorizes insertion only, never replacement");
  assert.deepEqual(serverState.events[0].notes.map(note => note.id), ["peer"]);
  assert.deepEqual(loaded.events[0].notes.map(note => note.id), ["peer"], "startup adopts the winning row after the insertion conflict");
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function createFixture(suffix) {
  const spaceId = `personal-write-race-${suffix}`, spaceKey = "fixture-personal-space-key-long-enough";
  const config = { storage: { mode: "supabase", url: "https://fixture.supabase.co", anonKey: "fixture-key", table: "app_snapshots", spaceId, spaceKey,
    account: { userId: "writer", accessToken: "fixture-token", spaceId } } };
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  storage.setItem("settle-friends-account-session", JSON.stringify({ access_token: "fixture-token", refresh_token: "fixture-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "writer", user_metadata: { account_space_id: spaceId, account_space_key: spaceKey } } }));
  storage.setItem("settle-friends-cloud-space", spaceId);
  storage.setItem(`settle-friends-cloud-key:${spaceId}`, spaceKey);
  const original = { currentParticipantId: "account-writer", participants: [{ id: "account-writer", displayName: "Test Writer", kind: "user", accountLinked: true }],
    friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
    events: [{ id: "personal-event", name: "Private event", eventType: "standard", currency: "ILS", participantIds: ["account-writer"],
      adminIds: ["account-writer"], createdByParticipantId: "account-writer", notes: [], expenses: [], transfers: [] }] };
  storage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(original));
  return { config, storage, original, location: new URL("https://app.example.com/") };
}
function entries(state, collection) { return collection === "groups" ? state.groups : state.events[0][collection]; }
function item(collection, id, tick) {
  const common = { id, createdByParticipantId: "account-writer", createdAt: version(tick), updatedAt: version(tick) };
  if (collection === "groups") return { ...common, name: id, memberIds: ["account-writer"] };
  if (collection === "notes") return { ...common, title: id, body: id, pinned: false, updatedByParticipantId: "account-writer" };
  return { ...common, name: id, total: 100, payers: [{ participantId: "account-writer", amount: 100 }], sharedByParticipantIds: ["account-writer"] };
}
function version(tick) { return `2026-09-01T10:00:0${tick}.000Z`; }
function json(payload) { return { ok: true, status: 200, async json() { return payload; } }; }
