import { mergeSharedStates } from "../domain/sharedStateMerge.mjs";

export const CLOUD_CONFLICT_RETRY_LIMIT = 4;
const CLOUD_CONFLICT_RETRY_BASE_DELAY_MS = 12;

export async function saveCloudStateWithConflictRetry({
  state,
  loadLatest,
  save,
  retryLimit = CLOUD_CONFLICT_RETRY_LIMIT,
  retryDelay = conflictRetryDelay,
  wait = delay
}) {
  let candidate = state;
  let conflictCount = 0;

  while (true) {
    try {
      await save(candidate);
      return {
        state: candidate,
        conflictCount
      };
    } catch (error) {
      if (
        error?.code !== "CLOUD_STATE_CONFLICT" ||
        conflictCount >= retryLimit
      ) {
        throw error;
      }
      conflictCount += 1;
      const waitMs = Math.max(0, Number(retryDelay(conflictCount)) || 0);
      if (waitMs) await wait(waitMs);
      const latest = await loadLatest(candidate);
      candidate = latest ? mergeSharedStates(latest, candidate) : candidate;
    }
  }
}

function conflictRetryDelay(attempt) {
  const exponential = CLOUD_CONFLICT_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  return exponential + Math.floor(Math.random() * CLOUD_CONFLICT_RETRY_BASE_DELAY_MS);
}

function delay(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}
