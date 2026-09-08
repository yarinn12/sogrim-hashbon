import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const owner = "stale-draft-owner", eventId = "stale-draft-event", expenseId = "stale-draft-expense";
const timestamp = "2026-09-01T00:00:00.000Z";
const state = {
  currentParticipantId: owner, participants: [{ id: owner, displayName: "בודק שחזור", kind: "user" }],
  groups: [], friendContacts: [], deletedEvents: [], deletedParticipants: [],
  events: [{ id: eventId, name: "שחזור עריכה ישנה", eventType: "outing", currency: "ILS",
    participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
    createdAt: timestamp, updatedAt: timestamp, transfers: [], notes: [], deletedNotes: [], activityLog: [],
    expenses: [{ id: expenseId, name: "הוצאה מקורית", total: 12000,
      payers: [{ participantId: owner, amount: 12000 }], sharedByParticipantIds: [owner],
      createdByParticipantId: owner, updatedAt: timestamp }] }]
};

test("a restored expense cannot overwrite a newer durable revision", async ({ page }) => {
  await page.addInitScript(state => {
    if (localStorage.getItem("qa-stale-seeded")) return;
    localStorage.setItem("qa-stale-seeded", "1");
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem("settle-friends-current-participant", state.currentParticipantId);
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({ participantId: state.currentParticipantId, displayName: "בודק שחזור" }));
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, state);
  await page.goto("/");
  await openExpense(page);
  await page.locator('[data-action="expense-step-edit"][data-step="name"]').click();
  await page.locator('[data-action="expense-name"]').fill("שם הטיוטה הישנה");
  // Model a newer peer revision that has already reached durable storage.
  // The editor remains open with its earlier 120-shekel amount and payers.
  await page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem("settle-friends-state"));
    const expense = current.events[0].expenses[0];
    expense.total = 20000;
    expense.payers[0].amount = 20000;
    expense.updatedAt = "2026-09-08T00:00:00.000Z";
    localStorage.setItem("settle-friends-state", JSON.stringify(current));
  });
  await page.reload();
  await openExpense(page);
  await expect(page.locator('[data-action="expense-name"]')).toHaveValue("שם הטיוטה הישנה");
  for (let step = 0; step < 4 && !(await page.locator('[data-action="save-expense"]').isVisible()); step++) {
    await page.locator('[data-action="expense-step-next"]').click();
  }
  await page.locator('[data-action="save-expense"]').click();
  const durable = await page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-state")).events[0].expenses[0]);
  expect(durable.total).toBe(20000);
  expect(durable.payers[0].amount).toBe(20000);
  expect(durable.name).toBe("הוצאה מקורית");
  await expect(page.locator("#expense-form-error")).toContainText("ההוצאה השתנתה");
  // Explicitly discarding the edit must allow a fresh opening of the new revision.
  await expect(page.locator('[data-action="cancel-expense"]')).toHaveText("סגור בלי לשמור את הטיוטה");
  await page.locator('[data-action="cancel-expense"]').click();
  await page.locator('.expense-row-actions-menu > summary').click();
  await page.locator('[data-action="edit-expense"]').click();
  await page.locator('[data-action="expense-step-edit"][data-step="amount"]').click();
  await expect(page.locator('[data-action="expense-total"]')).toHaveValue("200.00");
});

async function openExpense(page) {
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  const row = page.locator(`.expense-row[data-expense-id="${expenseId}"]`);
  await row.locator(".expense-row-actions-menu > summary").click();
  await row.locator('[data-action="edit-expense"]').click();
}
