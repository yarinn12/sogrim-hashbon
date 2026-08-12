import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("src/app.mjs", "utf8");
const homeButtonLayer = readFileSync("src/publicHomeButtonLayer.mjs", "utf8");
const mobileModalLayer = readFileSync("src/publicMobileModalLayer.mjs", "utf8");

function slice(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(start > -1, `expected to find ${from}`);
  return source.slice(start, end > -1 ? end : undefined);
}

test("back unwinds one dialog layer at a time in priority order", () => {
  const back = slice(app, "function goBackInApp()", "function renderHistoryFallback");
  const order = [
    "importantActionDialog",
    "settlementCelebration",
    "eventStatusMenu",
    "settlementCloseConfirmation",
    'eventDialog?.kind?.startsWith("settings-")'
  ];

  let cursor = -1;
  for (const layer of order) {
    const next = back.indexOf(layer);
    assert.ok(next > cursor, `${layer} must be unwound before the generic dialog close`);
    cursor = next;
  }
  assert.ok(
    cursor < back.indexOf("if (eventDialog || expenseDraft)"),
    "specific dialogs close before the generic branch"
  );
});

test("focused group screens return to the groups overview without using dialog teardown", () => {
  const back = slice(app, "function goBackInApp()", "function renderHistoryFallback");

  assert.match(back, /\["group-create", "group-edit", "people"\]\.includes\(screen\.name\)/);
  assert.match(
    back,
    /name: "groups",\s*tab: screen\.name === "people" \? "people" : "groups"/
  );
  assert.doesNotMatch(back, /eventDialog \|\| expenseDraft \|\| editingGroupDraft/);
});

test("a settings subscreen steps back to the settings menu, not out of the event", () => {
  const back = slice(app, "function goBackInApp()", "function renderHistoryFallback");

  assert.match(
    back,
    /eventDialog = \{\s*eventId: eventDialog\.eventId,\s*kind: "settings",\s*historyBaseDepth: eventDialog\.historyBaseDepth\s*\};/,
    "back returns to the settings root instead of closing the modal"
  );
  assert.match(
    back,
    /reactivateDialogAfterRender\(\s*"\.event-modal",\s*eventSettingsSectionFocusSelector\(settingsSection\)/
  );
  assert.match(back, /pendingSettingsReturnFocusSection = settingsSection/);
});

test("Escape routes through the same unwind path as the back control", () => {
  const keydown = slice(app, "function handleDialogKeydown(event)", "function eventParticipants");

  assert.match(keydown, /if \(event\.key === "Escape" && settlementCloseConfirmation\)/);
  assert.match(keydown, /if \(event\.key === "Escape"\) \{\s*\n\s*event\.preventDefault\(\);\s*\n\s*goBackInApp\(\);/);
  assert.match(
    keydown,
    /\.important-action-dialog\[role="alertdialog"\], \.settlement-celebration-dialog\[role="dialog"\], \.event-status-menu\[role="dialog"\], \.expense-modal\[role="dialog"\], \.event-modal\[role="dialog"\]/,
    "every modal kind is escapable"
  );
});

test("Tab is trapped inside the active dialog in both directions", () => {
  const keydown = slice(app, "function handleDialogKeydown(event)", "function eventParticipants");

  assert.match(keydown, /if \(event\.shiftKey && document\.activeElement === first\)/);
  assert.match(keydown, /else if \(!event\.shiftKey && document\.activeElement === last\)/);
  assert.match(
    keydown,
    /\.filter\(\(element\) => element\.offsetParent !== null\)/,
    "hidden controls are excluded from the trap"
  );
  assert.match(keydown, /textarea:not\(\[disabled\]\), summary, \[tabindex\]/);
});

test("browser back restores the dialog that was open and its return focus", () => {
  const popstate = slice(app, "function handleBrowserHistoryBack(event)", "function currentHistoryView");

  assert.match(popstate, /if \(expenseDraft\) \{\s*\n\s*activateDialog\("\.expense-modal"\);/);
  assert.match(
    popstate,
    /\} else if \(eventDialog\) \{\s*const focusSelector = historyEventDialogFocusSelector\([\s\S]*?activateDialog\(\s*"\.event-modal",\s*focusSelector/
  );
  assert.match(popstate, /\} else if \(eventStatusMenu\) \{\s*\n\s*activateDialog\("\.event-status-menu"\);/);
  assert.match(popstate, /\} else if \(settlementCelebration\) \{\s*\n\s*activateDialog\("\.settlement-celebration-dialog"\);/);
  assert.match(popstate, /restorePendingDialogReturnFocus/);
  assert.match(popstate, /clearDialogBackgroundInert\(\)/);
});

test("app history leaves independent picker and account dialogs to their owners", () => {
  const popstate = slice(app, "function handleBrowserHistoryBack(event)", "function currentHistoryView");

  assert.match(popstate, /if \(hasIndependentHistoryDialog\(\)\) return/);
  assert.match(popstate, /\.app-choice-picker-backdrop/);
  assert.match(popstate, /\[data-account-delete-dialog\]/);
  assert.match(popstate, /\.install-app-backdrop/);
});

test("browser back from a settings subsection restores focus to its card", () => {
  const popstate = slice(app, "function handleBrowserHistoryBack(event)", "function currentHistoryView");

  assert.match(popstate, /const previousEventDialog = cloneNavigationValue\(eventDialog\)/);
  assert.match(popstate, /function historyEventDialogFocusSelector/);
  assert.match(
    popstate,
    /data-action="open-event-settings-section"\]\[data-settings-section/
  );
});

test("closing a dialog via browser back restores the prior scroll position", () => {
  const popstate = slice(app, "function handleBrowserHistoryBack(event)", "function currentHistoryView");

  assert.match(popstate, /requestAnimationFrame\(\(\) => window\.scrollTo\(0, closingDialogScrollY\)\)/);
});

test("browser back out of a finished event creation lands on home, not the wizard", () => {
  const popstate = slice(app, "function handleBrowserHistoryBack(event)", "function currentHistoryView");

  assert.match(popstate, /const leavingCompletedEventCreation =/);
  assert.match(popstate, /NEW_EVENT_FLOW_SCREENS\.has\(targetScreenName\) &&\s*\n\s*!newEventDraft;/);
  assert.match(popstate, /screen = \{ name: "home" \};/);
});

test("the global route controls are inert and hidden from AT while a modal or mobile participant task is open", () => {
  assert.match(
    homeButtonLayer,
    /const modalDialogOpen = Boolean\([\s\S]*?\[role="dialog"\]\[aria-modal="true"\][\s\S]*?\);/
  );
  assert.match(homeButtonLayer, /const participantTaskOpen = Boolean\(/);
  assert.match(homeButtonLayer, /const dialogOpen = modalDialogOpen \|\| participantTaskOpen;/);
  assert.match(homeButtonLayer, /controls\.inert = dialogOpen;/);
  assert.match(
    homeButtonLayer,
    /if \(dialogOpen\) \{\s*\n\s*controls\.setAttribute\("aria-hidden", "true"\);/
  );
});

test("no home button is ever injected inside a dialog", () => {
  const sync = slice(homeButtonLayer, "function syncDialogRouteControls(screen)", "function createHomeButton");

  assert.match(
    sync,
    /\.querySelectorAll\(`\.modal-home-button, \[data-public-action="\$\{HOME_ACTION\}"\]`\)\s*\n\s*\.forEach\(\(button\) => button\.remove\(\)\)/
  );
});

test("duplicate route control containers are pruned to a single instance", () => {
  assert.match(
    homeButtonLayer,
    /screen\.querySelectorAll\("\.product-route-controls"\)\.forEach\(\(candidate\) => \{\s*\n\s*if \(candidate !== controls\) candidate\.remove\(\);/
  );
});

test("opening a dialog records the trigger so focus can return to it", () => {
  const open = slice(app, "function openEventDialog(eventId, kind, trigger = document.activeElement)", "function handleEventLongPressStart");

  assert.match(open, /rememberDialogReturnFocus\(trigger\)/);
  assert.match(open, /historyBaseDepth: Number\.isFinite\(eventDialog\?\.historyBaseDepth\)/);
  assert.match(open, /: appHistoryDepth/);
  assert.match(open, /activateDialog\("\.event-modal"\)/);
});

test("closing a nested event dialog unwinds every history entry created by that dialog", () => {
  const closeAction = slice(
    app,
    'if (action === "close-event-dialog")',
    'if (action === "copy-invite")'
  );
  const closeDialog = slice(
    app,
    "function closeDialogWithHistory(rewindSteps = 1)",
    "function handleInput(event)"
  );
  const fallback = slice(
    app,
    "function renderHistoryFallback(rewindSteps = 1)",
    "function clearInviteRouteFromAddress"
  );

  assert.match(closeAction, /appHistoryDepth - historyBaseDepth/);
  assert.match(closeAction, /closeDialogWithHistory\(rewindSteps\)/);
  assert.match(closeDialog, /renderHistoryFallback\(historyDistance\)/);
  assert.match(fallback, /window\.history\.go\(-historyDistance\)/);
  assert.match(fallback, /appHistoryDepth - historyDistance/);
});

test("mobile modals go full screen and lock background scrolling", () => {
  assert.match(mobileModalLayer, /body\.app-dialog-open \{\s*\n\s*overflow: hidden !important;/);
  assert.match(mobileModalLayer, /overscroll-behavior: none !important;/);
  assert.match(
    mobileModalLayer,
    /body\.app-dialog-open #app \[data-app-dialog-inert\] \{\s*\n\s*pointer-events: none !important;/
  );
  assert.match(mobileModalLayer, /height: 100dvh !important;/);
});

test("the dialog-open body class is cleared when no dialog remains", () => {
  const render = slice(app, "function render()", "function commitRenderedScreen");

  assert.match(
    render,
    /!eventDialog &&\s*!expenseDraft &&\s*!importantActionDialog &&\s*!eventStatusMenu &&\s*!settlementCelebration\s*\) \{\s*document\.body\.classList\.remove\("app-dialog-open"\);/
  );
});

test("history navigation keys stay stable so back does not desync", () => {
  assert.match(app, /const APP_HISTORY_STATE_KEY = "settleFriendsAppHistory";/);
  assert.match(app, /if \(!event\.state\?\.\[APP_HISTORY_STATE_KEY\]\) return;/);
  const dialogActions = slice(app, "const DIALOG_OPEN_ACTIONS", "]);");
  for (const action of [
    "show-expense-form",
    "edit-expense",
    "open-event-participants",
    "open-event-share",
    "open-event-settings"
  ]) {
    assert.match(dialogActions, new RegExp(`"${action}"`));
  }
});
