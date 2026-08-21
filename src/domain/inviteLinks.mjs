import { normalizeEventType } from "./eventTypes.mjs";
import { normalizeCurrency } from "./currencies.mjs";
import {
  isSafeSharedIdentifier,
  validateSharedStateIdentifiers
} from "./sharedStateMerge.mjs";
import {
  buildCompactInviteUrl,
  parseCompactInviteUrl
} from "./compactInvite.mjs";
import { sanitizeParticipantAlias } from "./participantIdentity.mjs";
import { normalizeAvatarPreset } from "./avatarPresets.mjs";
import { normalizeReferralCode } from "./referralCodes.mjs";

const INVITE_SNAPSHOT_PARAM = "invite";
const INVITE_SPACE_PARAM = "space";
const INVITE_SPACE_KEY_PARAM = "key";
const INVITE_TOKEN_PARAM = "t";
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function buildEventInviteUrl(currentUrl, eventId, inviteSnapshot = null, options = {}) {
  assertSafeInviteIdentifier(eventId, "eventId");
  const referralCode = normalizeReferralCode(options.referralCode);
  const inviteToken = normalizeInviteToken(options.inviteToken);
  if (options.inviteToken && !inviteToken) {
    throw new TypeError("inviteToken must be a safe token.");
  }
  if (inviteToken) {
    const tokenUrl = new URL(currentUrl);
    tokenUrl.pathname = `/i/${encodeURIComponent(eventId)}/t/${encodeURIComponent(inviteToken)}`;
    tokenUrl.search = "";
    tokenUrl.hash = "";
    if (referralCode) tokenUrl.searchParams.set("ref", referralCode);
    return tokenUrl.toString();
  }

  if (options.compact && options.spaceId && options.spaceKey) {
    const compactBaseUrl = new URL(currentUrl);
    if (referralCode) compactBaseUrl.searchParams.set("ref", referralCode);
    return buildCompactInviteUrl(
      compactBaseUrl,
      eventId,
      options.spaceId,
      options.spaceKey
    );
  }

  const url = new URL(currentUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("event", eventId);

  if (options.spaceId) {
    assertSafeInviteIdentifier(options.spaceId, "spaceId");
    url.searchParams.set(INVITE_SPACE_PARAM, options.spaceId);
  }

  if (options.spaceKey) {
    assertSafeInviteIdentifier(options.spaceKey, "spaceKey");
    url.searchParams.set(INVITE_SPACE_KEY_PARAM, options.spaceKey);
  }

  const normalizedSnapshot = normalizeInviteSnapshot(inviteSnapshot);
  if (inviteSnapshot !== null && inviteSnapshot !== undefined && !normalizedSnapshot) {
    throw new TypeError("Invalid invite snapshot.");
  }
  if (normalizedSnapshot) {
    url.searchParams.set(INVITE_SNAPSHOT_PARAM, JSON.stringify(normalizedSnapshot));
  }
  if (referralCode) url.searchParams.set("ref", referralCode);

  return url.toString();
}

export function parseInviteEventId(urlValue) {
  try {
    const url = new URL(urlValue);
    const eventId = url.searchParams.get("event");
    if (isSafeSharedIdentifier(eventId)) return eventId;
    const tokenInvite = parseTokenInviteUrl(url);
    if (tokenInvite) return tokenInvite.eventId;
    return parseCompactInviteUrl(url)?.eventId ?? null;
  } catch {
    return null;
  }
}

export function parseInviteToken(urlValue) {
  try {
    const url = new URL(urlValue);
    return (
      parseTokenInviteUrl(url)?.inviteToken ??
      normalizeInviteToken(url.searchParams.get(INVITE_TOKEN_PARAM))
    );
  } catch {
    return null;
  }
}

function parseTokenInviteUrl(urlValue) {
  try {
    const url = urlValue instanceof URL ? urlValue : new URL(urlValue);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (
      pathParts.length !== 4 ||
      pathParts[0] !== "i" ||
      pathParts[2] !== "t"
    ) {
      return null;
    }

    const eventId = decodeURIComponent(pathParts[1]);
    const inviteToken = normalizeInviteToken(decodeURIComponent(pathParts[3]));
    return isSafeSharedIdentifier(eventId) && inviteToken
      ? { eventId, inviteToken }
      : null;
  } catch {
    return null;
  }
}

export function parseInviteSnapshot(urlValue) {
  try {
    const url = new URL(urlValue);
    const rawSnapshot = url.searchParams.get(INVITE_SNAPSHOT_PARAM);
    if (!rawSnapshot) return null;
    return normalizeInviteSnapshot(JSON.parse(rawSnapshot));
  } catch {
    return null;
  }
}

export function buildEventInviteSnapshot(state, eventId) {
  if (!isSafeSharedIdentifier(eventId)) return null;
  const event = state.events?.find((item) => item.id === eventId);
  if (!event) return null;

  const inactiveParticipantIds = new Set(event.inactiveParticipantIds ?? []);
  const activeParticipantIds = (event.participantIds ?? []).filter(
    (participantId) => !inactiveParticipantIds.has(participantId)
  );
  const referencedParticipantIds = new Set(activeParticipantIds);
  const participants = (state.participants ?? [])
    .filter((participant) => referencedParticipantIds.has(participant.id))
    .map((participant) => {
      const avatarPreset = normalizeAvatarPreset(participant.avatarPreset);
      return {
        id: String(participant.id),
        displayName: String(participant.displayName),
        kind: participant.kind === "guest" ? "guest" : "user",
        ...(avatarPreset ? { avatarPreset } : {}),
        accountLinked:
          participant.accountLinked === true ||
          (
            ["google", "apple", "email"].includes(participant.authProvider) &&
            Boolean(participant.authSubject)
          )
      };
    });

  return normalizeInviteSnapshot({
    version: 2,
    participants,
    groups: [],
    event: {
      id: event.id,
      name: event.name,
      eventType: normalizeEventType(event.eventType),
      currency: normalizeCurrency(event.currency),
      roundSettlementTransfers: event.roundSettlementTransfers !== false,
      directSettlementTransfers: event.directSettlementTransfers === true,
      participantIds: activeParticipantIds,
      participantAliases: sanitizeParticipantAliases(
        event.participantAliases,
        referencedParticipantIds
      )
    }
  });
}

export function mergeInviteSnapshotIntoState(state, inviteSnapshot) {
  // URL snapshots are untrusted previews. Keep this compatibility boundary as a
  // no-op so legacy layers cannot accidentally persist them; verified events
  // are imported through mergeSharedEventIntoState after a successful read.
  void inviteSnapshot;
  return state;
}

function normalizeInviteSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  if (![1, 2].includes(snapshot.version)) return null;
  if (
    ("participants" in snapshot && !Array.isArray(snapshot.participants)) ||
    ("groups" in snapshot && !Array.isArray(snapshot.groups))
  ) {
    return null;
  }

  const participants = snapshot.participants ?? [];
  const groups = snapshot.groups ?? [];
  const identifierErrors = validateSharedStateIdentifiers(
    {
      currentParticipantId: "",
      participants,
      groups,
      events: [snapshot.event]
    },
    "inviteSnapshot"
  );
  if (identifierErrors.length) return null;

  const event = normalizeEvent(snapshot.event);
  if (!event) return null;
  const normalizedParticipants = participants.map(normalizeParticipant);
  const normalizedGroups = groups.map(normalizeGroup);
  if (
    normalizedParticipants.some((participant) => !participant) ||
    normalizedGroups.some((group) => !group)
  ) {
    return null;
  }

  return {
    version: 2,
    participants: normalizedParticipants,
    groups: normalizedGroups,
    event
  };
}

function normalizeEvent(event) {
  if (!isSafeSharedIdentifier(event?.id)) return null;
  const participantIds = uniqueIds(event.participantIds);
  const participantIdSet = new Set(participantIds);

  return {
    id: event.id,
    name: String(event.name ?? "אירוע"),
    eventType: normalizeEventType(event.eventType),
    currency: normalizeCurrency(event.currency),
    participantIds,
    participantAliases: sanitizeParticipantAliases(
      event.participantAliases,
      participantIdSet
    ),
    adminIds: [],
    createdByParticipantId: "",
    adminsCanEditOnly: true,
    roundSettlementTransfers: event.roundSettlementTransfers !== false,
    directSettlementTransfers: event.directSettlementTransfers === true,
    locked: true,
    expenses: [],
    transfers: [],
    invitePreview: true
  };
}

function sanitizeParticipantAliases(aliases, participantIds) {
  const allowedParticipantIds =
    participantIds instanceof Set ? participantIds : new Set(participantIds ?? []);
  return Object.fromEntries(
    Object.entries(aliases ?? {})
      .filter(([participantId]) => allowedParticipantIds.has(participantId))
      .map(([participantId, alias]) => [
        participantId,
        sanitizeParticipantAlias(alias)
      ])
  );
}

function normalizeParticipant(participant) {
  if (!isSafeSharedIdentifier(participant?.id) || !participant?.displayName) return null;
  const avatarPreset = normalizeAvatarPreset(participant.avatarPreset);

  return {
    id: participant.id,
    displayName: String(participant.displayName),
    kind: participant.kind === "guest" ? "guest" : "user",
    ...(avatarPreset ? { avatarPreset } : {}),
    accountLinked: false
  };
}

function normalizeGroup(group) {
  if (!isSafeSharedIdentifier(group?.id)) return null;

  return {
    id: group.id,
    name: String(group.name ?? "קבוצה"),
    memberIds: uniqueIds(group.memberIds),
    adminIds: []
  };
}

function uniqueIds(ids) {
  return [...new Set((ids ?? []).filter(Boolean))];
}

function assertSafeInviteIdentifier(value, label) {
  if (!isSafeSharedIdentifier(value)) {
    throw new TypeError(`${label} must be a safe identifier.`);
  }
}

function normalizeInviteToken(value) {
  const token = String(value ?? "").trim();
  return INVITE_TOKEN_PATTERN.test(token) ? token : null;
}
