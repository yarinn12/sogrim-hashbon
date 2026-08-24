import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function sourceBetween(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test("active events use one persistent expense action instead of a repeated header button", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const eventScreen = sourceBetween(
    app,
    "function renderEvent(event)",
    "function renderEventActionDock"
  );
  const actionDock = sourceBetween(
    app,
    "function renderEventActionDock",
    "function renderEventStartPanel"
  );
  const insightAction = sourceBetween(
    app,
    "function eventInsightPrimaryAction",
    "const commandIconSvgs"
  );

  assert.match(eventScreen, /event-has-action-dock/);
  assert.match(eventScreen, /renderEventActionDock\(event, total, canEdit\)/);
  assert.doesNotMatch(eventScreen, /class="primary-button" data-action="show-expense-form"/);
  assert.match(actionDock, /class="event-action-dock"/);
  assert.match(actionDock, /data-inline-sync-status/);
  assert.match(actionDock, /data-inline-sync-retry/);
  assert.match(actionDock, /data-action="show-expense-form"/);
  assert.match(actionDock, /סה"כ באירוע/);
  assert.doesNotMatch(insightAction, /data-action="settle"/);
});

test("standard expense entry can save and immediately continue with the same split", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const form = sourceBetween(
    app,
    "function renderExpenseForm(event)",
    "function shouldOpenExpenseDetails"
  );

  assert.match(form, /data-action="save-expense-and-continue"/);
  assert.match(form, /שמור והוסף עוד/);
  assert.match(form, /class="expense-loop-status"/);
  assert.match(form, /class="expense-sync-status"/);
  assert.match(app, /saveExpense\(target\.dataset\.eventId, \{ continueAdding: true \}\)/);
  assert.match(app, /function continueExpenseEntry\(event\)/);
  assert.match(app, /sharedByParticipantIds: previousDraft\.sharedByParticipantIds\.filter/);
  assert.match(
    app,
    /function continueExpenseEntry\(event\)[\s\S]*?replaceBrowserHistoryState\(\);\s*activateExpenseEntryDialog\(\);/
  );
  assert.match(app, /amount: '\[data-action="expense-total"\]'/);
});

test("expense rows reveal every shared participant from the uncluttered row", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const design = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");
  const expenseRow = sourceBetween(
    app,
    "function renderExpenseRow(event, expense)",
    "function renderSettlement(event)"
  );

  assert.match(expenseRow, /class="expense-participants-details"/);
  assert.match(expenseRow, /data-action="toggle-expense-participants"/);
  assert.match(expenseRow, /aria-expanded="false"/);
  assert.match(app, /openExpenseParticipantIds:[\s\S]*?expense-participants-details\[open\]/);
  assert.match(app, /for \(const expenseId of snapshot\.openExpenseParticipantIds \?\? \[\]\)/);
  assert.match(app, /hydrateExpenseParticipants\(details, event, expense\);[\s\S]*?details\.open = true;/);
  assert.match(expenseRow, /aria-controls="expense-participants-/);
  assert.match(expenseRow, /הצג את כל השותפים/);
  assert.match(expenseRow, /sharedParticipantIds[\s\S]*?renderExpenseParticipant/);
  assert.match(expenseRow, /role="list"/);
  assert.match(expenseRow, /role="listitem"/);
  assert.match(expenseRow, /renderAvatar\(participantId, event\)/);
  assert.match(expenseRow, /renderParticipantConnectionBadge\(participant\)/);
  assert.match(design, /\.expense-participants-details > summary/);
  assert.match(
    design,
    /\.expense-participants-details:not\(\[open\]\),[\s\S]*?\.expense-participants-details > summary \{[\s\S]*?display: none !important/
  );
  assert.match(design, /\.expense-participants-list/);
  assert.match(design, /\.expense-participant-item/);
});

test("settlement shows every transfer in one list and highlights personal ones", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const settlement = sourceBetween(
    app,
    "function renderSettlement(event)",
    "function hasReliableSettlementIdentity"
  );
  const transferRow = sourceBetween(
    app,
    "function renderTransferRow(",
    "function transferPaidStatusText"
  );

  assert.match(settlement, /orderSettlementTransfers\(transfers\)/);
  assert.match(settlement, /groupSettlementTransfersForDisplay\(orderedTransfers\)/);
  assert.match(settlement, /hasReliableSettlementIdentity/);
  assert.match(settlement, /מי מעביר למי/);
  assert.doesNotMatch(settlement, /ההעברות שלך מופיעות ראשונות/);
  assert.doesNotMatch(settlement, /class="settlement-progress-chip"/);
  assert.match(settlement, /renderSettlementListActions\(event\)/);
  assert.match(settlement, /renderTransferRow\(event, transfer, \{/);
  assert.match(settlement, /paidHistory/);
  assert.doesNotMatch(settlement, /renderPersonalSettlement/);
  assert.doesNotMatch(app, /function renderSettlementPersonalOnlyState/);
  assert.match(app, /personalReceipts\.length === 1 \? "צריך" : "צריכים"/);
  assert.match(transferRow, /class="personal-transfer-badge">\$\{personalBadgeLabel\}/);
  assert.match(transferRow, /is-personal-payer/);
  assert.match(transferRow, /is-personal-receiver/);
  assert.match(transferRow, /is-personal/);
  assert.match(transferRow, /class="transfer-party-label">מי מעביר/);
  assert.match(transferRow, /class="transfer-party-label">מי מקבל/);
  assert.match(transferRow, /class="transfer-amount"/);
  assert.match(transferRow, /"שילמתי"/);
  assert.match(transferRow, /"קיבלתי"/);
  assert.match(transferRow, /"ממך"/);
  assert.match(transferRow, /"אליך"/);
  assert.match(transferRow, /transfer-complete-button/);
  assert.match(transferRow, /function renderTransferPaidHistory/);
  assert.match(transferRow, /כבר שולם/);
  assert.match(app, /function hasReliableSettlementIdentity/);
});

test("trip ledger day separators show both daily count and subtotal", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const design = await readFile("src/publicCircleDesignLayer.mjs", "utf8");
  const groups = sourceBetween(
    app,
    "function renderEventExpenseGroups(event)",
    "function renderExpensePayerSummary"
  );

  assert.match(groups, /const groupTotal = group\.expenses\.reduce/);
  assert.match(groups, /class="expense-day-summary"/);
  assert.match(groups, /formatEventMoney\(event, groupTotal\)/);
  assert.match(design, /\.expense-day-heading \{[\s\S]*?position: sticky !important/);
  assert.match(design, /\.expense-day-summary \{/);
});

test("the final design layer gives touch controls and the event dock tactile mobile states", async () => {
  const design = await readFile("src/publicCircleDesignLayer.mjs", "utf8");

  assert.match(design, /button:not\(:disabled\):active/);
  assert.match(design, /transform: scale\(0\.96\) !important/);
  assert.match(design, /\.event-action-dock \{/);
  assert.match(design, /min-height: calc\(76px \+ env\(safe-area-inset-bottom\)\) !important/);
  assert.match(design, /\.event-has-action-dock \.summary-item:nth-child\(2\)/);
  assert.match(design, /\.event-settings-button \{/);
  assert.match(design, /\.product-route-controls \.app-back-button-label/);
});

test("event settings stays visibly labeled and secondary at every viewport", async () => {
  const design = await readFile("src/publicCircleDesignLayer.mjs", "utf8");

  assert.match(
    design,
    /\.screen\[data-screen-kind="event"\] > \.top \.event-header-actions \{[^}]*width: auto !important;[^}]*display: inline-flex !important;[^}]*padding: 0 !important;[^}]*background: transparent !important;/
  );
  assert.match(
    design,
    /\.event-settings-button \{[^}]*width: auto !important;[^}]*min-width: 0 !important;[^}]*min-height: 44px !important;[^}]*display: inline-flex !important;[^}]*gap: 8px !important;[^}]*padding-inline: 14px !important;/
  );
  assert.match(
    design,
    /\.event-settings-button \.event-settings-label \{[^}]*position: static !important;[^}]*display: inline !important;[^}]*white-space: nowrap !important;/
  );
  assert.doesNotMatch(design, /\.event-settings-label \{[^}]*display: none !important;/);
});
