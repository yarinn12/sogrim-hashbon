import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the app shows the complete branded video splash until the first real screen renders", async () => {
  const [index, app, styles, splashLayer, introVideo] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("src/app.mjs", "utf8"),
    readFile("styles.css", "utf8"),
    readFile("src/publicAppSplashLayer.mjs", "utf8"),
    readFile("assets/sogrim-logo-intro.mp4")
  ]);

  assert.match(index, /class="app app-boot"/);
  assert.match(index, /aria-busy="true"/);
  assert.match(index, /class="boot-shell"/);
  assert.match(index, /id="app-splash"/);
  assert.match(index, /assets\/sogrim-logo-intro\.mp4/);
  assert.match(index, /assets\/sogrim-logo-intro-poster\.jpg/);
  assert.match(index, /autoplay[\s\S]*?loop[\s\S]*?muted[\s\S]*?playsinline/);
  assert.match(index, /publicAppSplashLayer\.mjs[\s\S]*?src\/app\.mjs/);
  assert.match(app, /app\.classList\.remove\("app-boot"\)/);
  assert.match(app, /app\.removeAttribute\("aria-busy"\)/);
  assert.match(splashLayer, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(splashLayer, /video\.addEventListener\([\s\S]*?"ended"/);
  assert.match(splashLayer, /video\.addEventListener\("playing", startFirstLoopTimer/);
  assert.match(splashLayer, /Math\.ceil\(video\.duration \* 1000\)/);
  assert.match(splashLayer, /MIN_VIDEO_PREVIEW_MS = 1200/);
  assert.match(splashLayer, /MAX_VIDEO_PREVIEW_MS = 3200/);
  assert.match(splashLayer, /VIDEO_LOAD_TIMEOUT_MS = 2500/);
  assert.match(
    splashLayer,
    /Math\.min\(\s*MAX_VIDEO_PREVIEW_MS,\s*Math\.max\(MIN_VIDEO_PREVIEW_MS, sourceDurationMs\)/
  );
  assert.match(splashLayer, /applicationIsReady/);
  assert.match(splashLayer, /account-auth-gate\.account-auth-boot/);
  assert.doesNotMatch(splashLayer, /sessionStorage|hasSeenSplash|rememberSplash/);
  assert.equal(introVideo.toString("ascii", 4, 8), "ftyp");
  assert.ok(introVideo.length > 1_000_000 && introVideo.length < 5_000_000);
  assert.match(styles, /\.app-splash \{/);
  assert.match(styles, /html\.app-splash-active body \{[\s\S]*?background: #d8d4ce/);
  assert.match(styles, /\.app-splash-frame \{[\s\S]*?background: #d8d4ce/);
  assert.match(styles, /\.app-splash-video,[\s\S]*?background: #d8d4ce/);
  assert.match(styles, /\.app-splash-video \{\s*opacity: 1;/);
  assert.doesNotMatch(styles, /\.app-splash-video \{[\s\S]*?transition: opacity/);
  assert.match(styles, /\.app-splash\.is-leaving/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.boot-hero/);
  assert.match(styles, /@keyframes boot-pulse/);
});
