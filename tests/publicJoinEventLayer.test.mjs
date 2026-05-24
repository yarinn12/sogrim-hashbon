import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public join layer adds existing event entry points", async () => {
  const index = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");
  const layer = await readFile("src/publicJoinEventLayer.mjs", "utf8");

  assert.match(index, /publicJoinEventLayer\.mjs/);
  assert.match(sw, /publicJoinEventLayer\.mjs/);
  assert.match(layer, /data-public-open-join-event/);
  assert.match(layer, /data-public-join-existing-event/);
  assert.match(layer, /data-public-join-event-link/);
  assert.match(layer, /parseInviteEventId/);
  assert.match(layer, /loadSharedState/);
  assert.match(layer, /ensureNamedParticipant/);
  assert.match(layer, /\.join-event-panel/);
});
