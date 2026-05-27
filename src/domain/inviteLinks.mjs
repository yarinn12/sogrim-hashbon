const INVITE_SNAPSHOT_PARAM = "invite";
const INVITE_SPACE_PARAM = "space";

export function buildEventInviteUrl(currentUrl, eventId, inviteSnapshot = null, options = {}) {
  const url = new URL(currentUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("event", eventId);

  if (options.spaceId) {
    url.searchParams.set(INVITE_SPACE_PARAM, String(options.spaceId));
  }

  const normalizedSnapshot = normalizeInviteSnapshot(inviteSnapshot);
  if (normalizedSnapshot) {
    url.searchParams.set(INVITE_SNAPSHOT_PARAM, JSON.stringify(normalizedSnapshot));
  }

  return url.toString();
}

export function parseInviteEventId(urlValue) {
  const url = new URL(urlValue);
  return url.searchParams.get("event");
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
  const event = state.events?.find((item) => item.id === eventId);
  if (!event) return null;

  const referencedParticipantIds = eventReferencedParticipantIds(event);
  const participants = (state.participants ?? [])
    .filter((participant) => referencedParticipantIds.has(participant.id))
    .map(clone);
  const groups = event.groupId
    ? (state.groups ?? []).filter((group) => group.id === event.groupId).map(clone)
    : [];

  return normalizeInviteSnapshot({
    version: 1,
    participants,
    groups,
    event: clone(event)
  });
}

export function mergeInviteSnapshotIntoState(state, inviteSnapshot) {
  const snapshot = normalizeInviteSnapshot(inviteSnapshot);
  if (!snapshot) return state;

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
    groupId: existingEvent.groupId || snapshotEvent.groupId,
    createdByParticipantId: existingEvent.createdByParticipantId || snapshotEvent.createdByParticipantId,
    participantIds: uniqueIds([...(existingEvent.participantIds ?? []), ...snapshotEvent.participantIds]),
    adminIds: uniqueIds([...(existingEvent.adminIds ?? []), ...snapshotEvent.adminIds]),
    expenses: mergeById(existingEvent.expenses, snapshotEvent.expenses),
    transfers: mergeById(existingEvent.transfers, snapshotEvent.transfers)
  };
}

function mergeById(existingItems = [], snapshotItems = []) {
  const existingIds = new Set(existingItems.map((item) => item.id).filter(Boolean));
  return [
    ...existingItems,
    ...snapshotItems.filter((item) => !existingIds.has(item.id))
  ];
}

function normalizeInviteSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const event = normalizeEvent(snapshot.event);
  if (!event) return null;

  return {
    version: 1,
    participants: Array.isArray(snapshot.participants)
      ? snapshot.participants.map(normalizeParticipant).filter(Boolean)
      : [],
    groups: Array.isArray(snapshot.groups)
      ? snapshot.groups.map(normalizeGroup).filter(Boolean)
      : [],
    event
  };
}

function normalizeEvent(event) {
  if (!event?.id) return null;

  return {
    ...clone(event),
    id: String(event.id),
    name: String(event.name ?? "אירוע"),
    participantIds: uniqueIds(event.participantIds),
    adminIds: uniqueIds(event.adminIds),
    expenses: Array.isArray(event.expenses) ? clone(event.expenses) : [],
    transfers: Array.isArray(event.transfers) ? clone(event.transfers) : []
  };
}

function normalizeParticipant(participant) {
  if (!participant?.id || !participant?.displayName) return null;

  return {
    ...clone(participant),
    id: String(participant.id),
    displayName: String(participant.displayName)
  };
}

function normalizeGroup(group) {
  if (!group?.id) return null;

  return {
    ...clone(group),
    id: String(group.id),
    name: String(group.name ?? "קבוצה"),
    memberIds: uniqueIds(group.memberIds),
    adminIds: uniqueIds(group.adminIds)
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
  return [...new Set((ids ?? []).filter(Boolean).map(String))];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
