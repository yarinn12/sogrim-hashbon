import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public empty home polish layer loads after the brand layer", async () => {
  const index = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");

  assert.match(index, /publicEmptyHomePolishLayer\.mjs/);
  assert.ok(
    index.indexOf("publicEmptyHomePolishLayer.mjs") >
      index.indexOf("publicBrandLayer.mjs")
  );
  assert.match(sw, /publicEmptyHomePolishLayer\.mjs/);
});

test("public empty home polish layer keeps the first screen focused", async () => {
  const layer = await readFile("src/publicEmptyHomePolishLayer.mjs", "utf8");

  assert.match(layer, /product-empty-home/);
  assert.match(layer, /data-action="new-event"/);
  assert.match(layer, /event-row/);
  assert.match(layer, /recent-event-shortcut/);
  assert.match(layer, /grid-template-columns: 1fr 1fr/);
  assert.match(layer, /public-empty-home-polish-layer-style/);
});
