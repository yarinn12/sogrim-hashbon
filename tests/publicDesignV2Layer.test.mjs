import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("design v2 loads after product v1 and before the mobile modal safeguard", async () => {
  const [index, sw] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("sw.js", "utf8")
  ]);

  assert.match(index, /publicDesignV2Layer\.mjs/);
  assert.match(index, /viewport-fit=cover/);
  assert.ok(index.indexOf("publicDesignV2Layer.mjs") > index.indexOf("publicProductV1Layer.mjs"));
  assert.ok(index.indexOf("publicDesignV2Layer.mjs") < index.indexOf("publicMobileModalLayer.mjs"));
  assert.match(sw, /publicDesignV2Layer\.mjs/);
});

test("design v2 provides one responsive consumer-finance design system", async () => {
  const layer = await readFile("src/publicDesignV2Layer.mjs", "utf8");

  assert.match(layer, /--v2-primary/);
  assert.match(layer, /--v2-warm/);
  assert.match(layer, /--v2-shadow-1/);
  assert.match(layer, /\.event-workspace-nav/);
  assert.match(layer, /\.event-command-grid \{\s+display: grid !important/);
  assert.match(layer, /\.expense-modal/);
  assert.match(layer, /\.settlement-hero/);
  assert.match(layer, /env\(safe-area-inset-bottom\)/);
  assert.match(layer, /prefers-reduced-motion/);
  assert.doesNotMatch(layer, /transition:\s*all/);
  assert.doesNotMatch(layer, /repeating-linear-gradient/);
});
