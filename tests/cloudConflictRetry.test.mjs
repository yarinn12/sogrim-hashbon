import test from "node:test";
import assert from "node:assert/strict";

import {
  CLOUD_CONFLICT_RETRY_LIMIT,
  saveCloudStateWithConflictRetry
} from "../src/data/cloudConflictRetry.mjs";

test("cloud saves recover from two consecutive conflicts without losing remote data", async () => {
  const saves = [];
  const remoteStates = [stateWithEvent("remote-1"), stateWithEvent("remote-2")];
  let saveAttempt = 0;

  const result = await saveCloudStateWithConflictRetry({
    state: stateWithEvent("local"),
    retryLimit: 2,
    retryDelay: () => 0,
    async loadLatest() {
      return remoteStates.shift();
    },
    async save(candidate) {
      saves.push(candidate);
      saveAttempt += 1;
      if (saveAttempt <= 2) throw conflictError();
    }
  });

  assert.equal(result.conflictCount, 2);
  assert.equal(saves.length, 3);
  assert.deepEqual(
    new Set(result.state.events.map((event) => event.id)),
    new Set(["local", "remote-1", "remote-2"])
  );
});

test("cloud conflict recovery stops after its bounded retry limit", async () => {
  let saveAttempts = 0;
  let loadAttempts = 0;

  await assert.rejects(
    saveCloudStateWithConflictRetry({
      state: stateWithEvent("local"),
      retryDelay: () => 0,
      async loadLatest() {
        loadAttempts += 1;
        return stateWithEvent(`remote-${loadAttempts}`);
      },
      async save() {
        saveAttempts += 1;
        throw conflictError();
      }
    }),
    (error) => error.code === "CLOUD_STATE_CONFLICT"
  );

  assert.equal(saveAttempts, CLOUD_CONFLICT_RETRY_LIMIT + 1);
  assert.equal(loadAttempts, CLOUD_CONFLICT_RETRY_LIMIT);
});

test("non-conflict cloud failures are not retried", async () => {
  let loadAttempts = 0;
  await assert.rejects(
    saveCloudStateWithConflictRetry({
      state: stateWithEvent("local"),
      retryDelay: () => 0,
      async loadLatest() {
        loadAttempts += 1;
        return null;
      },
      async save() {
        throw new Error("offline");
      }
    }),
    /offline/
  );
  assert.equal(loadAttempts, 0);
});

test("conflict recovery spaces retries before reading the next version", async () => {
  const waits = [];
  let attempts = 0;

  const result = await saveCloudStateWithConflictRetry({
    state: stateWithEvent("local"),
    retryLimit: 1,
    retryDelay: () => 25,
    async wait(milliseconds) {
      waits.push(milliseconds);
    },
    async loadLatest() {
      return stateWithEvent("remote");
    },
    async save() {
      attempts += 1;
      if (attempts === 1) throw conflictError();
    }
  });

  assert.deepEqual(waits, [25]);
  assert.equal(result.conflictCount, 1);
  assert.deepEqual(
    new Set(result.state.events.map((event) => event.id)),
    new Set(["local", "remote"])
  );
});

function stateWithEvent(id) {
  return {
    currentParticipantId: "",
    participants: [],
    groups: [],
    events: [{ id, name: id, participantIds: [], expenses: [] }],
    deletedEvents: []
  };
}

function conflictError() {
  const error = new Error("conflict");
  error.code = "CLOUD_STATE_CONFLICT";
  return error;
}
