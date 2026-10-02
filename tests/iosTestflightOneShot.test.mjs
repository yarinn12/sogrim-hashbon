import test from "node:test";
import assert from "node:assert/strict";
import {
  ONE_SHOT_IOS_RELEASE, assertOneShotIosContext, decideOneShotIosReadiness,
  readOneShotIosReadiness, assertPriorOneShotIosReadiness, attachOneShotIosEvidence
} from "../scripts/lib/ios-testflight-one-shot.mjs";

const context = (overrides = {}) => ({
  sourceSha: ONE_SHOT_IOS_RELEASE.sourceSha, workflowSha: "a".repeat(40),
  githubRef: ONE_SHOT_IOS_RELEASE.ref, eventName: "push", runAttempt: "1", runId: "123",
  version: "4.55", build: "186", releaseNotes: "Synthetic Hebrew release notes",
  metadata: { version: { number: "4.55", build: "186", releaseNotes: "Synthetic Hebrew release notes" } },
  phase: "before_build", ...overrides
});
const report = (highestBuildNumber = "185") => ({
  app: { status: "read", identityVerified: true },
  builds: { status: "read", highestBuildNumber },
  tester: { email: "PRIVATE EMAIL", firstName: "PRIVATE NAME" },
  submission: { submittedByActor: "PRIVATE ACTOR" }
});
const blocked = (code) => error => error.code === code;
const prior = () => decideOneShotIosReadiness(report(), context());

test("build 186 is available only when the verified scoped maximum is below 186", () => {
  const result = decideOneShotIosReadiness(report(), context());
  assert.equal(result.highestBuildNumber, "185");
  assert.equal(result.targetBuildAbsent, true);
  assert.equal(result.ready, true);
  assert.equal(result.sourceSha, ONE_SHOT_IOS_RELEASE.sourceSha);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|EMAIL|NAME|ACTOR|tester|submission/);
});

test("existing build 186 and every higher or zero-padded numeric maximum block an upload", () => {
  for (const maximum of ["186", "187", "00186", "999999999999999999999999"]) {
    assert.throws(() => decideOneShotIosReadiness(report(maximum), context()), blocked("build_number_not_available"));
  }
});

test("failed, incomplete, missing, empty and invalid build reads fail closed", () => {
  for (const value of [undefined, null, "", "185x", 185]) {
    const invalid = report();
    invalid.builds.highestBuildNumber = value;
    assert.throws(() => decideOneShotIosReadiness(invalid, context()), blocked("build_read_unverified"));
  }
  for (const bad of [
    { ...report(), app: { status: "blocked", httpStatus: 403, body: "PRIVATE" } },
    { ...report(), builds: { status: "unavailable", code: "incomplete_collection" } },
    { ...report(), app: { status: "read", identityVerified: false } }
  ]) assert.throws(() => decideOneShotIosReadiness(bad, context()), blocked("build_read_unverified"));
});

test("only the exact pinned source and a valid helper workflow SHA may proceed", () => {
  for (const change of [{ sourceSha: "b".repeat(40) }, { workflowSha: "PRIVATE" }, { workflowSha: "" }]) {
    assert.throws(() => assertOneShotIosContext(context(change)), blocked("source_not_pinned"));
  }
});

test("only the named push branch and first run attempt may proceed", () => {
  for (const change of [{ githubRef: "refs/heads/main" }, { eventName: "workflow_dispatch" }]) {
    assert.throws(() => assertOneShotIosContext(context(change)), blocked("unexpected_trigger"));
  }
  for (const change of [{ runAttempt: "2" }, { runAttempt: undefined }, { runId: "PRIVATE" }]) {
    assert.throws(() => assertOneShotIosContext(context(change)), blocked("not_first_attempt"));
  }
});

test("version, build and release notes must match the pinned source metadata", () => {
  for (const change of [{ version: "4.54" }, { build: "185" }, { metadata: { version: { number: "4.54", build: "186" } } }]) {
    assert.throws(() => assertOneShotIosContext(context(change)), blocked("release_mismatch"));
  }
  for (const releaseNotes of ["", "different notes", undefined]) {
    assert.throws(() => assertOneShotIosContext(context({ releaseNotes })), blocked("release_notes_mismatch"));
  }
});

test("invalid source or rerun context prevents all API access", async () => {
  let calls = 0;
  const request = async () => { calls += 1; throw new Error("PRIVATE BODY"); };
  for (const change of [{ runAttempt: "2" }, { sourceSha: "b".repeat(40) }]) {
    await assert.rejects(readOneShotIosReadiness({ request, ...context(change) }));
  }
  assert.equal(calls, 0);
});

test("a fresh readiness read uses the existing GET-only app and complete build reader", async () => {
  const paths = [];
  const request = async path => {
    const url = new URL(path, "https://api.appstoreconnect.apple.com");
    paths.push(url);
    if (url.pathname === "/v1/apps/6809952514") return { data: { id: "6809952514", attributes: { bundleId: "com.sogrimhashbon.app" } } };
    if (url.pathname === "/v1/builds") return {
      data: [{ type: "builds", id: "build-185", attributes: { version: "185", processingState: "VALID" }, relationships: { preReleaseVersion: { data: { id: "version-454" } } } }],
      included: [{ type: "preReleaseVersions", id: "version-454", attributes: { version: "4.54", platform: "IOS" } }]
    };
    throw new Error("PRIVATE RESPONSE");
  };
  const result = await readOneShotIosReadiness({ request, ...context() });
  assert.equal(result.ready, true);
  assert.equal(paths.filter(url => url.pathname === "/v1/builds").length, 1);
  assert.equal(paths.find(url => url.pathname === "/v1/builds").searchParams.get("filter[app]"), "6809952514");
  assert.equal(paths.some(url => url.pathname === "/v1/betaTesters"), false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE RESPONSE/);
});

test("pre-upload evidence must come from the same successful first prebuild check", () => {
  const preUpload = context({ phase: "before_upload" });
  assert.doesNotThrow(() => assertPriorOneShotIosReadiness(prior(), preUpload));
  for (const change of [
    { ready: false }, { targetBuildAbsent: false }, { phase: "before_upload" },
    { sourceSha: "b".repeat(40) }, { workflowSourceSha: "b".repeat(40) },
    { githubRunId: "999" }, { githubRunAttempt: "2" }, { highestBuildNumber: "186" }
  ]) assert.throws(() => assertPriorOneShotIosReadiness({ ...prior(), ...change }, preUpload), blocked("missing_prior_readiness"));
  assert.throws(() => assertPriorOneShotIosReadiness(null, preUpload), blocked("missing_prior_readiness"));
});

test("the second live maximum check blocks if 186 appeared during signing", () => {
  const preUpload = context({ phase: "before_upload" });
  assertPriorOneShotIosReadiness(prior(), preUpload);
  assert.throws(() => decideOneShotIosReadiness(report("186"), preUpload), blocked("build_number_not_available"));
});

test("signed artifact evidence preserves the digest and adds exact source and workflow identity", () => {
  const original = { bundleId: "com.sogrimhashbon.app", version: "4.55", build: "186", sha256: "f".repeat(64), bytes: 12345 };
  const result = attachOneShotIosEvidence("artifact", original, context({ phase: "before_upload" }));
  assert.equal(result.sha256, original.sha256);
  assert.equal(result.sourceSha, ONE_SHOT_IOS_RELEASE.sourceSha);
  assert.equal(result.workflowSourceSha, "a".repeat(40));
  assert.equal(result.marker, ONE_SHOT_IOS_RELEASE.marker);
  for (const change of [{ version: "4.54" }, { build: "185" }]) {
    assert.throws(() => attachOneShotIosEvidence("artifact", { ...original, ...change }, context()), blocked("evidence_release_mismatch"));
  }
  for (const change of [{ sha256: "not a digest" }, { bytes: 0 }, { bundleId: "unrelated.app" }]) {
    assert.throws(() => attachOneShotIosEvidence("artifact", { ...original, ...change }, context()), blocked("artifact_evidence_unverified"));
  }
});

test("completion evidence requires the requested Apple app, VALID processing and verified Hebrew notes", () => {
  const original = { appId: "6809952514", version: "4.55", build: "186", processingState: "VALID", hebrewReleaseNotesVerified: true };
  const result = attachOneShotIosEvidence("completion", original, context({ phase: "before_upload" }));
  assert.equal(result.processingState, "VALID");
  assert.equal(result.sourceSha, ONE_SHOT_IOS_RELEASE.sourceSha);
  for (const change of [{ appId: "other-app" }, { processingState: "PROCESSING" }, { hebrewReleaseNotesVerified: false }]) {
    assert.throws(() => attachOneShotIosEvidence("completion", { ...original, ...change }, context()), blocked("completion_evidence_unverified"));
  }
});
