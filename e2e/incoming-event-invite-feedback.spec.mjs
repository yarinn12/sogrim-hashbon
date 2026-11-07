import { expect, test } from "@playwright/test";
import { prepareAccountEntry, expectNoExternalFailures } from "./helpers/accountEntryBatchPresentation.mjs";

const eventId = "event-invite-feedback-audit";
const token = "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456";
const invitePath = `/?event=${eventId}&t=${token}`;

test.use({ serviceWorkers: "block" });

for (const scenario of [
  {
    name: "expired",
    status: 410,
    code: "EVENT_INVITE_EXPIRED",
    message: "תוקף קישור ההצטרפות פג. צריך לבקש קישור חדש."
  },
  {
    name: "another recipient",
    status: 403,
    code: "PRIVATE_INVITE_RECIPIENT_MISMATCH",
    message: "ההזמנה הפרטית נשלחה לחשבון אחר."
  },
  {
    name: "temporary outage",
    status: 503,
    code: "EVENT_INVITES_UNAVAILABLE",
    message: "ההזמנות אינן זמינות כרגע. כדאי לנסות שוב בעוד רגע."
  }
]) {
  test(`incoming event invitation explains ${scenario.name}`, async ({ page, baseURL }, testInfo) => {
    const fixture = await prepareAccountEntry(page, baseURL, { authenticated: true });
    const largeText = testInfo.project.name === "iphone-large-text";
    if (largeText) await page.setViewportSize({ width: 320, height: 852 });
    let redeemCalls = 0;
    await page.route("**/api/event-invites/redeem", async (route) => {
      redeemCalls += 1;
      await route.fulfill({
        status: scenario.status,
        json: { code: scenario.code, retryable: scenario.status === 503 }
      });
    });

    await page.goto(invitePath + (largeText ? "&dynamic-type-preview=32" : ""));
    await expect.poll(() => redeemCalls).toBeGreaterThan(0);
    await expect(page.locator("[data-screen-kind=home]")).toBeVisible();
    await expect(page.locator(".notice:visible")).toContainText(scenario.message);
    await expect(page.locator("body")).not.toContainText("קישור ההזמנה לא נמצא.");
    await expect(page.locator(`[data-screen-kind=event][data-event-id="${eventId}"]`)).toHaveCount(0);
    expectNoExternalFailures(fixture);

    const pendingUrl = await page.evaluate(() => sessionStorage.getItem("sogrim-pending-invite-url"));
    if (scenario.status === 503) {
      expect(pendingUrl).toContain(eventId);
      await page.route("**/api/event-invites/redeem", (route) => route.fulfill({
        status: 410,
        json: { code: "EVENT_INVITE_EXPIRED", retryable: false }
      }));
      await page.reload();
      await expect(page.locator("[data-screen-kind=home]")).toBeVisible();
      await expect(page.locator(".notice:visible")).toContainText("תוקף קישור ההצטרפות פג. צריך לבקש קישור חדש.");
      expect(await page.evaluate(() => sessionStorage.getItem("sogrim-pending-invite-url"))).toBeNull();
    } else {
      expect(pendingUrl).toBeNull();
    }
  });
}
