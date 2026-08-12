export function markParticipantMembershipChanges(
  event,
  participantIds,
  updatedAt = new Date().toISOString()
) {
  const timestamps = {
    ...objectOrEmpty(event?.membershipUpdatedAtByParticipant)
  };
  for (const participantId of new Set(participantIds ?? [])) {
    if (participantId) timestamps[participantId] = updatedAt;
  }
  return timestamps;
}

export function initializeParticipantMembership(
  participantIds,
  createdAt = new Date().toISOString()
) {
  return Object.fromEntries(
    [...new Set(participantIds ?? [])]
      .filter(Boolean)
      .map((participantId) => [participantId, createdAt])
  );
}

export function isActiveEventParticipant(event, participantId) {
  if (!participantId) return false;
  return (
    (event?.participantIds ?? []).includes(participantId) &&
    !(event?.inactiveParticipantIds ?? []).includes(participantId)
  );
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
