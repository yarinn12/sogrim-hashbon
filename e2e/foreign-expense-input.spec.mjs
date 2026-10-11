import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const owner = "fx-owner", eventId = "fx-event";
const date = "2026-10-11T00:00:00.000Z";
const state = {
  currentParticipantId: owner,
  participants: [{ id: owner, displayName: "בעל החשבון", kind: "user" }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{ id: eventId, name: "טיול", eventType: "outing", currency: "ILS",
    participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
    createdAt: date, updatedAt: date, expenses: [], transfers: [], notes: [], deletedNotes: [], activityLog: [] }]
};

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
  await page.addInitScript(state => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem("settle-friends-current-participant", state.currentParticipantId);
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({ participantId: state.currentParticipantId, displayName: "בעל החשבון" }));
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, state);
  await page.goto("/");
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await page.locator(`[data-action="show-expense-form"][data-event-id="${eventId}"]`).first().click();
});

async function completeExpense(page, { amount = "10", converted = "₪35.00" } = {}) {
  await page.locator('[data-action="expense-total"]').fill(amount);
  await page.locator('[data-action="expense-step-next"]').click();
  await page.locator('[data-action="expense-name"]').fill("מונית");
  for (let step = 0; step < 3; step++) await page.locator('[data-action="expense-step-next"]').click();
  await expect(page.locator('.expense-step-modal')).toHaveAttribute("data-expense-step", "review");
  await expect(page.locator('.expense-flow-review')).toContainText(converted);
  await page.locator('[data-action="save-expense"]').click();
  await expect(page.locator('.expense-row[data-expense-id]')).toHaveCount(1);
  return page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-state")).events[0].expenses[0]);
}

async function selectSourceCurrency(page, currency) {
  await page.locator('[data-choice-select-action="expense-source-currency"]').click();
  await page.locator(`.app-choice-option[data-choice-value="${currency}"]`).click();
}

function openAccessResponse(base, rates) {
  const last = Math.floor(Date.now() / 1000) - 3600;
  return { result: "success", provider: "https://www.exchangerate-api.com", base_code: base,
    time_last_update_unix: last, time_next_update_unix: last + 86400, time_eol_unix: 0, rates };
}

test("automatic Open Access rate previews and saves a locked snapshot; edit retains the rate", async ({ page }) => {
  const requests = [];
  await page.route("**/v6/latest/USD", route => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(openAccessResponse("USD", { USD: 1, ILS: 3.5, VND: 25000 })) });
  });
  await selectSourceCurrency(page, "USD");
  await expect(page.locator('[data-action="expense-fx-rate"]')).toHaveValue("3.5");
  await expect(page.locator('[data-action="expense-fx-rate"]')).toHaveAttribute("readonly", "");
  const expense = await completeExpense(page);
  expect(expense.total).toBe(3500);
  expect(expense.payers[0].amount).toBe(3500);
  expect(expense.fxConversion.sourceAmountMinorUnits).toBe("1000");
  expect(expense.fxConversion.mode).toBe("automatic");
  expect(expense.fxConversion.source).toBe("ExchangeRate-API Open Access");
  expect(expense.fxConversion.sourceUpdatedAt).toBeTruthy();
  expect(expense.fxConversion.nextUpdateAt).toBeTruthy();
  expect(expense.fxConversion.rates).toBeUndefined();
  await expect(page.locator(`[data-expense-id="${expense.id}"] a[href="https://www.exchangerate-api.com"]`)).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).not.toContain("amount");

  const row = page.locator(`[data-expense-id="${expense.id}"]`);
  await row.locator(".expense-row-actions-menu > summary").click();
  await row.locator('[data-action="edit-expense"]').click();
  await expect(page.locator('[data-action="expense-total"]')).toHaveValue("10.00");
  await expect(page.locator('[data-action="expense-fx-rate"]')).toHaveValue("3.5");
  await expect(page.locator('[data-action="expense-source-currency"]')).toHaveValue("USD");
  expect(requests).toHaveLength(1);
  await page.locator('[data-action="expense-step-edit"][data-step="name"]').click();
  await page.locator('[data-action="expense-name"]').fill("מונית מעודכנת");
  for (let step = 0; step < 3; step++) await page.locator('[data-action="expense-step-next"]').click();
  await page.locator('[data-action="save-expense"]').click();
  await expect(page.locator(`[data-expense-id="${expense.id}"] .expense-row-main`)).toContainText("מונית מעודכנת");
  const edited = await page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-state")).events[0].expenses[0]);
  expect(edited.fxConversion).toEqual(expense.fxConversion);
  expect(edited.total).toBe(expense.total);
  expect(requests).toHaveLength(1);
});

test("an unavailable automatic rate permits an explicit personal rate", async ({ page }) => {
  await page.route("**/v6/latest/USD", route => route.abort());
  await selectSourceCurrency(page, "USD");
  await expect(page.locator('.expense-fx-preview')).toContainText("אפשר להזין שער אישי");
  await page.locator('[data-action="expense-fx-manual"]').click();
  await page.locator('[data-action="expense-fx-rate"]').fill("3.5");
  const expense = await completeExpense(page);
  expect(expense.fxConversion.mode).toBe("manual");
  expect(expense.fxConversion.sourceDate).toBe(null);
  expect(expense.total).toBe(3500);
});

test("a three-decimal source amount keeps its precision while the event ledger stays two-decimal", async ({ page }) => {
  await page.route("**/v6/latest/JOD", route => route.abort());
  await selectSourceCurrency(page, "JOD");
  await expect(page.locator('.expense-fx-preview')).toContainText("אפשר להזין שער אישי");
  await page.locator('[data-action="expense-fx-manual"]').click();
  await page.locator('[data-action="expense-fx-rate"]').fill("5");
  const expense = await completeExpense(page, { amount: "1.234", converted: "₪6.17" });
  expect(expense.total).toBe(617);
  expect(expense.fxConversion.sourceFractionDigits).toBe(3);
  expect(expense.fxConversion.sourceAmountMinorUnits).toBe("1234");
});

test("VND uses a zero-decimal source and saves only its applied rate", async ({ page }) => {
  await page.route("**/v6/latest/VND", route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify(openAccessResponse("VND", { VND: 1, ILS: 0.000119, AED: 0.000142 })) }));
  await selectSourceCurrency(page, "VND");
  await expect(page.locator('[data-action="expense-fx-rate"]')).toHaveValue("0.000119");
  const expense = await completeExpense(page, { amount: "10000", converted: "₪1.19" });
  expect(expense.total).toBe(119);
  expect(expense.fxConversion.sourceFractionDigits).toBe(0);
  expect(expense.fxConversion.sourceAmountMinorUnits).toBe("10000");
  expect(expense.fxConversion.rates).toBeUndefined();
});

test("an event with a converted expense explains why its currency cannot change", async ({ page }) => {
  await page.route("**/v6/latest/USD", route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify(openAccessResponse("USD", { USD: 1, ILS: 3.5 })) }));
  await selectSourceCurrency(page, "USD");
  await expect(page.locator('[data-action="expense-fx-rate"]')).toHaveValue("3.5");
  await completeExpense(page);
  await page.locator('[data-action="open-event-settings"]').first().click();
  await page.locator('[data-settings-section="currency"]').click();
  await expect(page.locator('[data-action="event-currency"]')).toBeDisabled();
  await expect(page.locator('.event-currency-field')).toContainText("אי אפשר לשנות כעת");
});

test("typing an amount while an automatic quote loads keeps the input and focus", async ({ page }) => {
  let requestStarted, releaseQuote;
  const started = new Promise(resolve => { requestStarted = resolve; });
  const delayed = new Promise(resolve => { releaseQuote = resolve; });
  await page.route("**/v6/latest/USD", async route => {
    requestStarted();
    await delayed;
    await route.fulfill({ contentType: "application/json",
      body: JSON.stringify(openAccessResponse("USD", { USD: 1, ILS: 3.5 })) });
  });
  const selection = selectSourceCurrency(page, "USD");
  await started;
  await selection;
  const amount = page.locator('[data-action="expense-total"]');
  await amount.fill("10");
  await expect(amount).toHaveValue("10");
  await expect(amount).toBeFocused();
  releaseQuote();
  await expect(page.locator('[data-action="expense-fx-rate"]')).toHaveValue("3.5");
  await expect(amount).toHaveValue("10");
  await expect(amount).toBeFocused();
  await page.locator('[data-action="expense-step-next"]').click();
  await expect(page.locator('.expense-step-modal')).toHaveAttribute("data-expense-step", "name");
});

test("deliberately re-converting an edited expense records a fresh intent after FX removal", async ({ page }) => {
  await page.route("**/v6/latest/USD", route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify(openAccessResponse("USD", { USD: 1, ILS: 3.5 })) }));
  await selectSourceCurrency(page, "USD");
  await expect(page.locator('[data-action="expense-fx-rate"]')).toHaveValue("3.5");
  const first = await completeExpense(page);

  const edit = async () => {
    const row = page.locator(`[data-expense-id="${first.id}"]`);
    await row.locator(".expense-row-actions-menu > summary").click();
    await row.locator('[data-action="edit-expense"]').click();
    await page.locator('[data-action="expense-step-edit"][data-step="amount"]').click();
  };
  await edit();
  await selectSourceCurrency(page, "ILS");
  await completeExpense(page, { amount: "35", converted: "₪35.00" });
  const removed = await page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-state")).events[0].expenses[0]);
  expect(removed.fxConversion).toBeUndefined();
  expect(removed.fxConversionRemovedAt).toBe(removed.updatedAt);

  await edit();
  await selectSourceCurrency(page, "USD");
  await expect(page.locator('[data-action="expense-fx-rate"]')).toHaveValue("3.5");
  await completeExpense(page);
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-state")).events[0].expenses[0]);
  expect(restored.fxConversion.mode).toBe("automatic");
  expect(restored.fxConversionRestoredAt).toBe(restored.updatedAt);
  expect(restored.fxConversionRemovedAt).toBeUndefined();
});
