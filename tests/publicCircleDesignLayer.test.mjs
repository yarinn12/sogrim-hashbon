import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("circle design layer defines the final product identity", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");

  assert.match(layer, /--circle-brand: #0b3b38/);
  assert.match(layer, /--circle-mint: #2bb8c2/);
  assert.match(layer, /\.product-brand-image/);
  assert.match(layer, /icon-192\.png/);
  assert.match(layer, /font-family: var\(--font-hebrew\)/);
  assert.match(layer, /font-family: var\(--font-num\)/);
  assert.match(layer, /Live Receipt/);
  assert.doesNotMatch(layer, /\.circle-live-amount::after/);
  assert.doesNotMatch(layer, /circle-live-caret/);
  assert.doesNotMatch(layer, /keepLiveReceiptCurrent/);
  assert.match(layer, /--circle-positive-on-dark: #72d5aa/);
  assert.match(layer, /--circle-negative-on-dark: #ff9d8e/);
  assert.doesNotMatch(layer, /linear-gradient|radial-gradient|repeating-linear-gradient/);
});

test("deep ledger v4 keeps the product palette restrained and mobile safe", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");

  assert.match(layer, /social-ledger-v4/);
  assert.match(layer, /--circle-accent: #2bb8c2/);
  assert.match(layer, /--circle-focus: #087c78/);
  assert.match(
    layer,
    /\.screen\[data-screen-kind="home"\] > \.top \{[\s\S]*?background: var\(--circle-brand\) !important/
  );
  assert.match(layer, /select \{[\s\S]*?white-space: nowrap !important/);
  assert.match(
    layer,
    /\.account-auth-tabs button \{[\s\S]*?min-height: 44px !important/
  );
  assert.doesNotMatch(layer, /#d7f244|#f0f9bd|#c4df2f|#cfe83b|rgba\(215, 242, 68/);
});

test("deep ledger v5 unifies operational screens without restyling home", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");
  const start = layer.lastIndexOf(
    "/* Deep Ledger v5: one operational language across every non-home flow. */"
  );
  const end = layer.indexOf("@media (prefers-reduced-motion: reduce)", start);
  const operationalStyles = layer.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(layer, /deep-ledger-v5/);
  assert.match(
    operationalStyles,
    /\.screen:not\(\[data-screen-kind="home"\]\):not\(\[data-product-screen="home"\]\):not\(\.product-home-screen\)[\s\S]*?> \.top \{[\s\S]*?background: var\(--circle-brand\) !important/
  );
  assert.match(operationalStyles, /\.event-workspace-tab\.is-active/);
  assert.match(operationalStyles, /\.event-creation-progress \{/);
  assert.match(operationalStyles, /\.event-type-option\[aria-checked="true"\]/);
  assert.match(
    operationalStyles,
    /\.modal-route-controls \.modal-back-button,[\s\S]*?\.modal-route-controls \.modal-home-button \{[\s\S]*?width: 48px !important;[\s\S]*?min-width: 48px !important/
  );
  assert.match(
    operationalStyles,
    /@media \(max-width: 720px\)[\s\S]*?margin: 0 -16px 20px !important;[\s\S]*?border-radius: 0 !important/
  );
  assert.doesNotMatch(operationalStyles, /transition:\s*all/);
  assert.doesNotMatch(
    operationalStyles,
    /\.screen\[data-screen-kind="home"\] > \.top \{[\s\S]*?background: var\(--circle-brand\)/
  );
});

test("deep ledger v6 makes task screens compact and clarifies first actions", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");
  const start = layer.lastIndexOf(
    "/* Deep Ledger v6: compact task chrome and clearer first actions. */"
  );
  const end = layer.indexOf("@media (prefers-reduced-motion: reduce)", start);
  const refinementStyles = layer.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(layer, /deep-ledger-v6/);
  assert.match(
    refinementStyles,
    /\.screen:not\(\[data-screen-kind="home"\]\):not\(\[data-product-screen="home"\]\):not\(\.product-home-screen\)[\s\S]*?> \.top \{[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;/
  );
  assert.match(refinementStyles, /> \.top[\s\S]*?h1 \{[\s\S]*?font-size: 32px !important;/);
  assert.match(
    refinementStyles,
    /\.event-creation-progress \{[\s\S]*?border: 0 !important;[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;/
  );
  assert.match(
    refinementStyles,
    /\.event-type-step-panel \{[\s\S]*?padding: 0 !important;[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;/
  );
  assert.match(
    refinementStyles,
    /@media \(min-width: 721px\)[\s\S]*?\.product-app-identity \{[\s\S]*?width: 100% !important;[\s\S]*?margin-inline: 0 !important;/
  );
  assert.match(refinementStyles, /\.event-start-panel\.is-invite-first/);
  assert.doesNotMatch(refinementStyles, /transition:\s*all/);
  assert.doesNotMatch(refinementStyles, /linear-gradient|radial-gradient|repeating-linear-gradient/);
});

test("deep ledger v7 keeps restaurant entry focused and touch friendly", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");
  const start = layer.lastIndexOf(
    "/* Deep Ledger v7: faster restaurant entry and quieter interactive depth. */"
  );
  const end = layer.indexOf("@media (prefers-reduced-motion: reduce)", start);
  const refinementStyles = layer.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(layer, /deep-ledger-v7/);
  assert.match(refinementStyles, /\.quick-item-row:focus-within/);
  assert.match(
    refinementStyles,
    /\.quick-item-inline-guest \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto !important;/
  );
  assert.match(
    refinementStyles,
    /\.quick-expense-guest-details > summary \{[\s\S]*?min-height: 60px !important;/
  );
  assert.match(
    refinementStyles,
    /@media \(max-width: 430px\)[\s\S]*?\.quick-item-inline-guest \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important;/
  );
  assert.doesNotMatch(refinementStyles, /transition:\s*all/);
  assert.doesNotMatch(refinementStyles, /linear-gradient|radial-gradient|repeating-linear-gradient/);
});

test("circle design layer creates a focused financial workspace", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");

  assert.match(layer, /\.recent-event-shortcut/);
  assert.match(layer, /\.personal-dashboard/);
  assert.match(layer, /\.event-workspace-nav/);
  assert.match(layer, /\.summary-strip/);
  assert.match(layer, /\.expense-modal/);
  assert.match(layer, /\.account-auth-shell/);
  assert.match(layer, /circle-home-has-recent/);
  assert.match(layer, /keepHomePriorityCurrent/);
  assert.doesNotMatch(layer, /circleDefaultText/);
  assert.match(layer, /\.event-row-balance/);
  assert.match(layer, /\.summary-personal-value/);
});

test("home keeps event selection calm while event actions remain available", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const row = sourceBetween(app, "function renderEventRow(event)", "function ensureNewEventDraft");
  const event = sourceBetween(app, "function renderEvent(event)", "function renderEventActionDock");

  assert.match(app, /pendingBalanceForParticipant/);
  assert.match(row, /event-row-attention/);
  assert.doesNotMatch(row, /event-row-balance/);
  assert.match(
    row,
    /renderAvatarStack\(participants\.map\(\(participant\) => participant\.id\), event\)/
  );
  assert.match(event, /renderEventActionDock\(event, total, canEdit\)/);
  assert.doesNotMatch(event, /summary-item summary-personal|renderEventInsightPanel/);
});

test("shared links have a branded social preview", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /name="description"/);
  assert.match(index, /property="og:title"/);
  assert.match(index, /property="og:image" content="https:\/\/sogrim-hesbon-app\.vercel\.app\/sogrim-share-logo\.png"/);
  assert.match(index, /name="twitter:card" content="summary_large_image"/);
});

test("circle design layer keeps mobile navigation and dialogs production ready", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");

  assert.match(layer, /@media \(max-width: 660px\)/);
  assert.match(layer, /\.product-app-nav \{[\s\S]*?position: fixed !important/);
  assert.match(layer, /\.product-nav-button > span \{[\s\S]*?position: static !important/);
  assert.match(layer, /\.expense-modal \{[\s\S]*?height: 100dvh !important/);
  assert.match(layer, /env\(safe-area-inset-bottom\)/);
  assert.match(layer, /prefers-reduced-motion: reduce/);
  assert.match(
    layer,
    /@media \(max-width: 660px\)[\s\S]*?\.account-auth-shell \{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\) !important;[\s\S]*?align-content: start !important;/
  );
  assert.match(
    layer,
    /@media \(max-width: 660px\)[\s\S]*?\.account-auth-shell \{[\s\S]*?overflow: visible !important;/
  );
  assert.match(layer, /\.expense-modal-actions \{[\s\S]*?position: static !important/);
  assert.doesNotMatch(layer, /transition:\s*all/);
});

test("circle design layer prevents narrow-screen finance and group overflow", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");

  assert.match(layer, /Responsive hardening/);
  assert.match(layer, /\.screen \.summary-strip[\s\S]*?gap: 0 !important/);
  assert.match(layer, /\.event-insight-metrics[\s\S]*?min-width: 0 !important/);
  assert.match(layer, /@media \(max-width: 430px\)[\s\S]*?\.group-row/);
  assert.match(layer, /\.event-row-title strong[\s\S]*?white-space: normal !important/);
  assert.match(layer, /data-action="event-status-filter"[\s\S]*?min-height: 44px !important/);
  assert.match(layer, /overflow-wrap: anywhere !important/);
  assert.match(layer, /\.known-participant-main > \.avatar[\s\S]*?width: 36px !important/);
  assert.match(layer, /\.expense-row[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(layer, /grid-template-columns: minmax\(0, 1fr\) minmax\(112px, max-content\) !important/);
  assert.match(layer, /\.invite-link-row input[\s\S]*?direction: ltr !important/);
  assert.match(layer, /unicode-bidi: isolate/);
});

test("expense entry follows the calm two-glance mobile flow", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");

  assert.match(app, /data-expense-detail-value="payer"/);
  assert.match(app, /data-expense-detail-value="participants"/);
  assert.match(app, /data-expense-detail-value="date"/);
  assert.match(app, /function syncExpenseSaveState/);
  assert.match(app, /dialogReturnScrollY = window\.scrollY/);
  assert.match(app, /window\.scrollTo\(0, 0\)/);
  assert.match(app, /window\.scrollTo\(0, returnScrollY\)/);
  assert.match(layer, /\.expense-template-grid \{[\s\S]*?flex-wrap: nowrap !important/);
  assert.match(layer, /\.expense-detail-shortcut/);
  assert.match(layer, /--circle-placeholder: #657672/);
});

test("event creation keeps the selected event type visible", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const eventTypes = await readFile("src/domain/eventTypes.mjs", "utf8");
  const joinLayer = await readFile("src/publicJoinEventLayer.mjs", "utf8");

  assert.match(eventTypes, /creationTitle: "מסעדה חדשה"/);
  assert.match(app, /selectedType\.creationTitle/);
  assert.match(app, /data-event-type="\$\{escapeAttribute\(selectedType\.id\)\}"/);
  assert.match(joinLayer, /nativeCreateTitle/);
});

test("circle design keeps first-run disclosures clear and touch friendly", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");

  assert.match(layer, /\.new-event-participants > summary \{[\s\S]*?min-height: 64px !important/);
  assert.match(layer, /\.new-event-participants > summary:focus-visible/);
  assert.match(layer, /\.account-email-toggle \{[\s\S]*?min-height: 48px !important/);
  assert.match(layer, /\.account-email-auth\[hidden\]/);
});

test("home uses one compact list for every event", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");
  const home = app.match(/function renderHome\(\) \{[\s\S]*?(?=\nfunction renderRecentEventShortcut)/);

  assert.ok(home);
  assert.match(home[0], /events\.map\(renderEventRow\)/);
  assert.doesNotMatch(home[0], /recentEvent|listEvents|renderPersonalDashboard/);
  assert.match(layer, /font-family: var\(--font-hebrew\)/);
});

test("narrow event navigation fits all four tabs without RTL overflow", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");
  const navSelector =
    "html.circle-design-v1.deep-ledger-v5 .event-workspace-nav";
  const selectorIndex = layer.indexOf(navSelector, layer.indexOf("@media (max-width: 430px)"));
  const start = layer.lastIndexOf("@media (max-width: 430px)", selectorIndex);
  const end = layer.indexOf("}", layer.indexOf(".event-workspace-tab {", selectorIndex)) + 1;
  const narrowStyles = layer.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(
    narrowStyles,
    /\.event-workspace-nav \{[\s\S]*?overflow-x: hidden !important;[\s\S]*?\}/
  );
  assert.match(
    narrowStyles,
    /\.event-workspace-tab \{[\s\S]*?flex: 1 1 25% !important;[\s\S]*?min-width: 0 !important;[\s\S]*?min-height: 48px !important;[\s\S]*?padding-inline: 3px !important;[\s\S]*?font-size: 12\.5px !important;[\s\S]*?white-space: nowrap !important;[\s\S]*?\}/
  );
  assert.doesNotMatch(narrowStyles, /\.event-workspace-tab::after/);
});

test("home actions use an unframed responsive primary-action surface", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");
  const start = layer.lastIndexOf("/* Approved visual plan: unframed home primary action surface. */");
  const end = layer.indexOf("/* Approved visual plan: one actionable balance surface. */", start);
  const earlierStyles = layer.slice(0, start);
  const homeStyles = layer.slice(start, end);
  const earlierEmptyHomeSelectors = [
    "html.circle-design-v1.product-v1 .screen.product-empty-home > .top .hero-actions",
    "html.circle-design-v1.product-v1-live .screen.product-empty-home > .top .hero-actions"
  ];
  const finalEmptyHomeSelectors = [
    'html.circle-design-v1.product-v1 .screen.product-empty-home[data-screen-kind="home"] > .top .hero-actions',
    'html.circle-design-v1.product-v1-live .screen.product-empty-home[data-screen-kind="home"] > .top .hero-actions'
  ];
  const classLikeCount = (selector) =>
    selector.match(/\.[a-z0-9_-]+|\[[^\]]+\]/gi)?.length ?? 0;

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(
    earlierStyles,
    /html\.circle-design-v1\.product-v1 \.screen\.product-empty-home > \.top \.hero-actions,[\s\S]*?html\.circle-design-v1\.product-v1-live \.screen\.product-empty-home > \.top \.hero-actions \{[\s\S]*?gap: 5px !important;[\s\S]*?padding: 5px !important;[\s\S]*?background: rgba\(7, 31, 27, 0\.9\) !important;/
  );
  assert.match(
    homeStyles,
    /\.screen\[data-screen-kind="home"\] > \.top \.hero-actions \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;[\s\S]*?gap: 8px !important;[\s\S]*?padding: 0 !important;[\s\S]*?border: 0 !important;[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;/
  );
  assert.match(
    homeStyles,
    /\.product-v1 \.screen\.product-empty-home\[data-screen-kind="home"\] > \.top \.hero-actions,[\s\S]*?\.product-v1-live \.screen\.product-empty-home\[data-screen-kind="home"\] > \.top \.hero-actions \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;[\s\S]*?gap: 8px !important;[\s\S]*?padding: 0 !important;[\s\S]*?border: 0 !important;[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;/
  );
  earlierEmptyHomeSelectors.forEach((earlierSelector, index) => {
    const finalSelector = finalEmptyHomeSelectors[index];
    assert.ok(earlierStyles.includes(earlierSelector));
    assert.ok(homeStyles.includes(finalSelector));
    assert.ok(
      classLikeCount(finalSelector) > classLikeCount(earlierSelector),
      `final empty-home selector must outrank ${earlierSelector}`
    );
  });
  assert.match(
    homeStyles,
    /\.hero-actions\.is-single \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important;/
  );
  assert.match(
    homeStyles,
    /@media \(max-width: 340px\) \{[\s\S]*?\.product-v1 \.screen\.product-empty-home\[data-screen-kind="home"\] > \.top \.hero-actions,[\s\S]*?\.product-v1-live \.screen\.product-empty-home\[data-screen-kind="home"\] > \.top \.hero-actions \{[\s\S]*?justify-self: stretch !important;[\s\S]*?width: calc\(100% \+ 44px\) !important;[\s\S]*?max-width: none !important;[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;[\s\S]*?gap: 8px !important;[\s\S]*?margin-inline: -22px !important;/
  );
  assert.match(
    homeStyles,
    /@media \(max-width: 340px\) \{[\s\S]*?\.product-v1 \.screen\.product-empty-home\[data-screen-kind="home"\] > \.top \.hero-actions button,[\s\S]*?\.product-v1-live \.screen\.product-empty-home\[data-screen-kind="home"\] > \.top \.hero-actions button \{[\s\S]*?padding-inline: 4px !important;[\s\S]*?gap: 4px !important;[\s\S]*?font-size: 14px !important;/
  );
  assert.match(
    homeStyles,
    /\.hero-actions \.primary-button \{[\s\S]*?background: var\(--circle-mint\) !important;[\s\S]*?box-shadow:/
  );
  assert.match(
    homeStyles,
    /\.hero-actions \.secondary-button \{[\s\S]*?border: 1px solid var\(--circle-line-strong\) !important;[\s\S]*?background: var\(--circle-surface\) !important;/
  );
  assert.match(homeStyles, /button:active:not\(:disabled\) \{[\s\S]*?transform: scale\(0\.96\) !important;/);
  assert.doesNotMatch(homeStyles, /transition:\s*all/);
});

test("actionable balance is one dark financial surface with on-dark semantics", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");
  const start = layer.lastIndexOf("/* Approved visual plan: one actionable balance surface. */");
  const end = layer.indexOf("/* Approved visual plan: distinct quick-expense intent chooser. */", start);
  const dashboardStyles = layer.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(
    dashboardStyles,
    /\.screen\[data-screen-kind="home"\] \.personal-dashboard,[\s\S]*?border-radius: 8px !important;[\s\S]*?background: var\(--circle-brand\) !important;[\s\S]*?box-shadow:[\s\S]*?inset 0 1px 0 rgba\(255, 255, 255, 0\.05\) !important;/
  );
  assert.match(
    dashboardStyles,
    /\.personal-balance-main \{[\s\S]*?border-inline-end: 1px solid rgba\(255, 255, 255, 0\.14\) !important;[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;/
  );
  assert.match(
    dashboardStyles,
    /\.personal-balance-details > div \{[\s\S]*?border-bottom: 1px solid rgba\(255, 255, 255, 0\.12\) !important;[\s\S]*?background: transparent !important;/
  );
  assert.match(dashboardStyles, /color: var\(--circle-positive-on-dark\) !important;/);
  assert.match(dashboardStyles, /color: var\(--circle-negative-on-dark\) !important;/);
  assert.match(dashboardStyles, /font-variant-numeric: tabular-nums;/);
});

test("quick expense purpose is a distinct two-choice intent selector", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");
  const mobileLayer = await readFile("src/publicMobileModalLayer.mjs", "utf8");
  const app = await readFile("src/app.mjs", "utf8");
  const start = layer.lastIndexOf("/* Approved visual plan: distinct quick-expense intent chooser. */");
  const end = layer.indexOf("/* Social Ledger v2: distinctive product surfaces and interaction polish. */", start);
  const purposeStyles = layer.slice(start, end);
  const earlierMobileSelector = "html.product-v2-live .expense-modal .quick-purpose-switch button";
  const finalButtonSelector =
    "html.circle-design-v1 .expense-modal.quick-expense-modal .quick-purpose-switch button";
  const classCount = (selector) => selector.match(/\.[a-z0-9_-]+/gi)?.length ?? 0;

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(app, /class="panel expense-modal quick-expense-modal"/);
  assert.ok(mobileLayer.includes(earlierMobileSelector));
  assert.match(
    mobileLayer,
    /html\.product-v2-live \.expense-modal \.quick-purpose-switch button,[\s\S]*?min-height: 44px !important;/
  );
  assert.ok(
    classCount(finalButtonSelector) > classCount(earlierMobileSelector),
    "the final quick-purpose selector must outrank the exact 44px mobile safeguard"
  );
  assert.match(
    purposeStyles,
    /\.quick-purpose-switch \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;[\s\S]*?gap: 8px !important;[\s\S]*?padding: 0 !important;[\s\S]*?border: 0 !important;[\s\S]*?background: transparent !important;/
  );
  assert.match(
    purposeStyles,
    /\.expense-modal\.quick-expense-modal \.quick-purpose-switch button \{[\s\S]*?min-height: 54px !important;[\s\S]*?border: 1px solid var\(--circle-line-strong\) !important;[\s\S]*?background: var\(--circle-surface\) !important;/
  );
  assert.match(
    purposeStyles,
    /\.expense-modal\.quick-expense-modal \.quick-purpose-switch button\.is-active \{[\s\S]*?color: #ffffff !important;[\s\S]*?background: var\(--circle-brand\) !important;/
  );
  assert.match(
    purposeStyles,
    /\.expense-modal\.quick-expense-modal \.quick-purpose-switch button:focus-visible \{[\s\S]*?outline-offset: 2px !important;/
  );
  assert.match(
    purposeStyles,
    /\.expense-modal\.quick-expense-modal \.quick-purpose-switch button:active:not\(:disabled\) \{[\s\S]*?transform: scale\(0\.96\) !important;/
  );
  assert.doesNotMatch(purposeStyles, /\.expense-mode-switch/);
  assert.doesNotMatch(purposeStyles, /transition:\s*all/);
});

test("social ledger v2 adds a distinctive polished product system", async () => {
  const layer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");
  const start = layer.lastIndexOf(
    "/* Social Ledger v2: distinctive product surfaces and interaction polish. */"
  );
  const end = layer.indexOf("@media (prefers-reduced-motion: reduce)", start);
  const socialLedgerStyles = layer.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(layer, /social-ledger-v2/);
  assert.match(layer, /--circle-coral: #f46f61/);
  assert.match(layer, /--circle-shadow-border:/);
  assert.match(layer, /icon-192\.png/);
  assert.match(socialLedgerStyles, /\.event-workspace-tab\.is-active/);
  assert.match(socialLedgerStyles, /\.expense-total-field \{[\s\S]*?inset 0 4px 0 var\(--circle-mint\)/);
  assert.match(socialLedgerStyles, /\.account-auth-brand \{[\s\S]*?background-image: url\("\.\/sogrim-home-hero\.png"\)/);
  assert.match(socialLedgerStyles, /outline: 1px solid oklch\(0 0 0 \/ 0\.1\)/);
  assert.match(socialLedgerStyles, /transform: translateY\(-1px\)/);
  assert.doesNotMatch(socialLedgerStyles, /transition:\s*all/);
});
