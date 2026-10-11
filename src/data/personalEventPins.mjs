const STORAGE_PREFIX = "settle-friends-personal-event-pins-v1";

export function personalEventPinsKey(participantId) {
  const id = typeof participantId === "string" ? participantId.trim() : "";
  return id ? `${STORAGE_PREFIX}:${id}` : "";
}

function parsePins(raw) {
  try {
    const values = JSON.parse(raw || "[]");
    return new Set(Array.isArray(values)
      ? values.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean)
      : []);
  } catch { return new Set(); }
}

// Personal, device-local ordering, just like the personal event archive.
// Reading may degrade gracefully; a write must surface storage failures.
export function loadPersonalEventPins(participantId, storage) {
  const key = personalEventPinsKey(participantId);
  if (!key) return new Set();
  try { return parsePins((storage ?? globalThis.localStorage).getItem(key)); }
  catch { return new Set(); }
}

export function setPersonalEventPin(participantId, eventId, pinned, storage) {
  const key = personalEventPinsKey(participantId);
  const id = typeof eventId === "string" ? eventId.trim() : "";
  if (!key || !id) throw new Error("Event pin identity is missing");
  const target = storage ?? globalThis.localStorage;
  // Always read the latest value, including changes made by another tab.
  // A failed read must not be treated as an empty preference during a write.
  const ids = parsePins(target.getItem(key));
  if (pinned) ids.add(id); else ids.delete(id);
  target.setItem(key, JSON.stringify([...ids]));
  return ids;
}

// Account snapshots are private to their owner. Keep explicit unpin records so
// an older device cannot restore a pin when its offline snapshot is merged.
const LEGACY_PIN_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const SAFE_EVENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MIGRATION_RECEIPT_PREFIX = "settle-friends-personal-event-pins-migrated-v1";
const MAX_PIN_ANCESTORS = 64;

function migrationReceiptKey(participantId) {
  return `${MIGRATION_RECEIPT_PREFIX}:${participantId}`;
}

// A receipt is device-local and written only after the private workspace has
// acknowledged every migrated event. A failed upload must remain retryable.
export function pendingLegacyAccountPins(participantId, storage) {
  if (!participantId?.startsWith("account-")) return new Set();
  const target = storage ?? globalThis.localStorage;
  if (!target) return new Set();
  const legacy = parsePins(target.getItem(personalEventPinsKey(participantId)));
  const acknowledged = parsePins(target.getItem(migrationReceiptKey(participantId)));
  return new Set([...legacy].filter(id => SAFE_EVENT_ID.test(id) && !acknowledged.has(id)));
}

export function acknowledgeLegacyAccountPins(participantId, eventIds, storage) {
  if (!participantId?.startsWith("account-")) throw new Error("Account pin identity is missing");
  const target = storage ?? globalThis.localStorage;
  if (!target) throw new Error("Account pin storage is unavailable");
  const key = migrationReceiptKey(participantId);
  const acknowledged = parsePins(target.getItem(key));
  for (const id of eventIds) if (SAFE_EVENT_ID.test(id)) acknowledged.add(id);
  target.setItem(key, JSON.stringify([...acknowledged]));
}

function accountParticipantId(state) {
  const id = String(state?.currentParticipantId ?? "").trim();
  return id.startsWith("account-") ? id : "";
}

function pinUpdatesForOwner(preferences, participantId) {
  if (preferences?.ownerParticipantId !== participantId) return null;
  const updates = preferences.updates;
  return updates && typeof updates === "object" && !Array.isArray(updates)
    ? updates
    : {};
}

function validPinUpdate(update) {
  return typeof update?.pinned === "boolean" &&
    Number.isFinite(Date.parse(update?.updatedAt));
}

export function pinnedEventIdsForState(state, storage) {
  const participantId = accountParticipantId(state);
  if (!participantId) return loadPersonalEventPins(state?.currentParticipantId, storage);
  const updates = pinUpdatesForOwner(state.personalEventPinPreferences, participantId);
  const pinned = new Set(Object.entries(updates ?? {})
    .filter(([eventId, update]) => SAFE_EVENT_ID.test(eventId) && validPinUpdate(update) && update.pinned)
    .map(([eventId]) => eventId));
  try {
    for (const id of pendingLegacyAccountPins(participantId, storage)) {
      if (!validPinUpdate(updates?.[id])) pinned.add(id);
    }
  } catch { /* Keep confirmed cloud pins visible if device storage is unreadable. */ }
  return pinned;
}

export function migrateLegacyAccountPins(state, storage) {
  const participantId = accountParticipantId(state);
  if (!participantId) return state;
  const existing = pinUpdatesForOwner(state.personalEventPinPreferences, participantId) ?? {};
  const updates = { ...existing };
  let changed = false;
  for (const id of pendingLegacyAccountPins(participantId, storage)) {
    if (validPinUpdate(updates[id])) continue;
    updates[id] = { pinned: true, updatedAt: LEGACY_PIN_TIMESTAMP };
    changed = true;
  }
  if (!changed) return state;
  return {
    ...state,
    personalEventPinPreferences: { ownerParticipantId: participantId, updates }
  };
}

export function updateAccountEventPin(state, eventId, pinned, storage, now = Date.now()) {
  const participantId = accountParticipantId(state);
  const id = typeof eventId === "string" ? eventId.trim() : "";
  if (!participantId || !SAFE_EVENT_ID.test(id)) throw new Error("Account event pin identity is missing or invalid");
  // A failed migration read must never become an empty cloud preference.
  const migrated = migrateLegacyAccountPins(state, storage);
  const updates = pinUpdatesForOwner(migrated.personalEventPinPreferences, participantId) ?? {};
  const previousTime = Date.parse(updates[id]?.updatedAt);
  const updatedAt = new Date(Math.max(
    Number.isFinite(Number(now)) ? Number(now) : Date.now(),
    Number.isFinite(previousTime) ? previousTime + 1 : 0
  )).toISOString();
  return {
    ...state,
    personalEventPinPreferences: {
      ownerParticipantId: participantId,
      updates: { ...updates, [id]: {
        pinned: Boolean(pinned), updatedAt,
        mutationId: newMutationId(),
        ancestors: validPinUpdate(updates[id])
          ? [pinMutationId(updates[id]), ...validAncestors(updates[id])].slice(0, MAX_PIN_ANCESTORS)
          : []
      } }
    }
  };
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

function newMutationId() {
  return globalThis.crypto?.randomUUID?.() ??
    `random-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function pinMutationId(update) {
  return typeof update.mutationId === "string" && update.mutationId.length <= 128 && update.mutationId
    ? update.mutationId
    : `legacy:${update.pinned ? 1 : 0}:${update.updatedAt}`;
}

function validAncestors(update) {
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

export function pinnedEventsFirst(events, pinnedIds) {
  return [
    ...events.filter(event => pinnedIds.has(event.id)),
    ...events.filter(event => !pinnedIds.has(event.id))
  ];
}
