// Local unit/browser tests need no opt-in. These flags are only for diagnostic
// scripts that create/delete real accounts or mutate a remote backend.
export function assertLiveQaWritesAllowed(env = process.env) {
  if (env.LIVE_QA_ALLOW_WRITES === "1" || env.LIVE_QA_ALLOW_PRODUCTION === "1") return;
  throw new Error(
    "Live QA performs real network writes and consumes cloud quota. " +
    "Use npm test or local Playwright tests by default. After checking the target, " +
    "set LIVE_QA_ALLOW_WRITES=1 explicitly (or LIVE_QA_ALLOW_PRODUCTION=1 for an approved production run)."
  );
}
