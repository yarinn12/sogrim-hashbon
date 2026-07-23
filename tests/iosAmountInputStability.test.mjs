import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("payer summary mutations are idempotent and cannot observe themselves forever", async () => {
  const layer = await readFile("src/publicExpensePayerSummaryLayer.mjs", "utf8");

  assert.match(layer, /if \(summaryNode\.className !== nextClassName\)/);
  assert.match(layer, /if \(summaryNode\.textContent !== summary\.text\)/);
  assert.match(layer, /if \(!summaryNode\.hidden\) summaryNode\.hidden = true/);
});

test("mobile money inputs avoid iPhone zoom and expensive fixed blur", async () => {
  const layer = await readFile("src/publicMobileModalLayer.mjs", "utf8");
  const studioLayer = await readFile("src/publicStudioDesignLayer.mjs", "utf8");

  assert.match(layer, /font-size: 16px !important/);
  assert.match(layer, /height: 100svh !important/);
  assert.match(layer, /height: 100dvh !important/);
  assert.match(layer, /-webkit-backdrop-filter: none !important/);
  assert.match(layer, /scroll-padding-block:/);
  assert.match(layer, /env\(safe-area-inset-bottom\)/);
  assert.match(layer, /position: static !important/);
  assert.match(layer, /min-height: 44px !important/);
  assert.match(layer, /data-app-dialog-inert/);
  assert.match(studioLayer, /html\.product-studio-v3 \.expense-modal-header/);
  assert.doesNotMatch(studioLayer, /backdrop-filter: blur\(12px\)/);
});

test("open dialogs make background controls inert", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /function setDialogBackgroundInert\(dialog\)/);
  assert.match(app, /backdrop\.contains\(element\)/);
  assert.match(app, /element\.inert = true/);
  assert.match(app, /function clearDialogBackgroundInert\(\)/);
  assert.match(app, /element\.inert = false/);
});
