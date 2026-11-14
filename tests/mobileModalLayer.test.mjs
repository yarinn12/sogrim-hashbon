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
      index.lastIndexOf("publicDynamicTypeLayer.mjs")
  );
  assert.match(sw, /publicMobileModalLayer\.mjs/);
  const viewportRuleStart = layer.indexOf("@media (max-width: 1366px) {");
  assert.ok(viewportRuleStart >= 0, "dialog canvas follows the 1366px viewport boundary");
  const viewportRules = layer.slice(viewportRuleStart, layer.indexOf("/* Safari can leave", viewportRuleStart));
  assert.match(viewportRules, /\.expense-modal-backdrop,[\s\S]*?\.event-modal-backdrop[\s\S]*?position: fixed !important;[\s\S]*?inset: 0 !important;/);
  assert.match(viewportRules, /\.expense-modal,[\s\S]*?\.event-modal[\s\S]*?height: 100dvh !important;[\s\S]*?overflow-y: auto !important;/);
  assert.match(viewportRules, /scroll-padding-block: calc\(88px \+ env\(safe-area-inset-top\)\) calc\(96px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(layer, /\.expense-modal-backdrop/);
  assert.match(layer, /\.event-modal-backdrop/);
  assert.match(layer, /html\.product-v1-live \.expense-modal/);
  assert.match(layer, /html\.ledger-workspace-v1 body #app \.expense-modal/);
  assert.match(layer, /height:\s*100dvh/);
  assert.match(layer, /max-height:\s*none !important/);
  assert.match(layer, /border-radius:\s*0 !important/);
  assert.match(layer, /\.expense-modal-actions/);
  assert.match(layer, /position:\s*static !important/);
  const expenseActionsRule = layer.slice(
    layer.indexOf(".expense-modal-actions,"),
    layer.indexOf("html.product-v2-live .expense-modal", layer.indexOf(".expense-modal-actions,"))
  );
  assert.doesNotMatch(expenseActionsRule, /bottom:\s*0 !important/);
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

test("721–1366px viewports use a responsive tablet canvas regardless of pointer", async () => {
  const layer = await readFile("src/publicMobileModalLayer.mjs", "utf8");

  assert.match(layer, /responsive-tablet-shell/);
  assert.match(layer, /width: min\(calc\(100% - 32px\), 960px\) !important/);
  assert.match(layer, /width: min\(520px, calc\(100vw - 48px\)\) !important/);
  assert.match(layer, /width: min\(calc\(100vw - 32px\), 960px\) !important/);
  assert.match(layer, /classList\.remove\("compact-tablet-phone-shell"\)/);
  const setup = layer.slice(layer.indexOf("function syncResponsiveTabletShell()"),
    layer.indexOf("function injectMobileModalStyles()"));
  assert.match(setup, /window\.innerWidth >= 721 && window\.innerWidth <= 1366/);
  assert.match(setup, /"responsive-tablet-shell",\s*isTabletViewport\s*\)/);
  assert.doesNotMatch(setup, /maxTouchPoints|hasTouch|navigator\.userAgent/);
  assert.match(layer, /@media \(min-width: 1025px\) \{[\s\S]*?\.event-participant-roster-modal \{[\s\S]*?overflow-y: auto !important;[\s\S]*?scroll-padding-block: 12px !important;/);
});

test("keyboard state retains safe-area clipping, controls, scroll and footer at every width", async () => {
  const layer = await readFile("src/publicMobileModalLayer.mjs", "utf8");
  const start = layer.indexOf("/* Safari can leave 100dvh unchanged");
  const end = layer.indexOf("/* Desktop layouts keep the same bottom navigation", start);
  assert.ok(start >= 0 && end > start);
  const keyboard = layer.slice(start, end);
  assert.doesNotMatch(keyboard, /@media \(max-width: 1024px\)|@media \(max-width: 1366px\)/);
  assert.match(keyboard, /html\.app-software-keyboard-open\.ledger-workspace-v1 body #app[\s\S]*?top: var\(--app-keyboard-viewport-top\) !important;[\s\S]*?height: var\(--app-keyboard-viewport-height\) !important;/);
  assert.match(keyboard, /--app-keyboard-safe-top: max\(0px, var\(--app-keyboard-safe-area-top, env\(safe-area-inset-top\)\)\)/);
  assert.match(keyboard, /\.expense-modal-step-header[\s\S]*?:is\(\.expense-accessibility-button, \.modal-section-back-button\)[\s\S]*?position: fixed !important;/);
  assert.match(keyboard, /\.expense-step-modal \{[\s\S]*?overflow-y: auto !important;[\s\S]*?scroll-padding-block: 72px 104px !important;/);
  assert.match(keyboard, /\.expense-modal-actions \{[\s\S]*?position: sticky !important;[\s\S]*?bottom: 0 !important;/);
  assert.match(keyboard, /:is\(\.product-app-nav, \.event-route-primary-nav\)[\s\S]*?visibility: hidden !important;[\s\S]*?pointer-events: none !important;/);
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
  const addGuestStart = app.indexOf("async function addGuestToEvent(eventId)");
  const addGuestEnd = app.indexOf("function addInlinePayerGuest", addGuestStart);
  const addGuest = app.slice(addGuestStart, addGuestEnd);

  assert.match(app, /function reactivateDialogAfterRender\(selector, focusSelector = "", scrollTop = 0\)/);
  assert.match(app, /focusSelector \? dialog\.querySelector\(focusSelector\) : null/);
  assert.match(app, /dialog !== renderedDialog/);
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
