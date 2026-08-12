import {
  validateSharedStateFinancials,
  validateSharedStateIdentifiers
} from "../domain/sharedStateMerge.mjs";

export function validateSharedStatePayload(state) {
  const errors = [];

  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return {
      ok: false,
      errors: ["State must be an object."]
    };
  }

  for (const key of ["participants", "groups", "events"]) {
    if (!Array.isArray(state[key])) {
      errors.push(`${key} must be an array.`);
    }
  }

  if (
    "currentParticipantId" in state &&
    typeof state.currentParticipantId !== "string"
  ) {
    errors.push("currentParticipantId must be a string.");
  }

  errors.push(...validateSharedStateIdentifiers(state));
  errors.push(...validateSharedStateFinancials(state));

  return {
    ok: errors.length === 0,
    errors
  };
}

export function assertValidSharedStatePayload(state) {
  const validation = validateSharedStatePayload(state);

  if (!validation.ok) {
    throw new Error(`Invalid state payload: ${validation.errors.join(" ")}`);
  }
}
