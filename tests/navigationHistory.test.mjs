import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("app renders a consistent back button across screens", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /function renderAppBackButton\(\)/);
  assert.match(app, /data-action="go-back"/);
  assert.match(app, /app-back-button-label/);
  assert.match(app, /\$\{renderAppBackButton\(\)\}/);
  assert.match(app, /if \(action === "go-back"\)/);
});

test("browser and Android back restore the previous app screen", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /window\.addEventListener\("popstate", handleBrowserHistoryBack\)/);
  assert.match(app, /window\.history\.scrollRestoration = "manual"/);
  assert.match(app, /window\.history\.replaceState/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /function handleBrowserHistoryBack\(event\)/);
  assert.match(app, /restoreHistoryView\(event\.state\.view\)/);
  assert.match(app, /navigationViewKey/);
  assert.match(app, /eventDialog/);
  assert.match(app, /expenseDraft/);
  assert.match(app, /settlementCloseConfirmation/);
  assert.match(app, /closingDialogReturnFocus/);
  assert.match(app, /closingDialogScrollY/);
  assert.match(app, /pendingDialogReturnFocus = closingDialogReturnFocus/);
  assert.match(app, /: pendingDialogReturnFocus/);
  assert.match(app, /: pendingDialogReturnScrollY/);
});

test("back navigation keeps the latest draft across new-event steps", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const browserBack = app.slice(
    app.indexOf("function handleBrowserHistoryBack(event)"),
    app.indexOf("function currentHistoryView()")
  );

  assert.match(app, /const NEW_EVENT_FLOW_SCREENS = new Set/);
  assert.match(browserBack, /const activeNewEventDraft/);
  assert.match(browserBack, /NEW_EVENT_FLOW_SCREENS\.has\(screen\.name\)/);
  assert.match(browserBack, /NEW_EVENT_FLOW_SCREENS\.has\(targetScreenName\)/);
  assert.match(browserBack, /if \(activeNewEventDraft\) newEventDraft = activeNewEventDraft/);
});

test("completed event creation cannot reopen a stale creation step", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const browserBack = app.slice(
    app.indexOf("function handleBrowserHistoryBack(event)"),
    app.indexOf("function currentHistoryView()")
  );
  const createEvent = app.slice(
    app.indexOf("function createEventFromDraft()"),
    app.indexOf("async function joinExistingEventFromDraft()")
  );

  assert.match(browserBack, /const leavingCompletedEventCreation/);
  assert.match(browserBack, /screen\.name === "event"/);
  assert.match(browserBack, /NEW_EVENT_FLOW_SCREENS\.has\(targetScreenName\)/);
  assert.match(browserBack, /screen = \{ name: "home" \}/);
  assert.match(browserBack, /replaceBrowserHistoryState\(\)/);
  assert.match(createEvent, /appHistoryDepth = 0/);
  assert.match(createEvent, /lastNavigationViewKey = ""/);
});

test("back and Escape dismiss settlement close confirmation before leaving", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const goBack = app.slice(
    app.indexOf("function goBackInApp()"),
    app.indexOf("function renderHistoryFallback()")
  );
  const keydown = app.slice(
    app.indexOf("function handleDialogKeydown(event)"),
    app.indexOf("function eventParticipants")
  );

  assert.match(goBack, /if \(settlementCloseConfirmation\)/);
  assert.match(goBack, /settlementCloseConfirmation = null;\s+renderHistoryFallback\(\)/);
  assert.match(keydown, /event\.key === "Escape" && settlementCloseConfirmation/);
  assert.match(keydown, /goBackInApp\(\)/);
});

test("app back button returns synchronously without waiting on browser history", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const goBack = app.slice(
    app.indexOf("function goBackInApp()"),
    app.indexOf("function renderHistoryFallback()")
  );

  assert.match(goBack, /screen\.name === "join-event"/);
  assert.doesNotMatch(
    goBack.match(/if \(screen\.name === "join-event"\) \{[\s\S]*?\n  \}/)?.[0] ?? "",
    /joinEventDraft = null/
  );
  assert.match(goBack, /renderHistoryFallback\(\)/);
  assert.doesNotMatch(goBack.split("if \\(eventDialog")[0] ?? "", /window\.history\.back/);
});

test("app back rewinds the matching browser history entry", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const fallback = app.slice(
    app.indexOf("function renderHistoryFallback()"),
    app.indexOf("function handleInput(event)")
  );

  assert.match(fallback, /appHistoryDepth > 0/);
  assert.match(fallback, /appHistoryDepth = Math\.max\(0, appHistoryDepth - 1\)/);
  assert.match(fallback, /window\.history\.back\(\)/);
  assert.match(fallback, /return;\s+}\s+replaceBrowserHistoryState\(\)/);
});

test("leaving an invite event clears the deep-link route before returning home", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /function clearInviteRouteFromAddress\(\)/);
  assert.match(app, /url\.searchParams\.delete\("event"\)/);
  assert.match(app, /if \(clearedInviteRoute\) appHistoryDepth = 0/);
  assert.match(app, /if \(action === "home"\) \{[\s\S]*?clearInviteRouteFromAddress\(\)/);
  assert.match(
    app,
    /if \(screen\.name !== "home"\) \{[\s\S]*?clearInviteRouteFromAddress\(\)/
  );
});

test("screen navigation resets scroll without disturbing dialogs on the same screen", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /let lastRenderedScreenKey = ""/);
  assert.match(app, /function commitRenderedScreen\(html\)/);
  assert.match(app, /const nextScreenKey = `\$\{screen\.name\}:\$\{screen\.eventId \?\? ""\}`/);
  assert.match(app, /const screenChanged = nextScreenKey !== lastRenderedScreenKey/);
  assert.match(app, /if \(!screenChanged\) return/);
  assert.match(app, /window\.scrollTo\?\.\(0, 0\)/);
  assert.match(app, /document\.documentElement\.scrollTop = 0/);
  assert.match(app, /document\.body\.scrollTop = 0/);
});

test("closing a dialog restores the exact action that opened it", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /openEventDialog\(target\.dataset\.eventId, "participants", target\)/);
  assert.match(app, /startExpenseDraft\(target\.dataset\.eventId, null, target\)/);
  assert.match(app, /function closeDialogWithHistory\(\)/);
  assert.match(app, /deactivateDialog\(\{ deferFocus \}\)/);
  assert.match(app, /if \(!deferFocus\) window\.setTimeout\(restorePendingDialogReturnFocus, 120\)/);
});

test("closing an expense keeps its draft and template rerenders keep focus", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const applyTemplate = app.slice(
    app.indexOf("function applyExpenseTemplate(template)"),
    app.indexOf("function nextExpensePayerId")
  );

  assert.match(app, /if \(action === "cancel-expense"\) \{\s+rememberExpenseDraft\(\)/);
  assert.match(applyTemplate, /activateDialog\("\.expense-modal"\)/);
  assert.match(applyTemplate, /requestAnimationFrame/);
  assert.match(applyTemplate, /\.focus\(\{ preventScroll: true \}\)/);
});
