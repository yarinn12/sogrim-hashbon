import test from "node:test";
import assert from "node:assert/strict";

import {
  BACKUP_VERSION,
  bindStateBackupToCurrentParticipant,
  parseStateBackup,
  redactStateBackup,
  serializeStateBackup
} from "../src/domain/stateBackup.mjs";

function sampleState() {
  return {
    currentParticipantId: "owner",
    participants: [{ id: "owner", displayName: "Owner", kind: "user" }],
    groups: [],
    events: []
  };
}

test("serializeStateBackup wraps the current state with version and export time", () => {
  const exportedAt = "2026-05-23T12:00:00.000Z";
  const backup = JSON.parse(serializeStateBackup(sampleState(), exportedAt));

  assert.equal(backup.version, BACKUP_VERSION);
  assert.equal(backup.exportedAt, exportedAt);
  assert.deepEqual(backup.state, {
    participants: sampleState().participants,
    groups: [],
    events: []
  });
});

test("parseStateBackup accepts a wrapped backup and returns its state", () => {
  const json = serializeStateBackup(sampleState(), "2026-05-23T12:00:00.000Z");

  assert.deepEqual(parseStateBackup(json), {
    participants: sampleState().participants,
    groups: [],
    events: []
  });
});

test("parseStateBackup accepts legacy raw state exports", () => {
  const json = JSON.stringify(sampleState());

  assert.deepEqual(parseStateBackup(json), {
    participants: sampleState().participants,
    groups: [],
    events: []
  });
});

test("backup export recursively redacts access keys, tokens, and active identity", () => {
  const state = sampleState();
  state.events.push({
    id: "event-1",
    participantIds: ["owner"],
    expenses: [],
    transfers: [],
    sharedSpaceId: "shared-space",
    sharedSpaceKey: "shared-space-secret",
    openInviteToken: "open-invite-secret",
    recovery: {
      access_token: "access-secret",
      refreshToken: "refresh-secret",
      session_token: "session-secret",
      authorization: "Bearer bearer-secret"
    }
  });
  state.account_space_key = "workspace-secret";

  const serialized = serializeStateBackup(
    state,
    "2026-05-23T12:00:00.000Z"
  );
  const backup = JSON.parse(serialized);

  assert.equal(Object.hasOwn(backup.state, "currentParticipantId"), false);
  assert.equal(Object.hasOwn(backup.state, "account_space_key"), false);
  assert.equal(backup.state.events[0].sharedSpaceId, "shared-space");
  assert.equal(Object.hasOwn(backup.state.events[0], "sharedSpaceKey"), false);
  assert.equal(Object.hasOwn(backup.state.events[0], "openInviteToken"), false);
  assert.deepEqual(backup.state.events[0].recovery, {});
  assert.doesNotMatch(
    serialized,
    /shared-space-secret|open-invite-secret|access-secret|refresh-secret|session-secret|bearer-secret|workspace-secret/
  );
  assert.equal(state.currentParticipantId, "owner");
  assert.equal(state.events[0].sharedSpaceKey, "shared-space-secret");
});

test("legacy backup import removes sensitive fields before returning state", () => {
  const state = sampleState();
  state.events.push({
    id: "event-1",
    participantIds: ["owner"],
    expenses: [],
    transfers: [],
    sharedSpaceId: "shared-space",
    sharedSpaceKey: "shared-space-secret",
    nested: { id_token: "identity-secret" }
  });

  const restored = parseStateBackup(JSON.stringify(state));

  assert.equal(Object.hasOwn(restored, "currentParticipantId"), false);
  assert.equal(Object.hasOwn(restored.events[0], "sharedSpaceKey"), false);
  assert.deepEqual(restored.events[0].nested, {});
  assert.equal(restored.events[0].sharedSpaceId, "shared-space");
});

test("restore binds the backup to the active local participant", () => {
  const restored = redactStateBackup({
    currentParticipantId: "backup-owner",
    participants: [
      { id: "backup-owner", displayName: "Backup owner" },
      {
        id: "active-owner",
        displayName: "Spoofed owner",
        accountProvider: "attacker"
      }
    ],
    groups: [],
    events: []
  });

  const bound = bindStateBackupToCurrentParticipant(restored, {
    currentParticipantId: "active-owner",
    participants: [
      {
        id: "active-owner",
        displayName: "Current owner",
        accountProvider: "google"
      }
    ]
  });

  assert.equal(bound.currentParticipantId, "active-owner");
  assert.equal(bound.participants.length, 2);
  assert.deepEqual(
    bound.participants.find((participant) => participant.id === "active-owner"),
    {
      id: "active-owner",
      displayName: "Current owner",
      accountProvider: "google"
    }
  );
});

test("restore keeps a different active identity without granting imported membership", () => {
  const restored = {
    participants: [{ id: "backup-owner", displayName: "Backup owner" }],
    groups: [],
    events: [
      {
        id: "event-1",
        participantIds: ["backup-owner"],
        expenses: [],
        transfers: []
      }
    ]
  };

  const bound = bindStateBackupToCurrentParticipant(restored, {
    currentParticipantId: "active-owner",
    participants: [{ id: "active-owner", displayName: "Active owner" }]
  });

  assert.equal(bound.currentParticipantId, "active-owner");
  assert.equal(
    bound.participants.some((participant) => participant.id === "active-owner"),
    true
  );
  assert.deepEqual(bound.events[0].participantIds, ["backup-owner"]);
});

test("restore without an active local identity falls back to the first participant", () => {
  const bound = bindStateBackupToCurrentParticipant(
    {
      participants: [{ id: "backup-owner", displayName: "Backup owner" }],
      groups: [],
      events: []
    },
    {}
  );

  assert.equal(bound.currentParticipantId, "backup-owner");
});

test("parseStateBackup rejects invalid backup files", () => {
  assert.throws(() => parseStateBackup("{"), /not valid JSON/);
  assert.throws(() => parseStateBackup(JSON.stringify({ events: [] })), /missing participants/);
  assert.throws(() => parseStateBackup(JSON.stringify({ participants: [], events: [] })), /missing groups/);
  assert.throws(() => parseStateBackup(JSON.stringify({ participants: [], groups: [] })), /missing events/);
});

test("parseStateBackup rejects unsafe financial records", () => {
  const state = sampleState();
  state.participants.push({ id: "friend", displayName: "Friend" });
  state.events.push({
    id: "event-1",
    participantIds: ["owner", "friend"],
    expenses: [
      {
        id: "expense-1",
        total: 1234,
        payers: [{ participantId: "owner", amount: 1200 }],
        sharedByParticipantIds: ["owner", "missing"]
      }
    ],
    transfers: [
      {
        id: "transfer-1",
        fromParticipantId: "friend",
        toParticipantId: "missing",
        amount: -50,
        status: "unknown"
      }
    ]
  });

  assert.throws(
    () => parseStateBackup(JSON.stringify(state)),
    /contains invalid data/
  );
});
