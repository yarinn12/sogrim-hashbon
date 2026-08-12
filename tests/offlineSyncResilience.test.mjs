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
    /const sharedState = clone\(toSharedState\(cleanState\)\)/,
    "queued writes must not retain references to live event and expense objects"
  );
  assert.ok(
    save.indexOf("const sharedState = clone(toSharedState(cleanState))") <
      save.indexOf("await loadRuntimeConfig()"),
    "the immutable snapshot is captured before any asynchronous gap"
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
    href: "https://sogrim-hashbon.vercel.app/",
    hostname: "sogrim-hashbon.vercel.app",
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
    /if \(pendingPayload === pendingSharedStateRaw\(runtimeConfig\)\) \{\s*\n\s*clearPendingSharedState\(runtimeConfig\);/
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
    /window\.addEventListener\("online", \(\) => \{\s*\n\s*recoverOnlineSync\(\)/
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
  assert.match(save, /savePendingSharedState\(pendingConfig, sharedState\);/);
  assert.match(save, /\{ ok: true, mode: "local", pending: true \}/);
});

test("a write conflict is resolved by merging rather than overwriting", () => {
  const save = localStore.slice(
    localStore.indexOf("export async function saveSharedState(state)"),
    localStore.indexOf("export async function flushPendingSharedState")
  );

  assert.match(save, /syncAndPersistCloudState\([\s\S]*?runtimeConfig,[\s\S]*?sharedState,[\s\S]*?syncSelection/);
  assert.match(conflictRetry, /error\?\.code !== "CLOUD_STATE_CONFLICT"/);
  assert.match(conflictRetry, /candidate = latest \? mergeSharedStates\(latest, candidate\) : candidate/);
  assert.match(conflictRetry, /conflictCount >= retryLimit/);
});

test("a recovered pending-state conflict is reported as saved instead of remaining stuck", () => {
  const load = localStore.slice(
    localStore.indexOf("async function loadSharedStateOnce"),
    localStore.indexOf("export async function saveSharedState")
  );
  const recoveryCall = load.indexOf("syncAndPersistCloudState(");
  const recoverySave = load.indexOf('publishSyncStatus("saved")', recoveryCall);
  const recoveryFailure = load.indexOf("publishSyncFailure(error)", recoveryCall);

  assert.ok(recoveryCall >= 0, "pending state uses bounded conflict recovery");
  assert.ok(recoverySave > recoveryCall, "successful recovery clears the warning");
  assert.ok(recoveryFailure > recoverySave, "only a failed recovery surfaces the conflict");
});

test("shared event writes also retry through a merge on conflict", () => {
  const save = sharedEventStore.slice(
    sharedEventStore.indexOf("export async function saveSharedEventState"),
    sharedEventStore.indexOf("export async function syncSharedEvents")
  );

  assert.match(save, /saveCloudStateWithConflictRetry\(\{/);
  assert.match(save, /loadLatest: \(\) => readCloudState\(config, fetchImpl\)/);
  assert.match(save, /save: \(candidate\) => saveCloudState\(config, candidate, fetchImpl\)/);
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
  assert.match(
    localStore,
    /publishSyncStatus\(error\?\.code === "CLOUD_STATE_CONFLICT" \? "conflict" : "offline"\)/
  );
  assert.match(localStore, /const SYNC_STATUS_EVENT = "sogrim:sync-status";/);
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
