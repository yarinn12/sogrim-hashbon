import test from "node:test";
import assert from "node:assert/strict";

import {
  PENDING_ACCOUNT_LINKS_STORAGE_KEY,
  accountLinkIsConfirmed,
  forgetPendingAccountLink,
  loadPendingAccountLinks,
  markPendingAccountLinkAttempt,
  rememberPendingAccountLink
} from "../src/data/pendingAccountLinks.mjs";

const receipt = {
  ownerUserId: "00000000-0000-4000-8000-000000000001",
  eventId: "event-account-link",
  sourceParticipantId: "guest-maor",
  targetParticipantId: "account-00000000-0000-4000-8000-000000000002",
  linkedAt: "2026-08-26T20:00:00.000Z",
  queuedAt: "2026-08-26T20:00:01.000Z",
  attempts: 0,
  lastAttemptAt: ""
};

test("account link confirmation requires the durable marker and complete event remap", () => {
  const sharedState = confirmedState();
  assert.equal(accountLinkIsConfirmed(sharedState, receipt), true);

  sharedState.events[0].expenses[0].payers[0].participantId =
    receipt.sourceParticipantId;
  assert.equal(accountLinkIsConfirmed(sharedState, receipt), false);
});

test("pending account links are owner-scoped, deduplicated and survive retries", () => {
  const storage = memoryStorage();
  assert.equal(rememberPendingAccountLink(receipt, storage), true);
  assert.equal(rememberPendingAccountLink({ ...receipt, attempts: 7 }, storage), true);
  assert.equal(loadPendingAccountLinks(storage).length, 1);
  assert.equal(loadPendingAccountLinks(storage, receipt.ownerUserId)[0].attempts, 7);
  assert.deepEqual(loadPendingAccountLinks(storage, "another-user"), []);

  markPendingAccountLinkAttempt(receipt, storage, "2026-08-26T20:01:00.000Z");
  const [attempted] = loadPendingAccountLinks(storage);
  assert.equal(attempted.attempts, 8);
  assert.equal(attempted.lastAttemptAt, "2026-08-26T20:01:00.000Z");

  assert.equal(forgetPendingAccountLink(receipt, storage), true);
  assert.deepEqual(loadPendingAccountLinks(storage), []);
  assert.equal(storage.getItem(PENDING_ACCOUNT_LINKS_STORAGE_KEY), null);
});

test("malformed pending account-link data is ignored instead of blocking startup", () => {
  const storage = memoryStorage();
  storage.setItem(PENDING_ACCOUNT_LINKS_STORAGE_KEY, "not-json");
  assert.deepEqual(loadPendingAccountLinks(storage), []);
  storage.setItem(PENDING_ACCOUNT_LINKS_STORAGE_KEY, JSON.stringify([
    { ...receipt, linkedAt: "not-a-date" },
    { ...receipt, sourceParticipantId: receipt.targetParticipantId }
  ]));
  assert.deepEqual(loadPendingAccountLinks(storage), []);
});

test("pending links from another account cannot evict this account's recovery work", () => {
  const storage = memoryStorage();
  for (let index = 0; index < 25; index += 1) {
    rememberPendingAccountLink({
      ...receipt,
      eventId: `owner-a-event-${index}`
    }, storage);
  }
  for (let index = 0; index < 24; index += 1) {
    rememberPendingAccountLink({
      ...receipt,
      ownerUserId: "00000000-0000-4000-8000-000000000002",
      eventId: `owner-b-event-${index}`
    }, storage);
  }

  const ownerA = loadPendingAccountLinks(storage, receipt.ownerUserId);
  const ownerB = loadPendingAccountLinks(
    storage,
    "00000000-0000-4000-8000-000000000002"
  );
  assert.equal(ownerA.length, 24);
  assert.equal(ownerB.length, 24);
  assert.equal(ownerA.some((entry) => entry.eventId === "owner-a-event-0"), false);
  assert.equal(ownerA.some((entry) => entry.eventId === "owner-a-event-24"), true);
});

function confirmedState() {
  return {
    events: [{
      id: receipt.eventId,
      participantIds: [receipt.targetParticipantId],
      inactiveParticipantIds: [],
      adminIds: [receipt.targetParticipantId],
      createdByParticipantId: receipt.targetParticipantId,
      membershipUpdatedAtByParticipant: {
        [receipt.sourceParticipantId]: receipt.linkedAt,
        [receipt.targetParticipantId]: receipt.linkedAt
      },
      participantAliases: {},
      participantAccountLinks: [{
        sourceParticipantId: receipt.sourceParticipantId,
        targetParticipantId: receipt.targetParticipantId,
        linkedByParticipantId: `account-${receipt.ownerUserId}`,
        linkedAt: receipt.linkedAt
      }],
      expenses: [{
        createdByParticipantId: receipt.targetParticipantId,
        sharedByParticipantIds: [receipt.targetParticipantId],
        payers: [{ participantId: receipt.targetParticipantId }]
      }],
      transfers: [],
      transferStatusUpdates: [],
      activityLog: []
    }]
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
