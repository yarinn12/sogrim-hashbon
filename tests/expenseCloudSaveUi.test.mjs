import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

test("expense save closes after a durable bounded save while cloud sync continues", () => {
  const start = appSource.indexOf("async function saveExpense(");
  const end = appSource.indexOf("\nfunction continueExpenseEntry", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const source = appSource.slice(start, end);
  const awaitSave = source.indexOf("const saveResult = await saveRequest;");
  const closeDialog = source.indexOf("expenseDraft = null;");
  assert.ok(awaitSave > -1);
  assert.ok(closeDialog > awaitSave);
  assert.match(
    appSource,
    /const EXPENSE_FOREGROUND_SAVE_BUDGET_MS = 350;/
  );
  assert.match(
    source,
    /foregroundSaveBudgetMs: EXPENSE_FOREGROUND_SAVE_BUDGET_MS/
  );
  assert.match(source, /forceSharedEventIds: \[eventId\]/);
  assert.doesNotMatch(source, /awaitCloud:\s*true/);
});

test("failed shared expense sync stays retryable after the durable state is restored", () => {
  const start = appSource.indexOf("async function saveExpense(");
  const end = appSource.indexOf("\nfunction continueExpenseEntry", start);
  const source = appSource.slice(start, end);

  assert.match(source, /if \(!saveResult\?\.ok\)/);
  assert.match(source, /if \(saveResult\?\.reverted && wasNewExpense\)/);
  assert.match(source, /delete expenseDraft\.id;/);
  assert.match(source, /למנוע הבדל בין חברי הקבוצה/);
  assert.ok(
    source.indexOf("delete expenseDraft.id;") <
      source.indexOf("expenseDraft = null;")
  );
});

test("expense save gives immediate busy feedback and blocks duplicate taps", () => {
  const start = appSource.indexOf("function syncExpenseSaveState()");
  const end = appSource.indexOf("\nasync function saveExpense", start);
  const source = appSource.slice(start, end);

  assert.match(source, /expenseSaveInProgress \|\|/);
  assert.match(source, /button\.textContent = "שומרים…"/);
  assert.match(source, /button\.setAttribute\("aria-busy", "true"\)/);
});

test("expense deletion waits for the durable cloud outcome", () => {
  const start = appSource.indexOf("async function deleteExpense(");
  const end = appSource.indexOf("\nfunction prepareSettlement", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const source = appSource.slice(start, end);
  assert.match(source, /stateSaveCheckpoint\(persistState\(\{ awaitCloud: true \}\)\)/);
  assert.match(source, /await saveCheckpoint\.request/);
  assert.match(source, /if \(!saveResult\?\.ok && !saveResult\?\.pending\)/);
  assert.match(source, /rejectedStateSaveIsCurrent\(saveResult, saveCheckpoint\)/);
  assert.match(source, /state = loadState\(\)/);
  assert.match(source, /expenseDeleteRequests\.delete\(requestId\)/);
});
