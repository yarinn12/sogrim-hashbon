export const EVENT_ACTIVITY_LIMIT = 100;

const EVENT_ACTIVITY_KINDS = new Set([
  "event-created",
  "event-closed",
  "event-reopened",
  "expense-created",
  "expense-updated",
  "expense-deleted",
  "participant-added",
  "participant-removed",
  "participant-restored",
  "participant-left",
  "transfer-paid",
  "transfer-pending"
]);
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function createEventActivityEntry(input) {
  if (!input || typeof input !== "object") return null;

  const id = cleanIdentifier(input.id);
  const kind = cleanText(input.kind, 48);
  const occurredAt = validIsoTimestamp(input.occurredAt);
  if (!id || !EVENT_ACTIVITY_KINDS.has(kind) || !occurredAt) return null;

  return compactObject({
    id,
    kind,
    occurredAt,
    actorParticipantId: cleanIdentifier(input.actorParticipantId),
    subjectParticipantId: cleanIdentifier(input.subjectParticipantId),
    fromParticipantId: cleanIdentifier(input.fromParticipantId),
    toParticipantId: cleanIdentifier(input.toParticipantId),
    entityId: cleanIdentifier(input.entityId),
    label: cleanText(input.label, 80)
  });
}

export function appendEventActivity(event, input, limit = EVENT_ACTIVITY_LIMIT) {
  if (!event || typeof event !== "object") return event;
  const entry = createEventActivityEntry(input);
  if (!entry) return event;

  return {
    ...event,
    activityLog: mergeEventActivityLogs(event.activityLog, [entry], limit)
  };
}

export function mergeEventActivityLogs(
  remoteEntries,
  localEntries,
  limit = EVENT_ACTIVITY_LIMIT
) {
  const byId = new Map();

  for (const rawEntry of [
    ...arrayOrEmpty(remoteEntries),
    ...arrayOrEmpty(localEntries)
  ]) {
    const entry = createEventActivityEntry(rawEntry);
    if (!entry) continue;

    const existing = byId.get(entry.id);
    if (
      !existing ||
      Date.parse(entry.occurredAt) >= Date.parse(existing.occurredAt)
    ) {
      byId.set(entry.id, entry);
    }
  }

  return [...byId.values()]
    .sort(
      (first, second) =>
        Date.parse(second.occurredAt) - Date.parse(first.occurredAt) ||
        second.id.localeCompare(first.id)
    )
    .slice(0, normalizeLimit(limit));
}

export function eventActivityEntries(event) {
  if (!event || typeof event !== "object") return [];
  const entries = mergeEventActivityLogs([], event.activityLog);
  const hasCreationEntry = entries.some(
    (entry) => entry.kind === "event-created"
  );
  const createdAt = validIsoTimestamp(event.createdAt);
  if (hasCreationEntry || !createdAt) return entries;

  const creationEntry = createEventActivityEntry({
    id: syntheticCreationId(event.id),
    kind: "event-created",
    actorParticipantId: event.createdByParticipantId,
    occurredAt: createdAt
  });

  return creationEntry
    ? mergeEventActivityLogs(entries, [creationEntry])
    : entries;
}

function syntheticCreationId(eventId) {
  const safeEventId = cleanText(eventId, 96).replace(/[^A-Za-z0-9_-]/g, "");
  return `activity-created-${safeEventId || "event"}`.slice(0, 128);
}

function validIsoTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return "";
  }
  return new Date(value).toISOString();
}

function cleanText(value, limit) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().slice(0, limit)
    : "";
}

function cleanIdentifier(value) {
  const identifier = cleanText(value, 128);
  return SAFE_IDENTIFIER_PATTERN.test(identifier) ? identifier : "";
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, nestedValue]) => nestedValue !== "")
  );
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLimit(value) {
  return Number.isInteger(value) && value > 0
    ? Math.min(value, EVENT_ACTIVITY_LIMIT)
    : EVENT_ACTIVITY_LIMIT;
}
