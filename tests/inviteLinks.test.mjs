import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEventInviteSnapshot,
  buildEventInviteUrl,
  mergeInviteSnapshotIntoState,
  parseInviteEventId,
  parseInviteSnapshot
} from "../src/domain/inviteLinks.mjs";

test("buildEventInviteUrl creates a clean event invite URL", () => {
  const url = buildEventInviteUrl("http://127.0.0.1:4173/?event=old", "event-123");

  assert.equal(url, "http://127.0.0.1:4173/?event=event-123");
});

test("buildEventInviteUrl can carry an event snapshot for a new visitor", () => {
  const url = buildEventInviteUrl("https://sogrim-hashbon.vercel.app/", "event-123", {
    version: 1,
    participants: [{ id: "yarin", displayName: "Yarin Cohen", kind: "user" }],
    groups: [],
    event: {
      id: "event-123",
      name: "Taxi",
      participantIds: ["yarin"],
      adminIds: ["yarin"],
      createdByParticipantId: "yarin",
      expenses: [],
      transfers: []
    }
  });

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("event"), "event-123");
  assert.ok(parsed.searchParams.get("invite"));
  assert.equal(parseInviteSnapshot(url).event.id, "event-123");
});

test("buildEventInviteUrl can carry a shared cloud space for invitees", () => {
  const url = buildEventInviteUrl(
    "https://sogrim-hashbon.vercel.app/dashboard?old=1",
    "event-123",
    null,
    {
      spaceId: "space-friends-night",
      spaceKey: "abcdefghijklmnopqrstuvwxyz_123456"
    }
  );

  const parsed = new URL(url);

  assert.equal(parsed.searchParams.get("event"), "event-123");
  assert.equal(parsed.searchParams.get("space"), "space-friends-night");
  assert.equal(parsed.searchParams.get("key"), "abcdefghijklmnopqrstuvwxyz_123456");
  assert.equal(parsed.searchParams.has("old"), false);
});

test("buildEventInviteUrl creates a compact cloud invite without a snapshot", () => {
  const url = buildEventInviteUrl(
    "https://sogrim-hashbon.vercel.app/?old=1",
    "event-123",
    {
      version: 2,
      participants: [],
      groups: [],
      event: { id: "event-123", name: "Dinner", participantIds: [] }
    },
    {
      spaceId: "space-friends-night",
      spaceKey: "abcdefghijklmnopqrstuvwxyzABCDEF",
      compact: true
    }
  );

  assert.equal(
    url,
    "https://sogrim-hashbon.vercel.app/i/event-123/space-friends-night/abcdefghijklmnopqrstuvwxyzABCDEF"
  );
  assert.equal(parseInviteEventId(url), "event-123");
  assert.equal(parseInviteSnapshot(url), null);
});

test("parseInviteEventId reads an event id from a URL", () => {
  assert.equal(
    parseInviteEventId("http://127.0.0.1:4173/?event=event-123"),
    "event-123"
  );
});

test("parseInviteEventId returns null when the link is not an invite", () => {
  assert.equal(parseInviteEventId("http://127.0.0.1:4173/"), null);
});

test("invite event ids reject attribute-breaking and oversized values", () => {
  const attributeAttack = new URL("https://example.com/");
  attributeAttack.searchParams.set("event", 'event-1" onclick="alert(1)');
  const oversized = new URL("https://example.com/");
  oversized.searchParams.set("event", "a".repeat(129));

  assert.equal(parseInviteEventId(attributeAttack.toString()), null);
  assert.equal(parseInviteEventId(oversized.toString()), null);
  assert.equal(parseInviteEventId("not a valid URL"), null);
  assert.throws(
    () => buildEventInviteUrl("https://example.com/", "<img_src=x>"),
    /eventId must be a safe identifier/
  );
});

test("parseInviteSnapshot rejects unsupported snapshot versions", () => {
  const url = new URL("https://example.com/");
  url.searchParams.set(
    "invite",
    JSON.stringify({
      version: 99,
      participants: [],
      groups: [],
      event: { id: "event-1", name: "Future format", participantIds: [] }
    })
  );

  assert.equal(parseInviteSnapshot(url.toString()), null);
});

test("parseInviteSnapshot rejects unsafe identifiers anywhere in the payload", () => {
  const snapshots = [
    {
      version: 2,
      participants: [{ id: 'user-1" autofocus', displayName: "User One" }],
      groups: [],
      event: { id: "event-1", participantIds: [] }
    },
    {
      version: 2,
      participants: [],
      groups: [{ id: "group-1", memberIds: ["user-1<script>"] }],
      event: { id: "event-1", participantIds: [] }
    },
    {
      version: 2,
      participants: [],
      groups: [],
      event: {
        id: "event-1",
        participantIds: ["safe-user"],
        expenses: [{ id: "expense/../../bad" }]
      }
    },
    {
      version: 2,
      participants: [],
      groups: [],
      event: { id: "a".repeat(129), participantIds: [] }
    }
  ];

  for (const snapshot of snapshots) {
    const url = new URL("https://example.com/");
    url.searchParams.set("invite", JSON.stringify(snapshot));
    assert.equal(parseInviteSnapshot(url.toString()), null);
  }
});

test("buildEventInviteUrl rejects unsafe snapshot and cloud identifiers", () => {
  const unsafeSnapshot = {
    version: 2,
    participants: [{ id: "safe-user", displayName: "Safe User" }],
    groups: [],
    event: { id: "event-1", participantIds: ['safe-user" data-x="bad'] }
  };

  assert.throws(
    () => buildEventInviteUrl("https://example.com/", "event-1", unsafeSnapshot),
    /Invalid invite snapshot/
  );
  assert.throws(
    () =>
      buildEventInviteUrl("https://example.com/", "event-1", null, {
        spaceId: "../shared-space"
      }),
    /spaceId must be a safe identifier/
  );
  assert.throws(
    () =>
      buildEventInviteUrl("https://example.com/", "event-1", null, {
        spaceKey: "key with spaces"
      }),
    /spaceKey must be a safe identifier/
  );
});

test("buildEventInviteSnapshot includes a safe preview without money or admin data", () => {
  const snapshot = buildEventInviteSnapshot(
    {
      participants: [
        { id: "yarin", displayName: "Yarin Cohen", kind: "user" },
        { id: "dani", displayName: "Dani Levi", kind: "user" },
        { id: "unused", displayName: "Unused User", kind: "user" }
      ],
      groups: [{ id: "friends", name: "Friends", memberIds: ["yarin"], adminIds: ["yarin"] }],
      events: [
        {
          id: "event-123",
          name: "Taxi",
          eventType: "trip",
          currency: "USD",
          groupId: "friends",
          participantIds: ["yarin"],
          adminIds: ["yarin"],
          createdByParticipantId: "yarin",
          expenses: [
            {
              id: "expense-1",
              name: "Taxi",
              total: 100,
              createdByParticipantId: "yarin",
              sharedByParticipantIds: ["yarin", "dani"],
              payers: [{ participantId: "dani", amount: 100 }]
            }
          ],
          transfers: []
        }
      ]
    },
    "event-123"
  );

  assert.equal(snapshot.event.id, "event-123");
  assert.equal(snapshot.event.eventType, "trip");
  assert.equal(snapshot.event.currency, "USD");
  assert.deepEqual(snapshot.participants.map((participant) => participant.id), ["yarin", "dani"]);
  assert.deepEqual(snapshot.groups, []);
  assert.deepEqual(snapshot.event.adminIds, []);
  assert.deepEqual(snapshot.event.expenses, []);
  assert.deepEqual(snapshot.event.transfers, []);
  assert.equal(snapshot.event.locked, true);
  assert.equal(snapshot.participants[0].email, undefined);
});

test("mergeInviteSnapshotIntoState imports a missing invited event", () => {
  const state = {
    currentParticipantId: "guest",
    participants: [{ id: "guest", displayName: "Guest User", kind: "user" }],
    groups: [],
    events: []
  };
  const snapshot = {
    version: 1,
    participants: [{ id: "yarin", displayName: "Yarin Cohen", kind: "user" }],
    groups: [{ id: "friends", name: "Friends", memberIds: ["yarin"], adminIds: ["yarin"] }],
    event: {
      id: "event-123",
      name: "Taxi",
      groupId: "friends",
      participantIds: ["yarin"],
      adminIds: ["yarin"],
      createdByParticipantId: "yarin",
      expenses: [],
      transfers: []
    }
  };

  const nextState = mergeInviteSnapshotIntoState(state, snapshot);

  assert.equal(nextState.currentParticipantId, "guest");
  assert.deepEqual(nextState.participants.map((participant) => participant.id), ["guest", "yarin"]);
  assert.deepEqual(nextState.groups.map((group) => group.id), ["friends"]);
  assert.deepEqual(nextState.events.map((event) => event.id), ["event-123"]);
  assert.deepEqual(nextState.events[0].adminIds, []);
  assert.equal(nextState.events[0].locked, true);
});

test("a deleted event cannot be restored by an old invite snapshot", () => {
  const state = {
    currentParticipantId: "guest",
    participants: [{ id: "guest", displayName: "Guest User", kind: "user" }],
    groups: [],
    events: [],
    deletedEvents: [
      { id: "event-123", deletedAt: "2026-07-19T15:00:00.000Z" }
    ]
  };
  const snapshot = {
    version: 2,
    participants: [{ id: "yarin", displayName: "Yarin Cohen", kind: "user" }],
    groups: [],
    event: {
      id: "event-123",
      name: "Old invite",
      participantIds: ["yarin"]
    }
  };

  assert.equal(mergeInviteSnapshotIntoState(state, snapshot), state);
});

test("mergeInviteSnapshotIntoState never elevates permissions or imports money from a link", () => {
  const state = {
    currentParticipantId: "guest",
    participants: [{ id: "guest", displayName: "Guest User", kind: "user" }],
    groups: [],
    events: [
      {
        id: "event-123",
        name: "Taxi",
        groupId: "",
        participantIds: ["guest"],
        adminIds: [],
        createdByParticipantId: "",
        expenses: [],
        transfers: []
      }
    ]
  };
  const snapshot = {
    version: 1,
    participants: [{ id: "yarin", displayName: "Yarin Cohen", kind: "user" }],
    groups: [{ id: "friends", name: "Friends", memberIds: ["yarin"], adminIds: ["yarin"] }],
    event: {
      id: "event-123",
      name: "Taxi",
      groupId: "friends",
      participantIds: ["yarin"],
      adminIds: ["yarin"],
      createdByParticipantId: "yarin",
      expenses: [{ id: "expense-1", name: "Taxi", total: 80, sharedByParticipantIds: ["yarin"], payers: [] }],
      transfers: [{ id: "transfer-1", fromParticipantId: "guest", toParticipantId: "yarin", amount: 40 }]
    }
  };

  const nextState = mergeInviteSnapshotIntoState(state, snapshot);
  const event = nextState.events[0];

  assert.deepEqual(nextState.participants.map((participant) => participant.id), ["guest", "yarin"]);
  assert.deepEqual(nextState.groups.map((group) => group.id), ["friends"]);
  assert.deepEqual(event.participantIds, ["guest", "yarin"]);
  assert.deepEqual(event.adminIds, []);
  assert.equal(event.groupId, "");
  assert.equal(event.createdByParticipantId, "");
  assert.deepEqual(event.expenses, []);
  assert.deepEqual(event.transfers, []);
});

test("mergeInviteSnapshotIntoState refuses an invalid snapshot without changing state", () => {
  const state = {
    currentParticipantId: "guest",
    participants: [{ id: "guest", displayName: "Guest User", kind: "user" }],
    groups: [],
    events: []
  };
  const snapshot = {
    version: 2,
    participants: [{ id: "attacker", displayName: "Attacker" }],
    groups: [],
    event: {
      id: "event-1",
      participantIds: ["attacker"],
      adminIds: ['attacker" onclick="alert(1)']
    }
  };

  assert.equal(mergeInviteSnapshotIntoState(state, snapshot), state);
});
