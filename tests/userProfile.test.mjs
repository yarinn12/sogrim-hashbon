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
  const { profileUpdatedAt, ...participant } = nextState.participants.at(-1);
  assert.ok(Number.isFinite(Date.parse(profileUpdatedAt)));
  assert.deepEqual(participant, {
    id: "user-dani",
    displayName: "Dani Cohen",
    kind: "user"
  });
  assert.deepEqual(nextState.events[0].participantIds, ["yarin", "user-dani"]);
});

test("joining from an invite restores a previously removed account participant", () => {
  const state = {
    ...baseState,
    participants: [
      ...baseState.participants,
      {
        id: "user-dani",
        displayName: "Dani Cohen",
        kind: "user",
        authProvider: "google",
        authSubject: "google-dani"
      }
    ],
    events: [
      {
        ...baseState.events[0],
        participantIds: ["yarin", "user-dani"],
        inactiveParticipantIds: ["user-dani"]
      }
    ]
  };

  const nextState = ensureNamedParticipant(
    state,
    {
      id: "google-dani",
      displayName: "Dani Cohen",
      authProvider: "google",
      authSubject: "google-dani"
    },
    "event-1"
  );

  assert.deepEqual(nextState.events[0].participantIds, ["yarin", "user-dani"]);
  assert.deepEqual(nextState.events[0].inactiveParticipantIds, []);
  assert.ok(Number.isFinite(Date.parse(nextState.events[0].membershipUpdatedAt)));
});

test("an old invite cannot reactivate a participant removed from the event", () => {
  const state = {
    ...baseState,
    participants: [
      ...baseState.participants,
      {
        id: "user-dani",
        displayName: "Dani Cohen",
        kind: "user",
        authProvider: "google",
        authSubject: "google-dani"
      }
    ],
    events: [
      {
        ...baseState.events[0],
        participantIds: ["yarin", "user-dani"],
        inactiveParticipantIds: ["user-dani"],
        membershipUpdatedAt: "2026-07-26T08:00:00.000Z"
      }
    ]
  };

  const nextState = ensureNamedParticipant(
    state,
    {
      id: "google-dani",
      displayName: "Dani Cohen",
      authProvider: "google",
      authSubject: "google-dani"
    },
    "event-1",
    { reactivateInactive: false }
  );

  assert.equal(nextState.currentParticipantId, "user-dani");
  assert.deepEqual(nextState.events[0].inactiveParticipantIds, ["user-dani"]);
  assert.equal(
    nextState.events[0].membershipUpdatedAt,
    "2026-07-26T08:00:00.000Z"
  );
});

test("profile sync without an explicit join keeps a removed online user inactive", () => {
  const state = {
    ...baseState,
    participants: [
      ...baseState.participants,
      {
        id: "user-dani",
        displayName: "Dani Cohen",
        kind: "user",
        authProvider: "google",
        authSubject: "google-dani"
      }
    ],
    events: [
      {
        ...baseState.events[0],
        participantIds: ["yarin", "user-dani"],
        inactiveParticipantIds: ["user-dani"],
        membershipUpdatedAt: "2026-07-26T08:00:00.000Z"
      }
    ]
  };

  const nextState = ensureNamedParticipant(state, {
    id: "google-dani",
    displayName: "Dani Cohen",
    authProvider: "google",
    authSubject: "google-dani"
  });

  assert.deepEqual(nextState.events[0].inactiveParticipantIds, ["user-dani"]);
  assert.equal(nextState.events[0].membershipUpdatedAt, "2026-07-26T08:00:00.000Z");
});

test("ensureNamedParticipant saves a valid selected avatar preset", () => {
  const nextState = ensureNamedParticipant(
    baseState,
    {
      id: "user-dani",
      displayName: "Dani Cohen",
      avatarPreset: "avatar-5"
    },
    "event-1"
  );

  assert.equal(nextState.participants.at(-1).avatarPreset, "avatar-5");
});

test("ensureNamedParticipant saves and clears a safe custom profile image", () => {
  const avatarImage = "https://images.example.com/yarin.jpg";
  const withImage = ensureNamedParticipant(baseState, {
    id: "yarin",
    displayName: "Yarin Cohen",
    avatarPreset: "avatar-2",
    avatarImage
  });
  assert.equal(withImage.participants[0].avatarImage, avatarImage);

  const withoutImage = ensureNamedParticipant(withImage, {
    id: "yarin",
    displayName: "Yarin Cohen",
    avatarPreset: "avatar-2",
    avatarImage: ""
  });
  assert.equal(withoutImage.participants[0].avatarImage, "");
});

test("ensureNamedParticipant rejects an unknown avatar preset", () => {
  const nextState = ensureNamedParticipant(
    baseState,
    {
      id: "user-dani",
      displayName: "Dani Cohen",
      avatarPreset: "<script>"
    },
    "event-1"
  );

  assert.equal(nextState.participants.at(-1).avatarPreset, undefined);
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

test("ensureNamedParticipant keeps different people separate even when their names match", () => {
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

  assert.equal(nextState.currentParticipantId, "user-dani");
  assert.equal(nextState.participants.length, 3);
  assert.deepEqual(nextState.events[0].participantIds, ["yarin", "user-dani"]);
});

test("ensureNamedParticipant links a returning Google user by Google subject", () => {
  const state = {
    ...baseState,
    participants: [
      ...baseState.participants,
      {
        id: "dani-existing",
        displayName: "Dani Cohen",
        kind: "user",
        authProvider: "google",
        authSubject: "google-sub-1",
        email: "old@example.com"
      }
    ]
  };

  const nextState = ensureNamedParticipant(
    state,
    {
      id: "google-google-sub-1",
      displayName: "Dana Cohen",
      authProvider: "google",
      authSubject: "google-sub-1",
      email: "DANA@example.com"
    },
    "event-1"
  );

  assert.equal(nextState.currentParticipantId, "dani-existing");
  const { profileUpdatedAt, ...participant } = nextState.participants[1];
  assert.ok(Number.isFinite(Date.parse(profileUpdatedAt)));
  assert.deepEqual(participant, {
    id: "dani-existing",
    displayName: "Dana Cohen",
    kind: "user",
    authProvider: "google",
    authSubject: "google-sub-1",
    email: "dana@example.com"
  });
  assert.deepEqual(nextState.events[0].participantIds, ["yarin", "dani-existing"]);
});

test("restoring an unchanged account does not rewrite its profile timestamp", () => {
  const profileUpdatedAt = "2026-07-20T10:00:00.000Z";
  const state = {
    ...baseState,
    participants: [{
      id: "yarin",
      displayName: "Yarin Cohen",
      kind: "user",
      authProvider: "google",
      authSubject: "google-yarin",
      email: "yarin@example.com",
      profileUpdatedAt
    }]
  };

  const nextState = ensureNamedParticipant(state, {
    id: "google-yarin",
    displayName: "Yarin Cohen",
    authProvider: "google",
    authSubject: "google-yarin",
    email: "yarin@example.com"
  });

  assert.equal(nextState.participants[0].profileUpdatedAt, profileUpdatedAt);
});

test("equal provider subjects never merge identities from different providers", () => {
  const state = {
    ...baseState,
    participants: [{
      id: "apple-user",
      displayName: "Apple User",
      kind: "user",
      authProvider: "apple",
      authSubject: "shared-looking-subject"
    }]
  };

  const nextState = ensureNamedParticipant(state, {
    id: "google-user",
    displayName: "Google User",
    authProvider: "google",
    authSubject: "shared-looking-subject",
    email: "google@example.com"
  });

  assert.equal(nextState.participants.length, 2);
  assert.equal(nextState.currentParticipantId, "google-user");
});
