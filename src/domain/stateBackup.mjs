import {
  validateSharedStateFinancials,
  validateSharedStateIdentifiers
} from "./sharedStateMerge.mjs";

export const BACKUP_VERSION = 2;

const SENSITIVE_BACKUP_FIELD_SUFFIXES = [
  "token",
  "spacekey",
  "accesskey",
  "accesskeyhash",
  "apikey",
  "anonkey",
  "secretkey",
  "privatekey",
  "servicekey",
  "servicerolekey"
];
const SENSITIVE_BACKUP_FIELDS = new Set([
  "authorization",
  "clientsecret",
  "credential",
  "currentparticipantid",
  "password",
  "passcode"
]);

export function serializeStateBackup(state, exportedAt = new Date().toISOString()) {
  return JSON.stringify(
    {
      version: BACKUP_VERSION,
      exportedAt,
      state: redactStateBackup(state)
    },
    null,
    2
  );
}

export function parseStateBackup(text) {
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Backup file is not valid JSON");
  }

  const state = redactStateBackup(parsed?.state ?? parsed);
  validateStateShape(state);
  return state;
}

export function bindStateBackupToCurrentParticipant(restoredState, currentState = {}) {
  const state = redactStateBackup(restoredState);
  validateStateShape(state);

  const currentParticipantId = String(
    currentState?.currentParticipantId ?? ""
  ).trim();
  const currentParticipant = (currentState?.participants ?? []).find(
    (participant) => participant?.id === currentParticipantId
  );
  const safeCurrentParticipant = currentParticipant
    ? redactStateBackup(currentParticipant)
    : null;
  const participants = state.participants.map((participant) =>
    safeCurrentParticipant && participant?.id === currentParticipantId
      ? safeCurrentParticipant
      : participant
  );

  if (
    currentParticipantId &&
    safeCurrentParticipant &&
    !participants.some((participant) => participant?.id === currentParticipantId)
  ) {
    participants.push(safeCurrentParticipant);
  }

  const participantId = currentParticipantId &&
    participants.some((participant) => participant?.id === currentParticipantId)
      ? currentParticipantId
      : participants[0]?.id ?? "";

  return {
    ...state,
    participants,
    currentParticipantId: participantId
  };
}

export function redactStateBackup(value) {
  if (Array.isArray(value)) return value.map(redactStateBackup);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSensitiveBackupField(key))
      .map(([key, nestedValue]) => [key, redactStateBackup(nestedValue)])
  );
}

function validateStateShape(state) {
  if (!Array.isArray(state?.participants)) {
    throw new Error("Backup file is missing participants");
  }

  if (!Array.isArray(state.groups)) {
    throw new Error("Backup file is missing groups");
  }

  if (!Array.isArray(state.events)) {
    throw new Error("Backup file is missing events");
  }

  const errors = [
    ...validateSharedStateIdentifiers(state),
    ...validateSharedStateFinancials(state)
  ];
  if (errors.length) {
    throw new Error(`Backup file contains invalid data: ${errors.join(" ")}`);
  }
}

function isSensitiveBackupField(key) {
  const normalized = String(key).replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return (
    SENSITIVE_BACKUP_FIELDS.has(normalized) ||
    SENSITIVE_BACKUP_FIELD_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}
