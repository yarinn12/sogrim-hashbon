import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("stylesheet includes premium interaction and motion foundations", async () => {
  const css = await readFile("styles.css", "utf8");

  assert.match(css, /\.brand::before/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@keyframes surface-in/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\[hidden\]\s*\{[\s\S]*?display:\s*none !important/);
  assert.match(css, /\.status-chip/);
  assert.match(css, /\.status-chip\.is-warn/);
  assert.match(css, /\.status-chip\.is-ok/);
  assert.match(css, /\.settlement-close-confirmation/);
  assert.match(css, /\.event-row-side/);
  assert.match(css, /\.avatar-stack/);
  assert.match(css, /\.avatar/);
  assert.match(css, /\.transfer-people/);
  assert.match(
    await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8"),
    /\.event-status-toggle \{[\s\S]*?min-height: 44px !important/
  );
});

test("public app uses a dedicated Hebrew UI font stack", async () => {
  const html = await readFile("index.html", "utf8");
  const css = await readFile("styles.css", "utf8");
  const app = await readFile("src/app.mjs", "utf8");
  const circleLayer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");

  assert.match(html, /fonts\.googleapis\.com/);
  assert.match(html, /family=Inter:wght@500;600;700;800;900/);
  assert.match(html, /family=Rubik:wght@400;500;600;700;800;900/);
  assert.doesNotMatch(html, /IBM\+Plex/);
  assert.match(html, /display=swap/);
  assert.match(css, /--font-hebrew: "Rubik", "Heebo", "Assistant", sans-serif/);
  assert.match(css, /--font-num: "Inter", "Rubik", sans-serif/);
  assert.match(html, /<body class="font-hebrew">/);
  assert.match(html, /id="app" class="app app-boot font-hebrew"/);
  assert.match(app, /class="screen font-hebrew/);
  assert.doesNotMatch(app, /<(?!span)[a-z][^>]*class="[^"]*font-num/);
  assert.match(circleLayer, /font-family: var\(--font-hebrew\)/);
  assert.match(circleLayer, /font-family: var\(--font-num\)/);
});

test("Hebrew font loading does not block the app from rendering", async () => {
  const html = await readFile("index.html", "utf8");
  const loader = await readFile("src/publicFontLoader.mjs", "utf8");

  assert.match(html, /rel="preload" href="https:\/\/fonts\.googleapis\.com/);
  assert.match(html, /as="style"/);
  assert.match(html, /id="app-font-stylesheet"[^>]*rel="stylesheet" media="print"/);
  assert.match(html, /src="\.\/src\/publicFontLoader\.mjs\?pwa_release=404"/);
  assert.doesNotMatch(html, /\son(?:load|error|click)=/i);
  assert.match(loader, /addEventListener\("load", activateFontStylesheet, \{ once: true \}\)/);
  assert.match(loader, /fontStylesheet\.media = "all"/);
  assert.match(html, /<noscript>[\s\S]*fonts\.googleapis\.com[\s\S]*<\/noscript>/);
});

test("event rows render participants and a quiet options chevron without status or financial clutter", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /class="event-row-main"/);
  assert.doesNotMatch(app, /event-row-attention/);
  assert.match(
    app,
    /renderAvatarStack\(participants\.map\(\(participant\) => participant\.id\), event, \{[\s\S]*?suppressParticipantAction: true[\s\S]*?\}\)/
  );
  assert.doesNotMatch(app, /event-row-balance amount/);
  assert.match(app, /class="event-row-options-chevron"/);
  assert.doesNotMatch(
    app.slice(app.indexOf("function renderEventRow(event)"), app.indexOf("function ensureNewEventDraft")),
    /status-chip|event-status-indicator|isEventClosed\(event\) \? "סגור" : "פתוח"/
  );
});

test("transfer rows render participant avatars and a visual direction", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /class="transfer-people"/);
  assert.match(app, /renderTransferParticipant\(event, transfer\.fromParticipantId/);
  assert.match(app, /class="transfer-arrow"/);
  assert.match(app, /renderTransferParticipant\(event, transfer\.toParticipantId/);
  assert.match(app, /renderAvatar\(participantId, event\)/);
});

test("event workspace has elevated action and modal styling", async () => {
  const css = await readFile("styles.css", "utf8");

  assert.match(css, /\.event-command-card::before/);
  assert.match(css, /\.event-command-card:hover::before/);
  assert.match(css, /\.summary-item::after/);
  assert.match(css, /\.event-modal::before/);
});

test("visual polish uses modern app surfaces instead of flat form styling", async () => {
  const css = await readFile("styles.css", "utf8");

  assert.match(css, /\.app::before/);
  assert.match(css, /--shadow-panel/);
  assert.match(css, /\.expense-guest-box/);
  assert.match(css, /\.primary-button::after/);
});

test("final design coherence layer keeps every screen in the home visual language", async () => {
  const html = await readFile("index.html", "utf8");
  const layer = await readFile("src/publicDesignCoherenceLayer.mjs", "utf8");
  const worker = await readFile("sw.js", "utf8");

  const pickerPosition = html.indexOf("publicChoicePickerLayer.mjs");
  const coherencePosition = html.indexOf("publicDesignCoherenceLayer.mjs");
  const dynamicTypePosition = html.indexOf("publicDynamicTypeLayer.mjs");

  assert.ok(coherencePosition > pickerPosition);
  assert.ok(dynamicTypePosition > coherencePosition);
  assert.match(layer, /--app-font-hebrew: "Rubik", "Heebo", "Assistant", sans-serif/);
  assert.match(layer, /--app-font-num: "Inter", "Rubik", sans-serif/);
  assert.match(layer, /--app-shadow-hero/);
  assert.match(layer, /\.screen:not\(\[data-screen-kind="home"\]\)/);
  assert.match(layer, /\.event-type-option/);
  assert.match(layer, /\.notification-inbox-item/);
  assert.match(layer, /\.event-modal/);
  assert.match(layer, /\.event-task-modal/);
  assert.match(layer, /\.event-settings-modal/);
  assert.match(layer, /\.event-share-modal/);
  assert.match(
    layer,
    /:is\(\.event-modal-header, \.expense-modal-header\) \.muted \{[\s\S]*?color: var\(--app-faint\) !important;/
  );
  assert.match(
    layer,
    /\.product-nav-button:not\(\.is-active\):not\(\[aria-current="page"\]\)[\s\S]*?color: var\(--app-muted\) !important;/
  );
  assert.match(
    layer,
    /\.transfer-status:not\(\.status-paid\) \{[\s\S]*?color: var\(--app-danger\) !important;/
  );
  assert.match(layer, /prefers-reduced-motion: reduce/);
  assert.match(worker, /"\/src\/publicDesignCoherenceLayer\.mjs"/);
});

test("event tools reuse compact app chrome instead of retired oversized modal styling", async () => {
  const [app, layer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicDesignCoherenceLayer.mjs", "utf8")
  ]);

  assert.match(app, /modalClass: "event-task-modal event-share-modal(?: [^"]+)?"/);
  assert.match(app, /modalClass: "event-task-modal event-settings-modal"/);
  assert.match(
    layer,
    /\.event-task-modal[\s\S]*?> \.event-modal-header[\s\S]*?min-height: 92px !important;[\s\S]*?background: var\(--app-surface\) !important;/
  );
  assert.match(
    layer,
    /\.event-settings-modal[\s\S]*?\.event-settings-menu-item \{[\s\S]*?min-height: 68px !important;[\s\S]*?border-radius: 0 !important;/
  );
  assert.match(
    layer,
    /Settings stay compact[\s\S]*?\.event-settings-modal[\s\S]*?\.modal-close-button \{[\s\S]*?border-color: transparent !important;[\s\S]*?border-radius: 50% !important;/
  );
  assert.match(
    layer,
    /\.event-settings-menu-item:nth-child\(5\)[\s\S]*?\.event-settings-menu-item\.is-danger[\s\S]*?border-top: 6px solid var\(--app-canvas\) !important;/
  );
  assert.match(
    layer,
    /\.event-settings-modal[\s\S]*?\.event-settings-menu-icon \{[\s\S]*?width: 32px !important;[\s\S]*?border: 0 !important;[\s\S]*?background: transparent !important;/
  );
  assert.match(
    layer,
    /\.event-share-modal[\s\S]*?:is\(\.event-share-choice, \.event-share-open\)[\s\S]*?border-radius: var\(--app-radius-panel\) !important;/
  );
});

test("final design coherence layer follows the restrained non-AI visual contract", async () => {
  const layer = await readFile("src/publicDesignCoherenceLayer.mjs", "utf8");
  const approvedHeroStart = layer.indexOf("/* Preserve the approved, fully finished green hero treatment across the app. */");
  const approvedHeroEnd = layer.indexOf("/* End approved green hero finish. */");

  assert.ok(approvedHeroStart >= 0);
  assert.ok(approvedHeroEnd > approvedHeroStart);

  const approvedHero = layer.slice(approvedHeroStart, approvedHeroEnd);
  const genericLayer = `${layer.slice(0, approvedHeroStart)}${layer.slice(approvedHeroEnd)}`;

  assert.match(layer, /--app-canvas: #f8fafc/);
  assert.match(layer, /--app-surface: #ffffff/);
  assert.match(layer, /--app-line: #e2e8f0/);
  assert.match(layer, /--app-radius-card: 10px/);
  assert.match(layer, /--app-radius-panel: 12px/);
  assert.match(layer, /--app-shadow-card: 0 1px 3px rgba\(15, 23, 42, 0\.05\)/);
  assert.match(approvedHero, /linear-gradient\(136deg, #071f18 0%, #0b4a38 58%, #0f6b50 100%\)/);
  assert.match(approvedHero, /border-radius: 24px !important/);
  assert.match(approvedHero, /animation: ledger-home-shimmer 6\.4s/);
  assert.doesNotMatch(genericLayer, /(?:linear|radial|conic)-gradient/i);
  assert.doesNotMatch(genericLayer, /backdrop-filter:\s*blur/i);
  assert.doesNotMatch(genericLayer, /font-weight:\s*(?:7\d{2}|8\d{2})/);
  assert.doesNotMatch(genericLayer, /border-radius:\s*(?:1[3-9]|[2-9]\d)px/);
});

test("narrow headers keep profile and route controls at the 44px touch floor", async () => {
  const layer = await readFile("src/publicDesignCoherenceLayer.mjs", "utf8");
  const narrow = layer.slice(layer.indexOf("@media (max-width: 340px)"));

  assert.match(
    narrow,
    /\.product-header-profile-avatar \{[\s\S]*?width: 44px !important;[\s\S]*?height: 44px !important;/
  );
  assert.match(
    layer,
    /\.product-header-profile-avatar \{[\s\S]*?padding: 0 !important;[\s\S]*?overflow: hidden !important;/
  );
  assert.match(
    narrow,
    /\.product-route-controls > \.app-back-button,[\s\S]*?\.product-route-controls > \.product-home-button \{[\s\S]*?width: 44px !important;[\s\S]*?height: 44px !important;/
  );
});
