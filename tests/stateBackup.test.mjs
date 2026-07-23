import test from "node:test";
import assert from "node:assert/strict";

import {
  BACKUP_VERSION,
  parseStateBackup,
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
  assert.deepEqual(backup.state, sampleState());
});

test("parseStateBackup accepts a wrapped backup and returns its state", () => {
  const json = serializeStateBackup(sampleState(), "2026-05-23T12:00:00.000Z");

  assert.deepEqual(parseStateBackup(json), sampleState());
});

test("parseStateBackup accepts legacy raw state exports", () => {
  const json = JSON.stringify(sampleState());

  assert.deepEqual(parseStateBackup(json), sampleState());
});

test("parseStateBackup rejects invalid backup files", () => {
  assert.throws(() => parseStateBackup("{"), /not valid JSON/);
  assert.throws(() => parseStateBackup(JSON.stringify({ events: [] })), /missing participants/);
  assert.throws(() => parseStateBackup(JSON.stringify({ participants: [], events: [] })), /missing groups/);
  assert.throws(() => parseStateBackup(JSON.stringify({ participants: [], groups: [] })), /missing events/);
});
