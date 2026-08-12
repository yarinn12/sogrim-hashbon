const PARTICIPANT_PAIR_SEPARATOR = "~";
const PARTICIPANT_ALIAS_MAX_LENGTH = 32;
const CONNECTED_AUTH_PROVIDERS = new Set(["google", "apple", "email"]);
const HEBREW_MARKS_PATTERN =
  /[\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7]/g;

export function normalizeParticipantDisplayName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(HEBREW_MARKS_PATTERN, "")
    .toLocaleLowerCase("he-IL");
}

export function participantHasConnectedAccount(participant) {
  return Boolean(
    participant?.accountLinked === true ||
      (
        CONNECTED_AUTH_PROVIDERS.has(participant?.authProvider) &&
        participant?.authSubject
      )
  );
}

export function findOfflineParticipantByName(participants, value) {
  const normalizedName = normalizeParticipantDisplayName(value);
  if (!normalizedName) return null;

  return (
    (participants ?? []).find(
      (participant) =>
        participant?.kind === "guest" &&
        !participantHasConnectedAccount(participant) &&
        normalizeParticipantDisplayName(participant.displayName) === normalizedName
    ) ?? null
  );
}

export function duplicateParticipantPairKey(leftParticipantId, rightParticipantId) {
  const ids = [String(leftParticipantId ?? ""), String(rightParticipantId ?? "")]
    .filter(Boolean)
    .sort();
  return ids.length === 2 && ids[0] !== ids[1]
    ? ids.join(PARTICIPANT_PAIR_SEPARATOR)
    : "";
}

export function participantPairIncludes(pairKey, participantId) {
  return String(pairKey ?? "")
    .split(PARTICIPANT_PAIR_SEPARATOR)
    .includes(String(participantId ?? ""));
}

export function remapParticipantPairKeys(pairKeys, sourceParticipantId, targetParticipantId) {
  return [
    ...new Set(
      (Array.isArray(pairKeys) ? pairKeys : [])
        .map((pairKey) => {
          const ids = String(pairKey)
            .split(PARTICIPANT_PAIR_SEPARATOR)
            .map((participantId) =>
              participantId === sourceParticipantId
                ? targetParticipantId
                : participantId
            );
          return duplicateParticipantPairKey(ids[0], ids[1]);
        })
        .filter(Boolean)
    )
  ];
}

export function sanitizeParticipantAlias(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, PARTICIPANT_ALIAS_MAX_LENGTH);
}

export function duplicateParticipantNameGroups(participants) {
  const groupsByName = new Map();

  for (const participant of participants ?? []) {
    const normalizedName = normalizeParticipantDisplayName(participant?.displayName);
    if (!participant?.id || !normalizedName) continue;
    const group = groupsByName.get(normalizedName) ?? [];
    group.push(participant);
    groupsByName.set(normalizedName, group);
  }

  return [...groupsByName.values()].filter((group) => group.length > 1);
}

export function eventDuplicateParticipantGroups(participants, event) {
  const eventParticipantIds = new Set(event?.participantIds ?? []);
  return duplicateParticipantNameGroups(
    (participants ?? []).filter((participant) => eventParticipantIds.has(participant.id))
  );
}

export function unresolvedDuplicateParticipantPairs(participants, event) {
  const distinctPairs = new Set(event?.distinctParticipantPairs ?? []);
  const pairs = [];

  for (const group of eventDuplicateParticipantGroups(participants, event)) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex];
        const right = group[rightIndex];
        const key = duplicateParticipantPairKey(left.id, right.id);
        if (!key || distinctPairs.has(key)) continue;

        const leftConnected = participantHasConnectedAccount(left);
        const rightConnected = participantHasConnectedAccount(right);
        const bothConnected = leftConnected && rightConnected;
        const leftActivity = participantEventActivityScore(event, left.id);
        const rightActivity = participantEventActivityScore(event, right.id);
        const offlineTarget =
          rightActivity > leftActivity ? right : left;
        const offlineSource =
          offlineTarget.id === left.id ? right : left;
        pairs.push({
          key,
          left,
          right,
          mergeSourceId:
            bothConnected
              ? ""
              : leftConnected
                ? right.id
                : rightConnected
                  ? left.id
                  : offlineSource.id,
          mergeTargetId:
            bothConnected
              ? ""
              : leftConnected
                ? left.id
                : rightConnected
                  ? right.id
                  : offlineTarget.id
        });
      }
    }
  }

  return pairs;
}

function participantEventActivityScore(event, participantId) {
  let score = Number(event?.participantIds?.includes(participantId));

  for (const expense of event?.expenses ?? []) {
    if (expense.createdByParticipantId === participantId) score += 1;
    if (expense.sharedByParticipantIds?.includes(participantId)) score += 1;
    if (expense.payers?.some((payer) => payer.participantId === participantId)) {
      score += 1;
    }
  }

  for (const transfer of event?.transfers ?? []) {
    if (
      transfer.fromParticipantId === participantId ||
      transfer.toParticipantId === participantId ||
      transfer.markedPaidByParticipantId === participantId
    ) {
      score += 1;
    }
  }

  return score;
}

export function participantEventDisplayName(participants, event, participantId) {
  const participant = (participants ?? []).find((item) => item.id === participantId);
  if (!participant) return "משתתף";

  const baseName =
    String(participant.displayName ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ") || "משתתף";
  const alias = sanitizeParticipantAlias(event?.participantAliases?.[participantId]);
  if (alias) return `${baseName} · ${alias}`;

  const duplicateGroup = eventDuplicateParticipantGroups(participants, event).find((group) =>
    group.some((item) => item.id === participantId)
  );
  if (!duplicateGroup) return baseName;

  const identityKind = participantIdentityKind(participant);
  const matchingKind = duplicateGroup.filter(
    (item) => participantIdentityKind(item) === identityKind
  );
  const qualifier = identityKindLabel(identityKind);
  if (matchingKind.length === 1) return `${baseName} · ${qualifier}`;

  const position = matchingKind.findIndex((item) => item.id === participantId) + 1;
  return `${baseName} · ${qualifier} ${position}`;
}

function participantIdentityKind(participant) {
  if (participantHasConnectedAccount(participant)) return "connected";
  return "offline";
}

function identityKindLabel(identityKind) {
  if (identityKind === "connected") return "משתמש";
  return "שם אופליין";
}
