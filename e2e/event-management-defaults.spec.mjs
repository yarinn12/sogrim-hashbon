import { expect, test } from "@playwright/test";
import { openRenderedHome } from "./helpers/typographyReadiness.mjs";

test.use({ serviceWorkers: "block" });
const owner = "person-management-default-owner";
const originalId = "existing-centralized-event";
const seed = {
  currentParticipantId: owner,
  participants: [{ id: owner, displayName: "נועם לוי", kind: "user", avatarPreset: "avatar-1" }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{ id: originalId, name: "אירוע קיים בניהול מרוכז", eventType: "standard", currency: "ILS",
    participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
    adminsCanEditOnly: true, locked: false, expenses: [], transfers: [],
    createdAt: "2026-10-30T08:00:00.000Z", settingsUpdatedAt: "2026-10-30T08:00:00.000Z" }]
};

for (const eventType of ["standard", "trip"]) {
  test(`${eventType} creation defaults to collaborative and retains it after reload`, async ({ page }, testInfo) => {
    const errors = [], external = [];
    page.on("pageerror", e => errors.push(e.message));
    const origin = new URL(testInfo.project.use.baseURL).origin;
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) {
        external.push(url.origin); return route.abort();
      }
      return route.continue();
    });
    await page.addInitScript(({ seed, owner }) => {
      if (!sessionStorage.getItem("management-default-seeded")) {
        localStorage.clear(); sessionStorage.clear();
        localStorage.setItem("settle-friends-state", JSON.stringify(seed));
        localStorage.setItem("settle-friends-local-profile", JSON.stringify({ participantId: owner, displayName: "נועם לוי", avatarPreset: "avatar-1" }));
        localStorage.setItem("settle-friends-current-participant", owner);
        sessionStorage.setItem("management-default-seeded", "1");
      }
      sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    }, { seed, owner });
    await openRenderedHome(page);
    await page.locator('[data-action="new-event"]').first().click();
    await page.locator(`[data-action="new-event-type"][data-event-type="${eventType}"]`).click();
    await page.locator('[data-action="new-event-name"]').fill(`בדיקת ברירת מחדל ${eventType}`);
    await page.locator('[data-action="open-new-event-settlement"]').click();
    await page.locator('[data-action="open-new-event-participants"]').click();
    await page.locator('[data-action="create-event"]').click();
    const event = page.locator('[data-screen-kind="event"][data-event-id]:not([data-event-view="summary"])');
    await expect(event).toBeVisible();
    const eventId = await event.getAttribute("data-event-id");
    expect(eventId).toBeTruthy(); expect(eventId).not.toBe(originalId);
    await expect.poll(() => page.evaluate(id => {
      const state = JSON.parse(localStorage.getItem("settle-friends-state"));
      return state.events.find(e => e.id === id)?.adminsCanEditOnly;
    }, eventId)).toBe(false);
    await page.locator(`[data-action="open-event-settings"][data-event-id="${eventId}"]`).first().click();
    await expect(page.locator('[data-settings-section="management"]')).toContainText("ניהול משותף");
    await page.locator('[data-settings-section="management"]').click();
    const collaborative = page.locator('[data-action="set-event-management-mode"][data-management-mode="collaborative"]');
    await expect(collaborative).toHaveAttribute("aria-checked", "true");
    await page.reload();
    await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    await page.locator(`[data-action="open-event-settings"][data-event-id="${eventId}"]`).first().click();
    await page.locator('[data-settings-section="management"]').click();
    await expect(collaborative).toHaveAttribute("aria-checked", "true");
    const saved = await page.evaluate(({ eventId, originalId }) => {
      const state = JSON.parse(localStorage.getItem("settle-friends-state"));
      return { created: state.events.find(e => e.id === eventId), original: state.events.find(e => e.id === originalId) };
    }, { eventId, originalId });
    expect(saved.created.adminsCanEditOnly).toBe(false);
    expect(saved.created.eventType).toBe(eventType);
    expect(saved.original.adminsCanEditOnly).toBe(true);
    expect(errors).toEqual([]); expect(external).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("collaborative-default-after-reload.png"), fullPage: true });
  });
}
