import assert from "node:assert/strict";
import test from "node:test";
import { CloudStateConflictError, readCloudState, readCloudSnapshot, saveCloudState } from "../src/data/cloudStore.mjs";
import { buildSharedEventState, saveSharedEventState, saveSharedEventDeletion, syncSharedEvents } from "../src/data/sharedEventStore.mjs";

for (const batch of [false, true]) {
  test(`peer event deletion during CAS is adopted by ${batch ? "the full event batch" : "the individual save"} without another write`, async () => {
    const fixture = createFixture(`delete-conflict-${batch}`);
    const local = structuredClone(fixture.state);
    local.events[0].notes.push(item("notes", "offline-note", 1));
    let canonical = buildSharedEventState(fixture.state, "event"), token = version(0);
    const writes = [];
    const transport = async (url, options = {}) => {
      if (new URL(url).pathname.endsWith("/rpc/update_shared_event_snapshot")) {
        const body = JSON.parse(options.body);
        writes.push(body);
        assert.equal(writes.length, 1, "a confirmed peer deletion must not be overwritten");
        canonical = { currentParticipantId: "", participants: [], groups: [], events: [],
          deletedEvents: [{ id: "event", deletedAt: version(3) }] };
        token = version(3);
        return json({ status: "conflict", updatedAt: token });
      }
      return json([{ state: structuredClone(canonical), updated_at: token }]);
    };
    const result = batch ? await syncSharedEvents(fixture.config, local, transport)
      : await saveSharedEventState(fixture.config, local, "event", transport);
    assert.deepEqual(result.events, []);
    assert.equal(result.currentParticipantId, local.currentParticipantId);
    assert.deepEqual(result.deletedEvents, [{ id: "event", deletedAt: version(3),
      sharedSpaceId: fixture.sharedConfig.storage.spaceId, sharedSpaceKey: fixture.sharedConfig.storage.spaceKey }]);
    assert.equal(writes.length, 1);
    assert.deepEqual(canonical.events, []);
  });
}

for (const collection of ["notes", "expenses"]) {
  for (const raceAtRead of [1, 2]) {
    test(`${collection} from a peer survive a background read racing ${raceAtRead === 1 ? "the initial save" : "conflict recovery"}`, async () => {
      const fixture = createFixture(`${collection}-${raceAtRead}`);
      const local = structuredClone(fixture.state);
      local.events[0][collection].push(item(collection, "local", 1));
      let serverState = buildSharedEventState(fixture.state, "event");
      let serverVersion = version(0), reads = 0;
      const writes = [];
      const paused = deferred(), foregroundResponse = deferred(), backgroundResponse = deferred(), backgroundStarted = deferred();
      const save = saveSharedEventState(fixture.config, local, "event", async (url, options = {}) => {
        if (new URL(url).pathname.endsWith("/rpc/update_shared_event_snapshot")) {
          const request = JSON.parse(options.body);
          writes.push(request);
          if (raceAtRead === 2 && writes.length === 1) {
            serverState.events[0][collection].push(item(collection, "peer-before-retry", 2));
            serverVersion = version(2);
          }
          if (request.p_expected_updated_at !== serverVersion) return json({ status: "conflict", updatedAt: serverVersion });
          serverState = structuredClone(request.p_state);
          serverVersion = version(5);
          return json({ status: "updated", updatedAt: serverVersion });
        }
        assert.equal(new URL(url).searchParams.get("select"), "state,updated_at");
        const response = json([{ state: structuredClone(serverState), updated_at: serverVersion }]);
        if (++reads === raceAtRead) {
          paused.resolve(response);
          return foregroundResponse.promise;
        }
        return response;
      });
      const captured = await paused.promise;
      serverState.events[0][collection].push(item(collection, "peer-during-read", 3));
      serverVersion = version(3);
      const background = readCloudState(fixture.sharedConfig, async () => {
        backgroundStarted.resolve();
        return backgroundResponse.promise;
      });
      await backgroundStarted.promise;
      foregroundResponse.resolve(captured);
      backgroundResponse.resolve(json([{ state: structuredClone(serverState), updated_at: serverVersion }]));
      const [result] = await Promise.all([save, background]);
      assert.equal(writes[raceAtRead - 1].p_expected_updated_at, version(raceAtRead === 1 ? 0 : 2), "use the version paired with the candidate's source payload, never a background read's version");
      const expectedIds = ["local", "peer-during-read", ...(raceAtRead === 2 ? ["peer-before-retry"] : [])].sort();
      for (const state of [serverState, result]) {
        assert.deepEqual(state.events[0][collection].map(entry => entry.id).sort(), expectedIds);
      }
      assert.equal(writes.length, raceAtRead + 1, "the conflicting save must reload and merge exactly once");
      assert.equal(reads, raceAtRead + 1, "no extra full reads are needed outside actual conflicts");
    });
  }
}

test("deleting a shared event pins its own source version through a background-read race", async () => {
  const fixture = createFixture("deletion");
  let serverState = buildSharedEventState(fixture.state, "event");
  let serverVersion = version(0), reads = 0;
  const writes = [], started = deferred(), response = deferred(), backgroundStarted = deferred(), backgroundResponse = deferred();
  const deletion = { id: "event", sharedSpaceId: fixture.sharedConfig.storage.spaceId,
    sharedSpaceKey: fixture.sharedConfig.storage.spaceKey, deletedAt: version(4) };
  const pending = saveSharedEventDeletion(fixture.config, deletion, async (url, options = {}) => {
    if (new URL(url).pathname.endsWith("/rpc/update_shared_event_snapshot")) {
      const request = JSON.parse(options.body);
      writes.push(request);
      if (request.p_expected_updated_at !== serverVersion) return json({ status: "conflict" });
      serverState = structuredClone(request.p_state);
      serverVersion = version(5);
      return json({ status: "updated", updatedAt: serverVersion });
    }
    if (++reads === 1) { started.resolve(); return response.promise; }
    return json([{ state: structuredClone(serverState), updated_at: serverVersion }]);
  });
  await started.promise;
  const captured = structuredClone(serverState);
  serverState.events[0].expenses.push(item("expenses", "peer", 3));
  serverVersion = version(3);
  const background = readCloudState(fixture.sharedConfig, async () => {
    backgroundStarted.resolve(); return backgroundResponse.promise;
  });
  await backgroundStarted.promise;
  response.resolve(json([{ state: captured, updated_at: version(0) }]));
  backgroundResponse.resolve(json([{ state: structuredClone(serverState), updated_at: serverVersion }]));
  const [deleted] = await Promise.all([pending, background]);
  assert.equal(deleted, true);
  assert.deepEqual(writes.map(write => write.p_expected_updated_at), [version(0), version(3)]);
  assert.deepEqual(serverState.events, []);
  assert.deepEqual(serverState.deletedEvents.map(event => event.id), ["event"]);
});

test("an explicit missing write version never borrows an unrelated cached version", async () => {
  const fixture = createFixture("missing-version");
  const snapshot = await readCloudSnapshot(fixture.sharedConfig, async () => json([{ state: originalState(), updated_at: version(0) }]));
  assert.equal(snapshot.version, version(0));
  let contacted = false;
  await assert.rejects(saveCloudState(fixture.sharedConfig, snapshot.state, async () => { contacted = true; }, { expectedVersion: "" }), CloudStateConflictError);
  assert.equal(contacted, false);
});

test("an unchanged shared event saves with exactly one read and one write", async () => {
  const fixture = createFixture("no-race");
  const local = structuredClone(fixture.state);
  local.events[0].notes.push(item("notes", "local", 1));
  const methods = [];
  const result = await saveSharedEventState(fixture.config, local, "event", async (url, options = {}) => {
    methods.push(options.method ?? "GET");
    if (options.method === "POST") {
      assert.equal(JSON.parse(options.body).p_expected_updated_at, version(0));
      return json({ status: "updated", updatedAt: version(2) });
    }
    return json([{ state: buildSharedEventState(fixture.state, "event"), updated_at: version(0) }]);
  });
  assert.deepEqual(methods, ["GET", "POST"]);
  assert.deepEqual(result.events[0].notes.map(note => note.id), ["local"]);
});

function originalState() { return { events: [], participants: [], groups: [] }; }

function createFixture(suffix) {
  const sharedId = `shared-write-race-${suffix}`;
  const sharedKey = "fixture-shared-write-key-long-enough";
  const config = { storage: { mode: "supabase", url: "https://fixture.supabase.co", anonKey: "fixture-key", table: "app_snapshots",
    account: { userId: "writer", accessToken: "fixture-token", spaceId: "personal-writer" } } };
  const state = { currentParticipantId: "account-writer", participants: [{ id: "account-writer", displayName: "Test Writer", kind: "user" }], groups: [],
    events: [{ id: "event", name: "Test event", eventType: "standard", currency: "ILS", participantIds: ["account-writer"], adminIds: ["account-writer"],
      createdByParticipantId: "account-writer", sharedSpaceId: sharedId, sharedSpaceKey: sharedKey, notes: [], expenses: [], transfers: [] }] };
  return { config, state, sharedConfig: { storage: { ...config.storage, spaceId: sharedId, spaceKey: sharedKey, snapshotKind: "shared_event" } } };
}
function item(collection, id, tick) {
  const common = { id, createdByParticipantId: "account-writer", createdAt: version(tick), updatedAt: version(tick) };
  return collection === "notes"
    ? { ...common, title: id, body: id, pinned: false, updatedByParticipantId: "account-writer" }
    : { ...common, name: id, total: 100, payers: [{ participantId: "account-writer", amount: 100 }], sharedByParticipantIds: ["account-writer"] };
}
function version(tick) { return `2026-09-01T10:00:0${tick}.000Z`; }
function json(payload) { return { ok: true, status: 200, async json() { return payload; } }; }
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
