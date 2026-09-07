import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "no-preference", serviceWorkers: "block" });
const runtimeErrors = new WeakMap();

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
});

test.beforeEach(async ({ page, request }) => {
  const owner = "person-return-focus-owner", eventId = "event-return-focus";
  const state = {
    currentParticipantId: owner,
    participants: [{ id: owner, displayName: "בדיקת חזרה", kind: "user", avatarPreset: "avatar-1" }],
    friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
    events: [{ id: eventId, name: "בדיקת חזרה לחלון", eventType: "outing", currency: "ILS",
      participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
      createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z",
      expenses: [], transfers: [], notes: [], activityLog: [] }]
  };
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
  await page.addInitScript(({ state, owner }) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem("settle-friends-current-participant", owner);
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({
      participantId: owner, displayName: "בדיקת חזרה", avatarPreset: "avatar-1"
    }));
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    const originalTimeout = window.setTimeout.bind(window);
    const held = [];
    window.setTimeout = (callback, delay, ...args) => {
      if (window.__holdCloseFocus && String(callback).includes("restorePendingDialogReturnFocus")) {
        held.push(() => callback(...args)); return -held.length;
      }
      return originalTimeout(callback, delay, ...args);
    };
    window.__flushCloseFocus = () => { window.__holdCloseFocus = false; const count = held.length; for (const cb of held.splice(0)) cb(); return count; };
  }, { state, owner });
  // Expose only to this synthetic local response, never in product source.
  await page.route("**/src/app.mjs*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__returnQA = {
      descriptor: createActionFocusDescriptor, restore: restoreActionFocus,
      pending: restorePendingDialogReturnFocus, scroll: scheduleDialogReturnScroll
    };` });
  });
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await page.locator('[data-action="open-event-notes"]').click();
  await expect(page.locator('[data-action="new-event-note"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("late close focus preserves a newly selected field and its typed text", async ({ page }, testInfo) => {
  await page.locator('[data-action="new-event-note"]').click();
  await page.evaluate(() => { window.__holdCloseFocus = true; });
  await page.locator('.event-note-modal [data-action="close-event-dialog"]').click();
  await expect(page.locator(".event-note-modal")).toHaveCount(0);
  const count = await page.evaluate(() => {
    const input = document.createElement("input"); input.id = "next-search"; input.setAttribute("aria-label", "חיפוש חדש לבדיקה");
    document.querySelector("#app .screen").append(input); input.focus();
    return window.__flushCloseFocus();
  });
  expect(count).toBeGreaterThan(0);
  await page.keyboard.insertText("ההקלדה נשארת כאן");
  await expect(page.locator("#next-search")).toHaveValue("ההקלדה נשארת כאן");
  await page.screenshot({ path: testInfo.outputPath("continued-typing.png") });
});

test("late close focus respects a new independent accessibility dialog", async ({ page }) => {
  await page.locator('[data-action="new-event-note"]').click();
  await page.evaluate(() => { window.__holdCloseFocus = true; });
  await page.locator('.event-note-modal [data-action="close-event-dialog"]').click();
  await expect(page.locator(".event-note-modal")).toHaveCount(0);
  await page.locator("[data-open-accessibility]:visible").first().click();
  await expect(page.locator('.accessibility-center[role="dialog"]')).toBeVisible();
  const count = await page.evaluate(() => {
    document.querySelector(".accessibility-center").focus();
    return window.__flushCloseFocus();
  });
  expect(count).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.querySelector(".accessibility-center").contains(document.activeElement))).toBe(true);
});

test("late action return cannot take focus out of a new note editor", async ({ page }) => {
  await page.evaluate(() => { window.__oldReturn = window.__returnQA.descriptor(document.querySelector('[data-action="new-event-note"]')); });
  await page.locator('[data-action="new-event-note"]').click();
  await page.locator('[data-action="event-note-body"]').focus();
  await page.evaluate(() => window.__returnQA.restore(window.__oldReturn));
  await page.keyboard.insertText("פתק חדש ממשיך להיכתב");
  await expect(page.locator('[data-action="event-note-body"]')).toHaveValue("פתק חדש ממשיך להיכתב");
  await expect(page.locator('[data-action="event-note-title"]')).toHaveValue("");
  await page.locator('[data-action="save-event-note"]').click();
  await expect(page.locator(".event-note-open")).toContainText("פתק חדש ממשיך להיכתב");
});

test("ordinary close returns to the real opener when no newer action took over", async ({ page }) => {
  await page.locator('[data-action="new-event-note"]').click();
  await page.locator('.event-note-modal [data-action="close-event-dialog"]').click();
  await expect(page.locator(".event-note-modal")).toHaveCount(0);
  await expect(page.locator('[data-action="new-event-note"]')).toBeFocused();
});

test("queued close scroll does not change the viewport after a new modal opens", async ({ page }, testInfo) => {
  await page.locator('[data-action="new-event-note"]').click();
  const result = await page.evaluate(async () => {
    const scrollTo = window.scrollTo.bind(window), calls = [];
    window.scrollTo = (...args) => { calls.push({ args, stack: new Error().stack }); return scrollTo(...args); };
    const before = window.scrollY;
    window.__returnQA.scroll(before + 250);
    await new Promise(requestAnimationFrame);
    window.scrollTo = scrollTo;
    return { before, after: window.scrollY, calls };
  });
  await testInfo.attach("scroll-return-calls", { contentType: "application/json", body: JSON.stringify(result, null, 2) });
  expect(result.before).toBe(0);
  expect(result.after).toBe(result.before);
  await expect(page.locator('[data-action="event-note-body"]')).toBeVisible();
});
