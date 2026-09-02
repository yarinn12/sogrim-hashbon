import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_PENDING_EVENT_JOIN_ATTEMPTS,
  PENDING_EVENT_JOINS_STORAGE_KEY,
  forgetPendingEventJoin,
  loadPendingEventJoins,
  markPendingEventJoinAttempt,
  pendingEventJoinRecoveryAction,
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

test("pending joins from another account cannot evict this account's recovery work", () => {
  const storage = memoryStorage();
  for (let index = 0; index < 25; index += 1) {
    rememberPendingEventJoin({
      ...receipt,
      eventId: `owner-a-event-${index}`
    }, storage);
  }
  for (let index = 0; index < 24; index += 1) {
    rememberPendingEventJoin({
      ...receipt,
      ownerUserId: "00000000-0000-4000-8000-000000000002",
      eventId: `owner-b-event-${index}`
    }, storage);
  }

  const ownerA = loadPendingEventJoins(storage, receipt.ownerUserId);
  const ownerB = loadPendingEventJoins(
    storage,
    "00000000-0000-4000-8000-000000000002"
  );
  assert.equal(ownerA.length, 24);
  assert.equal(ownerB.length, 24);
  assert.equal(ownerA.some((entry) => entry.eventId === "owner-a-event-0"), false);
  assert.equal(ownerA.some((entry) => entry.eventId === "owner-a-event-24"), true);
});

test("an interrupted redeemed invite is completed but a removed member is never resurrected", () => {
  const event = {
    participantIds: ["account-admin"],
    inactiveParticipantIds: [],
    membershipUpdatedAtByParticipant: {
      "account-admin": "2026-08-30T07:00:00.000Z"
    }
  };

  assert.equal(
    pendingEventJoinRecoveryAction(event, "account-joiner", 1),
    "complete"
  );
  assert.equal(
    pendingEventJoinRecoveryAction(
      {
        ...event,
        inactiveParticipantIds: ["account-joiner"],
        membershipUpdatedAtByParticipant: {
          ...event.membershipUpdatedAtByParticipant,
          "account-joiner": "2026-08-30T07:05:00.000Z"
        }
      },
      "account-joiner",
      1
    ),
    "forget"
  );
});

test("a missing redeemed event retries for a bounded number of recoveries", () => {
  assert.equal(pendingEventJoinRecoveryAction(null, "account-joiner", 1), "retry");
  assert.equal(
    pendingEventJoinRecoveryAction(
      null,
      "account-joiner",
      MAX_PENDING_EVENT_JOIN_ATTEMPTS
    ),
    "forget"
  );
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}
