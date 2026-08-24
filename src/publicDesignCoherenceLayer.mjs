const STYLE_ID = "public-design-coherence-layer-style";

const CSS = `
  html.design-coherence-v1 {
    --app-font-hebrew: "Rubik", "Heebo", "Assistant", sans-serif;
    --app-font-num: "Inter", "Rubik", sans-serif;
    --app-canvas: #f8fafc;
    --app-surface: #ffffff;
    --app-surface-soft: #f1f5f9;
    --app-ink: #0f172a;
    --app-muted: #475569;
    --app-faint: #64748b;
    --app-line: #e2e8f0;
    --app-line-strong: #cbd5e1;
    --app-brand: #164e3f;
    --app-brand-deep: #164e3f;
    --app-brand-bright: #164e3f;
    --app-accent: #164e3f;
    --app-accent-soft: #edf4f1;
    --app-danger: #ef4444;
    --app-positive: #10b981;
    --app-radius-control: 10px;
    --app-radius-card: 10px;
    --app-radius-panel: 12px;
    --app-radius-hero: 12px;
    --app-shadow-card: 0 1px 3px rgba(15, 23, 42, 0.05);
    --app-shadow-panel: 0 1px 3px rgba(15, 23, 42, 0.06);
    --app-shadow-hero:
      0 18px 42px rgba(22, 78, 63, 0.22),
      0 0 28px rgba(20, 184, 166, 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    --app-motion: 180ms cubic-bezier(0.22, 1, 0.36, 1);
    color: var(--app-ink);
    background: var(--app-canvas);
  }

  html.design-coherence-v1 body,
  html.design-coherence-v1 button,
  html.design-coherence-v1 input,
  html.design-coherence-v1 select,
  html.design-coherence-v1 textarea {
    font-family: var(--app-font-hebrew) !important;
    letter-spacing: 0 !important;
  }

  html.design-coherence-v1 .font-num,
  html.design-coherence-v1 .font-num *,
  html.design-coherence-v1 .currency-input-badge {
    font-family: var(--app-font-num) !important;
    font-weight: 900 !important;
    font-variant-numeric: tabular-nums;
    direction: ltr;
    unicode-bidi: isolate;
  }

  html.design-coherence-v1 body,
  html.design-coherence-v1 .app,
  html.design-coherence-v1 .screen {
    color: var(--app-ink) !important;
    background: var(--app-canvas) !important;
  }

  html.design-coherence-v1 .screen {
    width: min(100%, 448px) !important;
    margin-inline: auto !important;
    padding-inline: 20px !important;
    padding-bottom: calc(140px + env(safe-area-inset-bottom)) !important;
  }

  html.design-coherence-v1 .product-app-identity {
    width: 100% !important;
    min-height: 70px !important;
    align-items: center !important;
    gap: 12px !important;
    margin: 0 !important;
    padding: 12px 2px 10px !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 .product-brand-lockup {
    min-width: 0 !important;
    align-items: center !important;
    gap: 10px !important;
  }

  html.design-coherence-v1 .product-brand-mark {
    width: 42px !important;
    min-width: 42px !important;
    height: 42px !important;
  }

  html.design-coherence-v1 .product-header-profile-avatar {
    width: 44px !important;
    min-width: 44px !important;
    height: 44px !important;
    min-height: 44px !important;
    border: 1px solid var(--app-line) !important;
    border-radius: 50% !important;
    background: var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1 .product-brand-copy strong {
    color: var(--app-ink) !important;
    font-size: 17px !important;
    font-weight: 600 !important;
    line-height: 1.08 !important;
  }

  html.design-coherence-v1 .product-brand-copy small {
    color: var(--app-muted) !important;
    font-size: 11.5px !important;
    font-weight: 500 !important;
    line-height: 1.2 !important;
  }

  html.design-coherence-v1
    .product-nav-button:not(.is-active):not([aria-current="page"]),
  html.design-coherence-v1
    .event-workspace-tab:not(.is-active):not([aria-current="page"]) {
    color: var(--app-muted) !important;
  }

  html.design-coherence-v1 .product-nav-button {
    font-size: 12px !important;
  }

  html.design-coherence-v1 .transfer-status:not(.status-paid) {
    color: var(--app-danger) !important;
  }

  html.design-coherence-v1 .screen > .top {
    position: relative !important;
    isolation: isolate !important;
    overflow: hidden !important;
    border: 1px solid var(--app-brand) !important;
    color: #ffffff !important;
    background: var(--app-brand) !important;
    box-shadow: var(--app-shadow-hero) !important;
  }

  html.design-coherence-v1 .screen[data-screen-kind="home"] > .top,
  html.design-coherence-v1 .product-home-screen > .top {
    margin: 14px 0 46px !important;
    padding: 27px 30px 34px !important;
    border-radius: var(--app-radius-hero) !important;
  }

  html.design-coherence-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top {
    min-height: 112px !important;
    margin: 8px 0 13px !important;
    padding: 16px 18px !important;
    border-radius: var(--app-radius-hero) !important;
  }

  html.design-coherence-v1
    .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
    > .top::after {
    opacity: 0.08 !important;
    animation: none !important;
  }

  html.design-coherence-v1 .screen > .top :is(.brand, .hero-actions) {
    position: relative !important;
    z-index: 1 !important;
  }

  html.design-coherence-v1 .screen > .top :is(h1, h2, h3) {
    color: #ffffff !important;
    font-family: var(--app-font-hebrew) !important;
    font-weight: 600 !important;
    letter-spacing: 0 !important;
  }

  html.design-coherence-v1 .screen > .top .eyebrow {
    color: rgba(230, 255, 248, 0.78) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .screen > .top .muted {
    color: rgba(240, 255, 250, 0.72) !important;
    font-weight: 500 !important;
  }

  html.design-coherence-v1 .screen > .top .hero-actions {
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 .screen > .top :is(.secondary-button, .icon-button) {
    border-color: rgba(255, 255, 255, 0.2) !important;
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.1) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 .screen > .top :is(.secondary-button, .icon-button):hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.34) !important;
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.16) !important;
  }

  html.design-coherence-v1 .screen[data-screen-kind="home"] > .top .primary-button,
  html.design-coherence-v1 .product-home-screen > .top .primary-button {
    min-height: 56px !important;
    padding-inline: 28px !important;
    border: 1px solid rgba(7, 31, 24, 0.1) !important;
    border-radius: var(--app-radius-control) !important;
    color: #0a3e30 !important;
    background: #ffffff !important;
    box-shadow: var(--app-shadow-card) !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 :is(.panel, .event-action-dock, .settlement-stage) {
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-panel) !important;
    background: var(--app-surface) !important;
    box-shadow: var(--app-shadow-panel) !important;
  }

  html.design-coherence-v1 :is(.primary-button, .secondary-button, .icon-button, .app-choice-trigger) {
    min-height: 48px !important;
    border-radius: var(--app-radius-control) !important;
    font-family: var(--app-font-hebrew) !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .primary-button {
    border-color: var(--app-brand) !important;
    color: #ffffff !important;
    background: var(--app-brand) !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1 :is(.secondary-button, .icon-button, .app-choice-trigger) {
    border: 1px solid var(--app-line-strong) !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 :is(input, select, textarea) {
    min-height: 50px !important;
    border: 1px solid var(--app-line-strong) !important;
    border-radius: var(--app-radius-control) !important;
    color: var(--app-ink) !important;
    background: #ffffff !important;
    box-shadow: inset 0 1px 2px rgba(12, 27, 32, 0.025) !important;
    font-size: 16px !important;
  }

  html.design-coherence-v1 :is(input, select, textarea):focus {
    border-color: var(--app-accent) !important;
    box-shadow: 0 0 0 3px rgba(22, 78, 63, 0.12) !important;
  }

  html.design-coherence-v1 :is(.event-workspace-nav, .event-creation-progress, .friends-hub-tabs, .segmented-control) {
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-control) !important;
    background: var(--app-surface) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 :is(.event-workspace-tab, .friends-hub-tab, .segmented-control button).is-active,
  html.design-coherence-v1 :is(.event-workspace-tab, .friends-hub-tab)[aria-selected="true"] {
    color: #ffffff !important;
    background: var(--app-brand) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 :is(.expense-row, .transfer-row, .notification-inbox-item, .friend-row, .group-row, .event-settings-menu-item, .participant-identity-pair) {
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-card) !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1 :is(.expense-row, .transfer-row, .notification-inbox-item, .friend-row, .group-row, .event-settings-menu-item):hover {
    border-color: var(--app-line-strong) !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1 .event-type-step-panel {
    overflow: visible !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 .event-type-options {
    display: grid !important;
    gap: 10px !important;
  }

  html.design-coherence-v1 .event-type-option {
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-card) !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1 .event-type-option:hover,
  html.design-coherence-v1 .event-type-option[aria-checked="true"] {
    border-color: var(--app-brand) !important;
    background: var(--app-surface-soft) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 :is(.event-row, .friend-row, .group-row, .notification-inbox-item) :is(strong, h3),
  html.design-coherence-v1 .section-title-row h2 {
    color: var(--app-ink) !important;
    font-family: var(--app-font-hebrew) !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 :is(.status-chip, .participant-connection-badge, .personal-transfer-badge, .group-transfer-badge) {
    font-family: var(--app-font-hebrew) !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 :is(.event-modal, .expense-modal, .app-choice-picker, .install-app-dialog, .referral-dialog-shell, .account-feedback-dialog, .account-delete-dialog, .important-action-dialog) {
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-hero) !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12) !important;
  }

  html.design-coherence-v1 :is(.event-modal-header, .expense-modal-header, .app-choice-picker-header, .referral-dialog-header) {
    border-bottom: 1px solid var(--app-line) !important;
    background: var(--app-surface) !important;
  }

  html.design-coherence-v1 :is(.event-modal-header, .expense-modal-header, .app-choice-picker-header, .referral-dialog-header) h2 {
    color: var(--app-ink) !important;
    font-family: var(--app-font-hebrew) !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 :is(.event-modal-header, .expense-modal-header) .muted {
    color: var(--app-faint) !important;
  }

  html.design-coherence-v1 .app-choice-option {
    min-height: 54px !important;
    border: 1px solid transparent !important;
    border-radius: var(--app-radius-control) !important;
    color: var(--app-ink) !important;
    background: transparent !important;
  }

  html.design-coherence-v1 .app-choice-option:hover,
  html.design-coherence-v1 .app-choice-option[aria-selected="true"] {
    border-color: var(--app-line-strong) !important;
    background: var(--app-accent-soft) !important;
  }

  html.design-coherence-v1 :is(.notification-inbox-skeleton-row, .event-skeleton-row, .loading-skeleton) {
    border-radius: var(--app-radius-card) !important;
    background: #e2e8f0 !important;
    background-size: auto !important;
  }

  html.design-coherence-v1 .friend-privacy-note {
    display: grid !important;
    gap: 3px !important;
    padding: 2px 2px 6px !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 .friend-privacy-note > summary {
    display: flex !important;
    min-height: 44px !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
    list-style: none !important;
    cursor: pointer !important;
  }

  html.design-coherence-v1 .friend-privacy-note > summary::-webkit-details-marker,
  html.design-coherence-v1 .friend-privacy-note > summary::marker {
    display: none !important;
    content: "" !important;
  }

  html.design-coherence-v1 .friend-privacy-summary-label {
    color: var(--app-ink) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .friend-privacy-chevron {
    flex: 0 0 auto !important;
    color: var(--app-muted) !important;
    transition: transform 160ms ease !important;
  }

  html.design-coherence-v1 .friend-privacy-note[open] .friend-privacy-chevron {
    transform: rotate(-90deg) !important;
  }

  html.design-coherence-v1 .app-back-button-glyph {
    display: inline-grid !important;
    place-items: center !important;
  }

  html.design-coherence-v1 .app-back-button-glyph .ui-icon-svg {
    width: 22px !important;
    height: 22px !important;
  }

  html.design-coherence-v1 .friend-privacy-note strong {
    color: var(--app-ink) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .friend-privacy-note span {
    color: var(--app-muted) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    line-height: 1.45 !important;
  }

  html.design-coherence-v1 .friends-toolbar {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: end !important;
    gap: 10px !important;
  }

  html.design-coherence-v1 .friends-toolbar.is-compact {
    display: flex !important;
    justify-content: flex-start !important;
  }

  html.design-coherence-v1 .friends-add-trigger {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    white-space: nowrap !important;
  }

  html.design-coherence-v1 .friends-add-trigger .command-card-icon {
    width: 19px !important;
    height: 19px !important;
  }

  html.design-coherence-v1 .friends-empty-state {
    min-height: 230px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 9px !important;
    padding: 34px 24px !important;
    text-align: center !important;
  }

  html.design-coherence-v1 .friends-empty-icon {
    width: 32px !important;
    height: 32px !important;
    display: grid !important;
    place-items: center !important;
    margin-bottom: 4px !important;
    border-radius: 0 !important;
    color: var(--app-brand) !important;
    background: transparent !important;
  }

  html.design-coherence-v1 .friends-empty-icon .command-card-icon {
    width: 25px !important;
    height: 25px !important;
  }

  html.design-coherence-v1 .friends-empty-state h2 {
    margin: 0 !important;
    color: var(--app-ink) !important;
    font-size: 20px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .friends-empty-state p {
    max-width: 34ch !important;
    margin: 0 0 8px !important;
    color: var(--app-muted) !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    line-height: 1.55 !important;
  }

  html.design-coherence-v1 .friend-add-screen {
    width: min(100%, 448px) !important;
  }

  html.design-coherence-v1 .friend-add-mode-switch {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
    margin-bottom: 14px !important;
  }

  html.design-coherence-v1 .friend-add-mode-button {
    min-width: 0 !important;
    min-height: 88px !important;
    display: grid !important;
    grid-template-columns: 36px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 9px !important;
    padding: 12px !important;
    border: 1px solid var(--app-line-strong) !important;
    border-radius: var(--app-radius-card) !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    text-align: start !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 .friend-add-mode-button:hover:not(:disabled) {
    border-color: var(--app-line-strong) !important;
    background: var(--app-surface-soft) !important;
  }

  html.design-coherence-v1 .friend-add-mode-button.is-active,
  html.design-coherence-v1 .friend-add-mode-button[aria-selected="true"] {
    border-color: var(--app-brand) !important;
    color: var(--app-brand) !important;
    background: var(--app-accent-soft) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 .friend-add-mode-button > span:last-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.design-coherence-v1 .friend-add-mode-button strong {
    color: inherit !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    line-height: 1.25 !important;
  }

  html.design-coherence-v1 .friend-add-mode-button small {
    color: var(--app-muted) !important;
    font-size: 10.5px !important;
    font-weight: 500 !important;
    line-height: 1.35 !important;
  }

  html.design-coherence-v1 .friend-add-mode-icon {
    width: 36px !important;
    height: 36px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 0 !important;
    color: var(--app-brand) !important;
    background: transparent !important;
  }

  html.design-coherence-v1 .friend-add-mode-icon.is-offline {
    color: var(--app-muted) !important;
    background: transparent !important;
  }

  html.design-coherence-v1 .friend-add-mode-icon .command-card-icon {
    width: 20px !important;
    height: 20px !important;
  }

  html.design-coherence-v1 .friend-add-step {
    min-width: 0 !important;
  }

  html.design-coherence-v1 .friend-add-step :is(.friend-network-panel, .friend-add-focus-panel) {
    display: grid !important;
    gap: 16px !important;
    padding: 18px !important;
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-panel) !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    box-shadow: var(--app-shadow-panel) !important;
  }

  html.design-coherence-v1 .friend-add-focus-heading {
    display: grid !important;
    gap: 5px !important;
  }

  html.design-coherence-v1 .friend-add-focus-heading h2 {
    margin: 0 !important;
    color: var(--app-ink) !important;
    font-size: 19px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .friend-add-focus-heading p {
    margin: 0 !important;
    color: var(--app-muted) !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    line-height: 1.5 !important;
  }

  html.design-coherence-v1 .friend-add-step .friends-add-offline-form {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 12px !important;
  }

  html.design-coherence-v1 .friend-add-step .friends-add-offline-form .field {
    margin: 0 !important;
  }

  html.design-coherence-v1 button,
  html.design-coherence-v1 a,
  html.design-coherence-v1 input,
  html.design-coherence-v1 select,
  html.design-coherence-v1 textarea {
    transition:
      color var(--app-motion),
      background-color var(--app-motion),
      border-color var(--app-motion),
      box-shadow var(--app-motion),
      opacity var(--app-motion),
      transform 140ms cubic-bezier(0.22, 1, 0.36, 1) !important;
  }

  html.design-coherence-v1 button:focus-visible,
  html.design-coherence-v1 a:focus-visible,
  html.design-coherence-v1 input:focus-visible,
  html.design-coherence-v1 select:focus-visible,
  html.design-coherence-v1 textarea:focus-visible {
    outline: 3px solid rgba(22, 78, 63, 0.28) !important;
    outline-offset: 2px !important;
  }

  @media (max-width: 720px) {
    html.design-coherence-v1 .screen {
      padding-inline: 14px !important;
    }

    html.design-coherence-v1 .product-app-identity {
      min-height: calc(68px + env(safe-area-inset-top)) !important;
      padding-block-start: calc(10px + env(safe-area-inset-top)) !important;
    }

    html.design-coherence-v1 .screen[data-screen-kind="home"] > .top,
    html.design-coherence-v1 .product-home-screen > .top {
      margin-block: 10px 42px !important;
      padding: 24px 20px 30px !important;
      border-radius: var(--app-radius-hero) !important;
    }

    html.design-coherence-v1 .screen[data-screen-kind="home"] > .top h1,
    html.design-coherence-v1 .product-home-screen > .top h1 {
      font-size: 38px !important;
      line-height: 1.08 !important;
    }

    html.design-coherence-v1
      .screen:not([data-screen-kind="home"]):not([data-product-screen="home"]):not(.product-home-screen)
      > .top {
      min-height: 112px !important;
      margin-block: 8px 13px !important;
      padding: 16px 18px !important;
      border-radius: var(--app-radius-hero) !important;
    }

    html.design-coherence-v1 :is(.event-modal, .expense-modal, .app-choice-picker) {
      width: 100% !important;
      max-width: none !important;
      min-height: 100dvh !important;
      border-width: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    html.design-coherence-v1 :is(.event-modal-header, .expense-modal-header, .app-choice-picker-header) {
      padding-top: calc(12px + env(safe-area-inset-top)) !important;
    }
  }

  @media (max-width: 380px) {
    html.design-coherence-v1 .screen {
      padding-inline: 12px !important;
    }

    html.design-coherence-v1 .product-brand-copy strong {
      font-size: 16px !important;
    }

    html.design-coherence-v1 .product-brand-copy small {
      font-size: 10.5px !important;
    }

    html.design-coherence-v1 .friend-add-mode-switch {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.design-coherence-v1 .friend-add-mode-button {
      min-height: 70px !important;
    }
  }

  /* These final contracts intentionally outrank the retired visual layers. */
  html.design-coherence-v1 body #app
    .product-header-profile-avatar {
    width: 44px !important;
    min-width: 44px !important;
    height: 44px !important;
    min-height: 44px !important;
    display: inline-grid !important;
    place-items: center !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--app-line) !important;
    border-radius: 50% !important;
    background: var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1 body #app
    .screen
    > .top
    :is(h1, h2, h3) {
    color: #ffffff !important;
    font-family: var(--app-font-hebrew) !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 body #app
    .screen
    > .top
    :is(.secondary-button, .icon-button) {
    border-color: rgba(255, 255, 255, 0.2) !important;
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.1) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .screen[data-screen-kind="home"]
    > .top
    .primary-button,
  html.design-coherence-v1 body #app
    .product-home-screen
    > .top
    .primary-button {
    border-color: rgba(7, 31, 24, 0.1) !important;
    color: #0a3e30 !important;
    background: #ffffff !important;
  }

  html.design-coherence-v1 body #app
    .screen
    > .product-app-identity,
  html.design-coherence-v1.ledger-workspace-v1
    .screen
    > .product-app-identity,
  html.design-coherence-v1 .product-app-identity {
    z-index: 75 !important;
  }

  html.design-coherence-v1 .product-app-nav {
    z-index: 200 !important;
    isolation: isolate !important;
    pointer-events: auto !important;
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-panel) !important;
    background: var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  html.design-coherence-v1 .product-nav-button {
    border: 0 !important;
    border-radius: 8px !important;
    background: transparent !important;
    box-shadow: none !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1
    .product-nav-button:is(.is-active, [aria-current="page"]) {
    color: var(--app-brand) !important;
    background: var(--app-surface-soft) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 .product-nav-button::after {
    display: none !important;
  }

  /* Strict financial UI contract: solid surfaces and a controlled brand glow on hero surfaces only. */
  html.design-coherence-v1 body #app
    .screen
    > .top {
    border: 1px solid var(--app-brand) !important;
    border-radius: var(--app-radius-hero) !important;
    background: var(--app-brand) !important;
    background-image: none !important;
    box-shadow: var(--app-shadow-hero) !important;
  }

  html.design-coherence-v1 body #app
    .screen
    > .top::before,
  html.design-coherence-v1 body #app
    .screen
    > .top::after,
  html.design-coherence-v1 body #app
    .primary-button::before,
  html.design-coherence-v1 body #app
    .primary-button::after {
    display: none !important;
    background: none !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    :is(h1, h2, h3, h4, h5, h6),
  html.design-coherence-v1 body #app
    :is(.primary-button, .secondary-button, .icon-button, .app-choice-trigger),
  html.design-coherence-v1 body #app
    :is(.event-row, .expense-row, .transfer-row, .panel)
    strong {
    font-weight: 600 !important;
  }

  html.design-coherence-v1 body #app
    :is(.panel, .event-action-dock, .settlement-stage, .expense-row, .transfer-row, .notification-inbox-item, .friend-row, .group-row, .event-settings-menu-item, .participant-identity-pair) {
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-card) !important;
    background: var(--app-surface) !important;
    background-image: none !important;
    box-shadow: var(--app-shadow-card) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  html.design-coherence-v1 body #app .event-list {
    overflow: hidden !important;
    border-block: 1px solid var(--app-line) !important;
    border-radius: 0 !important;
    background: var(--app-surface) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app .event-row,
  html.design-coherence-v1 body #app .event-row:hover {
    border: 0 !important;
    border-bottom: 1px solid var(--app-line) !important;
    border-radius: 0 !important;
    background: var(--app-surface) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app .event-row:last-child {
    border-bottom: 0 !important;
  }

  html.design-coherence-v1 body #app
    :is(.event-modal, .expense-modal, .app-choice-picker, .install-app-dialog, .referral-dialog-shell, .account-feedback-dialog, .account-delete-dialog, .important-action-dialog) {
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-panel) !important;
    background: var(--app-surface) !important;
    background-image: none !important;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  html.design-coherence-v1 body #app
    .primary-button {
    border: 1px solid var(--app-brand) !important;
    border-radius: var(--app-radius-control) !important;
    color: #ffffff !important;
    background: var(--app-brand) !important;
    background-image: none !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1 body #app
    :is(.secondary-button, .icon-button, .app-choice-trigger) {
    border: 1px solid var(--app-line-strong) !important;
    border-radius: var(--app-radius-control) !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    background-image: none !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    :is(.event-workspace-nav, .event-creation-progress, .friends-hub-tabs, .segmented-control) {
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-control) !important;
    background: var(--app-surface) !important;
    background-image: none !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .event-creation-progress li {
    border: 0 !important;
    border-radius: 8px !important;
    color: var(--app-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .event-creation-progress li:is(.is-active, .is-complete) {
    color: var(--app-brand) !important;
    background: var(--app-surface-soft) !important;
  }

  html.design-coherence-v1 body #app
    .event-creation-progress li > span {
    border: 0 !important;
    border-radius: 6px !important;
    color: var(--app-muted) !important;
    background: var(--app-surface-soft) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .event-creation-progress li.is-active > span {
    color: #ffffff !important;
    background: var(--app-brand) !important;
  }

  html.design-coherence-v1 body #app
    :is(.event-type-option, .event-management-option) {
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-card) !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    background-image: none !important;
    box-shadow: var(--app-shadow-card) !important;
    transform: none !important;
  }

  html.design-coherence-v1 body #app
    :is(.event-type-option, .event-management-option):hover:not(:disabled) {
    border-color: var(--app-line-strong) !important;
    background: var(--app-surface-soft) !important;
    box-shadow: none !important;
    transform: none !important;
  }

  html.design-coherence-v1 body #app
    :is(.event-type-option, .event-management-option):is(.is-active, [aria-checked="true"]) {
    border-color: var(--app-brand) !important;
    color: var(--app-ink) !important;
    background: var(--app-surface-soft) !important;
    background-image: none !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .studio-event-type-icon {
    width: 30px !important;
    min-width: 30px !important;
    height: 30px !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--app-brand) !important;
    background: transparent !important;
    background-image: none !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .studio-event-type-icon svg {
    width: 24px !important;
    height: 24px !important;
    stroke: currentColor !important;
  }

  html.design-coherence-v1 body #app
    .screen
    > .top
    :is(.secondary-button, .icon-button) {
    border-color: rgba(255, 255, 255, 0.55) !important;
    color: #ffffff !important;
    background: transparent !important;
  }

  html.design-coherence-v1 body #app
    :is(input, select, textarea) {
    border: 1px solid var(--app-line-strong) !important;
    border-radius: var(--app-radius-control) !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    background-image: none !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .product-app-nav {
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-panel) !important;
    background: var(--app-surface) !important;
    background-image: none !important;
    box-shadow: var(--app-shadow-card) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  html.design-coherence-v1 body #app
    .product-nav-button {
    border: 0 !important;
    border-radius: 8px !important;
    background: transparent !important;
    background-image: none !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .product-nav-button:is(.is-active, [aria-current="page"]) {
    color: var(--app-brand) !important;
    background: var(--app-surface-soft) !important;
  }

  html.design-coherence-v1 body #app
    :is(.event-workspace-tab, .friends-hub-tab, .segmented-control button)::after {
    content: none !important;
    display: none !important;
    background: none !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    :is(input, select, textarea):focus {
    border-color: var(--app-brand) !important;
    outline: none !important;
    box-shadow: 0 0 0 3px rgba(22, 78, 63, 0.12) !important;
  }

  html.design-coherence-v1 body #app
    :is(.expense-modal-backdrop, .event-modal-backdrop, .app-choice-picker-backdrop) {
    background: rgba(15, 23, 42, 0.48) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  html.design-coherence-v1 body #app
    .expense-modal-header .eyebrow {
    color: var(--app-brand) !important;
  }

  html.design-coherence-v1 body #app
    .expense-flow-progress li {
    border-radius: 3px !important;
    background: var(--app-line) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .expense-flow-progress li:is(.is-complete, .is-current) {
    background: var(--app-brand) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .expense-step-modal .expense-total-field {
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-card) !important;
    background: var(--app-surface) !important;
    background-image: none !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1 body #app
    .expense-step-modal .expense-total-field:focus-within {
    border-color: var(--app-brand) !important;
    box-shadow: 0 0 0 3px rgba(22, 78, 63, 0.12) !important;
  }

  html.design-coherence-v1 body #app
    .expense-step-modal .expense-total-field input:focus {
    border-color: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .currency-input-badge {
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--app-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .primary-button:disabled {
    border-color: var(--app-line) !important;
    color: var(--app-faint) !important;
    background: var(--app-surface-soft) !important;
    box-shadow: none !important;
    opacity: 1 !important;
  }

  @media (max-width: 340px) {
    html.design-coherence-v1 .product-app-identity {
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 6px !important;
    }

    html.design-coherence-v1 .product-brand-lockup {
      min-width: 0 !important;
      gap: 6px !important;
      overflow: hidden !important;
    }

    html.design-coherence-v1 .product-brand-mark {
      width: 32px !important;
      min-width: 32px !important;
      height: 32px !important;
    }

    html.design-coherence-v1 body #app
      .product-header-profile-avatar {
      width: 44px !important;
      min-width: 44px !important;
      height: 44px !important;
      min-height: 44px !important;
      padding: 0 !important;
      border-radius: 50% !important;
    }

    html.design-coherence-v1 .product-brand-copy {
      min-width: 0 !important;
    }

    html.design-coherence-v1 .product-brand-copy strong {
      overflow: hidden !important;
      font-size: 14px !important;
      white-space: nowrap !important;
      text-overflow: ellipsis !important;
    }

    html.design-coherence-v1 .product-brand-copy small {
      display: none !important;
    }

    html.design-coherence-v1 .product-route-controls {
      gap: 4px !important;
    }

    html.design-coherence-v1 .product-route-controls > .app-back-button,
    html.design-coherence-v1 .product-route-controls > .product-home-button {
      width: 44px !important;
      min-width: 44px !important;
      height: 44px !important;
      min-height: 44px !important;
    }
  }

  /* Event tools use the same quiet hierarchy as the approved app shell. */
  html.design-coherence-v1 body #app .event-task-modal {
    display: grid !important;
    grid-template-rows: auto minmax(0, 1fr) !important;
    overflow: hidden !important;
    background: var(--app-canvas) !important;
  }

  html.design-coherence-v1 body #app
    .event-task-modal
    > .event-modal-header {
    min-width: 0 !important;
    min-height: 92px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 12px !important;
    margin: 0 !important;
    padding: 14px 16px 12px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--app-line) !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .event-task-modal
    > .event-modal-header
    > div:first-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.design-coherence-v1 body #app
    .event-task-modal
    > .event-modal-header
    :is(.eyebrow, h2, .muted) {
    margin: 0 !important;
  }

  html.design-coherence-v1 body #app
    .event-task-modal
    > .event-modal-header
    .eyebrow {
    color: var(--app-brand) !important;
    font-size: 11.5px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 body #app
    .event-task-modal
    > .event-modal-header
    h2 {
    max-width: none !important;
    color: var(--app-ink) !important;
    font-size: 22px !important;
    font-weight: 600 !important;
    line-height: 1.2 !important;
  }

  html.design-coherence-v1 body #app
    .event-task-modal
    > .event-modal-header
    .muted {
    color: var(--app-muted) !important;
    font-size: 12.5px !important;
    font-weight: 500 !important;
    line-height: 1.4 !important;
  }

  html.design-coherence-v1 body #app
    .event-task-modal
    > .event-modal-header
    .event-modal-header-actions {
    align-self: center !important;
    gap: 6px !important;
  }

  html.design-coherence-v1 body #app
    .event-task-modal
    > .event-modal-header
    :is(.modal-close-button, .modal-section-back-button) {
    width: 46px !important;
    min-width: 46px !important;
    height: 46px !important;
    min-height: 46px !important;
    padding: 0 !important;
    border: 1px solid var(--app-line-strong) !important;
    border-radius: 10px !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    box-shadow: 0 1px 3px rgba(13, 39, 35, 0.05) !important;
  }

  html.design-coherence-v1 body #app
    .event-task-modal
    > .event-modal-header
    .modal-close-button
    .modal-back-button-glyph {
    display: inline-grid !important;
    place-items: center !important;
  }

  html.design-coherence-v1 body #app
    .event-task-modal
    > .event-modal-header
    .modal-close-button
    .ui-icon-svg {
    width: 20px !important;
    height: 20px !important;
  }

  html.design-coherence-v1 body #app
    .event-task-modal
    > .event-modal-body {
    min-width: 0 !important;
    min-height: 0 !important;
    display: grid !important;
    align-content: start !important;
    gap: 16px !important;
    padding: 16px !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    background: var(--app-canvas) !important;
    overscroll-behavior: contain !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu {
    gap: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-panel) !important;
    background: var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-item {
    min-height: 68px !important;
    grid-template-columns: 34px minmax(0, 1fr) 18px !important;
    gap: 10px !important;
    padding: 10px 12px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--app-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-item:last-child {
    border-bottom: 0 !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-item:active {
    background: var(--app-surface-soft) !important;
    transform: scale(0.99) !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-icon {
    width: 38px !important;
    height: 38px !important;
    display: grid !important;
    place-items: center !important;
    border: 1px solid var(--app-line) !important;
    border-radius: 10px !important;
    color: var(--app-brand) !important;
    background: var(--app-surface) !important;
    box-shadow: 0 1px 3px rgba(13, 39, 35, 0.05) !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-icon svg {
    width: 21px !important;
    height: 21px !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-copy {
    gap: 2px !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-copy strong {
    color: var(--app-ink) !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    line-height: 1.3 !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-copy small {
    display: -webkit-box !important;
    overflow: hidden !important;
    color: var(--app-muted) !important;
    font-size: 11.5px !important;
    font-weight: 500 !important;
    line-height: 1.4 !important;
    -webkit-box-orient: vertical !important;
    -webkit-line-clamp: 2 !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-chevron {
    color: var(--app-faint) !important;
    font-size: 20px !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-item.is-danger
    .event-settings-menu-icon {
    color: var(--app-danger) !important;
    border-color: color-mix(in srgb, var(--app-danger) 22%, var(--app-line)) !important;
    background: var(--app-surface) !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    :is(.event-share-choice, .event-share-open) {
    margin: 0 !important;
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-panel) !important;
    background: var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    > .event-modal-body {
    display: grid !important;
    grid-auto-flow: row !important;
    grid-auto-rows: max-content !important;
    align-content: start !important;
    gap: 16px !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-share-choice {
    min-height: 0 !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 0 !important;
    padding: 0 !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-share-choice
    > button {
    min-width: 0 !important;
    min-height: 76px !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-share-route-choice
    small {
    color: var(--app-muted) !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-share-open {
    padding: 14px !important;
    background: var(--app-surface) !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    :is(.event-share-choice, .event-share-open-heading)
    small {
    color: var(--app-brand) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    :is(.event-share-choice, .event-share-open-heading)
    strong {
    color: var(--app-ink) !important;
    font-size: 16px !important;
    font-weight: 600 !important;
    line-height: 1.3 !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    :is(.event-share-choice, .event-share-open-heading)
    p {
    color: var(--app-muted) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    line-height: 1.45 !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-invite-pass {
    margin-block-end: 12px !important;
    border-radius: var(--app-radius-card) !important;
    box-shadow: var(--app-shadow-hero) !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-invite-pass-main {
    padding: 13px !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-invite-pass-stub {
    padding: 0 13px 12px !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-invite-link-field
    > input {
    min-height: 48px !important;
    border-radius: var(--app-radius-control) !important;
    font-size: 13px !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-invite-link-actions {
    gap: 8px !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    > .event-modal-header
    :is(.modal-close-button, .modal-section-back-button) {
    border-color: transparent !important;
    border-radius: 50% !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-share-route-choice {
    grid-template-columns: 32px minmax(0, 1fr) 18px !important;
    column-gap: 11px !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-share-route-choice
    > .command-card-icon {
    width: 32px !important;
    height: 32px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-share-route-choice:active {
    transform: scale(0.96) !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-invite-link-label,
  html.design-coherence-v1 body #app
    .event-share-modal
    .event-invite-link-field
    > input {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    overflow: hidden !important;
    clip: rect(0 0 0 0) !important;
    clip-path: inset(50%) !important;
    border: 0 !important;
    white-space: nowrap !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-invite-link-preview {
    min-height: 58px !important;
    display: grid !important;
    grid-template-columns: 34px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 10px 12px !important;
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-control) !important;
    color: var(--app-brand) !important;
    background: var(--app-surface-soft) !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-invite-link-preview
    > .command-card-icon {
    width: 34px !important;
    height: 34px !important;
    display: grid !important;
    place-items: center !important;
    margin: 0 !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-invite-link-preview
    > span:last-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-invite-link-preview
    strong {
    color: var(--app-ink) !important;
    font-size: 14px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-invite-link-preview
    small {
    color: var(--app-muted) !important;
    font-size: 11.5px !important;
    font-weight: 500 !important;
  }

  @media (max-width: 720px) {
    html.design-coherence-v1 body #app .event-task-modal {
      width: 100% !important;
      max-width: none !important;
      min-height: 100dvh !important;
      max-height: 100dvh !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    html.design-coherence-v1 body #app
      .event-task-modal
      > .event-modal-header {
      padding-block-start: calc(10px + env(safe-area-inset-top)) !important;
    }

    html.design-coherence-v1 body #app
      .event-task-modal
      > .event-modal-body {
      padding-block-end: calc(18px + env(safe-area-inset-bottom)) !important;
    }

    html.design-coherence-v1 body #app
      .event-share-modal
      .event-share-choice {
      min-height: 0 !important;
      grid-template-columns: minmax(0, 1fr) !important;
      align-items: stretch !important;
      align-content: start !important;
    }

    html.design-coherence-v1 body #app
      .event-share-modal
      .event-share-choice
      > button {
      position: relative !important;
      inset: auto !important;
      width: 100% !important;
    }
  }

  @media (max-width: 360px) {
    html.design-coherence-v1 body #app
      .event-task-modal
      > .event-modal-header
      h2 {
      font-size: 20px !important;
    }

    html.design-coherence-v1 body #app
      .event-task-modal
      > .event-modal-header
      .muted {
      font-size: 11.5px !important;
    }

    html.design-coherence-v1 body #app
      .event-settings-modal
      .event-settings-menu-item {
      grid-template-columns: 32px minmax(0, 1fr) 16px !important;
      padding-inline: 10px !important;
    }
  }

  /* Participant routes keep one calm task per screen. */
  html.design-coherence-v1.ledger-workspace-v1
    .screen:has(.event-participant-route-backdrop)
    > .product-app-identity {
    position: relative !important;
    z-index: 120 !important;
  }

  html.design-coherence-v1 body #app .event-participant-route-backdrop {
    background: var(--app-canvas) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  body:has(.event-participant-route-backdrop) .event-action-dock {
    display: none !important;
  }

  html.design-coherence-v1 body #app .event-participant-route-modal {
    color: var(--app-ink) !important;
    background: var(--app-canvas) !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 .event-participant-route-modal:focus {
    outline: none !important;
  }

  html.design-coherence-v1 .event-participant-route-modal:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--app-accent) 42%, transparent) !important;
    outline-offset: -3px !important;
  }

  html.design-coherence-v1
    .event-participant-route-modal
    > .event-modal-header {
    min-height: 74px !important;
    align-items: end !important;
    margin: 0 !important;
    padding: 14px 4px 13px !important;
    border-block-end: 1px solid var(--app-line) !important;
    background: var(--app-canvas) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  html.design-coherence-v1
    .event-participant-route-modal
    > .event-modal-header
    > div:first-child {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.design-coherence-v1
    .event-participant-route-modal
    > .event-modal-header
    h2 {
    margin: 0 !important;
    color: var(--app-ink) !important;
    font-family: var(--app-font-hebrew) !important;
    font-size: 24px !important;
    font-weight: 600 !important;
    line-height: 1.12 !important;
  }

  html.design-coherence-v1
    .event-participant-route-modal
    > .event-modal-header
    .muted {
    overflow: hidden !important;
    margin: 0 !important;
    color: var(--app-faint) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    line-height: 1.35 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.design-coherence-v1
    .event-participant-route-modal
    > .event-modal-header
    .event-modal-header-actions:empty {
    display: none !important;
  }

  html.design-coherence-v1
    .event-participant-route-modal
    > .event-modal-body {
    display: grid !important;
    align-content: start !important;
    gap: 18px !important;
    padding: 18px 4px 34px !important;
  }

  html.design-coherence-v1 .event-participant-roster {
    min-width: 0 !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    overflow: visible !important;
  }

  html.design-coherence-v1 .event-participant-section-header {
    min-height: 40px !important;
    padding: 0 2px 10px !important;
    border: 0 !important;
    background: transparent !important;
  }

  html.design-coherence-v1 .event-participant-section-header > strong {
    color: var(--app-ink) !important;
    font-size: 17px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .event-participant-count {
    color: var(--app-muted) !important;
    background: transparent !important;
    font-size: 11.5px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .event-participant-roster-groups {
    display: grid !important;
    gap: 22px !important;
  }

  html.design-coherence-v1 .event-participant-roster-identity-group {
    min-width: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    overflow: visible !important;
  }

  html.design-coherence-v1
    .event-participant-roster-identity-group
    + .event-participant-roster-identity-group {
    border-block-start: 0 !important;
  }

  html.design-coherence-v1 .event-participant-roster-identity-heading {
    min-height: 42px !important;
    grid-template-columns: 8px minmax(0, 1fr) auto !important;
    gap: 9px !important;
    padding: 0 2px 9px !important;
    border-block-end: 1px solid var(--app-line) !important;
    background: transparent !important;
  }

  html.design-coherence-v1
    .event-participant-roster-identity-heading
    > span:nth-child(2) {
    gap: 1px !important;
  }

  html.design-coherence-v1 .event-participant-roster-identity-heading strong {
    color: var(--app-ink) !important;
    font-size: 14px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1
    .event-participant-roster-identity-heading
    :is(small, bdi) {
    color: var(--app-faint) !important;
    font-size: 10.5px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .event-participant-roster-identity-marker {
    width: 7px !important;
    height: 7px !important;
    border: 1px solid rgba(83, 103, 99, 0.34) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1
    .event-participant-roster-identity-group.is-account
    .event-participant-roster-identity-marker {
    border-color: var(--app-accent) !important;
    background: var(--app-accent) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 .event-participant-roster-row {
    min-width: 0 !important;
    min-height: 70px !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 8px !important;
    padding: 9px 0 !important;
    border-block-end: 1px solid var(--app-line) !important;
    background: transparent !important;
  }

  html.design-coherence-v1
    .event-participant-roster-row
    + .event-participant-roster-row {
    border-block-start: 0 !important;
  }

  html.design-coherence-v1 .event-participant-roster-row:last-child {
    border-block-end: 0 !important;
  }

  html.design-coherence-v1 .event-participant-profile-trigger {
    min-width: 0 !important;
    min-height: 52px !important;
    display: grid !important;
    grid-template-columns: 48px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 11px !important;
    margin: 0 !important;
    padding: 2px !important;
    border-radius: 12px !important;
  }

  html.design-coherence-v1 .event-participant-person:not(button) {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: 48px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 11px !important;
  }

  html.design-coherence-v1
    .event-participant-roster-row
    .event-participant-person
    > .avatar {
    width: 48px !important;
    min-width: 48px !important;
    height: 48px !important;
    border: 2px solid var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1
    .event-participant-roster-row.is-offline
    .event-participant-person
    > .avatar,
  html.design-coherence-v1
    .event-participant-detail.is-offline
    .event-participant-detail-identity
    > .avatar {
    border: 1px dashed rgba(83, 103, 99, 0.42) !important;
    filter: grayscale(1) saturate(0.1) opacity(0.76) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 .event-participant-person-copy {
    min-width: 0 !important;
    gap: 4px !important;
  }

  html.design-coherence-v1 .event-participant-person-copy > strong {
    overflow: hidden !important;
    color: var(--app-ink) !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    line-height: 1.28 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.design-coherence-v1 .event-participant-meta {
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    gap: 5px !important;
    overflow: hidden !important;
  }

  html.design-coherence-v1 .event-participant-meta :is(small, .participant-username) {
    min-width: 0 !important;
    overflow: hidden !important;
    font-size: 10.5px !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.design-coherence-v1
    :is(.event-participant-membership-button, .event-participant-membership-readonly) {
    min-width: 88px !important;
    min-height: 48px !important;
    justify-content: center !important;
    padding: 0 8px !important;
    border: 0 !important;
    border-radius: 12px !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1
    .event-participant-membership-button:not(:disabled):hover {
    background: rgba(185, 71, 57, 0.06) !important;
  }

  html.design-coherence-v1 .participant-membership-status {
    gap: 6px !important;
    padding: 7px 9px !important;
    border-radius: 999px !important;
    color: var(--app-positive) !important;
    background: rgba(24, 113, 88, 0.08) !important;
  }

  html.design-coherence-v1 .event-participant-primary-actions {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    gap: 9px !important;
    margin: 0 !important;
  }

  html.design-coherence-v1
    .event-participant-primary-actions
    :is(.primary-button, .secondary-button) {
    min-height: 50px !important;
    justify-content: center !important;
    gap: 8px !important;
  }

  html.design-coherence-v1 .event-participant-primary-actions .command-card-icon {
    width: 20px !important;
    height: 20px !important;
  }

  html.design-coherence-v1 .event-participant-detail {
    width: min(100%, 420px) !important;
    display: grid !important;
    justify-self: center !important;
    gap: 18px !important;
    padding-block: 10px 24px !important;
  }

  html.design-coherence-v1 .event-participant-detail-identity {
    min-height: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    justify-items: center !important;
    gap: 11px !important;
    padding: 12px 4px 4px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: center !important;
  }

  html.design-coherence-v1 .event-participant-detail-identity > .avatar {
    width: 96px !important;
    min-width: 96px !important;
    height: 96px !important;
    border: 3px solid var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1 .event-participant-detail-identity > div {
    min-width: 0 !important;
    display: grid !important;
    justify-items: center !important;
    gap: 5px !important;
  }

  html.design-coherence-v1 .event-participant-detail-identity strong {
    color: var(--app-ink) !important;
    font-size: 24px !important;
    font-weight: 600 !important;
    line-height: 1.18 !important;
    text-align: center !important;
  }

  html.design-coherence-v1 .event-participant-profile-account {
    justify-content: center !important;
    color: var(--app-muted) !important;
    font-size: 12px !important;
  }

  html.design-coherence-v1 .event-participant-profile-account.is-offline > span {
    border: 1px solid rgba(83, 103, 99, 0.44) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1
    :is(.event-participant-friendship-action, .event-participant-detail-edit) {
    width: 100% !important;
    min-height: 52px !important;
    justify-content: center !important;
    gap: 9px !important;
  }

  html.design-coherence-v1 .event-participant-detail-action-icon,
  html.design-coherence-v1 .event-participant-detail-action-icon svg {
    width: 20px !important;
    height: 20px !important;
  }

  html.design-coherence-v1 .event-participant-friendship-state {
    min-height: 48px !important;
    justify-content: center !important;
    margin: 0 !important;
    padding: 10px 14px !important;
    border: 1px solid rgba(24, 113, 88, 0.14) !important;
    border-radius: var(--app-radius-control) !important;
    color: var(--app-positive) !important;
    background: rgba(24, 113, 88, 0.06) !important;
  }

  html.design-coherence-v1 .event-participant-account-link {
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: 36px minmax(0, 1fr) !important;
    gap: 10px 11px !important;
    padding: 17px 2px !important;
    border-block: 1px solid var(--app-line) !important;
    border-inline: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 .event-participant-account-link-icon {
    width: 36px !important;
    height: 36px !important;
    display: grid !important;
    place-items: center !important;
    border-radius: 0 !important;
    color: var(--app-brand) !important;
    background: transparent !important;
  }

  html.design-coherence-v1 .event-participant-account-link-icon svg {
    width: 19px !important;
    height: 19px !important;
  }

  html.design-coherence-v1 .event-participant-account-link > div {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.design-coherence-v1 .event-participant-account-link strong {
    color: var(--app-ink) !important;
    font-size: 14px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .event-participant-account-link small {
    color: var(--app-muted) !important;
    font-size: 11.5px !important;
    font-weight: 550 !important;
    line-height: 1.45 !important;
  }

  html.design-coherence-v1 .event-participant-account-link-button {
    grid-column: 1 / -1 !important;
    width: 100% !important;
    min-height: 46px !important;
  }

  html.design-coherence-v1 .event-participant-detail-membership {
    min-height: 54px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding: 0 2px !important;
    border-block-end: 1px solid var(--app-line) !important;
  }

  html.design-coherence-v1 .event-participant-detail-membership > strong {
    color: var(--app-ink) !important;
    font-size: 14px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .event-participant-detail-remove {
    width: max-content !important;
    min-height: 44px !important;
    justify-self: center !important;
    padding: 8px 12px !important;
    border: 0 !important;
    color: var(--app-danger) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 13px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .event-participant-link-screen {
    width: min(100%, 420px) !important;
    display: grid !important;
    justify-self: center !important;
    gap: 18px !important;
  }

  html.design-coherence-v1 .event-participant-link-intro {
    display: grid !important;
    gap: 5px !important;
    padding: 2px !important;
  }

  html.design-coherence-v1 .event-participant-link-intro strong {
    color: var(--app-ink) !important;
    font-size: 16px !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1 .event-participant-link-intro p {
    margin: 0 !important;
    color: var(--app-muted) !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
  }

  html.design-coherence-v1 .event-participant-link-list {
    display: grid !important;
    border-block-start: 1px solid var(--app-line) !important;
  }

  html.design-coherence-v1 .event-participant-link-candidate {
    min-width: 0 !important;
    min-height: 72px !important;
    display: grid !important;
    grid-template-columns: 50px minmax(0, 1fr) 18px !important;
    align-items: center !important;
    gap: 11px !important;
    padding: 10px 2px !important;
    border: 0 !important;
    border-block-end: 1px solid var(--app-line) !important;
    border-radius: 0 !important;
    color: var(--app-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.design-coherence-v1 .event-participant-link-candidate > .avatar {
    width: 50px !important;
    height: 50px !important;
  }

  html.design-coherence-v1 .event-participant-link-candidate > span:nth-child(2) {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
  }

  html.design-coherence-v1 .event-participant-link-candidate strong {
    overflow: hidden !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.design-coherence-v1 .event-participant-link-candidate small {
    color: var(--app-muted) !important;
    font-size: 10.5px !important;
  }

  html.design-coherence-v1 .event-participant-link-arrow {
    color: var(--app-faint) !important;
    font-size: 24px !important;
    line-height: 1 !important;
  }

  @media (hover: hover) {
    html.design-coherence-v1 .event-participant-profile-trigger:hover,
    html.design-coherence-v1 .event-participant-link-candidate:hover {
      background: var(--app-surface-soft) !important;
    }
  }

  @media (max-width: 720px) {
    html.design-coherence-v1
      .screen:has(.event-participant-route-backdrop)
      > .product-app-identity {
      display: none !important;
    }

    html.design-coherence-v1 .event-participant-route-backdrop {
      position: fixed !important;
      inset: 0 !important;
      left: 0 !important;
      right: 0 !important;
      width: 100% !important;
      height: 100vh !important;
      height: 100dvh !important;
      padding: 0 !important;
      transform: none !important;
      z-index: 80 !important;
    }

    html.design-coherence-v1 .event-participant-route-modal {
      width: 100% !important;
      max-width: none !important;
      height: 100% !important;
      min-height: 0 !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      overflow-y: auto !important;
      box-shadow: none !important;
      scroll-padding-block: 82px 30px !important;
    }

    html.design-coherence-v1 .event-participant-route-modal:focus-visible {
      outline: none !important;
    }

    html.design-coherence-v1
      .event-participant-route-modal
      > .event-modal-header {
      top: 0 !important;
      padding-block-start: calc(12px + env(safe-area-inset-top)) !important;
      padding-inline: 18px !important;
    }

    html.design-coherence-v1
      .event-participant-route-modal
      > .event-modal-body {
      padding-inline: 18px !important;
      padding-block-end: calc(34px + env(safe-area-inset-bottom)) !important;
    }

    html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).design-coherence-v1
      .event-participant-route-modal
      > .event-modal-body {
      padding-block-end: calc(180px + env(safe-area-inset-bottom)) !important;
      scroll-padding-block-end: calc(180px + env(safe-area-inset-bottom)) !important;
    }
  }

  @media (max-width: 360px) {
    html.design-coherence-v1
      .event-participant-roster-identity-heading
      small {
      display: none !important;
    }

    html.design-coherence-v1 .event-participant-primary-actions {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    html.design-coherence-v1
      :is(.event-participant-membership-button, .event-participant-membership-readonly) {
      min-width: 76px !important;
      padding-inline: 4px !important;
    }

    html.design-coherence-v1 .participant-membership-status {
      padding-inline: 7px !important;
    }
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).design-coherence-v1
    .event-participant-roster-row {
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 3px !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).design-coherence-v1
    :is(.event-participant-membership-button, .event-participant-membership-readonly) {
    width: max-content !important;
    justify-self: start !important;
  }

  html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).design-coherence-v1
    .event-participant-account-link {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  /* Preserve the approved, fully finished green hero treatment across the app. */
  html.design-coherence-v1.ledger-workspace-v1 body #app
    .screen
    > .top {
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    border-radius: 24px !important;
    color: #ffffff !important;
    background:
      linear-gradient(136deg, #071f18 0%, #0b4a38 58%, #0f6b50 100%),
      #0b4a38 !important;
    background-image: linear-gradient(136deg, #071f18 0%, #0b4a38 58%, #0f6b50 100%) !important;
    box-shadow:
      0 30px 58px -27px rgba(5, 54, 40, 0.82),
      0 20px 38px -16px rgba(18, 184, 139, 0.48),
      0 0 28px -13px rgba(61, 223, 185, 0.58),
      inset 0 1px 0 rgba(255, 255, 255, 0.14) !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .screen[data-screen-kind="home"]
    > .top,
  html.design-coherence-v1.ledger-workspace-v1 body #app
    .product-home-screen
    > .top {
    overflow: visible !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .screen[data-screen-kind="home"]
    > .top::before,
  html.design-coherence-v1.ledger-workspace-v1 body #app
    .product-home-screen
    > .top::before {
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
    pointer-events: none !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .screen
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
    opacity: 0.18 !important;
    transform: none !important;
    animation: ledger-home-shimmer 6.4s cubic-bezier(0.22, 1, 0.36, 1) 1.1s infinite !important;
    pointer-events: none !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .screen[data-screen-kind="home"]
    > .top
    .hero-actions
    .primary-button,
  html.design-coherence-v1.ledger-workspace-v1 body #app
    .product-home-screen
    > .top
    .hero-actions
    .primary-button {
    width: auto !important;
    min-width: 164px !important;
    min-height: 56px !important;
    padding: 0 28px !important;
    border: 1px solid rgba(7, 31, 24, 0.1) !important;
    border-radius: 999px !important;
    color: #0a3e30 !important;
    background: #ffffff !important;
    background-image: none !important;
    box-shadow:
      0 20px 42px -16px rgba(6, 30, 22, 0.76),
      0 11px 28px -10px rgba(16, 185, 129, 0.58),
      inset 0 1px 0 #ffffff !important;
    font-weight: 850 !important;
  }

  @media (hover: hover) {
    html.design-coherence-v1.ledger-workspace-v1 body #app
      .screen[data-screen-kind="home"]
      > .top
      .hero-actions
      .primary-button:hover:not(:disabled),
    html.design-coherence-v1.ledger-workspace-v1 body #app
      .product-home-screen
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
  }

  /* End approved green hero finish. */

  /* Approved participant roster and focused participant management. */
  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-section-header.is-compact {
    min-height: 0 !important;
    display: block !important;
    padding: 0 2px 8px !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-section-header.is-compact
    .event-participant-count {
    display: inline !important;
    color: var(--app-muted) !important;
    font-size: 12px !important;
    font-weight: 550 !important;
    line-height: 1.45 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-roster-list {
    min-width: 0 !important;
    display: grid !important;
    gap: 0 !important;
    border-block-start: 1px solid var(--app-line) !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-roster-row {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 76px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 24px !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 10px 2px !important;
    border: 0 !important;
    border-block-end: 1px solid var(--app-line) !important;
    border-radius: 0 !important;
    color: var(--app-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-roster-row:last-of-type {
    border-block-end: 0 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-roster-row:not(:disabled):active {
    background: rgba(5, 72, 55, 0.035) !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-roster-chevron {
    width: 24px !important;
    height: 44px !important;
    display: grid !important;
    place-items: center !important;
    color: var(--app-faint) !important;
    font-family: var(--app-font-numeric) !important;
    font-size: 28px !important;
    font-weight: 400 !important;
    line-height: 1 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management {
    width: min(100%, 440px) !important;
    display: grid !important;
    justify-self: center !important;
    gap: 22px !important;
    padding: 4px 0 28px !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-identity {
    min-width: 0 !important;
    min-height: 92px !important;
    display: grid !important;
    grid-template-columns: 72px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 14px !important;
    padding: 4px 2px 18px !important;
    border: 0 !important;
    border-block-end: 1px solid var(--app-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-identity
    > .avatar {
    width: 72px !important;
    min-width: 72px !important;
    height: 72px !important;
    border: 2px solid var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management.is-offline
    .event-participant-management-identity
    > .avatar {
    border: 1px dashed rgba(83, 103, 99, 0.42) !important;
    filter: grayscale(1) saturate(0.1) opacity(0.76) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-identity
    > div {
    min-width: 0 !important;
    display: grid !important;
    align-content: center !important;
    justify-items: start !important;
    gap: 4px !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-identity
    strong {
    max-width: 100% !important;
    overflow: hidden !important;
    display: -webkit-box !important;
    color: var(--app-ink) !important;
    font-size: 21px !important;
    font-weight: 650 !important;
    line-height: 1.2 !important;
    white-space: normal !important;
    -webkit-box-orient: vertical !important;
    -webkit-line-clamp: 2 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-list {
    min-width: 0 !important;
    display: grid !important;
    gap: 0 !important;
    border: 0 !important;
    border-block-start: 1px solid var(--app-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    overflow: visible !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management
    .event-participant-notice {
    min-height: 0 !important;
    margin: -6px 2px 0 !important;
    padding: 8px 11px !important;
    border: 0 !important;
    border-inline-start: 0 !important;
    border-radius: 0 !important;
    color: var(--app-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 11.5px !important;
    font-weight: 550 !important;
    line-height: 1.45 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-row {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 76px !important;
    display: grid !important;
    grid-template-columns: 28px minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 12px !important;
    margin: 0 !important;
    padding: 12px 2px !important;
    border: 0 !important;
    border-block-end: 1px solid var(--app-line) !important;
    border-radius: 0 !important;
    color: var(--app-ink) !important;
    background: transparent !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-row:last-child {
    border-block-end: 0 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    button.event-participant-management-row:not(:disabled):active {
    background: rgba(5, 72, 55, 0.035) !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-icon {
    width: 28px !important;
    height: 28px !important;
    display: grid !important;
    place-items: center !important;
    color: var(--app-brand) !important;
    background: transparent !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-icon
    svg {
    width: 21px !important;
    height: 21px !important;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.8 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-copy
    strong {
    overflow: hidden !important;
    color: var(--app-ink) !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    line-height: 1.3 !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-copy
    small {
    color: var(--app-muted) !important;
    font-size: 11.5px !important;
    font-weight: 500 !important;
    line-height: 1.4 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-row.is-danger
    :is(.event-participant-management-icon, .event-participant-management-copy strong) {
    color: var(--app-danger) !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-row
    :is(.relationship-friendship-action, .event-participant-account-link-button) {
    width: auto !important;
    min-width: 76px !important;
    min-height: 40px !important;
    justify-content: center !important;
    padding: 0 13px !important;
    border-radius: 10px !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-admin-toggle {
    position: relative !important;
    width: 46px !important;
    min-width: 46px !important;
    height: 28px !important;
    margin: 0 !important;
    border: 1px solid rgba(83, 103, 99, 0.26) !important;
    border-radius: 999px !important;
    appearance: none !important;
    background: #dce4e1 !important;
    box-shadow: none !important;
    cursor: pointer !important;
    transition: background 160ms ease, border-color 160ms ease !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-admin-toggle::after {
    content: "" !important;
    position: absolute !important;
    inset-block-start: 3px !important;
    left: 3px !important;
    right: auto !important;
    width: 20px !important;
    height: 20px !important;
    border-radius: 50% !important;
    background: #ffffff !important;
    box-shadow: 0 1px 3px rgba(7, 31, 24, 0.22) !important;
    transition: transform 160ms ease !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-admin-toggle:checked {
    border-color: var(--app-brand) !important;
    background: var(--app-brand) !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-admin-toggle:checked::after {
    transform: translateX(18px) !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-admin-toggle:focus-visible {
    outline: 3px solid rgba(18, 127, 99, 0.2) !important;
    outline-offset: 3px !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-admin-toggle:disabled {
    cursor: not-allowed !important;
    opacity: 0.58 !important;
  }

  /* One icon and control contract across routes, dialogs and injected surfaces. */
  html.design-coherence-v1 .ui-icon-svg {
    width: 20px !important;
    height: 20px !important;
    display: block !important;
    flex: 0 0 auto !important;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  html.design-coherence-v1
    :is(.button-action-icon, .modal-control-icon, .inline-chevron) {
    width: 20px !important;
    height: 20px !important;
    display: inline-grid !important;
    place-items: center !important;
    flex: 0 0 20px !important;
    color: currentColor !important;
  }

  html.design-coherence-v1
    :is(.button-action-icon, .modal-control-icon, .inline-chevron)
    > .ui-icon-svg {
    width: 100% !important;
    height: 100% !important;
  }

  html.design-coherence-v1 .referral-reward-action > .ui-icon-svg {
    width: 18px !important;
    height: 18px !important;
  }

  html.design-coherence-v1
    :is(.product-nav-button, .product-home-button)
    > .ui-icon-svg,
  html.design-coherence-v1 .product-home-button-icon {
    width: 22px !important;
    height: 22px !important;
  }

  html.design-coherence-v1
    :is(.modal-close-button, .modal-section-back-button, .quick-item-remove) {
    width: 46px !important;
    min-width: 46px !important;
    height: 46px !important;
    min-height: 46px !important;
    display: inline-grid !important;
    place-items: center !important;
    padding: 0 !important;
    border: 1px solid var(--app-line-strong) !important;
    border-radius: var(--app-radius-control) !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1
    :is(.modal-close-button, .modal-section-back-button, .quick-item-remove)
    .modal-control-icon {
    width: 21px !important;
    height: 21px !important;
  }

  html.design-coherence-v1
    :is(.event-settings-menu-chevron, .event-participant-link-arrow, .event-participant-roster-chevron, .restaurant-method-arrow) {
    width: 18px !important;
    height: 18px !important;
    display: inline-grid !important;
    place-items: center !important;
    flex: 0 0 18px !important;
    color: var(--app-faint) !important;
  }

  html.design-coherence-v1
    :is(.expense-row-actions-icon, .notification-inbox-item-icon, .notification-inbox-empty-icon)
    .ui-icon-svg {
    width: 20px !important;
    height: 20px !important;
  }

  html.design-coherence-v1 .notification-inbox-empty-icon.is-error {
    color: var(--app-danger) !important;
  }

  html.design-coherence-v1
    :is(.danger-button, .friend-remove-button, .account-delete-button) {
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 7px !important;
    padding-inline: 12px !important;
    border: 1px solid color-mix(in srgb, var(--app-danger) 24%, var(--app-line)) !important;
    border-radius: var(--app-radius-control) !important;
    color: var(--app-danger) !important;
    background: var(--app-surface) !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1
    :is(.danger-button, .friend-remove-button, .account-delete-button)
    .button-action-icon {
    width: 18px !important;
    height: 18px !important;
    flex-basis: 18px !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management
    .event-participant-notice {
    margin: -4px 2px 0 !important;
    padding: 8px 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--app-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    :is(.event-settings-menu-icon, .event-participant-management-icon, .command-card-icon)
    .ui-icon-svg {
    width: 21px !important;
    height: 21px !important;
  }

  html.design-coherence-v1 body #app
    :is(.event-settings-menu-item, .event-participant-management-row, .notification-inbox-item, .friend-row, .group-row) {
    font-family: var(--app-font-hebrew) !important;
  }

  /* Settings stay compact: familiar controls without a box around every symbol. */
  html.design-coherence-v1 body #app
    .event-settings-modal
    > .event-modal-header
    .modal-close-button {
    border-color: transparent !important;
    border-radius: 50% !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-item {
    grid-template-columns: 32px minmax(0, 1fr) 18px !important;
    column-gap: 11px !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-item:nth-child(5),
  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-item.is-danger {
    border-top: 6px solid var(--app-canvas) !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-icon {
    width: 32px !important;
    height: 32px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-icon
    .ui-icon-svg {
    width: 22px !important;
    height: 22px !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-item.is-danger
    .event-settings-menu-icon {
    border: 0 !important;
    background: transparent !important;
  }

  @media (hover: hover) {
    html.design-coherence-v1 body #app
      .event-settings-modal
      > .event-modal-header
      .modal-close-button:hover:not(:disabled) {
      background: var(--app-surface-soft) !important;
    }
  }

  @media (hover: hover) {
    html.design-coherence-v1.ledger-workspace-v1 body #app
      .event-participant-roster-row:not(:disabled):hover,
    html.design-coherence-v1.ledger-workspace-v1 body #app
      button.event-participant-management-row:not(:disabled):hover {
      background: rgba(5, 72, 55, 0.025) !important;
    }
  }

  /* Compact event workflow polish: calmer summary and denser people controls. */
  html.design-coherence-v1.ledger-workspace-v1 body #app
    .screen[data-event-view="summary"]
    > .settlement-hero.is-personal-pending:not(.is-explained) {
    border: 1px solid var(--app-line) !important;
    border-radius: 12px !important;
    background: var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
    overflow: hidden !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .screen[data-event-view="summary"]
    > .settlement-hero.is-personal-pending:not(.is-explained)
    .settlement-hero-main {
    min-height: 0 !important;
    display: grid !important;
    align-items: start !important;
    gap: 5px !important;
    padding: 9px 16px 7px !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .screen[data-event-view="summary"]
    > .settlement-hero.is-personal-pending:not(.is-explained)
    .status-chip {
    width: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    justify-self: start !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--app-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    line-height: 1.35 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .screen[data-event-view="summary"]
    > .settlement-hero.is-personal-pending:not(.is-explained)
    .settlement-hero-title-row {
    min-width: 0 !important;
    width: 100% !important;
    align-items: end !important;
    gap: 12px !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .screen[data-event-view="summary"]
    > .settlement-hero.is-personal-pending:not(.is-explained)
    .settlement-hero-title-row h2 {
    margin: 0 0 3px !important;
    color: var(--app-ink) !important;
    font-size: clamp(19px, 5.2vw, 22px) !important;
    font-weight: 650 !important;
    line-height: 1.22 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .screen[data-event-view="summary"]
    > .settlement-hero.is-personal-pending:not(.is-explained)
    .settlement-hero-title-row .muted {
    margin: 0 !important;
    color: var(--app-muted) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    line-height: 1.4 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .screen[data-event-view="summary"]
    > .settlement-hero.is-personal-pending:not(.is-explained)
    .settlement-hero-actions {
    min-height: 0 !important;
    gap: 8px !important;
    padding: 4px 8px !important;
    border-top: 1px solid var(--app-line) !important;
    background: var(--app-surface-soft) !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-roster-row,
  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-row {
    min-height: 72px !important;
    transition:
      background-color 150ms ease,
      color 150ms ease !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-roster-chevron {
    font-size: 24px !important;
    transform: translateY(-1px) !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-icon {
    color: var(--app-muted-strong) !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .event-participant-management-row.is-danger
    :is(.event-participant-management-icon, .event-participant-management-copy strong) {
    color: var(--app-danger) !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    :is(.event-participant-roster-row, button.event-participant-management-row):focus-visible {
    position: relative !important;
    z-index: 1 !important;
    outline: 2px solid rgba(5, 105, 82, 0.42) !important;
    outline-offset: 2px !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-icon {
    color: var(--app-muted-strong) !important;
  }

  html.design-coherence-v1 body #app
    .event-settings-modal
    .event-settings-menu-item.is-danger
    .event-settings-menu-icon {
    color: var(--app-danger) !important;
  }

  html.design-coherence-v1 body #app
    .event-share-modal
    .event-share-route-choice
    > .command-card-icon {
    color: var(--app-muted-strong) !important;
  }

  html.design-coherence-v1 body #app
    :is(.event-settings-menu-item, .event-share-route-choice):focus-visible {
    position: relative !important;
    z-index: 1 !important;
    outline: 2px solid rgba(5, 105, 82, 0.42) !important;
    outline-offset: -2px !important;
  }

  html.design-coherence-v1 body #app
    .expense-step-modal
    .expense-total-field {
    transition:
      border-color 160ms ease,
      box-shadow 160ms ease !important;
  }

  html.design-coherence-v1 body #app
    .expense-step-modal
    .expense-total-field
    > span {
    color: var(--app-muted-strong) !important;
    font-weight: 600 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .notification-inbox-empty {
    min-height: 190px !important;
    gap: 7px !important;
    padding: 24px 18px !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .notification-inbox-empty-icon {
    width: 32px !important;
    height: 32px !important;
    margin-bottom: 3px !important;
    border: 0 !important;
    border-radius: 0 !important;
    color: var(--app-muted-strong) !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .notification-inbox-empty-icon svg {
    width: 25px !important;
    height: 25px !important;
    stroke-width: 1.8 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .notification-inbox-empty h2 {
    font-size: 18px !important;
    font-weight: 650 !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .notification-inbox-empty
    :is(.primary-button, .secondary-button) {
    min-height: 44px !important;
    margin-top: 4px !important;
    padding-inline: 18px !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .notification-inbox-panel.is-account-pending {
    overflow: visible !important;
    padding-top: 28px !important;
    border: 0 !important;
    border-top: 1px solid var(--app-line) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html.design-coherence-v1.ledger-workspace-v1 body #app
    .notification-inbox-empty.is-account-pending {
    min-height: 0 !important;
    gap: 18px !important;
    padding: 18px 16px 8px !important;
    background: transparent !important;
  }

  html.design-coherence-v1 body #app
    .notification-account-pending-heading {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 10px !important;
  }

  html.design-coherence-v1 body #app
    .notification-account-pending-heading
    .notification-inbox-empty-icon {
    flex: 0 0 auto !important;
    width: 30px !important;
    height: 30px !important;
    margin: 0 !important;
    color: var(--app-brand) !important;
  }

  html.design-coherence-v1 body #app
    .notification-account-pending-heading
    h2 {
    margin: 0 !important;
    color: var(--app-ink) !important;
    font-size: 18px !important;
    font-weight: 650 !important;
    line-height: 1.4 !important;
  }

  html.design-coherence-v1 body #app
    .notification-inbox-empty.is-account-pending
    .primary-button {
    min-width: 132px !important;
    margin: 0 !important;
  }

  html.design-coherence-v1 body #app
    .friends-empty-state {
    min-height: 210px !important;
    padding: 28px 22px !important;
  }

  html.design-coherence-v1 body #app
    .profile-edit-screen
    .profile-avatar-picker-shell {
    min-width: 0 !important;
    margin: 2px 0 4px !important;
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-card) !important;
    background: var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
    overflow: hidden !important;
  }

  html.design-coherence-v1 body #app
    .profile-avatar-picker-shell
    > summary {
    min-height: 82px !important;
    display: grid !important;
    grid-template-columns: 56px minmax(0, 1fr) 24px !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 12px 14px !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    cursor: pointer !important;
    list-style: none !important;
    -webkit-tap-highlight-color: transparent;
  }

  html.design-coherence-v1 body #app
    .profile-avatar-picker-shell
    > summary::-webkit-details-marker {
    display: none !important;
  }

  html.design-coherence-v1 body #app
    .profile-avatar-picker-shell
    > summary:focus-visible {
    position: relative !important;
    z-index: 1 !important;
    outline: 2px solid rgba(22, 78, 63, 0.38) !important;
    outline-offset: -3px !important;
  }

  html.design-coherence-v1 body #app
    .profile-avatar-summary-preview {
    width: 56px !important;
    height: 56px !important;
    display: block !important;
    overflow: hidden !important;
    border: 2px solid var(--app-brand) !important;
    border-radius: 50% !important;
    background: var(--app-accent-soft) !important;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08) !important;
  }

  html.design-coherence-v1 body #app
    .profile-avatar-summary-preview
    > img {
    width: 100% !important;
    height: 100% !important;
    display: block !important;
    object-fit: cover !important;
  }

  html.design-coherence-v1 body #app
    .profile-avatar-summary-copy {
    min-width: 0 !important;
    display: grid !important;
    gap: 3px !important;
    text-align: start !important;
  }

  html.design-coherence-v1 body #app
    .profile-avatar-summary-copy
    strong {
    color: var(--app-ink) !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    line-height: 1.3 !important;
  }

  html.design-coherence-v1 body #app
    .profile-avatar-summary-copy
    small {
    color: var(--app-brand) !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    line-height: 1.35 !important;
  }

  html.design-coherence-v1 body #app
    .profile-avatar-summary-chevron {
    width: 22px !important;
    height: 22px !important;
    display: grid !important;
    place-items: center !important;
    color: var(--app-muted) !important;
    transition: transform var(--app-motion) !important;
  }

  html.design-coherence-v1 body #app
    .profile-avatar-summary-chevron
    svg {
    width: 20px !important;
    height: 20px !important;
  }

  html.design-coherence-v1 body #app
    .profile-avatar-picker-shell[open]
    .profile-avatar-summary-chevron {
    transform: rotate(-90deg) !important;
  }

  html.design-coherence-v1 body #app
    .profile-avatar-picker-shell
    > .profile-avatar-picker {
    margin: 0 !important;
    padding: 14px !important;
    border-top: 1px solid var(--app-line) !important;
    background: var(--app-surface-soft) !important;
  }

  html.design-coherence-v1 body #app
    .profile-shortcuts {
    min-width: 0 !important;
    display: grid !important;
    margin: 2px 0 4px !important;
    overflow: hidden !important;
    border: 1px solid var(--app-line) !important;
    border-radius: var(--app-radius-card) !important;
    background: var(--app-surface) !important;
    box-shadow: var(--app-shadow-card) !important;
  }

  html.design-coherence-v1 body #app
    .profile-shortcuts
    > .secondary-button {
    width: 100% !important;
    min-height: 60px !important;
    display: grid !important;
    grid-template-columns: 24px minmax(0, 1fr) 22px !important;
    align-items: center !important;
    gap: 12px !important;
    margin: 0 !important;
    padding: 12px 14px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--app-line) !important;
    border-radius: 0 !important;
    color: var(--app-ink) !important;
    background: var(--app-surface) !important;
    box-shadow: none !important;
    text-align: start !important;
  }

  html.design-coherence-v1 body #app
    .profile-shortcuts
    > .secondary-button:last-child {
    border-bottom: 0 !important;
  }

  html.design-coherence-v1 body #app
    .profile-shortcuts
    > .secondary-button:is(:hover, :focus-visible) {
    background: var(--app-surface-soft) !important;
  }

  html.design-coherence-v1 body #app
    .profile-shortcut-icon,
  html.design-coherence-v1 body #app
    .profile-shortcut-chevron {
    width: 22px !important;
    height: 22px !important;
    display: grid !important;
    place-items: center !important;
    color: var(--app-muted) !important;
  }

  html.design-coherence-v1 body #app
    .profile-shortcut-icon
    svg,
  html.design-coherence-v1 body #app
    .profile-shortcut-chevron
    svg {
    width: 21px !important;
    height: 21px !important;
  }

  html.design-coherence-v1 body #app
    .profile-shortcut-label {
    min-width: 0 !important;
    color: var(--app-ink) !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    line-height: 1.35 !important;
  }

  @media (max-width: 720px) {
    html.design-coherence-v1.ledger-workspace-v1 body #app
      .profile-avatar-options {
      width: 100% !important;
      max-width: 100% !important;
      overflow: hidden !important;
    }

    html.design-coherence-v1 body #app
      [data-screen-kind="home"]
      .home-quick-action.is-primary
      button.home-quick-action-icon {
      width: 44px !important;
      height: 44px !important;
      min-width: 44px !important;
      min-height: 44px !important;
      display: grid !important;
      place-items: center !important;
      padding: 0 !important;
    }

    html.design-coherence-v1.ledger-workspace-v1 body #app
      .screen[data-event-view="summary"]
      > .settlement-hero {
      margin-bottom: 0 !important;
    }

    html.design-coherence-v1.ledger-workspace-v1 body #app
      .screen[data-event-view="summary"]
      > .top {
      min-height: 0 !important;
      margin-block: 4px 8px !important;
      padding: 10px 14px !important;
    }

    html.design-coherence-v1.ledger-workspace-v1 body #app
      .screen[data-event-view="summary"]
      > .top
      .eyebrow {
      display: none !important;
    }

    html.design-coherence-v1.ledger-workspace-v1 body #app
      .screen[data-event-view="summary"]
      > .top
      h1 {
      font-size: clamp(20px, 6vw, 24px) !important;
      line-height: 1.15 !important;
    }

    html.design-coherence-v1.ledger-workspace-v1 body #app
      .screen[data-event-view="summary"]
      > .settlement-stage {
      margin-top: 0 !important;
      padding-top: 2px !important;
    }
  }

  @media (max-width: 260px) {
    html.design-coherence-v1.ledger-workspace-v1 body #app
      .profile-avatar-options {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 8px !important;
    }

    html.design-coherence-v1.ledger-workspace-v1 body #app
      .profile-avatar-option {
      min-width: 0 !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    html.design-coherence-v1 *,
    html.design-coherence-v1 *::before,
    html.design-coherence-v1 *::after {
      scroll-behavior: auto !important;
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 1ms !important;
    }
  }
`;

activateDesignCoherence();

function activateDesignCoherence() {
  document.documentElement.classList.add("design-coherence-v1");
  document.getElementById(STYLE_ID)?.remove();

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(CSS));
  document.head.append(style);
}
