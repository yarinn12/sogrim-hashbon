import { expect, test } from "@playwright/test";

const eventId = "visual-roster-reflow";
const ownerId = "visual-roster-owner";
const eventName = "טיול משפחתי לקוריאה ולפיליפינים בספטמבר – הוצאות משותפות על מלונות, מסעדות, תחבורה ואטרקציות של כל המשתתפים לאורך כל החופשה";
const participants = [
  { id: ownerId, displayName: "מנהל בדיקה", kind: "user", avatarPreset: "avatar-1" },
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `visual-roster-guest-${index}`,
    displayName: `משתתף בדיקה ${index + 1}`,
    kind: "guest"
  }))
];
const state = {
  currentParticipantId: ownerId, participants, friendContacts: [], groups: [],
  deletedEvents: [], deletedParticipants: [],
  events: [{
    id: eventId, name: eventName, eventType: "trip", currency: "ILS",
    participantIds: participants.map(({ id }) => id), adminIds: [ownerId],
    createdByParticipantId: ownerId, createdAt: "2026-09-08T09:00:00.000Z",
    updatedAt: "2026-09-08T09:00:00.000Z", expenses: [], transfers: [], activityLog: []
  }]
};

for (const orientation of ["portrait", "landscape"]) {
  test(`a long event title leaves the entire participant roster reachable in ${orientation}`, async ({ page, request, browserName }, testInfo) => {
    await request.post("/api/reset");
    await request.put("/api/state", { data: state });
    await page.addInitScript(({ state, ownerId }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem("settle-friends-state", JSON.stringify(state));
      localStorage.setItem("settle-friends-local-profile", JSON.stringify({
        participantId: ownerId, displayName: "מנהל בדיקה", avatarPreset: "avatar-1"
      }));
      localStorage.setItem("settle-friends-current-participant", ownerId);
      sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    }, { state, ownerId });
    if (orientation === "landscape") await page.setViewportSize({ width: 667, height: 375 });
    await page.goto("/?dynamic-type-preview=32");
    await expect(page.locator("html")).toHaveCSS("font-size", "32px");
    await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    await page.locator('[data-action="open-event-participants"]').click();
    const roster = page.locator(".event-participant-roster-modal");
    await expect(roster).toBeVisible();
    await expect(roster.locator(".event-participant-roster-row")).toHaveCount(participants.length);
    await expect(roster.locator(".event-modal-header")).toContainText(eventName);
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation =>
      animation.playState === "running" && Number.isFinite(animation.effect?.getComputedTiming().endTime)
    ).length)).toBe(0);

    const scrollOwner = roster;
    // Programmatic scrolling alone can succeed on overflow:hidden elements.
    // Require a real user-scrollable container before testing its last control.
    await expect(scrollOwner).toHaveCSS("overflow-y", "auto");
    const geometry = await roster.evaluate(node => {
      const modal = node.getBoundingClientRect();
      const nav = [...document.querySelectorAll(".product-app-nav")]
        .map(element => element.getBoundingClientRect()).find(rect => rect.height > 0);
      return { modalBottom: modal.bottom, navTop: nav.top, gap: nav.top - modal.bottom };
    });
    await testInfo.attach("roster-navigation-gap", { contentType: "application/json", body: JSON.stringify(geometry) });
    expect(geometry.gap, "the route must use the space above its compact navigation").toBeLessThanOrEqual(24);
    expect(geometry.gap, "the navigation must not cover the route").toBeGreaterThanOrEqual(-1);
    // Playwright's mobile WebKit does not implement mouse.wheel. Chromium also
    // verifies actual wheel input so an overflow:hidden regression cannot pass.
    if (browserName === "chromium") {
      const box = await scrollOwner.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 400);
      await expect.poll(() => scrollOwner.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    }
    const lastRow = roster.locator(".event-participant-roster-row").last();
    await lastRow.scrollIntoViewIfNeeded();
    await expect(lastRow).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`roster-${orientation}-last-participant.png`) });
    await lastRow.click();
    await expect(page.locator(".event-participant-management-modal")).toBeVisible();
    await page.goBack();
    await expect(roster).toBeVisible();
    const add = roster.locator('[data-action="open-event-participant-add"]');
    await add.scrollIntoViewIfNeeded();
    await add.click();
    await expect(page.locator(".event-participant-add-route-modal")).toBeVisible();
  });
}
