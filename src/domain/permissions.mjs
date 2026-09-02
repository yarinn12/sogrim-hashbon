export function eventAdminIds(state, event) {
  if (event.adminIdsScopedToEvent === true && event.adminIds?.length) {
    return event.adminIds;
  }

  const group = state.groups.find((item) => item.id === event.groupId);
  if (group?.adminIds?.length) return group.adminIds;

  if (event.adminIds?.length) return event.adminIds;

  return event.createdByParticipantId ? [event.createdByParticipantId] : [];
}

export function canManageEventSettings(state, event, participantId) {
  return (
    Boolean(participantId) &&
    (event.participantIds ?? []).includes(participantId) &&
    !event.inactiveParticipantIds?.includes(participantId) &&
    eventAdminIds(state, event).includes(participantId)
  );
}

export function canEditEvent(state, event, participantId) {
  if (
    !participantId ||
    !(event.participantIds ?? []).includes(participantId) ||
    event.locked ||
    event.inactiveParticipantIds?.includes(participantId)
  ) {
    return false;
  }
  if (!event.adminsCanEditOnly) return true;

  return canManageEventSettings(state, event, participantId);
}

export function canAddEventParticipant(state, event, participantId) {
  return canEditEvent(state, event, participantId);
}
