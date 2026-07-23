import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeSharedStates,
  validateSharedStateIdentifiers
} from "../src/domain/sharedStateMerge.mjs";

test("mergeSharedStates unions top-level entities and keeps the local identity", () => {
  const remote = {
    currentParticipantId: "remote-user",
    participants: [
      { id: "shared-user", displayName: "Remote name", email: "remote@example.com" },
      { id: "remote-user", displayName: "Remote user" },
      { id: "remote-user", displayName: "Duplicate remote user" }
    ],
    groups: [{ id: "remote-group", name: "Remote group" }],
    events: [{ id: "remote-event", name: "Remote event" }]
  };
  const local = {
    currentParticipantId: "local-user",
    participants: [
      { id: "shared-user", displayName: "Local name" },
      { id: "local-user", displayName: "Local user" }
    ],
    groups: [{ id: "local-group", name: "Local group" }],
    events: [{ id: "local-event", name: "Local event" }]
  };

  const merged = mergeSharedStates(remote, local);

  assert.equal(merged.currentParticipantId, "local-user");
  assert.deepEqual(merged.participants.map((item) => item.id), [
    "shared-user",
    "local-user",
    "remote-user"
  ]);
  assert.deepEqual(merged.participants[0], {
    id: "shared-user",
    displayName: "Local name",
    email: "remote@example.com"
  });
  assert.deepEqual(merged.groups.map((item) => item.id), [
    "local-group",
    "remote-group"
  ]);
  assert.deepEqual(merged.events.map((item) => item.id), [
    "local-event",
    "remote-event"
  ]);
});

test("same event unions members and keeps the newest version of each expense", () => {
  const remote = stateWithEvent({
    id: "event-1",
    name: "Remote event name",
    participantIds: ["remote-user", "shared-user"],
    adminIds: ["remote-user"],
    expenses: [
      expense("remote-only", "2026-07-17T09:00:00.000Z", 1000),
      expense("remote-newer", "2026-07-17T12:00:00.000Z", 3000),
      expense("local-newer", "2026-07-17T08:00:00.000Z", 4000)
    ],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    name: "Local event name",
    participantIds: ["local-user", "shared-user"],
    adminIds: ["local-user"],
    expenses: [
      expense("local-only", "2026-07-17T10:00:00.000Z", 2000),
      expense("remote-newer", "2026-07-17T11:00:00.000Z", 3500),
      expense("local-newer", "2026-07-17T13:00:00.000Z", 4500)
    ],
    transfers: []
  });

  const [event] = mergeSharedStates(remote, local).events;

  assert.equal(event.name, "Local event name");
  assert.deepEqual(event.participantIds, [
    "local-user",
    "shared-user",
    "remote-user"
  ]);
  assert.deepEqual(event.adminIds, ["local-user", "remote-user"]);
  assert.deepEqual(event.expenses.map((item) => item.id), [
    "local-only",
    "remote-newer",
    "local-newer",
    "remote-only"
  ]);
  assert.equal(
    event.expenses.find((item) => item.id === "remote-newer").total,
    3000
  );
  assert.equal(
    event.expenses.find((item) => item.id === "local-newer").total,
    4500
  );
});

test("newer membership change keeps a participant who left from returning after sync", () => {
  const remote = stateWithEvent({
    id: "event-1",
    participantIds: ["owner", "leaving-user"],
    adminIds: ["owner"],
    expenses: [],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    participantIds: ["owner"],
    adminIds: ["owner"],
    membershipUpdatedAt: "2026-07-19T12:00:00.000Z",
    expenses: [],
    transfers: []
  });

  const [event] = mergeSharedStates(remote, local).events;

  assert.deepEqual(event.participantIds, ["owner"]);
  assert.deepEqual(event.adminIds, ["owner"]);
  assert.equal(event.membershipUpdatedAt, "2026-07-19T12:00:00.000Z");
});

test("a later explicit rejoin wins over an older leave", () => {
  const remote = stateWithEvent({
    id: "event-1",
    participantIds: ["owner"],
    adminIds: ["owner"],
    membershipUpdatedAt: "2026-07-19T12:00:00.000Z",
    expenses: [],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    participantIds: ["owner", "returning-user"],
    adminIds: ["owner"],
    membershipUpdatedAt: "2026-07-19T13:00:00.000Z",
    expenses: [],
    transfers: []
  });

  const [event] = mergeSharedStates(remote, local).events;

  assert.deepEqual(event.participantIds, ["owner", "returning-user"]);
});

test("same transfer preserves paid status from either side", () => {
  const remote = stateWithEvent({
    id: "event-1",
    participantIds: [],
    adminIds: [],
    expenses: [],
    transfers: [
      {
        id: "remote-paid",
        amount: 1000,
        status: "paid",
        markedPaidAt: "2026-07-17T12:00:00.000Z",
        markedPaidByParticipantId: "remote-user"
      },
      { id: "local-paid", amount: 2000, status: "pending" },
      { id: "remote-only", amount: 3000, status: "pending" }
    ]
  });
  const local = stateWithEvent({
    id: "event-1",
    participantIds: [],
    adminIds: [],
    expenses: [],
    transfers: [
      { id: "remote-paid", amount: 1100, status: "pending" },
      {
        id: "local-paid",
        amount: 2100,
        status: "paid",
        markedPaidAt: "2026-07-17T13:00:00.000Z",
        markedPaidByParticipantId: "local-user"
      },
      { id: "local-only", amount: 4000, status: "pending" }
    ]
  });

  const transfers = mergeSharedStates(remote, local).events[0].transfers;

  assert.deepEqual(transfers.map((item) => item.id), [
    "remote-paid",
    "local-paid",
    "local-only",
    "remote-only"
  ]);
  assert.deepEqual(
    transfers.find((item) => item.id === "remote-paid"),
    {
      id: "remote-paid",
      amount: 1100,
      status: "paid",
      markedPaidAt: "2026-07-17T12:00:00.000Z",
      markedPaidByParticipantId: "remote-user"
    }
  );
  assert.equal(
    transfers.find((item) => item.id === "local-paid").status,
    "paid"
  );
});

test("an event deletion tombstone wins over stale event data from another device", () => {
  const remote = {
    ...stateWithEvent({ id: "event-1", name: "Stale remote event" }),
    deletedEvents: [
      {
        id: "event-2",
        deletedAt: "2026-07-19T14:00:00.000Z",
        sharedSpaceId: "space-event-two"
      }
    ]
  };
  const local = {
    ...stateWithEvent({ id: "event-2", name: "Stale local event" }),
    deletedEvents: [
      {
        id: "event-1",
        deletedAt: "2026-07-19T15:00:00.000Z",
        sharedSpaceKey: "event_share_key_12345678901234567890"
      }
    ]
  };

  const merged = mergeSharedStates(remote, local);

  assert.deepEqual(merged.events, []);
  assert.deepEqual(
    merged.deletedEvents.map((item) => item.id),
    ["event-1", "event-2"]
  );
});

test("the newest deletion keeps the event share credentials for retry", () => {
  const remote = {
    ...stateWithEvent({ id: "active-event" }),
    deletedEvents: [
      {
        id: "event-1",
        deletedAt: "2026-07-19T14:00:00.000Z",
        sharedSpaceId: "space-event-one",
        sharedSpaceKey: "event_share_key_12345678901234567890"
      }
    ]
  };
  const local = {
    ...stateWithEvent({ id: "active-event" }),
    deletedEvents: [
      { id: "event-1", deletedAt: "2026-07-19T15:00:00.000Z" }
    ]
  };

  const [deletion] = mergeSharedStates(remote, local).deletedEvents;

  assert.equal(deletion.deletedAt, "2026-07-19T15:00:00.000Z");
  assert.equal(deletion.sharedSpaceId, "space-event-one");
  assert.equal(
    deletion.sharedSpaceKey,
    "event_share_key_12345678901234567890"
  );
});

test("mergeSharedStates does not mutate either input", () => {
  const remote = stateWithEvent({
    id: "event-1",
    participantIds: ["remote-user"],
    adminIds: [],
    expenses: [expense("expense-1", "2026-07-17T10:00:00.000Z", 1000)],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    participantIds: ["local-user"],
    adminIds: [],
    expenses: [],
    transfers: []
  });
  const remoteBefore = structuredClone(remote);
  const localBefore = structuredClone(local);

  const merged = mergeSharedStates(remote, local);
  merged.events[0].participantIds.push("another-user");
  merged.events[0].expenses[0].total = 9999;

  assert.deepEqual(remote, remoteBefore);
  assert.deepEqual(local, localBefore);
});

test("mergeSharedStates rejects unsafe entity and nested reference identifiers", () => {
  const unsafeEntityState = {
    currentParticipantId: "",
    participants: [{ id: 'user-1" onclick="alert(1)' }],
    groups: [],
    events: []
  };
  const unsafeReferenceState = stateWithEvent({
    id: "event-1",
    participantIds: ["safe-user"],
    adminIds: [],
    expenses: [
      {
        id: "expense-1",
        sharedByParticipantIds: ["safe-user", "<script>"],
        payers: []
      }
    ],
    transfers: []
  });

  assert.throws(
    () => mergeSharedStates(unsafeEntityState, stateWithEvent({ id: "event-1" })),
    /remoteState\.participants\[0\]\.id/
  );
  assert.throws(
    () => mergeSharedStates(stateWithEvent({ id: "event-1" }), unsafeReferenceState),
    /localState\.events\[0\]\.expenses\[0\]\.sharedByParticipantIds\[1\]/
  );
});

test("shared identifier validation enforces ASCII type and the 128 character limit", () => {
  const validId = "a".repeat(128);
  const validState = {
    currentParticipantId: validId,
    participants: [{ id: validId }],
    groups: [],
    events: []
  };
  const invalidState = {
    currentParticipantId: "",
    participants: [{ id: "a".repeat(129) }, { id: 123 }],
    groups: [{ id: "קבוצה" }],
    events: []
  };

  assert.deepEqual(validateSharedStateIdentifiers(validState), []);
  const errors = validateSharedStateIdentifiers(invalidState);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /participants\[0\]\.id/);
  assert.match(errors[1], /participants\[1\]\.id/);
  assert.match(errors[2], /groups\[0\]\.id/);
});

function stateWithEvent(event) {
  return {
    currentParticipantId: "",
    participants: [],
    groups: [],
    events: [event]
  };
}

function expense(id, updatedAt, total) {
  return { id, updatedAt, total };
}
