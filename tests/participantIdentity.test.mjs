import test from "node:test";
import assert from "node:assert/strict";

import {
  duplicateParticipantNameGroups,
  duplicateParticipantPairKey,
  findOfflineParticipantByName,
  normalizeParticipantDisplayName,
  participantEventDisplayName,
  remapParticipantPairKeys,
  unresolvedDuplicateParticipantPairs
} from "../src/domain/participantIdentity.mjs";

const participants = [
  {
    id: "connected-dani",
    displayName: "דני כהן",
    kind: "user",
    authProvider: "google",
    authSubject: "google-dani"
  },
  { id: "manual-dani", displayName: "  דני   כהן ", kind: "guest" },
  { id: "other", displayName: "אבי לוי", kind: "user" }
];

test("duplicate participant names normalize spacing and letter case", () => {
  assert.equal(normalizeParticipantDisplayName("  Dani   Cohen "), "dani cohen");
  assert.equal(
    normalizeParticipantDisplayName("דָּנִי כֹּהֵן"),
    normalizeParticipantDisplayName("דני כהן")
  );
  assert.deepEqual(
    duplicateParticipantNameGroups(participants).map((group) =>
      group.map((participant) => participant.id)
    ),
    [["connected-dani", "manual-dani"]]
  );
});

test("manual name entry reuses an exact normalized offline participant", () => {
  assert.equal(
    findOfflineParticipantByName(participants, "  דני   כהן  ")?.id,
    "manual-dani"
  );
  assert.equal(findOfflineParticipantByName(participants, "אבי לוי"), null);
});

test("same names remain separate and receive deterministic identity labels", () => {
  const event = {
    participantIds: ["connected-dani", "manual-dani", "other"]
  };

  assert.equal(
    participantEventDisplayName(participants, event, "connected-dani"),
    "דני כהן · משתמש"
  );
  assert.equal(
    participantEventDisplayName(participants, event, "manual-dani"),
    "דני כהן · שם אופליין"
  );
  assert.equal(
    participantEventDisplayName(participants, event, "other"),
    "אבי לוי"
  );
});

test("event aliases override generated qualifiers without changing the saved name", () => {
  const event = {
    participantIds: ["connected-dani", "manual-dani"],
    participantAliases: {
      "connected-dani": "בן דוד",
      "manual-dani": "מהעבודה"
    }
  };

  assert.equal(
    participantEventDisplayName(participants, event, "connected-dani"),
    "דני כהן · בן דוד"
  );
  assert.equal(
    participantEventDisplayName(participants, event, "manual-dani"),
    "דני כהן · מהעבודה"
  );
});

test("an account and a manual name are offered for review but never auto-merged", () => {
  const event = {
    participantIds: ["connected-dani", "manual-dani", "other"]
  };
  const [pair] = unresolvedDuplicateParticipantPairs(participants, event);

  assert.equal(pair.key, duplicateParticipantPairKey("connected-dani", "manual-dani"));
  assert.equal(pair.mergeSourceId, "manual-dani");
  assert.equal(pair.mergeTargetId, "connected-dani");
  assert.equal(participants.length, 3);
});

test("two legacy offline records with the same name can be merged explicitly", () => {
  const offlineParticipants = [
    { id: "manual-dani-old", displayName: "דני כהן", kind: "guest" },
    { id: "manual-dani-new", displayName: "  דני   כהן ", kind: "guest" }
  ];
  const event = {
    participantIds: offlineParticipants.map((participant) => participant.id)
  };
  const [pair] = unresolvedDuplicateParticipantPairs(
    offlineParticipants,
    event
  );

  assert.equal(pair.mergeSourceId, "manual-dani-new");
  assert.equal(pair.mergeTargetId, "manual-dani-old");
});

test("the offline record with more event history becomes the kept identity", () => {
  const offlineParticipants = [
    { id: "manual-dani-old", displayName: "דני כהן", kind: "guest" },
    { id: "manual-dani-active", displayName: "דני כהן", kind: "guest" }
  ];
  const event = {
    participantIds: offlineParticipants.map((participant) => participant.id),
    expenses: [
      {
        createdByParticipantId: "manual-dani-active",
        sharedByParticipantIds: ["manual-dani-active"],
        payers: [{ participantId: "manual-dani-active", amount: 1000 }]
      }
    ],
    transfers: []
  };
  const [pair] = unresolvedDuplicateParticipantPairs(
    offlineParticipants,
    event
  );

  assert.equal(pair.mergeSourceId, "manual-dani-old");
  assert.equal(pair.mergeTargetId, "manual-dani-active");
});

test("two connected accounts with the same name are never offered for merging", () => {
  const connectedParticipants = [
    {
      id: "connected-one",
      displayName: "דני כהן",
      authProvider: "google",
      authSubject: "google-one"
    },
    {
      id: "connected-two",
      displayName: "דני כהן",
      authProvider: "email",
      authSubject: "email-two"
    }
  ];
  const [pair] = unresolvedDuplicateParticipantPairs(
    connectedParticipants,
    { participantIds: connectedParticipants.map((participant) => participant.id) }
  );

  assert.equal(pair.mergeSourceId, "");
  assert.equal(pair.mergeTargetId, "");
});

test("confirming two people are distinct suppresses only that pair", () => {
  const pairKey = duplicateParticipantPairKey("connected-dani", "manual-dani");
  const event = {
    participantIds: ["connected-dani", "manual-dani", "other"],
    distinctParticipantPairs: [pairKey]
  };

  assert.deepEqual(unresolvedDuplicateParticipantPairs(participants, event), []);
});

test("participant pair decisions follow a safe identity merge", () => {
  const pairKeys = [
    duplicateParticipantPairKey("manual-dani", "other"),
    duplicateParticipantPairKey("connected-dani", "manual-dani")
  ];

  assert.deepEqual(
    remapParticipantPairKeys(pairKeys, "manual-dani", "connected-dani"),
    [duplicateParticipantPairKey("connected-dani", "other")]
  );
});
