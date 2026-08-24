import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("interactive selection rows share one circular check indicator", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(app, /new-event-selected-participant-check app-selection-check/);
  assert.match(app, /new-event-selection-check app-selection-check/);
  assert.match(app, /expense-participant-row-check app-selection-check/);
  assert.equal((app.match(/class="app-selection-check"/g) || []).length, 2);

  assert.match(styles, /\.app-selection-check\s*\{[\s\S]*?border-radius: 50% !important;/);
  assert.match(styles, /\.app-selection-check\s*\{[\s\S]*?margin-inline-start: auto !important;/);
  assert.match(styles, /\.quick-item-custom-share label:has\(input:checked\) \.app-selection-check/);
  assert.match(styles, /\.expense-participant-row:has\(\.expense-participant-checkbox:checked\) \.app-selection-check/);
});
