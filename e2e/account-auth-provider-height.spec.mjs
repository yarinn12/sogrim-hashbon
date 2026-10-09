import { expect, test } from "@playwright/test";
import { fulfillNativeAuthModule } from "./helpers/fulfillNativeAuthModule.mjs";

test.use({ serviceWorkers: "block" });

const AUTH_ORIGIN = "https://provider-height-fixture.supabase.co";
const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 }
];

test.beforeEach(async ({ page, baseURL }, testInfo) => {
  const platform = testInfo.project.name === "android-mobile" ? "android" : "ios";
  const config = {
    publicUrl: baseURL,
    auth: {
      googleClientId: "synthetic-web.apps.googleusercontent.com",
      googleIosClientId: "synthetic-ios.apps.googleusercontent.com"
    },
    launch: {
      googleAuthReady: true,
      googleIosAuthReady: true,
      authEmailDeliveryReady: true
    },
    storage: {
      mode: "supabase",
      url: AUTH_ORIGIN,
      anonKey: "synthetic-public-key",
      table: "app_snapshots"
    }
  };

  await page.route("**/api/config*", route => route.fulfill({ json: config }));
  await page.route(`${AUTH_ORIGIN}/**`, route => route.fulfill({
    headers: { "access-control-allow-origin": "*" },
    json: new URL(route.request().url()).pathname === "/auth/v1/settings"
      ? { external: { google: true, apple: platform === "ios", email: true } }
      : []
  }));
  await page.route("**/src/publicAccountAuthLayer.mjs*", fulfillNativeAuthModule);
  await page.addInitScript(({ runtimeConfig, platform }) => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    globalThis.SogrimNativeRuntimeConfig = Object.freeze(runtimeConfig);
    globalThis.__roundtripSocialLogin = {
      initialize: async () => {},
      login: async () => { throw new Error("Provider login is outside layout QA"); }
    };
    globalThis.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: {
        Browser: { open: async () => {} },
        App: {
          addListener: async () => ({ remove() {} }),
          getLaunchUrl: async () => null,
          getInfo: async () => ({ version: "4.57", build: "187" })
        }
      }
    };
  }, { runtimeConfig: config, platform });
});

for (const viewport of VIEWPORTS) {
  test(`native provider controls keep their intended height at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    const platform = testInfo.project.name === "android-mobile" ? "android" : "ios";
    await page.setViewportSize(viewport);
    const largeText = Number(testInfo.project.metadata?.dynamicTypePreview || 0);
    await page.goto(largeText ? `/?dynamic-type-preview=${largeText}` : "/");

    const gate = page.locator("#public-account-auth-gate");
    const google = gate.locator('[data-account-action="google"]');
    const apple = gate.locator('[data-account-action="apple"]');
    await expect(gate).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/ledger-workspace-v1/);
    await expect(google).toBeVisible();
    if (platform === "ios") {
      await expect(apple).toBeVisible();
      await expect(gate.locator(".account-apple-button-art")).toHaveJSProperty("complete", true);
    } else {
      await expect(apple).toHaveCount(0);
    }
    await page.evaluate(() => document.fonts.ready);

    const geometry = await gate.evaluate(element => {
      const google = element.querySelector('[data-account-action="google"]');
      const apple = element.querySelector('[data-account-action="apple"]');
      const icon = google.querySelector("svg");
      const googleRect = google.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const art = apple?.querySelector("img");
      const appleRect = apple?.getBoundingClientRect();
      const artRect = art?.getBoundingClientRect();
      return {
        google: { height: googleRect.height, width: googleRect.width },
        icon: { height: iconRect.height, width: iconRect.width },
        apple: appleRect && { height: appleRect.height, width: appleRect.width },
        art: art && {
          width: artRect.width,
          height: artRect.height,
          naturalWidth: art.naturalWidth,
          naturalHeight: art.naturalHeight
        }
      };
    });

    console.log(JSON.stringify({ kind: "provider-height", profile: testInfo.project.name, viewport, platform, geometry }));
    expect(geometry.google.width).toBeGreaterThanOrEqual(44);
    expect(geometry.google.height).toBeGreaterThanOrEqual(56);
    expect(geometry.icon.width).toBeCloseTo(geometry.icon.height, 1);
    if (platform === "ios") {
      expect(Math.abs(geometry.google.height - geometry.apple.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.google.width - geometry.apple.width)).toBeLessThanOrEqual(1);
      expect(geometry.art.naturalWidth).toBeGreaterThan(0);
      expect(geometry.art.width / geometry.art.height).toBeCloseTo(
        geometry.art.naturalWidth / geometry.art.naturalHeight,
        1
      );
    }
  });
}
