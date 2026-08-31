import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home event rows expose one accessible share/removal menu from a chevron and long press", async () => {
  const [app, styles, ledgerStyles] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("styles.css", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(app, /const EVENT_LONG_PRESS_DELAY_MS = 560/);
  assert.match(app, /data-long-press-event="true"/);
  assert.match(app, /aria-haspopup="dialog"/);
  assert.match(app, /function handleEventLongPressStart\(event\)/);
  assert.match(app, /function handleEventLongPressMove\(event\)/);
  assert.match(app, /EVENT_LONG_PRESS_MOVE_TOLERANCE_PX/);
  assert.match(app, /function renderEventStatusMenu\(\)/);
  assert.match(app, /class="event-status-menu"/);
  assert.match(app, /role="dialog"/);
  assert.match(app, /aria-modal="true"/);
  assert.match(app, /class="event-row-options-chevron"/);
  assert.match(app, /data-action="share-event-from-list"/);
  assert.match(app, /function openEventParticipantAddFromHomeMenu\(eventId\)/);
  assert.match(app, /kind: "participants-add",\s*returnKind: "home"/);
  assert.doesNotMatch(app, /class="status-chip event-status-toggle/);
  assert.doesNotMatch(app, /renderOption\("open", "פתוח"/);
  assert.match(app, /data-action="remove-event-from-list"/);
  assert.match(app, /data-action="cancel-event-status-menu"/);
  assert.match(app, /openEventStatusMenu\(eventId, trigger\)/);
  assert.match(app, /openEventStatusMenu\(target\.dataset\.eventId, target\)/);
  assert.match(styles, /\.event-status-menu-backdrop/);
  assert.match(
    ledgerStyles,
    /@media \(max-width: 720px\) \{[\s\S]*?\.event-status-menu \{[\s\S]*?padding-block-end: max\(36px, calc\(18px \+ env\(safe-area-inset-bottom\)\)\) !important;/
  );
  assert.match(app, /class="event-home-menu-actions"/);
  assert.match(styles, /\.event-status-danger-zone/);
  assert.match(styles, /\.event-removal-option:active:not\(:disabled\)/);
});

test("the unified event menu keeps permissions and irreversible-action confirmation", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(
    app,
    /if \(canCurrentParticipantManage\(selectedEvent\)\) \{\s*requestEventDeletion\(selectedEvent\.id, target\);\s*\} else \{\s*requestEventLeave\(selectedEvent\.id, target\);/
  );
  assert.match(app, /const replacesEventMenu = Boolean\(eventStatusMenu\)/);
  assert.match(app, /importantActionReturnFocus = replacesEventMenu/);
  assert.match(app, /replaceBrowserHistoryState\(\)/);
  assert.match(app, /if \(eventStatusMenu\) \{\s*eventStatusMenu = null;\s*closeDialogWithHistory\(\)/);
  assert.match(app, /\.event-status-menu\[role="dialog"\]/);
  assert.doesNotMatch(app, /let eventRemovalMenu/);
  assert.doesNotMatch(app, /function renderEventRemovalMenu/);
  assert.match(app, /event\.key === "ContextMenu"/);
  assert.match(app, /event\.shiftKey && event\.key === "F10"/);
  assert.doesNotMatch(app, /window\.confirm/);
});
