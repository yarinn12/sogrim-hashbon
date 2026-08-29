import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mergeSharedStates } from "../src/domain/sharedStateMerge.mjs";

const localStore = readFileSync("src/data/localStore.mjs", "utf8");
const sharedEventStore = readFileSync("src/data/sharedEventStore.mjs", "utf8");
const conflictRetry = readFileSync("src/data/cloudConflictRetry.mjs", "utf8");

function deviceState(name, expenses = []) {
  return {
    currentParticipantId: "me",
    participants: [{ id: "me", displayName: "Me", kind: "user" }],
    groups: [],
    events: [
      {
        id: "e1",
        name,
        eventType: "standard",
        currency: "ILS",
        participantIds: ["me"],
        adminIds: ["me"],
        createdByParticipantId: "me",
        expenses,
        transfers: [],
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]
  };
}

const expense = (id, total) => ({
  id,
  name: id,
  total,
  payers: [{ participantId: "me", amount: total }],
  sharedByParticipantIds: ["me"]
});

test("two devices editing offline both keep their expenses after syncing", () => {
  const merged = mergeSharedStates(
    deviceState("remote", [expense("r1", 500)]),
    deviceState("local", [expense("l1", 300)])
  );
  const ids = merged.events[0].expenses.map((item) => item.id).sort();

  assert.deepEqual(ids, ["l1", "r1"], "neither device silently loses work");
});

test("re-merging the same payload changes nothing", () => {
  const local = deviceState("local", [expense("l1", 300)]);
  const merged = mergeSharedStates(deviceState("remote", [expense("r1", 500)]), local);
  const again = mergeSharedStates(merged, local);

  assert.equal(again.events[0].expenses.length, merged.events[0].expenses.length);
  assert.deepEqual(
    again.events[0].expenses.map((item) => item.id).sort(),
    merged.events[0].expenses.map((item) => item.id).sort()
  );
});

test("a deleted event is not resurrected by a peer that still has it", () => {
  const deleted = {
    ...deviceState("gone"),
    events: [],
    deletedEvents: [{ id: "e1", deletedAt: "2026-06-01T00:00:00.000Z" }]
  };

  const merged = mergeSharedStates(deleted, deviceState("resurrect me"));
  assert.equal(
    merged.events.some((event) => event.id === "e1"),
    false,
    "the tombstone wins over a stale peer"
  );
});

test("an unsent change is queued locally before the cloud write is attempted", () => {
  const save = localStore.slice(
    localStore.indexOf("export async function saveSharedState(state)"),
    localStore.indexOf("export async function flushPendingSharedState")
  );

  assert.ok(
    save.indexOf("savePendingSharedState(runtimeConfig, sharedState)") <
      save.indexOf("const saved = await syncAndPersistCloudState("),
    "the pending snapshot is stored before the network call"
  );
  assert.match(save, /publishSyncStatus\("saving"\)/);
  assert.match(save, /publishSyncStatus\("saved"\)/);
});

test("a signed-in mutation reaches the durable outbox before runtime config can suspend", () => {
  const save = localStore.slice(
    localStore.indexOf("export async function saveSharedState(state)"),
    localStore.indexOf("export async function flushPendingSharedState")
  );
  const crashSafeWrite = save.indexOf("const crashSafePendingStateSaved = Boolean(");
  const firstRuntimeAwait = save.indexOf("await loadRuntimeConfig()");

  assert.ok(crashSafeWrite >= 0, "the crash-safe outbox write must exist");
  assert.ok(
    crashSafeWrite < firstRuntimeAwait,
    "mobile suspension cannot happen before the mutation reaches the outbox"
  );
  assert.match(
    save,
    /toSharedState\(cleanState, \{ preserveCurrentParticipantId: true \}\)/
  );
});

test("the pending snapshot is only cleared when it is the payload that succeeded", () => {
  const save = localStore.slice(
    localStore.indexOf("export async function saveSharedState(state)"),
    localStore.indexOf("export async function flushPendingSharedState")
  );

  assert.match(
    save,
    /if \(pendingPayload === pendingSharedStateRaw\(runtimeConfig\)\) \{\s*\n\s*clearPendingSharedState\(runtimeConfig\);/,
    "a newer pending write is never discarded by an older completion"
  );
});

test("queued cloud writes use immutable snapshots and stale completions cannot replace newer local state", () => {
  const save = localStore.slice(
    localStore.indexOf("export async function saveSharedState(state)"),
    localStore.indexOf("export async function flushPendingSharedState")
  );

  assert.match(
    localStore,
    /let sharedStateSaveGeneration = 0/,
    "each save request is ordered independently from account switches"
  );
  assert.match(
    save,
    /const requestSaveGeneration = \+\+sharedStateSaveGeneration/,
    "a newer local mutation invalidates older cloud completions"
  );
  assert.ok(
    save.indexOf("const requestAccountGeneration = accountStorageGeneration") <
      save.indexOf("await loadRuntimeConfig()"),
    "signing out while runtime config loads invalidates the pending save"
  );
  assert.match(
    save,
    /const stateSnapshot = clone\(cleanState\)/,
    "queued writes must not retain references to live event and expense objects"
  );
  assert.ok(
    save.indexOf("const stateSnapshot = clone(cleanState)") <
      save.indexOf("await loadRuntimeConfig()"),
    "the immutable snapshot is captured before any asynchronous gap"
  );
  assert.match(
    save,
    /const sharedState = toCloudState\(runtimeConfig, stateSnapshot\)/,
    "the immutable snapshot is scoped to the authenticated cloud account"
  );
  assert.match(
    save,
    /requestAccountGeneration === accountStorageGeneration &&\s*requestSaveGeneration === sharedStateSaveGeneration/,
    "only the latest save in the active account may refresh local state"
  );
  assert.match(
    save,
    /syncAndPersistCloudState\(\s*runtimeConfig,\s*sharedState,\s*syncSelection/,
    "the queued write persists the captured snapshot"
  );
});

test("queued writes keep their snapshot and stop at an account boundary", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = memoryStorage();
  const firstWriteStarted = deferred();
  const secondWriteStarted = deferred();
  const releaseFirstWrite = deferred();
  const releaseSecondWrite = deferred();
  const writes = [];
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };

  saveTestAccount(storage, {
    userId: "user-a",
    accessToken: "token-a",
    spaceId: "space-account-a",
    spaceKey: "abcdefghijklmnopqrstuvwxyzABCDEF"
  });
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/api/config")) {
      return jsonResponse({
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          anonKey: "anon-key",
          table: "shared_state"
        }
      });
    }

    const write = {
      authorization: options.headers.authorization,
      state: JSON.parse(options.body).state
    };
    writes.push(write);
    if (writes.length === 1) {
      firstWriteStarted.resolve();
      await releaseFirstWrite.promise;
    } else if (writes.length === 2) {
      secondWriteStarted.resolve();
      await releaseSecondWrite.promise;
    }
    return jsonResponse([{ updated_at: `2026-08-12T00:00:0${writes.length}.000Z` }]);
  };

  try {
    const store = await import(
      `../src/data/localStore.mjs?queued-account-boundary=${Date.now()}`
    );
    const firstSave = store.saveSharedState(queueTestState("First Writer"));
    await firstWriteStarted.promise;

    const queuedState = queueTestState("Captured Snapshot");
    const snapshotSave = store.saveSharedState(queuedState);
    queuedState.participants[0].displayName = "Mutated After Queueing";
    const staleSave = store.saveSharedState(queueTestState("Stale Account Write"));
    await waitFor(() =>
      storage.getItem("settle-friends-pending-sync:space-account-a")
        ?.includes("Stale Account Write")
    );

    releaseFirstWrite.resolve();
    await secondWriteStarted.promise;
    store.clearLocalAccountData("space-account-a", "user-a");
    saveTestAccount(storage, {
      userId: "user-b",
      accessToken: "token-b",
      spaceId: "space-account-b",
      spaceKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"
    });
    releaseSecondWrite.resolve();

    const [firstResult, snapshotResult, staleResult] = await Promise.all([
      firstSave,
      snapshotSave,
      staleSave
    ]);

    assert.equal(firstResult.ok, true, firstResult.error?.stack);
    assert.equal(snapshotResult.ok, true, snapshotResult.error?.stack);
    assert.equal(staleResult.mode, "stale-account");
    assert.equal(writes.length, 2, "stale queued work never reaches the network");
    assert.deepEqual(
      writes.map((write) => write.authorization),
      ["Bearer token-a", "Bearer token-a"]
    );
    assert.equal(writes[1].state.participants[0].displayName, "Captured Snapshot");
  } finally {
    releaseFirstWrite.resolve();
    releaseSecondWrite.resolve();
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

test("an online flush also keeps a newer pending snapshot", () => {
  const flush = localStore.slice(
    localStore.indexOf("export async function flushPendingSharedState"),
    localStore.indexOf("export async function resetSharedState")
  );

  assert.match(flush, /const pendingPayload = pendingSharedStateRaw\(runtimeConfig\);/);
  assert.match(
    flush,
    /pendingPayload !== pendingSharedStateRaw\(runtimeConfig\)[\s\S]*?return \{ ok: true, pending: true, superseded: true \};/
  );
  assert.ok(
    flush.indexOf("clearPendingSharedState(runtimeConfig)") >
      flush.indexOf("superseded: true"),
    "only the payload that was actually flushed is cleared"
  );
});

test("an offline reset is queued through the normal durable save path", () => {
  const reset = localStore.slice(
    localStore.indexOf("export async function resetSharedState"),
    localStore.indexOf("export function loadLocalProfile")
  );

  assert.match(reset, /await saveSharedState\(state\)/);
  assert.doesNotMatch(reset, /await saveCloudState\(runtimeConfig/);
});

test("one broken shared event does not block the rest but prevents false success", () => {
  const sync = sharedEventStore.slice(
    sharedEventStore.indexOf("export async function syncSharedEvents"),
    sharedEventStore.indexOf("export async function saveSharedEventDeletion")
  );
  const refresh = sharedEventStore.slice(
    sharedEventStore.indexOf("export async function refreshSharedEvents"),
    sharedEventStore.indexOf("export function mergeSharedEventIntoState")
  );

  assert.match(sync, /mapSettledWithConcurrency/);
  assert.match(sync, /result\.status === "rejected"/);
  assert.match(sync, /\.map\(\(result\) => result\.reason\)/);
  assert.match(sync, /error\.code = "SHARED_EVENT_SYNC_FAILED"/);
  assert.match(sync, /throw error;/);
  assert.match(refresh, /mapSettledWithConcurrency/);
  assert.match(refresh, /if \(result\.status !== "fulfilled"\) continue;/);
});

test("returning online flushes whatever was queued", () => {
  assert.match(
    localStore,
    /window\.addEventListener\("online", \(\) => \{\s*\n\s*resetPendingSharedStateRetry\(\);\s*\n\s*recoverOnlineSync\(\)/
  );
  assert.match(
    localStore,
    /async function recoverOnlineSync\(\) \{[\s\S]*?runtimeConfigPromise = null;[\s\S]*?return flushPendingSharedState\(\);/
  );
  assert.match(localStore, /export async function flushPendingSharedState\(\)/);
});

test("an expired cloud token refreshes once without crossing account boundaries", () => {
  assert.match(
    localStore,
    /error\?\.code !== "CLOUD_STATE_AUTH_EXPIRED" \|\| !expectedUserId/
  );
  assert.match(
    localStore,
    /globalThis\.SogrimAccountSession\?\.refresh\?\.\(\)/
  );
  assert.match(
    localStore,
    /const freshConfig = activateClientSpace\(await loadRuntimeConfig\(\)\)/
  );
  assert.match(localStore, /if \(freshUserId !== expectedUserId\) throw error/);
});

test("concurrent online and resume recovery share one ordered flush", () => {
  const flush = localStore.slice(
    localStore.indexOf("export async function flushPendingSharedState"),
    localStore.indexOf("export async function resetSharedState")
  );

  assert.match(localStore, /let pendingSyncFlushPromise = null/);
  assert.match(
    flush,
    /if \(!pendingSyncFlushPromise\) \{/
  );
  assert.match(
    flush,
    /cloudWriteQueue = cloudWriteQueue\s*\.catch\(\(\) => \{\}\)\s*\.then\(flushPendingSharedStateOnce\)/,
    "recovery waits for any active save instead of writing concurrently"
  );
  assert.match(
    flush,
    /pendingSyncFlushPromise = cloudWriteQueue\.finally\(\(\) => \{\s*pendingSyncFlushPromise = null/,
    "every caller shares the same in-flight recovery promise"
  );
});

test("temporary runtime-config fallback still queues the local snapshot", () => {
  const save = localStore.slice(
    localStore.indexOf("export async function saveSharedState(state)"),
    localStore.indexOf("export async function flushPendingSharedState")
  );

  assert.match(save, /if \(runtimeConfigUsedFallback\) \{/);
  assert.match(save, /savePendingSharedState\(pendingConfig, sharedState\)/);
  assert.match(save, /\{ ok: true, mode: "local", pending: true \}/);
});

test("a write conflict is resolved by merging rather than overwriting", () => {
  const save = localStore.slice(
    localStore.indexOf("export async function saveSharedState(state)"),
    localStore.indexOf("export async function flushPendingSharedState")
  );

  assert.match(save, /syncAndPersistCloudState\([\s\S]*?runtimeConfig,[\s\S]*?sharedState,[\s\S]*?syncSelection/);
  assert.match(conflictRetry, /error\?\.code !== "CLOUD_STATE_CONFLICT"/);
  assert.match(conflictRetry, /mergeStates = mergeSharedStates/);
  assert.match(conflictRetry, /candidate = latest \? mergeStates\(latest, candidate\) : candidate/);
  assert.match(conflictRetry, /conflictCount >= retryLimit/);
});

test("a recovered pending-state conflict is reported as saved instead of remaining stuck", () => {
  const load = localStore.slice(
    localStore.indexOf("async function loadSharedStateOnce"),
    localStore.indexOf("export async function saveSharedState")
  );
  const recoveryCall = load.indexOf("syncAndPersistCloudState(");
  const recoverySave = load.indexOf('publishSyncStatus("saved")', recoveryCall);

  assert.ok(recoveryCall >= 0, "pending state uses bounded conflict recovery");
  assert.ok(recoverySave > recoveryCall, "successful recovery clears the warning");
  assert.match(
    load,
    /catch \(error\) \{[\s\S]*?if \(isRetryablePendingSyncFailure\(error\)\) \{[\s\S]*?publishSyncStatus\("reconnecting"\);[\s\S]*?\} else \{[\s\S]*?publishSyncFailure\(error\);/,
    "retryable recovery failures stay queued while permanent failures surface"
  );
});

test("shared event writes also retry through a merge on conflict", () => {
  const save = sharedEventStore.slice(
    sharedEventStore.indexOf("export async function saveSharedEventState"),
    sharedEventStore.indexOf("export async function syncSharedEvents")
  );

  assert.match(save, /saveCloudStateWithConflictRetry\(\{/);
  assert.match(save, /loadLatest: \(\) => readCloudState\(config, fetchImpl\)/);
  assert.match(
    save,
    /save: \(candidate\) => saveCloudState\([\s\S]*buildSharedEventState\(candidate, eventId\)/
  );
  assert.match(save, /saved\.state/);
});

test("a cloud read for the wrong event is rejected instead of merged", () => {
  const read = sharedEventStore.slice(
    sharedEventStore.indexOf("export async function readSharedEventState"),
    sharedEventStore.indexOf("export async function saveSharedEventState")
  );

  assert.match(read, /sharedState\?\.events\?\.\[0\]\?\.id !== expectedEventId/);
  assert.match(read, /return null;/);
});

test("sync failures surface a status rather than failing silently", () => {
  assert.match(localStore, /function publishSyncFailure\(error\) \{/);
  assert.match(localStore, /publishSyncStatus\(syncFailureStatus\(error\)\)/);
  assert.match(localStore, /export function syncFailureStatus\(/);
  assert.match(
    localStore,
    /if \(!online\) return "offline";/
  );
  assert.match(localStore, /return "unavailable";/);
  assert.match(localStore, /syncAndPersistCloudStateOnce/);
  assert.match(localStore, /isTransientSyncFailure\(error\)/);
  assert.match(localStore, /const SYNC_STATUS_EVENT = "sogrim:sync-status";/);
});

test("pending conflicts retry quietly with a capped background backoff", () => {
  assert.match(
    localStore,
    /const PENDING_SYNC_RETRY_DELAYS_MS = \[[\s\S]*?1_200,[\s\S]*?120_000[\s\S]*?\]/
  );
  assert.match(
    localStore,
    /if \(item\?\.code === "CLOUD_STATE_CONFLICT"\) return true;/
  );
  assert.match(
    localStore,
    /if \(retryablePendingFailure && pendingStateSaved\) \{\s*schedulePendingSharedStateRetry\(\);/
  );
  assert.match(localStore, /const acceptedPending = Boolean\(/);
  assert.match(localStore, /ok: acceptedPending/);
  assert.match(localStore, /mode: acceptedPending \? "queued" : "cloud"/);
  assert.match(
    localStore,
    /const result = await flushPendingSharedState\(\)/
  );
  assert.match(localStore, /Math\.min\(pendingSyncRetryAttempt, PENDING_SYNC_RETRY_DELAYS_MS\.length - 1\)/);
  assert.match(localStore, /publishSyncStatus\("reconnecting"\)/);
  assert.match(localStore, /const FOREGROUND_SAVE_BUDGET_MS = 1_500;/);
  assert.match(localStore, /awaitCloud\s*\? cloudWriteQueue\s*:\s*settleSaveWithinUiBudget\(/);
  assert.match(localStore, /resetPendingSharedStateRetry\(\);/);
});

test("a failed shared-event write restores the last durable state instead of diverging offline", () => {
  const save = localStore.slice(
    localStore.indexOf("export async function saveSharedState(state)"),
    localStore.indexOf("export async function flushPendingSharedState")
  );

  assert.match(save, /const hasSharedEventMutation = Boolean\(/);
  assert.match(save, /requestSaveGeneration === sharedStateSaveGeneration/);
  assert.match(save, /saveState\(previousState\);/);
  assert.match(save, /publishSharedSaveReverted\(syncSelection, error\);/);
  assert.match(localStore, /failureKind: sharedSaveFailureKind\(error\)/);
  assert.match(localStore, /SHARED_SAVE_REVERTED_EVENT/);
});

test("shared-event mutations reach the canonical event before the personal workspace", () => {
  const persist = localStore.slice(
    localStore.indexOf("async function syncAndPersistCloudState"),
    localStore.indexOf("async function withFreshCloudAccount")
  );
  const prioritizedSync = persist.indexOf(
    "? await syncSharedEvents(config, state, globalThis.fetch, syncSelection)"
  );
  const workspaceSave = persist.indexOf("initialSave = await saveCloudStateWithRetry(");

  assert.match(persist, /const prioritizeSharedEventWrite = Boolean\(/);
  assert.ok(prioritizedSync >= 0, "shared mutations have an explicit canonical-first path");
  assert.ok(
    prioritizedSync < workspaceSave,
    "the canonical shared event is persisted before the private workspace copy"
  );
  assert.match(
    persist,
    /if \(!prioritizeSharedEventWrite \|\| initialSave\.conflictCount\)/,
    "workspace conflicts are reconciled back through the shared event"
  );
});

test("a temporary shared-event failure is accepted when the local change is durably queued", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = memoryStorage();
  const dispatched = [];
  const spaceId = "space-account-a";
  const spaceKey = "abcdefghijklmnopqrstuvwxyzABCDEF";
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  const durableState = deviceState("Durable");
  durableState.currentParticipantId = "account-user-a";
  durableState.participants = [
    { id: "account-user-a", displayName: "Durable", kind: "user", accountLinked: true }
  ];
  durableState.events[0] = {
    ...durableState.events[0],
    participantIds: ["account-user-a"],
    adminIds: ["account-user-a"],
    createdByParticipantId: "account-user-a",
    sharedSpaceId: "shared-event-space",
    sharedSpaceKey: "shared-event-secret-that-is-long-enough-123"
  };
  const changedState = structuredClone(durableState);
  changedState.events[0].expenses.push(expense("offline-change", 700));

  saveTestAccount(storage, {
    userId: "user-a",
    accessToken: "token-a",
    spaceId,
    spaceKey
  });
  storage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(durableState));
  globalThis.window = {
    addEventListener() {},
    dispatchEvent(event) {
      dispatched.push(event);
    },
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/config")) {
      return jsonResponse({
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          anonKey: "anon-key",
          table: "shared_state"
        }
      });
    }
    return { ok: false, status: 503 };
  };

  try {
    const store = await import(
      `../src/data/localStore.mjs?shared-write-revert=${Date.now()}`
    );
    const result = await store.saveSharedState(changedState);

    assert.equal(result.ok, true);
    assert.equal(result.mode, "queued");
    assert.equal(result.reverted, undefined);
    assert.equal(result.pending, true);
    assert.deepEqual(
      JSON.parse(storage.getItem(`settle-friends-state:${spaceId}`)),
      changedState
    );
    assert.ok(storage.getItem(`settle-friends-pending-sync:${spaceId}`));
    assert.equal(
      dispatched.some((event) => event.type === "sogrim:shared-save-reverted"),
      false
    );
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

test("an expired account session keeps the latest state in the durable outbox", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const previousAccountSession = globalThis.SogrimAccountSession;
  const storage = memoryStorage();
  const spaceId = "space-auth-expired-outbox";
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  const changedState = queueTestState("Saved Through Expired Session");

  saveTestAccount(storage, {
    userId: "user-a",
    accessToken: "expired-token-a",
    spaceId,
    spaceKey: "auth-expired-secret-that-is-long-enough-123"
  });
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.SogrimAccountSession = { async refresh() { return null; } };
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/config")) {
      return jsonResponse({
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          anonKey: "anon-key",
          table: "shared_state"
        }
      });
    }
    return { ok: false, status: 401 };
  };

  try {
    const store = await import(
      `../src/data/localStore.mjs?auth-expired-outbox=${Date.now()}`
    );
    const result = await store.saveSharedState(changedState, { awaitCloud: true });
    const pending = JSON.parse(
      storage.getItem(`settle-friends-pending-sync:${spaceId}`)
    );

    assert.equal(result.ok, true);
    assert.equal(result.mode, "queued");
    assert.equal(result.pending, true);
    assert.equal(result.error?.code, "CLOUD_STATE_AUTH_EXPIRED");
    assert.equal(pending.participants[0].displayName, "Saved Through Expired Session");
    assert.equal(
      JSON.parse(storage.getItem(`settle-friends-state:${spaceId}`))
        .participants[0].displayName,
      "Saved Through Expired Session"
    );
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
    restoreGlobal("SogrimAccountSession", previousAccountSession);
  }
});

test("a late same-account cloud load cannot overwrite a newer local edit", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const previousAccountSession = globalThis.SogrimAccountSession;
  const storage = memoryStorage();
  const spaceId = "space-late-load-same-account";
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  const remoteState = queueTestState("Older Remote State");
  const changedState = queueTestState("Newer Local Edit");
  const readStarted = deferred();
  const releaseRead = deferred();

  saveTestAccount(storage, {
    userId: "user-a",
    accessToken: "expired-token-a",
    spaceId,
    spaceKey: "late-load-secret-that-is-long-enough-123"
  });
  storage.setItem(
    `settle-friends-state:${spaceId}`,
    JSON.stringify(remoteState)
  );
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.SogrimAccountSession = { async refresh() { return null; } };
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/api/config")) {
      return jsonResponse({
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          anonKey: "anon-key",
          table: "shared_state"
        }
      });
    }
    if (options.method === "POST" || options.method === "PATCH") {
      return { ok: false, status: 401 };
    }
    if (requestUrl.includes("snapshot_kind")) return jsonResponse([]);
    readStarted.resolve();
    await releaseRead.promise;
    return jsonResponse([{
      state: remoteState,
      updated_at: "2026-08-24T09:00:00.000Z"
    }]);
  };

  try {
    const store = await import(
      `../src/data/localStore.mjs?late-same-account-load=${Date.now()}`
    );
    const loadPromise = store.loadSharedState();
    await readStarted.promise;
    const saveResult = await store.saveSharedState(changedState, {
      awaitCloud: true
    });
    releaseRead.resolve();
    const loaded = await loadPromise;
    const local = JSON.parse(
      storage.getItem(`settle-friends-state:${spaceId}`)
    );

    assert.equal(saveResult.mode, "queued");
    assert.equal(loaded.participants[0].displayName, "Newer Local Edit");
    assert.equal(local.participants[0].displayName, "Newer Local Edit");
    assert.ok(storage.getItem(`settle-friends-pending-sync:${spaceId}`));
  } finally {
    releaseRead.resolve();
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
    restoreGlobal("SogrimAccountSession", previousAccountSession);
  }
});

test("a successful outbox flush projects the merged cloud state locally", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = memoryStorage();
  const spaceId = "space-flush-merged-state";
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  const pendingState = queueTestState("Pending Local State");
  pendingState.groups = [{
    id: "local-group",
    name: "Local group",
    memberIds: ["account-user-a"],
    updatedAt: "2026-08-24T10:00:00.000Z"
  }];
  const remoteState = queueTestState("Remote State");
  remoteState.groups = [{
    id: "remote-group",
    name: "Remote group",
    memberIds: ["account-user-a"],
    updatedAt: "2026-08-24T09:00:00.000Z"
  }];

  saveTestAccount(storage, {
    userId: "user-a",
    accessToken: "token-a",
    spaceId,
    spaceKey: "flush-merge-secret-that-is-long-enough-123"
  });
  storage.setItem(
    `settle-friends-state:${spaceId}`,
    JSON.stringify(pendingState)
  );
  storage.setItem(
    `settle-friends-pending-sync:${spaceId}`,
    JSON.stringify(pendingState)
  );
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/api/config")) {
      return jsonResponse({
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          anonKey: "anon-key",
          table: "shared_state"
        }
      });
    }
    if (options.method === "PATCH") {
      return jsonResponse([{ updated_at: "2026-08-24T10:01:00.000Z" }]);
    }
    return jsonResponse([{
      state: remoteState,
      updated_at: "2026-08-24T09:00:00.000Z"
    }]);
  };

  try {
    const store = await import(
      `../src/data/localStore.mjs?flush-merged-projection=${Date.now()}`
    );
    const result = await store.flushPendingSharedState();
    const local = JSON.parse(
      storage.getItem(`settle-friends-state:${spaceId}`)
    );

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(
      local.groups.map(({ id }) => id).sort(),
      ["local-group", "remote-group"]
    );
    assert.equal(
      storage.getItem(`settle-friends-pending-sync:${spaceId}`),
      null
    );
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

test("a temporary workspace-only failure is accepted and schedules an automatic retry", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = memoryStorage();
  const spaceId = "space-account-profile";
  const spaceKey = "abcdefghijklmnopqrstuvwxyzABCDEF";
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  const durableState = queueTestState("Before Profile Save");
  const changedState = queueTestState("After Profile Save");
  let scheduledDelay = 0;

  saveTestAccount(storage, {
    userId: "user-a",
    accessToken: "token-a",
    spaceId,
    spaceKey
  });
  storage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(durableState));
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    setTimeout(_callback, delay) {
      scheduledDelay = delay;
      return 1;
    },
    clearTimeout() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/config")) {
      return jsonResponse({
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          anonKey: "anon-key",
          table: "shared_state"
        }
      });
    }
    return { ok: false, status: 503 };
  };

  try {
    const store = await import(
      `../src/data/localStore.mjs?workspace-only-queued=${Date.now()}`
    );
    const result = await store.saveSharedState(changedState);

    assert.equal(result.ok, true);
    assert.equal(result.mode, "queued");
    assert.equal(result.pending, true);
    assert.equal(scheduledDelay, 1_200);
    assert.deepEqual(
      JSON.parse(storage.getItem(`settle-friends-state:${spaceId}`)),
      changedState
    );
    assert.ok(storage.getItem(`settle-friends-pending-sync:${spaceId}`));
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

test("a stalled cloud write returns control after the foreground budget without a failure", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = memoryStorage();
  const dispatched = [];
  const spaceId = "space-account-stalled";
  const spaceKey = "abcdefghijklmnopqrstuvwxyzABCDEF";
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  const changedState = queueTestState("Saved While Cloud Is Stalled");
  let releaseStalledRequest = null;
  let cloudRequestIsStalled = true;

  saveTestAccount(storage, {
    userId: "user-a",
    accessToken: "token-a",
    spaceId,
    spaceKey
  });
  globalThis.window = {
    addEventListener() {},
    dispatchEvent(event) {
      dispatched.push(event);
    },
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/config")) {
      return jsonResponse({
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          anonKey: "anon-key",
          table: "shared_state"
        }
      });
    }
    if (cloudRequestIsStalled) {
      return new Promise((resolve) => {
        releaseStalledRequest = () => resolve({ ok: false, status: 503 });
      });
    }
    return { ok: false, status: 503 };
  };

  try {
    const store = await import(
      `../src/data/localStore.mjs?stalled-cloud-write=${Date.now()}`
    );
    const startedAt = Date.now();
    const result = await store.saveSharedState(changedState);
    const elapsedMs = Date.now() - startedAt;

    assert.deepEqual(result, { ok: true, mode: "queued", pending: true });
    assert.ok(elapsedMs >= 1_000, `foreground budget returned too early (${elapsedMs}ms)`);
    assert.ok(elapsedMs < 3_000, `foreground budget blocked too long (${elapsedMs}ms)`);
    assert.ok(storage.getItem(`settle-friends-pending-sync:${spaceId}`));
    assert.equal(
      dispatched.some((event) => event.detail?.status === "reconnecting"),
      true
    );
    assert.equal(
      dispatched.some((event) => ["offline", "conflict", "unavailable"].includes(event.detail?.status)),
      false
    );
    cloudRequestIsStalled = false;
    releaseStalledRequest?.();
    await new Promise((resolve) => setTimeout(resolve, 500));
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

test("a transient cloud failure is never reported as pending when durable storage also fails", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const backingStorage = memoryStorage();
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  const spaceId = "space-no-durable-copy";
  saveTestAccount(backingStorage, {
    userId: "user-a",
    accessToken: "token-no-durable-copy",
    spaceId,
    spaceKey: "no-durable-copy-secret-that-is-long-enough"
  });
  const failingStorage = {
    getItem: backingStorage.getItem,
    removeItem: backingStorage.removeItem,
    setItem(key, value) {
      if (
        String(key).startsWith("settle-friends-state:") ||
        String(key).startsWith("settle-friends-pending-sync:")
      ) {
        throw new Error("storage unavailable");
      }
      backingStorage.setItem(key, value);
    }
  };
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: failingStorage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = failingStorage;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/config")) {
      return jsonResponse({
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          anonKey: "anon-key",
          table: "shared_state"
        }
      });
    }
    return { ok: false, status: 503 };
  };

  try {
    const store = await import(
      `../src/data/localStore.mjs?no-durable-pending=${Date.now()}`
    );
    const changedState = queueTestState("No Durable Copy");
    changedState.events = [{
      id: "event-not-durable",
      name: "Must stay in draft",
      eventType: "standard",
      currency: "ILS",
      participantIds: ["account-user-a"],
      adminIds: ["account-user-a"],
      createdByParticipantId: "account-user-a",
      expenses: [],
      transfers: []
    }];
    const result = await store.saveSharedState(changedState);

    assert.equal(result.ok, false);
    assert.equal(result.pending, undefined);
    assert.equal(backingStorage.getItem(`settle-friends-state:${spaceId}`), null);
    assert.equal(
      backingStorage.getItem(`settle-friends-pending-sync:${spaceId}`),
      null
    );
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

test("a workspace failure after canonical persistence keeps the same expense queued", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = memoryStorage();
  const spaceId = "space-partial-account";
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  const durableState = deviceState("Durable");
  durableState.currentParticipantId = "account-user-partial";
  durableState.participants = [
    {
      id: "account-user-partial",
      displayName: "Durable",
      kind: "user",
      accountLinked: true
    }
  ];
  durableState.events[0] = {
    ...durableState.events[0],
    participantIds: ["account-user-partial"],
    adminIds: ["account-user-partial"],
    createdByParticipantId: "account-user-partial",
    sharedSpaceId: "shared-partial-event",
    sharedSpaceKey: "shared-partial-secret-that-is-long-enough-123"
  };
  const changedState = structuredClone(durableState);
  changedState.events[0].expenses.push(expense("stable-expense-id", 700));

  saveTestAccount(storage, {
    userId: "user-partial",
    accessToken: "token-partial",
    spaceId,
    spaceKey: "partial-account-secret-that-is-long-enough-123"
  });
  storage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(durableState));
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/api/config")) {
      return jsonResponse({
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          anonKey: "anon-key",
          table: "shared_state"
        }
      });
    }
    if (requestUrl.includes("id=eq.shared-partial-event")) {
      return jsonResponse([{ state: durableState, updated_at: "2026-08-19T10:00:00.000Z" }]);
    }
    if (requestUrl.endsWith("/rpc/join_shared_event")) {
      return jsonResponse({ joined: true });
    }
    if (requestUrl.endsWith("/rpc/update_shared_event_snapshot")) {
      return jsonResponse({
        status: "updated",
        updatedAt: "2026-08-19T10:00:01.000Z"
      });
    }
    if (options.method === "POST") {
      const body = JSON.parse(options.body ?? "{}");
      if (body.id === spaceId) return { ok: false, status: 503 };
    }
    return { ok: false, status: 503 };
  };

  try {
    const store = await import(
      `../src/data/localStore.mjs?partial-canonical-save=${Date.now()}`
    );
    const result = await store.saveSharedState(changedState);
    const localState = JSON.parse(
      storage.getItem(`settle-friends-state:${spaceId}`)
    );
    const pendingState = JSON.parse(
      storage.getItem(`settle-friends-pending-sync:${spaceId}`)
    );

    assert.equal(result.ok, true);
    assert.equal(result.mode, "queued");
    assert.equal(result.partial, true);
    assert.equal(result.pending, true);
    assert.equal(result.reverted, undefined);
    assert.equal(localState.events[0].expenses.at(-1).id, "stable-expense-id");
    assert.equal(pendingState.events[0].expenses.at(-1).id, "stable-expense-id");
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

test("local mode never reports a false cloud success", () => {
  const save = localStore.slice(
    localStore.indexOf("export async function saveSharedState(state)"),
    localStore.indexOf("export async function flushPendingSharedState")
  );

  assert.match(save, /localSaved\s*\?\s*\{ ok: true, mode: "local" \}/);
  assert.match(save, /if \(runtimeConfig\.storage\?\.mode === "supabase"\)/);
});

test("a local storage failure does not prevent the cloud write path", () => {
  const save = localStore.slice(
    localStore.indexOf("export async function saveSharedState(state)"),
    localStore.indexOf("export async function flushPendingSharedState")
  );

  assert.match(save, /const localSaved = saveState\(cleanState\);/);
  assert.ok(
    save.indexOf("const localSaved = saveState(cleanState)") <
      save.indexOf('if (runtimeConfig.storage?.mode === "supabase")')
  );
  assert.match(localStore, /export function saveState\(state\) \{[\s\S]*?try \{/);
  assert.match(save, /ok: false,[\s\S]*?mode: "local"/);
});

test("a late cloud save cannot repopulate local data after sign out", () => {
  assert.match(localStore, /let accountStorageGeneration = 0/);
  assert.match(localStore, /const requestAccountGeneration = accountStorageGeneration/);
  assert.match(
    localStore,
    /requestAccountGeneration === accountStorageGeneration &&\s*requestSaveGeneration === sharedStateSaveGeneration\s*\) \{\s*Object\.assign\(state, syncedState\);\s*saveState\(syncedState\);/
  );
  assert.match(
    localStore,
    /export function clearLocalAccountData\(accountSpaceId = "", accountUserId = ""\) \{\s*accountStorageGeneration \+= 1;/
  );
  assert.match(localStore, /const accountStateKey = activeSpaceId[\s\S]*?\$\{STORAGE_KEY\}:\$\{activeSpaceId\}/);
});

test("a late cloud load cannot write into a different signed-in account", () => {
  assert.match(localStore, /let sharedStateLoadScope = ""/);
  assert.match(localStore, /const requestScope = synchronizeAccountStorageScope\(\)/);
  assert.match(localStore, /sharedStateLoadScope !== requestScope/);
  assert.match(localStore, /saveStateForScope\(syncedStateWithIdentity, requestScope\)/);
  assert.match(
    localStore,
    /if \(requestScope !== synchronizeAccountStorageScope\(\)\) return false;/
  );
});

test("a save that began under another account is stopped before cloud persistence", () => {
  const save = localStore.slice(
    localStore.indexOf("export async function saveSharedState(state)"),
    localStore.indexOf("export async function flushPendingSharedState")
  );

  assert.match(save, /const requestScope = synchronizeAccountStorageScope\(\)/);
  assert.match(
    save,
    /if \([\s\S]*?requestScope !== synchronizeAccountStorageScope\(\)[\s\S]*?requestAccountGeneration !== accountStorageGeneration[\s\S]*?mode: "stale-account"/
  );
  assert.ok(
    save.indexOf("requestScope !== synchronizeAccountStorageScope()") <
      save.indexOf('if (runtimeConfig.storage?.mode === "supabase")')
  );
});

test("state owned by another account is rejected before any local write", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = memoryStorage();
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  saveTestAccount(storage, {
    userId: "user-b",
    accessToken: "token-b",
    spaceId: "space-account-b",
    spaceKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"
  });
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.fetch = async () => {
    throw new Error("stale account state must not reach the network");
  };

  try {
    const store = await import(
      `../src/data/localStore.mjs?pre-write-account-boundary=${Date.now()}`
    );
    const result = await store.saveSharedState(queueTestState("User A State"));
    assert.equal(result.ok, false);
    assert.equal(result.mode, "stale-account");
    assert.equal(
      storage.getItem("settle-friends-state:space-account-b"),
      null,
      "state from account A must not be written into account B storage"
    );
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

test("legacy cleanup cannot rewrite stale state into the active account", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = memoryStorage();
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  saveTestAccount(storage, {
    userId: "user-b",
    accessToken: "token-b",
    spaceId: "space-account-b",
    spaceKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"
  });
  storage.setItem(
    "settle-friends-local-profile:account:user-b",
    JSON.stringify({
      participantId: "account-user-b",
      displayName: "User Bee",
      authProvider: "google",
      authSubject: "user-b",
      email: "user-b@example.com"
    })
  );
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error("stale account state must not reach the network");
  };

  const staleState = queueTestState("User A State");
  staleState.participants.push({
    id: "account-user-b",
    displayName: "User Bee",
    kind: "user",
    accountLinked: true
  });

  try {
    const store = await import(
      `../src/data/localStore.mjs?pre-clean-account-boundary=${Date.now()}`
    );
    assert.equal(
      store.cleanLegacyStarterData(staleState, "account-user-b").currentParticipantId,
      "account-user-b",
      "the regression setup must exercise the identity rewrite"
    );
    const result = await store.saveSharedState(staleState);

    assert.equal(result.ok, false);
    assert.equal(result.mode, "stale-account");
    assert.equal(networkCalls, 0);
    assert.equal(
      storage.getItem("settle-friends-state:space-account-b"),
      null,
      "cleanup must not relabel and persist state owned by account A"
    );

    const activeState = {
      ...staleState,
      currentParticipantId: "account-user-b"
    };
    const activeResult = await store.saveSharedState(activeState);
    assert.equal(activeResult.ok, true, "the active account must still be able to save");
    assert.equal(store.loadState().currentParticipantId, "account-user-b");
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

test("a valid signed-in account can still save while runtime config is offline", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = memoryStorage();
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  saveTestAccount(storage, {
    userId: "user-a",
    accessToken: "token-a",
    spaceId: "space-account-a",
    spaceKey: "abcdefghijklmnopqrstuvwxyzABCDEF"
  });
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.fetch = async () => {
    throw new Error("offline");
  };

  try {
    const store = await import(
      `../src/data/localStore.mjs?signed-in-offline-save=${Date.now()}`
    );
    const state = queueTestState("Offline Account State");
    const result = await store.saveSharedState(state);

    assert.deepEqual(result, { ok: true, mode: "local", pending: true });
    assert.equal(
      JSON.parse(storage.getItem("settle-friends-state:space-account-a"))
        .currentParticipantId,
      "account-user-a"
    );
    assert.ok(storage.getItem("settle-friends-pending-sync:space-account-a"));
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

test("a guest can still save without an account participant identity", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = memoryStorage();
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.fetch = async () => {
    throw new Error("offline");
  };

  try {
    const store = await import(
      `../src/data/localStore.mjs?guest-offline-save=${Date.now()}`
    );
    const result = await store.saveSharedState(deviceState("Guest State"));

    assert.deepEqual(result, { ok: true, mode: "local" });
    assert.equal(
      JSON.parse(storage.getItem("settle-friends-state")).currentParticipantId,
      "me"
    );
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    }
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function queueTestState(displayName) {
  return {
    currentParticipantId: "account-user-a",
    participants: [
      { id: "account-user-a", displayName, kind: "user", accountLinked: true }
    ],
    friendContacts: [],
    groups: [],
    events: [],
    deletedEvents: [],
    deletedParticipants: []
  };
}

function restoreGlobal(key, value) {
  if (value === undefined) delete globalThis[key];
  else globalThis[key] = value;
}

function saveTestAccount(storage, { userId, accessToken, spaceId, spaceKey }) {
  storage.setItem(
    "settle-friends-account-session",
    JSON.stringify({
      access_token: accessToken,
      refresh_token: `refresh-${userId}`,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: userId,
        user_metadata: {
          account_space_id: spaceId,
          account_space_key: spaceKey
        }
      }
    })
  );
  storage.setItem("settle-friends-cloud-space", spaceId);
  storage.setItem(`settle-friends-cloud-key:${spaceId}`, spaceKey);
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for queued state");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
