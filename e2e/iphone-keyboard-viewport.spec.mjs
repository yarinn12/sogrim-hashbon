import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const OWNER = "person-iphone-keyboard";
const EVENT = "event-iphone-keyboard";
const state = {
  currentParticipantId: OWNER,
  participants: [{ id: OWNER, displayName: "בודק אייפון", kind: "user", avatarPreset: "avatar-1" }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{ id: EVENT, name: "בדיקת מקלדת", currency: "ILS", participantIds: [OWNER],
    adminIds: [OWNER], createdByParticipantId: OWNER, createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z", expenses: [], transfers: [], activityLog: [] }]
};

for (const device of [
  { name: "compact", width: 375, height: 667, visible: 340 },
  { name: "regular", width: 390, height: 844, visible: 440 },
  { name: "large", width: 430, height: 932, visible: 480 }
]) {
  test(`expense remains editable above a keyboard that only shrinks the visual viewport (${device.name})`, async ({ page, request }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, "a touch keyboard viewport regression");
    await page.setViewportSize({ width: device.width, height: device.height });
    await request.post("/api/reset");
    await request.put("/api/state", { data: state });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ state, owner }) => {
      if (!localStorage.getItem("iphone-keyboard-seeded")) {
        localStorage.clear(); sessionStorage.clear();
        localStorage.setItem("settle-friends-state", JSON.stringify(state));
        localStorage.setItem("settle-friends-local-profile", JSON.stringify({ participantId: owner, displayName: "בודק אייפון", avatarPreset: "avatar-1" }));
        localStorage.setItem("settle-friends-current-participant", owner);
        localStorage.setItem("iphone-keyboard-seeded", "1");
      }
      sessionStorage.setItem("settle-friends-skip-next-splash", "1");
      // Safari's on-screen keyboard can shrink visualViewport without changing
      // innerHeight or 100dvh. Playwright has no real iOS keyboard: model that
      // browser boundary explicitly instead of resizing the layout viewport.
      const viewport = new EventTarget();
      Object.assign(viewport, { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1 });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      window.__setKeyboardViewport = (height, offsetTop = 0, scale = 1) => {
        Object.assign(viewport, { height, offsetTop, scale });
        viewport.dispatchEvent(new Event("resize"));
        viewport.dispatchEvent(new Event("scroll"));
      };
    }, { state, owner: OWNER });
    const dynamicType = Number(testInfo.project.metadata?.dynamicTypePreview || 0);
    await page.goto(dynamicType ? `/?dynamic-type-preview=${dynamicType}` : "/");
    await page.locator(`[data-action="open-event"][data-event-id="${EVENT}"]`).first().click();
    await page.locator('[data-action="show-expense-form"]').first().click();
    const dialog = page.locator(".expense-step-modal");
    const amount = page.locator('[data-action="expense-total"]');
    await expect(amount).toBeFocused();
    await page.evaluate(height => window.__setKeyboardViewport(height), device.visible);
    await amount.fill("120.50");
    await expect(amount).toBeFocused();
    await assertVisibleAboveKeyboard(page, '[data-action="expense-step-next"]');
    await amount.scrollIntoViewIfNeeded();
    await assertVisibleAboveKeyboard(page, '[data-action="expense-total"]');
    await page.screenshot({ path: testInfo.outputPath("amount-keyboard.png") });
    await page.evaluate(height => window.__setKeyboardViewport(height, 0, 2), device.visible);
    await expect(page.locator("html")).not.toHaveClass(/app-software-keyboard-open/);
    await page.evaluate(height => window.__setKeyboardViewport(height), device.visible);
    await assertVisibleAboveKeyboard(page, '[data-action="expense-step-next"]');
    await page.locator('[data-action="expense-step-next"]').tap();
    await expect(dialog).toHaveAttribute("data-expense-step", "name");
    const name = page.locator('[data-action="expense-name"]');
    await name.fill("ארוחת ערב באייפון");
    await page.evaluate(height => window.__setKeyboardViewport(height, 24), device.visible);
    await assertVisibleAboveKeyboard(page, '[data-action="expense-step-next"]');
    await expect(name).toBeFocused();
    await page.locator('[data-action="expense-step-next"]').tap();
    await expect(dialog).toHaveAttribute("data-expense-step", "payer");
    await page.evaluate(() => window.__setKeyboardViewport(innerHeight));
    await expect(page.locator("html")).not.toHaveClass(/app-software-keyboard-open/);
    await page.locator('[data-action="expense-step-next"]').tap();
    await expect(dialog).toHaveAttribute("data-expense-step", "participants");
    await page.locator('[data-action="expense-step-next"]').tap();
    await expect(dialog).toHaveAttribute("data-expense-step", "review");
    await expect(dialog).toContainText("120.50");
    await page.locator('[data-action="save-expense"]').tap();
    await expect(dialog).toBeHidden();
    // This fixture uses the local storage adapter; /api/state is only its
    // initial seed, not the persistence destination. Verify the real adapter.
    await expect.poll(() => page.evaluate(async eventId => {
      const { loadState } = await import("./src/data/localStore.mjs");
      const data = loadState();
      return data.events.find(item => item.id === eventId)?.expenses.map(item => ({ name: item.name, total: item.total }));
    }, EVENT)).toEqual([{ name: "ארוחת ערב באייפון", total: 12050 }]);
    await page.reload();
    await page.locator(`[data-action="open-event"][data-event-id="${EVENT}"]`).first().click();
    await expect(page.locator(".expense-row")).toHaveCount(1);
    await expect(page.locator(".expense-row")).toContainText("ארוחת ערב באייפון");
    await expect(page.locator(".expense-row")).toContainText("120.50");
    await page.locator('[data-action="open-event-notes"]').tap();
    await page.locator('[data-action="new-event-note"]').tap();
    const note = page.locator('[data-action="event-note-body"]');
    await note.fill("הסכום כולל טיפ.\nנפגשים בכניסה למסעדה.");
    await page.evaluate(height => window.__setKeyboardViewport(height), device.visible);
    const saveNote = page.locator('[data-action="save-event-note"]');
    await saveNote.scrollIntoViewIfNeeded();
    await assertVisibleAboveKeyboard(page, '[data-action="save-event-note"]');
    await expect(note).toBeFocused();
    await saveNote.tap();
    await expect(page.locator(".event-note-modal")).toBeHidden();
    await page.evaluate(() => window.__setKeyboardViewport(innerHeight));
    await expect(page.locator("html")).not.toHaveClass(/app-software-keyboard-open/);
    await expect(page.locator(".event-note-open")).toHaveCount(1);
    await expect(page.locator(".event-note-open")).toContainText("הסכום כולל טיפ.");
    expect(errors).toEqual([]);
  });
}

async function assertVisibleAboveKeyboard(page, selector) {
  await expect.poll(() => page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    return rect.top >= viewport.offsetTop - 1 && rect.bottom <= viewport.offsetTop + viewport.height + 1;
  }), { message: "the next action must be reachable while the keyboard is open" }).toBe(true);
}
