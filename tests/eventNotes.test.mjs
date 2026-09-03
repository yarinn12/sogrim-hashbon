import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_EVENT_NOTE_BODY_LENGTH,
  addEventNote,
  removeEventNote,
  updateEventNote,
  validateSharedStateNotes
} from "../src/domain/eventNotes.mjs";
import { mergeSharedStates } from "../src/domain/sharedStateMerge.mjs";
import { buildSharedEventState } from "../src/data/sharedEventStore.mjs";
import { validateSharedStatePayload } from "../src/server/stateValidation.mjs";

test("event members can create a bounded shared note", () => {
  const state = baseState();
  const created = addEventNote(state, "event-1", {
    id: "note-trip-plan",
    title: "הטיסה לפיליפינים",
    body: "לבדוק דרכונים וכרטיסים",
    createdAt: "2026-08-29T10:00:00.000Z"
  });

  assert.equal(state.events[0].notes, undefined);
  assert.deepEqual(created.events[0].notes, [
    {
      id: "note-trip-plan",
      title: "הטיסה לפיליפינים",
      body: "לבדוק דרכונים וכרטיסים",
      pinned: false,
      createdAt: "2026-08-29T10:00:00.000Z",
      updatedAt: "2026-08-29T10:00:00.000Z",
      fieldUpdatedAt: {
        title: "2026-08-29T10:00:00.000Z",
        body: "2026-08-29T10:00:00.000Z",
        pinned: "2026-08-29T10:00:00.000Z"
      },
      createdByParticipantId: "owner",
      updatedByParticipantId: "owner"
    }
  ]);
});

test("notes reject empty, unsafe, oversized, closed and unauthorized writes", () => {
  const state = baseState();
  assert.equal(addEventNote(state, "event-1", { id: "note-empty" }), state);
  assert.equal(
    addEventNote(state, "event-1", { id: "note/unsafe", body: "x" }),
    state
  );
  assert.equal(
    addEventNote(state, "event-1", {
      id: "note-large",
      body: "x".repeat(MAX_EVENT_NOTE_BODY_LENGTH + 1)
    }),
    state
  );
  const outsiderState = { ...state, currentParticipantId: "outsider" };
  assert.equal(
    addEventNote(outsiderState, "event-1", {
      id: "note-outsider",
      body: "x",
      participantId: "outsider"
    }),
    outsiderState
  );
  const closedState = {
    ...state,
    events: [{ ...state.events[0], locked: true }]
  };
  assert.equal(
    addEventNote(closedState, "event-1", { id: "note-closed", body: "x" }),
    closedState
  );
});

test("editing a note is monotonic and records the editor", () => {
  const original = withNote(baseState(), {
    id: "note-1",
    title: "ישן",
    body: "תוכן",
    createdAt: "2026-08-29T10:00:00.000Z",
    updatedAt: "2026-08-29T10:00:00.000Z",
    createdByParticipantId: "owner",
    updatedByParticipantId: "owner"
  });
  const edited = updateEventNote(original, "event-1", "note-1", {
    title: "מעודכן",
    participantId: "friend",
    updatedAt: "2026-08-29T10:00:00.000Z"
  });

  assert.equal(edited.events[0].notes[0].title, "מעודכן");
  assert.equal(edited.events[0].notes[0].body, "תוכן");
  assert.equal(
    edited.events[0].notes[0].updatedAt,
    "2026-08-29T10:00:00.001Z"
  );
  assert.equal(edited.events[0].notes[0].updatedByParticipantId, "friend");
});

test("pinning a note is a conflict-safe edit", () => {
  const original = withNote(baseState(), note("note-1", "2026-08-29T10:00:00.000Z"));
  const pinned = updateEventNote(original, "event-1", "note-1", {
    pinned: true,
    participantId: "friend",
    updatedAt: "2026-08-29T10:01:00.000Z"
  });

  assert.equal(pinned.events[0].notes[0].pinned, true);
  assert.equal(pinned.events[0].notes[0].updatedByParticipantId, "friend");
  assert.equal(pinned.events[0].notes[0].updatedAt, "2026-08-29T10:01:00.000Z");
  assert.equal(
    mergeSharedStates(original, pinned).events[0].notes[0].pinned,
    true
  );

  const unpinned = updateEventNote(pinned, "event-1", "note-1", {
    pinned: false,
    updatedAt: "2026-08-29T10:02:00.000Z"
  });
  assert.equal(unpinned.events[0].notes[0].pinned, false);
});

test("deleting a note records a tombstone and remains idempotent", () => {
  const state = withNote(baseState(), note("note-1", "2026-08-29T10:00:00.000Z"));
  const removed = removeEventNote(state, "event-1", "note-1", {
    participantId: "friend",
    deletedAt: "2026-08-29T10:00:00.000Z"
  });

  assert.deepEqual(removed.events[0].notes, []);
  assert.deepEqual(removed.events[0].deletedNotes, [
    {
      id: "note-1",
      deletedAt: "2026-08-29T10:00:00.001Z",
      deletedByParticipantId: "friend"
    }
  ]);
  assert.equal(removeEventNote(removed, "event-1", "note-1"), removed);
});

test("concurrent note additions from two devices are both preserved", () => {
  const remote = withNote(baseState(), note("note-remote", "2026-08-29T10:00:00.000Z"));
  const local = withNote(baseState(), note("note-local", "2026-08-29T10:01:00.000Z"));

  const merged = mergeSharedStates(remote, local);

  assert.deepEqual(
    merged.events[0].notes.map((item) => item.id),
    ["note-local", "note-remote"]
  );
  assert.deepEqual(
    mergeSharedStates(local, remote).events[0].notes.map((item) => item.id),
    ["note-local", "note-remote"]
  );
});

test("a shared note reaches a device whose local event keeps a group merge clock", () => {
  const remote = withNote(
    baseState(),
    note("note-from-other-device", "2026-09-03T05:21:27.774Z")
  );
  const localBase = baseState();
  const local = {
    ...localBase,
    groups: [
      {
        id: "group-1",
        name: "Trip group",
        memberIds: ["owner", "friend"],
        adminIds: ["owner"]
      }
    ],
    events: [
      {
        ...localBase.events[0],
        groupId: "group-1",
        settingsUpdatedAt: "2026-09-03T05:20:33.129Z",
        settingsFieldUpdatedAt: {
          groupId: "2026-09-03T05:20:33.129Z"
        }
      }
    ]
  };

  const merged = mergeSharedStates(remote, local);

  assert.equal(merged.events[0].groupId, "group-1");
  assert.equal(merged.events[0].notes[0].id, "note-from-other-device");
});

test("the newest concurrent note edit wins deterministically", () => {
  const remote = withNote(
    baseState(),
    { ...note("note-1", "2026-08-29T10:02:00.000Z"), body: "remote" }
  );
  const local = withNote(
    baseState(),
    { ...note("note-1", "2026-08-29T10:03:00.000Z"), body: "local" }
  );

  assert.equal(mergeSharedStates(remote, local).events[0].notes[0].body, "local");
  assert.equal(mergeSharedStates(local, remote).events[0].notes[0].body, "local");
});

test("a deleted shared note cannot return from a stale device", () => {
  const remote = withNote(
    baseState(),
    { ...note("note-1", "2026-08-29T12:00:00.000Z"), body: "stale edit" }
  );
  const local = {
    ...baseState(),
    events: [
      {
        ...baseState().events[0],
        notes: [],
        deletedNotes: [
          {
            id: "note-1",
            deletedAt: "2026-08-29T11:00:00.000Z",
            deletedByParticipantId: "owner"
          }
        ]
      }
    ]
  };

  const event = mergeSharedStates(remote, local).events[0];
  assert.deepEqual(event.notes, []);
  assert.equal(event.deletedNotes[0].id, "note-1");
});

test("shared note validation rejects unsafe content and foreign authors", () => {
  const invalid = withNote(baseState(), {
    ...note("note-1", "2026-08-29T10:00:00.000Z"),
    body: "x".repeat(MAX_EVENT_NOTE_BODY_LENGTH + 1),
    updatedByParticipantId: "missing"
  });
  const errors = validateSharedStateNotes(invalid);

  assert.ok(errors.some((error) => error.includes("body must be a string")));
  assert.ok(errors.some((error) => error.includes("known participant")));
  const payloadValidation = validateSharedStatePayload(invalid);
  assert.equal(payloadValidation.ok, false);
  assert.ok(
    payloadValidation.errors.some((error) => error.includes("known participant"))
  );
});

test("shared-event snapshots include historical note authors", () => {
  const state = {
    ...baseState(),
    participants: [
      ...baseState().participants,
      { id: "former-member", displayName: "Former member" }
    ],
    events: [
      {
        ...baseState().events[0],
        notes: [
          {
            ...note("note-history", "2026-08-29T10:00:00.000Z"),
            createdByParticipantId: "former-member",
            updatedByParticipantId: "former-member"
          }
        ]
      }
    ]
  };

  const payload = buildSharedEventState(state, "event-1");
  assert.ok(
    payload.participants.some((participant) => participant.id === "former-member")
  );
});

function baseState() {
  return {
    currentParticipantId: "owner",
    participants: [
      { id: "owner", displayName: "Owner" },
      { id: "friend", displayName: "Friend" },
      { id: "outsider", displayName: "Outsider" }
    ],
    groups: [],
    events: [
      {
        id: "event-1",
        name: "Trip",
        participantIds: ["owner", "friend"],
        adminIds: ["owner"],
        adminsCanEditOnly: false,
        locked: false,
        expenses: [],
        transfers: []
      }
    ]
  };
}

function withNote(state, savedNote) {
  return {
    ...state,
    events: [{ ...state.events[0], notes: [savedNote] }]
  };
}

function note(id, updatedAt) {
  return {
    id,
    title: "רשימה",
    body: "תוכן",
    createdAt: "2026-08-29T10:00:00.000Z",
    updatedAt,
    createdByParticipantId: "owner",
    updatedByParticipantId: "owner"
  };
}
