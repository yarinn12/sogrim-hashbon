import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const metadata = JSON.parse(await readFile("docs/store-submission/app-store-metadata-he.json", "utf8"));
const project = await readFile("ios/App/App.xcodeproj/project.pbxproj", "utf8");
const info = await readFile("ios/App/App/Info.plist", "utf8");
const launchScreen = await readFile("ios/App/App/Base.lproj/LaunchScreen.storyboard", "utf8");
const privacy = await readFile("ios/App/App/PrivacyInfo.xcprivacy", "utf8");
const packageSwift = await readFile("ios/App/CapApp-SPM/Package.swift", "utf8");
const accountAuth = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
const checks = [];
const external = [];
const expectedVersion = process.env.IOS_VERSION || metadata.version.number;
const expectedBuild = process.env.IOS_BUILD || metadata.version.build;

check("App name is 2-30 characters", metadata.app.name.length >= 2 && metadata.app.name.length <= 30);
check("Subtitle is at most 30 characters", metadata.app.subtitle.length <= 30);
check("Promotional text is at most 170 characters", metadata.version.promotionalText.length <= 170);
check("Description is present and at most 4,000 characters", metadata.version.description.length > 0 && metadata.version.description.length <= 4000);
check("Keywords fit Apple's 100-byte limit", Buffer.byteLength(metadata.version.keywords, "utf8") <= 100);
check("Every keyword contains at least three characters", metadata.version.keywords.split(",").every((value) => value.trim().length >= 3));
check("Bundle ID is stable", metadata.app.bundleId === "com.sogrimhashbon.app" && /PRODUCT_BUNDLE_IDENTIFIER = com\.sogrimhashbon\.app/.test(project));
check("iOS version and build match release settings", project.includes(`MARKETING_VERSION = ${expectedVersion};`) && project.includes(`CURRENT_PROJECT_VERSION = ${expectedBuild};`));
const teamIds = [...project.matchAll(/DEVELOPMENT_TEAM = ([A-Z0-9]{10});/g)].map((match) => match[1]);
check("Apple Team ID is configured in both app build configurations", teamIds.length === 2 && new Set(teamIds).size === 1);
await checkAppleAssociation(teamIds[0] ?? "");
check("iPhone release is portrait-only", /UISupportedInterfaceOrientations<\/key>\s*<array>\s*<string>UIInterfaceOrientationPortrait<\/string>\s*<\/array>/.test(info));
check(
  "Native launch screen hands directly to the web intro without a logo flash",
  /<view key="view"[\s\S]*?<color key="backgroundColor" white="1"/.test(launchScreen) &&
    !/image="Splash"|<image name="Splash"/.test(launchScreen)
);
check("Export compliance is declared", /ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(info));
check("Privacy manifest declares no tracking", /NSPrivacyTracking<\/key>\s*<false\/>/.test(privacy));
check("Privacy manifest covers feedback diagnostics", /NSPrivacyCollectedDataTypeOtherDiagnosticData/.test(privacy));
check("iOS excludes Android-only advertising", !/CapacitorCommunityAdmob/.test(packageSwift));
check("iOS excludes unsupported push delivery", !/CapacitorPushNotifications/.test(packageSwift) && !/com\.apple\.Push/.test(project));
check("Shared Xcode scheme exists", existsSync("ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"));
check(
  "Sign in with Apple uses accessible approved artwork",
  /aria-label="המשך עם Apple"/.test(accountAuth) && /assets\/sign-in-with-apple-iw\.png/.test(accountAuth)
);
await checkPngDimensions("Official localized Apple sign-in artwork", "assets/sign-in-with-apple-iw.png", 1125, 168);
await checkPng("Opaque 1024px App Store icon", "docs/store-assets/app-icon-1024.png", 1024, 1024);
for (const [index, name] of ["event", "expense", "invite"].entries()) {
  await checkPng(`Opaque App Store screenshot ${index + 1}`, `docs/store-assets/apple-screenshot-0${index + 1}-${name}-1320x2868.png`, 1320, 2868);
}

external.push({ name: "Built and archived with Xcode 26+ and the iOS 26 SDK", ok: process.platform === "darwin" });
external.push({ name: "App Store Connect record, agreements and required forms completed", ok: false });
console.log(JSON.stringify({ ready: checks.every((item) => item.ok), checks, external }, null, 2));
if (checks.some((item) => !item.ok)) process.exitCode = 1;

function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}

async function checkPng(name, path, width, height) {
  if (!existsSync(path)) return check(name, false);
  const bytes = await readFile(path);
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  check(name, png && bytes.readUInt32BE(16) === width && bytes.readUInt32BE(20) === height && bytes[25] === 2);
}

async function checkPngDimensions(name, path, width, height) {
  if (!existsSync(path)) return check(name, false);
  const bytes = await readFile(path);
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  check(name, png && bytes.readUInt32BE(16) === width && bytes.readUInt32BE(20) === height);
}

async function checkAppleAssociation(teamId) {
  const path = ".well-known/apple-app-site-association";
  if (!teamId || !existsSync(path)) return check("Apple Universal Links association matches Team ID", false);
  try {
    const association = JSON.parse(await readFile(path, "utf8"));
    const expectedAppId = `${teamId}.com.sogrimhashbon.app`;
    const details = association?.applinks?.details;
    check(
      "Apple Universal Links association matches Team ID",
      Array.isArray(details) && details.some((item) => item?.appID === expectedAppId)
    );
  } catch {
    check("Apple Universal Links association matches Team ID", false);
  }
}
