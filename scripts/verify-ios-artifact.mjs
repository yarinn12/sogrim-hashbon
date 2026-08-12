import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

if (process.platform !== "darwin") {
  throw new Error("A signed iOS artifact can only be verified on macOS.");
}

const root = process.cwd();
const ipaPath = join(root, process.env.IOS_IPA_PATH || "build/ios/SogrimHashbon.ipa");
const evidencePath = join(root, "build", "ios", "release-manifest.json");
const metadata = JSON.parse(await readFile(join(root, "docs", "store-submission", "app-store-metadata-he.json"), "utf8"));
const expectedVersion = String(process.env.IOS_VERSION || metadata.version.number);
const expectedBuild = String(process.env.IOS_BUILD || metadata.version.build);
const expectedTeamId = String(process.env.APPLE_TEAM_ID || "").trim().toUpperCase();

if (!existsSync(ipaPath)) throw new Error(`Signed IPA is missing: ${ipaPath}`);
if (!/^[A-Z0-9]{10}$/.test(expectedTeamId)) throw new Error("APPLE_TEAM_ID is missing or invalid.");

const temporary = await mkdtemp(join(tmpdir(), "sogrim-ios-release-"));
try {
  run("/usr/bin/ditto", ["-x", "-k", ipaPath, temporary]);
  const payload = join(temporary, "Payload");
  const apps = (await readdir(payload)).filter((name) => name.endsWith(".app"));
  if (apps.length !== 1) throw new Error("IPA must contain exactly one application bundle.");

  const appPath = join(payload, apps[0]);
  const infoPath = join(appPath, "Info.plist");
  const bundleId = plistValue(infoPath, "CFBundleIdentifier");
  const version = plistValue(infoPath, "CFBundleShortVersionString");
  const build = plistValue(infoPath, "CFBundleVersion");
  if (bundleId !== "com.sogrimhashbon.app" || version !== expectedVersion || build !== expectedBuild) {
    throw new Error(`IPA identity mismatch: ${bundleId} ${version} (${build}).`);
  }

  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  const entitlements = run("/usr/bin/codesign", ["-d", "--entitlements", ":-", appPath], true);
  const applicationIdentifier = entitlementString(entitlements, "application-identifier");
  if (applicationIdentifier !== `${expectedTeamId}.com.sogrimhashbon.app`) {
    throw new Error("Signed IPA application identifier does not match the Apple Team ID.");
  }
  if (!entitlements.includes("applinks:sogrim-hashbon.vercel.app")) {
    throw new Error("Signed IPA is missing the production Associated Domains entitlement.");
  }
  if (!entitlements.includes("com.apple.developer.applesignin")) {
    throw new Error("Signed IPA is missing Sign in with Apple entitlement.");
  }

  const embeddedProfile = join(appPath, "embedded.mobileprovision");
  if (!existsSync(embeddedProfile)) throw new Error("Signed IPA is missing an embedded provisioning profile.");
  const profile = run("/usr/bin/security", ["cms", "-D", "-i", embeddedProfile], true);
  if (!profile.includes(expectedTeamId) || !profile.includes(`${expectedTeamId}.com.sogrimhashbon.app`)) {
    throw new Error("Provisioning profile does not match the Apple Team ID and bundle ID.");
  }

  const bytes = await readFile(ipaPath);
  const file = await stat(ipaPath);
  const xcode = run("/usr/bin/xcodebuild", ["-version"], true).trim();
  const evidence = {
    bundleId,
    version,
    build,
    teamId: expectedTeamId,
    artifact: basename(ipaPath),
    bytes: file.size,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    verifiedAt: new Date().toISOString(),
    xcode
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`Signed iOS artifact ${version} (${build}) verified: ${ipaPath}`);
  console.log(`Release evidence: ${evidencePath}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

function run(command, args, capture = false) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.status !== 0) {
    throw new Error(`${basename(command)} failed: ${result.stderr?.trim() || result.stdout?.trim() || "unknown error"}`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function plistValue(path, key) {
  return run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, path], true).trim();
}

function entitlementString(plist, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return plist.match(new RegExp(`<key>${escaped}<\\/key>\\s*<string>([^<]+)<\\/string>`))?.[1] ?? "";
}
