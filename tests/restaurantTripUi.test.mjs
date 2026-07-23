import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("expense dialog supports trip dates and restaurant item entry", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const quickFormStart = app.indexOf("function renderQuickExpenseForm");
  const quickFormEnd = app.indexOf("function renderQuickItemRow", quickFormStart);
  const quickForm = app.slice(quickFormStart, quickFormEnd);

  assert.match(app, /data-action="expense-date"/);
  assert.match(app, /חשבון לפי מנות/);
  assert.match(app, /רק לחשב לכל אחד/);
  assert.match(app, /מישהו כבר שילם/);
  assert.match(app, /data-action="quick-item-name"/);
  assert.match(app, /data-action="quick-item-amount"/);
  assert.match(app, /data-action="copy-quick-split"/);
  assert.match(app, /ADD_QUICK_ITEM_GUEST_VALUE/);
  assert.match(app, /data-action="quick-item-new-guest-name"/);
  assert.match(app, /data-action="quick-item-add-guest"/);
  assert.match(app, /function addInlineQuickItemGuest\(eventId, itemIndex\)/);
  assert.match(app, /expenseDraft\.quickItems\[itemIndex\]\.sharedBy = guest\.id/);
  assert.match(app, /const quickActionReady = quickSummary\.billTotal > 0 && !quickSummary\.error/);
  assert.match(
    quickForm,
    /data-action="copy-quick-split"[\s\S]*?\$\{!quickActionReady \? "disabled" : ""\}/
  );
  assert.match(app, /buildQuickItemExpenses/);
  assert.match(app, /groupExpensesByDay/);
  assert.match(quickForm, /const showQuickExpenseMeta = !isRestaurantEvent \|\| isPaidExpense;/);
  assert.match(
    quickForm,
    /showQuickExpenseMeta[\s\S]*?<div class="quick-expense-meta">[\s\S]*?isPaidExpense[\s\S]*?data-action="quick-expense-payer"[\s\S]*?data-action="expense-date"/
  );
});

test("event creation exposes clear standard, restaurant and trip modes", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const types = await readFile("src/domain/eventTypes.mjs", "utf8");

  assert.match(app, /data-action="new-event-type"/);
  assert.match(app, /eventType: normalizeEventType\(newEventDraft\.eventType\)/);
  assert.match(app, /defaultExpenseModeForEvent\(event\.eventType\)/);
  assert.match(app, /function renderEventStartPanel\(event\)/);
  assert.match(app, /event-start-primary/);
  assert.doesNotMatch(app, /const shouldInviteFirst = participantCount < 2/);
  assert.match(app, /class="primary-button event-start-primary" data-action="show-expense-form"/);
  assert.match(app, /eventTypeConfig\(newEventDraft\.eventType\)\.createLabel/);
  assert.match(app, /showDayHeadings = eventTypeConfig\(event\.eventType\)\.id === EVENT_TYPE_TRIP/);
  assert.match(types, /label: "יציאה רגילה"/);
  assert.match(types, /label: "מסעדה"/);
  assert.match(types, /label: "טיול או חופשה"/);
});

test("restaurant and trip UI receives responsive production styling", async () => {
  const design = await readFile("src/publicDesignV2Layer.mjs", "utf8");
  const finalDesign = await readFile("src/publicCircleDesignLayer.mjs", "utf8");
  const app = await readFile("src/app.mjs", "utf8");
  const sw = await readFile("sw.js", "utf8");

  assert.match(design, /\.quick-item-row/);
  assert.match(design, /\.quick-split-summary/);
  assert.match(design, /\.expense-day-heading/);
  assert.match(design, /\.event-type-options/);
  assert.match(design, /\.event-type-guide/);
  assert.match(design, /\.event-start-panel/);
  assert.match(finalDesign, /Social Ledger v3: focused secondary flows/);
  assert.match(finalDesign, /\.expense-date-prominent/);
  assert.match(
    finalDesign,
    /\.quick-expense-modal \.quick-item-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 96px !important/
  );
  assert.match(
    finalDesign,
    /\.expense-modal \.expense-modal-actions \{[\s\S]*?position: sticky !important/
  );
  assert.match(finalDesign, /Deep Ledger v7: faster restaurant entry/);
  assert.match(finalDesign, /\.quick-item-row:focus-within/);
  assert.match(finalDesign, /\.quick-item-inline-guest/);
  assert.match(finalDesign, /\.quick-expense-guest-details/);
  assert.match(app, /const isTripEvent = eventTypeConfig\(event\.eventType\)\.id === EVENT_TYPE_TRIP/);
  assert.match(app, /isTripEvent \? renderExpenseDateField\("expense-date-prominent"\) : ""/);
  assert.match(app, /function renderExpenseDateField\(extraClass = ""\)/);
  assert.match(sw, /quickExpenses\.mjs/);
  assert.match(sw, /eventTypes\.mjs/);
});
