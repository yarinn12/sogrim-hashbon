import { expect, test } from "@playwright/test";

const ownerId = "manual-feedback-owner";
const guestName = "אורחת עם שם משפחה ארוך במיוחד";
const secondName = "משתתף שנשמר עם החזרה";
const eventName = "אירוע בדיקת משתתפים";
const initialState = {
  currentParticipantId: ownerId,
  participants: [{ id: ownerId, displayName: "מנהל בדיקה", kind: "user", avatarPreset: "avatar-1" }],
  friendContacts: [], groups: [], events: [], deletedEvents: [], deletedParticipants: []
};

test.beforeEach(async ({ page, request }, testInfo) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: initialState });
  await page.addInitScript(({ ownerId, initialState }) => {
    // Seed once: reload assertions must read what the application actually saved.
    if (!localStorage.getItem("settle-friends-local-profile")) {
      localStorage.setItem("settle-friends-state", JSON.stringify(initialState));
      localStorage.setItem("settle-friends-current-participant", ownerId);
      localStorage.setItem("settle-friends-local-profile", JSON.stringify({
        participantId: ownerId, displayName: "מנהל בדיקה", avatarPreset: "avatar-1"
      }));
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { ownerId, initialState });
  const fontSize = testInfo.project.metadata.dynamicTypePreview ||
    (testInfo.project.metadata.reflowScale ? 32 : 16);
  await page.goto(`/?dynamic-type-preview=${fontSize}`);
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
});

async function openManualParticipants(page) {
  await page.locator('[data-action="new-event"]').first().click();
  await page.locator('[data-action="new-event-type"][data-event-type="standard"]').click();
  await page.locator('[data-action="new-event-name"]').fill(eventName);
  await page.locator('[data-action="open-new-event-settlement"]').click();
  await page.locator('[data-action="open-new-event-participants"]').click();
  await expect(page.locator('[data-action="set-new-event-participant-view"][data-participant-view="manual"]')).toBeVisible();
  await page.locator('[data-action="set-new-event-participant-view"][data-participant-view="manual"]').click();
  await expect(page.locator('[data-action="new-event-guest-name"]')).toBeFocused();
}

async function assertSavedRoster(page, expectedNames) {
  await page.locator('[data-action="create-event"]').click();
  const event = page.locator('[data-screen-kind="event"][data-event-id]').first();
  await expect(event).toBeVisible();
  const eventId = await event.getAttribute("data-event-id");
  await page.reload();
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await page.locator('[data-action="open-event-participants"]').click();
  const roster = page.locator(".event-participant-roster-modal");
  await expect(roster.locator(".event-participant-roster-row")).toHaveCount(expectedNames.length + 1);
  for (const name of expectedNames) await expect(roster).toContainText(name);
}

test("adding names shows the selected roster immediately and keeps removal and deduplication working", async ({ page }) => {
  await openManualParticipants(page);
  const input = page.locator('[data-action="new-event-guest-name"]');
  const list = page.locator(".new-event-selected-participant-list");
  await input.fill(guestName);
  await page.locator('[data-action="new-event-add-guest"]').click();
  await expect(list).toContainText(guestName);
  await expect(page.locator("[data-new-event-participant-count]")).toContainText("2");
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await input.fill(guestName);
  await input.press("Enter");
  await expect(list.locator(".new-event-selected-participant")).toHaveCount(2);
  await list.locator("label.new-event-selected-participant").filter({ hasText: guestName }).click();
  await page.locator('[data-action="confirm-important-action"]').click();
  await expect(list).not.toContainText(guestName);
  await input.fill(guestName);
  await page.locator('[data-action="new-event-add-guest"]').click();
  await expect(list).toContainText(guestName);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.locator('[data-action="close-new-event-participant-view"]').click();
  await assertSavedRoster(page, [guestName]);
});

test("save and return commits the unfinished name, and returning with an empty field adds nothing", async ({ page }) => {
  await openManualParticipants(page);
  await page.locator('[data-action="new-event-guest-name"]').fill(secondName);
  await page.locator('[data-action="close-new-event-participant-view"]').click();
  await expect(page.locator(".new-event-selected-participant-list")).toContainText(secondName);
  await expect(page.locator('[data-action="set-new-event-participant-view"][data-participant-view="manual"]')).toBeFocused();
  await page.locator('[data-action="set-new-event-participant-view"][data-participant-view="manual"]').click();
  await expect(page.locator('[data-action="new-event-guest-name"]')).toHaveValue("");
  await page.locator('[data-action="close-new-event-participant-view"]').click();
  await expect(page.locator("[data-new-event-participant-count]")).toContainText("2");
  await assertSavedRoster(page, [secondName]);
});

test("save and return validates invisible names before leaving and accepts a corrected name", async ({ page }) => {
  await openManualParticipants(page);
  const input = page.locator('[data-action="new-event-guest-name"]');
  await input.fill("\u200b\u200e");
  await page.locator('[data-action="close-new-event-participant-view"]').click();
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toBeFocused();
  await input.fill(secondName);
  await page.locator('[data-action="close-new-event-participant-view"]').click();
  await assertSavedRoster(page, [secondName]);
});

test("the skip link has a clear Hebrew name and moves keyboard focus to main content", async ({ page }) => {
  await page.locator('[data-action="new-event"]').first().click();
  // Reproduce a delayed autofocus frame after event-type selection. A later
  // keyboard choice must retain focus when that older frame finally arrives.
  await page.evaluate(() => {
    const originalFrame = window.requestAnimationFrame.bind(window);
    const frames = [];
    window.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    window.__releaseTypeSelectionFrames = () => {
      window.requestAnimationFrame = originalFrame;
      for (const callback of frames.splice(0)) callback(performance.now());
      delete window.__releaseTypeSelectionFrames;
    };
  });
  await page.locator('[data-action="new-event-type"][data-event-type="standard"]').click();
  const nameInput = page.locator('[data-action="new-event-name"]');
  await nameInput.fill("טיוטה שלא הולכת לאיבוד");
  const originalUrl = page.url();
  const skip = page.getByRole("link", { name: "דלג לתוכן הראשי", exact: true });
  await skip.focus();
  await page.evaluate(() => window.__releaseTypeSelectionFrames());
  await expect(skip).toBeFocused();
  const skipGeometry = await skip.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewport: innerWidth,
      fontSize: style.fontSize, transform: style.transform, direction: style.direction };
  });
  await test.info().attach("skip-link-geometry", { contentType: "application/json", body: JSON.stringify(skipGeometry) });
  await expect(skip).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Enter");
  await expect(page.locator("#app")).toBeFocused();
  await expect(nameInput).toHaveValue("טיוטה שלא הולכת לאיבוד");
  expect(page.url()).toBe(originalUrl);
});

test("the single save action fills its footer on narrow screens and does not cover the selected names", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openManualParticipants(page);
  for (let index = 1; index <= 6; index += 1) {
    await page.locator('[data-action="new-event-guest-name"]').fill(`משתתף בדיקה מספר ${index}`);
    await page.locator('[data-action="new-event-add-guest"]').click();
  }
  const footer = page.locator(".new-event-participant-subview-footer");
  const save = footer.getByRole("button", { name: "שמירה וחזרה", exact: true });
  const footerBox = await footer.boundingBox();
  const saveBox = await save.boundingBox();
  expect(Math.abs(footerBox.width - saveBox.width), "one action should not leave an empty second column").toBeLessThanOrEqual(2);
  const lastRow = page.locator("label.new-event-selected-participant").last();
  await lastRow.scrollIntoViewIfNeeded();
  await lastRow.click();
  await expect(page.locator('[data-action="confirm-important-action"]')).toBeVisible();
  await page.locator('[data-action="confirm-important-action"]').click();
  await expect(page.locator("[data-new-event-participant-count]")).toContainText("6");
  await save.click();
  await expect(page.locator('[data-action="create-event"]')).toBeVisible();
});
