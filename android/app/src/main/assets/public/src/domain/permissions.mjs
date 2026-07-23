export function eventAdminIds(state, event) {
  const group = state.groups.find((item) => item.id === event.groupId);
  if (group?.adminIds?.length) return group.adminIds;

  if (event.adminIds?.length) return event.adminIds;

  return event.createdByParticipantId ? [event.createdByParticipantId] : [];
}

export function canManageEventSettings(state, event, participantId) {
  return eventAdminIds(state, event).includes(participantId);
}

export function canEditEvent(state, event, participantId) {
  if (event.locked) return false;
  if (!event.adminsCanEditOnly) return true;

  return canManageEventSettings(state, event, participantId);
}
