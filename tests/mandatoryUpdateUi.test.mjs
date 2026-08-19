import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("mandatory update gate blocks only native Android and has no dismiss action", async () => {
  const [layer, localStore, splash, gradle, envExample, renderBlueprint] =
    await Promise.all([
      readFile("src/publicMandatoryUpdateLayer.mjs", "utf8"),
      readFile("src/data/localStore.mjs", "utf8"),
      readFile("src/publicAppSplashLayer.mjs", "utf8"),
      readFile("android/app/build.gradle", "utf8"),
      readFile(".env.example", "utf8"),
      readFile("render.yaml", "utf8")
    ]);

  assert.match(layer, /isNativePlatform/);
  assert.match(layer, /getPlatform/);
  assert.match(layer, /=== "android"/);
  assert.match(layer, /role", "alertdialog"/);
  assert.match(layer, /aria-modal", "true"/);
  assert.match(layer, /צריך לעדכן כדי להמשיך/);
  assert.match(layer, /עדכון עכשיו/);
  assert.match(layer, /app\?\.openStore/);
  assert.match(layer, /market:\/\/details\?id=\$\{ANDROID_PACKAGE_ID\}/);
  assert.match(layer, /event\.preventDefault\(\)/);
  assert.doesNotMatch(layer, /data-action=["'](?:close|dismiss)/);
  assert.doesNotMatch(layer, /mandatory-update-(?:close|dismiss|skip)/);
  assert.match(localStore, /export async function refreshRuntimeConfigNow/);
  assert.match(layer, /INITIAL_UPDATE_CHECK_BUDGET_MS = 1_200/);
  assert.match(layer, /Promise\.race/);
  assert.match(layer, /releaseUpdateCheck\(\);[\s\S]*?await freshConfigRequest/);
  assert.match(splash, /mandatory-update-checking/);
  assert.match(splash, /sogrim:mandatory-update-check/);
  assert.match(gradle, /versionCode 81/);
  assert.match(gradle, /versionName "3\.56"/);
  assert.match(envExample, /ANDROID_MIN_SUPPORTED_BUILD=0/);
  assert.match(renderBlueprint, /key: ANDROID_MIN_SUPPORTED_BUILD\s+value: "0"/);
});

test("mandatory update QA starts and stops its own isolated server", async () => {
  const script = await readFile("scripts/verify-mandatory-android-update.mjs", "utf8");

  assert.match(script, /const qaPort = "4194"/);
  assert.match(script, /spawn\(process\.execPath, \["server\.mjs", qaPort\]/);
  assert.match(script, /APP_LOCAL_STATE_FILE: "\.qa-mandatory-update\/app-state\.json"/);
  assert.match(script, /await waitForHealth\(`\$\{baseUrl\}\/api\/health`\)/);
  assert.match(script, /localQaServer\?\.kill\(\)/);
});

test("mandatory update gate fails open when the policy or build is unknown", async () => {
  const layer = await readFile("src/publicMandatoryUpdateLayer.mjs", "utf8");

  assert.match(layer, /minimumSupportedBuild > 0/);
  assert.match(layer, /currentBuild > 0/);
  assert.match(layer, /currentBuild < minimumSupportedBuild/);
  assert.match(layer, /firstResult\.status === "failed"[\s\S]*?hideUpdateGate\(\)/);
  assert.match(layer, /locally known mandatory update remains blocking while offline/);
});
