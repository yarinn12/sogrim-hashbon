import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeSharedStates,
  validateSharedStateIdentifiers
} from "../src/domain/sharedStateMerge.mjs";
import { reconcileSettlementTransfers } from "../src/domain/settlement.mjs";

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

test("a stale device cannot hide that a participant linked an account", () => {
  const remote = {
    participants: [
      {
        id: "shared-user",
        displayName: "Connected user",
        accountLinked: true
      }
    ],
    groups: [],
    events: []
  };
  const local = {
    participants: [
      {
        id: "shared-user",
        displayName: "Connected user",
        accountLinked: false
      }
    ],
    groups: [],
    events: []
  };

  const [participant] = mergeSharedStates(remote, local).participants;

  assert.equal(participant.accountLinked, true);
});

test("a deleted-account tombstone cannot regain profile data from a stale device", () => {
  const remote = {
    participants: [{
      id: "account-00000000-0000-4000-8000-000000000001",
      displayName: "משתמש שנמחק",
      kind: "user",
      accountDeleted: true
    }],
    groups: [],
    events: []
  };
  const local = {
    participants: [{
      id: "account-00000000-0000-4000-8000-000000000001",
      displayName: "שם ישן",
      kind: "user",
      avatarImage: "data:image/jpeg;base64,private",
      avatarPreset: "avatar-4",
      accountLinked: true,
      profileUpdatedAt: "2026-08-31T10:00:00.000Z"
    }],
    groups: [],
    events: []
  };

  const [participant] = mergeSharedStates(remote, local).participants;

  assert.deepEqual(participant, {
    id: "account-00000000-0000-4000-8000-000000000001",
    displayName: "משתמש שנמחק",
    kind: "user",
    accountDeleted: true
  });
});

test("an unrelated stale save cannot restore an older profile name or avatar", () => {
  const remote = baseState();
  remote.participants[0] = {
    ...remote.participants[0],
    displayName: "ירין חדש",
    avatarPreset: "avatar-4",
    profileUpdatedAt: "2026-07-25T12:00:00.000Z"
  };
  const local = baseState();
  local.participants[0] = {
    ...local.participants[0],
    displayName: "ירין ישן",
    avatarPreset: "avatar-1",
    profileUpdatedAt: "2026-07-24T12:00:00.000Z"
  };
  local.events[0] = {
    ...local.events[0],
    name: "עדכון לא קשור"
  };

  const merged = mergeSharedStates(remote, local);

  assert.equal(merged.participants[0].displayName, "ירין חדש");
  assert.equal(merged.participants[0].avatarPreset, "avatar-4");
});

test("an avatar survives a newer unrelated profile update from an empty device", () => {
  const remote = baseState();
  remote.participants[0] = {
    ...remote.participants[0],
    displayName: "שם מעודכן",
    avatarImage: "",
    profileUpdatedAt: "2026-08-25T11:00:00.000Z"
  };
  const local = baseState();
  local.participants[0] = {
    ...local.participants[0],
    avatarImage: "https://images.example.com/chosen.webp",
    avatarImageUpdatedAt: "2026-08-25T10:00:00.000Z",
    profileUpdatedAt: "2026-08-25T10:00:00.000Z"
  };

  const merged = mergeSharedStates(remote, local);

  assert.equal(merged.participants[0].displayName, "שם מעודכן");
  assert.equal(
    merged.participants[0].avatarImage,
    "https://images.example.com/chosen.webp"
  );
});

test("a newer explicit avatar removal wins across shared devices", () => {
  const remote = baseState();
  remote.participants[0] = {
    ...remote.participants[0],
    avatarImage: "",
    avatarImageUpdatedAt: "2026-08-25T11:00:00.000Z"
  };
  const local = baseState();
  local.participants[0] = {
    ...local.participants[0],
    avatarImage: "https://images.example.com/chosen.webp",
    avatarImageUpdatedAt: "2026-08-25T10:00:00.000Z"
  };

  const merged = mergeSharedStates(remote, local);

  assert.equal(merged.participants[0].avatarImage, "");
  assert.equal(
    merged.participants[0].avatarImageUpdatedAt,
    "2026-08-25T11:00:00.000Z"
  );
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

test("same event unions concurrent activity without duplicate entries", () => {
  const remote = stateWithEvent({
    id: "event-1",
    activityLog: [
      {
        id: "activity-remote",
        kind: "expense-created",
        occurredAt: "2026-08-03T09:00:00.000Z"
      },
      {
        id: "activity-shared",
        kind: "expense-updated",
        label: "ישן",
        occurredAt: "2026-08-03T08:00:00.000Z"
      }
    ]
  });
  const local = stateWithEvent({
    id: "event-1",
    activityLog: [
      {
        id: "activity-local",
        kind: "participant-added",
        occurredAt: "2026-08-03T10:00:00.000Z"
      },
      {
        id: "activity-shared",
        kind: "expense-updated",
        label: "חדש",
        occurredAt: "2026-08-03T08:30:00.000Z"
      }
    ]
  });

  const [event] = mergeSharedStates(remote, local).events;

  assert.deepEqual(event.activityLog.map((entry) => entry.id), [
    "activity-local",
    "activity-remote",
    "activity-shared"
  ]);
  assert.equal(event.activityLog[2].label, "חדש");
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

test("concurrent add and removal of different participants both survive sync", () => {
  const remote = stateWithEvent({
    id: "event-1",
    participantIds: ["owner", "bob", "charlie"],
    adminIds: ["owner"],
    membershipUpdatedAt: "2026-07-27T10:00:00.000Z",
    membershipUpdatedAtByParticipant: {
      charlie: "2026-07-27T10:00:00.000Z"
    },
    expenses: [],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    participantIds: ["owner"],
    adminIds: ["owner"],
    membershipUpdatedAt: "2026-07-27T10:01:00.000Z",
    membershipUpdatedAtByParticipant: {
      bob: "2026-07-27T10:01:00.000Z"
    },
    expenses: [],
    transfers: []
  });

  for (const [first, second] of [
    [remote, local],
    [local, remote]
  ]) {
    const [event] = mergeSharedStates(first, second).events;
    assert.deepEqual(event.participantIds, ["owner", "charlie"]);
    assert.deepEqual(event.adminIds, ["owner"]);
    assert.deepEqual(event.membershipUpdatedAtByParticipant, {
      bob: "2026-07-27T10:01:00.000Z",
      charlie: "2026-07-27T10:00:00.000Z"
    });
  }
});

test("removed historical participants stay inactive after syncing with a stale device", () => {
  const remote = stateWithEvent({
    id: "event-1",
    participantIds: ["owner", "historical-user"],
    adminIds: ["owner"],
    inactiveParticipantIds: [],
    membershipUpdatedAt: "2026-07-19T12:00:00.000Z",
    expenses: [],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    participantIds: ["owner", "historical-user"],
    adminIds: ["owner"],
    inactiveParticipantIds: ["historical-user"],
    membershipUpdatedAt: "2026-07-19T13:00:00.000Z",
    expenses: [],
    transfers: []
  });

  const [event] = mergeSharedStates(remote, local).events;

  assert.deepEqual(event.participantIds, ["owner", "historical-user"]);
  assert.deepEqual(event.inactiveParticipantIds, ["historical-user"]);
  assert.equal(event.membershipUpdatedAt, "2026-07-19T13:00:00.000Z");
});

test("a later restore makes a historical participant active on every device", () => {
  const remote = stateWithEvent({
    id: "event-1",
    participantIds: ["owner", "historical-user"],
    adminIds: ["owner"],
    inactiveParticipantIds: ["historical-user"],
    membershipUpdatedAt: "2026-07-19T12:00:00.000Z",
    expenses: [],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    participantIds: ["owner", "historical-user"],
    adminIds: ["owner"],
    inactiveParticipantIds: [],
    membershipUpdatedAt: "2026-07-19T13:00:00.000Z",
    expenses: [],
    transfers: []
  });

  const [event] = mergeSharedStates(remote, local).events;

  assert.deepEqual(event.inactiveParticipantIds, []);
});

test("a reopened event stays open when an older closed copy syncs from another device", () => {
  const remote = stateWithEvent({
    id: "event-1",
    locked: true,
    closedAt: "2026-07-24T10:00:00.000Z",
    statusUpdatedAt: "2026-07-24T10:00:00.000Z",
    participantIds: [],
    adminIds: [],
    expenses: [],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    locked: false,
    closedAt: null,
    statusUpdatedAt: "2026-07-24T11:00:00.000Z",
    participantIds: [],
    adminIds: [],
    expenses: [],
    transfers: []
  });

  const [event] = mergeSharedStates(remote, local).events;

  assert.equal(event.locked, false);
  assert.equal(event.closedAt, null);
  assert.equal(event.statusUpdatedAt, "2026-07-24T11:00:00.000Z");
});

test("event lifecycle merge uses the latest status regardless of merge direction", () => {
  const olderOpen = stateWithEvent({
    id: "event-1",
    locked: false,
    closedAt: null,
    statusUpdatedAt: "2026-07-24T10:00:00.000Z",
    participantIds: [],
    adminIds: [],
    expenses: [],
    transfers: []
  });
  const newerClosed = stateWithEvent({
    id: "event-1",
    locked: true,
    closedAt: "2026-07-24T11:00:00.000Z",
    statusUpdatedAt: "2026-07-24T11:00:00.000Z",
    participantIds: [],
    adminIds: [],
    expenses: [],
    transfers: []
  });

  for (const [remote, local] of [
    [olderOpen, newerClosed],
    [newerClosed, olderOpen]
  ]) {
    const [event] = mergeSharedStates(remote, local).events;
    assert.equal(event.locked, true);
    assert.equal(event.closedAt, "2026-07-24T11:00:00.000Z");
    assert.equal(event.statusUpdatedAt, "2026-07-24T11:00:00.000Z");
  }
});

test("same transfer preserves paid status from either side", () => {
  const remote = settlementState({
    id: "event-1",
    transfers: [
      {
        id: "transfer-friend-owner-5000",
        fromParticipantId: "friend",
        toParticipantId: "owner",
        amount: 5000,
        status: "paid",
        markedPaidAt: "2026-07-17T12:00:00.000Z",
        markedPaidByParticipantId: "owner"
      }
    ]
  });
  const local = settlementState({
    id: "event-1",
    transfers: [
      {
        id: "transfer-friend-owner-5000",
        fromParticipantId: "friend",
        toParticipantId: "owner",
        amount: 5000,
        status: "pending"
      }
    ]
  });

  const transfers = mergeSharedStates(remote, local).events[0].transfers;

  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].status, "paid");
  assert.equal(transfers[0].markedPaidAt, "2026-07-17T12:00:00.000Z");
});

test("a newer pending status can undo a stale paid mark after sync", () => {
  const remote = settlementState({
    id: "event-1",
    transfers: [
      {
        id: "transfer-friend-owner-5000",
        fromParticipantId: "friend",
        toParticipantId: "owner",
        amount: 5000,
        status: "paid",
        markedPaidAt: "2026-07-24T10:00:00.000Z",
        statusUpdatedAt: "2026-07-24T10:00:00.000Z"
      }
    ]
  });
  const local = settlementState({
    id: "event-1",
    transfers: [
      {
        id: "transfer-friend-owner-5000",
        fromParticipantId: "friend",
        toParticipantId: "owner",
        amount: 5000,
        status: "pending",
        statusUpdatedAt: "2026-07-24T11:00:00.000Z"
      }
    ]
  });

  const [transfer] = mergeSharedStates(remote, local).events[0].transfers;
  assert.equal(transfer.status, "pending");
  assert.equal(transfer.markedPaidAt, undefined);
});

test("a canceled payment cannot return from a stale device after reconciliation", () => {
  const remote = settlementState({
    id: "event-1",
    transfers: [
      {
        id: "transfer-friend-owner-3000",
        fromParticipantId: "friend",
        toParticipantId: "owner",
        amount: 3000,
        status: "paid",
        markedPaidAt: "2026-07-24T10:00:00.000Z",
        statusUpdatedAt: "2026-07-24T10:00:00.000Z"
      }
    ]
  });
  const local = settlementState({
    id: "event-1",
    transfers: [
      {
        id: "transfer-friend-owner-5000",
        fromParticipantId: "friend",
        toParticipantId: "owner",
        amount: 5000,
        status: "pending"
      }
    ],
    transferStatusUpdates: [
      {
        id: "transfer-friend-owner-3000",
        status: "pending",
        updatedAt: "2026-07-24T11:00:00.000Z",
        markedAt: "2026-07-24T11:00:00.000Z"
      }
    ]
  });

  const [event] = mergeSharedStates(remote, local).events;

  assert.deepEqual(event.transfers, [
    {
      id: "transfer-friend-owner-5000",
      fromParticipantId: "friend",
      toParticipantId: "owner",
      amount: 5000,
      status: "pending"
    }
  ]);
  assert.deepEqual(event.transferStatusUpdates, local.events[0].transferStatusUpdates);
});

test("merging legacy events does not invent an empty transfer status history", () => {
  const remote = settlementState({ id: "event-legacy" });
  const local = settlementState({ id: "event-legacy" });

  delete remote.events[0].transferStatusUpdates;
  delete local.events[0].transferStatusUpdates;

  const [event] = mergeSharedStates(remote, local).events;

  assert.equal(Object.hasOwn(event, "transferStatusUpdates"), false);
});

test("stale pending settlement versions are rebuilt instead of accumulating", () => {
  const remote = settlementState({
    id: "event-1",
    transfers: [
      {
        id: "transfer-friend-owner-4000",
        fromParticipantId: "friend",
        toParticipantId: "owner",
        amount: 4000,
        status: "pending"
      }
    ]
  });
  const local = settlementState({
    id: "event-1",
    transfers: [
      {
        id: "transfer-friend-owner-5000",
        fromParticipantId: "friend",
        toParticipantId: "owner",
        amount: 5000,
        status: "pending"
      }
    ]
  });

  const transfers = mergeSharedStates(remote, local).events[0].transfers;

  assert.deepEqual(transfers, [
    {
      id: "transfer-friend-owner-5000",
      fromParticipantId: "friend",
      toParticipantId: "owner",
      amount: 5000,
      status: "pending"
    }
  ]);
});

test("legacy payer-by-expense routes do not accumulate after repayment mode changes", () => {
  const participants = [
    { id: "yarin", displayName: "Yarin" },
    { id: "harel", displayName: "Harel" },
    { id: "ariel", displayName: "Ariel" },
    { id: "maor", displayName: "Maor" }
  ];
  const expenses = [
    {
      id: "drinks",
      total: 17000,
      payers: [{ participantId: "maor", amount: 17000 }],
      sharedByParticipantIds: ["yarin", "harel", "ariel", "maor"]
    },
    {
      id: "taxi",
      total: 21000,
      payers: [{ participantId: "ariel", amount: 21000 }],
      sharedByParticipantIds: ["yarin", "harel", "ariel", "maor"]
    },
    {
      id: "ice",
      total: 1000,
      payers: [{ participantId: "ariel", amount: 1000 }],
      sharedByParticipantIds: ["yarin", "harel", "ariel", "maor"]
    }
  ];
  const paidTransfer = {
    id: "transfer-harel-maor-7200",
    fromParticipantId: "harel",
    toParticipantId: "maor",
    amount: 7200,
    status: "paid",
    markedPaidAt: "2026-08-15T22:47:01.103Z",
    statusUpdatedAt: "2026-08-15T22:47:01.103Z"
  };
  const event = {
    id: "event-lobby",
    name: "Lobby",
    participantIds: participants.map((participant) => participant.id),
    adminIds: ["yarin"],
    expenses,
    directSettlementTransfers: true,
    roundSettlementTransfers: true,
    settingsUpdatedAt: "2026-08-16T13:00:00.000Z"
  };
  const remote = {
    currentParticipantId: "harel",
    participants,
    groups: [],
    events: [{
      ...event,
      transfers: [
        paidTransfer,
        {
          id: "transfer-yarin-ariel-9700",
          fromParticipantId: "yarin",
          toParticipantId: "ariel",
          amount: 9700,
          status: "pending"
        },
        {
          id: "transfer-harel-ariel-2600",
          fromParticipantId: "harel",
          toParticipantId: "ariel",
          amount: 2600,
          status: "pending"
        }
      ]
    }]
  };
  const local = {
    currentParticipantId: "yarin",
    participants,
    groups: [],
    events: [{
      ...event,
      transfers: [
        paidTransfer,
        ...[
          ["yarin", "maor", 4200],
          ["ariel", "maor", 4200],
          ["maor", "ariel", 2900],
          ["yarin", "ariel", 5500],
          ["harel", "ariel", 5500],
          ["maor", "ariel", 5500]
        ].map(([fromParticipantId, toParticipantId, amount]) => ({
          id: `transfer-${fromParticipantId}-${toParticipantId}-${amount}`,
          fromParticipantId,
          toParticipantId,
          amount,
          status: "pending"
        }))
      ]
    }]
  };

  const transfers = mergeSharedStates(remote, local).events[0].transfers;
  const expectedTransfers = reconcileSettlementTransfers(
    participants,
    expenses,
    [paidTransfer],
    { directTransfers: true, roundTransfers: true }
  ).transfers;

  assert.deepEqual(
    transfers.map(({ fromParticipantId, toParticipantId, amount, status }) => ({
      fromParticipantId,
      toParticipantId,
      amount,
      status
    })),
    expectedTransfers.map(({ fromParticipantId, toParticipantId, amount, status }) => ({
      fromParticipantId,
      toParticipantId,
      amount,
      status
    }))
  );
  assert.equal(transfers.filter((transfer) => transfer.status === "paid").length, 1);
});

test("an expense deletion tombstone wins over a stale synced expense", () => {
  const remote = stateWithEvent({
    id: "event-1",
    expenses: [expense("expense-1", "2026-07-24T10:00:00.000Z", 1000)],
    deletedExpenses: [],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    expenses: [],
    deletedExpenses: [
      {
        id: "expense-1",
        deletedAt: "2026-07-24T11:00:00.000Z"
      }
    ],
    transfers: []
  });

  const [event] = mergeSharedStates(remote, local).events;
  assert.deepEqual(event.expenses, []);
  assert.equal(event.deletedExpenses.length, 1);
});

test("newer event settings survive an unrelated save from a stale device", () => {
  const remote = stateWithEvent({
    id: "event-1",
    adminsCanEditOnly: true,
    roundSettlementTransfers: false,
    directSettlementTransfers: true,
    settingsUpdatedAt: "2026-07-24T11:00:00.000Z",
    expenses: [],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    adminsCanEditOnly: false,
    roundSettlementTransfers: true,
    directSettlementTransfers: false,
    settingsUpdatedAt: "2026-07-24T10:00:00.000Z",
    expenses: [],
    transfers: []
  });

  const [event] = mergeSharedStates(remote, local).events;
  assert.equal(event.adminsCanEditOnly, true);
  assert.equal(event.roundSettlementTransfers, false);
  assert.equal(event.directSettlementTransfers, true);
  assert.equal(event.settingsUpdatedAt, "2026-07-24T11:00:00.000Z");
});

test("independent event settings from concurrent admins merge field by field", () => {
  const remote = stateWithEvent({
    id: "event-1",
    currency: "USD",
    roundSettlementTransfers: true,
    directSettlementTransfers: false,
    settingsUpdatedAt: "2026-08-19T11:00:00.000Z",
    settingsFieldUpdatedAt: {
      currency: "2026-08-19T11:00:00.000Z",
      roundSettlementTransfers: "2026-08-19T09:00:00.000Z",
      directSettlementTransfers: "2026-08-19T09:00:00.000Z"
    },
    expenses: [],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    currency: "ILS",
    roundSettlementTransfers: false,
    directSettlementTransfers: false,
    settingsUpdatedAt: "2026-08-19T12:00:00.000Z",
    settingsFieldUpdatedAt: {
      currency: "2026-08-19T09:00:00.000Z",
      roundSettlementTransfers: "2026-08-19T12:00:00.000Z",
      directSettlementTransfers: "2026-08-19T09:00:00.000Z"
    },
    expenses: [],
    transfers: []
  });

  const [event] = mergeSharedStates(remote, local).events;
  assert.equal(event.currency, "USD");
  assert.equal(event.roundSettlementTransfers, false);
  assert.equal(event.directSettlementTransfers, false);
  assert.equal(
    event.settingsFieldUpdatedAt.currency,
    "2026-08-19T11:00:00.000Z"
  );
  assert.equal(
    event.settingsFieldUpdatedAt.roundSettlementTransfers,
    "2026-08-19T12:00:00.000Z"
  );
});

test("newer event manager changes win without reviving a removed manager", () => {
  const remote = stateWithEvent({
    id: "event-1",
    participantIds: ["owner", "friend"],
    adminIds: ["friend"],
    adminIdsScopedToEvent: true,
    adminIdsUpdatedAt: "2026-08-11T11:00:00.000Z",
    expenses: [],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    participantIds: ["owner", "friend"],
    adminIds: ["owner", "friend"],
    adminIdsScopedToEvent: true,
    adminIdsUpdatedAt: "2026-08-11T10:00:00.000Z",
    settingsUpdatedAt: "2026-08-11T12:00:00.000Z",
    expenses: [],
    transfers: []
  });

  const [event] = mergeSharedStates(remote, local).events;
  assert.deepEqual(event.adminIds, ["friend"]);
  assert.equal(event.adminIdsScopedToEvent, true);
  assert.equal(event.adminIdsUpdatedAt, "2026-08-11T11:00:00.000Z");
});

test("a merged offline participant cannot return from a stale device", () => {
  const remote = {
    currentParticipantId: "real-user",
    participants: [
      { id: "offline-name", displayName: "Same Person", kind: "guest" },
      { id: "real-user", displayName: "Same Person", accountLinked: true }
    ],
    groups: [],
    events: [
      {
        id: "event-1",
        participantIds: ["offline-name", "real-user"],
        membershipUpdatedAtByParticipant: {
          "offline-name": "2026-07-24T10:00:00.000Z",
          "real-user": "2026-07-24T10:00:00.000Z"
        },
        adminIds: ["real-user"],
        participantAliases: { "offline-name": "Old alias" },
        expenses: [],
        transfers: []
      }
    ],
    deletedParticipants: []
  };
  const local = {
    currentParticipantId: "real-user",
    participants: [
      { id: "real-user", displayName: "Same Person", accountLinked: true }
    ],
    groups: [],
    events: [
      {
        id: "event-1",
        participantIds: ["real-user"],
        membershipUpdatedAtByParticipant: {
          "real-user": "2026-07-24T11:00:00.000Z"
        },
        adminIds: ["real-user"],
        participantAliases: {},
        membershipUpdatedAt: "2026-07-24T11:00:00.000Z",
        expenses: [],
        transfers: []
      }
    ],
    deletedParticipants: [
      {
        id: "offline-name",
        deletedAt: "2026-07-24T11:00:00.000Z",
        reason: "merged",
        targetParticipantId: "real-user"
      }
    ]
  };

  const merged = mergeSharedStates(remote, local);

  assert.deepEqual(merged.participants.map((participant) => participant.id), [
    "real-user"
  ]);
  assert.deepEqual(merged.events[0].participantIds, ["real-user"]);
  assert.deepEqual(merged.events[0].participantAliases, {});
  assert.deepEqual(
    Object.keys(merged.events[0].membershipUpdatedAtByParticipant),
    ["real-user"]
  );
});

test("late edits from a merged offline name are remapped to the kept account", () => {
  const deletedParticipants = [
    {
      id: "offline-name",
      reason: "merged",
      targetParticipantId: "connected-user",
      deletedAt: "2026-07-25T10:00:00.000Z"
    }
  ];
  const remote = {
    currentParticipantId: "connected-user",
    participants: [
      { id: "connected-user", displayName: "Yarin", accountLinked: true }
    ],
    groups: [],
    events: [],
    deletedParticipants
  };
  const local = {
    currentParticipantId: "offline-name",
    participants: [
      { id: "connected-user", displayName: "Yarin", accountLinked: true },
      { id: "offline-name", displayName: "Yarin" }
    ],
    groups: [],
    events: [
      {
        id: "event-1",
        participantIds: ["offline-name", "connected-user"],
        inactiveParticipantIds: ["offline-name"],
        adminIds: ["offline-name"],
        expenses: [
          {
            id: "expense-1",
            total: 1000,
            payers: [{ participantId: "offline-name", amount: 1000 }],
            sharedByParticipantIds: ["offline-name", "connected-user"]
          }
        ],
        transfers: []
      }
    ],
    deletedParticipants
  };

  const merged = mergeSharedStates(remote, local);
  const event = merged.events[0];

  assert.equal(merged.currentParticipantId, "connected-user");
  assert.deepEqual(event.participantIds, ["connected-user"]);
  assert.deepEqual(event.inactiveParticipantIds, []);
  assert.deepEqual(event.adminIds, ["connected-user"]);
  assert.deepEqual(event.expenses[0].payers, [
    { participantId: "connected-user", amount: 1000 }
  ]);
  assert.deepEqual(event.expenses[0].sharedByParticipantIds, ["connected-user"]);
});

test("opposite concurrent participant merges keep one identity and all money", () => {
  const expense = {
    id: "expense-1",
    total: 10000,
    payers: [{ participantId: "guest-a", amount: 10000 }],
    sharedByParticipantIds: ["guest-a", "guest-b"],
    updatedAt: "2026-07-27T10:00:00.000Z"
  };
  const remote = {
    currentParticipantId: "guest-b",
    participants: [{ id: "guest-b", displayName: "Yarin", accountLinked: true }],
    groups: [],
    events: [
      {
        id: "event-1",
        participantIds: ["guest-b"],
        adminIds: ["guest-b"],
        expenses: [
          {
            ...expense,
            payers: [{ participantId: "guest-b", amount: 10000 }],
            sharedByParticipantIds: ["guest-b"]
          }
        ],
        transfers: []
      }
    ],
    deletedParticipants: [
      {
        id: "guest-a",
        reason: "merged",
        targetParticipantId: "guest-b",
        deletedAt: "2026-07-27T10:01:00.000Z"
      }
    ]
  };
  const local = {
    currentParticipantId: "guest-a",
    participants: [{ id: "guest-a", displayName: "Yarin" }],
    groups: [],
    events: [
      {
        id: "event-1",
        participantIds: ["guest-a"],
        adminIds: ["guest-a"],
        expenses: [expense],
        transfers: []
      }
    ],
    deletedParticipants: [
      {
        id: "guest-b",
        reason: "merged",
        targetParticipantId: "guest-a",
        deletedAt: "2026-07-27T10:01:00.000Z"
      }
    ]
  };

  const merged = mergeSharedStates(remote, local);
  const event = merged.events[0];

  assert.deepEqual(merged.participants.map((participant) => participant.id), [
    "guest-b"
  ]);
  assert.equal(merged.currentParticipantId, "guest-b");
  assert.deepEqual(event.participantIds, ["guest-b"]);
  assert.deepEqual(event.adminIds, ["guest-b"]);
  assert.deepEqual(event.expenses[0].payers, [
    { participantId: "guest-b", amount: 10000 }
  ]);
  assert.deepEqual(event.expenses[0].sharedByParticipantIds, ["guest-b"]);
  assert.deepEqual(merged.deletedParticipants, [
    {
      id: "guest-a",
      reason: "merged",
      targetParticipantId: "guest-b",
      deletedAt: "2026-07-27T10:01:00.000Z"
    }
  ]);
});

test("event identity aliases and reviewed duplicate pairs sync across devices", () => {
  const remote = stateWithEvent({
    id: "event-1",
    participantIds: ["dani-one", "dani-two"],
    adminIds: [],
    participantAliases: {
      "dani-one": "Family"
    },
    distinctParticipantPairs: ["dani-one~dani-two"],
    expenses: [],
    transfers: []
  });
  const local = stateWithEvent({
    id: "event-1",
    participantIds: ["dani-one", "dani-two"],
    adminIds: [],
    participantAliases: {
      "dani-two": "Work"
    },
    distinctParticipantPairs: [],
    expenses: [],
    transfers: []
  });

  const [event] = mergeSharedStates(remote, local).events;

  assert.deepEqual(event.participantAliases, {
    "dani-one": "Family",
    "dani-two": "Work"
  });
  assert.deepEqual(event.distinctParticipantPairs, ["dani-one~dani-two"]);
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

function settlementState(event) {
  return {
    currentParticipantId: "owner",
    participants: [
      { id: "owner", displayName: "Owner" },
      { id: "friend", displayName: "Friend" }
    ],
    groups: [],
    events: [
      {
        participantIds: ["owner", "friend"],
        adminIds: ["owner"],
        expenses: [
          {
            id: "expense-1",
            total: 10000,
            payers: [{ participantId: "owner", amount: 10000 }],
            sharedByParticipantIds: ["owner", "friend"]
          }
        ],
        ...event
      }
    ]
  };
}

function baseState() {
  return {
    currentParticipantId: "yarin",
    participants: [{ id: "yarin", displayName: "Yarin Old" }],
    groups: [],
    events: [{
      id: "event-profile-test",
      name: "Profile test",
      participantIds: ["yarin"],
      adminIds: ["yarin"],
      expenses: [],
      transfers: []
    }]
  };
}

function expense(id, updatedAt, total) {
  return { id, updatedAt, total };
}
