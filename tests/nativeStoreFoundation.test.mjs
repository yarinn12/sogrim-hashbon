import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  nativeDestination,
  nativePublicOrigin
} from "../src/domain/nativeDeepLinks.mjs";

test("Capacitor store projects use a stable app id and local web bundle", async () => {
  const [config, packageJson, buildScript, finalizer, nativeSmoke, nativeBenchmark, androidQaMetrics] = await Promise.all([
    readFile("capacitor.config.json", "utf8").then(JSON.parse),
    readFile("package.json", "utf8").then(JSON.parse),
    readFile("scripts/build-native-web.mjs", "utf8"),
    readFile("scripts/finalize-native-projects.mjs", "utf8"),
    readFile("scripts/verify-android-native-smoke.mjs", "utf8"),
    readFile("scripts/benchmark-android-startup.mjs", "utf8"),
    readFile("scripts/androidQaMetrics.mjs", "utf8")
  ]);

  assert.equal(config.appId, "com.sogrimhashbon.app");
  assert.equal(config.webDir, "www");
  assert.match(packageJson.scripts["native:prepare"], /cap sync/);
  assert.match(packageJson.scripts["native:prepare"], /finalize-native-projects/);
  assert.match(packageJson.scripts["native:android:release"], /build-android-release/);
  assert.equal(packageJson.scripts["qa:android-native"], "node scripts/verify-android-native-smoke.mjs");
  assert.equal(packageJson.scripts["qa:android-benchmark"], "node scripts/benchmark-android-startup.mjs");
  assert.ok(packageJson.dependencies["@capacitor/app"]);
  assert.ok(packageJson.dependencies["@capacitor/app-launcher"]);
  assert.ok(packageJson.dependencies["@capacitor/share"]);
  assert.ok(packageJson.dependencies["@capacitor/push-notifications"]);
  assert.ok(packageJson.dependencies["@capgo/capacitor-social-login"]);
  assert.deepEqual(config.plugins.SocialLogin.providers, {
    google: true,
    facebook: false,
    apple: false,
    twitter: false
  });
  assert.deepEqual(config.ios.includePlugins, [
    "@capacitor/app",
    "@capacitor/browser",
    "@capacitor/haptics",
    "@capacitor/share"
  ]);
  assert.ok(!config.ios.includePlugins.includes("@capacitor-community/admob"));
  assert.ok(!config.ios.includePlugins.includes("@capacitor/push-notifications"));
  assert.match(buildScript, /sogrim-home-hero\.png/);
  assert.match(buildScript, /legal\.mjs/);
  assert.match(buildScript, /sogrim-logo-lockup\.png/);
  assert.match(buildScript, /sogrim-share-logo\.png/);
  assert.match(buildScript, /assets\/sogrim-logo-intro\.mp4/);
  assert.match(buildScript, /assets\/sogrim-logo-intro-poster\.jpg/);
  assert.match(buildScript, /assets\/sogrim-logo-intro-hold\.jpg/);
  assert.match(buildScript, /await cp\(join\(root, "src"\)/);
  assert.match(buildScript, /from "esbuild"/);
  assert.match(buildScript, /from "lightningcss"/);
  assert.match(buildScript, /minifyStaticCssTemplatesPlugin/);
  assert.match(buildScript, /native-prelude\.mjs/);
  assert.match(buildScript, /native-core\.mjs/);
  assert.match(buildScript, /native-auth\.mjs/);
  assert.match(buildScript, /loadNativeBootstrapRuntimeConfig/);
  assert.match(buildScript, /runtimeApiOrigins\(\{ publicUrl: publicAppOrigin \}\)/);
  assert.match(buildScript, /apiBaseUrl/);
  assert.match(buildScript, /globalThis\.SogrimNativeRuntimeConfig/);
  assert.match(buildScript, /loadEnvFile\(join\(root, "\.env\.local"\), buildEnv\)/);
  assert.match(buildScript, /validateNativeBootstrapConfig/);
  assert.match(buildScript, /expectedAndroidBuild: androidBuild/);
  assert.match(buildScript, /nativeRuntimeCompatibility/);
  assert.match(buildScript, /Refusing to build a disconnected store release/);
  assert.doesNotMatch(buildScript, /Native runtime bootstrap was omitted/);
  assert.match(buildScript, /native-account\.mjs/);
  assert.match(buildScript, /native-experience\.mjs/);
  assert.match(buildScript, /moduleScripts\.filter/);
  assert.match(finalizer, /replaceAll\("\\\\", "\/"\)/);
  assert.match(nativeSmoke, /webview_devtools_remote_/);
  assert.match(nativeSmoke, /Runtime\.evaluate/);
  assert.match(nativeSmoke, /account-auth-pending/);
  assert.match(nativeSmoke, /timeOriginMs: Math\.round\(performance\.timeOrigin\)/);
  assert.match(nativeSmoke, /startupElapsedMs\(state, startedAt\)/);
  assert.match(nativeSmoke, /25_000/);
  assert.match(nativeSmoke, /ANDROID_QA_DEVICE/);
  assert.match(androidQaMetrics, /Multiple Android devices are connected/);
  assert.match(nativeSmoke, /ro\.product\.model/);
  assert.match(nativeSmoke, /primarySurfaceVisible/);
  assert.match(nativeSmoke, /public-account-auth-gate/);
  assert.match(nativeSmoke, /actionableControlCount/);
  assert.match(nativeSmoke, /resourceTimings/);
  assert.match(nativeSmoke, /navigationTiming/);
  assert.match(nativeSmoke, /versionCode/);
  assert.match(nativeSmoke, /FATAL EXCEPTION/);
  assert.match(nativeSmoke, /pm", "get-app-links/);
  assert.match(nativeSmoke, /ANDROID_QA_REQUIRE_APP_LINKS/);
  assert.match(nativeSmoke, /releaseAppLinksRequired/);
  assert.match(nativeBenchmark, /ANDROID_BENCHMARK_RUNS/);
  assert.match(nativeBenchmark, /com\.sogrimhashbon\.app\.benchmark/);
  assert.match(androidQaMetrics, /p75/);
  assert.match(nativeBenchmark, /startup-benchmark\.json/);
  assert.match(nativeBenchmark, /measuredDevices/);
  assert.match(nativeBenchmark, /failedRuns/);
  assert.match(nativeBenchmark, /ANDROID_BENCHMARK_MAX_P75_MS/);
  assert.match(nativeBenchmark, /summarizeResources/);
  assert.match(nativeBenchmark, /readExpectedVersionCode/);
  assert.match(nativeBenchmark, /does not match project build/);
  assert.match(nativeBenchmark, /executedRuns/);
});

test("native projects include store signing and Apple privacy requirements", async () => {
  const [androidVariables, androidBuild, androidManifest, androidFilePaths, androidActivity, capabilitiesPlugin, appSplash, androidStyles, entitlements, privacy, iosProject] = await Promise.all([
    readFile("android/variables.gradle", "utf8"),
    readFile("android/app/build.gradle", "utf8"),
    readFile("android/app/src/main/AndroidManifest.xml", "utf8"),
    readFile("android/app/src/main/res/xml/file_paths.xml", "utf8"),
    readFile("android/app/src/main/java/com/sogrimhashbon/app/MainActivity.java", "utf8"),
    readFile("android/app/src/main/java/com/sogrimhashbon/app/SogrimCapabilitiesPlugin.java", "utf8"),
    readFile("src/publicAppSplashLayer.mjs", "utf8"),
    readFile("android/app/src/main/res/values/styles.xml", "utf8"),
    readFile("ios/App/App/App.entitlements", "utf8"),
    readFile("ios/App/App/PrivacyInfo.xcprivacy", "utf8"),
    readFile("ios/App/App.xcodeproj/project.pbxproj", "utf8")
  ]);

  assert.match(androidVariables, /targetSdkVersion\s*=\s*36/);
  assert.match(androidBuild, /keystore\.properties/);
  assert.match(androidBuild, /signingConfig signingConfigs\.release/);
  assert.match(androidBuild, /applicationIdSuffix "\.debug"/);
  assert.match(androidBuild, /versionNameSuffix "-debug"/);
  assert.match(androidBuild, /benchmark\s*\{/);
  assert.match(androidBuild, /applicationIdSuffix "\.benchmark"/);
  assert.match(androidBuild, /versionNameSuffix "-benchmark"/);
  assert.match(androidBuild, /signingConfig signingConfigs\.debug/);
  assert.match(androidBuild, /buildConfigField "boolean", "NATIVE_QA_WEBVIEW", "true"/);
  assert.match(
    androidBuild,
    /debug[\s\S]*?buildConfigField "boolean", "FIREBASE_PUSH_CONFIGURED", "false"/
  );
  assert.match(androidBuild, /if \(servicesJSON\.text && !localQaBuildRequested\)/);
  assert.match(androidManifest, /android:autoVerify="true"/);
  assert.match(androidManifest, /android:pathPrefix="\/i\/"/);
  assert.match(androidManifest, /android:pathPrefix="\/r\/"/);
  assert.match(androidManifest, /android:pathPrefix="\/auth\/callback"/);
  assert.equal(
    androidManifest.match(/android:host="sogrim-hashbon\.vercel\.app"/g)?.length,
    3
  );
  assert.doesNotMatch(
    androidManifest,
    /android:host="sogrim-hashbon-recovery\.onrender\.com"/
  );
  assert.doesNotMatch(androidManifest, /android:scheme="com\.sogrimhashbon\.app"/);
  assert.match(androidFilePaths, /<cache-path name="shared_cache" path="\." \/>/);
  assert.doesNotMatch(androidFilePaths, /<external-path/);
  assert.doesNotMatch(
    androidManifest,
    /android:host="sogrim-hashbon\.vercel\.app"\s*\/>/
  );
  assert.match(androidActivity, /SplashScreen\.installSplashScreen\(this\)/);
  assert.match(androidActivity, /setBackgroundColor\(Color\.rgb\(217, 213, 207\)\)/);
  assert.match(androidActivity, /setKeepOnScreenCondition/);
  assert.match(androidActivity, /getProgress\(\) < 25/);
  assert.match(androidActivity, /SPLASH_SAFETY_TIMEOUT_MS = 1_800L/);
  assert.match(androidActivity, /setLightStatusBars/);
  assert.match(capabilitiesPlugin, /setSystemBarStyle/);
  assert.equal(appSplash.match(/setNativeSystemBarStyle\(true\)/g)?.length, 2);
  assert.doesNotMatch(appSplash, /setNativeSystemBarStyle\(false\)/);
  assert.match(androidActivity, /BuildConfig\.NATIVE_QA_WEBVIEW/);
  assert.match(androidActivity, /WebView\.setWebContentsDebuggingEnabled\(true\)/);
  assert.match(androidActivity, /setAppearanceLightStatusBars\(lightStatusBars\)/);
  assert.match(androidActivity, /setAppearanceLightNavigationBars\(true\)/);
  assert.match(androidActivity, /setNavigationBarColor/);
  assert.match(androidStyles, /android:statusBarColor/);
  assert.match(androidStyles, /android:windowLightStatusBar">true/);
  assert.doesNotMatch(androidStyles, /android:windowLightNavigationBar/);
  assert.match(entitlements, /com\.apple\.developer\.applesignin/);
  assert.match(entitlements, /com\.apple\.developer\.associated-domains/);
  assert.doesNotMatch(entitlements, /aps-environment/);
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
  assert.match(index, /publicMandatoryUpdateLayer\.mjs/);
  assert.match(bridge, /appUrlOpen/);
  assert.match(bridge, /getLaunchUrl/);
  assert.match(bridge, /backButton/);
  assert.match(bridge, /\.app-choice-picker \.app-choice-picker-close/);
  assert.match(bridge, /new CustomEvent\(NATIVE_BACK_EVENT/);
  assert.match(bridge, /if \(!window\.dispatchEvent\(backRequest\)\)/);
  assert.doesNotMatch(bridge, /history\.length > 1/);
  assert.match(bridge, /sharePlugin\.share/);
  assert.match(bridge, /appLauncherPlugin\.openUrl/);
  assert.match(bridge, /marketUrl/);
  assert.match(bridge, /NATIVE_AUTH_PATH.*nativePublicOrigin/s);
  assert.match(bridge, /history\.replaceState\(history\.state, "", destination\)/);
  assert.match(bridge, /window\.location\.reload\(\)/);
  assert.match(localStore, /runtimePublicOrigin/);
  assert.match(localStore, /X-Sogrim-Platform/);
  assert.match(localStore, /X-Sogrim-App-Build/);
  assert.match(localStore, /Plugins\?\.App\?\.getInfo/);
  assert.match(authLayer, /SogrimNative\?\.openAuth/);
  assert.match(sw, /publicNativeBridgeLayer\.mjs/);
  assert.match(sw, /publicMandatoryUpdateLayer\.mjs/);
  assert.match(sw, /nativeDeepLinks\.mjs/);
  assert.match(
    await readFile("server.mjs", "utf8"),
    /url\.pathname === "\/auth\/callback"/
  );
});

test("native deep links preserve compact invite credentials on warm and cold Android launches", () => {
  const eventId = "event-safe";
  const spaceId = "space-safe";
  const spaceKey = "a".repeat(40);
  const referralCode = "ABCDEF0123456789ABCD";
  const destination = nativeDestination(
    `https://sogrim-hashbon.vercel.app/i/${eventId}/${spaceId}/${spaceKey}?ref=${referralCode}&ignored=value#invite`
  );
  const destinationUrl = new URL(destination, "https://localhost/");

  assert.equal(destinationUrl.pathname, "/");
  assert.equal(destinationUrl.searchParams.get("event"), eventId);
  assert.equal(destinationUrl.searchParams.get("space"), spaceId);
  assert.equal(destinationUrl.searchParams.get("key"), spaceKey);
  assert.equal(destinationUrl.searchParams.get("ref"), referralCode.toLowerCase());
  assert.equal(destinationUrl.searchParams.has("ignored"), false);
  assert.equal(destinationUrl.hash, "#invite");
  assert.equal(
    nativeDestination("https://sogrim-hashbon.vercel.app/?event=e1&invite=safe"),
    "./?event=e1&invite=safe"
  );
  assert.equal(
    nativeDestination(
      `https://sogrim-hashbon.vercel.app/r/${referralCode.toUpperCase()}`
    ),
    `./?ref=${referralCode.toLowerCase()}`
  );
  assert.equal(
    nativeDestination(
      "https://sogrim-hashbon.vercel.app/auth/callback?code=one-time#done"
    ),
    "./?code=one-time#done"
  );
});

test("native deep links preserve revocable invite tokens on warm and cold Android launches", () => {
  const eventId = "event-safe";
  const inviteToken = "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456";
  const referralCode = "ABCDEF0123456789ABCD";
  const destination = nativeDestination(
    `https://sogrim-hashbon.vercel.app/i/${eventId}/t/${inviteToken}?ref=${referralCode}`
  );
  const destinationUrl = new URL(destination, "https://localhost/");

  assert.equal(destinationUrl.pathname, "/");
  assert.equal(destinationUrl.searchParams.get("event"), eventId);
  assert.equal(destinationUrl.searchParams.get("t"), inviteToken);
  assert.equal(destinationUrl.searchParams.get("ref"), referralCode.toLowerCase());
});

test("native runtime accepts a configured provider-independent public origin", () => {
  const publicUrl = "https://app.sogrim.example";
  const eventId = "event-safe";
  const inviteToken = "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456";

  assert.equal(nativePublicOrigin({ publicUrl }), publicUrl);
  assert.equal(
    nativeDestination(
      `${publicUrl}/i/${eventId}/t/${inviteToken}`,
      { publicHosts: new Set([new URL(publicUrl).hostname]) }
    ),
    `./?event=${eventId}&t=${inviteToken}`
  );
});

test("native deep links reject foreign hosts, unsafe routes and forged auth callbacks", () => {
  const compactInvitePath = `/i/event-safe/space-safe/${"a".repeat(40)}`;

  assert.equal(nativeDestination("https://example.com/?event=e1&key=secret"), "");
  assert.equal(nativeDestination("https://sogrim-hashbon.vercel.app/privacy"), "");
  assert.equal(
    new URL(
      nativeDestination(
        `https://sogrim-hashbon.vercel.app${compactInvitePath}?ref=%3Cscript%3Ealert(1)%3C%2Fscript%3E#safe`
      ),
      "https://localhost/"
    ).searchParams.has("ref"),
    false
  );
  assert.equal(nativeDestination("com.sogrimhashbon.app://evil/callback?code=1"), "");
  assert.equal(nativeDestination("com.sogrimhashbon.app://auth/callback?code=1#done"), "");
});
