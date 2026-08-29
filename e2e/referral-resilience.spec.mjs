import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const REFERRAL_CODE = "0123456789abcdefabcd";

test("a new visitor keeps referral attribution before creating an account", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  });

  await page.goto(`/r/${REFERRAL_CODE}`);

  await expect.poll(async () => page.evaluate(() => {
    const value = localStorage.getItem("settle-friends-pending-referral-code");
    return value ? JSON.parse(value) : null;
  })).toEqual(expect.objectContaining({ code: REFERRAL_CODE }));
  await expect(page).not.toHaveURL(new RegExp(`/r/${REFERRAL_CODE}`));
});

test("qualifying activity stays queued until cloud attribution can complete", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  });
  await page.goto("/");

  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent("settle-friends:qualifying-activity", {
      detail: { eventId: "shared-referral-event", kind: "expense-created" }
    }));
  });

  await expect.poll(async () => page.evaluate(() => {
    const value = localStorage.getItem(
      "settle-friends-pending-referral-qualification"
    );
    return value ? JSON.parse(value) : null;
  })).toEqual(expect.objectContaining({ eventId: "shared-referral-event" }));
});
