import { expect, test } from "@playwright/test";
import { prepareAccountEntry, openAccountEntry, reachable, expectNoExternalFailures } from "./helpers/accountEntryBatchPresentation.mjs";

test.use({ serviceWorkers: "block" });

// Synthetic iOS provider availability in each browser; no provider login or
// real account is used. Pixel geometry here is not physical iPhone acceptance.
for (const { width, height, size } of [
  { width: 393, height: 852, size: 16 },
  { width: 320, height: 667, size: 16 },
  { width: 393, height: 852, size: 24 },
  { width: 320, height: 667, size: 32 },
  { width: 844, height: 390, size: 32 }
]) {
  test(`provider labels share typography at ${width}x${height} and ${size}px`, async ({ page, baseURL }, testInfo) => {
    const fixture = await prepareAccountEntry(page, baseURL, { nativeProviders: true });
    const gate = await openAccountEntry(page, { width, height, size });
    await expect(gate.getByRole("heading", { name: "כניסה לחשבון", exact: true })).toBeVisible();
    const google = gate.locator('[data-account-action="google"]');
    const apple = gate.locator('[data-account-action="apple"]');
    const email = gate.locator('[data-account-action="toggle-email"]');
    await expect(apple).toBeVisible();
    // Late discovery preserves the initially expanded form. Use its real login
    // tab to render the normal provider-first entry once discovery completes.
    if (await email.count() === 0) await gate.locator('[data-account-mode="login"]').click();
    if (await email.getAttribute("aria-expanded") === "true") await email.click();
    await expect(email).toHaveText("כניסה עם אימייל");
    await page.screenshot({ path: testInfo.outputPath("provider-labels.png"), fullPage: true });
    await expect(apple.locator("span"), "Apple's title must be live scalable text").toHaveText("המשך עם Apple");
    const metrics = await gate.evaluate(element => ["google", "apple", "toggle-email"].map(action => {
      const button = element.querySelector(`[data-account-action="${action}"]`);
      const label = button.querySelector("span") || button;
      const style = getComputedStyle(label);
      const range = document.createRange();
      range.selectNodeContents(label);
      const lines = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
      const rect = button.getBoundingClientRect();
      const logo = button.querySelector("img");
      const logoRect = logo?.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      return {
        action, text: label.textContent.trim(), fontSize: parseFloat(style.fontSize),
        fontFamily: style.fontFamily, fontWeight: style.fontWeight, lineHeight: style.lineHeight,
        clipped: lines.some(r => r.left < rect.left - 1 || r.right > rect.right + 1 || r.top < rect.top - 1 || r.bottom > rect.bottom + 1),
        groupCenterOffset: logoRect ? (Math.min(logoRect.left, labelRect.left) + Math.max(logoRect.right, labelRect.right)) / 2 - (rect.left + rect.width / 2) : null
      };
    }));
    await testInfo.attach("provider-typography.json", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
    for (const label of metrics) {
      expect(label.fontSize).toBeCloseTo(size, 1);
      expect(label.fontFamily).toBe(metrics[0].fontFamily);
      expect(label.fontWeight).toBe(metrics[0].fontWeight);
      expect(label.lineHeight).toBe(metrics[0].lineHeight);
      expect(label.clipped, `${label.action} label must remain inside its control`).toBe(false);
      if (label.groupCenterOffset !== null) expect(Math.abs(label.groupCenterOffset), "Apple logo and title must be centered as one group").toBeLessThanOrEqual(1);
    }
    for (const button of [google, apple, email]) await reachable(button);
    expectNoExternalFailures(fixture);
  });
}
