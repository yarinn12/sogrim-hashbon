export function normalizeProfileName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function isFullProfileName(value) {
  return normalizeProfileName(value).split(" ").filter(Boolean).length >= 2;
}

export function ensureNamedParticipant(state, profile, eventId = "") {
  const displayName = normalizeProfileName(profile?.displayName);
  if (!isFullProfileName(displayName)) return state;

  const existingParticipant = findExistingParticipant(state, profile, displayName);
  const participant = existingParticipant ? mergeParticipantProfile(existingParticipant, profile, displayName) : {
    id: profile.id,
    displayName,
    kind: "user",
    ...authFields(profile)
  };

  const participants = existingParticipant
    ? state.participants.map((item) => (item.id === participant.id ? participant : item))
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

function findExistingParticipant(state, profile, displayName) {
  return (
    state.participants.find((participant) => participant.id === profile?.id) ??
    state.participants.find((participant) => sameAuth(participant, profile)) ??
    state.participants.find((participant) => sameName(participant.displayName, displayName))
  );
}

function mergeParticipantProfile(participant, profile, displayName) {
  return {
    ...participant,
    displayName,
    kind: participant.kind ?? "user",
    ...authFields(profile)
  };
}

function sameAuth(participant, profile) {
  return (
    profile?.authProvider === "google" &&
    participant.authProvider === "google" &&
    Boolean(profile.authSubject) &&
    participant.authSubject === profile.authSubject
  );
}

function authFields(profile) {
  if (profile?.authProvider !== "google" || !profile.authSubject) return {};

  return {
    authProvider: "google",
    authSubject: String(profile.authSubject),
    email: String(profile.email ?? "").trim().toLowerCase()
  };
}
