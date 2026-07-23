import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const checks = [];
const external = [];

await checkFile("Android release signing", "android/keystore.properties");
await checkFile("Android upload key", "android/app/sogrim-upload-key.jks");
await checkFile("Android App Bundle", "android/app/build/outputs/bundle/release/app-release.aab");
await checkFile("Android App Links", ".well-known/assetlinks.json");
await checkFile("Apple privacy manifest", "ios/App/App/PrivacyInfo.xcprivacy");
await checkFile("Apple entitlements", "ios/App/App/App.entitlements");
await checkFile("Private store review account", ".store-review-credentials.json");
await checkPng("App Store icon", "docs/store-assets/app-icon-1024.png", 1024, 1024);
await checkPng("Google Play icon", "docs/store-assets/google-play-icon-512.png", 512, 512, 1024 * 1024);
await checkPng("Google Play feature graphic", "docs/store-assets/google-play-feature-graphic-1024x500.png", 1024, 500, null, true);
for (const [index, name] of ["event", "restaurant", "invite"].entries()) {
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

const androidVariables = await readFile(join(root, "android", "variables.gradle"), "utf8");
checks.push({ name: "Android target API 36", ok: /targetSdkVersion\s*=\s*36/.test(androidVariables) });

const iosProject = await readFile(join(root, "ios", "App", "App.xcodeproj", "project.pbxproj"), "utf8");
checks.push({ name: "iOS privacy manifest bundled", ok: /PrivacyInfo\.xcprivacy in Resources/.test(iosProject) });
checks.push({ name: "Stable bundle ID", ok: /PRODUCT_BUNDLE_IDENTIFIER = com\.sogrimhashbon\.app/.test(iosProject) });

const packageSwift = await readFile(join(root, "ios", "App", "CapApp-SPM", "Package.swift"), "utf8");
checks.push({ name: "macOS-compatible Swift package paths", ok: !/path: "[^"\n]*\\/.test(packageSwift) });

for (const path of ["privacy", "support", "terms", "account-deletion"]) {
  try {
    const response = await fetch(`https://sogrim-hashbon.vercel.app/${path}`);
    checks.push({ name: `Public ${path} page`, ok: response.ok });
  } catch {
    checks.push({ name: `Public ${path} page`, ok: false });
  }
}

try {
  const response = await fetch("https://sogrim-hashbon.vercel.app/.well-known/assetlinks.json");
  const statements = await response.json();
  checks.push({
    name: "Live Android App Links association",
    ok: response.ok && statements.some((statement) => statement.target?.package_name === "com.sogrimhashbon.app")
  });
} catch {
  checks.push({ name: "Live Android App Links association", ok: false });
}

try {
  const configResponse = await fetch("https://sogrim-hashbon.vercel.app/api/config");
  const config = await configResponse.json();
  const settingsResponse = await fetch(`${config.storage.url}/auth/v1/settings`, {
    headers: { apikey: config.storage.anonKey }
  });
  const settings = await settingsResponse.json();
  checks.push({ name: "Google sign-in enabled", ok: Boolean(settings.external?.google) });
  external.push({ name: "Sign in with Apple enabled in Supabase", ok: Boolean(settings.external?.apple) });
} catch {
  checks.push({ name: "Live authentication configuration", ok: false });
  external.push({ name: "Sign in with Apple enabled in Supabase", ok: false });
}

external.push({
  name: "Apple Team ID association file",
  ok: existsSync(join(root, ".well-known", "apple-app-site-association"))
});
external.push({ name: "App Store build made with Xcode 26+ on macOS", ok: false });
external.push({ name: "Developer accounts, identity and store forms completed", ok: false });

const localReady = checks.every((check) => check.ok);
console.log(JSON.stringify({ localReady, checks, external }, null, 2));
if (!localReady) process.exitCode = 1;

async function checkFile(name, relativePath) {
  checks.push({ name, ok: existsSync(join(root, ...relativePath.split("/"))) });
}

async function checkPng(name, relativePath, expectedWidth, expectedHeight, maxBytes = null, requireRgb = false) {
  const path = join(root, ...relativePath.split("/"));
  if (!existsSync(path)) {
    checks.push({ name, ok: false });
    return;
  }
  const [buffer, file] = await Promise.all([readFile(path), stat(path)]);
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = isPng ? buffer.readUInt32BE(16) : 0;
  const height = isPng ? buffer.readUInt32BE(20) : 0;
  const colorType = isPng ? buffer[25] : -1;
  checks.push({
    name,
    ok: isPng
      && width === expectedWidth
      && height === expectedHeight
      && (!maxBytes || file.size <= maxBytes)
      && (!requireRgb || colorType === 2)
  });
}
