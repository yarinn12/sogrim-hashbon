import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("profile screen exposes backup export and restore controls", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const profile = app.match(/function renderProfileSetup\(\) \{[\s\S]*?\nfunction renderInviteProfilePreview/);

  assert.ok(profile);
  assert.match(profile[0], /isEditingProfile \? renderBackupPanel\(\) : ""/);
  assert.match(app, /serializeStateBackup/);
  assert.match(app, /parseStateBackup/);
  assert.match(app, /data-action="export-state"/);
  assert.match(app, /data-action="import-state-file"/);
  assert.match(app, /exportStateBackup\(\)/);
  assert.match(app, /importStateBackup\(target\.files\[0\], target\)/);
  assert.match(app, /kind: "restore-backup"/);
  assert.match(app, /restoreStateBackup\(action\.payload\.restoredState\)/);
});
