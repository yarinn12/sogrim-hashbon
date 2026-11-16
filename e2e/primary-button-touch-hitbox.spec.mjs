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
  await expect(page.locator("html")).not.toHaveClass(/app-splash-active/);

  // The production button lives under #app. Its approved design-coherence rule
  // keeps the same color and shadow during hover; :active supplies press feedback.
  const fixture = { left: 30, top: 300, width: 250, height: 52 };
  await page.evaluate(({ left, top, width, height }) => {
    const app = document.querySelector("#app");
    const host = document.createElement("div");
    host.className = "qa-primary-host";
    host.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${width}px;z-index:99999`;
    const button = document.createElement("button");
    button.className = "primary-button event-participant-add-launch";
    button.textContent = "הוסף משתתפים";
    button.style.height = `${height}px`;
    button.addEventListener("click", () => { window.__qaPrimaryClicks += 1; });
    window.__qaPrimaryClicks = 0;
    host.appendChild(button);
    app.appendChild(host);
    const control = button.cloneNode(true);
    control.className += " qa-hover-control";
    control.style.pointerEvents = "none";
    const controlHost = host.cloneNode(false);
    controlHost.className += " qa-control-host";
    controlHost.style.top = `${top + 100}px`;
    controlHost.appendChild(control);
    app.appendChild(controlHost);
  }, fixture);
  const button = page.locator("#app .qa-primary-host:not(.qa-control-host) > .event-participant-add-launch");
  const control = page.locator("#app .qa-control-host > .qa-hover-control");
  const initial = await button.boundingBox();
  expect(initial?.width).toBe(fixture.width);
  await page.touchscreen.tap(initial.x + initial.width / 2, initial.y + initial.height / 2);
  await expect.poll(() => button.evaluate(node => node.matches(":hover"))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__qaPrimaryClicks)).toBe(1);
  await page.waitForTimeout(250); // Settle the first hover before the edge tap.
  const box = await button.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height - 0.5);
  await expect.poll(() => button.evaluate(node => node.matches(":hover"))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__qaPrimaryClicks)).toBe(2);
  await page.waitForTimeout(250); // Let the 140 ms transform transition settle.
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
  expect(after.background, "production color remains consistent on touch hover").toBe(neutral.background);
  expect(after.shadow, "production shadow remains consistent on touch hover").toBe(neutral.shadow);

  // Hold a press to verify the production :active scale still provides feedback.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => button.evaluate(node => node.matches(":active"))).toBe(true);
  await expect.poll(() => button.evaluate(node => getComputedStyle(node).transform)).not.toBe("none");
  await expect.poll(() => button.evaluate(node => node.getBoundingClientRect().width), "pressed action visibly scales down").toBeLessThan(box.width * 0.99);
  await page.mouse.up();
});
