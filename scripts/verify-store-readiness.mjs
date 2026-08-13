import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { fingerprintAndroidReleaseSource } from "./release-source-fingerprint.mjs";

const root = process.cwd();
const publicOrigin = String(process.env.STORE_PUBLIC_ORIGIN ?? "https://sogrim-hashbon.vercel.app").replace(/\/+$/, "");
const localChecks = [];
const liveChecks = [];
const manualChecks = [];
const playSigningFingerprint = (
  await readFile(join(root, "docs", "store-submission", "android-play-signing-certificate-sha256.txt"), "utf8")
).trim();

await checkFile("Android release signing", "android/keystore.properties");
await checkFile("Android upload key", "android/app/sogrim-upload-key.jks");
await checkFile("Android App Bundle", "android/app/build/outputs/bundle/release/app-release.aab");
await checkFile("Android release evidence", "android/app/build/outputs/bundle/release/release-manifest.json");
await checkFile("Android App Links", ".well-known/assetlinks.json");
await checkFile("AdMob app-ads.txt", "app-ads.txt");
const localAppAds = (
  await readFile(join(root, "app-ads.txt"), "utf8")
).trim();
localChecks.push({
  name: "AdMob app-ads.txt uses the production publisher ID",
  ok:
    localAppAds ===
    "google.com, pub-8171715888836308, DIRECT, f08c47fec0942fa0"
});
const localAssetLinks = JSON.parse(await readFile(join(root, ".well-known", "assetlinks.json"), "utf8"));
localChecks.push({
  name: "Android App Links include Play signing key",
  ok: localAssetLinks.some(
    (statement) =>
      statement.target?.package_name === "com.sogrimhashbon.app" &&
      statement.target?.sha256_cert_fingerprints?.includes(playSigningFingerprint)
  )
});
await checkFile("Apple privacy manifest", "ios/App/App/PrivacyInfo.xcprivacy");
await checkFile("Apple entitlements", "ios/App/App/App.entitlements");
await checkFile("Private store review account", ".store-review-credentials.json");
await checkPng("App Store icon", "docs/store-assets/app-icon-1024.png", 1024, 1024, null, true);
await checkPng("Google Play icon", "docs/store-assets/google-play-icon-512.png", 512, 512, 1024 * 1024);
await checkPng("Google Play feature graphic", "docs/store-assets/google-play-feature-graphic-1024x500.png", 1024, 500, null, true);
for (const [index, name] of ["event", "expense", "invite"].entries()) {
  await checkPng(
    `Google Play screenshot ${index + 1}`,
    `docs/store-assets/google-screenshot-0${index + 1}-${name}.png`,
    1080,
    1920
  );
  await checkPng(
    `App Store screenshot ${index + 1}`,
    `docs/store-assets/apple-screenshot-0${index + 1}-${name}-1320x2868.png`,
    1320,
    2868
  );
}

const [storeScreenshotHtml, storeScreenshotModule, reviewNotes, androidBuild] = await Promise.all([
  readFile(join(root, "docs", "store-assets", "store-screenshot-source.html"), "utf8"),
  readFile(join(root, "docs", "store-assets", "store-screenshot-source.mjs"), "utf8"),
  readFile(join(root, "docs", "store-submission", "review-notes-he.md"), "utf8"),
  readFile(join(root, "android", "app", "build.gradle"), "utf8")
]);
localChecks.push({
  name: "Store screenshot source uses a CSP-safe external module",
  ok:
    /<script type="module" src="\.\/store-screenshot-source\.mjs"><\/script>/.test(storeScreenshotHtml) &&
    (storeScreenshotHtml.match(/<script/g) || []).length === 1
});
localChecks.push({
  name: "Store screenshots match current event, expense and invite flows",
  ok:
    /ui-event-type-current\.png/.test(storeScreenshotModule) &&
    /ui-expense-amount-current\.png/.test(storeScreenshotModule) &&
    /ui-invite-current\.png/.test(storeScreenshotModule) &&
    !/restaurant/i.test(storeScreenshotModule)
});
localChecks.push({
  name: "Store review route matches currently exposed event types",
  ok:
    reviewNotes.includes("יציאה רגילה") &&
    reviewNotes.includes("טיול או חופשה") &&
    !reviewNotes.includes("מסעדה")
});
const androidVersionCode = Number.parseInt(androidBuild.match(/versionCode\s+(\d+)/)?.[1] ?? "", 10);
const androidVersionName = androidBuild.match(/versionName\s+"([^"]+)"/)?.[1] ?? "";
localChecks.push({
  name: "Android release version is valid",
  ok: Number.isSafeInteger(androidVersionCode) && androidVersionCode > 0 && Boolean(androidVersionName)
});
await checkAndroidReleaseEvidence({ androidVersionCode, androidVersionName });

const androidVariables = await readFile(join(root, "android", "variables.gradle"), "utf8");
localChecks.push({ name: "Android target API 36", ok: /targetSdkVersion\s*=\s*36/.test(androidVariables) });

const iosProject = await readFile(join(root, "ios", "App", "App.xcodeproj", "project.pbxproj"), "utf8");
localChecks.push({ name: "iOS privacy manifest bundled", ok: /PrivacyInfo\.xcprivacy in Resources/.test(iosProject) });
localChecks.push({ name: "Stable bundle ID", ok: /PRODUCT_BUNDLE_IDENTIFIER = com\.sogrimhashbon\.app/.test(iosProject) });
const iosMetadata = JSON.parse(
  await readFile(join(root, "docs", "store-submission", "app-store-metadata-he.json"), "utf8")
);
localChecks.push({
  name: "iOS release matches App Store metadata",
  ok:
    iosProject.includes(`MARKETING_VERSION = ${iosMetadata.version.number};`) &&
    iosProject.includes(`CURRENT_PROJECT_VERSION = ${iosMetadata.version.build};`)
});

const packageSwift = await readFile(join(root, "ios", "App", "CapApp-SPM", "Package.swift"), "utf8");
localChecks.push({ name: "macOS-compatible Swift package paths", ok: !/path: "[^"\n]*\\/.test(packageSwift) });
localChecks.push({
  name: "iOS excludes Android-only ads and push delivery",
  ok:
    !/CapacitorCommunityAdmob/.test(packageSwift) &&
    !/CapacitorPushNotifications/.test(packageSwift)
});

const [mainActivity, nativeBridge] = await Promise.all([
  readFile(
    join(root, "android", "app", "src", "main", "java", "com", "sogrimhashbon", "app", "MainActivity.java"),
    "utf8"
  ),
  readFile(join(root, "src", "publicNativeBridgeLayer.mjs"), "utf8")
]);
localChecks.push({
  name: "Android push crash guard",
  ok:
    /registerPlugin\(SogrimCapabilitiesPlugin\.class\)/.test(mainActivity) &&
    /resolveAndroidPushAvailability/.test(nativeBridge)
});
manualChecks.push({
  name: "Android Firebase push configured",
  ok: await hasAndroidFirebaseConfiguration()
});

for (const path of ["privacy", "support", "terms", "account-deletion"]) {
  try {
    const response = await fetchWithTimeout(`${publicOrigin}/${path}`, { redirect: "manual" });
    liveChecks.push({
      name: `Public ${path} page`,
      ok: Boolean(
        response.ok &&
        response.status === 200 &&
        response.headers.get("content-type")?.includes("text/html")
      )
    });
  } catch {
    liveChecks.push({ name: `Public ${path} page`, ok: false });
  }
}

try {
  const response = await fetchWithTimeout(`${publicOrigin}/app-ads.txt`, {
    redirect: "manual"
  });
  const body = await response.text();
  liveChecks.push({
    name: "Live AdMob app-ads.txt",
    ok:
      response.ok &&
      response.status === 200 &&
      Boolean(response.headers.get("content-type")?.includes("text/plain")) &&
      body.trim() ===
        "google.com, pub-8171715888836308, DIRECT, f08c47fec0942fa0"
  });
} catch {
  liveChecks.push({ name: "Live AdMob app-ads.txt", ok: false });
}

try {
  const response = await fetchWithTimeout(`${publicOrigin}/.well-known/assetlinks.json`, { redirect: "manual" });
  const statements = await response.json();
  liveChecks.push({
    name: "Live Android App Links association",
    ok:
      response.ok &&
      response.status === 200 &&
      Boolean(response.headers.get("content-type")?.includes("application/json")) &&
      statements.some(
        (statement) =>
          statement.target?.package_name === "com.sogrimhashbon.app" &&
          statement.target?.sha256_cert_fingerprints?.includes(playSigningFingerprint)
      )
  });
} catch {
  liveChecks.push({ name: "Live Android App Links association", ok: false });
}

try {
  const configResponse = await fetchWithTimeout(`${publicOrigin}/api/config`, { redirect: "manual" });
  const config = await configResponse.json();
  const settingsResponse = await fetchWithTimeout(`${config.storage.url}/auth/v1/settings`, {
    headers: { apikey: config.storage.anonKey }
  });
  const settings = await settingsResponse.json();
  liveChecks.push({
    name: "Google sign-in enabled",
    ok: configResponse.ok && settingsResponse.ok && Boolean(settings.external?.google)
  });
  liveChecks.push({
    name: "Sign in with Apple enabled",
    ok: configResponse.ok && settingsResponse.ok && Boolean(settings.external?.apple)
  });
} catch {
  liveChecks.push({ name: "Live authentication configuration", ok: false });
}

manualChecks.push({
  name: "Apple Team ID association file",
  ok: existsSync(join(root, ".well-known", "apple-app-site-association"))
});
manualChecks.push({ name: "App Store build made with Xcode 26+ on macOS", ok: false });
manualChecks.push({ name: "Developer accounts, identity and store forms completed", ok: false });

const localReady = localChecks.every((check) => check.ok);
const liveReady = liveChecks.every((check) => check.ok);
const submissionReady = localReady && liveReady && manualChecks.every((check) => check.ok);
console.log(JSON.stringify({ localReady, liveReady, submissionReady, localChecks, liveChecks, manualChecks }, null, 2));
if (!localReady || !liveReady) process.exitCode = 1;

async function checkFile(name, relativePath) {
  localChecks.push({ name, ok: existsSync(join(root, ...relativePath.split("/"))) });
}

async function checkPng(name, relativePath, expectedWidth, expectedHeight, maxBytes = null, requireRgb = false) {
  const path = join(root, ...relativePath.split("/"));
  if (!existsSync(path)) {
    localChecks.push({ name, ok: false });
    return;
  }
  const [buffer, file] = await Promise.all([readFile(path), stat(path)]);
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = isPng ? buffer.readUInt32BE(16) : 0;
  const height = isPng ? buffer.readUInt32BE(20) : 0;
  const colorType = isPng ? buffer[25] : -1;
  localChecks.push({
    name,
    ok: isPng
      && width === expectedWidth
      && height === expectedHeight
      && (!maxBytes || file.size <= maxBytes)
      && (!requireRgb || colorType === 2)
  });
}

async function checkAndroidReleaseEvidence({ androidVersionCode, androidVersionName }) {
  const bundlePath = join(root, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab");
  const evidencePath = join(root, "android", "app", "build", "outputs", "bundle", "release", "release-manifest.json");
  if (!existsSync(bundlePath) || !existsSync(evidencePath)) {
    localChecks.push({ name: "Android AAB matches current version, hash, signing certificate and source", ok: false });
    return;
  }

  try {
    const [bundleBytes, bundleFile, evidenceText, expectedUploadSha256, source] = await Promise.all([
      readFile(bundlePath),
      stat(bundlePath),
      readFile(evidencePath, "utf8"),
      readFile(join(root, "docs", "store-submission", "android-upload-certificate-sha256.txt"), "utf8"),
      fingerprintAndroidReleaseSource(root)
    ]);
    const evidence = JSON.parse(evidenceText);
    const digest = createHash("sha256").update(bundleBytes).digest("hex").toUpperCase();
    localChecks.push({
      name: "Android AAB matches current version, hash, signing certificate and source",
      ok:
        evidence.applicationId === "com.sogrimhashbon.app" &&
        evidence.versionCode === androidVersionCode &&
        evidence.versionName === androidVersionName &&
        evidence.bytes === bundleFile.size &&
        evidence.sha256 === digest &&
        evidence.signingSha256 === expectedUploadSha256.trim().toUpperCase() &&
        evidence.sourceSha256 === source.sha256 &&
        evidence.sourceFileCount === source.fileCount &&
        evidence.minSdkVersion === 24 &&
        evidence.targetSdkVersion === 36
    });
  } catch {
    localChecks.push({ name: "Android AAB matches current version, hash, signing certificate and source", ok: false });
  }
}

async function fetchWithTimeout(url, options = {}) {
  const signal = AbortSignal.timeout(10_000);
  return fetch(url, { ...options, signal });
}

async function hasAndroidFirebaseConfiguration() {
  const path = join(root, "android", "app", "google-services.json");
  if (!existsSync(path)) return false;
  try {
    const config = JSON.parse(await readFile(path, "utf8"));
    return config.client?.some(
      (client) =>
        client.client_info?.android_client_info?.package_name ===
        "com.sogrimhashbon.app"
    );
  } catch {
    return false;
  }
}
