import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

test("open shared events refresh quietly while the app remains visible", () => {
  assert.match(appSource, /const ACTIVE_EVENT_SYNC_INTERVAL_MS = 3_000;/);
  assert.match(appSource, /window\.addEventListener\("focus", requestVisibleEventSync\);/);
  assert.match(
    appSource,
    /window\.setInterval\(requestVisibleEventSync, ACTIVE_EVENT_SYNC_INTERVAL_MS\);/
  );
  assert.match(
    appSource,
    /function requestVisibleEventSync\(\) \{[\s\S]*!VISIBLE_BACKGROUND_SYNC_SCREENS\.has\(screen\.name\)[\s\S]*expenseDraft[\s\S]*profileNameEditing[\s\S]*return requestResumeSync\(\{ includeSecondary: false \}\);[\s\S]*\}/
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

test("a remote read discarded after a local save is immediately retried", () => {
  assert.match(
    appSource,
    /saveRevisionAtRequest !== sharedStateSaveRevision\(\)[\s\S]*?queueForcedResumeSync\(\{ includeSecondary: false \}\)/
  );
});

test("event entry points read the canonical event before editing or settling", () => {
  for (const action of [
    "new-event-note",
    "open-event-note",
    "settle",
    "show-expense-form",
    "continue-event-expense",
    "edit-expense"
  ]) {
    const actionStart = appSource.indexOf(`if (action === "${action}")`);
    const nextAction = appSource.indexOf("\n  if (action ===", actionStart + 1);
    const handler = appSource.slice(actionStart, nextAction);
    assert.match(
      handler,
      /await requestResumeSync\(\{ force: true, includeSecondary: false \}\)/,
      `${action} must refresh the canonical shared event first`
    );
  }
});

test("opening event workspaces renders immediately and then forces a fresh read", () => {
  for (const action of ["open-event", "open-event-notes"]) {
    const actionStart = appSource.indexOf(`if (action === "${action}")`);
    const nextAction = appSource.indexOf("\n  if (action ===", actionStart + 1);
    const handler = appSource.slice(actionStart, nextAction);
    assert.match(
      handler,
      /render\(\);[\s\S]*?await requestResumeSync\(\{ force: true, includeSecondary: false \}\)/,
      `${action} must show the screen without delay and refresh it immediately`
    );
  }
});
