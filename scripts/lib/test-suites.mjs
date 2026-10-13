import { relative } from "node:path";

// Whole files remain intact; npm test is still the complete suite. These files
// exercise HTTP, database, storage or orchestration contracts across modules.
export const integrationFiles = [
  "auditPersistenceRegressions", "databaseIntegrity", "draftRecoveryIntegration",
  "fxMigrationLifecycle", "fxSharedFirstInsert", "cloudStore", "cloudStartupSync",
  "cloudConflictRetry", "cloudObserverConcurrency", "sharedSaveReconciliation",
  "sharedSyncPartialFailure", "sharedWriteVersionRace", "sharedEventSparseWrite",
  "offlineSyncResilience", "sharedEventStore", "sharedStateMerge", "stateStore",
  "broadcastNotifications", "productMetrics", "serverEventInvites", "serverGoogleAuth",
  "serverHealth", "serverNativeAuthReturn", "serverSensitiveRateLimit",
  "serverStateIsolation", "serverStaticSecurity", "serverVideoRange"
].map(name => `tests/${name}.test.mjs`);

export function requestedSuite(args) {
  const index = args.indexOf("--suite");
  const suite = index < 0 ? "all" : args[index + 1];
  if (!["all", "unit", "integration"].includes(suite)) throw new Error("Expected --suite all, unit or integration");
  return suite;
}

export function selectTestFiles(files, root, suite = "all") {
  const normalize = file => relative(root, file).replaceAll("\\", "/");
  const discovered = new Set(files.map(normalize));
  const missing = integrationFiles.filter(file => !discovered.has(file));
  if (missing.length) throw new Error(`Integration inventory missing files: ${missing.join(", ")}`);
  if (!["all", "unit", "integration"].includes(suite)) throw new Error("Unknown test suite");
  if (suite === "all") return files;
  const integration = new Set(integrationFiles);
  return files.filter(file => {
    const name = normalize(file);
    const selected = integration.has(name) || name.endsWith(".integration.test.mjs");
    return suite === "integration" ? selected : !selected;
  });
}
