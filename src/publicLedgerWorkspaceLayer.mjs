const STYLE_ID = "public-ledger-workspace-layer-style";

const CSS = `
  html.ledger-workspace-v1 {
    --font-hebrew: "Rubik", "Heebo", "Assistant", sans-serif;
    --font-num: "Inter", "Rubik", sans-serif;
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
    font-family: var(--font-hebrew) !important;
    letter-spacing: 0 !important;
  }

  html.ledger-workspace-v1 .font-num,
  html.ledger-workspace-v1 .currency-input-badge {
    font-family: var(--font-num) !important;
    font-weight: 900 !important;
    font-variant-numeric: tabular-nums;
    direction: ltr;
    unicode-bidi: isolate;
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

  html.ledger-workspace-v1 :is(h1, h2, h3)[tabindex="-1"]:focus {
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
    color: #596a66 !important;
    background: var(--ledger-canvas-deep) !important;
    box-shadow: none !important;
    opacity: 0.82 !important;
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

  html.ledger-workspace-v1
    .expense-modal-actions
    :is(.secondary-button, .expense-save-more, [data-action="cancel-expense"]) {
    border-color: var(--ledger-line-strong) !important;
    color: var(--ledger-ink) !important;
    background-color: var(--ledger-surface) !important;
    opacity: 1 !important;
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
    color: #5f706b !important;
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
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
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
    position: relative !important;
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

  html.ledger-workspace-v1 .product-nav-badge {
    position: absolute !important;
    inset-block-start: 4px !important;
    inset-inline-start: calc(50% + 5px) !important;
    min-width: 17px !important;
    height: 17px !important;
    display: grid !important;
    place-items: center !important;
    padding-inline: 4px !important;
    border: 2px solid var(--ledger-surface) !important;
    border-radius: 999px !important;
    color: #fff !important;
    background: #d95f4f !important;
    box-shadow: 0 3px 8px rgba(129, 39, 31, 0.22) !important;
    font-size: 9px !important;
    font-weight: 850 !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .product-nav-badge[hidden] {
    display: none !important;
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

  html.ledger-workspace-v1 .segmented-control button .font-num {
    min-width: 22px !important;
    height: 22px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 6px !important;
    color: var(--ledger-muted) !important;
    background: var(--ledger-canvas-deep) !important;
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
    gap: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .event-row-open {
    min-width: 0 !important;
    min-height: 81px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 20px !important;
    padding: 15px 18px !important;
    border: 0 !important;
    color: inherit !important;
    background: transparent !important;
    text-align: start !important;
    cursor: pointer !important;
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

  html.ledger-workspace-v1 .event-status-toggle {
    min-width: 76px !important;
    min-height: 44px !important;
    margin-inline-end: 18px !important;
    gap: 8px !important;
    border: 1px solid var(--ledger-line) !important;
    cursor: pointer !important;
    transition:
      color 160ms ease,
      border-color 160ms ease,
      background-color 160ms ease,
      box-shadow 160ms ease,
      transform 120ms ease !important;
  }

  html.ledger-workspace-v1 select.event-status-toggle {
    padding-inline: 11px !important;
    border-radius: 6px !important;
    font-family: inherit !important;
    text-align: center !important;
    text-align-last: center !important;
  }

  html.ledger-workspace-v1 select.event-status-toggle option {
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1 select.event-status-toggle:disabled {
    cursor: not-allowed !important;
    opacity: 0.62 !important;
  }

  html.ledger-workspace-v1 .event-status-toggle:hover {
    border-color: rgba(11, 106, 96, 0.28) !important;
    box-shadow: 0 6px 16px rgba(8, 49, 45, 0.1) !important;
  }

  html.ledger-workspace-v1 .event-status-toggle:focus-visible {
    outline: 3px solid rgba(43, 184, 194, 0.22) !important;
    outline-offset: 2px !important;
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
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    margin-top: 7px !important;
    color: var(--ledger-faint) !important;
    font-size: 11.5px !important;
  }

  html.ledger-workspace-v1 .opened-at-value {
    display: inline-flex !important;
    align-items: baseline !important;
    gap: 3px !important;
    direction: ltr !important;
    unicode-bidi: isolate !important;
  }

  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 8px !important;
  }

  html.product-v1.ledger-workspace-v1.circle-design-v1
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

  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions
    .event-header-utility-button:hover:not(:disabled),
  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions
    .event-header-utility-button:focus-visible {
    border-color: var(--ledger-accent) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.product-v1.ledger-workspace-v1.circle-design-v1
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
    font-size: 22px !important;
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
    inset-block-end: calc(max(12px, env(safe-area-inset-bottom)) + 76px) !important;
  }

  html.ledger-workspace-v1 .event-has-action-dock {
    padding-bottom: calc(178px + env(safe-area-inset-bottom)) !important;
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
    scroll-padding-block-end: calc(152px + env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1
    .expense-modal
    :is(input, select, textarea, button, summary, details) {
    scroll-margin-block: 96px calc(156px + env(safe-area-inset-bottom)) !important;
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
    font-family: var(--font-num) !important;
    font-size: 28px !important;
    font-weight: 900 !important;
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
    -webkit-mask-image: linear-gradient(
      to left,
      #000 calc(100% - 26px),
      rgba(0, 0, 0, 0.2) 100%
    ) !important;
    mask-image: linear-gradient(
      to left,
      #000 calc(100% - 26px),
      rgba(0, 0, 0, 0.2) 100%
    ) !important;
  }

  html.ledger-workspace-v1 .expense-template-grid::-webkit-scrollbar {
    display: none !important;
  }

  html.ledger-workspace-v1 .expense-template-grid .secondary-button {
    flex: 0 0 auto !important;
    min-height: 44px !important;
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
    font-family: var(--font-hebrew) !important;
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

  html.ledger-workspace-v1 .profile-avatar-picker {
    min-width: 0 !important;
    display: grid !important;
    gap: 10px !important;
    margin: 2px 0 4px !important;
    padding: 0 !important;
    border: 0 !important;
  }

  html.ledger-workspace-v1 .profile-avatar-picker legend {
    margin: 0 0 10px !important;
    padding: 0 !important;
    color: var(--ledger-ink) !important;
    font-size: 13px !important;
    font-weight: 750 !important;
  }

  html.ledger-workspace-v1 .profile-avatar-options {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
    gap: 10px !important;
    align-items: center !important;
  }

  html.ledger-workspace-v1 .profile-avatar-option {
    min-width: 0 !important;
    min-height: 56px !important;
    position: relative !important;
    display: grid !important;
    place-items: center !important;
    margin: 0 !important;
    cursor: pointer !important;
    -webkit-tap-highlight-color: transparent;
  }

  html.ledger-workspace-v1 .profile-avatar-option input {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    overflow: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  html.ledger-workspace-v1 .profile-avatar-preview {
    width: min(56px, 100%) !important;
    aspect-ratio: 1 !important;
    position: relative !important;
    display: block !important;
    overflow: visible !important;
    border: 2px solid transparent !important;
    border-radius: 50% !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: 0 8px 18px -14px rgba(12, 27, 32, 0.52) !important;
    transition:
      border-color 170ms cubic-bezier(0.2, 0, 0, 1),
      box-shadow 170ms cubic-bezier(0.2, 0, 0, 1),
      transform 170ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .profile-avatar-preview img {
    width: 100% !important;
    height: 100% !important;
    display: block !important;
    border-radius: inherit !important;
    object-fit: cover !important;
  }

  html.ledger-workspace-v1
    .profile-avatar-option
    input:checked
    + .profile-avatar-preview {
    border-color: var(--ledger-brand) !important;
    box-shadow:
      0 0 0 3px rgba(33, 170, 166, 0.2),
      0 12px 22px -15px rgba(6, 75, 67, 0.62) !important;
    transform: translateY(-2px) !important;
  }

  html.ledger-workspace-v1
    .profile-avatar-option
    input:checked
    + .profile-avatar-preview::after {
    content: "" !important;
    position: absolute !important;
    inset-inline-start: -2px !important;
    inset-block-end: -2px !important;
    width: 13px !important;
    height: 13px !important;
    border: 2px solid #ffffff !important;
    border-radius: 50% !important;
    background: var(--ledger-brand) !important;
    box-shadow: 0 3px 8px rgba(6, 75, 67, 0.28) !important;
  }

  html.ledger-workspace-v1
    .profile-avatar-option
    input:focus-visible
    + .profile-avatar-preview {
    outline: 3px solid rgba(33, 170, 166, 0.28) !important;
    outline-offset: 3px !important;
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
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  }

  html.ledger-workspace-v1 .new-event-settlement-panel .event-management-options.is-progressive {
    grid-template-columns: 1fr !important;
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

  html.ledger-workspace-v1 .event-management-step-actions {
    display: flex !important;
    justify-content: flex-start !important;
    margin-top: 16px !important;
  }

  html.ledger-workspace-v1 .event-management-step-actions .primary-button {
    min-width: min(100%, 220px) !important;
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
    grid-template-columns: minmax(0, 1fr) 26px !important;
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
    border-color: rgba(8, 116, 93, 0.34) !important;
    background: var(--ledger-surface) !important;
    box-shadow: inset -3px 0 0 #08745d !important;
  }

  html.ledger-workspace-v1 .event-management-check {
    margin-block-start: 0 !important;
    margin-inline-start: 0 !important;
  }

  html.ledger-workspace-v1 .event-management-option.is-active .event-management-check,
  html.ledger-workspace-v1 .event-management-option[aria-checked="true"] .event-management-check {
    border: 2px solid #08745d !important;
    color: #ffffff !important;
    background: #08745d !important;
  }

  html.ledger-workspace-v1 .event-settings-route-backdrop {
    z-index: 110 !important;
    padding-block-end: calc(96px + env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1 body:has(.event-settings-route-backdrop) .product-app-identity > .product-app-nav {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-settings-primary-nav {
    display: grid !important;
    z-index: 130 !important;
  }

  html.ledger-workspace-v1 .event-settings-route-backdrop .event-modal {
    max-height: calc(100dvh - 112px - env(safe-area-inset-bottom)) !important;
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

  html.ledger-workspace-v1 .account-apple-button {
    min-height: 56px !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 8px !important;
    color: #ffffff !important;
    background: #000000 !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .account-apple-button:hover {
    color: #ffffff !important;
    background: #000000 !important;
    box-shadow: 0 6px 16px rgba(0, 0, 0, .14) !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 .account-apple-button-art {
    display: block !important;
    width: 100% !important;
    max-width: 375px !important;
    height: auto !important;
    margin: 0 auto !important;
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

  html.ledger-workspace-v1 .account-danger-zone {
    border-top-color: var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .account-danger-copy strong {
    color: var(--ledger-ink) !important;
  }

  html.ledger-workspace-v1 .account-danger-copy small {
    color: var(--ledger-muted) !important;
  }


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
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
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
      padding-bottom: calc(176px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1 .event-action-dock {
      inset-block-end: calc(max(8px, env(safe-area-inset-bottom)) + 74px) !important;
      width: calc(100% - 20px) !important;
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
      gap: 0 !important;
      padding: 0 !important;
    }

    html.ledger-workspace-v1 .event-row-open {
      min-height: 76px !important;
      gap: 10px !important;
      padding: 14px 12px 14px 16px !important;
    }

    html.ledger-workspace-v1 .event-status-toggle {
      min-width: 72px !important;
      min-height: 44px !important;
      margin-inline-end: 12px !important;
    }

    html.ledger-workspace-v1 .event-row-side {
      min-width: 0 !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
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
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 8px !important;
    }

    html.ledger-workspace-v1 .account-profile-actions .secondary-button {
      width: 100% !important;
      min-width: 0 !important;
    }

    html.ledger-workspace-v1 .account-profile-actions .account-install-button {
      grid-column: 1 / -1 !important;
    }

    html.ledger-workspace-v1 .account-danger-zone,
    html.ledger-workspace-v1 .account-danger-zone .account-delete-button {
      width: 100% !important;
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

    html.ledger-workspace-v1 .event-creation-progress li > button > strong {
      min-width: 0 !important;
      font-size: 12px !important;
    }

    html.ledger-workspace-v1 .event-creation-progress li > button > span {
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
      min-height: 100vh !important;
      min-height: 100dvh !important;
      max-height: 100vh !important;
      max-height: 100dvh !important;
      border-radius: 0 !important;
      scroll-padding-block-end: calc(156px + env(safe-area-inset-bottom)) !important;
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
      position: sticky !important;
      inset-block-end: 0 !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      padding: 12px 14px calc(12px + env(safe-area-inset-bottom)) !important;
      background: var(--ledger-surface) !important;
      box-shadow: 0 -4px 10px rgba(16, 35, 33, 0.08) !important;
    }

    html.ledger-workspace-v1
      .expense-modal-actions
      > :is(button, .primary-button, .secondary-button) {
      width: 100% !important;
      min-width: 0 !important;
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
      grid-template-columns: minmax(0, 1fr) auto !important;
    }

    html.ledger-workspace-v1 .event-row-open {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .event-row-side {
      width: auto !important;
      min-width: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
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
    font-family: var(--font-hebrew) !important;
    font-weight: 800 !important;
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

  html.ledger-workspace-v1 :is(
    [data-action="delete-expense"],
    [data-action="delete-event"],
    [data-action="leave-event"],
    [data-action="remove-participant"],
    [data-action="remove-event-from-list"],
    [data-action="confirm-important-action"],
    [data-action="cancel-important-action"]
  ) {
    min-height: 48px !important;
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

  html.ledger-workspace-v1 .event-status-toggle {
    min-height: 44px !important;
    padding-inline: 12px !important;
  }

  html.ledger-workspace-v1 .expense-actions [data-action="edit-expense"] {
    min-height: 44px !important;
  }

  html.ledger-workspace-v1 .expense-actions [data-action="delete-expense"] {
    min-height: 48px !important;
  }

  html.ledger-workspace-v1 .event-modal .participant-pill {
    min-width: min(100%, 180px) !important;
    min-height: 52px !important;
    align-items: center !important;
    padding: 8px 11px !important;
  }

  html.ledger-workspace-v1 .event-modal .participant-pill-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .event-modal .participant-pill-name {
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .event-modal .participant-connection-badge {
    width: max-content !important;
    max-width: 100% !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 5px !important;
    margin: 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 10.5px !important;
    font-weight: 650 !important;
    line-height: 1.2 !important;
  }

  html.ledger-workspace-v1 .event-modal .participant-connection-badge.is-connected {
    color: var(--ledger-positive) !important;
  }

  html.ledger-workspace-v1 .event-modal .participant-connection-dot {
    width: 7px !important;
    height: 7px !important;
    flex: 0 0 auto !important;
    border: 1px solid currentColor !important;
    border-radius: 50% !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1
    .event-modal
    .participant-connection-badge.is-connected
    .participant-connection-dot {
    border-color: var(--ledger-positive) !important;
    background: var(--ledger-positive) !important;
    box-shadow: 0 0 0 2px rgba(22, 121, 91, 0.12) !important;
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1 .event-modal .participant-grid {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .event-modal .participant-pill {
      width: 100% !important;
      min-width: 0 !important;
    }
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

  html.ledger-workspace-v1 .event-identity-notice {
    width: 100%;
    min-height: 64px;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: 1px solid color-mix(in srgb, var(--ledger-accent) 28%, var(--ledger-line));
    border-radius: 10px;
    color: var(--ledger-ink);
    text-align: start;
    background: color-mix(in srgb, var(--ledger-accent) 6%, var(--ledger-surface));
    box-shadow: 0 3px 10px rgba(7, 27, 24, 0.055);
  }

  html.ledger-workspace-v1 .event-identity-notice:hover {
    border-color: color-mix(in srgb, var(--ledger-accent) 48%, var(--ledger-line));
    background: color-mix(in srgb, var(--ledger-accent) 9%, var(--ledger-surface));
    transform: translateY(-1px);
  }

  html.ledger-workspace-v1 .event-identity-notice-mark,
  html.ledger-workspace-v1 .participant-identity-mark {
    width: 28px;
    height: 28px;
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    color: #ffffff;
    font-size: 15px;
    font-weight: 800;
    font-family: var(--font-hebrew);
    background: var(--ledger-accent);
  }

  html.ledger-workspace-v1 .event-identity-notice > span:nth-child(2) {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  html.ledger-workspace-v1 .event-identity-notice strong {
    font-size: 15px;
    line-height: 1.35;
  }

  html.ledger-workspace-v1 .event-identity-notice small {
    color: var(--ledger-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  html.ledger-workspace-v1 .event-identity-notice-action {
    color: var(--ledger-accent);
    font-size: 14px;
    font-weight: 750;
  }

  html.ledger-workspace-v1 .participant-identity-review {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid color-mix(in srgb, var(--ledger-accent) 24%, var(--ledger-line));
    border-radius: 10px;
    background: color-mix(in srgb, var(--ledger-accent) 5%, var(--ledger-surface));
  }

  html.ledger-workspace-v1 .participant-identity-heading {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: start;
    gap: 10px;
  }

  html.ledger-workspace-v1 .participant-identity-heading h3,
  html.ledger-workspace-v1 .participant-identity-heading p {
    margin: 0;
  }

  html.ledger-workspace-v1 .participant-identity-heading h3 {
    font-size: 17px;
    line-height: 1.35;
  }

  html.ledger-workspace-v1 .participant-identity-heading p,
  html.ledger-workspace-v1 .participant-aliases > p,
  html.ledger-workspace-v1 .participant-identity-manager-note {
    color: var(--ledger-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  html.ledger-workspace-v1 .participant-identity-pairs {
    display: grid;
    gap: 10px;
  }

  html.ledger-workspace-v1 .participant-identity-pair {
    display: grid;
    gap: 12px;
    padding-block: 12px;
    border-block-start: 1px solid var(--ledger-line);
  }

  html.ledger-workspace-v1 .participant-identity-question {
    display: grid;
    gap: 5px;
  }

  html.ledger-workspace-v1 .participant-identity-question h3,
  html.ledger-workspace-v1 .participant-identity-question p {
    margin: 0;
  }

  html.ledger-workspace-v1 .participant-identity-question h3 {
    color: var(--ledger-ink);
    font-size: 18px;
    line-height: 1.35;
    text-wrap: balance;
  }

  html.ledger-workspace-v1 .participant-identity-question p {
    color: var(--ledger-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  html.ledger-workspace-v1 .participant-identity-people {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  html.ledger-workspace-v1 .participant-identity-person {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
  }

  html.ledger-workspace-v1 .participant-identity-person > span:last-child {
    min-width: 0;
    display: grid;
    justify-items: start;
    gap: 3px;
  }

  html.ledger-workspace-v1 .participant-identity-person strong {
    max-width: 100%;
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.35;
  }

  html.ledger-workspace-v1 .participant-identity-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  html.ledger-workspace-v1 .participant-identity-actions button {
    width: 100%;
    min-height: 44px;
  }

  html.ledger-workspace-v1 .participant-identity-defer {
    grid-column: 1 / -1;
    min-height: 44px;
    padding: 6px 12px;
    border: 0;
    color: var(--ledger-muted);
    background: transparent;
    font-size: 13px;
    font-weight: 700;
  }

  html.ledger-workspace-v1 .participant-identity-defer:hover {
    color: var(--ledger-accent);
    background: color-mix(in srgb, var(--ledger-accent) 6%, transparent);
  }

  html.ledger-workspace-v1 .participant-identity-connected-note {
    grid-column: 1 / -1;
    margin: 0;
    padding: 10px 12px;
    border-radius: 8px;
    color: var(--ledger-muted);
    background: color-mix(in srgb, var(--ledger-line) 38%, transparent);
    font-size: 13px;
    line-height: 1.5;
  }

  html.ledger-workspace-v1 .participant-identity-resolved {
    margin: 0;
    color: var(--ledger-positive);
    font-size: 14px;
    font-weight: 700;
  }

  html.ledger-workspace-v1 .participant-identity-success {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: start;
    gap: 12px;
    padding: 18px;
    border: 1px solid color-mix(in srgb, var(--ledger-positive) 24%, var(--ledger-line));
    border-radius: 12px;
    background: color-mix(in srgb, var(--ledger-positive) 6%, var(--ledger-surface));
  }

  html.ledger-workspace-v1 .participant-identity-success-mark {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #ffffff;
    background: var(--ledger-positive);
    font-weight: 900;
  }

  html.ledger-workspace-v1 .participant-identity-success h3,
  html.ledger-workspace-v1 .participant-identity-success p {
    margin: 0;
  }

  html.ledger-workspace-v1 .participant-identity-success h3 {
    color: var(--ledger-ink);
    font-size: 18px;
    line-height: 1.35;
  }

  html.ledger-workspace-v1 .participant-identity-success p {
    margin-block-start: 4px;
    color: var(--ledger-muted);
    font-size: 13px;
  }

  html.ledger-workspace-v1 .participant-aliases {
    border-block-start: 1px solid var(--ledger-line);
    padding-block-start: 12px;
  }

  html.ledger-workspace-v1 .participant-aliases summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
    font-size: 14px;
    font-weight: 750;
  }

  html.ledger-workspace-v1 .participant-aliases > p {
    margin: 0 0 10px;
  }

  html.ledger-workspace-v1 .participant-alias-list {
    display: grid;
    gap: 10px;
  }

  html.ledger-workspace-v1 .participant-alias-row {
    display: grid;
    grid-template-columns: minmax(100px, 0.6fr) minmax(0, 1.4fr);
    align-items: center;
    gap: 10px;
  }

  html.ledger-workspace-v1 .participant-alias-row > span:first-child {
    overflow-wrap: anywhere;
    font-size: 14px;
    font-weight: 700;
  }

  html.ledger-workspace-v1 .participant-alias-control {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  html.ledger-workspace-v1 .participant-alias-control input,
  html.ledger-workspace-v1 .participant-alias-control button {
    min-height: 44px;
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

    html.ledger-workspace-v1 .event-identity-notice {
      grid-template-columns: 28px minmax(0, 1fr);
      padding: 12px 14px;
    }

    html.ledger-workspace-v1 .event-identity-notice-action {
      grid-column: 2;
    }

    html.ledger-workspace-v1 .participant-identity-review {
      padding: 14px;
    }

    html.ledger-workspace-v1 .participant-identity-people,
    html.ledger-workspace-v1 .participant-alias-row {
      grid-template-columns: minmax(0, 1fr);
    }

    html.ledger-workspace-v1 .participant-identity-actions,
    html.ledger-workspace-v1 .participant-identity-actions button {
      width: 100%;
    }

    html.ledger-workspace-v1 .participant-identity-actions {
      grid-template-columns: minmax(0, 1fr);
    }

    html.ledger-workspace-v1 .participant-identity-defer,
    html.ledger-workspace-v1 .participant-identity-connected-note {
      grid-column: 1;
    }

    html.ledger-workspace-v1 .participant-alias-control {
      grid-template-columns: minmax(0, 1fr) 72px;
    }
  }

  @media (max-width: 360px) {
    html.ledger-workspace-v1 .expense-modal-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }
  }

  /* Inviting and adding people are separate, explicit participant paths. */
  html.ledger-workspace-v1 .event-participant-notice {
    margin: 0 0 14px !important;
    padding: 11px 12px !important;
    border: 1px solid rgba(190, 112, 65, 0.24) !important;
    border-inline-start: 3px solid var(--ledger-warning) !important;
    border-radius: 8px !important;
    color: var(--ledger-ink) !important;
    background: rgba(255, 247, 239, 0.86) !important;
    font-size: 12px !important;
    font-weight: 650 !important;
    line-height: 1.5 !important;
  }

  html.ledger-workspace-v1 .event-participant-roster,
  html.ledger-workspace-v1 .event-participant-add-existing,
  html.ledger-workspace-v1 .event-participant-offline-entry {
    min-width: 0 !important;
    margin: 0 0 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 8px !important;
    background: #ffffff !important;
    box-shadow:
      0 1px 2px rgba(12, 27, 32, 0.04),
      0 10px 24px -22px rgba(12, 27, 32, 0.34) !important;
    overflow: hidden !important;
  }

  html.ledger-workspace-v1 .event-participant-section-header,
  html.ledger-workspace-v1 .event-participant-add-existing > summary {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 14px 15px !important;
  }

  html.ledger-workspace-v1 .event-participant-section-header {
    border-block-end: 1px solid var(--ledger-line) !important;
    background: rgba(236, 248, 246, 0.66) !important;
  }

  html.ledger-workspace-v1 .event-participant-section-header > span:first-child,
  html.ledger-workspace-v1 .event-participant-add-existing > summary > span:first-child,
  html.ledger-workspace-v1 .event-participant-offline-entry > div:first-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .event-participant-section-header strong,
  html.ledger-workspace-v1 .event-participant-add-existing summary strong,
  html.ledger-workspace-v1 .event-participant-offline-entry strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 800 !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .event-participant-section-header small,
  html.ledger-workspace-v1 .event-participant-add-existing summary small,
  html.ledger-workspace-v1 .event-participant-offline-entry > div:first-child > span {
    color: var(--ledger-muted) !important;
    font-size: 11.5px !important;
    font-weight: 560 !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .event-participant-count {
    min-width: max-content !important;
    padding: 4px 8px !important;
    border-radius: 999px !important;
    color: #075d55 !important;
    background: rgba(33, 170, 166, 0.11) !important;
    font-size: 11px !important;
    font-weight: 750 !important;
    line-height: 1.2 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-participant-count-summary {
    min-width: 0 !important;
    display: grid !important;
    justify-items: end !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .event-participant-count-summary > small {
    color: var(--ledger-muted) !important;
    font-size: 10px !important;
    font-weight: 650 !important;
    line-height: 1.2 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-list,
  html.ledger-workspace-v1 .event-participant-candidate-list {
    min-width: 0 !important;
    display: grid !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-search {
    margin: 12px !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-search + .event-participant-roster-list {
    border-block-start: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-list > .muted {
    margin: 0 !important;
    padding: 14px !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-row,
  html.ledger-workspace-v1 .event-participant-candidate-row {
    min-width: 0 !important;
    min-height: 68px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 10px 12px !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-row + .event-participant-roster-row,
  html.ledger-workspace-v1 .event-participant-candidate-row + .event-participant-candidate-row {
    border-block-start: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-row.is-offline,
  html.ledger-workspace-v1 .event-participant-candidate-row.is-offline {
    background: rgba(247, 249, 248, 0.72) !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-row.has-identity-review {
    box-shadow: inset -3px 0 0 rgba(190, 112, 65, 0.72) !important;
  }

  html.ledger-workspace-v1 .event-participant-inactive > summary {
    background: rgba(247, 249, 248, 0.76) !important;
  }

  html.ledger-workspace-v1 .event-participant-inactive .event-participant-count {
    color: #526762 !important;
    background: rgba(72, 91, 87, 0.09) !important;
  }

  html.ledger-workspace-v1 .event-participant-inactive-row {
    background: rgba(247, 249, 248, 0.72) !important;
  }

  html.ledger-workspace-v1 .event-participant-inactive-row .avatar {
    filter: grayscale(0.84) !important;
    opacity: 0.74 !important;
  }

  html.ledger-workspace-v1 .event-participant-person {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: 42px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .event-participant-person > .avatar {
    width: 42px !important;
    height: 42px !important;
    font-size: 13px !important;
  }

  html.ledger-workspace-v1 .event-participant-person-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 5px !important;
  }

  html.ledger-workspace-v1 .event-participant-person-copy > strong {
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
    font-weight: 780 !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .event-participant-meta {
    min-width: 0 !important;
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 5px !important;
  }

  html.ledger-workspace-v1 .event-participant-role,
  html.ledger-workspace-v1 .event-participant-money-status,
  html.ledger-workspace-v1 .event-participant-duplicate-status {
    width: max-content !important;
    max-width: 100% !important;
    padding: 2px 6px !important;
    border-radius: 6px !important;
    color: #526762 !important;
    background: rgba(72, 91, 87, 0.08) !important;
    font-size: 10.5px !important;
    font-weight: 680 !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .event-participant-money-status {
    color: #805029 !important;
    background: rgba(190, 112, 65, 0.1) !important;
  }

  html.ledger-workspace-v1 .event-participant-duplicate-status {
    color: #805029 !important;
    background: rgba(190, 112, 65, 0.12) !important;
  }

  html.ledger-workspace-v1 .event-participant-current-label {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 650 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-participant-remove-button,
  html.ledger-workspace-v1 .event-participant-add-button {
    min-width: 74px !important;
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 0 12px !important;
    border-radius: 8px !important;
    font: inherit !important;
    font-size: 12px !important;
    font-weight: 760 !important;
    transition:
      color 160ms ease,
      background-color 160ms ease,
      border-color 160ms ease,
      transform 160ms ease !important;
  }

  html.ledger-workspace-v1 .event-participant-remove-button {
    border: 1px solid rgba(185, 71, 57, 0.22) !important;
    color: #9b3f34 !important;
    background: rgba(185, 71, 57, 0.06) !important;
  }

  html.ledger-workspace-v1 .event-participant-add-button {
    border: 1px solid rgba(14, 110, 101, 0.24) !important;
    color: #075d55 !important;
    background: rgba(33, 170, 166, 0.08) !important;
  }

  html.ledger-workspace-v1 .event-participant-remove-button:active,
  html.ledger-workspace-v1 .event-participant-add-button:active {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .event-participant-add-existing > summary {
    min-height: 60px !important;
    grid-template-columns: minmax(0, 1fr) auto auto !important;
    cursor: pointer !important;
    list-style: none !important;
  }

  html.ledger-workspace-v1 .event-participant-add-existing > summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-participant-add-existing > summary::after {
    content: "‹" !important;
    grid-column: 3 !important;
    color: var(--ledger-muted) !important;
    font-size: 22px !important;
    line-height: 1 !important;
    transform: rotate(0deg) !important;
    transition: transform 180ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .event-participant-add-existing[open] > summary::after {
    transform: rotate(-90deg) !important;
  }

  html.ledger-workspace-v1 .event-participant-candidates {
    min-width: 0 !important;
    display: grid !important;
    gap: 0 !important;
    border-block-start: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .event-participant-identity-group {
    min-width: 0 !important;
    display: grid !important;
  }

  html.ledger-workspace-v1 .event-participant-identity-group + .event-participant-identity-group {
    border-block-start: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .event-participant-identity-group > header {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
    padding: 10px 13px 8px !important;
    background: rgba(236, 248, 246, 0.48) !important;
  }

  html.ledger-workspace-v1 .event-participant-identity-group.is-offline > header {
    background: rgba(247, 249, 248, 0.92) !important;
  }

  html.ledger-workspace-v1 .event-participant-identity-group > header strong {
    color: var(--ledger-ink) !important;
    font-size: 12px !important;
    font-weight: 760 !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .event-participant-identity-group > header small {
    color: var(--ledger-muted) !important;
    font-size: 10.5px !important;
    font-weight: 560 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .event-participant-candidates .participant-search-field {
    margin: 12px !important;
  }

  html.ledger-workspace-v1 .event-participant-candidates > .muted {
    margin: 0 !important;
    padding: 14px !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .event-participant-offline-entry {
    display: grid !important;
    gap: 12px !important;
    padding: 14px !important;
  }

  html.ledger-workspace-v1 .event-participant-offline-entry .inline-actions {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: stretch !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .event-participant-offline-entry .guest-input,
  html.ledger-workspace-v1 .event-participant-offline-entry button {
    min-height: 48px !important;
  }

  html.ledger-workspace-v1 .participant-invite-entry {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 14px !important;
    margin-block-end: 16px !important;
    padding: 14px !important;
    border: 1px solid rgba(14, 110, 101, 0.2) !important;
    border-radius: 8px !important;
    background: rgba(236, 248, 246, 0.82) !important;
  }

  html.ledger-workspace-v1 .participant-invite-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .participant-invite-copy strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .participant-invite-copy span {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .participant-invite-button {
    min-height: 48px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .participant-invite-button .command-card-icon {
    width: 19px !important;
    height: 19px !important;
    display: inline-grid !important;
    place-items: center !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .participant-invite-button .command-card-icon svg {
    width: 19px !important;
    height: 19px !important;
  }

  /* The event invite reads as a deliberate access pass, not a generic status chip. */
  html.ledger-workspace-v1 .event-invite-pass {
    position: relative !important;
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    align-items: stretch !important;
    gap: 0 !important;
    margin: 0 0 14px !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 1px solid rgba(32, 172, 164, 0.34) !important;
    border-radius: 8px !important;
    color: #ffffff !important;
    background: #073f38 !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.14) inset,
      0 18px 36px -25px rgba(3, 47, 42, 0.82) !important;
    isolation: isolate !important;
  }

  html.ledger-workspace-v1 .event-invite-pass::after {
    content: "" !important;
    position: absolute !important;
    z-index: -1 !important;
    inset-block: 0 !important;
    inset-inline-start: -42% !important;
    width: 28% !important;
    display: block !important;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(106, 232, 220, 0.16),
      transparent
    ) !important;
    transform: skewX(-14deg) !important;
    animation: ledger-invite-pass-sheen 5.8s ease-in-out infinite !important;
    pointer-events: none !important;
  }

  html.ledger-workspace-v1 .event-invite-pass-main {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: 46px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 18px !important;
  }

  html.ledger-workspace-v1 .event-invite-pass-main > .command-card-icon {
    width: 46px !important;
    height: 46px !important;
    display: grid !important;
    place-items: center !important;
    margin: 0 !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-radius: 8px !important;
    color: #9de4dd !important;
    background: rgba(255, 255, 255, 0.08) !important;
  }

  html.ledger-workspace-v1 .event-invite-pass-main > .command-card-icon svg {
    width: 23px !important;
    height: 23px !important;
    stroke: currentColor !important;
    stroke-width: 1.8 !important;
  }

  html.ledger-workspace-v1 .event-invite-pass-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .event-invite-pass-copy small {
    color: #83d8cf !important;
    font-size: 10.5px !important;
    font-weight: 750 !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .event-invite-pass-copy strong {
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
    color: #ffffff !important;
    font-size: 18px !important;
    font-weight: 850 !important;
    line-height: 1.28 !important;
  }

  html.ledger-workspace-v1 .event-invite-pass-copy > span {
    color: rgba(238, 252, 249, 0.76) !important;
    font-size: 11px !important;
    font-weight: 560 !important;
    line-height: 1.4 !important;
  }

  html.ledger-workspace-v1 .event-invite-pass-stub {
    min-width: 0 !important;
    display: block !important;
    padding: 0 18px 16px !important;
    border: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .event-invite-pass-stub > strong {
    color: #ffffff !important;
    font-size: 13px !important;
    font-weight: 820 !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .event-invite-pass-stub > small {
    color: rgba(238, 252, 249, 0.64) !important;
    font-size: 10px !important;
    font-weight: 600 !important;
  }

  html.ledger-workspace-v1 .event-invite-pass-state {
    display: inline-flex !important;
    align-items: center !important;
    gap: 0 !important;
    margin: 0 !important;
    color: #a5eee5 !important;
    font-size: 11px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .event-invite-pass-state > i {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-invite-pass.is-local .event-invite-pass-state {
    color: #f0c990 !important;
  }

  html.ledger-workspace-v1 .event-invite-pass.is-local .event-invite-pass-state > i {
    background: #e6ae61 !important;
    box-shadow: 0 0 0 3px rgba(230, 174, 97, 0.13) !important;
  }

  html.ledger-workspace-v1 .event-invite-pass.is-error {
    border-color: rgba(184, 93, 75, 0.34) !important;
  }

  html.ledger-workspace-v1 .event-invite-pass.is-error .event-invite-pass-state {
    color: #ffd1c7 !important;
  }

  html.ledger-workspace-v1 .event-invite-pass.is-error .event-invite-pass-state > i {
    background: #ef8c76 !important;
    box-shadow: 0 0 0 3px rgba(239, 140, 118, 0.14) !important;
  }

  html.ledger-workspace-v1 .event-invite-recovery {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 12px !important;
    margin: -2px 0 14px !important;
    padding: 12px 13px !important;
    border: 1px solid rgba(184, 93, 75, 0.22) !important;
    border-radius: 8px !important;
    background: #fff8f6 !important;
  }

  html.ledger-workspace-v1 .event-invite-recovery > span {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .event-invite-recovery strong {
    color: #6f2f23 !important;
    font-size: 12px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .event-invite-recovery small {
    color: #7a5a53 !important;
    font-size: 11px !important;
    font-weight: 560 !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .event-invite-recovery > button {
    min-width: 88px !important;
    min-height: 44px !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .invite-link-row {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 10px !important;
    align-items: stretch !important;
  }

  html.ledger-workspace-v1 .event-invite-link-field {
    min-width: 0 !important;
    display: grid !important;
    gap: 7px !important;
    margin: 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .event-invite-link-field > input {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 48px !important;
    padding-inline: 13px !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: 8px !important;
    color: #31534d !important;
    background: #f7faf9 !important;
    box-shadow: 0 1px 2px rgba(7, 27, 24, 0.035) inset !important;
    font-family: var(--font-num) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    text-overflow: ellipsis !important;
  }

  html.ledger-workspace-v1 .event-invite-link-actions {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .event-invite-link-actions > button {
    min-height: 48px !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .event-invite-link-actions > .secondary-button {
    min-width: 84px !important;
  }

  html.ledger-workspace-v1 .event-share-choice,
  html.ledger-workspace-v1 .event-share-open {
    min-width: 0 !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 8px !important;
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1 .event-share-choice {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 14px !important;
    margin-block-end: 14px !important;
    padding: 15px !important;
  }

  html.ledger-workspace-v1 .event-share-choice > div,
  html.ledger-workspace-v1 .event-share-open-heading,
  html.ledger-workspace-v1 .event-share-open-heading > span {
    min-width: 0 !important;
    display: grid !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .event-share-choice small,
  html.ledger-workspace-v1 .event-share-open-heading small {
    color: var(--ledger-accent) !important;
    font-size: 10.5px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .event-share-choice strong,
  html.ledger-workspace-v1 .event-share-open-heading strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 850 !important;
  }

  html.ledger-workspace-v1 .event-share-choice p,
  html.ledger-workspace-v1 .event-share-open-heading p {
    margin: 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 560 !important;
    line-height: 1.5 !important;
  }

  html.ledger-workspace-v1 .event-share-choice > button {
    min-width: 96px !important;
    min-height: 44px !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .event-share-open {
    padding: 15px !important;
    background:
      linear-gradient(180deg, rgba(247, 251, 250, 0.98), rgba(255, 255, 255, 0.98)) !important;
  }

  html.ledger-workspace-v1 .event-share-open-heading {
    margin-block-end: 13px !important;
  }

  html.ledger-workspace-v1 .event-share-open-heading > span {
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .event-share-route {
    min-width: 0 !important;
  }

  html.ledger-workspace-v1 .event-share-route-list {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    border-radius: 12px !important;
  }

  html.ledger-workspace-v1 .event-share-route-list > .event-share-route-choice {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 76px !important;
    display: grid !important;
    grid-template-columns: 42px minmax(0, 1fr) 20px !important;
    align-items: center !important;
    gap: 13px !important;
    margin: 0 !important;
    padding: 14px 15px !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
    text-align: start !important;
    cursor: pointer !important;
    transition: background-color 160ms ease, transform 160ms ease !important;
  }

  html.ledger-workspace-v1 .event-share-route-list > .event-share-route-choice + .event-share-route-choice {
    border-block-start: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .event-share-route-choice > .command-card-icon {
    width: 42px !important;
    height: 42px !important;
    display: grid !important;
    place-items: center !important;
    margin: 0 !important;
    border: 1px solid rgba(11, 74, 56, 0.14) !important;
    border-radius: 10px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .event-share-route-choice > .command-card-icon svg {
    width: 21px !important;
    height: 21px !important;
    stroke-width: 1.8 !important;
  }

  html.ledger-workspace-v1 .event-share-route-choice > span:not(.command-card-icon, .event-share-route-chevron) {
    min-width: 0 !important;
    display: grid !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .event-share-route-choice strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 760 !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .event-share-route-choice small {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 540 !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .event-share-route-chevron {
    width: 20px !important;
    height: 20px !important;
    display: grid !important;
    place-items: center !important;
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .event-share-route-chevron svg {
    width: 18px !important;
    height: 18px !important;
    stroke-width: 1.8 !important;
  }

  @media (hover: hover) {
    html.ledger-workspace-v1 .event-share-route-choice:hover {
      background: var(--ledger-surface-soft) !important;
    }
  }

  html.ledger-workspace-v1 .event-share-route-choice:active {
    transform: scale(0.99) !important;
  }

  html.ledger-workspace-v1 .event-share-friend-list {
    min-width: 0 !important;
    display: grid !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 12px !important;
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1 .event-share-friend-list .event-participant-candidate-row {
    margin: 0 !important;
    padding: 13px 14px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-share-friend-list .event-participant-candidate-row + .event-participant-candidate-row {
    border-block-start: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .event-share-empty {
    min-height: 180px !important;
    display: grid !important;
    place-items: center !important;
    align-content: center !important;
    gap: 8px !important;
    padding: 24px !important;
    border-block: 1px solid var(--ledger-line) !important;
    color: var(--ledger-muted) !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .event-share-empty > .command-card-icon {
    width: 28px !important;
    height: 28px !important;
    display: grid !important;
    place-items: center !important;
    margin: 0 0 2px !important;
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .event-share-empty strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 720 !important;
  }

  html.ledger-workspace-v1 .event-share-empty p {
    margin: 0 !important;
    font-size: 12px !important;
    line-height: 1.5 !important;
  }

  html.ledger-workspace-v1 .event-invite-rotate-button {
    justify-self: start !important;
    width: auto !important;
    min-height: 44px !important;
    margin: 12px 0 0 !important;
    padding: 0 14px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: 8px !important;
    background: var(--ledger-surface) !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 720 !important;
    text-decoration: none !important;
    box-shadow: none !important;
  }

  @keyframes ledger-invite-pass-sheen {
    0%,
    58% {
      inset-inline-start: -42%;
      opacity: 0;
    }

    66% {
      opacity: 1;
    }

    82%,
    100% {
      inset-inline-start: 116%;
      opacity: 0;
    }
  }

  html.ledger-workspace-v1 .participant-checks-set,
  html.ledger-workspace-v1 .participant-identity-groups {
    min-width: 0 !important;
    display: grid !important;
    gap: 14px !important;
  }

  html.ledger-workspace-v1 .participant-identity-group {
    min-width: 0 !important;
    display: grid !important;
    gap: 9px !important;
  }

  html.ledger-workspace-v1 .participant-identity-group + .participant-identity-group {
    padding-block-start: 14px !important;
    border-block-start: 1px solid var(--ledger-border) !important;
  }

  html.ledger-workspace-v1 .participant-identity-group-header {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 9px !important;
  }

  html.ledger-workspace-v1 .participant-identity-group-marker {
    width: 10px !important;
    height: 10px !important;
    border: 1px solid #64746f !important;
    border-radius: 50% !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .participant-identity-group.is-account .participant-identity-group-marker {
    border-color: var(--ledger-positive) !important;
    background: var(--ledger-positive) !important;
    box-shadow: 0 0 0 3px rgba(22, 121, 91, 0.1) !important;
  }

  html.ledger-workspace-v1 .participant-identity-group-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .participant-identity-group-copy strong {
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .participant-identity-group-copy small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    line-height: 1.4 !important;
  }

  html.ledger-workspace-v1 .participant-identity-group-count {
    padding: 3px 7px !important;
    border-radius: 999px !important;
    color: #526762 !important;
    background: rgba(72, 91, 87, 0.08) !important;
    font-size: 10.5px !important;
    font-weight: 700 !important;
    line-height: 1.2 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .participant-identity-group.is-account .participant-identity-group-count {
    color: #075d55 !important;
    background: rgba(33, 170, 166, 0.11) !important;
  }

  html.ledger-workspace-v1 .participant-identity-group[hidden] {
    display: none !important;
  }

  /* Account identity stays visible wherever a person is selected or managed. */
  html.ledger-workspace-v1 .participant-pill {
    min-height: 56px !important;
    align-items: center !important;
    padding: 8px 11px !important;
  }

  html.ledger-workspace-v1 .participant-pill.is-account {
    border-color: rgba(14, 110, 101, 0.28) !important;
    background: rgba(236, 248, 246, 0.72) !important;
  }

  html.ledger-workspace-v1 .participant-pill.is-offline {
    border-style: dashed !important;
    border-color: rgba(72, 91, 87, 0.26) !important;
    background: rgba(247, 249, 248, 0.96) !important;
  }

  html.ledger-workspace-v1 .participant-pill.is-account:has(input:checked) {
    border-style: solid !important;
    border-color: var(--ledger-brand) !important;
    background: #dff3ef !important;
  }

  html.ledger-workspace-v1 .participant-pill.is-offline:has(input:checked) {
    border-style: solid !important;
    border-color: rgba(72, 91, 87, 0.52) !important;
    background: #eef2f1 !important;
  }

  html.ledger-workspace-v1 .participant-pill-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .participant-pill-name {
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .participant-connection-badge {
    width: max-content !important;
    max-width: 100% !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 5px !important;
    margin: 0 !important;
    padding: 2px 6px !important;
    border-radius: 6px !important;
    color: #526762 !important;
    background: rgba(72, 91, 87, 0.08) !important;
    font-size: 10.5px !important;
    font-weight: 680 !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .participant-connection-badge.is-connected {
    color: #075d55 !important;
    background: rgba(33, 170, 166, 0.11) !important;
  }

  html.ledger-workspace-v1 .participant-connection-dot {
    width: 7px !important;
    height: 7px !important;
    flex: 0 0 auto !important;
    border: 1px solid currentColor !important;
    border-radius: 50% !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1
    .participant-connection-badge.is-connected
    .participant-connection-dot {
    border-color: var(--ledger-positive) !important;
    background: var(--ledger-positive) !important;
    box-shadow: 0 0 0 2px rgba(22, 121, 91, 0.12) !important;
  }

  html.ledger-workspace-v1 .avatar {
    position: relative !important;
  }

  html.ledger-workspace-v1 .avatar.has-picture {
    color: transparent !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .avatar.has-picture > img {
    width: 100% !important;
    height: 100% !important;
    display: block !important;
    border-radius: inherit !important;
    object-fit: cover !important;
  }

  html.ledger-workspace-v1 .avatar.is-account {
    border-style: solid !important;
    border-color: rgba(14, 110, 101, 0.34) !important;
    color: #075d55 !important;
    background: #dff3ef !important;
  }

  html.ledger-workspace-v1 .avatar.is-account::after {
    content: "" !important;
    position: absolute !important;
    inset-inline-start: -1px !important;
    inset-block-end: -1px !important;
    width: 8px !important;
    height: 8px !important;
    border: 2px solid var(--ledger-surface) !important;
    border-radius: 50% !important;
    background: var(--ledger-positive) !important;
    box-sizing: border-box !important;
  }

  html.ledger-workspace-v1 .avatar.is-offline {
    border-style: dashed !important;
    border-color: rgba(72, 91, 87, 0.36) !important;
    color: #526762 !important;
    background: #eef2f1 !important;
  }

  html.ledger-workspace-v1 .avatar.is-offline.has-picture > img {
    filter: grayscale(1) saturate(0) contrast(0.86) !important;
    opacity: 0.46 !important;
  }

  html.ledger-workspace-v1 .known-participant-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .known-participant-identity {
    min-width: 0 !important;
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 6px !important;
  }

  html.ledger-workspace-v1 .quick-person-option-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1 .event-share-choice {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .event-share-choice > button {
      width: 100% !important;
    }

    html.ledger-workspace-v1 .event-invite-pass {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .event-invite-pass-main {
      grid-template-columns: 42px minmax(0, 1fr) !important;
      gap: 10px !important;
      padding: 15px !important;
    }

    html.ledger-workspace-v1 .event-invite-pass-main > .command-card-icon {
      width: 42px !important;
      height: 42px !important;
    }

    html.ledger-workspace-v1 .event-invite-pass-copy strong {
      font-size: 16px !important;
    }

    html.ledger-workspace-v1 .event-invite-pass-stub {
      padding: 0 15px 14px !important;
    }

    html.ledger-workspace-v1 .event-invite-recovery {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .event-invite-recovery > button {
      width: 100% !important;
    }

    html.ledger-workspace-v1 .event-participant-offline-entry .inline-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .event-participant-offline-entry button {
      width: 100% !important;
    }

    html.ledger-workspace-v1 .participant-invite-entry {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .participant-invite-button {
      width: 100% !important;
    }
  }

  /* Focused group management keeps the overview light and the forms full-screen. */
  html.ledger-workspace-v1 .home-event-tools.is-single {
    width: min(100%, 540px) !important;
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html.ledger-workspace-v1 .home-event-tools .home-groups-button {
    min-height: 68px !important;
    display: grid !important;
    grid-template-columns: 28px minmax(0, 1fr) !important;
    grid-template-rows: auto auto !important;
    column-gap: 12px !important;
    row-gap: 2px !important;
    justify-content: stretch !important;
    padding: 12px 16px !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .home-groups-button .button-action-icon {
    grid-row: 1 / span 2 !important;
    align-self: center !important;
  }

  html.ledger-workspace-v1 .home-groups-button > span:not(.button-action-icon) {
    align-self: end !important;
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 750 !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .home-groups-button > small {
    align-self: start !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 520 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .groups-overview-screen > .top {
    margin-bottom: 28px !important;
  }

  html.ledger-workspace-v1 .groups-overview-actions .primary-button {
    min-width: 154px !important;
  }

  html.ledger-workspace-v1 .groups-list-section {
    width: 100% !important;
    margin-top: 0 !important;
  }

  html.ledger-workspace-v1 .groups-list-section > .section-title-row {
    margin-bottom: 12px !important;
  }

  html.ledger-workspace-v1 .groups-list-section .stack {
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .groups-overview-screen .group-row {
    min-height: 112px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 18px !important;
    padding: 18px 20px !important;
  }

  html.ledger-workspace-v1 .group-row-copy {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: max-content minmax(0, 1fr) !important;
    gap: 4px 12px !important;
    align-items: baseline !important;
  }

  html.ledger-workspace-v1 .group-row-copy > strong {
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
    color: var(--ledger-ink) !important;
    font-size: 18px !important;
    font-weight: 760 !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .group-row-copy .opened-at {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1 .group-row-copy > small,
  html.ledger-workspace-v1 .group-member-preview {
    grid-column: 1 / -1 !important;
  }

  html.ledger-workspace-v1 .group-row-copy > small {
    color: var(--ledger-brand) !important;
    font-size: 12px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .group-member-preview {
    min-width: 0 !important;
    overflow: hidden !important;
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    line-height: 1.4 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .groups-overview-screen .group-row .section-title-actions {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .groups-overview-screen .group-row button {
    min-height: 44px !important;
  }

  html.ledger-workspace-v1 .groups-empty-state {
    min-height: 220px !important;
    display: grid !important;
    place-items: center !important;
    align-content: center !important;
    gap: 8px !important;
    padding: 28px !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .groups-empty-state > strong {
    color: var(--ledger-ink) !important;
    font-size: 18px !important;
  }

  html.ledger-workspace-v1 .groups-empty-state > span {
    color: var(--ledger-muted) !important;
    font-size: 14px !important;
  }

  html.ledger-workspace-v1 .groups-empty-state > button {
    margin-top: 10px !important;
  }

  html.ledger-workspace-v1 .groups-management-section {
    margin-top: 22px !important;
  }

  html.ledger-workspace-v1 .people-management-entry {
    width: 100% !important;
    min-height: 82px !important;
    display: grid !important;
    grid-template-columns: 28px minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 14px !important;
    padding: 16px 18px !important;
    border: 0 !important;
    border-radius: 8px !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
    box-shadow: var(--ledger-shadow-border) !important;
    text-align: start !important;
    transition:
      color 170ms cubic-bezier(0.2, 0, 0, 1),
      background-color 170ms cubic-bezier(0.2, 0, 0, 1),
      box-shadow 170ms cubic-bezier(0.2, 0, 0, 1),
      transform 170ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .people-management-entry .button-action-icon {
    display: grid !important;
    place-items: center !important;
    width: 28px !important;
    height: 28px !important;
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .people-management-entry .button-action-icon svg {
    width: 24px !important;
    height: 24px !important;
  }

  html.ledger-workspace-v1 .people-management-entry:hover {
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: var(--ledger-shadow-border-hover) !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 .people-management-entry:active {
    transform: scale(0.99) !important;
  }

  html.ledger-workspace-v1 .people-management-entry:focus-visible {
    outline: 0 !important;
    box-shadow: var(--ledger-focus-ring) !important;
  }

  html.ledger-workspace-v1 .people-management-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .people-management-copy > strong {
    font-size: 16px !important;
    font-weight: 750 !important;
  }

  html.ledger-workspace-v1 .people-management-copy > small {
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    font-weight: 520 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .people-management-count {
    max-width: 124px !important;
    color: var(--ledger-brand) !important;
    font-size: 12px !important;
    font-weight: 720 !important;
    line-height: 1.35 !important;
    text-align: end !important;
  }

  html.ledger-workspace-v1 .group-workflow-screen > .top {
    margin-bottom: 24px !important;
  }

  html.ledger-workspace-v1 .group-workflow-screen > :is(
    .group-create-panel,
    .edit-group-panel,
    .known-participants-panel,
    .merge-participants-panel
  ) {
    width: min(100%, 760px) !important;
    margin-inline: auto !important;
  }

  html.ledger-workspace-v1 .group-workflow-screen > :is(
    .group-create-panel,
    .edit-group-panel
  ) {
    padding: 24px !important;
  }

  html.ledger-workspace-v1 .group-members-heading {
    margin-top: 24px !important;
    margin-bottom: 12px !important;
  }

  html.ledger-workspace-v1 .people-management-screen > .known-participants-panel {
    margin-top: 0 !important;
  }

  html.ledger-workspace-v1 .people-management-screen > .merge-participants-panel {
    margin-top: 18px !important;
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1 .groups-overview-screen > .top {
      margin-bottom: 20px !important;
    }

    html.ledger-workspace-v1 .groups-overview-actions,
    html.ledger-workspace-v1 .groups-overview-actions .primary-button {
      width: 100% !important;
    }

    html.ledger-workspace-v1 .groups-overview-screen .group-row {
      min-height: 0 !important;
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 14px !important;
      padding: 16px !important;
    }

    html.ledger-workspace-v1 .group-row-copy {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 4px !important;
    }

    html.ledger-workspace-v1 .group-row-copy > * {
      grid-column: 1 !important;
    }

    html.ledger-workspace-v1 .groups-overview-screen .group-row .section-title-actions {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    html.ledger-workspace-v1 .groups-overview-screen .group-row button {
      width: 100% !important;
    }

    html.ledger-workspace-v1 .people-management-entry {
      min-height: 76px !important;
      padding: 14px !important;
    }

    html.ledger-workspace-v1 .people-management-count {
      max-width: 88px !important;
    }

    html.ledger-workspace-v1 .group-workflow-screen > :is(
      .group-create-panel,
      .edit-group-panel
    ) {
      padding: 18px 16px !important;
    }
  }

  /* Mobile-first 2026 home experience, adapted from the approved visual reference. */
  html.ledger-workspace-v1 {
    --ledger-canvas: #f8fafc;
    --ledger-canvas-deep: #eef3f4;
    --ledger-surface: #ffffff;
    --ledger-surface-soft: #f3f7f6;
    --ledger-ink: #0c1b20;
    --ledger-muted: #5f706b;
    --ledger-faint: #64748b;
    --ledger-line: rgba(12, 27, 32, 0.085);
    --ledger-line-strong: rgba(12, 27, 32, 0.14);
    --ledger-brand: #0b4a38;
    --ledger-brand-hover: #073b2d;
    --ledger-accent: #16a899;
    --ledger-accent-soft: #e6f3f0;
    --ledger-positive: #10b981;
    --ledger-negative: #fb7185;
  }

  html.ledger-workspace-v1 body,
  html.ledger-workspace-v1 button,
  html.ledger-workspace-v1 input,
  html.ledger-workspace-v1 select,
  html.ledger-workspace-v1 textarea {
    font-family: var(--font-hebrew) !important;
  }

  html.ledger-workspace-v1 body {
    background:
      linear-gradient(180deg, #f9fbfc 0%, #f5f8f8 52%, #eef4f2 100%) !important;
  }

  html.ledger-workspace-v1 .font-num,
  html.ledger-workspace-v1 .currency-input-badge {
    font-family: var(--font-num) !important;
    font-weight: 900 !important;
  }

  html.ledger-workspace-v1 .screen {
    width: min(100%, 448px) !important;
    max-width: 448px !important;
    margin-inline: auto !important;
    padding-inline: 20px !important;
    padding-bottom: calc(140px + env(safe-area-inset-bottom)) !important;
  }

  /* Keep the final event row scrollable above both fixed bottom controls. */
  html.ledger-workspace-v1 .screen.event-has-action-dock {
    padding-bottom: calc(228px + env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1 .product-app-identity {
    width: 100% !important;
    min-height: calc(70px + env(safe-area-inset-top)) !important;
    margin: 0 !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding:
      calc(12px + env(safe-area-inset-top))
      2px
      10px !important;
    border: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .product-brand-lockup {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 11px !important;
  }

  html.ledger-workspace-v1 .product-header-profile-avatar {
    width: 44px !important;
    min-width: 44px !important;
    height: 44px !important;
    border: 2px solid rgba(255, 255, 255, 0.98) !important;
    border-radius: 50% !important;
    background: var(--ledger-soft) !important;
    box-shadow:
      0 0 0 1px rgba(11, 74, 56, 0.08),
      0 8px 20px rgba(11, 74, 56, 0.16) !important;
  }

  html.ledger-workspace-v1 .product-header-profile-avatar > img {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
  }

  html.ledger-workspace-v1
    .screen[data-screen-kind="home"]
    .product-app-identity
    .product-brand-mark,
  html.ledger-workspace-v1.product-v1
    .screen[data-screen-kind="home"]
    .product-app-identity
    .product-brand-mark,
  html.ledger-workspace-v1.product-v1-live
    .screen[data-screen-kind="home"]
    .product-app-identity
    .product-brand-mark {
    width: 42px !important;
    min-width: 42px !important;
    height: 42px !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 12px !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1
    .screen[data-screen-kind="home"]
    .product-app-identity
    .product-brand-mark
    .product-brand-image {
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    border-radius: 12px !important;
    object-fit: contain !important;
    outline: 0 !important;
    filter: drop-shadow(0 5px 7px rgba(11, 74, 56, 0.22)) !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .product-brand-copy strong {
    color: var(--ledger-ink) !important;
    font-size: 18px !important;
    font-weight: 850 !important;
    line-height: 1.08 !important;
  }

  html.ledger-workspace-v1 .product-brand-copy small {
    max-width: 150px !important;
    display: block !important;
    overflow: hidden !important;
    color: var(--ledger-faint) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    line-height: 1.25 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1
    .product-app-identity.is-profile-first-context
    .product-brand-copy {
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 1px !important;
  }

  html.ledger-workspace-v1
    .product-app-identity.is-profile-first-context
    .product-brand-copy
    small {
    order: -1 !important;
    display: block !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top,
  html.ledger-workspace-v1.product-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top,
  html.ledger-workspace-v1.product-v1.circle-design-v1
    .screen.product-empty-home[data-screen-kind="home"]
    > .top {
    position: relative !important;
    isolation: isolate !important;
    min-height: 180px !important;
    display: block !important;
    overflow: visible !important;
    margin: 14px 0 46px !important;
    padding: 27px 30px 34px !important;
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    border-radius: 24px !important;
    color: #ffffff !important;
    background:
      linear-gradient(136deg, #071f18 0%, #0b4a38 58%, #0f6b50 100%),
      #0b4a38 !important;
    box-shadow:
      0 28px 62px -30px rgba(6, 54, 40, 0.78),
      0 18px 40px -24px rgba(6, 78, 59, 0.62),
      inset 0 1px 0 rgba(255, 255, 255, 0.14) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top::before {
    content: "" !important;
    position: absolute !important;
    inset: 0 !important;
    z-index: -1 !important;
    display: block !important;
    border-radius: inherit !important;
    background:
      linear-gradient(118deg, rgba(255, 255, 255, 0.12), transparent 36%),
      linear-gradient(315deg, rgba(52, 211, 153, 0.15), transparent 54%) !important;
    opacity: 0.82 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top::after,
  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top::after,
  html.ledger-workspace-v1.product-v1.circle-design-v1
    .screen.product-empty-home[data-screen-kind="home"]
    > .top::after {
    content: "" !important;
    position: absolute !important;
    inset: 0 !important;
    z-index: 0 !important;
    width: auto !important;
    height: auto !important;
    display: block !important;
    border-radius: inherit !important;
    background:
      linear-gradient(
        110deg,
        transparent 28%,
        rgba(95, 231, 204, 0.08) 39%,
        rgba(255, 255, 255, 0.34) 48%,
        rgba(124, 242, 218, 0.14) 56%,
        transparent 68%
      ) 140% 0 / 220% 100% no-repeat !important;
    clip-path: inset(0 round 24px) !important;
    pointer-events: none !important;
    opacity: 0.18 !important;
    transform: none !important;
    animation: ledger-home-shimmer 6.4s cubic-bezier(0.22, 1, 0.36, 1) 1.1s infinite !important;
  }

  @keyframes ledger-home-shimmer {
    0%,
    12% {
      background-position: 140% 0;
      opacity: 0.18;
    }
    18% {
      opacity: 0.82;
    }
    42% {
      background-position: -140% 0;
      opacity: 0.28;
    }
    100% {
      background-position: -140% 0;
      opacity: 0.18;
    }
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top .brand {
    position: relative !important;
    z-index: 1 !important;
    width: min(100%, 470px) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top .eyebrow {
    display: none !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top h1 {
    max-width: 11ch !important;
    margin: 0 !important;
    color: #ffffff !important;
    font-size: 36px !important;
    font-weight: 900 !important;
    line-height: 1.04 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top .muted {
    max-width: 36ch !important;
    display: block !important;
    margin: 13px 0 0 !important;
    color: rgba(240, 255, 250, 0.62) !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    line-height: 1.55 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top .hero-actions,
  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions,
  html.ledger-workspace-v1.product-v1.circle-design-v1
    .screen.product-empty-home[data-screen-kind="home"]
    > .top
    .hero-actions {
    position: absolute !important;
    inset-inline: 0 !important;
    inset-block-end: -27px !important;
    z-index: 3 !important;
    width: 100% !important;
    display: flex !important;
    grid-template-columns: none !important;
    justify-content: center !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1
    .screen[data-screen-kind="home"]
    .product-route-controls
    > .app-back-button:disabled {
    display: inline-grid !important;
  }

  html.ledger-workspace-v1.product-v1
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions
    .primary-button,
  html.ledger-workspace-v1.product-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions
    .primary-button {
    width: auto !important;
    min-width: 164px !important;
    min-height: 56px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 9px !important;
    padding: 0 28px !important;
    border: 1px solid rgba(7, 31, 24, 0.1) !important;
    border-radius: 999px !important;
    color: #0a3e30 !important;
    background: #ffffff !important;
    box-shadow:
      0 20px 42px -16px rgba(6, 30, 22, 0.76),
      0 11px 28px -10px rgba(16, 185, 129, 0.58),
      inset 0 1px 0 #ffffff !important;
    font-size: 15px !important;
    font-weight: 850 !important;
  }

  html.ledger-workspace-v1.product-v1
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions
    .primary-button:hover:not(:disabled),
  html.ledger-workspace-v1.product-v1.circle-design-v1
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions
    .primary-button:hover:not(:disabled) {
    color: #062f25 !important;
    background: #ffffff !important;
    box-shadow:
      0 24px 44px -18px rgba(6, 30, 22, 0.72),
      0 14px 30px -12px rgba(16, 185, 129, 0.62) !important;
    transform: translateY(-2px) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .hero-actions .button-action-icon {
    width: 20px !important;
    height: 20px !important;
    display: inline-grid !important;
    place-items: center !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .hero-actions .button-action-icon svg {
    width: 20px !important;
    height: 20px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 2 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.ledger-workspace-v1 .home-event-tools,
  html.ledger-workspace-v1 .home-event-tools.is-single {
    width: 100% !important;
    min-height: 78px !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 0 !important;
    margin: 0 0 34px !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 18px !important;
    background: rgba(255, 255, 255, 0.46) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
  }

  html.ledger-workspace-v1 .home-event-tools .secondary-button,
  html.ledger-workspace-v1 .home-event-tools .home-groups-button {
    min-width: 0 !important;
    min-height: 78px !important;
    display: flex !important;
    grid-template-columns: none !important;
    grid-template-rows: none !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 7px !important;
    padding: 12px !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: #273c38 !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .home-event-tools .secondary-button:first-child {
    border-inline-end: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .home-event-tools .secondary-button:hover:not(:disabled) {
    color: var(--ledger-brand) !important;
    background: rgba(230, 243, 240, 0.76) !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 .home-event-tools .button-action-icon {
    width: 22px !important;
    height: 22px !important;
    display: inline-grid !important;
    place-items: center !important;
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .home-event-tools .button-action-icon svg {
    width: 21px !important;
    height: 21px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.8 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.ledger-workspace-v1 .home-event-tools .secondary-button > span:not(.button-action-icon),
  html.ledger-workspace-v1 .home-event-tools .home-groups-button > span:not(.button-action-icon) {
    align-self: auto !important;
    color: inherit !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .section {
    width: 100% !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .section-title-row {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    align-items: stretch !important;
    gap: 12px !important;
    margin: 0 0 6px !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .section-title-row > div:first-child {
    min-width: 0 !important;
    display: flex !important;
    align-items: baseline !important;
    justify-content: space-between !important;
    gap: 16px !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .section-title-row h2 {
    color: var(--ledger-ink) !important;
    font-size: 20px !important;
    font-weight: 850 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .section-title-row .muted {
    margin: 0 !important;
    color: var(--ledger-faint) !important;
    font-size: 11.5px !important;
    font-weight: 600 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .segmented-control {
    min-height: 40px !important;
    display: flex !important;
    justify-content: flex-start !important;
    gap: 4px !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .segmented-control button {
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 5px !important;
    padding: 0 14px !important;
    border: 0 !important;
    border-radius: 999px !important;
    color: var(--ledger-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 12.5px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .segmented-control button.is-active {
    border: 0 !important;
    color: var(--ledger-brand) !important;
    background: rgba(11, 74, 56, 0.09) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .segmented-control button .font-num {
    min-width: 0 !important;
    height: auto !important;
    display: inline !important;
    padding: 0 !important;
    border-radius: 0 !important;
    color: inherit !important;
    background: transparent !important;
    font-size: inherit !important;
  }

  html.ledger-workspace-v1 .event-list {
    display: grid !important;
    gap: 0 !important;
    overflow: visible !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-row,
  html.ledger-workspace-v1 .event-row:hover {
    min-height: 80px !important;
    position: relative !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    align-items: stretch !important;
    gap: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
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

  html.ledger-workspace-v1 .event-row-open {
    min-width: 0 !important;
    min-height: 79px !important;
    display: grid !important;
    direction: rtl !important;
    grid-template-columns: 88px minmax(0, 1fr) 82px !important;
    align-items: center !important;
    column-gap: 12px !important;
    padding: 12px 4px 12px 8px !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: inherit !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .event-row-open:hover {
    background: rgba(255, 255, 255, 0.44) !important;
  }

  html.ledger-workspace-v1 .event-row-open:active {
    transform: scale(0.99) !important;
  }

  html.ledger-workspace-v1 .event-row .avatar-stack {
    grid-column: 1 !important;
    width: 88px !important;
    min-width: 88px !important;
    display: flex !important;
    direction: rtl !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: flex-start !important;
    padding-inline-start: 0 !important;
    isolation: isolate !important;
  }

  html.ledger-workspace-v1 .event-row .avatar-stack .avatar {
    width: 30px !important;
    min-width: 30px !important;
    height: 30px !important;
    display: inline-grid !important;
    place-items: center !important;
    margin-inline-start: -11px !important;
    border-width: 2px !important;
    border-color: var(--ledger-canvas) !important;
    border-radius: 50% !important;
    box-shadow: 0 5px 12px rgba(12, 27, 32, 0.1) !important;
    font-size: 10.5px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .event-row .avatar-stack .avatar:first-child {
    margin-inline-start: 0 !important;
  }

  html.ledger-workspace-v1 .event-row .avatar.is-account::after {
    width: 7px !important;
    height: 7px !important;
    border-width: 1.5px !important;
  }

  html.ledger-workspace-v1 .event-row-main {
    grid-column: 2 !important;
    min-width: 0 !important;
    display: grid !important;
    gap: 5px !important;
    overflow: hidden !important;
  }

  html.ledger-workspace-v1 .event-row-title {
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    gap: 7px !important;
  }

  html.ledger-workspace-v1 .event-row-title strong {
    min-width: 0 !important;
    overflow: hidden !important;
    color: var(--ledger-ink) !important;
    font-size: 16px !important;
    font-weight: 800 !important;
    line-height: 1.25 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  @keyframes ledger-dot-breathe {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.62;
      transform: scale(0.86);
    }
  }

  html.ledger-workspace-v1 .event-row .opened-at {
    overflow: hidden !important;
    color: var(--ledger-muted) !important;
    font-family: var(--font-hebrew) !important;
    font-size: 11.5px !important;
    font-weight: 550 !important;
    line-height: 1.35 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-status-toggle {
    position: absolute !important;
    inset-inline-end: 2px !important;
    inset-block-start: 50% !important;
    inset-block-end: auto !important;
    z-index: 2 !important;
    width: 86px !important;
    min-width: 86px !important;
    min-height: 44px !important;
    margin: 0 !important;
    padding: 0 7px !important;
    border: 0 !important;
    border-radius: 8px !important;
    color: var(--ledger-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 11.5px !important;
    font-weight: 650 !important;
    text-align: center !important;
    transform: translateY(-50%) !important;
  }

  html.ledger-workspace-v1 .event-status-toggle.status-chip:is(.is-open, .is-locked) {
    color: var(--ledger-muted) !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .event-status-toggle:hover:not(:disabled) {
    color: var(--ledger-brand) !important;
    background: rgba(11, 74, 56, 0.06) !important;
  }

  html.ledger-workspace-v1 .event-status-toggle:disabled {
    color: var(--ledger-faint) !important;
    background: transparent !important;
    opacity: 0.72 !important;
  }

  html.ledger-workspace-v1 .product-app-nav {
    position: fixed !important;
    inset-inline-start: auto !important;
    inset-block-end: max(14px, env(safe-area-inset-bottom)) !important;
    left: 50% !important;
    right: auto !important;
    z-index: 120 !important;
    width: min(360px, calc(100% - 24px)) !important;
    min-height: 64px !important;
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 2px !important;
    margin: 0 !important;
    padding: 6px 8px !important;
    border: 1px solid rgba(255, 255, 255, 0.82) !important;
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.94) !important;
    box-shadow:
      0 24px 54px -24px rgba(15, 23, 42, 0.46),
      0 10px 24px -16px rgba(15, 23, 42, 0.28),
      inset 0 1px 0 #ffffff !important;
    transform: translateX(-50%) !important;
  }

  html.ledger-workspace-v1 .product-nav-button {
    position: relative !important;
    min-height: 50px !important;
    display: grid !important;
    place-items: center !important;
    align-content: center !important;
    gap: 2px !important;
    padding: 4px !important;
    border: 0 !important;
    border-radius: 999px !important;
    color: #91a0aa !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 10.5px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .product-nav-button svg {
    width: 20px !important;
    height: 20px !important;
  }

  html.ledger-workspace-v1 .product-nav-button:hover,
  html.ledger-workspace-v1 .product-nav-button.is-active,
  html.ledger-workspace-v1 .product-nav-button[aria-current="page"] {
    color: var(--ledger-brand) !important;
    background: transparent !important;
    box-shadow: none !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 .product-nav-button:is(.is-active, [aria-current="page"])::after {
    content: "" !important;
    position: absolute !important;
    inset-block-end: 2px !important;
    width: 5px !important;
    height: 5px !important;
    border-radius: 50% !important;
    background: var(--ledger-positive) !important;
  }

  html.ledger-workspace-v1 input,
  html.ledger-workspace-v1 select,
  html.ledger-workspace-v1 textarea {
    border-color: var(--ledger-line-strong) !important;
    border-radius: 12px !important;
    background: #ffffff !important;
    box-shadow: inset 0 1px 0 rgba(12, 27, 32, 0.02) !important;
  }

  html.ledger-workspace-v1 input:hover:not(:disabled),
  html.ledger-workspace-v1 select:hover:not(:disabled),
  html.ledger-workspace-v1 textarea:hover:not(:disabled) {
    border-color: rgba(11, 74, 56, 0.28) !important;
  }

  html.ledger-workspace-v1 input:focus,
  html.ledger-workspace-v1 select:focus,
  html.ledger-workspace-v1 textarea:focus {
    border-color: rgba(22, 168, 153, 0.72) !important;
    box-shadow: 0 0 0 3px rgba(22, 168, 153, 0.13) !important;
  }

  /* The approved home language now governs every focused product screen. */
  html.ledger-workspace-v1 {
    --ledger-radius: 20px;
    --ledger-control-radius: 14px;
    --ledger-shadow-border:
      0 0 0 1px rgba(12, 27, 32, 0.06),
      0 10px 30px -24px rgba(12, 27, 32, 0.34),
      0 2px 8px rgba(12, 27, 32, 0.035);
    --ledger-shadow-border-hover:
      0 0 0 1px rgba(11, 74, 56, 0.13),
      0 18px 34px -24px rgba(11, 74, 56, 0.34),
      0 4px 12px rgba(12, 27, 32, 0.05);
    --ledger-shadow-control:
      0 0 0 1px rgba(12, 27, 32, 0.07),
      0 8px 20px -16px rgba(12, 27, 32, 0.28);
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top {
    position: relative !important;
    isolation: isolate !important;
    min-height: 176px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    align-content: end !important;
    align-items: end !important;
    gap: 22px !important;
    grid-template-areas:
      "brand"
      "actions" !important;
    margin: 14px 0 24px !important;
    padding: 28px 26px 25px !important;
    overflow: hidden !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    border-radius: 24px !important;
    color: #ffffff !important;
    background:
      linear-gradient(136deg, #071f18 0%, #0b4a38 58%, #0f6b50 100%),
      #0b4a38 !important;
    box-shadow:
      0 28px 62px -34px rgba(6, 54, 40, 0.78),
      0 15px 32px -25px rgba(6, 78, 59, 0.58),
      inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top::before {
    content: "" !important;
    position: absolute !important;
    inset: 0 !important;
    z-index: -1 !important;
    display: block !important;
    border-radius: inherit !important;
    background:
      linear-gradient(118deg, rgba(255, 255, 255, 0.12), transparent 38%),
      linear-gradient(315deg, rgba(45, 212, 191, 0.14), transparent 54%) !important;
    opacity: 0.78 !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .brand,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .brand {
    position: relative !important;
    z-index: 1 !important;
    width: 100% !important;
    max-width: none !important;
    padding: 0 !important;
    grid-area: brand !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    h1,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    h1 {
    max-width: 18ch !important;
    margin: 0 !important;
    color: #ffffff !important;
    font-size: 32px !important;
    font-weight: 900 !important;
    line-height: 1.08 !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .eyebrow,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .eyebrow {
    margin: 0 0 7px !important;
    color: #8de3cf !important;
    font-size: 12px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .muted,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .muted {
    max-width: 38ch !important;
    margin: 10px 0 0 !important;
    color: rgba(240, 255, 250, 0.7) !important;
    font-size: 13px !important;
    font-weight: 520 !important;
    line-height: 1.55 !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .opened-at {
    margin-top: 8px !important;
    color: rgba(240, 255, 250, 0.54) !important;
    font-family: var(--font-hebrew) !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .hero-actions {
    position: relative !important;
    z-index: 1 !important;
    width: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    flex-wrap: wrap !important;
    gap: 9px !important;
    margin: 0 !important;
    grid-area: actions !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .hero-actions
    :is(.primary-button, .secondary-button) {
    min-height: 48px !important;
    border-color: rgba(255, 255, 255, 0.18) !important;
    border-radius: 14px !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow:
      0 14px 26px -18px rgba(1, 24, 18, 0.8),
      inset 0 1px 0 #ffffff !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .hero-actions
    :is(.primary-button, .secondary-button):hover:not(:disabled) {
    color: #062f25 !important;
    background: #f4fffb !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions {
    justify-content: flex-start !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions
    .event-header-utility-button {
    width: 48px !important;
    min-width: 48px !important;
    height: 48px !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-radius: 14px !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow:
      0 14px 26px -18px rgba(1, 24, 18, 0.82),
      inset 0 1px 0 #ffffff !important;
  }

  html.ledger-workspace-v1 .product-brand-mark,
  html.ledger-workspace-v1.product-v1 .product-brand-mark,
  html.ledger-workspace-v1.product-v1-live .product-brand-mark {
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 12px !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .product-brand-mark .product-brand-image {
    width: 100% !important;
    height: 100% !important;
    border-radius: 12px !important;
    object-fit: cover !important;
    outline: 1px solid rgba(0, 0, 0, 0.08) !important;
    outline-offset: -1px !important;
    filter: drop-shadow(0 5px 7px rgba(11, 74, 56, 0.2)) !important;
    transform: scale(1.18) !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"])
    > :is(.panel, .section),
  html.ledger-workspace-v1 .profile-setup-screen > :is(.profile-setup-panel, .backup-panel),
  html.ledger-workspace-v1 .group-workflow-screen > :is(
    .group-create-panel,
    .edit-group-panel,
    .known-participants-panel,
    .merge-participants-panel
  ) {
    border-color: var(--ledger-line) !important;
    border-radius: 20px !important;
    background: rgba(255, 255, 255, 0.94) !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .screen:not([data-screen-kind="home"]) > .section {
    padding: 20px !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"])
    > .section
    > .section-title-row {
    margin-bottom: 16px !important;
  }

  html.ledger-workspace-v1 .section-title-row h2,
  html.ledger-workspace-v1 .settlement-stage-heading h2 {
    font-size: 21px !important;
    font-weight: 850 !important;
    line-height: 1.15 !important;
  }

  html.ledger-workspace-v1 .event-workspace-nav {
    inset-block-start: calc(68px + env(safe-area-inset-top)) !important;
    min-height: 58px !important;
    gap: 5px !important;
    margin: 0 0 20px !important;
    padding: 5px !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 18px !important;
    background: rgba(255, 255, 255, 0.95) !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .event-workspace-tab {
    min-height: 48px !important;
    border: 0 !important;
    border-radius: 13px !important;
    color: var(--ledger-muted) !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .event-workspace-tab:hover:not(:disabled) {
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .event-workspace-tab.is-active,
  html.ledger-workspace-v1 .event-workspace-tab[aria-current="page"] {
    border: 0 !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow:
      0 10px 22px -16px rgba(6, 54, 40, 0.74),
      inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
  }

  html.ledger-workspace-v1 .event-personal-balance {
    min-height: 86px !important;
    margin: 0 0 20px !important;
    padding: 16px 18px !important;
    border: 1px solid rgba(22, 168, 153, 0.22) !important;
    border-radius: 18px !important;
    background:
      linear-gradient(135deg, rgba(230, 243, 240, 0.92), rgba(255, 255, 255, 0.98)),
      #ffffff !important;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.72) inset,
      0 14px 30px -24px rgba(11, 74, 56, 0.4) !important;
  }

  html.ledger-workspace-v1 .event-personal-balance:hover,
  html.ledger-workspace-v1 .event-personal-balance:focus-visible {
    border-color: rgba(22, 168, 153, 0.5) !important;
    background:
      linear-gradient(135deg, rgba(220, 246, 239, 0.98), #ffffff),
      #ffffff !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 .event-personal-balance-value .amount {
    font-size: 24px !important;
  }

  html.ledger-workspace-v1 .event-start-panel {
    padding: 24px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 20px !important;
    background: #ffffff !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .expense-day-group,
  html.ledger-workspace-v1 .event-insight-panel {
    border-color: var(--ledger-line) !important;
    border-radius: 18px !important;
    background: rgba(255, 255, 255, 0.94) !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .expense-row {
    min-width: 0 !important;
    margin: 0 0 10px !important;
    padding: 17px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 16px !important;
    background: #ffffff !important;
    box-shadow:
      0 8px 22px -20px rgba(12, 27, 32, 0.38),
      inset 0 1px 0 rgba(255, 255, 255, 0.86) !important;
  }

  html.ledger-workspace-v1 .expense-row.is-review {
    border-color: rgba(193, 78, 61, 0.32) !important;
    background: color-mix(in srgb, var(--ledger-surface) 92%, #fff0ed) !important;
  }

  html.ledger-workspace-v1 .expense-review-badge {
    width: fit-content !important;
    display: inline-flex !important;
    align-items: center !important;
    min-height: 26px !important;
    margin-top: 5px !important;
    padding: 4px 8px !important;
    border: 1px solid rgba(193, 78, 61, 0.24) !important;
    border-radius: 999px !important;
    color: #9b352a !important;
    background: rgba(255, 240, 237, 0.9) !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .transfer-rounding-note {
    margin: 0 !important;
    padding: 8px 10px !important;
    border-radius: 10px !important;
    color: var(--ledger-muted) !important;
    background: var(--ledger-surface-soft) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    line-height: 1.55 !important;
  }

  html.ledger-workspace-v1 .expense-row:hover {
    border-color: rgba(11, 74, 56, 0.18) !important;
    box-shadow: var(--ledger-shadow-border-hover) !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 .expense-actions :is(.secondary-button, .danger-button) {
    min-width: 44px !important;
    min-height: 44px !important;
    border-radius: 12px !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .expense-participants-details {
    grid-column: 1 / -1 !important;
    min-width: 0 !important;
    margin-top: 2px !important;
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .expense-participants-details > summary {
    min-height: 46px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto auto !important;
    align-items: center !important;
    gap: 10px !important;
    padding-top: 8px !important;
    cursor: pointer !important;
    list-style: none !important;
    color: var(--ledger-brand) !important;
    font-size: 12px !important;
    font-weight: 750 !important;
    user-select: none !important;
  }

  html.ledger-workspace-v1
    .expense-participants-details
    > summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .expense-participants-details > summary::after {
    content: "+" !important;
    width: 24px !important;
    height: 24px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 50% !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    font-size: 17px !important;
    font-weight: 500 !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1
    .expense-participants-details[open]
    > summary::after {
    content: "−" !important;
  }

  html.ledger-workspace-v1
    .expense-participants-details
    > summary:focus-visible {
    outline: 3px solid rgba(22, 168, 153, 0.18) !important;
    outline-offset: 3px !important;
  }

  html.ledger-workspace-v1 .expense-participants-count {
    min-width: 26px !important;
    height: 26px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 50% !important;
    color: var(--ledger-muted) !important;
    background: var(--ledger-surface-soft) !important;
    font-family: var(--font-num) !important;
    font-size: 11px !important;
    font-weight: 800 !important;
    font-variant-numeric: tabular-nums;
  }

  html.ledger-workspace-v1 .expense-participants-list {
    display: grid !important;
    padding-top: 2px !important;
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .expense-participants-list-title {
    margin: 0 !important;
    padding: 12px 4px 8px !important;
    color: var(--ledger-muted) !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    line-height: 1.4 !important;
  }

  html.ledger-workspace-v1 .expense-participant-item {
    min-width: 0 !important;
    min-height: 54px !important;
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 9px 4px !important;
    border-bottom: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .expense-participant-item:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .expense-participant-item.is-current {
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .expense-participant-item .avatar {
    width: 34px !important;
    min-width: 34px !important;
    height: 34px !important;
  }

  html.ledger-workspace-v1 .expense-participant-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .expense-participant-copy > strong {
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
    color: var(--ledger-ink) !important;
    font-size: 12.5px !important;
  }

  html.ledger-workspace-v1 .expense-participant-meta {
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    flex-wrap: wrap !important;
    gap: 5px !important;
  }

  html.ledger-workspace-v1 .expense-participant-you {
    color: var(--ledger-brand) !important;
    font-size: 10px !important;
    font-weight: 750 !important;
  }

  html.ledger-workspace-v1
    .expense-participant-meta
    .participant-connection-badge {
    overflow: visible !important;
    font-size: 10px !important;
    text-overflow: clip !important;
    white-space: normal !important;
  }

  html.ledger-workspace-v1 .event-action-dock {
    inset-inline: auto !important;
    inset-block-end: calc(max(14px, env(safe-area-inset-bottom)) + 76px) !important;
    left: 50% !important;
    right: auto !important;
    z-index: 110 !important;
    width: min(420px, calc(100% - 24px)) !important;
    min-height: 78px !important;
    gap: 14px !important;
    padding: 11px 12px 11px 16px !important;
    border: 1px solid rgba(255, 255, 255, 0.84) !important;
    border-radius: 22px !important;
    background: rgba(255, 255, 255, 0.97) !important;
    box-shadow:
      0 24px 54px -24px rgba(15, 23, 42, 0.46),
      0 10px 24px -16px rgba(15, 23, 42, 0.24),
      inset 0 1px 0 #ffffff !important;
    transform: translateX(-50%) !important;
  }

  html.ledger-workspace-v1 .event-action-dock .primary-button {
    min-width: 158px !important;
    border-radius: 16px !important;
  }

  html.ledger-workspace-v1 .event-action-total {
    min-width: 0 !important;
  }

  html.ledger-workspace-v1 .event-action-total > span:first-child,
  html.ledger-workspace-v1 .event-action-sync {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .event-action-total .amount {
    color: var(--ledger-brand) !important;
    font-variant-numeric: tabular-nums;
  }

  html.ledger-workspace-v1 .event-action-sync.is-sync-offline,
  html.ledger-workspace-v1 .event-action-sync.is-sync-conflict {
    color: var(--ledger-warning) !important;
  }

  html.ledger-workspace-v1 .expense-modal-backdrop,
  html.ledger-workspace-v1 .event-modal-backdrop,
  html.ledger-workspace-v1 .important-action-dialog-backdrop {
    background: rgba(4, 24, 19, 0.64) !important;
  }

  html.ledger-workspace-v1 .expense-modal,
  html.ledger-workspace-v1 .event-modal,
  html.ledger-workspace-v1 .important-action-dialog {
    padding: 0 !important;
    border: 1px solid rgba(255, 255, 255, 0.72) !important;
    border-radius: 24px !important;
    background: var(--ledger-canvas) !important;
    box-shadow:
      0 36px 90px -28px rgba(2, 23, 17, 0.68),
      inset 0 1px 0 rgba(255, 255, 255, 0.78) !important;
  }

  html.ledger-workspace-v1 .expense-modal,
  html.ledger-workspace-v1 .event-modal {
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain !important;
    -webkit-overflow-scrolling: touch;
  }

  html.ledger-workspace-v1 .important-action-dialog {
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain !important;
  }

  html.ledger-workspace-v1 .important-action-copy {
    gap: 11px !important;
    padding: 24px 24px 0 !important;
  }

  html.ledger-workspace-v1 .important-action-dialog-actions {
    margin: 0 !important;
    padding: 20px 24px 24px !important;
  }

  html.ledger-workspace-v1 .important-action-impact {
    gap: 8px !important;
    margin-block-start: 5px !important;
  }

  html.ledger-workspace-v1 .important-action-impact > div {
    padding: 11px 8px !important;
    border-color: var(--ledger-line) !important;
    border-radius: 12px !important;
    background: #ffffff !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .important-action-impact dt {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .important-action-impact dd {
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1
    .important-action-dialog[data-important-action-kind="merge-participants"]
    .important-action-label {
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1
    .important-action-dialog[data-important-action-kind="merge-participants"]
    .important-action-confirm-button {
    border-color: var(--ledger-brand) !important;
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .expense-modal-header,
  html.ledger-workspace-v1 .event-modal-header {
    inset-block-start: 0 !important;
    margin: 0 !important;
    padding: 21px 22px !important;
    border: 0 !important;
    color: #ffffff !important;
    background:
      linear-gradient(136deg, #071f18 0%, #0b4a38 64%, #0f6b50 100%),
      #0b4a38 !important;
    box-shadow: 0 14px 30px -24px rgba(6, 54, 40, 0.74) !important;
  }

  html.ledger-workspace-v1 .expense-modal-header h2,
  html.ledger-workspace-v1 .event-modal-header h2 {
    color: #ffffff !important;
    font-size: 25px !important;
    font-weight: 880 !important;
  }

  html.ledger-workspace-v1 .expense-modal-header .eyebrow,
  html.ledger-workspace-v1 .event-modal-header .eyebrow {
    color: #8de3cf !important;
  }

  html.ledger-workspace-v1 .expense-modal-header .muted,
  html.ledger-workspace-v1 .event-modal-header .muted {
    color: rgba(240, 255, 250, 0.7) !important;
  }

  html.ledger-workspace-v1
    :is(.expense-modal-header, .event-modal-header)
    :is(.icon-button, .modal-close-button, .modal-section-back-button) {
    border-color: rgba(255, 255, 255, 0.2) !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow: 0 10px 22px -16px rgba(1, 24, 18, 0.8) !important;
  }

  html.ledger-workspace-v1 .expense-total-field {
    margin: 18px 20px 12px !important;
    padding: 17px !important;
    border: 1px solid rgba(22, 168, 153, 0.18) !important;
    border-radius: 18px !important;
    background:
      linear-gradient(135deg, rgba(230, 243, 240, 0.95), #ffffff),
      #ffffff !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .expense-total-field input {
    min-height: 66px !important;
    border-color: rgba(22, 168, 153, 0.22) !important;
    border-radius: 14px !important;
    font-family: var(--font-num) !important;
    font-size: 30px !important;
    font-weight: 900 !important;
  }

  html.ledger-workspace-v1 .expense-template-grid {
    gap: 8px !important;
    padding: 2px 20px 8px !important;
    scroll-padding-inline: 20px !important;
    -webkit-mask-image: none !important;
    mask-image: none !important;
  }

  html.ledger-workspace-v1 .expense-template-grid .secondary-button {
    min-height: 44px !important;
    border-color: var(--ledger-line) !important;
    border-radius: 999px !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .expense-template-grid .secondary-button.is-active {
    border-color: var(--ledger-brand) !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .expense-details-panel,
  html.ledger-workspace-v1 .quick-expense-guest-details,
  html.ledger-workspace-v1 .expense-guest-box,
  html.ledger-workspace-v1 .quick-items-section,
  html.ledger-workspace-v1 .quick-split-summary {
    margin-inline: 20px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 18px !important;
    background: #ffffff !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .quick-split-summary {
    border-color: transparent !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow: 0 14px 30px rgba(7, 49, 39, 0.14) !important;
  }

  html.ledger-workspace-v1 .expense-mode-switch,
  html.ledger-workspace-v1 .quick-purpose-switch {
    margin-inline: 20px !important;
    padding: 5px !important;
    border-radius: 16px !important;
    background: #e9f0ee !important;
  }

  html.ledger-workspace-v1 .expense-mode-switch button,
  html.ledger-workspace-v1 .quick-purpose-switch button {
    border-radius: 12px !important;
  }

  html.ledger-workspace-v1 .expense-mode-switch button.is-active,
  html.ledger-workspace-v1 .quick-purpose-switch button.is-active {
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow:
      0 8px 18px -15px rgba(12, 27, 32, 0.42),
      inset 0 1px 0 #ffffff !important;
  }

  html.ledger-workspace-v1 .quick-item-row,
  html.ledger-workspace-v1 .payer-row {
    border-color: var(--ledger-line) !important;
    border-radius: 16px !important;
    background: #ffffff !important;
    box-shadow: 0 8px 22px -20px rgba(12, 27, 32, 0.38) !important;
  }

  html.ledger-workspace-v1 .expense-modal-actions {
    gap: 10px !important;
    padding: 14px 20px calc(14px + env(safe-area-inset-bottom)) !important;
    border-top: 1px solid var(--ledger-line) !important;
    background: rgba(255, 255, 255, 0.98) !important;
    box-shadow: 0 -16px 34px -28px rgba(12, 27, 32, 0.48) !important;
  }

  html.ledger-workspace-v1 .expense-modal-actions :is(.primary-button, .secondary-button) {
    min-height: 52px !important;
    border-radius: 15px !important;
  }

  html.ledger-workspace-v1 .create-event-panel,
  html.ledger-workspace-v1 .join-event-panel,
  html.ledger-workspace-v1 .group-create-panel,
  html.ledger-workspace-v1 .edit-group-panel,
  html.ledger-workspace-v1 .known-participants-panel,
  html.ledger-workspace-v1 .merge-participants-panel,
  html.ledger-workspace-v1 .profile-setup-panel,
  html.ledger-workspace-v1 .profile-panel,
  html.ledger-workspace-v1 .backup-panel {
    padding: 22px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 20px !important;
    background: rgba(255, 255, 255, 0.96) !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .event-type-options,
  html.ledger-workspace-v1 .event-management-options {
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .event-type-option,
  html.ledger-workspace-v1 .event-management-option {
    min-height: 92px !important;
    padding: 17px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 17px !important;
    background: #ffffff !important;
    box-shadow: 0 8px 22px -20px rgba(12, 27, 32, 0.4) !important;
  }

  html.ledger-workspace-v1 .event-type-option:hover,
  html.ledger-workspace-v1 .event-management-option:hover:not(:disabled) {
    border-color: rgba(22, 168, 153, 0.42) !important;
    background: #f7fffc !important;
    box-shadow: var(--ledger-shadow-border-hover) !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 .event-type-option:is(.is-active, [aria-checked="true"]),
  html.ledger-workspace-v1 .event-management-option:is(.is-active, [aria-checked="true"]) {
    border-color: rgba(22, 168, 153, 0.56) !important;
    background:
      linear-gradient(135deg, rgba(230, 243, 240, 0.9), #ffffff),
      #ffffff !important;
    box-shadow:
      0 0 0 3px rgba(22, 168, 153, 0.1),
      0 12px 26px -22px rgba(11, 74, 56, 0.48) !important;
  }

  html.ledger-workspace-v1 .event-creation-progress {
    margin: 0 0 16px !important;
    padding: 6px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 16px !important;
    background: rgba(255, 255, 255, 0.82) !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .new-event-participants {
    border: 1px solid var(--ledger-line) !important;
    border-radius: 17px !important;
    background: #ffffff !important;
    box-shadow: 0 8px 22px -20px rgba(12, 27, 32, 0.36) !important;
  }

  html.ledger-workspace-v1 .groups-list-section .stack {
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .groups-overview-screen .group-row,
  html.ledger-workspace-v1 .known-participant-row {
    padding: 17px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 17px !important;
    background: #ffffff !important;
    box-shadow: 0 8px 22px -20px rgba(12, 27, 32, 0.38) !important;
  }

  html.ledger-workspace-v1 .groups-overview-screen .group-row:hover,
  html.ledger-workspace-v1 .known-participant-row:hover {
    border-color: rgba(11, 74, 56, 0.16) !important;
    box-shadow: var(--ledger-shadow-border-hover) !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 .people-management-entry {
    border: 1px solid var(--ledger-line) !important;
    border-radius: 18px !important;
    background:
      linear-gradient(135deg, rgba(230, 243, 240, 0.72), #ffffff),
      #ffffff !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .participant-invite-entry,
  html.ledger-workspace-v1 .participant-identity-group,
  html.ledger-workspace-v1 .participant-identity-review,
  html.ledger-workspace-v1 .participant-aliases {
    border-color: var(--ledger-line) !important;
    border-radius: 17px !important;
    background: #ffffff !important;
    box-shadow: 0 8px 22px -20px rgba(12, 27, 32, 0.34) !important;
  }

  html.ledger-workspace-v1 .participant-pill {
    min-height: 52px !important;
    border-radius: 14px !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .participant-pill.is-account:has(input:checked),
  html.ledger-workspace-v1 .participant-pill.is-offline:has(input:checked) {
    border-color: rgba(22, 168, 153, 0.5) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: 0 0 0 3px rgba(22, 168, 153, 0.09) !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker .participant-grid {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 9px !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker .participant-pill {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 62px !important;
    padding: 9px 12px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 14px !important;
    color: var(--ledger-ink) !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker .participant-pill .avatar {
    width: 44px !important;
    min-width: 44px !important;
    height: 44px !important;
    display: grid !important;
    place-items: center !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker .participant-pill:has(input:checked) {
    border-color: rgba(22, 121, 91, 0.38) !important;
    background: rgba(231, 245, 240, 0.62) !important;
    box-shadow: 0 3px 12px -9px rgba(12, 75, 58, 0.44) !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker .participant-pill:active {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker .participant-identity-group.is-event-creation-group .participant-identity-group-header {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html.ledger-workspace-v1
    .new-event-participant-picker
    .participant-identity-group.is-account
    .participant-identity-group-count {
    color: #53645f !important;
    background: #f0f3f2 !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker .participant-membership-status {
    flex: 0 0 auto !important;
    min-height: 30px !important;
    padding: 5px 8px !important;
    border-radius: 999px !important;
    color: #687572 !important;
    background: #f1f4f3 !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker .participant-membership-status[data-membership-state="active"] {
    color: #344843 !important;
    background: #f0f3f2 !important;
  }

  @media (max-width: 390px) {
    html.ledger-workspace-v1 .new-event-participant-picker .participant-pill {
      padding-inline: 9px !important;
    }

    html.ledger-workspace-v1 .new-event-participant-picker .participant-membership-status {
      padding-inline: 6px !important;
      font-size: 11px !important;
    }
  }

  html.ledger-workspace-v1 .profile-summary {
    padding: 4px !important;
  }

  html.ledger-workspace-v1 .profile-memory-status {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .account-profile-actions {
    gap: 9px !important;
  }

  html.ledger-workspace-v1 .account-danger-zone {
    margin-top: 24px !important;
    padding-top: 20px !important;
    border-top: 1px solid rgba(185, 71, 57, 0.16) !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-screen .settlement-hero,
  html.ledger-workspace-v1 .settlement-stage,
  html.ledger-workspace-v1 .settlement-audit-section {
    border: 1px solid var(--ledger-line) !important;
    border-radius: 20px !important;
    background: rgba(255, 255, 255, 0.96) !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-screen .settlement-hero {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 0 !important;
    margin: 0 0 16px !important;
    padding: 0 !important;
    overflow: hidden !important;
    color: var(--ledger-ink) !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-hero-main {
    min-width: 0 !important;
    display: grid !important;
    align-content: start !important;
    gap: 14px !important;
    padding: 22px !important;
    background:
      linear-gradient(135deg, rgba(230, 243, 240, 0.82), rgba(255, 255, 255, 0.98)),
      #ffffff !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-hero-title-row {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    align-items: start !important;
    gap: 14px !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-hero-title-row h2 {
    margin: 0 0 5px !important;
    color: var(--ledger-ink) !important;
    font-size: 24px !important;
    font-weight: 850 !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-hero-title-row .muted {
    margin: 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    line-height: 1.5 !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-hero-total {
    min-width: 0 !important;
    display: flex !important;
    align-items: end !important;
    justify-content: space-between !important;
    gap: 14px !important;
    padding: 14px 0 0 !important;
    border-inline-start: 0 !important;
    border-top: 1px solid rgba(11, 74, 56, 0.12) !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-hero-total > span {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-hero-total .amount {
    color: var(--ledger-brand) !important;
    font-size: 28px !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-hero-actions {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    align-content: stretch !important;
    gap: 8px !important;
    padding: 15px !important;
    border-top: 1px solid var(--ledger-line) !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-hero-actions
    :is(.primary-button, .secondary-button) {
    width: 100% !important;
    min-height: 46px !important;
    border-color: var(--ledger-line-strong) !important;
    border-radius: 13px !important;
    color: var(--ledger-ink) !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-hero-actions
    .primary-button {
    border-color: var(--ledger-brand) !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-transfer-board,
  html.ledger-workspace-v1 .completed-transfers-list {
    display: grid !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-transfer-board {
    overflow: visible !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .settlement-offline-note {
    display: flex !important;
    align-items: flex-start !important;
    gap: 10px !important;
    padding: 13px 14px !important;
    border: 1px solid rgba(63, 84, 91, 0.14) !important;
    border-radius: 14px !important;
    color: var(--ledger-ink) !important;
    background: rgba(245, 248, 248, 0.96) !important;
  }

  html.ledger-workspace-v1 .settlement-offline-note-icon {
    width: 22px !important;
    height: 22px !important;
    flex: 0 0 22px !important;
    display: inline-grid !important;
    place-items: center !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: 50% !important;
    color: var(--ledger-brand) !important;
    font-family: var(--font-hebrew) !important;
    font-size: 12px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .settlement-offline-note > span:last-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .settlement-offline-note small {
    color: var(--ledger-muted) !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .transfer-participant {
    min-width: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .transfer-participant-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .transfer-participant-copy strong {
    overflow-wrap: anywhere !important;
  }

  html.ledger-workspace-v1 .transfer-participant .participant-connection-badge {
    font-size: 10px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-transfer-board
    .transfer-row,
  html.ledger-workspace-v1.circle-design-v1
    .settlement-transfer-board
    .transfer-row:last-child,
  html.ledger-workspace-v1 .transfer-row {
    min-height: 0 !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 14px !important;
    padding: 17px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 17px !important;
    background: #ffffff !important;
    box-shadow: 0 8px 22px -20px rgba(12, 27, 32, 0.38) !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-transfer-board
    .transfer-row.is-personal,
  html.ledger-workspace-v1 .transfer-row.is-personal {
    border: 1px solid rgba(22, 168, 153, 0.34) !important;
    border-color: rgba(22, 168, 153, 0.34) !important;
    border-radius: 17px !important;
    background:
      linear-gradient(135deg, rgba(230, 243, 240, 0.88), #ffffff),
      #ffffff !important;
    box-shadow:
      0 0 0 3px rgba(22, 168, 153, 0.07),
      0 12px 26px -22px rgba(11, 74, 56, 0.44) !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-transfer-board
    .transfer-row.is-pending:hover {
    border-color: rgba(22, 168, 153, 0.4) !important;
    background: #ffffff !important;
    box-shadow: var(--ledger-shadow-border-hover) !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .transfer-actions {
    width: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .transfer-actions .amount {
    font-variant-numeric: tabular-nums;
  }

  html.ledger-workspace-v1 .settlement-audit-details,
  html.ledger-workspace-v1 .completed-transfers-details,
  html.ledger-workspace-v1 .transfer-explanation {
    border-color: var(--ledger-line) !important;
    border-radius: 16px !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .settlement-complete-state {
    border-color: rgba(22, 168, 153, 0.22) !important;
    border-radius: 20px !important;
    background:
      linear-gradient(135deg, rgba(230, 243, 240, 0.92), #ffffff),
      #ffffff !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .settlement-close-confirmation {
    border-color: rgba(139, 93, 37, 0.22) !important;
    border-radius: 16px !important;
    background: #fffaf2 !important;
    box-shadow: 0 12px 28px -22px rgba(139, 93, 37, 0.42) !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions {
    grid-column: 1 / -1 !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 13px !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions > summary {
    min-height: 44px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding: 0 14px !important;
    cursor: pointer !important;
    list-style: none !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 750 !important;
    user-select: none !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions > summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions > summary::after {
    content: "+" !important;
    color: var(--ledger-brand) !important;
    font-size: 18px !important;
    font-weight: 500 !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions[open] > summary::after {
    content: "−" !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions > summary:focus-visible {
    outline: 3px solid rgba(22, 168, 153, 0.18) !important;
    outline-offset: -3px !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions > div {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
    padding: 0 8px 8px !important;
  }

  html.ledger-workspace-v1 .transfer-card-meta {
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    gap: 7px !important;
  }

  html.ledger-workspace-v1 .group-transfer-badge,
  html.ledger-workspace-v1 .transfer-personal-context,
  html.ledger-workspace-v1 .transfer-status {
    min-height: 24px !important;
    display: inline-flex !important;
    align-items: center !important;
    padding: 3px 8px !important;
    border-radius: 999px !important;
    font-size: 10.5px !important;
    font-weight: 700 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .group-transfer-badge {
    border: 1px solid var(--ledger-line) !important;
    color: var(--ledger-muted) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .transfer-personal-context {
    padding-inline: 0 !important;
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .transfer-status {
    margin-inline-start: auto !important;
    color: var(--ledger-negative) !important;
    background: rgba(255, 241, 238, 0.92) !important;
  }

  html.ledger-workspace-v1 .transfer-status.status-paid {
    color: var(--ledger-positive) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .transfer-people {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .transfer-party {
    min-width: 0 !important;
    display: grid !important;
    gap: 7px !important;
    padding: 12px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 14px !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .transfer-party-label {
    color: var(--ledger-muted) !important;
    font-size: 10px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .transfer-arrow {
    width: auto !important;
    min-width: 34px !important;
    height: 26px !important;
    padding-inline: 8px !important;
    border-radius: 999px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    font-size: 10px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .transfer-actions {
    padding-top: 13px !important;
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .transfer-amount {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .transfer-amount > small {
    color: var(--ledger-muted) !important;
    font-size: 10px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .transfer-amount > .amount {
    color: var(--ledger-ink) !important;
    font-size: 23px !important;
    line-height: 1.05 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .transfer-actions > button {
    min-width: 128px !important;
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1 .screen {
      padding-inline: 14px !important;
    }

    html.ledger-workspace-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top,
    html.ledger-workspace-v1.circle-design-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top {
      min-height: 164px !important;
      gap: 18px !important;
      margin: 12px 0 18px !important;
      padding: 24px 21px 21px !important;
      border-radius: 22px !important;
    }

    html.ledger-workspace-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top
      h1,
    html.ledger-workspace-v1.circle-design-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top
      h1 {
      font-size: 29px !important;
      line-height: 1.1 !important;
    }

    html.ledger-workspace-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top
      .muted {
      font-size: 12.5px !important;
    }

    html.ledger-workspace-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top
      .hero-actions {
      gap: 8px !important;
    }

    html.ledger-workspace-v1 .screen:not([data-screen-kind="home"]) > .section {
      padding: 17px !important;
    }

    html.ledger-workspace-v1 .event-workspace-nav {
      inset-block-start: calc(64px + env(safe-area-inset-top)) !important;
      min-height: 56px !important;
      margin-bottom: 16px !important;
      border-radius: 17px !important;
    }

    html.ledger-workspace-v1 .event-workspace-tab {
      min-height: 46px !important;
      border-radius: 12px !important;
      font-size: 13px !important;
    }

    html.ledger-workspace-v1 .event-personal-balance {
      min-height: 82px !important;
      padding: 15px !important;
    }

    html.ledger-workspace-v1 .event-personal-balance-value .amount {
      font-size: 22px !important;
    }

    html.ledger-workspace-v1 .event-action-dock {
      inset-block-end: calc(max(10px, env(safe-area-inset-bottom)) + 80px) !important;
      width: calc(100% - 20px) !important;
      min-height: 76px !important;
      padding: 9px 10px 9px 14px !important;
      border-radius: 20px !important;
    }

    html.ledger-workspace-v1 .event-action-dock .primary-button {
      min-width: 146px !important;
    }

    html.ledger-workspace-v1 .expense-modal-backdrop,
    html.ledger-workspace-v1 .event-modal-backdrop {
      background: var(--ledger-canvas) !important;
    }

    html.ledger-workspace-v1 .expense-modal,
    html.ledger-workspace-v1 .event-modal {
      border: 0 !important;
      border-radius: 0 !important;
      background: var(--ledger-canvas) !important;
      box-shadow: none !important;
    }

    html.ledger-workspace-v1 .expense-modal-header,
    html.ledger-workspace-v1 .event-modal-header {
      padding:
        calc(17px + env(safe-area-inset-top))
        17px
        17px !important;
    }

    html.ledger-workspace-v1 .expense-modal-header h2,
    html.ledger-workspace-v1 .event-modal-header h2 {
      font-size: 23px !important;
    }

    html.ledger-workspace-v1 .expense-total-field {
      margin-inline: 14px !important;
    }

    html.ledger-workspace-v1 .expense-template-grid {
      padding-inline: 14px !important;
      scroll-padding-inline: 14px !important;
    }

    html.ledger-workspace-v1 .expense-template-grid .secondary-button {
      padding-inline: 8px !important;
    }

    html.ledger-workspace-v1 .expense-details-panel,
    html.ledger-workspace-v1 .quick-expense-guest-details,
    html.ledger-workspace-v1 .expense-guest-box,
    html.ledger-workspace-v1 .quick-items-section,
    html.ledger-workspace-v1 .quick-split-summary,
    html.ledger-workspace-v1 .expense-mode-switch,
    html.ledger-workspace-v1 .quick-purpose-switch {
      margin-inline: 14px !important;
    }

    html.ledger-workspace-v1 .expense-modal-actions {
      padding-inline: 14px !important;
    }

    html.ledger-workspace-v1 .create-event-panel,
    html.ledger-workspace-v1 .join-event-panel,
    html.ledger-workspace-v1 .group-create-panel,
    html.ledger-workspace-v1 .edit-group-panel,
    html.ledger-workspace-v1 .known-participants-panel,
    html.ledger-workspace-v1 .merge-participants-panel,
    html.ledger-workspace-v1 .profile-setup-panel,
    html.ledger-workspace-v1 .profile-panel,
    html.ledger-workspace-v1 .backup-panel {
      padding: 18px !important;
      border-radius: 18px !important;
    }

    html.ledger-workspace-v1 .event-type-option,
    html.ledger-workspace-v1 .event-management-option {
      min-height: 86px !important;
      padding: 15px !important;
      border-radius: 16px !important;
    }

    html.ledger-workspace-v1 .event-management-step-actions .primary-button {
      width: 100% !important;
    }

    html.ledger-workspace-v1 .groups-overview-screen .group-row,
    html.ledger-workspace-v1 .known-participant-row,
    html.ledger-workspace-v1 .transfer-row {
      border-radius: 16px !important;
    }

    html.ledger-workspace-v1.circle-design-v1 .settlement-hero-main {
      gap: 10px !important;
      padding: 16px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-screen
      > .settlement-top {
      min-height: 116px !important;
      margin: 8px 0 12px !important;
      padding: 18px 20px !important;
      border-radius: 20px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-screen
      > .settlement-top
      h1 {
      font-size: 25px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-screen
      > .settlement-top
      .muted {
      margin-top: 5px !important;
      font-size: 11.5px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero-title-row {
      gap: 10px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero-title-row
      h2 {
      font-size: 22px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero-total {
      padding-top: 10px !important;
    }

    html.ledger-workspace-v1.circle-design-v1 .settlement-hero-actions {
      grid-template-columns: minmax(0, 1fr) !important;
      padding: 11px !important;
    }

    /* Surface the first personal transfer in the initial mobile viewport. */
    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending {
      margin-bottom: 0 !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-hero-main {
      gap: 8px !important;
      padding: 12px 14px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-hero-title-row {
      gap: 6px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-hero-total {
      display: none !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-hero-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 7px !important;
      padding: 8px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-hero-actions
      :is(.primary-button, .secondary-button) {
      min-height: 44px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-hero-actions
      > .primary-button {
      grid-column: auto !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-more-actions {
      grid-column: 1 / -1 !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      + .settlement-stage {
      margin-top: 8px !important;
      padding-block: 14px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      + .settlement-stage
      .settlement-stage-heading {
      flex-direction: row !important;
      align-items: center !important;
      gap: 8px !important;
      margin-bottom: 4px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      + .settlement-stage
      .settlement-stage-heading
      > div {
      min-width: 0 !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      + .settlement-stage
      .settlement-progress-chip {
      flex: 0 0 auto !important;
      max-width: 100% !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      + .settlement-stage
      .settlement-stage-heading
      .muted {
      display: none !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      + .settlement-stage
      .settlement-offline-note {
      display: none !important;
    }

    html.ledger-workspace-v1 .settlement-more-actions > div {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    @media (max-width: 360px) {
      html.ledger-workspace-v1.circle-design-v1
        .settlement-hero.is-pending.is-personal-pending
        + .settlement-stage
        .settlement-stage-heading {
        align-items: flex-start !important;
        flex-wrap: wrap !important;
      }
    }

    html.ledger-workspace-v1.circle-design-v1 .transfer-people {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 7px !important;
    }

    html.ledger-workspace-v1.circle-design-v1 .transfer-arrow {
      justify-self: center !important;
      min-width: 46px !important;
    }

    html.ledger-workspace-v1 .transfer-party {
      padding: 11px 12px !important;
    }

    html.ledger-workspace-v1 .transfer-card-meta {
      flex-wrap: wrap !important;
    }

    html.ledger-workspace-v1 .transfer-status {
      margin-inline-start: auto !important;
    }

    html.ledger-workspace-v1 .settlement-offline-note {
      padding: 10px 12px !important;
    }

    html.ledger-workspace-v1 .settlement-offline-note > span:last-child {
      display: flex !important;
      flex-wrap: wrap !important;
      align-items: baseline !important;
      gap: 2px 6px !important;
    }

    html.ledger-workspace-v1.circle-design-v1 .product-app-identity {
      width: 100% !important;
      min-height: calc(64px + env(safe-area-inset-top)) !important;
      margin: 0 !important;
      padding:
        calc(10px + env(safe-area-inset-top))
        0
        8px !important;
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

    html.ledger-workspace-v1 .product-header-profile-avatar {
      width: 44px !important;
      min-width: 44px !important;
      height: 44px !important;
    }

    html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top,
    html.ledger-workspace-v1.product-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top,
    html.ledger-workspace-v1.product-v1.circle-design-v1
      .screen.product-empty-home[data-screen-kind="home"]
      > .top,
    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top {
      min-height: 164px !important;
      display: block !important;
      gap: 0 !important;
      margin: 12px 0 44px !important;
      padding: 24px 22px 32px !important;
      border-radius: 24px !important;
    }

    html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top h1,
    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top
      h1 {
      max-width: 8ch !important;
      font-size: 29px !important;
      line-height: 1.08 !important;
    }

    html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top .muted,
    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top
      .muted {
      max-width: 29ch !important;
      margin-top: 10px !important;
      font-size: 13px !important;
      line-height: 1.5 !important;
    }

    html.ledger-workspace-v1 .home-event-tools,
    html.ledger-workspace-v1 .home-event-tools.is-single {
      margin-bottom: 24px !important;
    }

    html.ledger-workspace-v1 .event-row,
    html.ledger-workspace-v1 .event-row:hover {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .event-row-open {
      grid-template-columns: 82px minmax(0, 1fr) 76px !important;
      column-gap: 10px !important;
      padding-inline: 2px 5px !important;
    }

    html.ledger-workspace-v1 .event-row .avatar-stack {
      width: 82px !important;
      min-width: 82px !important;
    }

    html.ledger-workspace-v1 .event-row .avatar-stack .avatar {
      width: 30px !important;
      min-width: 30px !important;
      height: 30px !important;
      margin-inline-start: -11px !important;
      font-size: 10px !important;
    }

    html.ledger-workspace-v1 .event-row-title strong {
      font-size: 16px !important;
    }

    html.ledger-workspace-v1 .event-status-toggle {
      width: 76px !important;
      min-width: 76px !important;
      padding-inline: 3px !important;
    }
  }

  @media (max-width: 380px) {
    html.ledger-workspace-v1 .screen {
      padding-inline: 12px !important;
    }

    html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top,
    html.ledger-workspace-v1.circle-design-v1
      .screen[data-screen-kind="home"]
      > .top {
      padding-inline: 20px !important;
    }

    html.ledger-workspace-v1 .event-row,
    html.ledger-workspace-v1 .event-row:hover {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .event-row-open {
      grid-template-columns: 74px minmax(0, 1fr) 68px !important;
      column-gap: 7px !important;
    }

    html.ledger-workspace-v1 .event-row .avatar-stack {
      width: 74px !important;
      min-width: 74px !important;
    }

    html.ledger-workspace-v1 .event-row .avatar-stack .avatar {
      width: 28px !important;
      min-width: 28px !important;
      height: 28px !important;
      margin-inline-start: -11px !important;
      font-size: 9px !important;
    }

    html.ledger-workspace-v1 .event-status-toggle {
      width: 68px !important;
      min-width: 68px !important;
      font-size: 11px !important;
    }
  }

  /* Route chrome stays clear of the task: the brand scrolls away, back never gets hidden. */
  html.ledger-workspace-v1.circle-design-v1 .product-app-identity,
  html.ledger-workspace-v1 .product-app-identity {
    position: relative !important;
    inset-block-start: auto !important;
    top: auto !important;
    z-index: 2 !important;
  }

  /* Back is a persistent route control, independent of long-screen scrolling. */
  html.ledger-workspace-v1 .product-route-controls,
  html.ledger-workspace-v1 .product-route-controls[hidden] {
    position: fixed !important;
    inset-block-start: calc(env(safe-area-inset-top) + 10px) !important;
    left: max(12px, calc((100vw - 448px) / 2 + 22px)) !important;
    right: auto !important;
    inset-block-end: auto !important;
    z-index: 70 !important;
    display: inline-flex !important;
  }

  html.ledger-workspace-v1 .product-app-identity > .product-brand-lockup,
  html.ledger-workspace-v1 .product-brand-mark,
  html.ledger-workspace-v1 .product-header-profile-avatar {
    visibility: visible !important;
    opacity: 1 !important;
  }

  html.ledger-workspace-v1 .product-app-identity > .product-brand-lockup {
    display: flex !important;
    margin-left: auto !important;
  }

  html.ledger-workspace-v1 .product-brand-mark,
  html.ledger-workspace-v1 .product-header-profile-avatar {
    display: inline-grid !important;
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1 .product-app-identity {
      padding-left: 112px !important;
    }

    html.ledger-workspace-v1 .product-app-identity > .product-brand-lockup {
      max-width: 100% !important;
      gap: 7px !important;
    }

    html.ledger-workspace-v1 .product-brand-copy {
      min-width: 0 !important;
    }
  }

  html.ledger-workspace-v1
    .product-route-controls
    > .app-back-button:disabled {
    display: inline-grid !important;
    visibility: visible !important;
    pointer-events: none !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"])
    .product-route-controls
    > .app-back-button:not(:disabled) {
    display: inline-grid !important;
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
  }

  html.ledger-workspace-v1 .profile-first-run-screen .product-app-nav,
  html.ledger-workspace-v1
    .profile-first-run-screen
    .product-route-controls
    .app-back-button:disabled {
    display: none !important;
  }

  /* Event utilities stay recognizable without making the event hero noisy. */
  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .hero-actions.event-header-actions {
    width: 100% !important;
    display: flex !important;
    flex-direction: row !important;
    gap: 8px !important;
  }

  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .hero-actions.event-header-actions
    .secondary-button.event-header-utility-button {
    flex: 1 1 0 !important;
    width: auto !important;
    min-width: 0 !important;
    height: 54px !important;
    display: inline-flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 2px !important;
    padding: 5px 4px !important;
  }

  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .hero-actions.event-header-actions
    .secondary-button.event-header-utility-button
    .command-card-icon {
    width: 19px !important;
    min-width: 19px !important;
    height: 19px !important;
  }

  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .hero-actions.event-header-actions
    .secondary-button.event-header-utility-button
    .command-card-icon
    svg {
    width: 19px !important;
    height: 19px !important;
    stroke: currentColor !important;
  }

  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .top
    .hero-actions.event-header-actions
    .secondary-button.event-header-utility-button
    .event-header-action-label {
    position: static !important;
    width: auto !important;
    height: auto !important;
    overflow: visible !important;
    clip: auto !important;
    color: inherit !important;
    font-size: 11px !important;
    font-weight: 750 !important;
    white-space: nowrap !important;
  }

  /* Expenses are the event's default workspace; settlement stays one deliberate step away. */
  html.ledger-workspace-v1 .event-workspace-nav {
    grid-template-columns: minmax(0, 1.22fr) minmax(0, 0.78fr) !important;
    gap: 6px !important;
    padding: 5px !important;
    overflow: visible !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 17px !important;
    background: rgba(251, 253, 252, 0.98) !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .event-workspace-tab {
    min-height: 50px !important;
    border: 0 !important;
    border-radius: 12px !important;
  }

  html.ledger-workspace-v1 .event-workspace-expenses {
    min-width: 0 !important;
    min-height: 56px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 10px !important;
    padding-inline: 14px !important;
    text-decoration: none !important;
  }

  html.ledger-workspace-v1 .event-workspace-expenses .command-card-icon {
    width: 22px !important;
    min-width: 22px !important;
    height: 22px !important;
    display: inline-grid !important;
    place-items: center !important;
    color: currentColor !important;
  }

  html.ledger-workspace-v1 .event-workspace-expenses .command-card-icon svg {
    width: 22px !important;
    height: 22px !important;
    stroke: currentColor !important;
  }

  html.ledger-workspace-v1 .event-workspace-expenses-copy {
    min-width: 0 !important;
    display: grid !important;
    justify-items: start !important;
    gap: 1px !important;
    line-height: 1.12 !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .event-workspace-expenses-copy strong {
    color: inherit !important;
    font-size: 15px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .event-workspace-expenses-copy small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 550 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-workspace-expenses:is(.is-active, [aria-current="page"]) small {
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .event-workspace-tab.is-active,
  html.ledger-workspace-v1 .event-workspace-tab[aria-current="page"] {
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-workspace-summary {
    min-height: 56px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 10px !important;
    padding-inline: 14px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow: 0 1px 2px rgba(2, 31, 27, 0.06) !important;
  }

  html.ledger-workspace-v1 .event-workspace-summary.is-active,
  html.ledger-workspace-v1 .event-workspace-summary[aria-current="page"] {
    border-color: transparent !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-workspace-summary:hover:not(:disabled) {
    border-color: rgba(22, 168, 153, 0.42) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: 0 3px 10px rgba(2, 46, 39, 0.08) !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 .event-workspace-summary:active:not(:disabled) {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .event-workspace-summary .command-card-icon {
    width: 22px !important;
    min-width: 22px !important;
    height: 22px !important;
    display: inline-grid !important;
    place-items: center !important;
    color: currentColor !important;
  }

  html.ledger-workspace-v1 .event-workspace-summary .command-card-icon svg {
    width: 22px !important;
    height: 22px !important;
    stroke: currentColor !important;
  }

  html.ledger-workspace-v1 .event-workspace-summary-copy {
    min-width: 0 !important;
    display: grid !important;
    justify-items: start !important;
    gap: 1px !important;
    line-height: 1.12 !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .event-workspace-summary-copy strong {
    color: inherit !important;
    font-size: 15px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .event-workspace-summary-copy small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 550 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-workspace-summary:disabled {
    color: var(--ledger-faint) !important;
    background: #e6eeeb !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-workspace-summary:disabled small {
    color: var(--ledger-faint) !important;
  }

  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .event-start-panel {
    min-height: 0 !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 12px !important;
    margin-bottom: 2px !important;
    padding: 16px !important;
  }

  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .event-start-panel
    .event-type-chip {
    display: none !important;
  }

  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .event-start-panel
    .event-start-copy
    h2 {
    margin: 0 0 3px !important;
    font-size: 20px !important;
  }

  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen[data-screen-kind="event"]
    > .event-start-panel
    .event-start-primary {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 48px !important;
  }

  /* Focused expense flow: one decision per screen, with the existing money logic intact. */
  html.ledger-workspace-v1 .expense-step-modal {
    height: min(92vh, 860px) !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-modal-header {
    flex: 0 0 auto !important;
  }

  html.ledger-workspace-v1 .expense-modal-header-actions {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .expense-modal-step-header {
    display: grid !important;
    grid-template-columns: 48px minmax(0, 1fr) 48px !important;
    align-items: start !important;
    gap: 10px !important;
    direction: ltr !important;
  }

  html.ledger-workspace-v1 .expense-modal-step-header > div:first-child {
    grid-column: 2 !important;
    grid-row: 1 !important;
    min-width: 0 !important;
    direction: rtl !important;
  }

  html.ledger-workspace-v1
    .expense-modal-step-header
    > .expense-modal-header-actions {
    display: contents !important;
  }

  html.ledger-workspace-v1
    .expense-modal-step-header
    :is(.modal-section-back-button, .modal-close-button) {
    width: 48px !important;
    min-width: 48px !important;
    min-height: 44px !important;
  }

  html.ledger-workspace-v1
    .expense-modal-step-header
    .modal-section-back-button {
    grid-column: 3 !important;
    grid-row: 1 !important;
    justify-self: end !important;
  }

  html.ledger-workspace-v1
    .expense-modal-step-header
    .modal-close-button {
    grid-column: 1 !important;
    grid-row: 1 !important;
    justify-self: start !important;
  }

  html.ledger-workspace-v1 .expense-modal-header-actions .modal-section-back-button span {
    display: block !important;
    font-size: 24px !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .expense-flow-progress {
    flex: 0 0 auto !important;
    display: grid !important;
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    gap: 7px !important;
    margin: 0 !important;
    padding: 17px 22px 0 !important;
    list-style: none !important;
  }

  html.ledger-workspace-v1 .expense-flow-progress li {
    position: relative !important;
    height: 6px !important;
    overflow: hidden !important;
    border-radius: 999px !important;
    background: #dce8e4 !important;
  }

  html.ledger-workspace-v1 .expense-flow-progress li.is-complete,
  html.ledger-workspace-v1 .expense-flow-progress li.is-current {
    background: var(--ledger-accent) !important;
  }

  html.ledger-workspace-v1 .expense-flow-progress li.is-current {
    box-shadow: 0 0 0 3px rgba(22, 168, 153, 0.12) !important;
  }

  html.ledger-workspace-v1 .expense-flow-progress li span {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    overflow: hidden !important;
    clip: rect(0 0 0 0) !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-loop-status,
  html.ledger-workspace-v1 .expense-step-modal .expense-sync-status {
    flex: 0 0 auto !important;
    margin: 10px 22px 0 !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-flow-fields {
    min-width: 0 !important;
    min-height: 0 !important;
    flex: 1 1 auto !important;
    display: flex !important;
    flex-direction: column !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    overflow: hidden !important;
  }

  html.ledger-workspace-v1 .expense-flow-body {
    width: 100% !important;
    min-height: 0 !important;
    flex: 1 1 auto !important;
    display: grid !important;
    align-content: start !important;
    gap: 16px !important;
    padding: 24px 22px !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain !important;
    -webkit-overflow-scrolling: touch;
  }

  html.ledger-workspace-v1 .expense-step-modal
    :is(
      .expense-total-field,
      .expense-name-field,
      .expense-template-grid,
      .expense-date-prominent,
      .expense-mode-switch,
      .expense-details-panel,
      .expense-flow-review
    ) {
    display: none !important;
  }

  html.ledger-workspace-v1
    .expense-step-modal[data-expense-step="amount"]
    :is(.expense-total-field, .expense-mode-switch),
  html.ledger-workspace-v1
    .expense-step-modal[data-expense-step="name"]
    :is(.expense-name-field, .expense-template-grid),
  html.ledger-workspace-v1
    .expense-step-modal[data-expense-step="payer"]
    .expense-details-panel,
  html.ledger-workspace-v1
    .expense-step-modal[data-expense-step="participants"]
    .expense-details-panel,
  html.ledger-workspace-v1
    .expense-step-modal[data-expense-step="review"]
    .expense-flow-review {
    display: grid !important;
  }

  html.ledger-workspace-v1
    .expense-step-modal[data-expense-step="amount"]
    .expense-flow-body,
  html.ledger-workspace-v1
    .expense-step-modal[data-expense-step="name"]
    .expense-flow-body {
    align-content: start !important;
    justify-items: center !important;
    padding-top: clamp(38px, 7vh, 72px) !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-total-field {
    width: min(100%, 400px) !important;
    margin: 0 !important;
    padding: 18px 20px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 14px !important;
    background: #ffffff !important;
    box-shadow:
      0 14px 32px -28px rgba(6, 54, 40, 0.5),
      0 1px 3px rgba(8, 39, 31, 0.05),
      inset 0 1px 0 #ffffff !important;
    transition-property: border-color, box-shadow, transform !important;
    transition-duration: 180ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-total-field:focus-within {
    border-color: rgba(8, 96, 73, 0.42) !important;
    box-shadow:
      0 0 0 3px rgba(22, 168, 153, 0.09),
      0 16px 34px -28px rgba(6, 54, 40, 0.55),
      0 1px 3px rgba(8, 39, 31, 0.06) !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-total-field > span {
    justify-content: center !important;
    color: var(--ledger-muted) !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-total-field input {
    min-height: 72px !important;
    border: 0 !important;
    color: var(--ledger-brand) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-family: var(--font-num) !important;
    font-size: clamp(38px, 8vw, 52px) !important;
    font-weight: 900 !important;
    line-height: 1 !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-name-field {
    width: min(100%, 460px) !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-name-field input {
    min-height: 58px !important;
    border-radius: 12px !important;
    font-size: 17px !important;
    font-weight: 600 !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-template-grid {
    width: min(100%, 460px) !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 8px !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-template-grid button {
    min-height: 44px !important;
    border-radius: 10px !important;
    color: var(--ledger-ink) !important;
    background: #ffffff !important;
    box-shadow: 0 1px 2px rgba(8, 39, 31, 0.04) !important;
    font-size: 14px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1
    .expense-step-modal
    .expense-template-grid
    button.is-active {
    border-color: rgba(8, 96, 73, 0.34) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: inset 0 0 0 1px rgba(8, 96, 73, 0.08) !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-mode-switch {
    width: min(100%, 420px) !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .expense-mode-switch .expense-mode-alternate {
    width: 100% !important;
    min-height: 44px !important;
    padding: 8px 12px !important;
    border: 0 !important;
    border-radius: 12px !important;
    color: var(--ledger-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 12px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .expense-mode-switch .expense-mode-alternate:hover {
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-details-panel {
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-details-panel > summary {
    display: none !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-details-body {
    display: block !important;
    padding: 0 !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-details-body > * {
    display: none !important;
  }

  html.ledger-workspace-v1
    .expense-step-modal[data-expense-step="payer"]
    .expense-payer-section,
  html.ledger-workspace-v1
    .expense-step-modal[data-expense-step="participants"]
    .expense-participant-section {
    display: block !important;
  }

  html.ledger-workspace-v1
    .expense-step-modal[data-expense-step="participants"]
    .expense-participant-add-launch {
    display: grid !important;
  }

  html.ledger-workspace-v1
    .expense-step-modal[data-expense-step="participants"]
    .expense-participant-add-launch {
    margin-top: 14px !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-payer-section,
  html.ledger-workspace-v1 .expense-step-modal .expense-participant-section {
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .expense-step-modal
    :is(.expense-payer-section, .expense-participant-section)
    > h3 {
    display: none !important;
  }

  html.ledger-workspace-v1 .expense-participant-toolbar {
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    margin: 12px 0 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .expense-participant-toolbar[hidden] {
    display: none !important;
  }

  html.ledger-workspace-v1 .expense-select-all-compact {
    width: auto !important;
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 7px !important;
    padding: 6px 2px !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--ledger-accent) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 14px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .expense-select-all-compact svg {
    width: 18px !important;
    height: 18px !important;
  }

  html.ledger-workspace-v1 .expense-participant-list {
    min-width: 0 !important;
    display: grid !important;
    border-block: 1px solid var(--ledger-line) !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .expense-participant-row {
    position: relative !important;
    min-width: 0 !important;
    min-height: 64px !important;
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) 26px !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 9px 4px !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    cursor: pointer !important;
    background: #ffffff !important;
    transition: background-color 150ms ease !important;
  }

  html.ledger-workspace-v1 .expense-participant-row:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .expense-participant-row:hover {
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1
    .expense-participant-row:has(.expense-participant-checkbox:focus-visible) {
    outline: 3px solid rgba(22, 168, 153, 0.18) !important;
    outline-offset: -3px !important;
  }

  html.ledger-workspace-v1 .expense-participant-checkbox {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  html.ledger-workspace-v1 .expense-participant-row > .avatar {
    width: 42px !important;
    height: 42px !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1 .expense-participant-row.is-offline > .avatar {
    filter: grayscale(1) !important;
    opacity: 0.72 !important;
  }

  html.ledger-workspace-v1 .expense-participant-row-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .expense-participant-row-copy strong {
    overflow-wrap: anywhere !important;
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .expense-participant-row-copy small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .expense-participant-row-check {
    width: 24px !important;
    height: 24px !important;
    display: grid !important;
    place-items: center !important;
    border: 1.5px solid #aab6b2 !important;
    border-radius: 7px !important;
    color: #ffffff !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1
    .expense-participant-row:has(.expense-participant-checkbox:checked)
    .expense-participant-row-check {
    border-color: var(--ledger-brand) !important;
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .expense-guest-details {
    overflow: hidden !important;
    padding: 0 !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 14px !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .expense-guest-details > summary {
    min-height: 56px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding: 10px 13px !important;
    cursor: pointer !important;
    list-style: none !important;
  }

  html.ledger-workspace-v1 .expense-guest-details > summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .expense-guest-details > summary::after {
    content: "+" !important;
    width: 28px !important;
    height: 28px !important;
    display: inline-grid !important;
    place-items: center !important;
    flex: 0 0 28px !important;
    border-radius: 9px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    font-size: 18px !important;
    font-weight: 600 !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .expense-guest-details[open] > summary::after {
    content: "−" !important;
  }

  html.ledger-workspace-v1 .expense-guest-details > summary > span {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .expense-guest-details > summary strong {
    color: var(--ledger-ink) !important;
    font-size: 13px !important;
    font-weight: 760 !important;
  }

  html.ledger-workspace-v1 .expense-guest-details > summary small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
  }

  html.ledger-workspace-v1 .expense-guest-details .expense-guest-actions {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 8px !important;
    padding: 0 12px 12px !important;
  }

  html.ledger-workspace-v1
    .expense-guest-details
    .expense-guest-actions
    :is(input, button) {
    min-height: 44px !important;
  }

  html.ledger-workspace-v1 .expense-participant-add-empty {
    margin: 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 560 !important;
  }

  html.ledger-workspace-v1 .expense-participant-friend-list {
    display: grid !important;
    max-height: 220px !important;
    overflow: auto !important;
    border-block: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .expense-participant-friend-option {
    min-height: 54px !important;
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 7px 2px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .expense-participant-friend-option:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .expense-participant-friend-option > .avatar {
    width: 36px !important;
    height: 36px !important;
  }

  html.ledger-workspace-v1 .expense-participant-friend-option > span:not(.avatar) {
    min-width: 0 !important;
    display: grid !important;
    gap: 1px !important;
  }

  html.ledger-workspace-v1 .expense-participant-friend-option > span > strong {
    overflow: hidden !important;
    color: var(--ledger-ink) !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .expense-participant-friend-option > b {
    color: var(--ledger-brand) !important;
    font-size: 12px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .expense-participant-invite-message {
    margin: 0 !important;
    color: var(--ledger-brand) !important;
    font-size: 11px !important;
    font-weight: 650 !important;
  }

  @media (hover: hover) and (pointer: fine) {
    html.ledger-workspace-v1 .expense-participant-friend-option:hover {
      background: var(--ledger-surface-soft) !important;
    }
  }

  html.ledger-workspace-v1 .expense-participant-add-launch {
    width: 100% !important;
    min-height: 64px !important;
    grid-template-columns: 24px minmax(0, 1fr) 20px !important;
    align-items: center !important;
    gap: 11px !important;
    padding: 11px 4px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .expense-participant-add-launch > span:nth-child(2) {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .expense-participant-add-launch strong {
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .expense-participant-add-launch small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 560 !important;
  }

  html.ledger-workspace-v1
    :is(.expense-participant-add-launch-icon, .expense-participant-add-launch-chevron) {
    display: inline-grid !important;
    place-items: center !important;
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .expense-participant-add-launch-icon svg {
    width: 21px !important;
    height: 21px !important;
  }

  html.ledger-workspace-v1 .expense-participant-add-launch-chevron {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .expense-participant-add-launch-chevron svg {
    width: 17px !important;
    height: 17px !important;
  }

  html.ledger-workspace-v1 .expense-participant-add-route-body {
    align-content: start !important;
    justify-items: center !important;
    padding-top: 30px !important;
  }

  html.ledger-workspace-v1 .expense-participant-add-menu,
  html.ledger-workspace-v1 .expense-participant-friend-list,
  html.ledger-workspace-v1 .expense-participant-offline-form,
  html.ledger-workspace-v1 .expense-participant-add-empty {
    width: min(100%, 500px) !important;
  }

  html.ledger-workspace-v1 .expense-participant-add-menu {
    display: grid !important;
    border-block: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .expense-participant-choice {
    min-height: 72px !important;
    display: grid !important;
    grid-template-columns: 28px minmax(0, 1fr) 18px !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 11px 2px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .expense-participant-choice:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .expense-participant-choice > span:nth-child(2) {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .expense-participant-choice strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .expense-participant-choice small {
    overflow: hidden !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 550 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .expense-participant-choice-icon,
  html.ledger-workspace-v1 .expense-participant-choice-chevron {
    display: inline-grid !important;
    place-items: center !important;
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .expense-participant-choice-icon svg {
    width: 22px !important;
    height: 22px !important;
  }

  html.ledger-workspace-v1 .expense-participant-choice-chevron {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .expense-participant-choice-chevron svg {
    width: 17px !important;
    height: 17px !important;
  }

  html.ledger-workspace-v1 .expense-participant-choice:disabled {
    opacity: 0.5 !important;
  }

  html.ledger-workspace-v1 .expense-participant-add-route .expense-participant-friend-list {
    max-height: none !important;
  }

  html.ledger-workspace-v1 .expense-participant-offline-form {
    display: grid !important;
    gap: 14px !important;
  }

  html.ledger-workspace-v1 .expense-participant-offline-form .field {
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .expense-participant-offline-form input {
    min-height: 56px !important;
    font-size: 16px !important;
  }

  html.ledger-workspace-v1 .expense-participant-offline-form .primary-button {
    min-height: 50px !important;
  }

  html.ledger-workspace-v1 .expense-participant-add-route .expense-participant-invite-message {
    width: min(100%, 500px) !important;
    padding: 10px 0 !important;
    color: var(--ledger-muted) !important;
    text-align: center !important;
  }

  @media (hover: hover) and (pointer: fine) {
    html.ledger-workspace-v1 .expense-participant-add-launch:hover,
    html.ledger-workspace-v1 .expense-participant-choice:hover:not(:disabled) {
      border-color: rgba(8, 96, 73, 0.22) !important;
      background: var(--ledger-surface-soft) !important;
      transform: none !important;
    }
  }

  html.ledger-workspace-v1 .expense-flow-review {
    width: min(100%, 500px) !important;
    justify-self: center !important;
    gap: 14px !important;
  }

  html.ledger-workspace-v1 .expense-review-list {
    display: grid !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 18px !important;
    background: #ffffff !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .expense-review-row {
    min-height: 68px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 16px !important;
    padding: 12px 15px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .expense-review-row:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .expense-review-row:hover {
    background: var(--ledger-accent-soft) !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .expense-review-row > span:first-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .expense-review-row small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
  }

  html.ledger-workspace-v1 .expense-review-row strong {
    overflow: hidden !important;
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 780 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .expense-review-edit {
    flex: 0 0 auto !important;
    display: inline-grid !important;
    place-items: center !important;
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .expense-review-edit svg {
    width: 17px !important;
    height: 17px !important;
  }

  html.ledger-workspace-v1 .expense-flow-review .expense-review-date {
    min-height: 68px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 16px !important;
    margin: 0 !important;
    padding: 12px 15px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .expense-flow-review .expense-review-date > span {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
  }

  html.ledger-workspace-v1
    .expense-step-modal[data-expense-step="review"]
    .expense-flow-review
    .expense-review-list
    > .expense-review-date
    input[type="date"] {
    width: 176px !important;
    max-width: 100% !important;
    min-width: 0 !important;
    min-height: 44px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-family: var(--font-num) !important;
    font-size: 14px !important;
    font-weight: 750 !important;
    text-align: end !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-modal-actions {
    flex: 0 0 auto !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-modal-actions.is-next {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-step-next {
    width: 100% !important;
  }

  @media (max-width: 1024px), (hover: none) and (pointer: coarse) {
    html.ledger-workspace-v1 .expense-modal-backdrop,
    html.ledger-workspace-v1 .event-modal-backdrop {
      align-items: stretch !important;
      justify-items: stretch !important;
      padding: 0 !important;
    }

    html.ledger-workspace-v1 .expense-step-modal {
      width: 100vw !important;
      max-width: none !important;
      height: 100vh !important;
      height: 100dvh !important;
      max-height: none !important;
      margin: 0 !important;
      border-radius: 0 !important;
    }

  }

  @media (max-width: 720px) {

    html.ledger-workspace-v1 .expense-flow-progress {
      padding: 14px 16px 0 !important;
    }

    html.ledger-workspace-v1 .expense-flow-body {
      padding: 20px 16px !important;
    }

    html.ledger-workspace-v1 .expense-step-modal .expense-total-field {
      padding: 16px !important;
    }

    html.ledger-workspace-v1 .expense-step-modal .expense-template-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    html.ledger-workspace-v1 .expense-guest-details .expense-guest-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .expense-step-modal .expense-modal-actions.is-review {
      grid-template-columns: minmax(0, 1fr) !important;
    }
  }

  /* Shared premium hero finish keeps every primary screen header at home quality. */
  html.ledger-workspace-v1 {
    --ledger-hero-surface:
      linear-gradient(136deg, #071f18 0%, #0b4a38 58%, #0f6b50 100%),
      #0b4a38;
    --ledger-hero-border: rgba(255, 255, 255, 0.18);
    --ledger-hero-shadow:
      0 28px 62px -30px rgba(6, 54, 40, 0.78),
      0 18px 40px -24px rgba(6, 78, 59, 0.62),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top,
  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top {
    border-color: var(--ledger-hero-border) !important;
    background: var(--ledger-hero-surface) !important;
    box-shadow: var(--ledger-hero-shadow) !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top::after,
  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top::after {
    content: "" !important;
    position: absolute !important;
    inset: 0 !important;
    z-index: 0 !important;
    width: auto !important;
    height: auto !important;
    display: block !important;
    border-radius: inherit !important;
    background:
      linear-gradient(
        110deg,
        transparent 28%,
        rgba(95, 231, 204, 0.08) 39%,
        rgba(255, 255, 255, 0.34) 48%,
        rgba(124, 242, 218, 0.14) 56%,
        transparent 68%
      ) 140% 0 / 220% 100% no-repeat !important;
    clip-path: inset(0 round 24px) !important;
    pointer-events: none !important;
    opacity: 0.18 !important;
    transform: none !important;
    animation: ledger-home-shimmer 6.4s cubic-bezier(0.22, 1, 0.36, 1) 1.1s infinite !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .hero-actions,
  html.product-v1.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .hero-actions {
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  /* Keep Hebrew copy and financial figures in deliberately separate font roles. */
  html.ledger-workspace-v1 body.font-hebrew,
  html.ledger-workspace-v1 #app.font-hebrew,
  html.ledger-workspace-v1 .font-hebrew {
    font-family: var(--font-hebrew) !important;
  }

  html.ledger-workspace-v1 body.font-hebrew
    *:not(.font-num):not(.font-num *) {
    font-family: var(--font-hebrew) !important;
  }

  html.ledger-workspace-v1 body.font-hebrew .font-num,
  html.ledger-workspace-v1 body.font-hebrew .font-num * {
    font-family: var(--font-num) !important;
    font-weight: 900 !important;
    font-variant-numeric: tabular-nums;
    direction: ltr;
    unicode-bidi: isolate;
  }

  /* Compact transfer ledger: keep the decision visible without card-within-card weight. */
  html.ledger-workspace-v1.circle-design-v1
    .settlement-transfer-board
    .transfer-row,
  html.ledger-workspace-v1 .transfer-row {
    gap: 8px !important;
    padding: 12px !important;
    border-radius: 14px !important;
  }

  html.ledger-workspace-v1 .transfer-main {
    min-width: 0 !important;
    display: grid !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .transfer-card-meta {
    min-height: 22px !important;
    gap: 5px !important;
  }

  html.ledger-workspace-v1 .personal-transfer-badge {
    min-height: 22px !important;
    display: inline-flex !important;
    align-items: center !important;
    padding: 2px 7px !important;
    border: 1px solid rgba(22, 168, 153, 0.2) !important;
    border-radius: 999px !important;
    color: #075d55 !important;
    background: rgba(33, 170, 166, 0.09) !important;
    font-size: 10px !important;
    font-weight: 760 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .transfer-row.is-personal-payer {
    border-color: rgba(190, 112, 65, 0.3) !important;
    border-inline-start-width: 3px !important;
    background:
      linear-gradient(135deg, rgba(255, 247, 239, 0.76), #ffffff),
      #ffffff !important;
    box-shadow:
      0 0 0 3px rgba(190, 112, 65, 0.06),
      0 12px 26px -22px rgba(128, 80, 41, 0.38) !important;
  }

  html.ledger-workspace-v1 .transfer-row.is-personal-payer .personal-transfer-badge {
    border-color: rgba(190, 112, 65, 0.2) !important;
    color: #805029 !important;
    background: rgba(190, 112, 65, 0.1) !important;
  }

  html.ledger-workspace-v1 .transfer-row.is-personal-receiver {
    border-inline-start-width: 3px !important;
  }

  html.ledger-workspace-v1 .settlement-offline-note {
    gap: 8px !important;
    padding: 9px 11px !important;
    border-radius: 11px !important;
  }

  html.ledger-workspace-v1 .settlement-offline-note-icon {
    width: 18px !important;
    height: 18px !important;
    flex-basis: 18px !important;
    font-size: 10px !important;
  }

  html.ledger-workspace-v1 .transfer-status.status-paid {
    display: inline-flex !important;
    align-items: center !important;
    gap: 5px !important;
    color: var(--ledger-positive) !important;
    font-weight: 750 !important;
  }

  html.ledger-workspace-v1 .transfer-status.status-paid::before {
    content: "✓" !important;
    width: 18px !important;
    height: 18px !important;
    display: inline-grid !important;
    place-items: center !important;
    flex: 0 0 18px !important;
    border-radius: 50% !important;
    color: #ffffff !important;
    background: var(--ledger-positive) !important;
    font-size: 11px !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .settlement-transfer-board .transfer-row.is-paid {
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .transfer-party {
    gap: 2px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .transfer-party-label {
    display: none !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .transfer-people {
    grid-template-columns: minmax(0, 1fr) 26px minmax(0, 1fr) !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .transfer-arrow {
    width: 26px !important;
    min-width: 26px !important;
    height: 26px !important;
    padding: 0 !important;
    font-size: 0 !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .transfer-arrow::before {
    content: "←" !important;
    font-size: 14px !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .transfer-participant {
    gap: 6px !important;
  }

  html.ledger-workspace-v1 .transfer-participant .avatar {
    width: 30px !important;
    min-width: 30px !important;
    height: 30px !important;
  }

  html.ledger-workspace-v1 .transfer-participant-copy strong {
    font-size: 14px !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .transfer-actions {
    gap: 8px !important;
    padding-top: 8px !important;
  }

  html.ledger-workspace-v1 .transfer-amount > .amount {
    font-size: 20px !important;
  }

  html.ledger-workspace-v1 .transfer-actions > button {
    min-width: 108px !important;
    min-height: 44px !important;
  }

  html.ledger-workspace-v1 .transfer-action-buttons {
    min-width: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 6px !important;
  }

  html.ledger-workspace-v1 .transfer-action-buttons > button {
    min-width: 108px !important;
    min-height: 44px !important;
  }

  html.ledger-workspace-v1 .transfer-action-buttons > .transfer-reminder-button {
    width: 44px !important;
    min-width: 44px !important;
    height: 44px !important;
    min-height: 44px !important;
    display: inline-grid !important;
    place-items: center !important;
    padding: 0 !important;
    border-radius: 13px !important;
  }

  html.ledger-workspace-v1
    .transfer-reminder-button
    .button-action-icon {
    width: 19px !important;
    height: 19px !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1
    .transfer-reminder-button[aria-busy="true"]
    .button-action-icon {
    animation: ledger-reminder-pulse 0.9s ease-in-out infinite alternate;
  }

  @keyframes ledger-reminder-pulse {
    from { opacity: 0.42; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
  }

  html.ledger-workspace-v1 .transfer-explanation {
    border-radius: 12px !important;
  }

  html.ledger-workspace-v1 .transfer-explanation > summary {
    min-height: 44px !important;
    padding-inline: 12px !important;
  }

  html.ledger-workspace-v1 .settlement-route-person {
    color: var(--ledger-brand) !important;
    font-weight: 820 !important;
  }

  html.ledger-workspace-v1 .settlement-stage-heading > div {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .settlement-stage-heading > div > .muted {
    margin: 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    line-height: 1.35 !important;
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-hero-main {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 10px 12px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-hero-main
      > .status-chip {
      flex: 0 0 auto !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-hero-title-row {
      min-width: 0 !important;
      flex: 1 1 auto !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-hero-title-row
      h2 {
      margin-bottom: 2px !important;
      font-size: 20px !important;
      line-height: 1.2 !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-hero-title-row
      .muted {
      font-size: 12px !important;
      line-height: 1.35 !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-hero-actions {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto !important;
      gap: 6px !important;
      padding: 7px !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-more-actions {
      grid-column: auto !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-more-actions[open] {
      grid-column: 1 / -1 !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-hero.is-pending.is-personal-pending
      .settlement-more-actions
      > summary {
      min-height: 44px !important;
      gap: 6px !important;
      padding-inline: 9px !important;
      white-space: nowrap !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-transfer-board
      .transfer-row,
    html.ledger-workspace-v1 .transfer-row {
      grid-template-columns: minmax(0, 1fr) auto !important;
      grid-template-areas:
        "people people"
        "meta actions"
        "explanation explanation" !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 10px 11px !important;
    }

    html.ledger-workspace-v1 .transfer-main {
      display: contents !important;
    }

    html.ledger-workspace-v1 .transfer-card-meta {
      grid-area: meta !important;
      min-width: 0 !important;
      flex-wrap: wrap !important;
    }

    html.ledger-workspace-v1 .transfer-people {
      grid-area: people !important;
    }

    html.ledger-workspace-v1 .group-transfer-badge {
      display: none !important;
    }

    html.ledger-workspace-v1.circle-design-v1 .transfer-people {
      grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr) !important;
      gap: 5px !important;
    }

    html.ledger-workspace-v1 .transfer-party {
      min-height: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
    }

    html.ledger-workspace-v1 .transfer-party-label {
      display: none !important;
    }

    html.ledger-workspace-v1.circle-design-v1 .transfer-arrow {
      width: 24px !important;
      min-width: 24px !important;
      height: 24px !important;
      padding: 0 !important;
      font-size: 0 !important;
    }

    html.ledger-workspace-v1.circle-design-v1 .transfer-arrow::before {
      content: "←" !important;
      font-size: 14px !important;
      line-height: 1 !important;
    }

    html.ledger-workspace-v1 .transfer-participant-copy strong {
      overflow: visible !important;
      white-space: normal !important;
      text-overflow: clip !important;
      overflow-wrap: anywhere !important;
    }

    html.ledger-workspace-v1 .transfer-participant .avatar {
      width: 28px !important;
      min-width: 28px !important;
      height: 28px !important;
    }

    html.ledger-workspace-v1 .transfer-status {
      max-width: 58% !important;
      white-space: normal !important;
      text-align: end !important;
      line-height: 1.2 !important;
    }

    html.ledger-workspace-v1 .transfer-participant .participant-connection-badge {
      font-size: 9.5px !important;
      line-height: 1.15 !important;
    }

    html.ledger-workspace-v1 .transfer-amount > small {
      display: none !important;
    }

    html.ledger-workspace-v1.circle-design-v1 .transfer-actions {
      grid-area: actions !important;
      min-width: 0 !important;
      padding-top: 0 !important;
    }

    html.ledger-workspace-v1 .transfer-explanation {
      grid-area: explanation !important;
      margin: 0 -11px -10px !important;
    }

    html.ledger-workspace-v1 .transfer-explanation > summary {
      min-height: 44px !important;
      padding-inline: 10px !important;
      font-size: 12px !important;
    }

    html.ledger-workspace-v1 .profile-avatar-options {
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      gap: 10px !important;
    }

    html.ledger-workspace-v1 .profile-avatar-option {
      min-width: 48px !important;
    }

    html.ledger-workspace-v1 .settlement-offline-note {
      align-items: center !important;
      padding: 9px 11px !important;
    }

  }

  @media (max-width: 380px) {
    html.ledger-workspace-v1 .event-workspace-nav {
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr) !important;
      gap: 4px !important;
      padding: 4px !important;
    }

    html.ledger-workspace-v1 .event-workspace-summary {
      gap: 7px !important;
      padding-inline: 9px !important;
    }

    html.ledger-workspace-v1 .event-workspace-summary-copy strong {
      font-size: 14px !important;
    }

    html.ledger-workspace-v1.circle-design-v1 .transfer-actions {
      grid-area: actions !important;
      grid-column: auto !important;
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
    }

    html.ledger-workspace-v1.circle-design-v1
      .settlement-transfer-board
      .transfer-row,
    html.ledger-workspace-v1 .transfer-row {
      grid-template-columns: minmax(72px, 0.7fr) minmax(0, 1.3fr) !important;
      grid-template-areas:
        "people people"
        "meta actions"
        "explanation explanation" !important;
    }

    html.ledger-workspace-v1 .transfer-row.is-personal.is-pending .transfer-status {
      display: none !important;
    }

    html.ledger-workspace-v1 .transfer-action-buttons {
      width: auto !important;
      min-width: 0 !important;
    }

    html.ledger-workspace-v1 .transfer-action-buttons > button {
      min-width: 96px !important;
      padding-inline: 10px !important;
    }

    html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).ledger-workspace-v1
      .settlement-transfer-board
      .transfer-row {
      grid-template-columns: minmax(0, 1fr) !important;
      grid-template-areas:
        "people"
        "meta"
        "actions"
        "explanation" !important;
    }

    html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).ledger-workspace-v1
      .transfer-row.is-personal.is-pending
      .transfer-status {
      display: inline-flex !important;
    }
  }

  /* Participant manager: one roster, one compact add path, explicit identity. */
  html.ledger-workspace-v1 .event-participant-roster,
  html.ledger-workspace-v1 .event-participant-add-existing {
    border-radius: 16px !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .event-participant-section-header {
    padding: 15px 16px !important;
    background:
      linear-gradient(135deg, rgba(230, 243, 240, 0.84), rgba(248, 252, 251, 0.96)) !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-groups {
    min-width: 0 !important;
    display: grid !important;
    gap: 0 !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-identity-group {
    min-width: 0 !important;
    display: grid !important;
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1
    .event-participant-roster-identity-group
    + .event-participant-roster-identity-group {
    border-block-start: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-identity-heading {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: 9px minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 9px !important;
    padding: 10px 13px !important;
    border-block-end: 1px solid var(--ledger-line) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1
    .event-participant-roster-identity-heading
    > span:nth-child(2) {
    min-width: 0 !important;
    display: grid !important;
    gap: 1px !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-identity-heading strong {
    min-width: 0 !important;
    overflow: hidden !important;
    color: var(--ledger-ink) !important;
    font-size: 12.5px !important;
    font-weight: 800 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-identity-heading small,
  html.ledger-workspace-v1 .event-participant-roster-identity-heading bdi {
    color: var(--ledger-muted) !important;
    font-size: 10.5px !important;
    font-weight: 600 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-identity-heading small {
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-identity-marker {
    width: 8px !important;
    height: 8px !important;
    border: 1px solid var(--ledger-faint) !important;
    border-radius: 50% !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1
    .event-participant-roster-identity-group.is-account
    .event-participant-roster-identity-marker {
    border-color: var(--ledger-positive) !important;
    background: var(--ledger-positive) !important;
    box-shadow: 0 0 0 3px rgba(24, 113, 88, 0.1) !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-identity-group[hidden] {
    display: none !important;
  }

  html.ledger-workspace-v1 .participant-username {
    width: max-content !important;
    max-width: 100% !important;
    overflow: hidden !important;
    color: var(--ledger-brand) !important;
    font-family: var(--font-num) !important;
    font-size: 10.5px !important;
    font-weight: 700 !important;
    line-height: 1.25 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-row,
  html.ledger-workspace-v1 .event-participant-candidate-row {
    min-height: 74px !important;
    gap: 10px !important;
    padding: 11px 13px !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-row.is-account {
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-row.is-offline,
  html.ledger-workspace-v1 .event-participant-candidate-row.is-offline {
    background: #f7f9f8 !important;
  }

  html.ledger-workspace-v1 .event-participant-current-label {
    width: max-content !important;
    max-width: 100% !important;
    padding: 2px 6px !important;
    border-radius: 6px !important;
    color: #075d55 !important;
    background: rgba(33, 170, 166, 0.1) !important;
    font-size: 10.5px !important;
    font-weight: 720 !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .event-participant-roster-row .participant-connection-badge {
    font-size: 10.5px !important;
  }

  html.ledger-workspace-v1 .event-participant-edit-name-button {
    width: 44px !important;
    height: 44px !important;
    min-width: 44px !important;
    min-height: 44px !important;
    display: inline-grid !important;
    place-items: center !important;
    padding: 0 !important;
    border: 1px solid rgba(14, 110, 101, 0.2) !important;
    border-radius: 50% !important;
    color: var(--ledger-brand) !important;
    background: rgba(14, 110, 101, 0.07) !important;
    box-shadow: none !important;
    cursor: pointer !important;
    transition:
      border-color 160ms ease,
      background-color 160ms ease,
      transform 140ms ease !important;
  }

  html.ledger-workspace-v1 .event-participant-edit-name-button:hover,
  html.ledger-workspace-v1 .event-participant-edit-name-button:focus-visible {
    border-color: rgba(14, 110, 101, 0.42) !important;
    background: #e7f5f2 !important;
  }

  html.ledger-workspace-v1 .event-participant-edit-name-button:active {
    transform: scale(0.94) !important;
  }

  html.ledger-workspace-v1 .event-participant-edit-name-icon,
  html.ledger-workspace-v1 .event-participant-edit-name-icon svg {
    width: 15px !important;
    height: 15px !important;
    display: block !important;
  }

  html.ledger-workspace-v1 .event-participant-edit-name-icon svg {
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.9 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.ledger-workspace-v1 .event-participant-rename-card {
    width: min(100%, 420px) !important;
    margin-inline: auto !important;
    display: grid !important;
    gap: 18px !important;
  }

  html.ledger-workspace-v1 .event-participant-rename-person {
    display: grid !important;
    grid-template-columns: 48px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 14px !important;
    border: 1px solid rgba(72, 91, 87, 0.14) !important;
    border-radius: 12px !important;
    background: #f7f9f8 !important;
  }

  html.ledger-workspace-v1 .event-participant-rename-person > .avatar {
    width: 48px !important;
    height: 48px !important;
  }

  html.ledger-workspace-v1 .event-participant-rename-person > div {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .event-participant-rename-person strong {
    overflow-wrap: anywhere !important;
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 780 !important;
  }

  html.ledger-workspace-v1 .event-participant-rename-person small,
  html.ledger-workspace-v1 .event-participant-rename-field > small {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .event-participant-rename-field input {
    min-height: 50px !important;
    font-size: max(16px, 1em) !important;
  }

  html.ledger-workspace-v1 .event-participant-rename-actions {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .event-participant-rename-actions > button {
    width: 100% !important;
    min-height: 48px !important;
  }

  html.ledger-workspace-v1 .event-participant-remove-button,
  html.ledger-workspace-v1 .event-participant-add-button {
    min-width: 70px !important;
    border-radius: 10px !important;
  }

  html.ledger-workspace-v1 .event-participant-membership-button,
  html.ledger-workspace-v1 .event-participant-membership-readonly {
    min-width: 96px !important;
    min-height: 48px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
  }

  html.ledger-workspace-v1 .event-participant-membership-button {
    padding: 0 !important;
    border: 0 !important;
    color: inherit !important;
    background: transparent !important;
    box-shadow: none !important;
    cursor: pointer !important;
  }

  html.ledger-workspace-v1 .event-participant-membership-button .participant-membership-status,
  html.ledger-workspace-v1 .event-participant-membership-readonly .participant-membership-status {
    min-height: 34px !important;
    margin: 0 !important;
    padding: 6px 9px !important;
    border: 1px solid rgba(72, 91, 87, 0.18) !important;
    border-radius: 999px !important;
    color: #687572 !important;
    background: #f1f4f3 !important;
    transition:
      border-color 160ms ease,
      color 160ms ease,
      background-color 160ms ease,
      transform 140ms ease !important;
  }

  html.ledger-workspace-v1 .event-participant-membership-button .participant-membership-status[data-membership-state="active"],
  html.ledger-workspace-v1 .event-participant-membership-readonly .participant-membership-status[data-membership-state="active"] {
    border-color: rgba(14, 110, 101, 0.24) !important;
    color: #075d55 !important;
    background: rgba(14, 110, 101, 0.1) !important;
  }

  html.ledger-workspace-v1 .event-participant-membership-button:hover:not(:disabled) .participant-membership-status,
  html.ledger-workspace-v1 .event-participant-membership-button:focus-visible .participant-membership-status {
    border-color: rgba(14, 110, 101, 0.42) !important;
    background: #e7f5f2 !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 .event-participant-membership-button:active:not(:disabled) .participant-membership-status {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .event-participant-membership-button:disabled {
    opacity: 0.58 !important;
    cursor: not-allowed !important;
  }

  html.ledger-workspace-v1 .event-participant-profile-trigger {
    width: 100% !important;
    min-height: 52px !important;
    margin: -4px !important;
    padding: 4px !important;
    border: 0 !important;
    border-radius: 12px !important;
    color: inherit !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
    cursor: pointer !important;
    transition-property: transform, background-color !important;
    transition-duration: 160ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .event-participant-profile-trigger:active {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .event-participant-friend-hint {
    min-height: 22px !important;
    display: inline-flex !important;
    align-items: center !important;
    padding: 3px 7px !important;
    border-radius: 999px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    font-size: 10px !important;
    font-weight: 760 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-participant-friend-hint.is-accepted {
    color: #075d55 !important;
    background: rgba(14, 110, 101, 0.11) !important;
  }

  html.ledger-workspace-v1 .event-participant-friend-hint.is-outgoing,
  html.ledger-workspace-v1 .event-participant-friend-hint.is-loading {
    color: var(--ledger-muted) !important;
    background: var(--ledger-surface-soft) !important;
  }

  @media (hover: hover) {
    html.ledger-workspace-v1 .event-participant-profile-trigger:hover {
      background: var(--ledger-accent-soft) !important;
    }
  }

  html.ledger-workspace-v1 .event-participant-profile-card {
    width: min(100%, 440px) !important;
    display: grid !important;
    justify-self: center !important;
    gap: 16px !important;
  }

  html.ledger-workspace-v1 .event-participant-profile-identity {
    min-width: 0 !important;
    min-height: 96px !important;
    display: grid !important;
    grid-template-columns: 72px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 14px !important;
    padding: 14px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 18px !important;
    background: var(--ledger-surface) !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .event-participant-profile-identity > .avatar {
    width: 72px !important;
    height: 72px !important;
  }

  html.ledger-workspace-v1 .event-participant-profile-identity > div {
    min-width: 0 !important;
    display: grid !important;
    justify-items: start !important;
    gap: 6px !important;
  }

  html.ledger-workspace-v1 .event-participant-profile-identity strong {
    overflow-wrap: anywhere !important;
    color: var(--ledger-ink) !important;
    font-size: 19px !important;
    font-weight: 820 !important;
    line-height: 1.2 !important;
  }

  html.ledger-workspace-v1 .event-participant-profile-account {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 680 !important;
  }

  html.ledger-workspace-v1 .event-participant-profile-account > span {
    width: 7px !important;
    height: 7px !important;
    flex: 0 0 7px !important;
    border-radius: 50% !important;
    background: var(--ledger-accent) !important;
    box-shadow: 0 0 0 3px rgba(33, 170, 166, 0.1) !important;
  }

  html.ledger-workspace-v1 .event-participant-friendship-action {
    width: 100% !important;
    min-height: 52px !important;
    justify-content: center !important;
  }

  html.ledger-workspace-v1 .event-participant-friendship-state {
    min-height: 52px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    margin: 0 !important;
    padding: 11px 14px !important;
    border-radius: 14px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .event-participant-friendship-state > span {
    width: 24px !important;
    height: 24px !important;
    display: inline-grid !important;
    place-items: center !important;
    border-radius: 50% !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    font-size: 12px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .event-participant-friendship-state strong {
    font-size: 13px !important;
    font-weight: 780 !important;
  }

  html.ledger-workspace-v1 .event-participant-friendship-help {
    margin: -7px 0 0 !important;
    text-align: center !important;
  }

  @media (max-width: 390px) {
    html.ledger-workspace-v1 .event-participant-roster-identity-heading {
      grid-template-columns: 8px minmax(0, 1fr) auto !important;
      gap: 7px !important;
      padding-inline: 11px !important;
    }

    html.ledger-workspace-v1 .event-participant-roster-identity-heading small {
      display: none !important;
    }

    html.ledger-workspace-v1 .event-participant-membership-button,
    html.ledger-workspace-v1 .event-participant-membership-readonly {
      min-width: 88px !important;
    }

    html.ledger-workspace-v1 .event-participant-membership-button .participant-membership-status,
    html.ledger-workspace-v1 .event-participant-membership-readonly .participant-membership-status {
      padding-inline: 7px !important;
      font-size: 11px !important;
    }

    html.ledger-workspace-v1 .event-participant-profile-identity {
      grid-template-columns: 60px minmax(0, 1fr) !important;
      padding: 12px !important;
    }

    html.ledger-workspace-v1 .event-participant-profile-identity > .avatar {
      width: 60px !important;
      height: 60px !important;
    }
  }

  html.ledger-workspace-v1 .event-participant-primary-actions {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 3fr) minmax(136px, 2fr) !important;
    gap: 8px !important;
    margin: 13px 0 4px !important;
  }

  html.ledger-workspace-v1 .event-participant-add-launch,
  html.ledger-workspace-v1 .event-participant-invite-launch {
    width: 100% !important;
    min-height: 52px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 9px !important;
    margin: 0 !important;
    border-radius: 12px !important;
    transition:
      background-color 170ms cubic-bezier(0.2, 0, 0, 1),
      border-color 170ms cubic-bezier(0.2, 0, 0, 1),
      box-shadow 170ms cubic-bezier(0.2, 0, 0, 1),
      transform 140ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .event-participant-add-launch {
    min-width: 0 !important;
  }

  html.ledger-workspace-v1 .event-participant-invite-launch {
    width: auto !important;
    min-width: 136px !important;
    padding-inline: 12px !important;
    color: var(--ledger-ink) !important;
    border-color: var(--ledger-line-strong) !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 1px 2px rgba(15, 36, 31, 0.04) !important;
  }

  html.ledger-workspace-v1 .event-participant-invite-launch:hover:not(:disabled) {
    border-color: rgba(17, 94, 74, 0.34) !important;
    background: var(--ledger-surface-soft) !important;
    box-shadow: 0 2px 6px rgba(15, 36, 31, 0.06) !important;
  }

  html.ledger-workspace-v1 :is(.event-participant-add-launch, .event-participant-invite-launch):active:not(:disabled) {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 :is(.event-participant-add-launch, .event-participant-invite-launch) .command-card-icon {
    width: 22px !important;
    height: 22px !important;
    display: inline-grid !important;
    place-items: center !important;
    margin: 0 !important;
    border: 0 !important;
    color: currentColor !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 :is(.event-participant-add-launch, .event-participant-invite-launch) .command-card-icon svg {
    width: 20px !important;
    height: 20px !important;
  }

  @media (max-width: 350px) {
    html.ledger-workspace-v1 .event-participant-primary-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .event-participant-invite-launch {
      width: 100% !important;
      min-width: 0 !important;
    }
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).ledger-workspace-v1
    .event-participant-primary-actions {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).ledger-workspace-v1
    .event-participant-invite-launch {
    width: 100% !important;
    min-width: 0 !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen {
    min-width: 0 !important;
    display: grid !important;
    gap: 16px !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen .event-participant-add-zone {
    margin: 0 !important;
    padding-block-start: 0 !important;
    border-block-start: 0 !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen .event-participant-add-existing {
    margin: 0 !important;
    direction: ltr !important;
  }

  html.ledger-workspace-v1 .product-route-controls > .app-back-button {
    order: 0 !important;
  }

  html.product-v1.ledger-workspace-v1
    .screen[data-screen-kind="home"]
    .product-route-controls
    > .app-back-button,
  html.product-v1.ledger-workspace-v1
    .screen[data-product-screen="home"]
    .product-route-controls
    > .app-back-button,
  html.product-v1.ledger-workspace-v1
    .product-home-screen
    .product-route-controls
    > .app-back-button {
    display: inline-grid !important;
    visibility: visible !important;
  }

  html.product-v1.ledger-workspace-v1 .product-route-controls > .app-back-button {
    display: inline-grid !important;
    visibility: visible !important;
  }

  html.ledger-workspace-v1 .product-route-controls {
    direction: ltr !important;
    flex-direction: row !important;
  }

  html.ledger-workspace-v1 .product-route-controls > .accessibility-entry-button {
    order: 1 !important;
  }

  html.ledger-workspace-v1 .product-route-controls > .product-home-button {
    order: 2 !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen .new-event-participant-actions {
    margin-top: 0 !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen details.new-event-participant-route-action {
    padding: 0 !important;
    overflow: hidden !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen details.new-event-participant-route-action > summary {
    min-height: 62px !important;
    display: grid !important;
    grid-template-columns: 28px minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 13px 14px !important;
    list-style: none !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen details.new-event-participant-route-action > summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-participant-add-zone {
    min-width: 0 !important;
    display: grid !important;
    gap: 11px !important;
    margin: 4px 0 16px !important;
    padding: 17px 0 0 !important;
    border-block-start: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .event-participant-add-heading {
    min-width: 0 !important;
    display: flex !important;
    align-items: baseline !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding-inline: 2px !important;
  }

  html.ledger-workspace-v1 .event-participant-add-heading strong {
    color: var(--ledger-ink) !important;
    font-size: 16px !important;
    font-weight: 820 !important;
  }

  html.ledger-workspace-v1 .event-participant-add-heading span {
    color: var(--ledger-muted) !important;
    font-size: 11.5px !important;
    font-weight: 560 !important;
  }

  html.ledger-workspace-v1 .event-participant-add-options {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    align-items: start !important;
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .event-participant-add-options .participant-add-choice {
    min-width: 0 !important;
    min-height: 88px !important;
    margin: 0 !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 18px !important;
    color: var(--ledger-ink) !important;
    text-align: start !important;
    background: #ffffff !important;
    box-shadow: 0 8px 22px -20px rgba(12, 27, 32, 0.44) !important;
    transition:
      border-color 170ms cubic-bezier(0.2, 0, 0, 1),
      background-color 170ms cubic-bezier(0.2, 0, 0, 1),
      box-shadow 170ms cubic-bezier(0.2, 0, 0, 1),
      transform 140ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 button.participant-add-choice {
    display: grid !important;
    grid-template-columns: 44px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 16px !important;
    font: inherit !important;
    cursor: pointer !important;
  }

  html.ledger-workspace-v1 button.participant-add-choice.is-primary {
    min-height: 104px !important;
    border-color: transparent !important;
    color: #ffffff !important;
    background: linear-gradient(145deg, #08624d 0%, #064536 100%) !important;
    box-shadow: 0 18px 34px -22px rgba(3, 63, 49, 0.82) !important;
  }

  html.ledger-workspace-v1 button.participant-add-choice.is-primary:hover,
  html.ledger-workspace-v1 button.participant-add-choice.is-primary:focus-visible {
    border-color: transparent !important;
    background: linear-gradient(145deg, #0a6b54 0%, #064536 100%) !important;
    box-shadow: 0 20px 38px -20px rgba(3, 63, 49, 0.88) !important;
  }

  html.ledger-workspace-v1 .event-participant-add-options .participant-add-choice:hover,
  html.ledger-workspace-v1 .event-participant-add-options .participant-add-choice:focus-visible {
    border-color: rgba(14, 110, 101, 0.3) !important;
    background: #fbfefd !important;
    box-shadow: 0 12px 26px -20px rgba(7, 93, 85, 0.42) !important;
  }

  html.ledger-workspace-v1 .event-participant-add-options .participant-add-choice:active {
    transform: scale(0.985) !important;
  }

  html.ledger-workspace-v1 .event-participant-add-options .command-card-icon {
    width: 44px !important;
    height: 44px !important;
    display: inline-grid !important;
    place-items: center !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 14px !important;
    color: #075d55 !important;
    background: rgba(33, 170, 166, 0.1) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 button.participant-add-choice.is-primary .command-card-icon {
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.14) !important;
  }

  html.ledger-workspace-v1 .event-participant-add-options .command-card-icon svg {
    width: 20px !important;
    height: 20px !important;
  }

  html.ledger-workspace-v1 .event-participant-add-options .participant-invite-copy {
    gap: 2px !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .event-participant-add-options .participant-invite-copy strong {
    font-size: 16px !important;
    font-weight: 820 !important;
  }

  html.ledger-workspace-v1 .event-participant-add-options .participant-invite-copy span {
    font-size: 11.5px !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .event-contact-picker-button {
    width: calc(100% - 28px) !important;
    min-height: 44px !important;
    margin: 0 14px 10px !important;
  }

  html.ledger-workspace-v1 button.participant-add-choice.is-primary .participant-invite-copy strong {
    color: #ffffff !important;
  }

  html.ledger-workspace-v1 button.participant-add-choice.is-primary .participant-invite-copy span {
    color: rgba(255, 255, 255, 0.74) !important;
  }

  html.ledger-workspace-v1 .participant-add-friends {
    min-width: 0 !important;
    margin: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 18px !important;
    background: rgba(255, 255, 255, 0.94) !important;
    box-shadow: 0 12px 28px -24px rgba(12, 27, 32, 0.5) !important;
  }

  html.ledger-workspace-v1 .participant-add-friends > summary {
    min-height: 88px !important;
    grid-template-columns: 44px minmax(0, 1fr) auto 18px !important;
    gap: 10px !important;
    padding: 16px !important;
  }

  html.ledger-workspace-v1 .participant-add-friends > summary::after {
    grid-column: auto !important;
  }

  html.ledger-workspace-v1 .participant-add-friends .event-participant-count {
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-participant-offline-entry.participant-add-manual {
    display: grid !important;
    gap: 0 !important;
    margin-top: 6px !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-block: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-participant-offline-entry.participant-add-manual > summary {
    min-width: 0 !important;
    min-height: 66px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 18px !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 12px 4px !important;
    cursor: pointer !important;
    list-style: none !important;
  }

  html.ledger-workspace-v1 .event-participant-offline-entry.participant-add-manual > summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-participant-offline-entry.participant-add-manual > summary::after {
    content: "‹" !important;
    color: var(--ledger-brand) !important;
    font-size: 22px !important;
    font-weight: 600 !important;
    line-height: 1 !important;
    text-align: center !important;
    transform: rotate(0deg) !important;
    transition: transform 180ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .event-participant-offline-entry.participant-add-manual[open] > summary::after {
    transform: rotate(-90deg) !important;
  }

  html.ledger-workspace-v1 .event-participant-offline-form {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: stretch !important;
    gap: 8px !important;
    padding: 12px !important;
    border-block-start: 1px solid var(--ledger-line) !important;
    background: rgba(236, 248, 246, 0.48) !important;
  }

  html.ledger-workspace-v1 .event-participant-offline-form .guest-input,
  html.ledger-workspace-v1 .event-participant-offline-form button {
    min-height: 48px !important;
  }

  html.ledger-workspace-v1 .participant-add-privacy-note {
    display: flex !important;
    align-items: flex-start !important;
    gap: 8px !important;
    margin: 2px 4px 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    line-height: 1.55 !important;
  }

  html.ledger-workspace-v1 .participant-add-privacy-note strong {
    flex: 0 0 auto !important;
    color: var(--ledger-brand) !important;
    font-weight: 800 !important;
  }

  @media (max-width: 520px) {
    html.ledger-workspace-v1 .event-participant-add-options .participant-add-choice {
      min-height: 82px !important;
    }

    html.ledger-workspace-v1 button.participant-add-choice {
      grid-template-columns: 40px minmax(0, 1fr) !important;
      gap: 8px !important;
      min-height: 82px !important;
      padding: 14px !important;
    }

    html.ledger-workspace-v1 button.participant-add-choice.is-primary {
      min-height: 96px !important;
    }

    html.ledger-workspace-v1 .event-participant-add-options .command-card-icon {
      width: 40px !important;
      height: 40px !important;
      border-radius: 12px !important;
    }

    html.ledger-workspace-v1 .event-participant-add-options .participant-invite-copy > span {
      display: block !important;
    }

    html.ledger-workspace-v1 .event-participant-offline-form {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .event-participant-offline-form button {
      width: 100% !important;
    }
  }

  html.ledger-workspace-v1 .is-long-expense-ledger .expense-row {
    content-visibility: auto;
    contain-intrinsic-block-size: auto 112px;
  }

  /* Friends hub: one calm home for accounts, offline names and recurring groups. */
  html.ledger-workspace-v1 .friends-hub-screen {
    width: min(100%, 780px) !important;
  }

  html.ledger-workspace-v1 .friends-hub-screen > .top {
    margin-bottom: 18px !important;
  }

  html.ledger-workspace-v1 .friends-hub-tabs {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 5px !important;
    margin: 0 0 18px !important;
    padding: 5px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 16px !important;
    background: rgba(255, 255, 255, 0.72) !important;
    box-shadow:
      0 10px 28px -24px rgba(12, 27, 32, 0.42),
      inset 0 1px 0 rgba(255, 255, 255, 0.92) !important;
  }

  html.ledger-workspace-v1 .friends-hub-tab {
    min-width: 0 !important;
    min-height: 48px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    padding: 9px 14px !important;
    border: 0 !important;
    border-radius: 12px !important;
    color: var(--ledger-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 14px !important;
    font-weight: 750 !important;
    transition:
      color 170ms cubic-bezier(0.2, 0, 0, 1),
      background-color 170ms cubic-bezier(0.2, 0, 0, 1),
      box-shadow 170ms cubic-bezier(0.2, 0, 0, 1),
      transform 170ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .friends-hub-tab > strong {
    min-width: 25px !important;
    min-height: 25px !important;
    display: inline-grid !important;
    place-items: center !important;
    padding: 2px 6px !important;
    border-radius: 9px !important;
    color: inherit !important;
    background: rgba(83, 103, 99, 0.09) !important;
    font-size: 11px !important;
  }

  html.ledger-workspace-v1 .friends-hub-tab:hover {
    color: var(--ledger-brand) !important;
    background: rgba(230, 243, 240, 0.68) !important;
  }

  html.ledger-workspace-v1 .friends-hub-tab:active {
    transform: scale(0.985) !important;
  }

  html.ledger-workspace-v1 .friends-hub-tab:focus-visible {
    outline: 0 !important;
    box-shadow: var(--ledger-focus-ring) !important;
  }

  html.ledger-workspace-v1 .friends-hub-tab.is-active {
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow:
      0 10px 20px -15px rgba(6, 75, 67, 0.82),
      inset 0 1px 0 rgba(255, 255, 255, 0.16) !important;
  }

  html.ledger-workspace-v1 .friends-hub-tab.is-active > strong {
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.16) !important;
  }

  html.ledger-workspace-v1 .friends-hub-panel {
    width: 100% !important;
    min-width: 0 !important;
    display: grid !important;
    gap: 16px !important;
  }

  html.ledger-workspace-v1 .friend-privacy-note {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 3px !important;
    padding: 14px 16px !important;
    border: 1px solid rgba(11, 74, 56, 0.13) !important;
    border-radius: 16px !important;
    color: var(--ledger-ink) !important;
    background:
      linear-gradient(115deg, rgba(230, 243, 240, 0.88), rgba(255, 255, 255, 0.92)) !important;
    box-shadow: 0 12px 28px -26px rgba(6, 75, 67, 0.52) !important;
  }

  html.ledger-workspace-v1 .friend-privacy-note strong {
    font-size: 14px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .friend-privacy-note span {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 560 !important;
    line-height: 1.5 !important;
  }

  html.ledger-workspace-v1 .friend-network-panel {
    min-width: 0 !important;
    display: grid !important;
    gap: 13px !important;
    padding: 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 18px !important;
    color: var(--ledger-ink) !important;
    background: rgba(255, 255, 255, 0.92) !important;
    box-shadow: 0 16px 36px -30px rgba(12, 27, 32, 0.5) !important;
  }

  html.ledger-workspace-v1 .friend-network-panel.is-loading {
    grid-template-columns: 30px minmax(0, 1fr) !important;
    align-items: center !important;
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .friend-network-panel.is-error {
    border-color: rgba(185, 71, 57, 0.17) !important;
    background: rgba(255, 250, 249, 0.96) !important;
  }

  html.ledger-workspace-v1 .friend-network-stale {
    padding: 8px 10px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 8px !important;
    color: var(--ledger-muted) !important;
    background: #f8fafc !important;
    font-size: 12px !important;
    font-weight: 560 !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .friend-network-panel > strong {
    font-size: 14px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .friend-network-panel > span {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    line-height: 1.5 !important;
  }

  html.ledger-workspace-v1 .friend-network-panel.is-error > button {
    width: max-content !important;
    min-height: 44px !important;
  }

  html.ledger-workspace-v1 .friend-network-heading {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .friend-network-heading > span {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .friend-network-heading strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 820 !important;
  }

  html.ledger-workspace-v1 .friend-network-heading small {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 540 !important;
    line-height: 1.4 !important;
  }

  html.ledger-workspace-v1 .friend-network-heading button {
    min-height: 44px !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .friend-request-form {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: end !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .friend-request-form .field {
    min-width: 0 !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .friend-request-form input {
    min-height: 48px !important;
    border-color: var(--ledger-line) !important;
    border-radius: 14px !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .friend-request-form button {
    min-width: 116px !important;
    min-height: 48px !important;
  }

  html.ledger-workspace-v1 .friend-network-skeleton {
    width: 28px !important;
    height: 28px !important;
    border-radius: 10px !important;
    background:
      linear-gradient(
        100deg,
        rgba(209, 221, 218, 0.58) 20%,
        rgba(243, 248, 247, 0.96) 44%,
        rgba(209, 221, 218, 0.58) 68%
      ) !important;
    background-size: 220% 100% !important;
    animation: ledger-friend-skeleton 1.15s ease-in-out infinite !important;
  }

  html.ledger-workspace-v1 .friend-request-section {
    min-width: 0 !important;
    overflow: hidden !important;
    border: 1px solid rgba(11, 74, 56, 0.14) !important;
    border-radius: 18px !important;
    background: #ffffff !important;
    box-shadow: 0 12px 30px -26px rgba(12, 27, 32, 0.42) !important;
  }

  html.ledger-workspace-v1 .friend-request-section.is-incoming {
    border-color: rgba(6, 125, 111, 0.22) !important;
  }

  html.ledger-workspace-v1 .friend-request-section.is-incoming .friend-identity-heading {
    background: linear-gradient(110deg, rgba(219, 242, 237, 0.96), #f8fbfa) !important;
  }

  html.ledger-workspace-v1 .friend-request-section.is-outgoing .friend-identity-heading {
    background: rgba(246, 248, 248, 0.96) !important;
  }

  html.ledger-workspace-v1 .friend-request-actions {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 7px !important;
  }

  html.ledger-workspace-v1 .friend-request-actions button {
    min-width: 62px !important;
    min-height: 44px !important;
    padding-inline: 11px !important;
    font-size: 12px !important;
  }

  @keyframes ledger-friend-skeleton {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -120% 0;
    }
  }

  html.ledger-workspace-v1 .friends-toolbar {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: end !important;
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .friends-search-field {
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .friends-search-field > span {
    font-size: 12px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .friends-search-field input {
    min-height: 48px !important;
    padding-inline: 14px !important;
    border-color: var(--ledger-line) !important;
    border-radius: 14px !important;
    background: rgba(255, 255, 255, 0.9) !important;
    box-shadow: 0 8px 22px -22px rgba(12, 27, 32, 0.46) !important;
  }

  html.ledger-workspace-v1 .friends-add-person {
    min-width: 132px !important;
  }

  html.ledger-workspace-v1 .friends-add-person > summary {
    min-width: 132px !important;
    min-height: 48px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    list-style: none !important;
    transition-property: transform, background-color, box-shadow !important;
    transition-duration: 180ms !important;
  }

  html.ledger-workspace-v1 .friends-add-person > summary:active {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .friends-add-person > summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .friends-add-person[open] {
    grid-column: 1 / -1 !important;
  }

  html.ledger-workspace-v1 .friends-add-person[open] > summary {
    width: max-content !important;
    min-height: 44px !important;
    margin-inline-start: auto !important;
  }

  html.ledger-workspace-v1 .friends-add-person-panel {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    align-items: stretch !important;
    gap: 12px !important;
    margin-top: 12px !important;
  }

  html.ledger-workspace-v1 .friends-add-person-panel .friend-network-panel,
  html.ledger-workspace-v1 .friends-offline-panel {
    min-width: 0 !important;
    align-content: start !important;
    border-radius: 18px !important;
  }

  html.ledger-workspace-v1 .friends-offline-panel {
    display: grid !important;
    gap: 12px !important;
    padding: 16px !important;
    border: 1px solid var(--ledger-line) !important;
    background: rgba(249, 250, 250, 0.96) !important;
    box-shadow: 0 16px 36px -30px rgba(12, 27, 32, 0.5) !important;
  }

  html.ledger-workspace-v1 .friends-offline-panel > div:first-of-type {
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .friends-offline-panel strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 820 !important;
  }

  html.ledger-workspace-v1 .friends-offline-panel small {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    line-height: 1.4 !important;
  }

  html.ledger-workspace-v1 .friend-add-kind {
    width: max-content !important;
    display: inline-flex !important;
    align-items: center !important;
    min-height: 25px !important;
    padding: 4px 8px !important;
    border-radius: 8px !important;
    font-size: 10px !important;
    font-weight: 820 !important;
  }

  html.ledger-workspace-v1 .friend-add-kind.is-online {
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .friend-add-kind.is-offline {
    color: var(--ledger-muted) !important;
    background: rgba(83, 103, 99, 0.09) !important;
  }

  html.ledger-workspace-v1 .friends-add-offline-form {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: end !important;
    gap: 10px !important;
    margin-top: 8px !important;
  }

  html.ledger-workspace-v1 .friends-add-offline-form .field {
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .friends-add-offline-form button {
    min-height: 48px !important;
  }

  html.ledger-workspace-v1 .friends-roster {
    display: grid !important;
    gap: 14px !important;
  }

  html.ledger-workspace-v1 .friend-identity-section {
    min-width: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 18px !important;
    background: #ffffff !important;
    box-shadow: 0 12px 30px -26px rgba(12, 27, 32, 0.42) !important;
  }

  html.ledger-workspace-v1 .friend-identity-section.is-offline {
    background: rgba(251, 252, 252, 0.96) !important;
  }

  html.ledger-workspace-v1 .friend-identity-heading {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: 9px minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 11px !important;
    padding: 15px 17px !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .friend-identity-section.is-connected .friend-identity-heading {
    background: linear-gradient(110deg, rgba(230, 243, 240, 0.94), #f8fbfa) !important;
  }

  html.ledger-workspace-v1 .friend-identity-marker {
    width: 8px !important;
    height: 8px !important;
    border: 1px solid var(--ledger-muted) !important;
    border-radius: 50% !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .is-connected > .friend-identity-heading .friend-identity-marker {
    border-color: var(--ledger-positive) !important;
    background: var(--ledger-positive) !important;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12) !important;
  }

  html.ledger-workspace-v1 .friend-identity-heading > span:nth-child(2) {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .friend-identity-heading strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .friend-identity-heading small,
  html.ledger-workspace-v1 .friend-identity-heading bdi {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .friend-list {
    display: grid !important;
  }

  html.ledger-workspace-v1 .friend-row {
    min-width: 0 !important;
    min-height: 72px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 12px 16px !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .friend-row:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .friend-row[hidden],
  html.ledger-workspace-v1 .friend-identity-section[hidden],
  html.ledger-workspace-v1 .friends-search-empty[hidden] {
    display: none !important;
  }

  html.ledger-workspace-v1 .friend-row-person {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: 44px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .friend-row-person > .avatar {
    width: 44px !important;
    height: 44px !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1 .friend-row-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .friend-row-name {
    min-width: 0 !important;
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 6px !important;
  }

  html.ledger-workspace-v1 .friend-row-name > strong {
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 780 !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .friend-row-copy > small {
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 540 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .friend-username {
    width: max-content !important;
    max-width: 100% !important;
    overflow: hidden !important;
    color: var(--ledger-brand) !important;
    font-family: Inter, var(--font-hebrew) !important;
    font-size: 12px !important;
    font-weight: 760 !important;
    line-height: 1.25 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .friend-username.is-own {
    margin-top: 1px !important;
    padding: 4px 8px !important;
    border: 1px solid rgba(6, 125, 111, 0.13) !important;
    border-radius: 8px !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .profile-username-section {
    min-width: 0 !important;
    display: grid !important;
    gap: 6px !important;
    padding: 14px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 16px !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .profile-username-field {
    min-width: 0 !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .profile-username-field input {
    min-height: 48px !important;
    direction: ltr !important;
    text-align: left !important;
  }

  html.ledger-workspace-v1 .profile-username-field > small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 540 !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .profile-username-status {
    min-height: 52px !important;
    display: grid !important;
    grid-template-columns: 28px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 12px 14px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 14px !important;
    color: var(--ledger-muted) !important;
    background: var(--ledger-surface-soft) !important;
    font-size: 12px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .friend-remove-button,
  html.ledger-workspace-v1 .friend-row-state {
    min-width: 54px !important;
    min-height: 36px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 7px 10px !important;
    border-radius: 10px !important;
    font-size: 11px !important;
    font-weight: 750 !important;
  }

  html.ledger-workspace-v1 .participant-connection-badge.is-duplicate {
    color: #92501f !important;
    background: rgba(210, 132, 63, 0.12) !important;
  }

  html.ledger-workspace-v1 .friend-remove-button {
    width: 44px !important;
    min-width: 44px !important;
    min-height: 44px !important;
    padding: 0 !important;
    border: 1px solid rgba(185, 71, 57, 0.18) !important;
    color: var(--ledger-negative) !important;
    background: rgba(185, 71, 57, 0.055) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .friend-remove-button svg {
    width: 19px !important;
    height: 19px !important;
  }

  html.ledger-workspace-v1 .friend-remove-button:hover:not(:disabled) {
    border-color: rgba(185, 71, 57, 0.34) !important;
    background: rgba(185, 71, 57, 0.09) !important;
  }

  html.ledger-workspace-v1 .friend-remove-button:disabled {
    color: var(--ledger-faint) !important;
    border-color: var(--ledger-line) !important;
    background: var(--ledger-surface-soft) !important;
    opacity: 0.62 !important;
  }

  html.ledger-workspace-v1 .friend-row-state {
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .friends-search-empty {
    min-height: 126px !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .friends-merge-entry {
    width: 100% !important;
    min-height: 70px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 13px 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 16px !important;
    color: var(--ledger-ink) !important;
    background: rgba(255, 255, 255, 0.78) !important;
    box-shadow: 0 10px 24px -24px rgba(12, 27, 32, 0.46) !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .friends-merge-entry > span:first-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .friends-merge-entry strong {
    font-size: 14px !important;
    font-weight: 780 !important;
  }

  html.ledger-workspace-v1 .friends-merge-entry small {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .friends-merge-entry > span:last-child {
    color: var(--ledger-brand) !important;
    font-size: 25px !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .friends-merge-entry:hover {
    border-color: rgba(11, 74, 56, 0.2) !important;
    background: var(--ledger-accent-soft) !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 .friends-merge-entry.has-duplicates {
    border-color: rgba(210, 132, 63, 0.25) !important;
    background: linear-gradient(110deg, rgba(255, 246, 235, 0.94), #ffffff) !important;
    box-shadow: 0 14px 30px -26px rgba(146, 80, 31, 0.52) !important;
  }

  html.ledger-workspace-v1 .friends-merge-entry.has-duplicates > span:last-child {
    color: #92501f !important;
  }

  html.ledger-workspace-v1 .friends-groups-heading {
    align-items: center !important;
    gap: 12px !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .friends-groups-heading .primary-button {
    min-height: 46px !important;
  }

  @media (max-width: 560px) {
    html.ledger-workspace-v1 .friends-hub-tabs {
      margin-bottom: 14px !important;
    }

    html.ledger-workspace-v1 .friends-toolbar {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 10px !important;
    }

    html.ledger-workspace-v1 .friends-add-person,
    html.ledger-workspace-v1 .friends-add-person > summary {
      width: 100% !important;
    }

    html.ledger-workspace-v1 .friends-add-person[open] {
      grid-column: 1 !important;
    }

    html.ledger-workspace-v1 .friends-add-person-panel {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .friends-add-offline-form {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .friends-add-offline-form button {
      width: 100% !important;
    }

    html.ledger-workspace-v1 .friend-network-heading,
    html.ledger-workspace-v1 .friend-request-form {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .friend-network-heading button,
    html.ledger-workspace-v1 .friend-request-form button,
    html.ledger-workspace-v1 .friend-network-panel.is-error > button {
      width: 100% !important;
    }

    html.ledger-workspace-v1 .friend-identity-heading {
      padding: 13px 14px !important;
    }

    html.ledger-workspace-v1 .friend-identity-heading small {
      display: block !important;
    }

    html.ledger-workspace-v1 .friend-row {
      gap: 8px !important;
      padding: 11px 13px !important;
    }

    html.ledger-workspace-v1 .friend-row-person {
      grid-template-columns: 44px minmax(0, 1fr) !important;
      gap: 9px !important;
    }

    html.ledger-workspace-v1 .friend-row-person > .avatar {
      width: 44px !important;
      height: 44px !important;
    }

    html.ledger-workspace-v1 .friend-request-row {
      grid-template-columns: minmax(0, 1fr) !important;
      align-items: stretch !important;
    }

    html.ledger-workspace-v1 .friend-request-actions {
      justify-content: stretch !important;
      padding-inline-start: 49px !important;
    }

    html.ledger-workspace-v1 .friend-request-actions button {
      flex: 1 1 0 !important;
    }

    html.ledger-workspace-v1 .friend-row-name .participant-connection-badge {
      font-size: 9.5px !important;
    }

    html.ledger-workspace-v1 .friend-remove-button,
    html.ledger-workspace-v1 .friend-row-state {
      min-width: 48px !important;
      padding-inline: 8px !important;
    }

    html.ledger-workspace-v1 .friends-groups-heading {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .friends-groups-heading .primary-button {
      width: 100% !important;
    }
  }

  @media (max-width: 360px) {
    html.ledger-workspace-v1 .friend-row-name .participant-connection-badge {
      display: none !important;
    }

    html.ledger-workspace-v1 .friend-identity-heading bdi {
      display: none !important;
    }
  }

  /* Joining by a received link stays available on home without duplicating event sharing. */
  html.ledger-workspace-v1 .home-event-tools.home-invite-hub {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 16px !important;
    margin: 0 0 28px !important;
    padding: 18px !important;
    border: 1px solid rgba(7, 87, 78, 0.1) !important;
    border-radius: 8px !important;
    background:
      linear-gradient(120deg, rgba(236, 248, 245, 0.88), rgba(255, 255, 255, 0.98) 58%),
      var(--ledger-surface) !important;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.96) inset,
      0 12px 30px rgba(7, 44, 39, 0.07) !important;
  }

  html.ledger-workspace-v1 .home-invite-heading {
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 16px !important;
  }

  html.ledger-workspace-v1 .home-invite-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .home-invite-kicker {
    color: var(--ledger-brand) !important;
    font-size: 0.76rem !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .home-invite-copy h2 {
    margin: 0 !important;
    color: var(--ledger-ink) !important;
    font-size: 1.08rem !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .home-invite-copy p {
    margin: 0 !important;
    font-size: 0.84rem !important;
    line-height: 1.5 !important;
  }

  html.ledger-workspace-v1 .home-invite-heading .home-groups-button {
    min-width: 94px !important;
    min-height: 44px !important;
    flex: 0 0 auto !important;
    padding-inline: 13px !important;
    border-radius: 8px !important;
  }

  html.ledger-workspace-v1 .home-invite-shortcuts {
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .home-invite-form {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: stretch !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .home-invite-field {
    min-width: 0 !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .home-invite-field input {
    width: 100% !important;
    min-height: 50px !important;
    margin: 0 !important;
    padding-inline: 15px !important;
    border: 1px solid rgba(7, 87, 78, 0.16) !important;
    border-radius: 8px !important;
    color: var(--ledger-ink) !important;
    background: rgba(255, 255, 255, 0.98) !important;
    box-shadow: 0 1px 2px rgba(7, 27, 24, 0.035) inset !important;
    transition-property: border-color, box-shadow, background-color !important;
    transition-duration: 180ms !important;
    direction: ltr !important;
    text-align: left !important;
  }

  html.ledger-workspace-v1 .home-invite-field input:placeholder-shown {
    direction: rtl !important;
    text-align: right !important;
  }

  html.ledger-workspace-v1 .home-invite-field input:focus {
    border-color: rgba(8, 123, 116, 0.62) !important;
    background: #fff !important;
    box-shadow:
      0 0 0 3px rgba(8, 123, 116, 0.12),
      0 1px 2px rgba(7, 27, 24, 0.035) inset !important;
  }

  html.ledger-workspace-v1 .home-invite-form .home-join-button {
    min-width: 102px !important;
    min-height: 50px !important;
    padding-inline: 18px !important;
    border-radius: 8px !important;
    transition-property: transform, box-shadow, background-color !important;
    transition-duration: 180ms !important;
  }

  html.ledger-workspace-v1 .home-invite-form .home-join-button:active {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .home-invite-error {
    margin: -5px 2px 0 !important;
  }

  @media (max-width: 520px) {
    html.ledger-workspace-v1 .home-event-tools.home-invite-hub {
      gap: 14px !important;
      margin-bottom: 22px !important;
      padding: 16px !important;
    }

    html.ledger-workspace-v1 .home-invite-heading {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      align-items: flex-start !important;
      gap: 10px !important;
    }

    html.ledger-workspace-v1 .home-invite-heading .home-groups-button {
      width: auto !important;
      min-width: 82px !important;
    }

    html.ledger-workspace-v1 .home-invite-form {
      grid-template-columns: minmax(0, 1fr) 88px !important;
      gap: 8px !important;
    }

    html.ledger-workspace-v1 .home-invite-form .home-join-button {
      min-width: 88px !important;
      padding-inline: 12px !important;
    }
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .home-invite-heading,
  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .home-invite-form {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .home-invite-heading {
    display: grid !important;
    align-items: stretch !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .home-invite-heading .home-groups-button,
  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .home-invite-form .home-join-button {
    width: 100% !important;
  }

  /* Match the mobile screen gutter exactly so the full-width identity never drifts sideways. */
  @media (max-width: 720px) {
    html.product-v1.ledger-workspace-v1.circle-design-v1
      .screen.product-home-screen.product-empty-home
      > .product-app-identity.is-home-context {
      width: calc(100% + 28px) !important;
      margin-inline: -14px !important;
    }
  }

  @media (max-width: 380px) {
    html.product-v1.ledger-workspace-v1.circle-design-v1
      .screen.product-home-screen.product-empty-home
      > .product-app-identity.is-home-context {
      width: calc(100% + 24px) !important;
      margin-inline: -12px !important;
    }
  }

  /* Keep the last actionable control fully scrollable above fixed mobile chrome. */
  html.ledger-workspace-v1,
  html.ledger-workspace-v1 body {
    scroll-padding-block-end: calc(118px + env(safe-area-inset-bottom)) !important;
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1 .screen :is(button, [role="button"], input, summary) {
      scroll-margin-block-end: calc(156px + env(safe-area-inset-bottom)) !important;
    }
  }

  /* Keep the event's primary action visible without covering expense content. */
  html.ledger-workspace-v1 .event-action-dock {
    position: relative !important;
    inset: auto !important;
    left: auto !important;
    right: auto !important;
    z-index: auto !important;
    width: 100% !important;
    min-height: 72px !important;
    margin: 0 0 18px !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .screen.event-has-action-dock {
    padding-bottom: calc(140px + env(safe-area-inset-bottom)) !important;
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1 .screen {
      padding-bottom: calc(140px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1 .screen.event-has-action-dock {
      padding-bottom: calc(140px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1 .event-action-dock {
      position: relative !important;
      inset: auto !important;
      left: auto !important;
      right: auto !important;
      z-index: auto !important;
      width: 100% !important;
      min-height: 70px !important;
      margin: 0 0 16px !important;
      padding: 9px 10px 9px 14px !important;
      transform: none !important;
    }

    html.ledger-workspace-v1
      :is(
        .settlement-hero-actions,
        .profile-setup-panel > [data-action="save-profile"],
        .account-profile-actions,
        .account-danger-zone
      ) {
      scroll-margin-block-end: calc(112px + env(safe-area-inset-bottom)) !important;
    }
  }

  /* Final consistency pass: every route now speaks the approved home language. */
  html.ledger-workspace-v1 {
    --ledger-page-gutter: 20px;
    --ledger-task-radius: 18px;
    --ledger-task-shadow:
      0 18px 42px -34px rgba(6, 54, 40, 0.48),
      0 2px 8px rgba(12, 27, 32, 0.035);
  }

  html.ledger-workspace-v1 .screen,
  html.ledger-workspace-v1 .friends-hub-screen {
    width: min(100%, 448px) !important;
    max-width: 448px !important;
    padding-inline: var(--ledger-page-gutter) !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top {
    min-height: 148px !important;
    align-content: end !important;
    gap: 14px !important;
    margin: 12px 0 20px !important;
    padding: 22px !important;
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    border-radius: 24px !important;
    background: var(--ledger-brand) !important;
    box-shadow:
      0 28px 62px -30px rgba(6, 54, 40, 0.78),
      0 18px 40px -24px rgba(6, 78, 59, 0.62),
      inset 0 1px 0 rgba(255, 255, 255, 0.14) !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    h1,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    h1 {
    max-width: 16ch !important;
    font-size: 28px !important;
    line-height: 1.08 !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .eyebrow {
    margin-bottom: 5px !important;
    font-size: 11px !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .muted {
    max-width: 34ch !important;
    margin-top: 8px !important;
    font-size: 12.5px !important;
    line-height: 1.48 !important;
  }

  html.ledger-workspace-v1
    .screen[data-screen-kind="event"]
    > .top {
    min-height: 188px !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"])
    > :is(.panel, .create-event-panel, .join-event-panel),
  html.ledger-workspace-v1 .profile-setup-panel,
  html.ledger-workspace-v1 .group-workflow-screen > :is(
    .group-create-panel,
    .edit-group-panel,
    .known-participants-panel,
    .merge-participants-panel
  ) {
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: rgba(255, 255, 255, 0.96) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"])
    > .section {
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1
    .screen[data-event-view="summary"]
    > .settlement-stage {
    padding: 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: rgba(255, 255, 255, 0.96) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .event-workspace-nav,
  html.ledger-workspace-v1 .friends-hub-tabs,
  html.ledger-workspace-v1 .event-creation-progress {
    border: 1px solid var(--ledger-line) !important;
    border-radius: 17px !important;
    background: rgba(255, 255, 255, 0.78) !important;
    box-shadow:
      0 12px 28px -25px rgba(12, 27, 32, 0.34),
      inset 0 1px 0 rgba(255, 255, 255, 0.92) !important;
  }

  html.ledger-workspace-v1 .friends-hub-tabs {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 3px !important;
    margin-bottom: 16px !important;
    padding: 4px !important;
  }

  html.ledger-workspace-v1 .friends-hub-tab {
    min-height: 50px !important;
    gap: 5px !important;
    padding: 8px 6px !important;
    border-radius: 13px !important;
    font-size: 12.5px !important;
  }

  html.ledger-workspace-v1 .friends-hub-tab > strong {
    min-width: 22px !important;
    min-height: 22px !important;
    padding: 2px 5px !important;
    border-radius: 8px !important;
    font-size: 10px !important;
  }

  html.ledger-workspace-v1 .friends-hub-tab.is-active {
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: inset 0 0 0 1px rgba(11, 74, 56, 0.08) !important;
  }

  html.ledger-workspace-v1 .friends-hub-tab.is-active > strong {
    color: var(--ledger-brand) !important;
    background: rgba(255, 255, 255, 0.72) !important;
  }

  html.ledger-workspace-v1 .friends-hub-tab > strong.has-new-requests {
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .friends-hub-panel {
    gap: 14px !important;
  }

  html.ledger-workspace-v1 .friend-privacy-note {
    display: block !important;
    padding: 0 2px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .friend-privacy-note summary {
    min-height: 44px !important;
    display: list-item !important;
    align-content: center !important;
    color: var(--ledger-ink) !important;
    font-size: 12.5px !important;
    font-weight: 760 !important;
    line-height: 1.35 !important;
    cursor: pointer !important;
  }

  html.ledger-workspace-v1 .friend-privacy-note summary::marker {
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .friend-privacy-note summary:focus-visible {
    outline: 3px solid rgba(43, 184, 194, 0.28) !important;
    outline-offset: 2px !important;
  }

  html.ledger-workspace-v1 .friend-privacy-note p {
    margin: 0 0 9px !important;
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 560 !important;
    line-height: 1.4 !important;
  }

  html.ledger-workspace-v1 .blocked-users-list {
    display: grid !important;
    gap: 8px !important;
    padding-block-end: 8px !important;
  }

  html.ledger-workspace-v1 .blocked-user-row {
    min-width: 0 !important;
    min-height: 56px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding: 8px 10px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 12px !important;
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1 .blocked-user-row > span {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .blocked-user-row strong,
  html.ledger-workspace-v1 .blocked-user-row small {
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .blocked-user-row .secondary-button {
    flex: 0 0 auto !important;
    min-height: 44px !important;
    padding-inline: 12px !important;
  }

  html.ledger-workspace-v1 .friends-panel-heading {
    min-width: 0 !important;
    display: flex !important;
    align-items: flex-end !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding: 2px !important;
  }

  html.ledger-workspace-v1 .friends-panel-heading h2 {
    margin: 0 !important;
    color: var(--ledger-ink) !important;
    font-size: 20px !important;
    font-weight: 850 !important;
  }

  html.ledger-workspace-v1 .friends-panel-heading p {
    margin: 3px 0 0 !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1 .friends-requests-empty {
    min-height: 174px !important;
    display: grid !important;
    place-items: center !important;
    align-content: center !important;
    gap: 5px !important;
    padding: 24px !important;
    border: 1px dashed rgba(11, 74, 56, 0.18) !important;
    border-radius: var(--ledger-task-radius) !important;
    color: var(--ledger-muted) !important;
    background: rgba(255, 255, 255, 0.52) !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .friends-requests-empty strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
  }

  html.ledger-workspace-v1 .friends-requests-empty span {
    max-width: 30ch !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .friends-roster {
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .friend-identity-section,
  html.ledger-workspace-v1 .friend-request-section {
    border-radius: var(--ledger-task-radius) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .friends-groups-heading {
    align-items: flex-end !important;
    margin-bottom: 4px !important;
  }

  html.ledger-workspace-v1 .groups-list-section > .stack {
    gap: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: rgba(255, 255, 255, 0.96) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .groups-list-section > .stack.is-empty {
    overflow: visible !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .groups-list-section > .stack.is-empty > .groups-empty-state {
    min-height: 210px !important;
    margin: 0 !important;
    border: 1px dashed rgba(11, 74, 56, 0.18) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: rgba(255, 255, 255, 0.72) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .groups-list-section > .stack > .group-row {
    min-height: 104px !important;
    padding: 16px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .groups-list-section > .stack > .group-row:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .groups-list-section .group-archive-button {
    width: 44px !important;
    min-width: 44px !important;
    min-height: 44px !important;
    padding: 0 !important;
  }

  html.ledger-workspace-v1 .groups-list-section .group-archive-button svg {
    width: 19px !important;
    height: 19px !important;
  }

  html.ledger-workspace-v1 .group-workflow-screen .group-editor-disclosure {
    border-block: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .group-workflow-screen .group-editor-disclosure > summary {
    min-height: 68px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto 20px !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 11px 2px !important;
    list-style: none !important;
    cursor: pointer !important;
  }

  html.ledger-workspace-v1 .group-workflow-screen .group-editor-disclosure > summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .group-editor-disclosure-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .group-editor-disclosure-copy strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 720 !important;
  }

  html.ledger-workspace-v1 .group-editor-disclosure-copy small,
  html.ledger-workspace-v1 .group-editor-disclosure-count {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 580 !important;
    line-height: 1.4 !important;
  }

  html.ledger-workspace-v1 .group-editor-disclosure-count {
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .group-editor-disclosure-chevron {
    display: inline-grid !important;
    place-items: center !important;
    color: var(--ledger-muted) !important;
    transition: transform 160ms ease !important;
  }

  html.ledger-workspace-v1 .group-editor-disclosure-chevron svg {
    width: 18px !important;
    height: 18px !important;
  }

  html.ledger-workspace-v1 .group-editor-disclosure[open] .group-editor-disclosure-chevron {
    transform: rotate(-90deg) !important;
  }

  html.ledger-workspace-v1 .group-editor-disclosure-body {
    padding: 4px 2px 14px !important;
  }

  html.ledger-workspace-v1 .group-editor-offline-add > summary {
    grid-template-columns: minmax(0, 1fr) 20px !important;
  }

  html.ledger-workspace-v1 .group-editor-offline-add .inline-actions {
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .group-create-panel > [data-action="create-group"] {
    width: 100% !important;
    min-height: 52px !important;
  }

  html.ledger-workspace-v1 .profile-setup-panel,
  html.ledger-workspace-v1 .create-event-panel,
  html.ledger-workspace-v1 .join-event-panel,
  html.ledger-workspace-v1 .group-create-panel,
  html.ledger-workspace-v1 .edit-group-panel {
    padding: 20px !important;
  }

  html.ledger-workspace-v1
    :is(
      .profile-setup-panel,
      .create-event-panel,
      .join-event-panel,
      .group-create-panel,
      .edit-group-panel
    )
    > * + * {
    margin-block-start: 16px;
  }

  html.ledger-workspace-v1 .field > span,
  html.ledger-workspace-v1 fieldset > legend {
    color: var(--ledger-ink) !important;
    font-size: 12.5px !important;
    font-weight: 760 !important;
  }

  html.ledger-workspace-v1 input,
  html.ledger-workspace-v1 select,
  html.ledger-workspace-v1 textarea {
    border-radius: 14px !important;
    background: #ffffff !important;
    box-shadow: inset 0 1px 2px rgba(12, 27, 32, 0.025) !important;
  }

  html.ledger-workspace-v1 :is(.primary-button, .secondary-button) {
    border-radius: 14px !important;
  }

  html.ledger-workspace-v1 .primary-button {
    box-shadow:
      0 12px 24px -18px rgba(6, 54, 40, 0.8),
      inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
  }

  html.ledger-workspace-v1 .secondary-button {
    box-shadow: 0 8px 18px -17px rgba(12, 27, 32, 0.38) !important;
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1 {
      --ledger-page-gutter: 14px;
    }

    html.ledger-workspace-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top,
    html.ledger-workspace-v1.circle-design-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top {
      min-height: 142px !important;
      margin-block: 10px 18px !important;
      padding: 20px !important;
      border-radius: 24px !important;
    }

    html.ledger-workspace-v1
      .screen[data-screen-kind="event"]
      > .top {
      min-height: 184px !important;
    }

    html.ledger-workspace-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top
      h1 {
      font-size: 27px !important;
    }

    html.ledger-workspace-v1 .profile-setup-panel,
    html.ledger-workspace-v1 .create-event-panel,
    html.ledger-workspace-v1 .join-event-panel,
    html.ledger-workspace-v1 .group-create-panel,
    html.ledger-workspace-v1 .edit-group-panel {
      padding: 17px !important;
    }

    html.ledger-workspace-v1 .friends-toolbar {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .friends-add-person,
    html.ledger-workspace-v1 .friends-add-person > summary {
      width: 100% !important;
    }
  }

  @media (max-width: 380px) {
    html.ledger-workspace-v1 {
      --ledger-page-gutter: 12px;
    }

    html.ledger-workspace-v1 .friends-hub-tab {
      min-height: 48px !important;
      gap: 3px !important;
      padding-inline: 4px !important;
      font-size: 11.5px !important;
    }

    html.ledger-workspace-v1 .friends-hub-tab > strong {
      min-width: 20px !important;
      min-height: 20px !important;
      font-size: 9px !important;
    }
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .screen:not([data-screen-kind="home"])
    > .top {
    min-height: 0 !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .friends-hub-tabs {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .event-workspace-nav {
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.85fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    :is(.friends-toolbar, .friend-network-heading, .friend-request-form) {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    :is(
      .friends-add-person,
      .friends-add-person > summary,
      .friend-network-heading button,
      .friend-request-form button
    ) {
    width: 100% !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .groups-list-section
    > .stack
    > .group-row {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html.ledger-workspace-v1
    :is(
      .profile-setup-panel,
      .create-event-panel,
      .join-event-panel,
      .group-create-panel,
      .edit-group-panel
    )
    > .field-error {
    margin-block-start: 6px !important;
  }

  /* Focused windows and the inbox inherit the same compact home surface system. */
  html.ledger-workspace-v1 .notification-inbox-screen {
    width: min(100%, 448px) !important;
    max-width: 448px !important;
  }

  html.ledger-workspace-v1
    .notification-inbox-header
    > .notification-mark-all {
    position: relative !important;
    z-index: 1 !important;
    width: max-content !important;
    min-height: 46px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    justify-self: start !important;
    grid-area: actions !important;
    margin: 0 !important;
    padding: 0 14px !important;
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    border-radius: 14px !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow:
      0 14px 26px -18px rgba(1, 24, 18, 0.8),
      inset 0 1px 0 #ffffff !important;
    font-size: 12.5px !important;
    font-weight: 780 !important;
  }

  html.ledger-workspace-v1
    .notification-inbox-header
    > .notification-mark-all:hover:not(:disabled) {
    color: #062f25 !important;
    background: #f4fffb !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1 .notification-inbox-panel {
    overflow: hidden !important;
    padding: 0 !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: rgba(255, 255, 255, 0.96) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .notification-inbox-list,
  html.ledger-workspace-v1 .notification-inbox-skeleton {
    display: grid !important;
    gap: 0 !important;
  }

  html.ledger-workspace-v1 .notification-inbox-item {
    min-width: 0 !important;
    min-height: 82px !important;
    grid-template-columns: 42px minmax(0, 1fr) 8px !important;
    gap: 11px !important;
    padding: 14px 15px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .notification-inbox-item:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .notification-inbox-item:hover {
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .notification-inbox-item:active {
    background: rgba(220, 240, 235, 0.92) !important;
    transform: scale(0.994) !important;
  }

  html.ledger-workspace-v1 .notification-inbox-item.is-read {
    color: var(--ledger-muted) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .notification-inbox-item-icon {
    width: 42px !important;
    height: 42px !important;
    border-radius: 13px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1
    .notification-inbox-item.is-read
    .notification-inbox-item-icon {
    color: var(--ledger-muted) !important;
    background: rgba(83, 103, 99, 0.08) !important;
  }

  html.ledger-workspace-v1 .notification-inbox-item-copy {
    min-width: 0 !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .notification-inbox-item-heading {
    min-width: 0 !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .notification-inbox-item-heading strong {
    min-width: 0 !important;
    color: inherit !important;
    font-family: var(--font-hebrew) !important;
    font-size: 14.5px !important;
    font-weight: 800 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .notification-inbox-item-heading time {
    color: var(--ledger-faint) !important;
    font-family: var(--font-hebrew) !important;
    font-size: 10.5px !important;
    font-weight: 600 !important;
  }

  html.ledger-workspace-v1 .notification-inbox-item-copy small {
    color: var(--ledger-muted) !important;
    font-family: var(--font-hebrew) !important;
    font-size: 12px !important;
    font-weight: 520 !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .notification-unread-dot {
    width: 7px !important;
    height: 7px !important;
    background: var(--ledger-accent) !important;
    box-shadow: 0 0 0 4px rgba(22, 173, 153, 0.1) !important;
  }

  html.ledger-workspace-v1 .notification-inbox-empty {
    min-height: 232px !important;
    gap: 7px !important;
    padding: 28px 20px !important;
  }

  html.ledger-workspace-v1 .notification-inbox-empty-icon {
    width: 46px !important;
    height: 46px !important;
    margin-bottom: 4px !important;
    border-radius: 14px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .notification-inbox-empty h2 {
    color: var(--ledger-ink) !important;
    font-size: 18px !important;
    font-weight: 850 !important;
  }

  html.ledger-workspace-v1 .notification-inbox-empty p {
    color: var(--ledger-muted) !important;
    font-size: 12.5px !important;
    line-height: 1.5 !important;
  }

  html.ledger-workspace-v1 .notification-inbox-skeleton-row {
    min-height: 82px !important;
    padding: 14px 15px !important;
    border-color: var(--ledger-line) !important;
  }

  html.ledger-workspace-v1
    :is(
      .notification-inbox-skeleton-row i,
      .notification-inbox-skeleton-row b,
      .notification-inbox-skeleton-row small
    ) {
    background:
      linear-gradient(
        90deg,
        var(--ledger-surface-soft) 25%,
        #ffffff 50%,
        var(--ledger-surface-soft) 75%
      ) !important;
    background-size: 200% 100% !important;
  }

  html.ledger-workspace-v1
    .profile-setup-panel
    > .notification-inbox-entry {
    min-height: 68px !important;
    margin-block: 2px !important;
    padding: 12px 2px !important;
    border: 0 !important;
    border-top: 1px solid var(--ledger-line) !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1
    .profile-setup-panel
    > .notification-inbox-entry:hover {
    padding-inline: 10px !important;
    border-color: var(--ledger-line) !important;
    border-radius: 14px !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .notification-inbox-entry-icon {
    border-radius: 13px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .notification-inbox-entry-copy strong {
    color: var(--ledger-ink) !important;
    font-size: 14.5px !important;
  }

  html.ledger-workspace-v1 .notification-inbox-entry-copy small,
  html.ledger-workspace-v1 .notification-inbox-entry-chevron {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .event-settings-menu {
    gap: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-item {
    min-height: 74px !important;
    padding: 12px 14px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-item:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-item:hover:not(:disabled) {
    border-color: var(--ledger-line) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-icon {
    width: 40px !important;
    height: 40px !important;
    display: grid !important;
    place-items: center !important;
    flex: 0 0 40px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 12px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 1px 3px rgba(13, 39, 35, 0.05) !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-icon svg {
    width: 22px !important;
    height: 22px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.75 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.ledger-workspace-v1 .event-settings-menu-item.is-danger .event-settings-menu-icon {
    border-color: color-mix(in srgb, var(--ledger-negative) 22%, var(--ledger-line)) !important;
    color: var(--ledger-negative) !important;
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1 .event-modal {
    scroll-padding-block-end: calc(112px + env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1 .event-modal-header h2 {
    max-width: 22ch !important;
    overflow-wrap: anywhere !important;
    line-height: 1.15 !important;
  }

  html.ledger-workspace-v1 .event-modal-body {
    min-width: 0 !important;
    gap: 14px !important;
    padding-block-end: 2px !important;
  }

  html.ledger-workspace-v1 .event-modal-actions {
    inset-block-end: 0 !important;
    z-index: 3 !important;
    gap: 8px !important;
    margin: 0 !important;
    padding: 12px 0 calc(2px + env(safe-area-inset-bottom)) !important;
    border-color: var(--ledger-line) !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 -6px 12px rgba(16, 35, 33, 0.045) !important;
  }

  html.ledger-workspace-v1 .event-modal-actions > .secondary-button {
    min-width: 112px !important;
    min-height: 46px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    background: var(--ledger-surface-soft) !important;
    box-shadow: 0 8px 18px -17px rgba(12, 27, 32, 0.38) !important;
  }

  @media (max-width: 520px) {
    html.ledger-workspace-v1 .event-modal {
      min-height: 100dvh !important;
      display: grid !important;
      grid-template-rows: auto minmax(0, 1fr) !important;
      overflow: hidden !important;
    }

    html.ledger-workspace-v1 .event-modal-body {
      min-height: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior: contain !important;
    }

    html.ledger-workspace-v1 .event-modal-actions {
      width: 100% !important;
      margin-block-start: auto !important;
    }

    html.ledger-workspace-v1 .notification-inbox-item {
      grid-template-columns: 40px minmax(0, 1fr) 7px !important;
      gap: 9px !important;
      padding-inline: 13px !important;
    }

    html.ledger-workspace-v1 .notification-inbox-item-icon {
      width: 40px !important;
      height: 40px !important;
    }

    html.ledger-workspace-v1 .event-modal-actions {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    html.ledger-workspace-v1 .event-modal-actions > button:only-child {
      grid-column: 1 / -1 !important;
      width: 100% !important;
    }
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .notification-inbox-header
    > .notification-mark-all {
    width: 100% !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .notification-inbox-item {
    grid-template-columns: 42px minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .notification-inbox-item-heading {
    display: grid !important;
    justify-content: stretch !important;
    gap: 3px !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .notification-unread-dot {
    position: absolute !important;
    inset-inline-end: 12px !important;
    inset-block-start: 12px !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .event-settings-menu-item {
    grid-template-columns: 40px minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .event-settings-menu-chevron {
    display: none !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .event-modal-actions {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .event-modal-actions
    > button {
    width: 100% !important;
  }

  /* Every focused task window speaks the same visual language as home. */
  html.ledger-workspace-v1
    :is(
      .app-choice-picker-backdrop,
      .account-feedback-backdrop,
      .install-app-backdrop,
      .referral-dialog-backdrop
    ) {
    background: rgba(4, 24, 19, 0.62) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    backdrop-filter: blur(10px) !important;
  }

  html.ledger-workspace-v1
    :is(
      .app-choice-picker,
      .account-feedback-dialog,
      .install-app-dialog,
      .referral-dialog-shell
    ) {
    color: var(--ledger-ink) !important;
    border-color: rgba(255, 255, 255, 0.64) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: var(--ledger-canvas) !important;
    box-shadow: 0 28px 78px rgba(4, 35, 29, 0.3) !important;
  }

  html.ledger-workspace-v1
    :is(
      .app-choice-picker-header,
      .account-feedback-header,
      .install-app-dialog > header,
      .referral-dialog-header
    ) {
    min-width: 0 !important;
    min-height: 112px !important;
    align-items: center !important;
    margin: 0 !important;
    padding: 20px !important;
    border: 0 !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow: 0 14px 30px -24px rgba(3, 34, 28, 0.84) !important;
  }

  html.ledger-workspace-v1
    :is(
      .app-choice-picker-header h2,
      .account-feedback-header h2,
      .install-app-dialog header h2,
      .referral-dialog-header h2
    ) {
    min-width: 0 !important;
    max-width: 26ch !important;
    margin: 0 !important;
    color: #ffffff !important;
    font-family: var(--font-hebrew) !important;
    font-size: clamp(20px, 5.8vw, 27px) !important;
    font-weight: 900 !important;
    line-height: 1.16 !important;
    letter-spacing: 0 !important;
    overflow-wrap: anywhere !important;
    text-wrap: balance !important;
  }

  html.ledger-workspace-v1
    :is(
      .account-feedback-header .eyebrow,
      .install-app-dialog header p,
      .referral-dialog-header small
    ) {
    margin: 0 0 4px !important;
    color: #a9ddd2 !important;
    font-family: var(--font-hebrew) !important;
    font-size: 12px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .account-feedback-header > div,
  html.ledger-workspace-v1 .install-app-dialog header > div,
  html.ledger-workspace-v1 .referral-dialog-header > span:last-child {
    min-width: 0 !important;
  }

  html.ledger-workspace-v1 .account-feedback-header > div > p:last-child {
    max-width: 42ch !important;
    margin: 7px 0 0 !important;
    color: rgba(255, 255, 255, 0.74) !important;
    font-size: 13px !important;
    font-weight: 560 !important;
    line-height: 1.5 !important;
  }

  html.ledger-workspace-v1
    :is(
      .app-choice-picker-close,
      .account-feedback-close,
      .install-app-dialog [data-public-close-install].icon-button,
      .referral-close-button
    ) {
    width: 46px !important;
    min-width: 46px !important;
    height: 46px !important;
    min-height: 46px !important;
    display: inline-grid !important;
    place-items: center !important;
    padding: 0 !important;
    border: 1px solid rgba(255, 255, 255, 0.64) !important;
    border-radius: 12px !important;
    color: var(--ledger-brand) !important;
    background: rgba(255, 255, 255, 0.96) !important;
    box-shadow: 0 8px 22px -16px rgba(1, 24, 20, 0.72) !important;
  }

  html.ledger-workspace-v1
    :is(
      .app-choice-picker-close,
      .account-feedback-close,
      .install-app-dialog [data-public-close-install].icon-button,
      .referral-close-button
    ):hover {
    color: var(--ledger-brand-hover) !important;
    background: #ffffff !important;
    transform: translateY(-1px) !important;
  }

  html.ledger-workspace-v1
    :is(
      .app-choice-picker-close,
      .account-feedback-close,
      .install-app-dialog [data-public-close-install].icon-button,
      .referral-close-button
    ):focus-visible {
    outline: 3px solid rgba(151, 231, 218, 0.7) !important;
    outline-offset: 2px !important;
  }

  html.ledger-workspace-v1 .app-choice-options {
    grid-auto-rows: minmax(62px, auto) !important;
    align-content: start !important;
    gap: 0 !important;
    margin: 14px !important;
    padding: 0 !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .app-choice-option {
    min-width: 0 !important;
    min-height: 62px !important;
    padding: 11px 14px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .app-choice-option:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1
    .app-choice-option:is(:hover, :focus-visible, [aria-selected="true"]) {
    border-color: var(--ledger-line) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .app-choice-option:focus-visible {
    position: relative !important;
    z-index: 1 !important;
    outline: 3px solid rgba(33, 170, 166, 0.34) !important;
    outline-offset: -3px !important;
  }

  html.ledger-workspace-v1 .app-choice-option-copy strong {
    color: var(--ledger-ink) !important;
    font-family: var(--font-hebrew) !important;
    font-size: 15px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .app-choice-option-copy small {
    color: var(--ledger-muted) !important;
    font-family: var(--font-hebrew) !important;
    font-size: 12px !important;
    font-weight: 560 !important;
  }

  html.ledger-workspace-v1
    .app-choice-option[aria-selected="true"]
    .app-choice-option-check {
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .account-feedback-form {
    gap: 18px !important;
    padding: 18px !important;
  }

  html.ledger-workspace-v1 .account-feedback-categories {
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .account-feedback-categories legend,
  html.ledger-workspace-v1 .account-feedback-message {
    color: var(--ledger-ink) !important;
  }

  html.ledger-workspace-v1 .account-feedback-categories span {
    min-height: 48px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 10px !important;
    color: var(--ledger-muted) !important;
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1
    .account-feedback-categories input:checked
    + span {
    border-color: rgba(33, 170, 166, 0.42) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    box-shadow: inset 0 0 0 1px rgba(33, 170, 166, 0.1) !important;
  }

  html.ledger-workspace-v1 .account-feedback-message textarea,
  html.ledger-workspace-v1 .referral-link-field input {
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: 12px !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1 .account-feedback-message textarea:focus,
  html.ledger-workspace-v1 .referral-link-field input:focus {
    border-color: var(--ledger-accent) !important;
    outline: var(--ledger-focus-ring) !important;
    outline-offset: 1px !important;
  }

  html.ledger-workspace-v1 .account-feedback-message small {
    color: var(--ledger-faint) !important;
  }

  html.ledger-workspace-v1 .account-feedback-actions {
    gap: 8px !important;
    padding-top: 2px !important;
  }

  html.ledger-workspace-v1 .install-app-dialog {
    gap: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  html.ledger-workspace-v1 .install-app-dialog > header {
    grid-template-columns: 52px minmax(0, 1fr) 46px !important;
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .install-app-dialog img {
    width: 52px !important;
    height: 52px !important;
    border-radius: 12px !important;
    background: #ffffff !important;
    box-shadow: 0 10px 24px -16px rgba(0, 25, 21, 0.8) !important;
  }

  html.ledger-workspace-v1 .install-app-steps {
    gap: 0 !important;
    margin: 16px !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .install-app-steps li {
    min-height: 70px !important;
    align-items: center !important;
    margin: 0 !important;
    padding: 13px 14px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .install-app-steps li:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .install-app-steps li > span {
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .install-app-steps p {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .install-app-done {
    width: auto !important;
    min-height: 48px !important;
    margin: 0 16px 16px !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-shell {
    overflow: hidden auto !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-header {
    position: relative !important;
    grid-template-columns: 46px minmax(0, 1fr) !important;
    gap: 12px !important;
    min-height: 92px !important;
    padding: 14px 18px 14px 72px !important;
    overflow: hidden !important;
    border-block-end: 1px solid var(--ledger-line) !important;
    color: var(--ledger-ink) !important;
    background: rgba(255, 255, 255, 0.96) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-header::before,
  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-header::after {
    display: none !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-header::before {
    width: 170px !important;
    height: 170px !important;
    inset-block-start: -102px !important;
    inset-inline-start: -46px !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-header::after {
    width: 112px !important;
    height: 112px !important;
    inset-block-end: -74px !important;
    inset-inline-end: 58px !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-header-copy,
  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-mark {
    position: relative !important;
    z-index: 1 !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-close-button {
    z-index: 1 !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-lead {
    max-width: 44ch !important;
    margin: 3px 0 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 560 !important;
    line-height: 1.4 !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-header h2 {
    max-width: 22ch !important;
    color: var(--ledger-ink) !important;
    font-size: clamp(20px, 5.4vw, 24px) !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-header small {
    margin: 0 0 2px !important;
    color: var(--ledger-accent) !important;
    font-size: 11px !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-mark {
    width: 46px !important;
    height: 46px !important;
    border: 1px solid rgba(11, 74, 56, 0.1) !important;
    border-radius: 14px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-close-button {
    inset-block-start: 23px !important;
    inset-inline-end: 18px !important;
    border-color: rgba(11, 74, 56, 0.1) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-content {
    align-content: start !important;
    grid-auto-rows: max-content !important;
    gap: 14px !important;
    padding: 16px !important;
    background: var(--ledger-canvas) !important;
  }

  html.ledger-workspace-v1
    :is(.referral-gift-card, .referral-more-details, .referral-state-message) {
    border-color: var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .referral-state-message {
    align-content: start !important;
    grid-auto-rows: auto !important;
  }

  html.ledger-workspace-v1 .referral-state-message.is-signin .primary-button {
    height: auto !important;
  }

  html.ledger-workspace-v1
    :is(.important-action-dialog, .account-delete-dialog, .event-status-menu) {
    color: var(--ledger-ink) !important;
    border-color: var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 22px 60px rgba(4, 35, 29, 0.24) !important;
  }

  html.ledger-workspace-v1
    :is(.important-action-dialog, .account-delete-dialog, .event-status-menu)
    :is(h2, strong) {
    font-family: var(--font-hebrew) !important;
  }

  html.ledger-workspace-v1 .event-status-option {
    border-color: var(--ledger-line) !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .event-status-option.is-selected {
    border-color: rgba(33, 170, 166, 0.4) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .account-delete-confirmation {
    border-color: var(--ledger-line) !important;
    background: var(--ledger-surface-soft) !important;
  }

  @media (max-width: 760px) {
    html.ledger-workspace-v1
      :is(
        .app-choice-picker-backdrop,
        .account-feedback-backdrop,
        .install-app-backdrop,
        .referral-dialog-backdrop
      ) {
      place-items: stretch !important;
      padding: 0 !important;
      background: var(--ledger-canvas) !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }

    html.ledger-workspace-v1
      :is(
        .app-choice-picker,
        .account-feedback-dialog,
        .install-app-dialog,
        .referral-dialog-shell
      ) {
      width: 100% !important;
      max-width: none !important;
      height: 100dvh !important;
      min-height: 100dvh !important;
      max-height: 100dvh !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    html.ledger-workspace-v1
      :is(
        .app-choice-picker-header,
        .account-feedback-header,
        .install-app-dialog > header,
        .referral-dialog-header
      ) {
      min-height: calc(112px + env(safe-area-inset-top)) !important;
      padding: calc(18px + env(safe-area-inset-top)) 18px 18px !important;
    }

    html.ledger-workspace-v1 .account-feedback-dialog {
      display: grid !important;
      grid-template-rows: auto minmax(0, 1fr) !important;
      padding: 0 !important;
      overflow: hidden !important;
    }

    html.ledger-workspace-v1 .account-feedback-form {
      min-height: 0 !important;
      overflow-y: auto !important;
      padding: 18px 16px calc(24px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1 .account-feedback-categories {
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    }

    html.ledger-workspace-v1 .account-feedback-categories span {
      justify-items: center !important;
      padding-inline: 8px !important;
    }

    html.ledger-workspace-v1 .account-feedback-actions {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .account-feedback-actions .primary-button {
      grid-row: auto !important;
    }

    html.ledger-workspace-v1 .install-app-dialog {
      display: grid !important;
      grid-template-rows: auto minmax(0, 1fr) auto !important;
    }

    html.ledger-workspace-v1 .install-app-dialog > header {
      grid-template-columns: 48px minmax(0, 1fr) 46px !important;
    }

    html.ledger-workspace-v1 .install-app-dialog img {
      width: 48px !important;
      height: 48px !important;
    }

    html.ledger-workspace-v1 .install-app-steps {
      min-height: 0 !important;
      overflow-y: auto !important;
      margin: 14px 14px 10px !important;
    }

    html.ledger-workspace-v1 .install-app-done {
      margin: 0 14px calc(14px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-shell {
      display: grid !important;
      grid-template-rows: auto minmax(0, 1fr) !important;
      overflow: hidden !important;
    }

    html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-header {
      grid-template-columns: 44px minmax(0, 1fr) !important;
      min-height: calc(90px + env(safe-area-inset-top)) !important;
      padding: calc(12px + env(safe-area-inset-top)) 14px 12px 66px !important;
    }

    html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-mark {
      width: 44px !important;
      height: 44px !important;
    }

    html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-close-button {
      inset-block-start: calc(14px + env(safe-area-inset-top)) !important;
      inset-inline-end: 14px !important;
    }

    html.ledger-workspace-v1 #public-referral-rewards-dialog .referral-dialog-content {
      min-height: 0 !important;
      overflow-y: auto !important;
      gap: 10px !important;
      padding: 10px 12px calc(22px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1 .referral-share-workspace {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .referral-qr-card {
      width: min(100%, 190px) !important;
      justify-self: center !important;
    }

    html.ledger-workspace-v1 .referral-benefit-card {
      min-height: 128px !important;
      padding: 18px !important;
    }

    html.ledger-workspace-v1 .referral-share-section {
      gap: 12px !important;
      padding: 14px !important;
    }
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    :is(.account-feedback-categories, .account-feedback-actions, .referral-share-actions) {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    :is(
      .app-choice-picker-header,
      .account-feedback-header,
      .install-app-dialog > header,
      .referral-dialog-header
    ) {
    min-height: calc(136px + env(safe-area-inset-top)) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .account-feedback-actions
    > button {
    width: 100% !important;
  }

  /* Distilled task surfaces: one clear next action without removing capability. */
  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top,
  html.ledger-workspace-v1.circle-design-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top {
    min-height: 112px !important;
    align-content: center !important;
    gap: 8px !important;
    margin: 8px 0 13px !important;
    padding: 16px 18px !important;
    border-radius: 20px !important;
  }

  html.ledger-workspace-v1
    :is(.profile-edit-screen, .notification-inbox-screen)
    > .top,
  html.ledger-workspace-v1.circle-design-v1
    :is(.profile-edit-screen, .notification-inbox-screen)
    > .top {
    min-height: 96px !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    h1 {
    font-size: 24px !important;
    line-height: 1.12 !important;
  }

  html.ledger-workspace-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .muted {
    margin-top: 4px !important;
    font-size: 12px !important;
    line-height: 1.4 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] > .top {
    min-height: 140px !important;
  }

  html.ledger-workspace-v1 .event-header-actions {
    gap: 6px !important;
    margin-top: 5px !important;
  }

  html.ledger-workspace-v1 .event-header-actions button {
    min-height: 44px !important;
    padding-inline: 10px !important;
    border-radius: 12px !important;
    font-size: 11.5px !important;
  }

  html.ledger-workspace-v1 .event-header-actions svg {
    width: 17px !important;
    height: 17px !important;
  }

  html.ledger-workspace-v1 .event-workspace-nav {
    min-height: 52px !important;
    gap: 4px !important;
    margin-bottom: 12px !important;
    padding: 4px !important;
    border-radius: 15px !important;
  }

  html.ledger-workspace-v1 .event-workspace-tab {
    min-height: 44px !important;
    gap: 6px !important;
    padding: 7px 10px !important;
    border-radius: 11px !important;
  }

  html.ledger-workspace-v1 .event-workspace-tab strong {
    font-size: 13.5px !important;
  }

  html.ledger-workspace-v1 .event-personal-balance {
    min-height: 66px !important;
    margin: 0 0 12px !important;
    padding: 10px 14px !important;
    border-radius: 15px !important;
  }

  html.ledger-workspace-v1 .event-personal-balance-copy > small {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-personal-balance-copy > strong {
    font-size: 14px !important;
  }

  html.ledger-workspace-v1 .event-personal-balance-copy > span,
  html.ledger-workspace-v1 .event-personal-balance-value > span {
    font-size: 11px !important;
  }

  html.ledger-workspace-v1 .event-personal-balance-value .amount {
    font-size: 20px !important;
  }

  html.ledger-workspace-v1 .event-action-dock {
    min-height: 60px !important;
    margin: 0 0 13px !important;
    padding: 7px 9px 7px 12px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 16px !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .event-action-total > span:first-child {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-action-total .amount {
    font-size: 18px !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .event-action-dock .primary-button {
    min-width: 138px !important;
    min-height: 46px !important;
    border-color: var(--ledger-brand) !important;
    border-radius: 13px !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .expense-row {
    min-height: 0 !important;
    margin-bottom: 8px !important;
    padding: 13px !important;
    border-radius: 15px !important;
  }

  html.ledger-workspace-v1 .expense-row-main {
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .expense-actions {
    min-width: 0 !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: flex-end !important;
    flex-wrap: nowrap !important;
    gap: 7px !important;
  }

  html.ledger-workspace-v1 .expense-actions .amount {
    min-width: 0 !important;
    margin: 0 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .expense-row-actions-menu {
    position: relative !important;
    z-index: 4 !important;
  }

  html.ledger-workspace-v1 .expense-row:has(.expense-row-actions-menu[open]) {
    position: relative !important;
    z-index: 24 !important;
  }

  html.ledger-workspace-v1 .expense-row-actions-menu > summary {
    width: 44px !important;
    height: 44px !important;
    display: grid !important;
    place-items: center !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 50% !important;
    color: var(--ledger-brand) !important;
    background: color-mix(in srgb, var(--ledger-brand) 7%, transparent) !important;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ledger-brand) 9%, transparent) !important;
    cursor: pointer !important;
    list-style: none !important;
    transition-property: transform, color, background-color, box-shadow !important;
    transition-duration: 180ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .expense-row-actions-icon {
    width: 18px !important;
    height: 18px !important;
    display: block !important;
    overflow: visible !important;
    fill: currentColor !important;
  }

  html.ledger-workspace-v1 .expense-row-actions-menu[open] > summary {
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow: 0 7px 16px -10px rgba(4, 56, 45, 0.7) !important;
  }

  html.ledger-workspace-v1 .expense-row-actions-menu > summary:active {
    transform: scale(0.96) !important;
  }

  @media (hover: hover) {
    html.ledger-workspace-v1 .expense-row-actions-menu > summary:hover {
      color: var(--ledger-brand-strong, var(--ledger-brand)) !important;
      background: color-mix(in srgb, var(--ledger-brand) 12%, transparent) !important;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ledger-brand) 14%, transparent) !important;
    }

    html.ledger-workspace-v1 .expense-row-actions-menu[open] > summary:hover {
      color: #ffffff !important;
      background: var(--ledger-brand) !important;
    }
  }

  html.ledger-workspace-v1 .expense-row-actions-menu > summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .expense-row-actions-menu > div {
    position: absolute !important;
    inset-block-start: calc(100% + 6px) !important;
    inset-inline-end: 0 !important;
    z-index: 25 !important;
    width: 152px !important;
    display: grid !important;
    gap: 5px !important;
    padding: 6px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 13px !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 18px 38px -20px rgba(4, 35, 29, 0.42) !important;
  }

  /* Keep menus on the final expense rows above the persistent app navigation. */
  html.ledger-workspace-v1
    .expense-row:nth-last-child(-n + 2)
    .expense-row-actions-menu > div {
    inset-block-start: auto !important;
    inset-block-end: calc(100% + 6px) !important;
  }

  html.ledger-workspace-v1 .expense-row-actions-menu button {
    width: 100% !important;
    min-height: 44px !important;
    padding-inline: 10px !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .expense-participants-details > summary {
    min-height: 44px !important;
    padding-block: 7px !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .settlement-hero-actions {
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 7px !important;
    padding: 8px !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions {
    position: relative !important;
    grid-column: auto !important;
    overflow: visible !important;
    border: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .settlement-hero:has(.settlement-more-actions[open]) {
    position: relative !important;
    z-index: 30 !important;
    overflow: visible !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions[open] {
    z-index: 31 !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions > summary {
    min-width: 62px !important;
    min-height: 46px !important;
    justify-content: center !important;
    padding: 0 12px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 13px !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions > summary::after {
    display: none !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions > div {
    position: absolute !important;
    inset-block-start: calc(100% + 7px) !important;
    inset-inline-end: 0 !important;
    z-index: 20 !important;
    width: min(248px, calc(100vw - 44px)) !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 6px !important;
    padding: 7px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 14px !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 22px 48px -22px rgba(4, 35, 29, 0.48) !important;
  }

  html.ledger-workspace-v1 .settlement-more-actions > div > button {
    width: 100% !important;
    min-height: 44px !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-invite-rotate-button {
    min-height: 44px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] > .settlement-stage {
    padding: 13px !important;
  }

  html.ledger-workspace-v1 .settlement-stage-heading {
    margin-bottom: 10px !important;
  }

  html.ledger-workspace-v1 .settlement-stage-heading h2 {
    font-size: 18px !important;
  }

  html.ledger-workspace-v1 .referral-reward-card.is-home {
    grid-template-columns: 40px minmax(0, 1fr) auto !important;
    gap: 10px !important;
    margin: 0 0 14px !important;
    padding: 11px 12px !important;
    border-radius: 15px !important;
  }

  html.ledger-workspace-v1 .referral-reward-card.is-home::before {
    display: none !important;
  }

  html.ledger-workspace-v1 .referral-reward-card.is-home .referral-reward-icon {
    width: 40px !important;
    height: 40px !important;
    border-radius: 11px !important;
  }

  html.ledger-workspace-v1
    .referral-reward-card.is-home
    :is(.referral-reward-eyebrow, .referral-reward-detail) {
    display: none !important;
  }

  html.ledger-workspace-v1 .referral-reward-card.is-home .referral-reward-copy strong {
    font-size: 14px !important;
  }

  html.ledger-workspace-v1 .referral-reward-card.is-home > button {
    grid-column: auto !important;
    width: auto !important;
    min-width: 0 !important;
    min-height: 44px !important;
    padding-inline: 12px !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1 .profile-setup-panel {
    padding: 16px !important;
  }

  html.ledger-workspace-v1 .profile-avatar-options {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 12px 10px !important;
    overflow: visible !important;
    padding: 4px 2px 8px !important;
    justify-items: center !important;
  }

  html.ledger-workspace-v1 .profile-avatar-options::-webkit-scrollbar {
    display: none !important;
  }

  html.ledger-workspace-v1 .profile-avatar-option {
    width: 100% !important;
    min-width: 0 !important;
    display: grid !important;
    place-items: center !important;
  }

  html.ledger-workspace-v1 .profile-avatar-preview {
    width: 50px !important;
    height: 50px !important;
  }

  @media (min-width: 520px) {
    html.ledger-workspace-v1 .profile-avatar-options {
      grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
      gap: 6px !important;
      padding-inline: 0 !important;
      overflow: hidden !important;
    }

    html.ledger-workspace-v1 .profile-avatar-preview {
      width: 46px !important;
      height: 46px !important;
    }
  }

  html.ledger-workspace-v1 .event-creation-progress {
    min-height: 44px !important;
    margin: 0 0 12px !important;
    padding: 4px !important;
    border-radius: 14px !important;
  }

  html.ledger-workspace-v1 .event-creation-progress li {
    min-height: 34px !important;
    padding: 0 !important;
  }

  html.ledger-workspace-v1 .event-creation-progress li > button {
    width: 100% !important;
    min-height: 34px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 7px !important;
    padding: 4px 7px !important;
    border: 0 !important;
    border-radius: 10px !important;
    color: inherit !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-creation-progress li > button:focus-visible {
    outline: 2px solid #08745d !important;
    outline-offset: -2px !important;
  }

  html.ledger-workspace-v1 .create-event-panel {
    padding: 16px !important;
  }

  html.ledger-workspace-v1 .create-event-panel > * + * {
    margin-block-start: 13px !important;
  }

  html.ledger-workspace-v1 .friends-hub-panel {
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .friends-toolbar {
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .friends-add-person,
  html.ledger-workspace-v1 .friends-add-person > summary {
    width: auto !important;
  }

  html.ledger-workspace-v1 .friends-add-person > summary {
    min-height: 48px !important;
    padding-inline: 14px !important;
  }

  @media (max-width: 380px) {
    html.ledger-workspace-v1 .event-row-open {
      grid-template-columns: 72px minmax(0, 1fr) 64px !important;
      column-gap: 8px !important;
    }

    html.ledger-workspace-v1 .event-row .avatar-stack {
      width: 72px !important;
      min-width: 72px !important;
    }

    html.ledger-workspace-v1 .event-status-toggle {
      width: 64px !important;
      min-width: 64px !important;
      padding-inline: 4px !important;
    }

    html.ledger-workspace-v1 .friends-toolbar {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .friends-add-person,
    html.ledger-workspace-v1 .friends-add-person > summary {
      width: 100% !important;
    }

    html.ledger-workspace-v1 .settlement-more-actions > div {
      width: min(236px, calc(100vw - 32px)) !important;
    }
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    :is(.friends-toolbar, .settlement-hero-actions) {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .referral-reward-card.is-home {
    grid-template-columns: 40px minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .referral-reward-card.is-home
    > button {
    grid-column: 1 / -1 !important;
    width: 100% !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    #app
    .product-nav-button,
  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    #app
    .product-nav-button
    span {
    font-size: 11.5px !important;
    line-height: 1.15 !important;
    white-space: nowrap !important;
    overflow-wrap: normal !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    :is(.friends-add-person, .friends-add-person > summary, .settlement-more-actions) {
    width: 100% !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .settlement-more-actions
    > div {
    position: static !important;
    width: 100% !important;
    margin-top: 7px !important;
  }

  /* Connected participant relationship: shared history with one clear financial action. */
  html.ledger-workspace-v1 .event-participant-relationship-modal > .event-modal-header {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-participant-relationship-modal .event-modal-body {
    padding-block-start: 8px !important;
    padding-block-end: 96px !important;
  }

  body:has(.event-participant-relationship-modal) .event-action-dock {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-participant-relationship {
    width: min(100%, 440px) !important;
    gap: 16px !important;
  }

  html.ledger-workspace-v1 .friend-relationship-content {
    width: min(100%, 440px) !important;
    margin-inline: auto !important;
    padding-block-end: 32px !important;
  }

  html.ledger-workspace-v1
    .event-participant-detail-identity.relationship-identity-card {
    display: grid !important;
    grid-template-columns: 58px minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 11px !important;
    min-height: 86px !important;
    padding: 10px 14px !important;
    border-radius: 20px !important;
    box-shadow:
      0 18px 44px -38px rgba(5, 62, 55, 0.56),
      inset 0 1px 0 rgba(255, 255, 255, 0.92) !important;
  }

  html.ledger-workspace-v1
    .event-participant-detail-identity.relationship-identity-card
    > .avatar {
    width: 58px !important;
    min-width: 58px !important;
    height: 58px !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1
    .event-participant-detail-identity.relationship-identity-card
    > .relationship-identity-copy {
    min-width: 0 !important;
    display: grid !important;
    justify-items: start !important;
    gap: 4px !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1
    .event-participant-detail-identity.relationship-identity-card
    > .relationship-identity-copy
    > strong {
    font-size: 18px !important;
    font-weight: 860 !important;
    line-height: 1.2 !important;
  }

  html.ledger-workspace-v1 .relationship-identity-copy .participant-username {
    max-width: 100% !important;
    overflow: hidden !important;
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .relationship-friendship-badge,
  html.ledger-workspace-v1 .relationship-friendship-action {
    align-self: center !important;
    justify-self: end !important;
  }

  html.ledger-workspace-v1 .relationship-friendship-badge {
    min-height: 34px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 7px 11px !important;
    border: 1px solid rgba(11, 101, 91, 0.13) !important;
    border-radius: 999px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    font-size: 11px !important;
    font-weight: 820 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1
    .event-participant-relationship
    > .event-participant-friendship-help {
    margin: -6px 10px 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 590 !important;
    line-height: 1.4 !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .relationship-friendship-badge.is-pending {
    color: var(--ledger-muted) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .relationship-friendship-action {
    min-height: 36px !important;
    padding: 7px 10px !important;
    font-size: 11px !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .relationship-scorecard {
    position: relative !important;
    overflow: hidden !important;
    display: grid !important;
    gap: 10px !important;
    padding: 20px 18px 17px !important;
    border: 1px solid rgba(112, 207, 181, 0.2) !important;
    border-radius: 24px !important;
    color: #ffffff !important;
    background:
      linear-gradient(145deg, rgba(22, 130, 108, 0.3), transparent 48%),
      #064d42 !important;
    box-shadow:
      0 26px 54px -38px rgba(3, 59, 51, 0.9),
      inset 0 1px 0 rgba(255, 255, 255, 0.13) !important;
  }

  html.ledger-workspace-v1 .relationship-scorecard h3 {
    margin: 0 !important;
    color: #ffffff !important;
    font-size: 23px !important;
    font-weight: 900 !important;
    line-height: 1.12 !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .relationship-duo {
    display: flex !important;
    align-items: flex-start !important;
    justify-content: center !important;
    gap: 14px !important;
  }

  html.ledger-workspace-v1 .relationship-duo > span {
    min-width: 58px !important;
    display: grid !important;
    justify-items: center !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .relationship-duo .avatar {
    width: 48px !important;
    height: 48px !important;
    border: 3px solid rgba(255, 255, 255, 0.95) !important;
    box-shadow: 0 8px 18px -10px rgba(0, 0, 0, 0.64) !important;
  }

  html.ledger-workspace-v1 .relationship-duo small {
    max-width: 92px !important;
    overflow: hidden !important;
    color: rgba(255, 255, 255, 0.88) !important;
    font-size: 11px !important;
    font-weight: 760 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .relationship-comparison {
    display: grid !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .relationship-comparison > strong {
    color: rgba(255, 255, 255, 0.93) !important;
    font-size: 13px !important;
    font-weight: 760 !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .relationship-comparison-values {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .relationship-comparison-values > span {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1
    .relationship-comparison-values
    > [data-relationship-person="current"] {
    justify-items: start !important;
  }

  html.ledger-workspace-v1
    .relationship-comparison-values
    > [data-relationship-person="target"] {
    justify-items: end !important;
  }

  html.ledger-workspace-v1 .relationship-comparison-values .font-num {
    max-width: 100% !important;
    color: #ffffff !important;
    font-size: 14px !important;
    font-weight: 900 !important;
    line-height: 1.1 !important;
  }

  html.ledger-workspace-v1 .relationship-comparison-values small {
    max-width: 100% !important;
    overflow: hidden !important;
    color: #73d8b8 !important;
    font-size: 10px !important;
    font-weight: 760 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .relationship-comparison progress {
    width: 100% !important;
    height: 7px !important;
    overflow: hidden !important;
    direction: rtl !important;
    border: 0 !important;
    border-radius: 999px !important;
    color: #63d4b0 !important;
    background: rgba(255, 255, 255, 0.88) !important;
    accent-color: #63d4b0 !important;
    appearance: none !important;
  }

  html.ledger-workspace-v1 .relationship-comparison progress::-webkit-progress-bar {
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.88) !important;
  }

  html.ledger-workspace-v1 .relationship-comparison progress::-webkit-progress-value {
    border-radius: 999px !important;
    background: #63d4b0 !important;
  }

  html.ledger-workspace-v1 .relationship-comparison progress::-moz-progress-bar {
    border-radius: 999px !important;
    background: #63d4b0 !important;
  }

  html.ledger-workspace-v1 .relationship-comparison-leader {
    justify-self: center !important;
    min-height: 20px !important;
    display: inline-flex !important;
    align-items: center !important;
    padding: 3px 9px !important;
    border-radius: 999px !important;
    color: #dffaf1 !important;
    background: rgba(99, 212, 176, 0.18) !important;
    font-size: 10px !important;
    font-weight: 760 !important;
  }

  html.ledger-workspace-v1 .relationship-scorecard-note {
    margin: 0 !important;
    color: rgba(255, 255, 255, 0.64) !important;
    font-size: 10px !important;
    font-weight: 620 !important;
    line-height: 1.35 !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .relationship-habit {
    display: grid !important;
    grid-template-columns: 44px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 17px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 20px !important;
    background: rgba(255, 255, 255, 0.84) !important;
    box-shadow: 0 18px 38px -34px rgba(4, 64, 56, 0.58) !important;
  }

  html.ledger-workspace-v1 .relationship-habit-icon {
    width: 44px !important;
    height: 44px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 14px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .relationship-habit-icon svg {
    width: 22px !important;
    height: 22px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.8 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.ledger-workspace-v1 .relationship-habit h3,
  html.ledger-workspace-v1 .relationship-facts h3 {
    margin: 0 !important;
    color: var(--ledger-ink) !important;
    font-size: 18px !important;
    font-weight: 860 !important;
    line-height: 1.2 !important;
  }

  html.ledger-workspace-v1 .relationship-habit p {
    margin: 4px 0 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    font-weight: 590 !important;
    line-height: 1.55 !important;
  }

  html.ledger-workspace-v1 .relationship-facts {
    display: grid !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .relationship-facts-grid {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 20px !important;
    background: rgba(255, 255, 255, 0.84) !important;
    box-shadow: 0 18px 38px -34px rgba(4, 64, 56, 0.58) !important;
  }

  html.ledger-workspace-v1 .relationship-fact {
    min-width: 0 !important;
    display: grid !important;
    justify-items: center !important;
    align-content: start !important;
    gap: 5px !important;
    padding: 14px 8px !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .relationship-fact + .relationship-fact {
    border-inline-start: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .relationship-fact > span {
    width: 34px !important;
    height: 34px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 50% !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .relationship-fact svg {
    width: 18px !important;
    height: 18px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.8 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.ledger-workspace-v1 .relationship-fact small,
  html.ledger-workspace-v1 .relationship-fact > .font-num {
    color: var(--ledger-muted) !important;
    font-size: 10px !important;
    font-weight: 620 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .relationship-fact strong {
    max-width: 100% !important;
    overflow-wrap: anywhere !important;
    color: var(--ledger-ink) !important;
    font-size: 12px !important;
    font-weight: 820 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .relationship-fact.is-empty {
    opacity: 0.72 !important;
  }

  html.ledger-workspace-v1 .relationship-open-balance {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding: 14px 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 20px !important;
    background: rgba(255, 255, 255, 0.92) !important;
    box-shadow: 0 18px 38px -34px rgba(4, 64, 56, 0.58) !important;
  }

  html.ledger-workspace-v1 .relationship-open-balance > div {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .relationship-open-balance small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .relationship-open-balance strong {
    overflow-wrap: anywhere !important;
    color: var(--ledger-brand) !important;
    font-size: 20px !important;
    font-weight: 900 !important;
    line-height: 1.15 !important;
  }

  html.ledger-workspace-v1 .relationship-open-balance.is-outgoing strong {
    color: var(--ledger-negative) !important;
  }

  html.ledger-workspace-v1 .relationship-open-balance.is-balanced strong {
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
  }

  html.ledger-workspace-v1 .relationship-open-balance button {
    flex: 0 0 auto !important;
    min-height: 44px !important;
    padding-inline: 15px !important;
  }

  html.ledger-workspace-v1 .relationship-event-management {
    border-block: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .relationship-event-management > summary {
    min-height: 48px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 720 !important;
    padding-inline-end: 14px !important;
    cursor: pointer !important;
  }

  html.ledger-workspace-v1 .relationship-event-management > summary::after {
    content: "‹" !important;
    color: var(--ledger-brand) !important;
    font-size: 20px !important;
    transition: transform 160ms ease !important;
  }

  html.ledger-workspace-v1 .relationship-event-management[open] > summary::after {
    transform: rotate(-90deg) !important;
  }

  html.ledger-workspace-v1 .relationship-event-management .event-participant-detail-membership {
    margin-block: 8px 12px !important;
  }

  html.ledger-workspace-v1 .relationship-event-management .event-participant-detail-remove {
    margin-block-end: 12px !important;
  }

  html.ledger-workspace-v1 .relationship-safety-copy {
    display: grid !important;
    gap: 10px !important;
    padding-block-end: 12px !important;
  }

  html.ledger-workspace-v1 .relationship-safety-copy > p {
    margin: 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 560 !important;
    line-height: 1.5 !important;
  }

  html.ledger-workspace-v1 .relationship-safety-actions {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .relationship-safety-actions > button {
    min-height: 44px !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .participant-report-form {
    width: min(100%, 440px) !important;
    display: grid !important;
    gap: 16px !important;
    margin-inline: auto !important;
  }

  html.ledger-workspace-v1 .participant-report-form textarea {
    min-height: 112px !important;
    resize: vertical !important;
  }

  html.ledger-workspace-v1 .participant-report-form > .primary-button {
    min-height: 50px !important;
  }

  @media (max-width: 360px) {
    html.ledger-workspace-v1 .relationship-safety-actions {
      align-items: stretch !important;
      flex-direction: column !important;
    }

    html.ledger-workspace-v1 .relationship-safety-actions > button {
      width: 100% !important;
    }

    html.ledger-workspace-v1
      .event-participant-detail-identity.relationship-identity-card {
      grid-template-columns: 52px minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1
      .event-participant-detail-identity.relationship-identity-card
      > .avatar {
      width: 52px !important;
      min-width: 52px !important;
      height: 52px !important;
    }

    html.ledger-workspace-v1 .relationship-friendship-badge,
    html.ledger-workspace-v1 .relationship-friendship-action {
      grid-column: 1 / -1 !important;
      justify-self: stretch !important;
    }

    html.ledger-workspace-v1 .relationship-facts-grid {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .relationship-fact {
      grid-template-columns: 36px minmax(0, 1fr) auto !important;
      justify-items: start !important;
      align-items: center !important;
      text-align: start !important;
    }

    html.ledger-workspace-v1 .relationship-fact + .relationship-fact {
      border-inline-start: 0 !important;
      border-block-start: 1px solid var(--ledger-line) !important;
    }

    html.ledger-workspace-v1 .relationship-fact > span {
      grid-row: 1 / span 2 !important;
    }

    html.ledger-workspace-v1 .relationship-fact strong {
      grid-column: 2 !important;
    }

    html.ledger-workspace-v1 .relationship-fact > .font-num {
      grid-column: 3 !important;
      grid-row: 1 / span 2 !important;
      align-self: center !important;
    }
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .relationship-identity-card,
  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .relationship-habit,
  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .relationship-open-balance {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .relationship-facts-grid {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .relationship-fact + .relationship-fact {
    border-inline-start: 0 !important;
    border-block-start: 1px solid var(--ledger-line) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .relationship-open-balance {
    display: grid !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .relationship-open-balance button {
    width: 100% !important;
  }

  html.ledger-workspace-v1 .event-activity-panel {
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .event-activity-list {
    display: grid !important;
    margin: 0 !important;
    padding: 4px 16px !important;
    list-style: none !important;
  }

  html.ledger-workspace-v1 .event-activity-empty {
    margin: 0 !important;
    padding: 24px 18px !important;
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    line-height: 1.6 !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .event-activity-item {
    position: relative !important;
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: 14px minmax(0, 1fr) !important;
    align-items: start !important;
    gap: 12px !important;
    padding: 16px 0 !important;
  }

  html.ledger-workspace-v1 .event-activity-item + .event-activity-item {
    border-block-start: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .event-activity-marker {
    position: relative !important;
    z-index: 1 !important;
    width: 10px !important;
    height: 10px !important;
    margin-block-start: 5px !important;
    border: 2px solid var(--ledger-surface) !important;
    border-radius: 50% !important;
    background: var(--ledger-accent) !important;
    box-shadow: 0 0 0 2px var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1
    .event-activity-item[data-activity-kind="event-closed"]
    .event-activity-marker {
    background: var(--ledger-brand) !important;
    box-shadow: 0 0 0 2px rgba(6, 75, 67, 0.13) !important;
  }

  html.ledger-workspace-v1
    .event-activity-item[data-activity-kind="expense-deleted"]
    .event-activity-marker,
  html.ledger-workspace-v1
    .event-activity-item[data-activity-kind="participant-removed"]
    .event-activity-marker {
    background: var(--ledger-negative) !important;
    box-shadow: 0 0 0 2px #fff1ef !important;
  }

  html.ledger-workspace-v1 .event-activity-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .event-activity-copy strong {
    overflow-wrap: anywhere !important;
    color: var(--ledger-ink) !important;
    font-family: var(--font-hebrew) !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .event-activity-copy > span {
    overflow-wrap: anywhere !important;
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .event-activity-copy small {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: baseline !important;
    gap: 4px !important;
    color: var(--ledger-faint) !important;
    font-size: 11.5px !important;
    line-height: 1.5 !important;
  }

  html.ledger-workspace-v1 .event-activity-copy time {
    display: inline-flex !important;
    flex-wrap: wrap !important;
    align-items: baseline !important;
    gap: 4px !important;
  }

  @media (max-width: 520px) {
    html.ledger-workspace-v1 .event-activity-list {
      padding-inline: 14px !important;
    }

    html.ledger-workspace-v1 .event-activity-item {
      gap: 10px !important;
      padding-block: 14px !important;
    }
  }

  /* A balanced event needs one calm result, not a stack of repeated zero states. */
  html.ledger-workspace-v1.circle-design-v1
    .settlement-screen
    .settlement-hero.is-balanced {
    margin-bottom: 12px !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-hero.is-balanced
    .settlement-hero-main {
    gap: 10px !important;
    padding: 18px 20px !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-hero.is-balanced
    .settlement-hero-title-row {
    display: block !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-hero.is-balanced
    .settlement-hero-title-row h2 {
    font-size: 22px !important;
    line-height: 1.2 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-hero.is-balanced
    .settlement-hero-actions {
    padding: 8px !important;
  }

  /* Selected settlement concept: show the personal route, amount and proof first. */
  html.ledger-workspace-v1.circle-design-v1
    .settlement-screen
    .settlement-hero.is-explained {
    border-radius: 18px !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .settlement-featured-action {
    min-width: 0 !important;
    display: grid !important;
    justify-items: center !important;
    gap: 10px !important;
    padding: 24px 20px 22px !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    text-align: center !important;
    background: #f5faf8 !important;
  }

  html.ledger-workspace-v1 .settlement-featured-route {
    max-width: 30ch !important;
    margin: 0 !important;
    color: var(--ledger-brand) !important;
    font-size: 16px !important;
    font-weight: 650 !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .settlement-featured-amount {
    color: var(--ledger-brand) !important;
    font-size: clamp(42px, 12vw, 58px) !important;
    line-height: 1 !important;
    letter-spacing: 0 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .settlement-featured-amount .font-num {
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .settlement-featured-complete {
    width: min(100%, 260px) !important;
    min-height: 50px !important;
    margin-top: 4px !important;
    border-radius: 12px !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown {
    display: block !important;
    padding: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown > summary {
    min-height: 58px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 16px !important;
    padding: 10px 20px !important;
    list-style: none !important;
    color: var(--ledger-ink) !important;
    cursor: pointer !important;
    user-select: none !important;
    transition: background-color 160ms ease !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown > summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown > summary:hover {
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown > summary:focus-visible {
    outline: 3px solid rgba(22, 168, 153, 0.2) !important;
    outline-offset: -3px !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown > summary > span {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown > summary strong {
    margin: 0 !important;
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown > summary small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown > summary::after {
    content: "" !important;
    width: 8px !important;
    height: 8px !important;
    flex: 0 0 auto !important;
    margin-inline-end: 3px !important;
    border-inline-end: 1.5px solid var(--ledger-brand) !important;
    border-bottom: 1.5px solid var(--ledger-brand) !important;
    transform: rotate(45deg) !important;
    transition: transform 160ms ease !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown[open] > summary::after {
    transform: rotate(225deg) !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown-body {
    display: grid !important;
    gap: 12px !important;
    padding: 2px 20px 20px !important;
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown-body > h3 {
    margin: 16px 0 0 !important;
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown-list {
    display: grid !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown-row {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 14px !important;
    min-height: 52px !important;
    padding: 10px 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown-row > span:first-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown-row strong {
    overflow-wrap: anywhere !important;
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown-row small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown-row > .amount {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown-row.is-adjustment {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown-row.is-more-expenses {
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown-row.is-total {
    min-height: 58px !important;
    border-bottom: 0 !important;
    border-top: 1px solid var(--ledger-line-strong) !important;
  }

  html.ledger-workspace-v1 .settlement-featured-breakdown-row.is-total strong,
  html.ledger-workspace-v1 .settlement-featured-breakdown-row.is-total .amount {
    color: var(--ledger-brand) !important;
    font-size: 17px !important;
    font-weight: 800 !important;
  }

  html.ledger-workspace-v1 .settlement-featured-rounding {
    margin: 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .settlement-featured-full {
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-self: start !important;
    color: var(--ledger-brand) !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    text-decoration: none !important;
  }

  html.ledger-workspace-v1 .settlement-featured-full::after {
    content: "←" !important;
    margin-inline-start: 7px !important;
    font-size: 14px !important;
  }

  html.ledger-workspace-v1 .settlement-featured-full:focus-visible {
    outline: 3px solid rgba(22, 168, 153, 0.2) !important;
    outline-offset: 2px !important;
    border-radius: 6px !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-hero.is-explained
    .settlement-featured-actions {
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 8px !important;
    padding: 10px !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-hero.is-explained
    .settlement-more-actions {
    grid-column: auto !important;
    min-width: 72px !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-hero.is-explained
    .settlement-more-actions[open] {
    grid-column: 1 / -1 !important;
  }

  html.ledger-workspace-v1.circle-design-v1
    .settlement-hero.is-explained
    + .settlement-stage {
    margin-top: 14px !important;
  }

  @media (max-width: 720px) {
    html.ledger-workspace-v1 .screen.settlement-screen {
      padding-bottom: calc(176px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1 .settlement-screen > :last-child {
      scroll-margin-block-end: calc(120px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1 .settlement-featured-action {
      padding: 20px 16px 18px !important;
    }

    html.ledger-workspace-v1 .settlement-featured-breakdown {
      padding: 0 !important;
    }

    html.ledger-workspace-v1 .settlement-featured-breakdown > summary {
      padding-inline: 16px !important;
    }

    html.ledger-workspace-v1 .settlement-featured-breakdown-body {
      padding: 2px 16px 16px !important;
    }

    html.ledger-workspace-v1 .settlement-featured-breakdown-row {
      min-height: 48px !important;
      padding-block: 8px !important;
    }
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .settlement-featured-breakdown-row {
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 6px !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .settlement-featured-breakdown-row > .amount {
    justify-self: start !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .event-activity-copy small,
  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    .event-activity-copy time {
    display: block !important;
  }

  /* Home event index: a compact ledger row, not a stack of generic cards. */
  html.ledger-workspace-v1 .screen[data-screen-kind="home"] .section-title-row {
    min-height: 58px !important;
    align-items: center !important;
    border-bottom: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .event-list-count {
    display: inline-flex !important;
    align-items: center !important;
    gap: 7px !important;
    color: var(--ledger-muted) !important;
    font-size: 12.5px !important;
    font-weight: 650 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-list-count::before,
  html.ledger-workspace-v1 .event-status-indicator {
    content: "" !important;
    width: 7px !important;
    min-width: 7px !important;
    height: 7px !important;
    border-radius: 50% !important;
    background: var(--ledger-positive) !important;
  }

  html.ledger-workspace-v1 .event-list-count.is-closed::before,
  html.ledger-workspace-v1 .event-status-toggle.is-locked .event-status-indicator {
    background: var(--ledger-faint) !important;
  }

  html.ledger-workspace-v1 .event-list {
    display: grid !important;
    gap: 0 !important;
    overflow: hidden !important;
    border-block: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: var(--ledger-canvas) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-row,
  html.ledger-workspace-v1 .event-row:hover {
    min-height: 88px !important;
    display: grid !important;
    direction: rtl !important;
    grid-template-columns: minmax(0, 1fr) 84px !important;
    align-items: stretch !important;
    gap: 0 !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: var(--ledger-canvas) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-row:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .event-row-open {
    min-width: 0 !important;
    min-height: 87px !important;
    display: grid !important;
    direction: rtl !important;
    grid-column: 1 !important;
    grid-template-columns: 82px minmax(0, 1fr) !important;
    align-items: center !important;
    column-gap: 12px !important;
    padding: 14px 4px 14px 8px !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: inherit !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .event-row-main {
    grid-column: 2 !important;
    gap: 6px !important;
  }

  html.ledger-workspace-v1 .event-row-title strong {
    font-size: 16px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .event-row-meta {
    min-width: 0 !important;
    display: flex !important;
    align-items: baseline !important;
    flex-wrap: wrap !important;
    gap: 4px !important;
    overflow: hidden !important;
    color: var(--ledger-muted) !important;
    direction: rtl !important;
    font-family: var(--font-hebrew) !important;
    font-size: 11.5px !important;
    font-weight: 500 !important;
    line-height: 1.4 !important;
  }

  html.ledger-workspace-v1 .event-row-meta-time {
    unicode-bidi: isolate !important;
  }

  html.ledger-workspace-v1 .event-status-toggle {
    position: static !important;
    inset: auto !important;
    grid-column: 2 !important;
    align-self: stretch !important;
    justify-self: stretch !important;
    width: 84px !important;
    min-width: 84px !important;
    min-height: 44px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 7px !important;
    padding: 0 5px !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--ledger-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 11.5px !important;
    font-weight: 650 !important;
    transform: none !important;
  }

  @media (max-width: 380px) {
    html.ledger-workspace-v1 .event-row,
    html.ledger-workspace-v1 .event-row:hover {
      grid-template-columns: minmax(0, 1fr) 68px !important;
    }

    html.ledger-workspace-v1 .event-row-open {
      grid-template-columns: 70px minmax(0, 1fr) !important;
      column-gap: 8px !important;
    }

    html.ledger-workspace-v1 .event-row .avatar-stack {
      width: 70px !important;
      min-width: 70px !important;
    }

    html.ledger-workspace-v1 .event-status-toggle {
      width: 68px !important;
      min-width: 68px !important;
      gap: 5px !important;
      font-size: 11px !important;
    }
  }

  /* Approved event ledger: neutral content, green reserved for actions and financial status. */
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-workspace-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] #event-expenses-title,
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-main > strong,
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-actions .amount,
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-action-total .amount,
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-personal-balance-copy > strong {
    color: var(--ledger-ink) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-main > small,
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-personal-balance-copy > span,
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-personal-balance-value > span {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-personal-balance.is-credit .amount {
    color: #187158 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-main {
    min-width: 0 !important;
    display: grid !important;
    justify-items: start !important;
    gap: 3px !important;
    padding: 0 !important;
    border: 0 !important;
    color: inherit !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
    cursor: pointer !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-main:focus-visible {
    outline: 3px solid rgba(33, 170, 166, 0.18) !important;
    outline-offset: 4px !important;
    border-radius: 8px !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-participants-details {
    margin-top: 10px !important;
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-participants-details:not([open]),
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-participants-details > summary {
    display: none !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-actions-menu > summary {
    width: 44px !important;
    height: 44px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 10px !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow:
      0 1px 2px rgba(7, 27, 24, 0.055),
      0 5px 12px -10px rgba(7, 27, 24, 0.34) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-actions-menu[open] > summary {
    border-color: var(--ledger-brand) !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
  }

  /* Approved settlement layout: one calm ledger, with personal direction encoded in-place. */
  html.ledger-workspace-v1 .screen[data-event-view="summary"] > .settlement-stage {
    padding: 4px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-stage-heading {
    min-height: 36px !important;
    margin: 0 0 8px !important;
    padding-inline: 4px !important;
    justify-content: flex-start !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-stage-heading h2 {
    margin: 0 !important;
    color: var(--ledger-ink) !important;
    font-size: 20px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-transfer-board {
    display: grid !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-offline-note {
    display: none !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-row {
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-areas:
      "meta"
      "people"
      "actions"
      "explanation"
      "history" !important;
    gap: 8px !important;
    padding: 12px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 12px !important;
    background: #ffffff !important;
    box-shadow: 0 1px 3px rgba(7, 27, 24, 0.055) !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-row.is-personal-receiver {
    border-color: rgba(24, 113, 88, 0.4) !important;
    border-inline-start-width: 1px !important;
    background: #ffffff !important;
    box-shadow: 0 1px 3px rgba(7, 27, 24, 0.055) !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-row.is-personal-payer {
    border-color: rgba(190, 77, 64, 0.36) !important;
    border-inline-start-width: 1px !important;
    background: #ffffff !important;
    box-shadow: 0 1px 3px rgba(7, 27, 24, 0.055) !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] :is(
    .personal-transfer-badge,
    .group-transfer-badge
  ) {
    min-height: auto !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-row.is-personal-receiver .personal-transfer-badge {
    color: #187158 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-row.is-personal-payer .personal-transfer-badge {
    color: #a4473d !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .group-transfer-badge {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-main {
    display: contents !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-card-meta {
    grid-area: meta !important;
    min-height: 18px !important;
    justify-content: space-between !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-status {
    min-height: auto !important;
    max-width: none !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--ledger-muted) !important;
    background: transparent !important;
    font-size: 11px !important;
    font-weight: 650 !important;
    white-space: normal !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-status.status-paid {
    color: #187158 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-status.status-paid::before {
    display: none !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-people {
    grid-area: people !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-participant-name {
    min-width: 0 !important;
    display: inline-flex !important;
    align-items: baseline !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-current-user {
    flex: 0 0 auto !important;
    color: var(--ledger-muted) !important;
    font-size: 10px !important;
    font-weight: 650 !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-current-user::before {
    content: "· " !important;
  }

  html.ledger-workspace-v1.circle-design-v1 .screen[data-event-view="summary"] .transfer-arrow {
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--ledger-muted-strong) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-complete-button {
    gap: 5px !important;
    border-color: rgba(24, 113, 88, 0.22) !important;
    color: #187158 !important;
    background: var(--ledger-surface-soft) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .expense-step-modal .expense-payer-summary {
    width: max-content !important;
    max-width: 100% !important;
    min-height: 36px !important;
    display: inline-flex !important;
    align-items: center !important;
    margin: 10px 0 0 auto !important;
    padding: 7px 11px !important;
    border-radius: 10px !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1
    .expense-step-modal
    .expense-payer-summary.is-balanced {
    border-color: rgba(15, 23, 42, 0.12) !important;
    color: #52605b !important;
    background: #f3f5f4 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-complete-button.is-static {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: default !important;
    user-select: none !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-actions {
    grid-area: actions !important;
    width: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 10px !important;
    padding-top: 8px !important;
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-paid-summary {
    display: block !important;
    margin-top: 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-paid-history {
    grid-area: history !important;
    margin: 0 !important;
    border: 0 !important;
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-paid-history > summary {
    min-height: 44px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 10px !important;
    color: var(--ledger-muted-strong) !important;
    font-size: 12px !important;
    font-weight: 650 !important;
    cursor: pointer !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-paid-history > summary::marker {
    content: "" !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-paid-history-list {
    display: grid !important;
    gap: 6px !important;
    padding-bottom: 4px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-paid-history-item {
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 10px !important;
    padding: 8px 10px !important;
    border-radius: 9px !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-paid-history-item > span {
    min-width: 0 !important;
    display: grid !important;
    gap: 1px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-paid-history-item small {
    color: var(--ledger-muted) !important;
    font-size: 10px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-paid-history-item button {
    min-width: 96px !important;
    min-height: 44px !important;
    padding-inline: 10px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-explanation {
    grid-area: explanation !important;
    margin: 0 !important;
    border: 0 !important;
    border-top: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-explanation > summary {
    min-height: 44px !important;
    padding: 0 !important;
    color: var(--ledger-muted-strong) !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-row.is-paid {
    opacity: 1 !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-list-actions {
    margin-top: 14px !important;
    border-top: 0 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-stage-heading {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-stage-heading > div {
    min-width: 0 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-stage-heading h2 {
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-stage-heading > div > small {
    display: block !important;
    margin-top: 2px !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
  }

  html.ledger-workspace-v1 .settlement-repayment-shortcut {
    min-width: 0 !important;
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 7px !important;
    flex: 0 0 auto !important;
    padding: 0 10px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: 10px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 1px 2px rgba(7, 27, 24, 0.04) !important;
    font: inherit !important;
    font-size: 12px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 button.settlement-repayment-shortcut {
    cursor: pointer !important;
    transition:
      border-color 160ms ease,
      background-color 160ms ease,
      transform 160ms ease !important;
  }

  html.ledger-workspace-v1 .settlement-repayment-shortcut > span:first-child {
    width: 17px !important;
    height: 17px !important;
    display: inline-flex !important;
  }

  html.ledger-workspace-v1 .settlement-repayment-shortcut svg {
    width: 17px !important;
    height: 17px !important;
    stroke-width: 1.9 !important;
  }

  html.ledger-workspace-v1 .settlement-repayment-shortcut small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
  }

  html.ledger-workspace-v1 .settlement-repayment-shortcut.is-readonly {
    border-color: transparent !important;
    color: var(--ledger-muted-strong) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-list-actions > summary {
    width: 100% !important;
    min-height: 52px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 10px !important;
    padding: 0 16px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: 14px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-surface) !important;
    box-shadow: 0 2px 8px rgba(7, 27, 24, 0.06) !important;
    font-size: 15px !important;
    font-weight: 800 !important;
    cursor: pointer !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-share-summary-icon {
    width: 20px !important;
    height: 20px !important;
    display: inline-flex !important;
    flex: 0 0 auto !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-share-summary-icon svg {
    width: 20px !important;
    height: 20px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-list-actions > summary::after {
    content: "⌄" !important;
    margin-inline-start: auto !important;
    font-size: 15px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-list-actions[open] > summary::after {
    transform: rotate(180deg) !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-list-actions > div {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 8px !important;
    padding-bottom: 4px !important;
  }

  html.ledger-workspace-v1 .payer-difference-assignment {
    display: grid !important;
    gap: 10px !important;
    margin-top: 10px !important;
    padding: 12px 0 !important;
    border-top: 1px solid var(--ledger-line) !important;
    border-bottom: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .payer-difference-assignment > div:first-child {
    min-width: 0 !important;
    display: flex !important;
    align-items: baseline !important;
    justify-content: space-between !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .payer-difference-assignment > div:first-child > strong {
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .payer-difference-assignment .amount {
    color: var(--ledger-brand) !important;
    font-size: 15px !important;
  }

  html.ledger-workspace-v1 .payer-difference-options {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .payer-difference-options > button {
    min-width: 0 !important;
    min-height: 44px !important;
    flex: 1 1 120px !important;
  }

  html.ledger-workspace-v1 .people-management-screen > .merge-participants-panel {
    display: grid !important;
    gap: 18px !important;
    margin-top: 0 !important;
  }

  html.ledger-workspace-v1 .merge-participants-panel > .section-title-row {
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .merge-participants-panel .merge-participants-grid {
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .merge-participants-panel > [data-action="merge-participants"] {
    width: 100% !important;
    min-height: 52px !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .people-management-screen > .people-management-disclosure {
    margin-top: 16px !important;
    padding: 0 !important;
    overflow: clip !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure > summary {
    min-height: 72px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto auto !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 14px 18px !important;
    list-style: none !important;
    cursor: pointer !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure > summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure-copy > strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure-copy > small {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure-count {
    color: var(--ledger-muted-strong) !important;
    font-size: 12px !important;
    font-weight: 650 !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure-chevron {
    width: 20px !important;
    height: 20px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: var(--ledger-muted-strong) !important;
    transition: transform 180ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure-chevron svg {
    width: 18px !important;
    height: 18px !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure[open] .people-management-disclosure-chevron {
    transform: rotate(-90deg) !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure-body {
    gap: 0 !important;
    padding: 0 18px 8px !important;
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure .known-participant-row {
    min-height: 68px !important;
    margin: 0 !important;
    padding: 13px 0 !important;
    border: 0 !important;
    border-top: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure .known-participant-row:first-child {
    border-top: 0 !important;
  }

  html.ledger-workspace-v1 .people-management-disclosure .known-participant-row > .danger-button {
    min-width: 44px !important;
    min-height: 44px !important;
    padding-inline: 12px !important;
  }

  @media (max-width: 420px) {
    html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-stage-heading {
      align-items: center !important;
    }

    html.ledger-workspace-v1 .settlement-repayment-shortcut {
      max-width: 48% !important;
    }

    html.ledger-workspace-v1 .settlement-repayment-shortcut > span:nth-child(2) {
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }

    html.ledger-workspace-v1 .settlement-repayment-shortcut small {
      display: none !important;
    }

    html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-list-actions > div {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .merge-participants-panel .merge-participants-grid {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .people-management-disclosure > summary {
      grid-template-columns: minmax(0, 1fr) auto !important;
    }

    html.ledger-workspace-v1 .people-management-disclosure-count {
      display: none !important;
    }
  }

  @media (max-width: 340px) {
    html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero {
      margin-inline: 10px !important;
      padding: 14px !important;
    }

    html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero-title-row h2 {
      font-size: 21px !important;
      overflow-wrap: normal !important;
      word-break: keep-all !important;
    }

    html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero-actions > button,
    html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-more-actions,
    html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-more-actions > summary {
      width: 100% !important;
      max-width: none !important;
      overflow-wrap: normal !important;
      word-break: keep-all !important;
    }

    html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-stage {
      margin-inline: 10px !important;
      padding-inline: 14px !important;
    }

    html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-stage-heading {
      flex-wrap: wrap !important;
    }

    html.ledger-workspace-v1 .settlement-repayment-shortcut {
      max-width: 100% !important;
    }
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).ledger-workspace-v1
    .screen[data-event-view="summary"]
    .settlement-hero-actions {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).ledger-workspace-v1
    .screen[data-event-view="summary"]
    :is(.settlement-hero-actions > button, .settlement-more-actions, .settlement-more-actions > summary) {
    width: 100% !important;
    max-width: none !important;
    overflow-wrap: normal !important;
    word-break: keep-all !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).ledger-workspace-v1.circle-design-v1
    .settlement-screen
    > .settlement-hero
    + .settlement-stage {
    margin-top: 0 !important;
    padding-top: 8px !important;
  }

  @media (hover: hover) {
    html.ledger-workspace-v1 button.settlement-repayment-shortcut:hover {
      border-color: var(--ledger-brand) !important;
      background: var(--ledger-surface-soft) !important;
      transform: translateY(-1px) !important;
    }

    html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-actions-menu > summary:hover {
      border-color: var(--ledger-line-strong) !important;
      color: var(--ledger-brand) !important;
      background: var(--ledger-surface-soft) !important;
      box-shadow:
        0 1px 2px rgba(7, 27, 24, 0.06),
        0 8px 18px -13px rgba(7, 27, 24, 0.38) !important;
    }

    html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-actions-menu[open] > summary:hover {
      color: #ffffff !important;
      background: var(--ledger-brand) !important;
    }
  }

  /* Approved event polish: quiet balance, balanced action row, discreet overflow. */
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-personal-balance {
    border-color: var(--ledger-line) !important;
    background: #ffffff !important;
    box-shadow: 0 1px 3px rgba(7, 27, 24, 0.055) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-personal-balance:hover,
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-personal-balance:focus-visible {
    border-color: var(--ledger-line-strong) !important;
    background: #ffffff !important;
    box-shadow: 0 4px 14px -12px rgba(7, 27, 24, 0.34) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-personal-balance.is-debt .amount {
    color: #c45f68 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-action-dock {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    direction: ltr !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-action-total,
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-action-dock .primary-button {
    width: 100% !important;
    min-width: 0 !important;
    direction: rtl !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-action-total {
    display: grid !important;
    place-items: center !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker .participant-pill .avatar.is-account::after {
    display: none !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker .new-event-selection-check {
    margin-inline-start: auto !important;
    width: 26px !important;
    min-width: 26px !important;
    height: 26px !important;
    display: grid !important;
    place-items: center !important;
    border: 2px solid rgba(69, 91, 85, 0.28) !important;
    border-radius: 50% !important;
    color: transparent !important;
    background: #ffffff !important;
    transition-property: color, background-color, border-color, transform !important;
    transition-duration: 160ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker .new-event-selection-check svg {
    width: 15px !important;
    height: 15px !important;
    stroke-width: 2.5 !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker .participant-pill input:checked ~ .new-event-selection-check {
    border-color: #08745d !important;
    color: #ffffff !important;
    background: #08745d !important;
    transform: scale(1) !important;
  }

  html.ledger-workspace-v1 .app-selection-check {
    margin-inline-start: auto !important;
    width: 26px !important;
    min-width: 26px !important;
    height: 26px !important;
    display: grid !important;
    place-items: center !important;
    border: 2px solid rgba(69, 91, 85, 0.28) !important;
    border-radius: 50% !important;
    color: transparent !important;
    background: #ffffff !important;
    box-sizing: border-box !important;
    transition-property: color, background-color, border-color, transform !important;
    transition-duration: 160ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .app-selection-check svg {
    width: 15px !important;
    height: 15px !important;
    stroke-width: 2.5 !important;
  }

  html.ledger-workspace-v1 .participant-pill > input[type="checkbox"],
  html.ledger-workspace-v1 .quick-item-custom-share label > input[type="checkbox"] {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  html.ledger-workspace-v1 .participant-pill input:checked ~ .app-selection-check,
  html.ledger-workspace-v1 .expense-participant-row:has(.expense-participant-checkbox:checked) .app-selection-check,
  html.ledger-workspace-v1 .quick-item-custom-share label:has(input:checked) .app-selection-check,
  html.ledger-workspace-v1 .new-event-selected-participant .app-selection-check {
    border-color: #08745d !important;
    color: #ffffff !important;
    background: #08745d !important;
  }

  html.ledger-workspace-v1 .event-management-option {
    grid-template-columns: minmax(0, 1fr) 26px !important;
    align-items: center !important;
  }

  html.ledger-workspace-v1 .event-management-option .event-management-check.app-selection-check {
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .event-management-option:is(.is-active, [aria-checked="true"]) .event-management-check.app-selection-check {
    border: 2px solid #08745d !important;
    color: #ffffff !important;
    background: #08745d !important;
  }

  html.ledger-workspace-v1 .event-management-option:is(.is-active, [aria-checked="true"]) {
    border-color: rgba(8, 116, 93, 0.28) !important;
    background: #ffffff !important;
    box-shadow: inset -3px 0 0 #08745d !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .new-event-inline-picker details {
    position: relative !important;
  }

  html.ledger-workspace-v1 .new-event-inline-picker summary {
    min-height: 48px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding: 11px 14px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-control-radius) !important;
    background: #ffffff !important;
    cursor: pointer !important;
    list-style: none !important;
  }

  html.ledger-workspace-v1 .new-event-inline-picker summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .new-event-inline-picker-chevron {
    display: grid !important;
    transform: rotate(-90deg) !important;
    transition: transform 160ms ease !important;
  }

  html.ledger-workspace-v1 .new-event-inline-picker details[open] .new-event-inline-picker-chevron {
    transform: rotate(90deg) !important;
  }

  html.ledger-workspace-v1 .new-event-inline-picker-menu {
    display: grid !important;
    margin-block-start: 6px !important;
    padding: 5px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-control-radius) !important;
    background: #ffffff !important;
    box-shadow: 0 12px 28px rgba(16, 35, 33, 0.12) !important;
  }

  html.ledger-workspace-v1 .new-event-inline-picker-menu button {
    min-height: 44px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 10px !important;
    padding: 9px 11px !important;
    border: 0 !important;
    border-radius: 8px !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    text-align: start !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .new-event-inline-picker-menu button.is-selected {
    color: #08745d !important;
    background: rgba(8, 116, 93, 0.07) !important;
  }

  html.ledger-workspace-v1 .new-event-settlement-screen {
    padding-block-end: calc(104px + env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1 .quick-item-custom-share label {
    align-items: center !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-actions-menu > summary {
    width: 44px !important;
    height: 44px !important;
    border: 0 !important;
    border-radius: 10px !important;
    color: #465753 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-actions-icon {
    width: 20px !important;
    height: 20px !important;
    display: grid !important;
    place-items: center !important;
    line-height: 0 !important;
  }

  @media (hover: hover) {
    html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-actions-menu > summary:hover {
      border-color: transparent !important;
      color: var(--ledger-brand) !important;
      background: var(--ledger-surface-soft) !important;
      box-shadow: none !important;
    }

    html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-actions-menu[open] > summary:hover {
      color: #ffffff !important;
      background: var(--ledger-brand) !important;
    }
  }

  /* New-event participant routes: friends, offline name, or invite link. */
  html.ledger-workspace-v1 .new-event-participant-picker-heading {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: 28px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 10px !important;
    margin: 0 0 12px !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker-heading .command-card-icon {
    width: 28px !important;
    min-width: 28px !important;
    height: 28px !important;
    padding: 0 !important;
    color: var(--ledger-brand) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker-heading .command-card-icon svg {
    width: 24px !important;
    height: 24px !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker-heading h3,
  html.ledger-workspace-v1 .new-event-participant-picker-heading small,
  html.ledger-workspace-v1 .new-event-offline-copy strong,
  html.ledger-workspace-v1 .new-event-offline-copy small,
  html.ledger-workspace-v1 .new-event-invite-after-create-copy strong,
  html.ledger-workspace-v1 .new-event-invite-after-create-copy small {
    display: block !important;
    margin: 0 !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker-heading h3,
  html.ledger-workspace-v1 .new-event-offline-copy strong,
  html.ledger-workspace-v1 .new-event-invite-after-create-copy strong {
    color: var(--ledger-ink) !important;
    font-size: 15px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .new-event-participant-picker-heading small,
  html.ledger-workspace-v1 .new-event-offline-copy small,
  html.ledger-workspace-v1 .new-event-invite-after-create-copy small {
    margin-top: 3px !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .new-event-offline-add {
    display: grid !important;
    gap: 10px !important;
    padding-top: 14px !important;
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .new-event-offline-add .inline-actions {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: stretch !important;
    gap: 8px !important;
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .new-event-offline-add :is(input, button) {
    min-height: 48px !important;
  }

  html.ledger-workspace-v1 .new-event-invite-after-create {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 72px !important;
    display: grid !important;
    grid-template-columns: 28px minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 13px 14px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 12px !important;
    color: var(--ledger-ink) !important;
    background: #ffffff !important;
    box-shadow: 0 1px 3px rgba(7, 27, 24, 0.055) !important;
    text-align: start !important;
    transform: none !important;
    transition-property: border-color, background-color, box-shadow, transform !important;
    transition-duration: 180ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .new-event-invite-after-create:active {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .new-event-invite-after-create.is-active {
    border-color: var(--ledger-line-strong) !important;
    background: var(--ledger-surface-soft) !important;
    box-shadow: inset 3px 0 0 var(--ledger-brand), 0 2px 8px -6px rgba(7, 27, 24, 0.34) !important;
  }

  html.ledger-workspace-v1 .new-event-invite-after-create .command-card-icon {
    width: 28px !important;
    min-width: 28px !important;
    height: 28px !important;
    padding: 0 !important;
    color: var(--ledger-brand) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .new-event-invite-after-create .command-card-icon svg {
    width: 23px !important;
    height: 23px !important;
  }

  html.ledger-workspace-v1 .new-event-invite-after-create-state {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .new-event-invite-after-create.is-active .new-event-invite-after-create-state {
    color: var(--ledger-brand) !important;
  }

  @media (hover: hover) {
    html.ledger-workspace-v1 .new-event-invite-after-create:hover {
      border-color: var(--ledger-line-strong) !important;
      background: var(--ledger-surface-soft) !important;
      box-shadow: 0 4px 14px -12px rgba(7, 27, 24, 0.34) !important;
    }
  }

  @media (max-width: 390px) {
    html.ledger-workspace-v1 .new-event-offline-add .inline-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .new-event-offline-add button {
      width: 100% !important;
    }
  }

  /* Dedicated participant step in the new-event flow. */
  html.ledger-workspace-v1 .new-event-participants-entry {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 76px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 16px !important;
    padding: 14px 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 14px !important;
    color: var(--ledger-ink) !important;
    background: #ffffff !important;
    box-shadow: 0 2px 10px -8px rgba(12, 27, 32, 0.34) !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .new-event-participants-entry:active {
    transform: scale(0.985) !important;
  }

  html.ledger-workspace-v1 .new-event-participants-entry:focus-visible {
    outline: 3px solid rgba(22, 168, 153, 0.2) !important;
    outline-offset: 2px !important;
  }

  html.ledger-workspace-v1 .new-event-participants-entry .new-event-participants-summary {
    min-width: 0 !important;
    display: grid !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .new-event-participants-entry .new-event-participants-summary strong {
    color: var(--ledger-ink) !important;
    font-size: 16px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .new-event-participants-entry .new-event-participants-summary > span {
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    font-weight: 500 !important;
  }

  html.ledger-workspace-v1 .new-event-participants-entry .new-event-participants-action {
    flex: 0 0 auto !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    color: var(--ledger-brand) !important;
    font-size: 13px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .new-event-participants-entry .forward-chevron {
    width: 18px !important;
    height: 18px !important;
  }

  html.ledger-workspace-v1 .new-event-participants-screen {
    min-height: 100dvh !important;
    padding-bottom: calc(24px + env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1 .new-event-participants-screen > .top .brand .muted {
    max-width: 34ch !important;
    margin-top: 6px !important;
  }

  html.ledger-workspace-v1 .new-event-participant-actions {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 10px !important;
    margin-top: 10px !important;
  }

  html.ledger-workspace-v1 .new-event-participant-additions {
    display: grid !important;
    gap: 0 !important;
    margin-top: 24px !important;
    padding-top: 22px !important;
    border-top: 1px solid var(--ledger-line-strong) !important;
  }

  html.ledger-workspace-v1 .new-event-participant-additions > h2 {
    margin: 0 !important;
    color: var(--ledger-ink) !important;
    font-size: 19px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .new-event-participant-route-action {
    min-width: 0 !important;
    min-height: 62px !important;
    display: grid !important;
    grid-template-columns: 28px minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 13px 14px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: 12px !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow: none !important;
    text-align: start !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .new-event-participant-route-action.is-primary {
    grid-column: auto !important;
    min-height: 68px !important;
    border-color: var(--ledger-brand) !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .new-event-participant-route-action.is-active:not(.is-primary) {
    border-color: var(--ledger-line-strong) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-surface-soft) !important;
    box-shadow: inset 3px 0 0 var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .new-event-participant-route-action.is-primary.is-active {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.32) !important;
  }

  html.ledger-workspace-v1 .new-event-participant-route-action:active {
    transform: scale(0.975) !important;
  }

  html.ledger-workspace-v1 .new-event-participant-route-icon {
    width: 28px !important;
    height: 28px !important;
    display: grid !important;
    place-items: center !important;
  }

  html.ledger-workspace-v1 .new-event-participant-route-icon svg {
    width: 24px !important;
    height: 24px !important;
  }

  html.ledger-workspace-v1 .new-event-participant-route-action strong {
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
    font-size: 15px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .new-event-participant-route-state {
    color: inherit !important;
    font-size: 11px !important;
    font-weight: 700 !important;
  }

  /* The participant manager deliberately reuses the event-creation routes. */
  html.ledger-workspace-v1 .event-participant-add-screen .new-event-participant-actions {
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen .new-event-participant-route-action,
  html.ledger-workspace-v1 .event-participant-add-screen details.new-event-participant-route-action {
    min-width: 0 !important;
    min-height: 62px !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: 12px !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen button.new-event-participant-route-action {
    display: grid !important;
    grid-template-columns: 28px minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 13px 14px !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen button.new-event-participant-route-action.is-primary {
    min-height: 68px !important;
    border-color: var(--ledger-brand) !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen details.new-event-participant-route-action > summary {
    min-height: 62px !important;
    grid-template-columns: 28px minmax(0, 1fr) auto !important;
    gap: 10px !important;
    padding: 13px 14px !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen .participant-add-friends > summary {
    grid-template-columns: 28px minmax(0, 1fr) auto 18px !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen .participant-invite-copy {
    display: grid !important;
    gap: 1px !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen .participant-invite-copy strong {
    color: inherit !important;
    font-size: 15px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen .participant-invite-copy :is(span, small) {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen button.is-primary .participant-invite-copy span {
    color: rgba(255, 255, 255, 0.78) !important;
  }

  html.ledger-workspace-v1 .event-participant-empty-friends:disabled {
    opacity: 0.62 !important;
  }

  html.ledger-workspace-v1 .new-event-participant-editor {
    display: grid !important;
    gap: 14px !important;
    margin-top: 14px !important;
    padding: 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 12px !important;
    background: #ffffff !important;
    box-shadow: 0 2px 10px -8px rgba(12, 27, 32, 0.3) !important;
  }

  html.ledger-workspace-v1 .new-event-participant-editor > header {
    display: grid !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .new-event-participant-editor > header :is(h2, p) {
    margin: 0 !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .new-event-participant-editor > header h2 {
    color: var(--ledger-ink) !important;
    font-size: 17px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .new-event-participant-editor > header p {
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
  }

  html.ledger-workspace-v1 .new-event-participant-editor.new-event-offline-add {
    padding-top: 16px !important;
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participants {
    display: grid !important;
    gap: 12px !important;
    margin-top: 18px !important;
    padding: 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 14px !important;
    background: #ffffff !important;
    box-shadow: 0 8px 22px -20px rgba(12, 27, 32, 0.34) !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participants-heading {
    min-width: 0 !important;
    display: flex !important;
    align-items: baseline !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding-bottom: 10px !important;
    border-bottom: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participants-heading h2 {
    margin: 0 !important;
    color: var(--ledger-ink) !important;
    font-size: 19px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participants-heading > span {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant-list {
    display: grid !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant {
    position: relative !important;
    min-width: 0 !important;
    min-height: 76px !important;
    display: grid !important;
    grid-template-columns: 48px minmax(0, 1fr) auto 34px !important;
    align-items: center !important;
    gap: 11px !important;
    padding: 12px 14px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 12px !important;
    color: var(--ledger-ink) !important;
    background: #ffffff !important;
    box-shadow: 0 2px 10px -8px rgba(12, 27, 32, 0.32) !important;
    cursor: pointer !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant.is-current-participant {
    cursor: default !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant > input {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant:has(input:focus-visible) {
    outline: 3px solid rgba(22, 168, 153, 0.2) !important;
    outline-offset: 2px !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant .avatar {
    width: 48px !important;
    min-width: 48px !important;
    height: 48px !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant-copy strong,
  html.ledger-workspace-v1 .new-event-selected-participant-copy .participant-username {
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant-copy strong {
    font-size: 16px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant-copy .participant-username {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant-self {
    padding: 5px 9px !important;
    border-radius: 999px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
    font-size: 12px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant-check {
    width: 34px !important;
    height: 34px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 50% !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .new-event-selected-participant-check svg {
    width: 18px !important;
    height: 18px !important;
  }

  html.ledger-workspace-v1 .new-event-participants-empty {
    margin: 0 !important;
    padding: 22px 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 12px !important;
    color: var(--ledger-muted) !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .new-event-participant-footer {
    position: sticky !important;
    bottom: 0 !important;
    z-index: 8 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 2fr) minmax(112px, 1fr) !important;
    gap: 10px !important;
    margin-top: 28px !important;
    padding: 14px 0 calc(8px + env(safe-area-inset-bottom)) !important;
    border-top: 1px solid var(--ledger-line) !important;
    background: rgba(248, 251, 250, 0.98) !important;
  }

  html.ledger-workspace-v1 .new-event-participant-footer :is(.primary-button, .secondary-button) {
    min-height: 54px !important;
    border-radius: 12px !important;
  }

  html.ledger-workspace-v1 .new-event-participant-subscreen {
    display: flex !important;
    flex-direction: column !important;
  }

  html.ledger-workspace-v1 .new-event-participant-subscreen .new-event-participant-editor {
    margin-top: 18px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    animation: new-event-participant-subview-enter 180ms cubic-bezier(0.2, 0, 0, 1) both !important;
  }

  html.ledger-workspace-v1 .new-event-participant-subscreen .new-event-participant-editor > header {
    display: none !important;
  }

  html.ledger-workspace-v1 .new-event-participant-subview-footer {
    grid-template-columns: minmax(0, 1fr) !important;
    margin-top: auto !important;
    padding-top: 20px !important;
  }

  html.ledger-workspace-v1 .new-event-participant-subview-footer .primary-button:active:not(:disabled) {
    transform: scale(0.96) !important;
  }

  @keyframes new-event-participant-subview-enter {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 390px) {
    html.ledger-workspace-v1 .new-event-participant-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1 .new-event-participant-route-action.is-primary {
      grid-column: auto !important;
    }

    html.ledger-workspace-v1 .new-event-selected-participant {
      grid-template-columns: 42px minmax(0, 1fr) 32px !important;
      gap: 9px !important;
      padding-inline: 10px !important;
    }

    html.ledger-workspace-v1 .new-event-selected-participant .avatar {
      width: 42px !important;
      min-width: 42px !important;
      height: 42px !important;
    }

    html.ledger-workspace-v1 .new-event-selected-participant :is(.participant-connection-badge, .new-event-selected-participant-self) {
      display: none !important;
    }

    html.ledger-workspace-v1 .new-event-participant-footer {
      grid-template-columns: minmax(0, 1fr) minmax(96px, 0.44fr) !important;
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

  /* One empty-expense pattern for both the ledger and settlement entry points. */
  html.ledger-workspace-v1 .event-empty-expense-state {
    min-height: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 14px !important;
    margin-bottom: 2px !important;
    padding: 18px 16px 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 16px !important;
    background: #ffffff !important;
    box-shadow: 0 8px 22px rgba(18, 58, 46, 0.06) !important;
  }

  html.ledger-workspace-v1 .event-empty-expense-copy {
    display: grid !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .event-empty-expense-eyebrow {
    width: max-content !important;
    display: inline-flex !important;
    margin: 0 0 2px !important;
  }

  html.ledger-workspace-v1 .event-empty-expense-copy h2 {
    margin: 0 !important;
    font-size: 21px !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .event-empty-expense-copy p {
    margin: 0 !important;
    color: var(--ledger-muted) !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .event-empty-expense-actions {
    width: 100% !important;
    padding: 0 !important;
  }

  html.ledger-workspace-v1 .event-empty-expense-state .event-start-primary {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 48px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 9px !important;
  }

  html.ledger-workspace-v1 .event-empty-expense-state .event-start-primary .command-card-icon {
    width: 20px !important;
    height: 20px !important;
  }

  /* Event workspace additions stay inside the existing visual language. */
  html.ledger-workspace-v1 .screen[data-screen-kind="home"] > .top,
  html.ledger-workspace-v1 .product-home-screen > .top {
    margin-block-end: 0 !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-actions {
    position: relative !important;
    z-index: 4 !important;
    width: 100% !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    justify-items: center !important;
    gap: 0 !important;
    margin: -74px 0 16px !important;
  }

  html.ledger-workspace-v1 body #app
    .screen.product-empty-home
    .home-empty-visual {
    aspect-ratio: 1672 / 941 !important;
  }

  html.ledger-workspace-v1 body #app
    .screen.product-empty-home
    .home-empty-visual
    img {
    object-fit: contain !important;
    background: #004d47 !important;
  }

  @media (min-width: 721px) and (max-width: 1024px),
    (min-width: 721px) and (max-width: 1366px) and (hover: none) and (pointer: coarse) {
    html.circle-design-v1.ledger-workspace-v1 body #app
      .screen[data-screen-kind="home"] {
      width: 100% !important;
      max-width: 960px !important;
      padding-inline: 28px !important;
    }

  }

  html.ledger-workspace-v1 .product-home-screen .home-benefit-actions {
    display: grid !important;
    grid-template-columns: minmax(0, 1.48fr) minmax(126px, 0.92fr) !important;
    align-items: stretch !important;
    gap: 8px !important;
    margin: 0 0 6px !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action {
    min-width: 0 !important;
    min-height: 92px !important;
    display: grid !important;
    grid-template-columns: 38px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 14px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 16px !important;
    color: var(--ledger-ink) !important;
    background: #ffffff !important;
    box-shadow: 0 8px 22px rgba(18, 58, 46, 0.06) !important;
    text-align: start !important;
    scale: 1 !important;
    transition-property: box-shadow, scale !important;
    transition-duration: 160ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .product-home-screen button.home-quick-action:active:not(:disabled) {
    scale: 0.96 !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action > span:nth-child(2) {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action strong {
    font-size: 15px !important;
    line-height: 1.25 !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action small {
    color: var(--ledger-muted) !important;
    font-size: 11px !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action-icon {
    width: 38px !important;
    height: 38px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 12px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action.is-primary {
    width: min(48%, 190px) !important;
    min-height: 56px !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    gap: 5px !important;
    padding: 6px 12px !important;
    border-radius: 999px !important;
    border-color: rgba(10, 82, 63, 0.22) !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow:
      0 14px 32px rgba(18, 58, 46, 0.12),
      0 3px 9px rgba(18, 58, 46, 0.06) !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action.is-primary > span:nth-child(2) {
    flex: 0 1 auto !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action.is-primary strong {
    font-size: 16px !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action.is-primary small {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action.is-primary .home-quick-action-icon {
    width: 44px !important;
    height: 44px !important;
    min-width: 44px !important;
    min-height: 44px !important;
    padding: 0 !important;
    border: 0 !important;
    color: var(--ledger-brand) !important;
    background: transparent !important;
    box-shadow: none !important;
    scale: 1 !important;
    transition-property: scale, background-color, box-shadow !important;
    transition-duration: 160ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action.is-primary .home-quick-action-icon svg {
    width: 22px !important;
    height: 22px !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action.is-primary .home-quick-action-icon:active:not(:disabled) {
    scale: 0.96 !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-quick-action.is-primary .home-quick-action-icon:focus-visible {
    outline: 3px solid rgba(34, 174, 178, 0.28) !important;
    outline-offset: 3px !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-friends-action {
    grid-template-columns: 34px auto !important;
    justify-content: center !important;
    gap: 8px !important;
    padding: 12px !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-friends-action .home-quick-action-icon {
    width: 34px !important;
    height: 34px !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-benefit-actions .home-friends-action {
    min-height: 76px !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-benefit-actions .referral-reward-card.is-home {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 76px !important;
    grid-template-columns: 40px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 10px !important;
    margin: 0 !important;
    padding: 12px 14px !important;
    border: 1px solid rgba(10, 82, 63, 0.14) !important;
    border-radius: 16px !important;
    color: var(--ledger-ink) !important;
    background: #ffffff !important;
    box-shadow: 0 8px 22px rgba(18, 58, 46, 0.07) !important;
    text-align: start !important;
    scale: 1 !important;
    transition-property: scale, box-shadow !important;
    transition-duration: 160ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-benefit-actions .referral-reward-card.is-home:active:not(:disabled) {
    scale: 0.96 !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-benefit-actions .referral-reward-card.is-home .referral-reward-copy strong {
    font-size: 14px !important;
    line-height: 1.3 !important;
  }

  @media (max-width: 390px) {
    html.ledger-workspace-v1 .product-home-screen .home-quick-action {
      grid-template-columns: 34px minmax(0, 1fr) !important;
    }

  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-workspace-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
    overflow: visible !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-workspace-tab {
    min-height: 46px !important;
    border-radius: 14px !important;
    border-inline-start-width: 1px !important;
    transition-property: background-color, border-color, box-shadow, color, scale !important;
    transition-duration: 180ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-workspace-tab:active:not(:disabled) {
    scale: 0.96 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-workspace-add-expense {
    padding-inline: 8px !important;
    font-size: 12px !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .event-expenses-heading {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    margin-bottom: 12px !important;
  }

  html.ledger-workspace-v1 .event-expense-filter {
    min-width: 0 !important;
    width: min(52%, 220px) !important;
    height: 44px !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    padding: 0 12px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 12px !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .event-expense-filter input {
    min-width: 0 !important;
    width: 100% !important;
    padding: 0 !important;
    border: 0 !important;
    outline: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .event-cover-image {
    position: relative !important;
    aspect-ratio: 16 / 7 !important;
    margin: 0 0 14px !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 16px !important;
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1 .event-cover-image img {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    border-radius: inherit !important;
  }

  html.ledger-workspace-v1 .event-cover-image:has(.event-cover-actions-menu[open]) {
    overflow: visible !important;
    z-index: 30 !important;
  }

  html.ledger-workspace-v1 .event-cover-menu-button {
    position: absolute !important;
    inset-block-start: 10px !important;
    inset-inline-end: 10px !important;
    width: 44px !important;
    height: 44px !important;
    display: grid !important;
    place-items: center !important;
    border: 1px solid rgba(255, 255, 255, 0.72) !important;
    border-radius: 12px !important;
    color: #ffffff !important;
    background: rgba(7, 27, 24, 0.72) !important;
    box-shadow: 0 8px 20px rgba(7, 27, 24, 0.24) !important;
    backdrop-filter: blur(8px) !important;
  }

  html.ledger-workspace-v1 .event-cover-actions-menu {
    position: absolute !important;
    inset-block-start: 10px !important;
    inset-inline-end: 10px !important;
    z-index: 18 !important;
  }

  html.ledger-workspace-v1 .event-cover-actions-menu > summary {
    position: static !important;
    list-style: none !important;
  }

  html.ledger-workspace-v1 .event-cover-actions-menu > summary::-webkit-details-marker {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-cover-actions-panel {
    position: absolute !important;
    inset-block-start: calc(100% + 8px) !important;
    inset-inline-end: 0 !important;
    width: 166px !important;
    height: auto !important;
    max-height: none !important;
    display: grid !important;
    gap: 4px !important;
    padding: 8px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 14px !important;
    color: var(--ledger-ink) !important;
    background: #ffffff !important;
    box-shadow: 0 18px 38px -20px rgba(4, 35, 29, 0.42) !important;
    overflow: visible !important;
  }

  html.ledger-workspace-v1 .event-cover-action {
    width: 100% !important;
    min-height: 44px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    padding: 0 12px !important;
    border: 0 !important;
    border-radius: 10px !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    cursor: pointer !important;
    font: inherit !important;
    font-weight: 700 !important;
    font-size: 13.5px !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .expense-notes-modal {
    max-width: 520px !important;
  }

  html.ledger-workspace-v1 .expense-notes-modal .expense-flow-fields {
    display: grid !important;
    gap: 16px !important;
  }

  html.ledger-workspace-v1 .expense-notes-actions {
    margin-top: 18px !important;
  }

  html.ledger-workspace-v1 .event-cover-action:hover {
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .event-cover-action.is-danger {
    color: #a33a32 !important;
  }

  html.ledger-workspace-v1 .event-cover-settings {
    display: grid !important;
    gap: 12px !important;
    padding: 16px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 16px !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .event-cover-settings img {
    width: 100% !important;
    aspect-ratio: 16 / 7 !important;
    object-fit: cover !important;
    border-radius: 12px !important;
  }

  html.ledger-workspace-v1 .event-cover-settings-copy,
  html.ledger-workspace-v1 .event-cover-settings-actions {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .event-cover-settings-copy {
    align-items: flex-start !important;
    flex-direction: column !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .event-cover-upload {
    cursor: pointer !important;
  }

  html.ledger-workspace-v1 .event-cover-source-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  /* An account gate must never render as content inside an event screen. */
  html.ledger-workspace-v1 #public-account-auth-gate {
    position: fixed !important;
    inset: 0 !important;
    z-index: 1000 !important;
    overflow: auto !important;
  }

  html.ledger-workspace-v1:has(#public-account-auth-gate) #app {
    visibility: hidden !important;
    pointer-events: none !important;
  }

  /* Final mobile touch-target guardrails for shared route controls. */
  html.ledger-workspace-v1 .product-route-controls > .accessibility-entry-button,
  html.ledger-workspace-v1 .expense-modal-step-header .expense-accessibility-button,
  html.ledger-workspace-v1 .event-settings-accessibility-button {
    width: 48px !important;
    min-width: 48px !important;
    height: 48px !important;
    min-height: 48px !important;
    flex: 0 0 48px !important;
  }

  html.ledger-workspace-v1 .event-creation-progress li,
  html.ledger-workspace-v1 .event-creation-progress li > button {
    min-height: 44px !important;
  }

  /* Profile image sources follow the same compact task pattern as event images. */
  html.ledger-workspace-v1 .profile-avatar-picker-body {
    display: grid !important;
    gap: 14px !important;
    padding: 14px !important;
    border-top: 1px solid var(--ledger-line) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .profile-avatar-source-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .profile-avatar-source-grid > :only-child {
    grid-column: 1 / -1 !important;
  }

  html.ledger-workspace-v1 .profile-avatar-upload,
  html.ledger-workspace-v1 .profile-avatar-source-grid > button {
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    scale: 1 !important;
    transition-property: background-color, border-color, color, scale !important;
    transition-duration: 180ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 :is(
    .profile-avatar-upload,
    .profile-avatar-source-grid > button
  ):active:not(:disabled) {
    scale: 0.96 !important;
  }

  html.ledger-workspace-v1 .profile-avatar-picker-body > .profile-avatar-picker {
    margin: 0 !important;
    padding: 14px 0 0 !important;
    border: 0 !important;
    border-top: 1px solid var(--ledger-line) !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .profile-avatar-summary-preview > img,
  html.ledger-workspace-v1 .profile-avatar-preview > img {
    outline: 1px solid rgba(0, 0, 0, 0.1) !important;
    outline-offset: -1px !important;
  }

  /* Group creation uses the same white task surfaces and hierarchy as the rest of the app. */
  html.ledger-workspace-v1 .group-create-panel {
    display: grid !important;
    gap: 14px !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    background: var(--ledger-surface) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .referral-benefit-card {
    position: relative !important;
    min-height: 136px !important;
    align-content: center !important;
    gap: 6px !important;
    overflow: hidden !important;
    padding: 20px !important;
    border: 0 !important;
    color: #ffffff !important;
    background:
      linear-gradient(136deg, #071f18 0%, #0b4a38 60%, #0f6b50 100%) !important;
    box-shadow: 0 18px 38px -24px rgba(3, 44, 35, 0.72) !important;
  }

  html.ledger-workspace-v1 .referral-benefit-card::after {
    content: "" !important;
    position: absolute !important;
    width: 132px !important;
    height: 132px !important;
    inset-block-start: -68px !important;
    inset-inline-end: -38px !important;
    border: 22px solid rgba(33, 170, 166, 0.16) !important;
    border-radius: 50% !important;
    pointer-events: none !important;
  }

  html.ledger-workspace-v1 .referral-benefit-card > * {
    position: relative !important;
    z-index: 1 !important;
  }

  html.ledger-workspace-v1 .referral-benefit-label {
    color: #9ce2d7 !important;
    font-size: 12px !important;
    font-weight: 850 !important;
  }

  html.ledger-workspace-v1 .referral-benefit-card > strong {
    display: flex !important;
    align-items: baseline !important;
    gap: 10px !important;
    color: #ffffff !important;
    font-size: 20px !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .referral-benefit-card > strong .font-num {
    color: #ffffff !important;
    font-size: clamp(46px, 11vw, 56px) !important;
    line-height: 0.88 !important;
  }

  html.ledger-workspace-v1 .referral-benefit-card p {
    max-width: 42ch !important;
    color: rgba(255, 255, 255, 0.74) !important;
  }

  html.ledger-workspace-v1 .referral-active-until {
    color: #063f36 !important;
    background: #bfe9df !important;
  }

  html.ledger-workspace-v1 .referral-share-section {
    gap: 14px !important;
    padding: 16px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: var(--ledger-surface) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .referral-section-heading > small {
    color: var(--ledger-accent) !important;
    font-size: 11px !important;
    font-weight: 850 !important;
  }

  html.ledger-workspace-v1 .referral-share-workspace {
    grid-template-columns: 190px minmax(0, 1fr) !important;
    gap: 16px !important;
  }

  html.ledger-workspace-v1 .referral-qr-card {
    gap: 10px !important;
    padding: 12px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 16px !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .referral-qr-code {
    padding: 8px !important;
    border: 1px solid rgba(0, 0, 0, 0.1) !important;
    border-radius: 10px !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .referral-qr-code svg {
    outline: 1px solid oklch(0 0 0 / 0.1) !important;
    outline-offset: -1px !important;
  }

  html.ledger-workspace-v1 .referral-qr-card figcaption {
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .referral-qr-card figcaption strong {
    color: var(--ledger-ink) !important;
    font-size: 13px !important;
    font-weight: 750 !important;
  }

  html.ledger-workspace-v1 .referral-qr-card figcaption small,
  html.ledger-workspace-v1 .referral-link-field > span {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .referral-share-actions button {
    min-height: 48px !important;
  }

  html.ledger-workspace-v1 .referral-share-actions {
    grid-template-columns: minmax(0, 1fr) auto !important;
  }

  html.ledger-workspace-v1 .referral-share-actions .secondary-button {
    min-width: 104px !important;
  }

  html.ledger-workspace-v1 .referral-link-details summary,
  html.ledger-workspace-v1 .referral-more-details > summary {
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .referral-more-details > summary {
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1 .referral-more-details > summary strong {
    color: var(--ledger-ink) !important;
  }

  html.ledger-workspace-v1 .referral-more-details-content {
    border-color: var(--ledger-line) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .referral-progress-section {
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  @media (max-width: 760px) {
    html.ledger-workspace-v1
      #public-referral-rewards-dialog
      .referral-share-workspace {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.ledger-workspace-v1
      #public-referral-rewards-dialog
      .referral-qr-card {
      grid-row: 2 !important;
      width: min(100%, 190px) !important;
      justify-self: center !important;
    }

    html.ledger-workspace-v1
      #public-referral-rewards-dialog
      .referral-share-controls {
      grid-row: 1 !important;
    }

    html.ledger-workspace-v1
      #public-referral-rewards-dialog
      .referral-share-section {
      gap: 12px !important;
      padding: 14px !important;
    }
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview)
    #public-referral-rewards-dialog
    .referral-share-actions {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html.ledger-workspace-v1 .group-create-panel::before,
  html.ledger-workspace-v1 .group-create-panel::after {
    display: none !important;
  }

  html.ledger-workspace-v1 .group-create-panel > * + * {
    margin-block-start: 0 !important;
  }

  html.ledger-workspace-v1 .group-create-section {
    min-width: 0 !important;
    display: grid !important;
    gap: 14px !important;
    padding: 18px !important;
    background: var(--ledger-surface) !important;
  }

  html.ledger-workspace-v1 .group-create-section + .group-create-section {
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .group-create-section-heading {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: 42px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 12px !important;
  }

  html.ledger-workspace-v1 .group-create-section-icon {
    width: 42px !important;
    height: 42px !important;
    display: grid !important;
    place-items: center !important;
    border: 1px solid rgba(11, 74, 56, 0.12) !important;
    border-radius: 13px !important;
    color: var(--ledger-brand) !important;
    background: rgba(6, 75, 67, 0.08) !important;
  }

  html.ledger-workspace-v1 .group-create-section-icon svg {
    width: 21px !important;
    height: 21px !important;
  }

  html.ledger-workspace-v1 .group-create-section-heading h2,
  html.ledger-workspace-v1 .group-create-section-heading p {
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .group-create-section-heading h2 {
    color: var(--ledger-ink) !important;
    font-size: 17px !important;
    font-weight: 820 !important;
  }

  html.ledger-workspace-v1 .group-create-section-heading p {
    margin-block-start: 3px !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1 .group-create-members .participant-grid {
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .group-create-footer {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(150px, 0.7fr) !important;
    align-items: center !important;
    gap: 14px !important;
    padding: 14px 18px 18px !important;
    border-top: 1px solid var(--ledger-line) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .group-create-footer > span {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.ledger-workspace-v1 .group-create-footer strong {
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
  }

  html.ledger-workspace-v1 .group-create-footer small {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1 .group-create-footer .primary-button {
    width: 100% !important;
    min-height: 48px !important;
    margin: 0 !important;
    scale: 1 !important;
    transition-property: background-color, box-shadow, opacity, scale !important;
    transition-duration: 180ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .group-create-footer .primary-button:active:not(:disabled) {
    scale: 0.96 !important;
  }

  @media (max-width: 560px) {
    html.ledger-workspace-v1 .group-create-section {
      padding: 16px !important;
    }

    html.ledger-workspace-v1 .group-create-footer {
      grid-template-columns: 1fr !important;
      padding: 14px 16px 16px !important;
    }
  }

  /* Repayment choices stay responsive while cloud saves finish in sequence. */
  html.ledger-workspace-v1 .event-repayment-field .event-management-option {
    scale: 1 !important;
    transition-property: background-color, border-color, box-shadow, color, scale !important;
    transition-duration: 180ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .event-repayment-field .event-management-option:hover:not(:disabled) {
    transform: none !important;
  }

  html.ledger-workspace-v1 .event-repayment-field .event-management-option:active:not(:disabled) {
    scale: 0.96 !important;
  }

  html.ledger-workspace-v1 .event-repayment-field .event-management-check.app-selection-check {
    opacity: 0.72 !important;
    scale: 0.92 !important;
    transition-property: color, background-color, border-color, opacity, scale !important;
    transition-duration: 180ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .event-repayment-field .event-management-option:is(.is-active, [aria-checked="true"]) .event-management-check.app-selection-check {
    opacity: 1 !important;
    scale: 1 !important;
  }

  /* Event creation must remain operable above the persistent mobile navigation. */
  @media (max-width: 720px) {
    html.ledger-workspace-v1 .screen[data-event-creation-step] {
      padding-bottom: calc(156px + env(safe-area-inset-bottom)) !important;
      scroll-padding-bottom: calc(156px + env(safe-area-inset-bottom)) !important;
    }
  }

  html.ledger-workspace-v1 .reopen-payment-options {
    display: grid;
    gap: 10px;
    margin: 18px 0 4px;
    padding: 0;
    border: 0;
  }

  html.ledger-workspace-v1 .reopen-payment-options legend {
    margin-bottom: 4px;
    color: var(--ink-strong);
    font-weight: 800;
  }

  html.ledger-workspace-v1 .reopen-payment-option {
    display: grid;
    gap: 5px;
    width: 100%;
    padding: 15px 16px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
    color: var(--ink-strong);
    text-align: right;
  }

  html.ledger-workspace-v1 .reopen-payment-option.is-selected {
    border-color: var(--brand);
    box-shadow: inset -4px 0 0 var(--brand);
  }

  html.ledger-workspace-v1 .reopen-payment-option.is-destructive.is-selected {
    border-color: #c95c57;
    box-shadow: inset -4px 0 0 #c95c57;
  }

  html.ledger-workspace-v1 .reopen-payment-option > span {
    color: var(--ink-muted);
    font-size: 0.88rem;
  }

  html.ledger-workspace-v1 .recommended-label {
    display: inline-flex;
    margin-inline-start: 6px;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--brand-soft);
    color: var(--brand-strong);
    font-size: 0.72rem;
  }

  html.ledger-workspace-v1 .settlement-hero:not(.is-complete) {
    border-color: rgba(194, 133, 28, 0.32) !important;
    background: #fffaf0 !important;
  }

  html.ledger-workspace-v1 .settlement-screen:has(.settlement-hero .status-chip.is-ok) .settlement-hero {
    border-color: rgba(22, 122, 75, 0.28) !important;
    background: #f4fbf7 !important;
  }

  html.ledger-workspace-v1 .transfer-interim-label {
    max-width: 180px;
    color: #8a641c;
    font-size: 0.82rem;
    font-weight: 750;
    line-height: 1.35;
  }

  html.ledger-workspace-v1 .transfer-row:has(.transfer-explanation) {
    cursor: pointer;
  }

  html.ledger-workspace-v1 .transfer-row[tabindex]:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--ledger-brand) 68%, #ffffff) !important;
    outline-offset: 3px !important;
  }

  html.ledger-workspace-v1 .transfer-row .transfer-explanation > summary {
    display: none !important;
  }

  html.ledger-workspace-v1 .transfer-row .transfer-explanation[open] {
    margin-top: 10px !important;
    padding-top: 10px !important;
    border-top: 1px solid var(--line) !important;
  }

  /* Summary lifecycle layout: keep the event state obvious, then show transfers. */
  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero {
    margin: 8px 14px 10px !important;
    padding: 12px 16px !important;
    border-radius: 22px !important;
    box-shadow: 0 8px 24px rgba(30, 54, 49, 0.06) !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero:not(.is-complete) {
    border: 1px solid rgba(194, 133, 28, 0.34) !important;
    background: #fffaf0 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero-main {
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero-title-row {
    display: grid !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero-title-row h2 {
    max-width: 620px !important;
    margin: 0 !important;
    color: var(--ledger-ink) !important;
    font-family: var(--font-hebrew) !important;
    font-size: clamp(21px, 5.2vw, 26px) !important;
    font-weight: 800 !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero-title-row p {
    max-width: 620px !important;
    margin: 6px 0 0 !important;
    font-family: var(--font-hebrew) !important;
    font-size: 14px !important;
    line-height: 1.55 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero-actions {
    margin-top: 10px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero-actions > .settlement-close-primary {
    width: 100% !important;
    min-height: 48px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-hero .status-chip {
    width: fit-content !important;
    margin: 0 0 6px !important;
    min-height: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--ledger-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-family: var(--font-hebrew) !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    line-height: 1.4 !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-screen-kind="event"] .event-workspace-nav {
    position: static !important;
    inset: auto !important;
    z-index: auto !important;
  }

  html.ledger-workspace-v1 body #app
    .screen:is([data-screen-kind="settlement"], [data-event-view="summary"])
    .event-workspace-nav {
    position: static !important;
    inset: auto !important;
    z-index: auto !important;
  }

  html.ledger-workspace-v1 body #app
    .screen[data-screen-kind="event"]
    .event-workspace-nav[data-route-occluded] {
    clip-path: inset(var(--event-nav-route-occlusion, 0px) 0 0 0) !important;
  }

  html.ledger-workspace-v1 body #app
    .screen[data-screen-kind="event"]
    .event-workspace-nav[data-route-fully-occluded] {
    visibility: hidden !important;
    pointer-events: none !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-row:has(.transfer-explanation) {
    position: relative !important;
    -webkit-tap-highlight-color: transparent !important;
    user-select: none !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-expand-indicator {
    position: static !important;
    width: 20px !important;
    height: 20px !important;
    display: inline-grid !important;
    place-items: center !important;
    margin-inline-start: 4px !important;
    color: var(--ledger-muted) !important;
    font-family: var(--font-hebrew) !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    line-height: 1 !important;
    transform-origin: center !important;
    transition: transform 160ms ease, color 160ms ease !important;
    pointer-events: none !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-status-cluster {
    min-width: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 3px !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-debt-summary {
    margin: 0 0 4px !important;
    padding: 0 0 9px !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-row.is-explanation-open .transfer-expand-indicator {
    color: var(--ledger-brand) !important;
    transform: rotate(180deg) !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-explanation[open] {
    margin-top: 6px !important;
    padding: 8px 0 0 !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-explanation[open] .transfer-explanation-body {
    gap: 4px !important;
    animation: settlement-detail-enter 160ms ease-out both !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-explanation[open] .transfer-equation-item {
    min-height: 36px !important;
    padding: 7px 0 !important;
  }

  @keyframes settlement-detail-enter {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    html.ledger-workspace-v1 *,
    html.ledger-workspace-v1 *::before,
    html.ledger-workspace-v1 *::after {
      animation-duration: 1ms !important;
      transition-duration: 1ms !important;
      scroll-behavior: auto !important;
    }

    html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-explanation[open] .transfer-explanation-body {
      animation-duration: 1ms !important;
    }

    html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-expand-indicator {
      transition-duration: 1ms !important;
    }
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-featured-action {
    display: grid !important;
    justify-items: stretch !important;
    gap: 8px !important;
    text-align: right !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-featured-route {
    margin: 0 !important;
    color: var(--ledger-muted-strong) !important;
    font-size: 15px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-featured-amount {
    margin: 2px 0 10px !important;
    font-size: clamp(31px, 8vw, 42px) !important;
    line-height: 1 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-stage {
    margin: 0 14px 18px !important;
    padding: 20px 18px !important;
    border: 1px solid rgba(18, 92, 67, 0.18) !important;
    border-radius: 22px !important;
    background: #fbfefd !important;
    box-shadow: 0 8px 24px rgba(30, 54, 49, 0.05) !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-stage-heading {
    margin-bottom: 14px !important;
    padding-bottom: 14px !important;
    border-bottom: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-stage-heading h2 {
    font-size: 22px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-transfer-board {
    display: grid !important;
    gap: 0 !important;
    overflow: hidden !important;
    border-inline: 0 !important;
    border-block: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: var(--ledger-canvas) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-row {
    min-height: 88px !important;
    padding: 14px 4px 14px 8px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: var(--ledger-canvas) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-row:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-row:is(
    .is-personal-receiver,
    .is-personal-payer,
    .is-paid
  ) {
    border-inline: 0 !important;
    border-top: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: var(--ledger-canvas) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-row:last-child:is(
    .is-personal-receiver,
    .is-personal-payer,
    .is-paid
  ) {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-transfer-board > article.transfer-row,
  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-transfer-board > article.transfer-row:is(
    .is-personal,
    .is-personal-receiver,
    .is-personal-payer,
    .is-pending,
    .is-paid
  ) {
    border-inline: 0 !important;
    border-top: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: var(--ledger-canvas) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .settlement-transfer-board > article.transfer-row:last-child {
    border-bottom: 0 !important;
  }

  /* Keep settlement transfers visually aligned with the flat event list.
     Some native summary states do not retain data-event-view on their screen
     wrapper, so the component itself must carry the final styling contract. */
  html.ledger-workspace-v1 body #app .settlement-stage .settlement-transfer-board {
    display: grid !important;
    gap: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-block: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: var(--ledger-canvas) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .settlement-transfer-board > .transfer-row,
  html.ledger-workspace-v1 body #app .settlement-stage .settlement-transfer-board > .transfer-row:is(
    .is-personal,
    .is-personal-receiver,
    .is-personal-payer,
    .is-pending,
    .is-paid
  ) {
    min-height: 88px !important;
    margin: 0 !important;
    padding: 14px 4px 14px 8px !important;
    border: 0 !important;
    border-bottom: 1px solid rgba(20, 67, 57, 0.2) !important;
    border-radius: 0 !important;
    background: var(--ledger-canvas) !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .settlement-transfer-board > .transfer-row:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-explanation[open] .transfer-explanation-body {
    display: grid !important;
    gap: 8px !important;
    padding: 2px 0 4px !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-explanation[open] .transfer-equation {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-explanation[open] .transfer-equation-sign {
    display: none !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-explanation[open] .transfer-equation-item {
    min-height: 42px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding: 8px 2px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-explanation[open] .transfer-equation-item.is-result {
    color: var(--ledger-brand) !important;
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-explanation[open] .transfer-route-note,
  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-explanation[open] .transfer-minimization-note,
  html.ledger-workspace-v1 .screen[data-event-view="summary"] .transfer-explanation[open] .transfer-rounding-note {
    margin: 0 !important;
    padding: 10px 0 0 !important;
    border: 0 !important;
    background: transparent !important;
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    line-height: 1.55 !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .transfer-explanation[open] {
    margin: 8px 0 0 !important;
    padding: 12px 0 2px !important;
    border: 0 !important;
    border-top: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .transfer-explanation[open] .transfer-explanation-body {
    display: grid !important;
    gap: 8px !important;
    padding: 0 !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .transfer-expense-breakdown {
    margin: 4px 0 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .transfer-expense-breakdown > h4 {
    margin: 0 !important;
    padding: 8px 0 !important;
    color: var(--ledger-muted-strong) !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .transfer-expense-share-list {
    border: 0 !important;
    border-block: 1px solid var(--ledger-line) !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .transfer-expense-share-row {
    min-height: 48px !important;
    padding: 8px 0 !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .transfer-expense-share-row:last-child {
    border-bottom: 0 !important;
  }

  /* Expense history uses the same continuous-list surface as events and participants. */
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-ledger {
    display: block !important;
    overflow: visible !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 18px !important;
    background: #ffffff !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-expenses-section {
    padding-block-end: calc(84px + env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-day-group {
    margin: 0 !important;
    overflow: visible !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-day-group + .expense-day-group {
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-day-heading {
    margin: 0 !important;
    padding: 12px 16px !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row,
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row:hover {
    margin: 0 !important;
    padding: 16px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: #ffffff !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row:hover {
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-day-group .expense-row:last-child {
    border-bottom: 0 !important;
  }

  /* Summary transfers share the exact same continuous-list treatment. */
  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .settlement-stage {
    margin: 0 0 18px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .settlement-stage-heading {
    min-height: 44px !important;
    margin: 0 0 12px !important;
    padding: 0 !important;
    border: 0 !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .settlement-transfer-board {
    display: block !important;
    overflow: hidden !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 18px !important;
    background: #ffffff !important;
    box-shadow: var(--ledger-shadow-border) !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .settlement-transfer-board > .transfer-row,
  html.ledger-workspace-v1 body #app .settlement-stage .settlement-transfer-board > .transfer-row:is(
    .is-personal,
    .is-personal-receiver,
    .is-personal-payer,
    .is-pending,
    .is-paid
  ) {
    margin: 0 !important;
    padding: 16px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    background: #ffffff !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .settlement-transfer-board > .transfer-row:hover {
    background: var(--ledger-surface-soft) !important;
    transform: none !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .settlement-transfer-board > .transfer-row:last-child {
    border-bottom: 0 !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-actions {
    padding-top: 4px !important;
    border-top: 0 !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-explanation:not([open]) {
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-people {
    grid-template-columns: minmax(0, 1fr) 22px minmax(0, 1fr) !important;
    gap: 6px !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-arrow {
    min-width: 22px !important;
    padding-inline: 2px !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-participant-avatar-action {
    flex: 0 0 auto !important;
    width: 44px !important;
    min-width: 44px !important;
    height: 44px !important;
    min-height: 44px !important;
    display: grid !important;
    place-items: center !important;
    margin: -7px !important;
    padding: 7px !important;
    border: 0 !important;
    color: inherit !important;
    background: transparent !important;
    box-shadow: none !important;
    cursor: pointer !important;
    -webkit-tap-highlight-color: transparent !important;
  }

  html.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-participant-avatar-action:focus-visible {
    outline: 3px solid rgba(33, 170, 166, 0.2) !important;
    outline-offset: 3px !important;
    border-radius: 50% !important;
  }

  html.ledger-workspace-v1 body #app .settlement-stage .settlement-transfer-board > .settlement-offline-note {
    margin: 0 !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  /* Expense actions stay inside the ledger row instead of clipping at its edge. */
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-actions-menu > div {
    inset-block-start: calc(100% + 6px) !important;
    inset-block-end: auto !important;
    inset-inline-end: 0 !important;
    width: 166px !important;
    height: auto !important;
    max-height: none !important;
    gap: 4px !important;
    padding: 8px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 14px !important;
    color: var(--ledger-ink) !important;
    background: #ffffff !important;
    box-shadow: 0 18px 38px -20px rgba(4, 35, 29, 0.42) !important;
    overflow: visible !important;
  }

  html.ledger-workspace-v1
    .screen[data-screen-kind="event"]
    .expense-day-group:last-child
    .expense-row:last-child
    .expense-row-actions-menu > div {
    inset-block-start: auto !important;
    inset-block-end: calc(100% + 6px) !important;
  }

  html.ledger-workspace-v1
    .screen[data-screen-kind="event"]
    .expense-row-actions-menu.opens-upward > div {
    inset-block-start: auto !important;
    inset-block-end: calc(100% + 6px) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-actions-menu button {
    min-height: 44px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    padding: 0 12px !important;
    border: 0 !important;
    border-radius: 10px !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    font: inherit !important;
    font-weight: 700 !important;
    font-size: 13.5px !important;
    text-align: start !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row-actions-menu button:hover {
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1
    .screen[data-screen-kind="event"]
    .expense-row-actions-menu [data-action="delete-expense"] {
    color: #a33a32 !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row:has(.expense-row-actions-menu[open]),
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-day-group:has(.expense-row-actions-menu[open]),
  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-ledger:has(.expense-row-actions-menu[open]) {
    overflow: visible !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .expense-row:has(.expense-row-actions-menu[open]) {
    position: relative !important;
    z-index: 60 !important;
  }

  html.ledger-workspace-v1 .expense-optional-details {
    display: grid !important;
    gap: 12px !important;
    margin-top: 14px !important;
    padding-top: 14px !important;
    border-top: 1px solid var(--ledger-line) !important;
  }

  html.ledger-workspace-v1 .expense-optional-details textarea {
    width: 100% !important;
    resize: vertical !important;
  }

  html.ledger-workspace-v1 .expense-attachment-control {
    display: grid !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .expense-attachment-upload {
    min-height: 48px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .expense-attachment-preview,
  html.ledger-workspace-v1 .expense-saved-image {
    width: 100% !important;
    max-height: 240px !important;
    object-fit: cover !important;
    border-radius: 14px !important;
    outline: 1px solid rgba(0, 0, 0, 0.1) !important;
  }

  html.ledger-workspace-v1 .expense-saved-notes {
    margin: 10px 0 !important;
    padding: 12px !important;
    border-radius: 12px !important;
    color: var(--ledger-muted-strong) !important;
    background: var(--ledger-surface-soft) !important;
    white-space: pre-wrap !important;
  }

  html.ledger-workspace-v1 .expense-participant-avatar-action {
    width: 44px !important;
    min-width: 44px !important;
    height: 44px !important;
    min-height: 44px !important;
    display: grid !important;
    place-items: center !important;
    margin: -6px !important;
    padding: 6px !important;
    border: 0 !important;
    border-radius: 50% !important;
    color: inherit !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-participant-route-backdrop {
    padding-block-end: calc(var(--event-route-nav-safe-height, 96px) + env(safe-area-inset-bottom)) !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).ledger-workspace-v1 {
    --event-route-nav-safe-height: 152px;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).ledger-workspace-v1
    .event-participant-primary-actions {
    scroll-margin-block-end: calc(164px + env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1 .event-route-primary-nav {
    display: grid !important;
    z-index: 220 !important;
  }

  html.ledger-workspace-v1 body:has(.event-route-primary-nav)
    .screen > .product-app-identity > .product-app-nav {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-status-menu {
    width: min(100% - 20px, 520px) !important;
    padding: 18px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 20px !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .event-status-options {
    display: grid !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .event-status-option,
  html.ledger-workspace-v1 .event-share-option,
  html.ledger-workspace-v1 .event-removal-option {
    min-height: 58px !important;
    padding: 12px 14px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 14px !important;
    background: #ffffff !important;
    box-shadow: none !important;
    font-family: var(--font-hebrew) !important;
  }

  html.ledger-workspace-v1 .event-status-option.is-selected {
    border-color: rgba(8, 116, 93, 0.34) !important;
    background: var(--ledger-surface-soft) !important;
    box-shadow: inset -3px 0 0 var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .event-home-menu-actions {
    display: grid !important;
    gap: 10px !important;
    margin-top: 18px !important;
  }

  html.ledger-workspace-v1 .event-share-option {
    width: 100% !important;
    min-height: 64px !important;
    display: grid !important;
    grid-template-columns: 44px minmax(0, 1fr) 24px !important;
    align-items: center !important;
    gap: 12px !important;
    color: var(--ledger-ink) !important;
    text-align: start !important;
    cursor: pointer !important;
  }

  html.ledger-workspace-v1 .event-share-option > span:not(.command-card-icon):not(.event-share-route-chevron) {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .event-share-option strong,
  html.ledger-workspace-v1 .event-share-option small {
    display: block !important;
  }

  html.ledger-workspace-v1 .event-share-option small {
    color: var(--ledger-muted) !important;
    font-size: 12px !important;
    line-height: 1.4 !important;
  }

  html.ledger-workspace-v1 .event-share-option:hover:not(:disabled) {
    border-color: rgba(8, 116, 93, 0.34) !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .event-share-option:active:not(:disabled) {
    transform: scale(0.98) !important;
  }

  html.ledger-workspace-v1 .event-share-option:focus-visible {
    outline: 3px solid rgba(8, 116, 93, 0.22) !important;
    outline-offset: 2px !important;
  }

  html.ledger-workspace-v1 .event-share-option:disabled {
    opacity: 0.5 !important;
    cursor: not-allowed !important;
  }

  html.ledger-workspace-v1 body:has(.event-participant-route-backdrop) .product-app-nav {
    display: grid !important;
    z-index: 130 !important;
  }

  /* Final interaction consistency pass: shared brand states and app-like routes. */
  html.ledger-workspace-v1 .referral-reward-days-text,
  html.ledger-workspace-v1 .referral-reward-days-text.is-inactive {
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen .event-participant-candidate-row,
  html.ledger-workspace-v1 .event-participant-add-screen .event-participant-identity-group > header {
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen .event-participant-add-button {
    border-color: var(--ledger-brand) !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow: 0 8px 18px -14px rgba(6, 54, 40, 0.72) !important;
    transition-property: background-color, border-color, box-shadow, scale !important;
    transition-duration: 160ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen .event-participant-add-button:active:not(:disabled) {
    scale: 0.96 !important;
  }

  html.ledger-workspace-v1 .event-participant-add-screen .event-participant-candidate-row.is-selected {
    border-color: rgba(8, 116, 93, 0.34) !important;
    background: var(--ledger-surface-soft) !important;
    box-shadow: inset -3px 0 0 var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .event-participant-selection-button {
    min-width: 78px !important;
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 0 12px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: 12px !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow: none !important;
    font-family: var(--font-hebrew) !important;
    font-size: 13px !important;
    font-weight: 760 !important;
  }

  html.ledger-workspace-v1 .event-participant-selection-button.is-selected {
    border-color: var(--ledger-brand) !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .event-participant-selection-button:active:not(:disabled) {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .event-participant-selection-check {
    width: 16px !important;
    height: 16px !important;
    display: inline-grid !important;
    place-items: center !important;
    opacity: 0 !important;
  }

  html.ledger-workspace-v1 .event-participant-selection-button.is-selected
    .event-participant-selection-check {
    opacity: 1 !important;
  }

  html.ledger-workspace-v1 .event-participant-selection-check svg {
    width: 15px !important;
    height: 15px !important;
    stroke: currentColor !important;
  }

  html.ledger-workspace-v1 .event-participant-add-confirmation {
    display: grid !important;
    gap: 12px !important;
    margin-top: 4px !important;
    padding: 14px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: 16px !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .event-participant-add-confirmation p {
    min-height: 22px !important;
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: baseline !important;
    gap: 4px 8px !important;
    margin: 0 !important;
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .event-participant-add-confirmation p strong {
    color: var(--ledger-ink) !important;
    font-size: 14px !important;
  }

  html.ledger-workspace-v1 .event-participant-add-confirmation > .primary-button {
    width: 100% !important;
    min-height: 48px !important;
  }

  html.ledger-workspace-v1 .event-empty-expense-summary .event-empty-expense-copy {
    gap: 7px !important;
  }

  html.ledger-workspace-v1 .event-empty-expense-summary .event-empty-expense-copy h2 {
    color: var(--ledger-ink) !important;
  }

  html.ledger-workspace-v1 .screen[data-screen-kind="event"] .event-workspace-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  html.ledger-workspace-v1 .screen:is([data-screen-kind="event"], [data-screen-kind="event-notes"]) :is(.event-workspace-expenses, .event-workspace-summary, .event-workspace-notes) {
    min-width: 0 !important;
    min-height: 56px !important;
    padding-inline: 14px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: 14px !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow: 0 1px 2px rgba(2, 31, 27, 0.06) !important;
  }

  html.ledger-workspace-v1 .screen:is([data-screen-kind="event"], [data-screen-kind="event-notes"]) :is(.event-workspace-expenses, .event-workspace-summary, .event-workspace-notes):is(.is-active, [aria-current="page"]) {
    border-color: var(--ledger-brand) !important;
    color: #ffffff !important;
    background: var(--ledger-brand) !important;
    box-shadow: 0 10px 22px -16px rgba(6, 54, 40, 0.74) !important;
  }

  html.ledger-workspace-v1 .expense-route-backdrop {
    padding-block-end: calc(var(--event-route-nav-safe-height, 96px) + env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1 .expense-route-backdrop .expense-step-modal {
    max-height: calc(100dvh - var(--event-route-nav-safe-height, 96px) - env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1 .expense-route-backdrop .event-route-primary-nav {
    display: grid !important;
    z-index: 230 !important;
  }

  html.ledger-workspace-v1 body:has(.expense-route-backdrop) .screen > .product-app-identity > .product-app-nav {
    display: none !important;
  }

  html.ledger-workspace-v1 .expense-modal-step-header .expense-accessibility-button {
    grid-column: 1 !important;
    grid-row: 1 !important;
  }

  html.ledger-workspace-v1 .expense-modal-step-header .modal-section-back-button {
    grid-column: 3 !important;
    grid-row: 1 !important;
  }

  html.circle-design-v1.ledger-workspace-v1
    .restaurant-quick-modal
    .expense-modal-step-header
    > .expense-modal-header-actions,
  html.circle-design-v1.ledger-workspace-v1
    .restaurant-quick-modal
    .expense-modal-step-header
    > .expense-modal-header-actions
    :is(.modal-section-back-button, .modal-close-button) {
    position: static !important;
    inset: auto !important;
  }

  html.circle-design-v1.ledger-workspace-v1
    .restaurant-quick-modal
    .expense-modal-step-header
    > .expense-modal-header-actions {
    pointer-events: auto !important;
  }

  html.ledger-workspace-v1 .event-participant-route-backdrop .event-modal {
    max-height: calc(100dvh - 112px - env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1 .product-home-screen .home-friends-action strong {
    font-family: inherit !important;
    font-size: 15.5px !important;
    font-weight: 800 !important;
    line-height: 1.25 !important;
  }

  /* Share is a focused route: one status, one primary action, no nested cards. */
  html.ledger-workspace-v1 .event-share-route-backdrop .event-modal-body {
    padding-inline: 16px !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-share-open {
    display: grid !important;
    gap: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-share-open-heading {
    gap: 5px !important;
    margin: 0 !important;
    padding: 2px 2px 16px !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-share-open-heading small {
    color: var(--ledger-brand) !important;
    font-size: 12px !important;
    font-weight: 700 !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-share-open-heading strong {
    font-size: 18px !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-share-open-heading p {
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
    line-height: 1.55 !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-share-link-status {
    min-height: 58px !important;
    display: grid !important;
    grid-template-columns: 34px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 12px 2px !important;
    border-block: 1px solid var(--ledger-line) !important;
    border-inline: 0 !important;
    border-radius: 0 !important;
    color: var(--ledger-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-share-link-status > span:first-child {
    width: 34px !important;
    height: 34px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 10px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-share-link-status > span:first-child svg {
    width: 18px !important;
    height: 18px !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-share-link-status > span:last-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-share-link-status strong {
    font-size: 14px !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-share-link-status small {
    color: var(--ledger-muted) !important;
    font-size: 11.5px !important;
    line-height: 1.45 !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-share-link-status.is-error > span:first-child {
    color: var(--ledger-negative) !important;
    background: #fff1ee !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-invite-pass {
    border-radius: 16px !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-invite-recovery {
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 10px !important;
    margin: 0 !important;
    padding: 14px !important;
    border-radius: 16px !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-invite-recovery > button {
    width: 100% !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .invite-link-row {
    gap: 0 !important;
    padding: 16px 0 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-invite-link-field {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-invite-link-label {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-invite-link-preview {
    min-height: 52px !important;
    padding: 10px 12px !important;
    border-radius: 12px !important;
    background: var(--ledger-surface-soft) !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-invite-retry-button {
    width: 100% !important;
    min-height: 48px !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .event-invite-link-actions {
    grid-template-columns: minmax(0, 1fr) minmax(104px, 0.46fr) !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop
    :is(.event-invite-link-actions button, .event-invite-recovery button, .event-invite-rotate-button):active {
    transform: scale(0.96) !important;
  }

  html.ledger-workspace-v1 .event-share-route-backdrop .public-invite-qr {
    margin-top: 16px !important;
    border-block-start: 1px solid var(--ledger-line) !important;
    border-inline: 0 !important;
    border-block-end: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  /* Final share-route normalization: the route itself is the surface. */
  html.ledger-workspace-v1 body #app
    .event-share-route-backdrop
    .event-share-open {
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 body #app
    .event-share-route-backdrop
    .event-share-open-heading {
    display: none !important;
  }

  html.ledger-workspace-v1 body #app
    .event-share-route-backdrop
    .event-share-link-status {
    padding-inline: 2px !important;
    border-block-start: 0 !important;
  }

  html.ledger-workspace-v1 body #app
    .event-share-route-backdrop
    .invite-link-row {
    padding-inline: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 body #app
    .event-share-route-backdrop
    .public-invite-qr-body {
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 12px !important;
    padding: 18px 0 4px !important;
    border-block-start: 1px solid var(--ledger-line) !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 body #app
    .event-share-route-backdrop
    .public-invite-qr-code {
    width: min(100%, 196px) !important;
    height: auto !important;
    aspect-ratio: 1 !important;
    justify-self: center !important;
    padding: 4px !important;
    border: 0 !important;
    background: transparent !important;
  }

  html.ledger-workspace-v1 body #app
    .event-share-route-backdrop
    .public-invite-qr-copy {
    justify-items: center !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .profile-identity-grid {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .profile-identity-summary {
    display: flex !important;
    min-width: 0 !important;
    align-items: flex-start !important;
    justify-content: space-between !important;
    gap: 10px !important;
    min-height: 112px !important;
    padding: 14px !important;
    border-radius: 16px !important;
    background: var(--ledger-soft) !important;
    box-shadow: inset 0 0 0 1px rgba(18, 92, 67, 0.1) !important;
  }

  html.ledger-workspace-v1 .profile-identity-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.ledger-workspace-v1 .profile-identity-copy > span,
  html.ledger-workspace-v1 .profile-identity-copy > bdi {
    color: var(--ledger-muted) !important;
    font-size: 13px !important;
  }

  html.ledger-workspace-v1 .profile-identity-copy > strong {
    overflow-wrap: anywhere !important;
    color: var(--ledger-ink) !important;
    font-size: 17px !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1
    .profile-identity-summary[data-profile-identity="username"]
    .profile-identity-copy
    > strong {
    min-width: 0 !important;
    max-width: 100% !important;
    display: block !important;
    overflow: hidden !important;
    direction: ltr !important;
    white-space: nowrap !important;
    text-overflow: ellipsis !important;
    overflow-wrap: normal !important;
  }

  html.ledger-workspace-v1
    .profile-identity-summary[data-profile-identity="username"]
    .profile-identity-copy
    > strong
    > bdi {
    min-width: 0 !important;
    max-width: 100% !important;
    display: block !important;
    overflow: hidden !important;
    white-space: nowrap !important;
    text-overflow: ellipsis !important;
  }

  html.ledger-workspace-v1 .profile-identity-edit {
    flex: 0 0 auto !important;
    min-width: 44px !important;
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 7px !important;
  }

  html.ledger-workspace-v1 .profile-identity-edit svg {
    width: 17px !important;
    height: 17px !important;
  }

  html.ledger-workspace-v1 .profile-identity-actions {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .profile-field-actions {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 8px !important;
  }

  html.ledger-workspace-v1 .profile-identity-summary:has(.field) {
    flex-direction: column !important;
  }

  html.ledger-workspace-v1 .profile-identity-summary .profile-username-section,
  html.ledger-workspace-v1 .profile-identity-summary .profile-username-field {
    width: 100% !important;
  }

  @media (max-width: 360px) {
    html.ledger-workspace-v1 .profile-identity-grid {
      gap: 8px !important;
    }

    html.ledger-workspace-v1 .profile-identity-edit {
      padding-inline: 10px !important;
    }

    html.ledger-workspace-v1 .profile-identity-edit > span:last-child {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      clip: rect(0 0 0 0) !important;
    }
  }

  /* Approved QA decision: long home-event names remain readable without growing unbounded. */
  html.ledger-workspace-v1 .event-row-title {
    align-items: flex-start !important;
  }

  html.ledger-workspace-v1 .event-row-title strong {
    flex: 1 1 auto !important;
    display: -webkit-box !important;
    overflow: hidden !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    text-overflow: clip !important;
    -webkit-box-orient: vertical !important;
    -webkit-line-clamp: 2 !important;
  }

  /* Participant statistics belong to the picture itself, never the surrounding row. */
  html.ledger-workspace-v1 .avatar.is-participant-statistics-action,
  html.ledger-workspace-v1 .avatar.is-current-profile-action {
    position: relative !important;
    z-index: 1 !important;
    cursor: pointer !important;
    touch-action: manipulation !important;
    scale: 1 !important;
    transition-property: scale, box-shadow !important;
    transition-duration: 160ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.ledger-workspace-v1 .avatar.is-participant-statistics-action::before,
  html.ledger-workspace-v1 .avatar.is-current-profile-action::before {
    content: "" !important;
    position: absolute !important;
    inset-block-start: 50% !important;
    inset-inline-start: 50% !important;
    width: max(100%, 44px) !important;
    height: max(100%, 44px) !important;
    border-radius: 50% !important;
    transform: translate(50%, -50%) !important;
  }

  html[dir="ltr"].ledger-workspace-v1
    .avatar.is-participant-statistics-action::before,
  html[dir="ltr"].ledger-workspace-v1
    .avatar.is-current-profile-action::before {
    transform: translate(-50%, -50%) !important;
  }

  html.ledger-workspace-v1
    .avatar-stack
    .avatar.is-participant-statistics-action::before {
    width: 100% !important;
    height: 100% !important;
  }

  /* Home event pictures belong to the event-card action. Keep the stack compact;
     the surrounding event button provides the full accessible touch target. */
  html.ledger-workspace-v1 .event-row-open {
    grid-template-columns: 104px minmax(0, 1fr) !important;
  }

  html.ledger-workspace-v1 .event-row .avatar-stack {
    width: 104px !important;
    min-width: 104px !important;
  }

  html.ledger-workspace-v1 .event-row .avatar-stack .avatar {
    width: 44px !important;
    min-width: 44px !important;
    height: 44px !important;
    min-height: 44px !important;
    margin-inline-start: -14px !important;
  }

  html.ledger-workspace-v1 .event-row .avatar-stack .avatar:first-child {
    margin-inline-start: 0 !important;
  }

  /* Home event cards expose one quiet chevron action. Status remains available
     inside the event, while the compact menu is reserved for share/remove. */
  html.ledger-workspace-v1 .event-row,
  html.ledger-workspace-v1 .event-row:hover {
    grid-template-columns: minmax(0, 1fr) 52px !important;
  }

  html.ledger-workspace-v1 .event-status-toggle {
    width: 52px !important;
    min-width: 52px !important;
    min-height: 44px !important;
    padding: 0 !important;
    gap: 0 !important;
  }

  html.ledger-workspace-v1 .event-row-options-chevron {
    width: 20px !important;
    height: 20px !important;
    display: grid !important;
    place-items: center !important;
    color: var(--ledger-muted) !important;
  }

  html.ledger-workspace-v1 .event-row-options-chevron svg {
    width: 18px !important;
    height: 18px !important;
  }

  @media (max-width: 380px) {
    html.ledger-workspace-v1 .event-row,
    html.ledger-workspace-v1 .event-row:hover {
      grid-template-columns: minmax(0, 1fr) 48px !important;
    }

    html.ledger-workspace-v1 .event-status-toggle {
      width: 48px !important;
      min-width: 48px !important;
    }
  }

  html.ledger-workspace-v1 .transfer-participant-avatar-action > .avatar {
    pointer-events: none !important;
  }

  html.ledger-workspace-v1 .avatar.is-participant-statistics-action:active,
  html.ledger-workspace-v1 .avatar.is-current-profile-action:active {
    scale: 0.96 !important;
  }

  html.ledger-workspace-v1
    .avatar.is-participant-statistics-action:focus-visible,
  html.ledger-workspace-v1
    .avatar.is-current-profile-action:focus-visible {
    outline: 3px solid rgba(34, 174, 178, 0.34) !important;
    outline-offset: 3px !important;
  }

  /* Participant status tags share one visual language across role and relationship states. */
  html.ledger-workspace-v1 .event-participant-status-tag {
    width: max-content !important;
    max-width: 100% !important;
    min-height: 22px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 3px 7px !important;
    border: 0 !important;
    border-radius: 999px !important;
    color: #075d55 !important;
    background: rgba(14, 110, 101, 0.11) !important;
    font-size: 10.5px !important;
    font-weight: 720 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
  }

  /* Long-press text tools are reserved for fields that can actually be edited. */
  html.ledger-workspace-v1 body,
  html.ledger-workspace-v1 body * {
    -webkit-user-select: none !important;
    user-select: none !important;
    -webkit-touch-callout: none !important;
  }

  html.ledger-workspace-v1
    body
    :is(
      input:not([readonly]):not([disabled]):not([type="button"]):not([type="checkbox"]):not([type="color"]):not([type="file"]):not([type="hidden"]):not([type="image"]):not([type="radio"]):not([type="range"]):not([type="reset"]):not([type="submit"]),
      textarea:not([readonly]):not([disabled]),
      [contenteditable=""],
      [contenteditable="true"],
      [contenteditable="plaintext-only"],
      [role="textbox"]:not([aria-readonly="true"])
    ) {
    -webkit-user-select: text !important;
    user-select: text !important;
    -webkit-touch-callout: default !important;
  }

  /* Approved QA decision: the signed-out gift state uses the full mobile canvas intentionally. */
  @media (max-width: 760px) {
    html.ledger-workspace-v1
      #public-referral-rewards-dialog
      .referral-dialog-shell.is-signin-state
      .referral-dialog-content {
      align-content: center !important;
      justify-items: center !important;
      overflow-y: hidden !important;
      padding-block: clamp(28px, 9dvh, 76px)
        calc(28px + env(safe-area-inset-bottom)) !important;
    }

    html.ledger-workspace-v1
      #public-referral-rewards-dialog
      .referral-dialog-shell.is-signin-state
      .referral-state-message {
      width: min(100%, 420px) !important;
    }
  }

  @media (min-width: 721px) and (max-width: 1366px) and (hover: none) and (pointer: coarse) {
    html.ledger-workspace-v1 body #app .screen,
    html.ledger-workspace-v1 body #app .friends-hub-screen {
      width: min(calc(100% - 32px), 430px) !important;
      max-width: 430px !important;
      margin-inline: auto !important;
      padding-inline: 16px !important;
    }

    html.ledger-workspace-v1 body #app
      .screen:is([data-screen-kind="home"], [data-product-screen="home"], .product-home-screen) {
      width: min(calc(100% - 32px), 430px) !important;
      max-width: 430px !important;
    }

    html.ledger-workspace-v1 .product-route-controls,
    html.ledger-workspace-v1 .product-route-controls[hidden] {
      left: max(20px, calc((100vw - 430px) / 2 + 16px)) !important;
    }

    html.ledger-workspace-v1 .product-app-nav,
    html.ledger-workspace-v1 .event-route-primary-nav {
      width: min(390px, calc(100% - 40px)) !important;
      left: 50% !important;
      right: auto !important;
      transform: translateX(-50%) !important;
    }

    html.circle-design-v1.ledger-workspace-v1
      .expense-modal-backdrop
      .restaurant-quick-modal {
      width: min(100%, 430px) !important;
      max-width: 430px !important;
      margin-inline: auto !important;
    }
  }

  /* Shared event notes — approved mobile direction. */
  html.ledger-workspace-v1
    .screen:is([data-screen-kind="event"], [data-screen-kind="event-notes"], [data-screen-kind="settlement"])
    .event-workspace-nav {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }

  html.ledger-workspace-v1 .event-notes-screen {
    padding-bottom: calc(108px + env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1:has(body #app .event-notes-screen) {
    scrollbar-width: none;
  }

  html.ledger-workspace-v1:has(body #app .event-notes-screen)::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  html.ledger-workspace-v1 .event-notes-hero {
    position: relative !important;
    min-height: 220px !important;
    display: block !important;
    margin: 14px 0 0 !important;
    padding: 30px 28px 70px !important;
    overflow: visible !important;
    border: 0 !important;
    border-radius: 28px !important;
    color: #ffffff !important;
    background:
      linear-gradient(128deg, #071b18 0%, #064b43 58%, #087b74 100%),
      #064b43 !important;
    box-shadow: 0 18px 40px rgba(5, 66, 51, 0.18) !important;
  }

  html.ledger-workspace-v1 body #app
    .screen[data-screen-kind="event-notes"]
    > .top.event-notes-hero {
    position: relative !important;
    min-height: 220px !important;
    display: block !important;
    margin: 14px 0 0 !important;
    padding: 30px 28px 70px !important;
    overflow: visible !important;
    border: 0 !important;
    border-radius: 28px !important;
    color: #ffffff !important;
    background:
      linear-gradient(128deg, #071b18 0%, #064b43 58%, #087b74 100%),
      #064b43 !important;
    box-shadow: 0 18px 40px rgba(5, 66, 51, 0.18) !important;
  }

  html.ledger-workspace-v1 .event-notes-hero .product-hero-artwork,
  html.ledger-workspace-v1 .event-notes-hero > .app-back-button {
    display: none !important;
  }

  html.ledger-workspace-v1 .event-notes-hero-copy {
    width: 100% !important;
    max-width: none !important;
    display: grid !important;
    justify-items: start !important;
    gap: 6px !important;
    padding: 0 !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .event-notes-hero-copy .eyebrow {
    margin: 0 !important;
    color: #8ee0c9 !important;
    font-size: 14px !important;
    font-weight: 780 !important;
    line-height: 1.35 !important;
  }

  html.ledger-workspace-v1 .event-notes-hero-copy h1 {
    margin: 0 !important;
    color: #ffffff !important;
    font-size: clamp(34px, 9vw, 45px) !important;
    font-weight: 850 !important;
    letter-spacing: -0.025em !important;
    line-height: 1.12 !important;
  }

  html.ledger-workspace-v1 body #app
    .screen[data-screen-kind="event-notes"]
    > .event-notes-hero
    .brand.event-notes-hero-copy h1 {
    max-height: none !important;
    margin: 0 !important;
    overflow: visible !important;
    color: #ffffff !important;
    font-size: clamp(34px, 9vw, 45px) !important;
    font-weight: 850 !important;
    letter-spacing: -0.025em !important;
    line-height: 1.12 !important;
    text-wrap: balance !important;
    -webkit-line-clamp: unset !important;
  }

  html.ledger-workspace-v1 .event-notes-hero-copy .muted {
    margin: 0 !important;
    color: rgba(225, 244, 238, 0.75) !important;
    font-size: 16px !important;
    font-weight: 650 !important;
  }

  html.ledger-workspace-v1 .event-notes-create {
    position: absolute !important;
    inset-inline-start: 50% !important;
    inset-block-end: -31px !important;
    width: min(230px, calc(100% - 64px)) !important;
    min-height: 64px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 12px !important;
    padding: 12px 22px !important;
    border: 1px solid rgba(8, 68, 53, 0.08) !important;
    border-radius: 22px !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    box-shadow: 0 16px 34px rgba(12, 44, 38, 0.18) !important;
    font-size: 18px !important;
    font-weight: 820 !important;
    transform: translateX(-50%) !important;
  }

  html.ledger-workspace-v1 body #app
    .screen[data-screen-kind="event-notes"]
    > .event-notes-hero
    > .event-notes-create {
    position: absolute !important;
    inset-inline-start: 50% !important;
    inset-block-end: -31px !important;
    width: min(230px, calc(100% - 64px)) !important;
    min-height: 64px !important;
    display: inline-flex !important;
    padding: 12px 22px !important;
    overflow: visible !important;
    border-radius: 22px !important;
    color: var(--ledger-brand) !important;
    background: #ffffff !important;
    transform: translateX(-50%) !important;
  }

  html[dir="rtl"].ledger-workspace-v1 body #app
    .screen[data-screen-kind="event-notes"]
    > .event-notes-hero
    > .event-notes-create {
    transform: translateX(50%) !important;
  }

  html[dir="rtl"].ledger-workspace-v1 .event-notes-create {
    transform: translateX(50%) !important;
  }

  html.ledger-workspace-v1 .event-notes-create svg {
    width: 25px !important;
    height: 25px !important;
  }

  html.ledger-workspace-v1 .event-notes-screen .event-workspace-nav {
    margin-top: 52px !important;
  }

  html.ledger-workspace-v1 .event-notes-content {
    width: 100% !important;
    display: grid !important;
    gap: 0 !important;
    margin-top: 50px !important;
    border-top: 1px solid var(--ledger-line) !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .event-notes-section {
    display: grid !important;
    gap: 0 !important;
  }

  html.ledger-workspace-v1 .event-notes-section-label {
    min-height: 48px !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    padding: 13px 18px 11px !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    color: var(--ledger-muted) !important;
    background: #fbfcfc !important;
    font-size: 14px !important;
  }

  html.ledger-workspace-v1 .event-notes-section-label svg {
    width: 18px !important;
    height: 18px !important;
  }

  html.ledger-workspace-v1 .event-notes-list {
    display: grid !important;
  }

  html.ledger-workspace-v1 .event-note-row {
    min-height: 112px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto 34px !important;
    align-items: center !important;
    gap: 8px !important;
    padding: 15px 18px !important;
    border-bottom: 1px solid var(--ledger-line) !important;
    background: #ffffff !important;
  }

  html.ledger-workspace-v1 .event-note-open {
    min-width: 0 !important;
    min-height: 76px !important;
    display: grid !important;
    align-items: center !important;
    justify-items: stretch !important;
    padding: 0 !important;
    border: 0 !important;
    color: inherit !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.ledger-workspace-v1 .event-note-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 5px !important;
  }

  html.ledger-workspace-v1 .event-note-title-line {
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    gap: 7px !important;
  }

  html.ledger-workspace-v1 .event-note-title-line > strong {
    min-width: 0 !important;
    overflow: hidden !important;
    color: var(--ledger-ink) !important;
    font-size: 19px !important;
    font-weight: 820 !important;
    line-height: 1.3 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-note-pin {
    width: 19px !important;
    height: 19px !important;
    flex: 0 0 auto !important;
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .event-note-pin svg {
    width: 100% !important;
    height: 100% !important;
  }

  html.ledger-workspace-v1 .event-note-preview,
  html.ledger-workspace-v1 .event-note-copy > small {
    min-width: 0 !important;
    overflow: hidden !important;
    color: var(--ledger-muted) !important;
    font-size: 14px !important;
    line-height: 1.45 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-note-copy > small {
    color: #778580 !important;
    font-size: 12px !important;
  }

  html.ledger-workspace-v1 .event-note-avatars .avatar-stack {
    width: auto !important;
    min-width: 44px !important;
  }

  html.ledger-workspace-v1 .event-note-avatars .avatar {
    width: 42px !important;
    min-width: 42px !important;
    height: 42px !important;
  }

  html.ledger-workspace-v1 .event-note-chevron {
    width: 34px !important;
    min-width: 34px !important;
    height: 44px !important;
    min-height: 44px !important;
    display: grid !important;
    place-items: center !important;
    padding: 0 !important;
    border: 0 !important;
    color: #71817d !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.ledger-workspace-v1 .event-note-chevron svg {
    width: 22px !important;
    height: 22px !important;
  }

  html.ledger-workspace-v1 .event-note-open:focus-visible,
  html.ledger-workspace-v1 .event-note-chevron:focus-visible {
    outline: 3px solid rgba(10, 99, 75, 0.2) !important;
    outline-offset: 3px !important;
    border-radius: 10px !important;
  }

  html.ledger-workspace-v1 .event-notes-empty {
    width: min(100%, 560px) !important;
    display: grid !important;
    justify-items: center !important;
    gap: 12px !important;
    margin: 28px auto !important;
    padding: 30px 24px !important;
    text-align: center !important;
  }

  html.ledger-workspace-v1 .event-notes-empty-icon {
    width: 52px !important;
    height: 52px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 16px !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .event-notes-empty-icon svg {
    width: 27px !important;
    height: 27px !important;
  }

  html.ledger-workspace-v1 .event-notes-empty h2,
  html.ledger-workspace-v1 .event-notes-empty p {
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .event-notes-empty p {
    max-width: 430px !important;
    color: var(--ledger-muted) !important;
    line-height: 1.65 !important;
  }

  html.ledger-workspace-v1 .event-note-modal .event-modal-body {
    padding-top: 4px !important;
  }

  html.ledger-workspace-v1 .event-note-editor {
    display: grid !important;
    gap: 16px !important;
  }

  html.ledger-workspace-v1 .event-note-body-field textarea {
    min-height: 190px !important;
    resize: vertical !important;
    line-height: 1.65 !important;
  }

  html.ledger-workspace-v1 .event-note-pin-toggle,
  html.ledger-workspace-v1 .event-note-readonly-pin {
    min-height: 48px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 9px !important;
    margin: 0 !important;
    padding: 10px 14px !important;
    border: 1px solid var(--ledger-line-strong) !important;
    border-radius: 12px !important;
    color: var(--ledger-muted) !important;
    background: #ffffff !important;
    box-shadow: none !important;
    font-weight: 720 !important;
  }

  html.ledger-workspace-v1 .event-note-pin-toggle.is-active {
    border-color: rgba(10, 99, 75, 0.28) !important;
    color: var(--ledger-brand) !important;
    background: var(--ledger-accent-soft) !important;
  }

  html.ledger-workspace-v1 .event-note-pin-toggle svg,
  html.ledger-workspace-v1 .event-note-readonly-pin svg {
    width: 20px !important;
    height: 20px !important;
  }

  html.ledger-workspace-v1 .event-note-editor-actions {
    display: grid !important;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr) !important;
    gap: 10px !important;
  }

  html.ledger-workspace-v1 .event-note-editor-actions > :only-child {
    grid-column: 1 / -1 !important;
  }

  html.ledger-workspace-v1 .event-note-delete {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 7px !important;
    color: #a23f35 !important;
  }

  html.ledger-workspace-v1 .event-note-delete svg {
    width: 19px !important;
    height: 19px !important;
  }

  @media (max-width: 480px) {
    html.ledger-workspace-v1 .event-notes-hero {
      min-height: 196px !important;
      padding: 24px 22px 62px !important;
      border-radius: 24px !important;
    }

    html.ledger-workspace-v1 body #app
      .screen[data-screen-kind="event-notes"]
      > .top.event-notes-hero {
      min-height: 166px !important;
      padding: 20px 22px 54px !important;
      border-radius: 24px !important;
    }

    html.ledger-workspace-v1 .event-note-row {
      grid-template-columns: minmax(0, 1fr) auto 30px !important;
      gap: 6px !important;
      padding-inline: 14px !important;
    }

    html.ledger-workspace-v1 .event-note-avatars .avatar {
      width: 38px !important;
      min-width: 38px !important;
      height: 38px !important;
    }

    html.ledger-workspace-v1 .event-note-editor-actions {
      grid-template-columns: 1fr !important;
    }
  }

  /* Notes share the event workspace shell: same header, tabs, cards and
     spacing as Expenses and Summary. Keep the content distinct, not the
     surrounding product language. */
  html.ledger-workspace-v1 .event-notes-screen {
    padding-bottom: calc(112px + env(safe-area-inset-bottom)) !important;
  }

  html.ledger-workspace-v1 .event-notes-screen .event-workspace-nav {
    margin-top: 0 !important;
  }

  html.ledger-workspace-v1 .event-notes-intro {
    min-height: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 16px !important;
    margin: 14px 0 0 !important;
    padding: 18px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    color: var(--ledger-ink) !important;
    background: var(--ledger-surface) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  html.ledger-workspace-v1 .event-notes-intro > div {
    min-width: 0 !important;
    display: grid !important;
    gap: 4px !important;
  }

  html.ledger-workspace-v1 .event-notes-intro .eyebrow {
    margin: 0 !important;
    color: var(--ledger-brand) !important;
  }

  html.ledger-workspace-v1 .event-notes-intro h2,
  html.ledger-workspace-v1 .event-notes-intro p {
    margin: 0 !important;
  }

  html.ledger-workspace-v1 .event-notes-intro h2 {
    color: var(--ledger-ink) !important;
    font-size: 18px !important;
    line-height: 1.3 !important;
  }

  html.ledger-workspace-v1 .event-notes-intro .primary-button {
    flex: 0 0 auto !important;
    min-height: 46px !important;
    white-space: nowrap !important;
  }

  html.ledger-workspace-v1 .event-notes-content {
    margin-top: 14px !important;
    border: 1px solid var(--ledger-line) !important;
    border-radius: var(--ledger-task-radius) !important;
    overflow: hidden !important;
    background: var(--ledger-surface) !important;
    box-shadow: var(--ledger-task-shadow) !important;
  }

  @media (max-width: 430px) {
    html.ledger-workspace-v1 .event-notes-intro {
      align-items: stretch !important;
      flex-direction: column !important;
    }

    html.ledger-workspace-v1 .event-notes-intro .primary-button {
      width: 100% !important;
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
let workspaceOcclusionFrame = 0;

function syncWorkspaceNavigationOcclusion() {
  workspaceOcclusionFrame = 0;
  const workspaceNavigation = appRoot?.querySelector(
    '.screen[data-screen-kind="event"] .event-workspace-nav'
  );
  if (!workspaceNavigation) return;

  const routeControls = appRoot.querySelector(".product-route-controls");
  const navigationRect = workspaceNavigation.getBoundingClientRect();
  const routeRect = routeControls?.getBoundingClientRect();
  const occlusion = routeRect
    ? Math.max(0, Math.min(navigationRect.height, routeRect.bottom - navigationRect.top))
    : 0;
  const roundedOcclusion = Math.ceil(occlusion);

  if (roundedOcclusion > 0) {
    workspaceNavigation.dataset.routeOccluded = "true";
    workspaceNavigation.style.setProperty(
      "--event-nav-route-occlusion",
      `${roundedOcclusion}px`
    );
  } else {
    workspaceNavigation.removeAttribute("data-route-occluded");
    workspaceNavigation.style.removeProperty("--event-nav-route-occlusion");
  }

  if (roundedOcclusion >= Math.floor(navigationRect.height)) {
    workspaceNavigation.dataset.routeFullyOccluded = "true";
  } else {
    workspaceNavigation.removeAttribute("data-route-fully-occluded");
  }
}

function scheduleWorkspaceNavigationOcclusion() {
  if (workspaceOcclusionFrame) return;
  workspaceOcclusionFrame = requestAnimationFrame(syncWorkspaceNavigationOcclusion);
}

if (appRoot) {
  new MutationObserver(() => {
    activateLedgerWorkspace();
    scheduleWorkspaceNavigationOcclusion();
  }).observe(appRoot, {
    childList: true,
    subtree: true
  });
  window.addEventListener("scroll", scheduleWorkspaceNavigationOcclusion, {
    passive: true
  });
  window.addEventListener("resize", scheduleWorkspaceNavigationOcclusion, {
    passive: true
  });
  scheduleWorkspaceNavigationOcclusion();
}
