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
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /if \(importantActionDialog\) \{\s*closeImportantActionDialog\(\)/);
  assert.match(app, /importantActionDialog: importantActionDialog/);
  assert.match(app, /\.important-action-dialog\[role="alertdialog"\]/);
  assert.match(app, /if \(event\.key === "Escape"\)/);
  assert.match(app, /restoreActionFocus\(returnFocus\)/);
  assert.match(app, /groupId: element\.dataset\.groupId/);
  assert.match(app, /participantId: element\.dataset\.participantId/);
});
