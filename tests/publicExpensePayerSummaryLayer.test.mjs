import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("native expense payer summary replaces the retired observer layer", async () => {
  const [index, layer, sw] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("src/publicExpensePayerSummaryLayer.mjs", "utf8"),
    readFile("sw.js", "utf8")
  ]);

  assert.doesNotMatch(index, /publicExpensePayerSummaryLayer\.mjs/);
  assert.match(layer, /expense-payer-summary/);
  assert.match(layer, /data-action="expense-payer-amount"/);
  assert.match(layer, /parseMoneyInput/);
  assert.match(layer, /MutationObserver/);
  assert.doesNotMatch(sw, /publicExpensePayerSummaryLayer\.mjs/);
  const app = await readFile("src/app.mjs", "utf8");
  assert.match(app, /function renderExpensePayerSummary/);
  assert.match(app, /syncExpensePayerAmountInputs/);
});
