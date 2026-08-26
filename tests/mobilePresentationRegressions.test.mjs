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
    /#app[\s\S]*?\.screen\[data-screen-kind="home"\] \{[\s\S]*?padding-bottom: var\(--dynamic-type-home-end-space\) !important;/
  );
  assert.match(
    dynamicTypeLayer,
    /--dynamic-type-home-end-space: calc\([\s\S]*?--dynamic-type-screen-end-space[\s\S]*?max\(12px, 0\.75rem\)/
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

test("expenses and summary keep the exact same mobile event header", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const eventHeader = app.slice(
    app.indexOf("function renderEventHeader("),
    app.indexOf("function renderEventIdentityNotice(")
  );

  assert.match(eventHeader, /<header class="top event-overview-header">/);
  assert.match(
    coherenceLayer,
    /\.screen\[data-screen-kind="event"\][\s\S]*?> \.event-overview-header \{[\s\S]*?min-height: 112px !important;[\s\S]*?margin: 8px 0 13px !important;[\s\S]*?padding: 16px 18px !important;/
  );
  assert.match(
    coherenceLayer,
    /> \.event-overview-header[\s\S]*?\.eyebrow \{[\s\S]*?display: block !important;/
  );
  assert.doesNotMatch(
    coherenceLayer,
    /\.screen\[data-event-view="summary"\][\s\S]{0,100}> \.top[\s\S]{0,200}(?:display: none|min-height: 0|padding: 10px 14px)/
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
    /\.app-toast \{[\s\S]*?position: fixed !important;[\s\S]*?inset-block-start: auto !important;[\s\S]*?inset-block-end: calc\(env\(safe-area-inset-bottom\) \+ 100px\) !important;[\s\S]*?width: min\(520px, calc\(100vw - 28px\)\) !important;[\s\S]*?grid-template-columns: 44px minmax\(0, 1fr\) 44px !important;[\s\S]*?pointer-events: none !important;/
  );
  assert.match(
    coherenceLayer,
    /button\.app-toast-close \{[\s\S]*?width: 44px !important;[\s\S]*?height: 44px !important;[\s\S]*?pointer-events: auto !important;/
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

test("event workspace controls stay stable above sticky mobile chrome", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(
    coherenceLayer,
    /\.event-workspace-tab:is\(\.is-active, \[aria-current="page"\]\)[\s\S]*?color: #ffffff !important;[\s\S]*?background: var\(--app-brand\) !important;/
  );
  assert.match(
    coherenceLayer,
    /\.settlement-repayment-shortcut \{[\s\S]*?width: 164px !important;[\s\S]*?min-width: 164px !important;[\s\S]*?flex: 0 0 164px !important;/
  );
  assert.match(
    coherenceLayer,
    /\.expense-row-actions-menu\.is-viewport-positioned > div \{[\s\S]*?position: fixed !important;[\s\S]*?z-index: 260 !important;[\s\S]*?max-height: var\(--expense-menu-max-height\) !important;/
  );
  assert.match(app, /function positionExpenseActionsMenu\(menu\)/);
  assert.match(app, /const safeBottom = Math\.min\(viewportTop \+ viewportHeight, navTop\) - 8;/);
  assert.match(app, /menu\.style\.setProperty\("--expense-menu-top"/);
});

test("close-event confirmation uses the branded floating card with an explicit dismiss control", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const confirmation = app.slice(
    app.indexOf("function renderSettlementCloseConfirmation"),
    app.indexOf("function renderTransferRow")
  );

  assert.match(confirmation, /class="settlement-close-confirmation-backdrop"/);
  assert.match(confirmation, /role="alertdialog"/);
  assert.match(confirmation, /aria-modal="true"/);
  assert.match(confirmation, /class="app-toast-close settlement-close-confirmation-dismiss"/);
  assert.match(confirmation, /data-action="cancel-close-event-confirmation"/);
  assert.match(confirmation, /פעולה חשובה/);
  assert.doesNotMatch(confirmation, /role="region"/);
  assert.match(
    coherenceLayer,
    /\.settlement-close-confirmation-backdrop \{[\s\S]*?position: fixed !important;[\s\S]*?z-index: 240 !important;[\s\S]*?background: rgba\(7, 27, 24, 0\.14\) !important;/
  );
  assert.match(
    coherenceLayer,
    /\.settlement-close-confirmation \{[\s\S]*?background: #fbfefd !important;/
  );
  assert.doesNotMatch(
    coherenceLayer.slice(coherenceLayer.indexOf("Close-event confirmation follows")),
    /#fffaf2|139, 93, 37/
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
    /\.screen \{[\s\S]*?padding-bottom: var\(--dynamic-type-screen-end-space\) !important;[\s\S]*?scroll-padding-block-end: var\(--dynamic-type-screen-end-space\) !important;/
  );
});
