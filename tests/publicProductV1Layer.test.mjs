import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("product v1 layer loads after the legacy visual layers", async () => {
  const index = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");

  assert.match(index, /publicProductV1Layer\.mjs/);
  assert.ok(
    index.indexOf("publicProductV1Layer.mjs") >
      index.indexOf("publicFintechDesignLayer.mjs")
  );
  assert.match(sw, /publicProductV1Layer\.mjs/);
  assert.match(sw, /settle-friends-live-v\d+/);
});

test("product v1 disables competing visual styles at runtime", async () => {
  const layer = await readFile("src/publicProductV1Layer.mjs", "utf8");

  assert.match(layer, /public-visual-refresh-layer-style/);
  assert.match(layer, /public-premium-visual-layer-style/);
  assert.match(layer, /public-fintech-design-layer-style/);
  assert.match(layer, /sogrim-live-ledger-skin/);
  assert.match(layer, /visual-refresh-v3/);
  assert.match(layer, /premium-visual-v1/);
  assert.match(layer, /fintech-design-v1/);
  assert.match(layer, /fintech-design-v2/);
  assert.match(layer, /live-ledger-force-v2/);
  assert.match(layer, /document\.documentElement\.classList\.add\("product-v1"\)/);
  assert.match(layer, /removeRetiredVisualStyles/);
});

test("product v1 defines one coherent app design system", async () => {
  const layer = await readFile("src/publicProductV1Layer.mjs", "utf8");

  assert.match(layer, /--p1-bg/);
  assert.match(layer, /--p1-surface/);
  assert.match(layer, /--p1-ink/);
  assert.match(layer, /--p1-primary/);
  assert.match(layer, /--p1-hero-start/);
  assert.match(layer, /--p1-warm/);
  assert.match(layer, /--p1-sky/);
  assert.match(layer, /\.screen > \.top/);
  assert.match(layer, /\.screen > \.top::before/);
  assert.match(layer, /\.product-app-nav/);
  assert.match(layer, /\.product-nav-button\.is-active/);
  assert.match(layer, /\.personal-dashboard/);
  assert.match(layer, /\.event-workspace-nav/);
  assert.match(layer, /\.event-command-card/);
  assert.match(layer, /\.expense-modal/);
  assert.match(layer, /\.settlement-hero/);
});

test("product v1 removes old instructional clutter and supports mobile", async () => {
  const layer = await readFile("src/publicProductV1Layer.mjs", "utf8");

  assert.match(layer, /CLUTTER_SELECTORS/);
  assert.match(layer, /\.product-context-bar/);
  assert.match(layer, /\.product-home-kicker/);
  assert.match(layer, /\.product-sticky-actions/);
  assert.match(layer, /\.public-profile-modal/);
  assert.match(layer, /@media \(max-width: 760px\)/);
  assert.match(layer, /@media \(max-width: 460px\)/);
  assert.match(layer, /prefers-reduced-motion/);
});

test("product v1 keeps task screens compact and avoids duplicate event actions", async () => {
  const layer = await readFile("src/publicProductV1Layer.mjs", "utf8");

  assert.match(layer, /\.screen:not\(\.product-empty-home\) > \.top/);
  assert.match(layer, /min-height: clamp\(176px, 16vw, 220px\) !important/);
  assert.match(layer, /\.screen > \.top \.brand \{\s+grid-column: 2;\s+grid-row: 1;/);
  assert.match(layer, /\.product-hero-artwork:not\(\.product-home-artwork\) \{[\s\S]*position: absolute !important/);
  assert.match(layer, /\.product-home-artwork \{[\s\S]*position: absolute !important/);
  assert.match(layer, /\.event-command-grid \{\s+display: none !important;/);
  assert.match(layer, /padding: 30px 20px 118px !important/);
});

test("product v1 keeps first-run profile controls clickable above the gate", async () => {
  const layer = await readFile("src/publicProductV1Layer.mjs", "utf8");

  assert.match(layer, /\.public-profile-gate \{[\s\S]*pointer-events: auto !important/);
  assert.match(layer, /\.public-profile-modal \{[\s\S]*pointer-events: auto !important/);
  assert.match(layer, /\.public-profile-form \{[\s\S]*z-index: 2;[\s\S]*pointer-events: auto !important/);
  assert.match(layer, /\.public-profile-form \* \{[\s\S]*pointer-events: auto !important/);
});
