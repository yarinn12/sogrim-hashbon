import test from "node:test";
import assert from "node:assert/strict";

import {
  archiveGroup,
  canRemoveParticipant,
  closeEvent,
  createGroup,
  deleteEvent,
  duplicateEvent,
  joinGuestToEvent,
  leaveEvent,
  mergeParticipants,
  reopenEvent,
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
        currency: "USD",
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

const GROUP_CREATED_AT = "2026-07-17T15:30:00.000Z";

test("createGroup adds the creator as admin and member", () => {
  const state = createGroup(baseState(), {
    id: "group-1",
    name: "Thursday friends",
    memberIds: ["dani", "avi"],
    adminId: "owner",
    createdAt: GROUP_CREATED_AT
  });

  assert.deepEqual(state.groups, [
    {
      id: "group-1",
      name: "Thursday friends",
      memberIds: ["owner", "dani", "avi"],
      adminIds: ["owner"],
      archived: false,
      createdAt: GROUP_CREATED_AT
    }
  ]);
});

test("archiveGroup hides a group without deleting historical events", () => {
  const state = createGroup(baseState(), {
    id: "group-1",
    name: "Thursday friends",
    memberIds: ["owner", "dani"],
    adminId: "owner",
    createdAt: GROUP_CREATED_AT
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
    adminId: "owner",
    createdAt: GROUP_CREATED_AT
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
    archived: false,
    createdAt: GROUP_CREATED_AT
  });
});

test("updateGroup falls back to a remaining member when admins are cleared", () => {
  const state = createGroup(baseState(), {
    id: "group-1",
    name: "Thursday friends",
    memberIds: ["owner", "dani", "avi"],
    adminId: "owner",
    createdAt: GROUP_CREATED_AT
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
    archived: false,
    createdAt: GROUP_CREATED_AT
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
  const original = baseState();
  original.events[0].transfers = [{ id: "transfer-1", status: "paid" }];
  const state = joinGuestToEvent(original, "event-1", {
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
  assert.deepEqual(state.events[0].transfers, [{ id: "transfer-1", status: "paid" }]);
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
        participantIds: ["owner", "dani", "avi", "guest-unused"],
        transfers: [{ id: "transfer-1", status: "paid" }]
      }
    ]
  };

  assert.equal(canRemoveParticipant(state, "guest-unused"), true);
  assert.equal(canRemoveParticipant(state, "dani"), false);

  const nextState = removeParticipant(state, "guest-unused");

  assert.equal(nextState.participants.some((item) => item.id === "guest-unused"), false);
  assert.deepEqual(nextState.groups[0].memberIds, ["owner"]);
  assert.deepEqual(nextState.events[0].participantIds, ["owner", "dani", "avi"]);
  assert.deepEqual(nextState.events[0].transfers, [{ id: "transfer-1", status: "paid" }]);
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
    currency: "USD",
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

test("closeEvent locks an event and reopenEvent returns it to editing", () => {
  const closed = closeEvent(baseState(), "event-1", "2026-05-24T10:00:00.000Z");

  assert.equal(closed.events[0].locked, true);
  assert.equal(closed.events[0].closedAt, "2026-05-24T10:00:00.000Z");

  const reopened = reopenEvent(closed, "event-1");

  assert.equal(reopened.events[0].locked, false);
  assert.equal("closedAt" in reopened.events[0], false);
});

test("leaveEvent removes an eligible participant and preserves unrelated transfers", () => {
  const state = {
    ...baseState(),
    events: [
      {
        ...baseState().events[0],
        participantIds: ["owner", "dani", "avi"],
        adminIds: ["owner", "avi"],
        expenses: [],
        transfers: [
          {
            id: "transfer-dani-owner-1000",
            fromParticipantId: "dani",
            toParticipantId: "owner",
            amount: 1000,
            status: "pending"
          }
        ]
      }
    ]
  };

  const nextState = leaveEvent(state, "event-1", "avi");

  assert.deepEqual(nextState.events[0].participantIds, ["owner", "dani"]);
  assert.deepEqual(nextState.events[0].adminIds, ["owner"]);
  assert.strictEqual(nextState.events[0].transfers, state.events[0].transfers);
  assert.deepEqual(nextState.events[0].transfers, [
    {
      id: "transfer-dani-owner-1000",
      fromParticipantId: "dani",
      toParticipantId: "owner",
      amount: 1000,
      status: "pending"
    }
  ]);
});

test("leaveEvent keeps a participant when expenses or transfers depend on them", () => {
  const nextState = leaveEvent(baseState(), "event-1", "dani");

  assert.deepEqual(nextState.events[0].participantIds, ["owner", "dani", "avi"]);
  assert.deepEqual(nextState.events[0].transfers, baseState().events[0].transfers);
});

test("deleteEvent removes only the selected event", () => {
  const state = {
    ...baseState(),
    events: [
      {
        ...baseState().events[0],
        sharedSpaceId: "space-event-one",
        sharedSpaceKey: "event_share_key_12345678901234567890"
      },
      {
        ...baseState().events[0],
        id: "event-2",
        name: "Another event"
      }
    ]
  };

  const nextState = deleteEvent(state, "event-1");

  assert.deepEqual(
    nextState.events.map((event) => event.id),
    ["event-2"]
  );
  assert.equal(nextState.deletedEvents.length, 1);
  assert.deepEqual(
    {
      id: nextState.deletedEvents[0].id,
      sharedSpaceId: nextState.deletedEvents[0].sharedSpaceId,
      sharedSpaceKey: nextState.deletedEvents[0].sharedSpaceKey
    },
    {
      id: "event-1",
      sharedSpaceId: "space-event-one",
      sharedSpaceKey: "event_share_key_12345678901234567890"
    }
  );
  assert.match(nextState.deletedEvents[0].deletedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("mergeParticipants moves all history from a duplicate into the kept participant", () => {
  const state = {
    ...baseState(),
    currentParticipantId: "guest-dani",
    participants: [
      ...baseState().participants,
      { id: "guest-dani", displayName: "Dani Guest", kind: "guest" }
    ],
    groups: [
      {
        id: "group-1",
        name: "Friends",
        memberIds: ["owner", "guest-dani"],
        adminIds: ["guest-dani"],
        archived: false
      }
    ],
    events: [
      {
        ...baseState().events[0],
        participantIds: ["owner", "dani", "guest-dani"],
        adminIds: ["guest-dani"],
        expenses: [
          {
            id: "expense-1",
            name: "Taxi",
            total: 9000,
            payers: [
              { participantId: "dani", amount: 3000 },
              { participantId: "guest-dani", amount: 6000 }
            ],
            sharedByParticipantIds: ["owner", "dani", "guest-dani"],
            createdByParticipantId: "guest-dani",
            updatedAt: "2026-05-23T00:00:00.000Z"
          }
        ],
        transfers: [
          {
            id: "transfer-guest-dani-owner-3000",
            fromParticipantId: "guest-dani",
            toParticipantId: "owner",
            amount: 3000,
            status: "pending"
          }
        ]
      }
    ]
  };

  const merged = mergeParticipants(state, "guest-dani", "dani");

  assert.equal(merged.currentParticipantId, "dani");
  assert.equal(merged.participants.some((participant) => participant.id === "guest-dani"), false);
  assert.deepEqual(merged.groups[0].memberIds, ["owner", "dani"]);
  assert.deepEqual(merged.groups[0].adminIds, ["dani"]);
  assert.deepEqual(merged.events[0].participantIds, ["owner", "dani"]);
  assert.deepEqual(merged.events[0].adminIds, ["dani"]);
  assert.equal(merged.events[0].expenses[0].createdByParticipantId, "dani");
  assert.deepEqual(merged.events[0].expenses[0].sharedByParticipantIds, ["owner", "dani"]);
  assert.deepEqual(merged.events[0].expenses[0].payers, [{ participantId: "dani", amount: 9000 }]);
  assert.equal(merged.events[0].transfers[0].fromParticipantId, "dani");
});
