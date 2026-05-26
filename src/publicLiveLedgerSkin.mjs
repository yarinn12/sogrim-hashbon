const STYLE_ID = "sogrim-live-ledger-skin";

document.documentElement.classList.add("sogrim-live-ledger");
injectLiveLedgerSkin();
markActiveScreen();

const appRoot = document.querySelector("#app");
if (appRoot) {
  new MutationObserver(markActiveScreen).observe(appRoot, { childList: true, subtree: true });
}

function injectLiveLedgerSkin() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(LIVE_LEDGER_CSS));
  document.head.append(style);
}

function markActiveScreen() {
  const screen = document.querySelector("#app .screen");
  if (!screen) return;

  screen.classList.add("live-ledger-screen");
  screen.classList.toggle("live-ledger-event", Boolean(screen.querySelector('[data-action="show-expense-form"]')));
  screen.classList.toggle("live-ledger-settlement", Boolean(screen.querySelector('[data-action="copy-settlement"]')));
}

const LIVE_LEDGER_CSS = `
  html.sogrim-live-ledger {
    --live-bg: #f6f7f4;
    --live-surface: #ffffff;
    --live-soft: #fbfcfa;
    --live-ink: #171a1f;
    --live-muted: #66716d;
    --live-border: #e1e7e2;
    --live-primary: #087b74;
    --live-primary-dark: #064f4a;
    --live-action: #2f6bff;
    --live-positive: #16a36a;
    --live-negative: #e75b64;
    --live-radius: 8px;
    --live-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 18px 50px rgba(23,26,31,.08);
    background: var(--live-bg) !important;
  }

  html.sogrim-live-ledger body {
    background: radial-gradient(circle at 15% 0%, rgba(8,123,116,.08), transparent 28%), var(--live-bg) !important;
    color: var(--live-ink) !important;
    font-family: Heebo, Assistant, "Noto Sans Hebrew", system-ui, sans-serif !important;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  html.sogrim-live-ledger .app::before,
  html.sogrim-live-ledger .app::after,
  html.sogrim-live-ledger .top::after {
    display: none !important;
  }

  html.sogrim-live-ledger .screen,
  html.sogrim-live-ledger .live-ledger-screen {
    width: min(100%, 1120px) !important;
    padding: clamp(14px, 2.6vw, 24px) !important;
    gap: 14px !important;
  }

  html.sogrim-live-ledger .top {
    min-height: auto !important;
    margin: 0 0 12px !important;
    padding: 14px 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    color: var(--live-ink) !important;
  }

  html.sogrim-live-ledger .brand {
    position: relative;
    padding-inline-start: 58px !important;
  }

  html.sogrim-live-ledger .brand::before {
    content: "";
    position: absolute;
    inset-inline-start: 0;
    top: 2px;
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--live-primary), var(--live-primary-dark));
    box-shadow: 0 10px 24px rgba(8,123,116,.22);
  }

  html.sogrim-live-ledger .brand::after {
    content: "";
    position: absolute;
    inset-inline-start: 13px;
    top: 15px;
    width: 18px;
    height: 18px;
    border: 3px solid #fff;
    border-inline-start-color: transparent;
    border-radius: 6px;
    transform: rotate(45deg);
  }

  html.sogrim-live-ledger .eyebrow {
    color: var(--live-primary) !important;
    font-size: .78rem !important;
    font-weight: 800 !important;
    letter-spacing: 0 !important;
    margin: 0 0 4px !important;
  }

  html.sogrim-live-ledger h1,
  html.sogrim-live-ledger .brand h1 {
    max-width: none !important;
    margin: 0 0 6px !important;
    color: var(--live-ink) !important;
    font-size: clamp(1.55rem, 3vw, 2.35rem) !important;
    line-height: 1.08 !important;
    font-weight: 850 !important;
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  html.sogrim-live-ledger .muted,
  html.sogrim-live-ledger small {
    color: var(--live-muted) !important;
  }

  html.sogrim-live-ledger .hero-actions,
  html.sogrim-live-ledger .actions,
  html.sogrim-live-ledger .inline-actions {
    gap: 10px !important;
  }

  html.sogrim-live-ledger .hero-actions {
    display: grid !important;
    grid-template-columns: minmax(0, 1.4fr) repeat(2, minmax(0, 1fr)) !important;
    margin: 0 0 14px !important;
  }

  html.sogrim-live-ledger .primary-button,
  html.sogrim-live-ledger .secondary-button,
  html.sogrim-live-ledger .icon-button,
  html.sogrim-live-ledger .event-workspace-tab {
    min-height: 42px !important;
    border-radius: var(--live-radius) !important;
    font-weight: 800 !important;
    letter-spacing: 0 !important;
    transition: transform .16s ease, box-shadow .16s ease, background .16s ease !important;
  }

  html.sogrim-live-ledger .primary-button {
    border: 1px solid var(--live-primary-dark) !important;
    background: linear-gradient(180deg, var(--live-primary), var(--live-primary-dark)) !important;
    color: #fff !important;
    box-shadow: 0 14px 30px rgba(8,123,116,.2) !important;
  }

  html.sogrim-live-ledger .secondary-button,
  html.sogrim-live-ledger .icon-button {
    border: 1px solid var(--live-border) !important;
    background: var(--live-surface) !important;
    color: var(--live-ink) !important;
    box-shadow: 0 1px 2px rgba(23,26,31,.05) !important;
  }

  html.sogrim-live-ledger .panel,
  html.sogrim-live-ledger .event-row,
  html.sogrim-live-ledger .expense-row,
  html.sogrim-live-ledger .group-row,
  html.sogrim-live-ledger .transfer-row,
  html.sogrim-live-ledger .balance-row,
  html.sogrim-live-ledger .summary-strip,
  html.sogrim-live-ledger .event-insight-panel,
  html.sogrim-live-ledger .settlement-hero {
    border: 1px solid var(--live-border) !important;
    border-radius: var(--live-radius) !important;
    background: var(--live-surface) !important;
    color: var(--live-ink) !important;
    box-shadow: var(--live-shadow) !important;
    backdrop-filter: none !important;
  }

  html.sogrim-live-ledger .summary-strip,
  html.sogrim-live-ledger .personal-summary-strip {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 1px !important;
    overflow: hidden !important;
    padding: 0 !important;
    background: var(--live-border) !important;
  }

  html.sogrim-live-ledger .summary-item {
    border: 0 !important;
    border-radius: 0 !important;
    background: var(--live-soft) !important;
    box-shadow: none !important;
  }

  html.sogrim-live-ledger .amount,
  html.sogrim-live-ledger .settlement-hero-amount {
    color: var(--live-primary-dark) !important;
    font-variant-numeric: tabular-nums !important;
  }

  html.sogrim-live-ledger .is-debt .amount {
    color: var(--live-negative) !important;
  }

  html.sogrim-live-ledger .is-credit .amount,
  html.sogrim-live-ledger .status-paid {
    color: var(--live-positive) !important;
  }

  html.sogrim-live-ledger .event-workspace-nav {
    display: flex !important;
    gap: 6px !important;
    padding: 4px !important;
    margin: 0 0 14px !important;
    border: 1px solid var(--live-border) !important;
    border-radius: var(--live-radius) !important;
    background: var(--live-soft) !important;
    box-shadow: none !important;
  }

  html.sogrim-live-ledger .event-workspace-tab {
    flex: 1 1 0 !important;
    border: 0 !important;
    background: transparent !important;
    color: var(--live-muted) !important;
    text-decoration: none !important;
  }

  html.sogrim-live-ledger .event-workspace-tab.is-active,
  html.sogrim-live-ledger .event-workspace-tab[aria-current="page"] {
    background: var(--live-surface) !important;
    color: var(--live-ink) !important;
    box-shadow: 0 1px 3px rgba(23,26,31,.08) !important;
  }

  html.sogrim-live-ledger .event-command-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) !important;
    gap: 10px !important;
    margin: 0 0 16px !important;
  }

  html.sogrim-live-ledger .event-command-card,
  html.sogrim-live-ledger .personal-action-card {
    min-height: 86px !important;
    text-align: start !important;
  }

  html.sogrim-live-ledger .expense-row,
  html.sogrim-live-ledger .transfer-row,
  html.sogrim-live-ledger .balance-row,
  html.sogrim-live-ledger .event-row,
  html.sogrim-live-ledger .group-row {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 12px !important;
    align-items: center !important;
    box-shadow: none !important;
  }

  html.sogrim-live-ledger input,
  html.sogrim-live-ledger select,
  html.sogrim-live-ledger textarea {
    min-height: 44px !important;
    border: 1px solid var(--live-border) !important;
    border-radius: var(--live-radius) !important;
    background: #fff !important;
    color: var(--live-ink) !important;
    box-shadow: none !important;
  }

  html.sogrim-live-ledger button:focus-visible,
  html.sogrim-live-ledger input:focus-visible,
  html.sogrim-live-ledger select:focus-visible,
  html.sogrim-live-ledger a:focus-visible {
    outline: 3px solid rgba(47,107,255,.25) !important;
    outline-offset: 3px !important;
  }

  html.sogrim-live-ledger .expense-modal,
  html.sogrim-live-ledger .event-modal {
    width: min(100%, 720px) !important;
    border: 1px solid var(--live-border) !important;
    border-radius: var(--live-radius) !important;
    background: var(--live-surface) !important;
    box-shadow: 0 24px 80px rgba(23,26,31,.22) !important;
  }

  @media (hover: hover) {
    html.sogrim-live-ledger .primary-button:hover,
    html.sogrim-live-ledger .secondary-button:hover,
    html.sogrim-live-ledger .event-row:hover,
    html.sogrim-live-ledger .expense-row:hover,
    html.sogrim-live-ledger .transfer-row:hover {
      transform: translateY(-1px) !important;
    }
  }

  @media (max-width: 760px) {
    html.sogrim-live-ledger .hero-actions,
    html.sogrim-live-ledger .summary-strip,
    html.sogrim-live-ledger .personal-summary-strip,
    html.sogrim-live-ledger .event-row,
    html.sogrim-live-ledger .expense-row,
    html.sogrim-live-ledger .transfer-row,
    html.sogrim-live-ledger .balance-row {
      grid-template-columns: 1fr !important;
    }

    html.sogrim-live-ledger .event-workspace-nav {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 480px) {
    html.sogrim-live-ledger .screen {
      padding: 12px !important;
    }

    html.sogrim-live-ledger .brand {
      padding-inline-start: 50px !important;
    }

    html.sogrim-live-ledger .event-command-grid {
      grid-template-columns: 1fr !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    html.sogrim-live-ledger *,
    html.sogrim-live-ledger *::before,
    html.sogrim-live-ledger *::after {
      animation-duration: .01ms !important;
      transition-duration: .01ms !important;
    }
  }
`;
