import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createReadOnlyAppStoreClient, readIosStoreStatus } from "../scripts/lib/app-store-status-readonly.mjs";

const origin = "https://api.appstoreconnect.apple.com";
const appId = "6809952514";
const submissionId = "8b6da79a-4738-4884-b744-c04959b104da";
const credentials = {
  issuerId: "00000000-0000-0000-0000-000000000000", keyId: "ABCDEFGHIJ",
  privateKey: generateKeyPairSync("ec", { namedCurve: "prime256v1", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey
};
const build = number => ({ type: "builds", id: `build-${number}`, attributes: { version: number, processingState: "VALID" }, relationships: { preReleaseVersion: { data: { id: `release-${number}` } } } });
const preRelease = number => ({ type: "preReleaseVersions", id: `release-${number}`, attributes: { version: "4.54", platform: "IOS" } });

function fixture(overrides = {}) {
  const calls = [];
  const request = async path => {
    const url = new URL(path, origin);
    calls.push(url);
    if (overrides[url.pathname]) return overrides[url.pathname](url);
    if (url.pathname === `/v1/apps/${appId}`) return { data: { id: appId, attributes: { bundleId: "com.sogrimhashbon.app" } } };
    if (url.pathname === "/v1/builds") return { data: [build("99"), build("184")], included: [preRelease("99"), preRelease("184")] };
    if (url.pathname.endsWith("/buildBetaDetail")) return { data: { type: "buildBetaDetails", attributes: { internalBuildState: "IN_BETA_TESTING", externalBuildState: "READY_FOR_BETA_TESTING" } } };
    if (url.pathname.endsWith("/betaAppReviewSubmission")) return { data: { type: "betaAppReviewSubmissions", attributes: { betaReviewState: "APPROVED" } } };
    if (url.pathname.endsWith("/appStoreVersions")) return { data: [{ type: "appStoreVersions", attributes: { versionString: "4.52", platform: "IOS", appStoreState: "REJECTED", appVersionState: "REJECTED" } }] };
    if (url.pathname === `/v1/reviewSubmissions/${submissionId}`) return {
      data: { type: "reviewSubmissions", id: submissionId, attributes: { platform: "IOS", state: "UNRESOLVED_ISSUES", submittedByActor: "PRIVATE NAME" }, relationships: { app: { data: { id: appId } }, appStoreVersionForReview: { data: { id: "version-452" } } } },
      included: [{ type: "appStoreVersions", id: "version-452", attributes: { versionString: "4.52" } }]
    };
    if (url.pathname === "/v1/betaTesters") return { data: [{ type: "betaTesters", attributes: { state: "INVITED", inviteType: "EMAIL", email: "target@example.invalid", firstName: "PRIVATE NAME", profile: "PRIVATE PROFILE" } }] };
    assert.fail(`Unexpected fixture endpoint ${url.pathname}`);
  };
  return { request, calls };
}

test("the real signed client makes GET requests with redirects disabled", async () => {
  const calls = [];
  const request = createReadOnlyAppStoreClient(credentials, { fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  } });
  assert.deepEqual(await request("/v1/builds"), { data: [] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, origin);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.body, undefined);
  assert.match(calls[0].options.headers.Authorization, /^Bearer [^.]+\.[^.]+\.[^.]+$/);
});

test("every non-GET method and every body is rejected before signing or network access", async () => {
  let calls = 0;
  const request = createReadOnlyAppStoreClient({}, { fetchImpl: async () => { calls += 1; } });
  for (const method of ["POST", "PATCH", "PUT", "DELETE", "HEAD", "get"]) {
    await assert.rejects(request("/v1/apps", { method }), /Read-only/);
  }
  for (const body of [null, {}, "", "sensitive"]) await assert.rejects(request("/v1/apps", { body }), /Read-only/);
  assert.equal(calls, 0);
});

test("foreign origins, credentials, fragments and non-v1 paths are rejected before network access", async () => {
  let calls = 0;
  const request = createReadOnlyAppStoreClient({}, { fetchImpl: async () => { calls += 1; } });
  for (const path of ["https://example.invalid/v1/apps", "//example.invalid/v1/apps", "http://api.appstoreconnect.apple.com/v1/apps", "https://user@api.appstoreconnect.apple.com/v1/apps", "/v1/apps#private", "/v2/apps", "https://api.appstoreconnect.apple.com.example.invalid/v1/apps"]) {
    await assert.rejects(request(path), /Read-only/);
  }
  assert.equal(calls, 0);
});

test("authentication retries remain GET-only and error bodies never reach the report", async () => {
  const calls = [];
  const request = createReadOnlyAppStoreClient(credentials, { fetchImpl: async (url, options) => {
    calls.push(options.method);
    return new Response("PRIVATE KEY EMAIL PROFILE BODY", { status: calls.length === 1 ? 401 : 403 });
  } });
  const report = await readIosStoreStatus({ request, testerEmail: "target@example.invalid" });
  assert.deepEqual(calls, ["GET", "GET"]);
  assert.deepEqual(report.app, { status: "blocked", httpStatus: 403, code: "http_error" });
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|EMAIL|PROFILE|BODY|target@example/);
});

test("the report reads the requested app, build, review and tester without publishing personal fields", async () => {
  const f = fixture();
  const report = await readIosStoreStatus({ request: f.request, testerEmail: "target@example.invalid" });
  assert.equal(report.builds.highestBuildNumber, "184");
  assert.deepEqual(report.builds.build184, { found: true, version: "4.54", processingState: "VALID" });
  assert.equal(report.beta184.externalBuildState, "READY_FOR_BETA_TESTING");
  assert.equal(report.betaReview184.betaReviewState, "APPROVED");
  assert.equal(report.version452.versions[0].appStoreState, "REJECTED");
  assert.deepEqual(report.submission, { status: "read", state: "UNRESOLVED_ISSUES", versionForReview: "4.52" });
  assert.deepEqual(report.tester, { status: "read", found: true, appMembership: true, state: "INVITED", inviteType: "EMAIL" });
  const testerQuery = f.calls.find(url => url.pathname === "/v1/betaTesters");
  assert.equal(testerQuery.searchParams.get("filter[apps]"), appId);
  assert.equal(testerQuery.searchParams.get("filter[email]"), "target@example.invalid");
  assert.equal(testerQuery.searchParams.get("fields[betaTesters]"), "state,inviteType");
  assert.doesNotMatch(JSON.stringify(report), /target@example|PRIVATE|profile|firstName|submittedByActor/);
  assert.equal(report.rejectionReason, "requires_app_store_connect_ui");
});

test("app identity mismatch stops all further reads", async () => {
  const f = fixture({ [`/v1/apps/${appId}`]: () => ({ data: { id: appId, attributes: { bundleId: "unrelated.app" } } }) });
  const report = await readIosStoreStatus({ request: f.request });
  assert.equal(report.app.code, "identity_mismatch");
  assert.equal(f.calls.length, 1);
});

test("highest numeric build is computed across complete scoped pages", async () => {
  const base = new URL("/v1/builds", origin);
  const f = fixture({ "/v1/builds": url => {
    if (url.searchParams.has("cursor")) return { data: [build("200")], included: [preRelease("200")] };
    base.search = url.search;
    base.searchParams.set("cursor", "next-page");
    return { data: [build("99"), build("184")], included: [preRelease("99"), preRelease("184")], links: { next: base.href } };
  } });
  const report = await readIosStoreStatus({ request: f.request });
  assert.equal(report.builds.status, "read");
  assert.equal(report.builds.highestBuildNumber, "200");
  assert.equal(f.calls.filter(url => url.pathname === "/v1/builds").length, 2);
});

test("pagination cannot change destination or remove the app scope", async () => {
  for (const next of ["https://example.invalid/v1/builds", `${origin}/v1/builds?cursor=next-page`]) {
    const f = fixture({ "/v1/builds": () => ({ data: [build("184")], included: [preRelease("184")], links: { next } }) });
    const report = await readIosStoreStatus({ request: f.request });
    assert.equal(report.builds.code, "unsafe_pagination");
    assert.equal(f.calls.filter(url => url.pathname === "/v1/builds").length, 1);
    assert.equal(report.submission.status, "read");
  }
});

test("a forbidden build collection stays blocked while independently permitted review reads continue", async () => {
  const f = fixture({ "/v1/builds": () => { const error = new Error("PRIVATE BODY"); error.status = 403; throw error; } });
  const report = await readIosStoreStatus({ request: f.request });
  assert.deepEqual(report.builds, { status: "blocked", httpStatus: 403, code: "http_error" });
  assert.equal(report.beta184.code, "build184_not_verified");
  assert.equal(report.version452.status, "read");
  assert.equal(report.submission.status, "read");
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
});

test("ambiguous build184 is reported without selecting a beta target", async () => {
  const f = fixture({ "/v1/builds": () => ({ data: [build("184"), { ...build("184"), id: "other-build" }], included: [preRelease("184")] }) });
  const report = await readIosStoreStatus({ request: f.request });
  assert.equal(report.builds.code, "ambiguous_build");
  assert.equal(f.calls.some(url => /buildBetaDetail|betaAppReviewSubmission/.test(url.pathname)), false);
});

test("missing private tester input does not enumerate unrelated testers", async () => {
  const f = fixture();
  const report = await readIosStoreStatus({ request: f.request });
  assert.deepEqual(report.tester, { status: "blocked", code: "missing_private_tester_input" });
  assert.equal(f.calls.some(url => url.pathname === "/v1/betaTesters"), false);
});

test("submission state requires an explicitly included app linkage instead of an unexpanded relationship", async () => {
  const f = fixture({ [`/v1/reviewSubmissions/${submissionId}`]: url => ({
    data: {
      type: "reviewSubmissions", id: submissionId, attributes: { platform: "IOS", state: "UNRESOLVED_ISSUES" },
      relationships: {
        app: url.searchParams.get("include")?.split(",").includes("app")
          ? { data: { id: appId } }
          : { links: { related: `${origin}/v1/reviewSubmissions/${submissionId}/app` } }
      }
    }
  }) });
  const report = await readIosStoreStatus({ request: f.request });
  assert.equal(report.submission.status, "read");
  assert.equal(report.submission.state, "UNRESOLVED_ISSUES");
  const submissionQuery = f.calls.find(url => url.pathname === `/v1/reviewSubmissions/${submissionId}`);
  assert.equal(submissionQuery.searchParams.get("fields[apps]"), "bundleId");
});
