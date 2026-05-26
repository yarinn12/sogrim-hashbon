import {
  loadLocalProfile,
  loadSharedState,
  loadState,
  saveLocalProfile,
  saveSharedState,
  saveState
} from "./data/localStore.mjs";
import {
  buildEventInviteUrl,
  mergeInviteSnapshotIntoState,
  parseInviteEventId,
  parseInviteSnapshot
} from "./domain/inviteLinks.mjs";
import {
  ensureNamedParticipant,
  isFullProfileName,
  normalizeProfileName
} from "./domain/userProfile.mjs";

document.addEventListener("submit", handlePublicProfileSubmit, true);
document.addEventListener("click", handleNativeProfileSave, true);
bootIncomingInvite();

function bootIncomingInvite() {
  const context = inviteContext();
  if (!context) return;

  const profile = loadLocalProfile();
  let nextState = mergeInviteSnapshotIntoState(loadState(), context.snapshot);

  if (profile) {
    nextState = ensureNamedParticipant(
      nextState,
      {
        ...profile,
        id: profile.participantId,
        displayName: profile.displayName
      },
      context.eventId
    );
  }

  saveState(nextState);

  if (profile) {
    saveSharedState(nextState).finally(() => reloadOnce(context.eventId));
  }
}

function handlePublicProfileSubmit(event) {
  const form = event.target?.closest?.("[data-public-profile-form]");
  if (!form || !inviteContext()) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const errorNode = form.querySelector("[data-public-profile-error]");
  const displayName = normalizeProfileName(new FormData(form).get("displayName"));
  joinInviteWithName(displayName, errorNode);
}

function handleNativeProfileSave(event) {
  const button = event.target?.closest?.('[data-action="save-profile"]');
  if (!button || !inviteContext()) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const input = document.querySelector('[data-action="profile-name"]');
  const errorNode = input?.closest(".field")?.querySelector(".field-error") ?? null;
  joinInviteWithName(normalizeProfileName(input?.value), errorNode);
}

async function joinInviteWithName(displayName, errorNode) {
  const context = inviteContext();
  if (!context) return;

  if (!isFullProfileName(displayName)) {
    showNameError(errorNode);
    return;
  }

  const previousProfile = loadLocalProfile();
  const sharedState = mergeInviteSnapshotIntoState(await loadSharedState(), context.snapshot);
  const nextState = ensureNamedParticipant(
    sharedState,
    {
      id: previousProfile?.participantId ?? makeUserId(),
      displayName
    },
    context.eventId
  );
  const participant = nextState.participants.find(
    (item) => item.id === nextState.currentParticipantId
  );

  saveLocalProfile({
    participantId: nextState.currentParticipantId,
    displayName: participant?.displayName ?? displayName
  });
  saveState(nextState);
  await saveSharedState(nextState);
  markImported(context.eventId);
  window.location.href = buildEventInviteUrl(
    window.location.href,
    context.eventId,
    context.snapshot
  );
}

function inviteContext() {
  const eventId = parseInviteEventId(window.location.href);
  const snapshot = parseInviteSnapshot(window.location.href);
  if (!eventId || !snapshot) return null;
  return { eventId, snapshot };
}

function showNameError(errorNode) {
  if (!errorNode) return;
  errorNode.hidden = false;
  errorNode.textContent = "צריך להזין שם פרטי ושם משפחה כדי להצטרף.";
}

function reloadOnce(eventId) {
  if (wasImported(eventId)) return;
  markImported(eventId);
  window.location.reload();
}

function wasImported(eventId) {
  try {
    return sessionStorage.getItem(importMarker(eventId)) === "1";
  } catch {
    return true;
  }
}

function markImported(eventId) {
  try {
    sessionStorage.setItem(importMarker(eventId), "1");
  } catch {
    // Session storage can be blocked in strict browsers; the local save already happened.
  }
}

function importMarker(eventId) {
  return `sogrimInviteImported:${eventId}`;
}

function makeUserId() {
  if (crypto.randomUUID) return `user-${crypto.randomUUID()}`;
  return `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
