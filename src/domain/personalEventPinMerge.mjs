export const SAFE_EVENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const MAX_PIN_ANCESTORS = 64;

export function accountParticipantId(state) {
  const id = String(state?.currentParticipantId ?? "").trim();
  return id.startsWith("account-") ? id : "";
}

export function pinUpdatesForOwner(preferences, participantId) {
  if (preferences?.ownerParticipantId !== participantId) return null;
  const updates = preferences.updates;
  return updates && typeof updates === "object" && !Array.isArray(updates)
    ? updates
    : {};
}

export function validPinUpdate(update) {
  return typeof update?.pinned === "boolean" &&
    Number.isFinite(Date.parse(update?.updatedAt));
}


export function mergeAccountEventPins(remoteState, localState) {
  const participantId = accountParticipantId(localState);
  if (!participantId || accountParticipantId(remoteState) !== participantId) return null;
  const remote = pinUpdatesForOwner(remoteState.personalEventPinPreferences, participantId);
  const local = pinUpdatesForOwner(localState.personalEventPinPreferences, participantId);
  if (!remote && !local) return null;
  const merged = {};
  for (const id of new Set([...Object.keys(remote ?? {}), ...Object.keys(local ?? {})])) {
    if (!SAFE_EVENT_ID.test(id)) continue;
    const remoteUpdate = remote?.[id];
    const localUpdate = local?.[id];
    if (!validPinUpdate(remoteUpdate) && !validPinUpdate(localUpdate)) continue;
    const selected = selectPinUpdate(remoteUpdate, localUpdate);
    merged[id] = { ...selected };
  }
  return { ownerParticipantId: participantId, updates: merged };
}


export function pinMutationId(update) {
  return typeof update.mutationId === "string" && update.mutationId.length <= 128 && update.mutationId
    ? update.mutationId
    : `legacy:${update.pinned ? 1 : 0}:${update.updatedAt}`;
}

export function validAncestors(update) {
  return Array.isArray(update.ancestors)
    ? update.ancestors.filter(id => typeof id === "string" && id.length > 0 && id.length <= 128)
      .slice(0, MAX_PIN_ANCESTORS)
    : [];
}

function selectPinUpdate(remote, local) {
  if (!validPinUpdate(remote)) return local;
  if (!validPinUpdate(local)) return remote;
  const remoteId = pinMutationId(remote);
  const localId = pinMutationId(local);
  if (remoteId === localId) {
    return validAncestors(local).length > validAncestors(remote).length ? local : remote;
  }
  if (validAncestors(local).includes(remoteId)) return local;
  if (validAncestors(remote).includes(localId)) return remote;
  // Neither operation knows the other. Their real-time order is unknowable,
  // including for old timestamp-only records or truncated ancestry.
  if (local.pinned !== remote.pinned) return local.pinned ? remote : local;
  return localId > remoteId ? local : remote;
}

