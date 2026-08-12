const STYLE_ID = "public-design-v2-layer-style";

const CSS = `
  html.product-v2-live {
    --v2-canvas: #f4f7f6;
    --v2-surface: #ffffff;
    --v2-surface-soft: #edf3f1;
    --v2-ink: #13201d;
    --v2-muted: #5c6c67;
    --v2-faint: #7a8984;
    --v2-line: #dce5e2;
    --v2-primary: #08776d;
    --v2-primary-deep: #07554f;
    --v2-primary-soft: #dff1ed;
    --v2-hero: #0b3b36;
    --v2-warm: #c65f43;
    --v2-warm-soft: #fff0ea;
    --v2-gold: #b2832f;
    --v2-focus: rgba(8, 119, 109, 0.28);
    --v2-danger: #b9473d;
    --v2-radius: 8px;
    --v2-shadow-1: 0 2px 8px rgba(19, 32, 29, 0.07);
    --v2-shadow-2: 0 8px 24px rgba(19, 32, 29, 0.11);
    --v2-ease: 180ms cubic-bezier(0.22, 1, 0.36, 1);
    color: var(--v2-ink);
    background: var(--v2-canvas);
    -webkit-font-smoothing: antialiased;
  }

  html.product-v2-live body {
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0;
    padding-inline:
      env(safe-area-inset-left)
      env(safe-area-inset-right);
    color: var(--v2-ink);
    background: var(--v2-canvas) !important;
  }

  html.product-v2-live body,
  html.product-v2-live button,
  html.product-v2-live input,
  html.product-v2-live select {
    font-family: "Heebo", "Noto Sans Hebrew", system-ui, sans-serif;
  }

  html.product-v2-live h1,
  html.product-v2-live h2,
  html.product-v2-live h3 {
    color: var(--v2-ink);
    letter-spacing: 0;
    text-wrap: balance;
  }

  html.product-v2-live p {
    text-wrap: pretty;
  }

  html.product-v2-live .screen {
    width: min(100%, 1120px) !important;
    gap: 18px !important;
    padding: 18px 20px 64px !important;
  }

  html.product-v2-live .product-app-identity {
    position: sticky !important;
    top: 0 !important;
    z-index: 20 !important;
    min-height: 70px;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 18px !important;
    margin: 0 !important;
    padding: 10px 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: rgba(244, 247, 246, 0.94) !important;
    box-shadow: none !important;
    backdrop-filter: blur(16px);
  }

  html.product-v2-live .product-brand-lockup {
    gap: 10px !important;
  }

  html.product-v2-live .product-brand-mark {
    width: 46px !important;
    height: 46px !important;
    display: grid !important;
    place-items: center !important;
    border: 0 !important;
    border-radius: var(--v2-radius) !important;
    color: #fff !important;
    background: var(--v2-primary) !important;
    box-shadow: var(--v2-shadow-1) !important;
  }

  html.product-v2-live .product-brand-glyph {
    width: auto !important;
    height: auto !important;
    display: block !important;
    font-size: 28px;
    font-weight: 800;
    line-height: 1;
    transform: translateY(-1px);
  }

  html.product-v2-live .product-brand-copy {
    gap: 1px !important;
  }

  html.product-v2-live .product-brand-copy strong {
    color: var(--v2-ink) !important;
    font-size: 24px !important;
    font-weight: 850 !important;
    line-height: 1 !important;
  }

  html.product-v2-live .product-brand-copy small {
    color: var(--v2-muted) !important;
    font-size: 13px !important;
    font-weight: 650 !important;
  }

  html.product-v2-live .product-app-nav {
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
    padding: 4px !important;
    border: 1px solid var(--v2-line);
    border-radius: var(--v2-radius);
    background: var(--v2-surface);
    box-shadow: none !important;
  }

  html.product-v2-live .product-nav-button {
    min-width: 0;
    min-height: 40px !important;
    gap: 7px !important;
    padding: 0 12px !important;
    border: 0 !important;
    border-radius: 6px !important;
    color: var(--v2-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    transition:
      color var(--v2-ease),
      background-color var(--v2-ease),
      transform var(--v2-ease) !important;
  }

  html.product-v2-live .product-nav-button svg {
    width: 18px !important;
    height: 18px !important;
    stroke-width: 1.8 !important;
  }

  html.product-v2-live .product-nav-button:hover,
  html.product-v2-live .product-nav-button.is-active {
    color: var(--v2-primary-deep) !important;
    background: var(--v2-primary-soft) !important;
    transform: none !important;
  }

  html.product-v2-live .screen > .top {
    position: relative !important;
    min-height: 176px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 28px !important;
    align-items: center !important;
    margin: 0 !important;
    padding: 28px 32px !important;
    overflow: hidden !important;
    color: #fff !important;
    border: 0 !important;
    border-radius: var(--v2-radius) !important;
    background: var(--v2-hero) !important;
    box-shadow: var(--v2-shadow-2) !important;
  }

  html.product-v2-live .screen > .top::before {
    content: "" !important;
    position: absolute;
    inset-inline-end: 0;
    inset-block: 0;
    width: 7px;
    display: block !important;
    background: var(--v2-warm);
    opacity: 1;
  }

  html.product-v2-live .screen > .top::after {
    content: none !important;
    display: none !important;
  }

  html.product-v2-live .screen > .top .brand {
    grid-column: auto !important;
    grid-row: auto !important;
    width: auto !important;
    max-width: 660px !important;
    padding: 0 !important;
  }

  html.product-v2-live .screen > .top .eyebrow {
    margin: 0 0 8px !important;
    color: #f1c576 !important;
    font-size: 13px !important;
    font-weight: 750 !important;
  }

  html.product-v2-live .screen > .top h1 {
    max-width: 18ch !important;
    margin: 0 !important;
    color: #fff !important;
    font-size: 40px !important;
    font-weight: 850 !important;
    line-height: 1.08 !important;
    text-shadow: none !important;
  }

  html.product-v2-live .screen > .top .muted {
    margin: 9px 0 0 !important;
    color: rgba(255, 255, 255, 0.74) !important;
    font-size: 16px !important;
    font-weight: 600 !important;
  }

  html.product-v2-live .product-hero-artwork {
    display: none !important;
  }

  html.product-v2-live .screen > .top .hero-actions,
  html.product-v2-live .screen.product-empty-home > .top .hero-actions {
    position: static !important;
    grid-column: auto !important;
    width: 260px !important;
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 8px !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  html.product-v2-live .screen > .top .app-back-button {
    position: absolute !important;
    inset-block-start: 14px;
    inset-inline-start: 14px;
    z-index: 2;
    width: 44px !important;
    min-width: 44px !important;
    height: 44px !important;
    min-height: 44px !important;
    color: var(--v2-ink) !important;
    background: #fff !important;
    box-shadow: var(--v2-shadow-1) !important;
  }

  html.product-v2-live .screen:not([data-product-screen="home"]) > .top {
    min-height: 108px !important;
    padding: 20px 24px !important;
    box-shadow: var(--v2-shadow-1) !important;
  }

  html.product-v2-live .screen:not([data-product-screen="home"]) > .top h1 {
    max-width: none !important;
    font-size: 30px !important;
    line-height: 1.15 !important;
  }

  html.product-v2-live .screen:not([data-product-screen="home"]) > .top .eyebrow {
    margin-bottom: 5px !important;
  }

  html.product-v2-live .create-event-panel > .section-title-row:first-child {
    display: none !important;
  }

  html.product-v2-live .event-type-picker {
    min-width: 0;
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 0;
    border: 0;
  }

  html.product-v2-live .event-type-picker legend {
    padding: 0;
    color: var(--v2-ink);
    font-size: 16px;
    font-weight: 800;
  }

  html.product-v2-live .event-type-picker > .muted {
    margin: 0 0 4px;
    font-size: 13px;
  }

  html.product-v2-live .event-type-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  html.product-v2-live .event-type-option {
    min-width: 0;
    min-height: 92px;
    display: grid;
    align-content: center;
    gap: 5px;
    padding: 14px;
    border: 1px solid var(--v2-line);
    border-radius: var(--v2-radius);
    color: var(--v2-ink);
    background: var(--v2-surface);
    box-shadow: none;
    text-align: start;
    transition:
      border-color var(--v2-ease),
      background-color var(--v2-ease),
      box-shadow var(--v2-ease),
      transform var(--v2-ease);
  }

  html.product-v2-live .event-type-option:hover {
    border-color: rgba(8, 119, 109, 0.38);
    background: #fbfdfc;
    transform: translateY(-1px);
  }

  html.product-v2-live .event-type-option:focus-visible {
    outline: 3px solid var(--v2-focus);
    outline-offset: 2px;
  }

  html.product-v2-live .event-type-option.is-active {
    border-color: var(--v2-primary);
    background: var(--v2-primary-soft);
    box-shadow: 0 0 0 1px var(--v2-primary);
  }

  html.product-v2-live .event-type-option:active,
  html.product-v2-live .event-start-panel button:active,
  html.product-v2-live .create-event-submit:active {
    transform: scale(0.96);
  }

  html.product-v2-live .event-type-option strong {
    font-size: 16px;
    font-weight: 820;
  }

  html.product-v2-live .event-type-option span {
    color: var(--v2-muted);
    font-size: 13px;
    line-height: 1.45;
  }

  html.product-v2-live .field > span small {
    color: var(--v2-faint);
    font-size: 12px;
    font-weight: 600;
  }

  html.product-v2-live .screen[data-product-screen="home"] > .top {
    min-height: 210px !important;
    text-align: start !important;
  }

  html.product-v2-live .screen[data-product-screen="home"] > .top .brand {
    grid-column: auto !important;
    max-width: 650px !important;
  }

  html.product-v2-live .screen[data-product-screen="home"] > .top h1 {
    font-size: 46px !important;
  }

  html.product-v2-live .screen.product-empty-home > .top {
    min-height: 230px !important;
    place-items: initial !important;
    justify-items: initial !important;
    text-align: start !important;
    padding: 30px 34px !important;
  }

  html.product-v2-live .screen.product-empty-home > .top .brand {
    margin: 0 !important;
    padding: 0 !important;
  }

  html.product-v2-live .screen.product-empty-home .hero-actions {
    width: 260px !important;
    grid-template-columns: 1fr !important;
    margin: 0 !important;
  }

  html.product-v2-live .primary-button,
  html.product-v2-live .secondary-button,
  html.product-v2-live .icon-button,
  html.product-v2-live .event-workspace-tab {
    min-height: 46px;
    border-radius: var(--v2-radius) !important;
    font-weight: 750 !important;
    letter-spacing: 0;
    touch-action: manipulation;
    transition:
      transform var(--v2-ease),
      background-color var(--v2-ease),
      color var(--v2-ease),
      box-shadow var(--v2-ease),
      border-color var(--v2-ease) !important;
  }

  html.product-v2-live .primary-button {
    border: 1px solid transparent !important;
    color: #fff !important;
    background: var(--v2-primary) !important;
    box-shadow: 0 3px 8px rgba(8, 119, 109, 0.2) !important;
  }

  html.product-v2-live .secondary-button,
  html.product-v2-live .icon-button,
  html.product-v2-live .event-workspace-tab {
    border: 1px solid var(--v2-line) !important;
    color: var(--v2-ink) !important;
    background: var(--v2-surface) !important;
    box-shadow: none !important;
  }

  html.product-v2-live button:active:not(:disabled),
  html.product-v2-live .event-row:active {
    transform: scale(0.96) !important;
  }

  html.product-v2-live button:focus-visible,
  html.product-v2-live input:focus-visible,
  html.product-v2-live select:focus-visible,
  html.product-v2-live a:focus-visible {
    outline: 3px solid var(--v2-focus) !important;
    outline-offset: 2px !important;
  }

  html.product-v2-live button:disabled {
    cursor: not-allowed !important;
    opacity: 0.46 !important;
    box-shadow: none !important;
  }

  html.product-v2-live .panel,
  html.product-v2-live .event-row,
  html.product-v2-live .expense-row,
  html.product-v2-live .group-row,
  html.product-v2-live .transfer-row,
  html.product-v2-live .balance-row,
  html.product-v2-live .event-insight-panel,
  html.product-v2-live .event-command-card {
    border: 0 !important;
    border-radius: var(--v2-radius) !important;
    background: var(--v2-surface) !important;
    box-shadow: var(--v2-shadow-1) !important;
  }

  html.product-v2-live .personal-dashboard {
    display: grid !important;
    gap: 14px !important;
    padding: 20px !important;
    background: var(--v2-surface) !important;
  }

  html.product-v2-live .section-title-row {
    gap: 12px !important;
    align-items: end !important;
  }

  html.product-v2-live .section-title-row h2,
  html.product-v2-live .section > h2 {
    margin: 0 !important;
    font-size: 24px !important;
    font-weight: 820 !important;
  }

  html.product-v2-live .muted {
    color: var(--v2-muted) !important;
  }

  html.product-v2-live .summary-strip,
  html.product-v2-live .personal-summary-strip {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 0 !important;
    padding: 0 !important;
    overflow: hidden;
    border: 0 !important;
    border-radius: var(--v2-radius) !important;
    background: var(--v2-surface) !important;
    box-shadow: var(--v2-shadow-1) !important;
  }

  html.product-v2-live .summary-item {
    min-height: 88px !important;
    display: grid !important;
    align-content: center !important;
    gap: 4px !important;
    padding: 16px 20px !important;
    border: 0 !important;
    border-inline-start: 1px solid var(--v2-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.product-v2-live .summary-item:first-child {
    border-inline-start: 0 !important;
  }

  html.product-v2-live .summary-item span {
    color: var(--v2-muted) !important;
    font-size: 13px !important;
    font-weight: 650 !important;
  }

  html.product-v2-live .summary-item strong,
  html.product-v2-live .amount {
    color: var(--v2-ink) !important;
    font-variant-numeric: tabular-nums;
  }

  html.product-v2-live .summary-item strong {
    font-size: 24px !important;
    font-weight: 820 !important;
  }

  html.product-v2-live .event-list,
  html.product-v2-live .stack {
    gap: 10px !important;
  }

  html.product-v2-live .event-row {
    min-height: 82px !important;
    padding: 14px 16px !important;
    text-align: start !important;
    transition:
      transform var(--v2-ease),
      box-shadow var(--v2-ease),
      background-color var(--v2-ease) !important;
  }

  html.product-v2-live .event-row:hover {
    background: #fbfdfc !important;
    box-shadow: var(--v2-shadow-2) !important;
    transform: translateY(-1px);
  }

  html.product-v2-live .event-row-main strong {
    color: var(--v2-ink) !important;
    font-size: 17px !important;
    font-weight: 800 !important;
  }

  html.product-v2-live .event-row-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  html.product-v2-live .event-type-chip {
    min-height: 24px;
    display: inline-flex;
    align-items: center;
    width: max-content;
    padding: 3px 8px;
    border-radius: 999px;
    color: var(--v2-primary-deep);
    background: var(--v2-primary-soft);
    font-size: 11px;
    font-weight: 780;
    line-height: 1;
  }

  html.product-v2-live .event-row small {
    color: var(--v2-muted) !important;
    font-size: 13px !important;
  }

  html.product-v2-live .opened-at {
    color: #60706a !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    letter-spacing: 0 !important;
  }

  html.product-v2-live .top .opened-at {
    color: rgba(255, 255, 255, 0.76) !important;
  }

  html.product-v2-live .status-chip {
    min-height: 26px !important;
    border: 0 !important;
    border-radius: 999px !important;
    background: var(--v2-primary-soft) !important;
    color: var(--v2-primary-deep) !important;
    font-size: 12px !important;
    font-weight: 750 !important;
  }

  html.product-v2-live .event-workspace-nav {
    position: sticky !important;
    top: 70px !important;
    z-index: 14 !important;
    display: flex !important;
    gap: 4px !important;
    padding: 5px !important;
    overflow-x: auto;
    scrollbar-width: none;
    border: 1px solid var(--v2-line) !important;
    border-radius: var(--v2-radius) !important;
    background: rgba(255, 255, 255, 0.96) !important;
    box-shadow: var(--v2-shadow-1) !important;
    backdrop-filter: blur(14px);
  }

  html.product-v2-live .event-workspace-nav::-webkit-scrollbar {
    display: none;
  }

  html.product-v2-live .event-workspace-tab {
    flex: 1 0 auto !important;
    min-width: 108px !important;
    min-height: 42px !important;
    border: 0 !important;
    border-radius: 6px !important;
    color: var(--v2-muted) !important;
    background: transparent !important;
  }

  html.product-v2-live .event-workspace-tab.is-active,
  html.product-v2-live .event-workspace-tab[aria-current="page"] {
    color: #fff !important;
    background: var(--v2-primary) !important;
    box-shadow: none !important;
  }

  html.product-v2-live .event-type-guide {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border: 1px solid var(--v2-line);
    border-inline-start: 4px solid var(--v2-primary);
    border-radius: var(--v2-radius);
    background: var(--v2-surface);
  }

  html.product-v2-live .event-type-guide > div {
    min-width: 0;
  }

  html.product-v2-live .event-type-guide strong {
    display: block;
    color: var(--v2-ink);
    font-size: 15px;
    font-weight: 800;
  }

  html.product-v2-live .event-type-guide p {
    margin: 3px 0 0;
    color: var(--v2-muted);
    font-size: 13px;
    line-height: 1.45;
  }

  html.product-v2-live .event-type-guide-trip {
    border-inline-start-color: var(--v2-gold);
  }

  html.product-v2-live .event-type-guide-trip .event-type-chip {
    color: #6f4f12;
    background: #f8edcf;
  }

  html.product-v2-live .event-start-panel {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 0.42fr) !important;
    align-items: center !important;
    gap: 20px !important;
    padding: 24px !important;
    border: 0 !important;
    background: var(--v2-surface) !important;
    box-shadow: var(--v2-shadow-2) !important;
  }

  html.product-v2-live .event-start-copy {
    min-width: 0;
  }

  html.product-v2-live .event-start-copy h2 {
    margin: 12px 0 6px;
    font-size: 30px;
    line-height: 1.15;
    font-weight: 840;
  }

  html.product-v2-live .event-start-copy p {
    max-width: 620px;
    margin: 0;
    color: var(--v2-muted);
    font-size: 15px;
    line-height: 1.55;
  }

  html.product-v2-live .event-start-primary {
    min-height: 88px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 10px !important;
    padding: 16px 18px !important;
    font-size: 17px !important;
    font-weight: 820 !important;
    transition:
      transform var(--v2-ease),
      box-shadow var(--v2-ease),
      background-color var(--v2-ease) !important;
  }

  html.product-v2-live .event-start-primary .command-card-icon {
    width: 36px !important;
    height: 36px !important;
    color: #fff !important;
    background: rgba(255, 255, 255, 0.16) !important;
  }

  html.product-v2-live .event-start-secondary {
    grid-column: 1 / -1;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding-top: 14px;
    border-top: 1px solid var(--v2-line);
  }

  html.product-v2-live .event-start-secondary button {
    min-height: 42px !important;
  }

  html.product-v2-live .create-event-submit {
    min-width: 160px;
  }

  html.product-v2-live .event-insight-panel {
    grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr) !important;
    gap: 20px !important;
    padding: 22px !important;
    overflow: visible !important;
  }

  html.product-v2-live .event-insight-main h2,
  html.product-v2-live .settlement-hero h2 {
    margin: 10px 0 6px !important;
    font-size: 30px !important;
    line-height: 1.15 !important;
    font-weight: 840 !important;
  }

  html.product-v2-live .event-insight-panel [data-action="show-expense-form"] {
    display: none !important;
  }

  html.product-v2-live .event-insight-metrics {
    display: none !important;
  }

  html.product-v2-live .event-insight-metrics div {
    min-height: 72px !important;
    padding: 12px !important;
    border: 0 !important;
    border-radius: 6px !important;
    background: var(--v2-surface-soft) !important;
  }

  html.product-v2-live .event-command-grid {
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 10px !important;
  }

  html.product-v2-live .event-command-card {
    min-height: 112px !important;
    display: grid !important;
    align-content: start !important;
    gap: 10px !important;
    padding: 16px !important;
    text-align: start !important;
  }

  html.product-v2-live .event-command-card[data-action="show-expense-form"] {
    grid-column: span 2 !important;
    color: #fff !important;
    background: var(--v2-primary) !important;
    box-shadow: 0 4px 12px rgba(8, 119, 109, 0.22) !important;
  }

  html.product-v2-live .event-command-card[data-action="show-expense-form"] strong,
  html.product-v2-live .event-command-card[data-action="show-expense-form"] .event-command-copy > span {
    color: #fff !important;
  }

  html.product-v2-live .command-card-icon {
    width: 38px !important;
    height: 38px !important;
    border: 0 !important;
    border-radius: 6px !important;
    color: var(--v2-primary-deep) !important;
    background: var(--v2-primary-soft) !important;
  }

  html.product-v2-live .primary-button.event-command-card .command-card-icon {
    color: #fff !important;
    background: rgba(255, 255, 255, 0.16) !important;
  }

  html.product-v2-live .event-command-copy strong {
    color: var(--v2-ink) !important;
    font-size: 16px !important;
    font-weight: 800 !important;
  }

  html.product-v2-live .event-command-copy > span {
    color: var(--v2-muted) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
  }

  html.product-v2-live .field {
    gap: 7px !important;
  }

  html.product-v2-live .field > span,
  html.product-v2-live .field > label {
    color: var(--v2-ink) !important;
    font-size: 14px !important;
    font-weight: 750 !important;
  }

  html.product-v2-live input,
  html.product-v2-live select {
    min-height: 48px !important;
    border: 1px solid var(--v2-line) !important;
    border-radius: var(--v2-radius) !important;
    color: var(--v2-ink) !important;
    background: var(--v2-surface) !important;
    box-shadow: none !important;
  }

  html.product-v2-live input::placeholder {
    color: #667771 !important;
    opacity: 1;
  }

  html.product-v2-live input:hover,
  html.product-v2-live select:hover {
    border-color: #b9c9c4 !important;
  }

  html.product-v2-live .expense-modal-backdrop,
  html.product-v2-live .event-modal-backdrop {
    background: rgba(10, 22, 19, 0.54) !important;
    backdrop-filter: blur(8px) !important;
  }

  html.product-v2-live .expense-modal,
  html.product-v2-live .event-modal {
    border: 0 !important;
    border-radius: var(--v2-radius) !important;
    background: var(--v2-surface) !important;
    box-shadow: 0 16px 48px rgba(10, 22, 19, 0.24) !important;
  }

  html.product-v2-live .expense-modal-header,
  html.product-v2-live .event-modal-header {
    border-bottom: 1px solid var(--v2-line) !important;
    background: rgba(255, 255, 255, 0.97) !important;
  }

  html.product-v2-live .expense-modal > .product-form-helper {
    display: none !important;
  }

  html.product-v2-live .expense-mode-switch,
  html.product-v2-live .quick-purpose-switch {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 4px !important;
    padding: 4px !important;
    border: 1px solid var(--v2-line) !important;
    border-radius: var(--v2-radius) !important;
    background: var(--v2-surface-soft) !important;
  }

  html.product-v2-live .expense-mode-switch button,
  html.product-v2-live .quick-purpose-switch button {
    min-height: 42px !important;
    padding: 8px 12px !important;
    border: 0 !important;
    border-radius: 6px !important;
    color: var(--v2-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font: inherit;
    font-weight: 700 !important;
  }

  html.product-v2-live .expense-mode-switch button.is-active,
  html.product-v2-live .quick-purpose-switch button.is-active {
    color: var(--v2-primary-deep) !important;
    background: var(--v2-surface) !important;
    box-shadow: var(--v2-shadow-1) !important;
  }

  html.product-v2-live .quick-purpose-switch {
    margin-top: 10px !important;
  }

  html.product-v2-live .quick-expense-meta {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 12px !important;
  }

  html.product-v2-live .quick-expense-meta > .field:only-child {
    grid-column: 1 / -1;
  }

  html.product-v2-live .quick-items-section {
    display: grid !important;
    gap: 12px !important;
    padding: 18px !important;
    border: 1px solid var(--v2-line) !important;
    border-radius: var(--v2-radius) !important;
    background: #f9fbfa !important;
  }

  html.product-v2-live .quick-item-list {
    display: grid !important;
    gap: 8px !important;
  }

  html.product-v2-live .quick-item-row {
    display: grid !important;
    grid-template-columns: 34px minmax(150px, 1.4fr) minmax(100px, 0.6fr) minmax(150px, 1fr) 44px !important;
    gap: 8px !important;
    align-items: end !important;
    padding: 10px !important;
    border: 1px solid var(--v2-line) !important;
    border-radius: var(--v2-radius) !important;
    background: var(--v2-surface) !important;
  }

  html.product-v2-live .quick-item-number {
    width: 28px;
    height: 28px;
    align-self: center;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--v2-primary-deep);
    background: var(--v2-primary-soft);
    font-size: 13px;
    font-weight: 800;
  }

  html.product-v2-live .quick-item-row input,
  html.product-v2-live .quick-item-row select {
    min-width: 0 !important;
  }

  html.product-v2-live .quick-item-remove {
    width: 44px !important;
    min-width: 44px !important;
    height: 48px !important;
    color: var(--v2-danger) !important;
  }

  html.product-v2-live .quick-item-custom-share {
    grid-column: 2 / -2;
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 8px !important;
    padding: 10px !important;
    border: 1px solid var(--v2-line) !important;
    border-radius: 8px !important;
    background: #f6faf8 !important;
  }

  html.product-v2-live .quick-item-custom-share label {
    position: relative;
    display: inline-flex !important;
    min-height: 40px !important;
    align-items: center !important;
    padding: 8px 12px !important;
    border: 1px solid var(--v2-line) !important;
    border-radius: 7px !important;
    color: var(--v2-muted) !important;
    background: var(--v2-surface) !important;
    cursor: pointer;
    font-size: 14px !important;
    font-weight: 750 !important;
    transition: border-color 160ms ease, background 160ms ease, color 160ms ease, box-shadow 160ms ease !important;
  }

  html.product-v2-live .quick-item-custom-share label:hover {
    border-color: #80bdb5 !important;
  }

  html.product-v2-live .quick-item-custom-share label.is-selected {
    border-color: #75bdb3 !important;
    color: var(--v2-primary-deep) !important;
    background: var(--v2-primary-soft) !important;
    box-shadow: inset 0 0 0 1px rgba(8, 119, 109, 0.06) !important;
  }

  html.product-v2-live .quick-item-custom-share input {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    overflow: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  html.product-v2-live .draft-restored-note {
    width: fit-content;
    margin: 8px 0 0 !important;
    padding: 6px 9px !important;
    border: 1px solid #bcded8 !important;
    border-radius: 6px !important;
    color: var(--v2-primary-deep) !important;
    background: var(--v2-primary-soft) !important;
    font-size: 13px !important;
    font-weight: 750 !important;
  }

  html.product-v2-live .quick-add-item {
    justify-self: start;
  }

  html.product-v2-live .quick-split-summary {
    display: grid !important;
    gap: 12px !important;
    padding: 18px !important;
    border: 1px solid #bcded8 !important;
    border-radius: var(--v2-radius) !important;
    background: var(--v2-primary-soft) !important;
  }

  html.product-v2-live .quick-split-summary .section-title-row {
    margin: 0 !important;
  }

  html.product-v2-live .quick-split-list {
    display: grid !important;
    gap: 1px !important;
    overflow: hidden;
    border-radius: 6px;
    background: rgba(8, 119, 109, 0.12);
  }

  html.product-v2-live .quick-split-list > div {
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    background: var(--v2-surface);
  }

  html.product-v2-live .expense-day-group {
    display: grid !important;
    gap: 8px !important;
  }

  html.product-v2-live .expense-day-group + .expense-day-group {
    margin-top: 16px !important;
  }

  html.product-v2-live .expense-day-heading {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 4px;
    color: var(--v2-muted);
    font-size: 14px;
    font-weight: 750;
  }

  html.product-v2-live .expense-day-heading strong {
    min-width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--v2-primary-deep);
    background: var(--v2-primary-soft);
    font-size: 12px;
  }

  html.product-v2-live .expense-template-grid {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 7px !important;
  }

  html.product-v2-live .expense-template-grid .secondary-button {
    min-height: 38px !important;
    padding-inline: 12px !important;
    border-radius: 999px !important;
  }

  html.product-v2-live .payer-row,
  html.product-v2-live .expense-guest-box,
  html.product-v2-live .product-form-helper {
    border: 0 !important;
    border-radius: var(--v2-radius) !important;
    background: var(--v2-surface-soft) !important;
    box-shadow: none !important;
  }

  html.product-v2-live .payer-row {
    padding: 10px !important;
  }

  html.product-v2-live .expense-guest-box {
    padding: 16px !important;
  }

  html.product-v2-live .product-form-helper {
    color: var(--v2-ink) !important;
  }

  html.product-v2-live .product-form-helper span {
    color: var(--v2-muted) !important;
  }

  html.product-v2-live .expense-payer-summary {
    border-radius: 6px !important;
  }

  html.product-v2-live .settlement-hero {
    grid-template-columns: minmax(0, 1fr) minmax(250px, 0.55fr) !important;
    gap: 22px !important;
    padding: 24px !important;
    color: #fff !important;
    background: var(--v2-hero) !important;
    box-shadow: var(--v2-shadow-2) !important;
  }

  html.product-v2-live .settlement-hero h2,
  html.product-v2-live .settlement-hero .muted,
  html.product-v2-live .settlement-hero .amount {
    color: #fff !important;
  }

  html.product-v2-live .settlement-hero-amount {
    font-size: 42px !important;
    font-weight: 850 !important;
  }

  html.product-v2-live .settlement-hero-actions {
    display: grid !important;
    gap: 7px !important;
  }

  html.product-v2-live .expense-row,
  html.product-v2-live .group-row,
  html.product-v2-live .transfer-row,
  html.product-v2-live .balance-row {
    min-height: 72px !important;
    padding: 14px 16px !important;
  }

  html.product-v2-live .empty-state {
    min-height: 126px !important;
    display: grid !important;
    place-items: center !important;
    padding: 24px !important;
    border: 1px dashed #bfd0cb !important;
    border-radius: var(--v2-radius) !important;
    color: var(--v2-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.product-v2-live .home-empty-events {
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.product-v2-live .home-empty-events .empty-state {
    min-height: 112px !important;
  }

  html.product-v2-live .public-profile-gate {
    min-height: 100vh;
    min-height: 100dvh;
    padding: 18px !important;
    background: var(--v2-canvas) !important;
    backdrop-filter: none !important;
  }

  html.product-v2-live .public-profile-modal {
    width: min(100%, 680px) !important;
    min-height: 0 !important;
    grid-template-columns: 1fr !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: var(--v2-radius) !important;
    background: var(--v2-surface) !important;
    box-shadow: var(--v2-shadow-2) !important;
  }

  html.product-v2-live .public-profile-hero {
    min-height: 0 !important;
    padding: 18px 22px !important;
    color: var(--v2-ink) !important;
    background: var(--v2-surface-soft) !important;
  }

  html.product-v2-live .public-profile-hero .product-brand-copy strong {
    color: var(--v2-ink) !important;
  }

  html.product-v2-live .public-profile-hero .product-brand-copy small {
    color: var(--v2-muted) !important;
  }

  html.product-v2-live .public-profile-form {
    padding: 28px !important;
    background: var(--v2-surface) !important;
  }

  html.product-v2-live .public-profile-form h2 {
    margin: 0 0 6px !important;
    font-size: 34px !important;
    line-height: 1.1 !important;
    font-weight: 850 !important;
  }

  html.product-v2-live .public-profile-privacy {
    color: var(--v2-muted) !important;
  }

  html.product-v2-live .danger-button {
    color: var(--v2-danger) !important;
    border-color: #edc9c5 !important;
    background: #fff7f6 !important;
  }

  @media (hover: hover) {
    html.product-v2-live .primary-button:hover:not(:disabled) {
      background: var(--v2-primary-deep) !important;
      box-shadow: 0 4px 10px rgba(8, 119, 109, 0.24) !important;
      transform: translateY(-1px);
    }

    html.product-v2-live .secondary-button:hover:not(:disabled),
    html.product-v2-live .icon-button:hover:not(:disabled),
    html.product-v2-live .event-workspace-tab:hover:not(:disabled) {
      border-color: #b9c9c4 !important;
      background: #f9fbfa !important;
      transform: translateY(-1px);
    }
  }

  @media (max-width: 760px) {
    html.product-v2-live .product-app-identity button,
    html.product-v2-live .product-app-nav button {
      min-height: 44px !important;
    }

    html.product-v2-live .screen {
      gap: 12px !important;
      padding: 10px 12px calc(32px + env(safe-area-inset-bottom)) !important;
    }

    html.product-v2-live .product-app-identity {
      position: static !important;
      min-height: 62px;
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) 44px !important;
      gap: 10px !important;
      padding: max(6px, env(safe-area-inset-top)) 0 6px !important;
    }

    html.product-v2-live .product-app-identity .product-brand-lockup {
      grid-column: 1;
      min-width: 0;
    }

    html.product-v2-live .product-app-identity .product-home-button {
      grid-column: 2;
      grid-row: 1;
      width: 44px !important;
      min-width: 44px !important;
      height: 44px !important;
      padding: 0 !important;
      border-color: var(--v2-line) !important;
      background: var(--v2-surface) !important;
      box-shadow: none !important;
    }

    html.product-v2-live .product-app-identity .product-home-button > span:last-child {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      clip: rect(0 0 0 0) !important;
      white-space: nowrap !important;
    }

    html.product-v2-live .product-brand-mark {
      width: 40px !important;
      height: 40px !important;
    }

    html.product-v2-live .product-brand-glyph {
      font-size: 24px;
    }

    html.product-v2-live .product-brand-copy strong {
      font-size: 21px !important;
    }

    html.product-v2-live .product-brand-copy small {
      display: none !important;
    }

    html.product-v2-live .product-app-nav {
      grid-column: 1 / -1;
      gap: 2px !important;
      padding: 3px !important;
    }

    html.product-v2-live .product-nav-button {
      width: 42px !important;
      min-width: 42px !important;
      padding: 0 !important;
    }

    html.product-v2-live .product-nav-button span {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      clip: rect(0 0 0 0) !important;
      white-space: nowrap !important;
    }

    html.product-v2-live .screen > .top,
    html.product-v2-live .screen[data-product-screen="home"] > .top,
    html.product-v2-live .screen.product-empty-home > .top {
      min-height: 0 !important;
      grid-template-columns: 1fr !important;
      gap: 20px !important;
      padding: 24px 20px !important;
      text-align: start !important;
    }

    html.product-v2-live .screen:not([data-product-screen="home"]) > .top {
      min-height: 92px !important;
      gap: 10px !important;
      padding: 18px 16px !important;
    }

    html.product-v2-live .screen:not([data-product-screen="home"]) > .top h1 {
      font-size: 27px !important;
    }

    html.product-v2-live .screen > .top .brand,
    html.product-v2-live .screen[data-product-screen="home"] > .top .brand {
      grid-column: 1 !important;
      width: 100% !important;
      max-width: 100% !important;
      padding-inline-start: 48px !important;
      padding-inline-end: 0 !important;
    }

    html.product-v2-live .screen[data-product-screen="home"] > .top .brand {
      padding-inline-start: 0 !important;
    }

    html.product-v2-live .screen > .top h1,
    html.product-v2-live .screen[data-product-screen="home"] > .top h1 {
      max-width: 100% !important;
      font-size: 32px !important;
      line-height: 1.12 !important;
    }

    html.product-v2-live .screen > .top .hero-actions,
    html.product-v2-live .screen.product-empty-home .hero-actions {
      grid-column: 1 !important;
      width: 100% !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 8px !important;
    }

    html.product-v2-live .summary-strip,
    html.product-v2-live .personal-summary-strip {
      grid-template-columns: 1fr !important;
    }

    html.product-v2-live .summary-item {
      min-height: 66px !important;
      grid-template-columns: 1fr auto !important;
      align-items: center !important;
      border-inline-start: 0 !important;
      border-top: 1px solid var(--v2-line) !important;
    }

    html.product-v2-live .summary-item:first-child {
      border-top: 0 !important;
    }

    html.product-v2-live .event-workspace-nav {
      top: 0 !important;
      margin-inline: -2px;
    }

    html.product-v2-live .event-type-options {
      grid-template-columns: 1fr !important;
    }

    html.product-v2-live .event-type-option {
      min-height: 72px;
    }

    html.product-v2-live .event-type-guide {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }

    html.product-v2-live .event-start-panel {
      grid-template-columns: 1fr !important;
      gap: 16px !important;
      padding: 20px !important;
    }

    html.product-v2-live .event-start-copy h2 {
      font-size: 26px;
    }

    html.product-v2-live .event-start-primary {
      min-height: 64px !important;
    }

    html.product-v2-live .event-start-secondary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    html.product-v2-live .event-start-secondary button {
      min-width: 0 !important;
      padding-inline: 8px !important;
    }

    html.product-v2-live .event-workspace-tab {
      min-width: 96px !important;
      min-height: 44px !important;
      touch-action: manipulation;
    }

    html.product-v2-live .segmented-control button {
      min-height: 44px !important;
      touch-action: manipulation;
    }

    html.product-v2-live .event-start-secondary .secondary-button {
      min-height: 44px !important;
      touch-action: manipulation;
    }

    html.product-v2-live .event-insight-panel,
    html.product-v2-live .settlement-hero {
      grid-template-columns: 1fr !important;
    }

    html.product-v2-live .event-command-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    html.product-v2-live .event-command-card {
      min-height: 104px !important;
      padding: 14px !important;
    }

    html.product-v2-live .event-command-card[data-action="show-expense-form"] {
      grid-column: 1 / -1 !important;
    }

    html.product-v2-live .quick-expense-meta {
      grid-template-columns: 1fr !important;
    }

    html.product-v2-live .quick-item-row {
      grid-template-columns: 28px minmax(0, 1fr) 44px !important;
      align-items: end !important;
    }

    html.product-v2-live .quick-item-row > .field {
      grid-column: 2;
    }

    html.product-v2-live .quick-item-row > .field:nth-of-type(2),
    html.product-v2-live .quick-item-row > .field:nth-of-type(3) {
      grid-column: 2;
    }

    html.product-v2-live .quick-item-number {
      grid-column: 1;
      grid-row: 1;
      align-self: center;
    }

    html.product-v2-live .quick-item-remove {
      grid-column: 3;
      grid-row: 1;
    }

    html.product-v2-live .quick-item-custom-share {
      grid-column: 2 / 4;
      padding: 8px !important;
    }

    html.product-v2-live .quick-item-custom-share label {
      flex: 1 1 calc(50% - 4px);
      justify-content: center !important;
    }

    html.product-v2-live .event-row,
    html.product-v2-live .expense-row,
    html.product-v2-live .group-row,
    html.product-v2-live .transfer-row,
    html.product-v2-live .balance-row,
    html.product-v2-live .payer-row {
      grid-template-columns: 1fr !important;
    }

    html.product-v2-live .public-profile-gate {
      align-items: center !important;
      padding: 12px !important;
    }

    html.product-v2-live .public-profile-form {
      padding: 24px 20px !important;
    }

    html.product-v2-live .public-profile-form h2 {
      font-size: 30px !important;
    }
  }

  @media (max-width: 420px) {
    html.product-v2-live .screen > .top .hero-actions,
    html.product-v2-live .screen.product-empty-home .hero-actions {
      grid-template-columns: 1fr !important;
    }

    html.product-v2-live .event-command-grid {
      grid-template-columns: 1fr !important;
    }

    html.product-v2-live .event-command-card[data-action="show-expense-form"] {
      grid-column: 1 !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    html.product-v2-live *,
    html.product-v2-live *::before,
    html.product-v2-live *::after {
      scroll-behavior: auto !important;
      animation-duration: 1ms !important;
      transition-duration: 1ms !important;
    }
  }
`;

document.documentElement.classList.add("product-v2-live");
injectDesignV2Styles();

function injectDesignV2Styles() {
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(CSS));
  document.head.append(style);
}
