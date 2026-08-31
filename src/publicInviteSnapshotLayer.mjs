import {
  loadLocalProfile,
  loadRuntimeConfig,
  loadState,
  saveSharedState,
  saveState
} from "./data/localStore.mjs";
import {
  buildEventInviteUrl,
  parseInviteEventId,
  parseInviteSnapshot,
  parseInviteToken
} from "./domain/inviteLinks.mjs";
import { parseCompactInviteUrl } from "./domain/compactInvite.mjs";
import { ensureNamedParticipant } from "./domain/userProfile.mjs";
import { isActiveEventParticipant } from "./domain/eventMembership.mjs";
import {
  eventShareCredentials,
  mergeSharedEventIntoState,
  readSharedEventState
} from "./data/sharedEventStore.mjs";
import {
  resolveEventInviteCredentials
} from "./data/eventInvites.mjs";
import {
  clearPendingInviteUrl,
  pendingInviteUrl,
  rememberPendingInviteUrl
} from "./data/pendingInvite.mjs";
import { sendEventActivityNotification } from "./data/eventActivityNotifications.mjs";
import { loadStoredAccountSession } from "./data/accountAuth.mjs";

const PENDING_INVITE_RETRY_BASE_MS = 5_000;
const PENDING_INVITE_RETRY_MAX_MS = 60_000;

let inviteSnapshotScheduled = false;
let runtimeConfig = null;
let inviteJoinBusy = false;
let pendingInviteReconnectRequest = null;
let pendingInviteRetryTimer = null;
let pendingInviteRetryDelayMs = PENDING_INVITE_RETRY_BASE_MS;

rememberPendingInviteUrl();
startInviteImportAfterAccountReady();
window.addEventListener("online", () => {
  recoverPendingInviteAfterReconnect({ resetBackoff: true }).catch(() => {});
});
window.addEventListener("settle-friends:native-resume", () => {
  recoverPendingInviteAfterReconnect({ resetBackoff: true }).catch(() => {});
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    recoverPendingInviteAfterReconnect({ resetBackoff: true }).catch(() => {});
  }
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
  if (imported) {
    resetPendingInviteRetry();
    cleanInviteAddress();
  } else {
    schedulePendingInviteRetry();
  }
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

  // The app owns preparation of the server-issued URL. This compatibility
  // layer must never replace it with a locally reconstructed fallback: doing
  // so can silently remove the open-invite token from copy and QR actions.
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

  const input = button.closest(".invite-link-row")?.querySelector("input");
  const inviteUrl = input?.value?.trim() ?? "";
  if (
    input?.dataset.shareReady !== "true" ||
    parseInviteEventId(inviteUrl) !== button.dataset.eventId ||
    !parseInviteToken(inviteUrl)
  ) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  copyResolvedInviteUrl(button, inviteUrl);
}

async function copyResolvedInviteUrl(button, inviteUrl) {
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
    const saveResult = await saveSharedState(state, { awaitCloud: true });
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

function recoverPendingInviteAfterReconnect({ resetBackoff = false } = {}) {
  if (resetBackoff) resetPendingInviteRetry();
  if (pendingInviteReconnectRequest) return pendingInviteReconnectRequest;
  if (document.documentElement.classList.contains("account-auth-pending")) {
    return Promise.resolve(false);
  }

  const rememberedInviteUrl = pendingInviteUrl(window.location.href);
  const eventId = parseInviteEventId(rememberedInviteUrl);
  if (!eventId) {
    resetPendingInviteRetry();
    return Promise.resolve(false);
  }

  pendingInviteReconnectRequest = loadRuntimeConfig()
    .then(async (config) => {
      runtimeConfig = config;
      const imported = await importIncomingSharedEvent(config, rememberedInviteUrl);
      if (imported) {
        resetPendingInviteRetry();
        cleanInviteAddress();
      }
      return imported;
    })
    .finally(() => {
      pendingInviteReconnectRequest = null;
      if (parseInviteEventId(pendingInviteUrl(window.location.href))) {
        schedulePendingInviteRetry();
      }
    });

  return pendingInviteReconnectRequest;
}

function resetPendingInviteRetry() {
  pendingInviteRetryDelayMs = PENDING_INVITE_RETRY_BASE_MS;
  if (pendingInviteRetryTimer !== null) {
    window.clearTimeout(pendingInviteRetryTimer);
    pendingInviteRetryTimer = null;
  }
}

function schedulePendingInviteRetry() {
  if (
    pendingInviteRetryTimer !== null ||
    navigator.onLine === false ||
    !parseInviteEventId(pendingInviteUrl(window.location.href))
  ) return;

  const delayMs = pendingInviteRetryDelayMs;
  pendingInviteRetryTimer = window.setTimeout(() => {
    pendingInviteRetryTimer = null;
    recoverPendingInviteAfterReconnect().catch(() => {});
  }, delayMs);
  pendingInviteRetryDelayMs = Math.min(
    PENDING_INVITE_RETRY_MAX_MS,
    delayMs * 2
  );
}

function inviteImportOwnerIsActive(config) {
  const expectedUserId = String(config?.storage?.account?.userId ?? "").trim();
  if (!expectedUserId) return true;
  const activeUserId = String(
    loadStoredAccountSession(window.localStorage)?.user?.id ?? ""
  ).trim();
  return activeUserId === expectedUserId;
}

async function importIncomingSharedEvent(
  config,
  inviteUrl = pendingInviteUrl(window.location.href)
) {
  if (!inviteImportOwnerIsActive(config)) return false;
  const url = new URL(inviteUrl, window.location.origin);
  const eventId = parseInviteEventId(url);
  let credentials = null;
  try {
    credentials = await resolveEventInviteCredentials(config, url);
  } catch {
    return false;
  }
  if (!inviteImportOwnerIsActive(config)) return false;
  if (!eventId || !credentials) return false;

  try {
    const sharedEventState = await readSharedEventState(config, credentials, eventId);
    if (!inviteImportOwnerIsActive(config)) return false;
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
    const saveResult = await saveSharedState(state, { awaitCloud: true });
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
  const tokenInviteEventId = parseInviteEventId(url.toString());
  const tokenInvite = parseInviteToken(url.toString());
  if (
    tokenInviteEventId &&
    tokenInvite &&
    /^\/i\/[^/]+\/t\/[^/]+\/?$/.test(url.pathname)
  ) {
    url.pathname = "/";
    url.searchParams.set("event", tokenInviteEventId);
    url.searchParams.delete("space");
    url.searchParams.delete("key");
    url.searchParams.delete("invite");
    url.searchParams.delete("t");
    window.history.replaceState(window.history.state, "", url);
    return;
  }

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
