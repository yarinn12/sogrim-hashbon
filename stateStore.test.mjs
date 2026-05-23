import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("web app manifest declares an installable mobile app", async () => {
  const manifest = JSON.parse(await readFile("manifest.webmanifest", "utf8"));

  assert.equal(manifest.name, "סוגרים חשבון");
  assert.equal(manifest.short_name, "חשבון");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.lang, "he");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.theme_color, "#087b74");
  assert.ok(
    manifest.icons.some(
      (icon) => icon.src === "./icon.svg" && icon.purpose.includes("maskable")
    )
  );
});

test("index links the manifest and mobile app metadata", async () => {
  const html = await readFile("index.html", "utf8");

  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /name="theme-color" content="#087b74"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /rel="apple-touch-icon" href="\.\/icon\.svg"/);
});

test("service worker precaches the app shell", async () => {
  const sw = await readFile("sw.js", "utf8");

  assert.match(sw, /CACHE_FILES/);
  assert.match(sw, /"\/index.html"/);
  assert.match(sw, /"\/styles.css"/);
  assert.match(sw, /"\/src\/app.mjs"/);
  assert.match(sw, /"\/src\/data\/cloudStore.mjs"/);
  assert.match(sw, /"\/src\/domain\/eventFilters.mjs"/);
  assert.match(sw, /"\/src\/data\/localIdentity.mjs"/);
  assert.match(sw, /"\/src\/domain\/launchReadiness.mjs"/);
  assert.match(sw, /"\/src\/domain\/permissions.mjs"/);
  assert.match(sw, /"\/src\/domain\/settlementSummary.mjs"/);
  assert.match(sw, /"\/src\/domain\/stateBackup.mjs"/);
});

test("app registers the service worker when the browser supports it", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /serviceWorker/);
  assert.match(app, /register\("\.\/sw\.js"\)/);
});
