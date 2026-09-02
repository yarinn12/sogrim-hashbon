import test from "node:test";
import assert from "node:assert/strict";

import { demoState } from "../src/data/demoData.mjs";
import { cleanLegacyStarterData } from "../src/data/localStore.mjs";

test("starter state opens without invented people, groups, or events", () => {
  assert.deepEqual(demoState, {
    currentParticipantId: "",
    participants: [],
    friendContacts: [],
    groups: [],
    events: [],
    deletedEvents: []
  });
});

test("legacy starter data is removed from existing browsers", () => {
  const state = cleanLegacyStarterData({
    currentParticipantId: "yarin",
    participants: [
      { id: "yarin", displayName: "ירין", kind: "user" },
      { id: "dani", displayName: "דני", kind: "user" },
      { id: "avi", displayName: "אבי", kind: "user" },
      { id: "maor", displayName: "מאור", kind: "guest" }
    ],
    groups: [
      {
        id: "thursday",
        name: "חברים מחמישי",
        memberIds: ["yarin", "dani", "avi", "maor"],
        adminIds: ["yarin"],
        archived: false
      }
    ],
    events: [
      {
        id: "event-demo",
        name: "יציאה חמישי",
        participantIds: ["yarin", "dani", "avi", "maor"],
        expenses: [],
        transfers: [],
        adminIds: ["yarin"],
        createdByParticipantId: "yarin",
        createdAt: "2026-05-23T00:00:00.000Z"
      }
    ]
  });

  assert.deepEqual(state, {
    currentParticipantId: "",
    participants: [],
    groups: [],
    events: []
  });
});

test("legacy cleanup keeps a real saved local profile", () => {
  const state = cleanLegacyStarterData(
    {
      currentParticipantId: "yarin",
      participants: [{ id: "yarin", displayName: "ירין", kind: "user" }],
      groups: [],
      events: []
    },
    "yarin"
  );

  assert.deepEqual(state.participants, [
    { id: "yarin", displayName: "ירין", kind: "user" }
  ]);
  assert.equal(state.currentParticipantId, "yarin");
});

test("legacy cleanup restores a standalone event owner without reactivating shared memberships", () => {
  const baseEvent = {
    id: "legacy-event",
    participantIds: ["friend"],
    adminIds: ["owner"],
    createdByParticipantId: "owner",
    expenses: [],
    transfers: []
  };
  const state = {
    currentParticipantId: "owner",
    participants: [
      { id: "owner", displayName: "Owner", kind: "user" },
      { id: "friend", displayName: "Friend", kind: "user" }
    ],
    groups: [],
    events: [baseEvent, { ...baseEvent, id: "shared-event", sharedSpaceId: "space-event" }]
  };

  const cleaned = cleanLegacyStarterData(state, "owner");
  assert.deepEqual(cleaned.events[0].participantIds, ["owner", "friend"]);
  assert.deepEqual(
    cleaned.events[1].participantIds,
    ["friend"],
    "shared-event membership is controlled by the canonical server record"
  );
  assert.deepEqual(state.events[0].participantIds, ["friend"]);
});
