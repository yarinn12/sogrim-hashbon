import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home screen exposes backup export and restore controls", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /serializeStateBackup/);
  assert.match(app, /parseStateBackup/);
  assert.match(app, /data-action="export-state"/);
  assert.match(app, /data-action="import-state-file"/);
  assert.match(app, /exportStateBackup\(\)/);
  assert.match(app, /importStateBackup\(target\.files\[0\]\)/);
});
