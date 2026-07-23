import test from "node:test";
import assert from "node:assert/strict";

import {
  PENDING_INVITE_URL_STORAGE_KEY,
  clearPendingInviteUrl,
  pendingInviteUrl,
  rememberPendingInviteUrl
} from "../src/data/pendingInvite.mjs";
import {
  buildEventInviteSnapshot,
  buildEventInviteUrl
} from "../src/domain/inviteLinks.mjs";

const state = {
  currentParticipantId: "person-1",
  participants: [{ id: "person-1", displayName: "Test User", kind: "user" }],
  groups: [],
  events: [{
    id: "event-1",
    name: "Dinner",
    participantIds: ["person-1"],
    adminIds: ["person-1"],
    expenses: [],
    transfers: []
  }]
};

test("pending invite survives address cleanup during account login", () => {
  const storage = memoryStorage();
  const invite = buildEventInviteUrl(
    "https://app.example.com/",
    "event-1",
    buildEventInviteSnapshot(state, "event-1"),
    {
      spaceId: "space-event-one",
      spaceKey: "abcdefghijklmnopqrstuvwxyzABCDEF"
    }
  );

  assert.equal(rememberPendingInviteUrl(invite, storage), invite);
  assert.equal(
    pendingInviteUrl("https://app.example.com/?event=event-1", storage),
    invite
  );
  assert.equal(storage.getItem(PENDING_INVITE_URL_STORAGE_KEY), invite);
});

test("compact QR invite with cloud credentials is remembered without a snapshot", () => {
  const storage = memoryStorage();
  const invite = "https://app.example.com/i/event-1/space-event-one/abcdefghijklmnopqrstuvwxyzABCDEF";

  assert.equal(rememberPendingInviteUrl(invite, storage), invite);
  assert.equal(pendingInviteUrl("https://app.example.com/?event=event-1", storage), invite);
});

test("event-only links are not treated as reusable invite credentials", () => {
  const storage = memoryStorage();
  const eventOnly = "https://app.example.com/?event=event-1";

  assert.equal(rememberPendingInviteUrl(eventOnly, storage), null);
  assert.equal(pendingInviteUrl(eventOnly, storage), eventOnly);
  assert.equal(storage.getItem(PENDING_INVITE_URL_STORAGE_KEY), null);
});

test("pending invite is removed after it joins the account", () => {
  const storage = memoryStorage();
  storage.setItem(PENDING_INVITE_URL_STORAGE_KEY, "invite");

  clearPendingInviteUrl(storage);

  assert.equal(storage.getItem(PENDING_INVITE_URL_STORAGE_KEY), null);
});

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
