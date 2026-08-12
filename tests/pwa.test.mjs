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
  assert.equal(manifest.short_name, "סוגרים");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "./");
  assert.deepEqual(manifest.display_override, ["standalone", "minimal-ui"]);
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.lang, "he");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.theme_color, "#0b3b38");
  assert.deepEqual(manifest.categories, ["finance", "productivity", "utilities"]);
  assert.equal(manifest.shortcuts[0].url, "./?action=new-event");
  assert.ok(
    manifest.icons.some(
      (icon) => icon.src === "./icon-maskable-512.png" && icon.purpose.includes("maskable")
    )
  );
  assert.ok(manifest.icons.some((icon) => icon.src === "./icon-192.png" && icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.src === "./icon-512.png" && icon.sizes === "512x512"));
});

test("index links the manifest and mobile app metadata", async () => {
  const html = await readFile("index.html", "utf8");

  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /name="theme-color" content="#10312b"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /rel="icon" href="\.\/icon-192\.png" type="image\/png"/);
  assert.match(html, /rel="apple-touch-icon" href="\.\/apple-touch-icon\.png"/);
  assert.match(html, /publicInstallAppLayer\.mjs/);
});

test("server serves install icons with the correct image type", async () => {
  const server = await readFile("server.mjs", "utf8");
  const config = JSON.parse(await readFile("vercel.json", "utf8"));

  assert.match(server, /"\.png": "image\/png"/);
  assert.ok(config.builds.some((entry) => entry.src === "*.png" && entry.use === "@vercel/static"));
  assert.match(await readFile(".vercelignore", "utf8"), /^!icon-192\.png$/m);
  assert.match(await readFile(".vercelignore", "utf8"), /^!icon-maskable-512\.png$/m);
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
  assert.match(sw, /event\.request\.mode === "navigate"/);
});

test("service worker precaches every browser module used by the public app", async () => {
  const html = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");
  const entryPaths = [...html.matchAll(/<script type="module" src="\.([^"]+\.mjs)"><\/script>/g)]
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

test("app updates the service worker without interrupting the active splash", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const start = app.indexOf("function registerServiceWorker()");
  const end = app.indexOf("function persistState()", start);
  const registration = app.slice(start, end);

  assert.match(registration, /serviceWorker/);
  assert.match(registration, /register\("\.\/sw\.js", \{/);
  assert.match(registration, /updateViaCache: "none"/);
  assert.match(registration, /registration\.update\(\)/);
  assert.match(registration, /document\.visibilityState !== "hidden"/);
  assert.doesNotMatch(registration, /controllerchange/);
  assert.doesNotMatch(registration, /window\.location\.reload\(\)/);
});

test("service worker activates complete updates and claims installed apps", async () => {
  const sw = await readFile("sw.js", "utf8");

  assert.match(sw, /\.then\(\(\) => self\.skipWaiting\(\)\)/);
  assert.match(sw, /Promise\.all\(\[/);
  assert.match(sw, /names\.filter\(\(name\) => name !== CACHE_NAME\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
});
