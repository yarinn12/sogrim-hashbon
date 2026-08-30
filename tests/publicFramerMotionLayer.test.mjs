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
  assert.doesNotMatch(
    layer.slice(layer.indexOf("function animateScreenChange"), layer.indexOf("function animateNewRows")),
    /clipPath/
  );
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

test("public motion covers app-wide state feedback without animating layout properties", async () => {
  const layer = await readFile("src/publicFramerMotionLayer.mjs", "utf8");

  assert.match(layer, /function animateActionFeedback/);
  assert.ok(
    layer.indexOf('document.addEventListener("click", animateActionFeedback, true)') >
      layer.indexOf("function animateActionFeedback"),
    "WebKit must see the action feedback declaration before it is registered"
  );
  assert.ok(
    layer.lastIndexOf("startMotionPolish();") >
      layer.indexOf("function animateSelectionChanges"),
    "WebKit side effects must start only after every motion handler is declared"
  );
  assert.ok(
    layer.lastIndexOf("startMotionPolish();") >
      layer.indexOf("const rememberedRowKeys"),
    "WebKit side effects must start only after motion state containers initialize"
  );
  assert.match(layer, /function animateSelectionChanges/);
  assert.match(layer, /function animateDisclosureChanges/);
  assert.match(layer, /function animateValidationChange/);
  assert.match(layer, /function animateMoneyChanges/);
  assert.match(layer, /function syncBusyStates/);
  assert.match(layer, /aria-checked/);
  assert.match(layer, /aria-expanded/);
  assert.match(layer, /aria-invalid/);
  assert.match(layer, /aria-busy/);
  assert.match(layer, /motion-control-busy/);
  assert.match(layer, /characterData: true/);
  assert.doesNotMatch(layer, /transition-property:[^;]*(?:width|height|top|left|margin)/);
  assert.doesNotMatch(layer, /(?:bounce|elastic)/i);
});

test("all app dialog families share the motion and reduced-motion contract", async () => {
  const layer = await readFile("src/publicFramerMotionLayer.mjs", "utf8");

  assert.match(layer, /settlement-close-confirmation-backdrop/);
  assert.match(layer, /accessibility-center-backdrop/);
  assert.match(layer, /install-app-backdrop/);
  assert.match(layer, /app-choice-picker-backdrop/);
  assert.match(layer, /\[role="dialog"\], \[role="alertdialog"\]/);
  assert.match(
    layer,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration: 1ms !important;[\s\S]*?transition-duration: 1ms !important;/
  );
  assert.match(layer, /accessibility-reduced-motion/);
});
