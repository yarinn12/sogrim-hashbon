import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("event screen uses admin edit permissions", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /canEditEvent/);
  assert.match(app, /canManageEventSettings/);
  assert.match(app, /data-action="toggle-admin-edit"/);
  assert.match(app, /setEventAdminsCanEditOnly/);
});

test("new standalone events keep the creator as admin", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /adminIds: \[state\.currentParticipantId\]/);
  assert.match(app, /createdByParticipantId: state\.currentParticipantId/);
});

