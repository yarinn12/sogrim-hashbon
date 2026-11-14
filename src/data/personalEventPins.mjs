import { accountParticipantId, pinUpdatesForOwner, validPinUpdate, pinMutationId, validAncestors, SAFE_EVENT_ID, MAX_PIN_ANCESTORS } from "../domain/personalEventPinMerge.mjs";
export { mergeAccountEventPins } from "../domain/personalEventPinMerge.mjs";

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
const MIGRATION_RECEIPT_PREFIX = "settle-friends-personal-event-pins-migrated-v1";

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

function newMutationId() {
  return globalThis.crypto?.randomUUID?.() ??
    `random-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function pinnedEventsFirst(events, pinnedIds) {
  return [
    ...events.filter(event => pinnedIds.has(event.id)),
    ...events.filter(event => !pinnedIds.has(event.id))
  ];
}
