import test from "node:test";
import assert from "node:assert/strict";

import {
  PENDING_INVITE_HANDOFF_STORAGE_KEY,
  PENDING_INVITE_HANDOFF_TTL_MS,
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

test("revocable token invite is remembered through account sign-in", () => {
  const storage = memoryStorage();
  const invite = buildEventInviteUrl(
    "https://app.example.com/",
    "event-1",
    null,
    {
      inviteToken: "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456"
    }
  );

  assert.equal(rememberPendingInviteUrl(invite, storage), invite);
  assert.equal(
    pendingInviteUrl("https://app.example.com/?event=event-1", storage),
    invite
  );
});

test("a stored invite from the retired host is migrated before reuse", () => {
  const storage = memoryStorage();
  const token = "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456";
  const legacyInvite = `https://sogrim-hashbon.vercel.app/i/event-1/t/${token}`;
  storage.setItem(PENDING_INVITE_URL_STORAGE_KEY, legacyInvite);

  assert.equal(
    pendingInviteUrl("https://sogrim-hesbon-app.vercel.app/", storage),
    `https://sogrim-hesbon-app.vercel.app/i/event-1/t/${token}`
  );
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
  const durableStorage = memoryStorage();
  storage.setItem(PENDING_INVITE_URL_STORAGE_KEY, "invite");
  durableStorage.setItem(PENDING_INVITE_HANDOFF_STORAGE_KEY, "handoff");

  clearPendingInviteUrl(storage, durableStorage);

  assert.equal(storage.getItem(PENDING_INVITE_URL_STORAGE_KEY), null);
  assert.equal(durableStorage.getItem(PENDING_INVITE_HANDOFF_STORAGE_KEY), null);
});

test("a new registration tab recovers the event invite handoff", () => {
  const firstTab = memoryStorage();
  const registrationTab = memoryStorage();
  const durableStorage = memoryStorage();
  const invite = buildEventInviteUrl(
    "https://app.example.com/",
    "event-1",
    null,
    {
      inviteToken: "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456"
    }
  );

  rememberPendingInviteUrl(invite, firstTab, durableStorage, 1_000);

  assert.equal(
    pendingInviteUrl(
      "https://app.example.com/",
      registrationTab,
      durableStorage,
      2_000
    ),
    invite
  );
  assert.equal(
    registrationTab.getItem(PENDING_INVITE_URL_STORAGE_KEY),
    invite
  );
});

test("an invite remembered by the previous release is promoted for registration handoff", () => {
  const sessionStorage = memoryStorage();
  const durableStorage = memoryStorage();
  const invite = buildEventInviteUrl(
    "https://app.example.com/",
    "event-1",
    null,
    {
      inviteToken: "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456"
    }
  );
  sessionStorage.setItem(PENDING_INVITE_URL_STORAGE_KEY, invite);

  assert.equal(
    pendingInviteUrl(
      "https://app.example.com/",
      sessionStorage,
      durableStorage,
      3_000
    ),
    invite
  );
  assert.equal(
    JSON.parse(
      durableStorage.getItem(PENDING_INVITE_HANDOFF_STORAGE_KEY)
    ).inviteUrl,
    invite
  );
});

test("an abandoned invite handoff expires instead of reaching another account", () => {
  const firstTab = memoryStorage();
  const laterTab = memoryStorage();
  const durableStorage = memoryStorage();
  const invite = buildEventInviteUrl(
    "https://app.example.com/",
    "event-1",
    null,
    {
      inviteToken: "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456"
    }
  );

  rememberPendingInviteUrl(invite, firstTab, durableStorage, 1_000);

  assert.equal(
    pendingInviteUrl(
      "https://app.example.com/",
      laterTab,
      durableStorage,
      1_000 + PENDING_INVITE_HANDOFF_TTL_MS + 1
    ),
    "https://app.example.com/"
  );
  assert.equal(durableStorage.getItem(PENDING_INVITE_HANDOFF_STORAGE_KEY), null);
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
