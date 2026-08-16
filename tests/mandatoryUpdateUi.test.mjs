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
  assert.match(splash, /mandatory-update-checking/);
  assert.match(splash, /sogrim:mandatory-update-check/);
  assert.match(gradle, /versionCode 76/);
  assert.match(gradle, /versionName "3\.53"/);
  assert.match(envExample, /ANDROID_MIN_SUPPORTED_BUILD=0/);
  assert.match(renderBlueprint, /key: ANDROID_MIN_SUPPORTED_BUILD\s+value: "0"/);
});

test("mandatory update gate fails open when the policy or build is unknown", async () => {
  const layer = await readFile("src/publicMandatoryUpdateLayer.mjs", "utf8");

  assert.match(layer, /minimumSupportedBuild > 0/);
  assert.match(layer, /currentBuild > 0/);
  assert.match(layer, /currentBuild < minimumSupportedBuild/);
  assert.match(layer, /if \(!initialPolicyRequired\) hideUpdateGate\(\)/);
});
