import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("mobile modal layer loads last so phone dialogs open full screen", async () => {
  const index = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");
  const layer = await readFile("src/publicMobileModalLayer.mjs", "utf8");
  const productV1 = await readFile("src/publicProductV1Layer.mjs", "utf8");
  const fintech = await readFile("src/publicFintechDesignLayer.mjs", "utf8");
  const baseStyles = await readFile("styles.css", "utf8");

  assert.match(index, /publicMobileModalLayer\.mjs/);
  assert.ok(
    index.lastIndexOf("publicMobileModalLayer.mjs") >
      index.lastIndexOf("publicProductV1Layer.mjs")
  );
  assert.match(sw, /publicMobileModalLayer\.mjs/);
  assert.match(layer, /@media \(max-width: 760px\)/);
  assert.match(layer, /\.expense-modal-backdrop/);
  assert.match(layer, /\.event-modal-backdrop/);
  assert.match(layer, /html\.product-v1-live \.expense-modal/);
  assert.match(layer, /height:\s*100dvh/);
  assert.match(layer, /max-height:\s*none !important/);
  assert.match(layer, /border-radius:\s*0 !important/);
  assert.match(layer, /\.expense-modal-actions/);
  assert.match(layer, /position:\s*static !important/);
  assert.doesNotMatch(layer, /\.expense-modal-actions,[\s\S]*?bottom:\s*0 !important/);
  assert.doesNotMatch(productV1, /\.screen \{[\s\S]*?animation: product-v1-enter/);
  assert.doesNotMatch(fintech, /\.premium-app-shell \.screen,[\s\S]*?animation: fintech-float-in/);
  assert.doesNotMatch(baseStyles, /\.screen \{[\s\S]*?animation: surface-in/);
});

test("dialogs reset scroll, trap focus, and restore focus when they close", async () => {
  const [app, layer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicMobileModalLayer.mjs", "utf8")
  ]);

  assert.match(app, /function activateDialog/);
  assert.match(app, /dialog\.scrollTop = 0/);
  assert.match(app, /function handleDialogKeydown/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(app, /dialogReturnFocus/);
  assert.match(layer, /body\.app-dialog-open/);
});

test("expense entry focuses the first useful money control", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /function activateExpenseEntryDialog/);
  assert.match(app, /expenseDraft\?\.mode === "items"/);
  assert.match(app, /quick-item-name/);
  assert.match(app, /expense-total/);
  assert.match(app, /function activateDialog\(selector, focusSelector = ""\)/);
  assert.match(app, /immediateFocusTarget\?\.focus\(\{ preventScroll: true \}\)/);
});

test("dialog rerenders preserve modality, scroll position, and input focus", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const addGuestStart = app.indexOf("function addGuestToEvent(eventId)");
  const addGuestEnd = app.indexOf("function addInlinePayerGuest", addGuestStart);
  const addGuest = app.slice(addGuestStart, addGuestEnd);

  assert.match(app, /function reactivateDialogAfterRender\(selector, focusSelector = "", scrollTop = 0\)/);
  assert.match(app, /focusSelector \? app\.querySelector\(focusSelector\) : null/);
  assert.match(app, /dialog\.scrollTop = Math\.max\(0, scrollTop\)/);
  assert.match(app, /focusTarget\?\.closest\("details"\)\?\.setAttribute\("open", ""\)/);
  assert.match(app, /focus\(\{ preventScroll: true \}\)/);
  assert.match(addGuest, /closest\("\.expense-modal, \.event-modal"\)\?\.scrollTop/);
  assert.match(addGuest, /reactivateDialogAfterRender\([\s\S]*?event-guest-name/);
  assert.match(
    app,
    /if \(action === "add-payer"\)[\s\S]*?reactivateDialogAfterRender\([\s\S]*?expense-payer-id/
  );
  assert.match(
    app,
    /if \(action === "remove-payer"\)[\s\S]*?reactivateDialogAfterRender\([\s\S]*?expense-payer-id/
  );
});

test("removing a restaurant item preserves scroll and focuses the nearest row", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const removeItem = app.slice(
    app.indexOf('if (action === "quick-item-remove")'),
    app.indexOf('if (action === "remove-payer")')
  );

  assert.match(removeItem, /dialogScrollTop/);
  assert.match(removeItem, /nextItemIndex/);
  assert.match(removeItem, /reactivateDialogAfterRender\(/);
  assert.match(removeItem, /quick-item-amount/);
});

test("custom radio groups support arrow, Home and End keyboard navigation", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /function handleRadioGroupKeyboardNavigation\(event\)/);
  assert.match(app, /\["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"\]/);
  assert.match(app, /radio\?\.closest\?\.\('\[role="radiogroup"\]'\)/);
  assert.match(app, /radios\[nextIndex\]\.focus/);
  assert.match(app, /radios\[nextIndex\]\.click\(\)/);
});
