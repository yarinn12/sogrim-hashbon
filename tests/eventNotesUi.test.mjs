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
  assert.match(app, /event-notes-hero/);
  assert.match(app, /event-notes-section-label/);
  assert.match(app, /עוד אין פתקים משותפים/);
  assert.match(app, /event-note-pin-toggle/);
  assert.match(layer, /Shared event notes — approved mobile direction/);
  assert.match(layer, /\.event-notes-hero/);
  assert.match(layer, /\.event-note-row/);
  assert.match(layer, /\.event-note-editor/);
});
