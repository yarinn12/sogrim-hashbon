// Required modules and the actual destination UI define journey readiness.
// An optional image may legitimately keep the window load event outstanding.
export async function localQaNavigationReady(page, url = "/", selector = '.screen[data-screen-kind="home"]') {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator(selector).waitFor({ state: "visible" });
}
