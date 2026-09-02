export const PENDING_ACCOUNT_LINKS_STORAGE_KEY =
  "settle-friends-pending-account-links";

const MAX_PENDING_ACCOUNT_LINKS = 24;
export const MAX_PENDING_ACCOUNT_LINK_ATTEMPTS = 20;
const MAX_IDENTIFIER_LENGTH = 200;

export function pendingAccountLinkMissingEventShouldExpire(event, attempts = 0) {
  return (
    !event &&
    Number(attempts) >= MAX_PENDING_ACCOUNT_LINK_ATTEMPTS
  );
}

export function accountLinkIsConfirmed(
  sharedState,
  {
    eventId = "",
    sourceParticipantId = "",
    targetParticipantId = "",
    linkedAt = ""
  } = {}
) {
  const event = sharedState?.events?.find((item) => item?.id === eventId);
  if (!event || !sourceParticipantId || !targetParticipantId) return false;

  const link = (event.participantAccountLinks ?? []).find(
    (item) =>
      item?.sourceParticipantId === sourceParticipantId &&
      item?.targetParticipantId === targetParticipantId &&
      (!linkedAt || item?.linkedAt === linkedAt)
  );
  if (!link) return false;
  if (!(event.participantIds ?? []).includes(targetParticipantId)) return false;
  if ((event.participantIds ?? []).includes(sourceParticipantId)) return false;
  if ((event.inactiveParticipantIds ?? []).includes(targetParticipantId)) return false;

  return !eventReferencesParticipantOutsideLink(event, sourceParticipantId);
}

export function loadPendingAccountLinks(
  storage = globalThis.localStorage,
  ownerUserId = ""
) {
  const owner = normalizeIdentifier(ownerUserId);
  let parsed;
  try {
    parsed = JSON.parse(storage?.getItem?.(PENDING_ACCOUNT_LINKS_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
  const entries = Array.isArray(parsed)
    ? parsed.map(normalizeEntry).filter(Boolean)
    : [];
  return owner
    ? entries.filter((entry) => entry.ownerUserId === owner)
    : entries;
}

export function rememberPendingAccountLink(
  entry,
  storage = globalThis.localStorage
) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return false;
  const entries = loadPendingAccountLinks(storage).filter(
    (item) => pendingAccountLinkKey(item) !== pendingAccountLinkKey(normalized)
  );
  entries.push(normalized);
  return saveEntries(
    retainNewestEntriesForOwner(
      entries,
      normalized.ownerUserId,
      MAX_PENDING_ACCOUNT_LINKS
    ),
    storage
  );
}

export function forgetPendingAccountLink(
  entry,
  storage = globalThis.localStorage
) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return false;
  const key = pendingAccountLinkKey(normalized);
  return saveEntries(
    loadPendingAccountLinks(storage).filter(
      (item) => pendingAccountLinkKey(item) !== key
    ),
    storage
  );
}

export function markPendingAccountLinkAttempt(
  entry,
  storage = globalThis.localStorage,
  attemptedAt = new Date().toISOString()
) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return false;
  const current = loadPendingAccountLinks(storage).find(
    (item) => pendingAccountLinkKey(item) === pendingAccountLinkKey(normalized)
  ) ?? normalized;
  return rememberPendingAccountLink(
    {
      ...current,
      attempts: Math.min(1000, current.attempts + 1),
      lastAttemptAt: normalizeTimestamp(attemptedAt)
    },
    storage
  );
}

function eventReferencesParticipantOutsideLink(event, participantId) {
  if ((event.adminIds ?? []).includes(participantId)) return true;
  if (event.createdByParticipantId === participantId) return true;
  // A source membership timestamp is an intentional tombstone: it prevents a
  // stale device from reviving the offline identity after the account link.
  // It is historical merge protection, not an active participant reference.
  if (Object.hasOwn(event.participantAliases ?? {}, participantId)) return true;

  for (const expense of event.expenses ?? []) {
    if (
      expense?.createdByParticipantId === participantId ||
      (expense?.sharedByParticipantIds ?? []).includes(participantId) ||
      (expense?.payers ?? []).some((payer) => payer?.participantId === participantId)
    ) return true;
  }
  for (const transfer of event.transfers ?? []) {
    if (
      transfer?.fromParticipantId === participantId ||
      transfer?.toParticipantId === participantId ||
      transfer?.markedPaidByParticipantId === participantId
    ) return true;
  }
  for (const update of event.transferStatusUpdates ?? []) {
    if (update?.markedPaidByParticipantId === participantId) return true;
  }
  for (const activity of event.activityLog ?? []) {
    if (
      activity?.actorParticipantId === participantId ||
      activity?.subjectParticipantId === participantId ||
      activity?.fromParticipantId === participantId ||
      activity?.toParticipantId === participantId
    ) return true;
  }
  return false;
}

function normalizeEntry(entry) {
  const ownerUserId = normalizeIdentifier(entry?.ownerUserId);
  const eventId = normalizeIdentifier(entry?.eventId);
  const sourceParticipantId = normalizeIdentifier(entry?.sourceParticipantId);
  const targetParticipantId = normalizeIdentifier(entry?.targetParticipantId);
  const linkedAt = normalizeTimestamp(entry?.linkedAt);
  if (
    !ownerUserId ||
    !eventId ||
    !sourceParticipantId ||
    !targetParticipantId ||
    sourceParticipantId === targetParticipantId ||
    !linkedAt
  ) return null;
  return {
    ownerUserId,
    eventId,
    sourceParticipantId,
    targetParticipantId,
    linkedAt,
    queuedAt: normalizeTimestamp(entry?.queuedAt) || linkedAt,
    attempts: Math.max(0, Math.min(1000, Number(entry?.attempts) || 0)),
    lastAttemptAt: normalizeTimestamp(entry?.lastAttemptAt)
  };
}

function normalizeIdentifier(value) {
  const identifier = String(value ?? "").trim();
  return identifier && identifier.length <= MAX_IDENTIFIER_LENGTH
    ? identifier
    : "";
}

function normalizeTimestamp(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function pendingAccountLinkKey(entry) {
  return [
    entry.ownerUserId,
    entry.eventId,
    entry.sourceParticipantId,
    entry.targetParticipantId
  ].join("\u0000");
}

function retainNewestEntriesForOwner(entries, ownerUserId, limit) {
  let retainedForOwner = 0;
  return entries
    .slice()
    .reverse()
    .filter((entry) => {
      if (entry.ownerUserId !== ownerUserId) return true;
      retainedForOwner += 1;
      return retainedForOwner <= limit;
    })
    .reverse();
}

function saveEntries(entries, storage) {
  try {
    if (entries.length) {
      storage?.setItem?.(PENDING_ACCOUNT_LINKS_STORAGE_KEY, JSON.stringify(entries));
    } else {
      storage?.removeItem?.(PENDING_ACCOUNT_LINKS_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}
