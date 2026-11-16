import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { control, click, textLines, geometry } from "./helpers/profileAccountPresentation.mjs";
const bootstrap = readFileSync(new URL("./fixtures/profileRewardBootstrap.js", import.meta.url), "utf8"), evidence = /* @__PURE__ */ new WeakMap();
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  const e = { errors: [], external: [], overrides: [] };
  evidence.set(page, e);
  page.on("pageerror", (error) => e.errors.push(error.message));
  await page.route("**/*", (r) => new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : (e.external.push(r.request().url()), r.abort()));
  for (const [env, name] of [["PROFILE_ACCOUNT_TEST_LAYER", "publicAccountAuthLayer.mjs"], ["PROFILE_ACCOUNT_TEST_LEDGER", "publicLedgerWorkspaceLayer.mjs"]]) if (process.env[env]) await page.route("**/src/" + name + "*", async (route) => {
    e.overrides.push(name);
    await route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: readFileSync(process.env[env], "utf8") });
  });
  await page.addInitScript({ content: bootstrap });
});
test.afterEach(async ({ page }) => {
  const e = evidence.get(page);
  expect(e.errors).toEqual([]);
  expect(e.external).toEqual([]);
  for (const [env, name] of [["PROFILE_ACCOUNT_TEST_LAYER", "publicAccountAuthLayer.mjs"], ["PROFILE_ACCOUNT_TEST_LEDGER", "publicLedgerWorkspaceLayer.mjs"]]) if (process.env[env]) expect(e.overrides).toContain(name);
});
const snapshot = (p) => p.evaluate(() => ({ profileWrites: __friendInviteQa.profileWrites, friendWrites: __friendInviteQa.writes, rewardWrites: __friendInviteQa.rewardWrites, events: JSON.parse(localStorage.getItem("qa-invite-server-row")).state.events }));
for (const [id, root, w, h] of [["normal", 16, 393, 852], ["text20", 20, 411, 852], ["text32", 32, 320, 852], ["short", 32, 320, 390], ["landscape", 32, 852, 393]]) test("profile account " + id, async ({ page }, info) => {
  await page.setViewportSize({ width: w, height: h });
  for (const long of [false, true]) {
    await page.goto("/?requests=empty&reward=inactive" + (long ? "&long-email=1" : "") + (root > 16 ? "&dynamic-type-preview=" + root : ""));
    await page.locator('.product-app-nav [data-nav-destination="profile"]').click();
    await expect(page.locator('[data-profile-identity="username"] strong')).toHaveText("noam_levi");
    await expect.poll(() => page.evaluate(() => SogrimMonetization.status.status)).toBe("ready");
    await page.evaluate(() => document.fonts.ready);
    const a = page.locator("[data-account-controls]"), summary = a.locator("summary");
    await expect(a).not.toHaveAttribute("open", "");
    const before = await snapshot(page);
    await click(summary);
    await expect(a).toHaveAttribute("open", "");
    await expect(a.locator("[data-public-install-app]")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a2) => Number.isFinite(a2.effect?.getComputedTiming().endTime) && a2.playState === "running").length)).toBe(0);
    const m = await geometry(page, root);
    expect(m.email).toBe(long ? "noam.alexander.levi.long.account.name@example.invalid" : "noam@example.invalid");
    await expect(a.locator(".account-feedback-entry strong")).toHaveText("\u05E9\u05DC\u05D9\u05D7\u05EA \u05DE\u05E9\u05D5\u05D1");
    await expect(a.locator(".account-feedback-entry small")).toHaveText("\u05D3\u05D9\u05D5\u05D5\u05D7 \u05E2\u05DC \u05EA\u05E7\u05DC\u05D4 \u05D0\u05D5 \u05D4\u05E6\u05E2\u05D4 \u05DC\u05E9\u05D9\u05E4\u05D5\u05E8");
    await expect(a.locator(".account-delete-button svg")).toHaveCount(1);
    await expect(a.locator(".account-profile-controls-summary small,.account-danger-copy")).toHaveCount(0);
    const hrefs = await a.locator("nav a").evaluateAll((rows) => rows.map((e) => e.getAttribute("href")));
    expect(hrefs).toEqual(["./support.html", "./privacy.html", "./terms.html", "./accessibility.html"]);
    const help = await page.request.get("/support.html");
    expect(help.status()).toBe(200);
    expect(await help.text()).not.toContain("\u05DE\u05E9\u05D5\u05D1 \u05DC\u05D1\u05D5\u05D3\u05E7\u05D9\u05DD");
    for (const selector of [".account-profile-controls-summary strong", ".account-profile-email>span", ".account-profile-email>bdi", ".account-feedback-entry-copy>strong", ".account-feedback-entry-copy>small", ".account-data-link .account-row-label", ".account-profile-actions button span:not([aria-hidden])", ".account-delete-button .account-row-label", ".account-danger-note"]) {
      const list = a.locator(selector);
      for (let i = 0; i < await list.count(); i++) await textLines(list.nth(i));
    }
    const controls = a.locator("summary,a,button");
    for (let i = 0; i < await controls.count(); i++) await control(controls.nth(i));
    await control(summary);
    await page.screenshot({ path: info.outputPath(id + (long ? "-long" : "-normal") + "-top.png"), animations: "disabled" });
    await textLines(a.locator(".account-danger-note"));
    await page.screenshot({ path: info.outputPath(id + (long ? "-long" : "-normal") + "-bottom.png"), animations: "disabled" });
    await click(summary);
    await expect(a).not.toHaveAttribute("open", "");
    await expect(a.locator(".account-profile-controls-body")).not.toBeVisible();
    await control(summary);
    await textLines(summary.locator("strong"));
    await click(summary);
    await expect(a).toHaveAttribute("open", "");
    const feedback = a.locator('[data-account-action="feedback-open"]');
    await control(feedback);
    await feedback.press("Enter");
    const dialog = page.locator(".feedback-page-screen");
    await expect(dialog).toBeVisible();
    await page.locator(".product-route-controls .app-back-button").click();
    await expect(dialog).toHaveCount(0);
    await expect(feedback).toBeFocused();
    expect(await snapshot(page)).toEqual(before);
    expect(before.profileWrites).toEqual([]);
    expect(before.friendWrites).toEqual([]);
    expect(before.rewardWrites).toEqual([]);
  }
});
