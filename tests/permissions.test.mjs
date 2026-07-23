import test from "node:test";
import assert from "node:assert/strict";

import {
  canEditEvent,
  canManageEventSettings,
  eventAdminIds
} from "../src/domain/permissions.mjs";
import { setEventAdminsCanEditOnly } from "../src/domain/appActions.mjs";

function baseState() {
  return {
    currentParticipantId: "yarin",
    participants: [
      { id: "yarin", displayName: "ירין", kind: "user" },
      { id: "dani", displayName: "דני", kind: "user" },
      { id: "avi", displayName: "אבי", kind: "user" }
    ],
    groups: [
      {
        id: "group-1",
        name: "חמישי",
        memberIds: ["yarin", "dani", "avi"],
        adminIds: ["yarin"],
        archived: false
      }
    ],
    events: [
      {
        id: "event-1",
        name: "יציאה",
        groupId: "group-1",
        participantIds: ["yarin", "dani", "avi"],
        expenses: [],
        transfers: [],
        adminsCanEditOnly: true,
        locked: false,
        createdAt: "2026-05-23T00:00:00.000Z"
      }
    ]
  };
}

test("group admins manage and edit restricted group events", () => {
  const state = baseState();
  const event = state.events[0];

  assert.deepEqual(eventAdminIds(state, event), ["yarin"]);
  assert.equal(canManageEventSettings(state, event, "yarin"), true);
  assert.equal(canEditEvent(state, event, "yarin"), true);
});

test("group events use group admins even when the event has a creator admin", () => {
  const state = baseState();
  const event = { ...state.events[0], adminIds: ["dani"] };

  assert.deepEqual(eventAdminIds(state, event), ["yarin"]);
  assert.equal(canEditEvent(state, event, "yarin"), true);
  assert.equal(canEditEvent(state, event, "dani"), false);
});

test("regular participants cannot edit when an event is restricted to admins", () => {
  const state = baseState();
  const event = state.events[0];

  assert.equal(canManageEventSettings(state, event, "dani"), false);
  assert.equal(canEditEvent(state, event, "dani"), false);
});

test("everyone can edit unrestricted events unless the event is locked", () => {
  const state = baseState();
  const event = { ...state.events[0], adminsCanEditOnly: false };

  assert.equal(canEditEvent(state, event, "dani"), true);
  assert.equal(canEditEvent(state, { ...event, locked: true }, "yarin"), false);
});

test("standalone events use their own admin ids", () => {
  const state = baseState();
  const event = {
    ...state.events[0],
    groupId: undefined,
    adminIds: ["avi"],
    adminsCanEditOnly: true
  };

  assert.deepEqual(eventAdminIds(state, event), ["avi"]);
  assert.equal(canEditEvent(state, event, "avi"), true);
  assert.equal(canEditEvent(state, event, "yarin"), false);
});

test("setEventAdminsCanEditOnly updates only the selected event", () => {
  const state = {
    ...baseState(),
    events: [
      ...baseState().events,
      {
        id: "event-2",
        name: "אירוע אחר",
        participantIds: ["yarin"],
        expenses: [],
        transfers: [],
        adminsCanEditOnly: false,
        locked: false,
        createdAt: "2026-05-23T00:00:00.000Z"
      }
    ]
  };

  const nextState = setEventAdminsCanEditOnly(state, "event-1", false);

  assert.equal(nextState.events[0].adminsCanEditOnly, false);
  assert.equal(nextState.events[1].adminsCanEditOnly, false);
});
