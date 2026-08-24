const STYLE_ID = "public-studio-design-layer-style";
const RETIRED_VISUAL_STYLE_IDS = [
  "public-brand-layer-style",
  "public-empty-home-polish-layer-style",
  "public-fintech-design-layer-style",
  "public-premium-visual-layer-style",
  "public-product-v1-layer-style",
  "public-design-v2-layer-style"
];

const EVENT_TYPE_ICONS = {
  standard: `
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M7 8.5h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
      <path d="M9 8.5V6.8A1.8 1.8 0 0 1 10.8 5h2.4A1.8 1.8 0 0 1 15 6.8v1.7" />
      <path d="M5 13h14" />
      <path d="M10 13v1.6h4V13" />
    </svg>
  `,
  restaurant: `
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M7 4v7" />
      <path d="M4.5 4v4.2A2.8 2.8 0 0 0 7 11" />
      <path d="M9.5 4v4.2A2.8 2.8 0 0 1 7 11" />
      <path d="M7 11v9" />
      <path d="M16.5 4c-1.7 1.2-2.5 3.1-2.5 5.5 0 2.5.9 4.1 2.5 4.8V20" />
      <path d="M16.5 4v10.3" />
    </svg>
  `,
  trip: `
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M4 17.5 9.2 9l3.1 4.8 2-3.1 5.7 6.8" />
      <path d="M5 19h14" />
      <circle cx="17.5" cy="6.5" r="2.2" />
    </svg>
  `
};

const CSS = `
  html.product-studio-v3 {
    --studio-canvas: #f2f5f4;
    --studio-canvas-deep: #e8eeec;
    --studio-surface: #ffffff;
    --studio-surface-subtle: #f7f9f8;
    --studio-surface-active: #e3f2ef;
    --studio-ink: #10211e;
    --studio-muted: #596a65;
    --studio-faint: #788782;
    --studio-line: #d7e1de;
    --studio-line-strong: #bdccc7;
    --studio-primary: #08756b;
    --studio-primary-deep: #0b4942;
    --studio-primary-dark: #073b36;
    --studio-primary-soft: #dff0ed;
    --studio-coral: #df6747;
    --studio-coral-soft: #fff0eb;
    --studio-gold: #e7b957;
    --studio-blue: #52758b;
    --studio-danger: #b8423b;
    --studio-success: #28744a;
    --studio-radius-sm: 8px;
    --studio-radius: 12px;
    --studio-radius-lg: 16px;
    --studio-shadow-control: 0 3px 8px rgba(16, 33, 30, 0.12);
    --studio-shadow-panel: 0 8px 14px rgba(16, 33, 30, 0.08);
    --studio-shadow-float: 0 14px 28px rgba(16, 33, 30, 0.16);
    --studio-ease: 180ms cubic-bezier(0.22, 1, 0.36, 1);
    color: var(--studio-ink);
    background: var(--studio-canvas);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  html.product-studio-v3 body {
    min-height: 100vh;
    min-height: 100dvh;
    color: var(--studio-ink) !important;
    background: var(--studio-canvas) !important;
  }

  html.product-studio-v3 body,
  html.product-studio-v3 button,
  html.product-studio-v3 input,
  html.product-studio-v3 select,
  html.product-studio-v3 textarea {
    font-family: "Heebo", "Noto Sans Hebrew", system-ui, sans-serif !important;
    letter-spacing: 0 !important;
  }

  html.product-studio-v3 .app::before,
  html.product-studio-v3 .app::after {
    content: none !important;
    display: none !important;
  }

  html.product-studio-v3 .screen {
    width: min(100%, 1180px) !important;
    min-height: 100dvh;
    display: block !important;
    padding: 12px 24px 80px !important;
  }

  html.product-studio-v3 h1,
  html.product-studio-v3 h2,
  html.product-studio-v3 h3 {
    color: var(--studio-ink);
    font-weight: 800 !important;
    letter-spacing: 0 !important;
    text-wrap: balance;
  }

  html.product-studio-v3 p {
    text-wrap: pretty;
  }

  html.product-studio-v3 .muted {
    color: var(--studio-muted) !important;
  }

  html.product-studio-v3 .product-app-identity {
    position: sticky !important;
    top: 0 !important;
    z-index: 40 !important;
    width: 100% !important;
    min-height: 76px !important;
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 24px !important;
    margin: 0 0 22px !important;
    padding: 12px 4px !important;
    border: 0 !important;
    border-bottom: 1px solid rgba(16, 33, 30, 0.08) !important;
    border-radius: 0 !important;
    background: rgba(242, 245, 244, 0.94) !important;
    box-shadow: none !important;
    backdrop-filter: blur(16px);
  }

  html.product-studio-v3 .product-brand-lockup {
    grid-column: 1;
    min-width: 0;
    display: inline-flex !important;
    align-items: center !important;
    gap: 11px !important;
  }

  html.product-studio-v3 .product-brand-mark {
    width: 48px !important;
    min-width: 48px !important;
    height: 48px !important;
    display: grid !important;
    place-items: center !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 14px !important;
    background: var(--studio-primary-deep) url("./icon.svg") center / cover no-repeat !important;
    box-shadow: var(--studio-shadow-control) !important;
  }

  html.product-studio-v3.product-v1 .product-app-identity .product-brand-mark,
  html.product-studio-v3.product-v1-live .product-app-identity .product-brand-mark,
  html.product-studio-v3.product-v1 .public-profile-hero .product-brand-mark,
  html.product-studio-v3.product-v1-live .public-profile-hero .product-brand-mark {
    background: var(--studio-primary-deep) url("./icon.svg") center / cover no-repeat !important;
    box-shadow: var(--studio-shadow-control) !important;
  }

  html.product-studio-v3 .product-brand-mark::before,
  html.product-studio-v3 .product-brand-mark::after {
    content: none !important;
    display: none !important;
  }

  html.product-studio-v3 .product-brand-glyph {
    width: 1px !important;
    height: 1px !important;
    overflow: hidden !important;
    clip: rect(0 0 0 0) !important;
    color: transparent !important;
  }

  html.product-studio-v3 .product-brand-copy {
    min-width: 0;
    display: grid !important;
    gap: 2px !important;
  }

  html.product-studio-v3 .product-brand-copy strong {
    color: var(--studio-ink) !important;
    font-size: 25px !important;
    font-weight: 850 !important;
    line-height: 1 !important;
  }

  html.product-studio-v3 .product-brand-copy small {
    color: var(--studio-muted) !important;
    font-size: 12.5px !important;
    font-weight: 600 !important;
    line-height: 1.25 !important;
  }

  html.product-studio-v3 .product-app-nav {
    grid-column: 2;
    justify-self: end;
    display: flex !important;
    align-items: center !important;
    gap: 2px !important;
    padding: 3px !important;
    border: 0 !important;
    border-radius: 10px !important;
    background: rgba(255, 255, 255, 0.58) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .product-nav-button {
    min-width: 0 !important;
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 7px !important;
    padding: 0 13px !important;
    border: 0 !important;
    border-radius: var(--studio-radius-sm) !important;
    color: var(--studio-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    transition:
      color var(--studio-ease),
      background-color var(--studio-ease),
      box-shadow var(--studio-ease),
      transform var(--studio-ease) !important;
  }

  html.product-studio-v3 .product-nav-button svg {
    width: 18px !important;
    height: 18px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.9 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.product-studio-v3 .product-nav-button:hover,
  html.product-studio-v3 .product-nav-button.is-active {
    color: var(--studio-primary-deep) !important;
    background: var(--studio-surface) !important;
    box-shadow: 0 2px 6px rgba(16, 33, 30, 0.08) !important;
    transform: none !important;
  }

  html.product-studio-v3 .product-home-button {
    grid-column: 3;
    width: auto !important;
    min-width: 92px !important;
    min-height: 42px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    padding: 0 14px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 10px !important;
    color: var(--studio-primary-deep) !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
    font-weight: 750 !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] .product-home-button,
  html.product-studio-v3 .product-home-screen .product-home-button {
    display: none !important;
  }

  html.product-studio-v3 .screen > .top {
    position: relative !important;
    min-height: 176px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 36px !important;
    margin: 0 0 20px !important;
    padding: 32px 38px !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: var(--studio-radius-lg) !important;
    color: #fff !important;
    background: var(--studio-primary-deep) !important;
    box-shadow: var(--studio-shadow-panel) !important;
  }

  html.product-studio-v3 .screen > .top::before {
    content: "" !important;
    position: absolute !important;
    inset-inline: 0 !important;
    inset-block: auto 0 !important;
    width: auto !important;
    height: 4px !important;
    display: block !important;
    background: linear-gradient(90deg, var(--studio-primary), var(--studio-gold), var(--studio-coral)) !important;
    opacity: 1 !important;
  }

  html.product-studio-v3 .screen > .top::after {
    content: none !important;
    position: absolute !important;
    inset-inline-start: 34px !important;
    inset-block-start: 28px !important;
    width: 126px !important;
    height: 126px !important;
    display: none !important;
    border-radius: 28px !important;
    background: url("./icon.svg") center / cover no-repeat !important;
    opacity: 0.11 !important;
    transform: rotate(-8deg) !important;
    pointer-events: none !important;
  }

  html.product-studio-v3 .screen > .top .brand {
    position: relative !important;
    z-index: 1 !important;
    grid-column: 1 !important;
    width: auto !important;
    max-width: 720px !important;
    min-height: 0 !important;
    padding: 0 !important;
  }

  html.product-studio-v3 .screen > .top .brand::before,
  html.product-studio-v3 .screen > .top .brand::after {
    content: none !important;
    display: none !important;
  }

  html.product-studio-v3 .screen > .top .eyebrow {
    margin: 0 0 7px !important;
    color: #f4cb78 !important;
    font-size: 13px !important;
    font-weight: 750 !important;
  }

  html.product-studio-v3 .screen > .top h1 {
    max-width: 18ch !important;
    margin: 0 !important;
    color: #fff !important;
    font-size: 36px !important;
    font-weight: 850 !important;
    line-height: 1.08 !important;
    text-shadow: none !important;
  }

  html.product-studio-v3 .screen > .top .muted,
  html.product-studio-v3 .screen > .top .opened-at {
    margin: 9px 0 0 !important;
    color: rgba(255, 255, 255, 0.74) !important;
    font-size: 15px !important;
    font-weight: 580 !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top,
  html.product-studio-v3 .product-home-screen > .top {
    min-height: 250px !important;
    grid-template-columns: minmax(0, 1fr) 44% !important;
    grid-template-rows: auto auto !important;
    padding-block: 38px !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top::after,
  html.product-studio-v3 .product-home-screen > .top::after {
    content: "" !important;
    inset-inline-start: auto !important;
    inset-inline-end: 0 !important;
    inset-block: 0 !important;
    width: 48% !important;
    height: 100% !important;
    display: block !important;
    border-radius: 0 !important;
    background: url("./sogrim-home-hero.png") left center / cover no-repeat !important;
    opacity: 0.98 !important;
    transform: none !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top h1,
  html.product-studio-v3 .product-home-screen > .top h1 {
    font-size: 46px !important;
    line-height: 1.04 !important;
  }

  html.product-studio-v3 .product-hero-note {
    display: block !important;
    max-width: 58ch !important;
    margin: 14px 0 0 !important;
    color: rgba(255, 255, 255, 0.76) !important;
    font-size: 15px !important;
    font-weight: 560 !important;
    line-height: 1.55 !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top .brand,
  html.product-studio-v3 .product-home-screen > .top .brand {
    grid-column: 1 !important;
    grid-row: 1 !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top .hero-actions,
  html.product-studio-v3 .product-home-screen > .top .hero-actions {
    grid-column: 1 !important;
    grid-row: 2 !important;
    width: min(100%, 410px) !important;
    grid-template-columns: 1fr 1fr !important;
    justify-self: start !important;
    margin-top: 18px !important;
  }

  html.product-studio-v3 .screen > .top .hero-actions {
    position: relative !important;
    z-index: 2 !important;
    grid-column: 2 !important;
    width: 270px !important;
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 9px !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  html.product-studio-v3 .screen > .top .hero-actions .primary-button,
  html.product-studio-v3 .screen > .top .hero-actions .secondary-button {
    width: 100% !important;
    min-height: 52px !important;
  }

  html.product-studio-v3 .screen > .top .hero-actions .primary-button {
    color: var(--studio-primary-dark) !important;
    background: #ffffff !important;
    box-shadow: var(--studio-shadow-control) !important;
  }

  html.product-studio-v3 .screen > .top .hero-actions .secondary-button {
    color: #ffffff !important;
    border-color: rgba(255, 255, 255, 0.28) !important;
    background: rgba(255, 255, 255, 0.08) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .screen > .top .app-back-button {
    position: absolute !important;
    inset-block-start: 16px !important;
    inset-inline-start: auto !important;
    inset-inline-end: 16px !important;
    z-index: 4 !important;
    width: 42px !important;
    min-width: 42px !important;
    height: 42px !important;
    min-height: 42px !important;
    border: 0 !important;
    border-radius: 10px !important;
    color: var(--studio-primary-dark) !important;
    background: rgba(255, 255, 255, 0.92) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .primary-button,
  html.product-studio-v3 .secondary-button,
  html.product-studio-v3 .icon-button {
    min-height: 46px !important;
    border-radius: 10px !important;
    font-weight: 750 !important;
    transition:
      color var(--studio-ease),
      background-color var(--studio-ease),
      border-color var(--studio-ease),
      box-shadow var(--studio-ease),
      transform var(--studio-ease) !important;
  }

  html.product-studio-v3 .primary-button {
    border: 0 !important;
    color: #fff !important;
    background: var(--studio-primary) !important;
    box-shadow: 0 4px 8px rgba(8, 117, 107, 0.2) !important;
  }

  html.product-studio-v3 .primary-button::after,
  html.product-studio-v3 .primary-button::before {
    content: none !important;
    display: none !important;
  }

  html.product-studio-v3 .secondary-button,
  html.product-studio-v3 .icon-button {
    border: 1px solid var(--studio-line) !important;
    color: var(--studio-ink) !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 button:focus-visible,
  html.product-studio-v3 a:focus-visible,
  html.product-studio-v3 input:focus-visible,
  html.product-studio-v3 select:focus-visible,
  html.product-studio-v3 textarea:focus-visible {
    outline: 3px solid rgba(8, 117, 107, 0.27) !important;
    outline-offset: 2px !important;
  }

  html.product-studio-v3 input,
  html.product-studio-v3 select,
  html.product-studio-v3 textarea {
    min-height: 50px !important;
    border: 1px solid var(--studio-line-strong) !important;
    border-radius: 10px !important;
    color: var(--studio-ink) !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
    transition:
      border-color var(--studio-ease),
      box-shadow var(--studio-ease),
      background-color var(--studio-ease) !important;
  }

  html.product-studio-v3 input:hover,
  html.product-studio-v3 select:hover,
  html.product-studio-v3 textarea:hover {
    border-color: #9eb3ac !important;
  }

  html.product-studio-v3 input:focus,
  html.product-studio-v3 select:focus,
  html.product-studio-v3 textarea:focus {
    border-color: var(--studio-primary) !important;
    box-shadow: 0 0 0 3px rgba(8, 117, 107, 0.12) !important;
  }

  html.product-studio-v3 input::placeholder,
  html.product-studio-v3 textarea::placeholder {
    color: #677772 !important;
    opacity: 1 !important;
  }

  html.product-studio-v3 .panel,
  html.product-studio-v3 .event-row,
  html.product-studio-v3 .expense-row,
  html.product-studio-v3 .group-row,
  html.product-studio-v3 .transfer-row,
  html.product-studio-v3 .balance-row {
    border: 1px solid var(--studio-line) !important;
    border-radius: var(--studio-radius) !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .panel::before,
  html.product-studio-v3 .panel::after,
  html.product-studio-v3 .create-event-panel::before,
  html.product-studio-v3 .create-event-panel::after {
    content: none !important;
    display: none !important;
  }

  html.product-studio-v3 .product-home-screen > .notice,
  html.product-studio-v3 .product-event-screen > .notice,
  html.product-studio-v3 .product-home-screen .personal-dashboard,
  html.product-studio-v3 .product-home-kicker,
  html.product-studio-v3 .product-home-artwork,
  html.product-studio-v3 .product-hero-artwork {
    display: none !important;
  }

  html.product-studio-v3 .home-empty-events,
  html.product-studio-v3 .personal-actions-section {
    margin-top: 30px !important;
  }

  html.product-studio-v3 .event-type-guide,
  html.product-studio-v3 .personal-action-card,
  html.product-studio-v3 .public-personal-action-card {
    border: 1px solid var(--studio-line) !important;
    border-radius: var(--studio-radius-md) !important;
    background: var(--studio-surface) !important;
    box-shadow: var(--studio-shadow-control) !important;
  }

  html.product-studio-v3 .personal-action-card.is-debt,
  html.product-studio-v3 .public-personal-action-card.is-debt {
    border-color: rgba(201, 104, 72, 0.24) !important;
    background: #fff9f7 !important;
  }

  html.product-studio-v3 .personal-action-card.is-credit,
  html.product-studio-v3 .public-personal-action-card.is-credit {
    border-color: rgba(8, 117, 107, 0.22) !important;
    background: #f5fbf9 !important;
  }

  html.product-studio-v3 .section-title-row {
    margin-bottom: 14px !important;
    padding-inline: 2px !important;
  }

  html.product-studio-v3 .section-title-row h2 {
    margin-bottom: 3px !important;
    font-size: 23px !important;
  }

  html.product-studio-v3 .section-title-row .muted {
    margin: 0 !important;
    font-size: 14px !important;
  }

  html.product-studio-v3 .empty-state {
    min-height: 210px !important;
    display: grid !important;
    place-items: center !important;
    align-content: center !important;
    gap: 13px !important;
    padding: 32px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: var(--studio-radius-lg) !important;
    color: var(--studio-muted) !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
    font-size: 16px !important;
    font-weight: 650 !important;
  }

  html.product-studio-v3 .product-empty-icon {
    width: 56px !important;
    height: 56px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 16px !important;
    color: var(--studio-primary) !important;
    background: var(--studio-primary-soft) !important;
  }

  html.product-studio-v3 .product-empty-icon svg {
    width: 28px !important;
    height: 28px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.7 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.product-studio-v3 .product-empty-icon rect {
    fill: rgba(255, 255, 255, 0.76) !important;
  }

  html.product-studio-v3 .event-creation-progress {
    width: min(100%, 680px);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: -2px auto 18px;
    padding: 0;
    list-style: none;
  }

  html.product-studio-v3 .event-creation-progress li {
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: 1px solid var(--studio-line);
    border-radius: 10px;
    color: var(--studio-muted);
    background: rgba(255, 255, 255, 0.68);
  }

  html.product-studio-v3 .event-creation-progress li > span {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    flex: 0 0 28px;
    border: 1px solid var(--studio-line-strong);
    border-radius: 50%;
    color: var(--studio-muted);
    background: var(--studio-surface);
    font-size: 13px;
    font-weight: 800;
  }

  html.product-studio-v3 .event-creation-progress li > strong {
    font-size: 14px !important;
    font-weight: 720 !important;
  }

  html.product-studio-v3 .event-creation-progress li.is-active {
    border-color: rgba(8, 117, 107, 0.28);
    color: var(--studio-primary-deep);
    background: var(--studio-primary-soft);
  }

  html.product-studio-v3 .event-creation-progress li.is-active > span,
  html.product-studio-v3 .event-creation-progress li.is-complete > span {
    border-color: var(--studio-primary);
    color: #ffffff;
    background: var(--studio-primary);
  }

  html.product-studio-v3 .event-creation-progress li.is-complete {
    color: var(--studio-primary-deep);
  }

  html.product-studio-v3 .event-type-step-panel {
    min-height: 0 !important;
    margin-top: 0 !important;
    padding: 16px !important;
    border: 0 !important;
    background: transparent !important;
  }

  html.product-studio-v3 .event-type-options {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 12px !important;
  }

  html.product-studio-v3 .event-type-option {
    position: relative !important;
    min-height: 150px !important;
    display: grid !important;
    grid-template-columns: 54px minmax(0, 1fr) !important;
    grid-template-rows: auto auto !important;
    align-items: start !important;
    align-content: center !important;
    gap: 8px 14px !important;
    padding: 22px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: var(--studio-radius-lg) !important;
    color: var(--studio-ink) !important;
    text-align: start !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
    transition:
      border-color var(--studio-ease),
      background-color var(--studio-ease),
      transform var(--studio-ease),
      box-shadow var(--studio-ease) !important;
  }

  html.product-studio-v3 .event-type-option::before,
  html.product-studio-v3 .event-type-option::after {
    content: none !important;
    display: none !important;
  }

  html.product-studio-v3 .studio-event-type-icon {
    grid-column: 1;
    grid-row: 1 / 3;
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    border-radius: 15px;
    color: var(--studio-primary-deep);
    background: var(--studio-primary-soft);
  }

  html.product-studio-v3 .event-type-option:nth-child(2) .studio-event-type-icon {
    color: #9a4b35;
    background: var(--studio-coral-soft);
  }

  html.product-studio-v3 .event-type-option:nth-child(3) .studio-event-type-icon {
    color: #3f647a;
    background: #e7eff3;
  }

  html.product-studio-v3 .studio-event-type-icon svg {
    width: 27px;
    height: 27px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  html.product-studio-v3 .event-type-option strong {
    grid-column: 2;
    align-self: end;
    font-size: 20px !important;
    line-height: 1.15 !important;
  }

  html.product-studio-v3 .event-type-option > span:not(.studio-event-type-icon) {
    grid-column: 2;
    color: var(--studio-muted) !important;
    font-size: 14px !important;
    line-height: 1.5 !important;
  }

  html.product-studio-v3 .event-type-option:hover,
  html.product-studio-v3 .event-type-option[aria-checked="true"] {
    border-color: var(--studio-primary) !important;
    background: #fbfdfc !important;
    box-shadow: 0 0 0 3px rgba(8, 117, 107, 0.09) !important;
    transform: translateY(-2px) !important;
  }

  html.product-studio-v3 .create-event-panel:not(.event-type-step-panel),
  html.product-studio-v3 .profile-setup-panel {
    width: min(100%, 880px) !important;
    margin-inline: auto !important;
    padding: 28px !important;
    border-radius: var(--studio-radius-lg) !important;
    box-shadow: var(--studio-shadow-panel) !important;
  }

  html.product-studio-v3 .profile-setup-screen {
    width: min(100%, 820px) !important;
  }

  html.product-studio-v3 .profile-first-run-screen .product-app-nav {
    display: none !important;
  }

  html.product-studio-v3 .profile-first-run-screen .product-app-identity {
    grid-template-columns: 1fr !important;
  }

  html.product-studio-v3 .profile-first-run-screen .product-brand-lockup {
    justify-self: start !important;
  }

  html.product-studio-v3 .participant-pill,
  html.product-studio-v3 .quick-item-custom-share label {
    min-height: 46px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 10px !important;
    background: var(--studio-surface-subtle) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .participant-pill:has(input:checked),
  html.product-studio-v3 .quick-item-custom-share label:has(input:checked) {
    border-color: rgba(8, 117, 107, 0.38) !important;
    background: var(--studio-primary-soft) !important;
  }

  html.product-studio-v3 .avatar {
    border: 0 !important;
    color: var(--studio-primary-deep) !important;
    background: var(--studio-primary-soft) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .product-context-bar {
    margin: 0 0 18px !important;
    padding: 13px 16px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: var(--studio-radius) !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .event-start-panel {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 280px !important;
    gap: 26px !important;
    align-items: center !important;
    padding: 28px !important;
    border: 0 !important;
    border-radius: var(--studio-radius-lg) !important;
    background: var(--studio-surface) !important;
    box-shadow: var(--studio-shadow-panel) !important;
  }

  html.product-studio-v3 .event-start-copy h2 {
    margin: 9px 0 6px !important;
    font-size: 30px !important;
    line-height: 1.12 !important;
  }

  html.product-studio-v3 .event-start-copy p {
    margin: 0 !important;
    color: var(--studio-muted) !important;
    font-size: 15px !important;
  }

  html.product-studio-v3 .event-type-chip,
  html.product-studio-v3 .status-chip {
    min-height: 28px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 0 10px !important;
    border: 0 !important;
    border-radius: 999px !important;
    color: var(--studio-primary-deep) !important;
    background: var(--studio-primary-soft) !important;
    font-size: 12px !important;
    font-weight: 750 !important;
  }

  html.product-studio-v3 .status-chip.is-open {
    border: 1px solid rgba(8, 117, 107, 0.18) !important;
    color: var(--studio-primary-deep) !important;
    background: var(--studio-primary-soft) !important;
  }

  html.product-studio-v3 .status-chip.is-locked {
    border: 1px solid rgba(170, 116, 31, 0.2) !important;
    color: #76541d !important;
    background: #fff5df !important;
  }

  html.product-studio-v3 .event-start-primary {
    width: 100% !important;
    min-height: 68px !important;
    font-size: 18px !important;
  }

  html.product-studio-v3 .event-start-secondary {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 8px !important;
    margin-top: 10px !important;
    padding-top: 16px !important;
    border-top: 1px solid var(--studio-line) !important;
  }

  html.product-studio-v3 .event-start-secondary .secondary-button {
    min-height: 46px !important;
  }

  html.product-studio-v3 .event-workspace-nav {
    top: 78px !important;
    z-index: 30 !important;
    display: flex !important;
    gap: 4px !important;
    margin: 16px 0 !important;
    padding: 5px !important;
    overflow-x: auto !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 12px !important;
    background: rgba(255, 255, 255, 0.92) !important;
    box-shadow: none !important;
    backdrop-filter: blur(14px);
    scrollbar-width: none;
  }

  html.product-studio-v3 .event-workspace-nav::-webkit-scrollbar {
    display: none;
  }

  html.product-studio-v3 .event-workspace-tab {
    min-width: 118px !important;
    min-height: 42px !important;
    flex: 1 0 auto !important;
    border: 0 !important;
    border-radius: 8px !important;
    color: var(--studio-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .event-workspace-tab.is-active,
  html.product-studio-v3 .event-workspace-tab:hover {
    color: var(--studio-primary-deep) !important;
    background: var(--studio-primary-soft) !important;
  }

  html.product-studio-v3 .event-row,
  html.product-studio-v3 .expense-row,
  html.product-studio-v3 .group-row,
  html.product-studio-v3 .transfer-row,
  html.product-studio-v3 .balance-row {
    min-height: 76px !important;
    padding: 15px 17px !important;
    transition:
      border-color var(--studio-ease),
      background-color var(--studio-ease),
      transform var(--studio-ease) !important;
  }

  html.product-studio-v3 .event-row:hover,
  html.product-studio-v3 .expense-row:hover,
  html.product-studio-v3 .group-row:hover,
  html.product-studio-v3 .transfer-row:hover {
    border-color: var(--studio-line-strong) !important;
    background: #fbfdfc !important;
    box-shadow: none !important;
    transform: translateY(-1px) !important;
  }

  html.product-studio-v3 .expense-modal-backdrop,
  html.product-studio-v3 .event-modal-backdrop {
    padding: 22px !important;
    background: rgba(7, 24, 21, 0.54) !important;
    backdrop-filter: blur(8px) !important;
  }

  html.product-studio-v3 .expense-modal,
  html.product-studio-v3 .event-modal {
    width: min(100%, 760px) !important;
    max-height: min(92dvh, 900px) !important;
    padding: 24px !important;
    border: 0 !important;
    border-radius: var(--studio-radius-lg) !important;
    background: var(--studio-surface-subtle) !important;
    box-shadow: var(--studio-shadow-float) !important;
  }

  html.product-studio-v3 .expense-modal-header,
  html.product-studio-v3 .event-modal-header {
    margin-bottom: 18px !important;
    padding-bottom: 16px !important;
    border-bottom: 1px solid var(--studio-line) !important;
  }

  html.product-studio-v3 .expense-modal-header h2,
  html.product-studio-v3 .event-modal-header h2 {
    margin-bottom: 4px !important;
    font-size: 27px !important;
  }

  html.product-studio-v3 .expense-mode-switch,
  html.product-studio-v3 .quick-purpose-switch,
  html.product-studio-v3 .segmented-control {
    gap: 3px !important;
    padding: 4px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 10px !important;
    background: var(--studio-surface) !important;
  }

  html.product-studio-v3 .expense-mode-switch button,
  html.product-studio-v3 .quick-purpose-switch button,
  html.product-studio-v3 .segmented-control button {
    min-height: 42px !important;
    border: 0 !important;
    border-radius: 7px !important;
    color: var(--studio-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .expense-mode-switch button.is-active,
  html.product-studio-v3 .quick-purpose-switch button.is-active,
  html.product-studio-v3 .segmented-control button.is-active {
    color: var(--studio-primary-deep) !important;
    background: var(--studio-primary-soft) !important;
  }

  html.product-studio-v3 .payer-row,
  html.product-studio-v3 .expense-guest-box,
  html.product-studio-v3 .product-form-helper,
  html.product-studio-v3 .quick-expense-meta,
  html.product-studio-v3 .quick-item-row {
    border: 1px solid var(--studio-line) !important;
    border-radius: var(--studio-radius) !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 input[inputmode="decimal"] {
    font-size: 20px !important;
    font-weight: 750 !important;
    font-variant-numeric: tabular-nums;
  }

  html.product-studio-v3 .settlement-hero {
    gap: 24px !important;
    padding: 28px !important;
    border: 0 !important;
    border-radius: var(--studio-radius-lg) !important;
    color: #fff !important;
    background: var(--studio-primary-deep) !important;
    box-shadow: var(--studio-shadow-panel) !important;
  }

  html.product-studio-v3 .settlement-hero h2,
  html.product-studio-v3 .settlement-hero .muted,
  html.product-studio-v3 .settlement-hero .amount {
    color: #fff !important;
  }

  html.product-studio-v3 .settlement-hero-amount {
    font-size: 42px !important;
    font-weight: 850 !important;
  }

  html.product-studio-v3 .public-profile-gate {
    padding: 18px !important;
    background: var(--studio-canvas) !important;
  }

  html.product-studio-v3 .public-profile-modal {
    width: min(100%, 820px) !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: var(--studio-radius-lg) !important;
    background: var(--studio-surface) !important;
    box-shadow: var(--studio-shadow-float) !important;
  }

  html.product-studio-v3 .public-profile-hero {
    color: #fff !important;
    background: var(--studio-primary-deep) !important;
  }

  html.product-studio-v3 .public-profile-form {
    background: var(--studio-surface) !important;
  }

  html.product-studio-v3 .notice,
  html.product-studio-v3 .invite-status {
    border: 0 !important;
    border-radius: var(--studio-radius) !important;
    color: var(--studio-primary-deep) !important;
    background: var(--studio-primary-soft) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .error {
    color: var(--studio-danger) !important;
  }

  @media (hover: hover) {
    html.product-studio-v3 .primary-button:hover:not(:disabled) {
      background: var(--studio-primary-deep) !important;
      box-shadow: 0 5px 9px rgba(8, 117, 107, 0.22) !important;
      transform: translateY(-1px) !important;
    }

    html.product-studio-v3 .secondary-button:hover:not(:disabled),
    html.product-studio-v3 .icon-button:hover:not(:disabled),
    html.product-studio-v3 .product-home-button:hover:not(:disabled) {
      border-color: var(--studio-line-strong) !important;
      background: #fbfdfc !important;
      transform: translateY(-1px) !important;
    }
  }

  @media (max-width: 760px) {
    html.product-studio-v3 body {
      padding-bottom: calc(84px + env(safe-area-inset-bottom)) !important;
    }

    html.product-studio-v3 .screen {
      min-height: calc(100dvh - 84px);
      padding: 8px 12px 34px !important;
    }

    html.product-studio-v3 .product-app-identity {
      position: sticky !important;
      top: 0 !important;
      min-height: 64px !important;
      grid-template-columns: minmax(0, 1fr) 44px !important;
      gap: 10px !important;
      margin-bottom: 12px !important;
      padding: max(8px, env(safe-area-inset-top)) 0 8px !important;
      background: rgba(242, 245, 244, 0.96) !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }

    html.product-studio-v3 .product-brand-lockup {
      grid-column: 1 !important;
    }

    html.product-studio-v3 .product-brand-mark {
      width: 42px !important;
      min-width: 42px !important;
      height: 42px !important;
      border-radius: 12px !important;
    }

    html.product-studio-v3 .product-brand-copy strong {
      font-size: 21px !important;
    }

    html.product-studio-v3 .product-brand-copy small {
      display: none !important;
    }

    html.product-studio-v3 .product-home-button {
      grid-column: 2 !important;
      width: 44px !important;
      min-width: 44px !important;
      height: 44px !important;
      min-height: 44px !important;
      padding: 0 !important;
    }

    html.product-studio-v3 .product-home-button > span:last-child {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      clip: rect(0 0 0 0) !important;
      white-space: nowrap !important;
    }

    html.product-studio-v3 .product-app-nav {
      position: fixed !important;
      inset-inline: auto !important;
      inset-block: auto calc(8px + env(safe-area-inset-bottom)) !important;
      z-index: 90 !important;
      left: 10px !important;
      right: 10px !important;
      width: calc(100% - 20px) !important;
      max-width: none !important;
      justify-self: stretch !important;
      display: grid !important;
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      gap: 2px !important;
      padding: 5px !important;
      border: 1px solid rgba(16, 33, 30, 0.09) !important;
      border-radius: 14px !important;
      background: rgba(255, 255, 255, 0.96) !important;
      box-shadow: 0 8px 18px rgba(16, 33, 30, 0.16) !important;
      backdrop-filter: blur(16px);
    }

    html.product-studio-v3 .segmented-control {
      width: 100% !important;
      display: flex !important;
      grid-auto-flow: unset !important;
      grid-template-columns: none !important;
    }

    html.product-studio-v3 .segmented-control button {
      min-width: 0 !important;
      flex: 1 1 0 !important;
    }

    html.product-studio-v3 .product-nav-button {
      width: 100% !important;
      min-width: 0 !important;
      min-height: 56px !important;
      display: grid !important;
      grid-template-rows: 21px auto !important;
      gap: 2px !important;
      padding: 5px 3px !important;
      font-size: 11px !important;
      line-height: 1.1 !important;
    }

    html.product-studio-v3 .product-nav-button span {
      position: static !important;
      width: auto !important;
      height: auto !important;
      overflow: visible !important;
      clip: auto !important;
      white-space: nowrap !important;
    }

    html.product-studio-v3 .product-nav-button svg {
      width: 20px !important;
      height: 20px !important;
    }

    html.product-studio-v3 .profile-first-run-screen .product-app-nav {
      display: none !important;
    }

    html.product-studio-v3 .profile-first-run-screen .product-app-identity {
      grid-template-columns: 1fr !important;
    }

    html.product-studio-v3 .screen > .top,
    html.product-studio-v3 .screen[data-product-screen="home"] > .top,
    html.product-studio-v3 .product-home-screen > .top {
      min-height: 0 !important;
      grid-template-columns: 1fr !important;
      gap: 22px !important;
      margin-bottom: 14px !important;
      padding: 24px 20px !important;
      border-radius: 14px !important;
    }

    html.product-studio-v3 .screen[data-product-screen="home"] > .top,
    html.product-studio-v3 .product-home-screen > .top {
      grid-template-columns: 1fr !important;
      grid-template-rows: auto auto !important;
      padding-bottom: 26px !important;
    }

    html.product-studio-v3 .screen[data-product-screen="home"] > .top::after,
    html.product-studio-v3 .product-home-screen > .top::after {
      inset-inline-start: auto !important;
      inset-inline-end: -34px !important;
      inset-block: auto -22px !important;
      width: 210px !important;
      height: 190px !important;
      border-radius: 0 !important;
      background-position: 18% center !important;
      opacity: 0.24 !important;
      transform: none !important;
    }

    html.product-studio-v3 .screen > .top::after {
      inset-inline-start: -12px !important;
      inset-block-start: 18px !important;
      width: 104px !important;
      height: 104px !important;
      opacity: 0.09 !important;
    }

    html.product-studio-v3 .screen:not([data-product-screen="home"]):not(.product-home-screen) > .top {
      min-height: 108px !important;
      gap: 10px !important;
      padding: 22px 18px !important;
    }

    html.product-studio-v3 .screen > .top .brand,
    html.product-studio-v3 .screen[data-product-screen="home"] > .top .brand {
      grid-column: 1 !important;
      width: 100% !important;
      max-width: 100% !important;
      padding-inline-start: 46px !important;
      padding-inline-end: 46px !important;
    }

    html.product-studio-v3 .screen[data-product-screen="home"] > .top .brand,
    html.product-studio-v3 .product-home-screen > .top .brand {
      padding-inline-start: 0 !important;
    }

    html.product-studio-v3 .screen > .top h1,
    html.product-studio-v3 .screen[data-product-screen="home"] > .top h1,
    html.product-studio-v3 .product-home-screen > .top h1 {
      max-width: 100% !important;
      font-size: 31px !important;
      line-height: 1.1 !important;
    }

    html.product-studio-v3 .product-hero-note {
      margin-top: 10px !important;
      font-size: 14px !important;
    }

    html.product-studio-v3 .screen > .top .hero-actions {
      grid-column: 1 !important;
      width: 100% !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 8px !important;
    }

    html.product-studio-v3 .screen[data-product-screen="home"] > .top .hero-actions,
    html.product-studio-v3 .product-home-screen > .top .hero-actions {
      grid-column: 1 !important;
      grid-row: 2 !important;
      width: 100% !important;
      justify-self: stretch !important;
      margin-top: 0 !important;
    }

    html.product-studio-v3 .empty-state {
      min-height: 176px !important;
      padding: 24px 18px !important;
    }

    html.product-studio-v3 .event-type-step-panel {
      padding: 0 !important;
    }

    html.product-studio-v3 .event-type-options {
      grid-template-columns: 1fr !important;
      gap: 9px !important;
    }

    html.product-studio-v3 .event-type-option {
      min-height: 112px !important;
      grid-template-columns: 48px minmax(0, 1fr) !important;
      padding: 17px !important;
    }

    html.product-studio-v3 .studio-event-type-icon {
      width: 48px;
      height: 48px;
      border-radius: 13px;
    }

    html.product-studio-v3 .event-type-option strong {
      font-size: 18px !important;
    }

    html.product-studio-v3 .create-event-panel:not(.event-type-step-panel),
    html.product-studio-v3 .profile-setup-panel {
      padding: 20px 16px !important;
      border-radius: 14px !important;
      box-shadow: none !important;
    }

    html.product-studio-v3 .event-start-panel {
      grid-template-columns: 1fr !important;
      gap: 18px !important;
      padding: 20px !important;
      border-radius: 14px !important;
    }

    html.product-studio-v3 .event-start-copy h2 {
      font-size: 25px !important;
    }

    html.product-studio-v3 .event-start-primary {
      min-height: 62px !important;
    }

    html.product-studio-v3 .event-start-secondary {
      gap: 6px !important;
    }

    html.product-studio-v3 .event-start-secondary .secondary-button {
      min-width: 0 !important;
      padding-inline: 6px !important;
      font-size: 13px !important;
    }

    html.product-studio-v3 .event-workspace-nav {
      top: 64px !important;
      margin-inline: 0 !important;
    }

    html.product-studio-v3 .event-workspace-tab {
      min-width: 104px !important;
      min-height: 46px !important;
    }

    html.product-studio-v3 .product-context-bar {
      display: none !important;
    }

    html.product-studio-v3 .expense-modal-backdrop,
    html.product-studio-v3 .event-modal-backdrop {
      z-index: 200 !important;
      padding: 0 !important;
      background: var(--studio-surface) !important;
      backdrop-filter: none !important;
    }

    html.product-studio-v3 .expense-modal,
    html.product-studio-v3 .event-modal {
      width: 100vw !important;
      max-width: none !important;
      height: 100dvh !important;
      max-height: none !important;
      padding: 20px !important;
      border-radius: 0 !important;
      background: var(--studio-surface-subtle) !important;
      box-shadow: none !important;
    }

    html.product-studio-v3 .public-profile-gate {
      align-items: stretch !important;
      padding: 0 !important;
    }

    html.product-studio-v3 .public-profile-modal {
      width: 100vw !important;
      max-width: none !important;
      min-height: 100dvh !important;
      height: 100dvh !important;
      max-height: none !important;
      border-radius: 0 !important;
      overflow-y: auto !important;
      overscroll-behavior: contain !important;
    }

    html.product-studio-v3 .expense-modal-header,
    html.product-studio-v3 .event-modal-header {
      margin: -20px -20px 16px !important;
      padding: calc(14px + env(safe-area-inset-top)) 20px 14px !important;
      background: #ffffff !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }

    html.product-studio-v3 .settlement-hero {
      grid-template-columns: 1fr !important;
      padding: 22px !important;
    }
  }

  @media (max-width: 430px) {
    html.product-studio-v3 .screen > .top .hero-actions {
      grid-template-columns: 1fr !important;
    }

    html.product-studio-v3 .product-nav-button {
      font-size: 11.5px !important;
    }

    html.product-studio-v3 .event-start-secondary {
      grid-template-columns: 1fr !important;
    }
  }

  /* Product refinement: a calm, receipt-like hierarchy instead of a marketing page. */
  html.product-studio-v3 {
    --studio-canvas: #f6f7f6;
    --studio-canvas-deep: #eef1ef;
    --studio-surface: #ffffff;
    --studio-surface-subtle: #fafbfa;
    --studio-surface-active: #edf6f3;
    --studio-ink: #171c1a;
    --studio-muted: #5f6864;
    --studio-faint: #7b847f;
    --studio-line: #e0e5e2;
    --studio-line-strong: #cbd3cf;
    --studio-primary: #086c62;
    --studio-primary-deep: #124b44;
    --studio-primary-dark: #103d38;
    --studio-primary-soft: #e9f4f1;
    --studio-coral: #b95842;
    --studio-coral-soft: #fbefec;
    --studio-gold: #b8892e;
    --studio-blue: #496b7e;
    --studio-danger: #a53e38;
    --studio-success: #24704a;
    --studio-radius-sm: 7px;
    --studio-radius: 10px;
    --studio-radius-md: 12px;
    --studio-radius-lg: 14px;
    --studio-shadow-control: 0 1px 2px rgba(17, 28, 24, 0.08);
    --studio-shadow-panel: 0 4px 12px rgba(17, 28, 24, 0.06);
    --studio-shadow-float: 0 18px 44px rgba(17, 28, 24, 0.18);
  }

  html.product-studio-v3 body,
  html.product-studio-v3 button,
  html.product-studio-v3 input,
  html.product-studio-v3 select,
  html.product-studio-v3 textarea {
    font-family: "Noto Sans Hebrew", "Heebo", system-ui, sans-serif !important;
  }

  html.product-studio-v3 body.app-dialog-open {
    overflow: hidden !important;
    overscroll-behavior: none !important;
  }

  html.product-studio-v3 .amount,
  html.product-studio-v3 time,
  html.product-studio-v3 input[inputmode="decimal"],
  html.product-studio-v3 input[type="number"] {
    font-variant-numeric: tabular-nums !important;
  }

  html.product-studio-v3 input[inputmode="decimal"],
  html.product-studio-v3 input[type="number"] {
    direction: ltr !important;
    text-align: left !important;
  }

  html.product-studio-v3 [hidden] {
    display: none !important;
  }

  html.product-studio-v3 .screen {
    width: min(100%, 1080px) !important;
    padding: 0 24px 96px !important;
  }

  html.product-studio-v3 .product-app-identity {
    min-height: 68px !important;
    gap: 20px !important;
    margin: 0 0 20px !important;
    padding: 9px 0 !important;
    border-bottom-color: var(--studio-line) !important;
    background: rgba(246, 247, 246, 0.96) !important;
    backdrop-filter: blur(14px) !important;
  }

  html.product-studio-v3 .product-brand-lockup {
    gap: 10px !important;
  }

  html.product-studio-v3 .product-brand-mark,
  html.product-studio-v3.product-v1 .product-app-identity .product-brand-mark,
  html.product-studio-v3.product-v1-live .product-app-identity .product-brand-mark {
    width: 42px !important;
    min-width: 42px !important;
    height: 42px !important;
    border-radius: 11px !important;
    box-shadow: var(--studio-shadow-control) !important;
  }

  html.product-studio-v3 .product-brand-copy strong {
    font-size: 22px !important;
    font-weight: 800 !important;
    line-height: 1.05 !important;
  }

  html.product-studio-v3 .product-brand-copy small {
    color: var(--studio-faint) !important;
    font-size: 11.5px !important;
    font-weight: 600 !important;
  }

  html.product-studio-v3 .product-app-nav {
    gap: 0 !important;
    padding: 0 !important;
    background: transparent !important;
  }

  html.product-studio-v3 .product-nav-button {
    min-height: 42px !important;
    padding: 0 12px !important;
    border-radius: 8px !important;
    font-size: 13px !important;
    font-weight: 650 !important;
  }

  html.product-studio-v3 .product-nav-button:hover,
  html.product-studio-v3 .product-nav-button[aria-current="page"] {
    color: var(--studio-ink) !important;
    background: #ffffff !important;
    box-shadow: var(--studio-shadow-control) !important;
  }

  html.product-studio-v3 .product-home-button {
    min-height: 42px !important;
    border-color: var(--studio-line) !important;
    border-radius: 8px !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .screen > .top,
  html.product-studio-v3 .screen[data-product-screen="home"] > .top,
  html.product-studio-v3 .product-home-screen > .top {
    min-height: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    grid-template-rows: auto !important;
    align-items: end !important;
    gap: 24px !important;
    margin: 0 0 26px !important;
    padding: 28px 0 30px !important;
    overflow: visible !important;
    border: 0 !important;
    border-bottom: 1px solid var(--studio-line) !important;
    border-radius: 0 !important;
    color: var(--studio-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .screen > .top::before,
  html.product-studio-v3 .screen > .top::after,
  html.product-studio-v3 .screen[data-product-screen="home"] > .top::after,
  html.product-studio-v3 .product-home-screen > .top::after {
    content: none !important;
    display: none !important;
  }

  html.product-studio-v3 .screen > .top .brand,
  html.product-studio-v3 .screen[data-product-screen="home"] > .top .brand,
  html.product-studio-v3 .product-home-screen > .top .brand {
    grid-column: 1 !important;
    grid-row: 1 !important;
    max-width: 680px !important;
    padding-inline-start: 56px !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top .brand,
  html.product-studio-v3 .product-home-screen > .top .brand {
    padding-inline-start: 0 !important;
  }

  html.product-studio-v3 .screen > .top .eyebrow {
    margin: 0 0 7px !important;
    color: var(--studio-primary) !important;
    font-size: 13px !important;
    font-weight: 700 !important;
  }

  html.product-studio-v3 .screen > .top h1,
  html.product-studio-v3 .screen[data-product-screen="home"] > .top h1,
  html.product-studio-v3 .product-home-screen > .top h1 {
    max-width: 20ch !important;
    margin: 0 !important;
    color: var(--studio-ink) !important;
    font-size: 38px !important;
    font-weight: 800 !important;
    line-height: 1.12 !important;
  }

  html.product-studio-v3 .screen > .top .muted,
  html.product-studio-v3 .screen > .top .opened-at {
    margin-top: 8px !important;
    color: var(--studio-muted) !important;
    font-size: 14px !important;
    font-weight: 500 !important;
  }

  html.product-studio-v3 .product-hero-note {
    display: none !important;
  }

  html.product-studio-v3 .screen > .top .hero-actions,
  html.product-studio-v3 .screen[data-product-screen="home"] > .top .hero-actions,
  html.product-studio-v3 .product-home-screen > .top .hero-actions {
    grid-column: 2 !important;
    grid-row: 1 !important;
    width: auto !important;
    display: flex !important;
    align-items: center !important;
    gap: 9px !important;
    margin: 0 !important;
  }

  html.product-studio-v3 .screen > .top .hero-actions .primary-button,
  html.product-studio-v3 .screen > .top .hero-actions .secondary-button {
    width: auto !important;
    min-width: 142px !important;
    min-height: 46px !important;
  }

  html.product-studio-v3 .screen > .top .hero-actions .primary-button {
    color: #ffffff !important;
    background: var(--studio-primary) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .screen > .top .hero-actions .secondary-button {
    color: var(--studio-ink) !important;
    border-color: var(--studio-line-strong) !important;
    background: #ffffff !important;
  }

  html.product-studio-v3 .screen > .top .app-back-button {
    inset-block-start: 30px !important;
    inset-inline-start: 0 !important;
    inset-inline-end: auto !important;
    width: 42px !important;
    height: 42px !important;
    color: var(--studio-ink) !important;
    border: 1px solid var(--studio-line) !important;
    background: #ffffff !important;
    font-size: 26px !important;
    direction: ltr !important;
    unicode-bidi: isolate !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top .app-back-button,
  html.product-studio-v3 .product-home-screen > .top .app-back-button {
    display: none !important;
  }

  html.product-studio-v3 .primary-button,
  html.product-studio-v3 .secondary-button,
  html.product-studio-v3 .icon-button {
    border-radius: 9px !important;
    font-weight: 700 !important;
  }

  html.product-studio-v3 .primary-button {
    background: var(--studio-primary) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 button:active:not(:disabled) {
    transform: scale(0.96) !important;
  }

  html.product-studio-v3 .notice {
    position: fixed !important;
    inset-inline: 16px !important;
    inset-block-start: 82px !important;
    z-index: 160 !important;
    width: fit-content !important;
    max-width: min(520px, calc(100vw - 32px)) !important;
    margin-inline: auto !important;
    padding: 11px 14px !important;
    border: 1px solid #bcd6cf !important;
    border-radius: 9px !important;
    color: var(--studio-primary-dark) !important;
    background: #f1f8f6 !important;
    box-shadow: var(--studio-shadow-panel) !important;
    font-size: 14px !important;
    font-weight: 650 !important;
  }

  html.product-studio-v3 .product-home-screen > .notice,
  html.product-studio-v3 .product-event-screen > .notice {
    display: block !important;
  }

  html.product-studio-v3 .personal-dashboard,
  html.product-studio-v3 .product-home-screen .personal-dashboard,
  html.product-studio-v3 .screen[data-product-screen="home"] .personal-dashboard {
    display: grid !important;
    grid-template-columns: minmax(250px, 0.85fr) minmax(0, 1.15fr) !important;
    gap: 0 !important;
    margin: 0 0 32px !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 12px !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .personal-balance-main {
    display: grid !important;
    align-content: center !important;
    gap: 6px !important;
    min-height: 168px !important;
    padding: 24px 28px !important;
    border-inline-end: 1px solid var(--studio-line) !important;
  }

  html.product-studio-v3 .personal-balance-main > span,
  html.product-studio-v3 .personal-balance-details span {
    color: var(--studio-muted) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
  }

  html.product-studio-v3 .personal-balance-main .amount {
    color: var(--studio-ink) !important;
    font-size: 40px !important;
    font-weight: 800 !important;
    line-height: 1 !important;
  }

  html.product-studio-v3 .personal-balance-main .amount.is-credit {
    color: var(--studio-success) !important;
  }

  html.product-studio-v3 .personal-balance-main .amount.is-debt {
    color: var(--studio-danger) !important;
  }

  html.product-studio-v3 .personal-balance-main p {
    margin: 0 !important;
    color: var(--studio-muted) !important;
    font-size: 14px !important;
  }

  html.product-studio-v3 .personal-balance-details {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    align-items: stretch !important;
  }

  html.product-studio-v3 .personal-balance-details > div {
    display: grid !important;
    align-content: center !important;
    gap: 8px !important;
    min-width: 0 !important;
    padding: 22px !important;
    border-inline-end: 1px solid var(--studio-line) !important;
  }

  html.product-studio-v3 .personal-balance-details > div:last-child {
    border-inline-end: 0 !important;
  }

  html.product-studio-v3 .personal-balance-details strong {
    color: var(--studio-ink) !important;
    font-size: 22px !important;
    font-weight: 760 !important;
  }

  html.product-studio-v3 .personal-next-step {
    grid-column: 1 / -1 !important;
    padding: 11px 16px !important;
    border-top: 1px solid var(--studio-line) !important;
    color: var(--studio-muted) !important;
    background: var(--studio-surface-subtle) !important;
    font-size: 12.5px !important;
  }

  html.product-studio-v3 .section {
    margin-top: 30px !important;
  }

  html.product-studio-v3 .section-title-row {
    align-items: end !important;
    margin-bottom: 12px !important;
  }

  html.product-studio-v3 .section-title-row h2 {
    font-size: 22px !important;
    font-weight: 780 !important;
  }

  html.product-studio-v3 .event-list {
    gap: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 12px !important;
    background: #ffffff !important;
  }

  html.product-studio-v3 .event-row {
    min-height: 96px !important;
    padding: 17px 19px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--studio-line) !important;
    border-radius: 0 !important;
    background: #ffffff !important;
  }

  html.product-studio-v3 .event-row:last-child {
    border-bottom: 0 !important;
  }

  html.product-studio-v3 .event-row:hover {
    border-color: var(--studio-line) !important;
    background: #fafcfb !important;
    transform: none !important;
  }

  html.product-studio-v3 .event-row-main strong {
    font-size: 17px !important;
    font-weight: 730 !important;
  }

  html.product-studio-v3 .event-row small,
  html.product-studio-v3 .event-row .opened-at {
    color: var(--studio-faint) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
  }

  html.product-studio-v3 .event-row-side .amount {
    color: var(--studio-ink) !important;
    font-size: 18px !important;
    font-weight: 760 !important;
  }

  html.product-studio-v3 .segmented-control {
    padding: 3px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 9px !important;
    background: #ffffff !important;
  }

  html.product-studio-v3 .segmented-control button {
    min-height: 38px !important;
    border-radius: 6px !important;
    color: var(--studio-muted) !important;
  }

  html.product-studio-v3 .segmented-control button.is-active {
    color: var(--studio-ink) !important;
    background: var(--studio-canvas-deep) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .empty-state {
    min-height: 160px !important;
    padding: 28px !important;
    border-style: dashed !important;
    border-radius: 12px !important;
    background: transparent !important;
    font-weight: 600 !important;
  }

  html.product-studio-v3 .event-start-panel {
    grid-template-columns: minmax(0, 1fr) 250px !important;
    gap: 22px !important;
    padding: 26px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 12px !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .event-start-copy h2 {
    font-size: 26px !important;
  }

  html.product-studio-v3 .event-start-primary {
    min-height: 56px !important;
    font-size: 16px !important;
  }

  html.product-studio-v3 .event-start-secondary {
    grid-column: 1 / -1 !important;
    margin-top: 0 !important;
  }

  html.product-studio-v3 .event-workspace-nav {
    position: sticky !important;
    top: 70px !important;
    gap: 2px !important;
    margin: 0 0 22px !important;
    padding: 4px !important;
    border-color: var(--studio-line) !important;
    border-radius: 10px !important;
    background: rgba(255, 255, 255, 0.96) !important;
    backdrop-filter: blur(8px) !important;
  }

  html.product-studio-v3 .event-workspace-tab {
    min-width: 98px !important;
    min-height: 40px !important;
    border-radius: 7px !important;
    font-size: 13px !important;
    font-weight: 650 !important;
  }

  html.product-studio-v3 .event-workspace-tab.is-active,
  html.product-studio-v3 .event-workspace-tab:hover {
    color: var(--studio-ink) !important;
    background: var(--studio-canvas-deep) !important;
  }

  html.product-studio-v3 .event-type-guide {
    display: none !important;
  }

  html.product-studio-v3 .event-insight-panel {
    grid-template-columns: 1fr !important;
    gap: 10px !important;
    margin: 0 0 24px !important;
    padding: 20px 0 !important;
    border: 0 !important;
    border-top: 1px solid var(--studio-line) !important;
    border-bottom: 1px solid var(--studio-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .event-insight-main > .primary-button,
  html.product-studio-v3 .event-insight-main > .secondary-button {
    display: none !important;
  }

  html.product-studio-v3 .event-insight-main h2 {
    margin: 8px 0 0 !important;
    font-size: 19px !important;
  }

  html.product-studio-v3 .event-insight-main p,
  html.product-studio-v3 .event-insight-metrics {
    display: none !important;
  }

  html.product-studio-v3 .event-insight-metrics {
    min-width: 340px !important;
    grid-template-columns: repeat(2, minmax(120px, 1fr)) !important;
    gap: 0 !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 10px !important;
    overflow: hidden !important;
  }

  html.product-studio-v3 .event-insight-metrics > div {
    padding: 13px !important;
    border: 0 !important;
    border-inline-end: 1px solid var(--studio-line) !important;
    border-bottom: 1px solid var(--studio-line) !important;
    background: #ffffff !important;
  }

  html.product-studio-v3 .event-command-grid {
    display: none !important;
  }

  html.product-studio-v3 .summary-strip {
    margin: 0 0 20px !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 10px !important;
    background: #ffffff !important;
  }

  html.product-studio-v3 .summary-item {
    min-height: 82px !important;
    padding: 15px 18px !important;
    border-inline-end: 1px solid var(--studio-line) !important;
    background: transparent !important;
  }

  html.product-studio-v3 .summary-item:last-child {
    border-inline-end: 0 !important;
  }

  html.product-studio-v3 .expense-row,
  html.product-studio-v3 .transfer-row,
  html.product-studio-v3 .balance-row,
  html.product-studio-v3 .group-row {
    min-height: 70px !important;
    border-color: var(--studio-line) !important;
    border-radius: 9px !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .expense-modal,
  html.product-studio-v3 .event-modal {
    width: min(100%, 700px) !important;
    padding: 26px !important;
    border-radius: 14px !important;
    background: #ffffff !important;
  }

  html.product-studio-v3 .expense-modal-header,
  html.product-studio-v3 .event-modal-header {
    margin-bottom: 20px !important;
    padding-bottom: 16px !important;
  }

  html.product-studio-v3 .expense-modal > .product-form-helper,
  html.product-studio-v3 .expense-modal-header .muted {
    display: none !important;
  }

  html.product-studio-v3 .expense-modal-header h2,
  html.product-studio-v3 .event-modal-header h2 {
    font-size: 25px !important;
  }

  html.product-studio-v3 .expense-total-field {
    margin: 4px 0 2px !important;
  }

  html.product-studio-v3 .expense-total-field > span {
    font-size: 13px !important;
  }

  html.product-studio-v3 .expense-total-field input {
    min-height: 68px !important;
    padding-inline: 16px !important;
    color: var(--studio-ink) !important;
    font-size: 30px !important;
    font-weight: 760 !important;
  }

  html.product-studio-v3 .expense-details-panel {
    margin-top: 16px !important;
    overflow: hidden !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 11px !important;
    background: var(--studio-surface-subtle) !important;
  }

  html.product-studio-v3 .expense-details-panel > summary {
    min-height: 68px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 16px !important;
    padding: 12px 14px !important;
    list-style: none !important;
    cursor: pointer !important;
    user-select: none !important;
    transition: background-color var(--studio-ease) !important;
  }

  html.product-studio-v3 .expense-details-panel > summary::-webkit-details-marker {
    display: none !important;
  }

  html.product-studio-v3 .expense-details-panel > summary:hover {
    background: var(--studio-primary-soft) !important;
  }

  html.product-studio-v3 .expense-details-panel > summary:focus-visible {
    outline: 3px solid rgba(8, 117, 107, 0.18) !important;
    outline-offset: -3px !important;
  }

  html.product-studio-v3 .expense-details-summary-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.product-studio-v3 .expense-details-summary-copy strong {
    color: var(--studio-ink) !important;
    font-size: 15px !important;
    line-height: 1.25 !important;
  }

  html.product-studio-v3 .expense-details-summary-copy small {
    display: -webkit-box !important;
    overflow: hidden !important;
    color: var(--studio-muted) !important;
    font-size: 12.5px !important;
    font-weight: 620 !important;
    line-height: 1.35 !important;
    white-space: normal !important;
    -webkit-box-orient: vertical !important;
    -webkit-line-clamp: 2 !important;
  }

  html.product-studio-v3 .expense-details-toggle {
    min-width: 54px !important;
    min-height: 36px !important;
    display: grid !important;
    place-items: center !important;
    flex: 0 0 auto !important;
    padding-inline: 9px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 8px !important;
    color: var(--studio-primary-deep) !important;
    background: var(--studio-surface) !important;
    font-size: 12px !important;
    font-weight: 760 !important;
  }

  html.product-studio-v3 .expense-details-toggle-open,
  html.product-studio-v3 .expense-details-panel[open] .expense-details-toggle-closed {
    display: none !important;
  }

  html.product-studio-v3 .expense-details-panel[open] .expense-details-toggle-open {
    display: inline !important;
  }

  html.product-studio-v3 .expense-details-panel[open] > summary {
    border-bottom: 1px solid var(--studio-line) !important;
    background: var(--studio-surface) !important;
  }

  html.product-studio-v3 .expense-details-body {
    padding: 16px !important;
  }

  html.product-studio-v3 .expense-details-body > .section {
    margin-top: 18px !important;
    padding: 18px 0 0 !important;
    border-top: 1px solid var(--studio-line) !important;
  }

  html.product-studio-v3 .expense-details-body > .section h3 {
    margin-bottom: 12px !important;
    font-size: 17px !important;
  }

  html.product-studio-v3 .expense-modal-actions {
    position: sticky !important;
    bottom: -26px !important;
    z-index: 4 !important;
    margin: 24px -26px -26px !important;
    padding: 14px 26px calc(14px + env(safe-area-inset-bottom)) !important;
    border-top: 1px solid var(--studio-line) !important;
    background: rgba(255, 255, 255, 0.96) !important;
    backdrop-filter: none !important;
  }

  html.product-studio-v3 .participant-pill {
    min-height: 46px !important;
    border-radius: 9px !important;
  }

  html.product-studio-v3 .account-auth-gate {
    direction: rtl !important;
    padding: 24px !important;
    background: var(--studio-canvas) !important;
  }

  html.product-studio-v3 .account-auth-shell {
    width: min(100%, 920px) !important;
    min-height: 560px !important;
    grid-template-columns: minmax(0, 1fr) 410px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 14px !important;
    background: #ffffff !important;
    box-shadow: var(--studio-shadow-float) !important;
  }

  html.product-studio-v3 .account-auth-brand {
    align-content: center !important;
    gap: 28px !important;
    padding: 44px !important;
    color: var(--studio-ink) !important;
    background: var(--studio-surface-subtle) !important;
    border-inline-end: 1px solid var(--studio-line) !important;
  }

  html.product-studio-v3 .account-auth-mark {
    width: 52px !important;
    height: 52px !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 13px !important;
    color: transparent !important;
    background: var(--studio-primary-deep) url("./icon.svg") center / cover no-repeat !important;
    box-shadow: var(--studio-shadow-control) !important;
  }

  html.product-studio-v3 #public-account-auth-gate .account-auth-brand h1 {
    max-width: 15ch !important;
    margin: 10px 0 12px !important;
    color: var(--studio-ink) !important;
    font-size: 36px !important;
    font-weight: 800 !important;
    line-height: 1.14 !important;
  }

  html.product-studio-v3 #public-account-auth-gate .account-auth-brand .eyebrow {
    color: var(--studio-primary) !important;
  }

  html.product-studio-v3 #public-account-auth-gate .account-auth-brand p,
  html.product-studio-v3 .account-auth-brand ul {
    color: var(--studio-muted) !important;
  }

  html.product-studio-v3 .account-auth-brand li::before {
    color: var(--studio-primary) !important;
  }

  html.product-studio-v3 .account-auth-form-panel {
    gap: 18px !important;
    padding: 38px !important;
  }

  html.product-studio-v3 .account-auth-tabs {
    border-color: var(--studio-line) !important;
    border-radius: 9px !important;
    background: var(--studio-canvas-deep) !important;
  }

  html.product-studio-v3 .account-auth-tabs button {
    border-radius: 6px !important;
  }

  html.product-studio-v3 .account-auth-tabs button.is-active {
    color: var(--studio-ink) !important;
    box-shadow: var(--studio-shadow-control) !important;
  }

  html.product-studio-v3 .account-auth-heading h2 {
    font-size: 26px !important;
  }

  html.product-studio-v3 .account-auth-form input,
  html.product-studio-v3 .account-google-button {
    border-color: var(--studio-line-strong) !important;
    border-radius: 9px !important;
  }

  html.product-studio-v3 .account-auth-submit {
    min-height: 50px !important;
    border-radius: 9px !important;
  }

  html.product-studio-v3 .account-auth-legal a {
    min-height: 40px !important;
    display: inline-flex !important;
    align-items: center !important;
    padding-inline: 3px !important;
  }

  /* Visual polish v4: clearer depth, one committed financial focal surface. */
  html.product-studio-v3 body {
    color: var(--studio-ink) !important;
    background: #f3f6f5 !important;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  html.product-studio-v3 h1,
  html.product-studio-v3 h2,
  html.product-studio-v3 h3 {
    text-wrap: balance;
  }

  html.product-studio-v3 p,
  html.product-studio-v3 small {
    text-wrap: pretty;
  }

  html.product-studio-v3 button,
  html.product-studio-v3 a,
  html.product-studio-v3 input,
  html.product-studio-v3 select,
  html.product-studio-v3 textarea {
    transition-property: color, background-color, border-color, box-shadow, opacity, transform !important;
    transition-duration: 180ms !important;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html.product-studio-v3 .screen {
    width: min(100%, 1060px) !important;
  }

  html.product-studio-v3 .product-app-identity {
    position: sticky !important;
    inset-block-start: 0 !important;
    z-index: 70 !important;
    min-height: 72px !important;
    margin-bottom: 18px !important;
    background: rgba(243, 246, 245, 0.97) !important;
  }

  html.product-studio-v3 .product-brand-mark,
  html.product-studio-v3.product-v1 .product-app-identity .product-brand-mark,
  html.product-studio-v3.product-v1-live .product-app-identity .product-brand-mark {
    box-shadow:
      0 1px 2px rgba(9, 35, 31, 0.12),
      0 5px 12px rgba(9, 35, 31, 0.1) !important;
  }

  html.product-studio-v3 .product-app-nav {
    gap: 4px !important;
  }

  html.product-studio-v3 .product-nav-button {
    color: #53615c !important;
  }

  html.product-studio-v3 .product-nav-button svg {
    stroke-width: 1.8 !important;
  }

  html.product-studio-v3 .product-nav-button:hover,
  html.product-studio-v3 .product-nav-button[aria-current="page"] {
    color: var(--studio-primary-deep) !important;
    background: #ffffff !important;
  }

  html.product-studio-v3 .screen > .top,
  html.product-studio-v3 .screen[data-product-screen="home"] > .top,
  html.product-studio-v3 .product-home-screen > .top {
    margin-bottom: 28px !important;
    padding-block: 24px 28px !important;
  }

  html.product-studio-v3 .screen > .top h1,
  html.product-studio-v3 .screen[data-product-screen="home"] > .top h1,
  html.product-studio-v3 .product-home-screen > .top h1 {
    color: #111916 !important;
    font-weight: 800 !important;
  }

  html.product-studio-v3 .primary-button {
    background: #08786d !important;
    box-shadow:
      0 1px 2px rgba(5, 50, 44, 0.18),
      0 5px 10px rgba(5, 50, 44, 0.1) !important;
  }

  html.product-studio-v3 .primary-button:hover:not(:disabled) {
    background: #076b61 !important;
    box-shadow:
      0 2px 3px rgba(5, 50, 44, 0.18),
      0 7px 14px rgba(5, 50, 44, 0.12) !important;
    transform: translateY(-1px) !important;
  }

  html.product-studio-v3 .secondary-button:hover:not(:disabled) {
    color: var(--studio-primary-deep) !important;
    border-color: #b6cbc5 !important;
    background: #f8fbfa !important;
  }

  html.product-studio-v3 button:active:not(:disabled) {
    transform: scale(0.96) !important;
  }

  html.product-studio-v3 .personal-dashboard,
  html.product-studio-v3 .product-home-screen .personal-dashboard,
  html.product-studio-v3 .screen[data-product-screen="home"] .personal-dashboard {
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 14px !important;
    box-shadow:
      0 1px 2px rgba(17, 28, 24, 0.08),
      0 10px 26px rgba(17, 28, 24, 0.08) !important;
  }

  html.product-studio-v3 .personal-balance-main {
    position: relative !important;
    isolation: isolate !important;
    min-height: 176px !important;
    overflow: hidden !important;
    border: 0 !important;
    color: #ffffff !important;
    background: #0b5f57 !important;
  }

  html.product-studio-v3 .personal-balance-main::after {
    content: none !important;
    display: none !important;
  }

  html.product-studio-v3 .personal-balance-main > span {
    color: rgba(255, 255, 255, 0.76) !important;
  }

  html.product-studio-v3 .personal-balance-main .amount,
  html.product-studio-v3 .personal-balance-main .amount.is-credit {
    color: #ffffff !important;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.12) !important;
  }

  html.product-studio-v3 .personal-balance-main .amount.is-debt {
    color: #ffd7cf !important;
  }

  html.product-studio-v3 .personal-balance-main p {
    color: rgba(255, 255, 255, 0.82) !important;
  }

  html.product-studio-v3 .personal-balance-details {
    background: #ffffff !important;
  }

  html.product-studio-v3 .personal-balance-details > div {
    border-color: #e5eae7 !important;
  }

  html.product-studio-v3 .personal-balance-details strong {
    font-variant-numeric: tabular-nums !important;
  }

  html.product-studio-v3 .personal-next-step {
    color: #145c53 !important;
    border-color: #d6e6e1 !important;
    background: #eaf4f1 !important;
    font-weight: 700 !important;
  }

  html.product-studio-v3 .personal-action-list {
    gap: 10px !important;
  }

  html.product-studio-v3 .personal-action-card,
  html.product-studio-v3 .public-personal-action-card {
    min-height: 76px !important;
    padding: 16px 18px !important;
    border-color: #dbe6e2 !important;
    border-radius: 11px !important;
    background: #f9fcfb !important;
  }

  html.product-studio-v3 .personal-action-card:hover,
  html.product-studio-v3 .public-personal-action-card:hover {
    border-color: #bdd6cf !important;
    background: #f1f8f6 !important;
    transform: translateY(-1px) !important;
  }

  html.product-studio-v3 .personal-action-card .amount,
  html.product-studio-v3 .public-personal-action-card .amount {
    color: var(--studio-primary-deep) !important;
    font-size: 18px !important;
    font-weight: 800 !important;
  }

  html.product-studio-v3 .section-title-row h2 {
    color: #17211d !important;
    font-size: 23px !important;
  }

  html.product-studio-v3 .segmented-control {
    padding: 4px !important;
    border: 0 !important;
    background: #e9eeec !important;
  }

  html.product-studio-v3 .segmented-control button.is-active {
    color: var(--studio-primary-deep) !important;
    background: #ffffff !important;
    box-shadow: 0 1px 3px rgba(17, 28, 24, 0.12) !important;
  }

  html.product-studio-v3 .event-list {
    border: 0 !important;
    box-shadow:
      0 1px 2px rgba(17, 28, 24, 0.07),
      0 7px 18px rgba(17, 28, 24, 0.055) !important;
  }

  html.product-studio-v3 .event-row {
    min-height: 102px !important;
    padding: 18px 20px !important;
    border-color: #e7ebe9 !important;
  }

  html.product-studio-v3 .event-row:hover {
    background: #f7fbf9 !important;
  }

  html.product-studio-v3 .event-row-title {
    gap: 9px !important;
  }

  html.product-studio-v3 .event-row-main strong {
    color: #17211d !important;
    font-size: 18px !important;
  }

  html.product-studio-v3 .event-type-chip {
    min-height: 24px !important;
    padding-inline: 8px !important;
    border-color: #d6e5e0 !important;
    color: #38635b !important;
    background: #eef6f3 !important;
    font-size: 11px !important;
  }

  html.product-studio-v3 .event-row-side .amount {
    font-size: 19px !important;
    font-weight: 800 !important;
  }

  html.product-studio-v3 .status-chip {
    min-height: 25px !important;
    padding-inline: 9px !important;
    border-radius: 999px !important;
    font-size: 11px !important;
    font-weight: 750 !important;
  }

  html.product-studio-v3 .summary-strip {
    border: 0 !important;
    border-radius: 12px !important;
    box-shadow:
      0 1px 2px rgba(17, 28, 24, 0.07),
      0 7px 18px rgba(17, 28, 24, 0.055) !important;
  }

  html.product-studio-v3 .summary-item {
    min-height: 88px !important;
    border-color: #e6ebe8 !important;
    background: #ffffff !important;
  }

  html.product-studio-v3 .summary-item:first-child {
    background: #edf6f3 !important;
  }

  html.product-studio-v3 .summary-item:first-child strong {
    color: var(--studio-primary-deep) !important;
  }

  html.product-studio-v3 .event-workspace-nav {
    border: 0 !important;
    background: rgba(255, 255, 255, 0.97) !important;
    box-shadow: 0 2px 8px rgba(17, 28, 24, 0.08) !important;
  }

  html.product-studio-v3 .event-workspace-tab {
    color: #596660 !important;
  }

  html.product-studio-v3 .event-workspace-tab.is-active,
  html.product-studio-v3 .event-workspace-tab:hover {
    color: var(--studio-primary-deep) !important;
    background: #eaf4f1 !important;
  }

  html.product-studio-v3 .event-insight-panel {
    gap: 8px !important;
    margin-bottom: 26px !important;
    padding: 15px 17px !important;
    border: 0 !important;
    border-radius: 11px !important;
    background: #eaf4f1 !important;
  }

  html.product-studio-v3 .event-insight-main {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    min-width: 0 !important;
  }

  html.product-studio-v3 .event-insight-main h2 {
    min-width: 0 !important;
    margin: 0 !important;
    color: #174f48 !important;
    font-size: 17px !important;
  }

  html.product-studio-v3 .event-insight-main .status-chip {
    flex: 0 0 auto !important;
    color: #ffffff !important;
    border: 0 !important;
    background: #28766b !important;
  }

  html.product-studio-v3 .expense-row,
  html.product-studio-v3 .transfer-row,
  html.product-studio-v3 .balance-row,
  html.product-studio-v3 .group-row {
    border: 0 !important;
    border-radius: 10px !important;
    background: #ffffff !important;
    box-shadow: 0 1px 4px rgba(17, 28, 24, 0.09) !important;
  }

  html.product-studio-v3 .expense-row:hover,
  html.product-studio-v3 .group-row:hover {
    background: #f9fbfa !important;
    box-shadow: 0 2px 7px rgba(17, 28, 24, 0.11) !important;
  }

  html.product-studio-v3 input,
  html.product-studio-v3 select,
  html.product-studio-v3 textarea {
    min-height: 48px !important;
    border-color: #cbd6d1 !important;
    border-radius: 9px !important;
    color: #17211d !important;
    background: #ffffff !important;
    box-shadow: 0 1px 2px rgba(17, 28, 24, 0.04) !important;
  }

  html.product-studio-v3 input::placeholder,
  html.product-studio-v3 textarea::placeholder {
    color: #67736e !important;
  }

  html.product-studio-v3 input:focus,
  html.product-studio-v3 select:focus,
  html.product-studio-v3 textarea:focus {
    border-color: #4b968c !important;
    box-shadow: 0 0 0 3px rgba(8, 120, 109, 0.13) !important;
  }

  html.product-studio-v3 .expense-modal,
  html.product-studio-v3 .event-modal {
    box-shadow:
      0 4px 12px rgba(17, 28, 24, 0.1),
      0 24px 56px rgba(17, 28, 24, 0.18) !important;
  }

  html.product-studio-v3 .expense-total-field {
    padding: 16px !important;
    border-radius: 11px !important;
    background: #edf6f3 !important;
  }

  html.product-studio-v3 .expense-total-field input {
    border-color: #9fc6bd !important;
    background: #ffffff !important;
  }

  html.product-studio-v3 .expense-template-grid .secondary-button {
    color: #315d55 !important;
    border-color: #d4e3df !important;
    background: #f5faf8 !important;
  }

  html.product-studio-v3 .account-auth-shell {
    box-shadow:
      0 2px 8px rgba(17, 28, 24, 0.08),
      0 22px 50px rgba(17, 28, 24, 0.12) !important;
  }

  @media (max-width: 760px) {
    html.product-studio-v3 .screen {
      padding: 0 15px calc(108px + env(safe-area-inset-bottom)) !important;
    }

    html.product-studio-v3 body:has(.screen[data-product-screen="new-event"]),
    html.product-studio-v3 body:has(.screen[data-product-screen="join-event"]) {
      padding-bottom: 0 !important;
    }

    html.product-studio-v3 .screen[data-product-screen="new-event"],
    html.product-studio-v3 .screen[data-product-screen="join-event"] {
      min-height: 100dvh !important;
      padding-bottom: calc(36px + env(safe-area-inset-bottom)) !important;
    }

    html.product-studio-v3 .screen[data-product-screen="new-event"] .product-app-nav,
    html.product-studio-v3 .screen[data-product-screen="join-event"] .product-app-nav {
      display: none !important;
    }

    html.product-studio-v3 .product-app-identity {
      min-height: 62px !important;
      margin-bottom: 8px !important;
      padding: calc(8px + env(safe-area-inset-top)) 2px 8px !important;
      background: rgba(243, 246, 245, 0.98) !important;
      backdrop-filter: none !important;
    }

    html.product-studio-v3 .product-brand-mark,
    html.product-studio-v3.product-v1 .product-app-identity .product-brand-mark,
    html.product-studio-v3.product-v1-live .product-app-identity .product-brand-mark {
      width: 38px !important;
      min-width: 38px !important;
      height: 38px !important;
      border-radius: 10px !important;
    }

    html.product-studio-v3 .product-brand-copy strong {
      font-size: 20px !important;
    }

    html.product-studio-v3 .product-brand-copy small {
      display: none !important;
    }

    html.product-studio-v3 .product-app-nav {
      inset-inline: 10px !important;
      inset-block-end: calc(8px + env(safe-area-inset-bottom)) !important;
      width: auto !important;
      height: 64px !important;
      padding: 5px !important;
      border: 0 !important;
      border-radius: 14px !important;
      background: rgba(255, 255, 255, 0.97) !important;
      box-shadow:
        0 2px 5px rgba(17, 28, 24, 0.1),
        0 12px 28px rgba(17, 28, 24, 0.13) !important;
      backdrop-filter: blur(14px) !important;
    }

    html.product-studio-v3 .product-nav-button {
      min-height: 52px !important;
      border-radius: 10px !important;
      color: #5b6762 !important;
      font-size: 11.5px !important;
    }

    html.product-studio-v3 .product-nav-button[aria-current="page"] {
      color: var(--studio-primary-deep) !important;
      background: #eaf4f1 !important;
      box-shadow: none !important;
    }

    html.product-studio-v3 .screen > .top,
    html.product-studio-v3 .screen[data-product-screen="home"] > .top,
    html.product-studio-v3 .product-home-screen > .top {
      grid-template-columns: 1fr !important;
      gap: 20px !important;
      margin-bottom: 22px !important;
      padding: 26px 0 24px !important;
    }

    html.product-studio-v3 .screen > .top .brand,
    html.product-studio-v3 .screen[data-product-screen="home"] > .top .brand,
    html.product-studio-v3 .product-home-screen > .top .brand {
      grid-column: 1 !important;
      padding-inline-start: 50px !important;
    }

    html.product-studio-v3 .screen[data-product-screen="home"] > .top .brand,
    html.product-studio-v3 .product-home-screen > .top .brand {
      padding-inline-start: 0 !important;
    }

    html.product-studio-v3 .screen > .top h1,
    html.product-studio-v3 .screen[data-product-screen="home"] > .top h1,
    html.product-studio-v3 .product-home-screen > .top h1 {
      max-width: 18ch !important;
      font-size: 31px !important;
      line-height: 1.16 !important;
    }

    html.product-studio-v3 .event-creation-progress {
      width: 100% !important;
      margin: -8px 0 16px !important;
    }

    html.product-studio-v3 .event-creation-progress li {
      min-height: 46px !important;
      gap: 8px !important;
      padding: 7px 9px !important;
    }

    html.product-studio-v3 .event-creation-progress li > span {
      width: 26px !important;
      height: 26px !important;
      flex-basis: 26px !important;
    }

    html.product-studio-v3 .screen > .top .hero-actions,
    html.product-studio-v3 .screen[data-product-screen="home"] > .top .hero-actions,
    html.product-studio-v3 .product-home-screen > .top .hero-actions {
      grid-column: 1 !important;
      grid-row: 2 !important;
      width: 100% !important;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
    }

    html.product-studio-v3 .screen > .top .hero-actions .primary-button,
    html.product-studio-v3 .screen > .top .hero-actions .secondary-button {
      width: 100% !important;
      min-width: 0 !important;
    }

    html.product-studio-v3 .screen > .top .app-back-button {
      inset-block-start: 24px !important;
    }

    html.product-studio-v3 .personal-dashboard,
    html.product-studio-v3 .product-home-screen .personal-dashboard,
    html.product-studio-v3 .screen[data-product-screen="home"] .personal-dashboard {
      grid-template-columns: 1fr !important;
      margin-bottom: 28px !important;
    }

    html.product-studio-v3 .personal-balance-main {
      min-height: 150px !important;
      padding: 23px !important;
      border-inline-end: 0 !important;
      border-bottom: 0 !important;
    }

    html.product-studio-v3 .personal-balance-main .amount {
      font-size: 38px !important;
    }

    html.product-studio-v3 .personal-balance-details > div {
      padding: 15px 12px !important;
    }

    html.product-studio-v3 .personal-balance-details strong {
      font-size: 17px !important;
    }

    html.product-studio-v3 .section-title-row {
      align-items: start !important;
      gap: 12px !important;
    }

    html.product-studio-v3 .segmented-control {
      width: 100% !important;
    }

    html.product-studio-v3 .event-row {
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 12px !important;
      min-height: 102px !important;
      padding: 16px !important;
    }

    html.product-studio-v3 .event-row .avatar-stack {
      display: none !important;
    }

    html.product-studio-v3 .event-row-side {
      display: grid !important;
      grid-template-columns: 1fr !important;
      justify-items: end !important;
    }

    html.product-studio-v3 .event-start-panel {
      grid-template-columns: 1fr !important;
      padding: 20px !important;
    }

    html.product-studio-v3 .event-start-primary,
    html.product-studio-v3 .event-start-secondary {
      grid-column: 1 !important;
    }

    html.product-studio-v3 .event-start-secondary {
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    }

    html.product-studio-v3 .event-workspace-nav {
      top: 62px !important;
      margin-inline: -15px !important;
      padding-inline: 15px !important;
      overflow-x: auto !important;
      border-inline: 0 !important;
      border-radius: 0 !important;
      box-shadow: 0 3px 8px rgba(17, 28, 24, 0.08) !important;
    }

    html.product-studio-v3 .event-workspace-tab {
      min-width: 88px !important;
    }

    html.product-studio-v3 .summary-strip {
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    }

    html.product-studio-v3 .product-event-screen > .top .hero-actions {
      grid-template-columns: 1fr !important;
    }

    html.product-studio-v3 .product-event-screen > .top .hero-actions .primary-button,
    html.product-studio-v3 .product-event-screen > .top .hero-actions .secondary-button {
      min-height: 52px !important;
    }

    html.product-studio-v3 .product-event-screen .summary-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    html.product-studio-v3 .product-event-screen .summary-item:first-child {
      grid-column: 1 / -1 !important;
      min-height: 78px !important;
      border-inline-end: 0 !important;
      border-bottom: 1px solid var(--studio-line) !important;
    }

    html.product-studio-v3 .summary-item {
      min-height: 72px !important;
      padding: 12px 9px !important;
    }

    html.product-studio-v3 .expense-modal-backdrop,
    html.product-studio-v3 .event-modal-backdrop {
      background: #ffffff !important;
    }

    html.product-studio-v3 .expense-modal,
    html.product-studio-v3 .event-modal {
      padding: 18px !important;
      background: #ffffff !important;
      box-shadow: none !important;
    }

    html.product-studio-v3 .expense-modal-header,
    html.product-studio-v3 .event-modal-header {
      margin: -18px -18px 18px !important;
      padding: calc(14px + env(safe-area-inset-top)) 18px 14px !important;
    }

    html.product-studio-v3 .expense-modal-actions {
      bottom: -18px !important;
      margin: 24px -18px -18px !important;
      padding-inline: 18px !important;
    }

    html.product-studio-v3 .expense-total-field input {
      min-height: 64px !important;
      font-size: 28px !important;
    }

    html.product-studio-v3 .expense-details-panel > summary {
      min-height: 64px !important;
      gap: 10px !important;
      padding: 11px 12px !important;
    }

    html.product-studio-v3 .expense-details-summary-copy small {
      max-width: calc(100vw - 138px) !important;
    }

    html.product-studio-v3 .expense-details-body {
      padding: 14px !important;
    }

    html.product-studio-v3 .event-insight-main {
      align-items: flex-start !important;
    }

    html.product-studio-v3 .event-insight-main h2 {
      padding-top: 2px !important;
      line-height: 1.35 !important;
    }

    html.product-studio-v3 .account-auth-gate {
      padding: 0 !important;
      background: #ffffff !important;
    }

    html.product-studio-v3 .account-auth-shell {
      min-height: 100dvh !important;
      grid-template-columns: 1fr !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    html.product-studio-v3 .account-auth-brand {
      min-height: 0 !important;
      gap: 14px !important;
      padding: calc(22px + env(safe-area-inset-top)) 20px 20px !important;
      border-inline-end: 0 !important;
      border-bottom: 1px solid var(--studio-line) !important;
      background: var(--studio-surface-subtle) !important;
    }

    html.product-studio-v3 #public-account-auth-gate .account-auth-brand h1 {
      max-width: none !important;
      margin: 6px 0 0 !important;
      font-size: 27px !important;
    }

    html.product-studio-v3 #public-account-auth-gate .account-auth-brand p,
    html.product-studio-v3 .account-auth-brand ul {
      display: none !important;
    }

    html.product-studio-v3 .account-auth-form-panel {
      padding: 24px 20px calc(28px + env(safe-area-inset-bottom)) !important;
    }
  }

  @media (max-width: 430px) {
    html.product-studio-v3 .personal-balance-details {
      grid-template-columns: 1fr 1fr !important;
    }

    html.product-studio-v3 .personal-balance-details > div:first-child {
      grid-column: 1 / -1 !important;
      border-inline-end: 0 !important;
      border-bottom: 1px solid var(--studio-line) !important;
    }

    html.product-studio-v3 .event-start-secondary {
      grid-template-columns: 1fr !important;
    }

  }

  /* Ledger visual system v5: task-first, restrained, and financially semantic. */
  html.product-studio-v3 {
    --studio-canvas: #fafaf8;
    --studio-canvas-deep: #f3f5f4;
    --studio-surface: #ffffff;
    --studio-surface-subtle: #f7f8f7;
    --studio-surface-active: #e8f2f0;
    --studio-ink: #1b1f1e;
    --studio-muted: #5f6a67;
    --studio-faint: #75807c;
    --studio-line: #e2e6e4;
    --studio-line-strong: #cbd2cf;
    --studio-primary: #087b74;
    --studio-primary-deep: #06635d;
    --studio-primary-dark: #054c48;
    --studio-primary-soft: #e8f2f0;
    --studio-coral: #e4573d;
    --studio-coral-soft: #fceeea;
    --studio-radius-sm: 8px;
    --studio-radius: 10px;
    --studio-radius-lg: 12px;
    --studio-shadow-control: none;
    --studio-shadow-panel: none;
    --studio-shadow-float: 0 12px 32px rgba(20, 24, 23, 0.12);
    --studio-ease: 180ms cubic-bezier(0.2, 0, 0, 1);
    color: var(--studio-ink);
    background: var(--studio-canvas);
  }

  html.product-studio-v3 body,
  html.product-studio-v3 button,
  html.product-studio-v3 input,
  html.product-studio-v3 select,
  html.product-studio-v3 textarea {
    font-family: "Noto Sans Hebrew", "Heebo", system-ui, sans-serif !important;
  }

  html.product-studio-v3 body {
    background: var(--studio-canvas) !important;
  }

  html.product-studio-v3 button,
  html.product-studio-v3 a,
  html.product-studio-v3 [role="button"] {
    touch-action: manipulation !important;
    -webkit-tap-highlight-color: rgba(8, 123, 116, 0.12);
  }

  html.product-studio-v3 h1,
  html.product-studio-v3 h2,
  html.product-studio-v3 h3,
  html.product-studio-v3 [id] {
    scroll-margin-top: 82px;
  }

  html.product-studio-v3 .screen {
    width: min(100%, 920px) !important;
    padding: 0 24px 88px !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"],
  html.product-studio-v3 .product-home-screen {
    width: min(100%, 760px) !important;
  }

  html.product-studio-v3 .product-app-identity {
    min-height: 58px !important;
    gap: 18px !important;
    margin: 0 0 24px !important;
    padding: 8px 0 !important;
    border-bottom: 1px solid var(--studio-line) !important;
    background: rgba(250, 250, 248, 0.97) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  html.product-studio-v3 .product-brand-lockup {
    gap: 9px !important;
  }

  html.product-studio-v3 .product-brand-mark,
  html.product-studio-v3.product-v1 .product-app-identity .product-brand-mark,
  html.product-studio-v3.product-v1-live .product-app-identity .product-brand-mark {
    width: 38px !important;
    min-width: 38px !important;
    height: 38px !important;
    border-radius: 8px !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .product-brand-copy {
    display: block !important;
  }

  html.product-studio-v3 .product-brand-copy strong {
    font-size: 17px !important;
    font-weight: 700 !important;
    line-height: 1.15 !important;
  }

  html.product-studio-v3 .product-brand-copy small {
    display: none !important;
  }

  html.product-studio-v3 .product-app-nav {
    gap: 2px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.product-studio-v3 .product-nav-button {
    min-height: 40px !important;
    gap: 7px !important;
    padding: 0 10px !important;
    border: 0 !important;
    border-radius: 8px !important;
    color: var(--studio-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 13px !important;
    font-weight: 600 !important;
  }

  html.product-studio-v3 .product-nav-button:hover,
  html.product-studio-v3 .product-nav-button[aria-current="page"] {
    color: var(--studio-primary-deep) !important;
    background: var(--studio-primary-soft) !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top,
  html.product-studio-v3 .product-home-screen > .top {
    min-height: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    grid-template-rows: auto !important;
    align-items: end !important;
    gap: 24px !important;
    margin: 0 0 32px !important;
    padding: 20px 0 32px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--studio-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top::before,
  html.product-studio-v3 .screen[data-product-screen="home"] > .top::after,
  html.product-studio-v3 .product-home-screen > .top::before,
  html.product-studio-v3 .product-home-screen > .top::after {
    content: none !important;
    display: none !important;
    background: none !important;
  }

  html.product-studio-v3 .studio-home-hero-image {
    display: none !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top .brand,
  html.product-studio-v3 .product-home-screen > .top .brand {
    grid-column: 1 !important;
    grid-row: 1 !important;
    max-width: none !important;
    display: grid !important;
    gap: 5px !important;
    padding: 0 !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top .brand .eyebrow,
  html.product-studio-v3 .product-home-screen > .top .brand .eyebrow {
    margin: 0 !important;
    color: var(--studio-muted) !important;
    font-size: 15px !important;
    font-weight: 500 !important;
    line-height: 1.45 !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top .muted,
  html.product-studio-v3 .product-home-screen > .top .muted,
  html.product-studio-v3 .product-home-screen .product-hero-note {
    display: none !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top h1,
  html.product-studio-v3 .product-home-screen > .top h1 {
    display: block !important;
    margin: 0 !important;
    color: var(--studio-ink) !important;
    font-size: 28px !important;
    font-weight: 700 !important;
    line-height: 1.3 !important;
  }

  html.product-studio-v3 .screen[data-product-screen="home"] > .top .hero-actions,
  html.product-studio-v3 .product-home-screen > .top .hero-actions {
    grid-column: 2 !important;
    grid-row: 1 !important;
    justify-self: start !important;
    align-self: end !important;
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 12px !important;
  }

  html.product-studio-v3 .primary-button,
  html.product-studio-v3 .secondary-button,
  html.product-studio-v3 .danger-button {
    min-height: 48px !important;
    padding-inline: 18px !important;
    border-radius: 8px !important;
    box-shadow: none !important;
    font-size: 15px !important;
    font-weight: 650 !important;
  }

  html.product-studio-v3 .primary-button {
    border-color: var(--studio-primary) !important;
    background: var(--studio-primary) !important;
  }

  html.product-studio-v3 .primary-button:hover:not(:disabled) {
    border-color: var(--studio-primary-deep) !important;
    background: var(--studio-primary-deep) !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.product-studio-v3 .secondary-button {
    color: var(--studio-ink) !important;
    border-color: var(--studio-line-strong) !important;
    background: var(--studio-surface) !important;
  }

  html.product-studio-v3 .secondary-button:hover:not(:disabled) {
    color: var(--studio-primary-deep) !important;
    border-color: #9ab8b2 !important;
    background: var(--studio-primary-soft) !important;
    transform: none !important;
  }

  html.product-studio-v3 .product-empty-home .home-empty-events {
    margin-top: 0 !important;
    padding-top: 30px !important;
    border-top: 1px solid var(--studio-line) !important;
  }

  html.product-studio-v3 .product-empty-home .home-empty-events .section-title-row {
    display: none !important;
  }

  html.product-studio-v3 .product-empty-home .home-empty-events .empty-state {
    min-height: 140px !important;
    gap: 10px !important;
    padding: 28px 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--studio-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 15px !important;
    font-weight: 500 !important;
  }

  html.product-studio-v3 .product-empty-home .product-empty-icon {
    width: 28px !important;
    height: 28px !important;
    border-radius: 0 !important;
    color: var(--studio-muted) !important;
    background: transparent !important;
  }

  html.product-studio-v3 .recent-event-shortcut {
    gap: 18px !important;
    margin: 0 0 28px !important;
    padding: 18px 20px !important;
    border: 1px solid #cbdedb !important;
    border-radius: 10px !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .recent-event-main strong {
    color: var(--studio-ink) !important;
    font-size: 20px !important;
    font-weight: 700 !important;
  }

  html.product-studio-v3 .recent-event-eyebrow {
    color: var(--studio-primary-deep) !important;
    font-size: 12px !important;
    font-weight: 650 !important;
  }

  html.product-studio-v3 .recent-event-balance {
    color: var(--studio-muted) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
  }

  html.product-studio-v3 .screen:has(.recent-event-shortcut) .personal-dashboard {
    display: none !important;
  }

  html.product-studio-v3 .section {
    margin-top: 32px !important;
  }

  html.product-studio-v3 .section-title-row {
    align-items: center !important;
    margin-bottom: 12px !important;
  }

  html.product-studio-v3 .section-title-row h2 {
    margin: 0 !important;
    color: var(--studio-ink) !important;
    font-size: 17px !important;
    font-weight: 650 !important;
  }

  html.product-studio-v3 .section-title-row .muted {
    color: var(--studio-muted) !important;
    font-size: 13px !important;
  }

  html.product-studio-v3 .event-list {
    gap: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 10px !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .event-row {
    min-height: 76px !important;
    padding: 14px 16px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--studio-line) !important;
    border-radius: 0 !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .event-row:last-child {
    border-bottom: 0 !important;
  }

  html.product-studio-v3 .event-row:hover {
    background: var(--studio-surface-subtle) !important;
    transform: none !important;
  }

  html.product-studio-v3 .event-row-main strong {
    font-size: 15px !important;
    font-weight: 650 !important;
  }

  html.product-studio-v3 .event-row-side .amount,
  html.product-studio-v3 .amount,
  html.product-studio-v3 input[type="number"],
  html.product-studio-v3 input[inputmode="decimal"] {
    font-variant-numeric: tabular-nums !important;
  }

  html.product-studio-v3 .screen:not([data-product-screen="home"]):not(.product-home-screen) > .top {
    min-height: 0 !important;
    gap: 8px 16px !important;
    margin: 0 0 24px !important;
    padding: 10px 0 22px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--studio-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .screen > .top h1 {
    margin: 0 !important;
    color: var(--studio-ink) !important;
    font-size: 28px !important;
    font-weight: 700 !important;
    line-height: 1.3 !important;
  }

  html.product-studio-v3 .screen > .top .eyebrow,
  html.product-studio-v3 .screen > .top .opened-at {
    color: var(--studio-muted) !important;
    font-size: 13px !important;
    font-weight: 500 !important;
  }

  html.product-studio-v3 .summary-strip,
  html.product-studio-v3 .product-event-screen .summary-strip {
    margin: 0 0 24px !important;
    overflow: hidden !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 10px !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .product-event-screen > .top .event-header-actions [data-action="settle"] {
    display: none !important;
  }

  html.product-studio-v3 .product-event-screen .summary-strip {
    display: flex !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
    gap: 32px !important;
    padding: 12px 0 !important;
    border-inline: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.product-studio-v3 .summary-item,
  html.product-studio-v3 .summary-item:first-child {
    min-height: 76px !important;
    padding: 14px 16px !important;
    border-color: var(--studio-line) !important;
    background: var(--studio-surface) !important;
  }

  html.product-studio-v3 .product-event-screen .summary-item,
  html.product-studio-v3 .product-event-screen .summary-item:first-child {
    width: auto !important;
    min-height: 0 !important;
    display: flex !important;
    flex: 0 0 auto !important;
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 4px !important;
    padding: 0 !important;
    overflow: visible !important;
    border: 0 !important;
    background: transparent !important;
  }

  html.product-studio-v3 .product-event-screen .summary-item::after {
    content: none !important;
    display: none !important;
  }

  html.product-studio-v3 .summary-item strong {
    color: var(--studio-ink) !important;
    font-size: 18px !important;
    font-weight: 700 !important;
    font-variant-numeric: tabular-nums !important;
  }

  html.product-studio-v3 .product-event-screen .summary-item strong,
  html.product-studio-v3 .product-event-screen .summary-item .amount {
    color: var(--studio-ink) !important;
  }

  html.product-studio-v3 .event-workspace-nav {
    position: sticky !important;
    top: 58px !important;
    gap: 22px !important;
    margin: 0 0 24px !important;
    padding: 0 !important;
    overflow-x: auto !important;
    border: 0 !important;
    border-bottom: 1px solid var(--studio-line) !important;
    border-radius: 0 !important;
    background: rgba(250, 250, 248, 0.97) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .event-workspace-tab {
    min-height: 46px !important;
    padding: 0 1px !important;
    border: 0 !important;
    border-bottom: 2px solid transparent !important;
    border-radius: 0 !important;
    color: var(--studio-muted) !important;
    background: transparent !important;
    font-size: 14px !important;
    font-weight: 600 !important;
  }

  html.product-studio-v3 .event-workspace-tab.is-active,
  html.product-studio-v3 .event-workspace-tab:hover {
    color: var(--studio-primary-deep) !important;
    border-bottom-color: var(--studio-primary) !important;
    background: transparent !important;
  }

  html.product-studio-v3 .event-insight-panel {
    margin-bottom: 24px !important;
    padding: 14px 0 !important;
    border: 0 !important;
    border-top: 1px solid var(--studio-line) !important;
    border-bottom: 1px solid var(--studio-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.product-studio-v3 .event-insight-main h2 {
    color: var(--studio-ink) !important;
    font-size: 16px !important;
    font-weight: 650 !important;
  }

  html.product-studio-v3 .event-row .status-chip.is-open,
  html.product-studio-v3 .event-insight-panel .status-chip.is-open,
  html.product-studio-v3 .settlement-hero .status-chip.is-open {
    color: var(--studio-muted) !important;
    border: 1px solid var(--studio-line-strong) !important;
    background: transparent !important;
  }

  html.product-studio-v3 .expense-row,
  html.product-studio-v3 .transfer-row,
  html.product-studio-v3 .balance-row,
  html.product-studio-v3 .group-row {
    min-height: 64px !important;
    padding: 12px 14px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--studio-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .expense-row {
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 16px !important;
  }

  html.product-studio-v3 .expense-actions {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 6px !important;
  }

  html.product-studio-v3 .expense-actions .amount {
    margin-inline-end: 6px !important;
    font-size: 15px !important;
    font-weight: 700 !important;
  }

  html.product-studio-v3 .expense-actions .secondary-button {
    min-height: 36px !important;
    padding-inline: 10px !important;
    font-size: 12px !important;
  }

  html.product-studio-v3 .expense-row:hover,
  html.product-studio-v3 .group-row:hover {
    background: var(--studio-surface-subtle) !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.product-studio-v3 .segmented-control,
  html.product-studio-v3 .expense-mode-switch {
    padding: 3px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 8px !important;
    background: var(--studio-canvas-deep) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .segmented-control button,
  html.product-studio-v3 .expense-mode-switch button {
    min-height: 40px !important;
    border-radius: 6px !important;
    color: var(--studio-muted) !important;
    background: transparent !important;
  }

  html.product-studio-v3 .segmented-control button.is-active,
  html.product-studio-v3 .expense-mode-switch button.is-active {
    color: var(--studio-ink) !important;
    background: var(--studio-surface) !important;
    box-shadow: 0 1px 2px rgba(20, 24, 23, 0.08) !important;
  }

  html.product-studio-v3 input,
  html.product-studio-v3 select,
  html.product-studio-v3 textarea {
    min-height: 48px !important;
    border: 1px solid var(--studio-line-strong) !important;
    border-radius: 8px !important;
    color: var(--studio-ink) !important;
    background: var(--studio-surface) !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 input::placeholder,
  html.product-studio-v3 textarea::placeholder {
    color: var(--studio-faint) !important;
  }

  html.product-studio-v3 input:focus,
  html.product-studio-v3 select:focus,
  html.product-studio-v3 textarea:focus {
    border-color: var(--studio-primary) !important;
    outline: 2px solid rgba(8, 123, 116, 0.2) !important;
    outline-offset: 1px !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .expense-modal-backdrop,
  html.product-studio-v3 .event-modal-backdrop {
    background: rgba(27, 31, 30, 0.38) !important;
  }

  html.product-studio-v3 .expense-modal,
  html.product-studio-v3 .event-modal {
    width: min(100%, 680px) !important;
    padding: 24px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 12px !important;
    background: var(--studio-surface) !important;
    box-shadow: var(--studio-shadow-float) !important;
  }

  html.product-studio-v3 .expense-modal:focus-visible,
  html.product-studio-v3 .event-modal:focus-visible,
  html.product-studio-v3 .public-profile-modal:focus-visible {
    outline: 2px solid var(--studio-primary) !important;
    outline-offset: 3px !important;
  }

  html.product-studio-v3 .expense-modal-header,
  html.product-studio-v3 .event-modal-header {
    margin: -2px 0 20px !important;
    padding: 0 0 16px !important;
    border-bottom: 1px solid var(--studio-line) !important;
  }

  html.product-studio-v3 .expense-modal-header h2,
  html.product-studio-v3 .event-modal-header h2 {
    font-size: 24px !important;
    font-weight: 700 !important;
  }

  html.product-studio-v3 .expense-total-field {
    margin: 0 0 16px !important;
    padding: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.product-studio-v3 .expense-total-field input {
    min-height: 70px !important;
    border-color: #91b7b1 !important;
    background: var(--studio-primary-soft) !important;
    font-size: 30px !important;
    font-weight: 700 !important;
    font-variant-numeric: tabular-nums !important;
    text-align: center !important;
  }

  html.product-studio-v3 .expense-details-panel {
    border: 1px solid var(--studio-line) !important;
    border-radius: 8px !important;
    background: var(--studio-surface) !important;
  }

  html.product-studio-v3 .expense-details-panel > summary:hover {
    background: var(--studio-surface-subtle) !important;
  }

  html.product-studio-v3 .expense-modal-actions {
    border-top: 1px solid var(--studio-line) !important;
    background: var(--studio-surface) !important;
    box-shadow: 0 -1px 0 var(--studio-line), 0 -8px 18px rgba(20, 24, 23, 0.04) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  html.product-studio-v3 .participant-pill {
    min-height: 44px !important;
    border-radius: 999px !important;
    color: var(--studio-ink) !important;
    border-color: var(--studio-line-strong) !important;
    background: var(--studio-surface) !important;
  }

  html.product-studio-v3 .participant-pill.is-selected,
  html.product-studio-v3 .participant-pill[aria-pressed="true"] {
    color: var(--studio-primary-deep) !important;
    border-color: #a8c8c2 !important;
    background: var(--studio-primary-soft) !important;
  }

  html.product-studio-v3 .settlement-hero {
    padding: 24px 0 !important;
    border: 0 !important;
    border-top: 1px solid var(--studio-line) !important;
    border-bottom: 1px solid var(--studio-line) !important;
    border-radius: 0 !important;
    color: var(--studio-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.product-studio-v3 .settlement-hero h2,
  html.product-studio-v3 .settlement-hero .muted {
    color: var(--studio-ink) !important;
  }

  html.product-studio-v3 .settlement-hero .amount {
    color: var(--studio-primary-deep) !important;
    font-variant-numeric: tabular-nums !important;
  }

  html.product-studio-v3 .account-auth-gate {
    background: var(--studio-canvas) !important;
  }

  html.product-studio-v3 .account-auth-shell {
    border: 1px solid var(--studio-line) !important;
    border-radius: 12px !important;
    box-shadow: var(--studio-shadow-float) !important;
  }

  html.product-studio-v3 .account-auth-brand {
    border-color: var(--studio-line) !important;
    background: var(--studio-surface-subtle) !important;
  }

  @media (max-width: 760px) {
    html.product-studio-v3 .screen {
      width: 100% !important;
      padding: 0 16px calc(36px + env(safe-area-inset-bottom)) !important;
    }

    html.product-studio-v3 .product-app-identity {
      grid-template-columns: auto minmax(0, 1fr) auto !important;
      min-height: 56px !important;
      margin-bottom: 14px !important;
      padding: calc(8px + env(safe-area-inset-top)) 0 8px !important;
    }

    html.product-studio-v3 .product-brand-mark,
    html.product-studio-v3.product-v1 .product-app-identity .product-brand-mark,
    html.product-studio-v3.product-v1-live .product-app-identity .product-brand-mark {
      width: 34px !important;
      min-width: 34px !important;
      height: 34px !important;
    }

    html.product-studio-v3 .product-brand-copy strong {
      font-size: 16px !important;
    }

    html.product-studio-v3 .product-app-nav {
      position: static !important;
      z-index: auto !important;
      grid-column: 2 !important;
      justify-self: end !important;
      min-height: 40px !important;
      display: flex !important;
      gap: 1px !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    html.product-studio-v3 .screen:not([data-product-screen="home"]):not(.product-home-screen) .product-app-nav {
      display: none !important;
    }

    html.product-studio-v3 .product-home-screen .product-nav-button[data-action="join-event-screen"] {
      display: none !important;
    }

    html.product-studio-v3 .product-home-button {
      grid-column: 3 !important;
      width: 40px !important;
      min-width: 40px !important;
      min-height: 40px !important;
      padding: 0 !important;
      border-radius: 8px !important;
    }

    html.product-studio-v3 .product-home-button > span:last-child {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      clip: rect(0 0 0 0) !important;
      white-space: nowrap !important;
    }

    html.product-studio-v3 .product-nav-button {
      width: 40px !important;
      min-width: 40px !important;
      min-height: 40px !important;
      display: inline-grid !important;
      place-items: center !important;
      padding: 0 !important;
      border-radius: 8px !important;
    }

    html.product-studio-v3 .product-nav-button:hover,
    html.product-studio-v3 .product-nav-button[aria-current="page"] {
      background: var(--studio-primary-soft) !important;
    }

    html.product-studio-v3 .product-nav-button span {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      clip: rect(0 0 0 0) !important;
      white-space: nowrap !important;
    }

    html.product-studio-v3 .product-nav-button svg {
      width: 20px !important;
      height: 20px !important;
    }

    html.product-studio-v3 .screen[data-product-screen="home"] > .top,
    html.product-studio-v3 .product-home-screen > .top {
      grid-template-columns: 1fr !important;
      grid-template-rows: auto auto !important;
      align-items: start !important;
      gap: 16px !important;
      margin-bottom: 24px !important;
      padding: 16px 0 24px !important;
    }

    html.product-studio-v3 .screen[data-product-screen="home"] > .top h1,
    html.product-studio-v3 .product-home-screen > .top h1 {
      font-size: 25px !important;
    }

    html.product-studio-v3 .screen[data-product-screen="home"] > .top .hero-actions,
    html.product-studio-v3 .product-home-screen > .top .hero-actions {
      grid-column: 1 !important;
      grid-row: 2 !important;
      width: 100% !important;
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
    }

    html.product-studio-v3 .screen[data-product-screen="home"] > .top .hero-actions button,
    html.product-studio-v3 .product-home-screen > .top .hero-actions button {
      width: 100% !important;
      min-width: 0 !important;
      padding-inline: 10px !important;
      white-space: nowrap !important;
      font-size: 14px !important;
    }

    html.product-studio-v3 .product-empty-home .home-empty-events {
      padding-top: 20px !important;
    }

    html.product-studio-v3 .product-empty-home .home-empty-events .empty-state {
      min-height: 116px !important;
      padding: 22px 0 !important;
    }

    html.product-studio-v3 .recent-event-shortcut {
      grid-template-columns: 1fr !important;
      gap: 14px !important;
      margin-bottom: 24px !important;
      padding: 16px !important;
    }

    html.product-studio-v3 .recent-event-action {
      grid-template-columns: minmax(0, 1fr) auto !important;
    }

    html.product-studio-v3 .expense-row {
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 10px !important;
      padding: 12px 0 !important;
    }

    html.product-studio-v3 .expense-actions {
      display: grid !important;
      grid-template-columns: repeat(2, auto) !important;
      gap: 4px !important;
    }

    html.product-studio-v3 .expense-actions .amount {
      grid-column: 1 / -1 !important;
      justify-self: end !important;
      margin: 0 0 2px !important;
    }

    html.product-studio-v3 .expense-actions .secondary-button {
      min-height: 34px !important;
      padding-inline: 8px !important;
      font-size: 11px !important;
    }

    html.product-studio-v3 .screen:not([data-product-screen="home"]):not(.product-home-screen) > .top {
      margin-bottom: 20px !important;
      padding: 8px 0 18px !important;
    }

    html.product-studio-v3 .screen > .top h1 {
      font-size: 24px !important;
    }

    html.product-studio-v3 .product-event-screen > .top .app-back-button {
      right: 0 !important;
      left: auto !important;
    }

    html.product-studio-v3 .product-event-screen > .top .brand {
      padding-inline-start: 52px !important;
    }

    html.product-studio-v3 .product-event-screen > .top .event-header-actions {
      grid-template-columns: 1fr !important;
    }

    html.product-studio-v3 .event-workspace-nav {
      top: calc(56px + env(safe-area-inset-top)) !important;
      justify-content: stretch !important;
      gap: 0 !important;
      margin-inline: -16px !important;
      padding-inline: 16px !important;
    }

    html.product-studio-v3 .event-workspace-tab {
      min-width: max-content !important;
      flex: 1 1 0 !important;
      padding-inline: 8px !important;
      white-space: nowrap !important;
      font-size: 13px !important;
    }

    html.product-studio-v3 .event-workspace-tab .button-action-icon {
      display: none !important;
    }

    html.product-studio-v3 .summary-strip,
    html.product-studio-v3 .product-event-screen .summary-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    html.product-studio-v3 .product-event-screen .summary-item:nth-child(n + 3) {
      display: none !important;
    }

    html.product-studio-v3 .product-event-screen .summary-item:first-child {
      grid-column: auto !important;
      border-bottom: 0 !important;
    }

    html.product-studio-v3 .summary-item {
      min-height: 70px !important;
      padding: 12px !important;
    }

    html.product-studio-v3 .expense-modal-backdrop,
    html.product-studio-v3 .event-modal-backdrop {
      align-items: stretch !important;
      background: var(--studio-surface) !important;
    }

    html.product-studio-v3 .expense-modal,
    html.product-studio-v3 .event-modal {
      width: 100% !important;
      min-height: 100dvh !important;
      max-height: 100dvh !important;
      padding: 18px !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    html.product-studio-v3 .expense-modal-header,
    html.product-studio-v3 .event-modal-header {
      margin: -18px -18px 18px !important;
      padding: calc(14px + env(safe-area-inset-top)) 18px 14px !important;
    }

    html.product-studio-v3 .expense-modal-actions {
      bottom: -18px !important;
      margin: 24px -18px -18px !important;
      padding: 12px 18px calc(12px + env(safe-area-inset-bottom)) !important;
    }

    html.product-studio-v3 .expense-total-field input {
      min-height: 64px !important;
      font-size: 28px !important;
    }
  }

  /* Store-readiness polish: stable touch targets and a purposeful empty state. */
  html.product-studio-v3 button,
  html.product-studio-v3 .button,
  html.product-studio-v3 a.secondary-button,
  html.product-studio-v3 a.primary-button {
    min-height: 44px !important;
  }

  html.product-studio-v3 .icon-button,
  html.product-studio-v3 .product-home-button,
  html.product-studio-v3 .product-nav-button,
  html.product-studio-v3 .expense-actions .secondary-button {
    min-width: 44px !important;
    min-height: 44px !important;
  }

  html.product-studio-v3 .home-empty-visual {
    position: relative !important;
    min-height: 250px !important;
    display: flex !important;
    align-items: flex-end !important;
    overflow: hidden !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 12px !important;
    background: #0d524b !important;
  }

  html.product-studio-v3 .home-empty-visual img {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    object-position: center !important;
  }

  html.product-studio-v3 .home-empty-visual strong {
    position: relative !important;
    z-index: 1 !important;
    max-width: 16ch !important;
    margin: 0 !important;
    padding: 24px !important;
    color: #ffffff !important;
    font-size: 25px !important;
    line-height: 1.25 !important;
    text-shadow: 0 2px 10px rgba(4, 31, 27, 0.58) !important;
  }

  html.product-studio-v3 .event-start-secondary > .event-start-primary {
    min-height: 48px !important;
    font-size: 14px !important;
  }

  @media (max-width: 760px) {
    html.product-studio-v3 .product-home-button,
    html.product-studio-v3 .product-nav-button {
      width: 48px !important;
      min-width: 48px !important;
      min-height: 48px !important;
    }

    html.product-studio-v3 .product-app-nav {
      min-height: 48px !important;
    }

    html.product-studio-v3 .product-empty-home .home-empty-events .home-empty-visual,
    html.product-studio-v3 .home-empty-visual {
      min-height: 210px !important;
      padding: 0 !important;
    }

    html.product-studio-v3 .home-empty-visual img {
      object-position: 42% center !important;
    }

    html.product-studio-v3 .home-empty-visual strong {
      max-width: 13ch !important;
      padding: 18px !important;
      font-size: 21px !important;
    }

    html.product-studio-v3 .expense-actions .secondary-button {
      min-width: 44px !important;
      min-height: 44px !important;
      padding-inline: 10px !important;
      font-size: 12px !important;
    }
  }

  /* Accessible navigation v6: one persistent route bar, no duplicate controls. */
  html.product-studio-v3 .skip-link {
    position: fixed !important;
    inset-block-start: 8px !important;
    inset-inline-start: 12px !important;
    z-index: 1000 !important;
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    padding: 0 16px !important;
    border-radius: 8px !important;
    color: #ffffff !important;
    background: var(--studio-primary-deep) !important;
    box-shadow: var(--studio-shadow-panel) !important;
    font-weight: 750 !important;
    transform: translateY(-160%) !important;
    transition: transform 160ms ease !important;
  }

  html.product-studio-v3 .skip-link:focus {
    transform: translateY(0) !important;
  }

  html.product-studio-v3 .screen h1[tabindex="-1"]:focus,
  html.product-studio-v3 #app:focus {
    outline: none !important;
  }

  html.product-studio-v3 .app-back-button:disabled {
    display: none !important;
  }

  html.product-studio-v3 .product-app-identity {
    position: sticky !important;
    top: 0 !important;
    z-index: 100 !important;
    grid-template-columns: auto minmax(0, 1fr) auto !important;
    isolation: isolate !important;
  }

  html.product-studio-v3 .product-brand-lockup {
    grid-column: 1 !important;
  }

  html.product-studio-v3 .product-app-nav {
    grid-column: 2 !important;
  }

  html.product-studio-v3 .product-route-controls {
    grid-column: 3 !important;
    justify-self: end !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    margin: 0 !important;
  }

  html.product-studio-v3 .product-route-controls[hidden] {
    display: none !important;
  }

  html.product-studio-v3 .product-route-controls > .app-back-button,
  html.product-studio-v3 .product-route-controls > .product-home-button {
    position: static !important;
    inset: auto !important;
    grid-column: auto !important;
    width: auto !important;
    min-width: 48px !important;
    height: 44px !important;
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 7px !important;
    padding: 0 12px !important;
    border: 1px solid var(--studio-line) !important;
    border-radius: 8px !important;
    color: var(--studio-primary-deep) !important;
    background: #ffffff !important;
    box-shadow: none !important;
    font-size: 13px !important;
    font-weight: 700 !important;
  }

  html.product-studio-v3 .app-back-button-glyph {
    display: inline-grid !important;
    place-items: center !important;
    font-size: 26px !important;
    font-weight: 500 !important;
    line-height: 1 !important;
  }

  html.product-studio-v3 .event-workspace-nav {
    top: 62px !important;
    z-index: 75 !important;
    min-height: 49px !important;
    scroll-padding-inline: 16px !important;
  }

  html.product-studio-v3 .event-workspace-tab {
    min-height: 48px !important;
    touch-action: manipulation !important;
  }

  html.product-studio-v3 #event-expenses {
    scroll-margin-top: 132px !important;
  }

  html.product-studio-v3 .expense-modal-header > .icon-button,
  html.product-studio-v3 .event-modal-header > .icon-button {
    min-width: 48px !important;
    min-height: 48px !important;
    flex: 0 0 auto !important;
  }

  html.product-studio-v3 .modal-back-button {
    width: auto !important;
    min-width: 88px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 7px !important;
    padding: 0 12px !important;
    color: var(--studio-primary-deep) !important;
    background: #ffffff !important;
  }

  html.product-studio-v3 .modal-back-button-glyph {
    display: inline-grid !important;
    place-items: center !important;
    font-size: 26px !important;
    font-weight: 500 !important;
    line-height: 1 !important;
  }

  html.product-studio-v3 .modal-back-button-label {
    font-size: 13px !important;
    font-weight: 700 !important;
  }

  @media (max-width: 760px) {
    html.product-studio-v3 .product-app-identity {
      min-height: calc(64px + env(safe-area-inset-top)) !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      padding-block-start: max(8px, env(safe-area-inset-top)) !important;
      background: rgba(250, 250, 248, 0.98) !important;
      box-shadow: 0 1px 0 var(--studio-line) !important;
    }

    html.product-studio-v3 .screen:not([data-product-screen="home"]):not(.product-home-screen) .product-route-controls {
      grid-column: 2 !important;
    }

    html.product-studio-v3 .product-route-controls > .app-back-button,
    html.product-studio-v3 .product-route-controls > .product-home-button {
      width: 48px !important;
      min-width: 48px !important;
      height: 48px !important;
      min-height: 48px !important;
      padding: 0 !important;
    }

    html.product-studio-v3 .product-route-controls .app-back-button-label,
    html.product-studio-v3 .product-route-controls .product-home-button > span:last-child {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      clip: rect(0 0 0 0) !important;
      white-space: nowrap !important;
    }

    html.product-studio-v3 .event-workspace-nav {
      top: calc(65px + env(safe-area-inset-top)) !important;
      overscroll-behavior-inline: contain !important;
      scroll-snap-type: inline proximity !important;
    }

    html.product-studio-v3 .event-workspace-tab {
      min-height: 48px !important;
      scroll-snap-align: start !important;
    }
  }

  /* Touch tablets use the same focused, edge-to-edge editing flow as phones. */
  @media (max-width: 1024px), (hover: none) and (pointer: coarse) {
    html.product-studio-v3 .expense-modal-backdrop,
    html.product-studio-v3 .event-modal-backdrop {
      position: fixed !important;
      inset: 0 !important;
      display: grid !important;
      place-items: stretch !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: var(--studio-surface) !important;
      backdrop-filter: none !important;
    }

    html.product-studio-v3 .expense-modal,
    html.product-studio-v3 .event-modal {
      width: 100vw !important;
      max-width: none !important;
      min-height: 100dvh !important;
      height: 100dvh !important;
      max-height: none !important;
      margin: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      overflow-y: auto !important;
      box-shadow: none !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    html.product-studio-v3 *,
    html.product-studio-v3 *::before,
    html.product-studio-v3 *::after {
      scroll-behavior: auto !important;
      animation-duration: 1ms !important;
      transition-duration: 1ms !important;
    }
  }
`;

let scheduled = false;

setupStudioDesignLayer();

function setupStudioDesignLayer() {
  document.documentElement.classList.add("product-studio-v3");
  retireLegacyVisualStyles();
  injectStyles();
  enhanceInterface();

  const app = document.querySelector("#app");
  if (!app) return;

  new MutationObserver(scheduleEnhancement).observe(app, {
    childList: true,
    subtree: true
  });
}

function retireLegacyVisualStyles() {
  for (const id of RETIRED_VISUAL_STYLE_IDS) {
    document.getElementById(id)?.remove();
  }
}

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhanceInterface();
  });
}

function enhanceInterface() {
  retireHomeHeroImage();

  document.querySelectorAll(".event-type-option").forEach((option) => {
    if (option.querySelector(".studio-event-type-icon")) return;

    const icon = document.createElement("span");
    icon.className = "studio-event-type-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = EVENT_TYPE_ICONS[option.dataset.eventType] ?? EVENT_TYPE_ICONS.standard;
    option.prepend(icon);
  });
}

function retireHomeHeroImage() {
  document.querySelectorAll(".studio-home-hero-image").forEach((image) => image.remove());
}

function injectStyles() {
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(CSS));
  document.head.append(style);
}
