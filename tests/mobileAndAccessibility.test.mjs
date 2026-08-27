import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("src/app.mjs", "utf8");
const ledger = readFileSync("src/publicLedgerWorkspaceLayer.mjs", "utf8");
const mobileModal = readFileSync("src/publicMobileModalLayer.mjs", "utf8");
const inviteJoinLayer = readFileSync("src/publicInviteJoinFixLayer.mjs", "utf8");

test("long-press text selection stays limited to live editing fields", () => {
  assert.match(app, /app\.addEventListener\("selectstart", handleTextSelectionStart\)/);
  assert.match(
    app,
    /function handleTextSelectionStart\(event\) \{[\s\S]*?if \(!isEditableTextTarget\(event\.target\)\) event\.preventDefault\(\)/
  );
  assert.match(
    app,
    /function handleEventContextMenu\(event\) \{[\s\S]*?if \(isEditableTextTarget\(event\.target\)\) return;[\s\S]*?event\.preventDefault\(\)/
  );
  assert.match(
    ledger,
    /Long-press text tools are reserved for fields that can actually be edited\.[\s\S]*?html\.ledger-workspace-v1 body,[\s\S]*?-webkit-user-select: none !important;[\s\S]*?-webkit-touch-callout: none !important/
  );
  assert.match(
    ledger,
    /textarea:not\(\[readonly\]\):not\(\[disabled\]\),[\s\S]*?\[contenteditable="true"\],[\s\S]*?-webkit-user-select: text !important;[\s\S]*?-webkit-touch-callout: default !important/
  );
});

test("every money field opens a numeric keypad and stays LTR", () => {
  for (const action of ["expense-total", "expense-payer-amount", "quick-item-amount"]) {
    const field = app.slice(app.indexOf(`data-action="${action}"`));
    const tag = field.slice(0, field.indexOf("/>"));
    assert.match(tag, /inputmode="decimal"/, `${action} requests a decimal keypad`);
    assert.match(tag, /dir="ltr"/, `${action} keeps digits left to right`);
  }
});

test("mobile modal inputs are at least 16px so iOS never zooms on focus", () => {
  const rule = mobileModal.slice(mobileModal.indexOf(".expense-modal input,"));
  const block = rule.slice(0, rule.indexOf("}"));

  assert.match(block, /font-size: 16px !important/);
  assert.match(block, /min-height: 48px !important/);
});

test("decimal inputs get scroll margin so the keyboard cannot cover them", () => {
  assert.match(
    mobileModal,
    /\.expense-modal input\[inputmode="decimal"\],[\s\S]*?scroll-margin-block: 96px;/
  );
  assert.match(
    ledger,
    /scroll-margin-block: 96px calc\(156px \+ env\(safe-area-inset-bottom\)\) !important;/
  );
});

test("typing into a payer amount never has its own value overwritten", () => {
  const sync = app.slice(
    app.indexOf("function syncExpensePayerAmountInputs"),
    app.indexOf("function syncExpensePayerSummary")
  );

  assert.match(sync, /if \(index === skipIndex \|\| document\.activeElement === input\) return;/);
  assert.match(sync, /if \(input\.value !== amount\) input\.value = amount;/);
});

test("participant search filters the DOM instead of re-rendering the dialog", () => {
  const filter = app.slice(
    app.indexOf("function filterParticipantChecks(input)"),
    app.indexOf("function participantCandidateFilter")
  );

  assert.doesNotMatch(filter, /\brender\(\)/, "a re-render would drop keyboard focus mid-typing");
  assert.match(filter, /setSearchResultHidden\(row, !matches\);/);
  assert.match(filter, /style\.setProperty\("display", "none", "important"\);/);
  assert.match(filter, /querySelectorAll\("\[data-participant-name\]"\)/);
  assert.match(filter, /data-participant-search-empty/, "an empty result is announced");
  assert.match(filter, /role="status"/);
});

test("expense steps explain invalid input while final saving stays guarded", () => {
  assert.match(app, /function expenseFlowReady\(step/);
  assert.match(app, /amount: hasPositiveExpenseTotal\(expenseDraft\.total\)/);
  assert.match(app, /function expenseFlowFieldErrorAttributes\(step\)/);
  assert.match(app, /aria-invalid="true" aria-describedby="expense-form-error"/);
  assert.match(
    app,
    /class="primary-button expense-step-next"[\s\S]*?\$\{canEdit \? "" : "disabled"\}/
  );
  assert.match(
    app,
    /\$\{canEdit && expenseFlowReady\("review"\) \? "" : "disabled"\}/
  );
  assert.match(app, /<fieldset class="expense-flow-fields" \$\{!canEdit \? "disabled" : ""\}>/);
  assert.match(app, /if \(!expenseDraft \|\| expenseSaveInProgress\) return;/);
});

test("critical destructive actions use 48px while compact chips keep a 44px floor", () => {
  const start = ledger.indexOf('[data-action="delete-expense"]');
  const block = ledger.slice(start, ledger.indexOf("}", start) + 40);

  assert.match(block, /min-height: 48px !important/);

  const chips = ledger.slice(
    ledger.indexOf("html.ledger-workspace-v1 .expense-template-grid .secondary-button {")
  );
  assert.match(
    chips.slice(0, chips.indexOf("}")),
    /min-height: 44px !important/,
    "compact chips remain smaller than destructive actions without becoming hard to tap"
  );
});

test("expense row edit and delete actions keep comfortable mobile touch targets", () => {
  assert.match(
    ledger,
    /\.expense-actions \[data-action="edit-expense"\] \{\s*\n\s*min-height: 44px !important;/
  );
  assert.match(
    ledger,
    /\.expense-actions \[data-action="delete-expense"\] \{\s*\n\s*min-height: 48px !important;/
  );
});

test("reduced motion is honoured in the active design layer", () => {
  const reduced = ledger.slice(ledger.lastIndexOf("@media (prefers-reduced-motion: reduce)"));

  assert.match(reduced, /animation-duration: 1ms !important;/);
  assert.match(reduced, /transition-duration: 1ms !important;/);
  assert.match(reduced, /scroll-behavior: auto !important;/);
});

test("the chip scroll affordance is a mask and cannot introduce overflow", () => {
  const rule = ledger.slice(
    ledger.indexOf("html.ledger-workspace-v1 .expense-template-grid {")
  );
  const block = rule.slice(0, rule.indexOf("}"));

  assert.match(block, /-webkit-mask-image: linear-gradient\(\s*\n\s*to left,/);
  assert.match(block, /\n\s{4}mask-image: linear-gradient\(\s*\n\s*to left,/);
  assert.doesNotMatch(block, /\n\s*width:/, "the scroller keeps its intrinsic width");
  assert.doesNotMatch(block, /transform:/, "no transform that could shift layout");
});

test("narrow screens collapse the expense actions rather than overflowing", () => {
  assert.match(
    ledger,
    /@media \(max-width: 360px\) \{\s*\n\s*html\.ledger-workspace-v1 \.expense-modal-actions \{\s*\n\s*grid-template-columns: minmax\(0, 1fr\) !important;/
  );
});

test("long names wrap instead of pushing the layout wide", () => {
  assert.match(ledger, /overflow-wrap: anywhere !important/);
  assert.match(ledger, /html\.ledger-workspace-v1 \.event-row-main \{[\s\S]*?min-width: 0 !important;/);
});

test("icon-only controls all carry an accessible name", () => {
  const iconButtons = app.match(/<button[^>]*class="[^"]*icon-button[^"]*"[^>]*>/g) ?? [];
  assert.ok(iconButtons.length > 0, "there are icon buttons to check");
  for (const button of iconButtons) {
    assert.match(button, /aria-label="/, `missing accessible name: ${button.slice(0, 80)}`);
  }
});

test("validation errors are announced, including the profile screen", () => {
  assert.match(app, /<p class="field-error" id="profile-name-error" role="alert">/);
  assert.match(
    app,
    /\$\{profileError \? 'aria-invalid="true" aria-describedby="profile-name-error"' : ""\}/
  );
  assert.match(
    app,
    /document[\s\S]*?querySelector\('\[data-action="profile-name"\]'\)[\s\S]*?focus\(\{ preventScroll: true \}\)/
  );
  assert.match(
    inviteJoinLayer,
    /errorNode\.closest\("form"\)\?\.querySelector\('input\[name="displayName"\]'\)[\s\S]*?focus\(\{ preventScroll: true \}\)/
  );
  assert.match(
    inviteJoinLayer,
    /const displayName = normalizeProfileName\(input\?\.value\);\s*if \(!isFullProfileName\(displayName\)\) return;\s*event\.preventDefault\(\);/
  );
  assert.match(app, /<p class="field-error" id="join-event-error" role="alert">/);
  assert.match(
    app,
    /<p class="error" id="expense-form-error" role="alert" tabindex="-1">/
  );
});

test("status messages use a polite live region", () => {
  assert.match(
    app,
    /class="notice app-toast" role="status" aria-live="polite" aria-atomic="true"/
  );
  assert.match(app, /data-action="dismiss-notice" aria-label="סגירת ההודעה"/);
  assert.match(app, /class="expense-loop-status" role="status" aria-live="polite"/);
});

test("a floating notice stays dismissible while an event route dialog is open", () => {
  const inertSetup = app.slice(
    app.indexOf("function setDialogBackgroundInert"),
    app.indexOf("function clearDialogBackgroundInert")
  );

  assert.match(inertSetup, /const isDismissibleNotice = \(element\) =>/);
  assert.equal(
    inertSetup.match(/if \(isDismissibleNotice\(element\)\) return;/g)?.length,
    2
  );
});

test("focus-visible remains a visible ring in the active layer", () => {
  assert.match(
    ledger,
    /html\.ledger-workspace-v1 button:focus-visible,[\s\S]*?outline: 3px solid rgba\(34, 174, 178, 0\.28\) !important;/
  );
});

test("amounts stay LTR-isolated inside RTL prose", () => {
  assert.match(
    ledger,
    /html\.ledger-workspace-v1 \.font-num,[\s\S]*?font-family: var\(--font-num\) !important;[\s\S]*?font-weight: 900 !important;[\s\S]*?unicode-bidi: isolate;/
  );
  const circle = readFileSync("src/publicCircleDesignLayer.mjs", "utf8");
  assert.match(
    circle,
    /\.invite-link-row input \{[\s\S]*?direction: ltr !important;[\s\S]*?unicode-bidi: plaintext !important;/
  );
});
