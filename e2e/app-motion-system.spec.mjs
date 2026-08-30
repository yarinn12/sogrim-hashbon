import { expect, test } from "@playwright/test";

const OWNER_ID = "person-motion-owner";
const emptyState = {
  currentParticipantId: OWNER_ID,
  participants: [
    {
      id: OWNER_ID,
      displayName: "ירין יצחק",
      kind: "user",
      avatarPreset: "avatar-1"
    }
  ],
  friendContacts: [],
  groups: [],
  events: [],
  deletedEvents: [],
  deletedParticipants: []
};

test.use({ reducedMotion: "no-preference" });

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: emptyState });
  await page.addInitScript(({ participantId, state }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem(
      "settle-friends-local-profile",
      JSON.stringify({
        participantId,
        displayName: "ירין יצחק",
        avatarPreset: "avatar-1"
      })
    );
    localStorage.setItem("settle-friends-current-participant", participantId);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { participantId: OWNER_ID, state: emptyState });
});

async function beginMotionCapture(page) {
  await page.evaluate(() => {
    const originalAnimate = globalThis.Motion?.animate;
    if (typeof originalAnimate !== "function") throw new Error("Motion.animate is unavailable");
    globalThis.__capturedProductMotion = [];
    globalThis.Motion.animate = (target, keyframes, options) => {
      globalThis.__capturedProductMotion.push({
        className: target instanceof Element ? target.className : "",
        duration: Number(options?.duration ?? 0)
      });
      return originalAnimate(target, keyframes, options);
    };
  });
}

test("core navigation and dialogs use the app motion system", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/motion-polish-v2/);
  await beginMotionCapture(page);

  await page.locator('[data-action="new-event"]').click();
  await expect(page.locator('#app .screen[data-screen-kind="new-event"]')).toBeVisible();
  await page.locator("[data-open-accessibility]:visible").first().click();
  await expect(page.locator('.accessibility-center[role="dialog"]')).toBeVisible();
  await expect.poll(
    () => page.evaluate(
      () => globalThis.__capturedProductMotion.some(
        (call) => String(call.className).includes("accessibility-center")
      )
    )
  ).toBe(true);

  const calls = await page.evaluate(() => globalThis.__capturedProductMotion);
  expect(calls.length).toBeGreaterThanOrEqual(3);
  expect(calls.some((call) => call.duration >= 0.15 && call.duration <= 0.5)).toBe(true);
  expect(calls.some((call) => String(call.className).includes("accessibility-center"))).toBe(true);
});

test("reduced motion blocks programmatic product animations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
  await beginMotionCapture(page);

  await page.locator('[data-action="new-event"]').click();
  await expect(page.locator('#app .screen[data-screen-kind="new-event"]')).toBeVisible();
  await page.waitForTimeout(80);

  const calls = await page.evaluate(() => globalThis.__capturedProductMotion);
  expect(calls).toEqual([]);
});
