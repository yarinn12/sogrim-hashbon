const STYLE_ID = "public-fintech-design-layer-style";

function injectFintechDesignStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(FINTECH_DESIGN_CSS));
  document.head.append(style);
}

const FINTECH_DESIGN_CSS = `
  html.fintech-design-v1 {
    --fintech-primary: #0a766f;
    --fintech-primary-strong: #063f3b;
    --fintech-secondary: #315f88;
    --fintech-accent: #d16b49;
    --fintech-success: #16704f;
    --fintech-danger: #b42318;
    --fintech-warning: #bd862d;
    --fintech-background: #f5f7f3;
    --fintech-background-soft: #eef4ef;
    --fintech-surface: rgba(255, 253, 248, 0.94);
    --fintech-surface-solid: #fffdf8;
    --fintech-surface-elevated: rgba(255, 255, 255, 0.98);
    --fintech-border: rgba(17, 24, 22, 0.1);
    --fintech-border-strong: rgba(17, 24, 22, 0.16);
    --fintech-text: #101512;
    --fintech-text-soft: #596861;
    --fintech-text-faint: #7b8982;
    --fintech-radius-card: 8px;
    --fintech-radius-control: 8px;
    --fintech-ease-premium: cubic-bezier(0.22, 1, 0.36, 1);
    --fintech-motion: 180ms cubic-bezier(0.22, 1, 0.36, 1);
    --fintech-motion-fast: 120ms cubic-bezier(0.22, 1, 0.36, 1);
    --fintech-motion-slow: 360ms cubic-bezier(0.22, 1, 0.36, 1);
    --fintech-shadow-low: 0 8px 22px rgba(16, 21, 18, 0.07);
    --fintech-shadow-card: 0 1px 0 rgba(255, 255, 255, 0.94) inset, 0 18px 42px rgba(16, 21, 18, 0.1);
    --fintech-shadow-hover: 0 1px 0 rgba(255, 255, 255, 0.96) inset, 0 22px 54px rgba(16, 21, 18, 0.14);
    --fintech-shadow-pressed: 0 1px 0 rgba(255, 255, 255, 0.82) inset, 0 8px 18px rgba(16, 21, 18, 0.09);
    --fintech-shadow-high: 0 1px 0 rgba(255, 255, 255, 0.88) inset, 0 34px 86px rgba(16, 21, 18, 0.2);
    --fintech-ring: rgba(189, 134, 45, 0.46);
    color: var(--fintech-text);
  }

  html.fintech-design-v1 body {
    min-height: 100vh;
    background:
      linear-gradient(180deg, rgba(255, 253, 248, 0.96) 0%, rgba(240, 246, 241, 0.96) 45%, rgba(249, 248, 243, 0.98) 100%),
      linear-gradient(110deg, rgba(10, 118, 111, 0.11) 0 23%, transparent 42%),
      linear-gradient(250deg, rgba(49, 95, 136, 0.08) 0 19%, transparent 38%) !important;
    color: var(--fintech-text);
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  html.fintech-design-v1 body::selection {
    background: rgba(10, 118, 111, 0.2);
    color: var(--fintech-primary-strong);
  }

  html.fintech-design-v1 .app::before {
    background-image:
      linear-gradient(rgba(10, 118, 111, 0.052) 1px, transparent 1px),
      linear-gradient(90deg, rgba(49, 95, 136, 0.046) 1px, transparent 1px);
    background-size: 56px 56px;
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.38), transparent 76%);
    opacity: 0.78;
  }

  html.fintech-design-v1 .premium-app-shell .screen,
  html.fintech-design-v1 .screen {
    width: min(100%, 1120px);
    padding: clamp(16px, 2.4vw, 24px);
  }

  html.fintech-design-v1 .product-app-identity {
    position: sticky;
    top: 10px;
    z-index: 40;
    min-height: 68px;
    margin: 0 0 16px;
    padding: 11px 12px;
    border: 1px solid rgba(255, 255, 255, 0.74);
    border-radius: var(--fintech-radius-card);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 250, 247, 0.82));
    box-shadow: var(--fintech-shadow-low);
    backdrop-filter: blur(18px);
    transition:
      border-color var(--fintech-motion),
      box-shadow var(--fintech-motion),
      background var(--fintech-motion);
  }

  html.fintech-design-v1 .product-brand-lockup {
    gap: 11px;
  }

  html.fintech-design-v1 .product-brand-mark {
    width: 52px;
    height: 52px;
    border: 1px solid rgba(255, 255, 255, 0.32);
    border-radius: var(--fintech-radius-card);
    background:
      linear-gradient(145deg, #0a766f 0%, #064f49 58%, #315f88 128%) !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.28) inset,
      0 16px 34px rgba(10, 118, 111, 0.22);
  }

  html.fintech-design-v1 .product-brand-mark::before {
    color: #fffdf8;
    font-size: 1.8rem;
    font-weight: 950;
  }

  html.fintech-design-v1 .product-brand-mark::after {
    width: 16px;
    height: 16px;
    border-width: 3px;
    background: #f2c86f;
  }

  html.fintech-design-v1 .product-brand-copy strong {
    color: var(--fintech-text);
    font-size: 1.85rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  html.fintech-design-v1 .product-brand-copy small {
    color: var(--fintech-text-soft);
    font-weight: 760;
  }

  html.fintech-design-v1 .screen > .top {
    min-height: 170px;
    align-items: flex-start;
    margin: 0 0 20px;
    padding: clamp(22px, 3.2vw, 30px);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: var(--fintech-radius-card);
    background:
      linear-gradient(135deg, rgba(5, 54, 50, 0.98) 0%, rgba(8, 94, 86, 0.96) 54%, rgba(49, 95, 136, 0.94) 132%) !important;
    box-shadow: var(--fintech-shadow-high);
  }

  html.fintech-design-v1 .screen > .top::before {
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.18), transparent 46%),
      repeating-linear-gradient(118deg, rgba(255, 255, 255, 0.11) 0 1px, transparent 1px 28px);
    opacity: 0.58;
  }

  html.fintech-design-v1 .screen > .top .brand {
    max-width: 760px;
  }

  html.fintech-design-v1 .screen > .top h1 {
    max-width: 720px;
    margin: 0 0 10px;
    color: #fffdf8;
    font-size: 2.35rem;
    font-weight: 950;
    line-height: 1.08;
    letter-spacing: 0;
  }

  html.fintech-design-v1 .screen > .top .eyebrow,
  html.fintech-design-v1 .screen > .top .muted {
    color: rgba(255, 253, 248, 0.78);
  }

  html.fintech-design-v1 .screen > .top .eyebrow {
    font-size: 0.92rem;
    font-weight: 880;
  }

  html.fintech-design-v1 .product-home-button,
  html.fintech-design-v1 .screen > .top .icon-button {
    background: rgba(255, 253, 248, 0.94) !important;
    color: var(--fintech-primary-strong);
    border-color: rgba(255, 255, 255, 0.74) !important;
  }

  html.fintech-design-v1 .hero-actions {
    display: grid;
    grid-template-columns: 1.1fr 1fr 0.9fr;
    gap: 10px;
    margin: 14px 0 18px;
  }

  html.fintech-design-v1 .primary-button,
  html.fintech-design-v1 .secondary-button,
  html.fintech-design-v1 .icon-button,
  html.fintech-design-v1 .event-workspace-tab,
  html.fintech-design-v1 .product-home-button,
  html.fintech-design-v1 .file-button {
    min-height: 46px;
    border-radius: var(--fintech-radius-control);
    font-weight: 850;
    letter-spacing: 0;
    isolation: isolate;
    user-select: none;
    will-change: transform;
    transition:
      transform var(--fintech-motion-fast),
      box-shadow var(--fintech-motion),
      border-color var(--fintech-motion),
      background var(--fintech-motion),
      color var(--fintech-motion),
      filter var(--fintech-motion);
  }

  html.fintech-design-v1 .primary-button {
    background:
      linear-gradient(135deg, var(--fintech-primary) 0%, var(--fintech-primary-strong) 82%) !important;
    color: #fffdf8;
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.22) inset,
      0 14px 30px rgba(10, 118, 111, 0.23);
  }

  html.fintech-design-v1 .secondary-button,
  html.fintech-design-v1 .icon-button,
  html.fintech-design-v1 .file-button {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 247, 0.92)) !important;
    border: 1px solid var(--fintech-border);
    color: var(--fintech-text);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.92) inset,
      0 8px 18px rgba(16, 21, 18, 0.055);
  }

  html.fintech-design-v1 .danger-button {
    color: var(--fintech-danger);
    border-color: rgba(180, 35, 24, 0.24) !important;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 245, 243, 0.92)) !important;
  }

  html.fintech-design-v1 .primary-button:active:not(:disabled),
  html.fintech-design-v1 .secondary-button:active:not(:disabled),
  html.fintech-design-v1 .icon-button:active:not(:disabled),
  html.fintech-design-v1 .event-workspace-tab:active:not(:disabled),
  html.fintech-design-v1 .product-home-button:active:not(:disabled) {
    transform: translateY(0) scale(0.985);
    box-shadow: var(--fintech-shadow-pressed) !important;
  }

  html.fintech-design-v1 .primary-button:active:not(:disabled) {
    animation: fintech-press-glow 520ms var(--fintech-ease-premium);
  }

  html.fintech-design-v1 button:focus-visible,
  html.fintech-design-v1 input:focus-visible,
  html.fintech-design-v1 select:focus-visible,
  html.fintech-design-v1 a:focus-visible {
    outline: 3px solid var(--fintech-ring);
    outline-offset: 3px;
  }

  html.fintech-design-v1 .panel,
  html.fintech-design-v1 .event-row,
  html.fintech-design-v1 .expense-row,
  html.fintech-design-v1 .group-row,
  html.fintech-design-v1 .transfer-row,
  html.fintech-design-v1 .balance-row,
  html.fintech-design-v1 .personal-action-card,
  html.fintech-design-v1 .public-personal-action-card {
    border: 1px solid var(--fintech-border) !important;
    border-radius: var(--fintech-radius-card);
    background:
      linear-gradient(180deg, var(--fintech-surface-elevated), rgba(247, 250, 247, 0.9)),
      var(--fintech-surface-solid) !important;
    box-shadow: var(--fintech-shadow-card) !important;
    transition:
      transform var(--fintech-motion),
      box-shadow var(--fintech-motion),
      border-color var(--fintech-motion),
      background var(--fintech-motion);
  }

  html.fintech-design-v1 .panel {
    padding: clamp(16px, 2vw, 20px);
  }

  html.fintech-design-v1 .section {
    margin-top: clamp(20px, 3vw, 28px);
  }

  html.fintech-design-v1 .section-title-row {
    align-items: end;
    gap: 14px;
    margin-bottom: 14px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(16, 21, 18, 0.075);
  }

  html.fintech-design-v1 .section-title-row h2,
  html.fintech-design-v1 .panel h2,
  html.fintech-design-v1 .section > h2 {
    margin-bottom: 4px;
    color: var(--fintech-text);
    font-size: 1.45rem;
    font-weight: 920;
    line-height: 1.18;
  }

  html.fintech-design-v1 h3 {
    color: var(--fintech-text);
    font-weight: 890;
  }

  html.fintech-design-v1 .muted,
  html.fintech-design-v1 small {
    color: var(--fintech-text-soft);
  }

  html.fintech-design-v1 .summary-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    padding: 0;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.fintech-design-v1 .summary-item {
    position: relative;
    min-width: 0;
    min-height: 96px;
    padding: 14px;
    overflow: hidden;
    border: 1px solid var(--fintech-border);
    border-radius: var(--fintech-radius-card);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 247, 242, 0.9));
    box-shadow: var(--fintech-shadow-low);
    transition:
      transform var(--fintech-motion),
      box-shadow var(--fintech-motion),
      border-color var(--fintech-motion);
  }

  html.fintech-design-v1 .summary-item::before {
    content: "";
    position: absolute;
    inset-block: 14px;
    inset-inline-start: 0;
    width: 3px;
    border-radius: 0 8px 8px 0;
    background: linear-gradient(180deg, var(--fintech-primary), var(--fintech-secondary));
  }

  html.fintech-design-v1 .summary-item span {
    color: var(--fintech-text-soft);
    font-weight: 760;
  }

  html.fintech-design-v1 .summary-item strong {
    color: var(--fintech-text);
    font-size: 2rem;
    font-weight: 950;
    line-height: 1.06;
  }

  html.fintech-design-v1 .personal-dashboard {
    display: grid;
    gap: 12px;
    padding: 18px;
  }

  html.fintech-design-v1 .personal-summary-strip {
    margin-top: 0;
  }

  html.fintech-design-v1 .personal-next-step,
  html.fintech-design-v1 .notice {
    border: 1px solid rgba(10, 118, 111, 0.16);
    border-radius: var(--fintech-radius-card);
    background: linear-gradient(180deg, rgba(10, 118, 111, 0.08), rgba(255, 255, 255, 0.62));
    color: var(--fintech-primary-strong);
    box-shadow: none;
  }

  html.fintech-design-v1 .event-list,
  html.fintech-design-v1 .stack,
  html.fintech-design-v1 .personal-action-list,
  html.fintech-design-v1 .public-personal-action-list {
    gap: 10px;
  }

  html.fintech-design-v1 .event-row,
  html.fintech-design-v1 .expense-row,
  html.fintech-design-v1 .transfer-row,
  html.fintech-design-v1 .group-row {
    position: relative;
    min-height: 86px;
    padding: 15px 16px;
    overflow: hidden;
  }

  html.fintech-design-v1 .event-row::before,
  html.fintech-design-v1 .expense-row::before,
  html.fintech-design-v1 .transfer-row::before {
    content: "";
    position: absolute;
    inset-block: 14px;
    inset-inline-start: 0;
    width: 3px;
    border-radius: 0 8px 8px 0;
    background: linear-gradient(180deg, var(--fintech-primary), var(--fintech-accent));
  }

  html.fintech-design-v1 .event-row-main strong,
  html.fintech-design-v1 .expense-row strong,
  html.fintech-design-v1 .transfer-row strong,
  html.fintech-design-v1 .group-row strong,
  html.fintech-design-v1 .personal-action-card strong {
    color: var(--fintech-text);
    font-weight: 910;
  }

  html.fintech-design-v1 .event-row-main strong {
    font-size: 1.18rem;
  }

  html.fintech-design-v1 .amount {
    color: var(--fintech-text);
    font-variant-numeric: tabular-nums;
    font-weight: 930;
  }

  html.fintech-design-v1 .avatar {
    border: 1px solid rgba(255, 255, 255, 0.72);
    background:
      linear-gradient(145deg, rgba(10, 118, 111, 0.16), rgba(49, 95, 136, 0.14));
    color: var(--fintech-primary-strong);
    box-shadow: 0 6px 14px rgba(16, 21, 18, 0.08);
  }

  html.fintech-design-v1 .avatar.is-guest {
    background:
      linear-gradient(145deg, rgba(209, 107, 73, 0.16), rgba(242, 200, 111, 0.2));
    color: #81402c;
  }

  html.fintech-design-v1 .status-chip {
    min-height: 28px;
    padding: 4px 10px;
    border-radius: var(--fintech-radius-control);
    border: 1px solid rgba(10, 118, 111, 0.16);
    background: rgba(10, 118, 111, 0.08);
    color: var(--fintech-primary-strong);
    font-weight: 850;
    transition:
      background var(--fintech-motion),
      border-color var(--fintech-motion),
      color var(--fintech-motion),
      transform var(--fintech-motion-fast);
  }

  html.fintech-design-v1 .status-chip.is-locked {
    border-color: rgba(209, 107, 73, 0.22);
    background: rgba(209, 107, 73, 0.09);
    color: #873f2a;
  }

  html.fintech-design-v1 .event-workspace-nav {
    position: sticky;
    top: 92px;
    z-index: 30;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    margin: 14px 0;
    padding: 6px;
    border: 1px solid rgba(255, 255, 255, 0.76);
    border-radius: var(--fintech-radius-card);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(247, 250, 247, 0.84));
    box-shadow: var(--fintech-shadow-low);
    backdrop-filter: blur(16px);
  }

  html.fintech-design-v1 .event-workspace-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 42px;
    padding: 0 12px;
    border: 1px solid transparent;
    color: var(--fintech-text-soft);
    text-decoration: none;
  }

  html.fintech-design-v1 .event-workspace-tab.is-active,
  html.fintech-design-v1 .event-workspace-tab[aria-current="page"],
  html.fintech-design-v1 .event-workspace-tab:hover:not(:disabled) {
    background: rgba(10, 118, 111, 0.1);
    border-color: rgba(10, 118, 111, 0.16);
    color: var(--fintech-primary-strong);
  }

  html.fintech-design-v1 .segmented-control button.is-active,
  html.fintech-design-v1 .segmented-control button[aria-selected="true"] {
    background: rgba(10, 118, 111, 0.11);
    border-color: rgba(10, 118, 111, 0.18);
    color: var(--fintech-primary-strong);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.86) inset;
  }

  html.fintech-design-v1 .event-insight-panel,
  html.fintech-design-v1 .settlement-hero {
    position: relative;
    align-items: stretch;
    gap: 16px;
    padding: 18px;
    overflow: hidden;
    border-color: rgba(255, 255, 255, 0.18) !important;
    background:
      linear-gradient(135deg, #0a2f2c 0%, #075f58 56%, #315f88 138%) !important;
    color: #fffdf8;
  }

  html.fintech-design-v1 .event-insight-panel::before,
  html.fintech-design-v1 .settlement-hero::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.13), transparent 48%),
      repeating-linear-gradient(118deg, rgba(255, 255, 255, 0.08) 0 1px, transparent 1px 26px);
  }

  html.fintech-design-v1 .event-insight-panel > *,
  html.fintech-design-v1 .settlement-hero > * {
    position: relative;
    z-index: 1;
  }

  html.fintech-design-v1 .event-insight-panel h2,
  html.fintech-design-v1 .event-insight-panel .muted,
  html.fintech-design-v1 .settlement-hero h2,
  html.fintech-design-v1 .settlement-hero .muted,
  html.fintech-design-v1 .settlement-hero .amount {
    color: #fffdf8;
  }

  html.fintech-design-v1 .event-insight-panel .muted,
  html.fintech-design-v1 .settlement-hero .muted {
    opacity: 0.78;
  }

  html.fintech-design-v1 .event-insight-metrics {
    gap: 10px;
  }

  html.fintech-design-v1 .event-insight-metrics > div {
    min-height: 84px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: var(--fintech-radius-card);
    background: rgba(255, 255, 255, 0.1);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.1) inset;
  }

  html.fintech-design-v1 .event-insight-metrics span {
    color: rgba(255, 253, 248, 0.72);
    font-weight: 760;
  }

  html.fintech-design-v1 .event-insight-metrics strong {
    color: #fffdf8;
    font-size: 1.55rem;
    font-weight: 940;
  }

  html.fintech-design-v1 .event-command-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(178px, 1fr));
    gap: 10px;
    margin: 16px 0 20px;
  }

  html.fintech-design-v1 .event-command-card {
    min-height: 126px;
    align-items: center;
    padding: 14px;
    border: 1px solid var(--fintech-border) !important;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(247, 250, 247, 0.92)) !important;
    color: var(--fintech-text);
    transition:
      transform var(--fintech-motion),
      box-shadow var(--fintech-motion),
      border-color var(--fintech-motion),
      background var(--fintech-motion);
  }

  html.fintech-design-v1 .primary-button.event-command-card {
    background:
      linear-gradient(135deg, var(--fintech-primary) 0%, var(--fintech-primary-strong) 78%, var(--fintech-accent) 156%) !important;
    color: #fffdf8;
  }

  html.fintech-design-v1 .event-command-card:active:not(:disabled),
  html.fintech-design-v1 .event-row:active,
  html.fintech-design-v1 .personal-action-card:active {
    transform: translateY(0) scale(0.99);
    box-shadow: var(--fintech-shadow-pressed) !important;
  }

  html.fintech-design-v1 .event-command-card .command-card-icon {
    width: 44px;
    height: 44px;
    border: 1px solid rgba(10, 118, 111, 0.18);
    border-radius: var(--fintech-radius-card);
    background:
      linear-gradient(145deg, rgba(10, 118, 111, 0.12), rgba(49, 95, 136, 0.1));
    color: var(--fintech-primary-strong);
    box-shadow: none;
  }

  html.fintech-design-v1 .primary-button.event-command-card .command-card-icon {
    border-color: rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.14);
    color: #fffdf8;
  }

  html.fintech-design-v1 .command-card-icon svg {
    width: 22px;
    height: 22px;
    stroke-width: 1.85;
  }

  html.fintech-design-v1 .event-command-card .event-command-copy {
    gap: 5px;
  }

  html.fintech-design-v1 .event-command-card strong {
    color: inherit;
    font-size: 1.06rem;
  }

  html.fintech-design-v1 .event-command-card .event-command-copy > span {
    color: var(--fintech-text-soft);
    font-size: 0.86rem;
    font-weight: 680;
  }

  html.fintech-design-v1 .primary-button.event-command-card .event-command-copy > span {
    color: rgba(255, 253, 248, 0.78);
  }

  html.fintech-design-v1 .field,
  html.fintech-design-v1 .compact-field {
    gap: 8px;
  }

  html.fintech-design-v1 .field span,
  html.fintech-design-v1 .compact-field span {
    color: var(--fintech-text);
    font-weight: 840;
  }

  html.fintech-design-v1 .field input,
  html.fintech-design-v1 .field select,
  html.fintech-design-v1 .compact-field input,
  html.fintech-design-v1 .guest-input,
  html.fintech-design-v1 .invite-link-row input,
  html.fintech-design-v1 .network-url-row input,
  html.fintech-design-v1 .payer-row input,
  html.fintech-design-v1 .payer-row select {
    min-height: 50px;
    border: 1px solid var(--fintech-border-strong);
    border-radius: var(--fintech-radius-control);
    background: rgba(255, 255, 255, 0.96);
    color: var(--fintech-text);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.86) inset;
    transition:
      border-color var(--fintech-motion),
      box-shadow var(--fintech-motion),
      background var(--fintech-motion);
  }

  html.fintech-design-v1 .field input::placeholder,
  html.fintech-design-v1 .guest-input::placeholder {
    color: rgba(89, 104, 97, 0.68);
  }

  html.fintech-design-v1 .field input:focus,
  html.fintech-design-v1 .field select:focus,
  html.fintech-design-v1 .guest-input:focus,
  html.fintech-design-v1 .payer-row input:focus,
  html.fintech-design-v1 .payer-row select:focus {
    border-color: rgba(10, 118, 111, 0.48);
    box-shadow:
      0 0 0 4px rgba(10, 118, 111, 0.11),
      0 1px 0 rgba(255, 255, 255, 0.9) inset;
  }

  html.fintech-design-v1 .participant-grid {
    gap: 8px;
  }

  html.fintech-design-v1 .participant-pill {
    min-height: 50px;
    border: 1px solid var(--fintech-border);
    border-radius: var(--fintech-radius-control);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(247, 250, 247, 0.88));
    box-shadow: 0 6px 16px rgba(16, 21, 18, 0.045);
    transition:
      transform var(--fintech-motion),
      box-shadow var(--fintech-motion),
      border-color var(--fintech-motion);
  }

  html.fintech-design-v1 .participant-pill:has(input:checked) {
    border-color: rgba(10, 118, 111, 0.34);
    background:
      linear-gradient(180deg, rgba(10, 118, 111, 0.12), rgba(255, 255, 255, 0.86));
  }

  html.fintech-design-v1 .expense-template-grid {
    gap: 8px;
  }

  html.fintech-design-v1 .expense-guest-box {
    border: 1px solid rgba(10, 118, 111, 0.15);
    border-radius: var(--fintech-radius-card);
    background:
      linear-gradient(135deg, rgba(10, 118, 111, 0.08), rgba(49, 95, 136, 0.06));
  }

  html.fintech-design-v1 .expense-modal-backdrop,
  html.fintech-design-v1 .event-modal-backdrop {
    padding: 18px;
    background:
      linear-gradient(180deg, rgba(5, 24, 22, 0.38), rgba(5, 24, 22, 0.58));
    backdrop-filter: blur(18px);
  }

  html.fintech-design-v1 .expense-modal,
  html.fintech-design-v1 .event-modal {
    max-height: min(88vh, 920px);
    overflow: auto;
    border: 1px solid rgba(255, 255, 255, 0.78) !important;
    border-radius: var(--fintech-radius-card);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(247, 250, 247, 0.96)) !important;
    box-shadow: var(--fintech-shadow-high) !important;
  }

  html.fintech-design-v1 .expense-modal-header,
  html.fintech-design-v1 .event-modal-header {
    gap: 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(16, 21, 18, 0.08);
  }

  html.fintech-design-v1 .payer-row {
    gap: 8px;
  }

  html.fintech-design-v1 .transfer-people {
    gap: 8px;
  }

  html.fintech-design-v1 .transfer-arrow {
    background: rgba(49, 95, 136, 0.1);
    color: var(--fintech-secondary);
  }

  html.fintech-design-v1 .transfer-actions,
  html.fintech-design-v1 .expense-actions,
  html.fintech-design-v1 .settlement-hero-actions,
  html.fintech-design-v1 .actions,
  html.fintech-design-v1 .inline-actions {
    gap: 8px;
  }

  html.fintech-design-v1 .balance-row.is-credit {
    border-color: rgba(22, 112, 79, 0.22) !important;
    background:
      linear-gradient(180deg, rgba(22, 112, 79, 0.08), rgba(255, 255, 255, 0.9)) !important;
  }

  html.fintech-design-v1 .balance-row.is-debt {
    border-color: rgba(209, 107, 73, 0.24) !important;
    background:
      linear-gradient(180deg, rgba(209, 107, 73, 0.08), rgba(255, 255, 255, 0.9)) !important;
  }

  html.fintech-design-v1 .empty-state {
    min-height: 92px;
    display: grid;
    place-items: center;
    padding: 18px;
    border: 1px dashed rgba(10, 118, 111, 0.28);
    border-radius: var(--fintech-radius-card);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(247, 250, 247, 0.62));
    color: var(--fintech-text-soft);
    box-shadow: none;
    text-align: center;
  }

  html.fintech-design-v1 .skeleton,
  html.fintech-design-v1 .skeleton-card,
  html.fintech-design-v1 .skeleton-line,
  html.fintech-design-v1 .skeleton-avatar {
    position: relative;
    overflow: hidden;
    border-radius: var(--fintech-radius-card);
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.54), rgba(238, 244, 239, 0.92), rgba(255, 255, 255, 0.54));
    background-size: 220% 100%;
    animation: fintech-shimmer 1.45s ease-in-out infinite;
  }

  html.fintech-design-v1 .skeleton-card {
    min-height: 112px;
    border: 1px solid var(--fintech-border);
    box-shadow: var(--fintech-shadow-low);
  }

  html.fintech-design-v1 .skeleton-line {
    height: 12px;
    width: min(100%, 260px);
  }

  html.fintech-design-v1 .skeleton-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
  }

  html.fintech-design-v1 .error,
  html.fintech-design-v1 .field-error {
    border-radius: var(--fintech-radius-control);
    background: rgba(180, 35, 24, 0.08);
    color: var(--fintech-danger);
  }

  html.fintech-design-v1 [aria-busy="true"],
  html.fintech-design-v1 .is-loading {
    position: relative;
    overflow: hidden;
  }

  html.fintech-design-v1 [aria-busy="true"]::after,
  html.fintech-design-v1 .is-loading::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
    background-size: 220% 100%;
    animation: fintech-shimmer 1.4s ease-in-out infinite;
  }

  @keyframes fintech-shimmer {
    from {
      background-position: 100% 0;
    }

    to {
      background-position: -100% 0;
    }
  }

  @keyframes fintech-float-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fintech-press-glow {
    0% {
      filter: saturate(1);
    }

    45% {
      filter: saturate(1.08) brightness(1.04);
    }

    100% {
      filter: saturate(1);
    }
  }

  @media (hover: hover) {
    html.fintech-design-v1 .primary-button:hover:not(:disabled),
    html.fintech-design-v1 .secondary-button:hover:not(:disabled),
    html.fintech-design-v1 .icon-button:hover:not(:disabled),
    html.fintech-design-v1 .event-workspace-tab:hover:not(:disabled),
    html.fintech-design-v1 .participant-pill:hover {
      transform: translateY(-1px);
      box-shadow: var(--fintech-shadow-hover);
    }

    html.fintech-design-v1 .event-row:hover,
    html.fintech-design-v1 .expense-row:hover,
    html.fintech-design-v1 .transfer-row:hover,
    html.fintech-design-v1 .summary-item:hover,
    html.fintech-design-v1 .event-command-card:hover,
    html.fintech-design-v1 .personal-action-card:hover {
      transform: translateY(-1px);
      border-color: rgba(10, 118, 111, 0.18) !important;
      box-shadow: var(--fintech-shadow-hover) !important;
    }
  }

  @media (max-width: 760px) {
    html.fintech-design-v1 .premium-app-shell .screen,
    html.fintech-design-v1 .screen {
      padding: 12px;
    }

    html.fintech-design-v1 .panel {
      padding: 15px;
    }

    html.fintech-design-v1 .product-app-identity {
      position: relative;
      top: auto;
      min-height: 0;
      align-items: stretch;
      margin-bottom: 12px;
    }

    html.fintech-design-v1 .product-brand-copy strong {
      font-size: 1.6rem;
      white-space: normal;
    }

    html.fintech-design-v1 .product-brand-copy small {
      white-space: normal;
    }

    html.fintech-design-v1 .screen > .top {
      min-height: 0;
      padding: 18px;
      margin-bottom: 14px;
    }

    html.fintech-design-v1 .screen > .top h1 {
      font-size: 1.9rem;
    }

    html.fintech-design-v1 .hero-actions,
    html.fintech-design-v1 .summary-strip,
    html.fintech-design-v1 .event-insight-panel,
    html.fintech-design-v1 .event-insight-metrics,
    html.fintech-design-v1 .settlement-hero {
      grid-template-columns: 1fr;
    }

    html.fintech-design-v1 .hero-actions,
    html.fintech-design-v1 .event-list,
    html.fintech-design-v1 .stack {
      gap: 9px;
    }

    html.fintech-design-v1 .event-workspace-nav {
      top: 8px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 12px 0;
    }

    html.fintech-design-v1 .event-command-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    html.fintech-design-v1 .event-command-card {
      min-height: 112px;
      padding: 13px;
    }

    html.fintech-design-v1 .summary-item {
      min-height: 84px;
      padding: 13px;
    }

    html.fintech-design-v1 .event-row,
    html.fintech-design-v1 .expense-row,
    html.fintech-design-v1 .transfer-row,
    html.fintech-design-v1 .group-row {
      grid-template-columns: 1fr;
      align-items: stretch;
      gap: 12px;
    }

    html.fintech-design-v1 .event-row-side,
    html.fintech-design-v1 .expense-actions,
    html.fintech-design-v1 .transfer-actions {
      align-items: start;
      justify-items: start;
    }

    html.fintech-design-v1 .invite-link-row,
    html.fintech-design-v1 .network-url-row,
    html.fintech-design-v1 .payer-row {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 480px) {
    html.fintech-design-v1 .premium-app-shell .screen,
    html.fintech-design-v1 .screen {
      padding: 10px;
    }

    html.fintech-design-v1 .product-brand-mark {
      width: 46px;
      height: 46px;
    }

    html.fintech-design-v1 .screen > .top h1 {
      font-size: 1.72rem;
    }

    html.fintech-design-v1 .primary-button,
    html.fintech-design-v1 .secondary-button,
    html.fintech-design-v1 .icon-button,
    html.fintech-design-v1 .event-workspace-tab {
      min-height: 44px;
    }

    html.fintech-design-v1 .section-title-row {
      align-items: stretch;
      grid-template-columns: 1fr;
    }

    html.fintech-design-v1 .event-command-grid {
      grid-template-columns: 1fr;
    }

    html.fintech-design-v1 .event-workspace-nav {
      grid-template-columns: 1fr 1fr;
    }

    html.fintech-design-v1 .expense-modal-backdrop,
    html.fintech-design-v1 .event-modal-backdrop {
      padding: 10px;
    }

    html.fintech-design-v1 .expense-modal,
    html.fintech-design-v1 .event-modal {
      width: min(100%, calc(100vw - 20px));
      max-height: calc(100vh - 20px);
    }
  }

  html.fintech-design-v2 {
    --font-ui: "Noto Sans Hebrew", "Heebo", "Assistant", "Segoe UI", Arial, Helvetica, sans-serif;
    --fintech-primary: #087b74;
    --fintech-primary-strong: #063f3b;
    --fintech-secondary: #245a7c;
    --fintech-accent: #c96b4b;
    --fintech-success: #17694b;
    --fintech-danger: #b42318;
    --fintech-warning: #b8872f;
    --fintech-background: #f6f7f3;
    --fintech-background-soft: #edf2ef;
    --fintech-surface: rgba(255, 255, 251, 0.95);
    --fintech-surface-solid: #fffffb;
    --fintech-surface-elevated: rgba(255, 255, 255, 0.98);
    --fintech-border: rgba(14, 22, 20, 0.11);
    --fintech-border-strong: rgba(14, 22, 20, 0.18);
    --fintech-text: #101614;
    --fintech-text-soft: #5d6b66;
    --fintech-text-faint: #83908b;
    --fintech-graphite: #101614;
    --fintech-graphite-soft: #1d2926;
    --fintech-canvas: #f6f7f3;
    --fintech-canvas-2: #edf2ef;
    --fintech-card: rgba(255, 255, 251, 0.96);
    --fintech-teal: #087b74;
    --fintech-teal-dark: #04534e;
    --fintech-gold: #b8872f;
    --fintech-coral: #c96b4b;
    --fintech-shadow-low: 0 8px 22px rgba(16, 22, 20, 0.055);
    --fintech-shadow-card: 0 1px 0 rgba(255, 255, 255, 0.88) inset, 0 18px 44px rgba(16, 22, 20, 0.085);
    --fintech-shadow-hover: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 24px 58px rgba(16, 22, 20, 0.13);
    --fintech-shadow-high: 0 1px 0 rgba(255, 255, 255, 0.24) inset, 0 32px 86px rgba(16, 22, 20, 0.18);
    --fintech-ring: rgba(184, 135, 47, 0.5);
  }

  html.fintech-design-v2 body {
    background:
      linear-gradient(180deg, rgba(255, 255, 251, 0.98) 0%, rgba(243, 247, 243, 0.98) 42%, rgba(250, 249, 244, 1) 100%),
      linear-gradient(115deg, rgba(8, 123, 116, 0.09) 0 26%, transparent 48%),
      linear-gradient(250deg, rgba(201, 107, 75, 0.055) 0 22%, transparent 42%) !important;
    font-family: var(--font-ui);
  }

  html.fintech-design-v2 :where(h1, h2, h3, button, input, select, textarea, small, span, strong) {
    letter-spacing: 0;
  }

  html.fintech-design-v2 .app::before {
    background-image:
      linear-gradient(rgba(8, 123, 116, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(16, 22, 20, 0.035) 1px, transparent 1px);
    background-size: 72px 72px;
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.3), transparent 72%);
    opacity: 0.62;
  }

  html.fintech-design-v2 .premium-app-shell .screen,
  html.fintech-design-v2 .screen {
    width: min(100%, 1180px);
    padding: clamp(14px, 2.2vw, 24px);
  }

  html.fintech-design-v2 .product-app-identity {
    top: 8px;
    min-height: 60px;
    margin-bottom: 14px;
    padding: 8px 10px;
    border-color: rgba(16, 22, 20, 0.08);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(250, 251, 247, 0.78)) !important;
    box-shadow: 0 10px 30px rgba(16, 22, 20, 0.075);
  }

  html.fintech-design-v2 .product-brand-lockup {
    gap: 10px;
  }

  html.fintech-design-v2 .product-brand-mark {
    width: 48px;
    height: 48px;
    background:
      linear-gradient(145deg, var(--fintech-graphite) 0%, var(--fintech-teal-dark) 58%, var(--fintech-secondary) 132%) !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.22) inset,
      0 15px 32px rgba(8, 123, 116, 0.2);
  }

  html.fintech-design-v2 .product-brand-mark::after {
    background: var(--fintech-gold);
  }

  html.fintech-design-v2 .product-brand-copy strong {
    font-size: clamp(1.35rem, 2vw, 1.75rem);
    line-height: 1.04;
  }

  html.fintech-design-v2 .product-brand-copy small {
    color: #697671;
    font-size: 0.88rem;
  }

  html.fintech-design-v2 .screen > .top {
    min-height: 118px;
    margin: 0 0 18px;
    padding: clamp(18px, 2.6vw, 26px);
    border-color: rgba(255, 255, 255, 0.22);
    background:
      linear-gradient(135deg, #101614 0%, #0b3f3b 58%, #245a7c 134%) !important;
    box-shadow: var(--fintech-shadow-high);
  }

  html.fintech-design-v2 .premium-screen-new-event .screen > .top,
  html.fintech-design-v2 .premium-screen-join-event .screen > .top,
  html.fintech-design-v2 .premium-screen-profile .screen > .top,
  html.fintech-design-v2 .premium-screen-groups .screen > .top {
    min-height: 96px;
  }

  html.fintech-design-v2 .screen > .top::before {
    background:
      linear-gradient(100deg, rgba(255, 255, 255, 0.14), transparent 44%),
      repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.075) 0 1px, transparent 1px 32px);
    opacity: 0.64;
  }

  html.fintech-design-v2 .screen > .top .brand {
    max-width: 780px;
  }

  html.fintech-design-v2 .screen > .top h1 {
    max-width: 780px;
    font-size: clamp(1.86rem, 3.2vw, 2.6rem);
    line-height: 1.07;
  }

  html.fintech-design-v2 .screen > .top .eyebrow {
    color: rgba(255, 255, 251, 0.7);
    font-size: 0.84rem;
  }

  html.fintech-design-v2 .screen > .top .muted {
    color: rgba(255, 255, 251, 0.72);
    max-width: 58ch;
  }

  html.fintech-design-v2 .hero-actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 12px 0 18px;
  }

  html.fintech-design-v2 .primary-button,
  html.fintech-design-v2 .secondary-button,
  html.fintech-design-v2 .icon-button,
  html.fintech-design-v2 .event-workspace-tab,
  html.fintech-design-v2 .product-home-button,
  html.fintech-design-v2 .file-button {
    min-height: 44px;
    border-radius: 8px;
    font-weight: 850;
  }

  html.fintech-design-v2 .primary-button {
    background:
      linear-gradient(135deg, var(--fintech-teal) 0%, var(--fintech-teal-dark) 76%, var(--fintech-graphite) 140%) !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.18) inset,
      0 16px 34px rgba(8, 123, 116, 0.22);
  }

  html.fintech-design-v2 .secondary-button,
  html.fintech-design-v2 .icon-button,
  html.fintech-design-v2 .file-button {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 250, 246, 0.9)) !important;
    border-color: rgba(16, 22, 20, 0.12);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.86) inset, 0 8px 20px rgba(16, 22, 20, 0.055);
  }

  html.fintech-design-v2 .product-home-button,
  html.fintech-design-v2 .screen > .top .icon-button {
    color: var(--fintech-teal-dark);
  }

  html.fintech-design-v2 .danger-button {
    color: var(--fintech-danger);
    background: linear-gradient(180deg, #fff, #fff4f1) !important;
  }

  html.fintech-design-v2 button:focus-visible,
  html.fintech-design-v2 input:focus-visible,
  html.fintech-design-v2 select:focus-visible,
  html.fintech-design-v2 a:focus-visible {
    outline: 3px solid var(--fintech-ring);
    outline-offset: 3px;
  }

  html.fintech-design-v2 .panel,
  html.fintech-design-v2 .event-row,
  html.fintech-design-v2 .expense-row,
  html.fintech-design-v2 .group-row,
  html.fintech-design-v2 .transfer-row,
  html.fintech-design-v2 .balance-row,
  html.fintech-design-v2 .personal-action-card,
  html.fintech-design-v2 .public-personal-action-card {
    border-color: var(--fintech-border) !important;
    background:
      linear-gradient(180deg, var(--fintech-surface-elevated), rgba(250, 251, 247, 0.92)),
      var(--fintech-surface-solid) !important;
    box-shadow: var(--fintech-shadow-card) !important;
  }

  html.fintech-design-v2 .panel {
    padding: clamp(16px, 2vw, 22px);
  }

  html.fintech-design-v2 .section {
    margin-top: clamp(22px, 3vw, 32px);
  }

  html.fintech-design-v2 .section-title-row {
    align-items: center;
    margin-bottom: 16px;
    border-bottom-color: rgba(16, 22, 20, 0.08);
  }

  html.fintech-design-v2 .section-title-row h2,
  html.fintech-design-v2 .panel h2,
  html.fintech-design-v2 .section > h2 {
    font-size: clamp(1.18rem, 2vw, 1.48rem);
    line-height: 1.16;
  }

  html.fintech-design-v2 .muted,
  html.fintech-design-v2 small {
    color: var(--fintech-text-soft);
  }

  html.fintech-design-v2 .summary-strip {
    gap: 8px;
  }

  html.fintech-design-v2 .summary-item {
    min-height: 92px;
    padding: 14px 15px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 245, 0.92));
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 12px 28px rgba(16, 22, 20, 0.06);
  }

  html.fintech-design-v2 .summary-item::before,
  html.fintech-design-v2 .event-row::before,
  html.fintech-design-v2 .expense-row::before,
  html.fintech-design-v2 .transfer-row::before {
    width: 2px;
    background: linear-gradient(180deg, var(--fintech-teal), var(--fintech-gold) 58%, var(--fintech-coral));
  }

  html.fintech-design-v2 .summary-item strong {
    font-size: clamp(1.55rem, 3vw, 2.05rem);
  }

  html.fintech-design-v2 .personal-dashboard {
    gap: 14px;
    padding: clamp(16px, 2vw, 22px);
  }

  html.fintech-design-v2 .personal-next-step,
  html.fintech-design-v2 .notice {
    border-color: rgba(8, 123, 116, 0.15);
    background: linear-gradient(180deg, rgba(8, 123, 116, 0.075), rgba(255, 255, 255, 0.74));
  }

  html.fintech-design-v2 .event-list,
  html.fintech-design-v2 .stack,
  html.fintech-design-v2 .personal-action-list,
  html.fintech-design-v2 .public-personal-action-list {
    gap: 11px;
  }

  html.fintech-design-v2 .event-row,
  html.fintech-design-v2 .expense-row,
  html.fintech-design-v2 .transfer-row,
  html.fintech-design-v2 .group-row {
    min-height: 82px;
    padding: 15px 16px;
  }

  html.fintech-design-v2 .event-row-main strong {
    font-size: 1.14rem;
  }

  html.fintech-design-v2 .amount {
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }

  html.fintech-design-v2 .avatar {
    background:
      linear-gradient(145deg, rgba(8, 123, 116, 0.15), rgba(36, 90, 124, 0.11));
    box-shadow: 0 8px 18px rgba(16, 22, 20, 0.08);
  }

  html.fintech-design-v2 .status-chip {
    min-height: 26px;
    background: rgba(8, 123, 116, 0.075);
    border-color: rgba(8, 123, 116, 0.15);
    color: var(--fintech-teal-dark);
  }

  html.fintech-design-v2 .event-workspace-nav {
    top: 82px;
    gap: 4px;
    margin: 12px 0 16px;
    padding: 5px;
    border-color: rgba(16, 22, 20, 0.08);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(248, 250, 246, 0.78)) !important;
    box-shadow: 0 10px 26px rgba(16, 22, 20, 0.075);
  }

  html.fintech-design-v2 .event-workspace-tab {
    min-height: 40px;
    color: #66736e;
  }

  html.fintech-design-v2 .event-workspace-tab.is-active,
  html.fintech-design-v2 .event-workspace-tab[aria-current="page"],
  html.fintech-design-v2 .event-workspace-tab:hover:not(:disabled) {
    background: rgba(8, 123, 116, 0.11);
    border-color: rgba(8, 123, 116, 0.18);
    color: var(--fintech-teal-dark);
  }

  html.fintech-design-v2 .event-insight-panel,
  html.fintech-design-v2 .settlement-hero {
    gap: 18px;
    padding: clamp(18px, 2.6vw, 24px);
    background:
      linear-gradient(135deg, #101614 0%, #0a3a36 56%, #245a7c 132%) !important;
    box-shadow: var(--fintech-shadow-high) !important;
  }

  html.fintech-design-v2 .event-insight-panel::before,
  html.fintech-design-v2 .settlement-hero::before {
    background:
      linear-gradient(100deg, rgba(255, 255, 255, 0.12), transparent 48%),
      linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.04)),
      repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.07) 0 1px, transparent 1px 30px);
  }

  html.fintech-design-v2 .event-insight-metrics {
    gap: 8px;
  }

  html.fintech-design-v2 .event-insight-metrics > div {
    min-height: 82px;
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.09);
  }

  html.fintech-design-v2 .event-command-grid {
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 11px;
    margin: 16px 0 22px;
  }

  html.fintech-design-v2 .event-command-card {
    min-height: 118px;
    padding: 15px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.985), rgba(249, 250, 246, 0.93)) !important;
    box-shadow: var(--fintech-shadow-card) !important;
  }

  html.fintech-design-v2 .primary-button.event-command-card {
    background:
      linear-gradient(135deg, var(--fintech-teal) 0%, var(--fintech-teal-dark) 74%, var(--fintech-graphite) 142%) !important;
  }

  html.fintech-design-v2 .event-command-card .command-card-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background:
      radial-gradient(circle at 32% 24%, rgba(255, 255, 255, 0.82), transparent 34%),
      linear-gradient(145deg, rgba(8, 123, 116, 0.12), rgba(184, 135, 47, 0.08));
  }

  html.fintech-design-v2 .field span,
  html.fintech-design-v2 .compact-field span {
    font-size: 0.95rem;
  }

  html.fintech-design-v2 .field input,
  html.fintech-design-v2 .field select,
  html.fintech-design-v2 .compact-field input,
  html.fintech-design-v2 .guest-input,
  html.fintech-design-v2 .invite-link-row input,
  html.fintech-design-v2 .network-url-row input,
  html.fintech-design-v2 .payer-row input,
  html.fintech-design-v2 .payer-row select {
    min-height: 48px;
    background: rgba(255, 255, 255, 0.98);
    border-color: rgba(16, 22, 20, 0.15);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.9) inset,
      0 8px 18px rgba(16, 22, 20, 0.04);
  }

  html.fintech-design-v2 .field input:focus,
  html.fintech-design-v2 .field select:focus,
  html.fintech-design-v2 .guest-input:focus,
  html.fintech-design-v2 .payer-row input:focus,
  html.fintech-design-v2 .payer-row select:focus {
    border-color: rgba(8, 123, 116, 0.52);
    box-shadow:
      0 0 0 4px rgba(8, 123, 116, 0.12),
      0 12px 26px rgba(16, 22, 20, 0.07);
  }

  html.fintech-design-v2 .participant-pill {
    background: rgba(255, 255, 255, 0.82);
    border-color: rgba(16, 22, 20, 0.1);
  }

  html.fintech-design-v2 .participant-pill:has(input:checked) {
    background: linear-gradient(180deg, rgba(8, 123, 116, 0.12), rgba(255, 255, 255, 0.88));
    border-color: rgba(8, 123, 116, 0.34);
  }

  html.fintech-design-v2 .expense-guest-box {
    background:
      linear-gradient(135deg, rgba(8, 123, 116, 0.075), rgba(184, 135, 47, 0.075));
  }

  html.fintech-design-v2 .expense-modal-backdrop,
  html.fintech-design-v2 .event-modal-backdrop {
    background:
      linear-gradient(180deg, rgba(16, 22, 20, 0.44), rgba(16, 22, 20, 0.66));
    backdrop-filter: blur(20px);
  }

  html.fintech-design-v2 .expense-modal,
  html.fintech-design-v2 .event-modal {
    background:
      linear-gradient(180deg, #ffffff, #f8faf6) !important;
    border-color: rgba(255, 255, 255, 0.76) !important;
  }

  html.fintech-design-v2 .expense-modal {
    width: min(100%, 760px);
  }

  html.fintech-design-v2 .event-modal {
    width: min(100%, 700px);
  }

  html.fintech-design-v2 .expense-modal-header,
  html.fintech-design-v2 .event-modal-header {
    position: sticky;
    top: 0;
    z-index: 2;
    margin: -1px -1px 0;
    padding: 16px 16px 14px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 246, 0.92));
    backdrop-filter: blur(14px);
  }

  html.fintech-design-v2 .transfer-arrow {
    background: rgba(36, 90, 124, 0.1);
    color: var(--fintech-secondary);
  }

  html.fintech-design-v2 .balance-row.is-credit {
    border-color: rgba(23, 105, 75, 0.2) !important;
    background:
      linear-gradient(180deg, rgba(23, 105, 75, 0.07), rgba(255, 255, 255, 0.92)) !important;
  }

  html.fintech-design-v2 .balance-row.is-debt {
    border-color: rgba(201, 107, 75, 0.2) !important;
    background:
      linear-gradient(180deg, rgba(201, 107, 75, 0.075), rgba(255, 255, 255, 0.92)) !important;
  }

  html.fintech-design-v2 .empty-state {
    min-height: 96px;
    border-color: rgba(8, 123, 116, 0.24);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(247, 249, 245, 0.72));
  }

  html.fintech-design-v2 .skeleton,
  html.fintech-design-v2 .skeleton-card,
  html.fintech-design-v2 .skeleton-line,
  html.fintech-design-v2 .skeleton-avatar {
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.58), rgba(231, 238, 234, 0.92), rgba(255, 255, 255, 0.58));
    background-size: 240% 100%;
  }

  @media (hover: hover) {
    html.fintech-design-v2 .primary-button:hover:not(:disabled),
    html.fintech-design-v2 .secondary-button:hover:not(:disabled),
    html.fintech-design-v2 .icon-button:hover:not(:disabled),
    html.fintech-design-v2 .event-workspace-tab:hover:not(:disabled),
    html.fintech-design-v2 .participant-pill:hover {
      transform: translateY(-1px);
      filter: saturate(1.03);
      box-shadow: var(--fintech-shadow-hover) !important;
    }

    html.fintech-design-v2 .event-row:hover,
    html.fintech-design-v2 .expense-row:hover,
    html.fintech-design-v2 .transfer-row:hover,
    html.fintech-design-v2 .summary-item:hover,
    html.fintech-design-v2 .event-command-card:hover,
    html.fintech-design-v2 .personal-action-card:hover,
    html.fintech-design-v2 .public-personal-action-card:hover {
      transform: translateY(-2px);
      border-color: rgba(8, 123, 116, 0.2) !important;
      box-shadow: var(--fintech-shadow-hover) !important;
    }
  }

  @media (max-width: 760px) {
    html.fintech-design-v2 .premium-app-shell .screen,
    html.fintech-design-v2 .screen {
      padding: 10px;
    }

    html.fintech-design-v2 .product-app-identity {
      margin-bottom: 10px;
      padding: 8px;
    }

    html.fintech-design-v2 .product-brand-mark {
      width: 44px;
      height: 44px;
    }

    html.fintech-design-v2 .product-brand-copy strong {
      font-size: 1.45rem;
    }

    html.fintech-design-v2 .screen > .top {
      min-height: 0;
      padding: 16px;
      margin-bottom: 12px;
    }

    html.fintech-design-v2 .screen > .top h1 {
      font-size: clamp(1.55rem, 8vw, 1.95rem);
    }

    html.fintech-design-v2 .hero-actions,
    html.fintech-design-v2 .summary-strip,
    html.fintech-design-v2 .event-insight-panel,
    html.fintech-design-v2 .event-insight-metrics,
    html.fintech-design-v2 .settlement-hero {
      grid-template-columns: 1fr;
    }

    html.fintech-design-v2 .event-workspace-nav {
      top: 6px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 10px 0 14px;
    }

    html.fintech-design-v2 .event-command-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 9px;
    }

    html.fintech-design-v2 .event-command-card {
      min-height: 104px;
      padding: 13px;
    }
  }

  @media (max-width: 480px) {
    html.fintech-design-v2 .product-brand-copy small {
      font-size: 0.78rem;
    }

    html.fintech-design-v2 .hero-actions,
    html.fintech-design-v2 .event-command-grid {
      grid-template-columns: 1fr;
    }

    html.fintech-design-v2 .event-workspace-nav {
      grid-template-columns: 1fr 1fr;
    }

    html.fintech-design-v2 .expense-modal-backdrop,
    html.fintech-design-v2 .event-modal-backdrop {
      padding: 8px;
    }

    html.fintech-design-v2 .expense-modal,
    html.fintech-design-v2 .event-modal {
      width: min(100%, calc(100vw - 16px));
      max-height: calc(100vh - 16px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    html.fintech-design-v1 *,
    html.fintech-design-v1 *::before,
    html.fintech-design-v1 *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
    }
  }
`;

document.documentElement.classList.add("fintech-design-v1");
document.documentElement.classList.add("fintech-design-v2");
injectFintechDesignStyles();
