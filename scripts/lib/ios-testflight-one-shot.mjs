import { readIosStoreStatus } from "./app-store-status-readonly.mjs";

export const ONE_SHOT_IOS_RELEASE = Object.freeze({
  marker: "ios-testflight-4.55-185-20261001",
  sourceSha: "d675cd0f84e969de20f9bd858bbc5db196841df5",
  ref: "refs/heads/work/01-ios-testflight-185-20261001",
  version: "4.55",
  build: "185",
  appId: "6809952514"
});

export class OneShotIosReadinessError extends Error {
  constructor(code) {
    super("One-shot iOS release verification blocked.");
    this.code = code;
  }
}

function reject(code) {
  throw new OneShotIosReadinessError(code);
}

export function assertOneShotIosContext(context) {
  const expected = ONE_SHOT_IOS_RELEASE;
  if (context.sourceSha !== expected.sourceSha || !/^[a-f\d]{40}$/i.test(context.workflowSha || "")) reject("source_not_pinned");
  if (context.githubRef !== expected.ref || context.eventName !== "push") reject("unexpected_trigger");
  if (context.runAttempt !== "1" || !/^\d+$/.test(context.runId || "")) reject("not_first_attempt");
  if (context.version !== expected.version || context.build !== expected.build ||
      context.metadata?.version?.number !== expected.version || String(context.metadata?.version?.build) !== expected.build) reject("release_mismatch");
  if (typeof context.releaseNotes !== "string" || !context.releaseNotes.trim() ||
      context.releaseNotes !== context.metadata.version.releaseNotes) reject("release_notes_mismatch");
  if (!["before_build", "before_upload"].includes(context.phase)) reject("unexpected_phase");
  return {
    marker: expected.marker,
    sourceSha: expected.sourceSha,
    workflowSourceSha: context.workflowSha,
    githubRunId: context.runId,
    githubRunAttempt: context.runAttempt,
    version: expected.version,
    build: expected.build,
    phase: context.phase
  };
}

export function decideOneShotIosReadiness(report, context) {
  const evidence = assertOneShotIosContext(context);
  if (report?.app?.status !== "read" || report.app.identityVerified !== true ||
      report?.builds?.status !== "read" || typeof report.builds.highestBuildNumber !== "string" ||
      !/^\d+$/.test(report.builds.highestBuildNumber)) reject("build_read_unverified");
  if (BigInt(report.builds.highestBuildNumber) >= BigInt(ONE_SHOT_IOS_RELEASE.build)) reject("build_number_not_available");
  return {
    checkedAt: new Date().toISOString(),
    scope: "GET only; no store changes",
    ...evidence,
    highestBuildNumber: report.builds.highestBuildNumber,
    targetBuildAbsent: true,
    ready: true
  };
}

export async function readOneShotIosReadiness({ request, ...context }) {
  assertOneShotIosContext(context);
  const report = await readIosStoreStatus({ request });
  return decideOneShotIosReadiness(report, context);
}

export function assertPriorOneShotIosReadiness(prior, context) {
  const evidence = assertOneShotIosContext(context);
  if (prior?.ready !== true || prior.targetBuildAbsent !== true || prior.phase !== "before_build" ||
      prior.marker !== evidence.marker || prior.sourceSha !== evidence.sourceSha ||
      prior.workflowSourceSha !== evidence.workflowSourceSha || prior.githubRunId !== evidence.githubRunId ||
      prior.githubRunAttempt !== "1" || prior.version !== evidence.version || prior.build !== evidence.build ||
      !/^\d+$/.test(prior.highestBuildNumber || "") || BigInt(prior.highestBuildNumber) >= BigInt(evidence.build)) reject("missing_prior_readiness");
}

export function attachOneShotIosEvidence(kind, original, context) {
  const evidence = assertOneShotIosContext(context);
  if (original?.version !== evidence.version || original.build !== evidence.build) reject("evidence_release_mismatch");
  if (kind === "artifact") {
    if (original.bundleId !== "com.sogrimhashbon.app" || !/^[a-f\d]{64}$/i.test(original.sha256 || "") ||
        !Number.isSafeInteger(original.bytes) || original.bytes < 1) reject("artifact_evidence_unverified");
  } else if (kind === "completion") {
    if (original.appId !== ONE_SHOT_IOS_RELEASE.appId || original.processingState !== "VALID" ||
        original.hebrewReleaseNotesVerified !== true) reject("completion_evidence_unverified");
  } else {
    reject("unexpected_evidence_kind");
  }
  const { phase, ...source } = evidence;
  return { ...original, ...source };
}
