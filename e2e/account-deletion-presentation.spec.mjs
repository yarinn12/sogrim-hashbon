import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { click as appClick } from "./helpers/profileAccountPresentation.mjs";
const fixture = readFileSync(new URL("./fixtures/profileRewardBootstrap.js", import.meta.url), "utf8"), evidence = /* @__PURE__ */ new WeakMap();
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  const e = { errors: [], external: [] };
  evidence.set(page, e);
  page.on("pageerror", (x) => e.errors.push(x.message));
  await page.route("**/*", (r) => new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : (e.external.push(r.request().url()), r.abort()));
  await page.addInitScript({ content: fixture });
  for (const [env, file] of [["ACCOUNT_DELETION_TEST_ACCOUNT", "publicAccountAuthLayer.mjs"], ["ACCOUNT_DELETION_TEST_LEDGER", "publicLedgerWorkspaceLayer.mjs"]]) if (process.env[env]) await page.route("**/src/" + file + "*", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(process.env[env], "utf8") }));
});
test.afterEach(async ({ page }) => {
  expect(evidence.get(page).errors).toEqual([]);
  expect(evidence.get(page).external).toEqual([]);
});
async function open(page, root = 16, query = "") {
  await page.goto("/?requests=empty&reward=inactive" + query + (root > 16 ? "&dynamic-type-preview=" + root : ""));
  await page.locator('.product-app-nav [data-nav-destination="profile"]').click();
  await expect(page.locator('[data-profile-identity="username"] strong')).toHaveText("noam_levi");
  await expect.poll(() => page.evaluate(() => SogrimMonetization.status.status)).toBe("ready");
  await appClick(page.locator("[data-account-controls]>summary"));
  await appClick(page.locator(".account-delete-button"));
  await expect(page.locator(".account-delete-dialog")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime) && animation.playState === "running").length)).toBe(0);
}
async function hit(l, click = true) {
  await l.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect.poll(() => l.evaluate((e) => {
    const r = e.getBoundingClientRect(), d = e.closest(".account-delete-dialog").getBoundingClientRect(), p = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.width >= 44 && r.height >= 44 && r.top >= d.top - 1 && r.bottom <= d.bottom + 1 && !!p && (e === p || e.contains(p));
  })).toBe(true);
  if (click) {
    const b = await l.boundingBox();
    await l.page().mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }
}
async function textLines(l) {
  const lines = await l.evaluate((e) => {
    const d = e.closest(".account-delete-dialog"), walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), rows = /* @__PURE__ */ new Map();
    let n;
    while (n = walker.nextNode()) for (let i = 0; i < n.length; i++) {
      if (!n.textContent[i].trim()) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + 1);
      for (const b of r.getClientRects()) if (b.width && b.height) {
        const y = b.top + d.scrollTop, key = Math.round(y * 10), old = rows.get(key);
        rows.set(key, { top: y, h: b.height, left: Math.min(old?.left ?? b.left, b.left), right: Math.max(old?.right ?? b.right, b.right) });
      }
    }
    return [...rows.values()];
  });
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    await l.evaluate((e, line2) => {
      const d = e.closest(".account-delete-dialog"), r = d.getBoundingClientRect();
      d.scrollTop += line2.top - d.scrollTop - r.top - (d.clientHeight - line2.h) / 2;
    }, line);
    await expect.poll(() => l.evaluate((e, line2) => {
      const d = e.closest(".account-delete-dialog"), b = d.getBoundingClientRect(), y = line2.top - d.scrollTop, hit2 = document.elementFromPoint((line2.left + line2.right) / 2, y + line2.h / 2);
      return y >= b.top - 1 && y + line2.h <= b.bottom + 1 && !!hit2 && (e === hit2 || e.contains(hit2));
    }, line)).toBe(true);
  }
}
const state = (page) => page.evaluate(() => ({ snapshot: localStorage.getItem("qa-invite-server-row"), session: localStorage.getItem("settle-friends-account-session"), profile: __friendInviteQa.profileWrites, friends: __friendInviteQa.writes, reward: __friendInviteQa.rewardWrites }));
const deletionCount = (page) => page.evaluate(() => __friendInviteQa.deletionRequests?.length ?? 0);
async function returned(page) {
  await expect(page.locator(".account-delete-dialog")).toHaveCount(0);
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".account-delete-button")).toBeFocused();
}
async function reopen(page) {
  await appClick(page.locator(".account-delete-button"));
  await expect(page.locator(".account-delete-dialog")).toBeVisible();
  await expect(page.locator("[data-account-delete-confirmation]")).not.toBeChecked();
  await expect(page.locator('[data-account-action="delete-account-confirm"]')).toBeDisabled();
}
for (const [id, root, width, height] of [["normal", 16, 393, 852], ["text20", 20, 411, 852], ["text32", 32, 320, 852], ["short", 32, 320, 390], ["landscape", 32, 852, 393]]) test("account deletion presentation " + id, async ({ page }, info) => {
  await page.setViewportSize({ width, height });
  await open(page, root);
  const before = await state(page), d = page.locator(".account-delete-dialog");
  const geometry = await d.evaluate((e) => {
    const modal = e.getBoundingClientRect(), fonts = {}, bad = [];
    for (const s of ["h2", "#account-delete-description", ".account-delete-confirmation span", "button"]) {
      const el = e.querySelector(s);
      fonts[s] = parseFloat(getComputedStyle(el).fontSize);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while (n = walker.nextNode()) for (let i = 0; i < n.length; i++) {
        if (!n.textContent[i].trim()) continue;
        const range = document.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + 1);
        for (const r of range.getClientRects()) if (r.left < modal.left - 1 || r.right > modal.right + 1) bad.push({ s, left: r.left, right: r.right });
      }
    }
    return { root: parseFloat(getComputedStyle(document.documentElement).fontSize), fonts, bad, top: modal.top, bottom: modal.bottom, overflow: document.documentElement.scrollWidth - innerWidth, actionPosition: getComputedStyle(e.querySelector(".account-delete-actions")).position };
  });
  expect(geometry.root).toBe(root);
  expect(geometry.fonts.h2).toBe(root * 1.5);
  expect(geometry.fonts["#account-delete-description"]).toBe(root * 0.875);
  expect(geometry.fonts[".account-delete-confirmation span"]).toBe(root * 0.875);
  expect(geometry.fonts.button).toBe(root * 0.875);
  expect(geometry.top).toBeGreaterThanOrEqual(13);
  expect(geometry.bottom).toBeLessThanOrEqual(height - 13);
  expect(geometry.overflow).toBe(0);
  expect(geometry.bad).toEqual([]);
  expect(geometry.actionPosition).toBe("static");
  await expect(d.locator("#account-delete-description p")).toHaveCount(2);
  await expect(d.locator(".eyebrow")).toHaveCount(0);
  await expect(d.locator('[data-account-action="delete-account-cancel"]')).toHaveText("ביטול");
  await expect(d.locator('[data-account-action="delete-account-confirm"]')).toBeDisabled();
  await page.screenshot({ path: info.outputPath("deletion-" + id + "-top.png"), animations: "disabled" });
  for (const l of [d.locator("h2"), ...await d.locator("#account-delete-description p").all(), d.locator(".account-delete-confirmation span")]) await textLines(l);
  await hit(d.locator(".account-delete-confirmation"));
  await expect(d.locator("[data-account-delete-confirmation]")).toBeChecked();
  await expect(d.locator('[data-account-action="delete-account-confirm"]')).toBeEnabled();
  await hit(d.locator('[data-account-action="delete-account-confirm"]'), false);
  await page.screenshot({ path: info.outputPath("deletion-" + id + "-checked.png"), animations: "disabled" });
  await hit(d.locator('[data-account-action="delete-account-cancel"]'));
  await returned(page);
  expect(await state(page)).toEqual(before);
  expect(await deletionCount(page)).toBe(0);
});
for (const [root, width, height] of [[16, 393, 852], [32, 320, 390]]) test("account deletion consent and keyboard navigation root" + root, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await open(page, root);
  const before = await state(page), d = page.locator(".account-delete-dialog"), check = page.locator("[data-account-delete-confirmation]"), confirm = page.locator('[data-account-action="delete-account-confirm"]'), cancel = page.locator('[data-account-action="delete-account-cancel"]');
  await expect(d).toBeFocused();
  expect(await d.evaluate((e) => e.scrollTop)).toBe(0);
  await page.keyboard.press("Tab");
  await expect(check).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(check).toBeFocused();
  await page.keyboard.press("Escape");
  await returned(page);
  await reopen(page);
  await page.goBack();
  await returned(page);
  await reopen(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("settle-friends:native-back", { cancelable: true })));
  await returned(page);
  await reopen(page);
  await hit(page.locator(".account-delete-confirmation"));
  await check.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(check).toBeFocused();
  await hit(cancel);
  await returned(page);
  await reopen(page);
  await hit(cancel);
  await returned(page);
  expect(await state(page)).toEqual(before);
  expect(await deletionCount(page)).toBe(0);
});
for (const [root, width, height] of [[16, 393, 852], [32, 320, 390]]) test("account deletion blocked failure preserves the account root" + root, async ({ page }, info) => {
  await page.setViewportSize({ width, height });
  await open(page, root, "&deletion-hold=1");
  const before = await state(page), d = page.locator(".account-delete-dialog"), confirm = page.locator('[data-account-action="delete-account-confirm"]');
  await page.keyboard.press("Enter");
  expect(await deletionCount(page)).toBe(0);
  await hit(page.locator(".account-delete-confirmation"));
  await hit(confirm);
  await expect.poll(() => deletionCount(page)).toBe(1);
  await expect(d.locator("button:disabled,input:disabled")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(d).toBeVisible();
  await page.keyboard.press("Enter");
  expect(await deletionCount(page)).toBe(1);
  const request = await page.evaluate(() => __friendInviteQa.deletionRequests[0]);
  expect(request).toEqual({ method: "DELETE", body: { confirmation: "delete-my-account" }, authorization: "Bearer synthetic-invite-access" });
  await page.evaluate(() => __friendInviteQa.releaseDeletion());
  const error = page.locator("[data-account-delete-error]");
  await expect(error).toBeVisible();
  await expect(error).toContainText("לא הצלחנו להשלים את המחיקה");
  await expect(confirm).toBeEnabled();
  await expect(page.locator("[data-account-delete-confirmation]")).toBeChecked();
  expect(await error.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBe(root * 0.875);
  await textLines(error);
  await page.screenshot({ path: info.outputPath("deletion-error-root" + root + ".png"), animations: "disabled" });
  expect(await state(page)).toEqual(before);
  await hit(page.locator('[data-account-action="delete-account-cancel"]'));
  await returned(page);
  expect(await deletionCount(page)).toBe(1);
});
test("account deletion returns to the mouse opener even when the browser does not focus clicked buttons", async ({ page }) => {
  await open(page);
  await page.goBack();
  await returned(page);
  expect(await deletionCount(page)).toBe(0);
});
