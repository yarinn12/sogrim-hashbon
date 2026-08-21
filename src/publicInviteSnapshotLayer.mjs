import {
  loadLocalProfile,
  loadRuntimeConfig,
  loadState,
  saveSharedState,
  saveState
} from "./data/localStore.mjs";
import {
  buildEventInviteSnapshot,
  buildEventInviteUrl,
  parseInviteEventId,
  parseInviteSnapshot
} from "./domain/inviteLinks.mjs";
import { parseCompactInviteUrl } from "./domain/compactInvite.mjs";
import { normalizeReferralCode } from "./domain/referralCodes.mjs";
import { ensureNamedParticipant } from "./domain/userProfile.mjs";
import { isActiveEventParticipant } from "./domain/eventMembership.mjs";
import {
  eventShareCredentials,
  mergeSharedEventIntoState,
  readSharedEventState
} from "./data/sharedEventStore.mjs";
import {
  eventOpenInviteToken,
  resolveEventInviteCredentials
} from "./data/eventInvites.mjs";
import {
  clearPendingInviteUrl,
  pendingInviteUrl,
  rememberPendingInviteUrl
} from "./data/pendingInvite.mjs";
import { sendEventActivityNotification } from "./data/eventActivityNotifications.mjs";

let inviteSnapshotScheduled = false;
let runtimeConfig = null;
let inviteJoinBusy = false;
let pendingInviteReconnectRequest = null;

rememberPendingInviteUrl();
startInviteImportAfterAccountReady();
window.addEventListener("online", () => {
  recoverPendingInviteAfterReconnect().catch(() => {});
});
document.addEventListener("click", handleInviteCopyClick, true);
document.addEventListener("click", handleInviteSnapshotJoinClick, true);
document.addEventListener(
  "settle-friends:entitlements-changed",
  scheduleInviteSnapshotEnhancement
);
new MutationObserver(scheduleInviteSnapshotEnhancement).observe(document.body, {
  childList: true,
  subtree: true
});
scheduleInviteSnapshotEnhancement();

function startInviteImportAfterAccountReady() {
  if (!document.documentElement.classList.contains("account-auth-pending")) {
    initializeInviteImport();
    return;
  }

  document.addEventListener("account-auth-ready", initializeInviteImport, {
    once: true
  });
}

async function initializeInviteImport() {
  const config = await loadRuntimeConfig();
  runtimeConfig = config;
  const imported = await importIncomingSharedEvent(config);
  if (imported) cleanInviteAddress();
  scheduleInviteSnapshotEnhancement();
}

function scheduleInviteSnapshotEnhancement() {
  if (inviteSnapshotScheduled) return;
  inviteSnapshotScheduled = true;

  requestAnimationFrame(() => {
    inviteSnapshotScheduled = false;
    enhanceInviteLinks();
  });
}

function enhanceInviteLinks() {
  const buttons = document.querySelectorAll(
    '[data-action="copy-invite"][data-open-link="true"][data-event-id]'
  );
  if (buttons.length && !runtimeConfig) ensureRuntimeConfigForInvites();

  buttons.forEach((button) => {
    const input = button.closest(".invite-link-row")?.querySelector("input");
    if (input?.dataset.shareReady !== "true") return;
    const inviteUrl = smartInviteUrl(button.dataset.eventId);
    if (input && input.value !== inviteUrl) input.value = inviteUrl;
  });
}

let runtimeConfigRequest = null;

function ensureRuntimeConfigForInvites() {
  if (runtimeConfigRequest) return runtimeConfigRequest;

  runtimeConfigRequest = loadRuntimeConfig()
    .then((config) => {
      runtimeConfig = config;
      scheduleInviteSnapshotEnhancement();
      return config;
    })
    .catch(() => null)
    .finally(() => {
      runtimeConfigRequest = null;
    });

  return runtimeConfigRequest;
}

function handleInviteCopyClick(event) {
  const button = event.target.closest(
    '[data-action="copy-invite"][data-open-link="true"][data-event-id]'
  );
  if (!button) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  copyResolvedInviteUrl(button);
}

async function copyResolvedInviteUrl(button) {
  if (!runtimeConfig) {
    try {
      runtimeConfig = await loadRuntimeConfig();
    } catch {
      // The snapshot link stays usable when the runtime config is unavailable.
    }
  }

  const inviteUrl = smartInviteUrl(button.dataset.eventId);
  copyText(inviteUrl);
  button.textContent = "הועתק";
  window.setTimeout(() => {
    button.textContent = "העתק";
  }, 1400);
}

async function handleInviteSnapshotJoinClick(event) {
  const button = event.target.closest(
    '[data-action="join-existing-event"], [data-public-join-existing-event], [data-public-submit-join]'
  );
  if (!button) return;

  const link = findJoinLink();
  const inviteSnapshot = parseInviteSnapshot(link);
  const eventId = parseInviteEventId(link);
  if (!inviteSnapshot || !eventId || inviteSnapshot.event.id !== eventId) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (inviteJoinBusy) return;
  inviteJoinBusy = true;
  button.disabled = true;

  try {
    const joinRuntimeConfig = await loadRuntimeConfig();
    runtimeConfig = joinRuntimeConfig;
    const credentials = await resolveEventInviteCredentials(
      joinRuntimeConfig,
      link
    );
    if (!credentials) return;
    let sharedEventState = null;
    try {
      sharedEventState = await readSharedEventState(
        joinRuntimeConfig,
        credentials,
        eventId
      );
    } catch (error) {
      if (openVerifiedCachedEvent(eventId)) return;
      throw error;
    }
    if (!sharedEventState) {
      openVerifiedCachedEvent(eventId);
      return;
    }
    let state = mergeSharedEventIntoState(
      loadState(),
      sharedEventState,
      credentials
    );
    const profile = loadLocalProfile();
    const wasAlreadyParticipant = profile
      ? isActiveEventParticipant(
          state.events?.find((event) => event.id === eventId),
          profile.participantId
        )
      : true;
    if (profile) {
      state = ensureNamedParticipant(
        state,
        {
          ...profile,
          id: profile.participantId,
          displayName: profile.displayName
        },
        eventId,
        { reactivateInactive: false }
      );
    }

    saveState(state);
    const saveResult = await saveSharedState(state);
    if (!saveResult?.ok && !saveResult?.partial) {
      document.dispatchEvent(new CustomEvent("settle-friends:notice", {
        detail: {
          message:
            "החיבור לאירוע הוכן, אבל השמירה עדיין לא הושלמה. בדקו את החיבור ונסו שוב."
        }
      }));
      return;
    }
    if (profile && !wasAlreadyParticipant) {
      notifyJoinedEvent(saveResult, eventId, profile.participantId);
    }
    window.location.replace(buildEventInviteUrl(window.location.href, eventId));
  } finally {
    inviteJoinBusy = false;
    if (button.isConnected) button.disabled = false;
  }
}

function openVerifiedCachedEvent(eventId) {
  const cachedEvent = loadState().events?.find((event) => event.id === eventId);
  if (!cachedEvent || !eventShareCredentials(cachedEvent)) return false;
  window.location.replace(buildEventInviteUrl(window.location.href, eventId));
  return true;
}

function recoverPendingInviteAfterReconnect() {
  if (pendingInviteReconnectRequest) return pendingInviteReconnectRequest;

  const rememberedInviteUrl = pendingInviteUrl(window.location.href);
  const eventId = parseInviteEventId(rememberedInviteUrl);
  if (!eventId) return Promise.resolve();

  pendingInviteReconnectRequest = loadRuntimeConfig()
    .then(async (config) => {
      runtimeConfig = config;
      const imported = await importIncomingSharedEvent(config, rememberedInviteUrl);
      if (imported) cleanInviteAddress();
      return imported;
    })
    .finally(() => {
      pendingInviteReconnectRequest = null;
    });

  return pendingInviteReconnectRequest;
}

async function importIncomingSharedEvent(
  config,
  inviteUrl = pendingInviteUrl(window.location.href)
) {
  const url = new URL(inviteUrl, window.location.origin);
  const eventId = parseInviteEventId(url);
  let credentials = null;
  try {
    credentials = await resolveEventInviteCredentials(config, url);
  } catch {
    return false;
  }
  if (!eventId || !credentials) return false;

  try {
    const sharedEventState = await readSharedEventState(config, credentials, eventId);
    if (!sharedEventState) return false;
    let state = mergeSharedEventIntoState(loadState(), sharedEventState, credentials);
    const profile = loadLocalProfile();
    const wasAlreadyParticipant = profile
      ? isActiveEventParticipant(
          state.events?.find((event) => event.id === eventId),
          profile.participantId
        )
      : true;
    if (profile) {
      state = ensureNamedParticipant(
        state,
        { ...profile, id: profile.participantId, displayName: profile.displayName },
        eventId,
        { reactivateInactive: false }
      );
    }
    saveState(state);
    const saveResult = await saveSharedState(state);
    if (!saveResult?.ok && !saveResult?.partial) return false;
    if (profile && !wasAlreadyParticipant) {
      notifyJoinedEvent(saveResult, eventId, profile.participantId, config);
    }
    clearPendingInviteUrl();
    return true;
  } catch {
    // The URL preview remains usable when the event cloud is temporarily unavailable.
    return false;
  }
}

function notifyJoinedEvent(
  saveResult,
  eventId,
  participantId,
  config = runtimeConfig
) {
  if (!saveResult?.ok || saveResult.mode !== "cloud") return;
  const configRequest = config
    ? Promise.resolve(config)
    : loadRuntimeConfig();
  configRequest
    .then((resolvedConfig) =>
      sendEventActivityNotification(resolvedConfig, {
        eventId,
        activityId: participantId,
        kind: "participant-joined"
      })
    )
    .catch(() => {});
}

function cleanInviteAddress() {
  const url = new URL(window.location.href);
  const compactInvite = parseCompactInviteUrl(url);
  if (compactInvite) {
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("event", compactInvite.eventId);
    window.history.replaceState(window.history.state, "", url);
    return;
  }

  if (
    !url.searchParams.has("key") &&
    !url.searchParams.has("invite") &&
    !url.searchParams.has("t")
  ) return;

  url.searchParams.delete("space");
  url.searchParams.delete("key");
  url.searchParams.delete("invite");
  url.searchParams.delete("t");
  window.history.replaceState(window.history.state, "", url);
}

function findJoinLink() {
  return (
    document.querySelector("[data-public-join-event-link]")?.value?.trim() ||
    document.querySelector('[data-action="join-event-link"]')?.value?.trim() ||
    ""
  );
}

function smartInviteUrl(eventId) {
  const state = loadState();
  const event = state.events?.find((item) => item.id === eventId);
  const cloudInvite = runtimeConfig?.storage?.mode === "supabase";
  const inviteToken = cloudInvite
    ? eventOpenInviteToken(event)
    : null;
  const referralCode = normalizeReferralCode(
    globalThis.SogrimMonetization?.status?.referralCode
  );
  return buildEventInviteUrl(
    runtimeConfig?.publicUrl || window.location.href,
    eventId,
    cloudInvite ? null : buildEventInviteSnapshot(state, eventId),
    inviteToken
      ? {
          inviteToken,
          referralCode
        }
      : { referralCode }
  );
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}
