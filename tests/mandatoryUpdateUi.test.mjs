import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("native update UI supports both stores, deferral, return from store and safe failure", async () => {
  const [layer, bridge, splash, envExample] = await Promise.all([
    readFile("src/publicMandatoryUpdateLayer.mjs", "utf8"),
    readFile("src/publicNativeBridgeLayer.mjs", "utf8"),
    readFile("src/publicAppSplashLayer.mjs", "utf8"),
    readFile(".env.example", "utf8")
  ]);
  assert.match(layer, /getPlatform/);
  assert.match(layer, /\["android", "ios"\]/);
  assert.match(layer, /decideNativeUpdate/);
  assert.match(layer, /verifiedPolicy/);
  assert.match(layer, /role", "alertdialog"/);
  assert.match(layer, /role", "dialog"/);
  assert.match(layer, /available-update-later/);
  assert.match(layer, /NATIVE_RESUME_EVENT/);
  assert.match(layer, /pendingSharedSyncStatus\(\)\.pending/);
  assert.match(layer, /INITIAL_UPDATE_CHECK_BUDGET_MS = 1_200/);
  assert.match(layer, /Promise\.race/);
  assert.match(bridge, /marketUrl \|\| storeUrl/);
  assert.match(splash, /mandatory-update-checking/);
  assert.match(envExample, /ANDROID_MIN_SUPPORTED_BUILD=0/);
  assert.match(envExample, /ANDROID_UPDATE_CRITICAL=false/);
  assert.match(envExample, /IOS_UPDATE_CRITICAL=false/);
});

test("mandatory update QA runs against its own isolated local server", async () => {
  const script = await readFile("scripts/verify-mandatory-android-update.mjs", "utf8");
  assert.match(script, /const qaPort = "4194"/);
  assert.match(script, /spawn\(process\.execPath, \["server\.mjs", qaPort\]/);
  assert.match(script, /APP_LOCAL_STATE_FILE: "\.qa-mandatory-update\/app-state\.json"/);
  assert.match(script, /await waitForHealth\(`\$\{baseUrl\}\/api\/health`\)/);
  assert.match(script, /localQaServer\?\.kill\(\)/);
});

test("unknown builds and failed checks do not keep the launch screen blocked", async () => {
  const layer = await readFile("src/publicMandatoryUpdateLayer.mjs", "utf8");
  assert.match(layer, /nativeBuildNumber\(\)/);
  assert.match(layer, /firstResult\.status === "failed"/);
  assert.match(layer, /hideUpdatePrompts\(\)/);
  assert.match(layer, /releaseUpdateCheck\(\)/);
});
