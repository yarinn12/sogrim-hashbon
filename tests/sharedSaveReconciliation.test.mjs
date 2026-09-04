import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { mergeSharedStates } from "../src/domain/sharedStateMerge.mjs";
import { hasSharedStateChanged } from "../src/data/localIdentity.mjs";
import {
  buildSharedEventState,
  buildSharedEventSyncSelection,
  syncSharedEvents
} from "../src/data/sharedEventStore.mjs";
import { readCloudState, saveCloudState } from "../src/data/cloudStore.mjs";
import { saveCloudStateWithConflictRetry } from "../src/data/cloudConflictRetry.mjs";

const source = readFileSync("src/data/localStore.mjs", "utf8");
const start = source.indexOf("async function syncAndPersistCloudStateOnce(");
const end = source.indexOf("async function syncAndPersistCloudState(", start);
assert.ok(start >= 0 && end > start);

function stateWithNote() {
  return {
    currentParticipantId: "account-review",
    participants: [{ id: "account-review", displayName: "Review", kind: "user" }],
    groups: [],
    events: [{
      id: "event-review", name: "Review", eventType: "standard", currency: "ILS",
      participantIds: ["account-review"], adminIds: ["account-review"],
      createdByParticipantId: "account-review",
      sharedSpaceId: "event-space-review", sharedSpaceKey: "review-key-long-enough-for-test-123",
      expenses: [], transfers: [],
      notes: [{
        id: "note-review", title: "Saved title", body: "Saved body", pinned: false,
        createdByParticipantId: "account-review", updatedByParticipantId: "account-review",
        createdAt: "2026-09-04T01:00:00.000Z", updatedAt: "2026-09-04T01:00:00.000Z"
      }]
    }]
  };
}

function harness({ conflictCount = 1, reconcile = (state) => state } = {}) {
  const canonicalWrites = [];
  const workspaceWrites = [];
  const persist = runInNewContext(`${source.slice(start, end)}; syncAndPersistCloudStateOnce`, {
    mergeSharedStates,
    buildSharedEventSyncSelection,
    hasCloudStateChanged: hasSharedStateChanged,
    toCloudState: (_config, state) => structuredClone(state),
    syncSharedEvents: async (_config, state, _fetch, selection) => {
      canonicalWrites.push(structuredClone(selection));
      // The real canonical write merges its receipt through mergeSharedStates,
      // including normalized defaults; model that boundary, not a raw fixture.
      return mergeSharedStates(state, structuredClone(state));
    },
    saveCloudStateWithRetry: async (_config, state) => {
      workspaceWrites.push(structuredClone(state));
      return {
        state: reconcile(structuredClone(state)),
        conflictCount: workspaceWrites.length === 1 ? conflictCount : 0
      };
    }
  });
  return { persist, canonicalWrites, workspaceWrites };
}

const selection = { eventIds: ["event-review"], deletedEventIds: [] };

test("a personal CAS conflict caused by canonical note projection does not republish the same event", async () => {
  const run = harness();
  const result = await run.persist({}, stateWithNote(), selection);
  assert.equal(result.conflictCount, 1);
  assert.equal(run.canonicalWrites.length, 1, "the already-committed note must not cause a second canonical RPC");
  assert.equal(run.workspaceWrites.length, 1);
});

test("a workspace-only conflict does not republish an unchanged shared event", async () => {
  const run = harness({ reconcile(state) {
    state.groups = [{ id: "private-folder", name: "Private folder" }];
    state.events[0].groupId = "private-folder";
    return state;
  } });
  const result = await run.persist({}, stateWithNote(), selection);
  assert.equal(run.canonicalWrites.length, 1);
  assert.equal(result.state.events[0].groupId, "private-folder");
});

test("a conflict introducing real shared changes still reconciles through the canonical event", async () => {
  const run = harness({ reconcile(state) {
    state.events[0].notes[0].body = "Remote body";
    state.events[0].notes[0].updatedAt = "2026-09-04T01:01:00.000Z";
    return state;
  } });
  const result = await run.persist({}, stateWithNote(), selection);
  assert.equal(run.canonicalWrites.length, 2);
  assert.deepEqual(run.canonicalWrites[1], selection);
  assert.equal(result.state.events[0].notes[0].body, "Remote body");
});

test("an unchanged deletion acknowledgement does not repeat canonical deletion after a workspace conflict", async () => {
  const state = stateWithNote();
  state.deletedEvents = [{
    id: "event-review", deletedAt: "2026-09-04T01:01:00.000Z",
    sharedSpaceId: state.events[0].sharedSpaceId, sharedSpaceKey: state.events[0].sharedSpaceKey
  }];
  state.events = [];
  const run = harness();
  await run.persist({}, state, { eventIds: [], deletedEventIds: ["event-review"] });
  assert.equal(run.canonicalWrites.length, 1);
});

test("the general offline flush still publishes shared state after its workspace save", async () => {
  const run = harness({ conflictCount: 0 });
  await run.persist({}, stateWithNote(), null);
  assert.equal(run.canonicalWrites.length, 1);
  assert.equal(run.canonicalWrites[0], null);
});

test("workspace reconciliation does not widen a targeted write to unrelated events", async () => {
  const state = stateWithNote();
  state.events.push({ ...structuredClone(state.events[0]), id: "event-other", sharedSpaceId: "space-other" });
  const run = harness({ reconcile(candidate) {
    candidate.events.find((event) => event.id === "event-other").notes[0].body = "Unrelated body";
    candidate.events.find((event) => event.id === "event-other").notes[0].updatedAt = "2026-09-04T01:01:00.000Z";
    return candidate;
  } });
  const result = await run.persist({}, state, selection);
  assert.equal(run.canonicalWrites.length, 1);
  assert.equal(result.state.events.find((event) => event.id === "event-other").notes[0].body, "Unrelated body");
});

test("a selected event that becomes deleted during reconciliation still publishes its tombstone", async () => {
  const run = harness({ reconcile(state) {
    state.deletedEvents = [{
      id: "event-review", deletedAt: "2026-09-04T01:01:00.000Z",
      sharedSpaceId: state.events[0].sharedSpaceId, sharedSpaceKey: state.events[0].sharedSpaceKey
    }];
    state.events = [];
    return state;
  } });
  const result = await run.persist({}, stateWithNote(), selection);
  assert.equal(run.canonicalWrites.length, 2);
  assert.deepEqual(run.canonicalWrites[1], { eventIds: [], deletedEventIds: ["event-review"] });
  assert.equal(result.state.events.length, 0);
});

test("real cloud and event stores make one canonical RPC across a note-projection workspace CAS conflict", async () => {
  const pending = stateWithNote();
  let personal = structuredClone(pending);
  personal.events[0].notes = [];
  let canonical = buildSharedEventState(personal, "event-review");
  let personalVersion = "2026-09-04T02:00:00.000Z";
  let canonicalVersion = personalVersion;
  let canonicalRpcCount = 0;
  let personalConflictCount = 0;
  let personalPatchCount = 0;
  const config = { storage: {
    mode: "supabase", url: "https://projection-test.invalid", table: "shared_state",
    anonKey: "test-anon", spaceId: "workspace-projection-test",
    spaceKey: "workspace-projection-test-key-12345678",
    account: { userId: "review", accessToken: "test-token" }
  } };
  const json = (value) => new Response(JSON.stringify(value), {
    status: 200, headers: { "content-type": "application/json" }
  });
  const fetchImpl = async (address, options = {}) => {
    const url = new URL(address);
    const method = options.method ?? "GET";
    if (url.pathname.endsWith("/rpc/update_shared_event_snapshot")) {
      const body = JSON.parse(options.body);
      assert.equal(body.p_expected_updated_at, canonicalVersion);
      canonicalRpcCount += 1;
      canonical = structuredClone(body.p_state);
      canonicalVersion = `2026-09-04T02:00:0${canonicalRpcCount}.000Z`;
      // The production transaction mirrors notes and advances the writer's
      // personal CAS version before returning the canonical receipt.
      personal.events[0].notes = structuredClone(canonical.events[0].notes);
      personal.events[0].deletedNotes = structuredClone(canonical.events[0].deletedNotes ?? []);
      personalVersion = canonicalVersion;
      return json({ status: "updated", updatedAt: canonicalVersion });
    }
    const id = url.searchParams.get("id");
    if (method === "GET" && id === "eq.event-space-review") {
      return json([{ state: canonical, updated_at: canonicalVersion }]);
    }
    if (method === "GET" && id === "eq.workspace-projection-test") {
      return json([{ state: personal, updated_at: personalVersion }]);
    }
    if (method === "PATCH" && id === "eq.workspace-projection-test") {
      personalPatchCount += 1;
      if (url.searchParams.get("updated_at") !== `eq.${personalVersion}`) {
        personalConflictCount += 1;
        return json([]);
      }
      const body = JSON.parse(options.body);
      personal = structuredClone(body.state);
      personalVersion = body.updated_at;
      return json([{ updated_at: personalVersion }]);
    }
    throw new Error(`Unexpected test request: ${method} ${url.pathname}`);
  };
  await readCloudState(config, fetchImpl);
  const persist = runInNewContext(`${source.slice(start, end)}; syncAndPersistCloudStateOnce`, {
    fetch: fetchImpl,
    mergeSharedStates,
    buildSharedEventSyncSelection,
    hasCloudStateChanged: hasSharedStateChanged,
    toCloudState: (_config, state) => structuredClone(state),
    syncSharedEvents,
    saveCloudStateWithRetry: (runtimeConfig, state) => saveCloudStateWithConflictRetry({
      state,
      loadLatest: () => readCloudState(runtimeConfig, fetchImpl),
      save: (candidate) => saveCloudState(runtimeConfig, candidate, fetchImpl),
      retryDelay: () => 0
    })
  });
  const result = await persist(config, pending, selection);
  assert.equal(personalConflictCount, 1, "the atomic projection really invalidated the personal CAS version");
  assert.equal(canonicalRpcCount, 1, "do not repeat the canonical write after its own projection");
  assert.equal(personalPatchCount, 2, "one stale CAS attempt and one reconciled workspace write");
  assert.equal(result.state.events[0].notes[0].id, "note-review");
  assert.deepEqual(personal.events[0].notes, canonical.events[0].notes);
});

test("server JSON object key ordering does not create a shared mutation", () => {
  const before = stateWithNote();
  before.deletedEvents = [{
    id: "event-deleted", deletedAt: "2026-09-04T02:00:00.000Z",
    sharedSpaceId: "space-deleted", sharedSpaceKey: "deleted-key-long-enough-123456789"
  }];
  const reorder = (value) => {
    if (Array.isArray(value)) return value.map(reorder);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)]));
  };
  const after = reorder(before);
  assert.deepEqual(buildSharedEventSyncSelection(before, after), { eventIds: [], deletedEventIds: [] });
  after.events[0].notes[0].body = "Actual edit";
  assert.deepEqual(buildSharedEventSyncSelection(before, after), selection);
  after.deletedEvents[0].deletedAt = "2026-09-04T02:01:00.000Z";
  assert.deepEqual(buildSharedEventSyncSelection(before, after), {
    eventIds: ["event-review"], deletedEventIds: ["event-deleted"]
  });
});

test("workspace field-clock reconciliation preserves the frozen canonical diff baseline", () => {
  const base = stateWithNote();
  base.events[0].notes[0].fieldUpdatedAt = {
    title: "2026-09-04T01:00:00.000Z",
    body: "2026-09-04T01:00:00.000Z",
    pinned: "2026-09-04T01:00:00.000Z"
  };
  const committed = mergeSharedStates(base, base);
  const workspace = structuredClone(committed);
  workspace.events[0].notes[0].body = "A newer independent body";
  workspace.events[0].notes[0].fieldUpdatedAt.body = "2026-09-04T01:01:00.000Z";
  workspace.events[0].notes[0].updatedAt = "2026-09-04T01:01:00.000Z";
  const freeze = (value) => {
    if (!value || typeof value !== "object") return value;
    for (const nested of Object.values(value)) freeze(nested);
    return Object.freeze(value);
  };
  freeze(committed);
  const reconciled = mergeSharedStates(workspace, committed);
  assert.equal(committed.events[0].notes[0].body, "Saved body");
  assert.equal(reconciled.events[0].notes[0].body, "A newer independent body");
  assert.deepEqual(buildSharedEventSyncSelection(committed, reconciled), selection);
});
