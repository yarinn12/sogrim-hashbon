import {
  normalizeParticipantDisplayName,
  participantHasConnectedAccount
} from "./participantIdentity.mjs";

function participantIsActive(event, participantId) {
  return Boolean(
    event?.participantIds?.includes(participantId) &&
      !(event?.inactiveParticipantIds ?? []).includes(participantId)
  );
}

function connectedIdentityKey(participant) {
  const participantId = String(participant?.id ?? "").trim();
  if (participantId.startsWith("account-") && participantId.length > 8) {
    return participantId;
  }

  const provider = String(participant?.authProvider ?? "").trim().toLowerCase();
  const subject = String(participant?.authSubject ?? "").trim();
  return provider && subject ? `${provider}:${subject}` : "";
}

export function createParticipantAccountLinkSnapshot({ event, source, target }) {
  if (
    !event?.id ||
    !source?.id ||
    !target?.id ||
    source.id === target.id ||
    participantHasConnectedAccount(source) ||
    !participantHasConnectedAccount(target) ||
    !participantIsActive(event, source.id) ||
    !participantIsActive(event, target.id)
  ) {
    return null;
  }

  const sourceDisplayName = normalizeParticipantDisplayName(source.displayName);
  const targetDisplayName = normalizeParticipantDisplayName(target.displayName);
  const targetIdentityKey = connectedIdentityKey(target);
  if (!sourceDisplayName || !targetDisplayName || !targetIdentityKey) return null;

  return Object.freeze({
    eventId: event.id,
    sourceParticipantId: source.id,
    targetParticipantId: target.id,
    sourceDisplayName,
    targetDisplayName,
    targetIdentityKey
  });
}

export function participantAccountLinkSnapshotMatches(
  snapshot,
  { event, source, target }
) {
  if (!snapshot) return false;
  const current = createParticipantAccountLinkSnapshot({ event, source, target });
  return Boolean(
    current &&
      current.eventId === snapshot.eventId &&
      current.sourceParticipantId === snapshot.sourceParticipantId &&
      current.targetParticipantId === snapshot.targetParticipantId &&
      current.sourceDisplayName === snapshot.sourceDisplayName &&
      current.targetDisplayName === snapshot.targetDisplayName &&
      current.targetIdentityKey === snapshot.targetIdentityKey
  );
}

export function participantAccountLinkRequestKey(snapshot) {
  if (!snapshot) return "";
  return [
    snapshot.eventId,
    snapshot.sourceParticipantId,
    snapshot.targetParticipantId,
    snapshot.targetIdentityKey
  ].join("|");
}
