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
  assert.match(app, /group-editor-disclosure/);
  assert.match(app, /group-editor-offline-add/);
  assert.match(app, /saveEditedGroup\(\)/);
});

test("groups screen exposes removal for saved participant names", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /renderKnownParticipantsPanel/);
  assert.match(app, /data-action="remove-participant"/);
  assert.match(app, /requestParticipantRemoval\(target\.dataset\.participantId, target\)/);
  assert.match(app, /kind: "remove-participant"/);
  assert.match(app, /canRemoveParticipant/);
});

test("new groups start blank and become saveable only after a real name", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const groupsStart = app.indexOf("function renderGroupCreate()");
  const groupsEnd = app.indexOf("function renderGroupEdit()", groupsStart);
  const groups = app.slice(groupsStart, groupsEnd);

  assert.match(groups, /name: ""/);
  assert.match(groups, /group-create-panel/);
  assert.match(groups, /placeholder="[^"]+"/);
  assert.match(groups, /group-editor-offline-add/);
  assert.match(groups, /!groupDraft\.name\.trim\(\) \|\| groupDraft\.memberIds\.length === 0/);
  assert.match(app, /function syncCreateGroupButton\(\)/);
  assert.match(app, /name: groupName/);
});

test("groups overview keeps creation and people management in separate focused screens", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const overviewStart = app.indexOf("function renderGroups()");
  const overviewEnd = app.indexOf("function renderGroupCreate()", overviewStart);
  const overview = app.slice(overviewStart, overviewEnd);

  assert.match(overview, /data-action="new-group"/);
  assert.match(overview, /data-action="manage-people"/);
  assert.doesNotMatch(overview, /data-action="group-name"/);
  assert.match(app, /data-screen-kind="group-create"/);
  assert.match(app, /data-screen-kind="group-edit"/);
  assert.match(app, /data-screen-kind="people"/);
});

test("groups prevent an indistinguishable duplicate and expose existing collisions", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /findMatchingActiveGroup\(state\.groups, candidateGroup\)/);
  assert.match(app, /לכן לא יצרנו עותק נוסף/);
  assert.match(app, /renderGroupOpenedAt\(group, Boolean\(matchingGroup\)\)/);
  assert.match(app, /formatPreciseClockTime\(date\)/);
  assert.match(app, /קבוצה זהה נוספת/);
});
