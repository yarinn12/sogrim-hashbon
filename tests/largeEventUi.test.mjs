import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("long expense ledgers defer off-screen card rendering without changing the list", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(app, /event\.expenses\.length >= 50 \? " is-long-expense-ledger"/);
  assert.match(styles, /\.is-long-expense-ledger \.expense-row \{[\s\S]*?content-visibility: auto/);
  assert.match(styles, /contain-intrinsic-block-size: auto 112px/);
});

test("expense collections expose list semantics and an accessible heading", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /id="event-expenses" aria-labelledby="event-expenses-title"/);
  assert.match(app, /<h2 id="event-expenses-title">הוצאות<\/h2>/);
  assert.match(app, /expense-day-group[^>]*role="list"/);
  assert.match(app, /data-expense-id="\$\{escapeAttribute\(expense\.id\)\}"[^>]*role="listitem"/);
});

test("large event rows defer participant DOM until the row is expanded", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const expenseRow = app.slice(
    app.indexOf("function renderExpenseRow(event, expense)"),
    app.indexOf("function hydrateExpenseParticipants(details, event, expense)")
  );
  const hydration = app.slice(
    app.indexOf("function hydrateExpenseParticipants(details, event, expense)"),
    app.indexOf("function renderExpenseParticipant(event, participantId)")
  );
  const toggleHandler = app.slice(
    app.indexOf('if (action === "toggle-expense-participants")'),
    app.indexOf('if (action === "expense-step-next")')
  );

  assert.match(expenseRow, /class="expense-participants-list"[\s\S]*?><\/div>/);
  assert.doesNotMatch(expenseRow, /renderExpenseParticipant\(/);
  assert.match(hydration, /details\.dataset\.participantsHydrated === "true"/);
  assert.match(hydration, /renderExpenseParticipant\(event, participantId\)/);
  assert.match(toggleHandler, /if \(!details\.open\)[\s\S]*?hydrateExpenseParticipants/);
});
