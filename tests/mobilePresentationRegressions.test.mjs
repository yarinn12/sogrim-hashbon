import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [homeLayer, coherenceLayer, dynamicTypeLayer] = await Promise.all([
  readFile("src/publicHomeButtonLayer.mjs", "utf8"),
  readFile("src/publicDesignCoherenceLayer.mjs", "utf8"),
  readFile("src/publicDynamicTypeLayer.mjs", "utf8")
]);

test("mobile participant management keeps global route chrome available", () => {
  assert.match(homeLayer, /\[data-event-route-dialog="true"\]/);
  assert.match(homeLayer, /participantTaskOpen/);
  assert.match(homeLayer, /chrome\.inert = false/);
  assert.match(homeLayer, /chrome\.removeAttribute\("aria-hidden"\)/);
  assert.match(
    coherenceLayer,
    /\.screen:has\(\.event-participant-route-backdrop\)[\s\S]*?> \.product-app-identity \{[\s\S]*?display: none !important;/
  );
  assert.match(
    coherenceLayer,
    /\.event-participant-route-backdrop \{[\s\S]*?inset: 0 !important;[\s\S]*?height: 100dvh !important;/
  );
});

test("large-text home keeps dedicated clearance above fixed navigation", () => {
  assert.match(
    dynamicTypeLayer,
    /#app[\s\S]*?\.screen\[data-screen-kind="home"\] \{[\s\S]*?padding-bottom: calc\(196px \+ env\(safe-area-inset-bottom\)\) !important;/
  );
});

test("large text keeps short event tabs together while longer participant actions stack", async () => {
  const design = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(
    design,
    /html:is\(\.dynamic-type-large, \.dynamic-type-extra-large, \.dynamic-type-preview\)[\s\S]*?\.event-workspace-nav \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/
  );
  assert.match(
    design,
    /html:is\(\.dynamic-type-large, \.dynamic-type-extra-large, \.dynamic-type-preview\)\.ledger-workspace-v1[\s\S]*?\.event-participant-primary-actions \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/
  );
  assert.match(
    design,
    /\.settlement-screen[\s\S]*?> \.settlement-hero[\s\S]*?\+ \.settlement-stage \{[\s\S]*?margin-top: 0[\s\S]*?padding-top: 8px/
  );
});

test("mobile share choices remain separate when text grows", () => {
  assert.match(
    coherenceLayer,
    /\.event-share-modal[\s\S]*?> \.event-modal-body \{[\s\S]*?display: grid !important;[\s\S]*?grid-auto-rows: max-content !important;[\s\S]*?gap: 16px !important;/
  );
  assert.match(
    coherenceLayer,
    /\.event-share-modal[\s\S]*?\.event-share-choice \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important;[\s\S]*?align-content: start !important;/
  );
  assert.match(
    coherenceLayer,
    /\.event-share-choice[\s\S]*?> button \{[\s\S]*?position: relative !important;[\s\S]*?width: 100% !important;/
  );
  assert.doesNotMatch(coherenceLayer, /grid-template-rows: repeat\(2, max-content\) !important;/);
  assert.doesNotMatch(coherenceLayer, /grid-row: 2 !important;/);
});

test("settlement completion feedback stays roomy and branded across mobile sizes", () => {
  assert.match(
    coherenceLayer,
    /\.app-toast \{[\s\S]*?position: fixed !important;[\s\S]*?inset-block-start: auto !important;[\s\S]*?inset-block-end: calc\(env\(safe-area-inset-bottom\) \+ 96px\) !important;[\s\S]*?width: min\(520px, calc\(100vw - 28px\)\) !important;[\s\S]*?grid-template-columns: 44px minmax\(0, 1fr\) 44px !important;/
  );
  assert.match(
    coherenceLayer,
    /button\.app-toast-close \{[\s\S]*?width: 44px !important;[\s\S]*?height: 44px !important;/
  );
  assert.match(
    coherenceLayer,
    /body > \.public-sync-status\.app-toast \{[\s\S]*?grid-template-columns: 44px minmax\(0, 1fr\) 44px !important;/
  );
  assert.match(
    coherenceLayer,
    /\.public-sync-status\.app-toast button\.app-toast-close \{[\s\S]*?width: 44px !important;[\s\S]*?height: 44px !important;/
  );
  assert.match(
    coherenceLayer,
    /\.public-sync-status\.app-toast\[hidden\] \{[\s\S]*?display: none !important;/
  );
  assert.match(
    coherenceLayer,
    /\.settlement-close-primary \{[\s\S]*?grid-column: 1 \/ -1 !important;[\s\S]*?width: 100% !important;[\s\S]*?min-height: 56px !important;[\s\S]*?white-space: normal !important;/
  );
  assert.match(
    dynamicTypeLayer,
    /> \.notice:not\(\.app-toast\)/
  );
});

test("fixed navigation keeps a scrollable safe zone and large text cannot pan sideways", () => {
  assert.match(
    coherenceLayer,
    /html\.design-coherence-v1 \.screen \{[\s\S]*?padding-bottom: calc\(168px \+ env\(safe-area-inset-bottom\)\) !important;[\s\S]*?scroll-padding-block-end: calc\(168px \+ env\(safe-area-inset-bottom\)\) !important;/
  );
  assert.match(
    coherenceLayer,
    /html\.design-coherence-v1,[\s\S]*?html\.design-coherence-v1 body \{[\s\S]*?overflow-x: clip !important;/
  );
  assert.match(
    dynamicTypeLayer,
    /\.screen \{[\s\S]*?padding-bottom: calc\(184px \+ env\(safe-area-inset-bottom\)\) !important;[\s\S]*?scroll-padding-block-end: calc\(184px \+ env\(safe-area-inset-bottom\)\) !important;/
  );
});
