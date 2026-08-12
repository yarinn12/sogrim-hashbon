import test from "node:test";
import assert from "node:assert/strict";

import {
  archiveGroup,
  canLinkParticipantAccount,
  canMergeParticipants,
  canRemoveParticipant,
  closeEvent,
  createGroup,
  deactivateEventParticipant,
  deleteEvent,
  duplicateEvent,
  joinGuestToEvent,
  leaveEvent,
  linkParticipantAccount,
  mergeParticipants,
  renameOfflineParticipant,
  reopenEvent,
  removeParticipant,
  removeExpense,
  setEventRoundSettlementTransfers,
  updateTransferStatus,
  switchCurrentParticipant,
  updateGroup,
  updateExpense
} from "../src/domain/appActions.mjs";
import { calculateSettlement } from "../src/domain/settlement.mjs";

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
      createdAt: GROUP_CREATED_AT,
      updatedAt: GROUP_CREATED_AT
    }
  ]);
});

test("event transfer rounding can be disabled and enabled again", () => {
  const disabled = setEventRoundSettlementTransfers(
    baseState(),
    "event-1",
    false
  );
  const enabled = setEventRoundSettlementTransfers(
    disabled,
    "event-1",
    true
  );

  assert.equal(disabled.events[0].roundSettlementTransfers, false);
  assert.equal(enabled.events[0].roundSettlementTransfers, true);
  assert.equal(disabled.events[0].transfers[0].status, "pending");
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
    createdAt: GROUP_CREATED_AT,
    updatedAt: updated.groups[0].updatedAt
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
    createdAt: GROUP_CREATED_AT,
    updatedAt: updated.groups[0].updatedAt
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

test("joinGuestToEvent is idempotent for an existing participant", () => {
  const original = baseState();
  original.participants.push({
    id: "guest-1",
    displayName: "Existing guest",
    kind: "guest"
  });

  const state = joinGuestToEvent(original, "event-1", {
    id: "guest-1",
    displayName: "Duplicate guest"
  });

  assert.equal(
    state.participants.filter((participant) => participant.id === "guest-1").length,
    1
  );
  assert.equal(state.participants.find((participant) => participant.id === "guest-1").displayName, "Existing guest");
  assert.equal(state.currentParticipantId, "guest-1");
});

test("renameOfflineParticipant keeps the same identity and all money references", () => {
  const state = baseState();
  state.participants.push({ id: "guest-dani", displayName: "  Dani temp  ", kind: "guest" });
  state.events[0].participantIds.push("guest-dani");
  state.events[0].expenses.push({
    id: "expense-guest",
    name: "Coffee",
    total: 1200,
    payers: [{ participantId: "guest-dani", amount: 1200 }],
    sharedByParticipantIds: ["guest-dani", "owner"]
  });

  const changedAt = "2026-08-02T10:00:00.000Z";
  const nextState = renameOfflineParticipant(
    state,
    "guest-dani",
    "  דני   מהעבודה  ",
    changedAt
  );

  assert.equal(
    nextState.participants.find((participant) => participant.id === "guest-dani")?.displayName,
    "דני מהעבודה"
  );
  assert.equal(
    nextState.participants.find((participant) => participant.id === "guest-dani")?.profileUpdatedAt,
    changedAt
  );
  assert.deepEqual(
    nextState.events.find((event) => event.id === "event-1")?.expenses.at(-1)?.payers,
    [{ participantId: "guest-dani", amount: 1200 }]
  );
  assert.deepEqual(
    nextState.events.find((event) => event.id === "event-1")?.expenses.at(-1)?.sharedByParticipantIds,
    ["guest-dani", "owner"]
  );
});

test("renameOfflineParticipant never renames a connected account", () => {
  const state = baseState();
  state.participants[1] = {
    ...state.participants[1],
    accountLinked: true,
    authProvider: "google",
    authSubject: "google-dani"
  };

  assert.equal(renameOfflineParticipant(state, "dani", "Not Dani"), state);
  assert.equal(renameOfflineParticipant(state, "avi", "   "), state);
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

test("removeParticipant promotes the current member instead of an arbitrary remaining member", () => {
  const state = {
    ...baseState(),
    currentParticipantId: "owner",
    participants: [
      ...baseState().participants,
      { id: "guest-admin", displayName: "Guest admin", kind: "guest" }
    ],
    groups: [
      {
        id: "group-1",
        name: "Friends",
        memberIds: ["dani", "owner", "guest-admin"],
        adminIds: ["guest-admin"],
        archived: false
      }
    ],
    events: [
      {
        ...baseState().events[0],
        participantIds: ["dani", "owner", "guest-admin"],
        adminIds: ["guest-admin"],
        createdByParticipantId: "guest-admin",
        expenses: [],
        transfers: []
      }
    ]
  };

  const nextState = removeParticipant(state, "guest-admin");

  assert.deepEqual(nextState.groups[0].adminIds, ["owner"]);
  assert.deepEqual(nextState.events[0].adminIds, ["owner"]);
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
    membershipUpdatedAtByParticipant: {
      owner: "2026-05-30T00:00:00.000Z",
      dani: "2026-05-30T00:00:00.000Z",
      avi: "2026-05-30T00:00:00.000Z"
    },
    expenses: [],
    transfers: [],
    adminIds: ["owner"],
    createdByParticipantId: "owner",
    adminsCanEditOnly: false,
    roundSettlementTransfers: true,
    locked: false,
    createdAt: "2026-05-30T00:00:00.000Z",
    settingsUpdatedAt: "2026-05-30T00:00:00.000Z"
  });
  assert.equal(state.events[1].id, "event-1");
});

test("duplicateEvent carries only currently active participants", () => {
  const sourceState = baseState();
  sourceState.events[0].inactiveParticipantIds = ["avi"];

  const state = duplicateEvent(sourceState, "event-1", {
    id: "event-2",
    name: "Active members only",
    adminId: "owner",
    createdAt: "2026-05-30T00:00:00.000Z"
  });

  assert.deepEqual(state.events[0].participantIds, ["owner", "dani"]);
  assert.equal(state.events[0].inactiveParticipantIds, undefined);
});

test("duplicateEvent preserves centralized editing and settlement rounding settings", () => {
  const sourceState = baseState();
  sourceState.events[0].adminsCanEditOnly = true;
  sourceState.events[0].roundSettlementTransfers = false;

  const state = duplicateEvent(sourceState, "event-1", {
    id: "event-2",
    name: "Same rules",
    adminId: "owner",
    createdAt: "2026-05-30T00:00:00.000Z"
  });

  assert.equal(state.events[0].adminsCanEditOnly, true);
  assert.equal(state.events[0].roundSettlementTransfers, false);
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
    markedPaidAt: "2026-05-23T02:00:00.000Z",
    statusUpdatedAt: "2026-05-23T02:00:00.000Z"
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
    {
      status: "pending",
      markedAt: "2026-05-23T03:00:00.000Z"
    }
  );

  assert.deepEqual(state.events[0].transfers[0], {
    id: "transfer-dani-owner-3000",
    fromParticipantId: "dani",
    toParticipantId: "owner",
    amount: 3000,
    status: "pending",
    statusUpdatedAt: "2026-05-23T03:00:00.000Z"
  });
});

test("repeating the same transfer status is idempotent", () => {
  const original = baseState();
  const repeated = updateTransferStatus(
    original,
    "event-1",
    "transfer-dani-owner-3000",
    {
      status: "pending",
      markedAt: "2026-05-23T04:00:00.000Z"
    }
  );

  assert.strictEqual(repeated, original);
});

test("removeExpense records a tombstone so stale devices cannot restore it", () => {
  const state = removeExpense(
    baseState(),
    "event-1",
    "expense-1",
    "2026-07-24T12:00:00.000Z"
  );

  assert.deepEqual(state.events[0].deletedExpenses, [
    {
      id: "expense-1",
      deletedAt: "2026-07-24T12:00:00.000Z"
    }
  ]);
});

test("closeEvent locks an event and reopenEvent returns it to editing", () => {
  const closed = closeEvent(baseState(), "event-1", "2026-05-24T10:00:00.000Z");

  assert.equal(closed.events[0].locked, true);
  assert.equal(closed.events[0].closedAt, "2026-05-24T10:00:00.000Z");
  assert.equal(closed.events[0].statusUpdatedAt, "2026-05-24T10:00:00.000Z");

  const reopened = reopenEvent(closed, "event-1", "2026-05-24T11:00:00.000Z");

  assert.equal(reopened.events[0].locked, false);
  assert.equal(reopened.events[0].closedAt, null);
  assert.equal(reopened.events[0].statusUpdatedAt, "2026-05-24T11:00:00.000Z");
});

test("repeating close or reopen does not rewrite lifecycle timestamps", () => {
  const closed = closeEvent(baseState(), "event-1", "2026-05-24T10:00:00.000Z");
  assert.strictEqual(
    closeEvent(closed, "event-1", "2026-05-24T12:00:00.000Z"),
    closed
  );

  const reopened = reopenEvent(closed, "event-1", "2026-05-24T11:00:00.000Z");
  assert.strictEqual(
    reopenEvent(reopened, "event-1", "2026-05-24T13:00:00.000Z"),
    reopened
  );
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

test("deactivateEventParticipant removes an online account from active membership while preserving money", () => {
  const state = baseState();
  state.participants = state.participants.map((participant) =>
    participant.id === "dani"
      ? {
          ...participant,
          authProvider: "google",
          authSubject: "google-dani",
          accountLinked: true
        }
      : participant
  );

  const nextState = deactivateEventParticipant(
    state,
    "event-1",
    "dani",
    "2026-07-26T09:00:00.000Z"
  );
  const event = nextState.events[0];

  assert.deepEqual(event.participantIds, ["owner", "dani", "avi"]);
  assert.deepEqual(event.inactiveParticipantIds, ["dani"]);
  assert.equal(event.membershipUpdatedAt, "2026-07-26T09:00:00.000Z");
  assert.strictEqual(event.expenses, state.events[0].expenses);
  assert.strictEqual(event.transfers, state.events[0].transfers);
  assert.equal(nextState.participants.some((participant) => participant.id === "dani"), true);
});

test("deactivateEventParticipant removes an unused online account only from the event", () => {
  const state = baseState();
  state.participants = state.participants.map((participant) =>
    participant.id === "avi"
      ? {
          ...participant,
          authProvider: "google",
          authSubject: "google-avi",
          accountLinked: true
        }
      : participant
  );
  state.events[0] = {
    ...state.events[0],
    expenses: state.events[0].expenses.map((expense) => ({
      ...expense,
      sharedByParticipantIds: ["owner", "dani"]
    }))
  };

  const nextState = deactivateEventParticipant(
    state,
    "event-1",
    "avi",
    "2026-07-26T09:05:00.000Z"
  );

  assert.deepEqual(nextState.events[0].participantIds, ["owner", "dani"]);
  assert.deepEqual(nextState.events[0].inactiveParticipantIds, []);
  assert.equal(nextState.participants.some((participant) => participant.id === "avi"), true);
});

test("deactivateEventParticipant keeps creator history but removes the creator from the active roster", () => {
  const state = baseState();
  state.events[0] = {
    ...state.events[0],
    createdByParticipantId: "owner",
    adminIds: ["owner"]
  };
  const nextState = deactivateEventParticipant(
    state,
    "event-1",
    "owner",
    "2026-07-26T09:10:00.000Z"
  );

  assert.deepEqual(nextState.events[0].participantIds, ["owner", "dani", "avi"]);
  assert.deepEqual(nextState.events[0].inactiveParticipantIds, ["owner"]);
  assert.equal(nextState.events[0].createdByParticipantId, "owner");
  assert.deepEqual(nextState.events[0].adminIds, ["dani"]);
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
      { id: "guest-dani", displayName: "  DANI  ", kind: "guest" }
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
        membershipUpdatedAtByParticipant: {
          owner: "2026-05-23T00:00:00.000Z",
          dani: "2026-05-23T00:00:00.000Z",
          "guest-dani": "2026-05-23T00:00:00.000Z"
        },
        inactiveParticipantIds: [],
        adminIds: ["guest-dani"],
        participantAliases: {
          "guest-dani": "From work"
        },
        distinctParticipantPairs: [
          "guest-dani~owner",
          "dani~guest-dani"
        ],
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
        ],
        activityLog: [
          {
            id: "activity-guest-dani",
            kind: "participant-added",
            actorParticipantId: "guest-dani",
            subjectParticipantId: "guest-dani",
            fromParticipantId: "guest-dani",
            toParticipantId: "owner",
            occurredAt: "2026-05-23T00:00:00.000Z"
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
  assert.deepEqual(
    Object.keys(merged.events[0].membershipUpdatedAtByParticipant).sort(),
    ["dani", "owner"]
  );
  assert.deepEqual(merged.events[0].inactiveParticipantIds, []);
  assert.deepEqual(merged.events[0].adminIds, ["dani"]);
  assert.deepEqual(merged.events[0].participantAliases, {
    dani: "From work"
  });
  assert.deepEqual(merged.events[0].distinctParticipantPairs, ["dani~owner"]);
  assert.equal(merged.events[0].expenses[0].createdByParticipantId, "dani");
  assert.deepEqual(merged.events[0].expenses[0].sharedByParticipantIds, ["owner", "dani"]);
  assert.deepEqual(merged.events[0].expenses[0].payers, [{ participantId: "dani", amount: 9000 }]);
  assert.deepEqual(merged.events[0].activityLog, [
    {
      id: "activity-guest-dani",
      kind: "participant-added",
      actorParticipantId: "dani",
      subjectParticipantId: "dani",
      fromParticipantId: "dani",
      toParticipantId: "owner",
      occurredAt: "2026-05-23T00:00:00.000Z"
    }
  ]);
  assert.deepEqual(
    merged.events[0].transfers.map(
      ({ fromParticipantId, toParticipantId, amount, status }) => ({
        fromParticipantId,
        toParticipantId,
        amount,
        status
      })
    ),
    [
      {
        fromParticipantId: "owner",
        toParticipantId: "dani",
        amount: 4500,
        status: "pending"
      }
    ]
  );
});

test("mergeParticipants preserves paid history and recalculates only the open remainder", () => {
  const state = {
    currentParticipantId: "owner",
    participants: [
      { id: "owner", displayName: "Owner" },
      { id: "dani", displayName: "Dani" },
      { id: "guest-dani", displayName: " Dani ", kind: "guest" }
    ],
    groups: [],
    events: [
      {
        id: "event-merge-paid",
        name: "Paid merge",
        participantIds: ["owner", "dani", "guest-dani"],
        adminIds: ["owner"],
        expenses: [
          {
            id: "expense-paid",
            name: "Dinner",
            total: 6000,
            payers: [{ participantId: "owner", amount: 6000 }],
            sharedByParticipantIds: ["owner", "guest-dani"],
            createdByParticipantId: "owner"
          }
        ],
        transfers: [
          {
            id: "transfer-guest-dani-owner-3000",
            fromParticipantId: "guest-dani",
            toParticipantId: "owner",
            amount: 3000,
            status: "paid",
            markedPaidByParticipantId: "owner",
            markedPaidAt: "2026-07-24T12:00:00.000Z"
          }
        ]
      }
    ]
  };

  const merged = mergeParticipants(state, "guest-dani", "dani");

  assert.deepEqual(
    merged.events[0].transfers.map(
      ({ fromParticipantId, toParticipantId, amount, status }) => ({
        fromParticipantId,
        toParticipantId,
        amount,
        status
      })
    ),
    [
      {
        fromParticipantId: "dani",
        toParticipantId: "owner",
        amount: 3000,
        status: "paid"
      }
    ]
  );
});

test("mergeParticipants allows a manager to merge normalized same-name duplicates", () => {
  const state = mergeSettlementState({
    expense: {
      total: 6000,
      payers: [{ participantId: "owner", amount: 6000 }],
      sharedByParticipantIds: ["owner", "dani", "guest-dani"]
    },
    transfers: []
  });

  assert.equal(
    canMergeParticipants(state, "guest-dani", "dani"),
    true
  );
  const merged = mergeParticipants(state, "guest-dani", "dani");
  assert.notStrictEqual(merged, state);
  assert.equal(
    merged.participants.some((participant) => participant.id === "guest-dani"),
    false
  );
});

test("mergeParticipants denies an ordinary editor in an affected event", () => {
  const state = mergeSettlementState({
    expense: {
      total: 6000,
      payers: [{ participantId: "owner", amount: 6000 }],
      sharedByParticipantIds: ["owner", "dani", "guest-dani"]
    },
    transfers: []
  });
  state.currentParticipantId = "editor";
  state.participants.push({ id: "editor", displayName: "Editor" });
  state.events[0].participantIds.push("editor");
  state.events[0].adminsCanEditOnly = false;

  assert.equal(
    canMergeParticipants(state, "guest-dani", "dani"),
    false
  );
  assert.strictEqual(
    mergeParticipants(state, "guest-dani", "dani"),
    state
  );
});

test("mergeParticipants requires normalized matching names", () => {
  const state = mergeSettlementState({
    expense: {
      total: 6000,
      payers: [{ participantId: "owner", amount: 6000 }],
      sharedByParticipantIds: ["owner", "dani", "guest-dani"]
    },
    transfers: []
  });
  state.participants = state.participants.map((participant) =>
    participant.id === "guest-dani"
      ? { ...participant, displayName: "Daniel" }
      : participant
  );

  assert.equal(
    canMergeParticipants(state, "guest-dani", "dani"),
    false
  );
  assert.strictEqual(
    mergeParticipants(state, "guest-dani", "dani"),
    state
  );
});

test("linkParticipantAccount preserves a valid manager account-link flow", () => {
  const state = mergeSettlementState({
    expense: {
      total: 6000,
      payers: [{ participantId: "owner", amount: 6000 }],
      sharedByParticipantIds: ["owner", "dani", "guest-dani"]
    },
    transfers: []
  });
  state.participants = state.participants.map((participant) => {
    if (participant.id === "guest-dani") {
      return { ...participant, displayName: "Dani from work" };
    }
    if (participant.id === "dani") {
      return { ...participant, accountLinked: true };
    }
    return participant;
  });

  assert.equal(
    canLinkParticipantAccount(state, "guest-dani", "dani"),
    true
  );
  const linked = linkParticipantAccount(state, "guest-dani", "dani");
  assert.notStrictEqual(linked, state);
  assert.equal(
    linked.participants.some((participant) => participant.id === "guest-dani"),
    false
  );
});

test("mergeParticipants requires management permission in every affected event", () => {
  const state = mergeSettlementState({
    expense: {
      total: 6000,
      payers: [{ participantId: "owner", amount: 6000 }],
      sharedByParticipantIds: ["owner", "dani", "guest-dani"]
    },
    transfers: []
  });
  state.participants.push({ id: "other-manager", displayName: "Other manager" });
  state.events.push({
    id: "event-other-manager",
    name: "Other shared event",
    participantIds: ["other-manager", "guest-dani"],
    adminIds: ["other-manager"],
    adminsCanEditOnly: false,
    expenses: [],
    transfers: []
  });

  assert.equal(
    canMergeParticipants(state, "guest-dani", "dani"),
    false
  );
  assert.strictEqual(
    mergeParticipants(state, "guest-dani", "dani"),
    state
  );
});

test("mergeParticipants keeps two same-direction paid transfers before calculating the remainder", () => {
  const state = mergeSettlementState({
    expense: {
      total: 12000,
      payers: [{ participantId: "owner", amount: 12000 }],
      sharedByParticipantIds: ["owner", "dani", "guest-dani"]
    },
    transfers: [
      paidTransfer("dani", "owner", 2000, "paid-dani-owner"),
      paidTransfer("guest-dani", "owner", 3000, "paid-guest-owner")
    ]
  });

  const merged = mergeParticipants(state, "guest-dani", "dani");

  assert.deepEqual(transferSummary(merged.events[0].transfers), [
    ["dani", "owner", 2000, "paid"],
    ["dani", "owner", 3000, "paid"],
    ["dani", "owner", 1000, "pending"]
  ]);
});

test("mergeParticipants nets paid history in opposite directions", () => {
  const state = mergeSettlementState({
    expense: {
      total: 12000,
      payers: [{ participantId: "owner", amount: 12000 }],
      sharedByParticipantIds: ["owner", "dani", "guest-dani"]
    },
    transfers: [
      paidTransfer("owner", "guest-dani", 3000, "paid-owner-guest"),
      paidTransfer("dani", "owner", 1000, "paid-dani-owner")
    ]
  });

  const merged = mergeParticipants(state, "guest-dani", "dani");

  assert.deepEqual(transferSummary(merged.events[0].transfers), [
    ["owner", "dani", 3000, "paid"],
    ["dani", "owner", 1000, "paid"],
    ["dani", "owner", 8000, "pending"]
  ]);
});

test("mergeParticipants drops paid transfers that become internal to one identity", () => {
  const state = mergeSettlementState({
    expense: {
      total: 6000,
      payers: [{ participantId: "owner", amount: 6000 }],
      sharedByParticipantIds: ["owner", "dani", "guest-dani"]
    },
    transfers: [
      paidTransfer("guest-dani", "dani", 2000, "paid-between-duplicates")
    ]
  });

  const merged = mergeParticipants(state, "guest-dani", "dani");

  assert.deepEqual(transferSummary(merged.events[0].transfers), [
    ["dani", "owner", 3000, "pending"]
  ]);
});

test("mergeParticipants preserves total money and exact settlement invariants", () => {
  const state = mergeSettlementState({
    expense: {
      total: 10001,
      payers: [
        { participantId: "dani", amount: 3333 },
        { participantId: "guest-dani", amount: 6668 }
      ],
      sharedByParticipantIds: ["owner", "dani", "guest-dani"]
    },
    transfers: []
  });
  state.events[0].roundSettlementTransfers = false;

  const merged = mergeParticipants(state, "guest-dani", "dani");
  const mergedExpense = merged.events[0].expenses[0];
  const settlement = calculateSettlement(
    merged.participants,
    merged.events[0].expenses
  );

  assert.equal(mergedExpense.total, 10001);
  assert.equal(
    mergedExpense.payers.reduce((sum, payer) => sum + payer.amount, 0),
    10001
  );
  assert.deepEqual(mergedExpense.payers, [
    { participantId: "dani", amount: 10001 }
  ]);
  assert.deepEqual(mergedExpense.sharedByParticipantIds, ["owner", "dani"]);
  assert.deepEqual(settlement.issues, []);
  assert.equal(
    Object.values(settlement.balances).reduce((sum, amount) => sum + amount, 0),
    0
  );
  assert.deepEqual(transferSummary(merged.events[0].transfers), [
    ["owner", "dani", 5001, "pending"]
  ]);
});

test("mergeParticipants recalculates correctly when the merged source was a creditor", () => {
  const state = mergeSettlementState({
    expense: {
      total: 9000,
      payers: [{ participantId: "guest-dani", amount: 9000 }],
      sharedByParticipantIds: ["owner", "dani", "guest-dani"]
    },
    transfers: [
      paidTransfer("owner", "guest-dani", 3000, "paid-owner-guest")
    ]
  });

  const merged = mergeParticipants(state, "guest-dani", "dani");

  assert.deepEqual(transferSummary(merged.events[0].transfers), [
    ["owner", "dani", 3000, "paid"],
    ["owner", "dani", 1500, "pending"]
  ]);
});

function mergeSettlementState({ expense, transfers }) {
  return {
    currentParticipantId: "owner",
    participants: [
      { id: "owner", displayName: "Owner" },
      { id: "dani", displayName: "Dani" },
      { id: "guest-dani", displayName: "  Dani  ", kind: "guest" }
    ],
    groups: [],
    events: [
      {
        id: "event-merge-settlement",
        name: "Merge settlement",
        participantIds: ["owner", "dani", "guest-dani"],
        adminIds: ["owner"],
        expenses: [
          {
            id: "expense-merge-settlement",
            name: "Shared expense",
            createdByParticipantId: "owner",
            ...expense
          }
        ],
        transfers
      }
    ]
  };
}

function paidTransfer(fromParticipantId, toParticipantId, amount, id) {
  return {
    id,
    fromParticipantId,
    toParticipantId,
    amount,
    status: "paid",
    markedPaidByParticipantId: "owner",
    markedPaidAt: "2026-07-24T12:00:00.000Z"
  };
}

function transferSummary(transfers) {
  return transfers.map(
    ({ fromParticipantId, toParticipantId, amount, status }) => [
      fromParticipantId,
      toParticipantId,
      amount,
      status
    ]
  );
}
