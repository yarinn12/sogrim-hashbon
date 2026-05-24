import test from "node:test";
import assert from "node:assert/strict";

import {
  archiveGroup,
  canRemoveParticipant,
  createGroup,
  duplicateEvent,
  joinGuestToEvent,
  removeParticipant,
  removeExpense,
  updateTransferStatus,
  switchCurrentParticipant,
  updateGroup,
  updateExpense
} from "../src/domain/appActions.mjs";

function baseState() {
  return {
    currentParticipantId: "owner",
    participants: [
      { id: "owner", displayName: "Owner", kind: "user" },
      { id: "dani", displayName: "Dani", kind: "user" },
      { id: "avi", displayName: "Avi", kind: "user" }
    ],
    groups: [],
    events: [
      {
        id: "event-1",
        name: "Night out",
        groupId: undefined,
        participantIds: ["owner", "dani", "avi"],
        expenses: [
          {
            id: "expense-1",
            name: "Taxi",
            total: 9000,
            payers: [{ participantId: "owner", amount: 9000 }],
            sharedByParticipantIds: ["owner", "dani", "avi"],
            createdByParticipantId: "owner",
            updatedAt: "2026-05-23T00:00:00.000Z"
          }
        ],
        transfers: [
          {
            id: "transfer-dani-owner-3000",
            fromParticipantId: "dani",
            toParticipantId: "owner",
            amount: 3000,
            status: "pending"
          }
        ],
        adminsCanEditOnly: false,
        locked: false,
        createdAt: "2026-05-23T00:00:00.000Z"
      }
    ]
  };
}

test("createGroup adds the creator as admin and member", () => {
  const state = createGroup(baseState(), {
    id: "group-1",
    name: "Thursday friends",
    memberIds: ["dani", "avi"],
    adminId: "owner"
  });

  assert.deepEqual(state.groups, [
    {
      id: "group-1",
      name: "Thursday friends",
      memberIds: ["owner", "dani", "avi"],
      adminIds: ["owner"],
      archived: false
    }
  ]);
});

test("archiveGroup hides a group without deleting historical events", () => {
  const state = createGroup(baseState(), {
    id: "group-1",
    name: "Thursday friends",
    memberIds: ["owner", "dani"],
    adminId: "owner"
  });
  state.events[0].groupId = "group-1";

  const archived = archiveGroup(state, "group-1");

  assert.equal(archived.groups[0].archived, true);
  assert.equal(archived.events[0].groupId, "group-1");
});

test("updateGroup renames a group and keeps selected admins as members", () => {
  const state = createGroup(baseState(), {
    id: "group-1",
    name: "Thursday friends",
    memberIds: ["owner", "dani", "avi"],
    adminId: "owner"
  });

  const updated = updateGroup(state, "group-1", {
    name: "Friday friends",
    memberIds: ["avi"],
    adminIds: ["dani"]
  });

  assert.deepEqual(updated.groups[0], {
    id: "group-1",
    name: "Friday friends",
    memberIds: ["dani", "avi"],
    adminIds: ["dani"],
    archived: false
  });
});

test("updateGroup falls back to a remaining member when admins are cleared", () => {
  const state = createGroup(baseState(), {
    id: "group-1",
    name: "Thursday friends",
    memberIds: ["owner", "dani", "avi"],
    adminId: "owner"
  });

  const updated = updateGroup(state, "group-1", {
    name: " ",
    memberIds: ["avi"],
    adminIds: []
  });

  assert.deepEqual(updated.groups[0], {
    id: "group-1",
    name: "Thursday friends",
    memberIds: ["avi"],
    adminIds: ["avi"],
    archived: false
  });
});

test("removeExpense removes stale settlement transfers", () => {
  const state = removeExpense(baseState(), "event-1", "expense-1");

  assert.equal(state.events[0].expenses.length, 0);
  assert.deepEqual(state.events[0].transfers, []);
});

test("updateExpense replaces one expense and clears stale settlement transfers", () => {
  const state = updateExpense(baseState(), "event-1", {
    id: "expense-1",
    name: "Dinner",
    total: 12000,
    payers: [{ participantId: "avi", amount: 12000 }],
    sharedByParticipantIds: ["owner", "dani", "avi"],
    createdByParticipantId: "owner",
    updatedAt: "2026-05-23T01:00:00.000Z"
  });

  assert.equal(state.events[0].expenses.length, 1);
  assert.equal(state.events[0].expenses[0].name, "Dinner");
  assert.equal(state.events[0].expenses[0].total, 12000);
  assert.deepEqual(state.events[0].transfers, []);
});

test("joinGuestToEvent adds a guest and makes them the current participant", () => {
  const state = joinGuestToEvent(baseState(), "event-1", {
    id: "guest-1",
    displayName: "Guest"
  });

  assert.deepEqual(state.participants.at(-1), {
    id: "guest-1",
    displayName: "Guest",
    kind: "guest"
  });
  assert.equal(state.currentParticipantId, "guest-1");
  assert.equal(state.events[0].participantIds.includes("guest-1"), true);
  assert.deepEqual(state.events[0].transfers, []);
});

test("removeParticipant deletes a saved name only when it is not used in money records", () => {
  const state = {
    ...baseState(),
    participants: [
      ...baseState().participants,
      { id: "guest-unused", displayName: "Guest unused", kind: "guest" }
    ],
    groups: [
      {
        id: "group-1",
        name: "Friends",
        memberIds: ["owner", "guest-unused"],
        adminIds: ["owner"],
        archived: false
      }
    ],
    events: [
      {
        ...baseState().events[0],
        participantIds: ["owner", "dani", "avi", "guest-unused"]
      }
    ]
  };

  assert.equal(canRemoveParticipant(state, "guest-unused"), true);
  assert.equal(canRemoveParticipant(state, "dani"), false);

  const nextState = removeParticipant(state, "guest-unused");

  assert.equal(nextState.participants.some((item) => item.id === "guest-unused"), false);
  assert.deepEqual(nextState.groups[0].memberIds, ["owner"]);
  assert.deepEqual(nextState.events[0].participantIds, ["owner", "dani", "avi"]);
});

test("switchCurrentParticipant changes identity only to a known participant", () => {
  const state = switchCurrentParticipant(baseState(), "dani");

  assert.equal(state.currentParticipantId, "dani");
  assert.equal(
    switchCurrentParticipant(state, "missing").currentParticipantId,
    "dani"
  );
});

test("duplicateEvent creates a clean event from an existing one", () => {
  const state = duplicateEvent(baseState(), "event-1", {
    id: "event-2",
    name: "Night out again",
    adminId: "owner",
    createdAt: "2026-05-30T00:00:00.000Z"
  });

  assert.deepEqual(state.events[0], {
    id: "event-2",
    name: "Night out again",
    participantIds: ["owner", "dani", "avi"],
    expenses: [],
    transfers: [],
    adminIds: ["owner"],
    createdByParticipantId: "owner",
    adminsCanEditOnly: false,
    locked: false,
    createdAt: "2026-05-30T00:00:00.000Z"
  });
  assert.equal(state.events[1].id, "event-1");
});

test("updateTransferStatus marks a transfer as paid with audit details", () => {
  const state = updateTransferStatus(
    baseState(),
    "event-1",
    "transfer-dani-owner-3000",
    {
      status: "paid",
      participantId: "owner",
      markedAt: "2026-05-23T02:00:00.000Z"
    }
  );

  assert.deepEqual(state.events[0].transfers[0], {
    id: "transfer-dani-owner-3000",
    fromParticipantId: "dani",
    toParticipantId: "owner",
    amount: 3000,
    status: "paid",
    markedPaidByParticipantId: "owner",
    markedPaidAt: "2026-05-23T02:00:00.000Z"
  });
});

test("updateTransferStatus can return a paid transfer to pending", () => {
  const paidState = baseState();
  paidState.events[0].transfers[0] = {
    ...paidState.events[0].transfers[0],
    status: "paid",
    markedPaidByParticipantId: "owner",
    markedPaidAt: "2026-05-23T02:00:00.000Z"
  };

  const state = updateTransferStatus(
    paidState,
    "event-1",
    "transfer-dani-owner-3000",
    { status: "pending" }
  );

  assert.deepEqual(state.events[0].transfers[0], {
    id: "transfer-dani-owner-3000",
    fromParticipantId: "dani",
    toParticipantId: "owner",
    amount: 3000,
    status: "pending"
  });
});
