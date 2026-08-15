import { expect, test } from "@playwright/test";

const OWNER_ID = "person-accessibility-owner";
const emptyState = {
  currentParticipantId: OWNER_ID,
  participants: [
    {
      id: OWNER_ID,
      displayName: "ירין יצחק",
      kind: "user",
      avatarPreset: "avatar-1"
    }
  ],
  friendContacts: [],
  groups: [],
  events: [],
  deletedEvents: [],
  deletedParticipants: []
};

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: emptyState });
  await page.addInitScript(({ participantId, state }) => {
    if (
      sessionStorage.getItem("accessibility-test-no-profile") !== "1" &&
      !localStorage.getItem("settle-friends-local-profile")
    ) {
      localStorage.setItem("settle-friends-state", JSON.stringify(state));
      localStorage.setItem(
        "settle-friends-local-profile",
        JSON.stringify({
          participantId,
          displayName: "ירין יצחק",
          avatarPreset: "avatar-1"
        })
      );
      localStorage.setItem("settle-friends-current-participant", participantId);
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { participantId: OWNER_ID, state: emptyState });
  await page.goto("/");
  await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
});

test("accessibility settings open, persist and close with back", async ({ page }) => {
  const entry = page.locator(".product-app-identity [data-open-accessibility]");
  await expect(entry).toBeVisible();
  await expect(entry).toHaveAttribute("aria-label", "פתיחת הגדרות נגישות");
  await entry.click();

  const center = page.locator('.accessibility-center[role="dialog"]');
  await expect(center).toBeVisible();
  await expect(center).toBeFocused();
  if (process.env.CAPTURE_ACCESSIBILITY_CENTER === "1") {
    await page.screenshot({
      path: `design-audits/accessibility-center-default-${test.info().project.name}.png`,
      fullPage: false
    });
  }

  await center.locator('[value="large"]').check();
  await center.locator("[data-accessibility-contrast]").check();
  await center.locator("[data-accessibility-motion]").check();
  await expect(page.locator("html")).toHaveAttribute(
    "data-accessibility-text-size",
    "large"
  );
  await expect(page.locator("html")).toHaveClass(/accessibility-high-contrast/);
  await expect(page.locator("html")).toHaveClass(/accessibility-reduced-motion/);

  await page.goBack();
  await expect(center).toBeHidden();
  await expect(entry).toBeFocused();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-accessibility-text-size",
    "large"
  );
  await expect(page.locator("html")).toHaveClass(/accessibility-high-contrast/);
  await expect(page.locator("html")).toHaveClass(/accessibility-reduced-motion/);

  if (process.env.CAPTURE_ACCESSIBILITY_CENTER === "1") {
    await entry.click();
    await page.screenshot({
      path: `design-audits/accessibility-center-${test.info().project.name}.png`,
      fullPage: false
    });
  }
});

test("accessibility remains available before account setup", async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem("accessibility-test-no-profile", "1");
    localStorage.removeItem("settle-friends-local-profile");
    localStorage.removeItem("settle-friends-current-participant");
  });
  await page.reload();

  await expect(
    page.locator(
      '#public-account-auth-gate, .public-profile-gate, #app .screen[data-screen-kind="profile-setup"]'
    ).first()
  ).toBeVisible();
  const entry = page.locator("[data-open-accessibility]:visible").first();
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.locator('.accessibility-center[role="dialog"]')).toBeVisible();
  await page.locator("[data-close-accessibility]").first().click();
  await expect(page.locator(".accessibility-center")).toBeHidden();
});

test("high contrast keeps dark hero content readable", async ({ page }) => {
  const entry = page.locator(".product-app-identity [data-open-accessibility]");
  await entry.click();
  await page.locator("[data-accessibility-contrast]").check();
  await page.locator("[data-close-accessibility]").first().click();

  const heroDescription = page.locator('#app .screen[data-screen-kind="home"] > .top .muted');
  await expect(heroDescription).toBeVisible();
  await expect(heroDescription).toHaveCSS("color", "rgb(255, 255, 255)");
});
