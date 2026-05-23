import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("groups screen exposes edit controls for permanent groups", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /updateGroup/);
  assert.match(app, /editingGroupDraft/);
  assert.match(app, /data-action="edit-group"/);
  assert.match(app, /data-action="save-edit-group"/);
  assert.match(app, /data-action="cancel-edit-group"/);
  assert.match(app, /renderParticipantChecks\(editingGroupDraft\.adminIds, "edit-group-admin"\)/);
  assert.match(app, /saveEditedGroup\(\)/);
});
