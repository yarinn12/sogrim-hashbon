export const PENDING_EVENT_NOTIFICATIONS_STORAGE_KEY = "settle-friends-pending-event-notifications";
const KINDS = new Set(["expense-created", "participant-joined", "event-closed"]);

export function pendingEventNotificationKey(entry) {
  return JSON.stringify([entry.ownerUserId, entry.eventId, entry.activityId, entry.kind]);
}

export function loadPendingEventNotifications(storage = globalThis.localStorage, ownerUserId = "") {
  try {
    const parsed = JSON.parse(storage?.getItem?.(PENDING_EVENT_NOTIFICATIONS_STORAGE_KEY) || "[]");
    return (Array.isArray(parsed) ? parsed : []).map(normalize).filter(entry =>
      entry && (!ownerUserId || entry.ownerUserId === ownerUserId));
  } catch {
    return [];
  }
}

export function rememberPendingEventNotification(entry, storage = globalThis.localStorage) {
  const normalized = normalize(entry);
  if (!normalized) return false;
  const entries = loadPendingEventNotifications(storage);
  const key = pendingEventNotificationKey(normalized);
  const existing = entries.find(item => pendingEventNotificationKey(item) === key);
  // Preserve the first intent and any cloud acknowledgement across retries.
  if (existing) normalized.confirmed ||= existing.confirmed;
  return save([...entries.filter(item => pendingEventNotificationKey(item) !== key), {
    ...normalized, queuedAt: existing?.queuedAt || normalized.queuedAt
  }], storage);
}

export function forgetPendingEventNotification(entry, storage = globalThis.localStorage) {
  const normalized = normalize(entry);
  if (!normalized) return false;
  const key = pendingEventNotificationKey(normalized);
  return save(loadPendingEventNotifications(storage).filter(item => pendingEventNotificationKey(item) !== key), storage);
}

function save(entries, storage) {
  try {
    if (typeof storage?.setItem !== "function" || typeof storage?.removeItem !== "function") return false;
    if (entries.length) storage.setItem(PENDING_EVENT_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(entries));
    else storage.removeItem(PENDING_EVENT_NOTIFICATIONS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function normalize(entry) {
  const identifiers = [entry?.ownerUserId, entry?.eventId, entry?.activityId]
    .map(value => String(value ?? "").trim());
  if (identifiers.some(value => !value || value.length > 200) || !KINDS.has(entry?.kind)) return null;
  return {
    ownerUserId: identifiers[0], eventId: identifiers[1], activityId: identifiers[2], kind: entry.kind,
    confirmed: entry.confirmed === true,
    queuedAt: Number.isFinite(Date.parse(entry.queuedAt)) ? new Date(entry.queuedAt).toISOString() : new Date().toISOString()
  };
}
