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
  return !jsonValuesEqual(
    toSharedState(previousState),
    toSharedState(nextState)
  );
}

function jsonValuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }
  if (typeof left !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]));
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => Object.hasOwn(right, key) && jsonValuesEqual(left[key], right[key])
    );
}

function participantExists(state, participantId) {
  return Boolean(
    participantId &&
      state.participants?.some((participant) => participant.id === participantId)
  );
}
