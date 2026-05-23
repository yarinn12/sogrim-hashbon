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

let runtimeConfigPromise = null;

export function loadState() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return applyLocalParticipantId(clone(demoState), loadLocalParticipantId());

  try {
    return applyLocalParticipantId(JSON.parse(raw), loadLocalParticipantId());
  } catch {
    return applyLocalParticipantId(clone(demoState), loadLocalParticipantId());
  }
}

export function saveState(state) {
  saveLocalParticipantId(state.currentParticipantId);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSharedState(state)));
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
      const state = await loadCloudState(runtimeConfig, toSharedState(localState));
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
    const state = await response.json();
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
  saveState(state);
  const sharedState = toSharedState(state);
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
    const state = applyLocalParticipantId(clone(demoState), loadLocalParticipantId());
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
    const state = await response.json();
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
  const state = applyLocalParticipantId(clone(demoState), loadLocalParticipantId());
  saveState(state);
  return state;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadLocalParticipantId() {
  return window.localStorage.getItem(LOCAL_PARTICIPANT_KEY);
}

function saveLocalParticipantId(participantId) {
  if (!participantId) return;
  window.localStorage.setItem(LOCAL_PARTICIPANT_KEY, participantId);
}
