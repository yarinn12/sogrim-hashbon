const STYLE_ID = "public-product-v1-layer-style";
const RETIRED_STYLE_IDS = [
  "public-visual-refresh-layer-style",
  "public-premium-visual-layer-style",
  "public-fintech-design-layer-style",
  "sogrim-live-ledger-skin"
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

let scheduled = false;

document.documentElement.classList.remove(...RETIRED_ROOT_CLASSES);
document.documentElement.classList.add("product-v1");
removeRetiredStyles();
injectProductStyles();
installProductLayer();

function installProductLayer() {
  enhanceProductScreen();

  if (!document.body) return;
  new MutationObserver(scheduleEnhancement).observe(document.body, {
    childList: true,
    subtree: true
  });
}

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;

  requestAnimationFrame(() => {
    scheduled = false;
    enhanceProductScreen();
  });
}

function enhanceProductScreen() {
  removeRetiredStyles();
  removeClutter();

  const screen = document.querySelector("#app .screen");
  if (!screen) return;

  screen.dataset.productScreen = detectScreen(screen);
}

function detectScreen(screen) {
  if (screen.matches(".profile-setup-screen") || screen.querySelector('[data-action="save-profile"]')) return "profile";
  if (screen.querySelector('[data-action="create-event"]')) return "new-event";
  if (screen.querySelector('[data-action="join-existing-event"]')) return "join-event";
  if (screen.querySelector('[data-action="create-group"]')) return "groups";
  if (screen.querySelector('[data-action="copy-settlement"]')) return "settlement";
  if (screen.querySelector(".event-workspace-nav, .event-command-grid, .event-insight-panel")) return "event";
  if (screen.querySelector('[data-action="new-event"]')) return "home";
  return "general";
}

function removeRetiredStyles() {
  for (const id of RETIRED_STYLE_IDS) {
    document.getElementById(id)?.remove();
  }
  document.documentElement.classList.remove(...RETIRED_ROOT_CLASSES);
  document.documentElement.classList.add("product-v1");
}

function removeClutter() {
  for (const selector of CLUTTER_SELECTORS) {
    document.querySelectorAll(selector).forEach((element) => element.remove());
  }
}

function injectProductStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(PRODUCT_CSS));
  document.head.append(style);
}

const PRODUCT_CSS = `
  html.product-v1 {
    --p1-bg: #f7faf8;
    --p1-surface: #ffffff;
    --p1-ink: #101513;
    --p1-muted: #66736d;
    --p1-line: rgba(16, 21, 19, 0.1);
    --p1-line-strong: rgba(16, 21, 19, 0.18);
    --p1-primary: #08786f;
    --p1-primary-strong: #044c47;
    --p1-primary-soft: #e5f4f1;
    --p1-warm: #c76742;
    --p1-warm-soft: #fff1e8;
    --p1-sky: #2f6f95;
    --p1-gold: #b8892f;
    --p1-radius: 8px;
    --p1-shadow-low: 0 10px 26px rgba(16, 21, 19, 0.06);
    --p1-shadow-card: 0 1px 0 rgba(255, 255, 255, 0.88) inset, 0 16px 42px rgba(16, 21, 19, 0.08);
    --p1-shadow-high: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 28px 78px rgba(16, 21, 19, 0.16);
    color: var(--p1-ink);
  }

  html.product-v1 body {
    min-height: 100vh;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.95), rgba(247,250,248,0.98) 42%, #f7faf8 100%),
      radial-gradient(circle at 86% 8%, rgba(8,120,111,0.12), transparent 28%),
      radial-gradient(circle at 12% 18%, rgba(47,111,149,0.09), transparent 26%);
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
    width: min(100%, 1120px);
    display: grid;
    gap: 16px;
    padding: clamp(14px, 3vw, 28px);
    animation: product-v1-enter 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  html.product-v1 .product-app-identity {
    position: sticky;
    top: 10px;
    z-index: 20;
    margin: 0 0 4px;
    padding: 10px 12px;
    border: 1px solid var(--p1-line);
    border-radius: var(--p1-radius);
    background: rgba(255,255,255,0.88);
    box-shadow: var(--p1-shadow-low);
    backdrop-filter: blur(18px);
  }

  html.product-v1 .product-brand-lockup {
    gap: 10px;
  }

  html.product-v1 .product-brand-mark {
    width: 42px;
    height: 42px;
    border-radius: var(--p1-radius);
    background: linear-gradient(145deg, var(--p1-primary), var(--p1-primary-strong)) !important;
    box-shadow: 0 10px 24px rgba(8,120,111,0.18) !important;
    color: #fffdf8 !important;
  }

  html.product-v1 .product-brand-copy strong {
    color: var(--p1-ink);
    font-size: clamp(22px, 2.8vw, 30px);
    font-weight: 950;
    letter-spacing: 0;
  }

  html.product-v1 .product-brand-copy small {
    color: var(--p1-muted);
    font-size: 0.82rem;
    font-weight: 800;
  }

  html.product-v1 .screen > .top {
    min-height: 0 !important;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 14px;
    align-items: start;
    margin: 0;
    padding: clamp(16px, 2.4vw, 24px);
    color: var(--p1-ink) !important;
    background: linear-gradient(180deg, rgba(255,255,255,0.97), rgba(255,253,250,0.94)), var(--p1-surface);
    border: 1px solid var(--p1-line);
    border-radius: var(--p1-radius);
    box-shadow: var(--p1-shadow-card);
    overflow: visible;
  }

  html.product-v1 .screen > .top .brand {
    width: 100%;
    max-width: 820px;
    padding: 0 !important;
  }

  html.product-v1 .screen[data-product-screen="home"] .app-back-button,
  html.product-v1 .screen[data-product-screen="home"] .product-home-button,
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

  html.product-v1 .brand h1,
  html.product-v1 h1 {
    max-width: 100%;
    margin: 0;
    color: var(--p1-ink);
    font-size: clamp(30px, 4.2vw, 50px);
    font-weight: 950;
    line-height: 1.05;
    letter-spacing: 0;
  }

  html.product-v1 .eyebrow,
  html.product-v1 .screen > .top .eyebrow {
    margin: 0 0 8px;
    color: var(--p1-primary);
    font-size: 0.78rem;
    font-weight: 950;
  }

  html.product-v1 .muted,
  html.product-v1 .screen > .top .muted {
    color: var(--p1-muted);
    font-weight: 680;
    line-height: 1.55;
  }

  html.product-v1 .hero-actions {
    display: grid;
    grid-template-columns: minmax(200px, 1.25fr) repeat(2, minmax(150px, 0.9fr));
    gap: 10px;
    padding: 0;
    background: transparent;
  }

  html.product-v1 .primary-button,
  html.product-v1 .secondary-button,
  html.product-v1 .icon-button,
  html.product-v1 .event-workspace-tab {
    min-height: 46px;
    border-radius: var(--p1-radius);
    font-weight: 850;
    letter-spacing: 0;
    transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms cubic-bezier(0.22, 1, 0.36, 1), background 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  html.product-v1 .primary-button {
    background: linear-gradient(135deg, var(--p1-primary), var(--p1-primary-strong));
    color: #fff;
    box-shadow: 0 14px 30px rgba(8,120,111,0.2);
  }

  html.product-v1 .secondary-button,
  html.product-v1 .icon-button,
  html.product-v1 .event-workspace-tab {
    background: rgba(255,255,255,0.92);
    border-color: var(--p1-line);
    color: var(--p1-ink);
    box-shadow: none;
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
    background: rgba(255,255,255,0.93);
    box-shadow: var(--p1-shadow-card);
  }

  html.product-v1 .personal-dashboard {
    display: grid;
    gap: 14px;
    padding: clamp(16px, 2.8vw, 24px);
    background: linear-gradient(135deg, rgba(8,120,111,0.08), transparent 44%), rgba(255,255,255,0.94);
  }

  html.product-v1 .personal-summary-strip,
  html.product-v1 .summary-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    padding: 10px;
    background: rgba(255,255,255,0.72);
  }

  html.product-v1 .summary-item {
    min-height: 82px;
    display: grid;
    align-content: center;
    gap: 6px;
    padding: 14px;
    border: 1px solid rgba(16,21,19,0.08);
    border-radius: var(--p1-radius);
    background: linear-gradient(180deg, #fff, #fbfcfa);
  }

  html.product-v1 .section-title-row h2 {
    font-size: clamp(20px, 2.4vw, 28px);
    font-weight: 950;
  }

  html.product-v1 .event-row,
  html.product-v1 .expense-row,
  html.product-v1 .transfer-row,
  html.product-v1 .group-row {
    min-height: 78px;
    padding: 14px;
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
    background: rgba(255,255,255,0.9);
    box-shadow: var(--p1-shadow-low);
    backdrop-filter: blur(16px);
  }

  html.product-v1 .event-workspace-tab.is-active,
  html.product-v1 .event-workspace-tab[aria-current="page"] {
    background: var(--p1-ink);
    color: #fff;
    border-color: var(--p1-ink);
  }

  html.product-v1 .event-insight-panel,
  html.product-v1 .settlement-hero {
    grid-template-columns: minmax(0, 1fr) minmax(300px, 0.8fr);
    gap: 16px;
    padding: clamp(16px, 2.8vw, 24px);
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
    border-radius: 10px;
    background: linear-gradient(145deg, rgba(8,120,111,0.12), rgba(47,111,149,0.08));
    border: 1px solid rgba(8,120,111,0.16);
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
    box-shadow: inset 0 1px 0 rgba(16,21,19,0.03);
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
    border-color: rgba(8,120,111,0.36);
    background: var(--p1-primary-soft);
    box-shadow: 0 0 0 3px rgba(8,120,111,0.08);
  }

  html.product-v1 .expense-modal-backdrop,
  html.product-v1 .event-modal-backdrop {
    padding: clamp(10px, 2vw, 22px);
    background: rgba(16,21,19,0.36);
    backdrop-filter: blur(12px);
  }

  html.product-v1 .expense-modal,
  html.product-v1 .event-modal {
    width: min(100%, 800px);
    max-height: min(92vh, 940px);
    border: 1px solid rgba(255,255,255,0.72);
    border-radius: var(--p1-radius);
    background: rgba(255,255,255,0.98);
    box-shadow: var(--p1-shadow-high);
  }

  html.product-v1 .settlement-hero {
    background: linear-gradient(135deg, rgba(16,21,19,0.98), rgba(8,86,79,0.96));
    color: #fff;
    box-shadow: var(--p1-shadow-high);
  }

  html.product-v1 .settlement-hero .muted,
  html.product-v1 .settlement-hero .amount {
    color: rgba(255,255,255,0.84);
  }

  html.product-v1 .empty-state {
    min-height: 132px;
    display: grid;
    place-items: center;
    color: var(--p1-muted);
    border-color: var(--p1-line);
    background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(248,250,248,0.84));
  }

  html.product-v1 .public-profile-gate {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: clamp(16px, 4vw, 42px);
    background: radial-gradient(circle at 80% 18%, rgba(8,120,111,0.16), transparent 30%), radial-gradient(circle at 18% 78%, rgba(47,111,149,0.11), transparent 28%), linear-gradient(180deg, #f9fbf8, #eef3ef);
  }

  html.product-v1 .public-profile-modal {
    width: min(100%, 760px);
    display: grid;
    overflow: hidden;
    border: 1px solid var(--p1-line);
    border-radius: var(--p1-radius);
    background: rgba(255,255,255,0.95);
    box-shadow: var(--p1-shadow-high);
  }

  html.product-v1 .public-profile-hero {
    min-height: 0;
    padding: 18px 20px;
    color: var(--p1-ink);
    background: linear-gradient(135deg, rgba(8,120,111,0.1), transparent 60%), #fff;
  }

  html.product-v1 .public-profile-hero h1,
  html.product-v1 .public-profile-hero p,
  html.product-v1 .public-profile-proof {
    display: none;
  }

  html.product-v1 .public-profile-form {
    padding: clamp(22px, 4vw, 42px);
    background: #fff;
  }

  html.product-v1 .public-profile-form h2 {
    font-size: clamp(34px, 5vw, 54px);
    line-height: 1;
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

    html.product-v1 .screen > .top,
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
  }

  @media (max-width: 460px) {
    html.product-v1 .brand h1,
    html.product-v1 h1 {
      font-size: 30px;
    }

    html.product-v1 .event-command-grid,
    html.product-v1 .participant-grid,
    html.product-v1 .expense-row,
    html.product-v1 .transfer-row,
    html.product-v1 .payer-row {
      grid-template-columns: 1fr;
    }

    html.product-v1 .event-command-card[data-action="show-expense-form"] {
      grid-column: span 1;
    }
  }

  @keyframes product-v1-enter {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;
