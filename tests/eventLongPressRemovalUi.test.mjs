import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home event rows expose an accessible long-press removal menu", async () => {
  const [app, styles] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("styles.css", "utf8")
  ]);

  assert.match(app, /const EVENT_LONG_PRESS_DELAY_MS = 560/);
  assert.match(app, /data-long-press-event="true"/);
  assert.match(app, /aria-haspopup="dialog"/);
  assert.match(app, /function handleEventLongPressStart\(event\)/);
  assert.match(app, /function handleEventLongPressMove\(event\)/);
  assert.match(app, /EVENT_LONG_PRESS_MOVE_TOLERANCE_PX/);
  assert.match(app, /function renderEventRemovalMenu\(\)/);
  assert.match(app, /class="event-removal-menu"/);
  assert.match(app, /role="dialog"/);
  assert.match(app, /aria-modal="true"/);
  assert.match(app, /data-action="remove-event-from-list"/);
  assert.match(app, /data-action="cancel-event-removal-menu"/);
  assert.match(styles, /\.event-removal-menu-backdrop/);
  assert.match(styles, /\.event-removal-option:active:not\(:disabled\)/);
});

test("long-press removal reuses permission checks and irreversible-action confirmation", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(
    app,
    /if \(canCurrentParticipantManage\(selectedEvent\)\) \{\s*requestEventDeletion\(selectedEvent\.id, target\);\s*\} else \{\s*requestEventLeave\(selectedEvent\.id, target\);/
  );
  assert.match(app, /const replacesEventRemovalMenu = Boolean\(eventRemovalMenu\)/);
  assert.match(app, /importantActionReturnFocus = replacesEventRemovalMenu/);
  assert.match(app, /replaceBrowserHistoryState\(\)/);
  assert.match(app, /if \(eventRemovalMenu\) \{\s*eventRemovalMenu = null;\s*closeDialogWithHistory\(\)/);
  assert.match(app, /\.event-removal-menu\[role="dialog"\]/);
  assert.match(app, /event\.key === "ContextMenu"/);
  assert.match(app, /event\.shiftKey && event\.key === "F10"/);
  assert.doesNotMatch(app, /window\.confirm/);
});
