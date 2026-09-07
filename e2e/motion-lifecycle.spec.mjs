import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "no-preference", serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.route("**/qa-motion-fixture", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><head><title>Motion lifecycle</title><style>body{font-family:system-ui}button,summary{padding:12px}.panel{padding:20px}button{transform:none}</style></head><body><main id="app"><section class="screen product-home-screen" data-screen-kind="home"><header class="top"><h1>Motion lifecycle</h1></header><details id="details"><summary>Open details</summary><div id="panel" class="panel">Visible content</div></details><div id="rows"></div></section></main></body></html>'
  }));
  await page.goto("/qa-motion-fixture");
  await page.addScriptTag({ url: "/src/vendor/framer-motion-dom.js" });
  await page.evaluate(async () => {
    window.__nativeMutationObserver = MutationObserver;
    window.__motionCalls = [];
    const original = Motion.animate;
    Motion.animate = (target, keyframes, options) => {
      const controls = original(target, keyframes, { ...options, duration: window.__slowMotion ? 2 : options.duration });
      const call = { target, keyframes, options, done: false, controls };
      window.__motionCalls.push(call);
      Promise.resolve(controls).then(() => { call.done = true; });
      return controls;
    };
    await import("/src/publicMutationThrottleLayer.mjs");
    await import("/src/publicFramerMotionLayer.mjs");
    window.__waitFrames = async (count = 4) => {
      for (let i = 0; i < count; i += 1) await new Promise(requestAnimationFrame);
    };
    await window.__waitFrames();
  });
});

test("a saving indicator settles without a self-sustaining class mutation loop", async ({ page }, testInfo) => {
  const result = await page.evaluate(async () => {
    const button = document.createElement("button");
    button.textContent = "שומר…";
    button.setAttribute("aria-busy", "true");
    let writes = 0;
    const observer = new window.__nativeMutationObserver((records) => { writes += records.length; });
    observer.observe(button, { attributes: true, attributeFilter: ["class"] });
    document.querySelector(".screen").append(button);
    await window.__waitFrames(24);
    const firstWindowWrites = writes;
    await window.__waitFrames(24);
    const secondWindowWrites = writes - firstWindowWrites;
    button.setAttribute("aria-busy", "false");
    await window.__waitFrames();
    observer.disconnect();
    return { firstWindowWrites, secondWindowWrites, busy: button.classList.contains("motion-control-busy") };
  });
  expect(result).toEqual({ firstWindowWrites: 1, secondWindowWrites: 0, busy: false });
  await testInfo.attach("busy-mutation-counts", { body: JSON.stringify(result), contentType: "application/json" });
});

test("large row batches have a bounded animation budget and do not cascade", async ({ page }) => {
  const result = await page.evaluate(async () => {
    for (let i = 0; i < 18; i += 1) {
      const row = document.createElement("article");
      row.className = "expense-row";
      row.dataset.expenseId = `expense-${i}`;
      row.textContent = `Expense ${i}`;
      document.querySelector("#rows").append(row);
    }
    await window.__waitFrames(24);
    return window.__motionCalls.filter((call) => call.target.matches(".expense-row")).length;
  });
  expect(result).toBe(6);
});

test("opening details animates its panel once and rapid close remains responsive", async ({ page }) => {
  await page.locator("summary").click();
  await expect.poll(() => page.evaluate(() => window.__motionCalls.filter((call) => call.target.id === "panel").length)).toBe(1);
  await page.locator("summary").click();
  await expect(page.locator("#details")).not.toHaveAttribute("open", "");
  await page.locator("summary").click();
  await expect(page.locator("#panel")).toBeVisible();
});

for (const preference of ["system", "app"]) {
test(`${preference} reduced motion settles an already running reveal`, async ({ page }) => {
  await page.evaluate(() => { window.__slowMotion = true; });
  await page.locator("summary").click();
  await expect.poll(() => page.evaluate(() => window.__motionCalls.some((call) => call.target.id === "panel" && !call.done))).toBe(true);
  if (preference === "system") await page.emulateMedia({ reducedMotion: "reduce" });
  else await page.evaluate(() => document.documentElement.classList.add("accessibility-reduced-motion"));
  await expect.poll(() => page.evaluate(() => window.__motionCalls.filter((call) => call.target.id === "panel").every((call) => call.done)), { timeout: 700 }).toBe(true);
  await expect(page.locator("#panel")).toHaveCSS("opacity", "1");
  await expect(page.locator("#panel")).toBeVisible();
});
}

test("removing an animating panel releases its playback controller", async ({ page }) => {
  await page.evaluate(() => { window.__slowMotion = true; });
  await page.locator("summary").click();
  await expect.poll(() => page.evaluate(() => window.__motionCalls.some((call) => call.target.id === "panel" && !call.done))).toBe(true);
  await page.locator("#details").evaluate((element) => element.remove());
  await expect.poll(() => page.evaluate(() => window.__motionCalls.every((call) => call.done)), { timeout: 700 }).toBe(true);
});

test("home content does not start invisible or replay a half-second entrance", async ({ page }) => {
  const heroCalls = await page.evaluate(() => window.__motionCalls.filter((call) => call.target.matches(".top")).length);
  expect(heroCalls).toBe(0);
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator(".top")).toHaveCSS("opacity", "1");
});

test("a newly added note uses its note identity rather than the event identity", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const add = (id) => {
      const row = document.createElement("article");
      row.className = "event-note-row";
      row.dataset.eventId = "event-a";
      row.dataset.noteId = id;
      document.querySelector("#rows").append(row);
    };
    add("note-a");
    await window.__waitFrames();
    add("note-b");
    await window.__waitFrames();
    return window.__motionCalls.filter((call) => call.target.matches(".event-note-row")).map((call) => call.target.dataset.noteId);
  });
  expect(result).toEqual(["note-a", "note-b"]);
});
