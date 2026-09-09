import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const expenseCount of [49, 50]) {
  test(`every expense menu action remains reachable with ${expenseCount} expenses`, async ({ page, request }, testInfo) => {
    const owner = "person-ledger-audit";
    const eventId = "event-ledger-audit";
    const state = {
      currentParticipantId: owner,
      participants: [{ id: owner, displayName: "בודק הוצאות", kind: "user", avatarPreset: "avatar-1" }],
      friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
      events: [{ id: eventId, name: "בדיקת הוצאות רבות", currency: "ILS", participantIds: [owner],
        adminIds: [owner], createdByParticipantId: owner, createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z", transfers: [], activityLog: [],
        expenses: Array.from({ length: expenseCount }, (_, index) => ({
          id: `expense-${index}`, name: `הוצאה ${index}`, total: 12050,
          payers: [{ participantId: owner, amount: 12050 }], sharedByParticipantIds: [owner],
          createdByParticipantId: owner, occurredOn: "2026-09-09", updatedAt: "2026-09-09T00:00:00.000Z"
        })) }]
    };
    await request.post("/api/reset");
    await request.put("/api/state", { data: state });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ state, owner }) => {
      if (!localStorage.getItem("ledger-audit-seeded")) {
        localStorage.clear(); sessionStorage.clear();
        localStorage.setItem("settle-friends-state", JSON.stringify(state));
        localStorage.setItem("settle-friends-local-profile", JSON.stringify({ participantId: owner, displayName: "בודק הוצאות", avatarPreset: "avatar-1" }));
        localStorage.setItem("settle-friends-current-participant", owner);
        localStorage.setItem("ledger-audit-seeded", "1");
      }
      sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    }, { state, owner });
    const dynamicType = Number(testInfo.project.metadata?.dynamicTypePreview || 0);
    await page.goto(dynamicType ? `/?dynamic-type-preview=${dynamicType}` : "/");
    await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    await expect(page.locator(".expense-row")).toHaveCount(expenseCount);
    const row = page.locator('.expense-row[data-expense-id="expense-0"]');
    const menu = row.locator(".expense-row-actions-menu");
    await row.evaluate(element => element.scrollIntoView({ block: "center" }));
    await menu.locator(":scope > summary").click();
    await expect(menu).toHaveAttribute("open", "");
    await expect.poll(() => menu.locator("button").evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return [0.2, 0.5, 0.8].every(fraction => button.contains(document.elementFromPoint(
        rect.left + rect.width / 2, rect.top + rect.height * fraction
      )));
    })), { message: "every menu action must receive taps, including below the expense row" }).toEqual([true, true, true]);
    await page.screenshot({ path: testInfo.outputPath("expense-menu.png") });
    await menu.locator('[data-action="delete-expense"]').click();
    await expect(page.locator('[data-important-action-kind="delete-expense"]')).toBeVisible();
    await page.locator('[data-action="cancel-important-action"]').click();
    await expect(page.locator(".expense-row")).toHaveCount(expenseCount);
    await row.evaluate(element => element.scrollIntoView({ block: "center" }));
    await menu.locator(":scope > summary").click();
    await menu.locator('[data-action="edit-expense-notes"]').click();
    await page.locator('[data-action="expense-notes"]').fill("נשמר מתוך רשימה ארוכה");
    await page.locator('[data-action="save-expense"]').click();
    await expect(page.locator(".expense-notes-modal")).toBeHidden();
    await expect.poll(() => page.evaluate(async eventId => {
      const { loadState } = await import("./src/data/localStore.mjs");
      return loadState().events.find(event => event.id === eventId)?.expenses.find(expense => expense.id === "expense-0")?.notes;
    }, eventId)).toBe("נשמר מתוך רשימה ארוכה");
    await page.reload();
    await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    await expect(page.locator(".expense-row")).toHaveCount(expenseCount);
    await row.locator('[data-action="toggle-expense-participants"]').click();
    await expect(row.locator(".expense-saved-notes")).toHaveText("נשמר מתוך רשימה ארוכה");
    expect(errors).toEqual([]);
  });
}
