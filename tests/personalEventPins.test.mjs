import test from "node:test";
import assert from "node:assert/strict";
import { personalEventPinsKey, loadPersonalEventPins, setPersonalEventPin, pinnedEventIdsForState, migrateLegacyAccountPins, updateAccountEventPin, pinnedEventsFirst } from "../src/data/personalEventPins.mjs";
import { mergeSharedStates } from "../src/domain/sharedStateMerge.mjs";
import { saveCloudStateWithConflictRetry } from "../src/data/cloudConflictRetry.mjs";

function storageFixture() {
  const values = new Map(), writes = [];
  return { values, writes, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes.push({ key, value }); values.set(key, value); } };
}

test("consecutive pin changes persist all selected events and unpin only its target", () => {
  const storage = storageFixture();
  setPersonalEventPin("alice", "old", true, storage);
  setPersonalEventPin("alice", "closed", true, storage);
  setPersonalEventPin("alice", "old", true, storage);
  setPersonalEventPin("alice", "old", false, storage);
  assert.deepEqual([...loadPersonalEventPins("alice", storage)], ["closed"]);
  assert.deepEqual(JSON.parse(storage.writes.at(-1).value), ["closed"]);
  assert.equal(storage.writes.at(-1).key, personalEventPinsKey("alice"));
});

test("pins are isolated by participant when accounts change on the same device", () => {
  const storage = storageFixture();
  setPersonalEventPin("account-alice", "shared-event", true, storage);
  assert.deepEqual([...loadPersonalEventPins("account-bob", storage)], []);
  setPersonalEventPin("account-bob", "different-event", true, storage);
  assert.deepEqual([...loadPersonalEventPins("account-alice", storage)], ["shared-event"]);
  assert.deepEqual([...loadPersonalEventPins("account-bob", storage)], ["different-event"]);
});

test("pin sorting preserves the existing relevance order in each group without mutating events", () => {
  const events = [{ id: "new" }, { id: "old" }, { id: "closed" }];
  const before = structuredClone(events);
  assert.deepEqual(pinnedEventsFirst(events, new Set(["closed", "old"])).map(event => event.id), ["old", "closed", "new"]);
  assert.deepEqual(pinnedEventsFirst(events, new Set()).map(event => event.id), ["new", "old", "closed"]);
  assert.deepEqual(events, before);
  assert.notEqual(pinnedEventsFirst(events, new Set()), events);
});

test("stale pins cannot introduce deleted, archived or inaccessible events into a filtered list", () => {
  assert.deepEqual(pinnedEventsFirst([{ id: "visible" }], new Set(["deleted", "archived", "other-account"])), [{ id: "visible" }]);
  assert.deepEqual(pinnedEventsFirst([], new Set(["deleted"])), []);
});

test("corrupt preferences and non-string ids are safely normalized", () => {
  const storage = storageFixture();
  for (const raw of ["{broken", "null", "{}", "42", '"event-id"']) {
    storage.values.set(personalEventPinsKey("alice"), raw);
    assert.deepEqual([...loadPersonalEventPins("alice", storage)], []);
  }
  storage.values.set(personalEventPinsKey("alice"), JSON.stringify(["old", "old", "  closed ", "", null, 1, {}]));
  assert.deepEqual([...loadPersonalEventPins("alice", storage)], ["old", "closed"]);
  setPersonalEventPin("alice", "new", true, storage);
  assert.deepEqual(JSON.parse(storage.writes.at(-1).value), ["old", "closed", "new"]);
});

test("each change reads current storage so a stale tab cannot discard another tab's pin", () => {
  const storage = storageFixture();
  const stale = loadPersonalEventPins("alice", storage);
  setPersonalEventPin("alice", "first", true, storage);
  assert.equal(stale.size, 0);
  setPersonalEventPin("alice", "second", true, storage);
  assert.deepEqual([...loadPersonalEventPins("alice", storage)], ["first", "second"]);
});

test("a rejected write is reported and leaves the previous persisted pins intact", () => {
  const storage = storageFixture();
  setPersonalEventPin("alice", "first", true, storage);
  const write = storage.setItem;
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.throws(() => setPersonalEventPin("alice", "second", true, storage), /QuotaExceededError/);
  assert.deepEqual([...loadPersonalEventPins("alice", storage)], ["first"]);
  storage.setItem = write;
  setPersonalEventPin("alice", "second", true, storage);
  assert.deepEqual([...loadPersonalEventPins("alice", storage)], ["first", "second"]);
});

test("read failures render safely but cannot overwrite unknown saved preferences", () => {
  const writes = [];
  const storage = { getItem() { throw new Error("SecurityError"); }, setItem: (...args) => writes.push(args) };
  assert.deepEqual([...loadPersonalEventPins("alice", storage)], []);
  assert.throws(() => setPersonalEventPin("alice", "event", true, storage), /SecurityError/);
  assert.deepEqual(writes, []);
});

test("missing participant or event identity never writes a shared anonymous preference", () => {
  const storage = storageFixture();
  assert.equal(personalEventPinsKey(" "), "");
  assert.deepEqual([...loadPersonalEventPins(null, storage)], []);
  for (const [participantId, eventId] of [["", "event"], [null, "event"], ["alice", ""], ["alice", null]]) {
    assert.throws(() => setPersonalEventPin(participantId, eventId, true, storage), /identity/i);
  }
  assert.deepEqual(storage.writes, []);
});

test("two account devices merge pin and unpin records without changing another account", () => {
  const firstStorage = storageFixture();
  const secondStorage = storageFixture();
  const base = { currentParticipantId: "account-alice", participants: [], events: [] };
  const first = updateAccountEventPin(base, "trip", true, firstStorage, 1000);
  const second = updateAccountEventPin(base, "dinner", true, secondStorage, 2000);
  const combined = mergeSharedStates(first, second);
  assert.deepEqual([...pinnedEventIdsForState(combined)].sort(), ["dinner", "trip"]);

  const unpinned = updateAccountEventPin(combined, "trip", false, firstStorage, 3000);
  const staleReplica = mergeSharedStates(unpinned, first);
  assert.deepEqual([...pinnedEventIdsForState(staleReplica)], ["dinner"]);
  assert.equal(staleReplica.personalEventPinPreferences.updates.trip.pinned, false);

  const otherAccount = { currentParticipantId: "account-bob", participants: [], events: [] };
  const isolated = mergeSharedStates(unpinned, otherAccount);
  assert.equal(isolated.personalEventPinPreferences, undefined);
  assert.deepEqual([...pinnedEventIdsForState(isolated, secondStorage)], []);
});

test("conflict retry sends and acknowledges the final per-account pin payload", async () => {
  const storage = storageFixture();
  const base = { currentParticipantId: "account-alice", participants: [], events: [] };
  const remote = updateAccountEventPin(base, "remote", true, storage, 1000);
  const local = updateAccountEventPin(base, "offline", true, storage, 2000);
  let attempts = 0;
  let finalWrite;
  const result = await saveCloudStateWithConflictRetry({
    state: local,
    loadLatest: async () => remote,
    save: async (candidate) => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("conflict"), { code: "CLOUD_STATE_CONFLICT" });
      finalWrite = structuredClone(candidate);
    },
    retryDelay: () => 0
  });
  assert.equal(attempts, 2);
  assert.deepEqual([...pinnedEventIdsForState(finalWrite)].sort(), ["offline", "remote"]);
  assert.deepEqual(result.state.personalEventPinPreferences, finalWrite.personalEventPinPreferences);
  assert.equal(result.conflictCount, 1);
});

test("legacy local pins migrate only when the authenticated snapshot has no synced preferences", () => {
  const storage = storageFixture();
  setPersonalEventPin("account-alice", "legacy", true, storage);
  const base = { currentParticipantId: "account-alice", participants: [], events: [] };
  assert.deepEqual([...pinnedEventIdsForState(base, storage)], ["legacy"]);
  const migrated = migrateLegacyAccountPins(base, storage);
  assert.deepEqual([...pinnedEventIdsForState(migrated, storage)], ["legacy"]);
  assert.equal(migrateLegacyAccountPins(migrated, storage), migrated);
  const updated = updateAccountEventPin(base, "new", true, storage, 2000);
  assert.deepEqual([...pinnedEventIdsForState(updated, storage)].sort(), ["legacy", "new"]);
  const remoteUnpin = updateAccountEventPin(base, "legacy", false, storage, 3000);
  assert.deepEqual([...pinnedEventIdsForState(mergeSharedStates(remoteUnpin, updated))], ["new"]);
});

test("unreadable legacy pins cannot be silently replaced by an empty account preference", () => {
  const storage = { getItem() { throw new Error("SecurityError"); } };
  const base = { currentParticipantId: "account-alice", participants: [], events: [] };
  assert.throws(() => migrateLegacyAccountPins(base, storage), /SecurityError/);
  assert.throws(() => updateAccountEventPin(base, "event", true, storage, 1000), /SecurityError/);
  assert.equal(base.personalEventPinPreferences, undefined);
});
