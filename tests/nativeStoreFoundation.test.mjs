import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Capacitor store projects use a stable app id and local web bundle", async () => {
  const [config, packageJson, buildScript, finalizer] = await Promise.all([
    readFile("capacitor.config.json", "utf8").then(JSON.parse),
    readFile("package.json", "utf8").then(JSON.parse),
    readFile("scripts/build-native-web.mjs", "utf8"),
    readFile("scripts/finalize-native-projects.mjs", "utf8")
  ]);

  assert.equal(config.appId, "com.sogrimhashbon.app");
  assert.equal(config.webDir, "www");
  assert.match(packageJson.scripts["native:prepare"], /cap sync/);
  assert.match(packageJson.scripts["native:prepare"], /finalize-native-projects/);
  assert.match(packageJson.scripts["native:android:release"], /build-android-release/);
  assert.ok(packageJson.dependencies["@capacitor/app"]);
  assert.ok(packageJson.dependencies["@capacitor/share"]);
  assert.match(buildScript, /sogrim-home-hero\.png/);
  assert.match(buildScript, /sogrim-logo-lockup\.png/);
  assert.match(buildScript, /sogrim-share-logo\.png/);
  assert.match(buildScript, /assets\/sogrim-logo-intro\.mp4/);
  assert.match(buildScript, /assets\/sogrim-logo-intro-poster\.jpg/);
  assert.match(buildScript, /await cp\(join\(root, "src"\)/);
  assert.match(finalizer, /replaceAll\("\\\\", "\/"\)/);
});

test("native projects include store signing and Apple privacy requirements", async () => {
  const [androidVariables, androidBuild, entitlements, privacy, iosProject] = await Promise.all([
    readFile("android/variables.gradle", "utf8"),
    readFile("android/app/build.gradle", "utf8"),
    readFile("ios/App/App/App.entitlements", "utf8"),
    readFile("ios/App/App/PrivacyInfo.xcprivacy", "utf8"),
    readFile("ios/App/App.xcodeproj/project.pbxproj", "utf8")
  ]);

  assert.match(androidVariables, /targetSdkVersion\s*=\s*36/);
  assert.match(androidBuild, /keystore\.properties/);
  assert.match(androidBuild, /signingConfig signingConfigs\.release/);
  assert.match(entitlements, /com\.apple\.developer\.applesignin/);
  assert.match(entitlements, /com\.apple\.developer\.associated-domains/);
  assert.match(privacy, /NSPrivacyCollectedDataTypeEmailAddress/);
  assert.match(privacy, /NSPrivacyCollectedDataTypeOtherFinancialInfo/);
  assert.match(privacy, /NSPrivacyTracking[\s\S]*?<false\/>/);
  assert.match(iosProject, /PrivacyInfo\.xcprivacy in Resources/);
});

test("native bridge handles deep links, Android back, share and OAuth return", async () => {
  const [index, bridge, localStore, authLayer, sw] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("src/publicNativeBridgeLayer.mjs", "utf8"),
    readFile("src/data/localStore.mjs", "utf8"),
    readFile("src/publicAccountAuthLayer.mjs", "utf8"),
    readFile("sw.js", "utf8")
  ]);

  assert.match(index, /publicNativeBridgeLayer\.mjs/);
  assert.match(bridge, /appUrlOpen/);
  assert.match(bridge, /backButton/);
  assert.match(bridge, /dialogBack\.click\(\)/);
  assert.match(bridge, /appBack\.click\(\)/);
  assert.doesNotMatch(bridge, /history\.length > 1/);
  assert.match(bridge, /sharePlugin\.share/);
  assert.match(bridge, /com\.sogrimhashbon\.app:\/\/auth\/callback/);
  assert.match(localStore, /NATIVE_API_ORIGIN/);
  assert.match(authLayer, /SogrimNative\?\.openAuth/);
  assert.match(sw, /publicNativeBridgeLayer\.mjs/);
});
