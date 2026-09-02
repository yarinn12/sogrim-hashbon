import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

test("open shared events refresh quietly while the app remains visible", () => {
  assert.match(appSource, /const ACTIVE_EVENT_SYNC_INTERVAL_MS = 1_000;/);
  assert.match(
    appSource,
    /const BACKGROUND_ACCOUNT_SYNC_INTERVAL_MS = 15_000;/
  );
  assert.match(appSource, /window\.addEventListener\("focus", requestVisibleEventSync\);/);
  assert.match(
    appSource,
    /window\.setInterval\(requestVisibleEventSync, ACTIVE_EVENT_SYNC_INTERVAL_MS\);/
  );
  assert.match(
    appSource,
    /function requestVisibleEventSync\(\) \{[\s\S]*!VISIBLE_BACKGROUND_SYNC_SCREENS\.has\(screen\.name\)[\s\S]*expenseDraft[\s\S]*profileNameEditing[\s\S]*readSharedEventStateIfChanged\([\s\S]*observerKey: "visible-event-workspace"[\s\S]*if \(!sharedEventRead\?\.changed\) return;[\s\S]*mergeSharedEventIntoState\(state, sharedEventState, credentials\)[\s\S]*saveState\(state\);[\s\S]*render\(\);[\s\S]*\}/
  );
  assert.match(
    appSource,
    /if \(!eventId \|\| !credentials\) \{[\s\S]*?return requestResumeSync\(\{ includeSecondary: false \}\);/
  );
  assert.doesNotMatch(
    appSource.slice(
      appSource.indexOf("function requestVisibleEventSync"),
      appSource.indexOf("bootstrapApp();")
    ),
    /!credentials \|\| resumeSyncRequest/,
    "an account/profile refresh must not block canonical event polling"
  );
  assert.match(
    appSource,
    /if \(saveRevisionAtRequest !== sharedStateSaveRevision\(\)\) \{[\s\S]*?queueForcedResumeSync\(\{ includeSecondary: false \}\)/
  );
  assert.doesNotMatch(
    appSource.slice(
      appSource.indexOf("function requestVisibleEventSync"),
      appSource.indexOf("bootstrapApp();")
    ),
    /eventDialog \|\|/,
    "read-only dialogs must not freeze cross-device refreshes"
  );
});

test("background screens do not run a full membership scan every second", () => {
  const visibleStart = appSource.indexOf("function requestVisibleEventSync(");
  const visibleEnd = appSource.indexOf("\n}\n\nbootstrapApp", visibleStart);
  const visibleSource = appSource.slice(visibleStart, visibleEnd);

  assert.match(
    visibleSource,
    /now - lastBackgroundAccountSyncAt <[\s\S]*BACKGROUND_ACCOUNT_SYNC_INTERVAL_MS/
  );
  assert.match(visibleSource, /lastBackgroundAccountSyncAt = now;/);
  assert.match(
    visibleSource,
    /return requestResumeSync\(\{ includeSecondary: false \}\);/
  );
});

test("opening home forces an immediate shared state refresh", () => {
  assert.match(
    appSource,
    /if \(action === "home"\) \{[\s\S]*screen = \{ name: "home" \};[\s\S]*render\(\);[\s\S]*requestResumeSync\(\{ force: true \}\)\.catch/
  );
});
test("a received push forces the shared event to refresh before the inbox opens", () => {
  assert.match(
    appSource,
    /settle-friends:push-status[\s\S]*?requestResumeSync\(\{ force: true \}\)/
  );
  assert.match(
    appSource,
    /function requestResumeSync\(\{ force = false, includeSecondary = true \} = \{\}\)/
  );
  assert.match(
    appSource,
    /if \(!force && Date\.now\(\) - lastResumeSyncAt < RESUME_SYNC_COOLDOWN_MS\)/
  );
});

test("an iPhone returning to the foreground bypasses the polling cooldown", () => {
  assert.match(appSource, /const RESUME_SYNC_COOLDOWN_MS = 1_000;/);
  assert.match(
    appSource,
    /document\.addEventListener\("visibilitychange", \(\) => \{[\s\S]*?document\.visibilityState === "visible"[\s\S]*?requestResumeSync\(\{ force: true \}\)/
  );
});

test("a forced refresh queues one fresh read behind an in-flight request", () => {
  assert.match(
    appSource,
    /if \(resumeSyncRequest\) \{[\s\S]*?force[\s\S]*?queueForcedResumeSync\(\{ includeSecondary \}\)/
  );
  assert.match(
    appSource,
    /function queueForcedResumeSync\([\s\S]*?const activeRequest = resumeSyncRequest \?\? Promise\.resolve\(\)[\s\S]*?requestResumeSync\(\{[\s\S]*?force: true/
  );
  assert.match(
    appSource,
    /resumeSyncFollowUpPending = true[\s\S]*?if \(resumeSyncFollowUpPending\) \{[\s\S]*?queueForcedResumeSync/
  );
});

test("background sync failures stay silent in the UI but remain observable", () => {
  const resumeStart = appSource.indexOf("function requestResumeSync(");
  const resumeEnd = appSource.indexOf("function requestResumeSyncAfterPaint", resumeStart);
  const resumeSource = appSource.slice(resumeStart, resumeEnd);
  assert.match(
    resumeSource,
    /\.catch\(\(error\) => \{[\s\S]*?emitOperationDeferred\("state_load", \{ error \}\)/
  );

  const visibleStart = appSource.indexOf("function requestVisibleEventSync(");
  const visibleEnd = appSource.indexOf("bootstrapApp\(\);", visibleStart);
  const visibleSource = appSource.slice(visibleStart, visibleEnd);
  assert.match(
    visibleSource,
    /\.catch\(\(error\) => \{[\s\S]*?emitOperationDeferred\("state_load", \{ error \}\);[\s\S]*?requestResumeSync\(\{ includeSecondary: false \}\)/
  );
});

test("a remote read racing a local save is merged before an immediate retry", () => {
  assert.match(
    appSource,
    /saveRevisionAtRequest !== sharedStateSaveRevision\(\)[\s\S]*?mergeSharedStates\(sharedState, state\)[\s\S]*?saveState\(state\);[\s\S]*?render\(\);[\s\S]*?queueForcedResumeSync\(\{ includeSecondary: false \}\)/
  );
  assert.match(
    appSource,
    /const localSaveCompletedDuringRead =\s*saveRevisionAtRequest !== sharedStateSaveRevision\(\);[\s\S]*?mergeSharedEventIntoState\(state, sharedEventState, credentials\)[\s\S]*?render\(\);[\s\S]*?if \(localSaveCompletedDuringRead\)/
  );
});

test("event editing entry points render immediately while canonical refresh continues", () => {
  for (const action of ["show-expense-form", "continue-event-expense", "edit-expense"]) {
    const actionStart = appSource.indexOf(`if (action === "${action}")`);
    const nextAction = appSource.indexOf("\n  if (action ===", actionStart + 1);
    const handler = appSource.slice(actionStart, nextAction);
    assert.ok(
      handler.indexOf("startExpenseDraft(") < handler.indexOf("requestResumeSyncAfterPaint("),
      `${action} must show the expense editor before network refresh`
    );
    assert.doesNotMatch(handler, /await requestResumeSync/);
    assert.match(handler, /requestResumeSyncAfterPaint\(\{ force: true, includeSecondary: false \}\)/);
  }

  const noteStart = appSource.indexOf('if (action === "open-event-note")');
  const noteEnd = appSource.indexOf("\n  if (action ===", noteStart + 1);
  const noteHandler = appSource.slice(noteStart, noteEnd);
  assert.ok(
    noteHandler.indexOf('openEventDialogWithDetails(eventId, "note-editor"') <
      noteHandler.indexOf("requestResumeSyncAfterPaint("),
    "opening a note must show the editor before network refresh"
  );
  assert.doesNotMatch(noteHandler, /await requestResumeSync/);
  assert.match(noteHandler, /requestResumeSyncAfterPaint\(\{ force: true, includeSecondary: false \}\)/);
});

test("creating a note opens the editor before refreshing shared state", () => {
  const actionStart = appSource.indexOf('if (action === "new-event-note")');
  const nextAction = appSource.indexOf("\n  if (action ===", actionStart + 1);
  const handler = appSource.slice(actionStart, nextAction);

  assert.ok(actionStart >= 0, "new note action exists");
  assert.ok(
    handler.indexOf('openEventDialogWithDetails(eventId, "note-editor"') <
      handler.indexOf("requestResumeSyncAfterPaint("),
    "the note editor must render before network refresh"
  );
  assert.doesNotMatch(handler, /await requestResumeSync/);
  assert.match(
    handler,
    /requestResumeSyncAfterPaint\(\{ force: true, includeSecondary: false \}\)/
  );
});

test("stale editors cannot overwrite an item deleted on another device", () => {
  const noteSaveStart = appSource.indexOf("async function saveEventNoteFromDialog");
  const noteSaveEnd = appSource.indexOf("function requestEventNoteDeletion", noteSaveStart);
  const noteSave = appSource.slice(noteSaveStart, noteSaveEnd);
  assert.match(
    noteSave,
    /eventDialog\.noteId[\s\S]*?!event\.notes\?\.some\(\(note\) => note\.id === eventDialog\.noteId\)/
  );
  assert.match(noteSave, /return \{ ok: false, conflict: true \};/);

  const expenseSaveStart = appSource.indexOf("async function saveExpense");
  const expenseSaveEnd = appSource.indexOf("function publishReferralActivityAfterSave", expenseSaveStart);
  const expenseSave = appSource.slice(expenseSaveStart, expenseSaveEnd);
  assert.match(
    expenseSave,
    /expenseDraft\.id[\s\S]*?!event\.expenses\.some\(\(expense\) => expense\.id === expenseDraft\.id\)/
  );
  assert.match(expenseSave, /לא שמרנו עותק ישן מעל המחיקה/);
});

test("note save releases its dialog after an unexpected persistence rejection", () => {
  const noteSaveStart = appSource.indexOf("async function saveEventNoteFromDialog");
  const noteSaveEnd = appSource.indexOf("function requestEventNoteDeletion", noteSaveStart);
  const noteSave = appSource.slice(noteSaveStart, noteSaveEnd);
  assert.match(noteSave, /const activeDialog = eventDialog/);
  assert.match(noteSave, /try \{[\s\S]*?await completedSaveResult/);
  assert.match(noteSave, /catch \(error\) \{[\s\S]*?\{ ok: false, error \}/);
  assert.match(noteSave, /eventDialog === activeDialog[\s\S]*?activeDialog\.saving = false/);
});

test("opening the settlement screen is never blocked by a shared-state refresh", () => {
  const actionStart = appSource.indexOf('if (action === "settle")');
  const nextAction = appSource.indexOf("\n  if (action ===", actionStart + 1);
  const handler = appSource.slice(actionStart, nextAction);

  assert.ok(actionStart >= 0, "settlement action exists");
  assert.ok(
    handler.indexOf("prepareSettlement(eventId)") <
      handler.indexOf("requestResumeSyncAfterPaint("),
    "the settlement screen must render before network refresh"
  );
  assert.doesNotMatch(handler, /await requestResumeSync/);
  assert.match(handler, /screen\.name !== "settlement" \|\| screen\.eventId !== eventId/);
  assert.match(handler, /prepareEventTransfers\(syncedEvent\)/);
  assert.match(handler, /persistState\(\{ suppressRevertNotice: true \}\)/);

  const prepareStart = appSource.indexOf("function prepareSettlement(eventId)");
  const prepareEnd = appSource.indexOf("function requestCloseCurrentEvent", prepareStart);
  const prepareSource = appSource.slice(prepareStart, prepareEnd);
  assert.match(prepareSource, /persistState\(\{ suppressRevertNotice: true \}\)/);
});

test("opening event workspaces renders immediately and then forces a fresh read", () => {
  for (const action of ["open-event", "open-event-notes"]) {
    const actionStart = appSource.indexOf(`if (action === "${action}")`);
    const nextAction = appSource.indexOf("\n  if (action ===", actionStart + 1);
    const handler = appSource.slice(actionStart, nextAction);
    assert.match(
      handler,
      /render\(\);[\s\S]*?requestResumeSyncAfterPaint\(\{ force: true, includeSecondary: false \}\)/,
      `${action} must paint the screen before starting its refresh`
    );
    assert.doesNotMatch(handler, /await requestResumeSync/);
  }
});

test("foreground event refresh yields a browser paint before local or cloud sync work", () => {
  const helperStart = appSource.indexOf("function requestResumeSyncAfterPaint");
  const helperEnd = appSource.indexOf("\nfunction queueForcedResumeSync", helperStart);
  const helper = appSource.slice(helperStart, helperEnd);

  assert.ok(helperStart >= 0, "after-paint refresh helper exists");
  assert.ok(
    helper.indexOf("requestAnimationFrame") < helper.indexOf("setTimeout"),
    "the refresh waits for the next frame"
  );
  assert.ok(
    helper.indexOf("setTimeout") < helper.indexOf("requestResumeSync(options)"),
    "sync work starts in a new task after the frame can be painted"
  );
});

test("a failed older save cannot roll back a newer local action", () => {
  assert.match(
    appSource,
    /function rejectedStateSaveIsCurrent\(result, checkpoint\) \{[\s\S]*?!result\?\.pending[\s\S]*?checkpoint\?\.revision === sharedStateSaveRevision\(\)/
  );

  const guardedActions = [
    "updateEventCoverImage",
    "applyEventCurrencyChange",
    "saveOfflineParticipantName",
    "saveEventNoteFromDialog",
    "deleteEventNote",
    "mergeParticipantsInStateNow",
    "addGuestToEvent",
    "addFriendParticipantToExpense",
    "addInlinePayerGuest",
    "addInlineQuickItemGuest",
    "saveQuickExpenses",
    "restoreStateBackup",
    "closeCurrentEventNow",
    "reopenCurrentEvent",
    "toggleEventLock",
    "leaveCurrentEvent",
    "deleteCurrentEvent",
    "setEventManagementMode",
    "toggleEventParticipantAdmin",
    "setEventRoundingMode",
    "removeEventParticipant",
    "restoreEventParticipant",
    "toggleEventParticipant"
  ];

  for (const functionName of guardedActions) {
    const start = appSource.indexOf(`function ${functionName}(`);
    assert.ok(start >= 0, `${functionName} exists`);
    const nextAsync = appSource.indexOf("\nasync function ", start + 1);
    const nextSync = appSource.indexOf("\nfunction ", start + 1);
    const candidates = [nextAsync, nextSync].filter((index) => index >= 0);
    const end = candidates.length ? Math.min(...candidates) : appSource.length;
    const source = appSource.slice(start, end);
    assert.match(source, /stateSaveCheckpoint\(/, `${functionName} records its save revision`);
    assert.match(
      source,
      /rejectedStateSaveIsCurrent\(/,
      `${functionName} rejects stale rollback attempts`
    );
  }
});

test("participant and share controls open immediately while refresh continues behind them", () => {
  const participantsStart = appSource.indexOf(
    'if (action === "open-event-participants")'
  );
  const participantsEnd = appSource.indexOf(
    '\n  if (action ===',
    participantsStart + 1
  );
  const participantsHandler = appSource.slice(participantsStart, participantsEnd);
  const addStart = appSource.indexOf(
    'if (action === "open-event-participant-add")'
  );
  const addEnd = appSource.indexOf('\n  if (action ===', addStart + 1);
  const addHandler = appSource.slice(addStart, addEnd);

  assert.ok(participantsStart >= 0, "participant action exists");
  assert.ok(addStart >= 0, "share action exists");
  assert.ok(
    participantsHandler.indexOf("openEventDialog(") <
      participantsHandler.indexOf("requestResumeSync("),
    "the participant roster must render before network refresh"
  );
  assert.ok(
    addHandler.indexOf("render();") < addHandler.indexOf("requestResumeSync("),
    "the share routes must render before network refresh"
  );
  assert.doesNotMatch(participantsHandler, /await requestResumeSync/);
  assert.doesNotMatch(addHandler, /await requestResumeSync/);
  assert.match(
    appSource,
    /const DIALOG_OPEN_ACTIONS = new Set\(\[[\s\S]*?"open-event-participant-add"/
  );
});

test("event settings paint immediately and refresh permissions in the background", () => {
  const actionStart = appSource.indexOf('if (action === "open-event-settings")');
  const nextAction = appSource.indexOf("\n  if (action ===", actionStart + 1);
  const handler = appSource.slice(actionStart, nextAction);

  assert.ok(actionStart >= 0, "event settings action exists");
  assert.ok(
    handler.indexOf('openEventDialog(target.dataset.eventId, "settings", target)') <
      handler.indexOf("requestResumeSyncAfterPaint("),
    "event settings must paint before refreshing remote permissions"
  );
  assert.doesNotMatch(handler, /await requestResumeSync/);
  assert.match(
    handler,
    /requestResumeSyncAfterPaint\(\{ force: true, includeSecondary: false \}\)/
  );
});
