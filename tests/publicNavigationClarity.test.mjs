import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public overlay explains where the visitor is and exposes primary actions", async () => {
  const overlay = await readFile("src/publicClarityLayer.mjs", "utf8");

  assert.match(overlay, /enhanceNavigationClarity/);
  assert.match(overlay, /product-context-bar/);
  assert.match(overlay, /איפה אני/);
  assert.match(overlay, /מה עושים עכשיו/);
  assert.match(overlay, /data-public-click/);
});

test("public event screen makes expense entry and settlement obvious", async () => {
  const overlay = await readFile("src/publicClarityLayer.mjs", "utf8");

  assert.match(overlay, /enhanceEventScreen/);
  assert.match(overlay, /product-event-command/);
  assert.match(overlay, /כאן מכניסים הוצאות/);
  assert.match(overlay, /הוסף הוצאה/);
  assert.match(overlay, /סגור חשבון/);
  assert.match(overlay, /שתף קישור/);
});

test("public overlay adds a mobile action bar for the next obvious step", async () => {
  const overlay = await readFile("src/publicClarityLayer.mjs", "utf8");

  assert.match(overlay, /product-sticky-actions/);
  assert.match(overlay, /goToNativeAction/);
  assert.match(overlay, /show-expense-form/);
  assert.match(overlay, /copy-invite/);
  assert.match(overlay, /settle/);
});

test("public clarity layer clears starter expense defaults and exposes saved name removal", async () => {
  const overlay = await readFile("src/publicClarityLayer.mjs", "utf8");

  assert.match(overlay, /clearStarterExpenseDefaults/);
  assert.match(overlay, /resetInputValue\(expenseName, "מונית"\)/);
  assert.match(overlay, /resetInputValue\(expenseTotal, "110"\)/);
  assert.match(overlay, /product-saved-names-panel/);
  assert.match(overlay, /data-public-remove-participant/);
});

test("public clarity layer is loaded after the profile overlay", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicProfileOverlay\.mjs/);
  assert.match(index, /publicClarityLayer\.mjs/);
});
