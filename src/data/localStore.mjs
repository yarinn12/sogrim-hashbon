import { demoState } from "./demoData.mjs";
import {
  loadCloudState as loadCloudStateRequest,
  saveCloudState as saveCloudStateRequest
} from "./cloudStore.mjs";
import { saveCloudStateWithConflictRetry } from "./cloudConflictRetry.mjs";
import {
  applyLocalParticipantId,
  hasSharedStateChanged as hasCloudStateChanged,
  toSharedState
} from "./localIdentity.mjs";
import {
  isFullProfileName,
  normalizeProfileName,
  normalizeProfileUpdatedAt
} from "../domain/userProfile.mjs";
import {
  normalizeAvatarImage,
  normalizeAvatarPreset
} from "../domain/avatarPresets.mjs";
import {
  applyClientSpaceToConfig,
  peekClientSpaceId,
  peekClientSpaceKey,
  resolveClientSpaceId,
  resolveClientSpaceKey
} from "../domain/cloudSpace.mjs";
import {
  accountStorageIdentityFromSession,
  activateStoredAccountWorkspace,
  LEGACY_STATE_CLAIM_PREFIX,
  loadStoredAccountSession
} from "./accountAuth.mjs";
import { mergeSharedStates } from "../domain/sharedStateMerge.mjs";
import { emitOperationFailure } from "./productMetrics.mjs";
import {
  buildSharedEventSyncSelection,
  recoverAccessibleSharedEvents,
  refreshSharedEvents,
  syncSharedEvents
} from "./sharedEventStore.mjs";
import {
  normalizePublicOrigin,
  runtimeApiOrigins,
  runtimePublicOrigin
} from "../domain/publicOrigin.mjs";

const STORAGE_KEY = "settle-friends-state";
const RUNTIME_CONFIG_TIMEOUT_MS = 4_000;
const STARTUP_SHARED_STATE_WAIT_MS = 1_200;
const NATIVE_RUNTIME_CONFIG_GLOBAL = "SogrimNativeRuntimeConfig";
const LOCAL_PARTICIPANT_KEY = "settle-friends-current-participant";
const LOCAL_PROFILE_KEY = "settle-friends-local-profile";
const ACCOUNT_STORAGE_KEY_SEGMENT = "account";
const PENDING_SYNC_KEY_PREFIX = "settle-friends-pending-sync:";
const SYNC_STATUS_EVENT = "sogrim:sync-status";
const SHARED_SAVE_REVERTED_EVENT = "sogrim:shared-save-reverted";
const PENDING_SYNC_RETRY_DELAYS_MS = [1_200, 3_500, 8_000];
const LOCAL_RUNTIME_CONFIG = {
  publicUrl: "",
  auth: { googleClientId: "" },
  updates: {
    android: {
      minimumSupportedBuild: 0,
      currentBuild: 0,
      required: false,
      storeUrl: "https://play.google.com/store/apps/details?id=com.sogrimhashbon.app"
    }
  },
  monetization: {
    adsEnabled: false,
    androidBannerId: "",
    testMode: false,
    rolloutPercent: 0,
    minimumAndroidBuild: 28,
    sponsoredCardsEnabled: false,
    referralRewardDays: 30,
    premiumEnabled: false,
    premiumProductId: "",
    premiumBasePlanId: "",
    premiumMinimumAndroidBuild: 30
  },
  storage: { mode: "local" },
  launch: {
    publicUrlReady: false,
    cloudStorageReady: false,
    googleAuthReady: false,
    accountDeletionReady: false,
    googlePlayBillingReady: false,
    pushDeliveryReady: false,
    shareLinksReady: false
  }
};
const LEGACY_STARTER_EVENT_ID = "event-demo";
const LEGACY_STARTER_GROUP_ID = "thursday";
const LEGACY_STARTER_PARTICIPANT_IDS = new Set(["yarin", "dani", "avi", "maor"]);

let runtimeConfigPromise = null;
let runtimeConfigRefreshPromise = null;
let runtimeConfigUsedFallback = false;
let sharedStateLoadPromise = null;
let sharedStateLoadScope = "";
let sharedStateLoadStartedAt = 0;
let cloudWriteQueue = Promise.resolve();
let accountStorageGeneration = 0;
let sharedStateSaveGeneration = 0;
let pendingSyncFlushPromise = null;
let pendingSyncRetryTimer = 0;
let pendingSyncRetryAttempt = 0;
let activeAccountStorageScope = "";

async function loadCloudState(config, fallbackState) {
  return withFreshCloudAccount(config, (freshConfig) =>
    loadCloudStateRequest(freshConfig, fallbackState)
  );
}

async function saveCloudState(config, state) {
  return withFreshCloudAccount(config, (freshConfig) =>
    saveCloudStateRequest(freshConfig, state)
  );
}

async function saveCloudStateWithRetry(config, state) {
  return saveCloudStateWithConflictRetry({
    state,
    loadLatest: (fallbackState) => loadCloudState(config, fallbackState),
    save: (candidate) => saveCloudState(config, candidate)
  });
}

async function syncAndPersistCloudStateOnce(config, state, syncSelection = null) {
  const prioritizeSharedEventWrite = Boolean(
    syncSelection &&
    (
      syncSelection.eventIds?.length ||
      syncSelection.deletedEventIds?.length
    )
  );
  let syncedState = prioritizeSharedEventWrite
    ? await syncSharedEvents(config, state, globalThis.fetch, syncSelection)
    : state;
  let initialSave;
  try {
    initialSave = await saveCloudStateWithRetry(
      config,
      toCloudState(config, syncedState)
    );
  } catch (error) {
    if (prioritizeSharedEventWrite) {
      error.sharedEventPersisted = true;
      error.persistedState = syncedState;
    }
    throw error;
  }
  syncedState = mergeSharedStates(initialSave.state, syncedState);

  if (!prioritizeSharedEventWrite || initialSave.conflictCount) {
    syncedState = await syncSharedEvents(
      config,
      syncedState,
      globalThis.fetch,
      initialSave.conflictCount && !prioritizeSharedEventWrite
        ? null
        : syncSelection
    );
  }
  const syncedSharedState = toCloudState(config, syncedState);
  let finalSave = initialSave;

  if (hasCloudStateChanged(syncedSharedState, initialSave.state)) {
    finalSave = await saveCloudStateWithRetry(config, syncedSharedState);
    syncedState = mergeSharedStates(finalSave.state, syncedState);
  }

  return {
    state: syncedState,
    conflictCount: initialSave.conflictCount +
      (finalSave === initialSave ? 0 : finalSave.conflictCount)
  };
}

async function syncAndPersistCloudState(
  config,
  state,
  syncSelection = null
) {
  try {
    return await syncAndPersistCloudStateOnce(config, state, syncSelection);
  } catch (error) {
    if (!isTransientSyncFailure(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 350));
    return syncAndPersistCloudStateOnce(config, state, syncSelection);
  }
}

async function withFreshCloudAccount(config, request) {
  try {
    return await request(config);
  } catch (error) {
    const expectedUserId = String(config?.storage?.account?.userId ?? "").trim();
    if (error?.code !== "CLOUD_STATE_AUTH_EXPIRED" || !expectedUserId) throw error;

    const refreshedSession = await globalThis.SogrimAccountSession?.refresh?.();
    if (!refreshedSession) throw error;

    const freshConfig = activateClientSpace(await loadRuntimeConfig());
    const freshUserId = String(freshConfig?.storage?.account?.userId ?? "").trim();
    if (freshUserId !== expectedUserId) throw error;
    return request(freshConfig);
  }
}

if (typeof window !== "undefined") {
  activateStoredAccountWorkspace();
}

if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("online", () => {
    recoverOnlineSync().catch(() => {});
  });
}

export function loadState() {
  synchronizeAccountStorageScope();
  const raw = readSharedStateRaw();
  const protectedParticipantId = loadProtectedParticipantId();
  const localParticipantId = loadLocalParticipantId();
  if (!raw) {
    return applyLocalParticipantId(
      cleanLegacyStarterData(clone(demoState), protectedParticipantId),
      localParticipantId
    );
  }

  try {
    return applyLocalParticipantId(
      cleanLegacyStarterData(JSON.parse(raw), protectedParticipantId),
      localParticipantId
    );
  } catch {
    return applyLocalParticipantId(
      cleanLegacyStarterData(clone(demoState), protectedParticipantId),
      localParticipantId
    );
  }
}

export function saveState(state) {
  synchronizeAccountStorageScope();
  const cleanState = cleanLegacyStarterData(state, loadProtectedParticipantId());
  try {
    saveLocalParticipantId(cleanState.currentParticipantId);
    window.localStorage.setItem(
      stateStorageKey(),
      JSON.stringify(toSharedState(cleanState))
    );
    return true;
  } catch {
    return false;
  }
}

export async function loadRuntimeConfig() {
  if (!runtimeConfigPromise) {
    const nativeRuntime = isNativeRuntime();
    const bootstrapConfig = nativeBootstrapRuntimeConfig(nativeRuntime);
    if (bootstrapConfig) {
      runtimeConfigUsedFallback = false;
      runtimeConfigPromise = Promise.resolve(bootstrapConfig);
      refreshRuntimeConfig(nativeRuntime).catch(() => {});
    } else {
      runtimeConfigPromise = requestRuntimeConfig(nativeRuntime).catch(() => {
        runtimeConfigUsedFallback = true;
        return LOCAL_RUNTIME_CONFIG;
      });
    }
  }

  return attachStoredAccountIdentity(await runtimeConfigPromise);
}

export function runtimeConfigUsesFallback() {
  return runtimeConfigUsedFallback;
}

export async function retryRuntimeConfig() {
  if (runtimeConfigUsedFallback) {
    runtimeConfigPromise = null;
    runtimeConfigUsedFallback = false;
  }
  return loadRuntimeConfig();
}

export async function refreshRuntimeConfigNow() {
  return attachStoredAccountIdentity(
    await refreshRuntimeConfig(isNativeRuntime())
  );
}

function refreshRuntimeConfig(nativeRuntime) {
  runtimeConfigRefreshPromise ??= requestRuntimeConfig(nativeRuntime)
    .then((config) => {
      runtimeConfigUsedFallback = false;
      runtimeConfigPromise = Promise.resolve(config);
      return config;
    })
    .finally(() => {
      runtimeConfigRefreshPromise = null;
    });
  return runtimeConfigRefreshPromise;
}

function requestRuntimeConfig(nativeRuntime) {
  return nativeRuntimeConfigRequestOptions(nativeRuntime)
    .then((requestOptions) => fetchRuntimeConfig(nativeRuntime, requestOptions))
    .then(({ response, apiBaseUrl }) => {
      if (!response.ok) throw new Error("Runtime config unavailable");
      return response.json().then((config) => ({ config, apiBaseUrl }));
    })
    .then(({ config, apiBaseUrl }) =>
      normalizeRuntimeConfig(config, nativeRuntime, apiBaseUrl)
    );
}

function nativeBootstrapRuntimeConfig(nativeRuntime) {
  if (!nativeRuntime) return null;
  const config = globalThis[NATIVE_RUNTIME_CONFIG_GLOBAL];
  if (
    !config ||
    config.storage?.mode !== "supabase" ||
    !String(config.storage?.url ?? "").startsWith("https://") ||
    !String(config.storage?.anonKey ?? "").trim()
  ) {
    return null;
  }
  return normalizeRuntimeConfig(config, true);
}

function normalizeRuntimeConfig(config, nativeRuntime, apiBaseUrl = "") {
  const bootstrapPublicUrl = normalizePublicOrigin(
    globalThis[NATIVE_RUNTIME_CONFIG_GLOBAL]?.publicUrl
  );
  const nativePublicUrl = nativeRuntime
    ? bootstrapPublicUrl || runtimePublicOrigin(config)
    : config?.publicUrl;
  return {
    ...config,
    publicUrl: nativePublicUrl,
    apiBaseUrl: nativeRuntime
      ? normalizePublicOrigin(apiBaseUrl || config?.apiBaseUrl, runtimePublicOrigin(config))
      : ""
  };
}

async function fetchRuntimeConfig(nativeRuntime, requestOptions) {
  const origins = nativeRuntime ? runtimeApiOrigins() : [""];
  let lastError = null;

  for (const apiBaseUrl of origins) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      RUNTIME_CONFIG_TIMEOUT_MS
    );
    try {
      const response = await fetch(`${apiBaseUrl}/api/config`, {
        ...requestOptions,
        signal: controller.signal
      });
      if (response.ok) return { response, apiBaseUrl };
      lastError = new Error(`Runtime config HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error("Runtime config unavailable");
}

async function recoverOnlineSync() {
  if (runtimeConfigUsedFallback) {
    runtimeConfigPromise = null;
    runtimeConfigUsedFallback = false;
  }
  return flushPendingSharedState();
}

async function nativeRuntimeConfigRequestOptions(nativeRuntime) {
  if (!nativeRuntime) return { cache: "no-store" };

  const platform = String(
    globalThis.Capacitor?.getPlatform?.() ?? "android"
  ).trim().toLowerCase();
  const headers = {
    "X-Sogrim-Platform": platform
  };

  try {
    const info = await globalThis.Capacitor?.Plugins?.App?.getInfo?.();
    if (info?.build) headers["X-Sogrim-App-Build"] = String(info.build);
    if (info?.version) headers["X-Sogrim-App-Version"] = String(info.version);
  } catch {
    // Missing version data keeps the server-side ad gate closed.
  }

  return {
    cache: "no-store",
    headers
  };
}

function isNativeRuntime() {
  return Boolean(
    globalThis.Capacitor?.isNativePlatform?.() ||
    ["capacitor:", "ionic:"].includes(globalThis.location?.protocol) ||
    (globalThis.location?.hostname === "localhost" && globalThis.location?.protocol === "https:")
  );
}

function attachStoredAccountIdentity(config) {
  if (config?.storage?.mode !== "supabase") return config;
  const account = accountStorageIdentityFromSession(loadStoredAccountSession());
  if (!account) return config;

  return {
    ...config,
    storage: {
      ...config.storage,
      account
    }
  };
}

export function loadSharedState() {
  const requestScope = synchronizeAccountStorageScope();
  if (!sharedStateLoadPromise || sharedStateLoadScope !== requestScope) {
    let requestPromise;
    sharedStateLoadStartedAt = Date.now();
    requestPromise = loadSharedStateOnce(requestScope).finally(() => {
      if (sharedStateLoadPromise !== requestPromise) return;
      sharedStateLoadPromise = null;
      sharedStateLoadScope = "";
      sharedStateLoadStartedAt = 0;
    });
    sharedStateLoadScope = requestScope;
    sharedStateLoadPromise = requestPromise;
  }
  return sharedStateLoadPromise;
}

export async function loadSharedStateForStartup({
  maxWaitMs = STARTUP_SHARED_STATE_WAIT_MS
} = {}) {
  const refresh = loadSharedState();
  const elapsedMs = sharedStateLoadStartedAt
    ? Date.now() - sharedStateLoadStartedAt
    : 0;
  const remainingMs = Math.max(0, Number(maxWaitMs) - elapsedMs);

  if (remainingMs === 0) {
    return { state: loadState(), refresh, source: "local" };
  }

  let timeoutId = 0;
  const initial = await Promise.race([
    refresh.then((state) => ({ state, source: "synced" })),
    new Promise((resolve) => {
      timeoutId = globalThis.setTimeout(
        () => resolve({ state: loadState(), source: "local" }),
        remainingMs
      );
    })
  ]);
  globalThis.clearTimeout(timeoutId);

  return {
    state: initial.state,
    refresh: initial.source === "local" ? refresh : null,
    source: initial.source
  };
}

async function loadSharedStateOnce(requestScope) {
  let runtimeConfig = activateClientSpace(await loadRuntimeConfig());
  const localState = loadState();

  if (runtimeConfig.storage?.mode === "supabase") {
    const pendingState = loadPendingSharedState(runtimeConfig);
    if (pendingState) {
      try {
        const remoteState = await loadCloudState(
          runtimeConfig,
          toCloudState(runtimeConfig, localState)
        );
        // loadCloudState may have refreshed an expired account session. Make
        // every request that follows in this same load use that fresh token;
        // otherwise recovery/sync can accidentally replay the expired token.
        runtimeConfig = activateClientSpace(
          attachStoredAccountIdentity(runtimeConfig)
        );
        const mergedState = mergeSharedStates(remoteState, pendingState);
        const syncedState = (await syncAndPersistCloudState(
          runtimeConfig,
          mergedState
        )).state;
        clearPendingSharedState(runtimeConfig);
        publishSyncStatus("saved");
        const syncedStateWithIdentity = applyLocalParticipantId(
          cleanLegacyStarterData(syncedState, loadProtectedParticipantId()),
          loadLocalParticipantId()
        );
        saveStateForScope(syncedStateWithIdentity, requestScope);
        return syncedStateWithIdentity;
      } catch (error) {
        // Keep the pending local snapshot available for a later retry.
        publishSyncFailure(error);
        emitOperationFailure("state_load");
      }

      return applyLocalParticipantId(
        cleanLegacyStarterData(pendingState, loadProtectedParticipantId()),
        loadLocalParticipantId()
      );
    }

    try {
      let state = cleanLegacyStarterData(
        await loadCloudState(
          runtimeConfig,
          toCloudState(runtimeConfig, localState)
        ),
        loadProtectedParticipantId()
      );
      runtimeConfig = activateClientSpace(
        attachStoredAccountIdentity(runtimeConfig)
      );
      const accountState = state;
      state = await recoverAccessibleSharedEvents(runtimeConfig, state);
      state = await refreshSharedEvents(runtimeConfig, state);
      if (hasCloudStateChanged(state, accountState)) {
        const saved = await saveCloudStateWithRetry(
          runtimeConfig,
          toCloudState(runtimeConfig, state)
        );
        state = mergeSharedStates(saved.state, state);
      }
      const localStateWithIdentity = applyLocalParticipantId(
        state,
        loadLocalParticipantId()
      );
      saveStateForScope(localStateWithIdentity, requestScope);
      return localStateWithIdentity;
    } catch {
      emitOperationFailure("state_load");
      return localState;
    }
  }

  return localState;
}

export async function saveSharedState(state) {
  const { forceSharedParticipantIds = [] } = arguments[1] ?? {};
  const requestScope = synchronizeAccountStorageScope();
  const requestAccountUserId = activeAccountUserId();
  const requestAccountParticipantId = requestAccountUserId
    ? `account-${requestAccountUserId}`
    : "";
  const incomingCurrentParticipantId = state?.currentParticipantId;
  if (
    requestAccountParticipantId &&
    incomingCurrentParticipantId !== requestAccountParticipantId
  ) {
    return {
      ok: false,
      mode: "stale-account",
      error: new Error("State does not belong to the active account")
    };
  }
  const previousState = loadState();
  const cleanState = cleanLegacyStarterData(state, loadProtectedParticipantId());
  if (
    requestAccountParticipantId &&
    cleanState.currentParticipantId !== requestAccountParticipantId
  ) {
    return {
      ok: false,
      mode: "stale-account",
      error: new Error("State does not belong to the active account")
    };
  }
  const syncSelection = buildSharedEventSyncSelection(previousState, cleanState, {
    forceParticipantIds: forceSharedParticipantIds
  });
  const hasSharedEventMutation = Boolean(
    syncSelection.eventIds.length || syncSelection.deletedEventIds.length
  );
  const localSaved = saveState(cleanState);
  const requestSaveGeneration = ++sharedStateSaveGeneration;
  const requestAccountGeneration = accountStorageGeneration;
  const stateSnapshot = clone(cleanState);
  const runtimeConfig = activateClientSpace(await loadRuntimeConfig());
  const sharedState = toCloudState(runtimeConfig, stateSnapshot);
  if (
    requestScope !== synchronizeAccountStorageScope() ||
    requestAccountGeneration !== accountStorageGeneration
  ) {
    return {
      ok: false,
      mode: "stale-account",
      error: new Error("Account changed before state save")
    };
  }

  if (runtimeConfig.storage?.mode === "supabase") {
    let pendingStateSaved = savePendingSharedState(runtimeConfig, sharedState);
    publishSyncStatus("saving");

    const pendingPayload = JSON.stringify(sharedState);
    cloudWriteQueue = cloudWriteQueue
      .catch(() => {})
      .then(async () => {
        if (
          requestScope !== synchronizeAccountStorageScope() ||
          requestAccountGeneration !== accountStorageGeneration
        ) {
          return {
            ok: false,
            mode: "stale-account",
            error: new Error("Account changed before queued state save")
          };
        }

        try {
          const saved = await syncAndPersistCloudState(
            runtimeConfig,
            sharedState,
            syncSelection
          );
          const syncedState = saved.state;
          if (
            requestAccountGeneration === accountStorageGeneration &&
            requestSaveGeneration === sharedStateSaveGeneration
          ) {
            Object.assign(state, syncedState);
            saveState(syncedState);
          }
          if (pendingPayload === pendingSharedStateRaw(runtimeConfig)) {
            clearPendingSharedState(runtimeConfig);
          }
          resetPendingSharedStateRetry();
          publishSyncStatus("saved");
          return {
            ok: true,
            mode: "cloud",
            ...(saved.conflictCount ? { merged: true } : {})
          };
        } catch (error) {
          let reverted = false;
          const transientFailure = isTransientSyncFailure(error);
          const partiallyPersistedState = error?.sharedEventPersisted
            ? error.persistedState ?? sharedState
            : null;
          if (
            hasSharedEventMutation &&
            requestAccountGeneration === accountStorageGeneration &&
            requestSaveGeneration === sharedStateSaveGeneration
          ) {
            if (partiallyPersistedState) {
              Object.assign(state, partiallyPersistedState);
              saveState(partiallyPersistedState);
              pendingStateSaved = savePendingSharedState(
                runtimeConfig,
                partiallyPersistedState
              );
            } else if (transientFailure) {
              // Keep locally saved changes queued during temporary outages.
              // A background retry will persist them when the service recovers.
              pendingStateSaved = savePendingSharedState(runtimeConfig, sharedState);
              if (pendingStateSaved) schedulePendingSharedStateRetry();
            } else {
              saveState(previousState);
              publishSharedSaveReverted(syncSelection, error);
              reverted = true;
            }
          }
          if (
            !transientFailure &&
            !partiallyPersistedState &&
            pendingPayload === pendingSharedStateRaw(runtimeConfig)
          ) {
            clearPendingSharedState(runtimeConfig);
            pendingStateSaved = false;
          }
          publishSyncFailure(error);
          logSyncFailure(error, {
            sharedEventMutation: hasSharedEventMutation,
            pending: Boolean(pendingStateSaved),
            partial: Boolean(partiallyPersistedState),
            reverted
          });
          emitOperationFailure("state_save");
          return {
            ok: false,
            mode: "cloud",
            error,
            ...(partiallyPersistedState ? { partial: true, pending: true } : {}),
            ...(transientFailure && !partiallyPersistedState && pendingStateSaved
              ? { pending: true }
              : {}),
            ...(reverted ? { reverted: true } : {})
          };
        }
      });

    return cloudWriteQueue;
  }

  if (runtimeConfigUsedFallback) {
    const pendingConfig = pendingSyncConfig(runtimeConfig);
    if (pendingConfig) {
      const pendingStateSaved = savePendingSharedState(pendingConfig, sharedState);
      publishSyncStatus(globalThis.navigator?.onLine === false ? "offline" : "unavailable");
      return localSaved && pendingStateSaved
        ? { ok: true, mode: "local", pending: true }
        : {
            ok: false,
            mode: "local",
            error: new Error("Local storage is unavailable")
          };
    }
  }

  if (!localSaved) emitOperationFailure("state_save");
  return localSaved
    ? { ok: true, mode: "local" }
    : {
        ok: false,
        mode: "local",
        error: new Error("Local storage is unavailable")
      };
}

export async function flushPendingSharedState() {
  if (!pendingSyncFlushPromise) {
    cloudWriteQueue = cloudWriteQueue
      .catch(() => {})
      .then(flushPendingSharedStateOnce);
    pendingSyncFlushPromise = cloudWriteQueue.finally(() => {
      pendingSyncFlushPromise = null;
    });
  }

  return pendingSyncFlushPromise;
}


async function flushPendingSharedStateOnce() {
  const runtimeConfig = activateClientSpace(await loadRuntimeConfig());
  if (runtimeConfig.storage?.mode !== "supabase") return { ok: false };

  const pendingPayload = pendingSharedStateRaw(runtimeConfig);
  const pendingState = loadPendingSharedState(runtimeConfig);
  if (!pendingState) return { ok: true, empty: true };

  publishSyncStatus("saving");
  try {
    const remoteState = await loadCloudState(runtimeConfig, pendingState);
    const mergedState = mergeSharedStates(remoteState, pendingState);
    await syncAndPersistCloudState(runtimeConfig, mergedState);
    if (pendingPayload === pendingSharedStateRaw(runtimeConfig)) {
      clearPendingSharedState(runtimeConfig);
    }
    resetPendingSharedStateRetry();
    publishSyncStatus("saved");
    return { ok: true };
  } catch (error) {
    publishSyncFailure(error);
    if (isTransientSyncFailure(error)) schedulePendingSharedStateRetry();
    logSyncFailure(error, {
      sharedEventMutation: true,
      pending: true,
      partial: false,
      reverted: false
    });
    emitOperationFailure("state_save");
    return { ok: false, error };
  }
}

export async function resetSharedState() {
  const runtimeConfig = activateClientSpace(await loadRuntimeConfig());

  if (runtimeConfig.storage?.mode === "supabase") {
    const state = applyLocalParticipantId(
      cleanLegacyStarterData(clone(demoState), loadProtectedParticipantId()),
      loadLocalParticipantId()
    );
    await saveSharedState(state);
    return state;
  }

  try {
    const response = await fetch("/api/reset", { method: "POST" });
    if (!response.ok) throw new Error("Reset failed");
    const state = cleanLegacyStarterData(
      await response.json(),
      loadProtectedParticipantId()
    );
    const localStateWithIdentity = applyLocalParticipantId(
      state,
      loadLocalParticipantId()
    );
    saveState(localStateWithIdentity);
    return localStateWithIdentity;
  } catch {
    return resetState();
  }
}

export function loadLocalProfile() {
  synchronizeAccountStorageScope();
  const accountUserId = activeAccountUserId();
  const storageKey = profileStorageKey(accountUserId);
  let raw = window.localStorage.getItem(storageKey);
  if (!raw && accountUserId) {
    const legacyRaw = window.localStorage.getItem(LOCAL_PROFILE_KEY);
    const legacyProfile = parseLocalProfile(legacyRaw);
    if (profileBelongsToAccount(legacyProfile, accountUserId)) {
      raw = legacyRaw;
      window.localStorage.setItem(storageKey, legacyRaw);
      window.localStorage.removeItem(LOCAL_PROFILE_KEY);
    }
  }
  if (!raw) return null;

  const profile = parseLocalProfile(raw);
  if (accountUserId && !profileBelongsToAccount(profile, accountUserId)) {
    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(participantStorageKey(accountUserId));
    return null;
  }

  return profile;
}

export function saveLocalProfile(profile) {
  synchronizeAccountStorageScope();
  const displayName = normalizeProfileName(profile.displayName);
  if (!isFullProfileName(displayName) || !profile.participantId) return null;
  const previousProfile = loadLocalProfile();

  const nextProfile = {
    participantId: profile.participantId,
    displayName,
    ...profileAvatarFields({
      avatarPreset:
        profile.avatarPreset ??
        (
          previousProfile?.participantId === profile.participantId
            ? previousProfile.avatarPreset
            : ""
        ),
      avatarImage:
        profile.avatarImage ??
        (
          previousProfile?.participantId === profile.participantId
            ? previousProfile.avatarImage
            : ""
        )
    }),
    ...profileUpdatedAtField(
      profile.profileUpdatedAt ??
        (
          previousProfile?.participantId === profile.participantId
            ? previousProfile.profileUpdatedAt
            : ""
        )
    ),
    ...profileAuthFields(profile)
  };
  window.localStorage.setItem(
    profileStorageKey(),
    JSON.stringify(nextProfile)
  );
  saveLocalParticipantId(nextProfile.participantId);
  return nextProfile;
}

export function clearLocalProfile(accountUserId = "") {
  try {
    const resolvedAccountUserId = normalizeAccountUserId(
      accountUserId || activeAccountUserId()
    );
    window.localStorage.removeItem(profileStorageKey(resolvedAccountUserId));
    window.localStorage.removeItem(
      participantStorageKey(resolvedAccountUserId)
    );
    if (resolvedAccountUserId) {
      const legacyProfile = parseLocalProfile(
        window.localStorage.getItem(LOCAL_PROFILE_KEY)
      );
      if (profileBelongsToAccount(legacyProfile, resolvedAccountUserId)) {
        window.localStorage.removeItem(LOCAL_PROFILE_KEY);
        window.localStorage.removeItem(LOCAL_PARTICIPANT_KEY);
      }
    }
  } catch {}
}

export function clearLocalAccountData(accountSpaceId = "", accountUserId = "") {
  accountStorageGeneration += 1;
  sharedStateLoadPromise = null;
  sharedStateLoadScope = "";
  try {
    const activeSpaceId =
      accountSpaceId ||
      peekClientSpaceId(window.location.href, window.localStorage) ||
      "";
    const accountStateKey = activeSpaceId
      ? `${STORAGE_KEY}:${activeSpaceId}`
      : stateStorageKey();
    window.localStorage.removeItem(accountStateKey);
    window.localStorage.removeItem(STORAGE_KEY);
    if (activeSpaceId) {
      window.localStorage.removeItem(`${PENDING_SYNC_KEY_PREFIX}${activeSpaceId}`);
    }
  } catch {}
  clearLocalProfile(accountUserId);
  activeAccountStorageScope = "";
  publishSyncStatus("");
}

export function resetState() {
  const state = applyLocalParticipantId(
    cleanLegacyStarterData(clone(demoState), loadProtectedParticipantId()),
    loadLocalParticipantId()
  );
  saveState(state);
  return state;
}

export function getActiveCloudSpaceId(config = LOCAL_RUNTIME_CONFIG) {
  if (config?.storage?.mode !== "supabase") {
    return peekClientSpaceId(window.location.href, window.localStorage) ?? "";
  }

  return resolveClientSpaceId({
    currentUrl: window.location.href,
    configuredSpaceId: config.storage.spaceId,
    storage: window.localStorage
  });
}

export function getActiveCloudSpaceKey(config = LOCAL_RUNTIME_CONFIG) {
  const spaceId = getActiveCloudSpaceId(config);
  if (!spaceId) return "";

  return resolveClientSpaceKey({
    currentUrl: window.location.href,
    spaceId,
    storage: window.localStorage
  });
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function cleanLegacyStarterData(state, protectedParticipantId = "") {
  if (!state || typeof state !== "object") return clone(demoState);

  const groups = Array.isArray(state.groups)
    ? state.groups.filter((group) => group.id !== LEGACY_STARTER_GROUP_ID)
    : [];
  const events = Array.isArray(state.events)
    ? state.events.filter((event) => event.id !== LEGACY_STARTER_EVENT_ID)
    : [];
  const referencedParticipantIds = collectReferencedParticipantIds(groups, events);
  const participants = Array.isArray(state.participants)
    ? state.participants.filter(
        (participant) =>
          !LEGACY_STARTER_PARTICIPANT_IDS.has(participant.id) ||
          participant.id === protectedParticipantId ||
          referencedParticipantIds.has(participant.id)
      )
    : [];
  const currentParticipantId = resolveCleanCurrentParticipantId(
    state.currentParticipantId,
    participants,
    protectedParticipantId
  );

  return {
    ...state,
    currentParticipantId,
    participants,
    groups,
    events
  };
}

function loadLocalParticipantId() {
  const accountUserId = activeAccountUserId();
  const storedParticipantId = window.localStorage.getItem(
    participantStorageKey(accountUserId)
  );
  if (storedParticipantId) return storedParticipantId;

  const profileParticipantId = loadLocalProfile()?.participantId;
  if (profileParticipantId) return profileParticipantId;
  return accountUserId ? `account-${accountUserId}` : "";
}

function stateStorageKey() {
  const spaceId = peekClientSpaceId(window.location.href, window.localStorage);
  return spaceId ? `${STORAGE_KEY}:${spaceId}` : STORAGE_KEY;
}

function readSharedStateRaw() {
  const key = stateStorageKey();
  const raw = window.localStorage.getItem(key);
  if (raw || key === STORAGE_KEY) {
    return raw;
  }

  const legacyRaw = window.localStorage.getItem(STORAGE_KEY);
  if (!legacyRaw) return null;

  const spaceId = peekClientSpaceId(window.location.href, window.localStorage);
  const accountUserId = activeAccountUserId();
  const claimKey = spaceId ? `${LEGACY_STATE_CLAIM_PREFIX}${spaceId}` : "";
  const accountCanClaimLegacyState =
    !accountUserId ||
    (claimKey && window.localStorage.getItem(claimKey) === "1");
  if (!accountCanClaimLegacyState) return null;

  window.localStorage.setItem(key, legacyRaw);
  window.localStorage.removeItem(STORAGE_KEY);
  if (claimKey) window.localStorage.removeItem(claimKey);
  return legacyRaw;
}

function activateClientSpace(config) {
  if (config?.storage?.mode !== "supabase") return config;
  const spaceId = getActiveCloudSpaceId(config);
  const spaceKey = resolveClientSpaceKey({
    currentUrl: window.location.href,
    spaceId,
    storage: window.localStorage
  });
  return applyClientSpaceToConfig(config, spaceId, spaceKey);
}

function toCloudState(config, state) {
  const account = config?.storage?.account;
  const preserveCurrentParticipantId = Boolean(
    account?.userId &&
      account?.spaceId &&
      account.spaceId === config?.storage?.spaceId
  );
  return toSharedState(state, { preserveCurrentParticipantId });
}

function pendingSyncStorageKey(config) {
  return `${PENDING_SYNC_KEY_PREFIX}${config.storage.spaceId}`;
}

function pendingSyncConfig(config) {
  const spaceId = getActiveCloudSpaceId(config);
  if (!spaceId) return null;
  return {
    storage: {
      ...(config?.storage ?? {}),
      spaceId
    }
  };
}

function pendingSharedStateRaw(config) {
  try {
    return window.localStorage.getItem(pendingSyncStorageKey(config));
  } catch {
    return null;
  }
}

function loadPendingSharedState(config) {
  const raw = pendingSharedStateRaw(config);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    clearPendingSharedState(config);
    return null;
  }
}

function savePendingSharedState(config, sharedState) {
  try {
    window.localStorage.setItem(pendingSyncStorageKey(config), JSON.stringify(sharedState));
    return true;
  } catch {
    return false;
  }
}

function clearPendingSharedState(config) {
  try {
    window.localStorage.removeItem(pendingSyncStorageKey(config));
  } catch {}
}

function publishSyncFailure(error) {
  publishSyncStatus(syncFailureStatus(error));
}

export function syncFailureStatus(
  error,
  online = globalThis.navigator?.onLine !== false
) {
  const errors = flattenSyncErrors(error);
  if (errors.some((item) => item?.code === "CLOUD_STATE_CONFLICT")) {
    return "conflict";
  }
  if (!online) return "offline";
  return "unavailable";
}

function flattenSyncErrors(error) {
  const queue = [error];
  const errors = [];
  const seen = new Set();
  while (queue.length) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    errors.push(next);
    if (next.cause) queue.push(next.cause);
    if (Array.isArray(next.failures)) queue.push(...next.failures);
  }
  return errors;
}

function isNetworkFailure(error) {
  if (!error) return false;
  if (["NETWORK_TIMEOUT", "ERR_NETWORK"].includes(error.code)) return true;
  if (error.name === "AbortError") return true;
  if (Number(error.status ?? 0) > 0) return false;
  return /(failed to fetch|fetch failed|network(?:error| request)|load failed|connection|internet)/i
    .test(String(error.message ?? ""));
}

export function isTransientSyncFailure(error) {
  return flattenSyncErrors(error).some((item) => {
    if (item?.code === "CLOUD_STATE_CONFLICT") return true;
    if (isNetworkFailure(item)) return true;
    const status = Number(item?.status ?? 0);
    return status === 408 || status === 425 || status === 429 || status >= 500;
  });
}

function schedulePendingSharedStateRetry() {
  if (
    pendingSyncRetryTimer ||
    pendingSyncRetryAttempt >= PENDING_SYNC_RETRY_DELAYS_MS.length ||
    globalThis.navigator?.onLine === false ||
    typeof globalThis.window?.setTimeout !== "function"
  ) {
    return;
  }
  const delay = PENDING_SYNC_RETRY_DELAYS_MS[pendingSyncRetryAttempt];
  pendingSyncRetryAttempt += 1;
  pendingSyncRetryTimer = globalThis.window.setTimeout(async () => {
    pendingSyncRetryTimer = 0;
    const result = await flushPendingSharedState().catch((error) => ({ ok: false, error }));
    if (result?.ok) {
      resetPendingSharedStateRetry();
    } else if (isTransientSyncFailure(result?.error)) {
      schedulePendingSharedStateRetry();
    }
  }, delay);
}

function resetPendingSharedStateRetry() {
  if (
    pendingSyncRetryTimer &&
    typeof globalThis.window?.clearTimeout === "function"
  ) {
    globalThis.window.clearTimeout(pendingSyncRetryTimer);
  }
  pendingSyncRetryTimer = 0;
  pendingSyncRetryAttempt = 0;
}

function logSyncFailure(error, outcome) {
  const errors = flattenSyncErrors(error);
  const codes = [...new Set(errors.map((item) => String(item?.code ?? "").trim()).filter(Boolean))];
  const statuses = [...new Set(errors.map((item) => Number(item?.status ?? 0)).filter((status) => status > 0))];
  console.error("[sync] State save failed", {
    codes,
    statuses,
    transient: isTransientSyncFailure(error),
    online: globalThis.navigator?.onLine !== false,
    ...outcome
  });
}

function publishSyncStatus(status) {
  if (typeof window === "undefined" || !window.dispatchEvent) return;

  const EventConstructor = globalThis.CustomEvent;
  if (typeof EventConstructor !== "function") return;
  window.dispatchEvent(new EventConstructor(SYNC_STATUS_EVENT, { detail: { status } }));
}

function publishSharedSaveReverted(syncSelection, error) {
  if (typeof window === "undefined" || !window.dispatchEvent) return;

  const EventConstructor = globalThis.CustomEvent;
  if (typeof EventConstructor !== "function") return;
  window.dispatchEvent(new EventConstructor(SHARED_SAVE_REVERTED_EVENT, {
    detail: {
      eventIds: [...(syncSelection?.eventIds ?? [])],
      deletedEventIds: [...(syncSelection?.deletedEventIds ?? [])],
      failureKind: sharedSaveFailureKind(error)
    }
  }));
}

function sharedSaveFailureKind(error) {
  const errors = flattenSyncErrors(error);
  const codes = new Set(
    errors.map((item) => String(item?.code ?? "").trim()).filter(Boolean)
  );
  const statuses = new Set(
    errors.map((item) => Number(item?.status ?? 0)).filter((status) => status > 0)
  );
  if (statuses.has(401) || codes.has("CLOUD_STATE_AUTH_EXPIRED")) return "auth";
  if (
    statuses.has(403) ||
    codes.has("SHARED_EVENT_MEMBERSHIP_REVOKED") ||
    codes.has("SHARED_EVENT_CREATE_NOT_ALLOWED")
  ) {
    return "permission";
  }
  if ([400, 409, 422].some((status) => statuses.has(status))) return "rejected";
  return "unavailable";
}

function saveLocalParticipantId(participantId) {
  if (!participantId) return;
  window.localStorage.setItem(participantStorageKey(), participantId);
}

function parseLocalProfile(raw) {
  if (!raw) return null;

  try {
    const profile = JSON.parse(raw);
    const displayName = normalizeProfileName(profile.displayName);
    if (!isFullProfileName(displayName) || !profile.participantId) return null;
    return {
      participantId: profile.participantId,
      displayName,
      ...profileAvatarFields(profile),
      ...profileUpdatedAtField(profile.profileUpdatedAt),
      ...profileAuthFields(profile)
    };
  } catch {
    return null;
  }
}

function profileBelongsToAccount(profile, accountUserId) {
  const normalizedAccountUserId = normalizeAccountUserId(accountUserId);
  return Boolean(
    profile &&
      normalizedAccountUserId &&
      (
        profile.authSubject === normalizedAccountUserId ||
        profile.participantId === `account-${normalizedAccountUserId}`
      )
  );
}

function profileStorageKey(accountUserId = activeAccountUserId()) {
  return accountScopedStorageKey(LOCAL_PROFILE_KEY, accountUserId);
}

function participantStorageKey(accountUserId = activeAccountUserId()) {
  return accountScopedStorageKey(LOCAL_PARTICIPANT_KEY, accountUserId);
}

function accountScopedStorageKey(baseKey, accountUserId) {
  const normalizedAccountUserId = normalizeAccountUserId(accountUserId);
  return normalizedAccountUserId
    ? `${baseKey}:${ACCOUNT_STORAGE_KEY_SEGMENT}:${encodeURIComponent(normalizedAccountUserId)}`
    : baseKey;
}

function activeAccountUserId() {
  try {
    return normalizeAccountUserId(
      loadStoredAccountSession(window.localStorage)?.user?.id
    );
  } catch {
    return "";
  }
}

function normalizeAccountUserId(value) {
  return String(value ?? "").trim();
}

function accountStorageScope() {
  const accountUserId = activeAccountUserId() || "guest";
  const spaceId =
    peekClientSpaceId(window.location.href, window.localStorage) || "local";
  return `${accountUserId}|${spaceId}`;
}

function synchronizeAccountStorageScope() {
  const nextScope = accountStorageScope();
  if (activeAccountStorageScope && activeAccountStorageScope !== nextScope) {
    accountStorageGeneration += 1;
    sharedStateLoadPromise = null;
    sharedStateLoadScope = "";
  }
  activeAccountStorageScope = nextScope;
  return nextScope;
}

function saveStateForScope(state, requestScope) {
  if (requestScope !== synchronizeAccountStorageScope()) return false;
  return saveState(state);
}

function profileAuthFields(profile) {
  if (!["google", "apple", "email"].includes(profile?.authProvider) || !profile.authSubject) {
    return {};
  }

  return {
    authProvider: profile.authProvider,
    authSubject: String(profile.authSubject),
    email: String(profile.email ?? "").trim().toLowerCase()
  };
}

function profileAvatarFields(profile) {
  const avatarPreset = normalizeAvatarPreset(profile?.avatarPreset);
  const avatarImage = normalizeAvatarImage(profile?.avatarImage);
  return {
    ...(avatarPreset ? { avatarPreset } : {}),
    ...(avatarImage ? { avatarImage } : {})
  };
}

function profileUpdatedAtField(value) {
  const profileUpdatedAt = normalizeProfileUpdatedAt(value);
  return profileUpdatedAt ? { profileUpdatedAt } : {};
}

function loadProtectedParticipantId() {
  return loadLocalProfile()?.participantId ?? "";
}

function collectReferencedParticipantIds(groups, events) {
  const ids = new Set();

  for (const group of groups) {
    addIds(ids, group.memberIds);
    addIds(ids, group.adminIds);
  }

  for (const event of events) {
    addIds(ids, event.participantIds);
    addIds(ids, event.adminIds);
    if (event.createdByParticipantId) ids.add(event.createdByParticipantId);

    for (const expense of event.expenses ?? []) {
      if (expense.createdByParticipantId) ids.add(expense.createdByParticipantId);
      addIds(ids, expense.sharedByParticipantIds);
      addIds(ids, expense.payers?.map((payer) => payer.participantId));
    }

    for (const transfer of event.transfers ?? []) {
      if (transfer.fromParticipantId) ids.add(transfer.fromParticipantId);
      if (transfer.toParticipantId) ids.add(transfer.toParticipantId);
      if (transfer.markedPaidByParticipantId) ids.add(transfer.markedPaidByParticipantId);
    }

    for (const activity of event.activityLog ?? []) {
      if (activity.actorParticipantId) ids.add(activity.actorParticipantId);
      if (activity.subjectParticipantId) ids.add(activity.subjectParticipantId);
      if (activity.fromParticipantId) ids.add(activity.fromParticipantId);
      if (activity.toParticipantId) ids.add(activity.toParticipantId);
    }
  }

  return ids;
}

function addIds(target, ids = []) {
  for (const id of ids) {
    if (id) target.add(id);
  }
}

function resolveCleanCurrentParticipantId(
  currentParticipantId,
  participants,
  protectedParticipantId
) {
  if (participants.some((participant) => participant.id === protectedParticipantId)) {
    return protectedParticipantId;
  }

  if (
    currentParticipantId &&
    !LEGACY_STARTER_PARTICIPANT_IDS.has(currentParticipantId) &&
    participants.some((participant) => participant.id === currentParticipantId)
  ) {
    return currentParticipantId;
  }

  return "";
}
