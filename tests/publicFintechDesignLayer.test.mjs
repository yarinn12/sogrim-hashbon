import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public fintech design layer is loaded after the existing premium visuals", async () => {
  const index = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");

  assert.match(index, /publicFintechDesignLayer\.mjs/);
  assert.ok(
    index.indexOf("publicFintechDesignLayer.mjs") >
      index.indexOf("publicPremiumVisualLayer.mjs")
  );
  assert.match(sw, /publicFintechDesignLayer\.mjs/);
});

test("public fintech design layer defines a unified product theme", async () => {
  const layer = await readFile("src/publicFintechDesignLayer.mjs", "utf8");

  assert.match(layer, /fintech-design-v1/);
  assert.match(layer, /fintech-design-v2/);
  assert.match(layer, /--fintech-primary/);
  assert.match(layer, /--fintech-secondary/);
  assert.match(layer, /--fintech-background/);
  assert.match(layer, /--fintech-surface/);
  assert.match(layer, /--fintech-border/);
  assert.match(layer, /--fintech-text/);
  assert.match(layer, /--fintech-radius-card/);
  assert.match(layer, /--fintech-motion/);
  assert.match(layer, /--fintech-graphite/);
  assert.match(layer, /--fintech-canvas/);
  assert.match(layer, /--fintech-teal/);
  assert.match(layer, /--fintech-gold/);
});

test("public fintech design layer polishes core app surfaces without new copy", async () => {
  const layer = await readFile("src/publicFintechDesignLayer.mjs", "utf8");

  assert.match(layer, /\.product-app-identity/);
  assert.match(layer, /\.screen > \.top/);
  assert.match(layer, /\.hero-actions/);
  assert.match(layer, /\.panel/);
  assert.match(layer, /\.event-workspace-nav/);
  assert.match(layer, /\.event-insight-panel/);
  assert.match(layer, /\.event-command-card/);
  assert.match(layer, /\.summary-item/);
  assert.match(layer, /\.expense-modal/);
  assert.match(layer, /\.empty-state/);
  assert.doesNotMatch(layer, /innerHTML|insertAdjacentHTML|textContent\s*=/);
});

test("public fintech design layer includes responsive and accessibility polish", async () => {
  const layer = await readFile("src/publicFintechDesignLayer.mjs", "utf8");

  assert.match(layer, /@media \(max-width: 760px\)/);
  assert.match(layer, /@media \(max-width: 480px\)/);
  assert.match(layer, /prefers-reduced-motion/);
  assert.match(layer, /:focus-visible/);
  assert.match(layer, /@keyframes fintech-shimmer/);
  assert.match(layer, /\[aria-busy="true"\]/);
});

test("public fintech design layer adds production polish without DOM changes", async () => {
  const layer = await readFile("src/publicFintechDesignLayer.mjs", "utf8");

  assert.match(layer, /--fintech-shadow-hover/);
  assert.match(layer, /--fintech-shadow-pressed/);
  assert.match(layer, /--fintech-motion-slow/);
  assert.match(layer, /--fintech-ease-premium/);
  assert.match(layer, /:active:not\(:disabled\)/);
  assert.match(layer, /\.event-workspace-tab\[aria-current="page"\]/);
  assert.match(layer, /\.event-workspace-tab:active/);
  assert.match(layer, /\.skeleton/);
  assert.match(layer, /\.skeleton-line/);
  assert.match(layer, /@keyframes fintech-float-in/);
  assert.match(layer, /@keyframes fintech-press-glow/);
  assert.doesNotMatch(layer, /innerHTML|insertAdjacentHTML|textContent\s*=/);
});

test("public fintech design layer has a premium finance v2 workspace pass", async () => {
  const layer = await readFile("src/publicFintechDesignLayer.mjs", "utf8");

  assert.match(layer, /html\.fintech-design-v2 body/);
  assert.match(layer, /html\.fintech-design-v2 \.screen > \.top/);
  assert.match(layer, /html\.fintech-design-v2 \.event-workspace-nav/);
  assert.match(layer, /html\.fintech-design-v2 \.event-insight-panel/);
  assert.match(layer, /html\.fintech-design-v2 \.event-command-card/);
  assert.match(layer, /html\.fintech-design-v2 \.expense-modal-header/);
  assert.match(layer, /html\.fintech-design-v2 \.participant-pill:has/);
  assert.match(layer, /grid-template-columns: repeat\(auto-fit, minmax\(190px, 1fr\)\)/);
  assert.doesNotMatch(layer, /innerHTML|insertAdjacentHTML|textContent\s*=/);
});
