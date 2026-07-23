import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("ledger workspace is the final public design layer", async () => {
  const [html, worker, layer] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("sw.js", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  const circleIndex = html.indexOf("./src/publicCircleDesignLayer.mjs");
  const ledgerIndex = html.indexOf("./src/publicLedgerWorkspaceLayer.mjs");

  assert.ok(circleIndex >= 0);
  assert.ok(ledgerIndex > circleIndex);
  assert.match(worker, /"\/src\/publicLedgerWorkspaceLayer\.mjs"/);
  assert.match(layer, /function activateLedgerWorkspace\(\)/);
  assert.match(layer, /document\.documentElement\.classList\.remove\(\.\.\.RETIRED_ROOT_CLASSES\)/);
  assert.match(layer, /"social-ledger-v2"/);
  assert.match(layer, /"product-studio-v3"/);
  assert.match(layer, /"public-product-v1-layer-style"/);
  assert.match(layer, /document\.documentElement\.classList\.add\("product-v1", "ledger-workspace-v1"\)/);
  assert.match(layer, /new MutationObserver\(activateLedgerWorkspace\)/);
});

test("ledger workspace uses a distinctive editorial financial product system", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(layer, /--ledger-canvas: #edf3f1/);
  assert.match(layer, /--ledger-brand: #064b43/);
  assert.match(layer, /font-family: "IBM Plex Sans Hebrew"/);
  assert.match(layer, /font-family: "Rubik", "IBM Plex Sans Hebrew"/);
  assert.match(layer, /font-family: "IBM Plex Mono"/);
  assert.match(layer, /\.recent-event-shortcut \{[\s\S]*?background: var\(--ledger-brand\) !important/);
  assert.match(layer, /\.event-list \{[\s\S]*?border-radius: var\(--ledger-radius\) !important/);
  assert.match(layer, /\.event-row \{[\s\S]*?border-radius: 0 !important;[\s\S]*?box-shadow: none !important/);
  assert.match(layer, /Signature editorial fintech finish/);
  assert.doesNotMatch(layer, /repeating-linear-gradient/);
  assert.match(layer, /\.app::before/);
  assert.doesNotMatch(layer, /transition:\s*all/);
});

test("ledger workspace finishes small controls and surfaces with shared polish tokens", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(layer, /Micro-detail production polish/);
  assert.match(layer, /--ledger-shadow-border:/);
  assert.match(layer, /--ledger-shadow-control:/);
  assert.match(layer, /--ledger-focus-ring:/);
  assert.match(layer, /object-fit: contain !important/);
  assert.match(layer, /outline: 1px solid rgba\(0, 0, 0, 0\.1\)/);
  assert.match(layer, /text-wrap: pretty/);
  assert.match(layer, /font-variant-numeric: tabular-nums/);
  assert.doesNotMatch(layer, /transition:\s*all/);
});

test("ledger workspace keeps task navigation and mobile modals production ready", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(
    layer,
    /\.product-app-nav\[hidden\] \{[\s\S]*?display: none !important/
  );
  assert.match(layer, /\.home-event-tools \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.match(
    layer,
    /@media \(max-width: 720px\)[\s\S]*?\.product-app-nav \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/
  );
  assert.match(
    layer,
    /\.event-workspace-nav \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/
  );
  assert.match(
    layer,
    /\.event-workspace-tab\.is-active,[\s\S]*?border-bottom-color: var\(--ledger-accent\) !important/
  );
  assert.match(
    layer,
    /\.event-personal-balance \{[\s\S]*?min-height: 72px !important;[\s\S]*?font-variant-numeric: tabular-nums/
  );
  assert.match(
    layer,
    /\.expense-confirmation-summary \{[\s\S]*?font-size: 13px !important/
  );
  assert.match(layer, /\.quick-split-summary \{[\s\S]*?background: var\(--ledger-brand\) !important/);
  assert.match(
    layer,
    /\.summary-strip[\s\S]*?> \.summary-item\.summary-personal \{[\s\S]*?background: var\(--ledger-brand\) !important/
  );
  assert.match(layer, /\.summary-personal-value\.is-credit[\s\S]*?color: #9fe4d2 !important/);
  assert.match(layer, /\.summary-personal-value\.is-debt[\s\S]*?color: #ffd2c8 !important/);
  assert.match(
    layer,
    /\.summary-personal-value[\s\S]*?> span \{[\s\S]*?font-size: inherit !important/
  );
  assert.match(
    layer,
    /@media \(max-width: 720px\)[\s\S]*?\.expense-modal,[\s\S]*?min-height: 100dvh !important;[\s\S]*?border-radius: 0 !important/
  );
  assert.match(
    layer,
    /@media \(max-width: 720px\)[\s\S]*?\.expense-modal-actions \{[\s\S]*?position: sticky !important;[\s\S]*?inset-block-end: 0 !important;[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;/
  );
  assert.match(
    layer,
    /\.expense-modal > \.product-form-helper,[\s\S]*?\.expense-modal-header \.muted \{[\s\S]*?display: none !important/
  );
  assert.match(
    layer,
    /\.expense-template-grid \{[\s\S]*?flex-wrap: nowrap !important;[\s\S]*?overflow-x: auto !important/
  );
  assert.match(
    layer,
    /@media \(max-width: 720px\)[\s\S]*?\.screen\[data-screen-kind="new-event"\] \{[\s\S]*?padding-bottom: calc\(28px \+ env\(safe-area-inset-bottom\)\) !important/
  );
  assert.match(
    layer,
    /\.event-choice-forward \{[\s\S]*?position: absolute !important/
  );
  assert.match(
    layer,
    /\.event-management-option\[aria-checked="true"\] \{[\s\S]*?box-shadow: 0 0 0 3px rgba\(34, 174, 178, 0\.12\) !important/
  );
  assert.match(
    layer,
    /\.account-delete-button \{[\s\S]*?color: var\(--ledger-negative\) !important/
  );
  assert.match(
    layer,
    /@media \(max-width: 720px\)[\s\S]*?\.account-profile-actions \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/
  );
  assert.match(layer, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    layer,
    /prefers-reduced-motion: reduce[\s\S]*?html\.ledger-workspace-v1 button,[\s\S]*?transition-duration: 1ms !important/
  );
});

test("ledger workspace keeps expense actions visible above mobile chrome", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(
    layer,
    /\.expense-modal-actions[\s\S]*?:is\(\.secondary-button, \.expense-save-more, \[data-action="cancel-expense"\]\)[\s\S]*?color: var\(--ledger-ink\) !important;[\s\S]*?background-color: var\(--ledger-surface\) !important/
  );
  assert.match(
    layer,
    /\.expense-modal \{[\s\S]*?scroll-padding-block-end: calc\(152px \+ env\(safe-area-inset-bottom\)\) !important/
  );
  assert.match(layer, /min-height: 100vh !important;\s*min-height: 100dvh !important/);
  assert.match(layer, /max-height: 100vh !important;\s*max-height: 100dvh !important/);
  assert.match(
    layer,
    /\.event-action-dock \{[\s\S]*?inset-block-end: max\(12px, env\(safe-area-inset-bottom\)\) !important/
  );
  assert.match(
    layer,
    /@media \(max-width: 360px\)[\s\S]*?\.expense-modal-actions \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/
  );
});
