import {
  normalizeAvatarImage,
  normalizeAvatarPreset
} from "./avatarPresets.mjs";
import { markParticipantMembershipChanges } from "./eventMembership.mjs";

export function normalizeProfileName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function isFullProfileName(value) {
  return normalizeProfileName(value).split(" ").filter(Boolean).length >= 2;
}

export function normalizeProfileUpdatedAt(value) {
  const time = new Date(String(value ?? "")).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
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
        profileUpdatedAt:
          normalizeProfileUpdatedAt(profile?.profileUpdatedAt) ||
          new Date().toISOString()
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
  const previousProfileUpdatedAt = normalizeProfileUpdatedAt(
    participant?.profileUpdatedAt
  );
  const incomingProfileUpdatedAt = normalizeProfileUpdatedAt(
    profile?.profileUpdatedAt
  );
  const nextParticipant = {
    ...participant,
    displayName,
    kind: participant.kind ?? "user",
    ...avatarFields(profile),
    ...authFields(profile)
  };
  if (participantProfileChanged(participant, nextParticipant)) {
    nextParticipant.profileUpdatedAt =
      incomingProfileUpdatedAt || new Date().toISOString();
  } else if (
    incomingProfileUpdatedAt &&
    Date.parse(incomingProfileUpdatedAt) > Date.parse(previousProfileUpdatedAt || "1970-01-01")
  ) {
    nextParticipant.profileUpdatedAt = incomingProfileUpdatedAt;
  }
  return nextParticipant;
}

function participantProfileChanged(previous, next) {
  return [
    "displayName",
    "kind",
    "avatarPreset",
    "avatarImage",
    "avatarImageUpdatedAt",
    "authProvider",
    "authSubject",
    "email"
  ].some((field) => (previous?.[field] ?? "") !== (next?.[field] ?? ""));
}

function avatarFields(profile) {
  const avatarPreset = normalizeAvatarPreset(profile?.avatarPreset);
  const avatarImage = normalizeAvatarImage(profile?.avatarImage);
  const avatarImageUpdatedAt = normalizeProfileUpdatedAt(
    profile?.avatarImageUpdatedAt ||
      (avatarImage ? profile?.profileUpdatedAt : "")
  );
  return {
    ...(avatarPreset ? { avatarPreset } : {}),
    ...(Object.hasOwn(profile ?? {}, "avatarImage")
      ? { avatarImage }
      : avatarImage
        ? { avatarImage }
        : {}),
    ...(avatarImageUpdatedAt ? { avatarImageUpdatedAt } : {})
  };
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
