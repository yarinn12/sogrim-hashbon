import { normalizeAvatarPreset } from "./avatarPresets.mjs";
import { markParticipantMembershipChanges } from "./eventMembership.mjs";

export function normalizeProfileName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function isFullProfileName(value) {
  return normalizeProfileName(value).split(" ").filter(Boolean).length >= 2;
}

export function ensureNamedParticipant(
  state,
  profile,
  eventId = "",
  { reactivateInactive = true } = {}
) {
  const displayName = normalizeProfileName(profile?.displayName);
  if (!isFullProfileName(displayName)) return state;

  const existingParticipant = findExistingParticipant(state, profile);
  const participant = existingParticipant
    ? mergeParticipantProfile(existingParticipant, profile, displayName)
    : {
        id: profile.id,
        displayName,
        kind: "user",
        ...avatarFields(profile),
        ...authFields(profile),
        profileUpdatedAt: new Date().toISOString()
      };

  const participants = existingParticipant
    ? state.participants.map((item) => (item.id === participant.id ? participant : item))
    : [...state.participants, participant];
  const events = eventId
    ? state.events.map((event) => {
        if (event.id !== eventId) return event;
        const joinsEvent = !event.participantIds.includes(participant.id);
        const returnsToEvent = (event.inactiveParticipantIds ?? []).includes(
          participant.id
        );
        if (returnsToEvent && !reactivateInactive) return event;
        if (!joinsEvent && !returnsToEvent) return event;
        const membershipUpdatedAt = new Date().toISOString();

        return {
          ...event,
          participantIds: joinsEvent
            ? [...event.participantIds, participant.id]
            : event.participantIds,
          inactiveParticipantIds: (event.inactiveParticipantIds ?? []).filter(
            (participantId) => participantId !== participant.id
          ),
          membershipUpdatedAt,
          membershipUpdatedAtByParticipant:
            markParticipantMembershipChanges(
              event,
              [participant.id],
              membershipUpdatedAt
            )
        };
      })
    : state.events;

  return {
    ...state,
    currentParticipantId: participant.id,
    participants,
    events
  };
}

function findExistingParticipant(state, profile) {
  return (
    state.participants.find((participant) => participant.id === profile?.id) ??
    state.participants.find((participant) => sameAuth(participant, profile))
  );
}

function mergeParticipantProfile(participant, profile, displayName) {
  const nextParticipant = {
    ...participant,
    displayName,
    kind: participant.kind ?? "user",
    ...avatarFields(profile),
    ...authFields(profile)
  };
  if (participantProfileChanged(participant, nextParticipant)) {
    nextParticipant.profileUpdatedAt = new Date().toISOString();
  }
  return nextParticipant;
}

function participantProfileChanged(previous, next) {
  return [
    "displayName",
    "kind",
    "avatarPreset",
    "authProvider",
    "authSubject",
    "email"
  ].some((field) => (previous?.[field] ?? "") !== (next?.[field] ?? ""));
}

function avatarFields(profile) {
  const avatarPreset = normalizeAvatarPreset(profile?.avatarPreset);
  return avatarPreset ? { avatarPreset } : {};
}

function sameAuth(participant, profile) {
  return (
    ["google", "apple", "email"].includes(profile?.authProvider) &&
    ["google", "apple", "email"].includes(participant.authProvider) &&
    Boolean(profile.authSubject) &&
    participant.authProvider === profile.authProvider &&
    participant.authSubject === profile.authSubject
  );
}

function authFields(profile) {
  if (!["google", "apple", "email"].includes(profile?.authProvider) || !profile.authSubject) {
    return {};
  }

  return {
    authProvider: profile.authProvider,
    authSubject: String(profile.authSubject),
    email: String(profile.email ?? "").trim().toLowerCase()
  };
}
