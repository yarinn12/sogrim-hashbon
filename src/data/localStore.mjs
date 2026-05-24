import { demoState } from "./demoData.mjs";
import { loadCloudState, saveCloudState } from "./cloudStore.mjs";
import {
  applyLocalParticipantId,
  toSharedState
} from "./localIdentity.mjs";
import { normalizeProfileName } from "../domain/userProfile.mjs";

const STORAGE_KEY = "settle-friends-state";
const LOCAL_PARTICIPANT_KEY = "settle-friends-current-participant";
const LOCAL_PROFILE_KEY = "settle-friends-local-profile";
const LOCAL_RUNTIME_CONFIG = {
  publicUrl: "",
  storage: { mode: "local" },
  launch: {
    publicUrlReady: false,
    cloudStorageReady: false,
    googleAuthReady: false,
    shareLinksReady: false
  }
};
const LEGACY_STARTER_EVENT_ID = "event-demo";
const LEGACY_STARTER_GROUP_ID = "thursday";
const LEGACY_STARTER_PARTICIPANT_IDS = new Set(["yarin", "dani", "avi", "maor"]);

let runtimeConfigPromise = null;

export function loadState() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSharedState(cleanState)));
}

export async function loadRuntimeConfig() {
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetch("/api/config")
      .then((response) => {
        if (!response.ok) throw new Error("Runtime config unavailable");
        return response.json();
      })
      .catch(() => LOCAL_RUNTIME_CONFIG);
  }

  return runtimeConfigPromise;
}

export async function loadSharedState() {
  const localState = loadState();
  const runtimeConfig = await loadRuntimeConfig();

  if (runtimeConfig.storage?.mode === "supabase") {
    try {
      const state = cleanLegacyStarterData(
        await loadCloudState(runtimeConfig, toSharedState(localState)),
        loadProtectedParticipantId()
      );
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

  try {
    const response = await fetch("/api/state");
    if (!response.ok) throw new Error("Shared state unavailable");
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
    return loadState();
  }
}

export async function saveSharedState(state) {
  const cleanState = cleanLegacyStarterData(state, loadProtectedParticipantId());
  saveState(cleanState);
  const sharedState = toSharedState(cleanState);
  const runtimeConfig = await loadRuntimeConfig();

  if (runtimeConfig.storage?.mode === "supabase") {
    try {
      await saveCloudState(runtimeConfig, sharedState);
    } catch {
      // Local fallback is already saved.
    }
    return;
  }

  try {
    await fetch("/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sharedState)
    });
  } catch {
    // Local fallback is already saved.
  }
}

export async function resetSharedState() {
  const runtimeConfig = await loadRuntimeConfig();

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
    if (!displayName || !profile.participantId) return null;
    return { participantId: profile.participantId, displayName };
  } catch {
    return null;
  }
}

export function saveLocalProfile(profile) {
  const displayName = normalizeProfileName(profile.displayName);
  if (!displayName || !profile.participantId) return null;

  const nextProfile = { participantId: profile.participantId, displayName };
  window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(nextProfile));
  saveLocalParticipantId(nextProfile.participantId);
  return nextProfile;
}

export function resetState() {
  const state = applyLocalParticipantId(
    cleanLegacyStarterData(clone(demoState), loadProtectedParticipantId()),
    loadLocalParticipantId()
  );
  saveState(state);
  return state;
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

function saveLocalParticipantId(participantId) {
  if (!participantId) return;
  window.localStorage.setItem(LOCAL_PARTICIPANT_KEY, participantId);
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
