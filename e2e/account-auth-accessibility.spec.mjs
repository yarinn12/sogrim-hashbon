import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const AUTH_ORIGIN = "https://accessibility-auth-fixture.supabase.co";

test.beforeEach(async ({ page, baseURL }) => {
  await page.route("**/api/config*", route => route.fulfill({ json: {
    publicUrl: baseURL,
    launch: { googleAuthReady: false, authEmailDeliveryReady: true },
    storage: {
      mode: "supabase",
      url: AUTH_ORIGIN,
      anonKey: "synthetic-public-key",
      table: "app_snapshots"
    }
  } }));
  await page.route(`${AUTH_ORIGIN}/**`, route => route.fulfill({ json: [] }));
  await page.addInitScript(() => {
    if (sessionStorage.getItem("auth-accessibility-fixture-ready") !== "1") {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem("auth-accessibility-fixture-ready", "1");
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  });
});

test("pre-sign-in accessibility responds to touch and keyboard and persists settings", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  const gate = page.locator("#public-account-auth-gate");
  await expect(gate).toBeVisible();
  const entry = gate.getByRole("button", { name: "פתיחת הגדרות נגישות" });
  await expect(entry).toBeVisible();
  const entryReceivesPointer = await entry.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit);
  });
  expect(entryReceivesPointer).toBe(true);

  if (testInfo.project.use.hasTouch) await entry.tap();
  else await entry.click();
  const center = page.getByRole("dialog", { name: "נגישות" });
  await expect(center).toBeVisible();
  await expect(center).toBeFocused();
  await center.locator('[data-accessibility-text-size][value="extra-large"]').check();
  await center.locator("[data-accessibility-contrast]").check();
  await center.locator("[data-accessibility-motion]").check();
  await center.getByRole("button", { name: "סיום" }).click();
  await expect(center).toBeHidden();

  await entry.focus();
  await page.keyboard.press("Enter");
  await expect(center).toBeVisible();
  await expect(center).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(center).toBeHidden();
  await expect(entry).toBeFocused();

  await page.reload();
  await expect(gate).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-accessibility-text-size", "extra-large");
  await expect(page.locator("html")).toHaveClass(/accessibility-high-contrast/);
  await expect(page.locator("html")).toHaveClass(/accessibility-reduced-motion/);
  await gate.getByRole("button", { name: "פתיחת הגדרות נגישות" }).click();
  await expect(center).toBeVisible();
  await expect(center.locator('[data-accessibility-text-size][value="extra-large"]')).toBeChecked();
  await expect(center.locator("[data-accessibility-contrast]")).toBeChecked();
  await expect(center.locator("[data-accessibility-motion]")).toBeChecked();
});

test("pre-sign-in terms stay reachable and accessibility reopens after return", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  const gate = page.locator("#public-account-auth-gate");
  await expect(gate).toBeVisible();
  const center = page.getByRole("dialog", { name: "נגישות" });
  await gate.getByRole("button", { name: "פתיחת הגדרות נגישות" }).click();
  await expect(center).toBeVisible();
  await center.locator('[data-accessibility-text-size][value="extra-large"]').check();
  await center.locator("[data-accessibility-contrast]").check();
  await center.locator("[data-accessibility-motion]").check();
  await center.getByRole("button", { name: "סיום" }).click();
  await expect(center).toBeHidden();
  await gate.locator('.account-auth-legal a[href="./terms.html"]').click();
  await expect(page).toHaveURL(/\/terms\.html$/);
  await expect(page.getByRole("heading", { name: "תנאי שימוש", exact: true })).toBeVisible();
  await expect(page.locator('a[href="./accessibility.html"]')).toBeVisible();
  await page.goBack();
  await expect(gate).toBeVisible();
  await gate.getByRole("button", { name: "פתיחת הגדרות נגישות" }).click();
  await expect(center).toBeVisible();
  await expect(center.locator('[data-accessibility-text-size][value="extra-large"]')).toBeChecked();
  await expect(center.locator("[data-accessibility-contrast]")).toBeChecked();
  await expect(center.locator("[data-accessibility-motion]")).toBeChecked();
});
