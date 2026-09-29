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

export function pinnedEventsFirst(events, pinnedIds) {
  return [
    ...events.filter(event => pinnedIds.has(event.id)),
    ...events.filter(event => !pinnedIds.has(event.id))
  ];
}
