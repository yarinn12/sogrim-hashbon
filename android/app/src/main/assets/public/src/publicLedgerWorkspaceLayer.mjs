const STYLE_ID = "public-ledger-workspace-layer-style";

const CSS = `
  html.ledger-workspace-v1 {
    --ledger-canvas: #edf3f1;
    --ledger-canvas-deep: #e3ebe8;
    --ledger-surface: #fbfdfc;
    --ledger-surface-soft: #f3f7f5;
    --ledger-ink: #071b18;
    --ledger-muted: #536763;
    --ledger-faint: #72827e;
    --ledger-line: #d3dfdc;
    --ledger-line-strong: #b8cac5;
    --ledger-brand: #064b43;
    --ledger-brand-hover: #033a34;
    --ledger-accent: #21aaa6;
    --ledger-accent-soft: #dcf3ef;
    --ledger-positive: #187158;
    --ledger-negative: #b94739;
    --ledger-warning: #8b5d25;
    --ledger-radius: 8px;
    --ledger-control-radius: 8px;
    --ledger-shadow-border:
      0 0 0 1px rgba(7, 27, 24, 0.065),
      0 1px 2px -1px rgba(7, 27, 24, 0.08),
      0 4px 8px rgba(7, 27, 24, 0.045);
    --ledger-shadow-border-hover:
      0 0 0 1px rgba(6, 75, 67, 0.13),
      0 2px 4px rgba(7, 27, 24, 0.075),
      0 6px 8px rgba(7, 27, 24, 0.05);
    --ledger-shadow-control:
      0 0 0 1px rgba(7, 27, 24, 0.075),
      0 2px 6px rgba(7, 27, 24, 0.07);
    --ledger-focus-ring: 0 0 0 3px rgba(33, 170, 166, 0.18);
    color: var(--ledger-ink);
    background: var(--ledger-canvas);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  html.ledger-workspace-v1 body,
  html.ledger-workspace-v1 .app,
  html.ledger-workspace-v1 .screen {
    color: var(--ledger-ink) !important;
    background: var(--ledger-canvas) !important;
  }

  html.ledger-workspace-v1 body * {
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  html.ledger-workspace-v1 body,
  html.ledger-workspace-v1 button,
  html.ledger-workspace-v1 input,
  html.ledger-workspace-v1 select,
  html.ledger-workspace-v1 textarea {
    font-family: "IBM Plex Sans Hebrew", "Noto Sans Hebrew", system-ui, sans-serif !important;
    letter-spacing: 0 !important;
  }

  html.ledger-workspace-v1 .amount,
  html.ledger-workspace-v1 .opened-at,
  html.ledger-workspace-v1 .currency-input-badge {
    font-family: "IBM Plex Mono", monospace !important;
    font-variant-numeric: tabular-nums;
  }

  html.ledger-workspace-v1 .screen {
    width: min(100%, 960px) !important;
    padding-inline: 24px !important;
    padding-bottom: calc(92px + env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1 .skip-link {
    position: fixed !important;
    inset-block-start: 8px !important;
    inset-inline-start: 50% !important;
    z-index: 400 !important;
    padding: 10px 14px !important;
    border-radius: 7px !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    transform: translate(-50%, -160%) !important;
  }

  html.ledger-workspace-v1 .skip-link:focus {
    transform: translate(-50%, 0) !important;
  }

  html.ledger-workspace-v1 h1,
  html.ledger-workspace-v1 h2,
  html.ledger-workspace-v1 h3 {
    color: var(--ledger-ink) !important;
    letter-spacing: 0 !important;
    text-wrap: balance;
  }

  html.ledger-workspace-v1 h1[tabindex="-1"]:focus {
    outline: none !important;
  }

  html.ledger-workspace-v1 .muted {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 body,
  html.ledger-workspace-v1 .app,
  html.ledger-workspace-v1 .screen,
  html.ledger-workspace-v1 .screen > .top,
  html.ledger-workspace-v1 .screen > .top .brand,
  html.ledger-workspace-v1 .section {
    filter: none !important;
    backdrop-filter: none !important;
  }

  html.ledger-workspace-v1 .product-hero-artwork,
  html.ledger-workspace-v1 .product-hero-note,
  html.ledger-workspace-v1 .screen > .top::before,
  html.ledger-workspace-v1 .screen > .top::after,
  html.ledger-workspace-v1 .recent-event-shortcut::before,
  html.ledger-workspace-v1 .recent-event-shortcut::after,
  html.ledger-workspace-v1 .event-row::before,
  html.ledger-workspace-v1 .event-row::after,
  html.ledger-workspace-v1 .panel::before,
  html.ledger-workspace-v1 .panel::after {
    content: none !important;
    display: none !important;
  }

  html.ledger-workspace-v1 button,
  html.ledger-workspace-v1 a,
  html.ledger-workspace-v1 input,
  html.ledger-workspace-v1 select,
  html.ledger-workspace-v1 textarea {
    transition:
      color 170ms cubic-bezier(0.2, 0, 0, 1),
      background-color 170ms cubic-bezier(0.2, 0, 0, 1),
      border-color 170ms cubic-bezier(0.2, 0, 0, 1),
      box-shadow 170ms cubic-bezier(0.2, 0, 0, 1),
      opacity 170ms cubic-bezier(0.2, 0, 0, 1),
      transform 140ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 button:focus-visible,
  html.ledger-workspace-v1 a:focus-visible,
  html.ledger-workspace-v1 input:focus-visible,
  html.ledger-workspace-v1 select:focus-visible,
  html.ledger-workspace-v1 textarea:focus-visible {
    outline: 3px solid rgba(34, 174, 178, 0.28) !important;
    outline-offset: 2px !important;
  }

  html.ledger-workspace-v1 .primary-button {
    min-height: 48px !important;
    border: 1px solid var(--ledger-brand) !important;
    border-radius: var(--ledger-control-radius) !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow: none !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .primary-button:hover:not(:disabled) {
    border-color: var(--ledger-brand-hover) !important;
    background: var(--ledger-brand-hover) !important;
    box-shadow: 0 4px 8px rgba(10, 79, 73, 0.16) !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 button:disabled,
  html.ledger-workspace-v1 .primary-button:disabled,
  html.ledger-workspace-v1 .secondary-button:disabled {
    border-color: var(--ledger-line) !important;
    color: #87938f !important;
    background: var(--ledger-canvas-deep) !important;
    box-shadow: none !important;
    opacity: 0.72 !important;
    cursor: not-allowed !important;
  }

  html.ledger-workspace-v1 .primary-button:active:not(:disabled),
  html.ledger-workspace-v1 .secondary-button:active:not(:disabled),
  html.ledger-workspace-v1 .icon-button:active:not(:disabled) {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .secondary-button,
  html.ledger-workspace-v1 .icon-button,
  html.ledger-workspace-v1 .product-home-button {
    min-height: 44px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: var(--ledger-control-radius) !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .secondary-button:hover:not(:disabled),
  html.ledger-workspace-v1 .icon-button:hover:not(:disabled),
  html.ledger-workspace-v1 .product-home-button:hover:not(:disabled) {
    border-color: var(--ledger-accent) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 input,
  html.ledger-workspace-v1 select,
  html.ledger-workspace-v1 textarea {
    min-height: 50px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: var(--ledger-control-radius) !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
    font-size: 16px !important;
  }

  html.ledger-workspace-v1 input:hover:not(:disabled),
  html.ledger-workspace-v1 select:hover:not(:disabled),
  html.ledger-workspace-v1 textarea:hover:not(:disabled) {
    border-color: #93aaa5 !important;
  }

  html.ledger-workspace-v1 input:focus,
  html.ledger-workspace-v1 select:focus,
  html.ledger-workspace-v1 textarea:focus {
    border-color: var(--ledger-accent) !important;
    box-shadow: 0 0 0 3px rgba(34, 174, 178, 0.14) !important;
  }

  html.ledger-workspace-v1 input::placeholder,
  html.ledger-workspace-v1 textarea::placeholder {
    color: #697a76 !important;
    opacity: 1 !important;
  }

  html.ledger-workspace-v1 .panel {
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 1px 2px rgba(16, 35, 33, 0.05) !important;
  }

  /* Native app bar */
  html.ledger-workspace-v1 .product-app-identity {
    width: 100vw !important;
    min-height: calc(64px + env(safe-area-inset-top)) !important;
    margin-inline: calc(50% - 50vw) !important;
    padding:
      calc(9px + env(safe-area-inset-top))
      max(24px, calc((100vw - 912px) / 2))
      9px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: rgba(255, 255, 255, 0.96) !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
  }

  /* Back stays in the route bar; primary destinations live in the app navigation. */
  html.ledger-workspace-v1 .product-route-controls,
  html.ledger-workspace-v1 .product-route-controls[hidden] {
    min-width: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 6px !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1
    .product-route-controls
    > .app-back-button,
  html.ledger-workspace-v1
    .product-route-controls
    > .product-home-button,
  html.ledger-workspace-v1
    .screen[data-screen-kind="home"]
    .product-route-controls
    > .app-back-button,
  html.ledger-workspace-v1
    .screen[data-screen-kind="home"]
    .product-route-controls
    > .product-home-button,
  html.ledger-workspace-v1
    .screen[data-product-screen="home"]
    .product-route-controls
    > .app-back-button,
  html.ledger-workspace-v1
    .screen[data-product-screen="home"]
    .product-route-controls
    > .product-home-button,
  html.ledger-workspace-v1
    .product-home-screen
    .product-route-controls
    > .app-back-button,
  html.ledger-workspace-v1
    .product-home-screen
    .product-route-controls
    > .product-home-button {
    position: static !important;
    inset: auto !important;
    width: 44px !important;
    min-width: 44px !important;
    height: 44px !important;
    min-height: 44px !important;
    display: inline-grid !important;
    place-items: center !important;
    padding: 0 !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: var(--ledger-control-radius) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1
    .product-route-controls[data-current-route="home"]
    > .product-home-button {
    border-color: rgba(34, 174, 178, 0.5) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: inset 0 -2px 0 var(--ledger-accent) !important;
  }

  html.ledger-workspace-v1
    .product-route-controls
    > .app-back-button:disabled,
  html.ledger-workspace-v1
    .product-route-controls
    > .product-home-button:disabled {
    display: inline-grid !important;
    border-color: var(--ledger-line) !important;
    color: var(--ledger-faint) !important;
    background: var(--ledger-surface-soft) !important;
    opacity: 0.48 !important;
    cursor: default !important;
  }

  html.ledger-workspace-v1
    .product-route-controls
    .app-back-button-label,
  html.ledger-workspace-v1
    .product-route-controls
    .product-home-button
    > span:last-child {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    overflow: hidden !important;
    clip: rect(0 0 0 0) !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .product-brand-lockup {
    gap: 9px !important;
  }

  html.ledger-workspace-v1 .product-brand-mark,
  html.ledger-workspace-v1.product-v1 .product-brand-mark,
  html.ledger-workspace-v1.product-v1-live .product-brand-mark {
    position: relative !important;
    width: 38px !important;
    min-width: 38px !important;
    height: 38px !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 9px !important;
    background: transparent !important;
    box-shadow: inset 0 0 0 1px rgba(16, 35, 33, 0.08) !important;
  }

  html.ledger-workspace-v1 .product-brand-mark .product-brand-image {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    border-radius: 0 !important;
    object-fit: cover !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .product-brand-copy strong {
    color: var(--ledger-ink) !important;
    font-size: 17px !important;
    font-weight: 750 !important;
  }

  html.ledger-workspace-v1 .product-brand-copy small {
    color: var(--ledger-muted) !important;
    font-size: 10.5px !important;
  }

  html.ledger-workspace-v1 .product-app-nav {
    position: fixed !important;
    inset-inline-start: auto !important;
    inset-block-end: max(14px, env(safe-area-inset-bottom)) !important;
    left: 50% !important;
    right: auto !important;
    z-index: 120 !important;
    width: min(420px, calc(100% - 32px)) !important;
    min-height: 66px !important;
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 4px !important;
    margin: 0 !important;
    padding: 6px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 12px !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 12px 30px rgba(16, 35, 33, 0.14) !important;
    transform: translateX(-50%) !important;
  }

  html.ledger-workspace-v1 .product-app-nav[hidden] {
    display: none !important;
  }

  html.ledger-workspace-v1 .product-nav-button {
    min-height: 52px !important;
    display: grid !important;
    place-items: center !important;
    align-content: center !important;
    gap: 2px !important;
    padding: 4px !important;
    border: 0 !important;
    border-radius: 7px !important;
    color: var(--ledger-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 12.5px !important;
  }

  html.ledger-workspace-v1 .product-nav-button:hover,
  html.ledger-workspace-v1 .product-nav-button.is-active,
  html.ledger-workspace-v1 .product-nav-button[aria-current="page"] {
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: none !important;
  }

  /* Home command area */
  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top {
    min-height: 0 !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: end !important;
    gap: 32px !important;
    margin: 0 !important;
    padding: 38px 0 30px !important;
    overflow: visible !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .brand {
    max-width: 620px !important;
    padding: 0 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .eyebrow {
    margin: 0 0 7px !important;
    color: var(--ledger-brand) !important;
    font-size: 14px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    h1 {
    max-width: none !important;
    margin: 0 !important;
    color: var(--ledger-ink) !important;
    font-size: 36px !important;
    line-height: 1.12 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .muted {
    display: block !important;
    max-width: 58ch !important;
    margin: 10px 0 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 15px !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions {
    position: static !important;
    inset: auto !important;
    z-index: auto !important;
    width: auto !important;
    align-self: center !important;
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
    backdrop-filter: none !important;
  }

  html.ledger-workspace-v1.product-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions
    .primary-button {
    width: auto !important;
    min-width: 154px !important;
    min-height: 50px !important;
    padding-inline: 18px !important;
    border-color: var(--ledger-brand) !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1.product-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions
    .primary-button:hover:not(:disabled) {
    border-color: var(--ledger-brand-hover) !important;
    background: var(--ledger-brand-hover) !important;
    box-shadow: var(--ledger-shadow-soft) !important;
  }

  html.ledger-workspace-v1 .home-event-tools {
    width: min(100%, 380px) !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
    margin: 0 0 26px !important;
  }

  html.ledger-workspace-v1 .home-event-tools .secondary-button {
    min-width: 0 !important;
    min-height: 46px !important;
    padding-inline: 14px !important;
    border-color: var(--ledger-line-strong) !important;
    border-radius: 8px !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .home-event-tools .secondary-button:hover:not(:disabled) {
    border-color: rgba(14, 110, 101, 0.34) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  /* The current event is the one committed financial surface. */
  html.ledger-workspace-v1 .recent-event-shortcut {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 0 !important;
    margin: 0 0 36px !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 12px !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow: 0 5px 8px rgba(10, 79, 73, 0.16) !important;
  }

  html.ledger-workspace-v1 .recent-event-main {
    min-width: 0 !important;
    min-height: 132px !important;
    display: grid !important;
    align-content: center !important;
    justify-items: start !important;
    gap: 4px !important;
    padding: 24px 26px !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: #ffffff !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .recent-event-main:hover {
    background: rgba(255, 255, 255, 0.06) !important;
  }

  html.ledger-workspace-v1 .recent-event-eyebrow {
    color: #8be0df !important;
    font-size: 13px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .recent-event-main strong {
    color: #ffffff !important;
    font-size: 24px !important;
    line-height: 1.16 !important;
  }

  html.ledger-workspace-v1 .recent-event-main small {
    color: rgba(255, 255, 255, 0.72) !important;
    font-size: 13px !important;
  }

  html.ledger-workspace-v1 .recent-event-action {
    min-width: 250px !important;
    display: grid !important;
    align-content: center !important;
    gap: 13px !important;
    padding: 20px 22px !important;
    border: 0 !important;
    border-inline-start: 1px solid rgba(255, 255, 255, 0.14) !important;
    background: rgba(0, 0, 0, 0.08) !important;
  }

  html.ledger-workspace-v1 .recent-event-balance,
  html.ledger-workspace-v1 .recent-event-balance span,
  html.ledger-workspace-v1 .recent-event-balance strong {
    color: rgba(255, 255, 255, 0.86) !important;
  }

  html.ledger-workspace-v1 .recent-event-balance.is-credit strong {
    color: #83ddb8 !important;
  }

  html.ledger-workspace-v1 .recent-event-balance.is-debt strong {
    color: #ff9d8e !important;
  }

  html.ledger-workspace-v1 .recent-event-action .primary-button {
    border-color: #ffffff !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .recent-event-action .primary-button:hover:not(:disabled) {
    border-color: #ffffff !important;
    color: var(--ledger-brand-hover) !important;
    background: #f1f7f6 !important;
  }

  /* Event history is a ledger, not a grid of cards. */
  html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .section {
    margin-top: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .section-title-row {
    align-items: end !important;
    gap: 20px !important;
    margin-bottom: 14px !important;
    padding: 0 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .section-title-row h2 {
    margin: 0 !important;
    font-size: 24px !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .section-title-row .muted {
    margin: 3px 0 0 !important;
    font-size: 13px !important;
  }

  html.ledger-workspace-v1 .segmented-control {
    min-height: 42px !important;
    display: flex !important;
    gap: 14px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: inset 0 -1px 0 var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .segmented-control button {
    min-width: 0 !important;
    min-height: 42px !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 0 2px !important;
    border: 0 !important;
    border-bottom: 2px solid transparent !important;
    border-radius: 0 !important;
    color: var(--ledger-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .segmented-control button:hover,
  html.ledger-workspace-v1 .segmented-control button.is-active {
    color: var(--ledger-brand) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .segmented-control button.is-active {
    border-bottom-color: var(--ledger-accent) !important;
  }

  html.ledger-workspace-v1 .segmented-control button strong {
    min-width: 22px !important;
    height: 22px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 6px !important;
    color: var(--ledger-muted) !important;
    background: var(--ledger-canvas-deep) !important;
    font-family: "IBM Plex Mono", monospace !important;
    font-size: 11px !important;
  }

  html.ledger-workspace-v1 .segmented-control button.is-active strong {
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .event-list {
    display: grid !important;
    gap: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-row {
    min-height: 82px !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 20px !important;
    margin: 0 !important;
    padding: 15px 18px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .event-row:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .event-row:hover {
    background: var(--ledger-surface-soft) !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .event-row-title strong {
    color: var(--ledger-ink) !important;
    font-size: 17px !important;
  }

  html.ledger-workspace-v1 .event-row-main {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .event-row small,
  html.ledger-workspace-v1 .event-row .opened-at {
    color: var(--ledger-muted) !important;
    font-size: 12.5px !important;
  }

  html.ledger-workspace-v1 .event-row-side {
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 8px !important;
    justify-items: end !important;
  }

  html.ledger-workspace-v1 .event-row-attention {
    min-height: 26px !important;
    display: inline-flex !important;
    align-items: center !important;
    padding: 0 9px !important;
    border-radius: 5px !important;
    font-size: 11.5px !important;
    font-weight: 700 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-row-attention.is-action {
    color: #8e352b !important;
    background: #fcece8 !important;
  }

  html.ledger-workspace-v1 .event-row-attention.is-waiting {
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .event-type-chip,
  html.ledger-workspace-v1 .status-chip {
    border: 0 !important;
    border-radius: 5px !important;
    box-shadow: none !important;
    font-size: 11.5px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .event-type-chip {
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .status-chip.is-open {
    color: var(--ledger-positive) !important;
    background: #e4f2ec !important;
  }

  /* Operational screens use a compact header and underline navigation. */
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top {
    min-height: 0 !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: end !important;
    gap: 20px !important;
    margin: 0 !important;
    padding: 30px 0 22px !important;
    overflow: visible !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .brand {
    max-width: 720px !important;
    padding: 0 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    h1 {
    max-width: 26ch !important;
    margin: 0 !important;
    color: var(--ledger-ink) !important;
    font-size: 32px !important;
    line-height: 1.14 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .eyebrow {
    margin: 0 0 6px !important;
    color: var(--ledger-brand) !important;
    font-size: 13px !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .muted {
    margin: 8px 0 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 14px !important;
  }

  html.ledger-workspace-v1 .opened-at {
    margin-top: 7px !important;
    color: var(--ledger-faint) !important;
    font-size: 11.5px !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions
    .event-header-utility-button {
    width: 46px !important;
    min-width: 46px !important;
    height: 46px !important;
    padding: 0 !important;
    border-color: var(--ledger-line) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 1px 2px rgba(16, 35, 33, 0.05) !important;
    transition:
      border-color 170ms cubic-bezier(0.2, 0, 0, 1),
      background-color 170ms cubic-bezier(0.2, 0, 0, 1),
      transform 170ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions
    .event-header-utility-button:hover:not(:disabled),
  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions
    .event-header-utility-button:focus-visible {
    border-color: var(--ledger-accent) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions
    .event-header-utility-button:active {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions
    .event-header-utility-button
    .event-header-action-label {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    overflow: hidden !important;
    clip: rect(0 0 0 0) !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-workspace-nav {
    position: sticky !important;
    inset-block-start: calc(64px + env(safe-area-inset-top)) !important;
    z-index: 70 !important;
    width: 100% !important;
    min-height: 54px !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 0 !important;
    margin: 0 0 26px !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line-strong) !important;
    border-radius: 0 !important;
    background: var(--ledger-canvas) !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
  }

  html.ledger-workspace-v1 .event-workspace-tab {
    min-width: 0 !important;
    min-height: 54px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 7px !important;
    padding: 0 10px !important;
    border: 0 !important;
    border-bottom: 3px solid transparent !important;
    border-radius: 0 !important;
    color: var(--ledger-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 14px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .event-workspace-tab:hover:not(:disabled) {
    color: var(--ledger-brand) !important;
    background: rgba(255, 255, 255, 0.54) !important;
  }

  html.ledger-workspace-v1 .event-workspace-tab.is-active,
  html.ledger-workspace-v1 .event-workspace-tab[aria-current="page"] {
    border-bottom-color: var(--ledger-accent) !important;
    color: var(--ledger-brand) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-personal-balance {
    width: 100% !important;
    min-height: 72px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 16px !important;
    margin: 10px 0 18px !important;
    padding: 13px 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-radius) !important;
    color: var(--ledger-ink) !important;
    text-align: start !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 1px 2px rgba(16, 35, 33, 0.05) !important;
    transition:
      border-color 170ms cubic-bezier(0.2, 0, 0, 1),
      background-color 170ms cubic-bezier(0.2, 0, 0, 1),
      transform 170ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .event-personal-balance:hover,
  html.ledger-workspace-v1 .event-personal-balance:focus-visible {
    border-color: var(--ledger-accent) !important;
    background: #fbfefe !important;
  }

  html.ledger-workspace-v1 .event-personal-balance:active {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .event-personal-balance-copy,
  html.ledger-workspace-v1 .event-personal-balance-value {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .event-personal-balance-copy small,
  html.ledger-workspace-v1 .event-personal-balance-copy > span,
  html.ledger-workspace-v1 .event-personal-balance-value > span {
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    font-weight: 500 !important;
  }

  html.ledger-workspace-v1 .event-personal-balance-copy > strong {
    font-size: 16px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .event-personal-balance-value {
    justify-items: end !important;
    text-align: end !important;
  }

  html.ledger-workspace-v1 .event-personal-balance-value .amount {
    color: var(--ledger-brand) !important;
    font-family: "IBM Plex Mono", monospace !important;
    font-size: 22px !important;
    font-weight: 650 !important;
    font-variant-numeric: tabular-nums;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-personal-balance.is-credit .amount {
    color: var(--ledger-positive) !important;
  }

  html.ledger-workspace-v1 .event-personal-balance.is-debt .amount {
    color: var(--ledger-negative) !important;
  }

  html.ledger-workspace-v1 .event-workspace-tab:disabled {
    color: #9aa6a3 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .event-start-panel {
    min-height: 154px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 24px !important;
    padding: 26px 28px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-start-copy {
    display: grid !important;
    justify-items: start !important;
    gap: 5px !important;
  }

  html.ledger-workspace-v1 .event-start-copy h2 {
    margin: 3px 0 0 !important;
    font-size: 26px !important;
  }

  html.ledger-workspace-v1 .event-start-copy p {
    margin: 0 !important;
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .event-start-panel .event-start-primary {
    min-width: 178px !important;
  }

  html.ledger-workspace-v1 .summary-strip {
    display: grid !important;
    grid-template-columns: 1.2fr 1fr 0.72fr !important;
    gap: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .summary-item {
    min-height: 104px !important;
    padding: 18px 20px !important;
    border: 0 !important;
    border-inline-start: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .summary-item:first-child {
    border-inline-start: 0 !important;
  }

  html.ledger-workspace-v1
    .summary-strip
    > .summary-item.summary-personal {
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1
    .summary-strip
    > .summary-item.summary-personal
    > span,
  html.ledger-workspace-v1
    .summary-strip
    > .summary-item.summary-personal
    strong,
  html.ledger-workspace-v1
    .summary-strip
    > .summary-item.summary-personal
    .amount {
    color: #ffffff !important;
  }

  html.ledger-workspace-v1
    .summary-strip
    > .summary-item.summary-personal
    .summary-personal-value.is-credit,
  html.ledger-workspace-v1
    .summary-strip
    > .summary-item.summary-personal
    .summary-personal-value.is-credit
    .amount {
    color: #9fe4d2 !important;
  }

  html.ledger-workspace-v1
    .summary-strip
    > .summary-item.summary-personal
    .summary-personal-value.is-debt,
  html.ledger-workspace-v1
    .summary-strip
    > .summary-item.summary-personal
    .summary-personal-value.is-debt
    .amount {
    color: #ffd2c8 !important;
  }

  html.ledger-workspace-v1
    .summary-strip
    > .summary-item.summary-personal
    .summary-personal-value
    > span {
    color: inherit !important;
    font-size: inherit !important;
    font-weight: inherit !important;
  }

  html.ledger-workspace-v1 .event-insight-panel {
    border-color: var(--ledger-line) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-insight-metrics > div {
    border-color: var(--ledger-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-action-dock {
    border: 0 !important;
    border-top: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 -4px 8px rgba(16, 35, 33, 0.06) !important;
    backdrop-filter: none !important;
  }

  /* Expense entry behaves like a focused native task. */
  html.ledger-workspace-v1 .expense-modal-backdrop,
  html.ledger-workspace-v1 .event-modal-backdrop,
    html.ledger-workspace-v1 .important-action-dialog-backdrop {
    background: rgba(8, 30, 28, 0.58) !important;
    backdrop-filter: none !important;
  }

  html.ledger-workspace-v1 .expense-modal,
  html.ledger-workspace-v1 .event-modal,
  html.ledger-workspace-v1 .important-action-dialog {
    border: 0 !important;
    border-radius: 12px !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 24px 72px rgba(8, 30, 28, 0.24) !important;
  }

  html.ledger-workspace-v1 .expense-modal {
    width: min(100%, 760px) !important;
  }

  html.ledger-workspace-v1 .expense-modal-header,
  html.ledger-workspace-v1 .event-modal-header {
    position: sticky !important;
    inset-block-start: 0 !important;
    z-index: 3 !important;
    padding: 20px 22px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
  }

  html.ledger-workspace-v1 .expense-modal-header h2,
  html.ledger-workspace-v1 .event-modal-header h2 {
    margin: 0 !important;
    font-size: 25px !important;
  }

  html.ledger-workspace-v1 .expense-modal-header .eyebrow,
  html.ledger-workspace-v1 .event-modal-header .eyebrow {
    margin: 0 0 4px !important;
    color: var(--ledger-brand) !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1 .expense-modal > .product-form-helper,
  html.ledger-workspace-v1 .expense-modal-header .muted {
    display: none !important;
  }

  html.ledger-workspace-v1 .expense-total-field {
    padding: 16px !important;
    border: 0 !important;
    border-radius: var(--ledger-radius) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .expense-total-field input {
    min-height: 62px !important;
    color: var(--ledger-brand) !important;
    font-family: "IBM Plex Mono", monospace !important;
    font-size: 28px !important;
    font-weight: 650 !important;
    font-variant-numeric: tabular-nums;
  }

  html.ledger-workspace-v1 .expense-mode-switch,
  html.ledger-workspace-v1 .quick-purpose-switch {
    gap: 3px !important;
    padding: 4px !important;
    border: 0 !important;
    border-radius: var(--ledger-control-radius) !important;
    background: var(--ledger-canvas-deep) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .expense-mode-switch button,
  html.ledger-workspace-v1 .quick-purpose-switch button {
    min-height: 46px !important;
    border: 0 !important;
    border-radius: 6px !important;
    color: var(--ledger-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .expense-mode-switch button.is-active,
  html.ledger-workspace-v1 .quick-purpose-switch button.is-active {
    color: var(--ledger-brand) !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 1px 2px rgba(16, 35, 33, 0.1) !important;
  }

  html.ledger-workspace-v1 .expense-template-grid {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 8px !important;
    padding: 2px 0 8px !important;
    overflow-x: auto !important;
    overscroll-behavior-inline: contain !important;
    scroll-snap-type: inline proximity !important;
    scrollbar-width: none !important;
  }

  html.ledger-workspace-v1 .expense-template-grid::-webkit-scrollbar {
    display: none !important;
  }

  html.ledger-workspace-v1 .expense-template-grid .secondary-button {
    flex: 0 0 auto !important;
    min-height: 40px !important;
    border-color: var(--ledger-line) !important;
    background: var(--ledger-surface-soft) !important;
    scroll-snap-align: start !important;
  }

  html.ledger-workspace-v1 .expense-template-grid .secondary-button.is-active {
    border-color: var(--ledger-accent) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .expense-details-panel,
  html.ledger-workspace-v1 .quick-expense-guest-details {
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-control-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .quick-item-row {
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-control-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .quick-item-row:focus-within {
    border-color: var(--ledger-accent) !important;
    background: #fbfefe !important;
    box-shadow: 0 0 0 3px rgba(34, 174, 178, 0.12) !important;
  }

  html.ledger-workspace-v1 .quick-split-summary {
    overflow: hidden !important;
    border: 0 !important;
    border-radius: var(--ledger-radius) !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .quick-split-summary .section-title-row {
    border-color: rgba(255, 255, 255, 0.14) !important;
  }

  html.ledger-workspace-v1 .quick-split-summary .eyebrow {
    color: #8be0df !important;
  }

  html.ledger-workspace-v1 .quick-split-summary h3,
  html.ledger-workspace-v1 .quick-split-summary .amount,
  html.ledger-workspace-v1 .quick-split-summary span,
  html.ledger-workspace-v1 .quick-split-summary strong {
    color: #ffffff !important;
  }

  html.ledger-workspace-v1 .quick-split-list > div {
    border-color: rgba(255, 255, 255, 0.14) !important;
  }

  html.ledger-workspace-v1 .expense-modal-actions {
    position: sticky !important;
    inset-block-end: 0 !important;
    z-index: 3 !important;
    margin: 0 !important;
    padding: 14px 22px calc(14px + env(safe-area-inset-bottom)) !important;
    border: 0 !important;
    border-top: 1px solid var(--ledger-line) !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 -4px 8px rgba(16, 35, 33, 0.05) !important;
    backdrop-filter: none !important;
  }

  html.ledger-workspace-v1 .expense-confirmation-summary {
    flex: 1 0 100% !important;
    display: flex !important;
    align-items: baseline !important;
    justify-content: space-between !important;
    gap: 12px !important;
    margin: 0 !important;
    padding: 0 0 2px !important;
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .expense-confirmation-summary[hidden] {
    display: none !important;
  }

  html.ledger-workspace-v1 .expense-confirmation-summary > span {
    flex: 0 0 auto !important;
  }

  html.ledger-workspace-v1 .expense-confirmation-summary > strong {
    min-width: 0 !important;
    color: var(--ledger-ink) !important;
    font-family: "IBM Plex Mono", "IBM Plex Sans Hebrew", sans-serif !important;
    font-size: 13px !important;
    font-weight: 550 !important;
    font-variant-numeric: tabular-nums;
    text-align: end !important;
  }

  html.ledger-workspace-v1 .event-type-option,
  html.ledger-workspace-v1 .create-event-panel,
  html.ledger-workspace-v1 .join-event-panel,
  html.ledger-workspace-v1 .group-create-panel,
  html.ledger-workspace-v1 .profile-setup-panel {
    border-color: var(--ledger-line) !important;
    border-radius: var(--ledger-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .new-event-type-screen .event-type-option,
  html.ledger-workspace-v1 .new-event-management-screen .event-management-option {
    position: relative !important;
    padding-inline-end: 52px !important;
  }

  html.ledger-workspace-v1 .event-choice-forward {
    position: absolute !important;
    inset-inline-end: 18px !important;
    inset-block-start: 50% !important;
    display: grid !important;
    place-items: center !important;
    width: 22px !important;
    height: 22px !important;
    color: var(--ledger-brand) !important;
    opacity: 0.62 !important;
    transform: translateY(-50%) !important;
    transition: opacity 170ms cubic-bezier(0.2, 0, 0, 1), transform 170ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .event-choice-forward svg {
    width: 20px !important;
    height: 20px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 2 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.ledger-workspace-v1 .new-event-type-screen .event-type-option:hover .event-choice-forward,
  html.ledger-workspace-v1 .new-event-type-screen .event-type-option:focus-visible .event-choice-forward,
  html.ledger-workspace-v1 .new-event-management-screen .event-management-option:hover .event-choice-forward,
  html.ledger-workspace-v1 .new-event-management-screen .event-management-option:focus-visible .event-choice-forward {
    opacity: 1 !important;
    transform: translate(-2px, -50%) !important;
  }

  html.ledger-workspace-v1 .profile-setup-screen > .profile-setup-panel,
  html.ledger-workspace-v1 .profile-setup-screen > .backup-panel {
    width: min(100%, 680px) !important;
    margin-inline: auto !important;
  }

  html.ledger-workspace-v1 .profile-setup-screen > .backup-panel {
    display: block !important;
    margin-top: 14px !important;
    padding: 20px !important;
    border-color: var(--ledger-line) !important;
    border-radius: var(--ledger-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .profile-setup-screen > .backup-panel .section-title-row {
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .profile-setup-screen > .backup-panel h2 {
    font-size: 17px !important;
  }

  html.ledger-workspace-v1 .profile-setup-screen > .backup-panel .muted {
    font-size: 13px !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="new-event"]
    .event-type-step-panel {
    padding: 0 !important;
    overflow: hidden !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="new-event"]
    .event-type-options {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 0 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="new-event"]
    .event-type-option {
    width: 100% !important;
    min-height: 104px !important;
    margin: 0 !important;
    padding: 20px 22px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="new-event"]
    .event-type-option:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="new-event"]
    .event-type-option:hover,
  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="new-event"]
    .event-type-option.is-active,
  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="new-event"]
    .event-type-option[aria-checked="true"] {
    border-color: var(--ledger-line) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .event-type-option:hover,
  html.ledger-workspace-v1 .event-type-option.is-active,
  html.ledger-workspace-v1 .event-type-option[aria-checked="true"] {
    border-color: var(--ledger-accent) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .event-creation-progress {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }

  html.ledger-workspace-v1 .event-management-step-panel {
    width: min(100%, 720px) !important;
    margin-inline: auto !important;
  }

  html.ledger-workspace-v1 .event-management-field {
    min-width: 0 !important;
    display: grid !important;
    gap: 10px !important;
    margin-inline: 0 !important;
    padding: 0 !important;
    border: 0 !important;
  }

  html.ledger-workspace-v1 .event-management-field legend {
    margin-block-end: 8px !important;
    padding: 0 !important;
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
    font-weight: 720 !important;
  }

  html.ledger-workspace-v1 .event-management-options {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .event-management-option {
    min-width: 0 !important;
    min-height: 96px !important;
    display: grid !important;
    grid-template-columns: 20px minmax(0, 1fr) !important;
    align-items: start !important;
    gap: 12px !important;
    padding: 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-control-radius) !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
    text-align: start !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .event-management-option:hover:not(:disabled) {
    border-color: var(--ledger-accent) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .event-management-option.is-active,
  html.ledger-workspace-v1 .event-management-option[aria-checked="true"] {
    border-color: var(--ledger-accent) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: 0 0 0 3px rgba(34, 174, 178, 0.12) !important;
  }

  html.ledger-workspace-v1 .event-management-check {
    width: 18px !important;
    height: 18px !important;
    display: grid !important;
    place-items: center !important;
    margin-block-start: 2px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: 50% !important;
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1 .event-management-option.is-active .event-management-check,
  html.ledger-workspace-v1 .event-management-option[aria-checked="true"] .event-management-check {
    border: 5px solid var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .event-management-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 5px !important;
  }

  html.ledger-workspace-v1 .event-management-copy strong {
    font-size: 15px !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .event-management-copy small {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    line-height: 1.55 !important;
  }

  html.ledger-workspace-v1 .event-modal-header-actions {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .modal-section-back-button > span {
    color: var(--ledger-brand) !important;
    font-size: 24px !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .event-settings-menu {
    display: grid !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-item {
    width: 100% !important;
    min-height: 78px !important;
    display: grid !important;
    grid-template-columns: 42px minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 13px 14px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-control-radius) !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
    text-align: start !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-item:hover:not(:disabled) {
    border-color: var(--ledger-accent) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-icon {
    width: 42px !important;
    height: 42px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: var(--ledger-control-radius) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-icon svg {
    width: 22px !important;
    height: 22px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.8 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-copy strong {
    font-size: 15px !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-copy small {
    overflow-wrap: anywhere !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-chevron {
    color: var(--ledger-faint) !important;
    font-size: 24px !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-item.is-danger .event-settings-menu-icon {
    color: var(--ledger-negative) !important;
    background: #fff1ef !important;
  }

  html.ledger-workspace-v1 .event-setting-note,
  html.ledger-workspace-v1 .event-setting-focus-status {
    border-color: var(--ledger-line) !important;
    border-radius: var(--ledger-control-radius) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .event-setting-focus-status {
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) !important;
    align-items: start !important;
    gap: 12px !important;
    padding: 16px !important;
  }

  html.ledger-workspace-v1 .event-setting-focus-status p {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .event-setting-primary-action {
    display: flex !important;
    justify-content: flex-start !important;
  }

  /* Account access keeps the same quiet product language as the workspace. */
  html.ledger-workspace-v1 .account-auth-gate,
  html.ledger-workspace-v1 .account-auth-boot {
    color: var(--ledger-ink) !important;
    background: var(--ledger-canvas) !important;
  }

  html.ledger-workspace-v1 .account-auth-shell {
    border-color: var(--ledger-line) !important;
    border-radius: 12px !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 18px 44px rgba(16, 35, 33, 0.12) !important;
  }

  html.ledger-workspace-v1 .account-auth-brand {
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .account-auth-logo-lockup,
  html.ledger-workspace-v1 .profile-brand-lockup {
    position: relative !important;
    width: min(360px, 92%) !important;
    min-height: 92px !important;
    height: auto !important;
    display: grid !important;
    place-items: center !important;
    margin: 0 auto 18px !important;
    overflow: visible !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .profile-brand-lockup {
    width: min(320px, 90%) !important;
    min-height: 82px !important;
    margin-bottom: 14px !important;
  }

  html.ledger-workspace-v1 .account-auth-logo-lockup img,
  html.ledger-workspace-v1 .profile-brand-lockup img {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    object-fit: contain !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .screen.product-empty-home .home-empty-events {
    width: min(100%, 720px) !important;
    margin: 26px auto 0 !important;
  }

  html.ledger-workspace-v1 .screen.product-empty-home .home-empty-visual {
    position: relative !important;
    width: 100% !important;
    min-height: 0 !important;
    aspect-ratio: 1.9 !important;
    display: grid !important;
    place-items: center end !important;
    padding: 26px !important;
    overflow: hidden !important;
    border: 1px solid rgba(16, 35, 33, 0.12) !important;
    border-radius: var(--ledger-radius) !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow: 0 12px 34px rgba(16, 35, 33, 0.12) !important;
  }

  html.ledger-workspace-v1 .screen.product-empty-home .home-empty-visual img {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    display: block !important;
    border-radius: 0 !important;
    object-fit: cover !important;
    object-position: center !important;
    filter: none !important;
  }

  html.ledger-workspace-v1 .screen.product-empty-home .home-empty-visual strong {
    position: absolute !important;
    z-index: 1 !important;
    inset: 50% 26px auto auto !important;
    width: 10ch !important;
    max-width: 10ch !important;
    color: #ffffff !important;
    font-size: 24px !important;
    font-weight: 750 !important;
    line-height: 1.25 !important;
    text-align: right !important;
    text-shadow: 0 2px 14px rgba(4, 33, 30, 0.52) !important;
    transform: translateY(-50%) !important;
  }

  html.ledger-workspace-v1 .screen.product-empty-home .home-empty-visual .product-empty-icon {
    display: none !important;
  }

  html.ledger-workspace-v1 .account-auth-form-panel {
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1 .account-google-button,
  html.ledger-workspace-v1 .account-email-toggle {
    border-color: var(--ledger-line-strong) !important;
    border-radius: var(--ledger-control-radius) !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .account-google-button:hover,
  html.ledger-workspace-v1 .account-email-toggle:hover {
    border-color: var(--ledger-accent) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .account-profile-controls {
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .account-data-links {
    display: flex !important;
    align-items: center !important;
    gap: 18px !important;
  }

  html.ledger-workspace-v1 .account-data-link {
    min-height: 44px !important;
    color: var(--ledger-muted) !important;
    text-decoration-color: var(--ledger-line-strong) !important;
    text-decoration-thickness: 1px !important;
  }

  html.ledger-workspace-v1 .account-data-link:hover,
  html.ledger-workspace-v1 .account-data-link:focus-visible {
    color: var(--ledger-brand) !important;
    text-decoration-color: var(--ledger-accent) !important;
  }

  html.ledger-workspace-v1 .account-delete-button {
    border-color: rgba(185, 71, 57, 0.32) !important;
    color: var(--ledger-negative) !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .account-delete-button:hover:not(:disabled),
  html.ledger-workspace-v1 .account-delete-button:focus-visible {
    border-color: rgba(185, 71, 57, 0.48) !important;
    color: #92372d !important;
    background: #fff1ef !important;
  }


  html.ledger-workspace-v1 .product-route-controls > .product-home-button,
  html.ledger-workspace-v1 .product-app-identity > .product-home-button,
  html.ledger-workspace-v1 .screen > .top > .product-home-button {
    display: none !important;
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1 .screen {
      width: 100% !important;
      padding-inline: 16px !important;
      padding-bottom: calc(98px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1 .screen[data-screen-kind="new-event"] {
      padding-bottom: calc(28px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1 .product-app-identity {
      width: calc(100% + 32px) !important;
      min-height: calc(60px + env(safe-area-inset-top)) !important;
      margin-inline: -16px !important;
      padding: calc(8px + env(safe-area-inset-top)) 16px 8px !important;
    }

    html.ledger-workspace-v1 .account-auth-logo-lockup,
    html.ledger-workspace-v1 .profile-brand-lockup {
      width: min(220px, 68%) !important;
      height: 124px !important;
      margin-bottom: 12px !important;
    }

    html.ledger-workspace-v1 .screen.product-empty-home .home-empty-visual {
      aspect-ratio: 1.78 !important;
      padding: 18px !important;
    }

    html.ledger-workspace-v1 .screen.product-empty-home .home-empty-visual strong {
      right: 18px !important;
      left: auto !important;
      width: 8ch !important;
      max-width: 8ch !important;
      font-size: 20px !important;
    }

    html.ledger-workspace-v1 .product-brand-copy small {
      display: none !important;
    }

    html.ledger-workspace-v1 .product-route-controls {
      min-width: 94px !important;
      flex: 0 0 auto !important;
    }

    html.ledger-workspace-v1 .product-brand-mark,
    html.ledger-workspace-v1.product-v1 .product-brand-mark,
    html.ledger-workspace-v1.product-v1-live .product-brand-mark {
      width: 36px !important;
      min-width: 36px !important;
      height: 36px !important;
    }

    html.ledger-workspace-v1 .product-brand-copy strong {
      font-size: 16px !important;
    }

    html.ledger-workspace-v1 .product-app-nav {
      position: fixed !important;
      inset-inline: 0 !important;
      inset-block-end: 0 !important;
      left: 0 !important;
      right: 0 !important;
      z-index: 120 !important;
      width: 100% !important;
      min-height: calc(68px + env(safe-area-inset-bottom)) !important;
      display: grid !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      gap: 0 !important;
      padding: 6px 10px calc(6px + env(safe-area-inset-bottom)) !important;
      border: 0 !important;
      border-top: 1px solid var(--ledger-line) !important;
      border-radius: 0 !important;
      background: var(--ledger-surface) !important;
      box-shadow: 0 -4px 8px rgba(16, 35, 33, 0.05) !important;
      backdrop-filter: none !important;
      transform: none !important;
    }

    html.ledger-workspace-v1 .product-nav-button {
      min-height: 54px !important;
      display: grid !important;
      place-items: center !important;
      align-content: center !important;
      gap: 2px !important;
      padding: 4px !important;
      border-radius: 7px !important;
      color: var(--ledger-muted) !important;
      font-size: 11px !important;
    }

    html.ledger-workspace-v1 .product-nav-button svg {
      width: 21px !important;
      height: 21px !important;
    }

    html.ledger-workspace-v1 .event-has-action-dock {
      padding-bottom: calc(174px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1 .event-action-dock {
      inset-block-end: calc(68px + env(safe-area-inset-bottom)) !important;
      min-height: 76px !important;
      padding: 10px 16px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 18px !important;
      padding: 27px 0 22px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top
      h1 {
      font-size: 31px !important;
      line-height: 1.14 !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top
      .muted {
      margin-top: 8px !important;
      font-size: 14px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top
      .hero-actions,
    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top
      .hero-actions
      .primary-button {
      width: 100% !important;
    }

    html.ledger-workspace-v1 .recent-event-shortcut {
      grid-template-columns: minmax(0, 1fr) !important;
      margin-bottom: 30px !important;
      border-radius: 10px !important;
    }

    html.ledger-workspace-v1 .home-event-tools {
      width: 100% !important;
      margin: 0 0 22px !important;
    }

    html.ledger-workspace-v1 .recent-event-main {
      min-height: 112px !important;
      padding: 19px 20px 16px !important;
    }

    html.ledger-workspace-v1 .recent-event-main strong {
      font-size: 21px !important;
    }

    html.ledger-workspace-v1 .recent-event-action {
      min-width: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding: 14px 16px !important;
      border-inline-start: 0 !important;
      border-top: 1px solid rgba(255, 255, 255, 0.14) !important;
    }

    html.ledger-workspace-v1 .recent-event-action .primary-button {
      width: auto !important;
      min-width: 136px !important;
      padding-inline: 14px !important;
    }

    html.ledger-workspace-v1 .screen[data-screen-kind="home"] .section-title-row {
      align-items: start !important;
      gap: 12px !important;
    }

    html.ledger-workspace-v1 .screen[data-screen-kind="home"] .section-title-row h2 {
      font-size: 22px !important;
    }

    html.ledger-workspace-v1 .segmented-control {
      gap: 10px !important;
    }

    html.ledger-workspace-v1 .segmented-control button {
      min-height: 40px !important;
      font-size: 12.5px !important;
    }

    html.ledger-workspace-v1 .event-row {
      min-height: 0 !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 12px !important;
      padding: 16px !important;
    }

    html.ledger-workspace-v1 .event-row-side {
      min-width: 0 !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
    }

    html.ledger-workspace-v1 .event-row-attention {
      min-height: 24px !important;
      padding-inline: 7px !important;
      font-size: 10.5px !important;
    }

    html.ledger-workspace-v1 .profile-setup-screen > .backup-panel {
      padding: 17px !important;
    }

    html.ledger-workspace-v1 .profile-setup-screen > .backup-panel .section-title-row,
    html.ledger-workspace-v1 .profile-setup-screen > .backup-panel .section-title-actions {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 10px !important;
    }

    html.ledger-workspace-v1 .profile-setup-screen > .backup-panel .secondary-button {
      width: 100% !important;
    }

    html.ledger-workspace-v1 .account-data-links {
      width: 100% !important;
      gap: 16px !important;
      padding-top: 6px !important;
      border-top: 1px solid var(--ledger-line) !important;
    }

    html.ledger-workspace-v1 .account-profile-actions {
      width: 100% !important;
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 8px !important;
    }

    html.ledger-workspace-v1 .account-profile-actions .secondary-button {
      width: 100% !important;
      min-width: 0 !important;
    }

    html.ledger-workspace-v1 .account-profile-actions .account-install-button {
      grid-column: 1 / -1 !important;
    }

    html.ledger-workspace-v1 .event-management-options {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .event-management-option {
      min-height: 86px !important;
    }

    html.ledger-workspace-v1 .event-creation-progress li {
      min-width: 0 !important;
      gap: 6px !important;
      padding-inline: 6px !important;
    }

    html.ledger-workspace-v1 .event-creation-progress li > strong {
      min-width: 0 !important;
      font-size: 12px !important;
    }

    html.ledger-workspace-v1 .event-creation-progress li > span {
      width: 22px !important;
      height: 22px !important;
      flex-basis: 22px !important;
    }

    html.ledger-workspace-v1 .event-settings-menu-item {
      min-height: 74px !important;
      grid-template-columns: 40px minmax(0, 1fr) auto !important;
      padding: 12px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top {
      gap: 12px !important;
      padding: 22px 0 17px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top
      h1 {
      font-size: 27px !important;
    }

    html.ledger-workspace-v1 .event-workspace-nav {
      inset-block-start: calc(60px + env(safe-area-inset-top)) !important;
      min-height: 50px !important;
      margin-bottom: 20px !important;
    }

    html.ledger-workspace-v1 .event-workspace-tab {
      min-height: 50px !important;
      gap: 4px !important;
      padding-inline: 4px !important;
      font-size: 12.5px !important;
    }

    html.ledger-workspace-v1 .event-workspace-tab .button-action-icon {
      display: none !important;
    }

    html.ledger-workspace-v1 .event-start-panel {
      min-height: 0 !important;
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 18px !important;
      padding: 22px 20px !important;
    }

    html.ledger-workspace-v1 .event-start-copy h2 {
      font-size: 24px !important;
    }

    html.ledger-workspace-v1 .event-start-panel .event-start-primary {
      width: 100% !important;
      min-width: 0 !important;
    }

    html.ledger-workspace-v1 .summary-strip {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .summary-personal {
      grid-column: 1 / -1 !important;
    }

    html.ledger-workspace-v1 .summary-item {
      min-height: 88px !important;
      padding: 15px 16px !important;
      border-top: 1px solid var(--ledger-line) !important;
    }

    html.ledger-workspace-v1 .summary-personal {
      border-top: 0 !important;
    }

    html.ledger-workspace-v1 .expense-modal-backdrop,
    html.ledger-workspace-v1 .event-modal-backdrop {
      padding: 0 !important;
      background: #ffffff !important;
      backdrop-filter: none !important;
    }

    html.ledger-workspace-v1 .expense-modal,
    html.ledger-workspace-v1 .event-modal {
      width: 100% !important;
      min-height: 100dvh !important;
      max-height: 100dvh !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    html.ledger-workspace-v1 .expense-modal-header,
    html.ledger-workspace-v1 .event-modal-header {
      padding: calc(14px + env(safe-area-inset-top)) 16px 14px !important;
    }

    html.ledger-workspace-v1 .expense-modal-header h2,
    html.ledger-workspace-v1 .event-modal-header h2 {
      font-size: 23px !important;
    }

    html.ledger-workspace-v1 .expense-modal-actions {
      position: static !important;
      inset-block-end: auto !important;
      padding: 12px 16px calc(12px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1 .expense-modal-actions .primary-button {
      flex: 1 1 auto !important;
    }

    html.ledger-workspace-v1 .expense-confirmation-summary {
      align-items: flex-start !important;
      flex-direction: column !important;
      gap: 2px !important;
    }

    html.ledger-workspace-v1 .expense-confirmation-summary > strong {
      width: 100% !important;
      text-align: start !important;
    }

    html.ledger-workspace-v1 .account-auth-gate {
      background: var(--ledger-canvas) !important;
    }

    html.ledger-workspace-v1 .account-auth-shell {
      border-radius: 0 !important;
      background: var(--ledger-canvas) !important;
      box-shadow: none !important;
    }

    html.ledger-workspace-v1 .account-auth-form-panel {
      align-content: start !important;
      padding:
        max(68px, 9vh)
        20px
        calc(36px + env(safe-area-inset-bottom)) !important;
      background: var(--ledger-canvas) !important;
    }
  }

  @media (max-width: 430px) {
    html.ledger-workspace-v1 .product-brand-copy small {
      display: none !important;
    }

    html.ledger-workspace-v1 .recent-event-action {
      align-items: stretch !important;
    }

    html.ledger-workspace-v1 .recent-event-balance {
      align-self: center !important;
      font-size: 12.5px !important;
    }

    html.ledger-workspace-v1 .recent-event-action .primary-button {
      min-width: 132px !important;
      font-size: 14px !important;
    }

    html.ledger-workspace-v1 .screen[data-screen-kind="home"] .section-title-row {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .segmented-control {
      width: 100% !important;
      justify-content: space-between !important;
    }

    html.ledger-workspace-v1 .event-row {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .event-row-side {
      width: 100% !important;
      min-width: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
    }

    html.ledger-workspace-v1 .event-workspace-tab {
      white-space: nowrap !important;
    }
  }

  /* Signature editorial fintech finish */
  html.ledger-workspace-v1 body {
    background: linear-gradient(
      180deg,
      rgba(251, 253, 252, 0.98) 0%,
      rgba(237, 244, 242, 0.98) 54%,
      #edf3f1 100%
    ) !important;
  }

  html.ledger-workspace-v1 .app,
  html.ledger-workspace-v1 .screen {
    background: transparent !important;
  }

  html.ledger-workspace-v1 .app::before {
    content: none !important;
    display: none !important;
  }

  html.ledger-workspace-v1 .screen {
    width: min(100%, 1120px) !important;
  }

  html.ledger-workspace-v1 h1,
  html.ledger-workspace-v1 h2,
  html.ledger-workspace-v1 h3,
  html.ledger-workspace-v1 .product-brand-copy strong {
    font-family: "Rubik", "IBM Plex Sans Hebrew", sans-serif !important;
    font-weight: 700 !important;
    letter-spacing: 0 !important;
  }

  html.ledger-workspace-v1 .product-app-identity {
    width: 100% !important;
    min-height: calc(72px + env(safe-area-inset-top)) !important;
    margin-inline: 0 !important;
    padding:
      calc(11px + env(safe-area-inset-top))
      14px
      11px !important;
    border-bottom-color: rgba(7, 27, 24, 0.09) !important;
    background: rgba(251, 253, 252, 0.985) !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.94) inset,
      0 10px 34px rgba(7, 27, 24, 0.065) !important;
  }

  html.ledger-workspace-v1 .product-brand-mark,
  html.ledger-workspace-v1.product-v1 .product-brand-mark,
  html.ledger-workspace-v1.product-v1-live .product-brand-mark {
    width: 44px !important;
    min-width: 44px !important;
    height: 44px !important;
    border-radius: 8px !important;
    box-shadow:
      0 0 0 1px rgba(7, 27, 24, 0.08),
      0 8px 20px rgba(6, 75, 67, 0.13) !important;
  }

  html.ledger-workspace-v1 .product-brand-copy {
    gap: 1px !important;
  }

  html.ledger-workspace-v1 .product-brand-copy strong {
    font-size: 19px !important;
    line-height: 1.12 !important;
  }

  html.ledger-workspace-v1 .product-brand-copy small {
    color: #657773 !important;
    font-size: 11px !important;
    font-weight: 500 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top {
    position: relative !important;
    isolation: isolate !important;
    overflow: hidden !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 8px !important;
    color: #f7fffd !important;
    background:
      linear-gradient(128deg, #071b18 0%, #064b43 58%, #087b74 100%),
      #064b43 !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.13) inset,
      0 24px 54px rgba(4, 43, 39, 0.2) !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top {
    min-height: 226px !important;
    align-items: center !important;
    margin: 26px 0 18px !important;
    padding: clamp(30px, 5vw, 50px) !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top {
    min-height: 142px !important;
    margin: 24px 0 18px !important;
    padding: 28px 30px !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top::before,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top::before {
    content: "" !important;
    position: absolute !important;
    inset: 0 !important;
    z-index: -1 !important;
    display: block !important;
    background: linear-gradient(
      108deg,
      rgba(255, 255, 255, 0.1),
      rgba(255, 255, 255, 0.025) 38%,
      transparent 62%
    ) !important;
    opacity: 0.78 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top::after,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top::after {
    content: "" !important;
    position: absolute !important;
    inset: auto 0 0 !important;
    z-index: 0 !important;
    height: 3px !important;
    display: block !important;
    background: linear-gradient(90deg, #22b7b2 0%, #8ce3d8 48%, rgba(140, 227, 216, 0) 100%) !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .brand,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .brand,
  html.ledger-workspace-v1 .screen > .top .hero-actions {
    position: relative !important;
    z-index: 1 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    h1 {
    color: #ffffff !important;
    font-size: 48px !important;
    font-weight: 700 !important;
    line-height: 1.04 !important;
    text-wrap: balance !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .eyebrow {
    color: #8ce3d8 !important;
    font-size: 14px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .muted {
    max-width: 54ch !important;
    color: rgba(244, 255, 252, 0.74) !important;
    font-size: 16px !important;
    line-height: 1.55 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    h1,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    h2,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    h3 {
    color: #ffffff !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .eyebrow {
    color: #8ce3d8 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .muted,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .opened-at {
    color: rgba(244, 255, 252, 0.72) !important;
  }

  html.ledger-workspace-v1.product-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions
    .primary-button {
    min-width: 164px !important;
    min-height: 52px !important;
    border-color: rgba(255, 255, 255, 0.88) !important;
    color: var(--ledger-brand) !important;
    background: #f8fffd !important;
    box-shadow:
      0 1px 0 #ffffff inset,
      0 14px 30px rgba(0, 0, 0, 0.18) !important;
  }

  html.ledger-workspace-v1.product-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions
    .primary-button:hover:not(:disabled) {
    border-color: #ffffff !important;
    color: #032f2a !important;
    background: #ffffff !important;
    box-shadow:
      0 1px 0 #ffffff inset,
      0 18px 36px rgba(0, 0, 0, 0.24) !important;
    transform: translateY(-2px) !important;
  }

  html.ledger-workspace-v1 .primary-button {
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.18) inset,
      0 10px 22px rgba(6, 75, 67, 0.18) !important;
  }

  html.ledger-workspace-v1 .secondary-button,
  html.ledger-workspace-v1 .icon-button,
  html.ledger-workspace-v1 .product-home-button,
  html.ledger-workspace-v1 .home-event-tools .secondary-button {
    background: rgba(251, 253, 252, 0.98) !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.96) inset,
      0 8px 20px rgba(7, 27, 24, 0.055) !important;
  }

  html.ledger-workspace-v1 input,
  html.ledger-workspace-v1 select,
  html.ledger-workspace-v1 textarea {
    background: rgba(251, 253, 252, 0.98) !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.96) inset,
      0 6px 16px rgba(7, 27, 24, 0.04) !important;
  }

  html.ledger-workspace-v1 .panel,
  html.ledger-workspace-v1 .event-row,
  html.ledger-workspace-v1 .expense-row,
  html.ledger-workspace-v1 .transfer-row,
  html.ledger-workspace-v1 .balance-row,
  html.ledger-workspace-v1 .group-row,
  html.ledger-workspace-v1 .event-command-card,
  html.ledger-workspace-v1 .event-management-option {
    border-color: rgba(7, 27, 24, 0.09) !important;
    border-radius: 8px !important;
    background: rgba(251, 253, 252, 0.985) !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.98) inset,
      0 12px 30px rgba(7, 27, 24, 0.07),
      0 2px 5px rgba(7, 27, 24, 0.035) !important;
  }

  html.ledger-workspace-v1 .profile-setup-screen > .profile-setup-panel {
    width: min(100%, 620px) !important;
    padding: 30px !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.98) inset,
      0 18px 44px rgba(7, 27, 24, 0.09) !important;
  }

  html.ledger-workspace-v1 .profile-setup-panel .profile-brand-lockup {
    width: min(270px, 76%) !important;
    margin-bottom: 24px !important;
  }

  html.ledger-workspace-v1 .profile-setup-panel .primary-button {
    width: 100% !important;
    margin-top: 4px !important;
  }

  html.ledger-workspace-v1 .account-auth-gate,
  html.ledger-workspace-v1 .account-auth-boot {
    background: linear-gradient(180deg, #f8fbfa 0%, #eaf2ef 100%) !important;
  }

  html.ledger-workspace-v1 .account-auth-shell {
    overflow: hidden !important;
    border-color: rgba(7, 27, 24, 0.09) !important;
    border-radius: 8px !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.98) inset,
      0 28px 70px rgba(7, 27, 24, 0.16) !important;
  }

  html.ledger-workspace-v1 .account-auth-brand {
    background:
      linear-gradient(135deg, #071b18 0%, #064b43 62%, #087b74 100%),
      #064b43 !important;
  }

  html.ledger-workspace-v1 .account-auth-form-panel {
    background: #fbfdfc !important;
  }

  html.ledger-workspace-v1 .home-event-tools {
    gap: 10px !important;
    margin-bottom: 30px !important;
  }

  html.ledger-workspace-v1 .home-event-tools .secondary-button {
    min-height: 50px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .screen.product-empty-home .home-empty-events {
    width: min(100%, 820px) !important;
    margin-top: 30px !important;
  }

  html.ledger-workspace-v1 .screen.product-empty-home .home-empty-visual {
    border: 0 !important;
    border-radius: 8px !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.16) inset,
      0 24px 56px rgba(4, 43, 39, 0.18) !important;
  }

  html.ledger-workspace-v1 .event-workspace-nav,
  html.ledger-workspace-v1 .product-app-nav {
    border-color: rgba(7, 27, 24, 0.1) !important;
    background: rgba(251, 253, 252, 0.985) !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.98) inset,
      0 18px 46px rgba(7, 27, 24, 0.12) !important;
  }

  html.ledger-workspace-v1 .product-nav-button {
    position: relative !important;
  }

  html.ledger-workspace-v1 .product-nav-button.is-active,
  html.ledger-workspace-v1 .product-nav-button[aria-current="page"] {
    color: #034039 !important;
    background: #d9f1ed !important;
    box-shadow: inset 0 0 0 1px rgba(33, 170, 166, 0.12) !important;
  }

  @media (hover: hover) {
    html.ledger-workspace-v1 .panel:hover,
    html.ledger-workspace-v1 .event-row:hover,
    html.ledger-workspace-v1 .expense-row:hover,
    html.ledger-workspace-v1 .transfer-row:hover,
    html.ledger-workspace-v1 .group-row:hover,
    html.ledger-workspace-v1 .event-command-card:hover {
      border-color: rgba(33, 170, 166, 0.24) !important;
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.98) inset,
        0 18px 38px rgba(7, 27, 24, 0.1),
        0 3px 8px rgba(7, 27, 24, 0.04) !important;
      transform: translateY(-2px) !important;
    }
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1 .screen {
      padding-inline: 14px !important;
    }

    html.ledger-workspace-v1 .product-app-identity {
      width: calc(100% + 28px) !important;
      min-height: calc(64px + env(safe-area-inset-top)) !important;
      margin-inline: -14px !important;
      padding: calc(9px + env(safe-area-inset-top)) 14px 9px !important;
    }

    html.ledger-workspace-v1 .product-brand-mark,
    html.ledger-workspace-v1.product-v1 .product-brand-mark,
    html.ledger-workspace-v1.product-v1-live .product-brand-mark {
      width: 40px !important;
      min-width: 40px !important;
      height: 40px !important;
    }

    html.ledger-workspace-v1 .product-brand-copy strong {
      font-size: 17px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top {
      min-height: 0 !important;
      gap: 22px !important;
      margin: 16px 0 14px !important;
      padding: 28px 22px 24px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top
      h1 {
      font-size: 34px !important;
      line-height: 1.06 !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top
      .muted {
      font-size: 15px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top {
      min-height: 0 !important;
      margin: 16px 0 14px !important;
      padding: 24px 20px !important;
    }

    html.ledger-workspace-v1 .home-event-tools {
      margin-bottom: 24px !important;
    }

    html.ledger-workspace-v1 .screen.product-empty-home .home-empty-events {
      margin-top: 24px !important;
    }

    html.ledger-workspace-v1 .screen.product-empty-home .home-empty-visual {
      box-shadow: 0 16px 36px rgba(4, 43, 39, 0.16) !important;
    }

    html.ledger-workspace-v1 .profile-setup-screen > .profile-setup-panel {
      padding: 22px 18px !important;
    }

    html.ledger-workspace-v1 .product-app-nav {
      background: #fbfdfc !important;
      box-shadow:
        0 -1px 0 rgba(255, 255, 255, 0.9) inset,
        0 -10px 30px rgba(7, 27, 24, 0.08) !important;
    }
  }

  html.ledger-workspace-v1 .event-row.is-long-pressing {
    background: rgba(33, 170, 166, 0.09) !important;
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .event-removal-menu-backdrop {
    background: rgba(8, 30, 28, 0.58) !important;
  }

  html.ledger-workspace-v1 .event-removal-menu {
    border-color: var(--ledger-line) !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 24px 72px rgba(8, 30, 28, 0.24) !important;
  }

  /* Micro-detail production polish */
  html.ledger-workspace-v1 .product-brand-mark,
  html.ledger-workspace-v1.product-v1 .product-brand-mark,
  html.ledger-workspace-v1.product-v1-live .product-brand-mark {
    width: 40px !important;
    min-width: 40px !important;
    height: 40px !important;
    padding: 2px !important;
    border-radius: 9px !important;
    background: #ffffff !important;
    box-shadow: var(--ledger-shadow-control) !important;
  }

  html.ledger-workspace-v1 .product-brand-mark .product-brand-image {
    inset: 2px !important;
    width: calc(100% - 4px) !important;
    height: calc(100% - 4px) !important;
    object-fit: contain !important;
    outline: 1px solid rgba(0, 0, 0, 0.1) !important;
    outline-offset: -1px !important;
  }

  html.ledger-workspace-v1 .product-brand-lockup {
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .product-brand-copy strong {
    line-height: 1.08 !important;
  }

  html.ledger-workspace-v1 .product-brand-copy small {
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1
    .product-route-controls
    > :is(.app-back-button, .product-home-button) {
    border: 0 !important;
    box-shadow: var(--ledger-shadow-control) !important;
  }

  html.ledger-workspace-v1
    .product-route-controls
    > :is(.app-back-button, .product-home-button):disabled {
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    opacity: 0.34 !important;
  }

  html.ledger-workspace-v1 .button-action-icon,
  html.ledger-workspace-v1 .command-card-icon,
  html.ledger-workspace-v1 .event-settings-icon {
    display: inline-grid !important;
    place-items: center !important;
    flex: 0 0 auto !important;
    transform: translateY(0.5px);
  }

  html.ledger-workspace-v1 .button-action-icon svg,
  html.ledger-workspace-v1 .command-card-icon svg,
  html.ledger-workspace-v1 .event-settings-icon svg {
    width: 19px !important;
    height: 19px !important;
    stroke-width: 1.8 !important;
  }

  html.ledger-workspace-v1 .primary-button {
    border: 0 !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.16) inset,
      0 3px 8px rgba(6, 75, 67, 0.18) !important;
  }

  html.ledger-workspace-v1 .primary-button:hover:not(:disabled) {
    border: 0 !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.18) inset,
      0 5px 8px rgba(6, 75, 67, 0.22) !important;
  }

  html.ledger-workspace-v1.product-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions
    .primary-button,
  html.ledger-workspace-v1.product-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions
    .primary-button:hover:not(:disabled) {
    border: 0 !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.92) inset,
      0 4px 8px rgba(0, 0, 0, 0.18) !important;
  }

  html.ledger-workspace-v1 .secondary-button,
  html.ledger-workspace-v1 .icon-button,
  html.ledger-workspace-v1 .product-home-button,
  html.ledger-workspace-v1 .home-event-tools .secondary-button {
    border: 0 !important;
    box-shadow: var(--ledger-shadow-control) !important;
  }

  html.ledger-workspace-v1 :is(input, select, textarea) {
    box-shadow: 0 0 0 1px rgba(7, 27, 24, 0.13) !important;
  }

  html.ledger-workspace-v1 :is(input, select, textarea):focus {
    border-color: var(--ledger-accent) !important;
    box-shadow: var(--ledger-focus-ring) !important;
  }

  html.ledger-workspace-v1 label,
  html.ledger-workspace-v1 .field-label,
  html.ledger-workspace-v1 .input-label {
    color: #29443f !important;
    font-size: 13px !important;
    font-weight: 650 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 :is(
    .panel,
    .event-row,
    .expense-row,
    .transfer-row,
    .balance-row,
    .group-row,
    .event-command-card,
    .event-management-option
  ) {
    border: 0 !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  @media (hover: hover) {
    html.ledger-workspace-v1 :is(
      .panel,
      .event-row,
      .expense-row,
      .transfer-row,
      .group-row,
      .event-command-card
    ):hover {
      border: 0 !important;
      box-shadow: var(--ledger-shadow-border-hover) !important;
      transform: translateY(-1px) !important;
    }
  }

  html.ledger-workspace-v1 .status-chip,
  html.ledger-workspace-v1 .event-row-attention,
  html.ledger-workspace-v1 .event-type-chip {
    min-height: 26px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding-inline: 9px !important;
    border-radius: 999px !important;
    font-size: 12px !important;
    font-weight: 650 !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .home-empty-visual,
  html.ledger-workspace-v1 .product-hero-image,
  html.ledger-workspace-v1 .profile-brand-lockup {
    outline: 1px solid rgba(0, 0, 0, 0.1) !important;
    outline-offset: -1px !important;
  }

  html.ledger-workspace-v1 .product-app-nav {
    border: 0 !important;
    padding: 6px !important;
    background: rgba(251, 253, 252, 0.985) !important;
    box-shadow:
      0 0 0 1px rgba(7, 27, 24, 0.07),
      0 2px 4px rgba(7, 27, 24, 0.055),
      0 8px 18px rgba(7, 27, 24, 0.1) !important;
  }

  html.ledger-workspace-v1 .product-nav-button {
    border-radius: 7px !important;
  }

  html.ledger-workspace-v1 .product-nav-button:is(.is-active, [aria-current="page"]) {
    color: var(--ledger-brand) !important;
    background: #e4f4f1 !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-workspace-nav {
    box-shadow:
      0 0 0 1px rgba(7, 27, 24, 0.07),
      0 4px 8px rgba(7, 27, 24, 0.06) !important;
  }

  html.ledger-workspace-v1 .event-workspace-tab {
    min-height: 48px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .expense-total-field {
    border-radius: 10px !important;
    box-shadow: inset 0 0 0 1px rgba(7, 27, 24, 0.045) !important;
  }

  html.ledger-workspace-v1 .expense-total-field input {
    caret-color: var(--ledger-accent) !important;
    font-variant-numeric: tabular-nums;
  }

  html.ledger-workspace-v1 p,
  html.ledger-workspace-v1 li,
  html.ledger-workspace-v1 small {
    text-wrap: pretty;
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1 .product-app-identity {
      padding-inline: 14px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top {
      gap: 20px !important;
      padding: 28px 22px 24px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top
      .eyebrow {
      font-size: 13px !important;
      line-height: 1.25 !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top
      h1 {
      font-size: 33px !important;
      line-height: 1.08 !important;
    }

    html.ledger-workspace-v1 .product-app-nav {
      width: calc(100% - 20px) !important;
      inset-block-end: max(8px, env(safe-area-inset-bottom)) !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    html.ledger-workspace-v1 *,
    html.ledger-workspace-v1 *::before,
    html.ledger-workspace-v1 *::after {
      scroll-behavior: auto !important;
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 1ms !important;
    }

    html.ledger-workspace-v1 button,
    html.ledger-workspace-v1 a,
    html.ledger-workspace-v1 input,
    html.ledger-workspace-v1 select,
    html.ledger-workspace-v1 textarea {
      transition-duration: 1ms !important;
    }
  }
`;

const RETIRED_ROOT_CLASSES = [
  "social-ledger-v2",
  "social-ledger-v4",
  "deep-ledger-v5",
  "deep-ledger-v6",
  "deep-ledger-v7",
  "product-studio-v3",
  "product-v2",
  "product-v2-live"
];

const RETIRED_STYLE_IDS = [
  "public-visual-refresh-layer-style",
  "public-premium-visual-layer-style",
  "public-fintech-design-layer-style",
  "public-product-v1-layer-style",
  "public-design-v2-layer-style",
  "public-studio-design-layer-style"
];

function activateLedgerWorkspace() {
  document.documentElement.classList.remove(...RETIRED_ROOT_CLASSES);
  document.documentElement.classList.add("product-v1", "ledger-workspace-v1");
  RETIRED_STYLE_IDS.forEach((styleId) => document.getElementById(styleId)?.remove());
}

activateLedgerWorkspace();

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

const appRoot = document.querySelector("#app");
if (appRoot) {
  new MutationObserver(activateLedgerWorkspace).observe(appRoot, {
    childList: true,
    subtree: true
  });
}
