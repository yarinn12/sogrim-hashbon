import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public Framer Motion layer loads with the public app shell", async () => {
  const index = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");

  assert.match(index, /publicFramerMotionLayer\.mjs/);
  assert.match(index, /src\/vendor\/framer-motion-dom\.js/);
  assert.match(sw, /publicFramerMotionLayer\.mjs/);
  assert.match(sw, /src\/vendor\/framer-motion-dom\.js/);
  assert.ok(
    index.indexOf("publicFramerMotionLayer.mjs") >
      index.indexOf("publicLedgerWorkspaceLayer.mjs")
  );
});

test("public Framer Motion layer adds purposeful product motion without changing content", async () => {
  const layer = await readFile("src/publicFramerMotionLayer.mjs", "utf8");

  assert.match(layer, /globalThis\.Motion/);
  assert.doesNotMatch(layer, /esm\.sh/);
  assert.match(layer, /function animateScreenChange/);
  assert.match(layer, /function animateDialogOpen/);
  assert.match(layer, /function animateNewRows/);
  assert.match(layer, /function animateNotice/);
  assert.match(layer, /opacity:\s*\[0\.55,\s*1\],[\s\S]*?y:\s*\[4,\s*0\]/);
  assert.doesNotMatch(
    layer.slice(layer.indexOf("function animateNotice"), layer.indexOf("const rememberedRowKeys")),
    /clipPath/
  );
  assert.match(layer, /\.product-home-screen \.top/);
  assert.match(layer, /opacity:\s*\[0,\s*1\]/);
  assert.match(layer, /y:\s*\[12,\s*0\]/);
  assert.match(layer, /duration:\s*0\.5/);
  assert.match(layer, /ease:\s*\[/);
  assert.match(layer, /prefers-reduced-motion: reduce/);
  assert.match(layer, /scale\(0\.96\)/);
  assert.match(layer, /font-variant-numeric: tabular-nums/);
  assert.match(layer, /transition-property:/);
  assert.doesNotMatch(layer, /transition:\s*all/);
  assert.doesNotMatch(layer, /innerHTML|insertAdjacentHTML/);
});
