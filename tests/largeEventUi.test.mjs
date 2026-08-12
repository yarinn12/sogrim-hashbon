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
  assert.match(app, /data-expense-id="\$\{escapeAttribute\(expense\.id\)\}" role="listitem"/);
});
