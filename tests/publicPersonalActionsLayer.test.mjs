import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public personal actions layer loads after personal memory", async () => {
  const index = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");

  assert.match(index, /publicPersonalActionsLayer\.mjs/);
  assert.ok(
    index.indexOf("publicPersonalActionsLayer.mjs") >
      index.indexOf("publicPersonalMemoryLayer.mjs")
  );
  assert.match(sw, /publicPersonalActionsLayer\.mjs/);
});

test("public personal actions layer removes legacy home clutter and keeps invite sharing", async () => {
  const layer = await readFile("src/publicPersonalActionsLayer.mjs", "utf8");

  assert.match(layer, /\.search-panel/);
  assert.match(layer, /querySelectorAll\("\.public-personal-actions"\)/);
  assert.match(layer, /section\.remove\(\)/);
  assert.doesNotMatch(layer, /eventSection\.before\(section\)/);
  assert.match(layer, /data-public-share-invite/);
  assert.match(layer, /data-action="copy-invite"/);
  assert.match(layer, /data-action="share-invite-whatsapp"/);
  assert.match(layer, /nativeShareButton/);
  assert.match(layer, /wa\.me\/\?text=/);
});
