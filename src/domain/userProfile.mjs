export function normalizeProfileName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function ensureNamedParticipant(state, profile, eventId = "") {
  const displayName = normalizeProfileName(profile?.displayName);
  if (!displayName) return state;

  const existingParticipant = state.participants.find(
    (participant) => sameName(participant.displayName, displayName)
  );
  const participant = existingParticipant ?? {
    id: profile.id,
    displayName,
    kind: "user"
  };

  const participants = existingParticipant
    ? state.participants
    : [...state.participants, participant];
  const events = eventId
    ? state.events.map((event) =>
        event.id === eventId && !event.participantIds.includes(participant.id)
          ? { ...event, participantIds: [...event.participantIds, participant.id] }
          : event
      )
    : state.events;

  return {
    ...state,
    currentParticipantId: participant.id,
    participants,
    events
  };
}

function sameName(left, right) {
  return normalizeProfileName(left).toLocaleLowerCase() ===
    normalizeProfileName(right).toLocaleLowerCase();
}
