import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { posix as path } from "node:path";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function collectBrowserModules(entryPaths) {
  const pending = [...entryPaths];
  const discovered = new Set();

  while (pending.length) {
    const modulePath = pending.pop();
    if (discovered.has(modulePath)) continue;

    discovered.add(modulePath);
    const source = await readFile(modulePath.slice(1), "utf8");
    const imports = [
      ...source.matchAll(/from\s+["'](\.[^"']+\.mjs)["']/g),
      ...source.matchAll(/import\s+["'](\.[^"']+\.mjs)["']/g)
    ];

    for (const match of imports) {
      const resolved = path.resolve(path.dirname(modulePath), match[1]);
      if (resolved.startsWith("/src/")) pending.push(resolved);
    }
  }

  return [...discovered].sort();
}

test("web app manifest declares an installable mobile app", async () => {
  const manifest = JSON.parse(await readFile("manifest.webmanifest", "utf8"));

  assert.equal(manifest.name, "סוגרים חשבון");
  assert.equal(manifest.short_name, "סוגרים חשבון");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "./");
  assert.deepEqual(manifest.display_override, ["standalone"]);
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.lang, "he");
  assert.equal(manifest.start_url, "./?pwa_release=403");
  assert.equal(manifest.theme_color, "#0b3b38");
  assert.deepEqual(manifest.categories, ["finance", "productivity", "utilities"]);
  assert.equal(manifest.shortcuts[0].url, "./?pwa_release=403&action=new-event");
  assert.ok(
    manifest.icons.some(
      (icon) => icon.src === "./app-icon-exterior-maskable-512.png" && icon.purpose.includes("maskable")
    )
  );
  assert.ok(manifest.icons.some((icon) => icon.src === "./app-icon-exterior-192.png" && icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.src === "./app-icon-exterior-512.png" && icon.sizes === "512x512"));
});

test("index links the manifest and mobile app metadata", async () => {
  const html = await readFile("index.html", "utf8");
  const currentRelease = html.match(/data-pwa-release="(\d+)"/)?.[1];
  const referencedReleases = [...html.matchAll(/pwa_release=(\d+)/g)].map((match) => match[1]);

  assert.ok(currentRelease);
  assert.deepEqual([...new Set(referencedReleases)], [currentRelease]);
  assert.match(
    html,
    /rel="manifest" href="\.\/manifest\.webmanifest\?pwa_release=403"/
  );
  assert.match(html, /data-pwa-release="403"/);
  assert.match(html, /name="theme-color" content="#10312b"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(html, /name="format-detection" content="telephone=no"/);
  assert.match(html, /viewport-fit=cover/);
  assert.doesNotMatch(html, /interactive-widget/);
  assert.match(html, /rel="icon" href="\.\/app-icon-exterior-192\.png" type="image\/png"/);
  assert.match(html, /rel="apple-touch-icon" href="\.\/apple-touch-icon\.png"/);
  assert.match(html, /href="\.\/styles\.css\?pwa_release=403"/);
  assert.match(html, /src="\.\/src\/pwaBootstrap\.mjs\?pwa_release=403"/);
  assert.match(html, /publicInstallAppLayer\.mjs\?pwa_release=403/);
});

test("server serves install icons with the correct image type", async () => {
  const server = await readFile("server.mjs", "utf8");
  const config = JSON.parse(await readFile("vercel.json", "utf8"));

  assert.match(server, /"\.png": "image\/png"/);
  assert.ok(config.builds.some((entry) => entry.src === "*.png" && entry.use === "@vercel/static"));
  assert.match(await readFile(".vercelignore", "utf8"), /^!icon-192\.png$/m);
  assert.match(await readFile(".vercelignore", "utf8"), /^!icon-maskable-512\.png$/m);
  assert.match(await readFile(".vercelignore", "utf8"), /^!app-icon-exterior-192\.png$/m);
  assert.match(await readFile(".vercelignore", "utf8"), /^!app-icon-exterior-maskable-512\.png$/m);
  assert.match(await readFile(".vercelignore", "utf8"), /^!apple-touch-icon\.png$/m);
});

test("service worker precaches the app shell", async () => {
  const sw = await readFile("sw.js", "utf8");

  assert.match(sw, /CACHE_FILES/);
  assert.match(sw, /"\/index.html"/);
  assert.match(sw, /"\/styles.css"/);
  assert.match(sw, /"\/privacy.html"/);
  assert.match(sw, /"\/support.html"/);
  assert.match(sw, /"\/terms.html"/);
  assert.match(sw, /"\/accessibility.html"/);
  assert.match(sw, /"\/account-deletion.html"/);
  assert.match(sw, /"\/src\/app.mjs"/);
  assert.match(sw, /"\/src\/pwaBootstrap.mjs"/);
  assert.match(sw, /"\/src\/data\/cloudStore.mjs"/);
  assert.match(sw, /"\/src\/domain\/eventFilters.mjs"/);
  assert.match(sw, /"\/src\/domain\/usernames.mjs"/);
  assert.match(sw, /"\/src\/domain\/googleAuth.mjs"/);
  assert.match(sw, /"\/src\/data\/localIdentity.mjs"/);
  assert.match(sw, /"\/src\/domain\/launchReadiness.mjs"/);
  assert.match(sw, /"\/src\/domain\/permissions.mjs"/);
  assert.match(sw, /"\/src\/domain\/settlementSummary.mjs"/);
  assert.match(sw, /"\/src\/domain\/stateBackup.mjs"/);
  assert.match(sw, /"\/src\/publicGoogleAuthLayer.mjs"/);
  assert.match(sw, /"\/src\/publicInstallAppLayer.mjs"/);
  assert.match(sw, /"\/brand-mark\.png"/);
  assert.match(sw, /"\/sogrim-logo-lockup\.png"/);
  assert.match(sw, /"\/sogrim-share-logo\.png"/);
  assert.match(sw, /"\/icon-192.png"/);
  assert.match(sw, /"\/app-icon-exterior-192.png"/);
  assert.match(sw, /event\.request\.mode === "navigate"/);
});

test("service worker loads heavy brand media on demand and reuses it", async () => {
  const sw = await readFile("sw.js", "utf8");

  assert.match(sw, /const LAZY_MEDIA_FILES = new Set/);
  assert.match(sw, /"\/assets\/sogrim-heshbon-loading-loop-v2\.mp4"/);
  assert.match(sw, /"\/sogrim-home-hero\.png"/);
  assert.match(sw, /const PRECACHE_FILES = CACHE_FILES\.filter/);
  assert.match(sw, /precacheFreshFiles\(cache\)/);
  assert.match(sw, /url\.searchParams\.set\("pwa_release", PWA_RELEASE\)/);
  assert.match(sw, /fetch\(url, \{ cache: "no-store" \}\)/);
  assert.match(sw, /if \(LAZY_MEDIA_FILES\.has\(url\.pathname\)\)/);
  assert.match(sw, /const cached = await caches\.match\(request\)/);
  assert.match(sw, /if \(cached\) return cached/);
});

test("service worker precaches every browser module used by the public app", async () => {
  const html = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");
  const entryPaths = [...html.matchAll(/<script type="module" src="\.([^"?]+\.mjs)(?:\?pwa_release=\d+)?"><\/script>/g)]
    .map((match) => match[1]);
  const modulePaths = await collectBrowserModules(entryPaths);

  assert.ok(modulePaths.length > 10, "expected the public app module scripts to be discovered");

  for (const modulePath of modulePaths) {
    assert.match(
      sw,
      new RegExp(`"${escapeRegExp(modulePath)}"`),
      `${modulePath} should be listed in CACHE_FILES`
    );
  }
});

test("service worker never caches private invite credentials", async () => {
  const serviceWorker = await readFile("sw.js", "utf8");

  assert.match(serviceWorker, /searchParams\.has\("t"\)/);
  assert.match(serviceWorker, /searchParams\.has\("key"\)/);
  assert.match(serviceWorker, /searchParams\.has\("invite"\)/);
  assert.match(serviceWorker, /searchParams\.has\("friend"\)/);
  assert.match(serviceWorker, /searchParams\.has\("ref"\)/);
  assert.match(serviceWorker, /pathname\.startsWith\("\/r\/"\)/);
  assert.match(serviceWorker, /isPrivateInviteUrl/);
  assert.match(serviceWorker, /fetchPrivateInvite/);
  assert.match(serviceWorker, /\^\\\/i\\\//);
  assert.match(serviceWorker, /cache: "no-store"/);
  assert.match(serviceWorker, /response\.status === 200/);
  assert.match(serviceWorker, /!event\.request\.headers\.has\("range"\)/);
  assert.match(serviceWorker, /await cache\.put\(event\.request, response\.clone\(\)\)/);
});

test("service worker leaves cross-origin and partial responses outside the app cache", async () => {
  const serviceWorker = await readFile("sw.js", "utf8");

  assert.match(serviceWorker, /url\.origin === self\.location\.origin/);
  assert.match(serviceWorker, /!sameOrigin/);
  assert.match(serviceWorker, /response\.status === 200/);
  assert.match(serviceWorker, /headers\.has\("range"\)/);
});

test("the early PWA bootstrap checks for updates before the full app finishes loading", async () => {
  const bootstrap = await readFile("src/pwaBootstrap.mjs", "utf8");

  assert.match(bootstrap, /startPwaLifecycle\(\)/);
  assert.match(bootstrap, /SERVICE_WORKER_URL = `\/sw\.js\?pwa_release=\$\{PWA_RELEASE\}`/);
  assert.match(bootstrap, /updateViaCache: "none"/);
  assert.match(bootstrap, /checkForUpdate = \(\) => registration[\s\S]*?\.update\(\)[\s\S]*?\.then\(activateWaitingWorker\)/);
  assert.match(bootstrap, /registration\.waiting\?\.postMessage\(\{ type: "SKIP_WAITING" \}\)/);
  assert.match(bootstrap, /addEventListener\("updatefound"/);
  assert.match(bootstrap, /document\.visibilityState !== "visible"/);
  assert.match(bootstrap, /addEventListener\("pageshow", checkForUpdate\)/);
  assert.match(bootstrap, /addEventListener\("focus", checkForUpdate\)/);
  assert.match(bootstrap, /addEventListener\("online", checkForUpdate\)/);
});

test("touch feedback never falls back to Safari's blue tap highlight", async () => {
  const [styles, studio] = await Promise.all([
    readFile("styles.css", "utf8"),
    readFile("src/publicStudioDesignLayer.mjs", "utf8")
  ]);

  assert.match(styles, /html \{[\s\S]*?-webkit-tap-highlight-color: transparent;/);
  assert.match(
    styles,
    /:where\(button, a, input, select, textarea, summary, \[role="button"\], \[tabindex\]\) \{[\s\S]*?-webkit-tap-highlight-color: transparent;/
  );
  assert.match(
    studio,
    /html\.product-studio-v3 button,[\s\S]*?-webkit-tap-highlight-color: transparent !important;/
  );
});

test("home-screen mode receives an app canvas instead of browser-like chrome behavior", async () => {
  const [bootstrap, styles] = await Promise.all([
    readFile("src/pwaBootstrap.mjs", "utf8"),
    readFile("styles.css", "utf8")
  ]);

  assert.match(bootstrap, /navigator\.standalone === true/);
  assert.match(bootstrap, /classList\.toggle\("pwa-standalone", standalone\)/);
  assert.match(bootstrap, /dataset\.appDisplayMode = standalone \? "standalone" : "browser"/);
  assert.match(styles, /html\.pwa-standalone \{[\s\S]*?overscroll-behavior: none/);
  assert.match(styles, /html\.pwa-standalone body::before[\s\S]*?safe-area-inset-top/);
  assert.match(styles, /html\.pwa-standalone :is\(button, a, \[role="button"\], summary\)[\s\S]*?-webkit-touch-callout: none/);
  assert.match(styles, /html\.pwa-standalone #app \{[\s\S]*?min-height: 100dvh/);
});

test("an installed app reloads once when a new service worker takes control", async () => {
  const registration = await readFile("src/pwaBootstrap.mjs", "utf8");

  assert.match(registration, /const hadActiveController = Boolean\(navigator\.serviceWorker\.controller\)/);
  assert.match(registration, /addEventListener\("controllerchange"[\s\S]*?reloadingForUpdate = true;[\s\S]*?window\.location\.reload\(\)/);
  assert.match(registration, /if \(reloadingForUpdate\) return/);
  assert.match(registration, /sessionStorage\.setItem\(UPDATE_RELOAD_STORAGE_KEY, PWA_RELEASE\)/);
});

test("deployment never serves an install shell or PWA bootstrap from stale CDN cache", async () => {
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  const rootRoute = config.routes.find((route) => route.src === "^/$");
  const pwaRoute = config.routes.find((route) => route.src.includes("manifest"));

  assert.equal(rootRoute.headers["Cache-Control"], "no-store, max-age=0");
  assert.equal(pwaRoute.headers["Cache-Control"], "no-store, max-age=0");
  assert.equal(pwaRoute.continue, true);
  assert.match(pwaRoute.src, /styles\\\.css/);
  assert.match(pwaRoute.src, /src\/\(\.\*\)/);
});

test("the recovery page installs the current worker before reopening the app", async () => {
  const [page, recovery] = await Promise.all([
    readFile("pwa-recovery.html", "utf8"),
    readFile("src/pwaRecovery.mjs", "utf8")
  ]);

  assert.match(page, /src="\.\/src\/pwaRecovery\.mjs\?pwa_release=403"/);
  assert.match(recovery, /const PWA_RELEASE = "403"/);
  assert.match(recovery, /navigator\.serviceWorker\?\.register\?\.\(SERVICE_WORKER_URL/);
  assert.match(recovery, /updateViaCache: "none"/);
  assert.match(recovery, /await registration\?\.update\?\.\(\)/);
  assert.match(recovery, /waitForCurrentWorker\(\)/);
});

test("service worker activates complete updates and claims installed apps", async () => {
  const sw = await readFile("sw.js", "utf8");

  assert.match(sw, /\.then\(\(\) => self\.skipWaiting\(\)\)/);
  assert.match(sw, /Promise\.all\(\[/);
  assert.match(sw, /names\.filter\(\(name\) => name !== CACHE_NAME\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
  assert.match(sw, /addEventListener\("message"[\s\S]*?SKIP_WAITING[\s\S]*?self\.skipWaiting\(\)/);
});

test("every PWA update surface declares the exact same release", async () => {
  const [manifest, page, worker, bootstrap, recovery] = await Promise.all([
    readFile("manifest.webmanifest", "utf8"),
    readFile("index.html", "utf8"),
    readFile("sw.js", "utf8"),
    readFile("src/pwaBootstrap.mjs", "utf8"),
    readFile("src/pwaRecovery.mjs", "utf8")
  ]);
  const release = manifest.match(/pwa_release=(\d+)/)?.[1];
  assert.ok(release, "manifest must declare a PWA release");
  assert.match(page, new RegExp(`pwa_release=${release}`));
  assert.match(worker, new RegExp(`const PWA_RELEASE = "${release}"`));
  assert.match(worker, new RegExp(`settle-friends-live-v${release}`));
  assert.match(bootstrap, new RegExp(`const PWA_RELEASE = "${release}"`));
  assert.match(recovery, new RegExp(`const PWA_RELEASE = "${release}"`));
});
