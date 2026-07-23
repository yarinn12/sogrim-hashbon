import { normalizeEventType } from "./eventTypes.mjs";
import { normalizeCurrency } from "./currencies.mjs";
import {
  isSafeSharedIdentifier,
  validateSharedStateIdentifiers
} from "./sharedStateMerge.mjs";
import {
  buildCompactInviteUrl,
  parseCompactInviteUrl
} from "./compactInvite.mjs";

const INVITE_SNAPSHOT_PARAM = "invite";
const INVITE_SPACE_PARAM = "space";
const INVITE_SPACE_KEY_PARAM = "key";

export function buildEventInviteUrl(currentUrl, eventId, inviteSnapshot = null, options = {}) {
  assertSafeInviteIdentifier(eventId, "eventId");
  if (options.compact && options.spaceId && options.spaceKey) {
    return buildCompactInviteUrl(currentUrl, eventId, options.spaceId, options.spaceKey);
  }

  const url = new URL(currentUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("event", eventId);

  if (options.spaceId) {
    assertSafeInviteIdentifier(options.spaceId, "spaceId");
    url.searchParams.set(INVITE_SPACE_PARAM, options.spaceId);
  }

  if (options.spaceKey) {
    assertSafeInviteIdentifier(options.spaceKey, "spaceKey");
    url.searchParams.set(INVITE_SPACE_KEY_PARAM, options.spaceKey);
  }

  const normalizedSnapshot = normalizeInviteSnapshot(inviteSnapshot);
  if (inviteSnapshot !== null && inviteSnapshot !== undefined && !normalizedSnapshot) {
    throw new TypeError("Invalid invite snapshot.");
  }
  if (normalizedSnapshot) {
    url.searchParams.set(INVITE_SNAPSHOT_PARAM, JSON.stringify(normalizedSnapshot));
  }

  return url.toString();
}

export function parseInviteEventId(urlValue) {
  try {
    const url = new URL(urlValue);
    const eventId = url.searchParams.get("event");
    if (isSafeSharedIdentifier(eventId)) return eventId;
    return parseCompactInviteUrl(url)?.eventId ?? null;
  } catch {
    return null;
  }
}

export function parseInviteSnapshot(urlValue) {
  try {
    const url = new URL(urlValue);
    const rawSnapshot = url.searchParams.get(INVITE_SNAPSHOT_PARAM);
    if (!rawSnapshot) return null;
    return normalizeInviteSnapshot(JSON.parse(rawSnapshot));
  } catch {
    return null;
  }
}

export function buildEventInviteSnapshot(state, eventId) {
  if (!isSafeSharedIdentifier(eventId)) return null;
  const event = state.events?.find((item) => item.id === eventId);
  if (!event) return null;

  const referencedParticipantIds = eventReferencedParticipantIds(event);
  const participants = (state.participants ?? [])
    .filter((participant) => referencedParticipantIds.has(participant.id))
    .map((participant) => ({
      id: String(participant.id),
      displayName: String(participant.displayName),
      kind: participant.kind === "guest" ? "guest" : "user"
    }));

  return normalizeInviteSnapshot({
    version: 2,
    participants,
    groups: [],
    event: {
      id: event.id,
      name: event.name,
      eventType: normalizeEventType(event.eventType),
      currency: normalizeCurrency(event.currency),
      participantIds: event.participantIds
    }
  });
}

export function mergeInviteSnapshotIntoState(state, inviteSnapshot) {
  const snapshot = normalizeInviteSnapshot(inviteSnapshot);
  if (!snapshot) return state;
  if ((state.deletedEvents ?? []).some((item) => item.id === snapshot.event.id)) {
    return state;
  }

  const existingParticipantIds = new Set((state.participants ?? []).map((participant) => participant.id));
  const existingGroupIds = new Set((state.groups ?? []).map((group) => group.id));
  const eventExists = (state.events ?? []).some((event) => event.id === snapshot.event.id);

  return {
    ...state,
    participants: [
      ...(state.participants ?? []),
      ...snapshot.participants.filter((participant) => !existingParticipantIds.has(participant.id))
    ],
    groups: [
      ...(state.groups ?? []),
      ...snapshot.groups.filter((group) => !existingGroupIds.has(group.id))
    ],
    events: eventExists
      ? state.events.map((event) =>
          event.id === snapshot.event.id ? mergeInviteEvent(event, snapshot.event) : event
        )
      : [snapshot.event, ...(state.events ?? [])]
  };
}

function mergeInviteEvent(existingEvent, snapshotEvent) {
  return {
    ...existingEvent,
    participantIds: uniqueIds([...(existingEvent.participantIds ?? []), ...snapshotEvent.participantIds]),
    adminIds: existingEvent.adminIds ?? [],
    expenses: existingEvent.expenses ?? [],
    transfers: existingEvent.transfers ?? []
  };
}

function normalizeInviteSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  if (![1, 2].includes(snapshot.version)) return null;
  if (
    ("participants" in snapshot && !Array.isArray(snapshot.participants)) ||
    ("groups" in snapshot && !Array.isArray(snapshot.groups))
  ) {
    return null;
  }

  const participants = snapshot.participants ?? [];
  const groups = snapshot.groups ?? [];
  const identifierErrors = validateSharedStateIdentifiers(
    {
      currentParticipantId: "",
      participants,
      groups,
      events: [snapshot.event]
    },
    "inviteSnapshot"
  );
  if (identifierErrors.length) return null;

  const event = normalizeEvent(snapshot.event);
  if (!event) return null;
  const normalizedParticipants = participants.map(normalizeParticipant);
  const normalizedGroups = groups.map(normalizeGroup);
  if (
    normalizedParticipants.some((participant) => !participant) ||
    normalizedGroups.some((group) => !group)
  ) {
    return null;
  }

  return {
    version: 2,
    participants: normalizedParticipants,
    groups: normalizedGroups,
    event
  };
}

function normalizeEvent(event) {
  if (!isSafeSharedIdentifier(event?.id)) return null;

  return {
    id: event.id,
    name: String(event.name ?? "אירוע"),
    eventType: normalizeEventType(event.eventType),
    currency: normalizeCurrency(event.currency),
    participantIds: uniqueIds(event.participantIds),
    adminIds: [],
    createdByParticipantId: "",
    adminsCanEditOnly: true,
    locked: true,
    expenses: [],
    transfers: [],
    invitePreview: true
  };
}

function normalizeParticipant(participant) {
  if (!isSafeSharedIdentifier(participant?.id) || !participant?.displayName) return null;

  return {
    id: participant.id,
    displayName: String(participant.displayName),
    kind: participant.kind === "guest" ? "guest" : "user"
  };
}

function normalizeGroup(group) {
  if (!isSafeSharedIdentifier(group?.id)) return null;

  return {
    id: group.id,
    name: String(group.name ?? "קבוצה"),
    memberIds: uniqueIds(group.memberIds),
    adminIds: []
  };
}

function eventReferencedParticipantIds(event) {
  const ids = new Set();
  addIds(ids, event.participantIds);
  addIds(ids, event.adminIds);
  if (event.createdByParticipantId) ids.add(event.createdByParticipantId);

  for (const expense of event.expenses ?? []) {
    if (expense.createdByParticipantId) ids.add(expense.createdByParticipantId);
    addIds(ids, expense.sharedByParticipantIds);
    addIds(ids, (expense.payers ?? []).map((payer) => payer.participantId));
  }

  for (const transfer of event.transfers ?? []) {
    if (transfer.fromParticipantId) ids.add(transfer.fromParticipantId);
    if (transfer.toParticipantId) ids.add(transfer.toParticipantId);
    if (transfer.markedPaidByParticipantId) ids.add(transfer.markedPaidByParticipantId);
  }

  return ids;
}

function addIds(target, ids) {
  for (const id of ids ?? []) {
    if (id) target.add(id);
  }
}

function uniqueIds(ids) {
  return [...new Set((ids ?? []).filter(Boolean))];
}

function assertSafeInviteIdentifier(value, label) {
  if (!isSafeSharedIdentifier(value)) {
    throw new TypeError(`${label} must be a safe identifier.`);
  }
}
