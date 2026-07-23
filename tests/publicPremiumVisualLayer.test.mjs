import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public premium visual layer loads after the existing visual refresh", async () => {
  const index = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");

  assert.match(index, /publicPremiumVisualLayer\.mjs/);
  assert.ok(
    index.indexOf("publicPremiumVisualLayer.mjs") >
      index.indexOf("publicVisualRefreshLayer.mjs")
  );
  assert.match(sw, /publicPremiumVisualLayer\.mjs/);
});

test("public premium visual layer creates a screen-aware modern app shell", async () => {
  const layer = await readFile("src/publicPremiumVisualLayer.mjs", "utf8");
  const homeDetection = layer.indexOf('return "home"');
  const groupsDetection = layer.indexOf('return "groups"');

  assert.match(layer, /premium-visual-v1/);
  assert.match(layer, /enhancePremiumVisuals/);
  assert.match(layer, /detectScreenKind/);
  assert.match(layer, /premium-screen-home/);
  assert.match(layer, /premium-screen-event/);
  assert.match(layer, /premium-screen-new-event/);
  assert.match(layer, /premium-screen-join-event/);
  assert.match(layer, /product-brand-mark::before/);
  assert.match(layer, /\.event-workspace-nav/);
  assert.match(layer, /\.event-command-card/);
  assert.match(layer, /\.summary-strip/);
  assert.match(layer, /MutationObserver/);
  assert.ok(homeDetection > -1);
  assert.ok(groupsDetection > -1);
  assert.ok(homeDetection < groupsDetection);
});

test("public premium visual layer keeps the product polished and responsive", async () => {
  const layer = await readFile("src/publicPremiumVisualLayer.mjs", "utf8");

  assert.match(layer, /Heebo/);
  assert.match(layer, /Noto Sans Hebrew/);
  assert.match(layer, /focus-visible/);
  assert.match(layer, /prefers-reduced-motion/);
  assert.match(layer, /@media \(max-width: 680px\)/);
  assert.doesNotMatch(layer, /beta|Wi-Fi|local network|demo people/i);
});
