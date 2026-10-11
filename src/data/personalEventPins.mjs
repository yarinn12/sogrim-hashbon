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
  if (!updates) return loadPersonalEventPins(participantId, storage);
  return new Set(Object.entries(updates)
    .filter(([eventId, update]) => SAFE_EVENT_ID.test(eventId) && validPinUpdate(update) && update.pinned)
    .map(([eventId]) => eventId));
}

export function migrateLegacyAccountPins(state, storage) {
  const participantId = accountParticipantId(state);
  if (!participantId || pinUpdatesForOwner(state.personalEventPinPreferences, participantId)) return state;
  const legacyPins = parsePins((storage ?? globalThis.localStorage).getItem(personalEventPinsKey(participantId)));
  const updates = Object.fromEntries(
    [...legacyPins].filter((id) => SAFE_EVENT_ID.test(id)).map((id) => [
      id, { pinned: true, updatedAt: LEGACY_PIN_TIMESTAMP }
    ])
  );
  if (!Object.keys(updates).length) return state;
  return {
    ...state,
    personalEventPinPreferences: { ownerParticipantId: participantId, updates }
  };
}

export function updateAccountEventPin(state, eventId, pinned, storage, now = Date.now()) {
  const participantId = accountParticipantId(state);
  const id = typeof eventId === "string" ? eventId.trim() : "";
  if (!participantId || !SAFE_EVENT_ID.test(id)) throw new Error("Account event pin identity is missing or invalid");
  const existing = pinUpdatesForOwner(state.personalEventPinPreferences, participantId);
  // A failed migration read must never become an empty cloud preference.
  const migrated = existing ? state : migrateLegacyAccountPins(state, storage);
  const updates = existing ?? pinUpdatesForOwner(migrated.personalEventPinPreferences, participantId) ?? {};
  const previousTime = Date.parse(updates[id]?.updatedAt);
  const updatedAt = new Date(Math.max(
    Number.isFinite(Number(now)) ? Number(now) : Date.now(),
    Number.isFinite(previousTime) ? previousTime + 1 : 0
  )).toISOString();
  return {
    ...state,
    personalEventPinPreferences: {
      ownerParticipantId: participantId,
      updates: { ...updates, [id]: { pinned: Boolean(pinned), updatedAt } }
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
    const remoteTime = validPinUpdate(remoteUpdate) ? Date.parse(remoteUpdate.updatedAt) : -1;
    const localTime = validPinUpdate(localUpdate) ? Date.parse(localUpdate.updatedAt) : -1;
    if (remoteTime < 0 && localTime < 0) continue;
    // An unpin wins an exact timestamp tie, avoiding accidental resurrection.
    const selected = localTime > remoteTime ? localUpdate
      : remoteTime > localTime ? remoteUpdate
      : localUpdate?.pinned === false ? localUpdate : remoteUpdate;
    merged[id] = { pinned: selected.pinned, updatedAt: selected.updatedAt };
  }
  return { ownerParticipantId: participantId, updates: merged };
}

export function pinnedEventsFirst(events, pinnedIds) {
  return [
    ...events.filter(event => pinnedIds.has(event.id)),
    ...events.filter(event => !pinnedIds.has(event.id))
  ];
}
