import {
  loadLocalProfile,
  loadRuntimeConfig,
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
import { parseInviteSpaceId, parseInviteSpaceKey } from "./domain/cloudSpace.mjs";
import {
  mergeSharedEventIntoState,
  readSharedEventState
} from "./data/sharedEventStore.mjs";
import { pendingInviteUrl } from "./data/pendingInvite.mjs";
import {
  ensureNamedParticipant,
  isFullProfileName,
  normalizeProfileName
} from "./domain/userProfile.mjs";
import { sendEventActivityNotification } from "./data/eventActivityNotifications.mjs";

let inviteProfileJoinBusy = false;

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
      context.eventId,
      { reactivateInactive: false }
    );
  }

  saveState(nextState);

  if (profile) {
    reloadOnce(context.eventId);
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

  const input = document.querySelector('[data-action="profile-name"]');
  const displayName = normalizeProfileName(input?.value);
  if (!isFullProfileName(displayName)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  const errorNode = input?.closest(".field")?.querySelector(".field-error") ?? null;
  joinInviteWithName(displayName, errorNode);
}

async function joinInviteWithName(displayName, errorNode) {
  const context = inviteContext();
  if (!context || inviteProfileJoinBusy) return;

  if (!isFullProfileName(displayName)) {
    showNameError(errorNode);
    return;
  }

  inviteProfileJoinBusy = true;
  setInviteProfileJoinBusy(true);
  let shouldReleaseBusy = true;
  try {
    const previousProfile = loadLocalProfile();
    let sharedState = mergeInviteSnapshotIntoState(await loadSharedState(), context.snapshot);
    if (context.spaceId && context.spaceKey) {
      try {
        const remoteEvent = await readSharedEventState(
          await loadRuntimeConfig(),
          { id: context.spaceId, key: context.spaceKey },
          context.eventId
        );
        if (remoteEvent) {
          sharedState = mergeSharedEventIntoState(
            sharedState,
            remoteEvent,
            { id: context.spaceId, key: context.spaceKey }
          );
        }
      } catch {
        // Continue with the safe preview if cloud sync is unavailable.
      }
    }
    const participantId =
      previousProfile?.participantId ?? makeUserId();
    const wasAlreadyParticipant = sharedState.events
      ?.find((event) => event.id === context.eventId)
      ?.participantIds?.includes(participantId);
    const nextState = ensureNamedParticipant(
      sharedState,
      {
        id: participantId,
        displayName
      },
      context.eventId,
      { reactivateInactive: false }
    );
    const participant = nextState.participants.find(
      (item) => item.id === nextState.currentParticipantId
    );

    saveLocalProfile({
      participantId: nextState.currentParticipantId,
      displayName: participant?.displayName ?? displayName
    });
    saveState(nextState);
    const saveResult = await saveSharedState(nextState);
    if (!wasAlreadyParticipant && participant) {
      notifyJoinedEvent(saveResult, context.eventId, participant.id);
    }
    markImported(context.eventId);
    window.location.replace(buildEventInviteUrl(window.location.href, context.eventId));
    shouldReleaseBusy = false;
  } finally {
    if (shouldReleaseBusy) {
      inviteProfileJoinBusy = false;
      setInviteProfileJoinBusy(false);
    }
  }
}

function notifyJoinedEvent(saveResult, eventId, participantId) {
  if (!saveResult?.ok || saveResult.mode !== "cloud") return;
  loadRuntimeConfig()
    .then((config) =>
      sendEventActivityNotification(config, {
        eventId,
        activityId: participantId,
        kind: "participant-joined"
      })
    )
    .catch(() => {});
}

function setInviteProfileJoinBusy(value) {
  document
    .querySelectorAll(
      '[data-public-profile-form] button, [data-action="save-profile"]'
    )
    .forEach((button) => {
      button.disabled = value;
    });
}

function inviteContext() {
  const inviteUrl = pendingInviteUrl(window.location.href);
  const eventId = parseInviteEventId(inviteUrl);
  const snapshot = parseInviteSnapshot(inviteUrl);
  if (!eventId || !snapshot || snapshot.event.id !== eventId) return null;
  return {
    eventId,
    snapshot,
    spaceId: parseInviteSpaceId(inviteUrl) ?? undefined,
    spaceKey: parseInviteSpaceKey(inviteUrl) ?? undefined
  };
}

function showNameError(errorNode) {
  if (!errorNode) return;
  errorNode.hidden = false;
  errorNode.textContent = "צריך להזין שם פרטי ושם משפחה כדי להצטרף.";
  const input =
    errorNode.closest("form")?.querySelector('input[name="displayName"]') ??
    document.querySelector('[data-action="profile-name"]');
  input?.focus({ preventScroll: true });
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
