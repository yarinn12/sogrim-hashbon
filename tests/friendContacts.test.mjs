import test from "node:test";
import assert from "node:assert/strict";

import {
  activeFriendParticipantIds,
  removeFriendContact,
  saveFriendContact,
  syncNetworkFriendContacts
} from "../src/domain/friendContacts.mjs";
import { participantCandidatesForParticipant } from "../src/domain/personalMemory.mjs";

const baseState = {
  currentParticipantId: "owner",
  participants: [
    { id: "owner", displayName: "Owner User", kind: "user" },
    { id: "offline", displayName: "Offline Friend", kind: "guest" },
    { id: "online", displayName: "Online Friend", kind: "member" },
    { id: "stranger", displayName: "Event Stranger", kind: "member" }
  ],
  friendContacts: [],
  groups: [],
  events: [
    {
      id: "shared-event",
      participantIds: ["owner", "stranger"],
      adminIds: ["stranger"],
      createdByParticipantId: "stranger",
      expenses: [],
      transfers: []
    }
  ]
};

test("offline names become friends only after an explicit personal save", () => {
  const nextState = saveFriendContact(
    baseState,
    "offline",
    "offline",
    "2026-07-26T10:00:00.000Z"
  );

  assert.deepEqual(activeFriendParticipantIds(nextState), ["offline"]);
  assert.deepEqual(activeFriendParticipantIds(baseState), []);
});

test("removing a saved name keeps the participant and event history intact", () => {
  const saved = saveFriendContact(baseState, "offline", "offline");
  const removed = removeFriendContact(
    saved,
    "offline",
    "2026-07-26T11:00:00.000Z"
  );

  assert.deepEqual(activeFriendParticipantIds(removed), []);
  assert.ok(removed.participants.some((participant) => participant.id === "offline"));
  assert.equal(removed.events[0].id, "shared-event");
});

test("accepted network friends sync without converting event participants into friends", () => {
  const synced = syncNetworkFriendContacts(
    baseState,
    ["online"],
    "2026-07-26T12:00:00.000Z"
  );

  assert.deepEqual(activeFriendParticipantIds(synced), ["online"]);
  assert.ok(!activeFriendParticipantIds(synced).includes("stranger"));
});

test("personal candidates include saved friends but exclude unrelated event members", () => {
  const state = syncNetworkFriendContacts(baseState, ["online"]);
  const candidateIds = participantCandidatesForParticipant(state, "owner")
    .map((participant) => participant.id);

  assert.ok(candidateIds.includes("owner"));
  assert.ok(candidateIds.includes("online"));
  assert.ok(!candidateIds.includes("stranger"));
});

