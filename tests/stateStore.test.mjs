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

test("validateSharedStatePayload accepts merge clocks for identifier-named settings", () => {
  const validation = validateSharedStatePayload({
    currentParticipantId: "owner",
    participants: [{ id: "owner", displayName: "Owner" }],
    groups: [
      {
        id: "group-1",
        memberIds: ["owner"],
        adminIds: ["owner"]
      }
    ],
    events: [
      {
        id: "event-1",
        participantIds: ["owner"],
        adminIds: ["owner"],
        groupId: "group-1",
        settingsFieldUpdatedAt: {
          groupId: "2026-09-03T05:22:33.000Z"
        },
        membershipUpdatedAtByParticipant: {
          owner: "2026-09-03T05:22:33.000Z"
        },
        expenses: [],
        transfers: []
      }
    ]
  });

  assert.equal(validation.ok, true, validation.errors.join(" "));
});

test("validateSharedStatePayload rejects malformed merge clock maps", () => {
  const validation = validateSharedStatePayload({
    currentParticipantId: "owner",
    participants: [{ id: "owner", displayName: "Owner" }],
    groups: [],
    events: [
      {
        id: "event-1",
        participantIds: ["owner"],
        adminIds: ["owner"],
        settingsFieldUpdatedAt: {
          groupId: "not-a-timestamp"
        },
        membershipUpdatedAtByParticipant: {
          "unsafe participant": "2026-09-03T05:22:33.000Z"
        },
        expenses: [],
        transfers: []
      }
    ]
  });

  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some((error) => error.includes("must be a valid timestamp"))
  );
  assert.ok(
    validation.errors.some((error) => error.includes("safe identifier keys"))
  );
});

test("validateSharedStatePayload rejects malformed financial records", () => {
  const validation = validateSharedStatePayload({
    currentParticipantId: "owner",
    participants: [
      { id: "owner", displayName: "Owner" },
      { id: "friend", displayName: "Friend" }
    ],
    groups: [],
    events: [
      {
        id: "event-1",
        participantIds: ["owner", "friend"],
        expenses: [
          {
            id: "expense-1",
            total: 1000,
            payers: [{ participantId: "owner", amount: 999 }],
            sharedByParticipantIds: ["owner", "friend"]
          }
        ],
        transfers: [
          {
            id: "transfer-1",
            fromParticipantId: "friend",
            toParticipantId: "owner",
            amount: 12.5,
            status: "paid"
          }
        ]
      }
    ]
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("payers must add up")));
  assert.ok(validation.errors.some((error) => error.includes("positive integer")));
});

test("validateSharedStatePayload rejects duplicate and foreign participant references", () => {
  const validation = validateSharedStatePayload({
    currentParticipantId: "p1",
    participants: [
      { id: "p1", displayName: "One" },
      { id: "p1", displayName: "Duplicate" }
    ],
    groups: [{
      id: "g1",
      memberIds: ["p1", "missing"],
      adminIds: ["missing"]
    }],
    events: [{
      id: "e1",
      participantIds: ["p1", "p1"],
      adminIds: ["missing"],
      expenses: [],
      transfers: []
    }]
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join(" "), /unique ids/);
  assert.match(validation.errors.join(" "), /known participants/);
  assert.match(validation.errors.join(" "), /must belong/);
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
