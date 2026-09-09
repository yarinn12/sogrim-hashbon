import test from "node:test";
import assert from "node:assert/strict";
import { personalEventPinsKey, loadPersonalEventPins, setPersonalEventPin, pinnedEventsFirst } from "../src/data/personalEventPins.mjs";

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
