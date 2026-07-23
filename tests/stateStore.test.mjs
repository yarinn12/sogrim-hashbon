import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { demoState } from "../src/data/demoData.mjs";
import { createStateStore } from "../src/server/stateStore.mjs";
import { validateSharedStatePayload } from "../src/server/stateValidation.mjs";

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
      events: [{ id: "shared-event-1", name: "Shared event" }]
    };

    await store.save(nextState);
    const reloaded = await createStateStore(filePath).load();

    assert.equal(reloaded.events[0].name, "Shared event");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("state store rejects malformed shared state before saving", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settle-store-"));
  try {
    const filePath = join(directory, "state.json");
    const store = createStateStore(filePath);

    await assert.rejects(
      () => store.save({ participants: "bad", groups: [], events: [] }),
      /Invalid state payload/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("validateSharedStatePayload explains missing app collections", () => {
  const validation = validateSharedStatePayload({ participants: [] });

  assert.equal(validation.ok, false);
  assert.deepEqual(validation.errors, [
    "groups must be an array.",
    "events must be an array."
  ]);
});

test("validateSharedStatePayload rejects unsafe identifiers at every state level", () => {
  const validation = validateSharedStatePayload({
    currentParticipantId: "safe-user",
    participants: [{ id: "safe-user", displayName: "Safe User" }],
    groups: [
      {
        id: "group-1",
        memberIds: ["safe-user", 'user-2" tabindex="0'],
        adminIds: ["safe-user"]
      }
    ],
    events: [
      {
        id: "event/../../bad",
        participantIds: ["safe-user"],
        adminIds: [],
        expenses: [
          {
            id: "expense-1",
            sharedByParticipantIds: ["safe-user"],
            payers: [{ participantId: "<img_src=x>" }]
          }
        ],
        transfers: [
          {
            id: "transfer-1",
            fromParticipantId: "safe-user",
            toParticipantId: "user with spaces"
          }
        ]
      }
    ]
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("groups[0].memberIds[1]")));
  assert.ok(validation.errors.some((error) => error.includes("events[0].id")));
  assert.ok(
    validation.errors.some((error) =>
      error.includes("events[0].expenses[0].payers[0].participantId")
    )
  );
  assert.ok(
    validation.errors.some((error) =>
      error.includes("events[0].transfers[0].toParticipantId")
    )
  );
});

test("state store refuses an unsafe identifier before writing it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settle-store-"));
  try {
    const store = createStateStore(join(directory, "state.json"));
    await assert.rejects(
      () =>
        store.save({
          currentParticipantId: "",
          participants: [],
          groups: [],
          events: [{ id: 'event-1" onpointerenter="alert(1)' }]
        }),
      /Invalid state payload: state\.events\[0\]\.id/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
