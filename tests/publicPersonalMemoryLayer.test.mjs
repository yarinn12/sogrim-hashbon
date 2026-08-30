import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public personal memory layer is loaded after the product overlays", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicPersonalMemoryLayer\.mjs/);
  assert.match(
    index,
    /publicBrandLayer\.mjs\?pwa_release=406"><\/script>\s+<script type="module" src="\.\/src\/publicEmptyHomePolishLayer\.mjs\?pwa_release=406"><\/script>\s+<script type="module" src="\.\/src\/publicPersonalMemoryLayer\.mjs\?pwa_release=406"><\/script>/
  );
});

test("public personal memory layer scopes visible events and groups to the saved profile", async () => {
  const layer = await readFile("src/publicPersonalMemoryLayer.mjs", "utf8");

  assert.match(layer, /loadLocalProfile/);
  assert.match(layer, /STORAGE_KEY/);
  assert.match(layer, /peekClientSpaceId/);
  assert.match(layer, /stateStorageKey/);
  assert.match(layer, /\$\{STORAGE_KEY\}:\$\{spaceId\}/);
  assert.match(layer, /eventBelongsToParticipant/);
  assert.match(layer, /groupBelongsToParticipant/);
  assert.match(layer, /data-action="open-event"/);
  assert.match(layer, /data-action="edit-group"/);
  assert.match(layer, /HOME_EVENT_SEARCH_THRESHOLD/);
});
