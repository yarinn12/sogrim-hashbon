const STYLE_ID = "public-mobile-fullscreen-modal-layer";

const CSS = `
  body.app-dialog-open {
    overflow: hidden !important;
    overscroll-behavior: none !important;
  }

  body.app-dialog-open #app [data-app-dialog-inert] {
    pointer-events: none !important;
  }

  @media (max-width: 1024px), (hover: none) and (pointer: coarse) {
    .expense-modal-backdrop,
    .event-modal-backdrop,
    html.product-v1 .expense-modal-backdrop,
    html.product-v1 .event-modal-backdrop,
    html.product-v1-live .expense-modal-backdrop,
    html.product-v1-live .event-modal-backdrop,
    html.fintech-design-v1 .expense-modal-backdrop,
    html.fintech-design-v1 .event-modal-backdrop,
    html.fintech-design-v2 .expense-modal-backdrop,
    html.fintech-design-v2 .event-modal-backdrop,
    html.premium-visual-v1 .expense-modal-backdrop,
    html.premium-visual-v1 .event-modal-backdrop,
    html.ledger-workspace-v1 body #app .expense-modal-backdrop,
    html.ledger-workspace-v1 body #app .event-modal-backdrop {
      position: fixed !important;
      inset: 0 !important;
      z-index: 80 !important;
      display: grid !important;
      place-items: stretch !important;
      align-items: stretch !important;
      justify-items: stretch !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: #ffffff !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }

    .expense-modal,
    .event-modal,
    html.product-v1 .expense-modal,
    html.product-v1 .event-modal,
    html.product-v1-live .expense-modal,
    html.product-v1-live .event-modal,
    html.fintech-design-v1 .expense-modal,
    html.fintech-design-v1 .event-modal,
    html.fintech-design-v2 .expense-modal,
    html.fintech-design-v2 .event-modal,
    html.premium-visual-v1 .expense-modal,
    html.premium-visual-v1 .event-modal,
    html.ledger-workspace-v1 body #app .expense-modal,
    html.ledger-workspace-v1 body #app .event-modal {
      box-sizing: border-box !important;
      width: 100vw !important;
      max-width: none !important;
      min-width: 0 !important;
      height: 100vh !important;
      height: 100svh !important;
      height: 100dvh !important;
      min-height: 100vh !important;
      min-height: 100svh !important;
      min-height: 100dvh !important;
      max-height: none !important;
      align-self: stretch !important;
      justify-self: stretch !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      overflow-y: auto !important;
      overscroll-behavior: contain !important;
      -webkit-overflow-scrolling: touch;
      scroll-padding-block: calc(88px + env(safe-area-inset-top)) calc(96px + env(safe-area-inset-bottom));
      box-shadow: none !important;
    }

    .expense-modal input,
    .expense-modal select,
    .expense-modal textarea,
    .event-modal input,
    .event-modal select,
    .event-modal textarea {
      min-height: 48px !important;
      font-size: 16px !important;
      touch-action: manipulation;
    }

    .expense-modal input[inputmode="decimal"],
    .event-modal input[inputmode="decimal"] {
      -webkit-user-select: text;
      user-select: text;
      scroll-margin-block: 96px;
    }

    .expense-modal-header,
    .event-modal-header,
    html.product-v1 .expense-modal-header,
    html.product-v1 .event-modal-header,
    html.product-v1-live .expense-modal-header,
    html.product-v1-live .event-modal-header,
    html.fintech-design-v1 .expense-modal-header,
    html.fintech-design-v1 .event-modal-header,
    html.fintech-design-v2 .expense-modal-header,
    html.fintech-design-v2 .event-modal-header,
    html.premium-visual-v1 .expense-modal-header,
    html.premium-visual-v1 .event-modal-header {
      position: sticky !important;
      top: 1px !important;
      z-index: 5 !important;
      margin: 0 0 16px !important;
      padding: calc(14px + env(safe-area-inset-top)) 20px 14px !important;
      border-bottom: 1px solid rgba(17, 21, 19, 0.1) !important;
      background: #ffffff !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }

    .expense-modal-actions,
    html.product-v1 .expense-modal-actions,
    html.product-v1-live .expense-modal-actions {
      position: static !important;
      z-index: 4 !important;
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 10px !important;
      margin: 18px -20px calc(-20px - env(safe-area-inset-bottom)) !important;
      padding: 12px 20px calc(12px + env(safe-area-inset-bottom)) !important;
      border-top: 1px solid rgba(17, 21, 19, 0.1) !important;
      background: #ffffff !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
      box-shadow: 0 -4px 10px rgba(17, 21, 19, 0.08) !important;
    }

    html.product-v2-live .expense-modal .expense-mode-switch button,
    html.product-v2-live .expense-modal .quick-purpose-switch button,
    html.product-v2-live .expense-modal .expense-template-grid .secondary-button,
    html.product-v2-live .event-workspace-nav .event-workspace-tab,
    html.product-v2-live .event-command-grid .event-command-card {
      min-height: 44px !important;
      touch-action: manipulation;
    }

    html.product-v2-live .expense-modal .expense-template-grid .secondary-button {
      padding-block: 7px !important;
    }

    .expense-modal .actions,
    .event-modal .actions {
      padding-bottom: max(0px, env(safe-area-inset-bottom)) !important;
    }

    /* Route modals share the screen with the persistent app navigation. Keep
       the action row above it and give the content one explicit scroll owner. */
    html.ledger-workspace-v1 body #app
      .expense-route-backdrop
      .expense-step-modal {
      height: calc(
        100dvh - var(--event-route-nav-safe-height, 96px) -
          env(safe-area-inset-bottom)
      ) !important;
      min-height: 0 !important;
      max-height: calc(
        100dvh - var(--event-route-nav-safe-height, 96px) -
          env(safe-area-inset-bottom)
      ) !important;
      overflow: hidden !important;
    }

    html.ledger-workspace-v1 body #app
      .expense-route-backdrop
      .expense-modal:not(.expense-step-modal) {
      height: calc(
        100dvh - var(--event-route-nav-safe-height, 96px) -
          env(safe-area-inset-bottom)
      ) !important;
      min-height: 0 !important;
      max-height: calc(
        100dvh - var(--event-route-nav-safe-height, 96px) -
          env(safe-area-inset-bottom)
      ) !important;
      overflow-y: auto !important;
      scroll-padding-block-end: 24px !important;
    }

    html.ledger-workspace-v1 body #app
      .expense-route-backdrop
      .expense-step-modal
      > .expense-flow-fields {
      min-height: 0 !important;
      flex: 1 1 auto !important;
      overflow: hidden !important;
    }

    html.ledger-workspace-v1 body #app
      .expense-route-backdrop
      .expense-flow-body {
      min-height: 0 !important;
      overflow-y: auto !important;
      overscroll-behavior-y: contain !important;
      touch-action: pan-y !important;
      -webkit-overflow-scrolling: touch;
    }

    html.ledger-workspace-v1 body #app
      .expense-route-backdrop
      .expense-modal-actions {
      position: relative !important;
      flex: 0 0 auto !important;
      margin: 0 !important;
      padding: 12px 16px max(12px, env(safe-area-inset-bottom)) !important;
      border-top: 1px solid rgba(17, 21, 19, 0.1) !important;
      background: #ffffff !important;
      box-shadow: 0 -4px 10px rgba(17, 21, 19, 0.06) !important;
    }

    html.ledger-workspace-v1 body #app
      .event-modal-backdrop[data-event-route-dialog="true"]
      .event-task-modal {
      height: calc(
        100dvh - var(--event-route-nav-safe-height, 96px) -
          env(safe-area-inset-bottom)
      ) !important;
      min-height: 0 !important;
      max-height: calc(
        100dvh - var(--event-route-nav-safe-height, 96px) -
          env(safe-area-inset-bottom)
      ) !important;
      grid-template-rows: auto auto minmax(0, 1fr) !important;
      overflow: hidden !important;
    }

    html.ledger-workspace-v1 body #app
      .event-modal-backdrop[data-event-route-dialog="true"]
      .event-route-sync-status[hidden] {
      display: none !important;
    }

    html.ledger-workspace-v1 body #app
      .event-modal-backdrop[data-event-route-dialog="true"]
      .event-route-sync-status {
      grid-row: 2 !important;
    }

    html.ledger-workspace-v1 body #app
      .event-modal-backdrop[data-event-route-dialog="true"]
      .event-task-modal
      > .event-modal-body {
      grid-row: 3 !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      overscroll-behavior-y: contain !important;
      touch-action: pan-y !important;
      -webkit-overflow-scrolling: touch;
    }

    html.ledger-workspace-v1 body #app
      .event-settings-modal
      > .event-modal-body
      > :is(.event-cover-settings, .event-settings-menu) {
      flex: 0 0 auto !important;
      align-self: stretch !important;
    }

    html.ledger-workspace-v1 body #app
      .event-settings-modal
      > .event-modal-body
      > .event-settings-menu {
      height: max-content !important;
    }

  }

  /* Tablets use their available canvas instead of inheriting a narrow phone
     column. Keep a readable maximum width while respecting both landscape
     safe areas and the persistent navigation. */
  @media (min-width: 721px) and (max-width: 1366px) {
    html.responsive-tablet-shell.ledger-workspace-v1 body #app#app .screen.screen,
    html.responsive-tablet-shell.ledger-workspace-v1 body #app#app .friends-hub-screen,
    html.responsive-tablet-shell.ledger-workspace-v1 body #app#app .product-home-screen.product-home-screen {
      box-sizing: border-box !important;
      width: min(calc(100% - 32px), 960px) !important;
      max-width: 960px !important;
      margin-inline: auto !important;
      padding-left: max(24px, env(safe-area-inset-left)) !important;
      padding-right: max(24px, env(safe-area-inset-right)) !important;
    }

    html.responsive-tablet-shell.ledger-workspace-v1 .product-route-controls,
    html.responsive-tablet-shell.ledger-workspace-v1 .product-route-controls[hidden] {
      right: auto !important;
      left: max(24px, calc((100vw - 960px) / 2 + 24px)) !important;
    }

    html.responsive-tablet-shell.ledger-workspace-v1 .product-app-nav,
    html.responsive-tablet-shell.ledger-workspace-v1 .event-route-primary-nav {
      width: min(520px, calc(100vw - 48px)) !important;
      max-width: 520px !important;
      right: auto !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      pointer-events: auto !important;
    }

    html.responsive-tablet-shell.ledger-workspace-v1 body #app .expense-modal-backdrop,
    html.responsive-tablet-shell.ledger-workspace-v1 body #app .event-modal-backdrop {
      width: 100vw !important;
      max-width: none !important;
      top: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      left: 0 !important;
      transform: none !important;
    }

    html.responsive-tablet-shell.ledger-workspace-v1 body #app .expense-modal,
    html.responsive-tablet-shell.ledger-workspace-v1 body #app .event-modal {
      width: min(calc(100vw - 32px), 960px) !important;
      max-width: 960px !important;
      justify-self: center !important;
    }
  }
`;

syncResponsiveTabletShell();
injectMobileModalStyles();
window.addEventListener("resize", syncResponsiveTabletShell, { passive: true });

function syncResponsiveTabletShell() {
  const isTabletViewport = window.innerWidth >= 721 && window.innerWidth <= 1366;
  const userAgent = String(globalThis.navigator?.userAgent ?? "");
  const hasTouch =
    Number(globalThis.navigator?.maxTouchPoints ?? 0) > 0 || /iPad|Mobile\//i.test(userAgent);
  document.documentElement.classList.remove("compact-tablet-phone-shell");
  document.documentElement.classList.toggle(
    "responsive-tablet-shell",
    isTabletViewport && hasTouch
  );
}

function injectMobileModalStyles() {
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(CSS));
  document.head.append(style);
}
