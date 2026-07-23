import test from "node:test";
import assert from "node:assert/strict";

import {
  visibleEventsForParticipant,
  visibleGroupsForParticipant
} from "../src/domain/personalMemory.mjs";

const state = {
  currentParticipantId: "yarin",
  participants: [
    { id: "yarin", displayName: "Yarin Levy", kind: "user" },
    { id: "dani", displayName: "Dani Cohen", kind: "user" },
    { id: "guest", displayName: "Guest User", kind: "guest" }
  ],
  groups: [
    {
      id: "group-yarin",
      name: "Yarin friends",
      memberIds: ["yarin", "guest"],
      adminIds: ["yarin"],
      archived: false
    },
    {
      id: "group-dani",
      name: "Dani friends",
      memberIds: ["dani"],
      adminIds: ["dani"],
      archived: false
    },
    {
      id: "group-old",
      name: "Old group",
      memberIds: ["yarin"],
      adminIds: ["yarin"],
      archived: true
    }
  ],
  events: [
    {
      id: "event-yarin",
      name: "Yarin night",
      participantIds: ["yarin", "guest"],
      adminIds: ["yarin"],
      expenses: [],
      transfers: [],
      createdAt: "2026-05-24T10:00:00.000Z"
    },
    {
      id: "event-dani",
      name: "Dani night",
      participantIds: ["dani"],
      adminIds: ["dani"],
      expenses: [],
      transfers: [],
      createdAt: "2026-05-24T11:00:00.000Z"
    },
    {
      id: "event-admin",
      name: "Admin-only view",
      participantIds: ["guest"],
      adminIds: ["yarin"],
      expenses: [],
      transfers: [],
      createdAt: "2026-05-24T12:00:00.000Z"
    }
  ]
};

test("personal event memory only shows events connected to the current user", () => {
  assert.deepEqual(
    visibleEventsForParticipant(state, "yarin").map((event) => event.id),
    ["event-yarin", "event-admin"]
  );
});

test("personal group memory only shows active groups connected to the current user", () => {
  assert.deepEqual(
    visibleGroupsForParticipant(state, "yarin").map((group) => group.id),
    ["group-yarin"]
  );
});

test("missing local identity does not expose unrelated shared memory", () => {
  assert.deepEqual(visibleEventsForParticipant(state, "").map((event) => event.id), []);
  assert.deepEqual(visibleGroupsForParticipant(state, "").map((group) => group.id), []);
});
