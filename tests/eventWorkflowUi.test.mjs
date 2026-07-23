import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("app bootstraps only after render-time constants are initialized", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const iconMapIndex = app.indexOf("const commandIconSvgs");
  const bootstrapCallIndex = app.lastIndexOf("bootstrapApp();");

  assert.ok(iconMapIndex >= 0);
  assert.ok(bootstrapCallIndex > iconMapIndex);
  assert.match(app, /function bootstrapApp\(\) \{\s*render\(\);/);
});

test("event creation stays on the home screen instead of the active event", async () => {
  const [app, actions] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/domain/appActions.mjs", "utf8")
  ]);

  assert.match(actions, /export function duplicateEvent/);
  assert.doesNotMatch(app, /data-action="duplicate-event"/);
  assert.doesNotMatch(app, /duplicateCurrentEvent/);
});

test("settlement screen exposes full event report copy", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /formatEventReport/);
  assert.match(app, /data-action="copy-event-report"/);
  assert.match(app, /copyEventReport\(target\.dataset\.eventId\)/);
});

test("home screen stays focused on event actions and the event list", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const home = sourceBetween(
    app,
    "function renderHome()",
    "function renderHomeEventTools"
  );

  assert.match(home, /events\.map\(renderEventRow\)/);
  assert.match(home, /renderHomeEventTools/);
  assert.doesNotMatch(home, /renderPersonalDashboard|renderRecentEventShortcut|renderPersonalActionList|renderBackupPanel/);
  assert.doesNotMatch(home, /renderEventSearchPanel/);
  assert.doesNotMatch(home, /event-search/);
});

test("visible event counts use correct Hebrew singular and plural labels", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /function formatCount\(count, singular, plural\)/);
  assert.match(app, /formatCount\(visibleEventCount, "אירוע מוצג", "אירועים מוצגים"\)/);
  assert.match(app, /צפויה אליך העברה מאת/);
  assert.doesNotMatch(app, /אמור להעביר אליך/);
  assert.match(app, /aria-label="משלם \$\{index \+ 1\}"/);
  assert.match(app, /id="expense-form-error" role="alert"/);
  assert.match(app, /id="join-event-error" role="alert"/);
  assert.match(app, /type="url"/);
});

test("expense entry opens in a focused dialog and returns to the event after saving", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(app, /expense-modal-backdrop/);
  assert.match(app, /role="dialog"/);
  assert.match(app, /aria-modal="true"/);
  assert.match(app, /expenseDraft = null;\s+closeDialogWithHistory\(\);/);
  assert.match(styles, /\.expense-modal-backdrop/);
  assert.match(styles, /\.expense-modal/);
});

test("expense saving ignores duplicate or stale save actions", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const saveExpense = sourceBetween(
    app,
    "function saveExpense(eventId",
    "function continueExpenseEntry(event)"
  );

  assert.match(app, /let expenseSaveInProgress = false/);
  assert.match(saveExpense, /if \(!expenseDraft \|\| expenseSaveInProgress\) return/);
  assert.match(saveExpense, /expenseSaveInProgress = true/);
  assert.match(saveExpense, /finally \{\s*expenseSaveInProgress = false/);
});

test("regular and restaurant expense dialogs use one dedicated close action", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const regularExpense = sourceBetween(
    app,
    "function renderExpenseForm(event)",
    "function renderExpenseModeSwitch()"
  );
  const quickExpense = sourceBetween(
    app,
    "function renderQuickExpenseForm(event, participants, canEdit)",
    "function renderQuickItemRow"
  );

  assert.match(regularExpense, /modal-close-button/);
  assert.match(quickExpense, /modal-close-button/);
  assert.match(regularExpense, /aria-label="סגירת חלון ההוצאה"/);
  assert.match(quickExpense, /aria-label="סגירת חלון ההוצאה"/);
  assert.doesNotMatch(quickExpense, /modal-back-button-label/);
});

test("expense payer amounts auto-fill the remaining total while staying editable", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /balancePayerAmounts/);
  assert.match(app, /markPayerAmountEdited/);
  assert.match(app, /syncExpensePayerAmountInputs/);
  assert.match(app, /addPayerToExpenseDraft/);
});

test("expense dialog shows whether payer amounts match the total", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");
  const expenseForm = sourceBetween(app, "function renderExpenseForm(event)", "function renderExpenseRow(event, expense)");

  assert.match(app, /summarizePayerDraft/);
  assert.match(app, /function renderExpensePayerSummary\(\)/);
  assert.match(app, /function syncExpensePayerSummary\(\)/);
  assert.match(app, /syncExpensePayerAmountInputs\(\);\s+syncExpensePayerSummary\(\);/);
  assert.match(expenseForm, /renderExpensePayerSummary\(\)/);
  assert.match(styles, /\.expense-payer-summary/);
});

test("expense dialog exposes quick templates without prefilled sample amounts", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(app, /const EXPENSE_TEMPLATES/);
  assert.match(app, /data-action="expense-template"/);
  assert.match(app, /applyExpenseTemplate\(target\.dataset\.template\)/);
  assert.match(styles, /\.expense-template-grid/);
});

test("expense dialog can add a missing guest without leaving the expense", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const expenseForm = app.match(/function renderExpenseForm\(event\) \{[\s\S]*?\nfunction renderExpenseRow/);

  assert.ok(expenseForm);
  assert.match(expenseForm[0], /expense-guest-box/);
  assert.match(expenseForm[0], /data-action="event-guest-name"/);
  assert.match(expenseForm[0], /data-action="event-add-guest"/);
  assert.match(app, /expenseDraft\?\.eventId === event\.id/);
  assert.match(app, /expenseDraft\.sharedByParticipantIds\.push\(guest\.id\)/);
});

test("ordinary expense entry keeps the fast path visible and progressively reveals advanced details", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const expenseForm = sourceBetween(app, "function renderExpenseForm(event)", "function renderExpenseModeSwitch()");

  assert.match(expenseForm, /expense-total-field/);
  assert.match(expenseForm, /data-action="expense-name"/);
  assert.match(expenseForm, /<details class="expense-details-panel"/);
  assert.match(expenseForm, /<summary>/);
  assert.match(expenseForm, /חלוקה, משלמים ותאריך/);
  assert.match(expenseForm, /data-action="expense-date"/);
  assert.match(expenseForm, /renderExpensePayerSummary\(\)/);
  assert.match(expenseForm, /renderParticipantChecks\(expenseDraft\.sharedByParticipantIds, "expense-shared", event\)/);
  assert.match(expenseForm, /expense-guest-box/);
  assert.match(expenseForm, /function shouldOpenExpenseDetails/);
  assert.match(expenseForm, /expenseDraft\.error/);
  assert.match(expenseForm, /EVENT_TYPE_TRIP/);
  assert.match(app, /function syncExpenseDetailsSummary/);
  assert.match(app, /aria-live="polite"/);
});

test("ordinary expense entry asks for the amount before optional shortcuts", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const expenseForm = sourceBetween(app, "function renderExpenseForm(event)", "function renderExpenseModeSwitch()");

  const totalIndex = expenseForm.indexOf('data-action="expense-total"');
  const nameIndex = expenseForm.indexOf('data-action="expense-name"');
  const templatesIndex = expenseForm.indexOf('class="expense-template-grid"');
  const modeIndex = expenseForm.indexOf("renderExpenseModeSwitch()");

  assert.ok(totalIndex >= 0);
  assert.ok(totalIndex < nameIndex);
  assert.ok(nameIndex < templatesIndex);
  assert.ok(templatesIndex < modeIndex);
  assert.match(expenseForm, /name="expenseTotal" autocomplete="off"/);
});

test("participant manager offers saved people while expenses stay scoped to the event", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(
    app,
    /function renderParticipantChecks\(selectedIds, action, event = null\) \{[\s\S]*?event && action === "event-participant"[\s\S]*?\[\.\.\.state\.participants\]\.sort/
  );
  assert.match(
    app,
    /Number\(selectedIds\.includes\(right\.id\)\) - Number\(selectedIds\.includes\(left\.id\)\)/
  );
  assert.match(app, /: event\s*\?\s*eventParticipants\(event\)\s*:\s*state\.participants;/);
});

test("expense payer selector can add a missing payer inline", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");
  const expenseForm = app.match(/function renderExpenseForm\(event\) \{[\s\S]*?\nfunction renderExpenseRow/);

  assert.ok(expenseForm);
  assert.match(app, /ADD_PAYER_PARTICIPANT_VALUE/);
  assert.match(expenseForm[0], /data-action="expense-new-payer-name"/);
  assert.match(expenseForm[0], /data-action="expense-add-payer-guest"/);
  assert.match(app, /addInlinePayerGuest\(target\.dataset\.eventId, Number\(target\.dataset\.index\)\)/);
  assert.match(app, /expenseDraft\.payers\[payerIndex\]\.participantId = guest\.id/);
  assert.match(app, /expenseDraft\.sharedByParticipantIds\.push\(guest\.id\)/);
  assert.match(styles, /\.payer-inline-add/);
});

test("event screen moves secondary management into focused windows", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(app, /eventDialog/);
  assert.match(app, /renderEventDialog/);
  assert.match(app, /data-action="open-event-participants"/);
  assert.match(app, /data-action="open-event-share"/);
  assert.match(app, /data-action="open-event-settings"/);
  assert.match(app, /data-action="close-event-dialog"/);
  assert.match(app, /class="icon-button modal-back-button modal-close-button"/);
  assert.match(app, /data-action="close-event-dialog">סיום/);
  assert.match(app, /event-modal-backdrop/);
  assert.match(styles, /\.event-command-grid/);
  assert.match(styles, /\.event-modal-backdrop/);
});

test("event screen has clear workspace navigation without a repeated insight dashboard", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");
  const eventScreen = sourceBetween(app, "function renderEvent(event)", "function renderEventStartPanel");

  assert.match(app, /buildEventInsights/);
  assert.match(eventScreen, /renderEventWorkspaceNav\(event\)/);
  assert.match(eventScreen, /renderEventPersonalBalance\(event, participants\)/);
  assert.match(eventScreen, /renderEventActionDock\(event, total, canEdit\)/);
  assert.doesNotMatch(eventScreen, /renderEventInsightPanel|summary-item summary-personal|renderEventTypeGuide/);
  assert.match(app, /function renderEventWorkspaceNav/);
  assert.match(app, /event-workspace-nav/);
  assert.match(styles, /\.event-workspace-nav/);
});

test("event screen surfaces the current participant balance without recalculating money", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const balance = sourceBetween(
    app,
    "function renderEventPersonalBalance(event, participants)",
    "function renderEventStartPanel"
  );

  assert.match(balance, /eventSettlementTransfers\(event, participants\)/);
  assert.match(balance, /pendingBalanceForParticipant/);
  assert.match(balance, /data-action="settle"/);
  assert.match(balance, /המצב שלך/);
  assert.match(balance, /אין לך העברה פתוחה/);
});

test("ordinary expense entry shows a live exact split summary before saving", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const expenseForm = sourceBetween(
    app,
    "function renderExpenseForm(event)",
    "function renderExpenseModeSwitch"
  );

  assert.match(expenseForm, /renderExpenseConfirmationSummary\(event, participants\)/);
  assert.match(app, /function renderExpenseConfirmationSummary\(event, participants\)/);
  assert.match(app, /const remainder = total % participantCount/);
  assert.match(app, /data-expense-confirmation-summary/);
  assert.match(app, /function syncExpenseConfirmationSummary\(\)/);
  assert.match(
    app,
    /if \(action === "expense-total"\)[\s\S]*?syncExpenseConfirmationSummary\(\)/
  );
  assert.match(
    app,
    /if \(action === "expense-shared"\)[\s\S]*?syncExpenseConfirmationSummary\(\)/
  );
});

test("event screen never offers creating another event inside the active event", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const eventScreen = sourceBetween(app, "function renderEvent(event)", "function renderEventStartPanel");
  const settingsDialog = sourceBetween(app, "function renderEventSettingsDialog(event)", "function renderInviteStatus");

  assert.doesNotMatch(eventScreen, /data-action="duplicate-event"/);
  assert.doesNotMatch(settingsDialog, /data-action="duplicate-event"/);
  assert.doesNotMatch(settingsDialog, /data-action="new-event"/);
});

test("event settings expose leaving and admin deletion actions", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");
  const settingsDialog = sourceBetween(app, "function renderEventSettingsDialog(event)", "function renderInviteStatus");

  assert.match(settingsDialog, /data-action="leave-event"/);
  assert.match(settingsDialog, /data-action="delete-event"/);
  assert.match(settingsDialog, /danger-button/);
  assert.match(app, /requestEventLeave\(target\.dataset\.eventId, target\)/);
  assert.match(app, /requestEventDeletion\(target\.dataset\.eventId, target\)/);
  assert.match(app, /role="alertdialog"/);
  assert.doesNotMatch(app, /window\.confirm/);
  assert.match(styles, /\.event-danger-zone/);
});

test("event settings use a focused hub instead of one overloaded dialog", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const ledgerStyles = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");
  const hub = sourceBetween(
    app,
    "function renderEventSettingsDialog(event)",
    "function renderEventSettingsManagementDialog(event)"
  );

  for (const section of ["management", "currency", "lock", "danger"]) {
    assert.match(hub, new RegExp(`section: "${section}"`));
  }
  assert.match(hub, /renderEventSettingsMenuItem/);
  assert.match(app, /data-action="open-event-settings-section"/);
  assert.doesNotMatch(hub, /data-action="event-currency"/);
  assert.doesNotMatch(hub, /data-action="toggle-lock"/);
  assert.doesNotMatch(hub, /data-action="leave-event"/);
  assert.doesNotMatch(hub, /data-action="delete-event"/);
  assert.match(app, /eventDialog\.kind === "settings-management"/);
  assert.match(app, /eventDialog\.kind === "settings-currency"/);
  assert.match(app, /eventDialog\.kind === "settings-lock"/);
  assert.match(app, /eventDialog\.kind === "settings-danger"/);
  assert.match(app, /backAction: "event-settings-back"/);
  assert.match(app, /action === "event-settings-back"/);
  assert.match(ledgerStyles, /\.event-settings-menu-item/);
});

test("event screen uses one focused start action instead of a repeated command grid", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const startPanel = sourceBetween(app, "function renderEventStartPanel(event)", "function renderEventTypeGuide");

  assert.match(app, /function renderCommandIcon/);
  assert.match(startPanel, /renderCommandIcon\("expense"\)/);
  assert.match(startPanel, /class="primary-button event-start-primary" data-action="show-expense-form"/);
  assert.doesNotMatch(startPanel, /renderCommandIcon\("share"\)|shouldInviteFirst|open-event-share|secondaryButton/);
  assert.doesNotMatch(app, /function renderEventCommandGrid/);
});

test("home event rows keep only selection details and a small personal attention marker", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const row = sourceBetween(app, "function renderEventRow(event)", "function ensureNewEventDraft");
  const home = sourceBetween(app, "function renderHome()", "function renderHomeEventTools");

  assert.match(row, /pendingPersonalTransfers/);
  assert.match(row, /עליך להעביר \$\{formatEventMoney\(event, amountToPay\)\}/);
  assert.match(row, /מגיע לך \$\{formatEventMoney\(event, amountToReceive\)\}/);
  assert.match(row, /event-row-attention/);
  assert.doesNotMatch(row, /renderAvatarStack|event-row-balance|event-type-chip/);
  assert.match(home, /showEventStatusFilter = statusCounts\.open > 0 && statusCounts\.closed > 0/);
  assert.match(home, /showEventStatusFilter \? renderEventStatusFilter\(sortedEvents\) : ""/);
});

test("home screen separates open and closed event history", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(app, /EVENT_STATUS_FILTERS/);
  assert.match(app, /filterEventsByStatus/);
  assert.match(app, /data-action="event-status-filter"/);
  assert.match(app, /class="segmented-control" role="group" aria-label="סינון אירועים"/);
  assert.match(app, /aria-pressed="\$\{eventStatusFilter === filter\.id\}"/);
  assert.match(styles, /\.segmented-control/);
});

test("home stays list focused while expense entry prioritizes the amount", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const home = sourceBetween(app, "function renderHome()", "function renderHomeEventTools");
  const expenseForm = sourceBetween(app, "function renderExpenseForm(event)", "function renderExpenseModeSwitch");

  assert.doesNotMatch(home, /renderPersonalDashboard|renderPersonalActionList|renderRecentEventShortcut/);
  assert.ok(expenseForm.indexOf('data-action="expense-total"') < expenseForm.indexOf('data-action="expense-name"'));
  assert.match(expenseForm, /class="field expense-total-field"/);
  assert.match(expenseForm, /dir="ltr"/);
});

test("home dashboard only renders for actionable balances or pending transfers", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const dashboard = sourceBetween(
    app,
    "function renderPersonalDashboard(events)",
    "function renderPersonalActionList(events)"
  );

  assert.match(dashboard, /\.filter\(\s*\(item\) => item\.toPay \|\| item\.toReceive\s*\)/);
  assert.match(
    dashboard,
    /if \(!events\.length \|\| \(!currencyTotals\.length && !totals\.pendingTransfers\)\) \{\s*return "";\s*\}/
  );
  assert.doesNotMatch(dashboard, /!totals\.openEvents/);
  assert.match(dashboard, /groupPendingTransfers/);
  assert.match(dashboard, /transfer\.fromParticipantId === currentParticipantId/);
  assert.match(dashboard, /transfer\.toParticipantId === currentParticipantId/);
  assert.match(dashboard, /אליך · \$\{totals\.groupPendingTransfers\} בקבוצה/);
});

test("home screen avoids repeated event creation actions and offers joining", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const home = sourceBetween(app, "function renderHome()", "function renderEventStatusFilter");

  assert.equal([...home.matchAll(/data-action="new-event"/g)].length, 1);
  assert.match(home, /data-action="join-event-screen"/);
  assert.doesNotMatch(home, /פתח אירוע חדש/);
});

test("event creation and joining open as separate focused screens", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");
  const newEvent = sourceBetween(app, "function renderNewEvent()", "function renderJoinEvent()");
  const joinEvent = sourceBetween(app, "function renderJoinEvent()", "function renderEvent(event)");

  assert.match(app, /if \(screen\.name === "join-event"\)/);
  assert.match(app, /screen = \{ name: "join-event" \}/);
  assert.match(newEvent, /create-event-panel/);
  assert.doesNotMatch(newEvent, /join-event-panel/);
  assert.match(joinEvent, /join-event-panel/);
  assert.match(joinEvent, /data-action="join-event-link"/);
  assert.match(joinEvent, /data-action="join-existing-event"/);
  assert.match(joinEvent, /data-action="cancel-join-event"/);
  assert.equal([...joinEvent.matchAll(/data-action="join-existing-event"/g)].length, 1);
  assert.doesNotMatch(joinEvent, /data-action="home"/);
  assert.doesNotMatch(joinEvent, /data-action="new-event"/);
  assert.doesNotMatch(joinEvent, /create-event-panel/);
  assert.match(app, /joinExistingEventFromDraft/);
  assert.match(app, /parseInviteEventId\(joinEventDraft\.link/);
  assert.match(
    app,
    /if \(action === "cancel-join-event"\) \{\s*notice = "";\s*screen = \{ name: "home" \};\s*render\(\);\s*return;/
  );
  assert.match(styles, /\.join-event-panel/);
  assert.match(styles, /\.create-event-panel/);
});

test("manual event joining refreshes the account token before reading the invite", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const joinFlow = sourceBetween(
    app,
    "async function joinExistingEventFromDraft()",
    "function ensureJoinEventDraft()"
  );

  assert.match(joinFlow, /const joinRuntimeConfig = await loadRuntimeConfig\(\)/);
  assert.match(joinFlow, /runtimeConfig = joinRuntimeConfig/);
  assert.match(joinFlow, /readSharedEventState\(\s*joinRuntimeConfig,/);
});

test("new event name starts empty with helpful grey examples", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const newEvent = sourceBetween(app, "function renderNewEvent()", "function renderEvent(event)");

  assert.match(app, /const EVENT_NAME_PLACEHOLDER = "אוכל \/ מונית \/ קניות…"/);
  assert.match(app, /function ensureNewEventDraft\(\)[\s\S]*?name: ""/);
  assert.match(newEvent, /eventTypeConfig\(newEventDraft\.eventType\)\.namePlaceholder/);
  assert.doesNotMatch(newEvent, /name: "יציאה חדשה"/);
});

test("settlement screen can close an event and share it to WhatsApp", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(app, /settlement-hero/);
  assert.match(app, /data-action="close-event"/);
  assert.match(app, /requestCloseCurrentEvent\(target\.dataset\.eventId\)/);
  assert.match(app, /data-action="confirm-close-event"/);
  assert.match(app, /data-action="reopen-event"/);
  assert.match(app, /data-action="share-whatsapp"/);
  assert.match(app, /settlement-screen" data-screen-kind="settlement" data-event-id=/);
  assert.match(app, /https:\/\/wa\.me\/\?text=/);
  assert.match(styles, /\.whatsapp-button/);
  assert.match(styles, /\.settlement-hero/);
});

test("groups screen exposes duplicate participant merge", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(app, /mergeParticipants/);
  assert.match(app, /renderMergeParticipantsPanel/);
  assert.match(app, /data-action="merge-source"/);
  assert.match(app, /data-action="merge-target"/);
  assert.match(app, /data-action="merge-participants"/);
  assert.match(styles, /\.merge-participants-grid/);
});
