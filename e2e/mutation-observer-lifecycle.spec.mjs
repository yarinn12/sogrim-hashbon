import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// Exercise the production scheduling layer against each browser's real native
// observer, without cloud access or timing-dependent animation sleeps.
test.beforeEach(async ({ page }) => {
  await page.route("**/qa-observer-fixture", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><head><title>Observer fixture</title></head><body><section id="first">First panel</section><section id="second">Second panel</section></body></html>'
  }));
  await page.goto("/qa-observer-fixture");
  await page.evaluate(() => import("/src/publicMutationThrottleLayer.mjs"));
});

test("multiple native mutation batches survive one scheduled frame", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const batches = [];
    let receiverMatches = false;
    const observer = new MutationObserver(function (records, instance) {
      receiverMatches = this === instance && instance === observer;
      batches.push(records.map((record) => record.target.id));
    });
    observer.observe(document.body, { attributes: true, subtree: true });
    document.querySelector("#first").setAttribute("data-step", "one");
    await Promise.resolve();
    document.querySelector("#second").setAttribute("data-step", "two");
    await new Promise(requestAnimationFrame);
    observer.disconnect();
    return { batches, receiverMatches };
  });
  expect(result).toEqual({ batches: [["first", "second"]], receiverMatches: true });
});

test("takeRecords includes native and scheduled records without duplicate callbacks", async ({ page }) => {
  const result = await page.evaluate(async () => {
    let calls = 0;
    const observer = new MutationObserver(() => { calls += 1; });
    observer.observe(document.body, { attributes: true, subtree: true });
    document.querySelector("#first").setAttribute("data-step", "one");
    await Promise.resolve();
    document.querySelector("#second").setAttribute("data-step", "two");
    const targets = observer.takeRecords().map((record) => record.target.id);
    const remaining = observer.takeRecords().length;
    await new Promise(requestAnimationFrame);
    observer.disconnect();
    return { targets, remaining, calls };
  });
  expect(result).toEqual({ targets: ["first", "second"], remaining: 0, calls: 0 });
});

test("disconnect and reobserve deliver only the new target's mutations", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const batches = [];
    const observer = new MutationObserver((records) => {
      batches.push(records.map((record) => record.target.id));
    });
    const first = document.querySelector("#first");
    const second = document.querySelector("#second");
    observer.observe(first, { attributes: true });
    first.setAttribute("data-step", "old");
    await Promise.resolve();
    observer.disconnect();
    observer.observe(second, { attributes: true });
    second.setAttribute("data-step", "new");
    // Let the native delivery schedule its frame before awaiting that frame.
    await Promise.resolve();
    await new Promise(requestAnimationFrame);
    observer.disconnect();
    return batches;
  });
  expect(result).toEqual([["second"]]);
});

test("legacy inert fallback updates and restores both panels across mutation batches", async ({ page }) => {
  const result = await page.evaluate(async () => {
    // Exercise the fallback needed on older iOS in modern WebKit/Chromium.
    delete HTMLElement.prototype.inert;
    if ("inert" in HTMLElement.prototype) throw new Error("Unable to activate inert fallback");
    const first = document.querySelector("#first");
    const second = document.querySelector("#second");
    first.setAttribute("aria-hidden", "false");
    await import("/src/platformCompatibility.mjs");
    first.setAttribute("inert", "");
    await Promise.resolve();
    second.setAttribute("inert", "");
    await new Promise(requestAnimationFrame);
    const hidden = [first, second].map((panel) => panel.getAttribute("aria-hidden"));
    first.removeAttribute("inert");
    await Promise.resolve();
    second.removeAttribute("inert");
    await new Promise(requestAnimationFrame);
    return { hidden, restored: [first, second].map((panel) => panel.getAttribute("aria-hidden")) };
  });
  expect(result).toEqual({ hidden: ["true", "true"], restored: ["false", null] });
});
