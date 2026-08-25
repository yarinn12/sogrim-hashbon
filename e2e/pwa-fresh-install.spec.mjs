import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

const installBaseUrl = process.env.PWA_INSTALL_BASE_URL?.trim();

test("a fresh iPhone or iPad home-screen install receives the current app shell", async ({
  browserName,
  page
}) => {
  test.skip(browserName !== "webkit", "This regression targets iOS and iPadOS WebKit");

  const installUrl = installBaseUrl
    ? new URL("/?pwa_release=336", installBaseUrl).toString()
    : "/?pwa_release=336";
  await page.goto(installUrl, { waitUntil: "load" });
  await expect(page).toHaveTitle("סוגרים חשבון");

  const installedState = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const cacheNames = await caches.keys();
    const currentCache = await caches.open("settle-friends-live-v336");
    const [shell, manifest, bootstrap] = await Promise.all([
      currentCache.match("/index.html"),
      currentCache.match("/manifest.webmanifest"),
      currentCache.match("/src/pwaBootstrap.mjs")
    ]);
    return {
      scriptUrl: registration.active?.scriptURL ?? "",
      cacheNames,
      shell: await shell?.text(),
      manifest: await manifest?.text(),
      bootstrap: await bootstrap?.text()
    };
  });

  expect(installedState.scriptUrl).toContain("/sw.js?pwa_release=336");
  expect(installedState.cacheNames).toContain("settle-friends-live-v336");
  expect(installedState.shell).toContain("manifest.webmanifest?pwa_release=336");
  expect(installedState.shell).toContain("src/pwaBootstrap.mjs");
  expect(installedState.manifest).toContain('"start_url": "./?pwa_release=336"');
  expect(installedState.bootstrap).toContain('const PWA_RELEASE = "336"');
});
