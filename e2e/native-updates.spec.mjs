import { expect, test } from "@playwright/test";

test.use({ bypassCSP: true, serviceWorkers: "block" });

const playUrl = "https://play.google.com/store/apps/details?id=com.sogrimhashbon.app";
const iosUrl = "https://apps.apple.com/il/app/sogrim-hashbon/id1234567890";

async function nativeFixture(page, platform, build, getPolicy) {
  let unavailable = false;
  const requestLog = [];
  await page.route("**/api/config", route => {
    if (unavailable) return route.abort("internetdisconnected");
    requestLog.push(getPolicy());
    return route.fulfill({ json: {
      publicUrl: "https://sogrim-hesbon-app.vercel.app",
      auth: { googleClientId: "" },
      updates: { [platform]: {
        ...getPolicy(), currentBuild: build,
        required: false
      } },
      monetization: { adsEnabled: false },
      storage: { mode: "local" },
      launch: {}
    } });
  });
  await page.addInitScript(({ platform, build }) => {
    globalThis.__qaBuild = build;
    globalThis.__qaStoreUrls = [];
    globalThis.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: {
        App: {
          getInfo: async () => ({ version: "qa", build: String(globalThis.__qaBuild) }),
          addListener: async () => ({ remove: async () => {} }),
          getLaunchUrl: async () => null
        },
        AppLauncher: {
          openUrl: async ({ url }) => {
            globalThis.__qaStoreUrls.push(url);
            return { completed: true };
          }
        },
        Browser: { open: async () => true, close: async () => true },
        Haptics: { impact: async () => true }
      }
    };
  }, { platform, build });
  await page.goto("/");
  return {
    resume: () => page.evaluate(() => new Promise(resolve => {
      document.addEventListener("sogrim:mandatory-update-check", resolve, { once: true });
      window.dispatchEvent(new Event("settle-friends:native-resume"));
    })),
    setBuild: value => page.evaluate(next => { globalThis.__qaBuild = next; }, value),
    setUnavailable: value => { unavailable = value; },
    requestLog
  };
}

test("Android update can be postponed, reappears for a newer build and opens the store", async ({ page }) => {
  let latest = 188;
  const policy = () => ({ latestAvailableBuild: latest, minimumSupportedBuild: 0,
    releaseAvailableToAll: true, critical: false, storeUrl: playUrl });
  const fixture = await nativeFixture(page, "android", 187, policy);
  const optional = page.locator("#available-update-prompt");
  await expect(optional).toBeVisible();
  await expect(page.locator("#mandatory-update-gate")).toHaveCount(0);
  await optional.locator(".available-update-later").click();
  await expect(optional).toBeHidden();
  await fixture.resume();
  await expect(optional).toBeHidden();
  latest = 189;
  await fixture.resume();
  await expect.poll(() => fixture.requestLog.at(-1)?.latestAvailableBuild).toBe(189);
  await expect(optional).toBeVisible();
  await optional.locator(".mandatory-update-button").click();
  await expect.poll(() => page.evaluate(() => globalThis.__qaStoreUrls.length)).toBe(1);
  expect(await page.evaluate(() => globalThis.__qaStoreUrls[0])).toBe("market://details?id=com.sogrimhashbon.app");
  await expect(optional).toBeHidden();
});

test("iOS critical gate uses a verified App Store URL and clears after an installed update", async ({ page }) => {
  const policy = () => ({ latestAvailableBuild: 5, minimumSupportedBuild: 5,
    releaseAvailableToAll: true, critical: true, storeUrl: iosUrl });
  const fixture = await nativeFixture(page, "ios", 4, policy);
  const gate = page.locator("#mandatory-update-gate");
  await expect(gate).toBeVisible();
  await expect(gate).toContainText("App Store");
  await expect(gate.locator(".available-update-later")).toHaveCount(0);
  await gate.locator(".mandatory-update-button").click();
  await expect.poll(() => page.evaluate(() => globalThis.__qaStoreUrls[0])).toBe(iosUrl);
  await fixture.setBuild(5);
  await fixture.resume();
  await expect(gate).toBeHidden();
  await expect(page.locator("html")).not.toHaveClass(/mandatory-update-required/);
});

test("staged release, failed check and open draft never trap the app", async ({ page }) => {
  let fullyAvailable = false;
  const policy = () => ({ latestAvailableBuild: 188, minimumSupportedBuild: 188,
    releaseAvailableToAll: fullyAvailable, critical: true, storeUrl: playUrl });
  const fixture = await nativeFixture(page, "android", 187, policy);
  await expect(page.locator("html")).not.toHaveClass(/mandatory-update-checking/);
  await expect(page.locator("#mandatory-update-gate")).toHaveCount(0);
  fullyAvailable = true;
  await page.evaluate(() => document.querySelector("#app")?.insertAdjacentHTML("beforeend",
    '<section class="qa-open-draft" role="dialog"><input value="unsaved"></section>'));
  await fixture.resume();
  await expect(page.locator("#mandatory-update-gate")).toHaveCount(0);
  await page.locator(".qa-open-draft").evaluate(element => element.remove());
  await page.evaluate(() => document.dispatchEvent(new Event("settle-friends:screen-rendered")));
  await expect(page.locator("#mandatory-update-gate")).toBeVisible();
  fixture.setUnavailable(true);
  await fixture.resume();
  await expect(page.locator("#mandatory-update-gate")).toBeHidden();
  await expect(page.locator("html")).not.toHaveClass(/mandatory-update-checking|mandatory-update-required/);
});
