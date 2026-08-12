import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const ANDROID_RELEASE_INPUTS = [
  "index.html",
  "styles.css",
  "legal.css",
  "legal.mjs",
  "manifest.webmanifest",
  "privacy.html",
  "support.html",
  "terms.html",
  "accessibility.html",
  "account-deletion.html",
  "sw.js",
  "capacitor.config.json",
  "package.json",
  "package-lock.json",
  "src",
  "assets",
  "www",
  "scripts/build-native-web.mjs",
  "scripts/finalize-native-projects.mjs",
  "scripts/build-android-release.mjs",
  "scripts/release-source-fingerprint.mjs",
  "android/build.gradle",
  "android/settings.gradle",
  "android/variables.gradle",
  "android/app/build.gradle",
  "android/app/capacitor.build.gradle",
  "android/app/proguard-rules.pro",
  "android/app/src"
];

export async function fingerprintAndroidReleaseSource(root) {
  return fingerprintPaths(root, ANDROID_RELEASE_INPUTS);
}

export async function fingerprintPaths(root, inputPaths) {
  const files = [];
  for (const inputPath of inputPaths) {
    await collectFiles(join(root, ...inputPath.split("/")), files);
  }

  files.sort((left, right) => left.localeCompare(right, "en"));
  const hash = createHash("sha256");
  for (const path of files) {
    const normalized = relative(root, path).split(sep).join("/");
    hash.update(normalized);
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }

  return {
    sha256: hash.digest("hex").toUpperCase(),
    fileCount: files.length
  };
}

async function collectFiles(path, output) {
  const file = await stat(path);
  if (file.isFile()) {
    output.push(path);
    return;
  }
  if (!file.isDirectory()) return;

  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    await collectFiles(join(path, entry.name), output);
  }
}
