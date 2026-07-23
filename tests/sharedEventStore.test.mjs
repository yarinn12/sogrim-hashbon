import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSharedEventState,
  ensureEventShareCredentials,
  eventShareCredentials,
  mergeSharedEventIntoState
} from "../src/data/sharedEventStore.mjs";

test("event sharing creates credentials that are separate from the account workspace", () => {
  const event = { id: "event-1" };

  const credentials = ensureEventShareCredentials(event, {
    createId: () => "space-event-one",
    createKey: () => "event_share_key_12345678901234567890"
  });

  assert.deepEqual(credentials, {
    id: "space-event-one",
    key: "event_share_key_12345678901234567890"
  });
  assert.deepEqual(eventShareCredentials(event), credentials);
});

test("shared event payload contains only the selected event and its people", () => {
  const payload = buildSharedEventState(
    {
      participants: [
        { id: "a", displayName: "A", email: "private@example.com" },
        { id: "b", displayName: "B" },
        { id: "private", displayName: "Private" }
      ],
      groups: [{ id: "private-group", name: "Private group" }],
      events: [
        {
          id: "event-1",
          name: "Shared",
          participantIds: ["a", "b"],
          adminIds: ["a"],
          expenses: [],
          transfers: [],
          groupId: "private-group",
          sharedSpaceId: "space-event-one",
          sharedSpaceKey: "event_share_key_12345678901234567890"
        },
        {
          id: "private-event",
          name: "Private",
          participantIds: ["private"],
          expenses: [],
          transfers: []
        }
      ]
    },
    "event-1"
  );

  assert.deepEqual(payload.events.map((event) => event.id), ["event-1"]);
  assert.deepEqual(payload.participants.map((participant) => participant.id), ["a", "b"]);
  assert.deepEqual(payload.groups, []);
  assert.equal(payload.participants[0].email, undefined);
  assert.equal(payload.events[0].groupId, undefined);
  assert.equal(payload.events[0].sharedSpaceKey, undefined);
});

test("incoming event data cannot inject unrelated events into the account", () => {
  const localState = {
    currentParticipantId: "local",
    participants: [{ id: "local", displayName: "Local" }],
    groups: [{ id: "local-group", name: "Local group" }],
    events: [{ id: "local-event", participantIds: ["local"], expenses: [], transfers: [] }]
  };
  const incoming = {
    currentParticipantId: "attacker",
    participants: [
      { id: "a", displayName: "A" },
      { id: "hidden", displayName: "Hidden" }
    ],
    groups: [{ id: "injected-group", name: "Injected" }],
    events: [
      { id: "event-1", participantIds: ["a"], adminIds: [], expenses: [], transfers: [] },
      { id: "injected-event", participantIds: ["hidden"], expenses: [], transfers: [] }
    ]
  };

  const merged = mergeSharedEventIntoState(localState, incoming, {
    id: "space-event-one",
    key: "event_share_key_12345678901234567890"
  });

  assert.equal(merged.currentParticipantId, "local");
  assert.deepEqual(merged.events.map((event) => event.id), ["event-1", "local-event"]);
  assert.deepEqual(merged.groups, localState.groups);
  assert.deepEqual(merged.participants.map((participant) => participant.id), ["a", "local"]);
  assert.equal(merged.events[0].sharedSpaceId, "space-event-one");
});

test("a shared event deletion removes a stale local copy and keeps retry credentials", () => {
  const localState = {
    currentParticipantId: "local",
    participants: [{ id: "local", displayName: "Local" }],
    groups: [],
    events: [
      {
        id: "event-1",
        participantIds: ["local"],
        expenses: [],
        transfers: []
      }
    ]
  };
  const incoming = {
    currentParticipantId: "",
    participants: [],
    groups: [],
    events: [],
    deletedEvents: [
      { id: "event-1", deletedAt: "2026-07-19T15:00:00.000Z" }
    ]
  };

  const merged = mergeSharedEventIntoState(localState, incoming, {
    id: "space-event-one",
    key: "event_share_key_12345678901234567890"
  });

  assert.deepEqual(merged.events, []);
  assert.equal(merged.currentParticipantId, "local");
  assert.deepEqual(merged.deletedEvents, [
    {
      id: "event-1",
      deletedAt: "2026-07-19T15:00:00.000Z",
      sharedSpaceId: "space-event-one",
      sharedSpaceKey: "event_share_key_12345678901234567890"
    }
  ]);
});
