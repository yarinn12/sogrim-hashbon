import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("circle design layer loads after the studio foundation and is available offline", async () => {
  const [index, sw] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("sw.js", "utf8")
  ]);

  assert.match(index, /publicStudioDesignLayer\.mjs/);
  assert.ok(index.indexOf("publicStudioDesignLayer.mjs") > index.indexOf("publicMobileModalLayer.mjs"));
  assert.match(index, /publicCircleDesignLayer\.mjs/);
  assert.ok(index.indexOf("publicCircleDesignLayer.mjs") > index.indexOf("publicStudioDesignLayer.mjs"));
  assert.match(sw, /const CACHE_NAME = "settle-friends-live-v\d+"/);
  assert.match(sw, /publicStudioDesignLayer\.mjs/);
  assert.match(sw, /publicCircleDesignLayer\.mjs/);
});

test("studio design layer defines the production visual system", async () => {
  const layer = await readFile("src/publicStudioDesignLayer.mjs", "utf8");

  assert.match(layer, /--studio-primary/);
  assert.match(layer, /--studio-coral/);
  assert.match(layer, /\.product-app-nav/);
  assert.match(layer, /position: fixed !important/);
  assert.match(layer, /\.event-type-option/);
  assert.match(layer, /\.studio-event-type-icon/);
  assert.match(layer, /\.expense-modal/);
  assert.match(layer, /a:focus-visible/);
  assert.match(layer, /padding-inline-end: 46px/);
  assert.match(layer, /\.status-chip\.is-locked/);
  assert.match(layer, /public-brand-layer-style/);
  assert.match(layer, /public-empty-home-polish-layer-style/);
  assert.match(layer, /public-fintech-design-layer-style/);
  assert.match(layer, /public-premium-visual-layer-style/);
  assert.match(layer, /public-product-v1-layer-style/);
  assert.match(layer, /public-design-v2-layer-style/);
  assert.match(layer, /retireLegacyVisualStyles/);
  assert.match(layer, /url\("\.\/icon\.svg"\)/);
  assert.match(layer, /z-index: 200 !important/);
  assert.match(layer, /font-family: "Noto Sans Hebrew"/);
  assert.match(layer, /html\.product-studio-v3 \[hidden\] \{\s+display: none !important/);
  assert.match(layer, /body\.app-dialog-open \{[\s\S]*?overflow: hidden !important/);
  assert.match(layer, /\.event-command-grid \{\s+display: none !important/);
  assert.match(layer, /\.expense-total-field input/);
  assert.match(layer, /\.public-profile-modal \{[\s\S]*?height: 100dvh !important/);
  assert.match(layer, /Visual polish v4/);
  assert.match(layer, /Ledger visual system v5/);
  assert.match(layer, /retireHomeHeroImage/);
  assert.match(layer, /studio-home-hero-image/);
  assert.doesNotMatch(layer, /image\.src = "\.\/sogrim-home-hero\.png"/);
  assert.match(layer, /--studio-canvas: #fafaf8/);
  assert.match(layer, /\.recent-event-shortcut \{[\s\S]*?border: 1px solid #cbdedb/);
  assert.match(layer, /\.screen:has\(\.recent-event-shortcut\) \.personal-dashboard/);
  assert.match(layer, /\.event-header-actions \[data-action="settle"\] \{[\s\S]*?display: none/);
  assert.match(layer, /\.event-row \.status-chip\.is-open/);
  assert.match(layer, /\.product-event-screen \.summary-strip \{[\s\S]*?display: flex/);
  assert.match(layer, /\.product-event-screen \.summary-item::after \{[\s\S]*?content: none/);
  assert.match(layer, /\.event-workspace-tab \.button-action-icon \{[\s\S]*?display: none/);
  assert.match(layer, /font-variant-numeric: tabular-nums/);
  assert.match(layer, /text-wrap: balance/);
  assert.match(layer, /transition-property: color, background-color, border-color, box-shadow, opacity, transform/);
  assert.match(layer, /\.personal-balance-main \{[\s\S]*?background: #0b5f57 !important/);
  assert.match(layer, /\.product-event-screen \.summary-strip \{[\s\S]*?grid-template-columns: repeat\(2/);
  assert.match(
    layer,
    /\.product-app-identity \{[\s\S]*?-webkit-backdrop-filter: none !important;[\s\S]*?backdrop-filter: none !important;/
  );
  assert.match(layer, /prefers-reduced-motion/);
  assert.doesNotMatch(layer, /transition:\s*all/);
  assert.doesNotMatch(layer, /repeating-linear-gradient/);
  assert.doesNotMatch(layer, /background-clip:\s*text/);
});
