import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

test("public event lifecycle layer is loaded after the app helpers", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicEventLifecycleLayer\.mjs/);
  assert.ok(
    index.indexOf("publicEventLifecycleLayer.mjs") >
      index.indexOf("publicJoinEventLayer.mjs")
  );
});

test("public event lifecycle layer exposes leave and delete actions safely", async () => {
  const layer = await readFile("src/publicEventLifecycleLayer.mjs", "utf8");

  assert.match(layer, /data-action="leave-event"/);
  assert.match(layer, /data-action="delete-event"/);
  assert.match(layer, /import \{ canLeaveEvent \} from "\.\/domain\/appActions\.mjs"/);
  assert.match(layer, /import \{ canManageEventSettings \} from "\.\/domain\/permissions\.mjs"/);
  assert.match(layer, /canLeaveEvent\(state, event\.id, state\.currentParticipantId\)/);
  assert.match(layer, /canManageEventSettings\(/);
  assert.doesNotMatch(layer, /function canLeaveEvent/);
  assert.doesNotMatch(layer, /participantHasEventMoneyHistory/);
  assert.doesNotMatch(layer, /function eventManagerIds/);
  assert.doesNotMatch(layer, /data-lifecycle-action/);
  assert.doesNotMatch(layer, /window\.confirm/);
});

test("public UI layers do not reimplement participant or event permission rules", async () => {
  const sourceFiles = (await readdir("src"))
    .filter((fileName) => /^public.*Layer\.mjs$/.test(fileName));
  const sources = await Promise.all(
    sourceFiles.map(async (fileName) => ({
      fileName,
      source: await readFile(`src/${fileName}`, "utf8")
    }))
  );

  for (const { fileName, source } of sources) {
    assert.doesNotMatch(
      source,
      /function\s+(?:canLeaveEvent|canManageEvent|canEditEvent|canAddEventParticipant|participantHasEventMoneyHistory|participantHasMoneyHistory|removeParticipantFromEvent|removeParticipantFromGroup)\s*\(/,
      `${fileName} must call the canonical domain actions and permissions instead of copying them`
    );
  }
});
