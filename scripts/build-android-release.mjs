import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { resolveAndroidJavaHome } from "./androidJava.mjs";
import { fingerprintAndroidReleaseSource } from "./release-source-fingerprint.mjs";

const root = process.cwd();
const androidRoot = join(root, "android");
const gradle = process.platform === "win32"
  ? join(androidRoot, "gradlew.bat")
  : join(androidRoot, "gradlew");
const bundle = join(androidRoot, "app", "build", "outputs", "bundle", "release", "app-release.aab");
const releaseManifest = join(androidRoot, "app", "build", "outputs", "bundle", "release", "release-manifest.json");
const mergedManifest = join(
  androidRoot,
  "app",
  "build",
  "intermediates",
  "merged_manifests",
  "release",
  "processReleaseManifest",
  "AndroidManifest.xml"
);
const releaseLock = join(root, "build", "release-locks", "android");
const androidBuild = readFileSync(join(androidRoot, "app", "build.gradle"), "utf8");
const versionCode = Number.parseInt(androidBuild.match(/versionCode\s+(\d+)/)?.[1] ?? "", 10);
const versionName = androidBuild.match(/versionName\s+"([^"]+)"/)?.[1] ?? "";

if (!Number.isSafeInteger(versionCode) || versionCode < 1 || !versionName) {
  throw new Error("Android release version could not be read from android/app/build.gradle.");
}

if (!existsSync(join(androidRoot, "keystore.properties"))) {
  throw new Error("Android upload key is missing. Run npm run native:android:key first.");
}

const env = { ...process.env };
const javaHome = resolveAndroidJavaHome(env);
if (javaHome) env.JAVA_HOME = javaHome;
if (!env.ANDROID_HOME && process.platform === "win32") {
  const bundledSdk = join(homedir(), "AppData", "Local", "Android", "Sdk");
  if (existsSync(bundledSdk)) env.ANDROID_HOME = bundledSdk;
}

// A failed Gradle run must never leave a previous bundle looking releasable.
acquireBuildLock();
rmSync(bundle, { force: true });
rmSync(releaseManifest, { force: true });
const buildStartedAt = Date.now();

const command = process.platform === "win32" ? "cmd.exe" : gradle;
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", gradle, "clean", "bundleRelease", "lintRelease", "--no-daemon"]
  : ["clean", "bundleRelease", "lintRelease", "--no-daemon"];
const result = spawnSync(command, args, {
  cwd: androidRoot,
  env,
  stdio: "inherit",
  shell: false
});
if (result.status !== 0) process.exit(result.status ?? 1);
if (!existsSync(bundle)) throw new Error("Android release bundle was not created.");
if (!existsSync(mergedManifest)) throw new Error("Android merged release manifest was not created.");

const bundleStat = statSync(bundle);
if (bundleStat.mtimeMs + 2_000 < buildStartedAt) {
  throw new Error("Android release bundle is older than the current build run.");
}

const keytool = javaHome
  ? join(javaHome, "bin", process.platform === "win32" ? "keytool.exe" : "keytool")
  : "keytool";
const certificate = spawnSync(keytool, ["-printcert", "-jarfile", bundle], {
  encoding: "utf8",
  env,
  shell: false
});
if (certificate.status !== 0) {
  throw new Error(`Android release signature could not be read: ${certificate.stderr?.trim() || "keytool failed"}`);
}
const certificateText = `${certificate.stdout ?? ""}\n${certificate.stderr ?? ""}`;
const signingSha256 = certificateText.match(/SHA256:\s*([0-9A-F:]{95})/i)?.[1]?.toUpperCase() ?? "";
if (!signingSha256) throw new Error("Android release SHA-256 signing fingerprint is missing.");

const expectedUploadSha256 = readFileSync(
  join(root, "docs", "store-submission", "android-upload-certificate-sha256.txt"),
  "utf8"
).trim().toUpperCase();
if (signingSha256 !== expectedUploadSha256) {
  throw new Error("Android release bundle is not signed by the documented upload certificate.");
}

const sha256 = createHash("sha256").update(readFileSync(bundle)).digest("hex").toUpperCase();
const mergedManifestText = readFileSync(mergedManifest, "utf8");
verifyMergedManifest(mergedManifestText, { versionCode, versionName });
const source = await fingerprintAndroidReleaseSource(root);
writeFileSync(releaseManifest, `${JSON.stringify({
  applicationId: "com.sogrimhashbon.app",
  versionCode,
  versionName,
  minSdkVersion: 24,
  targetSdkVersion: 36,
  builtAt: new Date(bundleStat.mtimeMs).toISOString(),
  bytes: bundleStat.size,
  sha256,
  signingSha256,
  sourceSha256: source.sha256,
  sourceFileCount: source.fileCount
}, null, 2)}\n`, "utf8");

console.log(`Signed Android App Bundle ${versionName} (${versionCode}) is ready: ${bundle}`);
console.log(`Release evidence: ${releaseManifest}`);
releaseBuildLock();

function verifyMergedManifest(manifest, expected) {
  const requiredPatterns = [
    /package="com\.sogrimhashbon\.app"/,
    new RegExp(`android:versionCode="${expected.versionCode}"`),
    new RegExp(`android:versionName="${escapeRegExp(expected.versionName)}"`),
    /android:minSdkVersion="24"/,
    /android:targetSdkVersion="36"/,
    /android:allowBackup="false"/,
    /android:usesCleartextTraffic="false"/,
    /android:name="com\.sogrimhashbon\.app\.MainActivity"[\s\S]*?android:exported="true"/,
    /android:autoVerify="true"[\s\S]*?android:host="sogrim-hashbon\.vercel\.app"[\s\S]*?android:pathPrefix="\/i\/"/,
    /android:autoVerify="true"[\s\S]*?android:host="sogrim-hashbon\.vercel\.app"[\s\S]*?android:pathPrefix="\/r\/"/,
    /android:autoVerify="true"[\s\S]*?android:host="sogrim-hashbon\.vercel\.app"[\s\S]*?android:pathPrefix="\/auth\/callback"/
  ];
  if (requiredPatterns.some((pattern) => !pattern.test(manifest))) {
    throw new Error("Android merged release manifest is missing a required store or security setting.");
  }
  if (/android:debuggable="true"/.test(manifest)) {
    throw new Error("Android release manifest must not be debuggable.");
  }
  if (/android:host="sogrim-hashbon-recovery\.onrender\.com"/.test(manifest)) {
    throw new Error("The recovery API host must not be exposed as an Android App Link domain.");
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function acquireBuildLock() {
  mkdirSync(dirname(releaseLock), { recursive: true });
  try {
    mkdirSync(releaseLock);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let owner = Number.NaN;
    try {
      owner = Number.parseInt(readFileSync(join(releaseLock, "pid"), "utf8"), 10);
    } catch {}
    if (Number.isSafeInteger(owner) && isProcessRunning(owner)) {
      throw new Error(`Another Android release build is already running (PID ${owner}).`);
    }
    rmSync(releaseLock, { recursive: true, force: true });
    mkdirSync(releaseLock);
  }
  writeFileSync(join(releaseLock, "pid"), `${process.pid}\n`, "utf8");
  process.once("exit", releaseBuildLock);
}

function releaseBuildLock() {
  rmSync(releaseLock, { recursive: true, force: true });
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
