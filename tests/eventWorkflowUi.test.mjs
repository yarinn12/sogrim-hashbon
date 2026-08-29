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

test("settlement transfer explanations remain keyboard accessible", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const transferRow = sourceBetween(
    app,
    "function renderTransferRow(",
    "function renderDirectFeaturedSettlementBreakdown("
  );
  const keyboard = sourceBetween(
    app,
    "function handleDialogKeydown(event)",
    "function handleFriendsHubTabKeyboardNavigation(event)"
  );

  assert.match(transferRow, /tabindex="0"/);
  assert.match(transferRow, /aria-expanded=/);
  assert.match(transferRow, /aria-controls=/);
  assert.match(app, /function setTransferExplanationOpen\(transferRow, open\)/);
  assert.match(keyboard, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(keyboard, /setTransferExplanationOpen\(transferRow, !explanation\.open\)/);
});

test("open expense menus track every viewport scroll source", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(
    app,
    /document\.addEventListener\("scroll", scheduleOpenExpenseMenuPosition, true\)/
  );
  assert.match(
    app,
    /window\.addEventListener\("orientationchange", scheduleOpenExpenseMenuPosition\)/
  );
  assert.match(
    app,
    /window\.visualViewport\?\.addEventListener\("scroll", scheduleOpenExpenseMenuPosition\)/
  );
});

test("connected participants expose private reporting and reversible blocking without touching money", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const profile = sourceBetween(
    app,
    "function renderConnectedEventParticipantProfile(event, participant)",
    "function renderRelationshipFriendshipControl("
  );
  const safety = sourceBetween(
    app,
    "function renderParticipantSafetyPanel(event, participant)",
    "function renderEventParticipantReportDialog(event)"
  );
  const report = sourceBetween(
    app,
    "function renderEventParticipantReportDialog(event)",
    "function renderRelationshipFriendshipControl("
  );

  assert.match(profile, /renderParticipantSafetyPanel\(event, participant\)/);
  assert.match(safety, /בטיחות ופרטיות/);
  assert.match(safety, /data-action="open-participant-report"/);
  assert.match(safety, /data-action="block-connected-user"/);
  assert.match(safety, /data-action="unblock-connected-user"/);
  assert.match(safety, /לא משנה חישובים קיימים/);
  assert.match(report, /הדיווח פרטי/);
  assert.match(report, /data-action="participant-report-category"/);
  assert.match(report, /data-action="participant-report-details"/);
  assert.match(report, /data-action="submit-participant-report"/);
  assert.match(app, /await submitUserReport\(runtimeConfig/);
  assert.match(app, /await blockConnectedUser\(runtimeConfig, targetUserId\)/);
});

test("app bootstraps only after render-time constants are initialized", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const iconMapIndex = app.indexOf("const commandIconSvgs");
  const bootstrapCallIndex = app.lastIndexOf("bootstrapApp();");
  const authReadyIndex = app.indexOf(
    'document.addEventListener("account-auth-ready"'
  );

  assert.ok(iconMapIndex >= 0);
  assert.ok(bootstrapCallIndex > iconMapIndex);
  assert.ok(authReadyIndex >= 0);
  assert.match(
    app,
    /document\.addEventListener\("account-auth-ready", \(\) => \{\s*hydrateAppAfterAccountReady\(\)/
  );
  assert.match(
    app,
    /function bootstrapApp\(\) \{\s*if \(!document\.documentElement\.classList\.contains\("account-auth-pending"\)\)/
  );
  assert.match(
    app,
    /async function hydrateAppForActiveAccount\(\) \{\s*localProfile = loadLocalProfile\(\);[\s\S]*?const startupState = await loadSharedStateForStartup\(\{\s*maxWaitMs: 0\s*\}\);\s*const sharedState = startupState\.state;/
  );
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
  assert.match(app, /renderEventHeader\(event, activeEventParticipants\(event\)\)/);
  assert.match(app, /data-action="copy-event-report"/);
  assert.match(app, /copyEventReport\(target\.dataset\.eventId\)/);
});

test("home screen stays focused on event actions and the event list", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const home = sourceBetween(
    app,
    "function renderHome()",
    "function renderRecentEventShortcut"
  );

  assert.match(home, /events\.map\(renderEventRow\)/);
  assert.doesNotMatch(home, /renderHomeEventTools/);
  assert.doesNotMatch(home, /renderPersonalDashboard|renderRecentEventShortcut|renderPersonalActionList|renderBackupPanel/);
  assert.doesNotMatch(home, /renderEventSearchPanel/);
  assert.doesNotMatch(home, /event-search/);
});

test("visible event counts use correct Hebrew singular and plural labels", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /function formatCount\(count, singular, plural\)/);
  assert.match(app, /formatCount\(statusCounts\.open, "פתוח", "פתוחים"\)/);
  assert.match(app, /formatCount\(statusCounts\.closed, "סגור", "סגורים"\)/);
  assert.doesNotMatch(app, /visibleEventCount/);
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
  assert.match(
    app,
    /const rewindSteps = expenseDialogRewindSteps\(\);\s+expenseDraft = null;\s+closeDialogWithHistory\(rewindSteps\);/
  );
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

test("every expense route uses the same app-like navigation shell", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const regularExpense = sourceBetween(
    app,
    "function renderExpenseForm(event)",
    "function renderExpenseModeSwitch(event)"
  );
  const quickExpense = sourceBetween(
    app,
    "function renderQuickExpenseForm(event, participants, canEdit)",
    "function renderQuickItemRow"
  );

  assert.match(regularExpense, /expense-route-backdrop/);
  assert.match(regularExpense, /expense-accessibility-button/);
  assert.match(regularExpense, /aria-label="חזרה לאירוע"/);
  assert.match(regularExpense, /renderEventRoutePrimaryNav\(\)/);
  assert.match(quickExpense, /expense-route-backdrop/);
  assert.match(quickExpense, /expense-accessibility-button/);
  assert.match(quickExpense, /aria-label="חזרה לאירוע"/);
  assert.match(quickExpense, /renderEventRoutePrimaryNav\(\)/);
  assert.doesNotMatch(quickExpense, /modal-close-button/);
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
  assert.match(expenseForm[0], /expense-participant-add-launch/);
  assert.match(expenseForm[0], /expense-participant-add-route/);
  assert.match(expenseForm[0], /data-action="event-guest-name"/);
  assert.match(expenseForm[0], /data-action="event-add-guest"/);
  assert.match(app, /expenseDraft\?\.eventId === event\.id/);
  assert.match(app, /expenseDraft\.sharedByParticipantIds\.push\(guest\.id\)/);
});

test("ordinary expense entry keeps the fast path visible and progressively reveals advanced details", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const expenseForm = sourceBetween(app, "function renderExpenseForm(event)", "function renderExpenseModeSwitch(event)");

  assert.match(expenseForm, /expense-total-field/);
  assert.match(expenseForm, /data-action="expense-name"/);
  assert.match(expenseForm, /<details class="expense-details-panel"/);
  assert.match(expenseForm, /<summary>/);
  assert.match(expenseForm, /חלוקה, משלמים ותאריך/);
  assert.match(expenseForm, /data-action="expense-date"/);
  assert.match(expenseForm, /renderExpensePayerSummary\(\)/);
  assert.match(expenseForm, /renderParticipantChecks\(expenseDraft\.sharedByParticipantIds, "expense-shared", event\)/);
  assert.match(expenseForm, /expense-participant-add-launch/);
  assert.match(expenseForm, /function shouldOpenExpenseDetails/);
  assert.match(expenseForm, /expenseDraft\.error/);
  assert.match(expenseForm, /EVENT_TYPE_TRIP/);
  assert.match(app, /function syncExpenseDetailsSummary/);
  assert.match(app, /aria-live="polite"/);
});

test("ordinary expense entry asks for the amount before optional shortcuts", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const expenseForm = sourceBetween(app, "function renderExpenseForm(event)", "function renderExpenseModeSwitch(event)");

  const totalIndex = expenseForm.indexOf('data-action="expense-total"');
  const nameIndex = expenseForm.indexOf('data-action="expense-name"');
  const templatesIndex = expenseForm.indexOf('class="expense-template-grid"');
  const modeIndex = expenseForm.indexOf("renderExpenseModeSwitch(event)");

  assert.ok(totalIndex >= 0);
  assert.ok(totalIndex < nameIndex);
  assert.ok(nameIndex < templatesIndex);
  assert.ok(templatesIndex < modeIndex);
  assert.match(expenseForm, /name="expenseTotal" autocomplete="off"/);
  assert.match(
    app,
    /function renderExpenseModeSwitch\(event\)[\s\S]*?eventTypeConfig\(event\?\.eventType\)\.id !== EVENT_TYPE_RESTAURANT/
  );
});

test("ordinary expense entry presents one focused decision per step", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const design = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(
    app,
    /const EXPENSE_FLOW_STEPS = \["amount", "name", "payer", "participants", "review"\]/
  );
  assert.match(app, /מה הסכום הכולל\?/);
  assert.match(app, /על מה הייתה ההוצאה\?/);
  assert.match(app, /מי שילם\?/);
  assert.match(app, /אם יותר מאדם אחד שילם, מוסיפים כאן משלם נוסף/);
  assert.match(app, /class="secondary-button section expense-add-payer-button"/);
  assert.match(app, /יותר מאדם אחד שילם\?/);
  assert.match(app, /הוסף משלם נוסף/);
  assert.match(app, /מי השתתף בהוצאה\?/);
  assert.match(app, /הכול מוכן\?/);
  assert.match(app, /data-action="expense-step-next"/);
  assert.match(app, /data-action="expense-step-back"/);
  assert.match(app, /flowStep: normalizeExpenseFlowStep\(expenseDraft\.flowStep\)/);
  assert.match(
    app,
    /if \(rememberedDraft\) \{[\s\S]*?flowStep: "amount"[\s\S]*?historyBaseDepth: appHistoryDepth/
  );
  assert.match(
    app,
    /const activeExpenseDraft =[\s\S]*?flowStep: normalizeExpenseFlowStep\(targetExpenseDraft\.flowStep\)/
  );
  assert.match(app, /function expenseDialogRewindSteps\(\)/);
  assert.match(
    app,
    /\$\{flowStep === "amount" \? renderRestoredDraftNote\(\) : ""\}/
  );
  assert.match(design, /Focused expense flow: one decision per screen/);
  assert.match(
    design,
    /\.expense-step-modal \.expense-flow-fields \{[\s\S]*?flex: 1 1 auto !important;[\s\S]*?display: flex !important;[\s\S]*?overflow: hidden !important;/
  );
  assert.match(
    design,
    /\.expense-flow-body \{[\s\S]*?width: 100% !important;[\s\S]*?flex: 1 1 auto !important;[\s\S]*?overflow-y: auto !important;/
  );
  assert.match(
    design,
    /\.expense-step-modal\[data-expense-step="amount"\][\s\S]*?\.expense-total-field/
  );
  assert.match(
    design,
    /\.expense-step-modal\[data-expense-step="review"\][\s\S]*?\.expense-flow-review/
  );
  assert.match(
    design,
    /\.expense-step-modal\[data-expense-step="amount"\][\s\S]*?\.expense-flow-body,[\s\S]*?padding-top: clamp\(38px, 7vh, 72px\) !important;/
  );
  assert.match(
    design,
    /\.expense-step-modal \.expense-total-field \{[\s\S]*?border-radius: 14px !important;[\s\S]*?transition-property: border-color, box-shadow, transform !important;/
  );
  assert.match(
    design,
    /\.expense-step-modal \.expense-name-field input \{[\s\S]*?min-height: 58px !important;[\s\S]*?font-weight: 600 !important;/
  );
  assert.doesNotMatch(
    design,
    /\.expense-step-modal \.expense-total-field \{[\s\S]*?transition:\s*all/
  );
  assert.match(app, /data-action="expense-name"[\s\S]*?enterkeyhint="next"/);
  assert.match(app, /function expenseFlowValidationMessage\(step\)/);
  assert.match(app, /יש להזין סכום גדול מאפס/);
  assert.match(app, /יש לבחור לפחות משתתף אחד בהוצאה/);
  assert.match(
    app,
    /שלב \$\{index \+ 1\} מתוך \$\{flowSteps\.length\}: \$\{escapeHtml\(stepTitle\)\}/
  );
});

test("expense participant step keeps additions in a focused sub-screen", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const design = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");
  const expenseForm = sourceBetween(
    app,
    "function renderExpenseForm(event)",
    "function normalizeExpenseFlowStep(step)"
  );

  assert.match(
    expenseForm,
    /renderParticipantChecks\(expenseDraft\.sharedByParticipantIds, "expense-shared", event\)[\s\S]*?renderExpenseParticipantToolbar\(event, participants\)/
  );
  assert.match(expenseForm, /data-action="expense-select-all"/);
  assert.doesNotMatch(expenseForm, /data-action="expense-select-current"/);
  assert.doesNotMatch(expenseForm, />רק אני</);
  assert.match(expenseForm, /data-expense-participant-toolbar/);
  assert.match(
    expenseForm,
    /class="expense-participant-add-launch"[\s\S]*?data-action="expense-open-participant-add"/
  );
  assert.match(expenseForm, /renderExpenseParticipantAddRoute\(event, canEdit\)/);
  assert.match(app, /function renderExpenseParticipantAddRoute\(event, canEdit\)/);
  assert.match(app, /data-expense-participant-add-view="\$\{view\}"/);
  assert.match(app, /data-action="expense-participant-add-view"/);
  assert.match(app, /data-action="expense-participant-add-back"/);
  assert.match(app, /data-action="expense-add-friend-participant"/);
  assert.match(app, /data-action="expense-share-invite"/);
  assert.match(app, /מהחברים שלי/);
  assert.match(app, /הזמן בקישור/);
  assert.match(app, /שם אופליין/);
  assert.match(
    app,
    /async function addFriendParticipantToExpense[\s\S]*?activateParticipantForEvent[\s\S]*?sharedByParticipantIds\.push[\s\S]*?publishEventInvitation/
  );
  assert.match(app, /function applyExpenseParticipantPreset\(mode, trigger\)/);
  assert.match(
    app,
    /action === "expense-select-all"[\s\S]*?applyExpenseParticipantPreset\("all", target\)/
  );
  assert.match(design, /\.expense-participant-toolbar \{/);
  assert.match(
    design,
    /\.expense-participant-toolbar\[hidden\] \{[\s\S]*?display: none !important/
  );
  assert.match(design, /\.expense-select-all-compact \{[\s\S]*?min-height: 44px !important/);
  assert.match(app, /function renderExpenseParticipantRow\(/);
  assert.match(app, /class="expense-participant-list"/);
  assert.match(design, /\.expense-participant-row \{/);
  assert.match(
    design,
    /\.expense-participant-add-launch \{[\s\S]*?min-height: 64px !important/
  );
  assert.match(design, /\.expense-participant-add-menu \{/);
  assert.match(design, /\.expense-participant-choice \{/);
  assert.match(design, /\.expense-participant-friend-option \{/);
  assert.match(design, /\.expense-participant-offline-form \{/);
});

test("expense review keeps editing subtle and the date inside one summary list", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const design = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");
  const review = sourceBetween(
    app,
    "function renderExpenseFlowReview(event, participants)",
    "function expenseFlowReady"
  );

  assert.match(
    review,
    /<div class="expense-review-list">[\s\S]*?renderExpenseDateField\("expense-review-date"\)[\s\S]*?<\/div>/
  );
  assert.doesNotMatch(review, />שינוי<\/span>/);
  assert.match(review, /class="expense-review-edit"[\s\S]*?iconSvg\("chevron-left"\)/);
  assert.match(
    design,
    /\.expense-step-modal\[data-expense-step="review"\][\s\S]*?\.expense-review-date[\s\S]*?input\[type="date"\]/
  );
});

test("empty expense drafts clear stale recovery memory", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(
    app,
    /if \(!serializedDraft\) \{\s*window\.localStorage\.removeItem\(key\);\s*return;\s*\}/
  );
});

test("participant manager offers saved people while expenses stay scoped to the event", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(
    app,
    /function renderParticipantChecks\(selectedIds, action, event = null\) \{[\s\S]*?event && action === "event-participant"[\s\S]*?\[\.\.\.state\.participants\][\s\S]*?\.sort/
  );
  assert.match(
    app,
    /\.filter\(participantCandidateFilter\(selectedIds, action\)\)/,
    "participant managers use the explicit personal roster"
  );
  assert.match(
    app,
    /Number\(selectedIds\.includes\(right\.id\)\) - Number\(selectedIds\.includes\(left\.id\)\)/
  );
  assert.match(
    app,
    /IDENTITY_GROUPED_PARTICIPANT_ACTIONS\.has\(action\)[\s\S]*?state\.participants\.filter\(participantCandidateFilter\(selectedIds, action\)\)/
  );
});

test("new events and participant dialogs do not leak unrelated historical names", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const filter = sourceBetween(
    app,
    "function participantCandidateFilter(selectedIds, action = \"\")",
    "function participantConnectionStatus(participant)"
  );

  assert.match(filter, /activeFriendParticipantIds\(state\)/);
  assert.match(filter, /\.\.\.\(selectedIds \?\? \[\]\)/);
  assert.match(filter, /action === "new-event-participant"/);
  assert.match(filter, /selectedGroup\?\.memberIds/);
  assert.doesNotMatch(filter, /participantCandidatesForParticipant/);
});

test("participant manager distinguishes connected accounts from manually added names", async () => {
  const [app, design] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(app, /function participantConnectionStatus\(participant\)/);
  assert.match(app, /\["google", "apple", "email"\]\.includes\(authProvider\)/);
  assert.match(app, /label: isCurrentParticipant \? "אתה" : "חבר באפליקציה"/);
  assert.match(app, /label: "שם אופליין"/);
  assert.match(app, /class="participant-connection-badge/);
  assert.match(app, /data-participant-identity="\$\{identity\.connected \? "account" : "offline"\}"/);
  assert.match(app, /participantConnectionStatus\(participant\)\.label/);
  assert.match(app, /IDENTITY_GROUPED_PARTICIPANT_ACTIONS/);
  assert.match(
    app,
    /IDENTITY_GROUPED_PARTICIPANT_ACTIONS = new Set\(\[[\s\S]*?"expense-shared"/
  );
  assert.match(app, /function participantUsernameLabel\(participant\)/);
  assert.match(app, /function participantSearchIdentity\(participant, displayName\)/);
  assert.match(app, /class="participant-username"/);
  assert.match(app, /function renderCurrentEventParticipantGroup\(/);
  assert.match(app, /class="event-participant-roster-identity-group is-\$\{identity\}"/);
  assert.match(app, /משתמשים באפליקציה/);
  assert.match(app, /שמות אופליין/);
  assert.match(
    app,
    /class="event-participant-status-tag event-participant-current-label">אתה</
  );
  assert.match(
    app,
    /class="event-participant-status-tag event-participant-role">\$\{roleLabel\}</
  );
  assert.match(
    app,
    /class="event-participant-status-tag event-participant-friend-hint is-\$\{friendship\.kind\}"/
  );
  assert.match(
    app,
    /const rowAction = isCurrentParticipant[\s\S]*?"open-event-settings"[\s\S]*?"open-event-participant-profile"/
  );
  assert.match(
    app,
    /renderAvatar\(participant\.id, event, \{ openCurrentProfile: isCurrentParticipant \}\)/
  );
  assert.match(
    app,
    /data-action="edit-profile" role="button" tabindex="0" aria-label="פתיחת הפרופיל שלך"/
  );
  assert.match(design, /\.event-participant-roster-identity-heading \{/);
  assert.match(design, /background: var\(--ledger-surface-soft\) !important/);
  assert.match(design, /\.participant-username \{/);
  assert.match(design, /color: var\(--ledger-brand\) !important/);
});

test("connected event participants expose a guarded friendship action", async () => {
  const [app, design] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(app, /data-action="open-event-participant-profile"/);
  assert.match(app, /function renderEventParticipantProfileDialog\(event\)/);
  assert.match(app, /data-action="request-event-friendship"/);
  assert.match(app, /requestFriendshipFromEvent\(/);
  assert.match(app, /participantId === state\.currentParticipantId/);
  assert.match(app, /isEventParticipantInactive\(event, participantId\)/);
  assert.match(app, /label: "הצע חברות"/);
  assert.match(app, /label: "בקשה נשלחה"/);
  assert.match(app, /label: "חברים"/);
  assert.match(design, /\.event-participant-profile-trigger \{/);
  assert.match(design, /\.event-participant-friendship-action \{/);
});

test("inviting from participant management returns to the participant roster", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const shell = sourceBetween(
    app,
    "function renderEventDialogShell(",
    "function renderEventParticipantsDialog(event)"
  );
  const shareDialog = sourceBetween(
    app,
    "function renderEventShareDialog(event)",
    "function renderEventSettingsDialog(event)"
  );
  const openDialog = sourceBetween(
    app,
    "function openEventDialog(eventId, kind, trigger = document.activeElement)",
    "function handleEventLongPressStart"
  );
  const goBack = sourceBetween(
    app,
    "function goBackInApp()",
    "function renderHistoryFallback"
  );

  assert.match(shell, /backLabel = "חזרה להגדרות"/);
  assert.match(shell, /aria-label="\$\{escapeAttribute\(backLabel\)\}"/);
  assert.match(
    shareDialog,
    /\["participants", "participants-add"\]\.includes\(\s*eventDialog\?\.returnKind/
  );
  assert.match(shareDialog, /backAction: returnsToParentRoute/);
  assert.match(shareDialog, /\? "event-share-back"/);
  assert.match(shareDialog, /\? "event-share-view-back"/);
  assert.match(shareDialog, /backLabel: returnsToParticipantLink/);
  assert.match(shareDialog, /\? "חזרה לקישור החשבון"/);
  assert.match(shareDialog, /: returnsToParticipants/);
  assert.match(shareDialog, /\? "חזרה למשתתפים"/);
  assert.match(shareDialog, /: "חזרה לדרכי ההזמנה"/);
  assert.match(openDialog, /\["participants", "participants-add", "participant-link"\]\.includes\(eventDialog\.kind\)/);
  assert.match(openDialog, /returnKind,/);
  assert.match(goBack, /eventDialog\?\.kind === "share"/);
  assert.match(
    goBack,
    /\["participants", "participants-add"\]\.includes\(eventDialog\.returnKind\)/
  );
  assert.match(goBack, /renderHistoryFallback\(\)/);
  assert.match(app, /if \(action === "event-share-back"\) \{\s*goBackInApp\(\)/);
  assert.match(app, /if \(action === "event-share-view-back"\) \{\s*goBackInApp\(\)/);
});

test("event sharing reveals one invitation path at a time", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const shareDialog = sourceBetween(
    app,
    "function renderEventShareDialog(event)",
    "function renderEventSettingsDialog(event)"
  );
  const inviteStatus = sourceBetween(
    app,
    "function renderInviteStatus(event, ready, available = ready)",
    "function eventInviteUrl(eventId)"
  );

  assert.match(shareDialog, /data-event-share-view="menu"/);
  assert.match(shareDialog, /data-share-view="friends"/);
  assert.match(shareDialog, /data-share-view="link"/);
  assert.match(shareDialog, /data-event-share-view="friends"/);
  assert.match(shareDialog, /data-event-share-view="link"/);
  assert.match(shareDialog, /activeFriendParticipantIds\(state\)/);
  assert.match(shareDialog, /event-share-link-status/);
  assert.doesNotMatch(shareDialog, /class="event-invite-link-preview"/);
  assert.match(shareDialog, /הקישור מוכן/);
  assert.match(shareDialog, /type="hidden"\s+name="eventInviteUrl"/);
  assert.doesNotMatch(shareDialog, /event-invite-rotate-button/);
  assert.match(shareDialog, /event-invite-retry-button/);
  assert.match(app, /shareView: dialog\.shareView \?\? ""/);
});

test("event participant changes stay inside the dialog without blocking browser alerts", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const design = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");
  const dialog = sourceBetween(
    app,
    "function renderEventParticipantsDialog(event)",
    "function renderEventShareDialog(event)"
  );
  const toggle = sourceBetween(
    app,
    "async function toggleEventParticipant(eventId, participantId, checked)",
    "function syncEventParticipantDialog(event)"
  );
  const sync = sourceBetween(
    app,
    "function syncEventParticipantDialog(event)",
    "function toggleId(ids, id, checked)"
  );

  assert.match(dialog, /class="event-participant-notice" role="status"/);
  assert.doesNotMatch(toggle, /window\.alert/);
  assert.match(toggle, /message: `\$\{participant\.displayName\} נוסף לאירוע\.`/);
  assert.match(toggle, /await publishEventInvitation\(eventId, participant\)/);
  assert.match(toggle, /kind: "event-invite"/);
  assert.match(toggle, /preparePrivateEventInvitation\(eventId\)/);
  assert.match(toggle, /membershipRecipients/);
  assert.match(toggle, /rememberPendingEventMembershipInvitation/);
  assert.doesNotMatch(toggle, /prepareEventShare\(eventId\)/);
  assert.match(toggle, /data-event-participant-roster/);
  assert.match(toggle, /reactivateDialogAfterRender\(/);
  assert.match(sync, /eventDialog\.eventId !== event\.id/);
  assert.match(sync, /if \(search\) filterParticipantChecks\(search\)/);
  assert.match(sync, /return true/);
  assert.match(design, /\.event-participant-notice \{/);
});

test("participant manager separates the current roster from saved names", async () => {
  const [app, design, coherence] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8"),
    readFile("src/publicDesignCoherenceLayer.mjs", "utf8")
  ]);
  const dialog = sourceBetween(
    app,
    "function renderEventParticipantsDialog(event)",
    "function renderEventParticipantAddDialog(event)"
  );
  const addDialog = sourceBetween(
    app,
    "function renderEventParticipantAddDialog(event)",
    "function compareEventParticipantRoster"
  );
  const participantRow = sourceBetween(
    app,
    "function renderCurrentEventParticipantRow(",
    "function eventParticipantFriendshipState"
  );

  assert.match(dialog, /renderCurrentEventParticipants/);
  assert.match(dialog, /description: event\.name/);
  assert.match(dialog, /routeMode: true/);
  assert.match(dialog, /backAction: "event-participants-back"/);
  assert.match(dialog, /backLabel: "חזרה לאירוע"/);
  assert.match(dialog, /showClose: false/);
  assert.match(dialog, /event-participant-route-backdrop/);
  assert.doesNotMatch(dialog, /האנשים תחת/);
  assert.match(dialog, /renderInactiveEventParticipants/);
  assert.match(dialog, /data-action="open-event-participant-add"/);
  assert.doesNotMatch(dialog, /renderAvailableEventParticipants/);
  assert.match(addDialog, /renderEventParticipantAddRoutes/);
  assert.doesNotMatch(addDialog, /expanded: true/);
  assert.match(app, /data-action="open-event-share"/);
  assert.match(app, /function renderEventParticipantAddEditor/);
  assert.match(addDialog, /routeMode: true/);
  assert.match(addDialog, /backAction: "event-participants-back"/);
  assert.match(addDialog, /backLabel: "חזרה למשתתפים"/);
  assert.match(addDialog, /showClose: false/);
  assert.match(addDialog, /event-participant-add-route-modal/);
  assert.match(addDialog, /eyebrow: ""/);
  assert.match(app, /data-event-participant-roster/);
  assert.match(app, />בחר מרשימת החברים</);
  assert.match(app, /data-action="add-event-participant"/);
  assert.match(app, /data-action="select-event-participant-candidate"/);
  assert.match(app, /data-action="confirm-event-participant-add"/);
  assert.match(app, /pendingParticipantId/);
  assert.match(app, /אישור והוספה לאירוע/);
  assert.match(app, /aria-pressed="\$\{selected\}"/);
  assert.match(design, /\.event-participant-selection-button\.is-selected/);
  assert.match(design, /\.event-participant-add-confirmation/);
  assert.match(app, /data-action="remove-event-participant"/);
  assert.match(app, /data-action="restore-event-participant"/);
  assert.match(app, /data-participant-search-for="event-participant-roster"/);
  assert.match(app, /\$\{countLabel\} · לחצו על שם לניהול/);
  assert.doesNotMatch(participantRow, /באירוע עכשיו/);
  assert.doesNotMatch(participantRow, /אורחים ללא חשבון/);
  assert.match(participantRow, /class="event-participant-roster-row/);
  assert.match(participantRow, /const rowAction = isCurrentParticipant[\s\S]*?"open-event-participant-profile"/);
  assert.match(participantRow, /class="event-participant-roster-chevron"/);
  assert.doesNotMatch(participantRow, /event-participant-membership-button/);
  assert.doesNotMatch(participantRow, /data-action="remove-event-participant"/);
  assert.match(app, /class="event-participant-duplicate-status">בדיקת שם</);
  assert.doesNotMatch(participantRow, /קיימות הוצאות/);
  assert.match(app, /const EVENT_PARTICIPANT_SEARCH_THRESHOLD = 6/);
  assert.match(app, /participants\.length > EVENT_PARTICIPANT_SEARCH_THRESHOLD/g);
  assert.match(app, /kind: "remove-event-participant"/);
  assert.match(app, /confirmLabel: "הסר מהאירוע"/);
  assert.match(
    app,
    /function canCurrentParticipantChangeEventMembership\(event, participantId\) \{[\s\S]*?canCurrentParticipantManage\(event\)/
  );
  assert.match(
    app,
    /async function removeEventParticipant\([\s\S]*?const saveRequest = persistState\(\);\s*render\(\);\s*reactivateDialogAfterRender\("\.event-modal"\);\s*const result = await saveRequest;[\s\S]*?לא בוצע שינוי/
  );
  assert.match(
    app,
    /const removalMessage =[\s\S]*?message: ""[\s\S]*?notice = removalMessage;[\s\S]*?const saveRequest = persistState\(\)/
  );
  assert.match(design, /\.event-participant-roster-row/);
  assert.match(design, /\.event-participant-roster-search/);
  assert.match(design, /\.event-participant-inactive-row/);
  assert.match(design, /\.event-participant-duplicate-status/);
  assert.match(design, /min-height: 44px !important/);
  assert.match(coherence, /body #app \.event-participant-route-backdrop/);
  assert.match(
    coherence,
    /body #app \.event-participant-route-modal \{[\s\S]*?border: 0 !important;[\s\S]*?border-radius: 0 !important;[\s\S]*?box-shadow: none !important;/
  );
  assert.match(coherence, /\.event-participant-roster-row\.is-offline/);
  assert.match(coherence, /\.event-participant-roster-chevron/);
  assert.match(coherence, /filter: grayscale\(1\)/);
});

test("offline names can be renamed from the event without changing participant identity", async () => {
  const [app, actions, design, coherence] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/domain/appActions.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8"),
    readFile("src/publicDesignCoherenceLayer.mjs", "utf8")
  ]);
  const row = sourceBetween(
    app,
    "function renderCurrentEventParticipantRow(",
    "function renderInactiveEventParticipants"
  );
  const renameDialog = sourceBetween(
    app,
    "function renderEventOfflineParticipantRenameDialog(event)",
    "function compareEventParticipantRoster"
  );
  const offlineProfile = sourceBetween(
    app,
    "function renderOfflineEventParticipantProfile(event, participant)",
    "function linkableEventAccountParticipants"
  );

  assert.match(row, /<button[\s\S]*?class="event-participant-roster-row/);
  assert.match(row, /const rowAction = isCurrentParticipant[\s\S]*?"open-event-participant-profile"/);
  assert.match(offlineProfile, /data-action="open-offline-participant-rename"/);
  assert.match(offlineProfile, /commandIconSvgs\.edit/);
  assert.match(offlineProfile, /data-participant-detail-view="offline"/);
  assert.match(offlineProfile, /data-action="open-event-participant-link"/);
  assert.match(
    offlineProfile,
    /<button[\s\S]*?class="event-participant-management-row"[\s\S]*?data-action="open-event-participant-link"/
  );
  assert.doesNotMatch(
    offlineProfile,
    /<div class="event-participant-management-row">[\s\S]*?data-action="open-event-participant-link"/
  );
  assert.match(app, /eventDialog\.kind === "participant-rename"/);
  assert.match(renameDialog, /data-action="event-offline-participant-rename"/);
  assert.match(renameDialog, /data-action="save-offline-participant-name"/);
  assert.match(renameDialog, /אותו אדם, אותו חישוב - רק השם משתנה/);
  assert.match(app, /renameOfflineParticipant\(state, participantId, displayName\)/);
  assert.match(app, /normalizeParticipantDisplayName\(item\.displayName\)/);
  assert.match(app, /action === "event-participant-rename-back"/);
  assert.match(app, /action === "event-offline-participant-rename"/);
  assert.match(actions, /export function renameOfflineParticipant/);
  assert.match(actions, /profileUpdatedAt/);
  assert.match(design, /\.event-participant-edit-name-button/);
  assert.match(design, /\.event-participant-edit-name-button \{[\s\S]*?min-width: 44px !important;[\s\S]*?min-height: 44px !important;/);
  assert.match(design, /\.event-participant-rename-card/);
  assert.match(design, /font-size: max\(16px, 1em\) !important/);
  assert.match(coherence, /\.event-participant-management\.is-offline/);
  assert.match(coherence, /\.event-participant-account-link-button/);
});

test("account linking can invite someone outside the friends list through the standard event invite", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const linkDialog = sourceBetween(
    app,
    "function renderEventParticipantLinkDialog(event)",
    "function compareEventParticipantRoster"
  );
  const openDialog = sourceBetween(
    app,
    "function openEventDialogWithDetails(",
    "function handleEventLongPressStart"
  );

  assert.match(linkDialog, /data-action="open-event-participant-link-invite"/);
  assert.match(linkDialog, /WhatsApp, העתקת קישור או סריקת QR/);
  assert.match(linkDialog, /class="event-share-choice event-share-route-list event-participant-link-invite"/);
  assert.match(linkDialog, /candidates\.length/);
  assert.match(app, /await openPreparedEventShare\(eventId, target, "link"\)/);
  assert.match(openDialog, /returnKind === "participant-link"/);
  assert.match(openDialog, /returnParticipantId/);
  assert.doesNotMatch(
    app,
    /!canCurrentParticipantManage\(event\) \|\|\s*!linkableEventAccountParticipants\(event, participantId\)\.length/
  );
});

test("account linking waits for a confirmed cloud save before reporting success", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const mergeFlow = sourceBetween(
    app,
    "async function mergeParticipantsInStateNow()",
    "function dropParticipantFromDrafts"
  );

  assert.match(app, /await mergeParticipantsInState\(\)/);
  assert.match(mergeFlow, /prepareSharedEventForInvitation\(pendingMerge\.eventId/);
  assert.match(mergeFlow, /forceSharedEventIds: \[pendingMerge\.eventId\]/);
  assert.match(mergeFlow, /confirmPendingAccountLink\(accountLinkReceipt\)/);
  assert.match(mergeFlow, /const previousState = cloneNavigationValue\(state\)/);
  assert.match(mergeFlow, /if \(!result\?\.ok && !result\?\.pending\)/);
  assert.match(mergeFlow, /state = previousState/);
  assert.match(mergeFlow, /emitOperationFailure\("account_link"/);
  assert.ok(
    mergeFlow.indexOf("await saveSharedState") <
      mergeFlow.indexOf("dropParticipantFromDrafts(source.id)")
  );
});

test("participant manager keeps the roster calm and moves adding into one focused step", async () => {
  const [app, design] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);
  const rosterDialog = sourceBetween(
    app,
    "function renderEventParticipantsDialog(event)",
    "function renderEventParticipantAddDialog(event)"
  );
  const addDialog = sourceBetween(
    app,
    "function renderEventParticipantAddDialog(event)",
    "function compareEventParticipantRoster"
  );
  const goBack = sourceBetween(
    app,
    "function goBackInApp()",
    "function renderHistoryFallback"
  );

  assert.match(rosterDialog, /data-action="open-event-participant-add"/);
  assert.match(rosterDialog, />הוסף משתתפים</);
  assert.match(rosterDialog, /class="event-participant-primary-actions"/);
  assert.doesNotMatch(rosterDialog, /data-action="open-event-share"/);
  assert.doesNotMatch(rosterDialog, /event-participant-invite-launch/);
  assert.doesNotMatch(rosterDialog, /event-participant-add-options/);
  assert.match(addDialog, /title: routeTitle/);
  assert.match(addDialog, /: "מי מצטרף לאירוע\?"/);
  assert.match(addDialog, /event-participant-add-view-back/);
  assert.match(addDialog, /description: ""/);
  assert.match(addDialog, /routeMode: true/);
  assert.match(addDialog, /showClose: false/);
  assert.match(app, /data-action="open-event-share"/);
  assert.match(app, /data-action="event-add-guest"/);
  assert.match(addDialog, /renderEventParticipantAddRoutes/);
  assert.match(app, /new-event-participant-actions/);
  assert.match(app, /new-event-participant-route-action \$\{className\}/);
  assert.match(app, /הזמן בקישור/);
  assert.match(app, /הוסף שם ידנית/);
  assert.match(app, /participant-add-privacy-note/);
  assert.doesNotMatch(addDialog, /בחר מאנשי הקשר/);
  assert.match(
    app,
    /if \(action === "open-event-participant-add"\)[\s\S]*?kind: "participants-add"/
  );
  assert.match(
    goBack,
    /if \(eventDialog\?\.kind === "participants-add"\) \{\s*renderHistoryFallback\(\)/
  );
  assert.match(design, /\.event-participant-add-launch/);
  assert.match(design, /\.event-participant-primary-actions/);
  assert.match(design, /\.event-participant-add-screen \.new-event-participant-actions/);
  assert.match(
    design,
    /@media \(max-width: 350px\)[\s\S]*?\.event-participant-primary-actions[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/
  );
  assert.match(design, /\.event-participant-add-screen/);
});

test("connected participant profile stays focused on participant management", async () => {
  const [app, design, coherence] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8"),
    readFile("src/publicDesignCoherenceLayer.mjs", "utf8")
  ]);
  const profile = sourceBetween(
    app,
    "function renderConnectedEventParticipantProfile(event, participant)",
    "function renderRelationshipFriendshipControl"
  );

  assert.match(profile, /title: "ניהול משתתף"/);
  assert.match(profile, /event-participant-management-modal/);
  assert.match(profile, /backAction: "event-participants-back"/);
  assert.match(profile, /backLabel: "חזרה למשתתפים"/);
  assert.match(profile, /renderEventParticipantAdminControl/);
  assert.match(profile, />חברות</);
  assert.match(profile, /renderEventParticipantRemovalRow/);
  assert.match(profile, /data-action="toggle-event-participant-admin"/);
  assert.doesNotMatch(profile, /renderParticipantRelationshipScorecard/);
  assert.doesNotMatch(profile, /אתם במספרים/);
  assert.match(design, /\.relationship-friendship-action/);
  assert.match(coherence, /\.event-participant-management-list/);
  assert.match(coherence, /\.event-participant-admin-toggle/);
  assert.match(coherence, /\.event-participant-management-row\.is-danger/);
});

test("participant search targets every current participant manager container", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const filter = sourceBetween(
    app,
    "function filterParticipantChecks(input)",
    "function filterFriendRows(input)"
  );

  assert.match(
    filter,
    /\.participant-checks-set, \[data-participant-checks-for\], \[data-event-participant-roster\]/
  );
  assert.match(filter, /\[data-participant-identity-group\]/);
  assert.match(filter, /setSearchResultHidden\(row, !matches\)/);
  assert.match(filter, /style\.setProperty\("display", "none", "important"\)/);
});

test("participant membership changes protect creators and admins while preserving money", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const requestRemoval = sourceBetween(
    app,
    "function requestEventParticipantRemoval(eventId, participantId, trigger)",
    "async function removeEventParticipant(eventId, participantId)"
  );
  const remove = sourceBetween(
    app,
    "async function removeEventParticipant(eventId, participantId)",
    "async function toggleEventParticipant(eventId, participantId, checked)"
  );
  const restore = sourceBetween(
    app,
    "async function restoreEventParticipant(eventId, participantId)",
    "async function toggleEventParticipant(eventId, participantId, checked)"
  );
  const membershipAuthorization = sourceBetween(
    app,
    "function canCurrentParticipantChangeEventMembership(event, participantId)",
    "function editBlockedMessage(event)"
  );

  assert.match(requestRemoval, /eventParticipantHasMoneyHistory/);
  assert.match(requestRemoval, /participantId === state\.currentParticipantId/);
  assert.match(requestRemoval, /participantId === event\.createdByParticipantId/);
  assert.match(requestRemoval, /!canCurrentParticipantManage\(event\)/);
  assert.match(requestRemoval, /יש על שמו היסטוריה באירוע/);
  assert.match(requestRemoval, /השאר שם אופליין/);
  assert.match(requestRemoval, /הסר לגמרי/);
  assert.match(requestRemoval, /alternateDisabled: keepsHistoricalReference/);
  assert.doesNotMatch(requestRemoval, /קודם מעדכנים את ההוצאות שלו/);
  assert.match(remove, /participantId === event\.createdByParticipantId/);
  assert.match(remove, /!canCurrentParticipantManage\(event\)/);
  assert.match(remove, /\{ preserveOffline \}/);
  assert.match(
    remove,
    /const saveRequest = persistState\(\);\s*render\(\);\s*reactivateDialogAfterRender\("\.event-modal"\);\s*const result = await saveRequest;/
  );
  assert.match(remove, /state = previousState/);
  assert.match(remove, /ההיסטוריה הכספית נשמרה/);
  assert.match(remove, /notice = ""/);
  assert.match(restore, /event\.inactiveParticipantIds = \(event\.inactiveParticipantIds \?\? \[\]\)\.filter/);
  assert.match(restore, /!canCurrentParticipantManage\(event\)/);
  assert.match(restore, /message: `\$\{participant\.displayName\} חזר לאירוע\.`/);
  assert.match(membershipAuthorization, /canCurrentParticipantManage\(event\)/);
});

test("new expenses exclude removed historical participants while edits keep referenced names", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const participantChecks = sourceBetween(
    app,
    "function renderParticipantChecks(selectedIds, action, event = null)",
    "function openEventDialog(eventId, kind, trigger = document.activeElement)"
  );
  const expenseForm = sourceBetween(
    app,
    "function renderExpenseForm(event)",
    "function normalizeExpenseFlowStep(step)"
  );
  const startExpense = sourceBetween(
    app,
    "function startExpenseDraft(eventId, expenseId = null, trigger = document.activeElement)",
    "function activateExpenseEntryDialog()"
  );

  assert.match(participantChecks, /selectableEventParticipants\(event, selectedIds\)/);
  assert.match(expenseForm, /expenseParticipantsForCurrentDraft\(event\)/);
  assert.match(
    startExpense,
    /sharedByParticipantIds: activeEventParticipants\(event\)\.map/
  );
  assert.match(
    startExpense,
    /if \(existingExpense\) \{[\s\S]*?flowStep: "review"/,
    "editing an existing expense opens directly on the final review step"
  );
  assert.match(app, /function selectableEventParticipants\(event, selectedIds = \[\]\)/);
  assert.match(app, /selectedParticipantIds\.has\(participant\.id\)/);
});

test("an admin outside the roster starts with a valid active payer", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const startExpense = sourceBetween(
    app,
    "function startExpenseDraft(eventId, expenseId = null, trigger = document.activeElement)",
    "function activateExpenseEntryDialog()"
  );
  const continueExpense = sourceBetween(
    app,
    "function continueExpenseEntry(event)",
    "function saveQuickExpenses(eventId)"
  );

  assert.match(app, /function defaultExpensePayerId\(event\)/);
  assert.match(
    app,
    /if \(activeParticipantIds\.includes\(state\.currentParticipantId\)\)/
  );
  assert.match(startExpense, /const defaultPayerId = defaultExpensePayerId\(event\)/);
  assert.match(startExpense, /payers: \[createPayerDraft\(defaultPayerId\)\]/);
  assert.match(startExpense, /quickPayerId: defaultPayerId/);
  assert.match(startExpense, /createQuickItemDraft\(defaultPayerId\)/);
  assert.match(continueExpense, /const defaultPayerId = defaultExpensePayerId\(event\)/);
  assert.match(continueExpense, /const nextPayerIds = payerIds\.length \? payerIds : \[defaultPayerId\]/);
  assert.match(continueExpense, /quickPayerId: nextPayerIds\[0\]/);
});

test("adding an offline participant replaces stale participant feedback", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const addGuest = sourceBetween(
    app,
    "function addGuestToEvent(eventId)",
    "function addInlinePayerGuest"
  );

  assert.match(addGuest, /const participantMessage = created/);
  assert.match(
    addGuest,
    /eventDialog = \{[\s\S]*?\.\.\.eventDialog,[\s\S]*?message: participantMessage,[\s\S]*?offlineEntryOpen: true/
  );
  assert.match(addGuest, /notice = ""/);
  assert.match(addGuest, /const returnsToParticipantRoster = eventDialog\?\.kind === "participants-add"/);
  assert.match(addGuest, /kind: "participants"/);
  assert.match(addGuest, /renderHistoryFallback\(\)/);
});

test("participant manager offers a clear group link without leaving the event", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const dialog = sourceBetween(
    app,
    "function renderEventParticipantsDialog(event)",
    "function renderEventShareDialog(event)"
  );

  assert.match(app, /event-participant-add-routes/);
  assert.match(app, /הזמן בקישור/);
  assert.match(app, /data-action="open-event-share"/);
  assert.match(app, /set-event-participant-add-view/);
  assert.match(app, /aria-label="שם חדש להוספה ידנית"/);
  assert.match(app, /הוסף שם ידנית/);
});

test("single-participant events name the existing share action as an invitation", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const header = sourceBetween(
    app,
    "function renderEventHeader(",
    "function renderEventIdentityNotice("
  );

  assert.match(header, /participants\.length === 1 \? "הזמנת חברים" : "שיתוף"/);
  assert.match(header, /data-action="open-event-participant-add"/);
  assert.match(header, /button-action-icon[^>]*aria-hidden="true">\$\{iconSvg\("share"\)\}/);
  assert.doesNotMatch(header, /data-action="invite-first"/);
});

test("offline participant choice opens and focuses its name field in the same tap", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const clickHandler = sourceBetween(
    app,
    "async function handleClick(event)",
    "function handleInput(event)"
  );

  assert.match(clickHandler, /action === "focus-event-offline-name"/);
  assert.match(clickHandler, /event\.preventDefault\(\)/);
  assert.match(clickHandler, /const nextOpen = !details\.open/);
  assert.match(clickHandler, /offlineEntryOpen: nextOpen/);
  assert.match(clickHandler, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(clickHandler, /input\.scrollIntoView\(\{ block: "nearest", behavior: "smooth" \}\)/);
});

test("duplicate names require an explicit manager decision and support event aliases", async () => {
  const [app, identity, styles] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/domain/participantIdentity.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(identity, /unresolvedDuplicateParticipantPairs/);
  assert.match(identity, /participantEventDisplayName/);
  assert.match(identity, /participantEventActivityScore/);
  assert.match(app, /function renderDuplicateParticipantReview\(event\)/);
  assert.match(app, /function renderEventParticipantIdentityDialog\(event\)/);
  assert.match(app, /data-action="review-duplicate-participants"/);
  assert.match(app, /kind: "participant-identities"/);
  assert.match(app, /data-action="connect-duplicate-participant"/);
  assert.match(app, /data-action="keep-duplicate-participants"/);
  assert.match(app, /data-action="defer-duplicate-participant"/);
  assert.match(app, /data-action="save-participant-alias"/);
  assert.match(app, /כן, אותו אדם/);
  assert.match(app, /לא, אנשים שונים/);
  assert.match(app, /לא בטוח, אחר כך/);
  assert.match(
    app,
    /\[data-action="participant-alias"\]\[data-participant-id="\$\{unresolvedPair\.left\.id\}"\]/
  );
  assert.doesNotMatch(
    app,
    /\[data-action="restore-event-participant"\]\[data-participant-id="\$\{participantId\}"\]/
  );
  assert.match(app, /title: "לפני האיחוד"/);
  assert.match(app, /metrics: \[/);
  assert.match(app, /canCurrentParticipantManage\(event\)/);
  assert.match(app, /kind: "merge-participants"/);
  assert.match(styles, /\.participant-identity-review/);
  assert.match(styles, /\.participant-identity-question/);
  assert.match(styles, /\.participant-identity-success/);
  assert.match(styles, /\.participant-alias-control/);
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
  assert.match(app, /data-event-route-dialog="true"/);
  assert.match(app, /data-route-sync-status hidden role="status" aria-live="polite"/);
  assert.match(app, /data-inline-sync-retry data-sync-retry hidden/);
  assert.match(app, /showClose: false/);
  assert.match(app, /event-participant-add-route-modal/);
  assert.doesNotMatch(app, />סיום ההוספה</);
  assert.match(app, /event-modal-backdrop/);
  assert.match(styles, /\.event-command-grid/);
  assert.match(styles, /\.event-modal-backdrop/);
});

test("event screen has clear workspace navigation without a repeated insight dashboard", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");
  const eventScreen = sourceBetween(app, "function renderEvent(event)", "function renderEventStartPanel");

  assert.match(app, /buildEventInsights/);
  assert.match(eventScreen, /renderEventWorkspaceNav\(event, "expenses"\)/);
  assert.match(eventScreen, /renderEventPersonalBalance\(event, participants\)/);
  assert.match(eventScreen, /renderEventActionDock\(event, total, canEdit\)/);
  assert.ok(
    eventScreen.indexOf("renderEventActionDock(event, total, canEdit)") <
      eventScreen.indexOf('id="event-expenses"'),
    "the event action strip should remain in normal flow before expense cards"
  );
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
  assert.match(
    app,
    /function eventSettlementTransfers[\s\S]*?reconcileSettlementTransfers\([\s\S]*?event\.expenses,[\s\S]*?event\.transfers[\s\S]*?\)/
  );
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

test("event sharing uses a dedicated invite pass instead of a generic status chip", async () => {
  const [app, ledgerStyles] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);
  const shareDialog = sourceBetween(
    app,
    "function renderEventShareDialog(event)",
    "function renderEventSettingsDialog(event)"
  );
  assert.match(
    shareDialog,
    /event-share-link-status/
  );
  assert.match(shareDialog, /event-invite-link-field/);
  assert.match(shareDialog, /event-invite-link-actions/);
  assert.match(shareDialog, /הקישור מוכן/);
  assert.match(shareDialog, /הזמנה ל\$\{escapeHtml\(event\.name\)\}/);
  assert.doesNotMatch(shareDialog, /status-chip/);
  assert.match(ledgerStyles, /\.event-share-link-status \{/);
  assert.match(ledgerStyles, /\.event-invite-link-actions/);
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

  for (const section of ["management", "currency", "repayment", "rounding", "lock", "danger"]) {
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
  assert.match(app, /eventDialog\.kind === "settings-repayment"/);
  assert.match(app, /eventDialog\.kind === "settings-rounding"/);
  assert.match(app, /eventDialog\.kind === "settings-lock"/);
  assert.match(app, /eventDialog\.kind === "settings-danger"/);
  assert.match(app, /backAction: "event-settings-back"/);
  assert.match(app, /action === "event-settings-back"/);
  assert.match(ledgerStyles, /\.event-settings-menu-item/);
});

test("event settings expose friendly settlement rounding with an exact fallback", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const roundingHandler = sourceBetween(
    app,
    "async function setEventRoundingMode(eventId, mode)",
    "function syncSettlementCloseConfirmation(eventId)"
  );

  assert.match(app, /roundSettlementTransfers: true/);
  assert.match(app, /title: "עיגול סכומים"/);
  assert.match(app, /data-action="set-event-rounding-mode"/);
  assert.match(app, /data-rounding-mode="\$\{option\.id\}"/);
  assert.match(app, /סכומי ההוצאות תמיד נשמרים בדיוק כפי שהוזנו/);
  assert.match(app, /setEventRoundSettlementTransfers\(state, eventId, enabled\)/);
  assert.match(roundingHandler, /const previousState = state/);
  assert.match(roundingHandler, /const result = await persistState\(\)/);
  assert.match(roundingHandler, /if \(!result\?\.ok\) \{\s*state = previousState/);
});

test("event cover supports reliable gallery and camera replacement", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const settings = sourceBetween(
    app,
    "function renderEventSettingsDialog(event)",
    "function renderEventSettingsManagementDialog(event)"
  );

  assert.match(settings, /data-action="event-cover-image"[^>]*accept="image\/\*"/);
  assert.match(settings, /data-action="event-cover-image"[^>]*capture="environment"/);
  assert.doesNotMatch(settings, /תמונה מהאינטרנט/);
  assert.doesNotMatch(settings, /data-action="event-cover-url"/);
  assert.match(app, /function encodeCanvasJpegWithinLimit\(/);
  assert.match(app, /maxLength: 240_000/);
  assert.match(app, /await updateEventCoverImage\(eventId, coverImage\)/);
  assert.match(app, /const result = await persistState\(\)/);
  assert.match(app, /state = previousState/);
  assert.match(app, /settingsFieldUpdatedAt: \{[\s\S]*coverImage: updatedAt/);
});

test("closed events keep non-financial manager controls available", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const cover = sourceBetween(
    app,
    "function renderEventCover(event)",
    "function renderEventEmptyExpenseState"
  );
  const settings = sourceBetween(
    app,
    "function renderEventSettingsDialog(event)",
    "function renderEventSettingsManagementDialog(event)"
  );
  const adminToggle = sourceBetween(
    app,
    "async function toggleEventParticipantAdmin(eventId, participantId, enabled)",
    "async function setEventRoundingMode(eventId, mode)"
  );

  assert.match(cover, /canCurrentParticipantManage\(event\)/);
  assert.doesNotMatch(cover, /canCurrentParticipantEdit\(event\)/);
  assert.match(settings, /hidden \$\{!canManage \? "disabled" : ""\}/);
  assert.doesNotMatch(settings, /!canEdit/);
  assert.doesNotMatch(adminToggle, /event\.locked/);
  assert.match(adminToggle, /canCurrentParticipantManage\(event\)/);
});

test("event settings let managers choose direct payer reimbursements", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const ledgerWorkspace = await readFile(
    "src/publicLedgerWorkspaceLayer.mjs",
    "utf8"
  );
  const repaymentHandler = sourceBetween(
    app,
    "async function setEventRepaymentMode(eventId, mode)",
    "function refreshStartupSharedState(refreshRequest)"
  );

  assert.match(app, /directSettlementTransfers: true/);
  assert.match(app, /title: "חלוקת ההחזרים"/);
  assert.match(app, /title: "קיזוז חכם \(מומלץ\)"/);
  assert.match(app, /title: "החזר לפי מי ששילם"/);
  assert.match(app, /data-action="set-event-repayment-mode"/);
  assert.match(app, /setEventDirectSettlementTransfers\(state, eventId, direct\)/);
  assert.match(app, /סימוני תשלום שכבר בוצעו נשמרים/);
  assert.match(app, /לא יוצגו העברות נגדיות או כפולות/);
  assert.match(repaymentHandler, /const previousDirect = usesDirectSettlementTransfers\(event\)/);
  assert.match(repaymentHandler, /const previousTransfers = eventSettlementTransfers\(event\)/);
  assert.match(repaymentHandler, /const transferPlanChanged = settlementTransferPlanKey\(previousTransfers\)/);
  assert.ok(
    repaymentHandler.indexOf("render();") < repaymentHandler.indexOf("await persistState()"),
    "the selected repayment mode should render before waiting for cloud persistence"
  );
  assert.match(repaymentHandler, /במקרה הזה סכומי ההעברות כבר היו זהים/);
  assert.match(repaymentHandler, /const result = await persistState\(\)/);
  assert.match(
    repaymentHandler,
    /if \(eventRepaymentModeRequestVersions\.get\(eventId\) !== requestVersion\) return;/
  );
  assert.match(
    repaymentHandler,
    /if \(!result\?\.ok\) \{\s*state = setEventDirectSettlementTransfers\(/
  );
  assert.doesNotMatch(
    repaymentHandler,
    /if \(!result\?\.ok\)[\s\S]*?return;\s*}\s*render\(\);/
  );
  assert.match(
    ledgerWorkspace,
    /\.event-repayment-field \.event-management-option \{[\s\S]*?transition-property: background-color, border-color, box-shadow, color, scale/
  );
  assert.match(
    ledgerWorkspace,
    /\.event-repayment-field \.event-management-option:active:not\(:disabled\) \{[\s\S]*?scale: 0\.96/
  );
});

test("settlement exposes the active repayment mode without burying it in settings", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const ledgerStyles = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(app, /function renderSettlementRepaymentShortcut\(event\)/);
  assert.match(app, /data-action="open-event-repayment-settings"/);
  assert.match(app, /openEventDialog\(target\.dataset\.eventId, "settings-repayment", target\)/);
  assert.match(app, /aria-label="שנה את חלוקת ההחזרים\. כרגע:/);
  assert.match(ledgerStyles, /\.settlement-repayment-shortcut/);
  assert.match(ledgerStyles, /min-height: 44px !important/);
  assert.match(app, /<h2 id="settlement-transfers-title">מי מעביר למי<\/h2>/);
  assert.match(app, /המקבל עשוי להיות שונה ממי ששילם, כי קיזזנו בין כולם/);
  assert.match(app, /דני חייב למאור 50 ₪/);
  assert.match(app, /<small>\$\{canManage \? "הסבר ושינוי" : "הסבר"\}<\/small>/);
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

test("home event rows prioritize selection details, participants, and one quiet options chevron", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const row = sourceBetween(app, "function renderEventRow(event)", "function ensureNewEventDraft");
  const home = sourceBetween(app, "function renderHome()", "function renderRecentEventShortcut");

  assert.doesNotMatch(row, /event-row-attention|attentionLabel/);
  assert.match(row, /data-action="event-status-select"/);
  assert.match(row, /class="event-row-open"/);
  assert.match(row, /aria-haspopup="dialog"/);
  assert.match(row, /eventStatusMenu\?\.eventId === event\.id/);
  assert.doesNotMatch(row, /<select|<option/);
  assert.match(row, /אפשרויות לאירוע/);
  assert.match(row, /const participants = activeEventParticipants\(event\)/);
  assert.match(
    row,
    /renderAvatarStack\(participants\.map\(\(participant\) => participant\.id\), event, \{[\s\S]*?suppressParticipantAction: true[\s\S]*?\}\)/
  );
  assert.doesNotMatch(row, /event-row-balance amount|amountToPay|amountToReceive/);
  assert.doesNotMatch(row, /event-type-chip/);
  assert.match(row, /eventRowDisplayName\(event\)/);
  assert.match(row, /renderEventRowMeta\(event, participants\)/);
  assert.match(row, /event-row-options-chevron/);
  assert.doesNotMatch(row, /event-status-indicator|statusLabel/);
  assert.match(home, /showEventStatusFilter = statusCounts\.open > 0 && statusCounts\.closed > 0/);
  assert.match(home, /showEventStatusFilter\s+\? renderEventStatusFilter\(sortedEvents\)/);
  assert.match(home, /class="event-list-count \$\{eventListCountClass\}"/);
});

test("home event options expose the shared invitation flow and guarded removal", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /action === "event-status-select"/);
  assert.match(app, /function renderEventStatusMenu\(\)/);
  assert.match(app, /data-action="share-event-from-list"/);
  assert.match(app, /function openEventParticipantAddFromHomeMenu\(eventId\)/);
  assert.match(app, /kind: "participants-add",\s*returnKind: "home"/);
  assert.match(app, /renderEventParticipantAddRoutes/);
  assert.match(app, /שתף קישור או QR/);
  assert.match(app, /בחר מחברים/);
  assert.match(app, /הוסף שם ידנית/);
  assert.match(app, /data-action="remove-event-from-list"/);
  assert.match(app, /class="event-status-danger-zone"/);
  assert.match(app, /function openEventStatusMenu\(eventId, trigger\)/);
  assert.match(app, /if \(canCurrentParticipantManage\(selectedEvent\)\)/);
  assert.doesNotMatch(
    sourceBetween(app, "function renderEventStatusMenu()", "function renderImportantActionDialog"),
    /choose-event-status|renderOption\("open"|renderOption\("closed"/
  );
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
  const home = sourceBetween(app, "function renderHome()", "function renderRecentEventShortcut");
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

test("home screen keeps creation primary and exposes a secondary friends entry", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const home = sourceBetween(app, "function renderHome()", "function renderRecentEventShortcut");
  const createAction = sourceBetween(
    app,
    "function renderHomeCreateEventAction()",
    "function renderRecentEventShortcut"
  );

  assert.match(home, /class="screen font-hebrew product-home-screen\$\{sortedEvents\.length \? "" : " product-empty-home"\}"/);
  assert.match(home, /data-product-screen="home"/);
  assert.match(home, /\$\{renderHomeCreateEventAction\(\)\}/);
  assert.equal([...createAction.matchAll(/data-action="new-event"/g)].length, 1);
  assert.match(createAction, /<button class="home-quick-action is-primary home-create-event-action" data-action="new-event"/);
  assert.match(createAction, /<span class="home-quick-action-icon" aria-hidden="true">/);
  assert.match(home, /<section class="home-benefit-actions" aria-label="הטבות וחברים">/);
  assert.doesNotMatch(home, /renderHomeEventTools/);
  assert.match(home, /class="home-quick-action home-friends-action" data-action="groups" data-tab="people"/);
  assert.doesNotMatch(home, /data-action="join-event-link"/);
  assert.doesNotMatch(home, /data-action="join-existing-event"/);
  assert.doesNotMatch(home, /data-action="join-event-screen"/);
});

test("legacy join screen stays isolated while the home screen owns the current join entry", async () => {
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
  assert.match(app, /בואו נסגור חשבון/);
  assert.match(app, /בואו נסגור חשבון\?/);
  assert.match(app, /סוגרים חשבון/);
  assert.match(
    app,
    /class="secondary-button settlement-reopen-action" data-action="reopen-event"[^>]*>פתח אירוע מחדש/
  );
  assert.match(app, /data-action="share-whatsapp"/);
  assert.match(app, /settlement-screen" data-screen-kind="event" data-event-view="summary" data-event-id=/);
  assert.match(app, /https:\/\/wa\.me\/\?text=/);
  assert.match(styles, /\.whatsapp-button/);
  assert.match(styles, /\.settlement-hero/);
});

test("empty expenses and empty summary share one add-expense pattern", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const sharedEmptyState = sourceBetween(
    app,
    "function renderEventEmptyExpenseState",
    "function renderEventTypeGuide"
  );
  const settlementHero = sourceBetween(
    app,
    "function renderSettlementHero",
    "function renderFeaturedSettlementHero"
  );

  assert.match(sharedEmptyState, /event-empty-expense-state/);
  assert.match(sharedEmptyState, /renderCommandIcon\("expense"\)/);
  assert.match(sharedEmptyState, /data-action="show-expense-form"/);
  assert.match(sharedEmptyState, /canReopenFromEmptySummary/);
  assert.match(sharedEmptyState, /settlement-reopen-action/);
  assert.match(sharedEmptyState, /פתח אירוע מחדש/);
  assert.match(settlementHero, /renderEventEmptyExpenseState\(event/);
  assert.match(settlementHero, /context: "summary"/);
  assert.match(settlementHero, /eyebrow: ""/);
  assert.match(settlementHero, /title: "אין עדיין סיכום"/);
  assert.match(
    settlementHero,
    /הוסף הוצאה ראשונה כדי לראות כאן מי שילם וכמה נשאר להתחשבן/
  );
  assert.match(sharedEmptyState, /eyebrow \? `<span class="event-empty-expense-eyebrow/);
});

test("new event creation makes a one-person roster explicit", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /function newEventParticipantSelectionLabel\(participantIds\)/);
  assert.match(app, /selectedIds\.length === 1/);
  assert.match(app, /selectedIds\[0\] === state\.currentParticipantId/);
  assert.match(app, /return "רק אתה כרגע"/);
});

test("transient action menus close when the user taps elsewhere or presses Escape", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const clickHandler = sourceBetween(
    app,
    "async function handleClick(event)",
    "function closeOpenTransientMenus("
  );
  const closeMenus = sourceBetween(
    app,
    "function closeOpenTransientMenus(",
    "function goBackInApp()"
  );

  assert.match(
    clickHandler,
    /closest\?\.\(\s*"\.expense-row-actions-menu, \.settlement-more-actions, \.event-cover-actions-menu"/
  );
  assert.match(clickHandler, /closeOpenTransientMenus\(clickedTransientMenu\)/);
  assert.match(closeMenus, /\.expense-row-actions-menu\[open\]/);
  assert.match(closeMenus, /\.settlement-more-actions\[open\]/);
  assert.match(closeMenus, /\.event-cover-actions-menu\[open\]/);
  assert.match(closeMenus, /menu\.open = false/);
  assert.match(app, /function hasOpenTransientMenu\(\)/);
  assert.match(app, /function goBackInApp\(\) \{\s*if \(closeOpenTransientMenus\(\)\) return;/);
  assert.match(app, /screen\.name !== "home" \|\|\s*hasOpenTransientMenu\(\)/);
  assert.match(
    app,
    /event\.key === "Escape" && closeOpenTransientMenus\(\)/
  );
  assert.match(app, /settlementMoreActionsOpen:\s*Boolean\(/);
  assert.match(
    app,
    /if \(snapshot\.settlementMoreActionsOpen\)[\s\S]*?\.settlement-more-actions[\s\S]*?menu\.open = true/
  );
});

test("small action dialogs dismiss only when their actual backdrop is tapped", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const dismissBackdrop = sourceBetween(
    app,
    "function dismissTransientBackdrop(event)",
    "function goBackInApp()"
  );

  assert.match(dismissBackdrop, /event\.target\.matches\?\./);
  assert.match(dismissBackdrop, /\.event-status-menu-backdrop/);
  assert.match(dismissBackdrop, /\.important-action-dialog-backdrop/);
  assert.match(dismissBackdrop, /\.settlement-celebration-backdrop/);
  assert.match(dismissBackdrop, /goBackInApp\(\)/);
});

test("groups screen exposes duplicate participant merge", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(app, /mergeParticipants/);
  assert.match(app, /renderMergeParticipantsPanel/);
  assert.match(app, /data-action="merge-source"/);
  assert.match(app, /data-action="merge-target"/);
  assert.match(app, /data-action="merge-participants"/);
  assert.match(app, /function mergeParticipantSourceCandidates\(\)/);
  assert.match(app, /!participantConnectionStatus\(participant\)\.connected/);
  assert.match(app, /function syncMergeParticipantControls\(changedAction\)/);
  assert.match(app, /canMergeParticipants\(/);
  assert.match(styles, /\.merge-participants-grid/);
});

test("merge selectors update one another without rerendering the active native picker", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const sourceChange = sourceBetween(
    app,
    'if (action === "merge-source")',
    'if (action === "merge-target")'
  );
  const targetChange = sourceBetween(
    app,
    'if (action === "merge-target")',
    'if (action === "event-participant")'
  );

  assert.match(sourceChange, /syncMergeParticipantControls\("merge-source"\)/);
  assert.match(targetChange, /syncMergeParticipantControls\("merge-target"\)/);
  assert.doesNotMatch(sourceChange, /\brender\(\)/);
  assert.doesNotMatch(targetChange, /\brender\(\)/);
});

test("focused event routes reuse the shared accessibility control", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(
    app,
    /class="accessibility-entry-button accessibility-entry-header event-settings-accessibility-button"/
  );
  assert.doesNotMatch(
    app,
    /class="icon-button event-settings-accessibility-button"/
  );
});

test("expense action menus choose a safe direction above app navigation", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /app\.addEventListener\("toggle", handleTransientMenuToggle, true\)/);
  assert.match(app, /const safeBottom = Math\.min\(/);
  assert.match(app, /function positionExpenseActionsMenu\(menu\)/);
  assert.match(app, /const opensUpward = roomBelow < panelHeight && roomAbove > roomBelow;/);
  assert.match(app, /menu\.classList\.toggle\("opens-upward", opensUpward\)/);
  assert.match(app, /menu\.classList\.add\("is-viewport-positioned"\)/);
});

test("the focused expense notes dialog saves back to its event", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const dialog = sourceBetween(
    app,
    "function renderExpenseNotesDialog(event, canEdit)",
    "function expenseAvailableFriendParticipants(event)"
  );

  assert.match(
    dialog,
    /data-action="save-expense" data-event-id="\$\{escapeAttribute\(event\.id\)\}"/
  );
});
