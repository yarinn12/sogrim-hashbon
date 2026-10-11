import { expect, test } from "@playwright/test";
import { capturePausedZeroScreenshot } from "./helpers/pausedZeroScreenshot.mjs";
import { openTypographyHome } from "./helpers/typographyReadiness.mjs";

test.use({ serviceWorkers: "block" });

const owner = "person-paused-zero-capture";
const eventId = "event-paused-zero-capture";
const timestamp = "2026-10-10T00:00:00.000Z";
const state = {
  currentParticipantId: owner,
  participants: [{ id: owner, displayName: "בודק צילום", kind: "user", avatarPreset: "avatar-1" }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{
    id: eventId, name: "חברים נפגשים לארוחת ערב משותפת", currency: "ILS",
    participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
    createdAt: timestamp, updatedAt: timestamp,
    expenses: [], transfers: [], activityLog: []
  }]
};

test("event screenshot preserves its paused infinite animation at time zero", async ({ page, request }, testInfo) => {
  expect((await request.post("/api/reset")).ok()).toBe(true);
  expect((await request.put("/api/state", { data: state })).ok()).toBe(true);
  await page.addInitScript(({ state: seededState, participantId }) => {
    localStorage.setItem("settle-friends-state", JSON.stringify(seededState));
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({
      participantId, displayName: "בודק צילום", avatarPreset: "avatar-1"
    }));
    localStorage.setItem("settle-friends-current-participant", participantId);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { state, participantId: owner });

  await openTypographyHome(page);
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${eventId}"]`)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getAnimations().some(animation =>
    animation.effect?.target?.classList?.contains("event-overview-header") &&
    animation.effect?.getComputedTiming?.().iterations === Infinity
  ))).toBe(true);

  const { png, before, after } = await capturePausedZeroScreenshot(page, {
    path: testInfo.outputPath("paused-zero-event.png")
  });
  expect(before.some(animation => animation.target?.includes("event-overview-header") && animation.infinite))
    .toBe(true);
  expect(after).toEqual(before);
  expect(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  await testInfo.attach("paused-zero-animation-readback", {
    body: JSON.stringify({ before, after }, null, 2), contentType: "application/json"
  });
});
