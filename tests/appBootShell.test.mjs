import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the app shows one branded splash only while the first real screen loads", async () => {
  const [index, app, styles, splashLayer, accountAuthLayer, introVideo] =
    await Promise.all([
    readFile("index.html", "utf8"),
    readFile("src/app.mjs", "utf8"),
    readFile("styles.css", "utf8"),
    readFile("src/publicAppSplashLayer.mjs", "utf8"),
    readFile("src/publicAccountAuthLayer.mjs", "utf8"),
    readFile("assets/sogrim-heshbon-loading-loop-v2.mp4")
    ]);

  assert.match(index, /<html[^>]*class="account-auth-pending"/);
  assert.match(index, /class="app app-boot font-hebrew"/);
  assert.match(index, /aria-busy="true"/);
  assert.match(index, /class="boot-shell"/);
  assert.match(index, /id="app-splash"/);
  assert.match(index, /assets\/sogrim-heshbon-loading-loop-v2\.mp4/);
  assert.match(index, /assets\/sogrim-logo-intro-hold\.jpg/);
  assert.doesNotMatch(index, /class="app-splash-poster"/);
  assert.match(index, /poster="\.\/assets\/sogrim-logo-intro-hold\.jpg"/);
  assert.match(index, /autoplay[\s\S]*?loop[\s\S]*?muted[\s\S]*?playsinline/);
  assert.match(index, /publicAppSplashLayer\.mjs[\s\S]*?src\/app\.mjs/);
  assert.match(app, /app\.classList\.remove\("app-boot"\)/);
  assert.match(app, /app\.removeAttribute\("aria-busy"\)/);
  assert.match(splashLayer, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(splashLayer, /startFirstLoopTimer|mediaFinished|sourceDurationMs/);
  assert.match(splashLayer, /VIDEO_LOAD_TIMEOUT_MS = 6000/);
  assert.match(splashLayer, /VIDEO_PROGRESS_TIMEOUT_MS = 4500/);
  assert.match(splashLayer, /VIDEO_STALL_TIMEOUT_MS = 2400/);
  assert.match(splashLayer, /VIDEO_WATCHDOG_INTERVAL_MS = 800/);
  assert.doesNotMatch(splashLayer, /APP_READY_VIDEO_GRACE_MS/);
  assert.match(splashLayer, /VIDEO_PRESENTATION_GRACE_MS = 650/);
  assert.match(splashLayer, /MIN_VIDEO_PRESENTATION_MS = 800/);
  assert.match(splashLayer, /MAX_SPLASH_WAIT_MS = 5500/);
  assert.match(splashLayer, /MAX_SPLASH_RENDER_RETRY_MS = 750/);
  assert.match(splashLayer, /SPLASH_EXIT_MS = 100/);
  assert.doesNotMatch(splashLayer, /Capacitor\?\.Plugins\?\.SplashScreen/);
  assert.match(splashLayer, /settle-friends-skip-next-splash/);
  assert.match(splashLayer, /consumeSplashBypass/);
  assert.match(splashLayer, /const showPosterOnly = consumeSplashBypass\(\)/);
  assert.match(splashLayer, /installSplash\(\{ showPosterOnly \}\)/);
  assert.doesNotMatch(
    splashLayer,
    /if \(consumeSplashBypass\(\)\) \{\s*splash\?\.remove/
  );
  assert.match(splashLayer, /video\.addEventListener\("loadeddata", handleVideoReady/);
  assert.match(splashLayer, /video\.muted = true/);
  assert.match(splashLayer, /video\.defaultMuted = true/);
  assert.match(splashLayer, /video\.playsInline = true/);
  assert.match(splashLayer, /video\.autoplay = true/);
  assert.match(splashLayer, /video\.loop = true/);
  assert.match(splashLayer, /window\.clearTimeout\(loadTimeoutId\)/);
  assert.match(
    splashLayer,
    /progressTimeoutId = window\.setTimeout\(useFallback, VIDEO_PROGRESS_TIMEOUT_MS\)/
  );
  assert.match(splashLayer, /video\.addEventListener\("playing", handleVideoPlaying\)/);
  assert.match(splashLayer, /video\.addEventListener\("timeupdate", handleVideoProgress\)/);
  assert.match(
    splashLayer,
    /function revealPresentedFrame\(\)[\s\S]*?requestVideoFrameCallback[\s\S]*?revealVideo/
  );
  assert.match(splashLayer, /function revealVideo\(\)[\s\S]*?splash\.classList\.add\("is-video-ready"\)/);
  assert.match(splashLayer, /window\.clearTimeout\(progressTimeoutId\)/);
  assert.doesNotMatch(splashLayer, /video\.addEventListener\("ended"/);
  assert.doesNotMatch(splashLayer, /video\.currentTime = 0/);
  assert.match(splashLayer, /function requestPlayback\(\{ fallbackOnFailure = false \} = \{\}\)/);
  assert.match(splashLayer, /dismissed \|\| fallbackMode \|\| playbackPending/);
  assert.match(splashLayer, /playbackPending = true/);
  assert.match(splashLayer, /\.finally\(\(\) => \{\s*playbackPending = false/);
  assert.match(splashLayer, /requestPlayback\(\{ fallbackOnFailure: true \}\)/);
  assert.match(
    splashLayer,
    /loadTimeoutId = window\.setTimeout\(useFallback, VIDEO_LOAD_TIMEOUT_MS\);[\s\S]*?requestPlayback\(\{ fallbackOnFailure: false \}\)/
  );
  assert.doesNotMatch(splashLayer, /video\.play\(\)\?\.catch\(useFallback\)/);
  assert.doesNotMatch(splashLayer, /holdFinalFrame|is-video-complete/);
  assert.match(splashLayer, /applicationIsReady/);
  assert.match(splashLayer, /#public-account-auth-gate/);
  assert.match(
    splashLayer,
    /!accountAuthPending && \(accountGateRendered \|\| appRendered\)/
  );
  assert.match(
    splashLayer,
    /if \(dismissed \|\| !applicationIsReady\(\)\) return;[\s\S]*?dismiss\(\);/
  );
  assert.match(splashLayer, /account-auth-pending/);
  assert.match(splashLayer, /native-styles-pending/);
  assert.match(splashLayer, /sogrim:native-styles-ready/);
  assert.match(splashLayer, /account-auth-ready/);
  assert.match(
    splashLayer,
    /addEventListener\("settle-friends:screen-rendered", dismissWhenReady\)/
  );
  assert.match(
    splashLayer,
    /removeEventListener\("settle-friends:screen-rendered", dismissWhenReady\)/
  );
  assert.match(
    splashLayer,
    /const waitForVideo = videoPresentedAt[\s\S]*?presentationWaitId = window\.setTimeout\(dismissWhenReady, waitForVideo\)/
  );
  assert.match(
    splashLayer,
    /function dismissAfterMaximumWait\(\)[\s\S]*?app\.classList\.contains\("app-boot"\)[\s\S]*?dismiss\(\)/
  );
  assert.match(
    splashLayer,
    /maximumWaitId = window\.setTimeout\([\s\S]*?dismissAfterMaximumWait,[\s\S]*?MAX_SPLASH_WAIT_MS/
  );
  assert.match(
    splashLayer,
    /Date\.now\(\) - lastProgressAt > VIDEO_STALL_TIMEOUT_MS[\s\S]*?useFallback\(\)/
  );
  assert.match(splashLayer, /visibilitychange/);
  assert.doesNotMatch(splashLayer, /account-auth-gate\.account-auth-boot/);
  assert.match(splashLayer, /window\.sessionStorage\.removeItem\(SKIP_NEXT_SPLASH_MARKER\)/);
  assert.match(
    accountAuthLayer,
    /setSessionValue\(SKIP_NEXT_SPLASH_MARKER, "1"\)[\s\S]*?window\.location\.reload\(\);\s*return;/
  );
  assert.match(accountAuthLayer, /function markAccountAuthReady\(\)/);
  assert.match(accountAuthLayer, /lockAccountGate\(\)/);
  assert.match(accountAuthLayer, /ACCOUNT_SETUP_TIMEOUT_MS = 12_000/);
  assert.match(accountAuthLayer, /function renderAccountRecoveryGate\(\)/);
  assert.match(accountAuthLayer, /data-account-retry/);
  assert.doesNotMatch(accountAuthLayer, /renderAccountBootGate|account-auth-boot/);
  assert.match(accountAuthLayer, /classList\.remove\("account-auth-pending"\)/);
  assert.match(accountAuthLayer, /new Event\("account-auth-ready"\)/);
  assert.doesNotMatch(splashLayer, /hasSeenSplash|rememberSplash/);
  assert.equal(introVideo.toString("ascii", 4, 8), "ftyp");
  assert.ok(introVideo.length > 100_000 && introVideo.length < 500_000);
  assert.match(styles, /\.app-splash \{/);
  assert.doesNotMatch(styles, /html\.native-app \.app-splash::before/);
  assert.equal(splashLayer.match(/setNativeSystemBarStyle\(true\)/g)?.length, 2);
  assert.match(splashLayer, /notifyNativeWebSplashReady/);
  assert.match(splashLayer, /SogrimCapabilities\?\.notifyWebSplashReady/);
  assert.match(
    splashLayer,
    /document\.documentElement\.classList\.add\("app-splash-active"\);[\s\S]*?notifyNativeWebSplashReady\(\);/
  );
  assert.doesNotMatch(splashLayer, /setNativeSystemBarStyle\(false\)/);
  assert.match(index, /width="1080"[\s\S]*?height="1920"/);
  assert.match(styles, /html\.app-splash-active body \{[\s\S]*?background: #fff/);
  assert.match(styles, /\.app-splash-frame \{[\s\S]*?aspect-ratio: 9 \/ 16/);
  assert.match(styles, /\.app-splash-frame \{[\s\S]*?background: #fff/);
  assert.doesNotMatch(styles, /\.app-splash-frame::after/);
  assert.match(styles, /\.app-splash-video,[\s\S]*?\.app-splash-hold[\s\S]*?background: #fff/);
  assert.match(index, /poster="\.\/assets\/sogrim-logo-intro-hold\.jpg"/);
  assert.match(styles, /\.app-splash-video \{\s*opacity: 0;/);
  assert.match(styles, /\.app-splash-hold \{\s*opacity: 1;/);
  assert.doesNotMatch(styles, /\.app-splash-video \{[\s\S]*?transition: opacity 80ms linear/);
  assert.match(styles, /\.app-splash\.is-video-ready \.app-splash-video \{[\s\S]*?opacity: 1/);
  assert.match(styles, /\.app-splash\.is-video-ready \.app-splash-hold \{[\s\S]*?opacity: 0/);
  assert.match(styles, /\.app-splash\.is-fallback \.app-splash-video \{[\s\S]*?display: none/);
  assert.match(styles, /\.app-splash\.is-fallback \.app-splash-hold \{[\s\S]*?opacity: 1/);
  assert.doesNotMatch(styles, /\.app-splash\.is-video-complete/);
  assert.match(styles, /\.app-splash\.is-leaving/);
  assert.match(
    styles,
    /\.app-splash\.is-leaving \{[\s\S]*?opacity: 0;[\s\S]*?visibility: visible;[\s\S]*?transition: opacity 80ms ease-out;/
  );
  assert.match(splashLayer, /video\.readyState >= 2/);
  assert.match(splashLayer, /splash\.setAttribute\("inert", ""\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.boot-hero/);
  assert.match(styles, /@keyframes boot-pulse/);
});
