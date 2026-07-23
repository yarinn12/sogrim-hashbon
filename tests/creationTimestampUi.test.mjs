import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("event and group surfaces show their opening date and time", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /renderOpenedAt\(group\.createdAt, group\.id\)/);
  assert.match(app, /renderOpenedAt\(event\.createdAt, event\.id\)/);
  assert.match(app, /groupSelectLabel\(group\)/);
  assert.match(app, /class="opened-at"/);
  assert.match(app, /formatRelativeCalendarDate\(date\)/);
  assert.match(app, /formatClockTime\(date\)/);
  assert.doesNotMatch(app, /second: "2-digit"/);
});

test("new groups persist a creation timestamp", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const actions = await readFile("src/domain/appActions.mjs", "utf8");

  assert.match(app, /adminId: state\.currentParticipantId,\s+createdAt: new Date\(\)\.toISOString\(\)/);
  assert.match(actions, /createdAt = new Date\(\)\.toISOString\(\)/);
  assert.match(actions, /archived: false,\s+createdAt/);
});

test("legacy records can recover their opening time from generated ids", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /match\(\/\^\[\^-\]\+-\(\\d\{13\}\)/);
  assert.match(app, /creationTimestamp\(b\.createdAt, b\.id\)/);
});
