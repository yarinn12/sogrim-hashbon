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
  window.location.replace(buildEventInviteUrl(window.location.href, context.eventId));
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
