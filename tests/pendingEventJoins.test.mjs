import test from "node:test";
import assert from "node:assert/strict";

import {
  PENDING_EVENT_JOINS_STORAGE_KEY,
  forgetPendingEventJoin,
  loadPendingEventJoins,
  markPendingEventJoinAttempt,
  rememberPendingEventJoin
} from "../src/data/pendingEventJoins.mjs";

const receipt = {
  ownerUserId: "00000000-0000-4000-8000-000000000001",
  eventId: "event-join-recovery",
  queuedAt: "2026-08-30T07:00:00.000Z"
};

test("pending event joins are owner-scoped, deduplicated and retried safely", () => {
  const storage = memoryStorage();
  assert.equal(rememberPendingEventJoin(receipt, storage), true);
  assert.equal(rememberPendingEventJoin({ ...receipt, attempts: 4 }, storage), true);
  assert.equal(loadPendingEventJoins(storage).length, 1);
  assert.equal(loadPendingEventJoins(storage, receipt.ownerUserId)[0].attempts, 4);
  assert.deepEqual(loadPendingEventJoins(storage, "other-user"), []);

  assert.equal(
    markPendingEventJoinAttempt(receipt, storage, "2026-08-30T07:01:00.000Z"),
    true
  );
  const [attempted] = loadPendingEventJoins(storage);
  assert.equal(attempted.attempts, 5);
  assert.equal(attempted.lastAttemptAt, "2026-08-30T07:01:00.000Z");

  assert.equal(forgetPendingEventJoin(receipt, storage), true);
  assert.deepEqual(loadPendingEventJoins(storage), []);
  assert.equal(storage.getItem(PENDING_EVENT_JOINS_STORAGE_KEY), null);
});

test("malformed pending joins never block account startup", () => {
  const storage = memoryStorage();
  storage.setItem(PENDING_EVENT_JOINS_STORAGE_KEY, "not-json");
  assert.deepEqual(loadPendingEventJoins(storage), []);
  storage.setItem(PENDING_EVENT_JOINS_STORAGE_KEY, JSON.stringify([
    { ownerUserId: receipt.ownerUserId, eventId: "", queuedAt: receipt.queuedAt },
    { ...receipt, queuedAt: "not-a-date" }
  ]));
  assert.deepEqual(loadPendingEventJoins(storage), []);
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}
