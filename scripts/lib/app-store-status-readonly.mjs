import { createAppStoreClient } from "./app-store-release.mjs";

const ORIGIN = "https://api.appstoreconnect.apple.com";
const APP_ID = "6809952514";
const BUNDLE_ID = "com.sogrimhashbon.app";
const SUBMISSION_ID = "8b6da79a-4738-4884-b744-c04959b104da";
const KNOWN_ERRORS = new Set(["invalid_response", "identity_mismatch", "incomplete_collection", "unsafe_pagination", "ambiguous_build"]);

// API shapes: developer.apple.com/documentation/appstoreconnectapi/
// get-v1-builds, get-v1-builds-_id_-buildbetadetail,
// get-v1-reviewsubmissions-_id_, get-v1-betatesters.
export function createReadOnlyAppStoreClient(credentials, options = {}) {
  const client = createAppStoreClient(credentials, options);
  return async (path, { method = "GET", body } = {}) => {
    let url;
    try { url = typeof path === "string" ? new URL(path, ORIGIN) : null; } catch {}
    if (method !== "GET" || body !== undefined || !url || url.origin !== ORIGIN ||
        url.username || url.password || url.hash || !url.pathname.startsWith("/v1/")) {
      throw new Error("Read-only App Store Connect request rejected.");
    }
    return client(url.href, { method: "GET" });
  };
}

function invalid(code = "invalid_response") {
  const error = new Error("App Store Connect status could not be verified.");
  error.code = code;
  throw error;
}

function state(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !/^[A-Z][A-Z_]{0,63}$/.test(value)) invalid();
  return value;
}

function version(value) {
  if (typeof value !== "string" || !/^\d+\.\d+(?:\.\d+)?$/.test(value)) invalid();
  return value;
}

function query(path, values) {
  return `${path}?${new URLSearchParams(values)}`;
}

async function readCollection(request, path) {
  const base = new URL(path, ORIGIN);
  const data = [], included = [];
  let next = base.href;
  for (let page = 0; next && page < 10; page += 1) {
    const url = new URL(next, base);
    if (url.origin !== ORIGIN || url.pathname !== base.pathname || url.username || url.password || url.hash ||
        [...base.searchParams].some(([key, value]) => url.searchParams.get(key) !== value) ||
        [...url.searchParams.keys()].some(key => !base.searchParams.has(key) && !["cursor", "offset"].includes(key))) {
      invalid("unsafe_pagination");
    }
    const response = await request(url.href);
    if (!Array.isArray(response?.data) || (response.included != null && !Array.isArray(response.included))) invalid();
    data.push(...response.data);
    included.push(...(response.included ?? []));
    next = response.links?.next || null;
    if (next && typeof next !== "string") invalid("unsafe_pagination");
  }
  if (next) invalid("incomplete_collection");
  return { data, included };
}

async function capture(read) {
  try { return { status: "read", ...(await read()) }; }
  catch (error) {
    const httpStatus = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : null;
    return {
      status: httpStatus === 401 || httpStatus === 403 ? "blocked" : "unavailable",
      ...(httpStatus ? { httpStatus } : {}),
      code: KNOWN_ERRORS.has(error?.code) ? error.code : httpStatus ? "http_error" : "read_failed"
    };
  }
}

export async function readIosStoreStatus({ request, testerEmail = "" }) {
  const report = { appId: APP_ID, scope: "GET only; no store changes", rejectionReason: "requires_app_store_connect_ui" };
  report.app = await capture(async () => {
    const response = await request(query(`/v1/apps/${APP_ID}`, { "fields[apps]": "bundleId" }));
    if (response?.data?.id !== APP_ID || response.data.attributes?.bundleId !== BUNDLE_ID) invalid("identity_mismatch");
    return { identityVerified: true };
  });
  if (report.app.status !== "read") return report;

  let target;
  report.builds = await capture(async () => {
    const response = await readCollection(request, query("/v1/builds", {
      "filter[app]": APP_ID, "filter[preReleaseVersion.platform]": "IOS",
      "fields[builds]": "version,processingState,preReleaseVersion",
      "fields[preReleaseVersions]": "version,platform", include: "preReleaseVersion", limit: "200"
    }));
    const numbers = response.data.map(build => {
      if (build.type !== "builds" || !/^\d+$/.test(build.attributes?.version ?? "")) invalid();
      const preRelease = response.included.find(item => item.type === "preReleaseVersions" &&
        item.id === build.relationships?.preReleaseVersion?.data?.id);
      if (preRelease?.attributes?.platform !== "IOS") invalid();
      version(preRelease.attributes.version);
      return BigInt(build.attributes.version);
    });
    const targets = response.data.filter(build => build.attributes.version === "184");
    if (targets.length > 1) invalid("ambiguous_build");
    target = targets[0];
    const targetVersion = target && response.included.find(item => item.type === "preReleaseVersions" &&
      item.id === target.relationships?.preReleaseVersion?.data?.id);
    return {
      highestBuildNumber: numbers.length ? numbers.reduce((a, b) => a > b ? a : b).toString() : null,
      build184: target ? { found: true, version: version(targetVersion.attributes.version), processingState: state(target.attributes.processingState) } : { found: false }
    };
  });
  if (target?.id && report.builds.status === "read") {
    const buildPath = `/v1/builds/${encodeURIComponent(target.id)}`;
    report.beta184 = await capture(async () => {
      const response = await request(query(`${buildPath}/buildBetaDetail`, { "fields[buildBetaDetails]": "internalBuildState,externalBuildState" }));
      if (response?.data?.type !== "buildBetaDetails") invalid();
      return { internalBuildState: state(response.data.attributes?.internalBuildState), externalBuildState: state(response.data.attributes?.externalBuildState) };
    });
    report.betaReview184 = await capture(async () => {
      const response = await request(query(`${buildPath}/betaAppReviewSubmission`, { "fields[betaAppReviewSubmissions]": "betaReviewState" }));
      if (response?.data === null) return { submissionFound: false };
      if (response?.data?.type !== "betaAppReviewSubmissions") invalid();
      return { submissionFound: true, betaReviewState: state(response.data.attributes?.betaReviewState) };
    });
  } else {
    report.beta184 = report.betaReview184 = { status: "unavailable", code: "build184_not_verified" };
  }

  report.version452 = await capture(async () => {
    const response = await readCollection(request, query(`/v1/apps/${APP_ID}/appStoreVersions`, {
      "filter[versionString]": "4.52", "filter[platform]": "IOS",
      "fields[appStoreVersions]": "versionString,platform,appStoreState,appVersionState", limit: "200"
    }));
    return { versions: response.data.map(item => {
      if (item.type !== "appStoreVersions" || item.attributes?.versionString !== "4.52" || item.attributes.platform !== "IOS") invalid();
      return { version: "4.52", appStoreState: state(item.attributes.appStoreState), appVersionState: state(item.attributes.appVersionState) };
    }) };
  });
  report.submission = await capture(async () => {
    const response = await request(query(`/v1/reviewSubmissions/${SUBMISSION_ID}`, {
      "fields[reviewSubmissions]": "platform,state,app,appStoreVersionForReview",
      "fields[appStoreVersions]": "versionString,platform,appStoreState,appVersionState", include: "appStoreVersionForReview"
    }));
    const submission = response?.data;
    if (submission?.type !== "reviewSubmissions" || submission.id !== SUBMISSION_ID ||
        submission.attributes?.platform !== "IOS" || submission.relationships?.app?.data?.id !== APP_ID) invalid("identity_mismatch");
    const appVersion = response.included?.find(item => item.type === "appStoreVersions" &&
      item.id === submission.relationships?.appStoreVersionForReview?.data?.id);
    return { state: state(submission.attributes.state), versionForReview: appVersion ? version(appVersion.attributes?.versionString) : null };
  });
  if (!testerEmail) {
    report.tester = { status: "blocked", code: "missing_private_tester_input" };
  } else {
    report.tester = await capture(async () => {
      if (typeof testerEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testerEmail)) invalid();
      const response = await readCollection(request, query("/v1/betaTesters", {
        "filter[apps]": APP_ID, "filter[email]": testerEmail,
        "fields[betaTesters]": "state,inviteType", limit: "200"
      }));
      if (response.data.length > 1) invalid();
      const tester = response.data[0];
      if (tester && tester.type !== "betaTesters") invalid();
      return tester ? { found: true, appMembership: true, state: state(tester.attributes?.state), inviteType: state(tester.attributes?.inviteType) } : { found: false };
    });
  }
  return report;
}
