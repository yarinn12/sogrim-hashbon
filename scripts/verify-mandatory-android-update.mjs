import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = process.env.MANDATORY_UPDATE_QA_URL || "http://127.0.0.1:4190";
const oldBuild = process.env.MANDATORY_UPDATE_OLD_BUILD || "76";
const currentBuild = process.env.MANDATORY_UPDATE_CURRENT_BUILD || "77";

const browser = await chromium.launch({ headless: true });
try {
  await verifyBlockedBuild(oldBuild);
  await verifyCurrentBuild(currentBuild);
  console.log(
    `Mandatory update QA passed: build ${oldBuild} is blocked and build ${currentBuild} is allowed.`
  );
} finally {
  await browser.close();
}

async function verifyBlockedBuild(build) {
  const context = await nativeAndroidContext(build);
  try {
    const page = await context.newPage();
    const diagnostics = [];
    page.on("console", (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
    page.on("pageerror", (error) => diagnostics.push(`pageerror:${error.message}`));
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const gate = page.locator("#mandatory-update-gate");
    try {
      await gate.waitFor({ state: "visible", timeout: 12_000 });
    } catch (error) {
      const state = await page.evaluate(() => ({
        classes: document.documentElement.className,
        native: globalThis.Capacitor?.isNativePlatform?.(),
        platform: globalThis.Capacitor?.getPlatform?.(),
        config: globalThis.SogrimNativeRuntimeConfig?.updates?.android ?? null
      }));
      throw new Error(`${error.message}\n${JSON.stringify(state)}\n${diagnostics.join("\n")}`);
    }
    await page.getByRole("heading", { name: "צריך לעדכן כדי להמשיך" }).waitFor();
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/mandatory-update-qa.png" });
    await page.getByRole("button", { name: "עדכון עכשיו" }).click();
    await page.waitForFunction(() => globalThis.__mandatoryUpdateStoreOpenCount === 1);
    assert.equal(
      await page.locator("html").evaluate((element) =>
        element.classList.contains("mandatory-update-required")
      ),
      true
    );
  } finally {
    await context.close();
  }
}

async function verifyCurrentBuild(build) {
  const context = await nativeAndroidContext(build);
  try {
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => !document.documentElement.classList.contains("mandatory-update-checking"),
      null,
      { timeout: 12_000 }
    );
    assert.equal(await page.locator("#mandatory-update-gate").count(), 0);
    assert.equal(
      await page.locator("html").evaluate((element) =>
        element.classList.contains("mandatory-update-required")
      ),
      false
    );
  } finally {
    await context.close();
  }
}

async function nativeAndroidContext(build) {
  const context = await browser.newContext({
    bypassCSP: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1
  });
  await context.route("**/api/config", async (route) => {
    const requestBuild = Number.parseInt(
      await route.request().headerValue("x-sogrim-app-build"),
      10
    );
    const minimumSupportedBuild = Number.parseInt(currentBuild, 10);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        publicUrl: "https://sogrim-hashbon.vercel.app",
        auth: { googleClientId: "" },
        updates: {
          android: {
            minimumSupportedBuild,
            currentBuild: Number.isSafeInteger(requestBuild) ? requestBuild : 0,
            required: Boolean(
              Number.isSafeInteger(requestBuild) &&
              requestBuild > 0 &&
              requestBuild < minimumSupportedBuild
            ),
            storeUrl:
              "https://play.google.com/store/apps/details?id=com.sogrimhashbon.app"
          }
        },
        monetization: {
          adsEnabled: false,
          testMode: false,
          rolloutPercent: 0,
          premiumEnabled: false
        },
        storage: { mode: "local" },
        launch: {}
      })
    });
  });
  await context.addInitScript(({ nativeBuild }) => {
    globalThis.__mandatoryUpdateStoreOpenCount = 0;
    const noOpListener = async () => ({ remove: async () => {} });
    globalThis.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      Plugins: {
        App: {
          getInfo: async () => ({ version: "qa", build: nativeBuild }),
          addListener: noOpListener,
          getLaunchUrl: async () => null,
          minimizeApp: async () => true
        },
        AppLauncher: {
          openUrl: async ({ url }) => {
            if (!String(url).startsWith("market://details?id=")) {
              throw new Error("Unexpected store URL");
            }
            globalThis.__mandatoryUpdateStoreOpenCount += 1;
            return { completed: true };
          }
        },
        Browser: {
          open: async () => true,
          close: async () => true
        },
        Haptics: { impact: async () => true },
        Share: { share: async () => true },
        SogrimCapabilities: {
          getCapabilities: async () => ({ pushNotifications: false }),
          setSystemBarStyle: async () => true
        }
      }
    };
  }, { nativeBuild: String(build) });
  return context;
}
