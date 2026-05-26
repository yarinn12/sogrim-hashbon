const STYLE_ID = "sogrim-live-ledger-skin";
const RETIRED_STYLE_IDS = [
  "public-visual-refresh-layer-style",
  "public-premium-visual-layer-style",
  "public-fintech-design-layer-style"
];
const RETIRED_ROOT_CLASSES = [
  "visual-refresh-v3",
  "visual-refresh-v6",
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

const PRODUCT_V1_CSS = `
  html.product-v1-live {
    --p1-bg: #f7f8f5;
    --p1-surface: #ffffff;
    --p1-ink: #111513;
    --p1-muted: #68726d;
    --p1-line: rgba(17, 21, 19, 0.1);
    --p1-line-strong: rgba(17, 21, 19, 0.18);
    --p1-primary: #08786f;
    --p1-primary-strong: #04564f;
    --p1-primary-soft: #e3f3ef;
    --p1-warm: #c56a45;
    --p1-warm-soft: #fff1e8;
    --p1-sky: #2e6f95;
    --p1-radius: 8px;
    --p1-shadow-low: 0 8px 24px rgba(17, 21, 19, 0.06);
    --p1-shadow-card: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 14px 38px rgba(17, 21, 19, 0.08);
    --p1-shadow-high: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 28px 76px rgba(17, 21, 19, 0.16);
    --p1-motion: 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  html.product-v1-live body {
    min-height: 100vh !important;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(247, 248, 245, 0.98) 38%, #f7f8f5 100%),
      radial-gradient(circle at 88% 8%, rgba(8, 120, 111, 0.12), transparent 30%),
      radial-gradient(circle at 12% 16%, rgba(46, 111, 149, 0.1), transparent 24%),
      linear-gradient(135deg, rgba(197, 106, 69, 0.08), transparent 45%) !important;
    color: var(--p1-ink) !important;
    font-family: Assistant, Heebo, "Noto Sans Hebrew", system-ui, sans-serif !important;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  html.product-v1-live .app::before,
  html.product-v1-live .screen > .top::before,
  html.product-v1-live .screen > .top::after,
  html.product-v1-live .brand::before,
  html.product-v1-live .brand::after,
  html.product-v1-live .primary-button::after,
  html.product-v1-live .event-command-card::before,
  html.product-v1-live .summary-item::after {
    content: none !important;
    display: none !important;
  }

  html.product-v1-live .screen {
    width: min(100%, 1120px) !important;
    display: grid !important;
    gap: 16px !important;
    padding: clamp(14px, 3vw, 28px) !important;
    animation: product-v1-live-enter 360ms cubic-bezier(0.22, 1, 0.36, 1) both !important;
  }

  html.product-v1-live .product-app-identity {
    position: sticky !important;
    top: 10px !important;
    z-index: 40 !important;
    min-height: 60px !important;
    margin: 0 0 4px !important;
    padding: 10px 12px !important;
    border: 1px solid var(--p1-line) !important;
    border-radius: var(--p1-radius) !important;
    background: rgba(255, 255, 255, 0.88) !important;
    box-shadow: var(--p1-shadow-low) !important;
    backdrop-filter: blur(18px) !important;
  }

  html.product-v1-live .product-brand-lockup { gap: 10px !important; }

  html.product-v1-live .product-brand-mark {
    width: 42px !important;
    height: 42px !important;
    border-radius: var(--p1-radius) !important;
    background: linear-gradient(145deg, var(--p1-primary), var(--p1-primary-strong)) !important;
    color: #fff !important;
    box-shadow: 0 10px 22px rgba(8, 120, 111, 0.18) !important;
    font-size: 23px !important;
  }

  html.product-v1-live .product-brand-mark::after {
    width: 15px !important;
    height: 15px !important;
    border-width: 2px !important;
    background: #ffe7a8 !important;
  }

  html.product-v1-live .product-brand-copy strong {
    color: var(--p1-ink) !important;
    font-size: clamp(22px, 2.6vw, 30px) !important;
    font-weight: 900 !important;
    letter-spacing: 0 !important;
  }

  html.product-v1-live .product-brand-copy small {
    color: var(--p1-muted) !important;
    font-size: 0.82rem !important;
    font-weight: 750 !important;
  }

  html.product-v1-live .screen > .top {
    min-height: 0 !important;
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) !important;
    gap: 14px !important;
    align-items: start !important;
    margin: 0 !important;
    padding: clamp(16px, 2.4vw, 22px) !important;
    color: var(--p1-ink) !important;
    background: linear-gradient(180deg, rgba(255,255,255,0.97), rgba(255,253,250,0.94)), var(--p1-surface) !important;
    border: 1px solid var(--p1-line) !important;
    border-radius: var(--p1-radius) !important;
    box-shadow: var(--p1-shadow-card) !important;
    overflow: visible !important;
  }

  html.product-v1-live .screen > .top .app-back-button { grid-column: 1 !important; grid-row: 1 !important; }
  html.product-v1-live .screen > .top .brand { grid-column: 2 !important; width: 100% !important; max-width: 780px !important; padding: 0 !important; }

  html.product-v1-live .brand h1,
  html.product-v1-live h1 {
    max-width: 100% !important;
    margin: 0 !important;
    color: var(--p1-ink) !important;
    font-size: clamp(29px, 4vw, 46px) !important;
    font-weight: 900 !important;
    line-height: 1.05 !important;
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  html.product-v1-live .eyebrow,
  html.product-v1-live .screen > .top .eyebrow {
    margin: 0 0 8px !important;
    color: var(--p1-primary) !important;
    font-size: 0.78rem !important;
    font-weight: 900 !important;
  }

  html.product-v1-live .muted,
  html.product-v1-live .screen > .top .muted,
  html.product-v1-live small {
    color: var(--p1-muted) !important;
    font-weight: 650 !important;
    line-height: 1.55 !important;
  }

  html.product-v1-live .hero-actions {
    display: grid !important;
    grid-template-columns: minmax(180px, 1.15fr) repeat(2, minmax(150px, 1fr)) !important;
    gap: 10px !important;
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
    backdrop-filter: none !important;
  }

  html.product-v1-live .primary-button,
  html.product-v1-live .secondary-button,
  html.product-v1-live .icon-button,
  html.product-v1-live .event-workspace-tab {
    min-height: 46px !important;
    border-radius: var(--p1-radius) !important;
    font-weight: 850 !important;
    letter-spacing: 0 !important;
    transition: transform var(--p1-motion), box-shadow var(--p1-motion), border-color var(--p1-motion), background var(--p1-motion) !important;
  }

  html.product-v1-live .primary-button {
    background: linear-gradient(135deg, var(--p1-primary), var(--p1-primary-strong)) !important;
    color: #fff !important;
    box-shadow: 0 10px 24px rgba(8, 120, 111, 0.18) !important;
  }

  html.product-v1-live .secondary-button,
  html.product-v1-live .icon-button,
  html.product-v1-live .event-workspace-tab {
    background: rgba(255,255,255,0.92) !important;
    border-color: var(--p1-line) !important;
    color: var(--p1-ink) !important;
    box-shadow: none !important;
  }

  html.product-v1-live .icon-button { width: 46px !important; min-width: 46px !important; padding: 0 !important; }

  html.product-v1-live .panel,
  html.product-v1-live .event-row,
  html.product-v1-live .expense-row,
  html.product-v1-live .group-row,
  html.product-v1-live .transfer-row,
  html.product-v1-live .balance-row,
  html.product-v1-live .summary-strip,
  html.product-v1-live .event-insight-panel,
  html.product-v1-live .event-command-card,
  html.product-v1-live .empty-state {
    border: 1px solid var(--p1-line) !important;
    border-radius: var(--p1-radius) !important;
    background: rgba(255,255,255,0.93) !important;
    color: var(--p1-ink) !important;
    box-shadow: var(--p1-shadow-card) !important;
  }

  html.product-v1-live .profile-panel,
  html.product-v1-live .backup-panel,
  html.product-v1-live .network-panel,
  html.product-v1-live .launch-panel,
  html.product-v1-live .search-panel,
  html.product-v1-live .product-context-bar,
  html.product-v1-live .product-home-kicker,
  html.product-v1-live .product-event-command,
  html.product-v1-live .product-sticky-actions,
  html.product-v1-live .product-hero-note { display: none !important; }

  html.product-v1-live .personal-dashboard {
    display: grid !important;
    gap: 14px !important;
    padding: clamp(16px, 2.8vw, 24px) !important;
    background: linear-gradient(135deg, rgba(8,120,111,0.08), transparent 44%), rgba(255,255,255,0.94) !important;
  }

  html.product-v1-live .personal-summary-strip,
  html.product-v1-live .summary-strip {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 10px !important;
    padding: 10px !important;
    background: rgba(255,255,255,0.72) !important;
  }

  html.product-v1-live .summary-item {
    min-height: 82px !important;
    display: grid !important;
    align-content: center !important;
    gap: 6px !important;
    padding: 14px !important;
    border: 1px solid rgba(17,21,19,0.08) !important;
    border-radius: var(--p1-radius) !important;
    background: linear-gradient(180deg,#fff,#fbfcfa) !important;
  }

  html.product-v1-live .summary-item span { color: var(--p1-muted) !important; font-size: 0.82rem !important; font-weight: 750 !important; }
  html.product-v1-live .summary-item strong,
  html.product-v1-live .amount { color: var(--p1-ink) !important; font-variant-numeric: tabular-nums !important; }

  html.product-v1-live .event-row,
  html.product-v1-live .expense-row,
  html.product-v1-live .transfer-row,
  html.product-v1-live .group-row { min-height: 78px !important; padding: 14px !important; }

  html.product-v1-live .event-workspace-nav {
    position: sticky !important;
    top: 76px !important;
    z-index: 14 !important;
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0,1fr)) !important;
    gap: 8px !important;
    padding: 8px !important;
    border: 1px solid var(--p1-line) !important;
    border-radius: var(--p1-radius) !important;
    background: rgba(255,255,255,0.9) !important;
    box-shadow: var(--p1-shadow-low) !important;
    backdrop-filter: blur(16px) !important;
  }

  html.product-v1-live .event-workspace-tab.is-active,
  html.product-v1-live .event-workspace-tab[aria-current="page"] { background: var(--p1-ink) !important; color: #fff !important; border-color: var(--p1-ink) !important; }

  html.product-v1-live .event-insight-panel { grid-template-columns: minmax(0,1fr) minmax(320px,0.8fr) !important; gap: 16px !important; padding: clamp(16px,2.8vw,24px) !important; }
  html.product-v1-live .event-insight-main h2,
  html.product-v1-live .settlement-hero h2 { font-size: clamp(25px,3.4vw,40px) !important; line-height: 1.08 !important; }
  html.product-v1-live .event-insight-metrics { grid-template-columns: repeat(2,minmax(0,1fr)) !important; gap: 8px !important; }
  html.product-v1-live .event-insight-metrics div { min-height: 78px !important; border-radius: var(--p1-radius) !important; background: #f8faf8 !important; }

  html.product-v1-live .event-command-grid { grid-template-columns: repeat(auto-fit,minmax(180px,1fr)) !important; gap: 10px !important; }
  html.product-v1-live .event-command-card { min-height: 122px !important; align-items: start !important; padding: 16px !important; text-align: start !important; }
  html.product-v1-live .event-command-card.primary-button { color: #fff !important; border-color: transparent !important; background: linear-gradient(135deg, var(--p1-primary), #064a44) !important; }

  html.product-v1-live input,
  html.product-v1-live select,
  html.product-v1-live textarea,
  html.product-v1-live .guest-input {
    min-height: 48px !important;
    border-radius: var(--p1-radius) !important;
    border-color: var(--p1-line) !important;
    background: #fff !important;
    box-shadow: inset 0 1px 0 rgba(17,21,19,0.03) !important;
  }

  html.product-v1-live .participant-grid { grid-template-columns: repeat(auto-fit,minmax(170px,1fr)) !important; gap: 8px !important; }
  html.product-v1-live .participant-pill { min-height: 58px !important; border-radius: var(--p1-radius) !important; background: #fff !important; }
  html.product-v1-live .participant-pill:has(input:checked) { border-color: rgba(8,120,111,0.36) !important; background: var(--p1-primary-soft) !important; box-shadow: 0 0 0 3px rgba(8,120,111,0.08) !important; }

  html.product-v1-live .expense-modal-backdrop,
  html.product-v1-live .event-modal-backdrop { background: rgba(17,21,19,0.36) !important; backdrop-filter: blur(12px) !important; }
  html.product-v1-live .expense-modal,
  html.product-v1-live .event-modal { width: min(100%,800px) !important; max-height: min(92vh,940px) !important; border: 1px solid rgba(255,255,255,0.72) !important; background: rgba(255,255,255,0.98) !important; box-shadow: var(--p1-shadow-high) !important; }
  html.product-v1-live .expense-guest-box { border-radius: var(--p1-radius) !important; background: var(--p1-warm-soft) !important; border-color: rgba(197,106,69,0.22) !important; }

  html.product-v1-live .settlement-hero { grid-template-columns: minmax(0,1fr) minmax(250px,0.58fr) !important; padding: clamp(18px,3vw,28px) !important; background: linear-gradient(135deg, rgba(17,21,19,0.98), rgba(8,86,79,0.96)) !important; color: #fff !important; box-shadow: var(--p1-shadow-high) !important; }
  html.product-v1-live .settlement-hero .muted,
  html.product-v1-live .settlement-hero .amount { color: rgba(255,255,255,0.82) !important; }

  html.product-v1-live .public-profile-gate { display: grid !important; place-items: center !important; min-height: 100vh !important; padding: clamp(16px,4vw,42px) !important; background: radial-gradient(circle at 80% 18%, rgba(8,120,111,0.16), transparent 30%), linear-gradient(180deg,#f9fbf8,#eef3ef) !important; }
  html.product-v1-live .public-profile-modal { width: min(100%,760px) !important; min-height: 0 !important; display: grid !important; grid-template-columns: 1fr !important; border: 1px solid var(--p1-line) !important; border-radius: var(--p1-radius) !important; background: rgba(255,255,255,0.94) !important; box-shadow: var(--p1-shadow-high) !important; }
  html.product-v1-live .public-profile-hero { min-height: 0 !important; padding: 18px 20px !important; color: var(--p1-ink) !important; background: linear-gradient(135deg, rgba(8,120,111,0.1), transparent 60%), #fff !important; }
  html.product-v1-live .public-profile-hero h1,
  html.product-v1-live .public-profile-hero p,
  html.product-v1-live .public-profile-proof { display: none !important; }
  html.product-v1-live .product-gate-brand { margin: 0 !important; }
  html.product-v1-live .product-gate-brand .product-brand-copy strong { color: var(--p1-ink) !important; font-size: clamp(24px,4vw,34px) !important; }
  html.product-v1-live .product-gate-brand .product-brand-copy small { color: var(--p1-muted) !important; }
  html.product-v1-live .public-profile-form { padding: clamp(22px,4vw,42px) !important; background: #fff !important; }
  html.product-v1-live .public-profile-form h2 { font-size: clamp(34px,5vw,54px) !important; line-height: 1 !important; }

  @media (hover: hover) {
    html.product-v1-live .primary-button:hover:not(:disabled),
    html.product-v1-live .secondary-button:hover:not(:disabled),
    html.product-v1-live .event-row:hover,
    html.product-v1-live .expense-row:hover,
    html.product-v1-live .transfer-row:hover,
    html.product-v1-live .event-command-card:hover:not(:disabled) {
      transform: translateY(-2px) !important;
      box-shadow: var(--p1-shadow-card) !important;
      border-color: var(--p1-line-strong) !important;
    }
  }

  @media (max-width: 760px) {
    html.product-v1-live .screen { gap: 12px !important; padding: 12px !important; }
    html.product-v1-live .product-app-identity { position: static !important; }
    html.product-v1-live .screen > .top { grid-template-columns: 1fr !important; }
    html.product-v1-live .screen > .top .brand,
    html.product-v1-live .screen > .top .app-back-button { grid-column: 1 !important; }
    html.product-v1-live .hero-actions,
    html.product-v1-live .personal-summary-strip,
    html.product-v1-live .summary-strip,
    html.product-v1-live .event-insight-panel,
    html.product-v1-live .settlement-hero { grid-template-columns: 1fr !important; }
    html.product-v1-live .event-workspace-nav { top: 0 !important; grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
    html.product-v1-live .event-insight-metrics { grid-template-columns: 1fr !important; }
  }

  @media (max-width: 460px) {
    html.product-v1-live .brand h1,
    html.product-v1-live h1 { font-size: 30px !important; }
    html.product-v1-live .event-command-grid,
    html.product-v1-live .participant-grid { grid-template-columns: 1fr !important; }
    html.product-v1-live .expense-row,
    html.product-v1-live .transfer-row,
    html.product-v1-live .payer-row { grid-template-columns: 1fr !important; }
  }

  @media (prefers-reduced-motion: reduce) {
    html.product-v1-live *,
    html.product-v1-live *::before,
    html.product-v1-live *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; scroll-behavior: auto !important; }
  }

  @keyframes product-v1-live-enter {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

installProductV1Live();
watchProductV1Live();

function installProductV1Live() {
  document.documentElement.classList.remove(...RETIRED_ROOT_CLASSES);
  document.documentElement.classList.add("product-v1-live");
  removeRetiredStyles();
  injectStyles();
  enhanceProductV1Live();
}

function watchProductV1Live() {
  const appRoot = document.querySelector("#app");
  if (!appRoot) return;
  new MutationObserver(() => requestAnimationFrame(enhanceProductV1Live)).observe(appRoot, {
    childList: true,
    subtree: true
  });
}

function removeRetiredStyles() {
  for (const id of RETIRED_STYLE_IDS) document.getElementById(id)?.remove();
  document.documentElement.classList.remove(...RETIRED_ROOT_CLASSES);
}

function injectStyles() {
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(PRODUCT_V1_CSS));
  document.head.append(style);
}

function enhanceProductV1Live() {
  removeRetiredStyles();
  document.documentElement.classList.add("product-v1-live");
  for (const selector of CLUTTER_SELECTORS) {
    document.querySelectorAll(selector).forEach((element) => element.remove());
  }

  const screen = document.querySelector("#app .screen");
  if (!screen) return;
  screen.dataset.productScreen = detectScreenKind(screen);
}

function detectScreenKind(screen) {
  if (screen.matches(".profile-setup-screen") || screen.querySelector('[data-action="save-profile"]')) return "profile";
  if (screen.querySelector('[data-action="create-event"]')) return "new-event";
  if (screen.querySelector('[data-action="join-existing-event"]')) return "join-event";
  if (screen.querySelector('[data-action="create-group"]')) return "groups";
  if (screen.querySelector('[data-action="copy-settlement"]')) return "settlement";
  if (screen.querySelector(".event-workspace-nav, .event-command-grid, .event-insight-panel")) return "event";
  if (screen.querySelector('[data-action="new-event"]')) return "home";
  return "general";
}
