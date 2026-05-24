import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public back navigation layer is loaded after personal memory", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicBackNavigationLayer\.mjs/);
  assert.match(
    index,
    /publicPersonalMemoryLayer\.mjs"><\/script>\s+<script type="module" src="\.\/src\/publicBackNavigationLayer\.mjs"><\/script>/
  );
});

test("public back navigation layer adds app back and browser back behavior", async () => {
  const layer = await readFile("src/publicBackNavigationLayer.mjs", "utf8");

  assert.match(layer, /HISTORY_STATE_KEY/);
  assert.match(layer, /data-public-action="app-back"/);
  assert.match(layer, /aria-label", "חזור"/);
  assert.match(layer, /window\.addEventListener\("popstate", handleBrowserBack\)/);
  assert.match(layer, /window\.history\.pushState/);
  assert.match(layer, /window\.history\.replaceState/);
  assert.match(layer, /restoreScreen\(event\.state\.key\)/);
  assert.match(layer, /closeOpenWindow/);
});

test("public back navigation intercepts native app back before it can hang", async () => {
  const layer = await readFile("src/publicBackNavigationLayer.mjs", "utf8");

  assert.match(layer, /document\.addEventListener\("click", handleNativeBackClick, true\)/);
  assert.match(layer, /event\.stopImmediatePropagation\(\)/);
  assert.match(layer, /goBackWithoutHistoryRoundTrip/);
  assert.match(layer, /clickSyntheticAction\("home"\)/);
});
