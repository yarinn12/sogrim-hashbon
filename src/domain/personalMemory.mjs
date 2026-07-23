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

function eventBelongsToParticipant(event, participantId) {
  return Boolean(
    event.participantIds?.includes(participantId) ||
      event.adminIds?.includes(participantId) ||
      event.createdByParticipantId === participantId
  );
}
