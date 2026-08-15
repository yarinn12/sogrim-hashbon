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

test("failed expense sync stays retryable without creating a duplicate", () => {
  const start = appSource.indexOf("async function saveExpense(");
  const end = appSource.indexOf("\nfunction continueExpenseEntry", start);
  const source = appSource.slice(start, end);

  assert.match(source, /if \(!saveResult\?\.ok\)/);
  assert.match(source, /expenseDraft\.id = expense\.id;/);
  assert.match(source, /עדיין לא הסתנכרנה עם הקבוצה/);
  assert.ok(
    source.indexOf("expenseDraft.id = expense.id;") <
      source.indexOf("expenseDraft = null;")
  );
});
