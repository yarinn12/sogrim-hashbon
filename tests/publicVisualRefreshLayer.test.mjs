import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public visual refresh layer loads after the expense guest layer", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicVisualRefreshLayer\.mjs/);
  assert.match(
    index,
    /publicExpenseGuestLayer\.mjs\?pwa_release=372"><\/script>[\s\S]*publicVisualRefreshLayer\.mjs\?pwa_release=372"><\/script>/
  );
});

test("public visual refresh layer is retired without competing with product v1", async () => {
  const layer = await readFile("src/publicVisualRefreshLayer.mjs", "utf8");

  assert.match(layer, /cleanupLegacyVisualRefresh/);
  assert.match(layer, /public-visual-refresh-layer-style/);
  assert.match(layer, /visual-refresh-v3/);
  assert.match(layer, /visual-refresh-v6/);
  assert.match(layer, /product-context-bar/);
  assert.match(layer, /classList\.remove/);
  assert.doesNotMatch(layer, /\.app::before/);
  assert.doesNotMatch(layer, /\.primary-button::after/);
  assert.doesNotMatch(layer, /\.product-v2 \.top/);
});
