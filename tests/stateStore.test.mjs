import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { demoState } from "../src/data/demoData.mjs";
import { createStateStore } from "../src/server/stateStore.mjs";

test("state store starts from demo data when no file exists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settle-store-"));
  try {
    const store = createStateStore(join(directory, "state.json"));

    const state = await store.load();

    assert.deepEqual(state, demoState);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("state store saves and reloads shared state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settle-store-"));
  try {
    const filePath = join(directory, "state.json");
    const store = createStateStore(filePath);
    const nextState = {
      ...demoState,
      events: [{ ...demoState.events[0], name: "Shared event" }]
    };

    await store.save(nextState);
    const reloaded = await createStateStore(filePath).load();

    assert.equal(reloaded.events[0].name, "Shared event");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
