import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createReadOnlyAppStoreClient } from "./lib/app-store-status-readonly.mjs";
import {
  ONE_SHOT_IOS_RELEASE, OneShotIosReadinessError, assertOneShotIosContext,
  assertPriorOneShotIosReadiness, attachOneShotIosEvidence, readOneShotIosReadiness
} from "./lib/ios-testflight-one-shot.mjs";

const operation = process.argv[2];
const isReadiness = ["before_build", "before_upload"].includes(operation);
const output = isReadiness ? "build/ios/testflight-one-shot-" + operation.replaceAll("_", "-") + ".json" : null;
try {
  const metadata = JSON.parse(await readFile("docs/store-submission/app-store-metadata-he.json", "utf8"));
  const context = {
    sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    workflowSha: process.env.GITHUB_SHA,
    githubRef: process.env.GITHUB_REF,
    eventName: process.env.GITHUB_EVENT_NAME,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    runId: process.env.GITHUB_RUN_ID,
    version: process.env.IOS_VERSION,
    build: process.env.IOS_BUILD,
    releaseNotes: process.env.IOS_RELEASE_NOTES,
    metadata,
    phase: operation === "before_build" ? "before_build" : "before_upload"
  };
  assertOneShotIosContext(context);
  if (operation !== "before_build") {
    const prior = JSON.parse(await readFile("build/ios/testflight-one-shot-before-build.json", "utf8"));
    assertPriorOneShotIosReadiness(prior, context);
  }
  if (isReadiness) {
    const report = await readOneShotIosReadiness({
      ...context,
      request: createReadOnlyAppStoreClient({
        issuerId: process.env.APPSTORE_ISSUER_ID,
        keyId: process.env.APPSTORE_API_KEY_ID,
        privateKey: process.env.APPSTORE_API_PRIVATE_KEY
      })
    });
    await mkdir("build/ios", { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } else {
    const kind = operation === "record_artifact" ? "artifact" : operation === "record_completion" ? "completion" : null;
    if (!kind) throw new OneShotIosReadinessError("unexpected_phase");
    const path = kind === "artifact" ? "build/ios/release-manifest.json" : "build/ios/testflight-completion.json";
    const original = JSON.parse(await readFile(path, "utf8"));
    const evidence = attachOneShotIosEvidence(kind, original, context);
    await writeFile(path, JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify({
      kind, sourceSha: evidence.sourceSha, workflowSourceSha: evidence.workflowSourceSha,
      version: evidence.version, build: evidence.build,
      ...(kind === "artifact" ? { sha256: evidence.sha256, bytes: evidence.bytes } : {
        processingState: evidence.processingState, hebrewReleaseNotesVerified: evidence.hebrewReleaseNotesVerified
      })
    }, null, 2));
  }
} catch (error) {
  const report = {
    checkedAt: new Date().toISOString(),
    marker: ONE_SHOT_IOS_RELEASE.marker,
    expectedSourceSha: ONE_SHOT_IOS_RELEASE.sourceSha,
    version: ONE_SHOT_IOS_RELEASE.version,
    build: ONE_SHOT_IOS_RELEASE.build,
    ready: false,
    code: error instanceof OneShotIosReadinessError ? error.code : "verification_unavailable"
  };
  if (output) {
    await mkdir("build/ios", { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  }
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
