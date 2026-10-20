import { test, expect } from "@playwright/test";
import { openHeldRenderedHome, requireHeldHomeReadiness } from "./helpers/heldHomeReadinessControl.mjs";
requireHeldHomeReadiness(test);
test.use({ serviceWorkers: "block" });
const owner = "currency-country-owner", eventId = "currency-country-event";
const state = { currentParticipantId: owner, participants: [{ id: owner, displayName: "בודק מטבע", kind: "user" }], friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [], events: [{ id: eventId, name: "בדיקת חיפוש מדינה", eventType: "outing", currency: "ILS", participantIds: [owner], adminIds: [owner], createdByParticipantId: owner, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", expenses: [], transfers: [], notes: [], deletedNotes: [], activityLog: [] }] };
test.beforeEach(async ({ page, request }, info) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
  await page.addInitScript((state2) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state2));
    localStorage.setItem("settle-friends-current-participant", state2.currentParticipantId);
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({ participantId: state2.currentParticipantId, displayName: "בודק מטבע" }));
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, state);
  await page.route("**/v6/latest/THB", (route) => {
    const now = Math.floor(Date.now() / 1e3);
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ result: "success", provider: "https://www.exchangerate-api.com", base_code: "THB", time_last_update_unix: now - 3600, time_next_update_unix: now + 82800, rates: { THB: 1, ILS: 0.1 } }) });
  });
  const root = info.project.metadata.dynamicTypePreview || (info.project.metadata.reflowScale ? 32 : 16);
  await openHeldRenderedHome(page, { path: "/?dynamic-type-preview=" + root });
});
async function openEvent(page) {
  await page.locator('[data-action="open-event"][data-event-id="' + eventId + '"]').click();
}
async function checkPicker(page) {
  const picker = page.locator(".app-choice-picker"), search = picker.getByRole("searchbox", { name: "חיפוש מטבע" }), visible = picker.locator(".app-choice-option:not([hidden])");
  for (const query of ["תאילנד", "Thailand", "thai", "באט", "thb"]) {
    await search.fill(query);
    await expect(visible).toHaveCount(1);
    await expect(visible).toHaveAttribute("data-choice-value", "THB");
  }
  await search.fill("לאקיימתמדינהכזאת");
  await expect(visible).toHaveCount(0);
  await expect(picker.locator(".app-choice-search-empty")).toBeVisible();
  await search.fill("יפן");
  await expect(visible).toHaveAttribute("data-choice-value", "JPY");
  await search.fill("Japan");
  await expect(visible).toHaveCount(1);
  await expect(visible).toHaveAttribute("data-choice-value", "JPY");
  await search.clear();
  await expect(visible).toHaveCount(32);
  await search.fill("תאילנד");
}
test("expense currency search finds Thailand and selects baht without changing the event currency", async ({ page }, info) => {
  await openEvent(page);
  await page.locator('[data-action="show-expense-form"]').click();
  await page.locator('[data-choice-select-action="expense-source-currency"]').click();
  await checkPicker(page);
  await page.screenshot({ path: info.outputPath("thailand-search.png"), animations: "disabled" });
  await page.locator('.app-choice-option[data-choice-value="THB"]').click();
  await expect(page.locator('[data-action="expense-source-currency"]')).toHaveValue("THB");
  await expect(page.locator('[data-action="expense-fx-rate"]')).toHaveValue("0.1");
  await page.locator('[data-action="expense-total"]').fill("10");
  await expect(page.locator(".expense-fx-preview")).toContainText("₪1.00");
  await page.locator('[data-action="expense-step-next"]').click();
  await page.locator('[data-action="expense-name"]').fill("מונית");
  for (let i = 0; i < 3; i++) await page.locator('[data-action="expense-step-next"]').click();
  await page.locator('[data-action="save-expense"]').click();
  await expect(page.locator(".expense-row[data-expense-id]")).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-state")).events[0]);
  expect(saved.currency).toBe("ILS");
  expect(saved.expenses[0].fxConversion.sourceCurrency).toBe("THB");
  expect(saved.expenses[0].total).toBe(100);
});
test("new event currency search uses country names in Hebrew and English", async ({ page }) => {
  await page.locator('[data-action="new-event"]').first().click();
  await page.locator('[data-action="new-event-type"][data-event-type="standard"]').click();
  const picker = page.locator('[data-picker-action="new-event-currency-choice"]');
  await picker.locator("summary").click();
  const search = picker.locator('[data-action="new-event-currency-search"]'), visible = picker.locator('[data-action="new-event-currency-choice"]:visible');
  for (const query of ["תאילנד", "Thailand", "THB"]) {
    await search.fill(query);
    await expect(visible).toHaveCount(1);
    await expect(visible).toHaveAttribute("data-choice-value", "THB");
  }
  await search.fill("Japan");
  await expect(visible).toHaveAttribute("data-choice-value", "JPY");
  await search.fill("תאילנד");
  await visible.click();
  await expect(picker.locator("summary")).toContainText("באט");
});
test("event settings currency search uses the same country index", async ({ page }) => {
  await openEvent(page);
  await page.locator('[data-action="open-event-settings"]').click();
  await page.locator('[data-settings-section="currency"]').click();
  await page.locator('[data-choice-select-action="event-currency"]').click();
  await checkPicker(page);
  await page.locator('.app-choice-option[data-choice-value="THB"]').click();
  await expect(page.locator('[data-action="event-currency"]')).toHaveValue("THB");
});
