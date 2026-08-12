export function applyLocalParticipantId(state, localParticipantId) {
  const participantId = participantExists(state, localParticipantId)
    ? localParticipantId
    : participantExists(state, state.currentParticipantId)
      ? state.currentParticipantId
      : state.participants[0]?.id ?? "";

  return {
    ...state,
    currentParticipantId: participantId
  };
}

export function toSharedState(state) {
  return {
    ...state,
    currentParticipantId: state.participants[0]?.id ?? state.currentParticipantId ?? ""
  };
}

export function hasSharedStateChanged(previousState, nextState) {
  return JSON.stringify(toSharedState(previousState)) !== JSON.stringify(toSharedState(nextState));
}

function participantExists(state, participantId) {
  return Boolean(
    participantId &&
      state.participants?.some((participant) => participant.id === participantId)
  );
}
