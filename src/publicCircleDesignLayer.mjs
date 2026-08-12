const STYLE_ID = "public-circle-design-layer-style";

const CSS = `
  html.circle-design-v1 {
    --circle-ink: #102a2a;
    --circle-muted: #536965;
    --circle-faint: #62736f;
    --circle-placeholder: #657672;
    --circle-canvas: #f3f7f6;
    --circle-surface: #ffffff;
    --circle-surface-soft: #eaf1f0;
    --circle-brand: #0b3b38;
    --circle-brand-pressed: #062825;
    --circle-mint: #2bb8c2;
    --circle-mint-soft: #dff4f5;
    --circle-coral: #f46f61;
    --circle-coral-soft: #fff0ed;
    --circle-positive: #157a57;
    --circle-negative: #b94838;
    --circle-positive-on-dark: #72d5aa;
    --circle-negative-on-dark: #ff9d8e;
    --circle-debt: #b94838;
    --circle-debt-soft: #fff0ed;
    --circle-warning: #91531c;
    --circle-accent: #2bb8c2;
    --circle-accent-hover: #159aa5;
    --circle-accent-soft: #dff4f5;
    --circle-focus: #087c78;
    --circle-selection: #e4f5f6;
    --circle-line: rgba(11, 59, 56, 0.1);
    --circle-line-strong: rgba(11, 59, 56, 0.18);
    --circle-disabled: #a8b2af;
    --circle-radius-control: 8px;
    --circle-radius-panel: 8px;
    --circle-shadow-card: 0 1px 1px rgba(16, 49, 43, 0.03), 0 12px 30px rgba(16, 49, 43, 0.055);
    --circle-shadow-float: 0 24px 72px rgba(16, 49, 43, 0.18);
    --circle-shadow-border:
      0 0 0 1px rgba(16, 49, 43, 0.08),
      0 1px 2px -1px rgba(16, 49, 43, 0.08),
      0 8px 24px rgba(16, 49, 43, 0.05);
    --circle-shadow-border-hover:
      0 0 0 1px rgba(16, 49, 43, 0.13),
      0 2px 4px -1px rgba(16, 49, 43, 0.1),
      0 12px 30px rgba(16, 49, 43, 0.08);
    --circle-motion: 220ms cubic-bezier(0.22, 1, 0.36, 1);
    color: var(--circle-ink);
    background: var(--circle-canvas);
    color-scheme: light;
  }

  html.circle-design-v1 body {
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0;
    color: var(--circle-ink) !important;
    background: var(--circle-canvas) !important;
    overflow-x: clip !important;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  html.circle-design-v1 body,
  html.circle-design-v1 button,
  html.circle-design-v1 input,
  html.circle-design-v1 select,
  html.circle-design-v1 textarea {
    font-family: var(--font-hebrew) !important;
    letter-spacing: 0 !important;
  }

  html.circle-design-v1 *,
  html.circle-design-v1 *::before,
  html.circle-design-v1 *::after {
    box-sizing: border-box;
  }

  html.circle-design-v1 button,
  html.circle-design-v1 a,
  html.circle-design-v1 input,
  html.circle-design-v1 select,
  html.circle-design-v1 textarea {
    transition:
      color var(--circle-motion),
      background-color var(--circle-motion),
      border-color var(--circle-motion),
      box-shadow var(--circle-motion),
      opacity var(--circle-motion),
      transform var(--circle-motion) !important;
  }

  html.circle-design-v1 button,
  html.circle-design-v1 a {
    touch-action: manipulation;
    -webkit-tap-highlight-color: rgba(11, 79, 73, 0.12);
  }

  html.circle-design-v1 [id] {
    scroll-margin-top: 128px;
  }

  html.circle-design-v1 .app {
    min-height: 100dvh;
    background: var(--circle-canvas) !important;
  }

  html.circle-design-v1 .screen {
    width: min(100%, 840px) !important;
    min-height: 100dvh !important;
    margin-inline: auto !important;
    padding: 0 20px calc(88px + env(safe-area-inset-bottom)) !important;
    background: var(--circle-canvas) !important;
  }

  html.circle-design-v1 h1,
  html.circle-design-v1 h2,
  html.circle-design-v1 h3 {
    margin-block-start: 0;
    color: var(--circle-ink) !important;
    font-weight: 700 !important;
    line-height: 1.2 !important;
    text-wrap: balance;
  }

  html.circle-design-v1 p,
  html.circle-design-v1 small {
    text-wrap: pretty;
  }

  html.circle-design-v1 .muted {
    color: var(--circle-muted) !important;
  }

  html.circle-design-v1 .font-num {
    direction: ltr;
    unicode-bidi: isolate;
    font-family: var(--font-num) !important;
    font-weight: 900 !important;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0 !important;
    white-space: nowrap;
  }

  html.circle-design-v1 .product-app-identity {
    position: sticky !important;
    inset-block-start: 0 !important;
    z-index: 90 !important;
    width: calc(100% + 40px) !important;
    min-height: calc(60px + env(safe-area-inset-top)) !important;
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 16px !important;
    margin: 0 -20px 0 !important;
    padding: calc(8px + env(safe-area-inset-top)) 20px 8px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: var(--circle-brand) !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
  }

  html.circle-design-v1 .product-brand-lockup {
    grid-column: 1 !important;
    min-width: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 10px !important;
  }

  html.circle-design-v1 .product-brand-mark,
  html.circle-design-v1.product-v1 .product-brand-mark,
  html.circle-design-v1.product-v1-live .product-brand-mark {
    width: 38px !important;
    min-width: 38px !important;
    height: 38px !important;
    display: block !important;
    overflow: hidden !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    border-radius: 10px !important;
    background: var(--circle-brand) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .product-brand-image,
  html.circle-design-v1 .account-auth-mark img {
    width: 100% !important;
    height: 100% !important;
    display: block !important;
    object-fit: cover !important;
  }

  html.circle-design-v1 .product-brand-mark::before,
  html.circle-design-v1 .product-brand-mark::after {
    content: none !important;
    display: none !important;
  }

  html.circle-design-v1 .product-brand-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 1px !important;
  }

  html.circle-design-v1 .product-brand-copy strong {
    overflow: hidden;
    color: #ffffff !important;
    font-size: 18px !important;
    font-weight: 700 !important;
    line-height: 1.05 !important;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  html.circle-design-v1 .product-brand-copy small {
    overflow: hidden;
    color: rgba(255, 255, 255, 0.7) !important;
    font-size: 10.5px !important;
    font-weight: 500 !important;
    line-height: 1.2 !important;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  html.circle-design-v1 .product-app-nav {
    grid-column: 2 !important;
    justify-self: end !important;
    display: flex !important;
    align-items: center !important;
    gap: 2px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .product-nav-button {
    min-width: 48px !important;
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 0 10px !important;
    border: 0 !important;
    border-radius: 10px !important;
    color: rgba(255, 255, 255, 0.76) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 12px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .product-nav-button svg {
    width: 19px !important;
    height: 19px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.8 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.circle-design-v1 .product-nav-button:hover,
  html.circle-design-v1 .product-nav-button.is-active,
  html.circle-design-v1 .product-nav-button[aria-current="page"] {
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.12) !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.circle-design-v1 .product-route-controls {
    grid-column: 3 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    margin: 0 !important;
  }

  html.circle-design-v1 .product-route-controls[hidden] {
    display: none !important;
  }

  html.circle-design-v1 .product-route-controls > .app-back-button,
  html.circle-design-v1 .product-route-controls > .product-home-button {
    width: 44px !important;
    min-width: 44px !important;
    height: 44px !important;
    min-height: 44px !important;
    display: inline-grid !important;
    place-items: center !important;
    padding: 0 !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    border-radius: 10px !important;
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.08) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .product-route-controls > .app-back-button:hover,
  html.circle-design-v1 .product-route-controls > .product-home-button:hover {
    background: rgba(255, 255, 255, 0.16) !important;
  }

  html.circle-design-v1 .product-route-controls .app-back-button-label,
  html.circle-design-v1 .product-route-controls .product-home-button > span:last-child {
    display: none !important;
  }

  html.circle-design-v1 .screen[data-product-screen="home"] .product-home-button,
  html.circle-design-v1 .product-home-screen .product-home-button {
    display: none !important;
  }

  html.circle-design-v1 .screen > .top {
    position: relative !important;
    min-height: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: end !important;
    gap: 24px !important;
    margin: 0 -20px 24px !important;
    padding: 28px 20px 24px !important;
    overflow: visible !important;
    border: 0 !important;
    border-bottom: 1px solid var(--circle-line) !important;
    border-radius: 0 !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .screen > .top::before,
  html.circle-design-v1 .screen > .top::after,
  html.circle-design-v1 .product-hero-artwork,
  html.circle-design-v1 .studio-home-hero-image {
    content: none !important;
    display: none !important;
  }

  html.circle-design-v1 .screen > .top .brand {
    position: relative !important;
    z-index: 1 !important;
    grid-column: 1 !important;
    width: auto !important;
    max-width: 600px !important;
    min-height: 0 !important;
    padding: 0 !important;
  }

  html.circle-design-v1 .screen > .top .brand::before,
  html.circle-design-v1 .screen > .top .brand::after {
    content: none !important;
    display: none !important;
  }

  html.circle-design-v1 .screen > .top .eyebrow,
  html.circle-design-v1 .eyebrow {
    margin: 0 0 6px !important;
    color: var(--circle-positive) !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    line-height: 1.2 !important;
  }

  html.circle-design-v1 .screen > .top h1 {
    max-width: 22ch !important;
    margin: 0 !important;
    color: var(--circle-ink) !important;
    font-size: clamp(28px, 4vw, 38px) !important;
    font-weight: 700 !important;
    line-height: 1.12 !important;
    text-shadow: none !important;
  }

  html.circle-design-v1 .screen > .top .muted,
  html.circle-design-v1 .screen > .top .opened-at {
    margin: 8px 0 0 !important;
    color: var(--circle-muted) !important;
    font-size: 14px !important;
    font-weight: 400 !important;
    line-height: 1.5 !important;
  }

  html.circle-design-v1 .screen > .top > .app-back-button {
    position: absolute !important;
    inset-block-start: 18px !important;
    inset-inline-end: 20px !important;
    width: 44px !important;
    min-width: 44px !important;
    min-height: 44px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: 10px !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .screen[data-product-screen="home"] > .top,
  html.circle-design-v1 .product-home-screen > .top {
    min-height: 228px !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    grid-template-rows: auto !important;
    align-items: center !important;
    padding: 34px 20px !important;
    border-bottom-color: #d6e1dd !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .screen[data-product-screen="home"] > .top .brand,
  html.circle-design-v1 .product-home-screen > .top .brand {
    max-width: 470px !important;
  }

  html.circle-design-v1 .screen[data-product-screen="home"] > .top h1,
  html.circle-design-v1 .product-home-screen > .top h1 {
    max-width: 13ch !important;
    font-size: clamp(34px, 5vw, 48px) !important;
    line-height: 1.05 !important;
  }

  html.circle-design-v1 .screen[data-product-screen="home"] > .top .muted,
  html.circle-design-v1 .product-home-screen > .top .muted {
    max-width: 46ch !important;
    font-size: 15px !important;
  }

  html.circle-design-v1 .screen.circle-home-has-recent > .top {
    min-height: 0 !important;
    grid-template-columns: 1fr !important;
    align-items: stretch !important;
    gap: 14px !important;
    padding: 20px !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .screen.circle-home-has-recent > .top > .brand {
    display: none !important;
  }

  html.circle-design-v1 .screen.circle-home-has-recent > .top > .recent-event-shortcut {
    grid-column: 1 !important;
    width: 100% !important;
    margin: 0 !important;
  }

  html.circle-design-v1 .screen.circle-home-has-recent > .top > .hero-actions {
    grid-column: 1 !important;
    width: 100% !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 10px !important;
  }

  html.circle-design-v1 .screen.circle-home-has-recent > .product-app-identity .product-brand-copy small {
    display: block !important;
  }

  html.circle-design-v1 .screen > .top .hero-actions {
    position: relative !important;
    z-index: 1 !important;
    grid-column: 2 !important;
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    margin: 0 !important;
  }

  html.circle-design-v1 .primary-button,
  html.circle-design-v1 a.primary-button {
    min-height: 50px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    padding: 0 20px !important;
    border: 1px solid var(--circle-brand) !important;
    border-radius: var(--circle-radius-control) !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow: none !important;
    font-size: 15px !important;
    font-weight: 650 !important;
    line-height: 1.2 !important;
    text-decoration: none !important;
  }

  html.circle-design-v1 .primary-button:hover:not(:disabled),
  html.circle-design-v1 a.primary-button:hover {
    border-color: var(--circle-brand-pressed) !important;
    background: var(--circle-brand-pressed) !important;
    box-shadow: 0 8px 18px rgba(11, 79, 73, 0.18) !important;
    transform: translateY(-1px) !important;
  }

  html.circle-design-v1 .primary-button:active:not(:disabled) {
    box-shadow: none !important;
    transform: translateY(0) !important;
  }

  html.circle-design-v1 .secondary-button {
    min-height: 48px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    padding: 0 17px !important;
    border: 1px solid var(--circle-line-strong) !important;
    border-radius: var(--circle-radius-control) !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
    font-size: 14px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .secondary-button:hover:not(:disabled) {
    border-color: #a9b8b3 !important;
    background: var(--circle-surface-soft) !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.circle-design-v1 button:disabled,
  html.circle-design-v1 input:disabled,
  html.circle-design-v1 select:disabled {
    cursor: not-allowed !important;
    opacity: 0.55 !important;
  }

  html.circle-design-v1 .danger-button {
    color: var(--circle-negative) !important;
    border-color: rgba(178, 69, 44, 0.28) !important;
    background: #fffaf8 !important;
  }

  html.circle-design-v1 .panel {
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-card) !important;
  }

  html.circle-design-v1 .section {
    margin-top: 28px !important;
  }

  html.circle-design-v1 .section-title-row {
    display: flex !important;
    align-items: end !important;
    justify-content: space-between !important;
    gap: 16px !important;
    margin-bottom: 14px !important;
  }

  html.circle-design-v1 .section-title-row h2 {
    margin: 0 !important;
    font-size: 22px !important;
  }

  html.circle-design-v1 .section-title-row .muted {
    margin: 4px 0 0 !important;
    font-size: 13px !important;
  }

  html.circle-design-v1 .notice,
  html.circle-design-v1 .error,
  html.circle-design-v1 .field-error {
    border-radius: var(--circle-radius-panel) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .field {
    display: grid !important;
    gap: 7px !important;
  }

  html.circle-design-v1 .field > span {
    color: var(--circle-ink) !important;
    font-size: 13px !important;
    font-weight: 650 !important;
  }

  html.circle-design-v1 input,
  html.circle-design-v1 select,
  html.circle-design-v1 textarea {
    width: 100%;
    min-height: 50px !important;
    padding: 11px 13px !important;
    border: 1px solid var(--circle-line-strong) !important;
    border-radius: 10px !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
    font-size: 16px !important;
    outline: 2px solid transparent !important;
  }

  html.circle-design-v1 input[type="checkbox"],
  html.circle-design-v1 input[type="radio"] {
    width: 20px !important;
    min-width: 20px !important;
    height: 20px !important;
    min-height: 20px !important;
    padding: 0 !important;
    border-radius: 5px !important;
    accent-color: var(--circle-brand) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 textarea {
    min-height: 112px !important;
    resize: vertical !important;
  }

  html.circle-design-v1 input::placeholder,
  html.circle-design-v1 textarea::placeholder {
    color: var(--circle-placeholder) !important;
    opacity: 1 !important;
    font-size: 16px !important;
    font-weight: 400 !important;
  }

  html.circle-design-v1 input:hover,
  html.circle-design-v1 select:hover,
  html.circle-design-v1 textarea:hover {
    border-color: #aebbb7 !important;
  }

  html.circle-design-v1 input:focus,
  html.circle-design-v1 select:focus,
  html.circle-design-v1 textarea:focus {
    border-color: var(--circle-brand) !important;
    box-shadow: 0 0 0 3px rgba(11, 79, 73, 0.12) !important;
  }

  html.circle-design-v1 :focus-visible {
    outline: 3px solid rgba(11, 79, 73, 0.28) !important;
    outline-offset: 2px !important;
  }

  html.circle-design-v1 .recent-event-shortcut {
    position: relative !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 20px !important;
    margin: 24px 0 0 !important;
    padding: 22px !important;
    overflow: hidden !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: var(--circle-radius-panel) !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow: 0 14px 34px rgba(4, 47, 43, 0.18) !important;
  }

  html.circle-design-v1 .recent-event-shortcut::before {
    content: "" !important;
    position: absolute !important;
    inset-block: 0 !important;
    inset-inline-start: 0 !important;
    width: 4px !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1 .recent-event-shortcut::after {
    content: "" !important;
    position: absolute !important;
    inset-block-start: -58px !important;
    inset-inline-end: -44px !important;
    width: 190px !important;
    height: 190px !important;
    background: url("./icon-192.png") center / cover no-repeat !important;
    opacity: 0.08 !important;
    pointer-events: none !important;
  }

  html.circle-design-v1 .recent-event-main {
    position: relative !important;
    z-index: 1 !important;
    min-width: 0 !important;
    display: grid !important;
    justify-items: start !important;
    gap: 4px !important;
    padding: 0 !important;
    border: 0 !important;
    color: #ffffff !important;
    background: transparent !important;
    text-align: start !important;
  }

  html.circle-design-v1 .recent-event-main strong {
    color: #ffffff !important;
    font-size: 19px !important;
    font-weight: 700 !important;
  }

  html.circle-design-v1 .recent-event-main small {
    color: rgba(255, 255, 255, 0.65) !important;
    font-size: 13px !important;
  }

  html.circle-design-v1 .recent-event-eyebrow {
    color: var(--circle-mint) !important;
    font-size: 11px !important;
    font-weight: 650 !important;
  }

  html.circle-design-v1 .recent-event-action {
    position: relative !important;
    z-index: 1 !important;
    display: grid !important;
    justify-items: end !important;
    gap: 10px !important;
  }

  html.circle-design-v1 .recent-event-balance {
    display: inline-flex !important;
    align-items: baseline !important;
    justify-content: flex-end !important;
    gap: 7px !important;
    color: rgba(255, 255, 255, 0.76) !important;
    font-family: var(--font-hebrew) !important;
    font-size: 14px !important;
    font-weight: 400 !important;
    line-height: 1.4 !important;
  }

  html.circle-design-v1 .recent-event-balance .amount {
    color: inherit !important;
    font-size: 18px !important;
    font-weight: 700 !important;
  }

  html.circle-design-v1 .recent-event-balance.is-credit {
    color: var(--circle-mint) !important;
    font-size: 15px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .recent-event-balance.is-debt {
    color: #f5c98a !important;
    font-size: 15px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .recent-event-shortcut .primary-button {
    min-height: 46px !important;
    border-color: #ffffff !important;
    color: var(--circle-brand) !important;
    background: #ffffff !important;
  }

  html.circle-design-v1 .recent-event-shortcut .primary-button:hover:not(:disabled) {
    border-color: var(--circle-mint) !important;
    color: var(--circle-brand-pressed) !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1 .personal-dashboard {
    display: grid !important;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) !important;
    gap: 0 !important;
    margin: 20px 0 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  html.circle-design-v1 .personal-balance-main {
    display: grid !important;
    align-content: center !important;
    gap: 6px !important;
    min-height: 164px !important;
    padding: 24px !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
  }

  html.circle-design-v1 .personal-balance-main > span,
  html.circle-design-v1 .personal-balance-main p {
    margin: 0 !important;
    color: rgba(255, 255, 255, 0.7) !important;
    font-size: 12px !important;
  }

  html.circle-design-v1 .personal-balance-main .amount {
    color: #ffffff !important;
    font-size: clamp(29px, 5vw, 42px) !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .personal-balance-details {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    align-content: stretch !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .personal-balance-details > div {
    display: grid !important;
    align-content: center !important;
    gap: 5px !important;
    min-height: 78px !important;
    padding: 16px !important;
    border-inline-start: 1px solid var(--circle-line) !important;
    border-bottom: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1 .personal-balance-details span {
    color: var(--circle-muted) !important;
    font-size: 11px !important;
  }

  html.circle-design-v1 .personal-balance-details strong {
    color: var(--circle-ink) !important;
    font-size: 17px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .personal-next-step {
    grid-column: 1 / -1 !important;
    padding: 10px 16px !important;
    border-top: 1px solid var(--circle-line) !important;
    color: var(--circle-muted) !important;
    background: var(--circle-surface) !important;
    font-size: 12px !important;
  }

  html.circle-design-v1 .personal-action-list,
  html.circle-design-v1 .event-list,
  html.circle-design-v1 #event-expenses > .stack,
  html.circle-design-v1 .all-transfers-list {
    display: grid !important;
    gap: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .personal-action-card,
  html.circle-design-v1 .event-row {
    position: relative !important;
    width: 100% !important;
    min-height: 82px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 20px !important;
    padding: 16px 18px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--circle-line) !important;
    border-radius: 0 !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.circle-design-v1 .personal-action-card:last-child,
  html.circle-design-v1 .event-row:last-child {
    border-bottom: 0 !important;
  }

  html.circle-design-v1 .event-list {
    gap: 10px !important;
    overflow: visible !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.circle-design-v1 .event-row,
  html.circle-design-v1 .event-row:last-child {
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    box-shadow: var(--circle-shadow-card) !important;
  }

  html.circle-design-v1 .personal-action-card:hover,
  html.circle-design-v1 .event-row:hover {
    background: var(--circle-surface-soft) !important;
    box-shadow: 0 2px 4px rgba(4, 47, 43, 0.05), 0 12px 28px rgba(4, 47, 43, 0.09) !important;
    transform: translateY(-1px) !important;
  }

  html.circle-design-v1 .event-row:active {
    transform: scale(0.99) !important;
  }

  html.circle-design-v1 .event-row-main {
    min-width: 0 !important;
    display: grid !important;
    gap: 4px !important;
  }

  html.circle-design-v1 .event-row-title {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
  }

  html.circle-design-v1 .event-row-title strong,
  html.circle-design-v1 .personal-action-card strong {
    overflow: hidden !important;
    color: var(--circle-ink) !important;
    font-size: 16px !important;
    font-weight: 650 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .event-row small,
  html.circle-design-v1 .personal-action-card small,
  html.circle-design-v1 .opened-at {
    color: var(--circle-muted) !important;
    font-size: 12px !important;
    line-height: 1.4 !important;
  }

  html.circle-design-v1 .event-row .avatar-stack {
    margin-top: 7px !important;
  }

  html.circle-design-v1 .event-row .avatar {
    width: 26px !important;
    height: 26px !important;
    border-color: #b9d8d0 !important;
    color: var(--circle-brand) !important;
    background: var(--circle-mint-soft) !important;
    box-shadow: 0 0 0 2px var(--circle-surface) !important;
    font-size: 10px !important;
  }

  html.circle-design-v1 .event-row-side {
    display: grid !important;
    justify-items: end !important;
    gap: 7px !important;
  }

  html.circle-design-v1 .event-row-balance {
    min-height: 30px !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 5px !important;
    padding: 5px 9px !important;
    border-radius: 999px !important;
    color: var(--circle-muted) !important;
    background: var(--circle-surface-soft) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .event-row-balance .amount {
    color: inherit !important;
    font-size: 14px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .event-row-balance.is-credit {
    color: var(--circle-positive) !important;
    background: var(--circle-mint-soft) !important;
  }

  html.circle-design-v1 .event-row-balance.is-debt {
    color: var(--circle-debt) !important;
    background: var(--circle-debt-soft) !important;
  }

  html.circle-design-v1 .event-type-chip,
  html.circle-design-v1 .status-chip {
    min-height: 24px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 2px 8px !important;
    border: 0 !important;
    border-radius: 999px !important;
    color: var(--circle-brand) !important;
    background: var(--circle-mint-soft) !important;
    font-size: 10.5px !important;
    font-weight: 650 !important;
    line-height: 1 !important;
  }

  html.circle-design-v1 .status-chip.is-locked {
    color: var(--circle-muted) !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .segmented-control,
  html.circle-design-v1 .expense-mode-switch,
  html.circle-design-v1 .quick-purpose-switch,
  html.circle-design-v1 .account-auth-tabs {
    display: inline-grid !important;
    grid-auto-flow: column !important;
    grid-auto-columns: 1fr !important;
    gap: 3px !important;
    padding: 3px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: 12px !important;
    background: var(--circle-surface-soft) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .segmented-control button,
  html.circle-design-v1 .expense-mode-switch button,
  html.circle-design-v1 .quick-purpose-switch button,
  html.circle-design-v1 .account-auth-tabs button {
    min-height: 44px !important;
    padding: 0 13px !important;
    border: 0 !important;
    border-radius: 9px !important;
    color: var(--circle-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .segmented-control button.is-active,
  html.circle-design-v1 .expense-mode-switch button.is-active,
  html.circle-design-v1 .quick-purpose-switch button.is-active,
  html.circle-design-v1 .account-auth-tabs button.is-active {
    color: var(--circle-brand) !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 1px 3px rgba(20, 31, 29, 0.1) !important;
  }

  html.circle-design-v1 .home-empty-visual {
    min-height: 220px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 180px !important;
    align-items: center !important;
    gap: 24px !important;
    padding: 24px !important;
    overflow: hidden !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    color: var(--circle-muted) !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .home-empty-visual img {
    grid-column: 2 !important;
    grid-row: 1 / span 2 !important;
    width: 180px !important;
    height: 180px !important;
    object-fit: cover !important;
    border-radius: 50% !important;
    filter: saturate(0.85) contrast(1.02) !important;
  }

  html.circle-design-v1 .home-empty-visual strong {
    grid-column: 1 !important;
    color: var(--circle-ink) !important;
    font-size: 20px !important;
  }

  html.circle-design-v1 .summary-strip {
    display: grid !important;
    grid-template-columns: 1.5fr repeat(2, 1fr) !important;
    gap: 0 !important;
    margin: 0 0 14px !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: var(--circle-radius-panel) !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .summary-item,
  html.circle-design-v1 .summary-item:first-child {
    position: relative !important;
    min-height: 92px !important;
    display: grid !important;
    align-content: center !important;
    gap: 6px !important;
    padding: 18px 20px !important;
    border: 0 !important;
    border-inline-start: 1px solid rgba(255, 255, 255, 0.13) !important;
    border-radius: 0 !important;
    color: #ffffff !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .summary-item:first-child {
    border-inline-start: 0 !important;
  }

  html.circle-design-v1 .summary-item::after {
    content: none !important;
    display: none !important;
  }

  html.circle-design-v1 .summary-item span {
    color: rgba(255, 255, 255, 0.68) !important;
    font-size: 11px !important;
  }

  html.circle-design-v1 .summary-item strong {
    color: #ffffff !important;
    font-size: 18px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .summary-item:first-child strong {
    font-size: 25px !important;
  }

  html.circle-design-v1 .summary-personal-value {
    display: flex !important;
    align-items: baseline !important;
    flex-wrap: wrap !important;
    gap: 7px !important;
    color: #ffffff !important;
    line-height: 1.15 !important;
  }

  html.circle-design-v1 .summary-personal-value .amount {
    color: inherit !important;
    font-size: inherit !important;
  }

  html.circle-design-v1 .summary-personal-value.is-credit {
    color: var(--circle-mint) !important;
  }

  html.circle-design-v1 .summary-personal-value.is-debt {
    color: #f5c98a !important;
  }

  html.circle-design-v1.product-studio-v3 .screen .summary-strip,
  html.circle-design-v1.product-v2-live .screen .summary-strip {
    display: grid !important;
    grid-template-columns: 1.5fr repeat(2, 1fr) !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: var(--circle-radius-panel) !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow: 0 12px 28px rgba(4, 47, 43, 0.16) !important;
  }

  html.circle-design-v1.product-studio-v3 .screen .summary-item,
  html.circle-design-v1.product-v2-live .screen .summary-item {
    min-height: 92px !important;
    display: grid !important;
    align-content: center !important;
    gap: 6px !important;
    padding: 18px 20px !important;
    border: 0 !important;
    border-inline-start: 1px solid rgba(255, 255, 255, 0.13) !important;
    border-radius: 0 !important;
    color: #ffffff !important;
    background: transparent !important;
  }

  html.circle-design-v1.product-studio-v3 .screen .summary-item:first-child,
  html.circle-design-v1.product-v2-live .screen .summary-item:first-child {
    border-inline-start: 0 !important;
  }

  html.circle-design-v1.product-studio-v3 .screen .summary-item strong,
  html.circle-design-v1.product-studio-v3 .screen .summary-item .amount,
  html.circle-design-v1.product-v2-live .screen .summary-item strong,
  html.circle-design-v1.product-v2-live .screen .summary-item .amount {
    color: #ffffff !important;
  }

  html.circle-design-v1.product-studio-v3 .screen .summary-personal-value.is-credit,
  html.circle-design-v1.product-studio-v3 .screen .summary-personal-value.is-credit .amount,
  html.circle-design-v1.product-v2-live .screen .summary-personal-value.is-credit,
  html.circle-design-v1.product-v2-live .screen .summary-personal-value.is-credit .amount {
    color: var(--circle-mint) !important;
  }

  html.circle-design-v1.product-studio-v3 .screen .summary-personal-value.is-debt,
  html.circle-design-v1.product-studio-v3 .screen .summary-personal-value.is-debt .amount,
  html.circle-design-v1.product-v2-live .screen .summary-personal-value.is-debt,
  html.circle-design-v1.product-v2-live .screen .summary-personal-value.is-debt .amount {
    color: #f5c98a !important;
  }

  html.circle-design-v1 .event-workspace-nav {
    position: sticky !important;
    inset-block-start: calc(60px + env(safe-area-inset-top)) !important;
    z-index: 70 !important;
    width: 100% !important;
    min-height: 52px !important;
    display: flex !important;
    align-items: stretch !important;
    gap: 0 !important;
    margin: 0 0 20px !important;
    padding: 0 !important;
    overflow-x: auto !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 6px 16px rgba(20, 31, 29, 0.07) !important;
    scrollbar-width: none;
  }

  html.circle-design-v1 .event-workspace-nav::-webkit-scrollbar {
    display: none;
  }

  html.circle-design-v1 .event-workspace-tab {
    position: relative !important;
    min-width: 96px !important;
    min-height: 50px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 0 14px !important;
    border: 0 !important;
    border-inline-start: 1px solid var(--circle-line) !important;
    border-radius: 0 !important;
    color: var(--circle-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    text-decoration: none !important;
  }

  html.circle-design-v1 .event-workspace-tab:first-child {
    border-inline-start: 0 !important;
  }

  html.circle-design-v1 .event-workspace-tab:hover,
  html.circle-design-v1 .event-workspace-tab.is-active,
  html.circle-design-v1 .event-workspace-tab[aria-current="page"] {
    color: var(--circle-brand) !important;
    background: var(--circle-mint-soft) !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="event"] .event-header-actions {
    width: auto !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .event-settings-button {
    width: auto !important;
    min-width: 0 !important;
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    padding-inline: 14px !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .event-type-guide {
    display: flex !important;
    align-items: flex-start !important;
    gap: 14px !important;
    margin: 0 0 18px !important;
    padding: 16px 18px !important;
    border: 0 !important;
    border-inline-start: 3px solid var(--circle-mint) !important;
    border-radius: 0 !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .event-type-guide strong {
    color: var(--circle-ink) !important;
  }

  html.circle-design-v1 .event-type-guide p {
    margin: 4px 0 0 !important;
    color: var(--circle-muted) !important;
    font-size: 13px !important;
    line-height: 1.5 !important;
  }

  html.circle-design-v1 .event-insight-panel {
    display: grid !important;
    grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr) !important;
    gap: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  html.circle-design-v1 .event-insight-main {
    display: grid !important;
    justify-items: start !important;
    align-content: center !important;
    gap: 10px !important;
    padding: 24px !important;
  }

  html.circle-design-v1 .event-insight-main h2 {
    margin: 0 !important;
    font-size: 24px !important;
  }

  html.circle-design-v1 .event-insight-main p {
    margin: 0 !important;
    line-height: 1.5 !important;
  }

  html.circle-design-v1 .event-insight-main .primary-button,
  html.circle-design-v1 .event-insight-main .secondary-button {
    margin-top: 4px !important;
  }

  html.circle-design-v1 .event-insight-metrics {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    border-inline-start: 1px solid var(--circle-line) !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .event-insight-metrics > div {
    display: grid !important;
    align-content: center !important;
    gap: 5px !important;
    min-height: 92px !important;
    padding: 16px !important;
    border-inline-start: 1px solid var(--circle-line) !important;
    border-bottom: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1 .event-insight-metrics span {
    color: var(--circle-muted) !important;
    font-size: 11px !important;
  }

  html.circle-design-v1 .event-insight-metrics strong {
    color: var(--circle-ink) !important;
    font-size: 16px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .event-command-grid {
    display: none !important;
  }

  html.circle-design-v1 .expense-day-group {
    display: grid !important;
    gap: 0 !important;
  }

  html.circle-design-v1 .expense-day-heading {
    min-height: 42px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 0 16px !important;
    border-bottom: 1px solid var(--circle-line) !important;
    color: var(--circle-muted) !important;
    background: var(--circle-surface-soft) !important;
    font-size: 12px !important;
  }

  html.circle-design-v1 .expense-row,
  html.circle-design-v1 .group-row,
  html.circle-design-v1 .transfer-row,
  html.circle-design-v1 .balance-row {
    min-height: 76px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 18px !important;
    padding: 15px 17px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--circle-line) !important;
    border-radius: 0 !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .expense-row:last-child,
  html.circle-design-v1 .group-row:last-child,
  html.circle-design-v1 .transfer-row:last-child,
  html.circle-design-v1 .balance-row:last-child {
    border-bottom: 0 !important;
  }

  html.circle-design-v1 .expense-row > span:first-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.circle-design-v1 .expense-row strong {
    color: var(--circle-ink) !important;
    font-weight: 650 !important;
  }

  html.circle-design-v1 .expense-row small {
    overflow: hidden !important;
    color: var(--circle-muted) !important;
    font-size: 11.5px !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .expense-actions {
    display: flex !important;
    align-items: center !important;
    justify-content: end !important;
    gap: 8px !important;
  }

  html.circle-design-v1 .expense-actions .amount {
    margin-inline-end: 8px !important;
    color: var(--circle-ink) !important;
    font-size: 16px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .expense-actions .secondary-button {
    min-height: 38px !important;
    padding-inline: 12px !important;
    font-size: 12px !important;
  }

  html.circle-design-v1 .event-start-panel,
  html.circle-design-v1 .create-event-panel,
  html.circle-design-v1 .join-event-panel,
  html.circle-design-v1 .profile-setup-panel,
  html.circle-design-v1 .personal-settlement,
  html.circle-design-v1 .settlement-hero {
    padding: 24px !important;
  }

  html.circle-design-v1 .event-start-panel {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 20px !important;
  }

  html.circle-design-v1 .event-start-copy h2 {
    margin: 10px 0 4px !important;
  }

  html.circle-design-v1 .event-start-copy p {
    margin: 0 !important;
    color: var(--circle-muted) !important;
  }

  html.circle-design-v1 .event-start-secondary {
    grid-column: 1 / -1 !important;
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 8px !important;
    padding-top: 16px !important;
    border-top: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1 .command-card-icon {
    width: 20px !important;
    height: 20px !important;
    display: inline-grid !important;
    place-items: center !important;
  }

  html.circle-design-v1 .command-card-icon svg {
    width: 20px !important;
    height: 20px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.8 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.circle-design-v1 .event-creation-progress {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 0 !important;
    margin: 0 0 20px !important;
    padding: 0 !important;
    list-style: none !important;
  }

  html.circle-design-v1 .event-creation-progress li {
    min-height: 48px !important;
    display: flex !important;
    align-items: center !important;
    gap: 9px !important;
    padding: 0 14px !important;
    border-bottom: 2px solid var(--circle-line) !important;
    color: var(--circle-muted) !important;
  }

  html.circle-design-v1 .event-creation-progress li.is-active,
  html.circle-design-v1 .event-creation-progress li.is-complete {
    border-bottom-color: var(--circle-brand) !important;
    color: var(--circle-brand) !important;
  }

  html.circle-design-v1 .event-creation-progress li > span {
    width: 26px !important;
    height: 26px !important;
    display: inline-grid !important;
    place-items: center !important;
    border-radius: 50% !important;
    color: var(--circle-brand) !important;
    background: var(--circle-mint-soft) !important;
    font-size: 12px !important;
    font-weight: 700 !important;
  }

  html.circle-design-v1 .event-type-options {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 12px !important;
  }

  html.circle-design-v1 .event-type-option {
    min-height: 170px !important;
    display: grid !important;
    align-content: start !important;
    justify-items: start !important;
    gap: 9px !important;
    padding: 20px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.circle-design-v1 .event-type-option:hover,
  html.circle-design-v1 .event-type-option.is-active {
    border-color: var(--circle-brand) !important;
    background: var(--circle-mint-soft) !important;
    box-shadow: 0 0 0 2px rgba(11, 79, 73, 0.1) !important;
    transform: none !important;
  }

  html.circle-design-v1 .studio-event-type-icon {
    width: 38px !important;
    height: 38px !important;
    display: grid !important;
    place-items: center !important;
    margin-bottom: 8px !important;
    border-radius: 50% !important;
    color: var(--circle-brand) !important;
    background: var(--circle-mint-soft) !important;
  }

  html.circle-design-v1 .studio-event-type-icon svg {
    width: 21px !important;
    height: 21px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.8 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.circle-design-v1 .event-type-option strong {
    font-size: 18px !important;
  }

  html.circle-design-v1 .event-type-option span {
    color: var(--circle-muted) !important;
    font-size: 13px !important;
    line-height: 1.45 !important;
  }

  html.circle-design-v1 .create-event-panel,
  html.circle-design-v1 .join-event-panel,
  html.circle-design-v1 .profile-setup-panel {
    display: grid !important;
    gap: 20px !important;
  }

  html.circle-design-v1 .new-event-participants {
    overflow: hidden !important;
    border: 1px solid var(--circle-line-strong) !important;
    border-radius: 10px !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .new-event-participants > summary {
    min-height: 64px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 16px !important;
    padding: 12px 16px !important;
    color: var(--circle-ink) !important;
    cursor: pointer !important;
    list-style: none !important;
  }

  html.circle-design-v1 .new-event-participants > summary::-webkit-details-marker {
    display: none !important;
  }

  html.circle-design-v1 .new-event-participants > summary:hover {
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .new-event-participants > summary:focus-visible {
    outline: 3px solid rgba(11, 79, 73, 0.28) !important;
    outline-offset: -3px !important;
  }

  html.circle-design-v1 .new-event-participants-summary {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.circle-design-v1 .new-event-participants-summary strong {
    font-size: 15px !important;
  }

  html.circle-design-v1 .new-event-participants-summary > span {
    color: var(--circle-muted) !important;
    font-size: 13px !important;
  }

  html.circle-design-v1 .new-event-participants-action {
    flex: 0 0 auto !important;
    color: var(--circle-brand) !important;
    font-size: 13px !important;
    font-weight: 650 !important;
  }

  html.circle-design-v1 .new-event-participants-body {
    display: grid !important;
    gap: 18px !important;
    padding: 18px 16px !important;
    border-top: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1 .new-event-participant-picker {
    display: grid !important;
    gap: 10px !important;
  }

  html.circle-design-v1 .new-event-participant-picker h3 {
    margin: 0 !important;
    font-size: 15px !important;
  }

  html.circle-design-v1 .participant-pill {
    position: relative !important;
    min-height: 48px !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 9px !important;
    padding: 0 14px !important;
    border: 1px solid var(--circle-line-strong) !important;
    border-radius: 999px !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .participant-pill input[type="checkbox"],
  html.circle-design-v1 .participant-pill input[type="radio"] {
    position: absolute !important;
    width: 1px !important;
    min-width: 1px !important;
    height: 1px !important;
    min-height: 1px !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    clip: rect(0 0 0 0) !important;
    opacity: 0 !important;
  }

  html.circle-design-v1 .participant-pill[aria-pressed="true"],
  html.circle-design-v1 .participant-pill.is-selected,
  html.circle-design-v1 .participant-pill:has(input:checked) {
    border-color: var(--circle-brand) !important;
    color: var(--circle-brand) !important;
    background: var(--circle-mint-soft) !important;
  }

  html.circle-design-v1 .participant-pill:has(input:focus-visible) {
    outline: 3px solid rgba(11, 79, 73, 0.28) !important;
    outline-offset: 2px !important;
  }

  html.circle-design-v1 .participant-pill .avatar {
    display: none !important;
  }

  html.circle-design-v1 .event-modal-backdrop,
  html.circle-design-v1 .expense-modal-backdrop {
    position: fixed !important;
    inset: 0 !important;
    z-index: 500 !important;
    display: grid !important;
    place-items: center !important;
    padding: 24px !important;
    background: rgba(20, 31, 29, 0.58) !important;
    backdrop-filter: none !important;
  }

  html.circle-design-v1 .event-modal,
  html.circle-design-v1 .expense-modal {
    width: min(100%, 660px) !important;
    max-height: min(88dvh, 880px) !important;
    overflow: auto !important;
    overscroll-behavior: contain !important;
    padding: 26px !important;
    border: 0 !important;
    border-radius: 16px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-float) !important;
  }

  html.circle-design-v1 .expense-modal {
    width: min(100%, 720px) !important;
  }

  html.circle-design-v1 .event-modal-header,
  html.circle-design-v1 .expense-modal-header {
    position: sticky !important;
    inset-block-start: -26px !important;
    z-index: 5 !important;
    display: flex !important;
    align-items: flex-start !important;
    justify-content: space-between !important;
    gap: 20px !important;
    margin: -26px -26px 22px !important;
    padding: 22px 26px 18px !important;
    border-bottom: 1px solid var(--circle-line) !important;
    background: rgba(255, 255, 255, 0.98) !important;
    backdrop-filter: none !important;
  }

  html.circle-design-v1 .event-modal-header h2,
  html.circle-design-v1 .expense-modal-header h2 {
    margin: 0 !important;
    font-size: 26px !important;
  }

  html.circle-design-v1 .event-modal-header .muted,
  html.circle-design-v1 .expense-modal-header .muted {
    max-width: 52ch !important;
    margin: 6px 0 0 !important;
    font-size: 13px !important;
    line-height: 1.45 !important;
  }

  html.circle-design-v1 .event-modal-header > .icon-button,
  html.circle-design-v1 .modal-back-button {
    width: auto !important;
    min-width: 48px !important;
    min-height: 48px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 0 12px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: 10px !important;
    color: var(--circle-brand) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .expense-mode-switch,
  html.circle-design-v1 .quick-purpose-switch {
    width: 100% !important;
    margin-top: 12px !important;
    margin-bottom: 18px !important;
  }

  html.circle-design-v1 .expense-template-grid {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 8px !important;
    margin-top: 12px !important;
    margin-bottom: 16px !important;
    padding: 2px 1px 8px !important;
    overflow-x: auto !important;
    overscroll-behavior-inline: contain !important;
    scroll-padding-inline: 1px !important;
    scroll-snap-type: inline proximity !important;
    scrollbar-width: none !important;
    -webkit-overflow-scrolling: touch !important;
  }

  html.circle-design-v1 .expense-template-grid::-webkit-scrollbar {
    display: none !important;
  }

  html.circle-design-v1 .expense-template-grid .secondary-button {
    flex: 0 0 auto !important;
    min-height: 38px !important;
    padding-inline: 13px !important;
    border-radius: 6px !important;
    font-size: 13px !important;
    scroll-snap-align: start !important;
  }

  html.circle-design-v1 .expense-template-grid .secondary-button.is-active {
    border-color: var(--circle-brand) !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
  }

  html.circle-design-v1 .expense-total-field {
    position: relative !important;
    margin-bottom: 16px !important;
    padding: 18px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .expense-total-field input {
    min-height: 74px !important;
    padding: 8px 14px !important;
    border-color: transparent !important;
    color: var(--circle-brand) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-family: var(--font-num) !important;
    font-size: 40px !important;
    line-height: 48px !important;
    font-weight: 900 !important;
    font-variant-numeric: tabular-nums;
    text-align: center !important;
  }

  html.circle-design-v1 .expense-total-field input::placeholder {
    color: #7b8985 !important;
    font-family: var(--font-num) !important;
    font-size: 40px !important;
    font-weight: 900 !important;
  }

  html.circle-design-v1 .expense-details-panel {
    margin-top: 18px !important;
    overflow: hidden !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .expense-details-panel > summary {
    min-height: 0 !important;
    display: block !important;
    padding: 0 !important;
    cursor: pointer !important;
    list-style: none !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .expense-details-panel > summary::-webkit-details-marker {
    display: none !important;
  }

  html.circle-design-v1 .expense-details-summary-copy {
    display: grid !important;
  }

  html.circle-design-v1 .expense-details-summary-label {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0 0 0 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
  }

  html.circle-design-v1 .expense-detail-shortcut {
    min-height: 52px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 16px !important;
    padding: 0 14px !important;
    border-bottom: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1 .expense-detail-shortcut:last-child {
    border-bottom: 0 !important;
  }

  html.circle-design-v1 .expense-detail-shortcut > span {
    color: var(--circle-muted) !important;
    font-size: 13px !important;
    font-weight: 500 !important;
  }

  html.circle-design-v1 .expense-detail-shortcut > strong {
    min-width: 0 !important;
    overflow: hidden !important;
    color: var(--circle-ink) !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    text-align: end !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .expense-details-panel > summary:hover {
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .expense-details-body {
    padding: 18px !important;
    border-top: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1 .expense-details-toggle {
    display: none !important;
  }

  html.circle-design-v1 .payer-row,
  html.circle-design-v1 .quick-item-row {
    padding: 12px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .expense-guest-box,
  html.circle-design-v1 .quick-split-summary {
    padding: 18px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .expense-modal-actions {
    position: sticky !important;
    inset-block-end: -26px !important;
    z-index: 5 !important;
    display: flex !important;
    gap: 10px !important;
    margin: 24px -26px -26px !important;
    padding: 14px 26px calc(14px + env(safe-area-inset-bottom)) !important;
    border-top: 1px solid var(--circle-line) !important;
    background: rgba(255, 255, 255, 0.98) !important;
    backdrop-filter: none !important;
  }

  html.circle-design-v1 .expense-modal-actions .primary-button {
    flex: 1 !important;
  }

  html.circle-design-v1 .personal-settlement,
  html.circle-design-v1 .settlement-hero {
    margin-bottom: 16px !important;
  }

  html.circle-design-v1 .settlement-hero {
    color: #ffffff !important;
    border: 0 !important;
    background: var(--circle-brand) !important;
  }

  html.circle-design-v1 .settlement-hero h2,
  html.circle-design-v1 .settlement-hero h3,
  html.circle-design-v1 .settlement-hero .amount {
    color: #ffffff !important;
  }

  html.circle-design-v1 .settlement-hero .muted {
    color: rgba(255, 255, 255, 0.7) !important;
  }

  html.circle-design-v1 .account-auth-gate {
    direction: rtl !important;
    min-height: 100dvh !important;
    display: grid !important;
    place-items: center !important;
    padding: 28px !important;
    background: var(--circle-canvas) !important;
  }

  html.circle-design-v1 .account-auth-shell {
    width: min(100%, 940px) !important;
    min-height: 590px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 420px !important;
    overflow: hidden !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 18px 50px rgba(20, 31, 29, 0.12) !important;
  }

  html.circle-design-v1 .account-auth-brand {
    display: grid !important;
    align-content: space-between !important;
    gap: 30px !important;
    padding: 44px !important;
    border: 0 !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
  }

  html.circle-design-v1 .account-auth-mark {
    width: 58px !important;
    height: 58px !important;
    display: block !important;
    overflow: hidden !important;
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    border-radius: 12px !important;
    color: transparent !important;
    background: var(--circle-brand) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 #public-account-auth-gate .account-auth-brand h1 {
    max-width: 13ch !important;
    margin: 10px 0 14px !important;
    color: #ffffff !important;
    font-size: clamp(34px, 5vw, 48px) !important;
    font-weight: 700 !important;
    line-height: 1.08 !important;
  }

  html.circle-design-v1 #public-account-auth-gate .account-auth-brand .eyebrow {
    color: var(--circle-mint) !important;
  }

  html.circle-design-v1 #public-account-auth-gate .account-auth-brand p,
  html.circle-design-v1 .account-auth-brand ul {
    color: rgba(255, 255, 255, 0.72) !important;
  }

  html.circle-design-v1 .account-auth-brand li::before {
    color: var(--circle-mint) !important;
  }

  html.circle-design-v1 .account-auth-form-panel {
    display: grid !important;
    align-content: center !important;
    gap: 20px !important;
    padding: 40px !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .account-email-toggle {
    width: 100% !important;
    min-height: 48px !important;
    padding: 0 16px !important;
    border: 1px solid var(--circle-line-strong) !important;
    border-radius: var(--circle-radius-control) !important;
    color: var(--circle-brand) !important;
    background: var(--circle-surface) !important;
    font: inherit !important;
    font-size: 14px !important;
    font-weight: 650 !important;
    cursor: pointer !important;
  }

  html.circle-design-v1 .account-email-toggle:hover {
    border-color: #a9b8b3 !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .account-email-auth {
    display: grid !important;
    gap: 16px !important;
  }

  html.circle-design-v1 .account-email-auth[hidden] {
    display: none !important;
  }

  html.circle-design-v1 .account-auth-heading h2 {
    margin: 0 0 6px !important;
    font-size: 28px !important;
  }

  html.circle-design-v1 .account-auth-heading p,
  html.circle-design-v1 .account-auth-legal {
    color: var(--circle-muted) !important;
  }

  html.circle-design-v1 .account-google-button,
  html.circle-design-v1 .account-auth-submit {
    min-height: 52px !important;
    border-radius: var(--circle-radius-control) !important;
  }

  html.circle-design-v1 .account-auth-boot-card {
    min-width: 220px !important;
    display: grid !important;
    justify-items: center !important;
    gap: 14px !important;
    padding: 30px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-float) !important;
  }

  html.circle-design-v1 .account-auth-loader {
    border-color: var(--circle-line) !important;
    border-top-color: var(--circle-brand) !important;
  }

  html.circle-design-v1 .profile-setup-screen {
    width: min(100%, 680px) !important;
  }

  html.circle-design-v1 .profile-setup-panel {
    max-width: 540px !important;
    margin-inline: auto !important;
  }

  html.circle-design-v1 .invite-profile-preview {
    max-width: 540px !important;
    margin-inline: auto !important;
    padding: 18px !important;
  }

  @media (max-width: 820px) {
    html.circle-design-v1 .screen[data-product-screen="home"] > .top,
    html.circle-design-v1 .product-home-screen > .top {
      grid-template-columns: 1fr !important;
      align-items: start !important;
    }

    html.circle-design-v1 .screen > .top .hero-actions {
      grid-column: 1 !important;
      justify-self: start !important;
    }

    html.circle-design-v1 .event-insight-panel {
      grid-template-columns: 1fr !important;
    }

    html.circle-design-v1 .event-insight-metrics {
      border-inline-start: 0 !important;
      border-top: 1px solid var(--circle-line) !important;
    }

    html.circle-design-v1 .account-auth-shell {
      width: min(100%, 620px) !important;
      grid-template-columns: 1fr !important;
    }

    html.circle-design-v1 .account-auth-brand {
      align-content: start !important;
      padding: 30px !important;
    }

    html.circle-design-v1 .account-auth-brand ul {
      display: none !important;
    }

    html.circle-design-v1 #public-account-auth-gate .account-auth-brand h1 {
      max-width: none !important;
      font-size: 32px !important;
    }
  }

  @media (max-width: 660px) {
    html.circle-design-v1 .screen {
      padding-inline: 16px !important;
    }

    html.circle-design-v1 .product-app-identity {
      width: calc(100% + 32px) !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 8px !important;
      margin-inline: -16px !important;
      padding-inline: 16px !important;
    }

    html.circle-design-v1 .product-brand-mark {
      width: 36px !important;
      min-width: 36px !important;
      height: 36px !important;
    }

    html.circle-design-v1 .product-brand-copy strong {
      font-size: 16px !important;
    }

    html.circle-design-v1 .product-brand-copy small {
      display: none !important;
    }

    html.circle-design-v1 .product-app-nav {
      position: fixed !important;
      inset-inline: 0 !important;
      inset-block: auto 0 !important;
      z-index: 180 !important;
      width: 100% !important;
      min-height: calc(64px + env(safe-area-inset-bottom)) !important;
      display: grid !important;
      grid-template-columns: repeat(3, 1fr) !important;
      gap: 0 !important;
      padding: 6px 10px calc(6px + env(safe-area-inset-bottom)) !important;
      border-top: 1px solid var(--circle-line) !important;
      background: rgba(255, 255, 255, 0.98) !important;
      box-shadow: 0 -8px 24px rgba(20, 31, 29, 0.08) !important;
      backdrop-filter: none !important;
    }

    html.circle-design-v1 .product-nav-button {
      width: 100% !important;
      min-width: 0 !important;
      min-height: 52px !important;
      display: grid !important;
      grid-template-rows: 22px auto !important;
      justify-items: center !important;
      align-content: center !important;
      gap: 3px !important;
      padding: 3px 6px !important;
      border-radius: 9px !important;
      color: var(--circle-muted) !important;
      background: transparent !important;
      font-size: 10px !important;
    }

    html.circle-design-v1 .product-nav-button > span {
      position: static !important;
      width: auto !important;
      height: auto !important;
      overflow: visible !important;
      clip: auto !important;
      white-space: nowrap !important;
    }

    html.circle-design-v1 .product-nav-button:hover,
    html.circle-design-v1 .product-nav-button.is-active,
    html.circle-design-v1 .product-nav-button[aria-current="page"] {
      color: var(--circle-brand) !important;
      background: var(--circle-mint-soft) !important;
    }

    html.circle-design-v1 .product-home-screen .product-nav-button[data-action="join-event-screen"],
    html.circle-design-v1 .screen[data-product-screen="home"] .product-nav-button[data-action="join-event-screen"] {
      display: grid !important;
    }

    html.circle-design-v1 .product-route-controls {
      grid-column: 2 !important;
    }

    html.circle-design-v1 .screen > .top {
      margin-inline: -16px !important;
      padding: 24px 16px 20px !important;
    }

    html.circle-design-v1 .screen[data-product-screen="home"] > .top,
    html.circle-design-v1 .product-home-screen > .top {
      min-height: 0 !important;
      gap: 22px !important;
      padding: 28px 16px !important;
    }

    html.circle-design-v1 .screen[data-product-screen="home"] > .top h1,
    html.circle-design-v1 .product-home-screen > .top h1 {
      font-size: 36px !important;
    }

    html.circle-design-v1 .screen > .top .hero-actions {
      width: 100% !important;
      display: grid !important;
      grid-template-columns: 1.15fr 1fr !important;
      gap: 8px !important;
    }

    html.circle-design-v1 .screen > .top .hero-actions button {
      width: 100% !important;
      min-width: 0 !important;
      padding-inline: 12px !important;
      white-space: normal !important;
    }

    html.circle-design-v1.product-studio-v3 .screen.circle-home-has-recent > .top > .hero-actions button {
      min-height: 52px !important;
      padding-inline: 8px !important;
      font-size: 13px !important;
      line-height: 1.18 !important;
      white-space: normal !important;
    }

    html.circle-design-v1.product-studio-v3 .screen.circle-home-has-recent > .top > .hero-actions .button-action-icon {
      flex: 0 0 auto !important;
    }

    html.circle-design-v1 .recent-event-shortcut {
      grid-template-columns: 1fr !important;
      gap: 16px !important;
    }

    html.circle-design-v1 .recent-event-action {
      width: 100% !important;
      grid-template-columns: 1fr !important;
      align-items: stretch !important;
      justify-items: stretch !important;
    }

    html.circle-design-v1 .recent-event-shortcut .primary-button {
      width: 100% !important;
    }

    html.circle-design-v1 .personal-dashboard {
      grid-template-columns: 1fr !important;
    }

    html.circle-design-v1 .personal-balance-main {
      min-height: 146px !important;
    }

    html.circle-design-v1 .personal-balance-details {
      grid-template-columns: repeat(3, 1fr) !important;
    }

    html.circle-design-v1 .personal-balance-details > div {
      min-width: 0 !important;
      min-height: 74px !important;
      padding: 12px 10px !important;
      border-inline-start: 1px solid var(--circle-line) !important;
      border-bottom: 0 !important;
    }

    html.circle-design-v1 .personal-balance-details strong {
      overflow: hidden !important;
      font-size: 14px !important;
      text-overflow: ellipsis !important;
    }

    html.circle-design-v1 .section-title-row {
      align-items: start !important;
      flex-direction: column !important;
    }

    html.circle-design-v1 .section-title-row .segmented-control {
      width: 100% !important;
    }

    html.circle-design-v1 .event-row {
      gap: 12px !important;
      padding: 15px 14px !important;
    }

    html.circle-design-v1 .event-row .avatar-stack {
      display: flex !important;
    }

    html.circle-design-v1 .event-row-side .amount {
      font-size: 14px !important;
    }

    html.circle-design-v1 .screen.circle-home-has-recent > .top {
      gap: 12px !important;
      padding: 16px !important;
    }

    html.circle-design-v1 .screen.circle-home-has-recent > .top > .hero-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1 .summary-strip {
      grid-template-columns: 1.4fr 1fr !important;
    }

    html.circle-design-v1 .summary-item {
      min-height: 84px !important;
      padding: 15px !important;
    }

    html.circle-design-v1 .summary-item:nth-child(n + 3) {
      display: none !important;
    }

    html.circle-design-v1.product-studio-v3 .screen .summary-strip,
    html.circle-design-v1.product-v2-live .screen .summary-strip {
      grid-template-columns: 1.35fr 1fr !important;
    }

    html.circle-design-v1.product-studio-v3 .screen .summary-item,
    html.circle-design-v1.product-v2-live .screen .summary-item {
      min-height: 84px !important;
      padding: 15px !important;
    }

    html.circle-design-v1.product-studio-v3 .screen .summary-item:nth-child(n + 3),
    html.circle-design-v1.product-v2-live .screen .summary-item:nth-child(n + 3) {
      display: none !important;
    }

    html.circle-design-v1 .event-workspace-nav {
      width: calc(100% + 32px) !important;
      margin-inline: -16px !important;
      border-inline: 0 !important;
      border-radius: 0 !important;
    }

    html.circle-design-v1 .event-workspace-tab {
      min-width: 88px !important;
      padding-inline: 12px !important;
    }

    html.circle-design-v1 .event-insight-main {
      padding: 20px !important;
    }

    html.circle-design-v1 .event-insight-metrics > div {
      min-height: 78px !important;
      padding: 13px !important;
    }

    html.circle-design-v1 .expense-row {
      align-items: start !important;
      gap: 12px !important;
      padding: 14px !important;
    }

    html.circle-design-v1 .expense-actions {
      display: grid !important;
      grid-template-columns: repeat(2, auto) !important;
      gap: 6px !important;
    }

    html.circle-design-v1 .expense-actions .amount {
      grid-column: 1 / -1 !important;
      justify-self: end !important;
      margin: 0 0 3px !important;
    }

    html.circle-design-v1 .event-start-panel {
      grid-template-columns: 1fr !important;
      padding: 20px !important;
    }

    html.circle-design-v1 .event-start-primary {
      width: 100% !important;
    }

    html.circle-design-v1 .event-start-secondary {
      display: grid !important;
      grid-template-columns: 1fr !important;
    }

    html.circle-design-v1 .event-type-options {
      grid-template-columns: 1fr !important;
    }

    html.circle-design-v1 .event-type-option {
      min-height: 116px !important;
      grid-template-columns: auto 1fr !important;
      grid-template-rows: auto auto !important;
      align-items: center !important;
    }

    html.circle-design-v1 .studio-event-type-icon {
      grid-row: 1 / span 2 !important;
      margin: 0 !important;
    }

    html.circle-design-v1 .event-modal-backdrop,
    html.circle-design-v1 .expense-modal-backdrop {
      place-items: stretch !important;
      padding: 0 !important;
      background: var(--circle-surface) !important;
    }

    html.circle-design-v1 .event-modal,
    html.circle-design-v1 .expense-modal {
      width: 100% !important;
      max-width: none !important;
      height: 100dvh !important;
      max-height: none !important;
      padding: 20px 16px !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    html.circle-design-v1 .event-modal-header,
    html.circle-design-v1 .expense-modal-header {
      inset-block-start: -20px !important;
      margin: -20px -16px 20px !important;
      padding: calc(12px + env(safe-area-inset-top)) 16px 14px !important;
    }

    html.circle-design-v1 .event-modal-header h2,
    html.circle-design-v1 .expense-modal-header h2 {
      font-size: 23px !important;
    }

    html.circle-design-v1 .expense-modal-actions {
      inset-block-end: -20px !important;
      margin: 22px -16px -20px !important;
      padding: 12px 16px calc(12px + env(safe-area-inset-bottom)) !important;
    }

    html.circle-design-v1 .expense-total-field input {
      font-size: 40px !important;
    }

    html.circle-design-v1 .home-empty-visual {
      min-height: 0 !important;
      grid-template-columns: 1fr 96px !important;
      padding: 18px !important;
    }

    html.circle-design-v1 .home-empty-visual img {
      width: 96px !important;
      height: 96px !important;
    }

    html.circle-design-v1 .account-auth-gate {
      place-items: stretch !important;
      padding: 0 !important;
      background: var(--circle-surface) !important;
    }

    html.circle-design-v1 .account-auth-shell {
      width: 100% !important;
      min-height: 100dvh !important;
      grid-template-rows: auto minmax(0, 1fr) !important;
      align-content: start !important;
      overflow: visible !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    html.circle-design-v1 .account-auth-brand {
      min-height: calc(80px + env(safe-area-inset-top)) !important;
      max-height: none !important;
      grid-template-columns: auto minmax(0, 1fr) !important;
      align-items: center !important;
      align-content: center !important;
      gap: 12px !important;
      padding: calc(16px + env(safe-area-inset-top)) 22px 16px !important;
      overflow: visible !important;
    }

    html.circle-design-v1 .account-auth-mark {
      width: 48px !important;
      height: 48px !important;
    }

    html.circle-design-v1 .account-auth-brand > div {
      min-width: 0 !important;
      display: block !important;
    }

    html.circle-design-v1 #public-account-auth-gate .account-auth-brand .eyebrow {
      display: block !important;
      margin: 0 !important;
      color: #ffffff !important;
      font-size: 18px !important;
      font-weight: 700 !important;
    }

    html.circle-design-v1 #public-account-auth-gate .account-auth-brand h1 {
      display: none !important;
    }

    html.circle-design-v1 #public-account-auth-gate .account-auth-brand > div > p:last-child {
      display: none !important;
    }

    html.circle-design-v1 .account-auth-form-panel {
      padding: 26px 20px calc(80px + env(safe-area-inset-bottom)) !important;
    }

    html.circle-design-v1 .notice {
      inset-block: auto calc(78px + env(safe-area-inset-bottom)) !important;
      inset-inline: 16px !important;
      width: fit-content !important;
      max-width: calc(100% - 32px) !important;
      margin: 0 auto !important;
      box-shadow: 0 10px 26px rgba(20, 31, 29, 0.16) !important;
    }
  }

  @media (max-width: 390px) {
    html.circle-design-v1 .product-brand-copy strong {
      font-size: 15px !important;
    }

    html.circle-design-v1 .product-route-controls > .app-back-button,
    html.circle-design-v1 .product-route-controls > .product-home-button {
      width: 40px !important;
      min-width: 40px !important;
      height: 40px !important;
      min-height: 40px !important;
    }

    html.circle-design-v1 .screen[data-product-screen="home"] > .top .hero-actions,
    html.circle-design-v1 .product-home-screen > .top .hero-actions {
      grid-template-columns: 1fr !important;
    }

    html.circle-design-v1 .screen.circle-home-has-recent > .top > .hero-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1 .personal-balance-details span {
      font-size: 10px !important;
    }

    html.circle-design-v1 .personal-balance-details strong {
      font-size: 12.5px !important;
    }

    html.circle-design-v1 .event-row small {
      display: -webkit-box !important;
      white-space: normal !important;
      -webkit-box-orient: vertical !important;
      -webkit-line-clamp: 2 !important;
    }
  }

  /* Responsive hardening: keep finance and management content inside narrow screens. */
  html.circle-design-v1.product-studio-v3 .screen .summary-strip,
  html.circle-design-v1.product-v2-live .screen .summary-strip {
    min-width: 0 !important;
    gap: 0 !important;
  }

  html.circle-design-v1.product-studio-v3 .screen .summary-item,
  html.circle-design-v1.product-v2-live .screen .summary-item {
    min-width: 0 !important;
  }

  html.circle-design-v1 .invite-link-row input {
    direction: ltr !important;
    text-align: left !important;
    unicode-bidi: plaintext !important;
  }

  @media (max-width: 820px) {
    html.circle-design-v1.product-studio-v3 .event-insight-panel,
    html.circle-design-v1.product-v2-live .event-insight-panel {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1.product-studio-v3 .event-insight-main,
    html.circle-design-v1.product-studio-v3 .event-insight-metrics,
    html.circle-design-v1.product-v2-live .event-insight-main,
    html.circle-design-v1.product-v2-live .event-insight-metrics {
      width: 100% !important;
      min-width: 0 !important;
    }

    html.circle-design-v1.product-studio-v3 .event-insight-metrics,
    html.circle-design-v1.product-v2-live .event-insight-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 430px) {
    html.circle-design-v1.product-studio-v3 .event-row,
    html.circle-design-v1.product-v2-live .event-row {
      grid-template-columns: minmax(0, 1fr) !important;
      align-items: start !important;
      gap: 12px !important;
      overflow: hidden !important;
    }

    html.circle-design-v1 .event-row-main,
    html.circle-design-v1 .event-row-title,
    html.circle-design-v1 .event-row-side {
      width: 100% !important;
      min-width: 0 !important;
    }

    html.circle-design-v1 .event-row-title {
      flex-wrap: wrap !important;
      align-items: flex-start !important;
    }

    html.circle-design-v1 .event-row-title strong,
    html.circle-design-v1 .event-row-main > small {
      min-width: 0 !important;
      white-space: normal !important;
      overflow-wrap: anywhere !important;
    }

    html.circle-design-v1 .event-row-side {
      grid-template-columns: minmax(0, 1fr) auto !important;
      align-items: end !important;
    }

    html.circle-design-v1 [data-action="event-status-filter"] {
      min-height: 44px !important;
    }

    html.circle-design-v1.product-studio-v3 .group-row,
    html.circle-design-v1.product-v2-live .group-row {
      grid-template-columns: minmax(0, 1fr) !important;
      align-items: start !important;
      gap: 12px !important;
    }

    html.circle-design-v1 .group-row > :first-child,
    html.circle-design-v1 .known-participant-main,
    html.circle-design-v1 .known-participant-main > span:last-child {
      width: 100% !important;
      min-width: 0 !important;
      overflow-wrap: anywhere !important;
    }

    html.circle-design-v1 .known-participant-main {
      display: grid !important;
      grid-template-columns: 36px minmax(0, 1fr) !important;
      align-items: center !important;
    }

    html.circle-design-v1 .known-participant-main > .avatar {
      width: 36px !important;
      min-width: 36px !important;
      height: 36px !important;
    }

    html.circle-design-v1.product-studio-v3 .expense-row,
    html.circle-design-v1.product-v2-live .expense-row {
      grid-template-columns: minmax(0, 1fr) !important;
      align-items: start !important;
      gap: 10px !important;
    }

    html.circle-design-v1 .expense-row > :first-child,
    html.circle-design-v1 .expense-row > :first-child small {
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      white-space: normal !important;
      overflow-wrap: anywhere !important;
    }

    html.circle-design-v1 .expense-row .expense-actions {
      width: 100% !important;
      justify-content: flex-start !important;
      flex-wrap: wrap !important;
    }

    html.circle-design-v1 .group-row .section-title-actions {
      width: 100% !important;
      justify-content: flex-start !important;
    }

    html.circle-design-v1 .known-participant-row > .danger-button {
      justify-self: start !important;
    }

    html.circle-design-v1.product-studio-v3 .screen .summary-strip,
    html.circle-design-v1.product-v2-live .screen .summary-strip {
      grid-template-columns: 1.2fr 1fr !important;
    }

    html.circle-design-v1.product-studio-v3 .screen .summary-item,
    html.circle-design-v1.product-v2-live .screen .summary-item {
      padding: 12px 10px !important;
    }

    html.circle-design-v1 .summary-item strong,
    html.circle-design-v1 .summary-item .amount {
      font-size: 16px !important;
    }

    html.circle-design-v1 .summary-item:first-child strong,
    html.circle-design-v1 .summary-item:first-child .amount {
      font-size: 22px !important;
    }
  }

  @media (max-width: 390px) {
    html.circle-design-v1 .product-route-controls > .app-back-button,
    html.circle-design-v1 .product-route-controls > .product-home-button {
      width: 44px !important;
      min-width: 44px !important;
      height: 44px !important;
      min-height: 44px !important;
    }
  }

  html.circle-design-v1 .settlement-screen {
    width: min(100%, 900px) !important;
  }

  html.circle-design-v1 .settlement-screen .personal-settlement {
    display: grid !important;
    gap: 18px !important;
    margin: 18px 0 14px !important;
    padding: 22px !important;
    border-color: var(--circle-line-strong) !important;
    background: #fbfdfc !important;
    box-shadow: 0 1px 2px rgba(4, 47, 43, 0.04) !important;
  }

  html.circle-design-v1 .settlement-screen .personal-settlement.is-balanced {
    gap: 4px !important;
    border-inline-start: 4px solid var(--circle-positive) !important;
    background: #f7fcfa !important;
  }

  html.circle-design-v1 .settlement-screen .personal-settlement h2,
  html.circle-design-v1 .settlement-screen .personal-settlement p {
    margin: 0 !important;
  }

  html.circle-design-v1 .settlement-screen .personal-settlement h2 {
    font-size: 22px !important;
  }

  html.circle-design-v1 .settlement-screen .personal-settlement p {
    color: var(--circle-muted) !important;
    font-size: 13px !important;
  }

  html.circle-design-v1 .personal-settlement-heading {
    display: grid !important;
    gap: 4px !important;
  }

  html.circle-design-v1 .personal-settlement-eyebrow {
    color: var(--circle-brand) !important;
    font-size: 11px !important;
    font-weight: 700 !important;
  }

  html.circle-design-v1 .personal-settlement-list {
    display: grid !important;
    gap: 10px !important;
  }

  html.circle-design-v1 .personal-settlement-row {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto auto !important;
    align-items: center !important;
    gap: 16px !important;
    overflow: hidden !important;
    padding: 16px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .personal-settlement-row.is-debt {
    border-inline-start: 4px solid var(--circle-debt) !important;
  }

  html.circle-design-v1 .personal-settlement-row.is-credit {
    border-inline-start: 4px solid var(--circle-positive) !important;
  }

  html.circle-design-v1 .personal-settlement-copy {
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
  }

  html.circle-design-v1 .personal-settlement-copy > span:last-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.circle-design-v1 .personal-settlement-copy strong {
    overflow-wrap: anywhere !important;
    color: var(--circle-ink) !important;
    font-size: 15px !important;
    font-weight: 650 !important;
  }

  html.circle-design-v1 .personal-settlement-copy small {
    color: var(--circle-muted) !important;
    font-size: 11px !important;
  }

  html.circle-design-v1 .personal-settlement-row > .amount {
    color: var(--circle-ink) !important;
    font-size: 22px !important;
    font-weight: 650 !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .personal-settlement-actions {
    display: flex !important;
  }

  html.circle-design-v1 .personal-settlement-actions .primary-button {
    min-height: 44px !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .settlement-screen .settlement-hero {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(250px, 0.72fr) !important;
    align-items: stretch !important;
    gap: 24px !important;
    margin: 0 0 14px !important;
    padding: 24px !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    background: var(--circle-brand) !important;
    box-shadow: 0 12px 30px rgba(4, 47, 43, 0.13) !important;
  }

  html.circle-design-v1 .settlement-hero-main {
    min-width: 0 !important;
    display: grid !important;
    align-content: start !important;
    gap: 16px !important;
  }

  html.circle-design-v1 .settlement-hero-title-row {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: end !important;
    gap: 24px !important;
  }

  html.circle-design-v1 .settlement-hero-title-row h2 {
    margin: 0 0 6px !important;
    font-size: 25px !important;
  }

  html.circle-design-v1 .settlement-hero-title-row p {
    max-width: 52ch !important;
    margin: 0 !important;
    font-size: 13px !important;
    line-height: 1.55 !important;
  }

  html.circle-design-v1 .settlement-hero-total {
    min-width: 142px !important;
    display: grid !important;
    gap: 4px !important;
    padding-inline-start: 20px !important;
    border-inline-start: 1px solid rgba(255, 255, 255, 0.18) !important;
  }

  html.circle-design-v1 .settlement-hero-total > span {
    color: rgba(255, 255, 255, 0.68) !important;
    font-size: 11px !important;
  }

  html.circle-design-v1 .settlement-hero-total .amount {
    font-size: 29px !important;
    font-weight: 650 !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .settlement-hero-actions {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    align-content: end !important;
    gap: 8px !important;
  }

  html.circle-design-v1 .settlement-hero-actions button {
    width: 100% !important;
    min-height: 44px !important;
    padding-inline: 12px !important;
    border-color: rgba(255, 255, 255, 0.28) !important;
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.08) !important;
    box-shadow: none !important;
    font-size: 12px !important;
  }

  html.circle-design-v1 .settlement-hero-actions button:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.48) !important;
    background: rgba(255, 255, 255, 0.14) !important;
    transform: translateY(-1px) !important;
  }

  html.circle-design-v1 .settlement-hero-actions .primary-button {
    border-color: var(--circle-mint) !important;
    color: var(--circle-brand-pressed) !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1 .settlement-stage {
    margin-top: 30px !important;
  }

  html.circle-design-v1 .settlement-stage-heading {
    display: flex !important;
    align-items: end !important;
    justify-content: space-between !important;
    gap: 18px !important;
    margin-bottom: 12px !important;
  }

  html.circle-design-v1 .settlement-stage-heading h2,
  html.circle-design-v1 .settlement-stage-heading p {
    margin: 0 !important;
  }

  html.circle-design-v1 .settlement-stage-heading h2 {
    margin-top: 4px !important;
    font-size: 24px !important;
  }

  html.circle-design-v1 .settlement-stage-heading p {
    margin-top: 5px !important;
    font-size: 13px !important;
  }

  html.circle-design-v1 .settlement-progress-chip {
    min-height: 34px !important;
    display: inline-flex !important;
    align-items: center !important;
    padding: 0 11px !important;
    border: 1px solid var(--circle-line-strong) !important;
    border-radius: 999px !important;
    color: var(--circle-brand) !important;
    background: var(--circle-surface) !important;
    font-size: 11px !important;
    font-weight: 650 !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .settlement-transfer-board {
    display: grid !important;
    gap: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--circle-line-strong) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 1px 2px rgba(4, 47, 43, 0.03), 0 10px 26px rgba(4, 47, 43, 0.055) !important;
  }

  html.circle-design-v1 .settlement-transfer-board .transfer-row {
    min-height: 88px !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 18px !important;
    padding: 18px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--circle-line) !important;
    background: var(--circle-surface) !important;
    transition: background-color var(--circle-motion) !important;
  }

  html.circle-design-v1 .settlement-transfer-board .transfer-row:last-child {
    border-bottom: 0 !important;
  }

  html.circle-design-v1 .settlement-transfer-board .transfer-row.is-pending:hover {
    background: #fbfdfc !important;
  }

  html.circle-design-v1 .settlement-transfer-board .transfer-row.is-paid {
    background: #f7faf9 !important;
  }

  html.circle-design-v1 .settlement-transfer-board .transfer-row.is-personal {
    border-inline-start: 4px solid var(--circle-mint) !important;
    background: #f1faf7 !important;
  }

  html.circle-design-v1 .settlement-transfer-board .transfer-row.is-paid.is-personal {
    background: #f2f7f5 !important;
  }

  html.circle-design-v1 .transfer-main {
    min-width: 0 !important;
    display: grid !important;
    gap: 7px !important;
  }

  html.circle-design-v1 .transfer-people {
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    flex-wrap: wrap !important;
    gap: 8px !important;
  }

  html.circle-design-v1 .personal-transfer-badge {
    min-height: 24px !important;
    display: inline-flex !important;
    align-items: center !important;
    padding: 3px 8px !important;
    border: 1px solid rgba(16, 118, 103, 0.24) !important;
    border-radius: 999px !important;
    color: var(--circle-brand-pressed) !important;
    background: rgba(122, 224, 200, 0.2) !important;
    font-size: 11px !important;
    font-weight: 750 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .transfer-people strong {
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
    color: var(--circle-ink) !important;
    font-size: 14px !important;
    font-weight: 650 !important;
  }

  html.circle-design-v1 .transfer-arrow {
    width: 28px !important;
    min-width: 28px !important;
    height: 28px !important;
    display: inline-grid !important;
    place-items: center !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: 50% !important;
    color: var(--circle-brand) !important;
    background: var(--circle-surface-soft) !important;
    font-size: 14px !important;
  }

  html.circle-design-v1 .transfer-main > small {
    padding-inline-start: 42px !important;
    color: var(--circle-debt) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .transfer-main > small.status-paid {
    color: var(--circle-positive) !important;
  }

  html.circle-design-v1 .transfer-actions {
    display: flex !important;
    align-items: center !important;
    justify-content: end !important;
    gap: 12px !important;
  }

  html.circle-design-v1 .transfer-actions > .amount {
    color: var(--circle-ink) !important;
    font-size: 20px !important;
    font-weight: 650 !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .transfer-actions button {
    min-height: 44px !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .transfer-row.is-paid .transfer-actions > .amount,
  html.circle-design-v1 .transfer-row.is-paid .transfer-people strong {
    color: var(--circle-muted) !important;
  }

  html.circle-design-v1 .transfer-explanation {
    grid-column: 1 / -1 !important;
    margin: 2px -18px -18px !important;
    border-top: 1px solid var(--circle-line) !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .transfer-explanation > summary,
  html.circle-design-v1 .transfer-expense-breakdown > summary,
  html.circle-design-v1 .settlement-audit-details > summary {
    cursor: pointer !important;
    list-style: none !important;
    user-select: none !important;
  }

  html.circle-design-v1 .transfer-explanation > summary::-webkit-details-marker,
  html.circle-design-v1 .transfer-expense-breakdown > summary::-webkit-details-marker,
  html.circle-design-v1 .settlement-audit-details > summary::-webkit-details-marker {
    display: none !important;
  }

  html.circle-design-v1 .transfer-explanation > summary {
    min-height: 46px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding: 0 18px !important;
    color: var(--circle-brand) !important;
    font-size: 12px !important;
    font-weight: 650 !important;
  }

  html.circle-design-v1 .transfer-explanation > summary::after,
  html.circle-design-v1 .transfer-expense-breakdown > summary::after,
  html.circle-design-v1 .settlement-audit-details > summary::after {
    content: "+" !important;
    color: currentColor !important;
    font-size: 18px !important;
    font-weight: 400 !important;
    line-height: 1 !important;
  }

  html.circle-design-v1 .transfer-explanation[open] > summary::after,
  html.circle-design-v1 .transfer-expense-breakdown[open] > summary::after,
  html.circle-design-v1 .settlement-audit-details[open] > summary::after {
    content: "−" !important;
  }

  html.circle-design-v1 .transfer-explanation > summary:hover {
    background: rgba(223, 246, 238, 0.6) !important;
  }

  html.circle-design-v1 .transfer-explanation > summary:focus-visible,
  html.circle-design-v1 .transfer-expense-breakdown > summary:focus-visible,
  html.circle-design-v1 .settlement-audit-details > summary:focus-visible {
    outline: 3px solid rgba(11, 79, 73, 0.2) !important;
    outline-offset: -3px !important;
  }

  html.circle-design-v1 .transfer-explanation-body {
    display: grid !important;
    gap: 14px !important;
    padding: 4px 18px 18px !important;
  }

  html.circle-design-v1 .transfer-equation {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr) !important;
    align-items: stretch !important;
    gap: 8px !important;
    direction: rtl !important;
  }

  html.circle-design-v1 .transfer-equation-item {
    min-width: 0 !important;
    min-height: 72px !important;
    display: grid !important;
    align-content: center !important;
    gap: 5px !important;
    padding: 12px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .transfer-equation-item.is-result {
    border-color: rgba(14, 122, 84, 0.22) !important;
    background: var(--circle-mint-soft) !important;
  }

  html.circle-design-v1 .transfer-equation-item span {
    color: var(--circle-muted) !important;
    font-size: 10px !important;
  }

  html.circle-design-v1 .transfer-equation-item strong {
    color: var(--circle-ink) !important;
    font-size: 16px !important;
    font-weight: 650 !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .transfer-equation-sign {
    align-self: center !important;
    color: var(--circle-faint) !important;
    font-size: 17px !important;
  }

  html.circle-design-v1 .transfer-route-note,
  html.circle-design-v1 .transfer-minimization-note {
    margin: 0 !important;
    color: var(--circle-muted) !important;
    font-size: 12px !important;
    line-height: 1.55 !important;
  }

  html.circle-design-v1 .transfer-route-note {
    color: var(--circle-ink) !important;
    font-weight: 550 !important;
  }

  html.circle-design-v1 .transfer-minimization-note {
    padding: 11px 12px !important;
    border-inline-start: 3px solid var(--circle-mint) !important;
    background: rgba(255, 255, 255, 0.62) !important;
  }

  html.circle-design-v1 .transfer-expense-breakdown {
    overflow: hidden !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .transfer-expense-breakdown > summary {
    min-height: 44px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding: 0 13px !important;
    color: var(--circle-ink) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .transfer-expense-share-list {
    display: grid !important;
    border-top: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1 .transfer-expense-share-row {
    min-height: 60px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 14px !important;
    padding: 11px 13px !important;
    border-bottom: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1 .transfer-expense-share-row:last-child {
    border-bottom: 0 !important;
  }

  html.circle-design-v1 .transfer-expense-share-row > span {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.circle-design-v1 .transfer-expense-share-row > span:last-child {
    justify-items: end !important;
  }

  html.circle-design-v1 .transfer-expense-share-row strong {
    overflow-wrap: anywhere !important;
    color: var(--circle-ink) !important;
    font-size: 12px !important;
  }

  html.circle-design-v1 .transfer-expense-share-row small {
    color: var(--circle-muted) !important;
    font-size: 10px !important;
  }

  html.circle-design-v1 .settlement-complete-state {
    min-height: 180px !important;
    display: grid !important;
    place-items: center !important;
    align-content: center !important;
    gap: 6px !important;
    padding: 28px !important;
    text-align: center !important;
  }

  html.circle-design-v1 .settlement-complete-state p {
    margin: 0 !important;
    color: var(--circle-muted) !important;
    font-size: 13px !important;
  }

  html.circle-design-v1 .settlement-complete-state > strong {
    color: var(--circle-ink) !important;
    font-size: 21px !important;
  }

  html.circle-design-v1 .settlement-complete-actions {
    margin-top: 10px !important;
  }

  html.circle-design-v1 .settlement-complete-actions button {
    min-height: 44px !important;
  }

  html.circle-design-v1 .settlement-complete-mark {
    width: 42px !important;
    height: 42px !important;
    display: grid !important;
    place-items: center !important;
    margin-bottom: 4px !important;
    border-radius: 50% !important;
    color: var(--circle-positive) !important;
    background: var(--circle-mint-soft) !important;
    font-size: 21px !important;
    font-weight: 700 !important;
  }

  html.circle-design-v1 .completed-transfers-details {
    overflow: hidden !important;
    margin-top: 10px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .completed-transfers-details > summary {
    cursor: pointer !important;
    min-height: 58px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto auto !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 9px 15px !important;
    list-style: none !important;
    color: var(--circle-ink) !important;
    user-select: none !important;
  }

  html.circle-design-v1 .completed-transfers-details > summary::-webkit-details-marker {
    display: none !important;
  }

  html.circle-design-v1 .completed-transfers-details > summary::after {
    content: "+" !important;
    color: var(--circle-brand) !important;
    font-size: 18px !important;
    font-weight: 400 !important;
    line-height: 1 !important;
  }

  html.circle-design-v1 .completed-transfers-details[open] > summary::after {
    content: "−" !important;
  }

  html.circle-design-v1 .completed-transfers-details > summary:focus-visible {
    outline: 3px solid rgba(11, 79, 73, 0.2) !important;
    outline-offset: -3px !important;
  }

  html.circle-design-v1 .completed-transfers-details > summary > span:first-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.circle-design-v1 .completed-transfers-details > summary strong {
    font-size: 13px !important;
  }

  html.circle-design-v1 .completed-transfers-details > summary small {
    color: var(--circle-muted) !important;
    font-size: 10.5px !important;
  }

  html.circle-design-v1 .completed-transfers-count {
    min-width: 28px !important;
    height: 28px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 50% !important;
    color: var(--circle-positive) !important;
    background: var(--circle-mint-soft) !important;
    font-size: 11px !important;
    font-weight: 700 !important;
  }

  html.circle-design-v1 .completed-transfers-list {
    display: grid !important;
    border-top: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1 .completed-transfers-list .transfer-row {
    min-height: 82px !important;
    padding: 16px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--circle-line) !important;
    background: #f7faf9 !important;
  }

  html.circle-design-v1 .completed-transfers-list .transfer-row:last-child {
    border-bottom: 0 !important;
  }

  html.circle-design-v1 .completed-transfers-list .transfer-explanation {
    margin: 2px -16px -16px !important;
  }

  html.circle-design-v1 .settlement-audit-section {
    margin-top: 18px !important;
  }

  html.circle-design-v1 .settlement-audit-details {
    overflow: hidden !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: var(--circle-radius-panel) !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .settlement-audit-details > summary {
    min-height: 64px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto auto !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 10px 16px !important;
    color: var(--circle-ink) !important;
  }

  html.circle-design-v1 .settlement-audit-details > summary > span:first-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.circle-design-v1 .settlement-audit-details > summary strong {
    font-size: 13px !important;
  }

  html.circle-design-v1 .settlement-audit-details > summary small {
    color: var(--circle-muted) !important;
    font-size: 11px !important;
  }

  html.circle-design-v1 .settlement-audit-count {
    min-width: 28px !important;
    height: 28px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 50% !important;
    color: var(--circle-brand) !important;
    background: var(--circle-surface-soft) !important;
    font-size: 11px !important;
    font-weight: 700 !important;
  }

  html.circle-design-v1 .settlement-audit-list {
    display: grid !important;
    border-top: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1 .settlement-audit-list .balance-row {
    min-height: 60px !important;
    padding: 12px 16px !important;
  }

  @media (max-width: 720px) {
    html.circle-design-v1 .settlement-screen .personal-settlement {
      padding: 18px !important;
    }

    html.circle-design-v1 .personal-settlement-row {
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 12px !important;
      padding: 15px !important;
    }

    html.circle-design-v1 .personal-settlement-actions {
      grid-column: 1 / -1 !important;
    }

    html.circle-design-v1 .personal-settlement-actions .primary-button {
      width: 100% !important;
    }

    html.circle-design-v1 .personal-settlement-row .transfer-explanation {
      margin: 2px -15px -15px !important;
    }

    html.circle-design-v1 .settlement-screen .settlement-hero {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 18px !important;
      padding: 20px !important;
    }

    html.circle-design-v1 .settlement-hero-title-row {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 16px !important;
    }

    html.circle-design-v1 .settlement-hero-total {
      min-width: 0 !important;
      display: flex !important;
      align-items: end !important;
      justify-content: space-between !important;
      gap: 16px !important;
      padding: 14px 0 0 !important;
      border-inline-start: 0 !important;
      border-top: 1px solid rgba(255, 255, 255, 0.18) !important;
    }

    html.circle-design-v1 .settlement-hero-total .amount {
      font-size: 25px !important;
    }

    html.circle-design-v1 .settlement-stage-heading {
      align-items: start !important;
      flex-direction: column !important;
      gap: 10px !important;
    }

    html.circle-design-v1 .settlement-transfer-board .transfer-row {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 14px !important;
      padding: 16px !important;
    }

    html.circle-design-v1 .transfer-actions {
      width: 100% !important;
      justify-content: space-between !important;
    }

    html.circle-design-v1 .settlement-transfer-board .transfer-explanation {
      margin: 2px -16px -16px !important;
    }

    html.circle-design-v1 .transfer-equation {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 7px !important;
    }

    html.circle-design-v1 .transfer-equation-sign {
      display: none !important;
    }

    html.circle-design-v1 .transfer-equation-item {
      min-height: 52px !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      align-items: center !important;
      gap: 12px !important;
    }

    html.circle-design-v1 .transfer-expense-share-row {
      align-items: start !important;
    }
  }

  @media (max-width: 440px) {
    html.circle-design-v1 .settlement-hero-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1 .personal-settlement-row {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1 .personal-settlement-row > .amount {
      font-size: 20px !important;
    }

    html.circle-design-v1 .personal-settlement-actions,
    html.circle-design-v1 .personal-settlement-row .transfer-explanation {
      grid-column: 1 !important;
    }

    html.circle-design-v1 .transfer-people {
      flex-wrap: wrap !important;
    }

    html.circle-design-v1 .transfer-main > small {
      padding-inline-start: 0 !important;
    }

    html.circle-design-v1 .transfer-actions {
      align-items: stretch !important;
      flex-direction: column !important;
    }

    html.circle-design-v1 .transfer-actions button {
      width: 100% !important;
    }

    html.circle-design-v1 .transfer-expense-share-row {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1 .transfer-expense-share-row > span:last-child {
      justify-items: start !important;
    }
  }

  /* Live Receipt: the final visual language for the product workspace. */
  html.circle-design-v1 {
    accent-color: var(--circle-mint);
  }

  html.circle-design-v1 .screen {
    width: min(100%, 960px) !important;
    padding-inline: 28px !important;
  }

  html.circle-design-v1 .screen[data-product-screen="home"],
  html.circle-design-v1 .product-home-screen {
    width: min(100%, 960px) !important;
  }

  html.circle-design-v1 .product-app-identity {
    width: calc(100% + 56px) !important;
    min-height: calc(66px + env(safe-area-inset-top)) !important;
    gap: 18px !important;
    margin-inline: -28px !important;
    padding: calc(10px + env(safe-area-inset-top)) 28px 10px !important;
    border-bottom: 1px solid var(--circle-line) !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .product-brand-lockup {
    gap: 11px !important;
  }

  html.circle-design-v1 .product-brand-mark,
  html.circle-design-v1.product-v1 .product-brand-mark,
  html.circle-design-v1.product-v1-live .product-brand-mark {
    width: 36px !important;
    min-width: 36px !important;
    height: 36px !important;
    border: 0 !important;
    border-radius: 7px !important;
    background: var(--circle-brand) !important;
    box-shadow: inset 0 -3px 0 var(--circle-mint) !important;
  }

  html.circle-design-v1 .product-brand-copy {
    gap: 2px !important;
  }

  html.circle-design-v1 .product-brand-copy strong {
    color: var(--circle-ink) !important;
    font-size: 17px !important;
    line-height: 1.1 !important;
  }

  html.circle-design-v1 .product-brand-copy small {
    color: var(--circle-muted) !important;
    font-size: 10px !important;
  }

  html.circle-design-v1 .product-app-nav {
    gap: 4px !important;
  }

  html.circle-design-v1 .product-nav-button {
    min-height: 42px !important;
    border-radius: 7px !important;
    color: var(--circle-muted) !important;
  }

  html.circle-design-v1 .product-nav-button:hover,
  html.circle-design-v1 .product-nav-button.is-active,
  html.circle-design-v1 .product-nav-button[aria-current="page"] {
    color: var(--circle-ink) !important;
    background: var(--circle-mint-soft) !important;
  }

  html.circle-design-v1 .product-route-controls > .app-back-button,
  html.circle-design-v1 .product-route-controls > .product-home-button {
    border-color: var(--circle-line-strong) !important;
    border-radius: 7px !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .product-route-controls > .app-back-button:hover,
  html.circle-design-v1 .product-route-controls > .product-home-button:hover {
    border-color: var(--circle-ink) !important;
    background: var(--circle-mint-soft) !important;
  }

  html.circle-design-v1 .screen > .top,
  html.circle-design-v1 .screen[data-product-screen="home"] > .top,
  html.circle-design-v1 .product-home-screen > .top,
  html.circle-design-v1 .screen.circle-home-has-recent > .top {
    min-height: 0 !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 30px !important;
    margin: 0 !important;
    padding: 48px 0 34px !important;
    border: 0 !important;
    color: var(--circle-ink) !important;
    background: transparent !important;
  }

  html.circle-design-v1 .screen.circle-home-has-recent > .top > .brand {
    display: block !important;
  }

  html.circle-design-v1 .screen.circle-home-has-recent > .top > .recent-event-shortcut {
    grid-column: auto !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home .product-app-identity,
  html.circle-design-v1.product-v1-live .screen.product-empty-home .product-app-identity {
    width: calc(100% + 56px) !important;
    min-height: calc(66px + env(safe-area-inset-top)) !important;
    margin: 0 -28px !important;
    padding: calc(10px + env(safe-area-inset-top)) 28px 10px !important;
    border-bottom: 1px solid var(--circle-line) !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home .product-app-identity .product-brand-mark,
  html.circle-design-v1.product-v1-live .screen.product-empty-home .product-app-identity .product-brand-mark {
    width: 36px !important;
    min-width: 36px !important;
    height: 36px !important;
    box-shadow: inset 0 -3px 0 var(--circle-mint) !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home .product-app-identity .product-brand-copy strong,
  html.circle-design-v1.product-v1-live .screen.product-empty-home .product-app-identity .product-brand-copy strong {
    color: var(--circle-ink) !important;
    font-size: 17px !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home > .top,
  html.circle-design-v1.product-v1-live .screen.product-empty-home > .top {
    min-height: 352px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: auto auto !important;
    align-content: center !important;
    justify-items: start !important;
    gap: 24px !important;
    margin: 24px 0 0 !important;
    padding: 42px !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 8px !important;
    background-color: #004d47 !important;
    background-image: url("./sogrim-home-hero.png") !important;
    background-position: left center !important;
    background-repeat: no-repeat !important;
    background-size: auto 115% !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home > .top::before,
  html.circle-design-v1.product-v1 .screen.product-empty-home > .top::after,
  html.circle-design-v1.product-v1-live .screen.product-empty-home > .top::before,
  html.circle-design-v1.product-v1-live .screen.product-empty-home > .top::after {
    content: none !important;
    display: none !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home > .top .brand,
  html.circle-design-v1.product-v1-live .screen.product-empty-home > .top .brand {
    grid-row: 1 !important;
    width: min(100%, 390px) !important;
    max-width: 390px !important;
    justify-self: start !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home > .top .eyebrow,
  html.circle-design-v1.product-v1-live .screen.product-empty-home > .top .eyebrow {
    color: var(--circle-mint) !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home > .top h1,
  html.circle-design-v1.product-v1-live .screen.product-empty-home > .top h1 {
    max-width: 10ch !important;
    color: #ffffff !important;
    font-size: clamp(42px, 5vw, 58px) !important;
    line-height: 1.02 !important;
    text-shadow: 0 2px 18px rgba(7, 31, 27, 0.28) !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home > .top .muted,
  html.circle-design-v1.product-v1-live .screen.product-empty-home > .top .muted {
    max-width: 38ch !important;
    color: rgba(255, 255, 255, 0.82) !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home > .top .hero-actions,
  html.circle-design-v1.product-v1-live .screen.product-empty-home > .top .hero-actions {
    grid-column: 1 !important;
    grid-row: 2 !important;
    justify-self: start !important;
    width: auto !important;
    display: flex !important;
    gap: 5px !important;
    margin: 0 !important;
    padding: 5px !important;
    background: rgba(7, 31, 27, 0.9) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home .home-empty-events,
  html.circle-design-v1.product-v1-live .screen.product-empty-home .home-empty-events {
    width: min(100%, 560px) !important;
    margin: 26px auto 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home .home-empty-events .section-title-row,
  html.circle-design-v1.product-v1-live .screen.product-empty-home .home-empty-events .section-title-row {
    display: none !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home .home-empty-visual,
  html.circle-design-v1.product-v1-live .screen.product-empty-home .home-empty-visual {
    width: 100% !important;
    min-height: 88px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 18px !important;
    padding: 12px 0 !important;
    border: 0 !important;
    color: var(--circle-muted) !important;
    background: transparent !important;
    font-size: 17px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home .product-empty-icon,
  html.circle-design-v1.product-v1-live .screen.product-empty-home .product-empty-icon {
    width: 58px !important;
    height: 52px !important;
    color: var(--circle-ink) !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home .product-empty-icon svg,
  html.circle-design-v1.product-v1-live .screen.product-empty-home .product-empty-icon svg {
    width: 58px !important;
    height: 52px !important;
    stroke: var(--circle-ink) !important;
  }

  html.circle-design-v1 .screen > .top .brand,
  html.circle-design-v1 .screen[data-product-screen="home"] > .top .brand,
  html.circle-design-v1 .product-home-screen > .top .brand {
    max-width: 590px !important;
  }

  html.circle-design-v1 .screen > .top h1,
  html.circle-design-v1 .screen[data-product-screen="home"] > .top h1,
  html.circle-design-v1 .product-home-screen > .top h1 {
    max-width: 16ch !important;
    font-size: clamp(34px, 5vw, 48px) !important;
    line-height: 1.04 !important;
  }

  html.circle-design-v1 .screen > .top .eyebrow,
  html.circle-design-v1 .eyebrow {
    color: var(--circle-positive) !important;
    font-size: 11px !important;
  }

  html.circle-design-v1 .screen > .top .hero-actions,
  html.circle-design-v1 .screen.circle-home-has-recent > .top > .hero-actions {
    grid-column: 2 !important;
    width: auto !important;
    display: flex !important;
    gap: 5px !important;
    padding: 5px !important;
    border-radius: 8px !important;
    background: var(--circle-brand) !important;
  }

  html.circle-design-v1 .primary-button,
  html.circle-design-v1 a.primary-button {
    min-height: 48px !important;
    border-color: var(--circle-mint) !important;
    border-radius: 7px !important;
    color: var(--circle-ink) !important;
    background: var(--circle-mint) !important;
    box-shadow: none !important;
    font-weight: 700 !important;
  }

  html.circle-design-v1 .primary-button:hover:not(:disabled),
  html.circle-design-v1 a.primary-button:hover {
    border-color: #159aa5 !important;
    color: var(--circle-ink) !important;
    background: #51c8d0 !important;
    box-shadow: 0 8px 22px rgba(16, 49, 43, 0.14) !important;
    transform: translateY(-1px) !important;
  }

  html.circle-design-v1 button:active:not(:disabled),
  html.circle-design-v1 a:active {
    transform: scale(0.96) !important;
  }

  html.circle-design-v1 .screen > .top .hero-actions .secondary-button {
    border-color: rgba(255, 255, 255, 0.2) !important;
    color: #ffffff !important;
    background: transparent !important;
  }

  html.circle-design-v1 .screen > .top .hero-actions .secondary-button:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.42) !important;
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.08) !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="event"] > .top .event-header-actions {
    width: auto !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    justify-self: start !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="event"] > .top .event-header-actions .event-settings-button {
    grid-column: auto !important;
    width: auto !important;
    min-width: 0 !important;
    min-height: 44px !important;
    padding-inline: 14px !important;
    border-color: var(--circle-line-strong) !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="event"] > .top .event-header-actions .event-settings-button:hover:not(:disabled) {
    border-color: var(--circle-brand) !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .secondary-button {
    border-radius: 7px !important;
  }

  html.circle-design-v1 input,
  html.circle-design-v1 select,
  html.circle-design-v1 textarea {
    border-radius: 7px !important;
  }

  html.circle-design-v1 input:focus,
  html.circle-design-v1 select:focus,
  html.circle-design-v1 textarea:focus {
    border-color: var(--circle-ink) !important;
    box-shadow: 0 0 0 3px rgba(8, 124, 120, 0.24) !important;
  }

  html.circle-design-v1 :focus-visible {
    outline-color: rgba(16, 49, 43, 0.44) !important;
  }

  html.circle-design-v1 .section {
    margin-top: 38px !important;
  }

  html.circle-design-v1 .section-title-row {
    margin-bottom: 12px !important;
    padding-bottom: 10px !important;
    border-bottom: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1 .section-title-row h2 {
    font-size: 20px !important;
  }

  html.circle-design-v1 .personal-dashboard {
    grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr) !important;
    gap: 28px !important;
    margin: 0 !important;
    padding: 30px 0 !important;
    overflow: visible !important;
    border: 0 !important;
    border-top: 1px solid var(--circle-line) !important;
    border-bottom: 1px solid var(--circle-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.product-studio-v3 .screen:has(.recent-event-shortcut) .personal-dashboard {
    display: grid !important;
  }

  html.circle-design-v1.product-studio-v3 .product-home-screen .personal-dashboard,
  html.circle-design-v1.product-studio-v3 .screen[data-product-screen="home"] .personal-dashboard {
    overflow: visible !important;
    border: 0 !important;
    border-top: 1px solid var(--circle-line) !important;
    border-bottom: 1px solid var(--circle-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .personal-balance-main {
    min-height: 156px !important;
    align-content: center !important;
    gap: 4px !important;
    padding: 0 0 0 30px !important;
    border-inline-end: 1px solid var(--circle-line) !important;
    color: var(--circle-ink) !important;
    background: transparent !important;
  }

  html.circle-design-v1 .personal-balance-main > span,
  html.circle-design-v1 .personal-balance-main p {
    color: var(--circle-muted) !important;
    font-size: 12px !important;
  }

  html.circle-design-v1 .personal-balance-main .amount {
    color: var(--circle-ink) !important;
    font-size: clamp(42px, 7vw, 64px) !important;
    line-height: 1.08 !important;
  }

  html.circle-design-v1 .personal-balance-main .amount.is-credit {
    color: var(--circle-positive) !important;
  }

  html.circle-design-v1 .personal-balance-main .amount.is-debt {
    color: var(--circle-negative) !important;
  }

  html.circle-design-v1 .personal-balance-details {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 0 !important;
    align-content: center !important;
    background: transparent !important;
  }

  html.circle-design-v1 .personal-balance-details > div {
    min-height: 74px !important;
    padding: 14px 16px !important;
    border-inline-start: 0 !important;
    border-bottom: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1 .personal-balance-details > div:nth-last-child(-n + 2) {
    border-bottom: 0 !important;
  }

  html.circle-design-v1 .personal-next-step {
    padding: 12px 0 0 !important;
    border-top: 1px solid var(--circle-line) !important;
    border-inline: 0 !important;
    border-bottom: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .recent-event-shortcut {
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 24px !important;
    margin: 28px 0 0 !important;
    padding: 20px 18px 20px 0 !important;
    overflow: visible !important;
    border: 0 !important;
    border-top: 1px solid var(--circle-line) !important;
    border-bottom: 1px solid var(--circle-line) !important;
    border-radius: 0 !important;
    color: var(--circle-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .recent-event-shortcut::before {
    inset-block: 16px !important;
    inset-inline-start: 0 !important;
    width: 3px !important;
    border-radius: 3px !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1 .recent-event-shortcut::after {
    content: none !important;
    display: none !important;
  }

  html.circle-design-v1 .recent-event-main,
  html.circle-design-v1 .recent-event-main strong {
    color: var(--circle-ink) !important;
  }

  html.circle-design-v1 .recent-event-main strong {
    font-size: 21px !important;
  }

  html.circle-design-v1 .recent-event-main small {
    color: var(--circle-muted) !important;
  }

  html.circle-design-v1 .recent-event-eyebrow {
    color: var(--circle-positive) !important;
  }

  html.circle-design-v1 .recent-event-action {
    grid-auto-flow: column !important;
    align-items: center !important;
    gap: 16px !important;
  }

  html.circle-design-v1 .recent-event-balance,
  html.circle-design-v1 .recent-event-balance.is-credit,
  html.circle-design-v1 .recent-event-balance.is-debt {
    color: var(--circle-muted) !important;
  }

  html.circle-design-v1 .recent-event-balance.is-credit .amount {
    color: var(--circle-positive) !important;
  }

  html.circle-design-v1 .recent-event-balance.is-debt .amount {
    color: var(--circle-negative) !important;
  }

  html.circle-design-v1 .recent-event-shortcut .primary-button,
  html.circle-design-v1 .recent-event-shortcut .primary-button:hover:not(:disabled) {
    border-color: var(--circle-mint) !important;
    color: var(--circle-ink) !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1 .personal-action-list,
  html.circle-design-v1 .event-list,
  html.circle-design-v1 #event-expenses > .stack,
  html.circle-design-v1 .all-transfers-list {
    gap: 0 !important;
    overflow: visible !important;
    border: 0 !important;
    border-top: 1px solid var(--circle-line-strong) !important;
    border-bottom: 1px solid var(--circle-line-strong) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .personal-action-card,
  html.circle-design-v1 .event-row,
  html.circle-design-v1 .event-row:last-child {
    min-height: 92px !important;
    padding: 18px 12px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--circle-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .personal-action-card:last-child,
  html.circle-design-v1 .event-row:last-child {
    border-bottom: 0 !important;
  }

  html.circle-design-v1 .personal-action-card:hover,
  html.circle-design-v1 .event-row:hover {
    background: var(--circle-surface) !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.circle-design-v1 .event-row-title strong,
  html.circle-design-v1 .personal-action-card strong {
    font-size: 17px !important;
  }

  html.circle-design-v1 .event-row-balance {
    min-height: 0 !important;
    padding: 0 !important;
    border-radius: 0 !important;
    color: var(--circle-muted) !important;
    background: transparent !important;
  }

  html.circle-design-v1 .event-row-balance .amount {
    font-size: 17px !important;
  }

  html.circle-design-v1 .event-row-balance.is-credit {
    color: var(--circle-positive) !important;
    background: transparent !important;
  }

  html.circle-design-v1 .event-row-balance.is-debt {
    color: var(--circle-negative) !important;
    background: transparent !important;
  }

  html.circle-design-v1 .event-type-chip,
  html.circle-design-v1 .status-chip,
  html.circle-design-v1 .settlement-progress-chip {
    border-radius: 4px !important;
    color: var(--circle-ink) !important;
    background: var(--circle-mint-soft) !important;
  }

  html.circle-design-v1 .event-workspace-nav {
    inset-block-start: calc(66px + env(safe-area-inset-top)) !important;
    min-height: 52px !important;
    margin-bottom: 28px !important;
    overflow-x: auto !important;
    border: 0 !important;
    border-bottom: 1px solid var(--circle-line-strong) !important;
    border-radius: 0 !important;
    background: var(--circle-canvas) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .event-workspace-tab {
    min-height: 51px !important;
    border: 0 !important;
    color: var(--circle-muted) !important;
    background: transparent !important;
  }

  html.circle-design-v1 .event-workspace-tab::after {
    content: "" !important;
    position: absolute !important;
    inset-inline: 14px !important;
    inset-block-end: -1px !important;
    height: 3px !important;
    border-radius: 3px 3px 0 0 !important;
    background: transparent !important;
  }

  html.circle-design-v1 .event-workspace-tab:hover,
  html.circle-design-v1 .event-workspace-tab.is-active,
  html.circle-design-v1 .event-workspace-tab[aria-current="page"] {
    color: var(--circle-ink) !important;
    background: transparent !important;
  }

  html.circle-design-v1 .event-workspace-tab.is-active::after,
  html.circle-design-v1 .event-workspace-tab[aria-current="page"]::after {
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1 .summary-strip,
  html.circle-design-v1.product-studio-v3 .screen .summary-strip,
  html.circle-design-v1.product-v2-live .screen .summary-strip {
    display: grid !important;
    grid-template-columns: 1.2fr 1.5fr 0.65fr !important;
    gap: 0 !important;
    margin: 0 0 22px !important;
    overflow: visible !important;
    border: 0 !important;
    border-top: 1px solid var(--circle-line-strong) !important;
    border-bottom: 1px solid var(--circle-line-strong) !important;
    border-radius: 0 !important;
    color: var(--circle-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .summary-item,
  html.circle-design-v1 .summary-item:first-child,
  html.circle-design-v1.product-studio-v3 .screen .summary-item,
  html.circle-design-v1.product-v2-live .screen .summary-item {
    min-width: 0 !important;
    min-height: 118px !important;
    padding: 22px 24px !important;
    border: 0 !important;
    border-inline-start: 1px solid var(--circle-line) !important;
    color: var(--circle-ink) !important;
    background: transparent !important;
  }

  html.circle-design-v1 .summary-item:first-child,
  html.circle-design-v1.product-studio-v3 .screen .summary-item:first-child,
  html.circle-design-v1.product-v2-live .screen .summary-item:first-child {
    border-inline-start: 0 !important;
  }

  html.circle-design-v1 .summary-item span,
  html.circle-design-v1.product-studio-v3 .screen .summary-item span,
  html.circle-design-v1.product-v2-live .screen .summary-item span {
    color: var(--circle-muted) !important;
  }

  html.circle-design-v1 .summary-item strong,
  html.circle-design-v1 .summary-item .amount,
  html.circle-design-v1.product-studio-v3 .screen .summary-item strong,
  html.circle-design-v1.product-studio-v3 .screen .summary-item .amount,
  html.circle-design-v1.product-v2-live .screen .summary-item strong,
  html.circle-design-v1.product-v2-live .screen .summary-item .amount {
    color: var(--circle-ink) !important;
  }

  html.circle-design-v1 .summary-item:nth-child(2) .amount {
    font-size: clamp(26px, 4vw, 36px) !important;
  }

  html.circle-design-v1 .summary-personal-value.is-credit,
  html.circle-design-v1 .summary-personal-value.is-credit .amount,
  html.circle-design-v1.product-studio-v3 .screen .summary-personal-value.is-credit,
  html.circle-design-v1.product-studio-v3 .screen .summary-personal-value.is-credit .amount,
  html.circle-design-v1.product-v2-live .screen .summary-personal-value.is-credit,
  html.circle-design-v1.product-v2-live .screen .summary-personal-value.is-credit .amount {
    color: var(--circle-positive) !important;
  }

  html.circle-design-v1 .summary-personal-value.is-debt,
  html.circle-design-v1 .summary-personal-value.is-debt .amount,
  html.circle-design-v1.product-studio-v3 .screen .summary-personal-value.is-debt,
  html.circle-design-v1.product-studio-v3 .screen .summary-personal-value.is-debt .amount,
  html.circle-design-v1.product-v2-live .screen .summary-personal-value.is-debt,
  html.circle-design-v1.product-v2-live .screen .summary-personal-value.is-debt .amount {
    color: var(--circle-negative) !important;
  }

  html.circle-design-v1 .event-type-guide {
    margin-bottom: 20px !important;
    padding: 14px 0 !important;
    border: 0 !important;
    border-bottom: 1px solid var(--circle-line) !important;
    background: transparent !important;
  }

  html.circle-design-v1 .event-insight-panel {
    display: block !important;
    overflow: visible !important;
    border: 0 !important;
    border-top: 1px solid var(--circle-line) !important;
    border-bottom: 1px solid var(--circle-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .event-insight-main {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) auto !important;
    grid-template-rows: auto auto !important;
    align-items: center !important;
    justify-items: start !important;
    gap: 3px 16px !important;
    padding: 18px 0 !important;
  }

  html.circle-design-v1 .event-insight-main > .status-chip {
    grid-column: 1 !important;
    grid-row: 1 / span 2 !important;
  }

  html.circle-design-v1 .event-insight-main > h2 {
    grid-column: 2 !important;
    grid-row: 1 !important;
    margin: 0 !important;
    font-size: 19px !important;
  }

  html.circle-design-v1 .event-insight-main > p {
    display: block !important;
    grid-column: 2 !important;
    grid-row: 2 !important;
    margin: 0 !important;
    font-size: 12px !important;
  }

  html.circle-design-v1 .event-insight-main > .primary-button,
  html.circle-design-v1 .event-insight-main > .secondary-button {
    display: inline-flex !important;
    grid-column: 3 !important;
    grid-row: 1 / span 2 !important;
    margin: 0 !important;
  }

  html.circle-design-v1 .event-insight-metrics {
    display: none !important;
  }

  html.circle-design-v1 .event-insight-metrics > div {
    background: transparent !important;
  }

  html.circle-design-v1 .expense-day-heading {
    padding-inline: 12px !important;
    color: var(--circle-muted) !important;
    background: transparent !important;
  }

  html.circle-design-v1 .expense-row,
  html.circle-design-v1 .group-row,
  html.circle-design-v1 .balance-row {
    min-height: 84px !important;
    padding: 16px 12px !important;
    background: transparent !important;
  }

  html.circle-design-v1 .expense-row > :first-child {
    min-width: 0 !important;
  }

  html.circle-design-v1 .expense-row > :first-child > strong,
  html.circle-design-v1 .expense-row > :first-child > small {
    overflow-wrap: anywhere !important;
  }

  html.circle-design-v1 .expense-row:hover {
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .expense-actions {
    min-width: 194px !important;
    justify-content: flex-end !important;
  }

  html.circle-design-v1 .expense-actions .amount {
    min-width: 92px !important;
    margin-inline-end: 12px !important;
    color: var(--circle-ink) !important;
    font-size: 19px !important;
    text-align: end !important;
  }

  html.circle-design-v1 .expense-actions .secondary-button {
    min-width: 42px !important;
    min-height: 40px !important;
    padding-inline: 10px !important;
    border-color: transparent !important;
    background: transparent !important;
  }

  html.circle-design-v1 .expense-actions .secondary-button:hover:not(:disabled) {
    border-color: var(--circle-line) !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1 .expense-row.circle-row-added {
    animation: circle-row-arrival 760ms cubic-bezier(0.22, 1, 0.36, 1) both !important;
  }

  @keyframes circle-row-arrival {
    0% {
      background: var(--circle-mint) !important;
      transform: translateY(8px);
    }
    100% {
      background: transparent !important;
      transform: translateY(0);
    }
  }

  html.circle-design-v1 .event-type-option {
    min-height: 150px !important;
    border-color: var(--circle-line-strong) !important;
    border-radius: 8px !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .event-type-option:hover,
  html.circle-design-v1 .event-type-option.is-active {
    border-color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
    box-shadow: inset 0 -4px 0 var(--circle-mint) !important;
  }

  html.circle-design-v1 .studio-event-type-icon {
    border-radius: 7px !important;
    color: var(--circle-ink) !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1 .event-creation-progress li.is-active,
  html.circle-design-v1 .event-creation-progress li.is-complete {
    border-bottom-color: var(--circle-mint) !important;
    color: var(--circle-ink) !important;
  }

  html.circle-design-v1 .event-creation-progress li > span {
    border-radius: 5px !important;
    color: var(--circle-ink) !important;
    background: var(--circle-mint-soft) !important;
  }

  html.circle-design-v1 .expense-modal-backdrop,
  html.circle-design-v1 .event-modal-backdrop {
    background: rgba(7, 31, 27, 0.68) !important;
  }

  html.circle-design-v1 .event-modal,
  html.circle-design-v1 .expense-modal {
    border-radius: 8px !important;
  }

  html.circle-design-v1 .expense-total-field {
    margin-bottom: 20px !important;
    padding: 18px 0 12px !important;
    border: 0 !important;
    border-bottom: 2px solid var(--circle-ink) !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.circle-design-v1 .expense-total-field input {
    min-height: 86px !important;
    color: var(--circle-ink) !important;
    font-size: clamp(42px, 8vw, 58px) !important;
  }

  html.circle-design-v1 .expense-details-panel {
    border-inline: 0 !important;
    border-radius: 0 !important;
  }

  html.circle-design-v1 .payer-row,
  html.circle-design-v1 .quick-item-row,
  html.circle-design-v1 .expense-guest-box,
  html.circle-design-v1 .quick-split-summary {
    border-radius: 7px !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .expense-modal-actions {
    border-top: 0 !important;
    background: var(--circle-brand) !important;
  }

  html.circle-design-v1 .expense-modal-actions .secondary-button {
    border-color: rgba(255, 255, 255, 0.24) !important;
    color: #ffffff !important;
    background: transparent !important;
  }

  html.circle-design-v1 .settlement-screen .personal-settlement {
    gap: 16px !important;
    padding: 20px 0 !important;
    border: 0 !important;
    border-top: 1px solid var(--circle-line-strong) !important;
    border-bottom: 1px solid var(--circle-line-strong) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .settlement-screen .personal-settlement.is-balanced {
    padding-inline-start: 16px !important;
    border-inline-start: 3px solid var(--circle-mint) !important;
    background: transparent !important;
  }

  html.circle-design-v1 .personal-settlement-row {
    padding: 14px 0 !important;
    border: 0 !important;
    border-top: 1px dashed var(--circle-line-strong) !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.circle-design-v1 .personal-settlement-row.is-debt,
  html.circle-design-v1 .personal-settlement-row.is-credit {
    border-inline-start: 0 !important;
  }

  html.circle-design-v1 .settlement-screen .settlement-hero {
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-brand) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .settlement-hero .is-credit,
  html.circle-design-v1 .settlement-hero .is-credit .amount {
    color: var(--circle-positive-on-dark) !important;
  }

  html.circle-design-v1 .settlement-hero .is-debt,
  html.circle-design-v1 .settlement-hero .is-debt .amount {
    color: var(--circle-negative-on-dark) !important;
  }

  html.circle-design-v1 .settlement-hero-actions .primary-button {
    border-color: var(--circle-mint) !important;
    color: var(--circle-ink) !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1 .settlement-transfer-board {
    overflow: visible !important;
    border: 0 !important;
    border-top: 1px solid var(--circle-line-strong) !important;
    border-bottom: 1px solid var(--circle-line-strong) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .settlement-transfer-board .transfer-row,
  html.circle-design-v1 .settlement-transfer-board .transfer-row:last-child {
    border: 0 !important;
    border-bottom: 1px dashed var(--circle-line-strong) !important;
    background: transparent !important;
  }

  html.circle-design-v1 .settlement-transfer-board .transfer-row:last-child {
    border-bottom: 0 !important;
  }

  html.circle-design-v1 .settlement-transfer-board .transfer-row.is-pending:hover {
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .settlement-transfer-board .transfer-row.is-paid {
    box-shadow: inset 3px 0 0 var(--circle-mint) !important;
  }

  html.circle-design-v1 .transfer-arrow {
    border-radius: 5px !important;
    color: var(--circle-ink) !important;
    background: var(--circle-mint-soft) !important;
  }

  html.circle-design-v1 .settlement-complete-state {
    box-shadow: inset 0 4px 0 var(--circle-mint) !important;
  }

  html.circle-design-v1 .settlement-complete-mark {
    border-radius: 7px !important;
    color: var(--circle-ink) !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1 button:not(:disabled):active,
  html.circle-design-v1 [role="button"]:not([aria-disabled="true"]):active,
  html.circle-design-v1 .event-workspace-tab:not(:disabled):active {
    transform: scale(0.96) !important;
    transition-duration: 90ms !important;
  }

  html.circle-design-v1 .event-has-action-dock {
    padding-bottom: calc(132px + env(safe-area-inset-bottom)) !important;
  }

  html.circle-design-v1 .event-action-dock {
    position: fixed !important;
    z-index: 72 !important;
    left: 50% !important;
    right: auto !important;
    inset-block-end: 20px !important;
    width: min(calc(100% - 40px), 800px) !important;
    min-height: 76px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 20px !important;
    padding: 12px 14px !important;
    border-radius: 8px !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow: 0 -4px 12px rgba(7, 31, 27, 0.16) !important;
    transform: translateX(-50%) !important;
  }

  html.circle-design-v1 .event-action-total {
    min-width: 0 !important;
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: baseline !important;
    gap: 12px !important;
  }

  html.circle-design-v1 .event-action-total > span {
    color: rgba(255, 255, 255, 0.72) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .event-action-total .amount {
    overflow: hidden !important;
    color: #ffffff !important;
    font-size: 22px !important;
    font-weight: 600 !important;
    text-overflow: ellipsis !important;
  }

  html.circle-design-v1 .event-action-sync-wrap {
    flex: 1 0 100% !important;
    min-width: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 8px !important;
  }

  html.circle-design-v1 .event-action-sync {
    color: rgba(255, 255, 255, 0.78) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .event-action-sync.is-sync-offline,
  html.circle-design-v1 .event-action-sync.is-sync-conflict {
    color: #f7d98a !important;
  }

  html.circle-design-v1 .event-action-sync-retry {
    min-width: 44px !important;
    min-height: 44px !important;
    padding: 8px 10px !important;
    box-sizing: border-box !important;
    border: 1px solid rgba(255, 255, 255, 0.28) !important;
    border-radius: 6px !important;
    color: #ffffff !important;
    background: transparent !important;
    font-size: 11px !important;
    font-weight: 700 !important;
  }

  html.circle-design-v1 .event-action-dock .primary-button {
    min-width: 168px !important;
    border-color: var(--circle-mint) !important;
    color: var(--circle-ink) !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1 .event-action-dock .button-action-icon {
    display: inline-grid !important;
  }

  html.circle-design-v1 .event-settings-button {
    width: auto !important;
    min-width: 0 !important;
    height: 44px !important;
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    padding-inline: 14px !important;
  }

  html.circle-design-v1 .event-settings-button .event-settings-label {
    position: static !important;
    width: auto !important;
    height: auto !important;
    display: inline !important;
    overflow: visible !important;
    clip: auto !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1 .event-settings-button .button-action-icon {
    display: inline-grid !important;
    margin: 0 !important;
  }

  html.circle-design-v1 .expense-day-group.has-day-heading {
    position: relative !important;
  }

  html.circle-design-v1 .expense-day-heading {
    position: sticky !important;
    z-index: 28 !important;
    inset-block-start: calc(116px + env(safe-area-inset-top)) !important;
    min-height: 46px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 16px !important;
    padding: 8px 12px !important;
    border-bottom: 1px solid var(--circle-line-strong) !important;
    color: var(--circle-muted) !important;
    background: var(--circle-canvas) !important;
  }

  html.circle-design-v1 .expense-day-label {
    color: var(--circle-ink) !important;
    font-size: 13px !important;
    font-weight: 700 !important;
  }

  html.circle-design-v1 .expense-day-summary {
    min-width: 0 !important;
    display: inline-flex !important;
    align-items: baseline !important;
    justify-content: flex-end !important;
    gap: 10px !important;
  }

  html.circle-design-v1 .expense-day-summary small {
    color: var(--circle-muted) !important;
    font-size: 11px !important;
  }

  html.circle-design-v1 .expense-day-summary .amount {
    color: var(--circle-ink) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .expense-loop-status {
    margin: 0 !important;
    padding: 10px 16px !important;
    border-top: 1px solid rgba(43, 184, 194, 0.3) !important;
    color: var(--circle-mint) !important;
    background: var(--circle-brand) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    text-align: center !important;
  }

  html.circle-design-v1 .expense-sync-status {
    margin: 0 !important;
    padding: 9px 16px !important;
    border-top: 1px solid var(--circle-line) !important;
    color: var(--circle-muted) !important;
    background: var(--circle-canvas) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    text-align: center !important;
  }

  html.circle-design-v1 .expense-sync-status.is-sync-offline,
  html.circle-design-v1 .expense-sync-status.is-sync-conflict {
    color: #8b5a09 !important;
    background: #fff8e8 !important;
  }

  html.circle-design-v1 .expense-modal-actions {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 10px !important;
  }

  html.circle-design-v1 .expense-modal-actions .primary-button,
  html.circle-design-v1 .expense-modal-actions .secondary-button {
    width: 100% !important;
    margin: 0 !important;
  }

  html.circle-design-v1 .settlement-personal-only-state {
    min-height: 96px !important;
    display: flex !important;
    align-items: center !important;
    gap: 14px !important;
    padding: 18px 8px !important;
  }

  html.circle-design-v1 .settlement-personal-only-state > div {
    display: grid !important;
    gap: 3px !important;
  }

  html.circle-design-v1 .settlement-personal-only-state strong {
    color: var(--circle-ink) !important;
    font-size: 15px !important;
  }

  html.circle-design-v1 .settlement-personal-only-state p {
    margin: 0 !important;
    color: var(--circle-muted) !important;
    font-size: 12px !important;
  }

  @media (max-width: 720px) {
    html.circle-design-v1 .screen {
      width: 100% !important;
      padding-inline: 16px !important;
      padding-bottom: calc(92px + env(safe-area-inset-bottom)) !important;
    }

    html.circle-design-v1 .product-app-identity {
      width: calc(100% + 32px) !important;
      min-height: calc(62px + env(safe-area-inset-top)) !important;
      margin-inline: -16px !important;
      padding-inline: 16px !important;
    }

    html.circle-design-v1 .product-brand-copy small {
      display: none !important;
    }

    html.circle-design-v1.product-v1 .screen.product-empty-home .product-app-identity,
    html.circle-design-v1.product-v1-live .screen.product-empty-home .product-app-identity {
      width: calc(100% + 32px) !important;
      min-height: calc(62px + env(safe-area-inset-top)) !important;
      margin-inline: -16px !important;
      padding-inline: 16px !important;
    }

    html.circle-design-v1.product-v1 .screen.product-empty-home > .top,
    html.circle-design-v1.product-v1-live .screen.product-empty-home > .top {
      min-height: 480px !important;
      align-content: start !important;
      gap: 20px !important;
      margin-top: 16px !important;
      padding: 28px 22px !important;
      background-position: left bottom !important;
      background-size: auto 72% !important;
    }

    html.circle-design-v1.product-v1 .screen.product-empty-home > .top .brand,
    html.circle-design-v1.product-v1-live .screen.product-empty-home > .top .brand {
      width: min(100%, 320px) !important;
      max-width: 320px !important;
    }

    html.circle-design-v1.product-v1 .screen.product-empty-home > .top h1,
    html.circle-design-v1.product-v1-live .screen.product-empty-home > .top h1 {
      max-width: 9ch !important;
      font-size: 42px !important;
    }

    html.circle-design-v1.product-v1 .screen.product-empty-home > .top .hero-actions,
    html.circle-design-v1.product-v1-live .screen.product-empty-home > .top .hero-actions {
      width: 100% !important;
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    html.circle-design-v1 .product-app-nav {
      min-height: calc(68px + env(safe-area-inset-bottom)) !important;
      padding: 5px 10px calc(5px + env(safe-area-inset-bottom)) !important;
      border-top: 3px solid var(--circle-mint) !important;
      background: var(--circle-brand) !important;
      box-shadow: 0 -12px 32px rgba(16, 49, 43, 0.16) !important;
    }

    html.circle-design-v1 .product-nav-button {
      color: rgba(255, 255, 255, 0.72) !important;
      background: transparent !important;
    }

    html.circle-design-v1 .product-nav-button:hover,
    html.circle-design-v1 .product-nav-button.is-active,
    html.circle-design-v1 .product-nav-button[aria-current="page"] {
      color: var(--circle-mint) !important;
      background: transparent !important;
    }

    html.circle-design-v1 .screen > .top,
    html.circle-design-v1 .screen[data-product-screen="home"] > .top,
    html.circle-design-v1 .product-home-screen > .top,
    html.circle-design-v1 .screen.circle-home-has-recent > .top {
      grid-template-columns: minmax(0, 1fr) !important;
      align-items: start !important;
      gap: 22px !important;
      margin-inline: 0 !important;
      padding: 34px 0 26px !important;
    }

    html.circle-design-v1 .screen > .top h1,
    html.circle-design-v1 .screen[data-product-screen="home"] > .top h1,
    html.circle-design-v1 .product-home-screen > .top h1 {
      font-size: 36px !important;
    }

    html.circle-design-v1 .screen > .top .hero-actions,
    html.circle-design-v1 .screen.circle-home-has-recent > .top > .hero-actions {
      grid-column: 1 !important;
      width: 100% !important;
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    html.circle-design-v1 .screen > .top .hero-actions.is-single {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1 .personal-dashboard {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 16px !important;
      padding: 24px 0 18px !important;
    }

    html.circle-design-v1 .personal-balance-main {
      min-height: 132px !important;
      padding: 0 0 18px !important;
      border-inline-end: 0 !important;
      border-bottom: 1px solid var(--circle-line) !important;
    }

    html.circle-design-v1 .personal-balance-main .amount {
      font-size: clamp(40px, 13vw, 54px) !important;
    }

    html.circle-design-v1 .personal-balance-details {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    html.circle-design-v1 .personal-balance-details > div {
      grid-column: auto !important;
      padding-inline: 8px !important;
    }

    html.circle-design-v1.product-studio-v3 .product-home-screen .personal-balance-details > div,
    html.circle-design-v1.product-studio-v3 .screen[data-product-screen="home"] .personal-balance-details > div {
      grid-column: auto !important;
    }

    html.circle-design-v1 .recent-event-shortcut {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 16px !important;
      padding-inline-start: 16px !important;
    }

    html.circle-design-v1 .recent-event-action {
      width: 100% !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      grid-auto-flow: row !important;
      justify-items: stretch !important;
    }

    html.circle-design-v1 .recent-event-balance {
      justify-content: flex-start !important;
    }

    html.circle-design-v1 .recent-event-shortcut .primary-button {
      width: auto !important;
    }

    html.circle-design-v1 .event-workspace-nav {
      inset-block-start: calc(62px + env(safe-area-inset-top)) !important;
      width: calc(100% + 32px) !important;
      margin-inline: -16px !important;
      padding-inline: 6px !important;
      background: var(--circle-canvas) !important;
    }

    html.circle-design-v1 .summary-strip,
    html.circle-design-v1.product-studio-v3 .screen .summary-strip,
    html.circle-design-v1.product-v2-live .screen .summary-strip {
      grid-template-columns: 1.15fr 1fr !important;
    }

    html.circle-design-v1 .event-has-action-dock .summary-strip {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1 .summary-item,
    html.circle-design-v1 .summary-item:first-child,
    html.circle-design-v1.product-studio-v3 .screen .summary-item,
    html.circle-design-v1.product-v2-live .screen .summary-item {
      min-height: 100px !important;
      padding: 18px 12px !important;
    }

    html.circle-design-v1 .summary-item:nth-child(n + 3),
    html.circle-design-v1.product-studio-v3 .screen .summary-item:nth-child(n + 3),
    html.circle-design-v1.product-v2-live .screen .summary-item:nth-child(n + 3) {
      display: none !important;
    }

    html.circle-design-v1 .event-has-action-dock .summary-item:nth-child(2) {
      display: none !important;
    }

    html.circle-design-v1 .event-insight-panel {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1 .event-insight-main {
      grid-template-columns: auto minmax(0, 1fr) !important;
      padding-inline: 0 !important;
    }

    html.circle-design-v1 .event-insight-main > .primary-button,
    html.circle-design-v1 .event-insight-main > .secondary-button {
      grid-column: 1 / -1 !important;
      grid-row: 3 !important;
      width: 100% !important;
      margin-top: 10px !important;
    }

    html.circle-design-v1 .event-insight-metrics {
      display: none !important;
    }

    html.circle-design-v1 .event-type-option {
      min-height: 108px !important;
    }

    html.circle-design-v1 .expense-row {
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 10px !important;
      padding-inline: 4px !important;
    }

    html.circle-design-v1 .expense-actions {
      min-width: 104px !important;
      display: grid !important;
      grid-template-columns: repeat(2, auto) !important;
      justify-content: end !important;
    }

    html.circle-design-v1 .expense-actions .amount {
      grid-column: 1 / -1 !important;
      min-width: 0 !important;
      margin: 0 0 3px !important;
      font-size: 17px !important;
    }

    html.circle-design-v1 .event-modal,
    html.circle-design-v1 .expense-modal {
      border-radius: 0 !important;
    }

    html.circle-design-v1 .expense-modal-actions {
      position: static !important;
      inset-block-end: auto !important;
      margin-inline: -16px !important;
      padding-inline: 16px !important;
    }

    html.circle-design-v1 .event-action-dock {
      left: 0 !important;
      right: 0 !important;
      inset-block-end: 0 !important;
      width: 100% !important;
      min-height: calc(76px + env(safe-area-inset-bottom)) !important;
      grid-template-columns: minmax(0, 1fr) minmax(148px, auto) !important;
      gap: 12px !important;
      padding: 10px 16px calc(10px + env(safe-area-inset-bottom)) !important;
      border-radius: 0 !important;
      transform: none !important;
    }

    html.circle-design-v1 .event-action-total {
      display: grid !important;
      gap: 2px !important;
    }

    html.circle-design-v1 .event-action-total .amount {
      font-size: 19px !important;
    }

    html.circle-design-v1 .event-action-dock .primary-button {
      min-width: 0 !important;
      min-height: 52px !important;
    }

    html.circle-design-v1 .expense-day-heading {
      inset-block-start: calc(112px + env(safe-area-inset-top)) !important;
      margin-inline: -4px !important;
      padding-inline: 8px !important;
    }

    html.circle-design-v1 .settlement-screen .personal-settlement {
      padding-inline: 0 !important;
    }

    html.circle-design-v1 .settlement-screen .settlement-hero {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1 .settlement-hero-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    html.circle-design-v1 .settlement-hero-actions .primary-button {
      grid-column: 1 / -1 !important;
    }

    html.circle-design-v1 .settlement-transfer-board .transfer-row {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1 .transfer-actions {
      width: 100% !important;
      align-items: center !important;
      flex-direction: row !important;
      justify-content: space-between !important;
    }

    html.circle-design-v1 .transfer-actions button {
      width: auto !important;
    }
  }

  @media (max-width: 430px) {
    html.circle-design-v1 .product-brand-copy strong {
      font-size: 15px !important;
    }

    html.circle-design-v1 .screen > .top h1,
    html.circle-design-v1 .screen[data-product-screen="home"] > .top h1,
    html.circle-design-v1 .product-home-screen > .top h1 {
      font-size: 32px !important;
    }

    html.circle-design-v1 .event-workspace-nav {
      overflow-x: hidden !important;
    }

    html.circle-design-v1 .event-workspace-tab {
      flex: 1 1 25% !important;
      min-width: 0 !important;
      min-height: 51px !important;
      padding-inline: 4px !important;
      font-size: 13px !important;
      white-space: nowrap !important;
    }

    html.circle-design-v1 .event-row {
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 8px !important;
      overflow: visible !important;
    }

    html.circle-design-v1 .event-row-side {
      width: auto !important;
      grid-template-columns: minmax(0, 1fr) !important;
      align-items: end !important;
    }

    html.circle-design-v1 .event-row .avatar-stack {
      display: none !important;
    }

    html.circle-design-v1 .event-row-title {
      flex-wrap: wrap !important;
    }

    html.circle-design-v1 .event-row-title strong,
    html.circle-design-v1 .event-row-main > small {
      white-space: normal !important;
      overflow-wrap: anywhere !important;
    }

    html.circle-design-v1 .expense-row {
      grid-template-columns: minmax(0, 1fr) minmax(112px, max-content) !important;
    }

    html.circle-design-v1 .expense-row > :first-child small {
      display: -webkit-box !important;
      white-space: normal !important;
      -webkit-box-orient: vertical !important;
      -webkit-line-clamp: 1 !important;
    }

    html.circle-design-v1 .expense-actions {
      min-width: 112px !important;
    }

    html.circle-design-v1 .expense-actions .amount {
      font-size: 15px !important;
    }

    html.circle-design-v1 .settlement-hero-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }
  }

  /* Approved visual plan: unframed home primary action surface. */
  html.circle-design-v1 .screen[data-screen-kind="home"] > .top .hero-actions {
    width: auto !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.product-v1 .screen.product-empty-home[data-screen-kind="home"] > .top .hero-actions,
  html.circle-design-v1.product-v1-live .screen.product-empty-home[data-screen-kind="home"] > .top .hero-actions {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] > .top .hero-actions.is-single {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] > .top .hero-actions button {
    min-width: 0 !important;
    min-height: 48px !important;
    line-height: 1.25 !important;
    text-wrap: balance;
    transition:
      color var(--circle-motion),
      background-color var(--circle-motion),
      border-color var(--circle-motion),
      box-shadow var(--circle-motion),
      transform var(--circle-motion) !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] > .top .hero-actions .primary-button {
    border-color: var(--circle-mint) !important;
    color: var(--circle-ink) !important;
    background: var(--circle-mint) !important;
    box-shadow:
      0 1px 2px rgba(7, 31, 27, 0.1),
      0 8px 18px rgba(7, 31, 27, 0.11) !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] > .top .hero-actions .primary-button:hover:not(:disabled) {
    border-color: #159aa5 !important;
    color: var(--circle-ink) !important;
    background: #51c8d0 !important;
    box-shadow:
      0 2px 3px rgba(7, 31, 27, 0.1),
      0 11px 24px rgba(7, 31, 27, 0.14) !important;
    transform: translateY(-1px) !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] > .top .hero-actions .secondary-button {
    border: 1px solid var(--circle-line-strong) !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 1px 2px rgba(7, 31, 27, 0.045) !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] > .top .hero-actions .secondary-button:hover:not(:disabled) {
    border-color: var(--circle-brand) !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface-soft) !important;
    box-shadow: 0 5px 14px rgba(7, 31, 27, 0.08) !important;
    transform: translateY(-1px) !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] > .top .hero-actions button:focus-visible {
    outline: 3px solid rgba(16, 49, 43, 0.3) !important;
    outline-offset: 2px !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] > .top .hero-actions button:active:not(:disabled) {
    transform: scale(0.96) !important;
  }

  @media (max-width: 720px) {
    html.circle-design-v1 .screen[data-screen-kind="home"] > .top .hero-actions {
      width: 100% !important;
    }
  }

  @media (max-width: 340px) {
    html.circle-design-v1.product-v1 .screen.product-empty-home[data-screen-kind="home"] > .top .hero-actions,
    html.circle-design-v1.product-v1-live .screen.product-empty-home[data-screen-kind="home"] > .top .hero-actions {
      justify-self: stretch !important;
      width: calc(100% + 44px) !important;
      max-width: none !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 8px !important;
      margin-inline: -22px !important;
    }

    html.circle-design-v1.product-v1 .screen.product-empty-home[data-screen-kind="home"] > .top .hero-actions button,
    html.circle-design-v1.product-v1-live .screen.product-empty-home[data-screen-kind="home"] > .top .hero-actions button {
      padding-inline: 4px !important;
      gap: 4px !important;
      font-size: 14px !important;
    }
  }

  /* Approved visual plan: one actionable balance surface. */
  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-dashboard,
  html.circle-design-v1.product-studio-v3 .screen[data-screen-kind="home"] .personal-dashboard {
    grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr) !important;
    gap: 0 !important;
    margin: 0 !important;
    padding: clamp(22px, 3vw, 32px) !important;
    overflow: hidden !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 8px !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow:
      0 1px 2px rgba(7, 31, 27, 0.16),
      0 16px 38px rgba(7, 31, 27, 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-main {
    min-height: 156px !important;
    padding: 2px 0 2px 30px !important;
    border: 0 !important;
    border-inline-end: 1px solid rgba(255, 255, 255, 0.14) !important;
    color: #ffffff !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-main > span,
  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-main p {
    color: rgba(255, 255, 255, 0.68) !important;
    text-wrap: pretty;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-main .amount {
    color: #ffffff !important;
    font-variant-numeric: tabular-nums;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-main .amount.is-credit,
  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-details .amount.is-credit {
    color: var(--circle-positive-on-dark) !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-main .amount.is-debt,
  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-details .amount.is-debt {
    color: var(--circle-negative-on-dark) !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-details {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 0 !important;
    align-content: center !important;
    padding-inline-start: 14px !important;
    color: #ffffff !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-details > div {
    min-height: 74px !important;
    padding: 14px 16px !important;
    border: 0 !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-details > div:nth-child(even) {
    border-inline-start: 1px solid rgba(255, 255, 255, 0.12) !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-details > div:nth-last-child(-n + 2) {
    border-bottom: 0 !important;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-details span {
    color: rgba(255, 255, 255, 0.64) !important;
    text-wrap: pretty;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-details strong {
    color: #ffffff !important;
    font-variant-numeric: tabular-nums;
  }

  html.circle-design-v1 .screen[data-screen-kind="home"] .personal-next-step {
    grid-column: 1 / -1 !important;
    margin-top: 16px !important;
    padding: 16px 0 0 !important;
    border: 0 !important;
    border-top: 1px solid rgba(255, 255, 255, 0.14) !important;
    border-radius: 0 !important;
    color: rgba(255, 255, 255, 0.68) !important;
    background: transparent !important;
    box-shadow: none !important;
    text-wrap: pretty;
  }

  @media (max-width: 720px) {
    html.circle-design-v1 .screen[data-screen-kind="home"] .personal-dashboard,
    html.circle-design-v1.product-studio-v3 .screen[data-screen-kind="home"] .personal-dashboard {
      grid-template-columns: minmax(0, 1fr) !important;
      padding: 22px 20px !important;
    }

    html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-main {
      min-height: 128px !important;
      padding: 0 0 20px !important;
      border-inline-end: 0 !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.14) !important;
    }

    html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-details {
      padding: 4px 0 0 !important;
    }

    html.circle-design-v1 .screen[data-screen-kind="home"] .personal-balance-details > div {
      padding: 14px 8px !important;
    }
  }

  /* Approved visual plan: distinct quick-expense intent chooser. */
  html.circle-design-v1 .quick-purpose-switch {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    grid-auto-flow: row !important;
    grid-auto-columns: auto !important;
    gap: 8px !important;
    margin: 12px 0 18px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .expense-modal.quick-expense-modal .quick-purpose-switch button {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 54px !important;
    padding: 10px 14px !important;
    border: 1px solid var(--circle-line-strong) !important;
    border-radius: var(--circle-radius-control) !important;
    color: var(--circle-muted) !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 1px 2px rgba(7, 31, 27, 0.045) !important;
    font-weight: 650 !important;
    line-height: 1.25 !important;
    text-wrap: balance;
    transition:
      color var(--circle-motion),
      background-color var(--circle-motion),
      border-color var(--circle-motion),
      box-shadow var(--circle-motion),
      transform var(--circle-motion) !important;
  }

  html.circle-design-v1 .expense-modal.quick-expense-modal .quick-purpose-switch button:not(.is-active):hover:not(:disabled) {
    border-color: var(--circle-brand) !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface-soft) !important;
    box-shadow: 0 5px 14px rgba(7, 31, 27, 0.08) !important;
    transform: translateY(-1px) !important;
  }

  html.circle-design-v1 .expense-modal.quick-expense-modal .quick-purpose-switch button.is-active {
    border-color: var(--circle-brand) !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow:
      0 1px 2px rgba(7, 31, 27, 0.16),
      0 8px 18px rgba(7, 31, 27, 0.13) !important;
  }

  html.circle-design-v1 .expense-modal.quick-expense-modal .quick-purpose-switch button.is-active:hover:not(:disabled) {
    border-color: var(--circle-brand-pressed) !important;
    color: #ffffff !important;
    background: var(--circle-brand-pressed) !important;
    box-shadow:
      0 2px 3px rgba(7, 31, 27, 0.18),
      0 10px 22px rgba(7, 31, 27, 0.16) !important;
    transform: translateY(-1px) !important;
  }

  html.circle-design-v1 .expense-modal.quick-expense-modal .quick-purpose-switch button:focus-visible {
    outline: 3px solid rgba(16, 49, 43, 0.3) !important;
    outline-offset: 2px !important;
  }

  html.circle-design-v1 .expense-modal.quick-expense-modal .quick-purpose-switch button:active:not(:disabled) {
    transform: scale(0.96) !important;
  }

  /* Social Ledger v2: distinctive product surfaces and interaction polish. */
  html.circle-design-v1.social-ledger-v2 .screen {
    width: min(100%, 920px) !important;
  }

  html.circle-design-v1.social-ledger-v2 .product-brand-mark,
  html.circle-design-v1.social-ledger-v2.product-v1 .product-brand-mark,
  html.circle-design-v1.social-ledger-v2.product-v1-live .product-brand-mark {
    width: 40px !important;
    min-width: 40px !important;
    height: 40px !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 8px !important;
    box-shadow:
      0 0 0 1px rgba(16, 49, 43, 0.1),
      0 5px 14px rgba(16, 49, 43, 0.14) !important;
  }

  html.circle-design-v1.social-ledger-v2 .product-brand-image,
  html.circle-design-v1.social-ledger-v2 .account-auth-mark img {
    outline: 1px solid oklch(0 0 0 / 0.1) !important;
    outline-offset: -1px !important;
  }

  html.circle-design-v1.social-ledger-v2 .product-app-identity {
    border-bottom: 0 !important;
    box-shadow:
      0 1px 0 rgba(16, 49, 43, 0.08),
      0 7px 24px rgba(16, 49, 43, 0.035) !important;
  }

  html.circle-design-v1.social-ledger-v2 .screen:not(.product-empty-home) > .top .brand {
    position: relative !important;
    padding-inline-start: 18px !important;
  }

  html.circle-design-v1.social-ledger-v2 .screen:not(.product-empty-home) > .top .brand::after {
    content: "" !important;
    position: absolute !important;
    inset-block: 4px !important;
    inset-inline-start: 0 !important;
    width: 4px !important;
    display: block !important;
    border-radius: 4px !important;
    background: var(--circle-coral) !important;
    transform: none !important;
  }

  html.circle-design-v1.social-ledger-v2 .primary-button,
  html.circle-design-v1.social-ledger-v2 a.primary-button {
    border: 0 !important;
    box-shadow:
      0 0 0 1px rgba(16, 49, 43, 0.08),
      0 2px 3px rgba(16, 49, 43, 0.1),
      0 9px 22px rgba(16, 49, 43, 0.12) !important;
  }

  html.circle-design-v1.social-ledger-v2 .primary-button:hover:not(:disabled),
  html.circle-design-v1.social-ledger-v2 a.primary-button:hover {
    box-shadow:
      0 0 0 1px rgba(16, 49, 43, 0.12),
      0 3px 5px rgba(16, 49, 43, 0.1),
      0 13px 28px rgba(16, 49, 43, 0.16) !important;
  }

  html.circle-design-v1.social-ledger-v2 .secondary-button {
    border: 0 !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .secondary-button:hover:not(:disabled) {
    border: 0 !important;
    box-shadow: var(--circle-shadow-border-hover) !important;
  }

  html.circle-design-v1.social-ledger-v2 .screen[data-screen-kind="home"] > .top .hero-actions .secondary-button {
    border: 0 !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .screen[data-screen-kind="home"] > .top .hero-actions .primary-button {
    border: 0 !important;
    box-shadow:
      0 0 0 1px rgba(16, 49, 43, 0.08),
      0 2px 3px rgba(16, 49, 43, 0.12),
      0 10px 24px rgba(16, 49, 43, 0.14) !important;
  }

  html.circle-design-v1.social-ledger-v2 .panel {
    border: 0 !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .segmented-control,
  html.circle-design-v1.social-ledger-v2 .expense-mode-switch,
  html.circle-design-v1.social-ledger-v2 .account-auth-tabs {
    padding: 4px !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface-soft) !important;
    box-shadow:
      inset 0 0 0 1px rgba(16, 49, 43, 0.08),
      0 2px 7px rgba(16, 49, 43, 0.04) !important;
  }

  html.circle-design-v1.social-ledger-v2 .segmented-control button,
  html.circle-design-v1.social-ledger-v2 .expense-mode-switch button,
  html.circle-design-v1.social-ledger-v2 .account-auth-tabs button {
    min-height: 44px !important;
    border-radius: 6px !important;
  }

  html.circle-design-v1.social-ledger-v2 .segmented-control button.is-active,
  html.circle-design-v1.social-ledger-v2 .expense-mode-switch button.is-active,
  html.circle-design-v1.social-ledger-v2 .account-auth-tabs button.is-active {
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
    box-shadow:
      0 0 0 1px rgba(16, 49, 43, 0.07),
      0 3px 9px rgba(16, 49, 43, 0.1) !important;
  }

  html.circle-design-v1.social-ledger-v2.product-v1 .screen.product-empty-home > .top,
  html.circle-design-v1.social-ledger-v2.product-v1-live .screen.product-empty-home > .top {
    position: relative !important;
    box-shadow:
      0 0 0 1px rgba(7, 31, 27, 0.12),
      0 18px 42px rgba(7, 31, 27, 0.16) !important;
  }

  html.circle-design-v1.social-ledger-v2.product-v1 .screen.product-empty-home > .top::before,
  html.circle-design-v1.social-ledger-v2.product-v1-live .screen.product-empty-home > .top::before {
    content: "" !important;
    position: absolute !important;
    inset-block-start: 0 !important;
    inset-inline-start: 0 !important;
    width: 68% !important;
    height: 4px !important;
    display: block !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1.social-ledger-v2.product-v1 .screen.product-empty-home > .top::after,
  html.circle-design-v1.social-ledger-v2.product-v1-live .screen.product-empty-home > .top::after {
    content: "" !important;
    position: absolute !important;
    inset-block-start: 0 !important;
    inset-inline-end: 0 !important;
    width: 32% !important;
    height: 4px !important;
    display: block !important;
    background: var(--circle-coral) !important;
  }

  html.circle-design-v1.social-ledger-v2 .screen[data-screen-kind="home"] .personal-dashboard,
  html.circle-design-v1.social-ledger-v2.product-studio-v3 .screen[data-screen-kind="home"] .personal-dashboard {
    position: relative !important;
    border: 0 !important;
    box-shadow:
      0 0 0 1px rgba(7, 31, 27, 0.18),
      0 2px 4px rgba(7, 31, 27, 0.1),
      0 20px 46px rgba(7, 31, 27, 0.18) !important;
  }

  html.circle-design-v1.social-ledger-v2 .screen[data-screen-kind="home"] .personal-dashboard::before,
  html.circle-design-v1.social-ledger-v2.product-studio-v3 .screen[data-screen-kind="home"] .personal-dashboard::before {
    content: "" !important;
    position: absolute !important;
    inset-block-start: 0 !important;
    inset-inline-start: 0 !important;
    width: 72% !important;
    height: 4px !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1.social-ledger-v2 .screen[data-screen-kind="home"] .personal-dashboard::after,
  html.circle-design-v1.social-ledger-v2.product-studio-v3 .screen[data-screen-kind="home"] .personal-dashboard::after {
    content: "" !important;
    position: absolute !important;
    inset-block-start: 0 !important;
    inset-inline-end: 0 !important;
    width: 28% !important;
    height: 4px !important;
    background: var(--circle-coral) !important;
  }

  html.circle-design-v1.social-ledger-v2 .recent-event-shortcut {
    padding: 22px !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 8px !important;
    color: var(--circle-ink) !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .recent-event-shortcut:hover {
    box-shadow: var(--circle-shadow-border-hover) !important;
    transform: translateY(-1px) !important;
  }

  html.circle-design-v1.social-ledger-v2 .recent-event-shortcut::before {
    inset-block: 0 !important;
    inset-inline-start: 0 !important;
    width: 4px !important;
    border-radius: 0 !important;
    background: var(--circle-coral) !important;
  }

  html.circle-design-v1.social-ledger-v2 .personal-action-list,
  html.circle-design-v1.social-ledger-v2 .event-list {
    gap: 10px !important;
    overflow: visible !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.social-ledger-v2 .personal-action-card,
  html.circle-design-v1.social-ledger-v2 .event-row,
  html.circle-design-v1.social-ledger-v2 .event-row:last-child {
    padding: 18px !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .personal-action-card:hover,
  html.circle-design-v1.social-ledger-v2 .event-row:hover {
    box-shadow: var(--circle-shadow-border-hover) !important;
    transform: translateY(-1px) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-workspace-nav {
    width: 100% !important;
    min-height: 58px !important;
    margin-inline: 0 !important;
    margin-bottom: 24px !important;
    padding: 4px !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-workspace-tab {
    min-height: 50px !important;
    border-radius: 6px !important;
    color: var(--circle-muted) !important;
    background: transparent !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-workspace-tab::after {
    content: none !important;
    display: none !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-workspace-tab:hover {
    color: var(--circle-ink) !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-workspace-tab.is-active,
  html.circle-design-v1.social-ledger-v2 .event-workspace-tab[aria-current="page"] {
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow:
      0 1px 2px rgba(7, 31, 27, 0.18),
      0 5px 13px rgba(7, 31, 27, 0.14) !important;
  }

  html.circle-design-v1.social-ledger-v2 .summary-strip,
  html.circle-design-v1.social-ledger-v2.product-studio-v3 .screen .summary-strip,
  html.circle-design-v1.social-ledger-v2.product-v2-live .screen .summary-strip {
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .summary-item,
  html.circle-design-v1.social-ledger-v2 .summary-item:first-child,
  html.circle-design-v1.social-ledger-v2.product-studio-v3 .screen .summary-item,
  html.circle-design-v1.social-ledger-v2.product-v2-live .screen .summary-item {
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1.social-ledger-v2 .summary-item:first-child {
    box-shadow: inset 0 4px 0 var(--circle-coral) !important;
  }

  html.circle-design-v1.social-ledger-v2 .summary-item:nth-child(2) {
    box-shadow: inset 0 4px 0 var(--circle-mint) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-type-guide,
  html.circle-design-v1.social-ledger-v2 .event-insight-panel {
    overflow: hidden !important;
    border: 0 !important;
    border-inline-start: 4px solid var(--circle-coral) !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-type-guide {
    padding: 16px 18px !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-insight-main {
    padding: 18px !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-day-group {
    margin-bottom: 12px !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-day-heading {
    padding-inline: 14px !important;
    border-bottom: 1px solid var(--circle-line) !important;
    border-radius: 8px 8px 0 0 !important;
    background: var(--circle-surface-soft) !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-day-group .expense-row,
  html.circle-design-v1.social-ledger-v2 #event-expenses > .stack > .expense-row {
    padding: 17px 16px !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1.social-ledger-v2 #event-expenses > .stack > .expense-row {
    margin-bottom: 10px !important;
    border: 0 !important;
    border-radius: 8px !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-actions .secondary-button {
    min-width: 44px !important;
    min-height: 44px !important;
    border: 0 !important;
    background: var(--circle-surface) !important;
    box-shadow:
      0 0 0 1px rgba(16, 49, 43, 0.09),
      0 2px 6px rgba(16, 49, 43, 0.05) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-modal,
  html.circle-design-v1.social-ledger-v2 .expense-modal {
    border: 0 !important;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.1),
      0 28px 80px rgba(7, 31, 27, 0.28) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-modal-header,
  html.circle-design-v1.social-ledger-v2 .expense-modal-header {
    border-bottom: 1px solid var(--circle-line) !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 7px 20px rgba(16, 49, 43, 0.035) !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-total-field {
    margin: 18px 0 22px !important;
    padding: 20px !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: #e7f6f6 !important;
    box-shadow:
      inset 0 4px 0 var(--circle-mint),
      0 0 0 1px rgba(16, 49, 43, 0.08),
      0 10px 24px rgba(16, 49, 43, 0.06) !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-total-field input,
  html.circle-design-v1.social-ledger-v2 .expense-total-field input:focus {
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-template-grid .secondary-button {
    border: 0 !important;
    background: var(--circle-surface) !important;
    box-shadow:
      0 0 0 1px rgba(16, 49, 43, 0.09),
      0 2px 6px rgba(16, 49, 43, 0.04) !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-template-grid .secondary-button.is-active {
    color: var(--circle-ink) !important;
    background: var(--circle-mint-soft) !important;
    box-shadow:
      0 0 0 1px rgba(16, 49, 43, 0.16),
      inset 0 -3px 0 var(--circle-mint) !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-template-grid {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 8px !important;
    padding: 2px 1px 8px !important;
    overflow: visible !important;
    scroll-snap-type: none !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-template-grid .secondary-button {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 42px !important;
    padding-inline: 8px !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-modal .participant-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) !important;
    gap: 8px !important;
    padding: 12px !important;
    border-radius: 8px !important;
    background: var(--circle-surface-soft) !important;
    box-shadow: inset 0 0 0 1px rgba(16, 49, 43, 0.08) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-modal .participant-pill {
    width: 100% !important;
    min-width: 0 !important;
    justify-content: flex-start !important;
    padding: 7px 10px !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-modal .participant-pill:has(input:checked) {
    color: var(--circle-ink) !important;
    background: var(--circle-mint-soft) !important;
    box-shadow:
      0 0 0 1px rgba(16, 49, 43, 0.18),
      inset 3px 0 0 var(--circle-mint) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-modal .participant-pill .avatar {
    width: 32px !important;
    min-width: 32px !important;
    height: 32px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 50% !important;
    color: var(--circle-brand) !important;
    background: var(--circle-surface) !important;
    box-shadow: inset 0 0 0 1px rgba(16, 49, 43, 0.1) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-modal .event-modal-body > .inline-actions.section {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 8px !important;
    margin-top: 14px !important;
    padding: 12px !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-modal .event-modal-body > .inline-actions.section .secondary-button {
    min-width: 104px !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-details-panel {
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface-soft) !important;
    box-shadow: inset 0 0 0 1px rgba(16, 49, 43, 0.08) !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-details-panel > summary {
    min-height: 58px !important;
    padding-inline: 16px !important;
  }

  html.circle-design-v1.social-ledger-v2 .payer-row,
  html.circle-design-v1.social-ledger-v2 .quick-item-row,
  html.circle-design-v1.social-ledger-v2 .expense-guest-box,
  html.circle-design-v1.social-ledger-v2 .quick-split-summary {
    border: 0 !important;
    box-shadow:
      0 0 0 1px rgba(16, 49, 43, 0.08),
      0 5px 14px rgba(16, 49, 43, 0.045) !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-modal-actions {
    box-shadow: 0 -12px 34px rgba(7, 31, 27, 0.14) !important;
  }

  html.circle-design-v1.social-ledger-v2 .event-action-dock {
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.08),
      0 -14px 38px rgba(7, 31, 27, 0.2) !important;
  }

  html.circle-design-v1.social-ledger-v2 .settlement-screen .settlement-hero {
    position: relative !important;
    overflow: hidden !important;
    box-shadow:
      0 0 0 1px rgba(7, 31, 27, 0.18),
      0 20px 44px rgba(7, 31, 27, 0.17) !important;
  }

  html.circle-design-v1.social-ledger-v2 .settlement-screen .settlement-hero::before {
    content: "" !important;
    position: absolute !important;
    inset-block-start: 0 !important;
    inset-inline-start: 0 !important;
    width: 70% !important;
    height: 4px !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1.social-ledger-v2 .settlement-screen .settlement-hero::after {
    content: "" !important;
    position: absolute !important;
    inset-block-start: 0 !important;
    inset-inline-end: 0 !important;
    width: 30% !important;
    height: 4px !important;
    background: var(--circle-coral) !important;
  }

  html.circle-design-v1.social-ledger-v2 .settlement-screen .personal-settlement {
    padding: 20px !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .personal-settlement-row {
    padding: 16px !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface-soft) !important;
    box-shadow: inset 0 0 0 1px rgba(16, 49, 43, 0.07) !important;
  }

  html.circle-design-v1.social-ledger-v2 .settlement-transfer-board {
    display: grid !important;
    gap: 10px !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.social-ledger-v2 .settlement-transfer-board .transfer-row,
  html.circle-design-v1.social-ledger-v2 .settlement-transfer-board .transfer-row:last-child {
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .account-auth-shell {
    position: relative !important;
    min-height: 620px !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 8px !important;
    box-shadow:
      0 0 0 1px rgba(16, 49, 43, 0.08),
      0 28px 80px rgba(16, 49, 43, 0.16) !important;
  }

  html.circle-design-v1.social-ledger-v2 .account-auth-brand {
    position: relative !important;
    min-height: 620px !important;
    align-content: start !important;
    padding: 46px 46px 300px !important;
    overflow: hidden !important;
    background-color: var(--circle-brand) !important;
    background-image: url("./sogrim-home-hero.png") !important;
    background-position: center bottom !important;
    background-repeat: no-repeat !important;
    background-size: auto 58% !important;
  }

  html.circle-design-v1.social-ledger-v2 .account-auth-brand ul {
    display: none !important;
  }

  html.circle-design-v1.social-ledger-v2 .account-auth-mark {
    width: 64px !important;
    height: 64px !important;
    border: 0 !important;
    border-radius: 8px !important;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.14),
      0 10px 28px rgba(7, 31, 27, 0.24) !important;
  }

  html.circle-design-v1.social-ledger-v2 .account-auth-form-panel {
    position: relative !important;
    padding: 46px !important;
  }

  html.circle-design-v1.social-ledger-v2 .account-auth-form-panel::before {
    content: "" !important;
    position: absolute !important;
    inset-block-start: 0 !important;
    inset-inline-start: 0 !important;
    width: 68% !important;
    height: 4px !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1.social-ledger-v2 .account-auth-form-panel::after {
    content: "" !important;
    position: absolute !important;
    inset-block-start: 0 !important;
    inset-inline-end: 0 !important;
    width: 32% !important;
    height: 4px !important;
    background: var(--circle-coral) !important;
  }

  html.circle-design-v1.social-ledger-v2 .account-auth-heading h2 {
    font-size: 30px !important;
  }

  html.circle-design-v1.social-ledger-v2 .account-google-button,
  html.circle-design-v1.social-ledger-v2 .account-email-toggle {
    min-height: 52px !important;
    border: 0 !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .account-google-button:hover,
  html.circle-design-v1.social-ledger-v2 .account-email-toggle:hover {
    box-shadow: var(--circle-shadow-border-hover) !important;
    transform: translateY(-1px) !important;
  }

  @media (max-width: 720px) {
    html.circle-design-v1.social-ledger-v2 .product-brand-mark,
    html.circle-design-v1.social-ledger-v2.product-v1 .product-brand-mark,
    html.circle-design-v1.social-ledger-v2.product-v1-live .product-brand-mark {
      width: 38px !important;
      min-width: 38px !important;
      height: 38px !important;
    }

    html.circle-design-v1.social-ledger-v2 .screen:not(.product-empty-home) > .top .brand {
      padding-inline-start: 14px !important;
    }

    html.circle-design-v1.social-ledger-v2 .screen:not(.product-empty-home) > .top .brand::after {
      width: 3px !important;
    }

    html.circle-design-v1.social-ledger-v2 .event-workspace-nav {
      width: 100% !important;
      margin-inline: 0 !important;
      padding: 4px !important;
      border-radius: 8px !important;
    }

    html.circle-design-v1.social-ledger-v2 .event-workspace-tab {
      min-height: 48px !important;
    }

    html.circle-design-v1.social-ledger-v2 .recent-event-shortcut {
      padding: 20px !important;
    }

    html.circle-design-v1.social-ledger-v2 .expense-day-group .expense-row,
    html.circle-design-v1.social-ledger-v2 #event-expenses > .stack > .expense-row {
      padding-inline: 12px !important;
    }

    html.circle-design-v1.social-ledger-v2 .event-modal,
    html.circle-design-v1.social-ledger-v2 .expense-modal {
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    html.circle-design-v1.social-ledger-v2 .expense-total-field {
      padding: 18px 14px !important;
    }

    html.circle-design-v1.social-ledger-v2 .product-app-nav {
      border-top: 0 !important;
      box-shadow:
        0 -1px 0 rgba(43, 184, 194, 0.45),
        0 -14px 34px rgba(7, 31, 27, 0.19) !important;
    }

    html.circle-design-v1.social-ledger-v2 .product-nav-button:hover,
    html.circle-design-v1.social-ledger-v2 .product-nav-button.is-active,
    html.circle-design-v1.social-ledger-v2 .product-nav-button[aria-current="page"] {
      border-radius: 8px !important;
      color: var(--circle-mint) !important;
      background: rgba(255, 255, 255, 0.08) !important;
      box-shadow: inset 0 -2px 0 var(--circle-mint) !important;
    }

    html.circle-design-v1.social-ledger-v2 .account-auth-shell {
      min-height: 100dvh !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    html.circle-design-v1.social-ledger-v2 .account-auth-brand {
      min-height: calc(84px + env(safe-area-inset-top)) !important;
      padding: calc(16px + env(safe-area-inset-top)) 20px 16px !important;
      background-color: var(--circle-brand) !important;
      background-image: none !important;
    }

    html.circle-design-v1.social-ledger-v2 .account-auth-mark {
      width: 48px !important;
      height: 48px !important;
    }

    html.circle-design-v1.social-ledger-v2 .account-auth-form-panel {
      align-content: start !important;
      padding: 44px 20px calc(80px + env(safe-area-inset-bottom)) !important;
    }

    html.circle-design-v1.social-ledger-v2 .account-auth-heading {
      text-align: center !important;
    }

    html.circle-design-v1.social-ledger-v2 .account-auth-heading h2 {
      font-size: 28px !important;
    }

    html.circle-design-v1.social-ledger-v2 .settlement-screen .personal-settlement {
      padding: 18px !important;
    }
  }

  @media (max-width: 430px) {
    html.circle-design-v1.social-ledger-v2 .event-workspace-nav {
      overflow-x: hidden !important;
    }

    html.circle-design-v1.social-ledger-v2 .event-workspace-tab {
      flex: 1 1 25% !important;
      min-width: 0 !important;
      min-height: 48px !important;
      padding-inline: 3px !important;
      font-size: 12.5px !important;
      white-space: nowrap !important;
    }

    html.circle-design-v1.social-ledger-v2 .event-row,
    html.circle-design-v1.social-ledger-v2 .event-row:last-child {
      padding: 16px !important;
    }

    html.circle-design-v1.social-ledger-v2 .summary-item,
    html.circle-design-v1.social-ledger-v2 .summary-item:first-child,
    html.circle-design-v1.social-ledger-v2.product-studio-v3 .screen .summary-item,
    html.circle-design-v1.social-ledger-v2.product-v2-live .screen .summary-item {
      padding-inline: 14px !important;
    }
  }

  /* Social Ledger v3: focused secondary flows. */
  html.circle-design-v1.social-ledger-v2 .join-event-panel,
  html.circle-design-v1.social-ledger-v2 .group-create-panel {
    position: relative !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border-hover) !important;
  }

  html.circle-design-v1.social-ledger-v2 .join-event-panel::before,
  html.circle-design-v1.social-ledger-v2 .group-create-panel::before {
    content: "" !important;
    position: absolute !important;
    inset-block-start: 0 !important;
    inset-inline-start: 0 !important;
    width: 68% !important;
    height: 4px !important;
    background: var(--circle-mint) !important;
  }

  html.circle-design-v1.social-ledger-v2 .join-event-panel::after,
  html.circle-design-v1.social-ledger-v2 .group-create-panel::after {
    content: "" !important;
    position: absolute !important;
    inset-block-start: 0 !important;
    inset-inline-end: 0 !important;
    width: 32% !important;
    height: 4px !important;
    background: var(--circle-coral) !important;
  }

  html.circle-design-v1.social-ledger-v2 .join-event-panel {
    display: grid !important;
    gap: 16px !important;
    padding: 28px !important;
  }

  html.circle-design-v1.social-ledger-v2 .join-event-panel > .field {
    margin: 0 !important;
  }

  html.circle-design-v1.social-ledger-v2 .join-event-panel input {
    min-height: 56px !important;
    padding-inline: 16px !important;
    font-family: var(--font-hebrew) !important;
    font-size: 14px !important;
  }

  html.circle-design-v1.social-ledger-v2 .join-event-panel > .actions.section {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  html.circle-design-v1.social-ledger-v2 .join-event-panel [data-action="join-existing-event"] {
    width: 100% !important;
    min-height: 52px !important;
  }

  html.circle-design-v1.social-ledger-v2 .group-create-panel {
    display: grid !important;
    gap: 18px !important;
    padding: 26px !important;
  }

  html.circle-design-v1.social-ledger-v2 .group-create-panel > h2,
  html.circle-design-v1.social-ledger-v2 .group-create-panel > h3,
  html.circle-design-v1.social-ledger-v2 .group-create-panel > .field,
  html.circle-design-v1.social-ledger-v2 .group-create-panel > .inline-actions,
  html.circle-design-v1.social-ledger-v2 .group-create-panel > .primary-button {
    margin: 0 !important;
  }

  html.circle-design-v1.social-ledger-v2 .group-create-panel .participant-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) !important;
    gap: 8px !important;
    padding: 12px !important;
    border-radius: 8px !important;
    background: var(--circle-surface-soft) !important;
    box-shadow: inset 0 0 0 1px rgba(16, 49, 43, 0.08) !important;
  }

  html.circle-design-v1.social-ledger-v2 .group-create-panel .participant-pill {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 48px !important;
    justify-content: flex-start !important;
    padding: 7px 10px !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
  }

  html.circle-design-v1.social-ledger-v2 .group-create-panel .participant-pill:has(input:checked) {
    color: var(--circle-ink) !important;
    background: var(--circle-mint-soft) !important;
    box-shadow:
      0 0 0 1px rgba(16, 49, 43, 0.18),
      inset 3px 0 0 var(--circle-mint) !important;
  }

  html.circle-design-v1.social-ledger-v2 .group-create-panel .participant-pill .avatar {
    width: 32px !important;
    min-width: 32px !important;
    height: 32px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 50% !important;
    color: var(--circle-brand) !important;
    background: var(--circle-surface) !important;
    box-shadow: inset 0 0 0 1px rgba(16, 49, 43, 0.1) !important;
  }

  html.circle-design-v1.social-ledger-v2 .group-create-panel > .inline-actions {
    padding: 12px !important;
    border-radius: 8px !important;
    background: var(--circle-surface-soft) !important;
    box-shadow: inset 0 0 0 1px rgba(16, 49, 43, 0.08) !important;
  }

  html.circle-design-v1.social-ledger-v2 .group-create-panel > [data-action="create-group"] {
    width: 100% !important;
    min-height: 52px !important;
  }

  html.circle-design-v1.social-ledger-v2 .screen[data-screen-kind="groups"] .group-row {
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 16px !important;
    margin-bottom: 10px !important;
    padding: 17px 16px !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: var(--circle-shadow-border) !important;
    transition:
      box-shadow 180ms ease,
      transform 180ms ease !important;
  }

  html.circle-design-v1.social-ledger-v2 .screen[data-screen-kind="groups"] .group-row:hover {
    box-shadow: var(--circle-shadow-border-hover) !important;
    transform: translateY(-1px) !important;
  }

  html.circle-design-v1.social-ledger-v2 .screen[data-screen-kind="groups"] .group-row > :first-child,
  html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-split-list > div > span {
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-date-prominent {
    display: grid !important;
    grid-template-columns: auto minmax(160px, 1fr) !important;
    align-items: center !important;
    gap: 14px !important;
    margin: 4px 0 18px !important;
    padding: 14px 16px !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: var(--circle-surface-soft) !important;
    box-shadow: inset 0 0 0 1px rgba(16, 49, 43, 0.08) !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-date-prominent > span {
    margin: 0 !important;
  }

  html.circle-design-v1.social-ledger-v2 .expense-date-prominent input {
    min-height: 48px !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-split-summary {
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.08),
      0 18px 36px rgba(7, 31, 27, 0.16) !important;
  }

  html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-split-summary h3,
  html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-split-summary strong,
  html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-split-summary .muted {
    color: #ffffff !important;
  }

  html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-split-summary .eyebrow,
  html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-split-summary .amount {
    color: var(--circle-mint) !important;
  }

  html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-split-list > div {
    border-color: rgba(255, 255, 255, 0.13) !important;
    background: rgba(255, 255, 255, 0.06) !important;
  }

  html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-add-item {
    width: 100% !important;
    min-height: 48px !important;
    border-style: dashed !important;
    background: var(--circle-surface-soft) !important;
  }

  @media (max-width: 720px) {
    html.circle-design-v1.social-ledger-v2 .join-event-panel,
    html.circle-design-v1.social-ledger-v2 .group-create-panel {
      padding: 20px 16px !important;
    }

    html.circle-design-v1.social-ledger-v2 .group-create-panel .participant-grid {
      grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)) !important;
    }

    html.circle-design-v1.social-ledger-v2 .screen[data-screen-kind="groups"] .group-row {
      grid-template-columns: minmax(0, 1fr) !important;
      align-items: start !important;
    }

    html.circle-design-v1.social-ledger-v2 .expense-modal {
      scroll-padding-block-end: 104px !important;
    }

    html.circle-design-v1.social-ledger-v2 .expense-modal .expense-modal-actions {
      position: sticky !important;
      inset-block-end: -20px !important;
      z-index: 20 !important;
      margin: 22px -16px -20px !important;
      padding: 12px 16px calc(12px + env(safe-area-inset-bottom)) !important;
    }

    html.circle-design-v1.social-ledger-v2 .expense-modal:not(.quick-expense-modal) .expense-total-field {
      margin: 12px 0 16px !important;
      padding: 13px 12px !important;
    }

    html.circle-design-v1.social-ledger-v2 .expense-modal:not(.quick-expense-modal) .expense-total-field input {
      min-height: 60px !important;
      font-size: 36px !important;
      line-height: 44px !important;
    }

    html.circle-design-v1.social-ledger-v2 .expense-date-prominent {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 8px !important;
      padding: 12px !important;
    }

    html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-item-row {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) 96px !important;
      gap: 8px !important;
      align-items: end !important;
      padding: 12px !important;
    }

    html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-item-number {
      grid-column: 1 !important;
      grid-row: 1 !important;
      justify-self: start !important;
    }

    html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-item-remove {
      grid-column: 2 !important;
      grid-row: 1 !important;
      justify-self: end !important;
      align-self: center !important;
    }

    html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-item-row > .field:nth-of-type(1) {
      grid-column: 1 !important;
      grid-row: 2 !important;
    }

    html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-item-row > .field:nth-of-type(2) {
      grid-column: 2 !important;
      grid-row: 2 !important;
    }

    html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-item-row > .field:nth-of-type(3),
    html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-item-custom-share {
      grid-column: 1 / 3 !important;
    }

    html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-item-row > .field:nth-of-type(3) {
      grid-row: 3 !important;
    }

    html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-item-row > .field,
    html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-item-custom-share {
      min-width: 0 !important;
      margin: 0 !important;
    }
  }

  @media (max-width: 340px) {
    html.circle-design-v1.social-ledger-v2 .quick-expense-modal .quick-item-row {
      grid-template-columns: minmax(0, 1fr) 88px !important;
    }

    html.circle-design-v1.social-ledger-v2 .expense-modal-actions {
      gap: 7px !important;
    }

    html.circle-design-v1.social-ledger-v2 .expense-modal-actions .primary-button,
    html.circle-design-v1.social-ledger-v2 .expense-modal-actions .secondary-button {
      padding-inline: 8px !important;
      font-size: 13px !important;
    }
  }

  /* Deep Ledger v4: restrained hierarchy, clear states, and a unified brand. */
  html.circle-design-v1.social-ledger-v4 .primary-button,
  html.circle-design-v1.social-ledger-v4 a.primary-button {
    border-color: var(--circle-brand) !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow:
      0 0 0 1px rgba(6, 40, 37, 0.08),
      0 9px 22px rgba(6, 40, 37, 0.14) !important;
  }

  html.circle-design-v1.social-ledger-v4 .primary-button:hover:not(:disabled),
  html.circle-design-v1.social-ledger-v4 a.primary-button:hover {
    border-color: #0f514c !important;
    color: #ffffff !important;
    background: #0f514c !important;
    box-shadow:
      0 0 0 1px rgba(6, 40, 37, 0.08),
      0 12px 26px rgba(6, 40, 37, 0.18) !important;
  }

  html.circle-design-v1.social-ledger-v4 .primary-button:disabled {
    border-color: #dfe7e5 !important;
    color: #7b8b87 !important;
    background: #dfe7e5 !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.social-ledger-v4 .screen[data-screen-kind="home"] > .top .hero-actions .primary-button {
    border-color: var(--circle-accent) !important;
    color: var(--circle-brand) !important;
    background: var(--circle-accent) !important;
    box-shadow: 0 9px 22px rgba(6, 40, 37, 0.2) !important;
  }

  html.circle-design-v1.social-ledger-v4 .screen[data-screen-kind="home"] > .top .hero-actions .primary-button:hover:not(:disabled) {
    border-color: #51c8d0 !important;
    color: var(--circle-brand) !important;
    background: #51c8d0 !important;
  }

  html.circle-design-v1.social-ledger-v4 .screen[data-screen-kind="home"] > .top {
    padding: 34px 30px 30px !important;
    overflow: hidden !important;
    border-radius: 8px !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow:
      0 0 0 1px rgba(6, 40, 37, 0.08),
      0 24px 54px rgba(6, 40, 37, 0.18) !important;
  }

  html.circle-design-v1.social-ledger-v4 .screen[data-screen-kind="home"] > .top h1 {
    color: #ffffff !important;
    text-shadow: none !important;
  }

  html.circle-design-v1.social-ledger-v4 .screen[data-screen-kind="home"] > .top .eyebrow {
    color: #71d9de !important;
  }

  html.circle-design-v1.social-ledger-v4 .screen[data-screen-kind="home"] > .top .muted {
    color: rgba(255, 255, 255, 0.72) !important;
  }

  html.circle-design-v1.social-ledger-v4 .screen[data-screen-kind="home"] > .top .hero-actions {
    background: rgba(255, 255, 255, 0.06) !important;
  }

  html.circle-design-v1.social-ledger-v4 .screen[data-screen-kind="home"] > .top .brand {
    padding-inline-start: 0 !important;
  }

  html.circle-design-v1.social-ledger-v4 .screen[data-screen-kind="home"] > .top .brand::after {
    content: none !important;
    display: none !important;
  }

  html.circle-design-v1.social-ledger-v4 .event-action-dock .primary-button,
  html.circle-design-v1.social-ledger-v4 .expense-modal-actions .primary-button {
    border-color: var(--circle-accent) !important;
    color: var(--circle-brand) !important;
    background: var(--circle-accent) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.social-ledger-v4 .event-action-dock .primary-button:hover:not(:disabled),
  html.circle-design-v1.social-ledger-v4 .expense-modal-actions .primary-button:hover:not(:disabled) {
    border-color: #51c8d0 !important;
    color: var(--circle-brand) !important;
    background: #51c8d0 !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.social-ledger-v4 input:focus,
  html.circle-design-v1.social-ledger-v4 select:focus,
  html.circle-design-v1.social-ledger-v4 textarea:focus {
    border-color: var(--circle-focus) !important;
    box-shadow: 0 0 0 1px var(--circle-focus) !important;
  }

  html.circle-design-v1.social-ledger-v4 select {
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.circle-design-v1.social-ledger-v4 :focus-visible {
    outline: 3px solid var(--circle-focus) !important;
    outline-offset: 2px !important;
  }

  html.circle-design-v1.social-ledger-v4 .segmented-control button.is-active,
  html.circle-design-v1.social-ledger-v4 .expense-mode-switch button.is-active,
  html.circle-design-v1.social-ledger-v4 .account-auth-tabs button.is-active,
  html.circle-design-v1.social-ledger-v4 .expense-template-grid .secondary-button.is-active,
  html.circle-design-v1.social-ledger-v4 .event-type-option.is-active {
    border-color: rgba(43, 184, 194, 0.58) !important;
    color: var(--circle-brand) !important;
    background: var(--circle-selection) !important;
    box-shadow:
      0 0 0 1px rgba(11, 59, 56, 0.06),
      inset 0 -3px 0 var(--circle-accent) !important;
  }

  html.circle-design-v1.social-ledger-v4 .participant-pill[aria-pressed="true"],
  html.circle-design-v1.social-ledger-v4 .participant-pill.is-selected,
  html.circle-design-v1.social-ledger-v4 .participant-pill:has(input:checked),
  html.circle-design-v1.social-ledger-v4 .event-modal .participant-pill:has(input:checked),
  html.circle-design-v1.social-ledger-v4 .group-create-panel .participant-pill:has(input:checked) {
    border-color: rgba(43, 184, 194, 0.52) !important;
    color: var(--circle-brand) !important;
    background: var(--circle-selection) !important;
    box-shadow:
      0 0 0 1px rgba(11, 59, 56, 0.08),
      inset 3px 0 0 var(--circle-accent) !important;
  }

  html.circle-design-v1.social-ledger-v4 .event-workspace-tab.is-active,
  html.circle-design-v1.social-ledger-v4 .event-workspace-tab[aria-current="page"] {
    color: var(--circle-brand) !important;
    background: var(--circle-selection) !important;
  }

  html.circle-design-v1.social-ledger-v4 .event-workspace-tab.is-active::after,
  html.circle-design-v1.social-ledger-v4 .event-workspace-tab[aria-current="page"]::after {
    background: var(--circle-accent) !important;
  }

  html.circle-design-v1.social-ledger-v4 .expense-total-field {
    background: #e7f6f6 !important;
    box-shadow:
      inset 0 4px 0 var(--circle-accent),
      0 0 0 1px rgba(11, 59, 56, 0.08),
      0 10px 24px rgba(11, 59, 56, 0.06) !important;
  }

  html.circle-design-v1.social-ledger-v4 .quick-expense-modal .quick-split-summary .eyebrow,
  html.circle-design-v1.social-ledger-v4 .quick-expense-modal .quick-split-summary .amount {
    color: #71d9de !important;
  }

  html.circle-design-v1.social-ledger-v4.product-v1 .screen.product-empty-home > .top::before,
  html.circle-design-v1.social-ledger-v4.product-v1-live .screen.product-empty-home > .top::before,
  html.circle-design-v1.social-ledger-v4 .screen[data-screen-kind="home"] .personal-dashboard::before,
  html.circle-design-v1.social-ledger-v4.product-studio-v3 .screen[data-screen-kind="home"] .personal-dashboard::before,
  html.circle-design-v1.social-ledger-v4 .settlement-screen .settlement-hero::before,
  html.circle-design-v1.social-ledger-v4 .account-auth-form-panel::before,
  html.circle-design-v1.social-ledger-v4 .join-event-panel::before,
  html.circle-design-v1.social-ledger-v4 .group-create-panel::before {
    width: 100% !important;
    background: var(--circle-accent) !important;
  }

  html.circle-design-v1.social-ledger-v4.product-v1 .screen.product-empty-home > .top::after,
  html.circle-design-v1.social-ledger-v4.product-v1-live .screen.product-empty-home > .top::after,
  html.circle-design-v1.social-ledger-v4 .screen[data-screen-kind="home"] .personal-dashboard::after,
  html.circle-design-v1.social-ledger-v4.product-studio-v3 .screen[data-screen-kind="home"] .personal-dashboard::after,
  html.circle-design-v1.social-ledger-v4 .settlement-screen .settlement-hero::after,
  html.circle-design-v1.social-ledger-v4 .account-auth-form-panel::after,
  html.circle-design-v1.social-ledger-v4 .join-event-panel::after,
  html.circle-design-v1.social-ledger-v4 .group-create-panel::after {
    content: none !important;
    display: none !important;
  }

  @media (max-width: 720px) {
    html.circle-design-v1.social-ledger-v4 .screen[data-screen-kind="home"] > .top {
      width: auto !important;
      margin-inline: -16px !important;
      padding: 26px 20px 24px !important;
      border-radius: 0 !important;
      box-shadow: 0 16px 36px rgba(6, 40, 37, 0.16) !important;
    }

    html.circle-design-v1.social-ledger-v4 .product-nav-button {
      min-height: 46px !important;
    }

    html.circle-design-v1.social-ledger-v4 .product-nav-button:hover,
    html.circle-design-v1.social-ledger-v4 .product-nav-button.is-active,
    html.circle-design-v1.social-ledger-v4 .product-nav-button[aria-current="page"] {
      color: #71d9de !important;
      background: rgba(43, 184, 194, 0.1) !important;
      box-shadow: inset 0 -2px 0 var(--circle-accent) !important;
    }

    html.circle-design-v1.social-ledger-v4 .expense-template-grid .secondary-button {
      min-height: 44px !important;
    }
  }

  /* Deep Ledger v5: one operational language across every non-home flow. */
  html.circle-design-v1.deep-ledger-v5
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top {
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: end !important;
    gap: 20px !important;
    margin: 0 0 24px !important;
    padding: 28px 26px 24px !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 8px !important;
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow:
      inset 0 -3px 0 rgba(43, 184, 194, 0.78),
      0 0 0 1px rgba(6, 40, 37, 0.08),
      0 18px 42px rgba(6, 40, 37, 0.16) !important;
  }

  html.circle-design-v1.deep-ledger-v5
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .brand {
    max-width: 680px !important;
    padding-inline-start: 0 !important;
  }

  html.circle-design-v1.deep-ledger-v5
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .brand::before,
  html.circle-design-v1.deep-ledger-v5
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .brand::after {
    content: none !important;
    display: none !important;
  }

  html.circle-design-v1.deep-ledger-v5
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    h1 {
    color: #ffffff !important;
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  html.circle-design-v1.deep-ledger-v5
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .eyebrow {
    color: #71d9de !important;
  }

  html.circle-design-v1.deep-ledger-v5
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .muted,
  html.circle-design-v1.deep-ledger-v5
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .opened-at {
    color: rgba(255, 255, 255, 0.72) !important;
  }

  html.circle-design-v1.deep-ledger-v5
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    > .app-back-button,
  html.circle-design-v1.deep-ledger-v5
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions
    .event-settings-button {
    border-color: rgba(255, 255, 255, 0.18) !important;
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.08) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
  }

  html.circle-design-v1.deep-ledger-v5
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    > .app-back-button:hover:not(:disabled),
  html.circle-design-v1.deep-ledger-v5
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions
    .event-settings-button:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.32) !important;
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.14) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-workspace-nav {
    border: 0 !important;
    background: var(--circle-surface) !important;
    box-shadow:
      0 0 0 1px rgba(11, 59, 56, 0.08),
      0 9px 24px rgba(11, 59, 56, 0.08) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-workspace-tab {
    transition:
      color 160ms ease,
      background-color 160ms ease,
      box-shadow 160ms ease,
      transform 120ms ease !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-workspace-tab.is-active,
  html.circle-design-v1.deep-ledger-v5 .event-workspace-tab[aria-current="page"] {
    color: #ffffff !important;
    background: var(--circle-brand) !important;
    box-shadow:
      inset 0 -3px 0 var(--circle-accent),
      0 4px 12px rgba(11, 59, 56, 0.14) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-creation-progress {
    overflow: hidden !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 6px 18px rgba(11, 59, 56, 0.05) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-creation-progress li {
    min-height: 54px !important;
    padding-inline: 16px !important;
    border-bottom: 0 !important;
    border-inline-start: 1px solid var(--circle-line) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-creation-progress li:first-child {
    border-inline-start: 0 !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-creation-progress li.is-active {
    color: var(--circle-brand) !important;
    background: var(--circle-selection) !important;
    box-shadow: inset 0 -3px 0 var(--circle-accent) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-creation-progress li.is-complete {
    color: var(--circle-positive) !important;
    background: #f5faf8 !important;
    box-shadow: inset 0 -3px 0 var(--circle-positive) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-creation-progress li.is-active > span {
    color: #ffffff !important;
    background: var(--circle-brand) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-type-option {
    position: relative !important;
    overflow: hidden !important;
    border-color: rgba(11, 59, 56, 0.12) !important;
    box-shadow:
      0 0 0 1px rgba(11, 59, 56, 0.03),
      0 9px 24px rgba(11, 59, 56, 0.07) !important;
    transition:
      border-color 180ms ease,
      background-color 180ms ease,
      box-shadow 180ms ease,
      transform 150ms ease !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-type-option:hover {
    border-color: rgba(43, 184, 194, 0.58) !important;
    background: var(--circle-surface) !important;
    box-shadow:
      0 0 0 1px rgba(43, 184, 194, 0.2),
      0 14px 30px rgba(11, 59, 56, 0.1) !important;
    transform: translateY(-2px) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-type-option.is-active,
  html.circle-design-v1.deep-ledger-v5 .event-type-option[aria-checked="true"] {
    border-color: rgba(43, 184, 194, 0.62) !important;
    color: var(--circle-brand) !important;
    background: var(--circle-selection) !important;
    box-shadow:
      inset 0 4px 0 var(--circle-accent),
      0 0 0 1px rgba(43, 184, 194, 0.16),
      0 12px 28px rgba(11, 59, 56, 0.09) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .event-type-option .studio-event-type-icon {
    border-radius: 8px !important;
    color: var(--circle-brand) !important;
    background: #e2f5f5 !important;
    box-shadow: inset 0 0 0 1px rgba(43, 184, 194, 0.16) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .create-event-panel,
  html.circle-design-v1.deep-ledger-v5 .join-event-panel,
  html.circle-design-v1.deep-ledger-v5 .group-create-panel,
  html.circle-design-v1.deep-ledger-v5 .profile-setup-panel,
  html.circle-design-v1.deep-ledger-v5 .event-start-panel {
    border: 0 !important;
    background: var(--circle-surface) !important;
    box-shadow:
      inset 0 3px 0 var(--circle-accent),
      0 0 0 1px rgba(11, 59, 56, 0.07),
      0 14px 34px rgba(11, 59, 56, 0.08) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .join-event-panel::before,
  html.circle-design-v1.deep-ledger-v5 .group-create-panel::before {
    content: none !important;
    display: none !important;
  }

  html.circle-design-v1.deep-ledger-v5 input,
  html.circle-design-v1.deep-ledger-v5 select,
  html.circle-design-v1.deep-ledger-v5 textarea {
    transition:
      border-color 160ms ease,
      background-color 160ms ease,
      box-shadow 160ms ease !important;
  }

  html.circle-design-v1.deep-ledger-v5 input:hover:not(:disabled),
  html.circle-design-v1.deep-ledger-v5 select:hover:not(:disabled),
  html.circle-design-v1.deep-ledger-v5 textarea:hover:not(:disabled) {
    border-color: rgba(11, 59, 56, 0.34) !important;
  }

  html.circle-design-v1.deep-ledger-v5 .secondary-button,
  html.circle-design-v1.deep-ledger-v5 .primary-button,
  html.circle-design-v1.deep-ledger-v5 .event-row,
  html.circle-design-v1.deep-ledger-v5 .group-row {
    transition:
      color 160ms ease,
      border-color 160ms ease,
      background-color 160ms ease,
      box-shadow 180ms ease,
      transform 140ms ease !important;
  }

  @media (max-width: 720px) {
    html.circle-design-v1.deep-ledger-v5
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top {
      width: auto !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 14px !important;
      margin: 0 -16px 20px !important;
      padding: 24px 18px 22px !important;
      border-radius: 0 !important;
      box-shadow:
        inset 0 -3px 0 rgba(43, 184, 194, 0.78),
        0 14px 30px rgba(6, 40, 37, 0.14) !important;
    }

    html.circle-design-v1.deep-ledger-v5
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top
      h1 {
      max-width: 100% !important;
      font-size: 29px !important;
      line-height: 1.14 !important;
    }

    html.circle-design-v1.deep-ledger-v5
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top
      .muted,
    html.circle-design-v1.deep-ledger-v5
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top
      .opened-at {
      font-size: 13px !important;
    }

    html.circle-design-v1.deep-ledger-v5 .event-workspace-nav {
      margin-top: -4px !important;
      box-shadow:
        0 0 0 1px rgba(11, 59, 56, 0.07),
        0 7px 18px rgba(11, 59, 56, 0.07) !important;
    }

    html.circle-design-v1.deep-ledger-v5 .event-creation-progress {
      margin-bottom: 16px !important;
    }

    html.circle-design-v1.deep-ledger-v5 .event-creation-progress li {
      min-height: 50px !important;
      padding-inline: 11px !important;
    }

    html.circle-design-v1.deep-ledger-v5 .event-type-option {
      min-height: 108px !important;
      padding: 16px !important;
    }

    html.circle-design-v1.deep-ledger-v5 .modal-route-controls .modal-back-button,
    html.circle-design-v1.deep-ledger-v5 .modal-route-controls .modal-home-button {
      width: 48px !important;
      min-width: 48px !important;
      height: 48px !important;
      min-height: 48px !important;
      padding: 0 !important;
    }

    html.circle-design-v1.deep-ledger-v5
      .modal-route-controls
      .modal-back-button-label,
    html.circle-design-v1.deep-ledger-v5
      .modal-route-controls
      .modal-home-button
      > span:last-child {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      clip: rect(0 0 0 0) !important;
      white-space: nowrap !important;
    }

    html.circle-design-v1.deep-ledger-v5 .create-event-panel,
    html.circle-design-v1.deep-ledger-v5 .join-event-panel,
    html.circle-design-v1.deep-ledger-v5 .group-create-panel,
    html.circle-design-v1.deep-ledger-v5 .profile-setup-panel,
    html.circle-design-v1.deep-ledger-v5 .event-start-panel {
      box-shadow:
        inset 0 3px 0 var(--circle-accent),
        0 0 0 1px rgba(11, 59, 56, 0.07),
        0 9px 24px rgba(11, 59, 56, 0.07) !important;
    }
  }

  @media (max-width: 430px) {
    html.circle-design-v1.deep-ledger-v5 .event-workspace-nav {
      overflow-x: hidden !important;
    }

    html.circle-design-v1.deep-ledger-v5 .event-workspace-tab {
      flex: 1 1 25% !important;
      min-width: 0 !important;
      min-height: 48px !important;
      padding-inline: 3px !important;
      font-size: 12.5px !important;
      white-space: nowrap !important;
    }

    html.circle-design-v1.deep-ledger-v5
      .screen[data-screen-kind="event"]
      > .top
      .event-header-actions
      .event-settings-button {
      width: 44px !important;
      min-width: 44px !important;
      padding: 0 !important;
    }

    html.circle-design-v1.deep-ledger-v5
      .screen[data-screen-kind="event"]
      > .top
      .event-settings-label {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      clip: rect(0 0 0 0) !important;
      white-space: nowrap !important;
    }

    html.circle-design-v1.deep-ledger-v5 .event-creation-progress li strong {
      font-size: 12.5px !important;
    }

    html.circle-design-v1.deep-ledger-v5 .event-creation-progress li > span {
      width: 24px !important;
      min-width: 24px !important;
      height: 24px !important;
    }
  }

  /* Deep Ledger v6: compact task chrome and clearer first actions. */
  html.circle-design-v1.deep-ledger-v6
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top {
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: end !important;
    gap: 18px !important;
    margin: 0 0 20px !important;
    padding: 22px 0 18px !important;
    overflow: visible !important;
    border: 0 !important;
    border-bottom: 1px solid var(--circle-line-strong) !important;
    border-radius: 0 !important;
    color: var(--circle-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.deep-ledger-v6
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .brand {
    max-width: 680px !important;
    padding-inline-start: 0 !important;
  }

  html.circle-design-v1.deep-ledger-v6
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    h1 {
    max-width: 24ch !important;
    color: var(--circle-ink) !important;
    font-size: 32px !important;
    line-height: 1.12 !important;
  }

  html.circle-design-v1.deep-ledger-v6
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .eyebrow {
    color: var(--circle-focus) !important;
  }

  html.circle-design-v1.deep-ledger-v6
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .muted,
  html.circle-design-v1.deep-ledger-v6
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    .opened-at {
    color: var(--circle-muted) !important;
  }

  html.circle-design-v1.deep-ledger-v6
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    > .app-back-button,
  html.circle-design-v1.deep-ledger-v6
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions
    .event-settings-button {
    border: 1px solid var(--circle-line-strong) !important;
    color: var(--circle-brand) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.deep-ledger-v6
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top
    > .app-back-button:hover:not(:disabled),
  html.circle-design-v1.deep-ledger-v6
    .screen[data-screen-kind="event"]
    > .top
    .event-header-actions
    .event-settings-button:hover:not(:disabled) {
    border-color: rgba(43, 184, 194, 0.48) !important;
    color: var(--circle-brand) !important;
    background: var(--circle-selection) !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-workspace-nav {
    border: 1px solid var(--circle-line) !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 1px 2px rgba(11, 59, 56, 0.04) !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-workspace-tab.is-active,
  html.circle-design-v1.deep-ledger-v6 .event-workspace-tab[aria-current="page"] {
    color: var(--circle-brand) !important;
    background: var(--circle-selection) !important;
    box-shadow: inset 0 -3px 0 var(--circle-accent) !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-creation-progress {
    gap: 0 !important;
    overflow: visible !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-creation-progress li,
  html.circle-design-v1.deep-ledger-v6 .event-creation-progress li:first-child {
    min-height: 46px !important;
    padding-inline: 8px !important;
    border: 0 !important;
    border-bottom: 2px solid var(--circle-line) !important;
    color: var(--circle-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-creation-progress li.is-active {
    color: var(--circle-brand) !important;
    background: transparent !important;
    box-shadow: inset 0 -3px 0 var(--circle-accent) !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-creation-progress li.is-complete {
    color: var(--circle-muted) !important;
    background: transparent !important;
    box-shadow: inset 0 -2px 0 var(--circle-line-strong) !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-creation-progress li.is-active > span {
    color: #ffffff !important;
    background: var(--circle-brand) !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-type-step-panel {
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-type-options {
    gap: 12px !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-type-option {
    border: 1px solid var(--circle-line-strong) !important;
    background: var(--circle-surface) !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-type-option:hover {
    border-color: rgba(43, 184, 194, 0.6) !important;
    background: #f8fbfa !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-type-option.is-active,
  html.circle-design-v1.deep-ledger-v6 .event-type-option[aria-checked="true"] {
    border-color: var(--circle-accent) !important;
    color: var(--circle-brand) !important;
    background: var(--circle-selection) !important;
    box-shadow: inset 0 0 0 1px rgba(43, 184, 194, 0.16) !important;
  }

  html.circle-design-v1.deep-ledger-v6 .create-event-panel,
  html.circle-design-v1.deep-ledger-v6 .join-event-panel,
  html.circle-design-v1.deep-ledger-v6 .group-create-panel,
  html.circle-design-v1.deep-ledger-v6 .profile-setup-panel,
  html.circle-design-v1.deep-ledger-v6 .event-start-panel {
    border: 1px solid var(--circle-line) !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 1px 2px rgba(11, 59, 56, 0.04) !important;
  }

  html.circle-design-v1.deep-ledger-v6 .create-event-panel.event-type-step-panel {
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1.deep-ledger-v6 .event-start-panel.is-invite-first .event-start-secondary {
    justify-content: flex-start !important;
  }

  @media (min-width: 721px) {
    html.circle-design-v1.deep-ledger-v6 .product-app-identity {
      width: 100% !important;
      margin-inline: 0 !important;
      padding-inline: 0 !important;
      box-shadow: 0 1px 0 var(--circle-line) !important;
    }
  }

  @media (max-width: 720px) {
    html.circle-design-v1.deep-ledger-v6
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top {
      width: auto !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 12px !important;
      margin: 0 0 16px !important;
      padding: 18px 0 16px !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    html.circle-design-v1.deep-ledger-v6
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top
      h1 {
      font-size: 26px !important;
      line-height: 1.14 !important;
    }

    html.circle-design-v1.deep-ledger-v6 .event-creation-progress {
      margin-bottom: 14px !important;
    }

    html.circle-design-v1.deep-ledger-v6 .event-creation-progress li {
      min-height: 46px !important;
      padding-inline: 6px !important;
    }

    html.circle-design-v1.deep-ledger-v6 .event-type-option {
      min-height: 96px !important;
      padding: 15px !important;
    }

    html.circle-design-v1.deep-ledger-v6 .event-start-panel.is-invite-first .event-start-secondary .secondary-button {
      width: 100% !important;
    }
  }

  /* Deep Ledger v7: faster restaurant entry and quieter interactive depth. */
  html.circle-design-v1.deep-ledger-v7
    .screen[data-screen-kind="home"]
    .hero-actions
    .primary-button,
  html.circle-design-v1.deep-ledger-v7 .recent-event-shortcut .primary-button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 9px !important;
  }

  html.circle-design-v1.deep-ledger-v7
    .screen[data-screen-kind="home"]
    .hero-actions
    .command-card-icon,
  html.circle-design-v1.deep-ledger-v7
    .recent-event-shortcut
    .command-card-icon {
    width: 19px !important;
    min-width: 19px !important;
    height: 19px !important;
  }

  html.circle-design-v1.deep-ledger-v7 .quick-expense-modal .quick-item-row {
    border: 1px solid var(--circle-line) !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 1px 2px rgba(11, 59, 56, 0.04) !important;
    transition:
      border-color 160ms ease,
      background-color 160ms ease,
      box-shadow 160ms ease !important;
  }

  html.circle-design-v1.deep-ledger-v7 .quick-expense-modal .quick-item-row:focus-within {
    border-color: rgba(43, 184, 194, 0.62) !important;
    background: #fbfefd !important;
    box-shadow: 0 0 0 3px rgba(43, 184, 194, 0.12) !important;
  }

  html.circle-design-v1.deep-ledger-v7
    .quick-expense-modal
    .quick-item-row
    > .field:nth-of-type(3)
    select {
    padding-inline: 14px 42px !important;
    text-overflow: ellipsis !important;
  }

  html.circle-design-v1.deep-ledger-v7 .quick-item-inline-guest {
    grid-column: 1 / -1 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 8px !important;
    align-items: end !important;
    padding: 12px !important;
    border-radius: 8px !important;
    background: var(--circle-selection) !important;
    box-shadow: inset 0 0 0 1px rgba(43, 184, 194, 0.2) !important;
  }

  html.circle-design-v1.deep-ledger-v7 .quick-item-inline-guest input,
  html.circle-design-v1.deep-ledger-v7 .quick-item-inline-guest button {
    min-height: 48px !important;
  }

  html.circle-design-v1.deep-ledger-v7 .quick-expense-guest-details {
    display: block !important;
    overflow: hidden !important;
    padding: 0 !important;
    border: 1px solid var(--circle-line) !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 1px 2px rgba(11, 59, 56, 0.04) !important;
  }

  html.circle-design-v1.deep-ledger-v7 .quick-expense-guest-details > summary {
    min-height: 60px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding: 12px 15px !important;
    cursor: pointer !important;
    list-style: none !important;
  }

  html.circle-design-v1.deep-ledger-v7
    .quick-expense-guest-details
    > summary::-webkit-details-marker {
    display: none !important;
  }

  html.circle-design-v1.deep-ledger-v7 .quick-expense-guest-details > summary::after {
    content: "+" !important;
    width: 28px !important;
    min-width: 28px !important;
    height: 28px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 50% !important;
    color: var(--circle-brand) !important;
    background: var(--circle-selection) !important;
    font-size: 20px !important;
    line-height: 1 !important;
  }

  html.circle-design-v1.deep-ledger-v7
    .quick-expense-guest-details[open]
    > summary::after {
    content: "−" !important;
  }

  html.circle-design-v1.deep-ledger-v7 .quick-expense-guest-details > summary > span {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.circle-design-v1.deep-ledger-v7 .quick-expense-guest-details > summary small {
    color: var(--circle-muted) !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1.deep-ledger-v7
    .quick-expense-guest-details
    .expense-guest-actions {
    margin: 0 !important;
    padding: 0 15px 15px !important;
  }

  @media (max-width: 430px) {
    html.circle-design-v1.deep-ledger-v7 .quick-item-inline-guest {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1.deep-ledger-v7 .quick-item-inline-guest button {
      width: 100% !important;
    }
  }

  /* Restaurant v2: one decision per step, fast price-first entry. */
  html.circle-design-v1 .restaurant-quick-modal {
    --restaurant-accent: #2bb8c2;
  }

  html.circle-design-v1 .restaurant-quick-progress {
    margin-block: 4px 18px !important;
  }

  html.circle-design-v1 .restaurant-method-step {
    display: grid !important;
    gap: 12px !important;
    padding-block: 8px !important;
  }

  html.circle-design-v1 .restaurant-method-option {
    width: 100% !important;
    min-height: 92px !important;
    display: grid !important;
    grid-template-columns: 48px minmax(0, 1fr) 20px !important;
    gap: 14px !important;
    align-items: center !important;
    padding: 16px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: 8px !important;
    color: var(--circle-ink) !important;
    text-align: start !important;
    background: var(--circle-surface) !important;
    box-shadow: 0 2px 8px rgba(11, 59, 56, 0.05) !important;
    cursor: pointer !important;
    transition:
      border-color 160ms ease,
      box-shadow 160ms ease,
      transform 160ms ease !important;
  }

  html.circle-design-v1 .restaurant-method-option:hover:not(:disabled) {
    border-color: rgba(43, 184, 194, 0.68) !important;
    box-shadow: 0 8px 20px rgba(11, 59, 56, 0.09) !important;
    transform: translateY(-1px) !important;
  }

  html.circle-design-v1 .restaurant-method-option:active:not(:disabled) {
    transform: scale(0.985) !important;
  }

  html.circle-design-v1 .restaurant-method-option:focus-visible {
    outline: 3px solid rgba(43, 184, 194, 0.22) !important;
    outline-offset: 2px !important;
  }

  html.circle-design-v1 .restaurant-method-option > span:nth-child(2) {
    min-width: 0 !important;
    display: grid !important;
    gap: 4px !important;
  }

  html.circle-design-v1 .restaurant-method-option strong {
    color: var(--circle-ink) !important;
    font-size: 18px !important;
    line-height: 1.35 !important;
    font-weight: 800 !important;
  }

  html.circle-design-v1 .restaurant-method-option small {
    color: var(--circle-muted) !important;
    font-size: 14px !important;
    line-height: 1.5 !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .restaurant-method-icon {
    width: 48px !important;
    height: 48px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 8px !important;
    color: var(--circle-brand) !important;
    background: var(--circle-selection) !important;
  }

  html.circle-design-v1 .restaurant-method-icon svg {
    width: 22px !important;
    height: 22px !important;
  }

  html.circle-design-v1 .restaurant-method-option.is-items .restaurant-method-icon {
    color: #0d6870 !important;
    background: #e2f5f6 !important;
  }

  html.circle-design-v1 .restaurant-method-arrow {
    color: var(--circle-muted) !important;
    font-size: 24px !important;
    line-height: 1 !important;
  }

  html.circle-design-v1 .restaurant-items-step {
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.circle-design-v1 .restaurant-equal-step {
    display: grid !important;
    gap: 14px !important;
  }

  html.circle-design-v1 .restaurant-equal-amount,
  html.circle-design-v1 .restaurant-equal-participants {
    padding: 16px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .restaurant-equal-amount input {
    min-height: 68px !important;
    font-size: 30px !important;
    font-weight: 900 !important;
    text-align: center !important;
  }

  html.circle-design-v1 .restaurant-equal-participants {
    display: grid !important;
    gap: 12px !important;
  }

  html.circle-design-v1 .restaurant-equal-participants .quick-person-option {
    min-height: 48px !important;
    display: grid !important;
    grid-template-columns: 24px minmax(0, 1fr) !important;
    gap: 12px !important;
    align-items: center !important;
    padding-block: 6px !important;
    cursor: pointer !important;
  }

  html.circle-design-v1 .restaurant-equal-participants .quick-person-option input {
    width: 24px !important;
    height: 24px !important;
    margin: 0 !important;
  }

  html.circle-design-v1 .restaurant-equal-participants .section-title-row {
    margin: 0 !important;
  }

  html.circle-design-v1 .quick-item-description-details {
    grid-column: 1 / -1 !important;
    min-width: 0 !important;
    padding-block: 2px !important;
  }

  html.circle-design-v1 .quick-item-description-details > summary {
    min-height: 42px !important;
    display: flex !important;
    align-items: center !important;
    color: var(--circle-muted) !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    cursor: pointer !important;
  }

  html.circle-design-v1 .quick-item-description-details[open] > summary {
    margin-bottom: 8px !important;
  }

  html.circle-design-v1 .quick-item-description-details .quick-item-name-field {
    margin: 0 !important;
  }

  html.circle-design-v1 .restaurant-quick-modal .quick-item-remove:disabled {
    visibility: hidden !important;
  }

  html.circle-design-v1 .quick-item-name-field > span {
    color: var(--circle-muted) !important;
  }

  html.circle-design-v1 .quick-item-name-field small {
    font: inherit !important;
    font-weight: 600 !important;
  }

  html.circle-design-v1 .restaurant-review-step,
  html.circle-design-v1 .restaurant-payer-step {
    display: grid !important;
    gap: 14px !important;
  }

  html.circle-design-v1 .restaurant-quick-modal .expense-modal-header {
    position: relative !important;
  }

  html.circle-design-v1 .restaurant-quick-modal .expense-modal-header-actions {
    position: absolute !important;
    inset: 0 !important;
    pointer-events: none !important;
  }

  html.circle-design-v1
    .restaurant-quick-modal
    .expense-modal-header-actions
    :is(.modal-section-back-button, .modal-close-button) {
    position: absolute !important;
    top: 0 !important;
    pointer-events: auto !important;
  }

  html.circle-design-v1
    .restaurant-quick-modal
    .expense-modal-header-actions
    .modal-section-back-button {
    inset-inline-start: 0 !important;
  }

  html.circle-design-v1
    .restaurant-quick-modal
    .expense-modal-header-actions
    .modal-close-button {
    inset-inline-end: 0 !important;
  }

  html.native-app.circle-design-v1
    .restaurant-quick-modal
    .expense-modal-header
    > div:first-child {
    width: 100% !important;
    padding-inline: 58px !important;
    text-align: center !important;
  }

  html.native-app.circle-design-v1
    .restaurant-quick-modal
    .expense-modal-header-actions
    :is(.modal-section-back-button, .modal-close-button) {
    top: max(20px, env(safe-area-inset-top)) !important;
  }

  html.circle-design-v1
    .restaurant-quick-modal[data-quick-stage="items"]
    .restaurant-quick-fields {
    padding-bottom: calc(108px + env(safe-area-inset-bottom)) !important;
  }

  html.circle-design-v1.ledger-workspace-v1
    .restaurant-quick-modal
    .quick-split-summary {
    margin-inline: 0 !important;
    border: 0 !important;
    color: #ffffff !important;
    background: var(--ledger-brand, #0b4a38) !important;
    box-shadow: 0 14px 30px rgba(7, 49, 39, 0.14) !important;
  }

  html.circle-design-v1.ledger-workspace-v1
    .restaurant-quick-modal
    .quick-split-summary
    :is(h3, strong, span, .muted) {
    color: #ffffff !important;
  }

  html.circle-design-v1.ledger-workspace-v1
    .restaurant-quick-modal
    .quick-split-summary
    .eyebrow,
  html.circle-design-v1.ledger-workspace-v1
    .restaurant-quick-modal
    .quick-split-summary
    .amount {
    color: #8be0df !important;
  }

  html.circle-design-v1 .quick-split-list-title {
    margin: 14px 0 8px !important;
    color: inherit !important;
    font-size: 14px !important;
    font-weight: 800 !important;
  }

  html.circle-design-v1 .restaurant-review-count {
    width: fit-content !important;
    margin-block: 0 !important;
    margin-inline: 20px !important;
    padding: 7px 10px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: 7px !important;
    color: var(--circle-muted) !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .restaurant-copy-action {
    min-height: 44px !important;
    justify-self: start !important;
  }

  html.circle-design-v1 .restaurant-payer-field,
  html.circle-design-v1 .restaurant-date-field {
    padding: 14px !important;
    border: 1px solid var(--circle-line) !important;
    border-radius: 8px !important;
    background: var(--circle-surface) !important;
  }

  html.circle-design-v1 .restaurant-review-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  html.circle-design-v1 .restaurant-review-actions .restaurant-dismiss-action {
    grid-column: 1 / -1 !important;
    min-height: 44px !important;
    border: 0 !important;
    color: var(--circle-brand) !important;
    text-decoration: underline !important;
    text-underline-offset: 3px !important;
    background: transparent !important;
    cursor: pointer !important;
  }

  html.circle-design-v1
    .restaurant-review-actions
    .restaurant-dismiss-action:hover {
    color: var(--circle-brand-strong, #082f28) !important;
  }

  html.circle-design-v1
    .restaurant-review-actions
    .restaurant-dismiss-action:focus-visible {
    outline: 3px solid rgba(139, 224, 223, 0.34) !important;
    outline-offset: 2px !important;
  }

  @media (max-width: 430px) {
    html.circle-design-v1 .restaurant-review-count {
      margin-inline: 14px !important;
    }

    html.circle-design-v1 .restaurant-method-option {
      min-height: 86px !important;
      grid-template-columns: 44px minmax(0, 1fr) 16px !important;
      gap: 11px !important;
      padding: 14px !important;
    }

    html.circle-design-v1 .restaurant-method-icon {
      width: 44px !important;
      height: 44px !important;
    }

    html.circle-design-v1 .restaurant-review-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.circle-design-v1
      .restaurant-quick-modal
      .quick-item-row
      > .quick-item-name-field {
      grid-column: 1 / 3 !important;
      grid-row: 3 !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    html.circle-design-v1 *,
    html.circle-design-v1 *::before,
    html.circle-design-v1 *::after {
      scroll-behavior: auto !important;
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 1ms !important;
    }

  }

  html.circle-design-v1 [hidden] {
    display: none !important;
  }
`;

let expenseEventId = "";
let knownExpenseIds = new Set();

setupCircleDesignLayer();

function setupCircleDesignLayer() {
  document.documentElement.classList.add(
    "circle-design-v1",
    "social-ledger-v2",
    "social-ledger-v4",
    "deep-ledger-v5",
    "deep-ledger-v6",
    "deep-ledger-v7"
  );
  injectStyles();
  keepBrandAssetsCurrent();
  keepHomePriorityCurrent();
  keepExpenseRowsCurrent();

  if (!document.body) return;

  new MutationObserver(scheduleRefresh).observe(document.body, {
    childList: true,
    subtree: true
  });
}

let refreshScheduled = false;

function scheduleRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;

  requestAnimationFrame(() => {
    refreshScheduled = false;
    keepBrandAssetsCurrent();
    keepHomePriorityCurrent();
    keepExpenseRowsCurrent();
  });
}

function keepBrandAssetsCurrent() {
  document.querySelectorAll(".product-brand-image").forEach((image) => {
    if (image.getAttribute("src") !== "./icon-192.png") {
      image.setAttribute("src", "./icon-192.png");
    }
  });

  document.querySelectorAll(".account-auth-mark img").forEach((image) => {
    if (image.getAttribute("src") !== "./icon-192.png") {
      image.setAttribute("src", "./icon-192.png");
    }
  });
}

function keepHomePriorityCurrent() {
  const screen = document.querySelector("#app .screen");
  if (!screen) return;

  const isHome =
    screen.classList.contains("product-home-screen") ||
    screen.getAttribute("data-product-screen") === "home";

  if (!isHome) {
    screen.classList.remove("circle-home-has-recent");
    return;
  }

  const recentEvent = screen.querySelector(".recent-event-shortcut");
  screen.classList.toggle("circle-home-has-recent", Boolean(recentEvent));
}

function keepExpenseRowsCurrent() {
  const eventScreen = document.querySelector('#app .screen[data-screen-kind="event"]');
  const nextEventId = eventScreen?.getAttribute("data-event-id") || "";
  const rows = [...(eventScreen?.querySelectorAll(".expense-row[data-expense-id]") || [])];

  if (!nextEventId || nextEventId !== expenseEventId) {
    expenseEventId = nextEventId;
    knownExpenseIds = new Set(rows.map((row) => row.getAttribute("data-expense-id")));
    return;
  }

  rows.forEach((row) => {
    const expenseId = row.getAttribute("data-expense-id");
    if (!expenseId || knownExpenseIds.has(expenseId)) return;

    row.classList.add("circle-row-added");
    window.setTimeout(() => row.classList.remove("circle-row-added"), 900);
  });

  knownExpenseIds = new Set(rows.map((row) => row.getAttribute("data-expense-id")));
}

function injectStyles() {
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(CSS));
  document.head.append(style);
}
