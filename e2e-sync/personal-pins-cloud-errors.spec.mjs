import { expect, test, webkit } from "@playwright/test";

import { recordPersonalPinsCloudErrors } from "../e2e/helpers/personalPinsCloudErrors.mjs";

const origin = "https://personal-pins-qa.supabase.co";
const userId = "personal-pins-cloud-owner";
const inboxUrl = `${origin}/rest/v1/notification_inbox?recipient_user_id=eq.${userId}&limit=40`;
const pageUrl = "https://personal-pins-browser-probe.example.test/";

test("a real WebKit CORS-failing inbox request remains an error during a tracked reload", async () => {
  const browser = await webkit.launch();
  try {
    const context = await browser.newContext();
    await context.route("**/*", route => route.request().url() === pageUrl
      ? route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Inbox error probe</title>" })
      : route.fulfill({ headers: { "access-control-allow-origin": "https://wrong-origin.example.test" }, json: [] }));
    const page = await context.newPage();
    const monitor = recordPersonalPinsCloudErrors(page, { origin, userId, browserName: "webkit" });
    await page.goto(pageUrl);
    await monitor.withReload(async () => {
      const caught = await page.evaluate(async url => {
        try { await fetch(url); return false; } catch { return true; }
      }, inboxUrl);
      expect(caught).toBe(true);
      await expect.poll(() => monitor.errors.length).toBeGreaterThan(0);
      await page.reload();
    });
    expect(monitor.diagnostics).toEqual([]);
  } finally { await browser.close(); }
});
