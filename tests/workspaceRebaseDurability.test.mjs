import test from "node:test";
import assert from "node:assert/strict";
import { addEventNote } from "../src/domain/eventNotes.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture(run, { rejectDestinationOutbox = false, rejectDestinationSnapshot = false } = {}) {
  const names = ["window", "location", "localStorage", "fetch", "SogrimAccountSession"];
  const previous = new Map(names.map(name => [name, globalThis[name]]));
  const configStarted = deferred(), configGate = deferred();
  const entries = new Map(), destinationWrites = [];
  const oldSpace = "rebase-old-space", newSpace = "rebase-new-space";
  const outboxKey = space => `settle-friends-pending-sync:${space}`;
  const stateKey = space => `settle-friends-state:${space}`;
  const state = {
    currentParticipantId: "account-rebase-user",
    participants: [{ id: "account-rebase-user", displayName: "Rebase User", kind: "user" }], groups: [],
    events: [{ id: "rebase-event", name: "Rebase event", eventType: "standard", currency: "ILS",
      participantIds: ["account-rebase-user"], adminIds: ["account-rebase-user"], createdByParticipantId: "account-rebase-user",
      expenses: [], transfers: [], notes: [], sharedSpaceId: "rebase-shared", sharedSpaceKey: "synthetic-shared-space-key-long-enough" }]
  };
  let observing = false;
  const storage = { getItem: key => entries.get(key) ?? null, removeItem: key => entries.delete(key),
    setItem(key, value) {
      if (key === outboxKey(newSpace) && rejectDestinationOutbox) throw new Error("Quota exceeded");
      if (observing && key === stateKey(newSpace)) {
        destinationWrites.push({ value: String(value), outboxAtWrite: entries.get(outboxKey(newSpace)) ?? null });
        if (rejectDestinationSnapshot) throw new Error("Snapshot quota exceeded");
      }
      entries.set(key, String(value));
    }
  };
  const location = { href: "https://sogrim-hesbon-app.vercel.app/", hostname: "sogrim-hesbon-app.vercel.app", protocol: "https:" };
  const activate = space => {
    storage.setItem("settle-friends-account-session", JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "rebase-user", user_metadata: { account_space_id: space, account_space_key: "synthetic-personal-space-key-long-enough" } }
    }));
    storage.setItem("settle-friends-cloud-space", space);
    storage.setItem(`settle-friends-cloud-key:${space}`, "synthetic-personal-space-key-long-enough");
    storage.setItem(stateKey(space), JSON.stringify(state));
  };
  activate(oldSpace);
  globalThis.window = { location, localStorage: storage, addEventListener() {}, dispatchEvent() {} };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.SogrimAccountSession = { async refresh() { return null; } };
  globalThis.fetch = async url => {
    assert.equal(new URL(String(url), location.href).pathname, "/api/config", "no live data requests");
    configStarted.resolve();
    await configGate.promise;
    throw new Error("Synthetic runtime config outage");
  };
  let request;
  try {
    const store = await import(`../src/data/localStore.mjs?rebase-durability=${crypto.randomUUID()}`);
    const changed = addEventNote(state, "rebase-event", { id: "rebase-note", body: "Keep this note" });
    request = store.saveSharedState(changed, { awaitCloud: true });
    await configStarted.promise;
    activate(newSpace);
    const destinationBefore = storage.getItem(stateKey(newSpace));
    observing = true;
    configGate.resolve();
    const result = await request;
    await run({ result, storage, destinationBefore, destinationWrites, oldSpace, newSpace, outboxKey, stateKey });
  } finally {
    configGate.resolve();
    if (request) await request;
    for (const [name, value] of previous) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; }
  }
}

test("workspace rebase persists its destination outbox before the visible local snapshot", async () => fixture(async h => {
  assert.equal(h.result.ok, true);
  assert.equal(h.result.pending, true);
  assert.ok(h.destinationWrites.length > 0);
  for (const write of h.destinationWrites) {
    assert.ok(write.outboxAtWrite?.includes("rebase-note"),
      "a process stop after any visible-state write must still leave the note durably queued in that workspace");
  }
}));

test("failed rebase outbox storage does not advance the destination snapshot or discard the original durable intent", async () => fixture(async h => {
  assert.equal(h.result.ok, false);
  assert.equal(h.result.error.code, "LOCAL_STORAGE_UNAVAILABLE");
  assert.equal(h.storage.getItem(h.stateKey(h.newSpace)), h.destinationBefore,
    "do not display a destination snapshot that has no durable delivery intent");
  assert.equal(h.storage.getItem(h.outboxKey(h.newSpace)), null);
  assert.ok(h.storage.getItem(h.outboxKey(h.oldSpace))?.includes("rebase-note"), "keep the original recoverable copy");
}, { rejectDestinationOutbox: true }));

test("a snapshot failure after rebase leaves the note in the destination's durable outbox", async () => fixture(async h => {
  assert.equal(h.result.ok, false);
  assert.equal(h.result.error.code, "LOCAL_STORAGE_UNAVAILABLE");
  assert.equal(h.storage.getItem(h.stateKey(h.newSpace)), h.destinationBefore);
  assert.ok(h.storage.getItem(h.outboxKey(h.newSpace))?.includes("rebase-note"));
  assert.ok(h.storage.getItem(h.outboxKey(h.oldSpace))?.includes("rebase-note"));
}, { rejectDestinationSnapshot: true }));
