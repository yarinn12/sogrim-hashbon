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
  // The untouched twin is the neutral color/shadow reference even if touch hover
  // was already active on the target before the second tap.
  const fixture = { left: 30, top: 300, width: 250, height: 52 };
  await page.evaluate(({ left, top, width, height }) => {
    const button = document.createElement("button");
    button.className = "primary-button event-participant-add-launch";
    button.textContent = "הוסף משתתפים";
    button.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${width}px;height:${height}px;z-index:99999`;
    document.body.appendChild(button);
    const control = button.cloneNode(true);
    control.className += " qa-hover-control";
    control.style.top = `${top + 100}px`;
    control.style.pointerEvents = "none";
    document.body.appendChild(control);
  }, fixture);
  const button = page.locator("body > .event-participant-add-launch:not(.qa-hover-control)");
  const control = page.locator("body > .qa-hover-control");
  await page.touchscreen.tap(fixture.left + fixture.width / 2, fixture.top + fixture.height / 2);
  await expect.poll(() => button.evaluate(node => node.matches(":hover"))).toBe(true);
  await page.waitForTimeout(250); // Settle the first hover before the edge tap.
  const box = await button.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height - 0.5);
  await expect.poll(() => button.evaluate(node => node.matches(":hover"))).toBe(true);
  await page.waitForTimeout(250); // Let the 140–170 ms hover transitions settle.
  const after = await button.evaluate(node => ({
    top: node.getBoundingClientRect().top,
    background: getComputedStyle(node).backgroundColor,
    shadow: getComputedStyle(node).boxShadow
  }));
  const neutral = await control.evaluate(node => ({
    hovered: node.matches(":hover"),
    background: getComputedStyle(node).backgroundColor,
    shadow: getComputedStyle(node).boxShadow
  }));
  expect(Math.abs(after.top - fixture.top), "touch hover must not move the action out from under the tap").toBeLessThan(0.25);
  expect(neutral.hovered).toBe(false);
  expect(after.background, "hover color remains as feedback").not.toBe(neutral.background);
  expect(after.shadow, "hover shadow remains as feedback").not.toBe(neutral.shadow);
});
