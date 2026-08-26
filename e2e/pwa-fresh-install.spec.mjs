import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

const installBaseUrl = process.env.PWA_INSTALL_BASE_URL?.trim();

test("a fresh iPhone or iPad home-screen install receives the current app shell", async ({
  browserName,
  page
}) => {
  test.skip(browserName !== "webkit", "This regression targets iOS and iPadOS WebKit");

  const installUrl = installBaseUrl
    ? new URL("/?pwa_release=366", installBaseUrl).toString()
    : "/?pwa_release=366";
  await page.goto(installUrl, { waitUntil: "load" });
  await expect(page).toHaveTitle("סוגרים חשבון");

  const installedState = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const cacheNames = await caches.keys();
    const currentCache = await caches.open("settle-friends-live-v366");
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

  expect(installedState.scriptUrl).toContain("/sw.js?pwa_release=366");
  expect(installedState.cacheNames).toContain("settle-friends-live-v366");
  expect(installedState.shell).toContain("manifest.webmanifest?pwa_release=366");
  expect(installedState.shell).toContain("styles.css?pwa_release=366");
  expect(installedState.shell).toContain("src/pwaBootstrap.mjs?pwa_release=366");
  expect(installedState.shell).toContain("src/app.mjs?pwa_release=366");
  expect(installedState.shell).toContain("src/publicAccountAuthLayer.mjs?pwa_release=366");
  expect(installedState.shell).toContain("src/publicProfileContextLayer.mjs?pwa_release=366");
  expect(installedState.manifest).toContain('"start_url": "./?pwa_release=366"');
  expect(installedState.manifest).toContain('"display_override": ["standalone"]');
  expect(installedState.bootstrap).toContain('const PWA_RELEASE = "366"');
});

test("an iPhone home-screen launch receives native-feeling standalone chrome", async ({
  browserName,
  context,
  page
}) => {
  test.skip(browserName !== "webkit", "This regression targets iOS and iPadOS WebKit");

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      get: () => true
    });
  });
  const installUrl = installBaseUrl
    ? new URL("/?pwa_release=366", installBaseUrl).toString()
    : "/?pwa_release=366";
  await page.goto(installUrl, { waitUntil: "load" });

  const appMode = await page.evaluate(() => ({
    className: document.documentElement.className,
    displayMode: document.documentElement.dataset.appDisplayMode,
    statusBar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
    shellMinHeight: getComputedStyle(document.querySelector("#app")).minHeight,
    bodyOverscroll: getComputedStyle(document.body)
      .getPropertyValue("overscroll-behavior-y")
      .trim()
  }));

  expect(appMode.className).toContain("pwa-standalone");
  expect(appMode.displayMode).toBe("standalone");
  expect(appMode.statusBar).toBe("black-translucent");
  expect(appMode.shellMinHeight).not.toBe("0px");
  expect(["none", ""]).toContain(appMode.bodyOverscroll);
});
