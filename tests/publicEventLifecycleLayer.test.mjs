import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
  assert.match(layer, /function canLeaveEvent/);
  assert.match(layer, /participantHasEventMoneyHistory/);
  assert.match(layer, /function canManageEvent/);
  assert.doesNotMatch(layer, /data-lifecycle-action/);
  assert.doesNotMatch(layer, /window\.confirm/);
});
