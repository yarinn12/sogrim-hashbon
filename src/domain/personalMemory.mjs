export function visibleEventsForParticipant(state, participantId) {
  if (!participantId) return [];

  return (state.events ?? []).filter((event) =>
    eventBelongsToParticipant(event, participantId)
  );
}

export function visibleGroupsForParticipant(state, participantId) {
  if (!participantId) return [];

  return (state.groups ?? []).filter(
    (group) =>
      !group.archived &&
      (group.memberIds?.includes(participantId) ||
        group.adminIds?.includes(participantId))
  );
}

export function participantCandidatesForParticipant(state, participantId) {
  if (!participantId) return [];

  const allowedIds = new Set([participantId]);
  for (const contact of state.friendContacts ?? []) {
    if (contact?.active === true && contact.participantId) {
      allowedIds.add(contact.participantId);
    }
  }
  for (const event of state.events ?? []) {
    if (!eventManagedByParticipant(event, participantId)) continue;
    for (const id of event.participantIds ?? []) allowedIds.add(id);
  }
  for (const group of state.groups ?? []) {
    if (!group.adminIds?.includes(participantId)) continue;
    for (const id of group.memberIds ?? []) allowedIds.add(id);
  }

  return (state.participants ?? []).filter((participant) =>
    allowedIds.has(participant.id)
  );
}

function eventManagedByParticipant(event, participantId) {
  if (event.inactiveParticipantIds?.includes(participantId)) return false;
  return Boolean(
    event.createdByParticipantId === participantId ||
      event.adminIds?.includes(participantId)
  );
}

function eventBelongsToParticipant(event, participantId) {
  if (event.inactiveParticipantIds?.includes(participantId)) return false;
  return Boolean(
    event.participantIds?.includes(participantId) ||
      event.adminIds?.includes(participantId) ||
      event.createdByParticipantId === participantId
  );
}
