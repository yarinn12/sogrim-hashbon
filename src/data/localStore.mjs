import { demoState } from "./demoData.mjs";
import { loadCloudState, saveCloudState } from "./cloudStore.mjs";
import {
  applyLocalParticipantId,
  toSharedState
} from "./localIdentity.mjs";
import {
  isFullProfileName,
  normalizeProfileName
} from "../domain/userProfile.mjs";
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
  loadStoredAccountSession
} from "./accountAuth.mjs";
import { mergeSharedStates } from "../domain/sharedStateMerge.mjs";
import {
  refreshSharedEvents,
  syncSharedEvents
} from "./sharedEventStore.mjs";

const STORAGE_KEY = "settle-friends-state";
const NATIVE_API_ORIGIN = "https://sogrim-hashbon.vercel.app";
const LOCAL_PARTICIPANT_KEY = "settle-friends-current-participant";
const LOCAL_PROFILE_KEY = "settle-friends-local-profile";
const PENDING_SYNC_KEY_PREFIX = "settle-friends-pending-sync:";
const SYNC_STATUS_EVENT = "sogrim:sync-status";
const LOCAL_RUNTIME_CONFIG = {
  publicUrl: "",
  auth: { googleClientId: "" },
  storage: { mode: "local" },
  launch: {
    publicUrlReady: false,
    cloudStorageReady: false,
    googleAuthReady: false,
    accountDeletionReady: false,
    shareLinksReady: false
  }
};
const LEGACY_STARTER_EVENT_ID = "event-demo";
const LEGACY_STARTER_GROUP_ID = "thursday";
const LEGACY_STARTER_PARTICIPANT_IDS = new Set(["yarin", "dani", "avi", "maor"]);

let runtimeConfigPromise = null;
let cloudWriteQueue = Promise.resolve();

if (typeof window !== "undefined") {
  activateStoredAccountWorkspace();
}

if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("online", () => {
    flushPendingSharedState().catch(() => {});
  });
}

export function loadState() {
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
  const cleanState = cleanLegacyStarterData(state, loadProtectedParticipantId());
  saveLocalParticipantId(cleanState.currentParticipantId);
  window.localStorage.setItem(stateStorageKey(), JSON.stringify(toSharedState(cleanState)));
}

export async function loadRuntimeConfig() {
  if (!runtimeConfigPromise) {
    const nativeRuntime = isNativeRuntime();
    runtimeConfigPromise = fetch(`${nativeRuntime ? NATIVE_API_ORIGIN : ""}/api/config`)
      .then((response) => {
        if (!response.ok) throw new Error("Runtime config unavailable");
        return response.json();
      })
      .then((config) => ({
        ...config,
        apiBaseUrl: nativeRuntime ? NATIVE_API_ORIGIN : ""
      }))
      .catch(() => LOCAL_RUNTIME_CONFIG);
  }

  return attachStoredAccountIdentity(await runtimeConfigPromise);
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

export async function loadSharedState() {
  const runtimeConfig = activateClientSpace(await loadRuntimeConfig());
  const localState = loadState();

  if (runtimeConfig.storage?.mode === "supabase") {
    const pendingState = loadPendingSharedState(runtimeConfig);
    if (pendingState) {
      try {
        const remoteState = await loadCloudState(runtimeConfig, toSharedState(localState));
        const mergedState = mergeSharedStates(remoteState, pendingState);
        await saveCloudState(runtimeConfig, mergedState);
        const syncedState = await syncSharedEvents(runtimeConfig, mergedState);
        if (JSON.stringify(toSharedState(syncedState)) !== JSON.stringify(mergedState)) {
          await saveCloudState(runtimeConfig, toSharedState(syncedState));
        }
        clearPendingSharedState(runtimeConfig);
        publishSyncStatus("saved");
        const syncedStateWithIdentity = applyLocalParticipantId(
          cleanLegacyStarterData(syncedState, loadProtectedParticipantId()),
          loadLocalParticipantId()
        );
        saveState(syncedStateWithIdentity);
        return syncedStateWithIdentity;
      } catch (error) {
        publishSyncFailure(error);
        if (error?.code === "CLOUD_STATE_CONFLICT") {
          try {
            const latestState = await loadCloudState(runtimeConfig, toSharedState(localState));
            const remoteState = cleanLegacyStarterData(
              mergeSharedStates(latestState, pendingState),
              loadProtectedParticipantId()
            );
            await saveCloudState(runtimeConfig, remoteState);
            const syncedRemoteState = await syncSharedEvents(runtimeConfig, remoteState);
            if (hasCloudStateChanged(syncedRemoteState, remoteState)) {
              await saveCloudState(runtimeConfig, toSharedState(syncedRemoteState));
            }
            const remoteStateWithIdentity = applyLocalParticipantId(
              syncedRemoteState,
              loadLocalParticipantId()
            );
            clearPendingSharedState(runtimeConfig);
            saveState(remoteStateWithIdentity);
            return remoteStateWithIdentity;
          } catch {
            // Keep the pending local snapshot available for a later retry.
          }
        }
      }

      return applyLocalParticipantId(
        cleanLegacyStarterData(pendingState, loadProtectedParticipantId()),
        loadLocalParticipantId()
      );
    }

    try {
      let state = cleanLegacyStarterData(
        await loadCloudState(runtimeConfig, toSharedState(localState)),
        loadProtectedParticipantId()
      );
      const accountState = state;
      state = await refreshSharedEvents(runtimeConfig, state);
      if (hasCloudStateChanged(state, accountState)) {
        await saveCloudState(runtimeConfig, toSharedState(state));
      }
      const localStateWithIdentity = applyLocalParticipantId(
        state,
        loadLocalParticipantId()
      );
      saveState(localStateWithIdentity);
      return localStateWithIdentity;
    } catch {
      return localState;
    }
  }

  return localState;
}

export async function saveSharedState(state) {
  const cleanState = cleanLegacyStarterData(state, loadProtectedParticipantId());
  saveState(cleanState);
  const runtimeConfig = activateClientSpace(await loadRuntimeConfig());
  const sharedState = toSharedState(cleanState);

  if (runtimeConfig.storage?.mode === "supabase") {
    savePendingSharedState(runtimeConfig, sharedState);
    publishSyncStatus("saving");

    const pendingPayload = JSON.stringify(sharedState);
    cloudWriteQueue = cloudWriteQueue
      .catch(() => {})
      .then(async () => {
        try {
          await saveCloudState(runtimeConfig, sharedState);
          const syncedState = await syncSharedEvents(runtimeConfig, cleanState);
          if (JSON.stringify(toSharedState(syncedState)) !== JSON.stringify(sharedState)) {
            await saveCloudState(runtimeConfig, toSharedState(syncedState));
          }
          Object.assign(state, syncedState);
          saveState(syncedState);
          if (pendingPayload === pendingSharedStateRaw(runtimeConfig)) {
            clearPendingSharedState(runtimeConfig);
          }
          publishSyncStatus("saved");
          return { ok: true, mode: "cloud" };
        } catch (error) {
          if (error?.code === "CLOUD_STATE_CONFLICT") {
            try {
              const remoteState = await loadCloudState(runtimeConfig, sharedState);
              const mergedState = mergeSharedStates(remoteState, sharedState);
              await saveCloudState(runtimeConfig, mergedState);
              const syncedState = await syncSharedEvents(runtimeConfig, mergedState);
              if (JSON.stringify(toSharedState(syncedState)) !== JSON.stringify(mergedState)) {
                await saveCloudState(runtimeConfig, toSharedState(syncedState));
              }
              Object.assign(state, syncedState);
              saveState(syncedState);
              if (pendingPayload === pendingSharedStateRaw(runtimeConfig)) {
                clearPendingSharedState(runtimeConfig);
              }
              publishSyncStatus("saved");
              return { ok: true, mode: "cloud", merged: true };
            } catch (mergeError) {
              publishSyncFailure(mergeError);
              return { ok: false, mode: "cloud", error: mergeError };
            }
          }
          publishSyncFailure(error);
          return { ok: false, mode: "cloud", error };
        }
      });

    return cloudWriteQueue;
  }

  return { ok: true, mode: "local" };
}

export async function flushPendingSharedState() {
  const runtimeConfig = activateClientSpace(await loadRuntimeConfig());
  if (runtimeConfig.storage?.mode !== "supabase") return { ok: false };

  const pendingState = loadPendingSharedState(runtimeConfig);
  if (!pendingState) return { ok: true, empty: true };

  publishSyncStatus("saving");
  try {
    const remoteState = await loadCloudState(runtimeConfig, pendingState);
    const mergedState = mergeSharedStates(remoteState, pendingState);
    await saveCloudState(runtimeConfig, mergedState);
    const syncedState = await syncSharedEvents(runtimeConfig, mergedState);
    if (JSON.stringify(toSharedState(syncedState)) !== JSON.stringify(mergedState)) {
      await saveCloudState(runtimeConfig, toSharedState(syncedState));
    }
    clearPendingSharedState(runtimeConfig);
    publishSyncStatus("saved");
    return { ok: true };
  } catch (error) {
    publishSyncFailure(error);
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
    saveState(state);
    try {
      await saveCloudState(runtimeConfig, toSharedState(state));
    } catch {
      // Local fallback is already saved.
    }
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
  const raw = window.localStorage.getItem(LOCAL_PROFILE_KEY);
  if (!raw) return null;

  try {
    const profile = JSON.parse(raw);
    const displayName = normalizeProfileName(profile.displayName);
    if (!isFullProfileName(displayName) || !profile.participantId) return null;
    return {
      participantId: profile.participantId,
      displayName,
      ...profileAuthFields(profile)
    };
  } catch {
    return null;
  }
}

export function saveLocalProfile(profile) {
  const displayName = normalizeProfileName(profile.displayName);
  if (!isFullProfileName(displayName) || !profile.participantId) return null;

  const nextProfile = {
    participantId: profile.participantId,
    displayName,
    ...profileAuthFields(profile)
  };
  window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(nextProfile));
  saveLocalParticipantId(nextProfile.participantId);
  return nextProfile;
}

export function clearLocalProfile() {
  try {
    window.localStorage.removeItem(LOCAL_PROFILE_KEY);
    window.localStorage.removeItem(LOCAL_PARTICIPANT_KEY);
  } catch {}
}

export function clearLocalAccountData() {
  try {
    const activeSpaceId = peekClientSpaceId(window.location.href, window.localStorage);
    window.localStorage.removeItem(stateStorageKey());
    window.localStorage.removeItem(STORAGE_KEY);
    if (activeSpaceId) {
      window.localStorage.removeItem(`${PENDING_SYNC_KEY_PREFIX}${activeSpaceId}`);
    }
  } catch {}
  clearLocalProfile();
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
  return window.localStorage.getItem(LOCAL_PARTICIPANT_KEY);
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

  return window.localStorage.getItem(STORAGE_KEY);
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

function pendingSyncStorageKey(config) {
  return `${PENDING_SYNC_KEY_PREFIX}${config.storage.spaceId}`;
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
  } catch {}
}

function clearPendingSharedState(config) {
  try {
    window.localStorage.removeItem(pendingSyncStorageKey(config));
  } catch {}
}

function publishSyncFailure(error) {
  publishSyncStatus(error?.code === "CLOUD_STATE_CONFLICT" ? "conflict" : "offline");
}

function hasCloudStateChanged(nextState, previousState) {
  return JSON.stringify(toSharedState(nextState)) !== JSON.stringify(toSharedState(previousState));
}

function publishSyncStatus(status) {
  if (typeof window === "undefined" || !window.dispatchEvent) return;

  const EventConstructor = globalThis.CustomEvent;
  if (typeof EventConstructor !== "function") return;
  window.dispatchEvent(new EventConstructor(SYNC_STATUS_EVENT, { detail: { status } }));
}

function saveLocalParticipantId(participantId) {
  if (!participantId) return;
  window.localStorage.setItem(LOCAL_PARTICIPANT_KEY, participantId);
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
