import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("event screen exposes duplicate event workflow", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /duplicateEvent/);
  assert.match(app, /data-action="duplicate-event"/);
  assert.match(app, /duplicateCurrentEvent\(target\.dataset\.eventId\)/);
});

test("settlement screen exposes full event report copy", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /formatEventReport/);
  assert.match(app, /data-action="copy-event-report"/);
  assert.match(app, /copyEventReport\(target\.dataset\.eventId\)/);
});

test("home screen exposes event search", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /filterEvents/);
  assert.match(app, /data-action="event-search"/);
  assert.match(app, /eventSearch = target\.value/);
});

test("expense entry opens in a focused dialog and returns to the event after saving", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(app, /expense-modal-backdrop/);
  assert.match(app, /role="dialog"/);
  assert.match(app, /aria-modal="true"/);
  assert.match(app, /expenseDraft = null;\s+render\(\);/);
  assert.match(styles, /\.expense-modal-backdrop/);
  assert.match(styles, /\.expense-modal/);
});

test("expense payer amounts auto-fill the remaining total while staying editable", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /balancePayerAmounts/);
  assert.match(app, /markPayerAmountEdited/);
  assert.match(app, /syncExpensePayerAmountInputs/);
  assert.match(app, /addPayerToExpenseDraft/);
});
