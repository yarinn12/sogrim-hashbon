import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("restaurant entry starts with a simple split choice and asks for payment last", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const quickFormStart = app.indexOf("function renderQuickExpenseForm");
  const quickFormEnd = app.indexOf("function renderQuickItemRow", quickFormStart);
  const quickForm = app.slice(quickFormStart, quickFormEnd);
  const itemRow = app.slice(
    app.indexOf("function renderQuickItemRow"),
    app.indexOf("function renderEventExpenseGroups")
  );

  assert.match(app, /data-action="expense-date"/);
  assert.match(quickForm, /data-action="restaurant-split-mode" data-mode="equal"/);
  assert.match(quickForm, /data-action="restaurant-split-mode" data-mode="items"/);
  assert.match(quickForm, /חלוקה שווה/);
  assert.match(quickForm, /לפי מנות/);
  assert.match(quickForm, /data-action="restaurant-quick-stage" data-stage="review"/);
  assert.match(quickForm, /data-action="restaurant-quick-stage" data-stage="payer"/);
  assert.match(quickForm, /data-action="finish-restaurant-calculation"/);
  assert.match(quickForm, /data-action="copy-and-finish-restaurant-calculation"/);
  assert.match(quickForm, /העתק וסיים/);
  assert.match(quickForm, /סגור בלי לשמור/);
  assert.match(quickForm, /המשך לסיכום/);
  assert.match(quickForm, /שמור באירוע/);
  assert.match(quickForm, /לא חובה/);
  assert.match(quickForm, /data-action="copy-quick-split"/);
  assert.match(quickForm, /סה״כ החשבון/);
  assert.match(quickForm, /כמה כל אחד משלם/);
  assert.ok(
    itemRow.indexOf('data-action="quick-item-amount"') <
      itemRow.indexOf('data-action="quick-item-name"'),
    "price must appear before the optional item description"
  );
  assert.match(itemRow, /quick-item-description-details/);
  assert.match(itemRow, /expenseDraft\.quickItems\.length > 1/);
  assert.match(itemRow, /הוסף תיאור \(לא חובה\)/);
  assert.match(app, /ADD_QUICK_ITEM_GUEST_VALUE/);
  assert.match(app, /data-action="quick-item-new-guest-name"/);
  assert.match(app, /data-action="quick-item-add-guest"/);
  assert.match(app, /function addInlineQuickItemGuest\(eventId, itemIndex\)/);
  assert.match(app, /expenseDraft\.quickItems\[itemIndex\]\.sharedBy = guest\.id/);
  assert.match(quickForm, /const ready = summary\.billTotal > 0 && !summary\.error/);
  assert.match(
    quickForm,
    /expenseDraft\.restaurantEqualSplit[\s\S]*?participants\.filter\([\s\S]*?summary\.totals/
  );
  assert.match(
    app,
    /isRestaurantItems[\s\S]*?restaurant-quick-stage"\]\[data-stage="review"/
  );
  assert.match(app, /quickStage:\s*eventTypeConfig\(event\.eventType\)\.id === EVENT_TYPE_RESTAURANT \? "method" : "items"/);
  assert.match(
    app,
    /createQuickItemDraft\([\s\S]*?QUICK_ITEM_CUSTOM_PARTICIPANTS[\s\S]*?participants\.map/
  );
  assert.doesNotMatch(app, /restaurantEqualSplit[\s\S]*?\["amount", "payer", "participants", "review"\]/);
  assert.match(app, /buildQuickItemExpenses/);
  assert.match(app, /groupExpensesByDay/);
  assert.match(
    app,
    /formatCount\(result\.expenses\.length, "פריט נוסף", "פריטים נוספו"\)/
  );
});

test("new event creation focuses on standard and trip while preserving existing restaurants", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const types = await readFile("src/domain/eventTypes.mjs", "utf8");

  assert.match(app, /data-action="new-event-type"/);
  assert.match(app, /const NEW_RESTAURANT_EVENTS_ENABLED = false/);
  assert.match(app, /function eventCreationTypeOptions\(\)/);
  assert.match(
    app,
    /NEW_RESTAURANT_EVENTS_ENABLED \|\| type\.id !== EVENT_TYPE_RESTAURANT/
  );
  assert.match(app, /\$\{eventCreationTypeOptions\(\)/);
  assert.match(app, /eventType: normalizeEventType\(newEventDraft\.eventType\)/);
  assert.match(app, /defaultExpenseModeForEvent\(event\.eventType\)/);
  assert.match(
    app,
    /rememberedDraft\?\.mode === "items"[\s\S]*?EVENT_TYPE_RESTAURANT[\s\S]*?clearRememberedExpenseDraft\(event\.id\)/
  );
  assert.match(
    app,
    /function renderExpenseModeSwitch\(event\)[\s\S]*?eventTypeConfig\(event\?\.eventType\)\.id !== EVENT_TYPE_RESTAURANT/
  );
  assert.match(app, /function renderRestaurantQuickExpenseForm/);
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
  assert.match(finalDesign, /Restaurant v2: one decision per step/);
  assert.match(finalDesign, /\.restaurant-method-option/);
  assert.match(finalDesign, /\.restaurant-review-actions/);
  assert.match(
    finalDesign,
    /\.restaurant-review-count \{[\s\S]*?margin-inline: 20px !important/
  );
  assert.match(app, /const isTripEvent = eventTypeConfig\(event\.eventType\)\.id === EVENT_TYPE_TRIP/);
  assert.match(app, /isTripEvent \? renderExpenseDateField\("expense-date-prominent"\) : ""/);
  assert.match(app, /function renderExpenseDateField\(extraClass = "", label = "תאריך ההוצאה"\)/);
  assert.match(sw, /quickExpenses\.mjs/);
  assert.match(sw, /eventTypes\.mjs/);
});
