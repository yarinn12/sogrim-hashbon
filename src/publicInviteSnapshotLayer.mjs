import {
  loadLocalProfile,
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
import { ensureNamedParticipant } from "./domain/userProfile.mjs";

let inviteSnapshotScheduled = false;

importIncomingInviteSnapshot();
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
  if (!inviteSnapshot || !eventId) return;

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
  saveSharedState(state);
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

function handleInviteSnapshotJoinClick(event) {
  const button = event.target.closest(
    '[data-action="join-existing-event"], [data-public-join-existing-event], [data-public-submit-join]'
  );
  if (!button) return;

  const link = findJoinLink();
  const inviteSnapshot = parseInviteSnapshot(link);
  const eventId = parseInviteEventId(link);
  if (!inviteSnapshot || !eventId) return;

  event.preventDefault();
  event.stopImmediatePropagation();

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
  saveSharedState(state);
  window.location.href = buildEventInviteUrl(window.location.href, eventId, inviteSnapshot);
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
  return buildEventInviteUrl(
    window.location.href,
    eventId,
    buildEventInviteSnapshot(state, eventId)
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
