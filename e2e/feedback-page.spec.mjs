import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { control, textLines } from "./helpers/profileAccountPresentation.mjs";
const fixture = readFileSync(new URL("./fixtures/profileRewardBootstrap.js", import.meta.url), "utf8"), evidence = /* @__PURE__ */ new WeakMap();
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  const e = { errors: [], external: [] };
  evidence.set(page, e);
  page.on("pageerror", (x) => e.errors.push(x.message));
  await page.route("**/*", (r) => new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : (e.external.push(r.request().url()), r.abort()));
  await page.addInitScript({ content: fixture });
  for (const [env, name] of [["FEEDBACK_TEST_APP", "app.mjs"], ["FEEDBACK_TEST_ACCOUNT", "publicAccountAuthLayer.mjs"], ["FEEDBACK_TEST_LEDGER", "publicLedgerWorkspaceLayer.mjs"]]) if (process.env[env]) await page.route("**/src/" + name + "*", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(process.env[env], "utf8") }));
});
test.afterEach(async ({ page }) => {
  expect(evidence.get(page).errors).toEqual([]);
  expect(evidence.get(page).external).toEqual([]);
});
async function click(l) {
  if (await l.evaluate((e) => !!e.closest(".product-app-identity"))) {
    await expect.poll(() => l.evaluate((e) => {
      const r = e.getBoundingClientRect(), h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.width >= 44 && r.height >= 44 && !!h && (h === e || e.contains(h));
    })).toBe(true);
  } else await control(l);
  await l.page().evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const point = await l.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, hit: !!hit && (hit === e || e.contains(hit)) };
  });
  expect(point.hit).toBe(true);
  await l.page().mouse.click(point.x, point.y);
}
async function open(page, query = "") {
  await page.goto("/?requests=empty&reward=inactive" + query);
  await page.locator('.product-app-nav [data-nav-destination="profile"]').click();
  await expect(page.locator('[data-profile-identity="username"] strong')).toHaveText("noam_levi");
  await expect.poll(() => page.evaluate(() => SogrimMonetization.status.status)).toBe("ready");
  await click(page.locator("[data-account-controls]>summary"));
  await click(page.locator('[data-account-action="feedback-open"]'));
  await expect(page.locator(".feedback-page-screen")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function back(page) {
  await click(page.locator(".product-route-controls .app-back-button"));
  await expect(page.locator(".feedback-page-screen")).toHaveCount(0);
  await expect(page.locator(".profile-edit-screen>.top h1")).toHaveText("הפרופיל שלך");
  await expect(page.locator('[data-account-action="feedback-open"]')).toBeFocused();
}
async function reopen(page) {
  const a = page.locator("[data-account-controls]");
  if (await a.getAttribute("open") === null) await click(a.locator("summary"));
  await control(page.locator('[data-account-action="feedback-open"]'));
  await page.locator('[data-account-action="feedback-open"]').press("Enter");
  await expect(page.locator(".feedback-page-screen")).toBeVisible();
}
const writes = (p) => p.evaluate(() => ({ profile: __friendInviteQa.profileWrites, friends: __friendInviteQa.writes, rewards: __friendInviteQa.rewardWrites, state: localStorage.getItem("qa-invite-server-row") }));
for (const [id, root, w, h] of [["normal", 16, 393, 852], ["text20", 20, 411, 852], ["text32", 32, 320, 852], ["short", 32, 320, 390], ["landscape", 32, 852, 393]]) test("feedback page " + id, async ({ page }, info) => {
  await page.setViewportSize({ width: w, height: h });
  await open(page, root > 16 ? "&dynamic-type-preview=" + root : "");
  const before = await writes(page), s = page.locator(".feedback-page-screen"), form = s.locator("form"), area = form.locator("textarea");
  await expect(s.locator('.product-app-nav [data-nav-destination="profile"]')).toHaveAttribute("aria-current", "page");
  const widths = await form.evaluate(e => [e.querySelector("textarea"), e.querySelector('button[type="submit"]')].map(n => n.getBoundingClientRect().width));
  expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(1);
  await expect(page.locator('[aria-modal="true"],.account-feedback-backdrop')).toHaveCount(0);
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "סגירת המשוב", exact: true })).toHaveCount(0);
  await expect(s.locator('[data-account-action="feedback-cancel"]')).toHaveCount(0);
  const fonts = await s.evaluate((e) => {
    const b = e.getBoundingClientRect(), items = [];
    for (const [selector, ratio] of [[":scope>.top h1", 1.5], [".account-feedback-categories legend", 0.875], [".account-feedback-categories span", 0.875], [".account-feedback-message>span", 0.875], ["textarea", 1], [".account-feedback-message small", 0.8125], ['button[type="submit"]', 0.875]]) for (const n of e.querySelectorAll(selector)) {
      const r = n.getBoundingClientRect(), bad = [], walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      let t;
      while (t = walker.nextNode()) for (let i = 0; i < t.length; i++) {
        if (!t.textContent[i].trim()) continue;
        const q = document.createRange();
        q.setStart(t, i);
        q.setEnd(t, i + 1);
        for (const g of q.getClientRects()) if (g.width && g.height && (g.left < r.left - 1 || g.right > r.right + 1 || g.top < r.top - 1 || g.bottom > r.bottom + 1 || g.left < b.left - 1 || g.right > b.right + 1)) bad.push(t.textContent[i]);
      }
      items.push({ selector, ratio, font: parseFloat(getComputedStyle(n).fontSize), bad });
    }
    return { root: parseFloat(getComputedStyle(document.documentElement).fontSize), w: innerWidth, scrollWidth: document.documentElement.scrollWidth, items };
  });
  expect(fonts.root).toBe(root);
  if(root === 32 && w === 320) expect(await s.locator(".product-brand-copy>strong").evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBe(34);
  expect(fonts.w).toBe(fonts.scrollWidth);
  for (const i of fonts.items) {
    expect(i.font, i.selector).toBeCloseTo(root * i.ratio, 3);
    expect(i.bad, i.selector).toEqual([]);
  }
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: info.outputPath(id + "-top.png"), animations: "disabled" });
  for (const selector of [":scope>.top h1", ".account-feedback-categories legend", ".account-feedback-categories span", ".account-feedback-message>span", ".account-feedback-message small", 'button[type="submit"]']) {
    const loc = s.locator(selector);
    for (let i = 0; i < await loc.count(); i++) await textLines(loc.nth(i));
  }
  for (const selector of [".account-feedback-categories label", "textarea", 'button[type="submit"]']) {
    const loc = s.locator(selector);
    for (let i = 0; i < await loc.count(); i++) await control(loc.nth(i));
  }
  await page.screenshot({ path: info.outputPath(id + "-bottom.png"), animations: "disabled" });
  await area.fill("טיוטה סינתטית בלי מידע אישי");
  await click(form.locator('label:has(input[value="idea"])'));
  await expect(area).toHaveValue("טיוטה סינתטית בלי מידע אישי");
  await area.fill("123");
  await click(form.locator('button[type="submit"]'));
  const error = form.locator("[data-account-feedback-error]");
  await expect(error).toContainText("לפחות 10");
  await expect(area).toHaveValue("123");
  await expect(area).toBeFocused();
  await area.fill("טיוטה סינתטית בלי מידע אישי");
  await click(form.locator('button[type="submit"]'));
  await expect(error).toContainText("לא הצלחנו לשלוח כרגע");
  await expect(area).toHaveValue("טיוטה סינתטית בלי מידע אישי");
  await textLines(error);
  await back(page);
  await reopen(page);
  await expect(page.locator("textarea")).toHaveValue("טיוטה סינתטית בלי מידע אישי");
  await page.goBack();
  await expect(s).toHaveCount(0);
  await expect(page.locator('[data-account-action="feedback-open"]')).toBeFocused();
  await reopen(page);
  await page.locator('.product-app-nav [data-nav-destination="home"]').click();
  await expect(page.locator(".product-home-screen")).toBeVisible();
  expect(await writes(page)).toEqual(before);
});
test("feedback delayed failure and background renders preserve the draft without reopening the page", async ({ page }) => {
  await open(page, "&feedback-hold=1");
  const text = "טיוטה שאסור לאבד בזמן עדכון רקע";
  await page.locator("textarea").fill(text);
  await click(page.locator('label:has(input[value="clarity"])'));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("settle-friends:notice", { detail: { message: "" } })));
  await expect(page.locator(".feedback-page-screen")).toBeVisible();
  await expect(page.locator("textarea")).toHaveValue(text);
  await click(page.locator('button[type="submit"]'));
  await expect(page.locator('button[type="submit"]')).toBeDisabled();
  await back(page);
  await page.evaluate(() => __friendInviteQa.releaseFeedback());
  await expect(page.locator(".feedback-page-screen")).toHaveCount(0);
  await reopen(page);
  await expect(page.locator("[data-account-feedback-error]")).toContainText("לא הצלחנו לשלוח כרגע");
  await expect(page.locator("textarea")).toHaveValue(text);
  await expect(page.locator('input[value="clarity"]')).toBeChecked();
  expect(JSON.stringify(await page.evaluate(() => history.state))).not.toContain(text);
});
test("feedback success arriving after navigation stays on the current page and submits once", async ({ page }) => {
  await open(page, "&feedback-hold=1&feedback-result=success");
  await page.locator("textarea").fill("משוב סינתטי הצלחה מקומית בלבד");
  await click(page.locator('button[type="submit"]'));
  await expect.poll(() => page.evaluate(() => __friendInviteQa.feedbackRequests?.length)).toBe(1);
  await page.locator('.product-app-nav [data-nav-destination="home"]').click();
  await expect(page.locator(".product-home-screen")).toBeVisible();
  await page.evaluate(() => __friendInviteQa.releaseFeedback());
  await expect(page.locator(".product-home-screen")).toBeVisible();
  await page.locator('.product-app-nav [data-nav-destination="profile"]').click();
  await reopen(page);
  await expect(page.locator(".account-feedback-success")).toContainText("המשוב נשלח");
  expect(await page.evaluate(() => __friendInviteQa.feedbackRequests.length)).toBe(1);
  await page.locator('[data-account-action="feedback-done"]').click();
  await expect(page.locator(".feedback-page-screen")).toHaveCount(0);
  await expect(page.locator('[data-account-action="feedback-open"]')).toBeFocused();
  await reopen(page);
  await expect(page.locator("textarea")).toHaveValue("");
});
test("feedback launch and reload use the ordinary page and shared native back", async ({ page }) => {
  await page.goto("/?action=feedback&requests=empty&reward=inactive");
  await expect(page.locator(".feedback-page-screen form")).toBeVisible();
  await page.reload();
  await expect(page.locator(".feedback-page-screen form")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("settle-friends:native-back", { cancelable: true })));
  await expect(page.locator(".feedback-page-screen")).toHaveCount(0);
  await expect(page.locator(".profile-edit-screen>.top h1")).toHaveText("הפרופיל שלך");
});
