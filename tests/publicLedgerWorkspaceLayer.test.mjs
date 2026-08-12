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
  assert.match(layer, /--font-hebrew: "Rubik", "Heebo", "Assistant", sans-serif/);
  assert.match(layer, /--font-num: "Inter", "Rubik", sans-serif/);
  assert.match(layer, /font-family: var\(--font-hebrew\)/);
  assert.match(layer, /font-family: var\(--font-num\)/);
  assert.match(layer, /body\.font-hebrew[\s\S]*?:not\(\.font-num\):not\(\.font-num \*\)/);
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

test("all primary screen heroes reuse the approved home finish", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(layer, /Shared premium hero finish/);
  assert.match(layer, /--ledger-hero-surface:/);
  assert.match(layer, /--ledger-hero-shadow:/);
  assert.match(
    layer,
    /\.screen:not\(\[data-screen-kind="home"\]\)[\s\S]*?> \.top::after \{[\s\S]*?animation: ledger-home-shimmer 6\.4s/
  );
  assert.match(
    layer,
    /\.screen:not\(\[data-screen-kind="home"\]\)[\s\S]*?> \.top[\s\S]*?\.hero-actions \{[\s\S]*?background: transparent !important/
  );
});

test("approved mobile reference drives the home hero, shortcuts, event ledger, and app nav", async () => {
  const [app, layer, brand] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8"),
    readFile("src/publicBrandLayer.mjs", "utf8")
  ]);

  assert.match(layer, /Mobile-first 2026 home experience/);
  assert.match(layer, /linear-gradient\(136deg, #071f18 0%, #0b4a38 58%, #0f6b50 100%\)/);
  assert.match(
    layer,
    /html\.ledger-workspace-v1\.circle-design-v1[\s\S]{0,180}\.top::after \{[\s\S]{0,700}clip-path: inset\(0 round 24px\) !important;[\s\S]{0,300}animation: ledger-home-shimmer 6\.4s/
  );
  assert.match(layer, /\.home-event-tools\.home-invite-hub[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(layer, /\.event-list \{[\s\S]*?background: transparent !important/);
  assert.match(layer, /\.event-row-attention > span \{[\s\S]*?var\(--ledger-warning\)/);
  assert.match(layer, /\.product-app-nav \{[\s\S]*?border-radius: 999px !important/);
  assert.match(layer, /width: min\(100%, 448px\) !important/);
  assert.match(layer, /Home event index: a compact ledger row, not a stack of generic cards/);
  assert.match(layer, /grid-template-columns: minmax\(0, 1fr\) 84px !important/);
  assert.match(layer, /grid-template-columns: 82px minmax\(0, 1fr\) !important/);
  assert.match(layer, /\.event-row \.avatar-stack \{[\s\S]*?grid-column: 1 !important/);
  assert.match(layer, /\.event-row \.avatar-stack \{[\s\S]*?width: 88px !important/);
  assert.match(
    layer,
    /@media \(max-width: 720px\)[\s\S]*?grid-template-columns: 82px minmax\(0, 1fr\) 76px !important/
  );
  assert.match(
    layer,
    /@media \(max-width: 380px\)[\s\S]*?grid-template-columns: 74px minmax\(0, 1fr\) 68px !important/
  );
  assert.match(layer, /\.event-row-main \{[\s\S]*?grid-column: 2 !important/);
  assert.match(layer, /\.event-status-toggle \{[\s\S]*?position: static !important/);
  assert.match(layer, /\.event-row-meta \{[\s\S]*?font-family: var\(--font-hebrew\) !important/);
  assert.match(layer, /\.product-app-identity \{[\s\S]*?flex-direction: row !important/);
  assert.match(
    layer,
    /Route chrome stays clear of the task[\s\S]*?\.product-app-identity \{[\s\S]*?position: relative !important;[\s\S]*?top: auto !important/
  );
  assert.match(
    layer,
    /\.screen:not\(\[data-screen-kind="home"\]\)[\s\S]*?\.app-back-button:not\(:disabled\) \{[\s\S]*?visibility: visible !important;[\s\S]*?pointer-events: auto !important/
  );
  assert.match(
    layer,
    /Back is a persistent route control[\s\S]*?position: fixed !important;[\s\S]*?safe-area-inset-top[\s\S]*?z-index: 70 !important/
  );
  assert.match(
    layer,
    /\.product-route-controls[\s\S]*?> \.app-back-button:disabled \{[\s\S]*?display: inline-grid !important;[\s\S]*?visibility: visible !important/
  );
  assert.match(
    layer,
    /html\.ledger-workspace-v1\.circle-design-v1 \.product-app-identity \{[\s\S]*?width: 100% !important;[\s\S]*?margin: 0 !important;/
  );
  assert.match(
    layer,
    /Match the mobile screen gutter exactly[\s\S]*?width: calc\(100% \+ 28px\) !important;[\s\S]*?margin-inline: -14px !important;[\s\S]*?width: calc\(100% \+ 24px\) !important;[\s\S]*?margin-inline: -12px !important;/
  );
  assert.match(layer, /filter: drop-shadow\(0 5px 7px rgba\(11, 74, 56, 0\.22\)\) !important/);
  assert.doesNotMatch(app, /function renderHomeEventTools/);
  assert.match(app, /data-action="join-existing-event"/);
  assert.doesNotMatch(app, /data-action="home-share-event"/);
  assert.match(layer, /\.home-invite-shortcuts/);
  assert.match(
    app,
    /renderAvatarStack\(participants\.map\(\(participant\) => participant\.id\), event\)/
  );
  assert.match(brand, /syncHeaderIdentity/);
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
    /Expenses are the event's default workspace[\s\S]*?\.event-workspace-nav \{[\s\S]*?grid-template-columns: minmax\(0, 1\.22fr\) minmax\(0, 0\.78fr\) !important/
  );
  assert.match(
    layer,
    /Expenses are the event's default workspace[\s\S]*?\.event-workspace-expenses \{[\s\S]*?min-height: 56px !important[\s\S]*?\.event-workspace-summary \{[\s\S]*?background: #ffffff !important/
  );
  assert.match(
    layer,
    /\.event-workspace-summary:active:not\(:disabled\) \{[\s\S]*?transform: scale\(0\.96\) !important/
  );
  assert.match(
    layer,
    /\.event-workspace-summary-copy small \{[\s\S]*?white-space: nowrap !important/
  );
  assert.match(layer, /\.event-invite-pass\.is-error/);
  assert.match(layer, /\.event-invite-recovery \{/);
  assert.match(
    layer,
    /\.event-invite-recovery > button \{[\s\S]*?min-height: 44px !important/
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
    /@media \(max-width: 720px\)[\s\S]*?\.account-profile-actions \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/
  );
  assert.match(layer, /\.account-danger-zone \{[\s\S]*?border-top-color: var\(--ledger-line\) !important/);
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
    /\.event-action-dock \{[\s\S]*?inset-block-end: calc\(max\(12px, env\(safe-area-inset-bottom\)\) \+ 76px\) !important/
  );
  assert.match(
    layer,
    /@media \(max-width: 720px\)[\s\S]*?\.event-action-dock \{[\s\S]*?inset-block-end: calc\(max\(10px, env\(safe-area-inset-bottom\)\) \+ 80px\) !important/
  );
  assert.match(
    layer,
    /\.screen \{[\s\S]*?padding-bottom: calc\(140px \+ env\(safe-area-inset-bottom\)\) !important;[\s\S]*?\.screen\.event-has-action-dock \{[\s\S]*?padding-bottom: calc\(140px \+ env\(safe-area-inset-bottom\)\) !important/
  );
  assert.match(
    layer,
    /Keep the event's primary action visible without covering expense content[\s\S]*?\.event-action-dock \{[\s\S]*?position: relative !important;[\s\S]*?inset: auto !important;[\s\S]*?width: 100% !important;[\s\S]*?transform: none !important/
  );
  assert.match(
    layer,
    /scroll-padding-block-end: calc\(118px \+ env\(safe-area-inset-bottom\)\) !important/
  );
  assert.match(
    layer,
    /\.profile-setup-panel > \[data-action=.?save-profile.?\][\s\S]*?scroll-margin-block-end: calc\(112px/
  );
  assert.match(
    layer,
    /\.event-action-total > span:first-child,[\s\S]*?\.event-action-sync \{[\s\S]*?color: var\(--ledger-muted\) !important/
  );
  assert.match(
    layer,
    /\.event-action-total \.amount \{[\s\S]*?color: var\(--ledger-brand\) !important/
  );
  assert.match(
    layer,
    /@media \(max-width: 360px\)[\s\S]*?\.expense-modal-actions \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/
  );
});

test("approved visual language governs focused product screens", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(layer, /approved home language now governs every focused product screen/);
  assert.ok(
    layer.includes(
      '.screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)'
    )
  );
  assert.ok(layer.includes("linear-gradient(136deg, #071f18 0%, #0b4a38 58%, #0f6b50 100%)"));
  assert.match(
    layer,
    /\.expense-modal-header,[\s\S]*?background:[\s\S]*?linear-gradient\(136deg, #071f18 0%, #0b4a38 64%, #0f6b50 100%\)/
  );
  assert.match(layer, /\.groups-overview-screen \.group-row,[\s\S]*?border-radius: 17px !important/);
  assert.match(layer, /\.profile-setup-panel,[\s\S]*?border-radius: 20px !important/);
  assert.match(
    layer,
    /html\.ledger-workspace-v1\.circle-design-v1 \.settlement-screen \.settlement-hero \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/
  );
});

test("final route polish keeps every screen on the home width and surface system", async () => {
  const [app, layer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(layer, /Final consistency pass: every route now speaks the approved home language/);
  assert.match(
    layer,
    /\.screen,\s*\n\s*html\.ledger-workspace-v1 \.friends-hub-screen \{[\s\S]*?max-width: 448px !important/
  );
  assert.match(
    layer,
    /\.screen:not\(\[data-screen-kind="home"\]\):not\(\[data-product-screen="home"\]\):not\(\.product-home-screen\)[\s\S]*?> \.top,[\s\S]*?border-radius: 24px !important;[\s\S]*?background: var\(--ledger-brand\) !important;[\s\S]*?0 28px 62px -30px rgba\(6, 54, 40, 0\.78\)/
  );
  assert.match(
    layer,
    /\.friends-hub-tabs \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important/
  );
  assert.match(
    layer,
    /\.friends-hub-tab\.is-active \{[\s\S]*?background: var\(--ledger-accent-soft\) !important/
  );
  assert.match(
    layer,
    /\.groups-list-section > \.stack \{[\s\S]*?border-radius: var\(--ledger-task-radius\) !important/
  );
  assert.match(
    layer,
    /\.groups-list-section > \.stack\.is-empty \{[\s\S]*?border: 0 !important;[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important/
  );
  assert.match(
    layer,
    /dynamic-type-extra-large[\s\S]*?:is\(\.friends-hub-tabs, \.event-workspace-nav\) \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/
  );
  assert.match(app, /data-screen-kind="\$\{isEditingProfile \? "profile" : "profile-setup"\}"/);
});

test("focused dialogs remain scrollable after visual polish", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(
    layer,
    /\.expense-modal,[\s\S]*?\.event-modal \{[\s\S]*?overflow-x: hidden !important;[\s\S]*?overflow-y: auto !important;[\s\S]*?overscroll-behavior: contain !important/
  );
  assert.match(
    layer,
    /\.expense-template-grid \{[\s\S]*?scroll-padding-inline: 20px !important;[\s\S]*?mask-image: none !important/
  );
});

test("focused inbox and settings use the home surface system", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(
    layer,
    /Focused windows and the inbox inherit the same compact home surface system/
  );
  assert.match(
    layer,
    /\.notification-inbox-header[\s\S]*?> \.notification-mark-all \{[\s\S]*?grid-area: actions !important;[\s\S]*?background: #ffffff !important/
  );
  assert.match(
    layer,
    /\.notification-inbox-panel \{[\s\S]*?border-radius: var\(--ledger-task-radius\) !important;[\s\S]*?box-shadow: var\(--ledger-task-shadow\) !important/
  );
  assert.match(
    layer,
    /\.profile-setup-panel[\s\S]*?> \.notification-inbox-entry \{[\s\S]*?border-radius: 0 !important;[\s\S]*?background: transparent !important/
  );
  assert.match(
    layer,
    /\.event-settings-menu \{[\s\S]*?gap: 0 !important;[\s\S]*?overflow: hidden !important;[\s\S]*?border-radius: var\(--ledger-task-radius\) !important/
  );
  assert.match(
    layer,
    /\.event-settings-menu-item \{[\s\S]*?border-bottom: 1px solid var\(--ledger-line\) !important;[\s\S]*?border-radius: 0 !important/
  );
  assert.match(
    layer,
    /dynamic-type-extra-large[\s\S]*?\.notification-inbox-item-heading \{[\s\S]*?display: grid !important/
  );
  assert.match(
    layer,
    /dynamic-type-extra-large[\s\S]*?\.event-modal-actions[\s\S]*?> button \{[\s\S]*?width: 100% !important/
  );
  assert.match(
    layer,
    /@media \(max-width: 520px\)[\s\S]*?\.event-modal \{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\) !important;[\s\S]*?overflow: hidden !important/
  );
  assert.match(
    layer,
    /@media \(max-width: 520px\)[\s\S]*?\.event-modal-body \{[\s\S]*?display: flex !important;[\s\S]*?overflow-y: auto !important/
  );
  assert.match(
    layer,
    /\.event-modal-actions > \.secondary-button \{[\s\S]*?border: 1px solid var\(--ledger-line-strong\) !important;[\s\S]*?background: var\(--ledger-surface-soft\) !important/
  );
  assert.match(
    layer,
    /\.event-modal-actions > button:only-child \{[\s\S]*?width: 100% !important/
  );
});

test("all focused task windows inherit the home design system", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(
    layer,
    /Every focused task window speaks the same visual language as home/
  );
  assert.match(
    layer,
    /:is\([\s\S]*?\.app-choice-picker,[\s\S]*?\.account-feedback-dialog,[\s\S]*?\.install-app-dialog,[\s\S]*?\.referral-dialog-shell[\s\S]*?background: var\(--ledger-canvas\) !important;[\s\S]*?box-shadow: 0 28px 78px/
  );
  assert.match(
    layer,
    /:is\([\s\S]*?\.app-choice-picker-header,[\s\S]*?\.account-feedback-header,[\s\S]*?\.install-app-dialog > header,[\s\S]*?\.referral-dialog-header[\s\S]*?background: var\(--ledger-brand\) !important/
  );
  assert.match(
    layer,
    /\.app-choice-options \{[\s\S]*?gap: 0 !important;[\s\S]*?border: 1px solid var\(--ledger-line\) !important;[\s\S]*?box-shadow: var\(--ledger-task-shadow\) !important/
  );
  assert.match(
    layer,
    /\.app-choice-option \{[\s\S]*?border-bottom: 1px solid var\(--ledger-line\) !important;[\s\S]*?border-radius: 0 !important/
  );
  assert.match(
    layer,
    /\.referral-dialog-content \{[\s\S]*?align-content: start !important/
  );
  assert.match(
    layer,
    /\.referral-state-message \{[\s\S]*?grid-auto-rows: auto !important/
  );
  assert.match(
    layer,
    /@media \(max-width: 760px\) \{[\s\S]*?\.app-choice-picker,[\s\S]*?\.account-feedback-dialog,[\s\S]*?\.install-app-dialog,[\s\S]*?\.referral-dialog-shell[\s\S]*?height: 100dvh !important;[\s\S]*?border-radius: 0 !important/
  );
  assert.match(
    layer,
    /dynamic-type-extra-large[\s\S]*?:is\(\.account-feedback-categories, \.account-feedback-actions, \.referral-share-actions\) \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/
  );
});

test("settlement transfers stay compact and scannable on mobile", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(
    layer,
    /Compact transfer ledger[\s\S]*?\.transfer-row \{[\s\S]*?padding: 12px !important/
  );
  assert.match(
    layer,
    /\.transfer-people \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 24px minmax\(0, 1fr\) !important/
  );
  assert.match(layer, /\.transfer-party-label \{[\s\S]*?display: none !important/);
  assert.match(layer, /\.transfer-arrow::before \{[\s\S]*?content: "←" !important/);
  assert.match(layer, /\.transfer-actions > button \{[\s\S]*?min-width: 108px !important/);
  assert.match(layer, /\.transfer-status\.status-paid::before \{[\s\S]*?content: "✓" !important/);
  assert.match(layer, /\.transfer-row\.is-personal-payer/);
  assert.match(layer, /\.personal-transfer-badge/);
  assert.match(
    layer,
    /\.transfer-participant-copy strong \{[\s\S]*?white-space: normal !important;[\s\S]*?overflow-wrap: anywhere !important/
  );
  assert.match(
    layer,
    /grid-template-areas:\s*"people people"\s*"meta actions"\s*"explanation explanation" !important/
  );
  assert.match(
    layer,
    /\.transfer-main \{\s*display: contents !important/
  );
  assert.match(
    layer,
    /@media \(max-width: 380px\) \{[\s\S]*?grid-template-areas:\s*"people"\s*"meta"\s*"actions"\s*"explanation" !important/
  );
  assert.doesNotMatch(
    layer,
    /\.settlement-transfer-board \.transfer-row\.is-paid \{[^}]*opacity:/
  );
});

test("personal pending settlement reveals the first transfer on mobile", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(
    layer,
    /@media \(max-width: 720px\) \{[\s\S]*?Surface the first personal transfer in the initial mobile viewport/
  );
  assert.match(
    layer,
    /\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\.settlement-hero-total \{[\s\S]*?display: none !important/
  );
  assert.match(
    layer,
    /\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\.settlement-hero-actions \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/
  );
  assert.match(
    layer,
    /\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\.settlement-hero-actions[\s\S]*?:is\(\.primary-button, \.secondary-button\) \{[\s\S]*?min-height: 44px !important/
  );
  assert.match(
    layer,
    /\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\.settlement-hero-actions[\s\S]*?> \.primary-button \{[\s\S]*?grid-column: auto !important/
  );
  assert.match(
    layer,
    /\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\.settlement-more-actions \{[\s\S]*?grid-column: 1 \/ -1 !important/
  );
  assert.match(
    layer,
    /\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\+ \.settlement-stage \{[\s\S]*?margin-top: 8px !important;[\s\S]*?padding-block: 14px !important/
  );
  assert.match(
    layer,
    /\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\+ \.settlement-stage[\s\S]*?\.settlement-stage-heading \{[\s\S]*?flex-direction: row !important;[\s\S]*?align-items: center !important;[\s\S]*?gap: 8px !important;[\s\S]*?margin-bottom: 4px !important/
  );
  assert.match(
    layer,
    /\.settlement-stage-heading[\s\S]*?> div \{[\s\S]*?min-width: 0 !important/
  );
  assert.match(
    layer,
    /\.settlement-progress-chip \{[\s\S]*?flex: 0 0 auto !important;[\s\S]*?max-width: 100% !important/
  );
  assert.match(
    layer,
    /\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\+ \.settlement-stage[\s\S]*?\.settlement-stage-heading[\s\S]*?\.muted \{[\s\S]*?display: none !important/
  );
  assert.match(
    layer,
    /\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\+ \.settlement-stage[\s\S]*?\.settlement-offline-note \{[\s\S]*?display: none !important/
  );
  assert.match(
    layer,
    /\.transfer-participant \.participant-connection-badge \{/
  );
  assert.match(
    layer,
    /@media \(max-width: 360px\) \{[\s\S]*?\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\.settlement-stage-heading \{[\s\S]*?align-items: flex-start !important;[\s\S]*?flex-wrap: wrap !important/
  );
  assert.doesNotMatch(
    layer,
    /html\.ledger-workspace-v1 \.settlement-offline-note\s*\{\s*display: none !important/
  );
  assert.doesNotMatch(
    layer,
    /\.settlement-hero:(?:not|is)\([^)]*is-pending[^)]*\)[\s\S]*?\.settlement-hero-total \{[\s\S]*?display: none/
  );
  assert.match(
    layer,
    /\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\.settlement-hero-main \{[\s\S]*?display: flex !important/
  );
  assert.match(
    layer,
    /\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\.settlement-hero-actions \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) auto !important/
  );
  assert.match(
    layer,
    /\.settlement-hero\.is-pending\.is-personal-pending[\s\S]*?\.settlement-more-actions\[open\] \{[\s\S]*?grid-column: 1 \/ -1 !important/
  );
  assert.match(
    layer,
    /\.transfer-explanation > summary \{[\s\S]*?min-height: 44px !important/
  );
  assert.match(
    layer,
    /\.expense-actions :is\(\.secondary-button, \.danger-button\) \{[\s\S]*?min-width: 44px !important;[\s\S]*?min-height: 44px !important/
  );
  assert.match(
    layer,
    /\.expense-modal-step-header \{[\s\S]*?grid-template-columns: 48px minmax\(0, 1fr\) 48px !important/
  );
  assert.match(
    layer,
    /\.expense-modal-step-header[\s\S]*?:is\(\.modal-section-back-button, \.modal-close-button\) \{[\s\S]*?min-width: 48px !important;[\s\S]*?min-height: 44px !important/
  );
  assert.match(
    layer,
    /\.profile-avatar-options \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important/
  );
});

test("core task screens use a distilled progressive-disclosure layer", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(layer, /Distilled task surfaces: one clear next action/);
  assert.match(layer, /\.screen\[data-screen-kind="event"\] > \.top \{[\s\S]*?min-height: 140px !important/);
  assert.match(layer, /\.event-personal-balance-copy > small \{[\s\S]*?display: none !important/);
  assert.match(layer, /\.event-action-total > span:first-child \{[\s\S]*?display: none !important/);
  assert.match(layer, /\.expense-row-actions-menu > summary/);
  assert.match(layer, /\.expense-actions \{[\s\S]*?display: flex !important;[\s\S]*?flex-wrap: nowrap !important/);
  assert.match(layer, /\.expense-row-actions-icon \{[\s\S]*?width: 18px !important;[\s\S]*?fill: currentColor !important/);
  assert.match(layer, /\.expense-row-actions-menu\[open\] > summary \{[\s\S]*?background: var\(--ledger-brand\) !important/);
  assert.match(layer, /\.expense-row:has\(\.expense-row-actions-menu\[open\]\) \{[\s\S]*?z-index: 24 !important/);
  assert.match(layer, /\.expense-row-actions-menu > div \{[\s\S]*?z-index: 25 !important/);
  assert.match(layer, /\.settlement-hero:has\(\.settlement-more-actions\[open\]\) \{[\s\S]*?z-index: 30 !important;[\s\S]*?overflow: visible !important/);
  assert.match(layer, /\.settlement-more-actions > div \{[\s\S]*?position: absolute !important/);
  assert.match(layer, /\.referral-reward-card\.is-home[\s\S]*?grid-template-columns: 40px minmax\(0, 1fr\) auto !important/);
  assert.match(
    layer,
    /\.profile-avatar-options \{[\s\S]*?display: grid !important;[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important;[\s\S]*?overflow: visible !important;/
  );
  assert.match(layer, /\.friends-toolbar \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto !important/);
});

test("distilled task surfaces keep mobile controls reachable and narrow rows readable", async () => {
  const layer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(layer, /:is\(h1, h2, h3\)\[tabindex="-1"\]:focus \{[\s\S]*?outline: none !important/);
  assert.match(layer, /\.event-header-actions button \{[\s\S]*?min-height: 44px !important/);
  assert.match(layer, /\.event-workspace-tab \{[\s\S]*?min-height: 44px !important/);
  assert.match(layer, /\.expense-row-actions-menu > summary \{[\s\S]*?width: 44px !important;[\s\S]*?height: 44px !important/);
  assert.match(layer, /\.expense-participants-details > summary \{[\s\S]*?min-height: 44px !important/);
  assert.match(layer, /\.event-invite-rotate-button \{[\s\S]*?min-height: 44px !important/);
  assert.match(layer, /\.referral-reward-card\.is-home > button \{[\s\S]*?min-height: 44px !important/);
  assert.match(layer, /@media \(max-width: 380px\)[\s\S]*?\.event-row-open \{[\s\S]*?grid-template-columns: 70px minmax\(0, 1fr\) !important/);
});
