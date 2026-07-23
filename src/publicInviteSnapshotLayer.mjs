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
  mergeInviteSnapshotIntoState,
  parseInviteEventId,
  parseInviteSnapshot
} from "./domain/inviteLinks.mjs";
import { parseInviteSpaceId, parseInviteSpaceKey } from "./domain/cloudSpace.mjs";
import { parseCompactInviteUrl } from "./domain/compactInvite.mjs";
import { ensureNamedParticipant } from "./domain/userProfile.mjs";
import {
  eventShareCredentials,
  mergeSharedEventIntoState,
  readSharedEventState
} from "./data/sharedEventStore.mjs";
import { rememberPendingInviteUrl } from "./data/pendingInvite.mjs";

let inviteSnapshotScheduled = false;
let runtimeConfig = null;

rememberPendingInviteUrl();
importIncomingInviteSnapshot();
loadRuntimeConfig().then(async (config) => {
  runtimeConfig = config;
  await importIncomingSharedEvent(config);
  cleanInviteAddress();
  scheduleInviteSnapshotEnhancement();
});
document.addEventListener("click", handleInviteCopyClick, true);
document.addEventListener("click", handleInviteSnapshotJoinClick, true);
new MutationObserver(scheduleInviteSnapshotEnhancement).observe(document.body, {
  childList: true,
  subtree: true
});
scheduleInviteSnapshotEnhancement();

function importIncomingInviteSnapshot() {
  const inviteSnapshot = parseInviteSnapshot(window.location.href);
  const eventId = parseInviteEventId(window.location.href);
  if (!inviteSnapshot || !eventId || inviteSnapshot.event.id !== eventId) return;

  let state = mergeInviteSnapshotIntoState(loadState(), inviteSnapshot);
  const profile = loadLocalProfile();
  if (profile) {
    state = ensureNamedParticipant(
      state,
      {
        ...profile,
        id: profile.participantId,
        displayName: profile.displayName
      },
      eventId
    );
  }

  saveState(state);
  reloadOnceForImportedInvite(eventId);
}

function reloadOnceForImportedInvite(eventId) {
  const marker = `sogrimInviteImported:${eventId}`;
  try {
    if (sessionStorage.getItem(marker)) return;
    sessionStorage.setItem(marker, "1");
  } catch {
    return;
  }

  window.location.reload();
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
  document
    .querySelectorAll('[data-action="copy-invite"][data-event-id]')
    .forEach((button) => {
      const inviteUrl = smartInviteUrl(button.dataset.eventId);
      const input = button.closest(".invite-link-row")?.querySelector("input");
      if (input && input.value !== inviteUrl) input.value = inviteUrl;
    });
}

function handleInviteCopyClick(event) {
  const button = event.target.closest('[data-action="copy-invite"][data-event-id]');
  if (!button) return;

  event.preventDefault();
  event.stopImmediatePropagation();

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

  let state = mergeInviteSnapshotIntoState(loadState(), inviteSnapshot);
  const credentials = inviteCredentials(link);
  if (credentials) {
    try {
      const joinRuntimeConfig = await loadRuntimeConfig();
      runtimeConfig = joinRuntimeConfig;
      const sharedEventState = await readSharedEventState(
        joinRuntimeConfig,
        credentials,
        eventId
      );
      if (sharedEventState) {
        state = mergeSharedEventIntoState(state, sharedEventState, credentials);
      }
    } catch {
      // The safe preview remains available when cloud sync is temporarily unavailable.
    }
  }
  const profile = loadLocalProfile();
  if (profile) {
    state = ensureNamedParticipant(
      state,
      {
        ...profile,
        id: profile.participantId,
        displayName: profile.displayName
      },
      eventId
    );
  }

  saveState(state);
  await saveSharedState(state);
  window.location.replace(buildEventInviteUrl(window.location.href, eventId));
}

async function importIncomingSharedEvent(config) {
  const url = new URL(window.location.href);
  const eventId = parseInviteEventId(url);
  const credentials = inviteCredentials(url);
  if (!eventId || !credentials) return;

  try {
    const sharedEventState = await readSharedEventState(config, credentials, eventId);
    if (!sharedEventState) return;
    let state = mergeSharedEventIntoState(loadState(), sharedEventState, credentials);
    const profile = loadLocalProfile();
    if (profile) {
      state = ensureNamedParticipant(
        state,
        { ...profile, id: profile.participantId, displayName: profile.displayName },
        eventId
      );
    }
    saveState(state);
    await saveSharedState(state);
  } catch {
    // The URL preview remains usable when the event cloud is temporarily unavailable.
  }
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

  if (!url.searchParams.has("key") && !url.searchParams.has("invite")) return;

  url.searchParams.delete("space");
  url.searchParams.delete("key");
  url.searchParams.delete("invite");
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
  const credentials = runtimeConfig?.storage?.mode === "supabase"
    ? eventShareCredentials(event)
    : null;
  return buildEventInviteUrl(
    window.location.href,
    eventId,
    buildEventInviteSnapshot(state, eventId),
    credentials
      ? { spaceId: credentials.id, spaceKey: credentials.key, compact: true }
      : {}
  );
}

function inviteCredentials(urlValue) {
  const id = parseInviteSpaceId(urlValue);
  const key = parseInviteSpaceKey(urlValue);
  return id && key ? { id, key } : null;
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
