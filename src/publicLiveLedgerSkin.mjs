const STYLE_ID = "sogrim-live-ledger-skin";

installLiveLedgerSkin();
markActiveScreen();

const appRoot = document.querySelector("#app");
if (appRoot) {
  new MutationObserver(markActiveScreen).observe(appRoot, { childList: true, subtree: true });
}

function installLiveLedgerSkin() {
  document.documentElement.classList.add("sogrim-live-ledger", "live-ledger-force-v2");

  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(LIVE_LEDGER_CSS));
  document.head.append(style);
}

function markActiveScreen() {
  const screen = document.querySelector("#app .screen");
  if (!screen) return;

  screen.classList.add("live-ledger-screen");
  screen.classList.toggle("live-ledger-home", Boolean(screen.querySelector('[data-action="new-event"]')));
  screen.classList.toggle("live-ledger-event", Boolean(screen.querySelector('[data-action="show-expense-form"]')));
  screen.classList.toggle("live-ledger-settlement", Boolean(screen.querySelector('[data-action="copy-settlement"]')));
  screen.classList.toggle("live-ledger-groups", Boolean(screen.querySelector('[data-action="create-group"]')));
}

const LIVE_LEDGER_CSS = `
  html.live-ledger-force-v2 {
    --ledger-bg: #f1f4f0;
    --ledger-ink: #111513;
    --ledger-muted: #65716b;
    --ledger-faint: #8b9691;
    --ledger-surface: #fffefa;
    --ledger-soft: #f7faf7;
    --ledger-line: rgba(17, 21, 19, 0.1);
    --ledger-line-strong: rgba(17, 21, 19, 0.18);
    --ledger-primary: #087b74;
    --ledger-primary-dark: #044b46;
    --ledger-accent: #224f6e;
    --ledger-gold: #bd8b32;
    --ledger-danger: #b42318;
    --ledger-radius: 8px;
    --ledger-shadow-low: 0 8px 22px rgba(17, 21, 19, 0.055);
    --ledger-shadow: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 18px 44px rgba(17, 21, 19, 0.09);
    --ledger-shadow-high: 0 1px 0 rgba(255, 255, 255, 0.2) inset, 0 32px 82px rgba(17, 21, 19, 0.22);
    background: var(--ledger-bg) !important;
  }

  html.live-ledger-force-v2 body {
    min-height: 100vh !important;
    background:
      linear-gradient(180deg, #fbfcf8 0%, var(--ledger-bg) 44%, #f6f3ea 100%),
      linear-gradient(118deg, rgba(8, 123, 116, 0.07) 0 30%, transparent 58%) !important;
    color: var(--ledger-ink) !important;
    font-family: Assistant, Heebo, "Noto Sans Hebrew", system-ui, sans-serif !important;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  html.live-ledger-force-v2 .app::before,
  html.live-ledger-force-v2 .app::after,
  html.live-ledger-force-v2 .product-v2 .top::before,
  html.live-ledger-force-v2 .product-v2 .top::after,
  html.live-ledger-force-v2 .screen > .top::before {
    display: none !important;
  }

  html.live-ledger-force-v2 .screen,
  html.live-ledger-force-v2 .live-ledger-screen,
  html.live-ledger-force-v2.visual-refresh-v6 .screen,
  html.live-ledger-force-v2.visual-refresh-v6 .command-center-screen {
    width: min(100%, 1160px) !important;
    padding: clamp(12px, 2vw, 22px) !important;
    gap: 14px !important;
    animation: none !important;
  }

  html.live-ledger-force-v2 .product-app-identity {
    position: sticky !important;
    top: 10px !important;
    z-index: 60 !important;
    min-height: 60px !important;
    margin: 0 0 12px !important;
    padding: 8px 10px !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    border-radius: var(--ledger-radius) !important;
    background: linear-gradient(135deg, #101513 0%, #073e39 64%, #224f6e 140%) !important;
    box-shadow: var(--ledger-shadow-high) !important;
    backdrop-filter: blur(18px) !important;
  }

  html.live-ledger-force-v2 .product-brand-copy strong,
  html.live-ledger-force-v2 .product-brand-copy small {
    color: #fffefa !important;
  }

  html.live-ledger-force-v2 .product-brand-copy small {
    opacity: 0.72 !important;
  }

  html.live-ledger-force-v2 .product-brand-mark {
    width: 46px !important;
    height: 46px !important;
    border-radius: var(--ledger-radius) !important;
    background: #fffefa !important;
    color: var(--ledger-primary-dark) !important;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22) !important;
  }

  html.live-ledger-force-v2 .product-home-button,
  html.live-ledger-force-v2 .screen > .top .icon-button {
    min-width: 48px !important;
    min-height: 44px !important;
    border-radius: var(--ledger-radius) !important;
    background: rgba(255, 254, 250, 0.94) !important;
    color: var(--ledger-primary-dark) !important;
    border: 1px solid rgba(255, 255, 255, 0.72) !important;
    box-shadow: 0 12px 26px rgba(17, 21, 19, 0.12) !important;
  }

  html.live-ledger-force-v2 .screen > .top,
  html.live-ledger-force-v2 .product-v2 .top,
  html.live-ledger-force-v2.visual-refresh-v6 .screen > .top,
  html.live-ledger-force-v2.visual-refresh-v6 .product-v2 .top {
    min-height: 116px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 18px !important;
    margin: 0 0 14px !important;
    padding: clamp(18px, 2.8vw, 28px) !important;
    overflow: hidden !important;
    color: var(--ledger-ink) !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-radius) !important;
    background:
      linear-gradient(135deg, rgba(255, 254, 250, 0.98), rgba(247, 250, 247, 0.92)),
      var(--ledger-surface) !important;
    box-shadow: var(--ledger-shadow) !important;
  }

  html.live-ledger-force-v2 .screen > .top::after,
  html.live-ledger-force-v2.visual-refresh-v6 .screen > .top::after {
    content: "" !important;
    display: block !important;
    position: absolute !important;
    inset-inline: 18px !important;
    bottom: 0 !important;
    height: 4px !important;
    border-radius: 999px 999px 0 0 !important;
    background: linear-gradient(90deg, var(--ledger-primary), var(--ledger-accent), var(--ledger-gold)) !important;
    opacity: 1 !important;
  }

  html.live-ledger-force-v2 .screen > .top .brand,
  html.live-ledger-force-v2.visual-refresh-v6 .screen > .top .brand {
    width: min(100%, 820px) !important;
    max-width: 820px !important;
    padding-inline-start: 0 !important;
  }

  html.live-ledger-force-v2 .screen > .top .brand::before,
  html.live-ledger-force-v2 .screen > .top .brand::after,
  html.live-ledger-force-v2.visual-refresh-v6 .screen > .top .brand::before,
  html.live-ledger-force-v2.visual-refresh-v6 .screen > .top .brand::after {
    display: none !important;
  }

  html.live-ledger-force-v2 h1,
  html.live-ledger-force-v2 .brand h1,
  html.live-ledger-force-v2.visual-refresh-v6 .screen > .top h1,
  html.live-ledger-force-v2.visual-refresh-v6 .product-v2 .top h1 {
    max-width: 760px !important;
    margin: 0 0 8px !important;
    color: var(--ledger-ink) !important;
    font-size: clamp(2rem, 3.6vw, 3.15rem) !important;
    line-height: 1.02 !important;
    font-weight: 950 !important;
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  html.live-ledger-force-v2 .eyebrow,
  html.live-ledger-force-v2 .screen > .top .eyebrow,
  html.live-ledger-force-v2.visual-refresh-v6 .screen > .top .eyebrow {
    margin: 0 0 5px !important;
    color: var(--ledger-primary) !important;
    font-size: 0.82rem !important;
    font-weight: 900 !important;
  }

  html.live-ledger-force-v2 .muted,
  html.live-ledger-force-v2 small,
  html.live-ledger-force-v2 .screen > .top .muted,
  html.live-ledger-force-v2 .product-hero-note,
  html.live-ledger-force-v2.visual-refresh-v6 .screen > .top .muted {
    color: var(--ledger-muted) !important;
    font-weight: 750 !important;
    line-height: 1.55 !important;
  }

  html.live-ledger-force-v2 .live-ledger-home .product-context-bar,
  html.live-ledger-force-v2 .live-ledger-home .product-home-kicker,
  html.live-ledger-force-v2 .command-center-home .product-context-bar,
  html.live-ledger-force-v2 .command-center-home .product-home-kicker {
    display: none !important;
  }

  html.live-ledger-force-v2 .hero-actions,
  html.live-ledger-force-v2.visual-refresh-v6 .hero-actions,
  html.live-ledger-force-v2.visual-refresh-v6 .command-action-grid {
    display: grid !important;
    grid-template-columns: 1.35fr 1fr 1fr !important;
    gap: 12px !important;
    margin: 0 0 14px !important;
    padding: 0 !important;
    background: transparent !important;
    backdrop-filter: none !important;
  }

  html.live-ledger-force-v2 .hero-actions > button,
  html.live-ledger-force-v2.visual-refresh-v6 .hero-actions > button {
    min-height: 72px !important;
    justify-content: flex-start !important;
    padding: 15px 16px !important;
    text-align: start !important;
    white-space: normal !important;
  }

  html.live-ledger-force-v2 .primary-button,
  html.live-ledger-force-v2 .secondary-button,
  html.live-ledger-force-v2 .icon-button,
  html.live-ledger-force-v2 .event-workspace-tab,
  html.live-ledger-force-v2 .file-button {
    min-height: 44px !important;
    border-radius: var(--ledger-radius) !important;
    font-weight: 900 !important;
    letter-spacing: 0 !important;
    transition: transform 150ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease !important;
  }

  html.live-ledger-force-v2 .primary-button {
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    background: linear-gradient(135deg, var(--ledger-primary) 0%, var(--ledger-primary-dark) 70%, #111513 138%) !important;
    color: #fffefa !important;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.18) inset, 0 16px 34px rgba(8, 123, 116, 0.22) !important;
  }

  html.live-ledger-force-v2 .secondary-button,
  html.live-ledger-force-v2 .icon-button,
  html.live-ledger-force-v2 .file-button {
    border: 1px solid var(--ledger-line) !important;
    background: linear-gradient(180deg, #ffffff, #f8faf7) !important;
    color: var(--ledger-ink) !important;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.88) inset, var(--ledger-shadow-low) !important;
  }

  html.live-ledger-force-v2 .panel,
  html.live-ledger-force-v2 .event-row,
  html.live-ledger-force-v2 .expense-row,
  html.live-ledger-force-v2 .group-row,
  html.live-ledger-force-v2 .transfer-row,
  html.live-ledger-force-v2 .balance-row,
  html.live-ledger-force-v2 .summary-item,
  html.live-ledger-force-v2 .personal-action-card,
  html.live-ledger-force-v2 .public-personal-action-card,
  html.live-ledger-force-v2 .event-command-card,
  html.live-ledger-force-v2 .empty-state {
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-radius) !important;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(250, 251, 247, 0.94)) !important;
    color: var(--ledger-ink) !important;
    box-shadow: var(--ledger-shadow) !important;
  }

  html.live-ledger-force-v2 .panel {
    padding: clamp(15px, 2vw, 22px) !important;
  }

  html.live-ledger-force-v2 .summary-strip,
  html.live-ledger-force-v2 .personal-summary-strip,
  html.live-ledger-force-v2.visual-refresh-v6 .summary-strip {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 10px !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.live-ledger-force-v2 .summary-item {
    min-height: 86px !important;
    padding: 14px 15px !important;
    overflow: hidden !important;
  }

  html.live-ledger-force-v2 .event-command-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)) !important;
    gap: 11px !important;
    margin: 14px 0 18px !important;
  }

  html.live-ledger-force-v2 .event-command-card {
    min-height: 104px !important;
    align-content: end !important;
    text-align: start !important;
  }

  html.live-ledger-force-v2 .event-row,
  html.live-ledger-force-v2 .expense-row,
  html.live-ledger-force-v2 .transfer-row,
  html.live-ledger-force-v2 .group-row,
  html.live-ledger-force-v2 .balance-row {
    min-height: 74px !important;
    padding: 14px 16px !important;
  }

  html.live-ledger-force-v2 .amount,
  html.live-ledger-force-v2 .summary-item strong,
  html.live-ledger-force-v2 .event-row-main strong,
  html.live-ledger-force-v2 .expense-row strong,
  html.live-ledger-force-v2 .transfer-row strong,
  html.live-ledger-force-v2 .group-row strong {
    color: var(--ledger-ink) !important;
    font-weight: 950 !important;
    font-variant-numeric: tabular-nums !important;
  }

  html.live-ledger-force-v2 .event-workspace-nav {
    top: 76px !important;
    gap: 5px !important;
    padding: 5px !important;
    margin: 8px 0 14px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-radius) !important;
    background: rgba(255, 254, 250, 0.88) !important;
    box-shadow: var(--ledger-shadow-low) !important;
    backdrop-filter: blur(16px) !important;
  }

  html.live-ledger-force-v2 .event-workspace-tab.is-active,
  html.live-ledger-force-v2 .event-workspace-tab[aria-current="page"] {
    background: rgba(8, 123, 116, 0.12) !important;
    color: var(--ledger-primary-dark) !important;
  }

  html.live-ledger-force-v2 input,
  html.live-ledger-force-v2 select,
  html.live-ledger-force-v2 textarea {
    min-height: 46px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: var(--ledger-radius) !important;
    background: #fff !important;
    color: var(--ledger-ink) !important;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 8px 18px rgba(17, 21, 19, 0.04) !important;
  }

  html.live-ledger-force-v2 .expense-modal,
  html.live-ledger-force-v2 .event-modal {
    width: min(100%, 720px) !important;
    border: 1px solid rgba(255, 255, 255, 0.76) !important;
    border-radius: var(--ledger-radius) !important;
    background: linear-gradient(180deg, #fff, #f8faf6) !important;
    box-shadow: var(--ledger-shadow-high) !important;
  }

  @media (hover: hover) {
    html.live-ledger-force-v2 .primary-button:hover:not(:disabled),
    html.live-ledger-force-v2 .secondary-button:hover:not(:disabled),
    html.live-ledger-force-v2 .event-row:hover,
    html.live-ledger-force-v2 .expense-row:hover,
    html.live-ledger-force-v2 .transfer-row:hover,
    html.live-ledger-force-v2 .event-command-card:hover,
    html.live-ledger-force-v2 .summary-item:hover {
      transform: translateY(-2px) !important;
      border-color: rgba(8, 123, 116, 0.22) !important;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.94) inset, 0 24px 58px rgba(17, 21, 19, 0.14) !important;
    }
  }

  @media (max-width: 760px) {
    html.live-ledger-force-v2 .product-app-identity {
      position: relative !important;
      top: auto !important;
    }

    html.live-ledger-force-v2 .screen > .top,
    html.live-ledger-force-v2.visual-refresh-v6 .screen > .top {
      grid-template-columns: 1fr !important;
      min-height: 0 !important;
      padding: 16px !important;
    }

    html.live-ledger-force-v2 h1,
    html.live-ledger-force-v2.visual-refresh-v6 .screen > .top h1 {
      font-size: clamp(1.72rem, 8vw, 2.24rem) !important;
    }

    html.live-ledger-force-v2 .hero-actions,
    html.live-ledger-force-v2 .summary-strip,
    html.live-ledger-force-v2 .personal-summary-strip {
      grid-template-columns: 1fr !important;
    }

    html.live-ledger-force-v2 .hero-actions > button {
      min-height: 66px !important;
    }
  }
`;
