import { expect, test } from "@playwright/test";

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 390, height: 664 },
  deviceScaleFactor: 3
});

test("large-text touch hover preserves the primary action hitbox and visual feedback", async ({ page }) => {
  await page.goto("/?dynamic-type-preview=28", { waitUntil: "commit" });
  await expect(page).toHaveURL(/\?dynamic-type-preview=28$/);
  await expect(page.locator("html.ledger-workspace-v1")).toHaveCSS("font-size", "28px");
  expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true);

  // Use the app's real primary action styles without opening another route on tap.
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.className = "primary-button event-participant-add-launch";
    button.textContent = "הוסף משתתפים";
    button.style.cssText = "position:fixed;left:30px;top:300px;width:250px;height:52px;z-index:99999";
    document.body.appendChild(button);
  });
  const button = page.locator("body > .event-participant-add-launch");
  const before = await button.evaluate(node => ({
    top: node.getBoundingClientRect().top,
    background: getComputedStyle(node).backgroundColor
  }));
  const box = await button.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height - 0.5);
  await expect.poll(() => button.evaluate(node => node.matches(":hover"))).toBe(true);
  await page.waitForTimeout(250); // Let the 140–170 ms hover transitions settle.
  const after = await button.evaluate(node => ({
    top: node.getBoundingClientRect().top,
    background: getComputedStyle(node).backgroundColor
  }));
  expect(Math.abs(after.top - before.top), "touch hover must not move the action out from under the tap").toBeLessThan(0.25);
  expect(after.background, "hover color remains as feedback").not.toBe(before.background);
});
