import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { nativeRuntimeCompatibility } from "../src/domain/nativeRuntimeCompatibility.mjs";
import {
  LEGACY_PUBLIC_ORIGIN,
  RECOVERY_PUBLIC_ORIGIN
} from "../src/domain/publicOrigin.mjs";

const PRIMARY_ORIGIN = normalizedOrigin(
  process.env.PRIMARY_PRODUCTION_ORIGIN || LEGACY_PUBLIC_ORIGIN
);
const RECOVERY_ORIGIN = normalizedOrigin(
  process.env.RECOVERY_PRODUCTION_ORIGIN || RECOVERY_PUBLIC_ORIGIN
);
const REQUEST_TIMEOUT_MS = 30_000;
const androidBuild = await readAndroidBuildCode();
const localAppHash = sourceSha256(await readFile("src/app.mjs"));
const origins = [
  await inspectOrigin("primary", PRIMARY_ORIGIN),
  await inspectOrigin("recovery", RECOVERY_ORIGIN)
];
const checks = [];

for (const origin of origins) {
  check(`${origin.label} reachable`, !origin.error, origin.error);
  check(`${origin.label} health`, origin.health?.ok === true);
  check(`${origin.label} app shell`, /id=["']app["']/.test(origin.shell));
  check(`${origin.label} native runtime policy`, origin.compatibility.ok, origin.compatibility.reason);
  check(`${origin.label} matches the release source`, origin.appHash === localAppHash,
    `remote ${origin.appHash}, local ${localAppHash}`);
}

check("primary and recovery serve the same app source",
  origins[0].appHash === origins[1].appHash,
  `${origins[0].appHash} != ${origins[1].appHash}`);
check("primary and recovery use the same cloud and auth backend",
  backendIdentity(origins[0].config) === backendIdentity(origins[1].config));
check("primary and recovery expose the same launch capabilities",
  launchIdentity(origins[0].config) === launchIdentity(origins[1].config));
check("primary and recovery expose the same Android update policy",
  updateIdentity(origins[0].config) === updateIdentity(origins[1].config));

for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAILED"}  ${item.name}${item.detail ? ` - ${item.detail}` : ""}`);
}

const failures = checks.filter((item) => !item.ok);
console.log(`\nProduction failover parity: ${checks.length - failures.length} passed, ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;

async function inspectOrigin(label, origin) {
  const headers = {
    "x-sogrim-platform": "android",
    "x-sogrim-app-build": String(androidBuild),
    "x-sogrim-app-version": "failover-qa"
  };
  try {
    const [health, config, shell, appSource] = await Promise.all([
      requestJson(`${origin}/api/health`),
      requestJson(`${origin}/api/config`, { headers }),
      requestText(`${origin}/`),
      requestBytes(`${origin}/src/app.mjs`)
    ]);
    return {
      label,
      origin,
      health,
      config,
      shell,
      appHash: sourceSha256(appSource),
      compatibility: nativeRuntimeCompatibility(config, {
        expectedAndroidBuild: androidBuild
      })
    };
  } catch (error) {
    return {
      label,
      origin,
      health: null,
      config: null,
      shell: "",
      appHash: "",
      compatibility: { ok: false, reason: "origin request failed" },
      error: String(error?.message ?? error)
    };
  }
}

async function requestJson(url, options = {}) {
  const response = await request(url, options);
  return response.json();
}

async function requestText(url, options = {}) {
  const response = await request(url, options);
  return response.text();
}

async function requestBytes(url, options = {}) {
  const response = await request(url, options);
  return Buffer.from(await response.arrayBuffer());
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    redirect: "follow",
    headers: {
      "user-agent": "sogrim-failover-monitor/1.0",
      ...(options.headers ?? {})
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

async function readAndroidBuildCode() {
  const gradle = await readFile("android/app/build.gradle", "utf8");
  const build = Number.parseInt(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? "", 10);
  if (!Number.isSafeInteger(build) || build < 1) {
    throw new Error("Android versionCode could not be read");
  }
  return build;
}

function backendIdentity(config) {
  return JSON.stringify({
    googleClientId: config?.auth?.googleClientId ?? "",
    storageMode: config?.storage?.mode ?? "",
    storageUrl: config?.storage?.url ?? "",
    storageTable: config?.storage?.table ?? "",
    storageSpaceId: config?.storage?.spaceId ?? ""
  });
}

function launchIdentity(config) {
  const launch = config?.launch ?? {};
  return JSON.stringify({
    cloudStorageReady: launch.cloudStorageReady === true,
    googleAuthReady: launch.googleAuthReady === true,
    accountDeletionReady: launch.accountDeletionReady === true,
    pushDeliveryReady: launch.pushDeliveryReady === true,
    shareLinksReady: launch.shareLinksReady === true
  });
}

function updateIdentity(config) {
  const update = config?.updates?.android ?? {};
  return JSON.stringify({
    minimumSupportedBuild: Number(update.minimumSupportedBuild ?? 0),
    currentBuild: Number(update.currentBuild ?? 0),
    required: update.required === true,
    storeUrl: update.storeUrl ?? ""
  });
}

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail: ok ? "" : detail });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function sourceSha256(value) {
  const source = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  return sha256(source.replace(/\r\n/g, "\n"));
}

function normalizedOrigin(value) {
  const url = new URL(String(value).trim());
  if (url.protocol !== "https:") throw new Error("Production origins must use HTTPS");
  return url.origin;
}
