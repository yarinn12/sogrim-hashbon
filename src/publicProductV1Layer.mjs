const STYLE_ID = "public-product-v1-layer-style";
const RETIRED_STYLE_IDS = [
  "public-visual-refresh-layer-style",
  "public-premium-visual-layer-style",
  "public-fintech-design-layer-style",
  "sogrim-live-ledger-skin"
];
const RETIRED_ROOT_CLASSES = [
  "visual-refresh-v3",
  "premium-visual-v1",
  "fintech-design-v1",
  "fintech-design-v2",
  "sogrim-live-ledger",
  "live-ledger-force-v2"
];
const CLUTTER_SELECTORS = [
  ".product-context-bar",
  ".product-home-kicker",
  ".product-event-command",
  ".product-sticky-actions",
  ".product-hero-note"
];

let productV1Scheduled = false;

function installProductV1Layer() {
  enhanceProductV1();

  if (!document.body) return;

  new MutationObserver(scheduleProductV1Enhancement).observe(document.body, {
    childList: true,
    subtree: true
  });
}

function scheduleProductV1Enhancement() {
  if (productV1Scheduled) return;
  productV1Scheduled = true;

  requestAnimationFrame(() => {
    productV1Scheduled = false;
    enhanceProductV1();
  });
}

function enhanceProductV1() {
  removeRetiredVisualStyles();
  removeClutter();

  const screen = document.querySelector("#app .screen");
  if (!screen) return;

  screen.dataset.productScreen = detectScreenKind(screen);
}

function removeRetiredVisualStyles() {
  for (const id of RETIRED_STYLE_IDS) {
    document.getElementById(id)?.remove();
  }

  document.documentElement.classList.remove(...RETIRED_ROOT_CLASSES);
}

function removeClutter() {
  for (const selector of CLUTTER_SELECTORS) {
    document.querySelectorAll(selector).forEach((element) => element.remove());
  }
}

function detectScreenKind(screen) {
  if (screen.matches(".profile-setup-screen") || screen.querySelector('[data-action="save-profile"]')) {
    return "profile";
  }

  if (screen.querySelector('[data-action="create-event"]')) return "new-event";
  if (screen.querySelector('[data-action="join-existing-event"]')) return "join-event";
  if (screen.querySelector('[data-action="create-group"]')) return "groups";
  if (screen.querySelector('[data-action="copy-settlement"]')) return "settlement";
  if (screen.querySelector(".event-workspace-nav, .event-command-grid, .event-insight-panel")) {
    return "event";
  }

  if (screen.querySelector('[data-action="new-event"]')) return "home";
  return "general";
}

function injectProductV1Styles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(PRODUCT_V1_CSS));
  document.head.append(style);
}

const PRODUCT_V1_CSS = `
  html.product-v1 {
    --p1-bg: #f8faf7;
    --p1-bg-soft: #eef5f1;
    --p1-surface: #ffffff;
    --p1-surface-warm: #fffdfa;
    --p1-ink: #111513;
    --p1-muted: #68726d;
    --p1-faint: #8a948f;
    --p1-line: rgba(17, 21, 19, 0.1);
    --p1-line-strong: rgba(17, 21, 19, 0.18);
    --p1-primary: #08786f;
    --p1-primary-strong: #04564f;
    --p1-primary-soft: #e3f3ef;
    --p1-hero-start: #061f1d;
    --p1-hero-mid: #083d38;
    --p1-hero-end: #08786f;
    --p1-warm: #c56a45;
    --p1-warm-soft: #fff1e8;
    --p1-gold: #aa7b24;
    --p1-sky: #2e6f95;
    --p1-radius: 8px;
    --p1-shadow-low: 0 8px 24px rgba(17, 21, 19, 0.06);
    --p1-shadow-card: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 12px 34px rgba(17, 21, 19, 0.07);
    --p1-shadow-high: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 28px 76px rgba(17, 21, 19, 0.14);
    --p1-motion: 180ms cubic-bezier(0.22, 1, 0.36, 1);
    color: var(--p1-ink);
  }

  html.product-v1 body {
    min-height: 100vh;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 247, 0.98) 38%, #f4f8f4 100%),
      radial-gradient(circle at 88% 10%, rgba(8, 120, 111, 0.12), transparent 28%),
      radial-gradient(circle at 12% 16%, rgba(197, 138, 40, 0.1), transparent 22%),
      radial-gradient(circle at 26% 86%, rgba(46, 111, 149, 0.08), transparent 26%);
    color: var(--p1-ink);
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  html.product-v1 .app::before,
  html.product-v1 .screen > .top::before,
  html.product-v1 .screen > .top::after,
  html.product-v1 .brand::before,
  html.product-v1 .brand::after,
  html.product-v1 .primary-button::after,
  html.product-v1 .event-command-card::before,
  html.product-v1 .summary-item::after {
    content: none !important;
    display: none !important;
  }

  html.product-v1 .screen {
    width: min(100%, 1160px);
    display: grid;
    gap: 18px;
    padding: clamp(14px, 3vw, 28px);
    animation: product-v1-enter 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  html.product-v1 .product-app-identity {
    position: sticky;
    top: 10px;
    z-index: 20;
    margin: 0 0 8px;
    padding: 8px 10px;
    border: 1px solid rgba(17, 21, 19, 0.08);
    border-radius: var(--p1-radius);
    background: rgba(255, 255, 255, 0.72);
    box-shadow: 0 12px 34px rgba(17, 21, 19, 0.06);
    backdrop-filter: blur(18px);
  }

  html.product-v1 .product-app-nav {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  html.product-v1 .product-nav-button {
    border-color: rgba(17, 21, 19, 0.09);
    background: rgba(255, 255, 255, 0.78);
  }

  html.product-v1 .product-brand-lockup {
    gap: 10px;
  }

  html.product-v1 .product-brand-mark {
    width: 42px;
    height: 42px;
    border-radius: var(--p1-radius);
    background: linear-gradient(145deg, var(--p1-primary), var(--p1-primary-strong));
    box-shadow: 0 10px 22px rgba(8, 120, 111, 0.18);
    font-size: 23px;
  }

  html.product-v1 .product-brand-symbol {
    width: 32px;
    height: 32px;
  }

  html.product-v1 .product-brand-mark::after {
    content: none !important;
    display: none !important;
  }

  html.product-v1 .product-brand-copy strong {
    color: var(--p1-ink);
    font-size: clamp(22px, 2.6vw, 30px);
    font-weight: 900;
    letter-spacing: 0;
  }

  html.product-v1 .product-brand-copy small {
    color: var(--p1-muted);
    font-size: 0.82rem;
    font-weight: 750;
  }

  html.product-v1 .screen > .top {
    position: relative;
    min-height: clamp(150px, 18vw, 220px) !important;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 18px;
    align-items: end;
    margin: 0;
    padding: clamp(20px, 3.4vw, 38px);
    color: #fffdf8 !important;
    background:
      linear-gradient(125deg, rgba(255, 224, 163, 0.14), transparent 34%),
      linear-gradient(145deg, var(--p1-hero-start) 0%, var(--p1-hero-mid) 48%, var(--p1-hero-end) 118%);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: var(--p1-radius);
    box-shadow:
      0 28px 62px rgba(8, 35, 32, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
    overflow: hidden;
  }

  html.product-v1 .screen > .top::before {
    content: "" !important;
    display: block !important;
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
    background-size: 58px 58px;
    opacity: 0.5;
  }

  html.product-v1 .screen > .top::after {
    content: "" !important;
    display: block !important;
    position: absolute;
    inset-inline: 34px;
    bottom: 0;
    height: 4px;
    pointer-events: none;
    border-radius: 8px 8px 0 0;
    background: linear-gradient(90deg, var(--p1-primary), #f1d18e, var(--p1-warm));
  }

  html.product-v1 .screen > .top .app-back-button {
    grid-column: 1;
    grid-row: 1;
    position: relative;
    z-index: 1;
    align-self: start;
    background: rgba(255, 255, 255, 0.92);
    color: var(--p1-ink);
  }

  html.product-v1 .screen[data-product-screen="home"] .app-back-button,
  html.product-v1 .screen[data-product-screen="home"] .product-home-button {
    display: none !important;
  }

  html.product-v1 .screen > .top .brand {
    grid-column: 2;
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 780px;
    padding: 0 !important;
  }

  html.product-v1 .screen[data-product-screen="home"] > .top .brand {
    grid-column: 1 / -1;
  }

  html.product-v1 .brand h1,
  html.product-v1 h1 {
    max-width: 100%;
    margin: 0;
    color: var(--p1-ink);
    font-size: clamp(29px, 4vw, 48px);
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: 0;
  }

  html.product-v1 .screen > .top h1 {
    color: #fffdf8;
    text-shadow: 0 16px 36px rgba(0, 0, 0, 0.22);
  }

  html.product-v1 .eyebrow,
  html.product-v1 .screen > .top .eyebrow {
    margin: 0 0 8px;
    color: var(--p1-primary);
    font-size: 0.78rem;
    font-weight: 900;
  }

  html.product-v1 .screen > .top .eyebrow {
    color: #ffe0a3;
  }

  html.product-v1 .muted,
  html.product-v1 .screen > .top .muted {
    color: var(--p1-muted);
    font-weight: 650;
    line-height: 1.55;
  }

  html.product-v1 .screen > .top .muted {
    color: rgba(255, 255, 255, 0.78);
    font-weight: 760;
  }

  html.product-v1 .hero-actions,
  html.product-v1 .actions,
  html.product-v1 .inline-actions {
    gap: 10px;
  }

  html.product-v1 .hero-actions {
    display: grid;
    grid-template-columns: minmax(200px, 1.25fr) repeat(2, minmax(150px, 0.9fr));
    padding: 0;
    background: transparent;
    backdrop-filter: none;
  }

  html.product-v1 .primary-button,
  html.product-v1 .secondary-button,
  html.product-v1 .icon-button,
  html.product-v1 .event-workspace-tab {
    min-height: 46px;
    border-radius: var(--p1-radius);
    font-weight: 850;
    letter-spacing: 0;
    transition:
      transform var(--p1-motion),
      box-shadow var(--p1-motion),
      border-color var(--p1-motion),
      background var(--p1-motion);
  }

  html.product-v1 .primary-button {
    background: linear-gradient(135deg, var(--p1-primary), var(--p1-primary-strong));
    box-shadow: 0 10px 24px rgba(8, 120, 111, 0.18);
  }

  html.product-v1 .hero-actions [data-action="new-event"],
  html.product-v1 .personal-next-step [data-action="new-event"] {
    box-shadow: 0 16px 34px rgba(8, 120, 111, 0.2);
  }

  html.product-v1 .secondary-button,
  html.product-v1 .icon-button,
  html.product-v1 .event-workspace-tab {
    background: rgba(255, 255, 255, 0.9);
    border-color: var(--p1-line);
    color: var(--p1-ink);
    box-shadow: none;
  }

  html.product-v1 .icon-button {
    width: 46px;
    min-width: 46px;
    padding: 0;
  }

  html.product-v1 .primary-button:active:not(:disabled),
  html.product-v1 .secondary-button:active:not(:disabled),
  html.product-v1 .event-row:active,
  html.product-v1 .event-command-card:active:not(:disabled) {
    transform: translateY(1px) scale(0.995);
  }

  html.product-v1 .panel,
  html.product-v1 .event-row,
  html.product-v1 .expense-row,
  html.product-v1 .group-row,
  html.product-v1 .transfer-row,
  html.product-v1 .balance-row,
  html.product-v1 .summary-strip,
  html.product-v1 .event-insight-panel,
  html.product-v1 .event-command-card {
    border: 1px solid var(--p1-line);
    border-radius: var(--p1-radius);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(253, 254, 252, 0.94));
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.82) inset,
      0 16px 42px rgba(17, 21, 19, 0.07);
  }

  html.product-v1 .profile-panel,
  html.product-v1 .backup-panel,
  html.product-v1 .network-panel,
  html.product-v1 .launch-panel,
  html.product-v1 .search-panel,
  html.product-v1 .product-context-bar,
  html.product-v1 .product-home-kicker,
  html.product-v1 .product-event-command,
  html.product-v1 .product-sticky-actions,
  html.product-v1 .product-hero-note {
    display: none !important;
  }

  html.product-v1 .personal-dashboard {
    display: grid;
    gap: 14px;
    padding: clamp(16px, 2.8vw, 24px);
    background:
      linear-gradient(135deg, rgba(8, 120, 111, 0.08), transparent 44%),
      rgba(255, 255, 255, 0.94);
  }

  html.product-v1 .personal-summary-strip,
  html.product-v1 .summary-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.72);
  }

  html.product-v1 .summary-item {
    min-height: 82px;
    display: grid;
    align-content: center;
    gap: 6px;
    padding: 14px;
    border: 1px solid rgba(17, 21, 19, 0.08);
    border-radius: var(--p1-radius);
    background: linear-gradient(180deg, #fff, #fbfcfa);
  }

  html.product-v1 .summary-item span {
    color: var(--p1-muted);
    font-size: 0.82rem;
    font-weight: 750;
  }

  html.product-v1 .summary-item strong,
  html.product-v1 .amount {
    color: var(--p1-ink);
    font-variant-numeric: tabular-nums;
  }

  html.product-v1 .section-title-row {
    gap: 10px;
    align-items: end;
  }

  html.product-v1 .section-title-row h2 {
    font-size: clamp(20px, 2.4vw, 28px);
    font-weight: 900;
  }

  html.product-v1 .event-list,
  html.product-v1 .stack {
    gap: 10px;
  }

  html.product-v1 .event-row,
  html.product-v1 .expense-row,
  html.product-v1 .transfer-row,
  html.product-v1 .group-row {
    min-height: 78px;
    padding: 14px;
  }

  html.product-v1 .event-row-main strong,
  html.product-v1 .expense-row strong,
  html.product-v1 .transfer-row strong,
  html.product-v1 .group-row strong {
    font-size: 1rem;
    font-weight: 900;
  }

  html.product-v1 .event-row-side {
    gap: 8px;
  }

  html.product-v1 .status-chip {
    min-height: 26px;
    border-radius: 999px;
    font-size: 0.76rem;
  }

  html.product-v1 .event-workspace-nav {
    position: sticky;
    top: 76px;
    z-index: 14;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--p1-line);
    border-radius: var(--p1-radius);
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 14px 34px rgba(17, 21, 19, 0.08);
    backdrop-filter: blur(16px);
  }

  html.product-v1 .event-workspace-tab.is-active,
  html.product-v1 .event-workspace-tab[aria-current="page"] {
    background: linear-gradient(135deg, var(--p1-primary), var(--p1-primary-strong));
    color: #fff;
    border-color: transparent;
    box-shadow: 0 12px 26px rgba(8, 120, 111, 0.18);
  }

  html.product-v1 .event-insight-panel {
    grid-template-columns: minmax(0, 1fr) minmax(320px, 0.8fr);
    gap: 16px;
    padding: clamp(16px, 2.8vw, 24px);
    overflow: hidden;
    background:
      linear-gradient(135deg, rgba(8, 120, 111, 0.08), transparent 42%),
      rgba(255, 255, 255, 0.96);
  }

  html.product-v1 .event-insight-main h2,
  html.product-v1 .settlement-hero h2 {
    font-size: clamp(25px, 3.4vw, 40px);
    line-height: 1.08;
  }

  html.product-v1 .event-insight-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  html.product-v1 .event-insight-metrics div {
    min-height: 78px;
    border-radius: var(--p1-radius);
    background: #f8faf8;
  }

  html.product-v1 .event-command-grid {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
  }

  html.product-v1 .event-command-card {
    min-height: 122px;
    align-items: start;
    padding: 16px;
    text-align: start;
    color: var(--p1-ink);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(250, 252, 249, 0.96));
  }

  html.product-v1 .event-command-card[data-action="show-expense-form"] {
    grid-column: span 2;
    min-height: 132px;
  }

  html.product-v1 .event-command-card.primary-button {
    color: white;
    border-color: transparent;
    background: linear-gradient(135deg, var(--p1-primary), #064a44);
  }

  html.product-v1 .command-card-icon {
    width: 42px;
    height: 42px;
    color: currentColor;
    border-radius: 10px;
    background:
      radial-gradient(circle at 32% 24%, rgba(255, 255, 255, 0.84), transparent 34%),
      linear-gradient(145deg, rgba(8, 120, 111, 0.12), rgba(52, 105, 143, 0.08));
    border: 1px solid rgba(8, 120, 111, 0.16);
  }

  html.product-v1 .button-action-icon {
    color: currentColor;
  }

  html.product-v1 .primary-button.event-command-card .command-card-icon {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.22);
  }

  html.product-v1 .field input,
  html.product-v1 .field select,
  html.product-v1 .guest-input,
  html.product-v1 .invite-link-row input,
  html.product-v1 .network-url-row input,
  html.product-v1 .payer-row input,
  html.product-v1 .payer-row select {
    min-height: 48px;
    border-radius: var(--p1-radius);
    border-color: var(--p1-line);
    background: #fff;
    box-shadow: inset 0 1px 0 rgba(17, 21, 19, 0.03);
  }

  html.product-v1 .participant-grid {
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 8px;
  }

  html.product-v1 .participant-pill {
    min-height: 58px;
    border-radius: var(--p1-radius);
    background: #fff;
  }

  html.product-v1 .participant-pill:has(input:checked) {
    border-color: rgba(8, 120, 111, 0.36);
    background: var(--p1-primary-soft);
    box-shadow: 0 0 0 3px rgba(8, 120, 111, 0.08);
  }

  html.product-v1 .expense-modal-backdrop,
  html.product-v1 .event-modal-backdrop {
    padding: clamp(10px, 2vw, 22px);
    background: rgba(17, 21, 19, 0.36);
    backdrop-filter: blur(12px);
  }

  html.product-v1 .expense-modal,
  html.product-v1 .event-modal {
    width: min(100%, 800px);
    max-height: min(92vh, 940px);
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: var(--p1-radius);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(250, 252, 249, 0.98));
    box-shadow: var(--p1-shadow-high);
  }

  html.product-v1 .expense-modal-header,
  html.product-v1 .event-modal-header {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: -18px -18px 16px;
    padding: 18px;
    border-bottom: 1px solid var(--p1-line);
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(12px);
  }

  html.product-v1 .expense-template-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  html.product-v1 .expense-template-grid .secondary-button {
    min-height: 38px;
    padding-inline: 12px;
  }

  html.product-v1 .expense-guest-box {
    border-radius: var(--p1-radius);
    background: var(--p1-warm-soft);
    border-color: rgba(197, 106, 69, 0.22);
  }

  html.product-v1 .settlement-hero {
    grid-template-columns: minmax(0, 1fr) minmax(250px, 0.58fr);
    padding: clamp(18px, 3vw, 28px);
    background:
      linear-gradient(135deg, rgba(17, 21, 19, 0.98), rgba(8, 86, 79, 0.96)),
      var(--p1-ink);
    color: #fff;
    box-shadow: var(--p1-shadow-high);
  }

  html.product-v1 .settlement-hero .muted,
  html.product-v1 .settlement-hero .amount {
    color: rgba(255, 255, 255, 0.82);
  }

  html.product-v1 .settlement-hero-amount {
    font-size: clamp(32px, 5vw, 56px);
  }

  html.product-v1 .settlement-hero-actions {
    display: grid;
    gap: 8px;
  }

  html.product-v1 .settlement-hero-actions .secondary-button {
    background: rgba(255, 255, 255, 0.96);
  }

  html.product-v1 .transfer-people {
    gap: 8px;
  }

  html.product-v1 .empty-state {
    min-height: 132px;
    display: grid;
    place-items: center;
    color: var(--p1-muted);
    border-color: var(--p1-line);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(248, 250, 248, 0.84)),
      repeating-linear-gradient(135deg, rgba(8, 120, 111, 0.035) 0 1px, transparent 1px 18px);
  }

  html.product-v1 .public-profile-gate {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: clamp(16px, 4vw, 42px);
    background:
      radial-gradient(circle at 80% 18%, rgba(8, 120, 111, 0.16), transparent 30%),
      radial-gradient(circle at 18% 78%, rgba(46, 111, 149, 0.11), transparent 28%),
      linear-gradient(180deg, #f9fbf8, #eef3ef);
  }

  html.product-v1 .public-profile-modal {
    width: min(100%, 760px);
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr;
    overflow: hidden;
    border: 1px solid var(--p1-line);
    border-radius: var(--p1-radius);
    background: rgba(255, 255, 255, 0.94);
    box-shadow: var(--p1-shadow-high);
  }

  html.product-v1 .public-profile-hero {
    min-height: 0;
    padding: 18px 20px;
    color: var(--p1-ink);
    background:
      linear-gradient(135deg, rgba(8, 120, 111, 0.1), transparent 60%),
      #fff;
  }

  html.product-v1 .public-profile-hero h1,
  html.product-v1 .public-profile-hero p,
  html.product-v1 .public-profile-proof {
    display: none;
  }

  html.product-v1 .product-gate-brand {
    margin: 0;
  }

  html.product-v1 .product-gate-brand .product-brand-mark {
    width: 44px;
    height: 44px;
    color: #fff;
    background: linear-gradient(145deg, var(--p1-primary), var(--p1-primary-strong));
  }

  html.product-v1 .product-gate-brand .product-brand-mark::after {
    background: #ffe7a8;
  }

  html.product-v1 .product-gate-brand .product-brand-copy strong {
    color: var(--p1-ink);
    font-size: clamp(24px, 4vw, 34px);
  }

  html.product-v1 .product-gate-brand .product-brand-copy small {
    color: var(--p1-muted);
  }

  html.product-v1 .public-profile-form {
    padding: clamp(22px, 4vw, 42px);
    background: #fff;
  }

  html.product-v1 .public-profile-form h2 {
    font-size: clamp(34px, 5vw, 54px);
    line-height: 1;
  }

  html.product-v1 .public-profile-privacy {
    color: var(--p1-muted);
  }

  @media (hover: hover) {
    html.product-v1 .primary-button:hover:not(:disabled),
    html.product-v1 .secondary-button:hover:not(:disabled),
    html.product-v1 .icon-button:hover:not(:disabled),
    html.product-v1 .event-row:hover,
    html.product-v1 .group-row:hover,
    html.product-v1 .expense-row:hover,
    html.product-v1 .transfer-row:hover,
    html.product-v1 .event-command-card:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: var(--p1-shadow-card);
      border-color: var(--p1-line-strong);
    }
  }

  @media (max-width: 760px) {
    html.product-v1 .screen {
      gap: 12px;
      padding: 12px;
    }

    html.product-v1 .product-app-identity {
      position: static;
    }

    html.product-v1 .screen > .top {
      grid-template-columns: 1fr;
    }

    html.product-v1 .screen > .top .brand,
    html.product-v1 .screen > .top .app-back-button {
      grid-column: 1;
    }

    html.product-v1 .hero-actions,
    html.product-v1 .personal-summary-strip,
    html.product-v1 .summary-strip,
    html.product-v1 .event-insight-panel,
    html.product-v1 .settlement-hero {
      grid-template-columns: 1fr;
    }

    html.product-v1 .event-workspace-nav {
      top: 0;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    html.product-v1 .event-insight-metrics {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 460px) {
    html.product-v1 .brand h1,
    html.product-v1 h1 {
      font-size: 30px;
    }

    html.product-v1 .event-command-grid,
    html.product-v1 .participant-grid {
      grid-template-columns: 1fr;
    }

    html.product-v1 .event-command-card[data-action="show-expense-form"] {
      grid-column: span 1;
    }

    html.product-v1 .expense-row,
    html.product-v1 .transfer-row,
    html.product-v1 .payer-row {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    html.product-v1 *,
    html.product-v1 *::before,
    html.product-v1 *::after {
      animation-duration: 1ms !important;
      transition-duration: 1ms !important;
      scroll-behavior: auto !important;
    }
  }

  @keyframes product-v1-enter {
    from {
      opacity: 0;
      transform: translateY(10px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

document.documentElement.classList.remove(...RETIRED_ROOT_CLASSES);
document.documentElement.classList.add("product-v1");
removeRetiredVisualStyles();
injectProductV1Styles();
installProductV1Layer();
