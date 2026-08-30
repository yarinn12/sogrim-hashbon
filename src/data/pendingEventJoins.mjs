export const PENDING_EVENT_JOINS_STORAGE_KEY =
  "settle-friends-pending-event-joins";

const MAX_PENDING_EVENT_JOINS = 24;
const MAX_IDENTIFIER_LENGTH = 200;

export function loadPendingEventJoins(
  storage = globalThis.localStorage,
  ownerUserId = ""
) {
  const owner = normalizeIdentifier(ownerUserId);
  let parsed;
  try {
    parsed = JSON.parse(storage?.getItem?.(PENDING_EVENT_JOINS_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
  const entries = Array.isArray(parsed)
    ? parsed.map(normalizeEntry).filter(Boolean)
    : [];
  return owner ? entries.filter((entry) => entry.ownerUserId === owner) : entries;
}

export function rememberPendingEventJoin(entry, storage = globalThis.localStorage) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return false;
  const entries = loadPendingEventJoins(storage).filter(
    (item) => pendingEventJoinKey(item) !== pendingEventJoinKey(normalized)
  );
  entries.push(normalized);
  return saveEntries(entries.slice(-MAX_PENDING_EVENT_JOINS), storage);
}

export function forgetPendingEventJoin(entry, storage = globalThis.localStorage) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return false;
  const key = pendingEventJoinKey(normalized);
  return saveEntries(
    loadPendingEventJoins(storage).filter(
      (item) => pendingEventJoinKey(item) !== key
    ),
    storage
  );
}

export function markPendingEventJoinAttempt(
  entry,
  storage = globalThis.localStorage,
  attemptedAt = new Date().toISOString()
) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return false;
  const current = loadPendingEventJoins(storage).find(
    (item) => pendingEventJoinKey(item) === pendingEventJoinKey(normalized)
  ) ?? normalized;
  return rememberPendingEventJoin(
    {
      ...current,
      attempts: Math.min(1000, current.attempts + 1),
      lastAttemptAt: normalizeTimestamp(attemptedAt)
    },
    storage
  );
}

function normalizeEntry(entry) {
  const ownerUserId = normalizeIdentifier(entry?.ownerUserId);
  const eventId = normalizeIdentifier(entry?.eventId);
  if (!ownerUserId || !eventId) return null;
  const rawQueuedAt = String(entry?.queuedAt ?? "").trim();
  const queuedAt = rawQueuedAt ? normalizeTimestamp(rawQueuedAt) : new Date().toISOString();
  if (!queuedAt) return null;
  return {
    ownerUserId,
    eventId,
    queuedAt,
    attempts: Math.max(0, Math.min(1000, Number(entry?.attempts) || 0)),
    lastAttemptAt: normalizeTimestamp(entry?.lastAttemptAt)
  };
}

function normalizeIdentifier(value) {
  const identifier = String(value ?? "").trim();
  return identifier && identifier.length <= MAX_IDENTIFIER_LENGTH ? identifier : "";
}

function normalizeTimestamp(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function pendingEventJoinKey(entry) {
  return `${entry.ownerUserId}\u0000${entry.eventId}`;
}

function saveEntries(entries, storage) {
  try {
    if (entries.length) {
      storage?.setItem?.(PENDING_EVENT_JOINS_STORAGE_KEY, JSON.stringify(entries));
    } else {
      storage?.removeItem?.(PENDING_EVENT_JOINS_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}
