import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { nativeRuntimeCompatibility } from "../src/domain/nativeRuntimeCompatibility.mjs";

const preloadSource = new URL("../scripts/qa/android-native-isolated/offline-build-config.mjs", import.meta.url);
const runtimeSource = new URL("../src/server/runtimeConfig.mjs", import.meta.url).href;

function runFixture(gradle, code, pluginWorkingDirectory = false) {
  const dir = mkdtempSync(join(tmpdir(), "sogrim-offline-bootstrap-"));
  try {
    mkdirSync(join(dir, "android", "app"), { recursive: true });
    writeFileSync(join(dir, "android", "app", "build.gradle"), gradle);
    const preloadPath = join(dir, "scripts", "qa", "android-native-isolated", "offline-build-config.mjs");
    mkdirSync(join(dir, "scripts", "qa", "android-native-isolated"), { recursive: true });
    writeFileSync(preloadPath, readFileSync(preloadSource));
    mkdirSync(join(dir, "src", "server"), { recursive: true });
    // Reuse the real runtime implementation while copying the preload unchanged.
    writeFileSync(join(dir, "src", "server", "runtimeConfig.mjs"),
      `export { getClientRuntimeConfig, getRuntimeConfig } from ${JSON.stringify(runtimeSource)};`);
    const cwd = pluginWorkingDirectory ? join(dir, "node_modules", "@capgo", "capacitor-social-login") : dir;
    if (pluginWorkingDirectory) mkdirSync(cwd, { recursive: true });
    return execFileSync(process.execPath, ["--import", pathToFileURL(preloadPath).href, "--input-type=module", "-e", code], {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD: "1" }
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("inherited preload still reads the app build from a Capacitor plugin hook directory", () => {
  const config = JSON.parse(runFixture("versionCode 188",
    'console.log(JSON.stringify(await (await fetch("https://sogrim-hesbon-app.vercel.app/api/config")).json()))', true));
  assert.equal(config.updates.android.currentBuild, 188);
  assert.deepEqual(nativeRuntimeCompatibility(config, { expectedAndroidBuild: 188 }), { ok: true, reason: "" });
});

for (const build of [187, 188, 244]) {
  test(`offline native bootstrap matches checked-out Android build ${build}`, () => {
    const config = JSON.parse(runFixture(`android { defaultConfig { versionCode ${build} } }`,
      'console.log(JSON.stringify(await (await fetch("https://sogrim-hesbon-app.vercel.app/api/config")).json()))'));
    assert.equal(config.updates.android.currentBuild, build);
    assert.deepEqual(nativeRuntimeCompatibility(config, { expectedAndroidBuild: build }), { ok: true, reason: "" });
    assert.equal(config.storage.url, "https://android-native-qa.supabase.co");
    assert.equal(config.storage.anonKey, "synthetic-android-native-anon");
  });
}

for (const gradle of ["android {}", "versionCode 0", "versionCode invalid"]) {
  test(`offline native bootstrap refuses an unreadable or invalid build: ${gradle}`, () => {
    assert.throws(() => runFixture(gradle, 'console.log("unexpected acceptance")'),
      (error) => error.status !== 0 && /QA Android versionCode could not be read/.test(String(error.stderr)));
  });
}

test("offline native bootstrap still rejects requests outside the synthetic config route", () => {
  const result = runFixture("versionCode 188",
    'try { await fetch("https://example.invalid/api/private"); process.exitCode=1; } catch(error) { console.log(error.message); }');
  assert.match(result, /QA build refuses network: https:\/\/example\.invalid\/api\/private/);
});
