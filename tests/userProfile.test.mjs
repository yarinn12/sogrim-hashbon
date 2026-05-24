import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureNamedParticipant,
  normalizeProfileName
} from "../src/domain/userProfile.mjs";

const baseState = {
  currentParticipantId: "yarin",
  participants: [{ id: "yarin", displayName: "Yarin", kind: "user" }],
  groups: [],
  events: [
    {
      id: "event-1",
      name: "Night out",
      groupId: null,
      participantIds: ["yarin"],
      expenses: []
    }
  ]
};

test("normalizeProfileName trims repeated spaces from a visitor name", () => {
  assert.equal(normalizeProfileName("  Dani   Cohen  "), "Dani Cohen");
});

test("ensureNamedParticipant adds a named user to an invited event", () => {
  const nextState = ensureNamedParticipant(
    baseState,
    { id: "user-dani", displayName: " Dani Cohen " },
    "event-1"
  );

  assert.equal(nextState.currentParticipantId, "user-dani");
  assert.deepEqual(nextState.participants.at(-1), {
    id: "user-dani",
    displayName: "Dani Cohen",
    kind: "user"
  });
  assert.deepEqual(nextState.events[0].participantIds, ["yarin", "user-dani"]);
});

test("ensureNamedParticipant ignores a profile without first and last name", () => {
  const nextState = ensureNamedParticipant(
    baseState,
    { id: "user-dani", displayName: "Dani" },
    "event-1"
  );

  assert.equal(nextState.currentParticipantId, "yarin");
  assert.equal(nextState.participants.length, 1);
  assert.deepEqual(nextState.events[0].participantIds, ["yarin"]);
});

test("ensureNamedParticipant reuses an existing participant with the same name", () => {
  const state = {
    ...baseState,
    participants: [
      ...baseState.participants,
      { id: "dani-existing", displayName: "Dani Cohen", kind: "user" }
    ]
  };

  const nextState = ensureNamedParticipant(
    state,
    { id: "user-dani", displayName: "dani cohen" },
    "event-1"
  );

  assert.equal(nextState.currentParticipantId, "dani-existing");
  assert.equal(nextState.participants.length, 2);
  assert.deepEqual(nextState.events[0].participantIds, ["yarin", "dani-existing"]);
});
