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
import { rollbackNoteOnlyStateChange } from "./noteSaveRollback.mjs";
import { rollbackSettingsOnlyStateChange } from "./settingsSaveRollback.mjs";
import { saveFailureKind } from "../domain/userNoticePolicy.mjs";
import {
  emitOperationDeferred,
  emitOperationFailure
} from "./productMetrics.mjs";
import {
  buildSharedEventSyncSelection,
  recoverAccessibleSharedEvents,
  syncSharedEvents
} from "./sharedEventStore.mjs";
import {
  canonicalPublicOrigin,
  runtimeApiOrigins,
  runtimePublicOrigin
} from "../domain/publicOrigin.mjs";
import { fetchWithTimeout } from "./fetchTimeout.mjs";

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
const FOREGROUND_SAVE_BUDGET_MS = 1_500;
const PENDING_SYNC_RETRY_DELAYS_MS = [
  1_200,
  3_500,
  8_000,
  15_000,
  30_000,
  60_000,
  120_000
];
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
let accountIdentityGeneration = 0;
let sharedStateSaveGeneration = 0;
let pendingSyncFlushPromise = null;
let pendingSyncRetryTimer = 0;
let pendingSyncRetryGeneration = 0;
let pendingSyncRetryAttempt = 0;
let pendingSyncRetryNotBefore = 0;
let pendingSharedSyncCoverage = null;
let activeAccountStorageScope = "";
let activeStorageAccountUserId = "";
const recoveredEventIndexPersistJobs = new Map();

async function loadCloudState(config, fallbackState, options = {}) {
  return withFreshCloudAccount(config, (freshConfig) =>
    loadCloudStateRequest(freshConfig, fallbackState, globalThis.fetch, options)
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
  let syncedState = state;
  let deferredSharedFailure = null;
  try {
    syncedState = prioritizeSharedEventWrite
      ? await syncSharedEvents(config, state, globalThis.fetch, syncSelection)
      : state;
  } catch (error) {
    if (!error?.partialSharedState?.state) throw error;
    // A broken sibling must not freeze personal-only changes or discard the
    // healthy events' merged state. Still rethrow after this best-effort save:
    // personal persistence is not proof that all shared changes were delivered.
    deferredSharedFailure = error;
    syncedState = error.partialSharedState.state;
  }
  let initialSave;
  try {
    initialSave = await saveCloudStateWithRetry(
      config,
      toCloudState(config, syncedState)
    );
  } catch (error) {
    if (deferredSharedFailure) {
      deferredSharedFailure.failures = [...deferredSharedFailure.failures, error];
      throw deferredSharedFailure;
    }
    if (prioritizeSharedEventWrite) {
      error.sharedEventPersisted = true;
      error.persistedState = syncedState;
    }
    throw error;
  }
  const canonicalCommittedState = syncedState;
  syncedState = mergeSharedStates(initialSave.state, syncedState);
  if (deferredSharedFailure) {
    deferredSharedFailure.partialSharedState.state = syncedState;
    throw deferredSharedFailure;
  }

  if (!prioritizeSharedEventWrite || initialSave.conflictCount) {
    let reconciliationSelection = initialSave.conflictCount && !prioritizeSharedEventWrite
      ? null
      : syncSelection;
    if (prioritizeSharedEventWrite) {
      // Atomic note projection advances the personal workspace version too.
      // A CAS retry is therefore not evidence of another shared mutation.
      // Republish only selected events whose shared payload actually changed
      // during workspace reconciliation, preserving the original write scope.
      const changed = buildSharedEventSyncSelection(canonicalCommittedState, syncedState);
      const selectedIds = new Set([
        ...(syncSelection.eventIds ?? []),
        ...(syncSelection.deletedEventIds ?? [])
      ]);
      reconciliationSelection = {
        eventIds: changed.eventIds.filter((id) => selectedIds.has(id)),
        deletedEventIds: changed.deletedEventIds.filter((id) => selectedIds.has(id))
      };
    }
    if (
      !prioritizeSharedEventWrite ||
      reconciliationSelection.eventIds.length ||
      reconciliationSelection.deletedEventIds.length
    ) {
      syncedState = await syncSharedEvents(
        config,
        syncedState,
        globalThis.fetch,
        reconciliationSelection
      );
    }
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
    const selectedIds = [
      ...(syncSelection?.eventIds ?? []),
      ...(syncSelection?.deletedEventIds ?? [])
    ];
    const priorProgress = error.partialSharedState ?? (
      error.sharedEventPersisted && error.persistedState
        ? { state: error.persistedState, succeededEventIds: selectedIds }
        : null
    );
    const hasPriorProgress = Boolean(priorProgress?.succeededEventIds?.length);
    const retryState = hasPriorProgress ? priorProgress.state : state;
    await new Promise((resolve) => setTimeout(resolve, 350));
    try {
      return await syncAndPersistCloudStateOnce(config, retryState, syncSelection);
    } catch (retryError) {
      if (hasPriorProgress && !retryError.sharedEventPersisted) {
        const latestProgress = retryError.partialSharedState;
        // A later failure cannot undo a previous commit or erase its remote
        // merges. Carry that progress forward, but use the latest failed IDs:
        // historical success is not confirmation of the final attempted state.
        retryError.partialSharedState = {
          state: latestProgress?.state ?? retryState,
          succeededEventIds: [...new Set([
            ...priorProgress.succeededEventIds,
            ...(latestProgress?.succeededEventIds ?? [])
          ])],
          failedEventIds: latestProgress?.failedEventIds ?? selectedIds
        };
      }
      throw retryError;
    }
  }
}

async function withFreshCloudAccount(config, request) {
  const requestScope = synchronizeAccountStorageScope();
  const requestAccountGeneration = accountStorageGeneration;
  // Capture identity before the request can yield. Looking it up in catch
  // would let an expired request adopt a different user's refreshed session.
  const expectedUserId = String(
    config?.storage?.account?.userId ?? activeAccountUserId()
  ).trim();
  const assertCurrentAccount = () => {
    if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration) ||
        (expectedUserId && activeAccountUserId() !== expectedUserId)) {
      throw staleAccountSaveResult().error;
    }
  };
  assertCurrentAccount();
  try {
    const result = await request(config);
    assertCurrentAccount();
    return result;
  } catch (error) {
    assertCurrentAccount();
    // Runtime config intentionally omits an account whose access token is
    // locally expired. The durable session identity is still trustworthy for
    // checking that a refresh did not switch users, and lets this path repair
    // the token instead of treating membership recovery as unavailable.
    const authenticationExpired = flattenSyncErrors(error).some(
      (item) =>
        item?.code === "CLOUD_STATE_AUTH_EXPIRED" ||
        Number(item?.status ?? 0) === 401
    );
    if (!authenticationExpired || !expectedUserId) throw error;

    const refreshedSession = await globalThis.SogrimAccountSession?.refresh?.();
    assertCurrentAccount();
    if (!refreshedSession) throw error;

    const loadedConfig = await loadRuntimeConfig();
    assertCurrentAccount();
    const freshConfig = activateClientSpace(loadedConfig);
    const freshUserId = String(freshConfig?.storage?.account?.userId ?? "").trim();
    if (freshUserId !== expectedUserId) throw error;
    assertCurrentAccount();
    const result = await request(freshConfig);
    assertCurrentAccount();
    return result;
  }
}

async function hydrateAccessibleSharedEventState(
  config,
  initialState,
  nonAuthoritativeFallbackState = initialState
) {
  try {
    return {
      state: await withFreshCloudAccount(config, (freshConfig) =>
        recoverAccessibleSharedEvents(freshConfig, initialState, globalThis.fetch, { preferCached: true })
      ),
      authoritative: true
    };
  } catch (error) {
    // An account boundary is cancellation, not a non-authoritative membership
    // result. Returning old events here could relabel them with a new account
    // and enqueue its personal index before the caller's final scope check.
    if (error?.code === "STALE_ACCOUNT") throw error;
    reportPartialStateLoadFailure(error);
    return {
      // A failed membership scan is not evidence that an event was removed.
      // Preserve the account-scoped local cache until the server has either
      // returned an authoritative membership index or confirmed revocation.
      state: mergeSharedStates(initialState, nonAuthoritativeFallbackState),
      authoritative: false
    };
  }
}

function persistRecoveredEventIndex(config, previousState, recoveredState) {
  const recoveredStateWithIdentity = applyLocalParticipantId(
    recoveredState,
    accountParticipantIdForConfig(config) || loadLocalParticipantId()
  );
  if (!hasCloudStateChanged(recoveredStateWithIdentity, previousState)) {
    return recoveredStateWithIdentity;
  }

  scheduleRecoveredEventIndexPersistence(config, recoveredStateWithIdentity);
  return recoveredStateWithIdentity;
}

function accountParticipantIdForConfig(config) {
  const accountUserId = String(config?.storage?.account?.userId ?? "").trim();
  return accountUserId ? `account-${accountUserId}` : "";
}

function scheduleRecoveredEventIndexPersistence(config, recoveredState) {
  const requestScope = synchronizeAccountStorageScope();
  const requestAccountGeneration = accountStorageGeneration;
  const requestSaveGeneration = sharedStateSaveGeneration;
  const requestAccountUserId = String(
    config?.storage?.account?.userId ?? ""
  ).trim();
  // Recovery is account-only. Never enqueue a best-effort personal index for
  // a config that no longer belongs to the session currently owning storage.
  if (!requestAccountUserId || requestAccountUserId !== activeAccountUserId()) {
    return;
  }
  const jobKey = [
    config?.storage?.url,
    config?.storage?.table,
    config?.storage?.spaceId,
    config?.storage?.account?.userId
  ].map((value) => String(value ?? "")).join("\u0000");
  if (!jobKey.replaceAll("\u0000", "")) return;

  const stateSnapshot = clone(recoveredState);
  const cloudState = toCloudState(config, stateSnapshot);
  const fingerprint = JSON.stringify(cloudState);
  let job = recoveredEventIndexPersistJobs.get(jobKey);
  if (!job) {
    job = {
      activeFingerprint: "",
      pending: null,
      promise: null
    };
    recoveredEventIndexPersistJobs.set(jobKey, job);
  }
  if (
    job.activeFingerprint === fingerprint ||
    job.pending?.fingerprint === fingerprint
  ) {
    return;
  }

  job.pending = {
    config: cloneCloudConfig(config),
    state: cloudState,
    fingerprint,
    eventCount: stateSnapshot.events?.length ?? 0,
    requestScope,
    requestAccountGeneration,
    requestSaveGeneration
  };
  if (job.promise) return;

  job.promise = drainRecoveredEventIndexPersistence(job)
    .finally(() => {
      job.promise = null;
      recoveredEventIndexPersistJobs.delete(jobKey);
    });
}

async function drainRecoveredEventIndexPersistence(job) {
  while (job.pending) {
    const request = job.pending;
    job.pending = null;
    job.activeFingerprint = request.fingerprint;
    try {
      if (
        request.requestScope !== synchronizeAccountStorageScope() ||
        request.requestAccountGeneration !== accountStorageGeneration ||
        request.requestSaveGeneration !== sharedStateSaveGeneration
      ) {
        continue;
      }
      // A user edit may have been saved locally after recovery produced this
      // snapshot but before the background index write gets its turn. Merge
      // the freshest account-scoped local state so the bookkeeping write can
      // add recovered memberships without rolling a newer action backward.
      const latestLocalState = toCloudState(request.config, loadState());
      const candidateState = mergeSharedStates(request.state, latestLocalState);
      await saveCloudStateWithRetry(request.config, candidateState);
    } catch (error) {
      reportPartialStateLoadFailure(error);
      globalThis.console?.warn?.(
        "[sync] Recovered event index persistence deferred",
        {
          code: String(error?.code ?? "UNKNOWN"),
          status: Number(error?.status ?? 0) || undefined,
          eventCount: request.eventCount
        }
      );
    } finally {
      job.activeFingerprint = "";
    }
  }
}

function cloneCloudConfig(config) {
  return {
    ...config,
    storage: {
      ...(config?.storage ?? {}),
      ...(config?.storage?.account
        ? { account: { ...config.storage.account } }
        : {})
    }
  };
}

export function waitForRecoveredEventIndexPersistence() {
  const requests = [...recoveredEventIndexPersistJobs.values()]
    .map((job) => job.promise)
    .filter(Boolean);
  return Promise.allSettled(requests);
}

function reportPartialStateLoadFailure(error) {
  (isRetryablePendingSyncFailure(error)
    ? emitOperationDeferred
    : emitOperationFailure)("state_load", { screen: "boot", error });
}

if (typeof window !== "undefined") {
  activateStoredAccountWorkspace();
}

if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("online", () => {
    resetPendingSharedStateRetry();
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
  const bootstrapPublicUrl = canonicalPublicOrigin(
    globalThis[NATIVE_RUNTIME_CONFIG_GLOBAL]?.publicUrl
  );
  const nativePublicUrl = nativeRuntime
    ? bootstrapPublicUrl || runtimePublicOrigin(config)
    : config?.publicUrl;
  return {
    ...config,
    publicUrl: nativePublicUrl,
    apiBaseUrl: nativeRuntime
      ? canonicalPublicOrigin(apiBaseUrl || config?.apiBaseUrl, runtimePublicOrigin(config))
      : ""
  };
}

async function fetchRuntimeConfig(nativeRuntime, requestOptions) {
  const origins = nativeRuntime ? runtimeApiOrigins() : [""];
  let lastError = null;

  for (const apiBaseUrl of origins) {
    try {
      const { response, config } = await fetchWithTimeout(
        globalThis.fetch,
        `${apiBaseUrl}/api/config`,
        requestOptions,
        RUNTIME_CONFIG_TIMEOUT_MS,
        async (configResponse) => ({
          response: configResponse,
          config: configResponse.ok
            ? await configResponse.json()
            : null
        })
      );
      if (response.ok) return { config, apiBaseUrl };
      lastError = new Error(`Runtime config HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
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

function loadSharedStateResult() {
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

export function loadSharedState() {
  return loadSharedStateResult().then((result) => result.state);
}

export async function loadSharedStateForStartup({
  maxWaitMs = STARTUP_SHARED_STATE_WAIT_MS
} = {}) {
  const refresh = loadSharedStateResult();
  const elapsedMs = sharedStateLoadStartedAt
    ? Date.now() - sharedStateLoadStartedAt
    : 0;
  const remainingMs = Math.max(0, Number(maxWaitMs) - elapsedMs);

  if (remainingMs === 0) {
    return {
      state: loadState(),
      refresh,
      source: "local",
      authoritative: false
    };
  }

  let timeoutId = 0;
  const initial = await Promise.race([
    refresh.then((result) => ({
      ...result,
      source: result.authoritative ? "synced" : "fallback"
    })),
    new Promise((resolve) => {
      timeoutId = globalThis.setTimeout(
        () => resolve({
          state: loadState(),
          source: "local",
          authoritative: false
        }),
        remainingMs
      );
    })
  ]);
  globalThis.clearTimeout(timeoutId);

  return {
    state: initial.state,
    refresh: initial.source === "local" ? refresh : null,
    source: initial.source,
    authoritative: Boolean(initial.authoritative)
  };
}

function sharedStateLoadResult(state, authoritative) {
  return { state, authoritative: Boolean(authoritative) };
}

async function loadSharedStateOnce(requestScope) {
  const requestAccountGeneration = accountStorageGeneration;
  const requestSaveGeneration = sharedStateSaveGeneration;
  let runtimeConfig = activateClientSpace(await loadRuntimeConfig());
  const localState = loadState();

  if (runtimeConfig.storage?.mode === "supabase") {
    const pendingPayload = pendingSharedStateRaw(runtimeConfig);
    const pendingState = loadPendingSharedState(runtimeConfig);
    if (pendingState) {
      if (shouldDeferPendingSharedStateRetry()) {
        // A queued local write must not freeze every remote read for the full
        // retry backoff (which can reach two minutes). Keep the outbox intact,
        // but merge fresh cloud data into the visible state so changes from a
        // second phone still appear while delivery is being retried.
        try {
          const remoteState = await loadCloudState(
            runtimeConfig,
            toCloudState(runtimeConfig, localState)
          );
          runtimeConfig = activateClientSpace(
            attachStoredAccountIdentity(runtimeConfig)
          );
          const mergedPendingState = mergeSharedStates(remoteState, pendingState);
          const recoveredPendingState = await hydrateAccessibleSharedEventState(
            runtimeConfig,
            mergedPendingState
          );
          if (!loadAccountRequestIsCurrent(
            requestScope,
            requestAccountGeneration
          )) {
            return sharedStateLoadResult(loadState(), false);
          }
          const visiblePendingState = applyLocalParticipantId(
            cleanLegacyStarterData(
              recoveredPendingState.state,
              loadProtectedParticipantId()
            ),
            loadLocalParticipantId()
          );
          if (requestSaveGeneration !== sharedStateSaveGeneration) {
            const mergedVisibleState = mergeLoadedStateWithCurrentLocal(
              visiblePendingState,
              requestScope
            );
            return sharedStateLoadResult(
              mergedVisibleState,
              recoveredPendingState.authoritative
            );
          }
          saveStateForScope(visiblePendingState, requestScope);
          return sharedStateLoadResult(
            visiblePendingState,
            recoveredPendingState.authoritative
          );
        } catch (error) {
          if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)) {
            return sharedStateLoadResult(loadState(), false);
          }
          reportPartialStateLoadFailure(error);
        }

        return sharedStateLoadResult(
          applyLocalParticipantId(
            cleanLegacyStarterData(pendingState, loadProtectedParticipantId()),
            loadLocalParticipantId()
          ),
          false
        );
      }
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
          mergedState,
          // The durable outbox is a full snapshot, not the original save diff.
          // Preserve its existing full reconciliation scope, but publish shared
          // changes before a failing personal projection can block delivery.
          buildSharedEventSyncSelection(null, mergedState)
        )).state;
        if (!loadAccountRequestIsCurrent(
          requestScope,
          requestAccountGeneration
        )) {
          return sharedStateLoadResult(loadState(), false);
        }
        if (
          requestSaveGeneration !== sharedStateSaveGeneration ||
          pendingPayload !== pendingSharedStateRaw(runtimeConfig)
        ) {
          publishSyncStatus("reconnecting");
          schedulePendingSharedStateRetry();
          const latestLocalState = loadState();
          const recoveredStateResult = await hydrateAccessibleSharedEventState(
            runtimeConfig,
            mergeSharedStates(syncedState, latestLocalState),
            latestLocalState
          );
          if (!loadAccountRequestIsCurrent(
            requestScope,
            requestAccountGeneration
          )) {
            return sharedStateLoadResult(loadState(), false);
          }
          const recoveredState = await persistRecoveredEventIndex(
            runtimeConfig,
            latestLocalState,
            recoveredStateResult.state
          );
          const mergedVisibleState = mergeLoadedStateWithCurrentLocal(
            recoveredState,
            requestScope
          );
          return sharedStateLoadResult(
            mergedVisibleState,
            recoveredStateResult.authoritative
          );
        }
        clearPendingSharedState(runtimeConfig);
        resetPendingSharedStateRetry();
        publishSyncStatus("saved");
        const recoveredStateResult = await hydrateAccessibleSharedEventState(
          runtimeConfig,
          syncedState
        );
        if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)) {
          return sharedStateLoadResult(loadState(), false);
        }
        const visibleState = await persistRecoveredEventIndex(
          runtimeConfig,
          syncedState,
          recoveredStateResult.state
        );
        const syncedStateWithIdentity = applyLocalParticipantId(
          cleanLegacyStarterData(visibleState, loadProtectedParticipantId()),
          loadLocalParticipantId()
        );
        saveStateForScope(syncedStateWithIdentity, requestScope);
        return sharedStateLoadResult(
          syncedStateWithIdentity,
          recoveredStateResult.authoritative
        );
      } catch (error) {
        if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)) {
          return sharedStateLoadResult(loadState(), false);
        }
        // Keep the pending local snapshot available for a later retry.
        const adoptedPartialState = adoptPartialSharedSyncState(error, {
          runtimeConfig, pendingPayload, requestScope,
          requestAccountGeneration, requestSaveGeneration
        });
        if (isRetryablePendingSyncFailure(error)) {
          publishSyncStatus("reconnecting", { failureKind: saveFailureKind(error) });
          schedulePendingSharedStateRetry();
          logQueuedSync(error, {
            sharedEventMutation: true,
            pending: true,
            partial: false,
            reverted: false
          });
          emitOperationDeferred("state_load", { screen: "boot", error });
        } else {
          publishSyncFailure(error, { pending: true });
          logSyncFailure(error, {
            sharedEventMutation: true,
            pending: true,
            partial: false,
            reverted: false
          });
          emitOperationFailure("state_load", { screen: "boot", error });
        }
        if (adoptedPartialState) return sharedStateLoadResult(loadState(), false);
      }

      return sharedStateLoadResult(
        applyLocalParticipantId(
          cleanLegacyStarterData(pendingState, loadProtectedParticipantId()),
          loadLocalParticipantId()
        ),
        false
      );
    }

    try {
      let state = cleanLegacyStarterData(
        await loadCloudState(
          runtimeConfig,
          toCloudState(runtimeConfig, localState),
          { preferCached: true }
        ),
        loadProtectedParticipantId()
      );
      runtimeConfig = activateClientSpace(
        attachStoredAccountIdentity(runtimeConfig)
      );
      const accountState = state;
      const recoveredStateResult = await hydrateAccessibleSharedEventState(
        runtimeConfig,
        state,
        localState
      );
      if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)) {
        return sharedStateLoadResult(loadState(), false);
      }
      state = recoveredStateResult.state;
      runtimeConfig = activateClientSpace(
        attachStoredAccountIdentity(runtimeConfig)
      );
      state = await persistRecoveredEventIndex(runtimeConfig, accountState, state);
      const localStateWithIdentity = applyLocalParticipantId(
        state,
        loadLocalParticipantId()
      );
      if (!loadAccountRequestIsCurrent(
        requestScope,
        requestAccountGeneration
      )) {
        return sharedStateLoadResult(loadState(), false);
      }
      if (requestSaveGeneration !== sharedStateSaveGeneration) {
        const mergedVisibleState = mergeLoadedStateWithCurrentLocal(
          localStateWithIdentity,
          requestScope
        );
        return sharedStateLoadResult(
          mergedVisibleState,
          recoveredStateResult.authoritative
        );
      }
      saveStateForScope(localStateWithIdentity, requestScope);
      return sharedStateLoadResult(
        localStateWithIdentity,
        recoveredStateResult.authoritative
      );
    } catch (error) {
      if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)) {
        return sharedStateLoadResult(loadState(), false);
      }
      (isRetryablePendingSyncFailure(error)
        ? emitOperationDeferred
        : emitOperationFailure)("state_load", { screen: "boot", error });
      return sharedStateLoadResult(localState, false);
    }
  }

  return sharedStateLoadResult(localState, true);
}

export async function saveSharedState(state) {
  const options = arguments[1] ?? {};
  let canReturnQueued = null;
  let returnedToBackground = false;
  // The worker persists the outbox and local snapshot synchronously, before
  // its first await. Start the UI budget there, not after config/auth I/O.
  const completion = saveSharedStateToCompletion(state, options, (isCurrent) => {
    canReturnQueued = isCurrent;
  }, () => options.handlesSaveFailure !== true || returnedToBackground);
  const result = await (options.awaitCloud || !canReturnQueued
    ? completion
    : settleSaveWithinUiBudget(completion, canReturnQueued, options.foregroundSaveBudgetMs));
  returnedToBackground = Boolean(result?.completion);
  return result;
}

async function saveSharedStateToCompletion(state, options, onDurableStart, mayNotifyFailure) {
  const {
    forceSharedParticipantIds = [],
    forceSharedEventIds = [],
    suppressRevertNotice = false,
    foregroundMutation = false,
    awaitCloud = false,
    foregroundSaveBudgetMs = FOREGROUND_SAVE_BUDGET_MS
  } = options;
  const requestStartedAt = Date.now();
  let requestScope = synchronizeAccountStorageScope();
  const requestAccountUserId = activeAccountUserId();
  const requestIdentityGeneration = accountIdentityGeneration;
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
  const priorPendingConfig = pendingSyncConfig(LOCAL_RUNTIME_CONFIG);
  const syncSelection = mergeSharedSyncSelections(
    buildSharedEventSyncSelection(previousState, cleanState, {
      forceParticipantIds: forceSharedParticipantIds,
      forceEventIds: forceSharedEventIds
    }),
    priorPendingConfig ? pendingSharedStateSelection(priorPendingConfig) : null
  );
  const hasSharedEventMutation = Boolean(
    syncSelection.eventIds.length || syncSelection.deletedEventIds.length
  );
  // Persist an account-scoped outbox before the first await. Mobile WebViews
  // can be suspended immediately after a destructive action. The outbox must
  // be durable before the visible local snapshot: otherwise a quota failure
  // between those two writes can make a change look saved and then disappear
  // when an older cloud snapshot is loaded after restart.
  const crashSafePendingConfig = requestAccountUserId
    ? priorPendingConfig
    : null;
  let crashSafePendingStateSaved = Boolean(
    crashSafePendingConfig &&
    savePendingSharedState(
      crashSafePendingConfig,
      toSharedState(cleanState, { preserveCurrentParticipantId: true }),
      syncSelection
    )
  );
  if (crashSafePendingConfig && !crashSafePendingStateSaved) {
    const error = Object.assign(new Error("The local sync outbox is unavailable"), { code: "LOCAL_STORAGE_UNAVAILABLE" });
    emitOperationFailure("state_save", { screen: "app", error });
    return { ok: false, mode: "local", error };
  }
  let localSaved = saveState(cleanState);
  const requestSaveGeneration = ++sharedStateSaveGeneration;
  let requestAccountGeneration = accountStorageGeneration;
  const stateSnapshot = clone(cleanState);
  const budgetStartedBeforeConfig = Boolean(localSaved && crashSafePendingStateSaved);
  if (budgetStartedBeforeConfig) {
    onDurableStart(() => Boolean(localSaved && crashSafePendingStateSaved &&
      loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)));
  }
  const runtimeConfig = activateClientSpace(await loadRuntimeConfig());
  const sharedState = toCloudState(runtimeConfig, stateSnapshot);
  const currentScope = synchronizeAccountStorageScope();
  if (
    requestScope !== currentScope ||
    requestAccountGeneration !== accountStorageGeneration
  ) {
    const currentAccountUserId = activeAccountUserId();
    const runtimeAccountUserId = String(
      runtimeConfig?.storage?.account?.userId ?? ""
    ).trim();
    const sameAuthenticatedAccount = Boolean(
      requestAccountUserId &&
        requestIdentityGeneration === accountIdentityGeneration &&
        currentAccountUserId === requestAccountUserId &&
        (!runtimeAccountUserId || runtimeAccountUserId === requestAccountUserId) &&
        stateSnapshot.currentParticipantId === requestAccountParticipantId
    );
    if (!sameAuthenticatedAccount) {
      return {
        ok: false,
        mode: "stale-account",
        error: new Error("Account changed before state save")
      };
    }

    // Account bootstrap/session refresh may activate the already-authenticated
    // user's durable workspace while this save is awaiting runtime config. That
    // is a routing refresh, not an account switch. Rebase the durable local copy
    // and outbox onto the now-active scope, while preserving the original diff
    // selection so deletions and membership changes still reach shared storage.
    requestScope = currentScope;
    requestAccountGeneration = accountStorageGeneration;
    if (requestSaveGeneration === sharedStateSaveGeneration) {
      const rebasedPendingConfig = pendingSyncConfig(runtimeConfig);
      crashSafePendingStateSaved = Boolean(
        rebasedPendingConfig &&
          savePendingSharedState(rebasedPendingConfig, sharedState, syncSelection)
      );
      // Preserve the same outbox-before-view invariant used at save entry.
      // If destination storage is full, retain the original outbox without
      // advancing a new local snapshot that cannot yet be delivered.
      localSaved = crashSafePendingStateSaved && saveState(stateSnapshot);
    }
  }

  if (runtimeConfig.storage?.mode === "supabase") {
    // Config/auth can yield across several accepted edits. Older requests may
    // still deliver in queue order, but must never replace the newest durable
    // intent, even briefly: the process can stop after any storage write.
    let pendingStateSaved = (requestSaveGeneration === sharedStateSaveGeneration
      ? savePendingSharedState(runtimeConfig, sharedState, syncSelection)
      : Boolean(pendingSharedStateRaw(runtimeConfig))) || crashSafePendingStateSaved;
    publishSyncStatus("saving");

    const pendingPayload = JSON.stringify(sharedState);
    cloudWriteQueue = cloudWriteQueue
      .catch(() => {})
      .then(async () => {
        if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)) {
          return staleAccountSaveResult();
        }

        try {
          const saved = await withFreshCloudAccount(
            runtimeConfig,
            (freshRuntimeConfig) => syncAndPersistCloudState(
              freshRuntimeConfig,
              sharedState,
              syncSelection
            )
          );
          // Re-read durable identity after I/O, before *any* local mutation,
          // outbox acknowledgement, retry timer or global sync notification.
          // A session change need not have called loadState to advance the epoch.
          if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)) {
            return staleAccountSaveResult();
          }
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
          if (pendingSharedStateRaw(runtimeConfig)) {
            publishSyncStatus("reconnecting");
            schedulePendingSharedStateRetry();
          } else {
            resetPendingSharedStateRetry();
            publishSyncStatus("saved");
          }
          return {
            ok: true,
            mode: "cloud",
            // The caller may no longer hold the object we updated above (a
            // foreground read can replace it). Report this request's resolved
            // state so item editors can verify what actually survived merging.
            persistedState: syncedState,
            ...(saved.conflictCount ? { merged: true } : {})
          };
        } catch (error) {
          if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)) {
            return staleAccountSaveResult();
          }
          let reverted = false;
          const retryablePendingFailure = isRetryablePendingSyncFailure(error);
          const partiallyPersistedState = error?.sharedEventPersisted
            ? error.persistedState ?? sharedState
            : partialSharedSyncState(error);
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
            } else if (retryablePendingFailure) {
              // Keep locally saved changes queued during temporary outages.
              // A background retry will persist them when the service recovers.
              pendingStateSaved = savePendingSharedState(runtimeConfig, sharedState);
            } else {
              const latestState = loadState();
              let revertedState = previousState;
              try {
                revertedState = rollbackNoteOnlyStateChange(latestState, previousState, stateSnapshot) ??
                  rollbackSettingsOnlyStateChange(latestState, previousState, stateSnapshot) ?? previousState;
              } catch (rollbackError) {
                // Recovery must still finish and report the original failure
                // even if an incomplete legacy snapshot defeats a narrow undo.
                emitOperationDeferred("state_save", { error: rollbackError });
              }
              saveState(revertedState);
              if (!suppressRevertNotice) {
                publishSharedSaveReverted(syncSelection, error, {
                  foregroundMutation: foregroundMutation && mayNotifyFailure(),
                  requestedAt: requestStartedAt
                });
              }
              reverted = true;
            }
          }
          if (
            !retryablePendingFailure &&
            !partiallyPersistedState &&
            pendingPayload === pendingSharedStateRaw(runtimeConfig)
          ) {
            clearPendingSharedState(runtimeConfig);
            pendingStateSaved = false;
          }
          const acceptedPending = Boolean(
            pendingStateSaved && (retryablePendingFailure || partiallyPersistedState)
          );
          // A partial commit cannot be rolled back as a rejected save. Give
          // all accepted durable work a recovery attempt, even if the failed
          // sibling/receipt is permanent. The retry worker still stops on a
          // repeated permanent rejection instead of spinning indefinitely.
          if (acceptedPending) {
            schedulePendingSharedStateRetry();
          }
          const syncOutcome = {
            sharedEventMutation: hasSharedEventMutation,
            pending: Boolean(pendingStateSaved),
            partial: Boolean(partiallyPersistedState),
            reverted
          };
          if (acceptedPending) {
            // A durable local snapshot is a successful user save. Cloud delivery
            // continues in the background and must not trigger false failure UI.
            publishSyncStatus("reconnecting", { failureKind: saveFailureKind(error) });
            logQueuedSync(error, syncOutcome);
            emitOperationDeferred("state_save", { error });
          } else {
            publishSyncFailure(error);
            logSyncFailure(error, syncOutcome);
            emitOperationFailure("state_save", { error });
          }
          return {
            ok: acceptedPending,
            mode: acceptedPending ? "queued" : "cloud",
            error,
            ...(partiallyPersistedState
              ? {
                  partial: true, pending: true,
                  ...(error?.sharedEventPersisted ? { persistedState: partiallyPersistedState } : {})
                }
              : {}),
            ...(error?.partialSharedState
              ? { failedEventIds: error.partialSharedState.failedEventIds }
              : {}),
            ...(retryablePendingFailure && !partiallyPersistedState && pendingStateSaved
              ? { pending: true }
              : {}),
            ...(reverted ? { reverted: true } : {})
          };
        }
      });

    return awaitCloud || budgetStartedBeforeConfig
      ? cloudWriteQueue
      : settleSaveWithinUiBudget(
          cloudWriteQueue,
          Boolean(localSaved && pendingStateSaved),
          foregroundSaveBudgetMs
        );
  }

  if (runtimeConfigUsedFallback) {
    const pendingConfig = pendingSyncConfig(runtimeConfig);
    if (pendingConfig || crashSafePendingStateSaved) {
      const pendingStateSaved =
        (pendingConfig && (requestSaveGeneration === sharedStateSaveGeneration
          ? savePendingSharedState(pendingConfig, sharedState)
          : Boolean(pendingSharedStateRaw(pendingConfig)))) ||
        crashSafePendingStateSaved;
      if (localSaved && pendingStateSaved) {
        publishSyncStatus("reconnecting");
        schedulePendingSharedStateRetry();
        emitOperationDeferred("state_save", {
          failureClass: globalThis.navigator?.onLine === false
            ? "offline"
            : "unavailable"
        });
        return { ok: true, mode: "local", pending: true };
      }
      publishSyncStatus(
        globalThis.navigator?.onLine === false ? "offline" : "unavailable"
      );
      emitOperationFailure("state_save", { failureClass: "storage" });
      return {
        ok: false,
        mode: "local",
        error: Object.assign(new Error("Local storage is unavailable"), { code: "LOCAL_STORAGE_UNAVAILABLE" })
      };
    }
  }

  if (!localSaved) {
    emitOperationFailure("state_save", { failureClass: "storage" });
  }
  return localSaved
    ? { ok: true, mode: "local" }
    : {
        ok: false,
        mode: "local",
        error: Object.assign(new Error("Local storage is unavailable"), { code: "LOCAL_STORAGE_UNAVAILABLE" })
      };
}

export async function flushPendingSharedState() {
  const requestScope = synchronizeAccountStorageScope();
  const requestAccountGeneration = accountStorageGeneration;
  if (!pendingSyncFlushPromise) {
    cloudWriteQueue = cloudWriteQueue
      .catch(() => {})
      .then(() => loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)
        ? flushPendingSharedStateOnce()
        : staleAccountSaveResult());
    const request = cloudWriteQueue.finally(() => {
      // An obsolete flush may finish while another account already owns the
      // single-flight slot. Its finally must not erase the replacement job.
      if (pendingSyncFlushPromise === request) pendingSyncFlushPromise = null;
    });
    pendingSyncFlushPromise = request;
  }

  return pendingSyncFlushPromise;
}


async function flushPendingSharedStateOnce() {
  const requestScope = synchronizeAccountStorageScope();
  const requestAccountGeneration = accountStorageGeneration;
  const requestSaveGeneration = sharedStateSaveGeneration;
  let runtimeConfig = activateClientSpace(await loadRuntimeConfig());
  if (runtimeConfigUsedFallback) {
    runtimeConfigPromise = null;
    runtimeConfigUsedFallback = false;
    runtimeConfig = activateClientSpace(await loadRuntimeConfig());
  }
  if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)) {
    return staleAccountSaveResult();
  }
  if (runtimeConfig.storage?.mode !== "supabase") {
    const pendingConfig = pendingSyncConfig(runtimeConfig);
    const pendingState = pendingConfig
      ? loadPendingSharedState(pendingConfig)
      : null;
    if (!pendingState) {
      resetPendingSharedStateRetry();
      return { ok: true, empty: true };
    }
    const error = new Error("Runtime config unavailable");
    error.code = "ERR_NETWORK";
    publishSyncStatus("reconnecting");
    schedulePendingSharedStateRetry();
    return { ok: false, error };
  }

  const pendingPayload = pendingSharedStateRaw(runtimeConfig);
  const pendingState = loadPendingSharedState(runtimeConfig);
  if (!pendingState) return { ok: true, empty: true };

  publishSyncStatus("saving");
  try {
    const remoteState = await loadCloudState(runtimeConfig, pendingState);
    if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)) {
      return { ok: false, mode: "stale-account" };
    }
    // The read may have refreshed authentication. Do not make canonical
    // delivery fail with the pre-refresh token and wait for another timer.
    runtimeConfig = activateClientSpace(attachStoredAccountIdentity(runtimeConfig));
    const mergedState = mergeSharedStates(remoteState, pendingState);
    const saved = await syncAndPersistCloudState(
      runtimeConfig,
      mergedState,
      buildSharedEventSyncSelection(null, mergedState)
    );
    if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)) {
      return staleAccountSaveResult();
    }
    if (
      !loadRequestIsCurrent(
        requestScope,
        requestAccountGeneration,
        requestSaveGeneration
      ) ||
      pendingPayload !== pendingSharedStateRaw(runtimeConfig)
    ) {
      publishSyncStatus("reconnecting");
      schedulePendingSharedStateRetry();
      return { ok: true, pending: true, superseded: true };
    }
    const syncedStateWithIdentity = applyLocalParticipantId(
      cleanLegacyStarterData(saved.state, loadProtectedParticipantId()),
      loadLocalParticipantId()
    );
    saveStateForScope(syncedStateWithIdentity, requestScope);
    clearPendingSharedState(runtimeConfig);
    resetPendingSharedStateRetry();
    publishSyncStatus("saved");
    return { ok: true };
  } catch (error) {
    if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration)) {
      return staleAccountSaveResult();
    }
    adoptPartialSharedSyncState(error, {
      runtimeConfig, pendingPayload, requestScope,
      requestAccountGeneration, requestSaveGeneration
    });
    const retryablePendingFailure = isRetryablePendingSyncFailure(error);
    if (retryablePendingFailure) {
      publishSyncStatus("reconnecting", { failureKind: saveFailureKind(error) });
      schedulePendingSharedStateRetry();
      logQueuedSync(error, {
        sharedEventMutation: true,
        pending: true,
        partial: false,
        reverted: false
      });
    } else {
      publishSyncFailure(error, { pending: true });
      logSyncFailure(error, {
        sharedEventMutation: true,
        pending: true,
        partial: false,
        reverted: false
      });
    }
    (retryablePendingFailure ? emitOperationDeferred : emitOperationFailure)(
      "state_save",
      { error }
    );
    return { ok: false, error };
  }
}

export function sharedStateSaveRevision() {
  return sharedStateSaveGeneration;
}

function partialSharedSyncState(error) {
  const partial = error?.partialSharedState;
  return partial?.succeededEventIds?.length ? partial.state : null;
}

function adoptPartialSharedSyncState(error, {
  runtimeConfig, pendingPayload, requestScope,
  requestAccountGeneration, requestSaveGeneration
}) {
  const partial = partialSharedSyncState(error);
  if (!partial || !loadRequestIsCurrent(requestScope, requestAccountGeneration, requestSaveGeneration) ||
      pendingPayload !== pendingSharedStateRaw(runtimeConfig)) return false;
  const visible = applyLocalParticipantId(
    cleanLegacyStarterData(partial, loadProtectedParticipantId()), loadLocalParticipantId()
  );
  // Keep failed siblings durable, while retaining successful canonical merges.
  if (!savePendingSharedState(runtimeConfig, partial)) return false;
  return saveStateForScope(visible, requestScope);
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
    const { response, payload } = await fetchWithTimeout(
      globalThis.fetch,
      "/api/reset",
      { method: "POST" },
      RUNTIME_CONFIG_TIMEOUT_MS,
      async (resetResponse) => ({
        response: resetResponse,
        payload: resetResponse.ok
          ? await resetResponse.json()
          : null
      })
    );
    if (!response.ok) throw new Error("Reset failed");
    const state = cleanLegacyStarterData(
      payload,
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

  let profile = parseLocalProfile(raw);
  if (accountUserId && !profileBelongsToAccount(profile, accountUserId)) {
    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(participantStorageKey(accountUserId));
    return null;
  }

  // An authenticated account always owns one deterministic participant id.
  // Older builds could keep a pre-login/offline participant id in an otherwise
  // valid account-scoped profile. Every UI layer reading that profile would then
  // disagree with the account workspace about who the current user is.
  if (accountUserId && profile) {
    const accountParticipantId = `account-${accountUserId}`;
    if (profile.participantId !== accountParticipantId) {
      profile = {
        ...profile,
        participantId: accountParticipantId
      };
      window.localStorage.setItem(storageKey, JSON.stringify(profile));
      window.localStorage.setItem(
        participantStorageKey(accountUserId),
        accountParticipantId
      );
    }
  }

  return profile;
}

export function saveLocalProfile(profile) {
  synchronizeAccountStorageScope();
  const displayName = normalizeProfileName(profile.displayName);
  if (!isFullProfileName(displayName) || !profile.participantId) return null;
  const accountUserId = activeAccountUserId();
  const suppliedAuthSubject = normalizeAccountUserId(profile.authSubject);
  const suppliedParticipantId = String(profile.participantId).trim();
  if (
    accountUserId &&
    (
      (suppliedAuthSubject && suppliedAuthSubject !== accountUserId) ||
      (
        suppliedParticipantId.startsWith("account-") &&
        suppliedParticipantId !== `account-${accountUserId}`
      )
    )
  ) {
    return null;
  }
  const participantId = accountUserId
    ? `account-${accountUserId}`
    : suppliedParticipantId;
  const previousProfile = loadLocalProfile();

  const nextProfile = {
    participantId,
    displayName,
    ...profileAvatarFields({
      avatarPreset:
        profile.avatarPreset ??
        (
          previousProfile?.participantId === participantId
            ? previousProfile.avatarPreset
            : ""
        ),
      avatarImage:
        profile.avatarImage ??
        (
          previousProfile?.participantId === participantId
            ? previousProfile.avatarImage
            : ""
        ),
      avatarImageUpdatedAt:
        profile.avatarImageUpdatedAt ??
        (
          previousProfile?.participantId === participantId
            ? previousProfile.avatarImageUpdatedAt
            : ""
        ),
      profileUpdatedAt:
        profile.profileUpdatedAt ??
        (
          previousProfile?.participantId === participantId
            ? previousProfile.profileUpdatedAt
            : ""
        )
    }),
    ...profileUpdatedAtField(
      profile.profileUpdatedAt ??
        (
          previousProfile?.participantId === participantId
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
  accountIdentityGeneration += 1;
  resetAccountSyncWork();
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
  const repairedEvents = restoreLegacyStandaloneEventOwnerMembership(
    events,
    currentParticipantId
  );

  return {
    ...state,
    currentParticipantId,
    participants,
    groups,
    events: repairedEvents
  };
}

function restoreLegacyStandaloneEventOwnerMembership(events, currentParticipantId) {
  if (!currentParticipantId) return events;
  return events.map((event) => {
    if (
      !event ||
      event.sharedSpaceId ||
      (event.participantIds ?? []).includes(currentParticipantId)
    ) {
      return event;
    }
    const currentParticipantHasHistory =
      event.createdByParticipantId === currentParticipantId ||
      (event.adminIds ?? []).includes(currentParticipantId) ||
      (event.expenses ?? []).some(
        (expense) => expense?.createdByParticipantId === currentParticipantId
      );
    if (!currentParticipantHasHistory) return event;
    return {
      ...event,
      participantIds: [currentParticipantId, ...(event.participantIds ?? [])]
    };
  });
}

function loadLocalParticipantId() {
  const accountUserId = activeAccountUserId();
  // Never let an obsolete device identity override the authenticated account.
  // This is intentionally checked before both the stored participant marker and
  // the local profile, because those values may have been written by old builds.
  if (accountUserId) return `account-${accountUserId}`;
  const storedParticipantId = window.localStorage.getItem(
    participantStorageKey(accountUserId)
  );
  if (storedParticipantId) return storedParticipantId;

  const profileParticipantId = loadLocalProfile()?.participantId;
  if (profileParticipantId) return profileParticipantId;
  return "";
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
  const accountParticipantId = preserveCurrentParticipantId
    ? accountParticipantIdForConfig(config)
    : "";
  const accountParticipantExists = Boolean(
    accountParticipantId &&
      state?.participants?.some(({ id }) => id === accountParticipantId)
  );
  const stateWithAccountIdentity = accountParticipantExists
    ? { ...state, currentParticipantId: accountParticipantId }
    : state;
  return toSharedState(stateWithAccountIdentity, { preserveCurrentParticipantId });
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

function mergeSharedSyncSelections(...selections) {
  return Object.fromEntries(["eventIds", "deletedEventIds"].map(key => [key,
    [...new Set(selections.flatMap(selection => selection?.[key] ?? []))]
  ]));
}

function pendingSharedStateSelection(config) {
  const payload = pendingSharedStateRaw(config);
  if (!payload) return null;
  const key = pendingSyncStorageKey(config);
  if (pendingSharedSyncCoverage?.key === key && pendingSharedSyncCoverage.payload === payload) {
    return pendingSharedSyncCoverage.selection;
  }
  // A restart/another tab can leave a durable outbox whose original diff is
  // unknown. It requires the same full reconciliation as an explicit flush.
  // Never infer that a locally visible note was already delivered remotely.
  const pending = loadPendingSharedState(config);
  return pending ? buildSharedEventSyncSelection(null, pending) : null;
}

function savePendingSharedState(config, sharedState, syncSelection = null) {
  try {
    const inherited = pendingSharedStateSelection(config);
    const selection = mergeSharedSyncSelections(
      inherited,
      syncSelection ?? (inherited ? null : buildSharedEventSyncSelection(null, sharedState))
    );
    const key = pendingSyncStorageKey(config);
    const payload = JSON.stringify(sharedState);
    window.localStorage.setItem(key, payload);
    // Preserve the union while a later snapshot supersedes an earlier one.
    // Its eventual success may acknowledge only a write that covers them all.
    pendingSharedSyncCoverage = { key, payload, selection };
    return true;
  } catch {
    return false;
  }
}

function clearPendingSharedState(config) {
  try {
    const key = pendingSyncStorageKey(config);
    window.localStorage.removeItem(key);
    if (pendingSharedSyncCoverage?.key === key) pendingSharedSyncCoverage = null;
  } catch {}
}

function publishSyncFailure(error, { pending = false } = {}) {
  publishSyncStatus(syncFailureStatus(error), { pending, failureKind: saveFailureKind(error) });
}

export function syncFailureStatus(
  error,
  online = globalThis.navigator?.onLine !== false
) {
  const errors = flattenSyncErrors(error);
  if (errors.some((item) => item?.code === "CLOUD_STATE_CONFLICT")) {
    return "conflict";
  }
  if (!online && saveFailureKind(error) === "connection") return "offline";
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
  if (error.name === "AbortError") return true;
  return saveFailureKind(error) === "connection";
}

export function isTransientSyncFailure(error) {
  return flattenSyncErrors(error).some((item) => {
    if (item?.code === "CLOUD_STATE_CONFLICT") return true;
    if (isNetworkFailure(item)) return true;
    const status = Number(item?.status ?? 0);
    return status === 408 || status === 425 || status === 429 || status >= 500;
  });
}

export function isRetryablePendingSyncFailure(error) {
  return isTransientSyncFailure(error) || flattenSyncErrors(error).some((item) =>
    item?.code === "CLOUD_STATE_AUTH_EXPIRED" || Number(item?.status ?? 0) === 401
  );
}

function schedulePendingSharedStateRetry() {
  const requestScope = synchronizeAccountStorageScope();
  const requestAccountGeneration = accountStorageGeneration;
  if (
    pendingSyncRetryTimer ||
    globalThis.navigator?.onLine === false ||
    typeof globalThis.window?.setTimeout !== "function"
  ) {
    return;
  }
  const delay = PENDING_SYNC_RETRY_DELAYS_MS[
    Math.min(pendingSyncRetryAttempt, PENDING_SYNC_RETRY_DELAYS_MS.length - 1)
  ];
  pendingSyncRetryAttempt += 1;
  pendingSyncRetryNotBefore = Date.now() + delay;
  const retryGeneration = ++pendingSyncRetryGeneration;
  pendingSyncRetryTimer = globalThis.window.setTimeout(async () => {
    if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration) ||
        retryGeneration !== pendingSyncRetryGeneration) return;
    pendingSyncRetryTimer = 0;
    const result = await flushPendingSharedState().catch((error) => ({ ok: false, error }));
    // Online recovery or a newer edit may replace this retry while it awaits
    // the flush. Only the callback that still owns the schedule may change it.
    if (!loadAccountRequestIsCurrent(requestScope, requestAccountGeneration) ||
        retryGeneration !== pendingSyncRetryGeneration) return;
    if (result?.ok && !result?.pending) {
      resetPendingSharedStateRetry();
    } else if (result?.pending || isRetryablePendingSyncFailure(result?.error)) {
      schedulePendingSharedStateRetry();
    }
  }, delay);
}

function resetPendingSharedStateRetry() {
  // clearTimeout cannot retract a callback already queued by the browser.
  pendingSyncRetryGeneration += 1;
  if (
    pendingSyncRetryTimer &&
    typeof globalThis.window?.clearTimeout === "function"
  ) {
    globalThis.window.clearTimeout(pendingSyncRetryTimer);
  }
  pendingSyncRetryTimer = 0;
  pendingSyncRetryAttempt = 0;
  pendingSyncRetryNotBefore = 0;
}

function shouldDeferPendingSharedStateRetry() {
  return Boolean(
    pendingSyncRetryTimer ||
    (pendingSyncRetryNotBefore && Date.now() < pendingSyncRetryNotBefore)
  );
}

async function settleSaveWithinUiBudget(
  saveRequest,
  durablePendingSaved,
  foregroundSaveBudgetMs = FOREGROUND_SAVE_BUDGET_MS
) {
  const canReturnQueued = typeof durablePendingSaved === "function"
    ? durablePendingSaved : () => Boolean(durablePendingSaved);
  if (!canReturnQueued() || typeof globalThis.setTimeout !== "function") {
    return saveRequest;
  }

  let timeoutId = 0;
  const queuedResult = new Promise((resolve) => {
    timeoutId = globalThis.setTimeout(() => {
      if (!canReturnQueued()) {
        resolve(saveRequest);
        return;
      }
      publishSyncStatus("reconnecting");
      resolve({
        ok: true,
        mode: "queued",
        pending: true,
        completion: saveRequest
      });
    }, Math.max(0, Number(foregroundSaveBudgetMs) || 0));
  });
  try {
    return await Promise.race([saveRequest, queuedResult]);
  } finally {
    globalThis.clearTimeout?.(timeoutId);
  }
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

function logQueuedSync(error, outcome) {
  const errors = flattenSyncErrors(error);
  const codes = [...new Set(errors.map((item) => String(item?.code ?? "").trim()).filter(Boolean))];
  const statuses = [...new Set(errors.map((item) => Number(item?.status ?? 0)).filter((status) => status > 0))];
  console.info("[sync] State save queued for retry", {
    codes,
    statuses,
    online: globalThis.navigator?.onLine !== false,
    ...outcome
  });
}

function publishSyncStatus(status, details = {}) {
  if (typeof window === "undefined" || !window.dispatchEvent) return;

  const EventConstructor = globalThis.CustomEvent;
  if (typeof EventConstructor !== "function") return;
  window.dispatchEvent(new EventConstructor(SYNC_STATUS_EVENT, { detail: {
    status,
    ...(status === "reconnecting" ? { pending: true } : {}),
    ...(["saved", ""].includes(status) ? { pending: false } : {}),
    ...details
  } }));
}

function publishSharedSaveReverted(
  syncSelection,
  error,
  { foregroundMutation = false, requestedAt = 0 } = {}
) {
  if (typeof window === "undefined" || !window.dispatchEvent) return;

  const EventConstructor = globalThis.CustomEvent;
  if (typeof EventConstructor !== "function") return;
  window.dispatchEvent(new EventConstructor(SHARED_SAVE_REVERTED_EVENT, {
    detail: {
      eventIds: [...(syncSelection?.eventIds ?? [])],
      deletedEventIds: [...(syncSelection?.deletedEventIds ?? [])],
      failureKind: sharedSaveFailureKind(error),
      foregroundMutation: foregroundMutation === true,
      requestedAt: Number(requestedAt) || 0
    }
  }));
}

function sharedSaveFailureKind(error) {
  return saveFailureKind(error);
}

function saveLocalParticipantId(participantId) {
  const accountUserId = activeAccountUserId();
  const resolvedParticipantId = accountUserId
    ? `account-${accountUserId}`
    : participantId;
  if (!resolvedParticipantId) return;
  window.localStorage.setItem(participantStorageKey(), resolvedParticipantId);
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
  const nextAccountUserId = activeAccountUserId();
  if (activeAccountStorageScope && activeAccountStorageScope !== nextScope) {
    accountStorageGeneration += 1;
    // A same-account workspace bootstrap may be rebased; leaving an account
    // (even A -> B -> A) must permanently invalidate its in-flight requests.
    if (activeStorageAccountUserId !== nextAccountUserId) accountIdentityGeneration += 1;
    resetAccountSyncWork();
    sharedStateLoadPromise = null;
    sharedStateLoadScope = "";
  }
  activeAccountStorageScope = nextScope;
  activeStorageAccountUserId = nextAccountUserId;
  return nextScope;
}

function resetAccountSyncWork() {
  // Only new work is detached. Already-sent requests settle under their
  // captured scope guards and cannot delay or acknowledge the new account.
  cloudWriteQueue = Promise.resolve();
  pendingSyncFlushPromise = null;
  pendingSharedSyncCoverage = null;
  resetPendingSharedStateRetry();
}

function saveStateForScope(state, requestScope) {
  if (requestScope !== synchronizeAccountStorageScope()) return false;
  return saveState(state);
}

function loadRequestIsCurrent(
  requestScope,
  requestAccountGeneration,
  requestSaveGeneration
) {
  return Boolean(
    requestScope === synchronizeAccountStorageScope() &&
      requestAccountGeneration === accountStorageGeneration &&
      requestSaveGeneration === sharedStateSaveGeneration
  );
}

function loadAccountRequestIsCurrent(requestScope, requestAccountGeneration) {
  return Boolean(
    requestScope === synchronizeAccountStorageScope() &&
      requestAccountGeneration === accountStorageGeneration
  );
}

function staleAccountSaveResult() {
  return {
    ok: false,
    mode: "stale-account",
    error: Object.assign(new Error("Account changed during state save"), {
      code: "STALE_ACCOUNT"
    })
  };
}

function mergeLoadedStateWithCurrentLocal(loadedState, requestScope) {
  const mergedState = applyLocalParticipantId(
    cleanLegacyStarterData(
      mergeSharedStates(loadedState, loadState()),
      loadProtectedParticipantId()
    ),
    loadLocalParticipantId()
  );
  saveStateForScope(mergedState, requestScope);
  return mergedState;
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
  const avatarImageUpdatedAt = normalizeProfileUpdatedAt(
    profile?.avatarImageUpdatedAt ||
      (avatarImage ? profile?.profileUpdatedAt : "")
  );
  return {
    ...(avatarPreset ? { avatarPreset } : {}),
    ...(avatarImage ? { avatarImage } : {}),
    ...(avatarImageUpdatedAt ? { avatarImageUpdatedAt } : {})
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
