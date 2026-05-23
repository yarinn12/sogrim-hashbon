export const BACKUP_VERSION = 1;

export function serializeStateBackup(state, exportedAt = new Date().toISOString()) {
  return JSON.stringify(
    {
      version: BACKUP_VERSION,
      exportedAt,
      state
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

  const state = parsed?.state ?? parsed;
  validateStateShape(state);
  return state;
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
}
