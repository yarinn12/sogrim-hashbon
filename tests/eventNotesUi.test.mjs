import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const layer = readFileSync(
  new URL("../src/publicLedgerWorkspaceLayer.mjs", import.meta.url),
  "utf8"
);

test("shared notes are a first-class synchronized event workspace", () => {
  const clickHandler = app.match(
    /async function handleClick\(event\) \{([\s\S]*?)\n\}\n\nfunction closeOpenTransientMenus/
  )?.[1] ?? "";
  const deleteHandler = app.match(
    /async function deleteCurrentEvent\(\) \{([\s\S]*?)\n\}\n\nfunction [A-Za-z]/
  )?.[1] ?? "";

  assert.match(app, /screen\.name === "event-notes"/);
  assert.match(app, /function renderEventNotes\(event\)/);
  assert.match(app, /data-action="open-event-notes"/);
  assert.match(app, /data-action="new-event-note"/);
  assert.match(app, /data-action="open-event-note"/);
  assert.match(app, /data-action="save-event-note"/);
  assert.match(app, /forceSharedEventIds: \[eventId\]/);
  assert.match(clickHandler, /action === "open-event-notes"/);
  assert.match(clickHandler, /action === "new-event-note"/);
  assert.match(clickHandler, /action === "save-event-note"/);
  assert.doesNotMatch(deleteHandler, /event-note/);
});

test("the approved notes layout includes pinned, empty and editor states", () => {
  const emptyState = app.match(
    /function renderEventNotesEmptyState\(\) \{([\s\S]*?)\n\}/
  )?.[1] ?? "";

  assert.match(app, /event-notes-intro/);
  assert.match(app, /renderEventHeader\(event, activeEventParticipants\(event\)\)/);
  assert.match(app, /renderEventWorkspaceNav\(event, "notes"\)/);
  assert.match(app, /event-notes-section-label/);
  assert.match(app, /עוד אין פתקים משותפים/);
  assert.doesNotMatch(emptyState, /data-action="new-event-note"/);
  assert.doesNotMatch(emptyState, /כתבו את הפתק הראשון/);
  assert.match(app, /event-note-pin-toggle/);
  assert.match(layer, /Shared event notes — approved mobile direction/);
  assert.match(layer, /\.event-notes-hero/);
  assert.match(layer, /\.event-note-row/);
  assert.match(layer, /\.event-note-editor/);
  assert.match(
    layer,
    /\.event-notes-intro \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)[\s\S]*?padding: 18px 16px 16px[\s\S]*?border-radius: 16px[\s\S]*?box-shadow: 0 8px 22px rgba\(18, 58, 46, 0\.06\)/
  );
  assert.match(
    layer,
    /\.screen:is\(\[data-screen-kind="event"\], \[data-screen-kind="event-notes"\]\) :is\(\.event-workspace-expenses, \.event-workspace-summary, \.event-workspace-notes\)/
  );
  assert.match(layer, /linear-gradient\(128deg, #071b18 0%, #064b43 58%, #087b74 100%\)/);
});

test("notes reuse the exact event header action layout", () => {
  const sharedHeaderSelector =
    /\.screen:is\(\[data-screen-kind="event"\], \[data-screen-kind="event-notes"\]\)[\s\S]*?> \.top[\s\S]*?\.hero-actions\.event-header-actions/;

  assert.match(layer, sharedHeaderSelector);
  assert.match(
    layer,
    new RegExp(`${sharedHeaderSelector.source}[\\s\\S]*?flex-direction: row`)
  );
  assert.match(
    layer,
    new RegExp(`${sharedHeaderSelector.source}[\\s\\S]*?\\.secondary-button\\.event-header-utility-button[\\s\\S]*?flex: 1 1 0`)
  );
  assert.match(
    layer,
    /body #app[\s\S]*?\.screen\[data-screen-kind="event-notes"\][\s\S]*?> \.top\.event-overview-header[\s\S]*?\.hero-actions\.event-header-actions \{[\s\S]*?display: flex[\s\S]*?flex-direction: row/
  );
  assert.match(
    layer,
    /\.screen\[data-screen-kind="event-notes"\][\s\S]*?\.secondary-button\.event-header-utility-button \{[\s\S]*?flex: 1 1 0[\s\S]*?height: 54px/
  );
});
