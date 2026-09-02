import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("important actions use one accessible in-app confirmation dialog", async () => {
  const [app, styles] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("styles.css", "utf8")
  ]);

  assert.match(app, /function renderImportantActionDialog\(\)/);
  assert.match(app, /role="alertdialog"/);
  assert.match(app, /aria-modal="true"/);
  assert.match(app, /aria-describedby="important-action-description"/);
  assert.match(app, /data-action="cancel-important-action"/);
  assert.match(app, /data-action="confirm-important-action"/);
  assert.ok(
    app.indexOf('data-action="cancel-important-action"') <
      app.indexOf('data-action="confirm-important-action"')
  );
  assert.match(app, /querySelector\('\[data-action="cancel-important-action"\]'\)/);
  assert.match(styles, /\.important-action-dialog-backdrop/);
  assert.match(styles, /\.important-action-dialog:focus-visible/);
  assert.match(styles, /\.important-action-confirm-button:focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("every irreversible product action is routed through confirmation", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  for (const kind of [
    "reset-application",
    "archive-group",
    "remove-participant",
    "remove-event-participant",
    "merge-participants",
    "delete-expense",
    "leave-event",
    "delete-event",
    "restore-backup"
  ]) {
    assert.match(app, new RegExp(`kind: "${kind}"`));
  }

  assert.match(app, /requestGroupArchive\(target\.dataset\.groupId, target\)/);
  assert.match(app, /requestExpenseDeletion\(target\.dataset\.eventId, target\.dataset\.expenseId, target\)/);
  assert.match(app, /requestParticipantMerge\(target\)/);
  assert.match(app, /executeImportantAction\(pendingAction\)/);
  assert.doesNotMatch(app, /window\.confirm/);
});

test("confirmation supports app back, browser back, Escape and focus restoration", async () => {
  const [app, workspace] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(app, /if \(importantActionDialog\) \{\s*closeImportantActionDialog\(\)/);
  assert.match(app, /importantActionDialog: importantActionDialog/);
  assert.match(app, /\.important-action-dialog\[role="alertdialog"\]/);
  assert.match(app, /if \(event\.key === "Escape"\)/);
  assert.match(app, /restoreActionFocus\(returnFocus\)/);
  assert.match(app, /pendingConfirmedEventDialog = cloneNavigationValue\(eventDialog\)/);
  assert.match(app, /if \(pendingConfirmedEventDialog\)/);
  assert.match(
    app,
    /if \(eventDialog\?\.eventId === confirmedDialog\.eventId\)[\s\S]*?shouldReplaceConfirmedDialogHistory = true/
  );
  assert.match(
    app,
    /if \(shouldReplaceConfirmedDialogHistory\) \{\s*replaceBrowserHistoryState\(\)/
  );
  assert.match(app, /groupId: element\.dataset\.groupId/);
  assert.match(app, /participantId: element\.dataset\.participantId/);
  assert.match(
    app,
    /const underlyingDialogSelector = expenseDraft[\s\S]*?if \(underlyingDialogSelector && app\.querySelector\(underlyingDialogSelector\)\) \{\s*activateDialog\(underlyingDialogSelector\)/
  );
  assert.match(
    workspace,
    /\.important-action-dialog \{[\s\S]*?overflow-x: hidden !important;[\s\S]*?overflow-y: auto !important;[\s\S]*?overscroll-behavior: contain !important/
  );
});

test("an unexpected confirmed-action failure always releases the blocking dialog", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const start = app.indexOf("async function confirmImportantAction()");
  const end = app.indexOf("async function executeImportantAction", start);
  const confirmation = app.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(confirmation, /catch \(error\)/);
  assert.match(confirmation, /emitOperationFailure\("important_action"/);
  assert.match(confirmation, /schedulePendingMutationRecovery\(\{ resetBackoff: true \}\)/);
  assert.match(
    confirmation,
    /finally \{[\s\S]*?restoringBrowserHistory = false;[\s\S]*?render\(\);[\s\S]*?\}/
  );
});

test("event deletion is optimistic, cloud-confirmed and recoverable on a hard failure", async () => {
  const [app, coherence] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicDesignCoherenceLayer.mjs", "utf8")
  ]);
  const start = app.indexOf("async function deleteCurrentEvent");
  const end = app.indexOf("async function markTransferPaid", start);
  const deletion = app.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(deletion, /const previousState = state/);
  assert.match(
    deletion,
    /render\(\);[\s\S]*?stateSaveCheckpoint\([\s\S]*?saveSharedState\(state, \{ awaitCloud: true \}\)[\s\S]*?await saveCheckpoint\.request/
  );
  assert.match(deletion, /if \(!result\?\.ok && !result\?\.pending\)/);
  assert.match(deletion, /rejectedStateSaveIsCurrent\(result, saveCheckpoint\)/);
  assert.match(deletion, /state = previousState/);
  assert.match(app, /await deleteCurrentEvent\(action\.payload\.eventId\)/);
  assert.match(app, /label: "מחיקת אירוע"[\s\S]*?metrics:/);
  assert.match(coherence, /\.event-danger-zone-heading/);
  assert.match(coherence, /data-important-action-kind="delete-event"/);
});
