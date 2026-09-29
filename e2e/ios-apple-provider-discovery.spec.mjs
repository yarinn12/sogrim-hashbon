import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const AUTH_ORIGIN = "https://apple-provider-fixture.supabase.co";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!["iphone-webkit", "ipad-webkit"].includes(testInfo.project.name),
    "Native iOS login parity is exercised with iPhone and iPad WebKit profiles.");
  await page.route("**/api/config*", route => route.fulfill({ json: {
    publicUrl: "https://sogrim-hesbon-app.vercel.app",
    auth: {
      googleClientId: "fixture-web.apps.googleusercontent.com",
      googleIosClientId: "fixture-ios.apps.googleusercontent.com"
    },
    launch: { googleAuthReady: true, googleIosAuthReady: true, authEmailDeliveryReady: true },
    storage: { mode: "supabase", url: AUTH_ORIGIN, anonKey: "fixture-public-key", table: "app_snapshots" }
  } }));
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    globalThis.__appleTestOpenedUrls = [];
    globalThis.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      Plugins: {
        Browser: { open: async ({ url }) => globalThis.__appleTestOpenedUrls.push(url) },
        App: { addListener: async () => ({ remove() {} }), getLaunchUrl: async () => null }
      }
    };
  });
});

test("slow provider discovery keeps email usable, then offers Apple beside Google and opens Apple OAuth", async ({ page }, testInfo) => {
  let releaseSettings;
  const settingsReady = new Promise(resolve => { releaseSettings = resolve; });
  await page.route(`${AUTH_ORIGIN}/auth/v1/settings`, async route => {
    await settingsReady;
    await route.fulfill({ json: { external: { google: true, apple: true, email: true } } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const gate = page.locator("#public-account-auth-gate");
  await expect(gate).toBeVisible();
  await expect(gate.locator('input[name="email"]')).toBeVisible();
  await expect(gate.locator('[data-account-action="google"]')).toHaveCount(0);
  await expect(gate.locator('[data-account-action="apple"]')).toHaveCount(0);

  releaseSettings();
  const apple = gate.getByRole("button", { name: "המשך עם Apple", exact: true });
  await expect(apple).toBeVisible();
  await expect(gate.locator('[data-account-action="google"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("apple-login-options.png"), fullPage: true });
  await apple.click();
  await expect.poll(() => page.evaluate(() => globalThis.__appleTestOpenedUrls.length)).toBe(1);
  const destination = new URL(await page.evaluate(() => globalThis.__appleTestOpenedUrls[0]));
  expect(destination.origin).toBe(AUTH_ORIGIN);
  expect(destination.searchParams.get("provider")).toBe("apple");
  expect(destination.searchParams.get("code_challenge_method")).toBe("s256");
  expect(destination.searchParams.get("code_challenge")).toBeTruthy();
});

test("transient provider failure retries and restores equivalent Apple and Google choices", async ({ page }) => {
  let requests = 0;
  await page.route(`${AUTH_ORIGIN}/auth/v1/settings`, route => {
    requests += 1;
    return requests === 1
      ? route.fulfill({ status: 503, json: { message: "Temporary fixture failure" } })
      : route.fulfill({ json: { external: { google: true, apple: true, email: true } } });
  });
  await page.goto("/");
  const gate = page.locator("#public-account-auth-gate");
  await expect(gate.getByRole("button", { name: "המשך עם Apple", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(gate.locator('[data-account-action="google"]')).toBeVisible();
  expect(requests).toBe(2);
});

test("explicitly unavailable Apple never leaves Google as the only social option on iOS", async ({ page }) => {
  await page.route(`${AUTH_ORIGIN}/auth/v1/settings`, route => route.fulfill({
    json: { external: { google: true, apple: false, email: true } }
  }));
  await page.goto("/");
  const gate = page.locator("#public-account-auth-gate");
  await expect(gate).toBeVisible();
  await expect(gate.locator('[data-account-action="retry-providers"]')).toBeVisible();
  await expect(gate.locator('input[name="email"]')).toBeVisible();
  await expect(gate.locator('[data-account-action="google"]')).toHaveCount(0);
  await expect(gate.locator('[data-account-action="apple"]')).toHaveCount(0);
  await gate.locator('input[name="email"]').fill("apple-fixture@example.test");
  await expect(gate.locator('input[name="email"]')).toHaveValue("apple-fixture@example.test");
});
