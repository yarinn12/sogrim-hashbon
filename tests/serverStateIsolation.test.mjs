import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createAppHandler } from "../server.mjs";

test("the local server can isolate automated QA state from the app data file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sogrim-state-isolation-"));
  const stateFile = join(directory, "playwright-state.json");
  const state = {
    currentParticipantId: "qa-owner",
    participants: [{ id: "qa-owner", displayName: "QA Owner" }],
    groups: [],
    events: [],
    deletedEvents: []
  };
  const server = createServer(
    createAppHandler({ root: process.cwd(), port: 0, stateFile })
  );

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/state`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state)
    });

    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(await readFile(stateFile, "utf8")), state);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await rm(directory, { recursive: true, force: true });
  }
});
