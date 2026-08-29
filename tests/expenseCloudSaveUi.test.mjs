import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

test("expense save waits for cloud confirmation before closing", () => {
  const start = appSource.indexOf("async function saveExpense(");
  const end = appSource.indexOf("\nfunction continueExpenseEntry", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const source = appSource.slice(start, end);
  const awaitSave = source.indexOf("const saveResult = await saveRequest;");
  const closeDialog = source.indexOf("expenseDraft = null;");
  assert.ok(awaitSave > -1);
  assert.ok(closeDialog > awaitSave);
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

test("expense deletion waits for the durable cloud outcome", () => {
  const start = appSource.indexOf("async function deleteExpense(");
  const end = appSource.indexOf("\nfunction prepareSettlement", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const source = appSource.slice(start, end);
  assert.match(source, /await persistState\(\{ awaitCloud: true \}\)/);
  assert.match(source, /if \(!saveResult\?\.ok\)/);
  assert.match(source, /state = loadState\(\)/);
  assert.match(source, /expenseDeleteRequests\.delete\(requestId\)/);
});
