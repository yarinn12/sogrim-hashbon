import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  applyLocalParticipantId,
  toSharedState
} from "../src/data/localIdentity.mjs";

const state = {
  currentParticipantId: "avi",
  participants: [
    { id: "yarin", displayName: "Yarin", kind: "user" },
    { id: "avi", displayName: "Avi", kind: "user" }
  ],
  groups: [],
  events: []
};

test("applyLocalParticipantId keeps the local browser identity when it exists", () => {
  const nextState = applyLocalParticipantId(state, "yarin");

  assert.equal(nextState.currentParticipantId, "yarin");
});

test("applyLocalParticipantId falls back safely when the local identity is missing", () => {
  const nextState = applyLocalParticipantId(state, "missing");

  assert.equal(nextState.currentParticipantId, "avi");
});

test("toSharedState removes the current browser identity from shared saves", () => {
  const sharedState = toSharedState(state);

  assert.equal(sharedState.currentParticipantId, "yarin");
});

test("localStore stores identity separately from shared event data", async () => {
  const localStore = await readFile("src/data/localStore.mjs", "utf8");

  assert.match(localStore, /LOCAL_PARTICIPANT_KEY/);
  assert.match(localStore, /applyLocalParticipantId/);
  assert.match(localStore, /toSharedState\(state\)/);
  assert.match(localStore, /loadCloudState\(runtimeConfig, toSharedState\(localState\)\)/);
});
