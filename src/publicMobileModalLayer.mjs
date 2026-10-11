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
      :is(.event-task-modal, .event-participant-route-modal) {
      display: grid !important;
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
      align-self: start !important;
    }

    html.ledger-workspace-v1 body #app
      .event-modal-backdrop[data-event-route-dialog="true"]
      :is(.event-task-modal, .event-participant-route-modal)
      > .event-modal-body {
      grid-row: 3 !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      overscroll-behavior-y: contain !important;
      touch-action: pan-y !important;
      -webkit-overflow-scrolling: touch;
    }

    /* The route already ends above navigation. A second 180px reservation
       inside its scroller can push the focused last row behind the header. */
    html.ledger-workspace-v1 body #app
      .event-modal-backdrop[data-event-route-dialog="true"]
      .event-participant-route-modal > .event-modal-body {
      padding-block-end: 24px !important;
      scroll-padding-block: 12px !important;
    }

    /* A roster title has no length limit. Scroll it with the list so even a
       narrow large-text viewport can reveal a complete participant row. */
    html.ledger-workspace-v1 body #app
      .event-modal-backdrop[data-event-route-dialog="true"]
      .event-participant-roster-modal {
      display: block !important;
      overflow-y: auto !important;
      scroll-padding-block: 12px !important;
      touch-action: pan-y !important;
    }

    html.ledger-workspace-v1 body #app
      .event-modal-backdrop[data-event-route-dialog="true"]
      .event-participant-roster-modal > .event-modal-header {
      position: static !important;
    }

    html.ledger-workspace-v1 body #app
      .event-modal-backdrop[data-event-route-dialog="true"]
      .event-participant-roster-modal > .event-modal-body {
      overflow-y: visible !important;
    }

    /* Other participant routes also need their header to scroll in short
       landscape windows, where the header alone can fill the viewport. */
    @media (max-height: 500px) {
      html.ledger-workspace-v1 body #app
        .event-modal-backdrop[data-event-route-dialog="true"]
        .event-participant-route-modal {
        display: block !important;
        overflow-y: auto !important;
        scroll-padding-block: 12px !important;
        touch-action: pan-y !important;
      }

      html.ledger-workspace-v1 body #app
        .event-modal-backdrop[data-event-route-dialog="true"]
        .event-participant-route-modal > .event-modal-header {
        position: static !important;
      }

      html.ledger-workspace-v1 body #app
        .event-modal-backdrop[data-event-route-dialog="true"]
        .event-participant-route-modal > .event-modal-body {
        overflow-y: visible !important;
      }
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

  /* Safari can leave 100dvh unchanged while the software keyboard covers it.
     Use the visual viewport only during that state and return to the ordinary
     route geometry when it closes. Navigation is already behind the keyboard. */
  @media (max-width: 1024px), (hover: none) and (pointer: coarse) {
    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      :is(.expense-modal-backdrop, .event-modal-backdrop) {
      top: var(--app-keyboard-viewport-top) !important;
      bottom: auto !important;
      height: var(--app-keyboard-viewport-height) !important;
    }

    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      :is(.expense-modal-backdrop, .event-modal-backdrop)
      :is(.expense-modal, .event-modal) {
      height: var(--app-keyboard-viewport-height) !important;
      min-height: 0 !important;
      max-height: var(--app-keyboard-viewport-height) !important;
    }

    /* The step flow scrolls its title away to keep the active field above the
       keyboard. Clip that scrollport below the status bar and retain its two
       navigation controls while the title is offscreen. */
    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      .expense-step-route-backdrop {
      --app-keyboard-safe-top: max(0px, var(--app-keyboard-safe-area-top, env(safe-area-inset-top)));
      box-sizing: border-box !important;
      padding: calc(var(--app-keyboard-safe-top) + 1px) 0 0 !important;
    }

    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      .expense-step-route-backdrop::after {
      content: "";
      position: fixed;
      top: calc(var(--app-keyboard-viewport-top, 0px) + var(--app-keyboard-safe-top) + 1px);
      left: 0;
      right: 0;
      height: 55px;
      z-index: 7;
      pointer-events: none;
      background: #ffffff;
    }

    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      .expense-step-route-backdrop > .expense-step-modal {
      height: calc(var(--app-keyboard-viewport-height) - var(--app-keyboard-safe-top) - 1px) !important;
      max-height: calc(var(--app-keyboard-viewport-height) - var(--app-keyboard-safe-top) - 1px) !important;
      transform: none !important;
    }

    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      .expense-step-modal .expense-modal-step-header
      :is(.expense-accessibility-button, .modal-section-back-button) {
      position: fixed !important;
      top: calc(var(--app-keyboard-viewport-top, 0px) + var(--app-keyboard-safe-top) + 8px) !important;
      z-index: 8 !important;
    }

    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      .expense-step-modal .expense-modal-step-header .expense-accessibility-button {
      left: 14px !important;
      right: auto !important;
    }

    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      .expense-step-modal .expense-modal-step-header .modal-section-back-button {
      right: 14px !important;
      left: auto !important;
    }

    /* At accessibility text sizes the fixed header and progress row can leave
       less room than one input. Scroll those rows with the field so the input
       cannot sit underneath the progress hit target. Keep Next in view. */
    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      .expense-step-modal {
      display: block !important;
      overflow-y: auto !important;
      scroll-padding-block: 72px 104px !important;
      touch-action: pan-y !important;
      -webkit-overflow-scrolling: touch;
    }

    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      .expense-step-modal > .expense-flow-fields {
      display: block !important;
      overflow: visible !important;
    }

    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      .expense-route-backdrop .expense-step-modal .expense-flow-body {
      flex: none !important;
      overflow: visible !important;
    }

    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      .expense-step-modal .expense-modal-actions {
      position: sticky !important;
      bottom: 0 !important;
      z-index: 2 !important;
    }

    html.app-software-keyboard-open.ledger-workspace-v1 body #app
      :is(.product-app-nav, .event-route-primary-nav) {
      visibility: hidden !important;
      pointer-events: none !important;
    }
  }

  /* Desktop pointer layouts keep the same bottom navigation, so the roster
     needs its own scrollport above that navigation as well. */
  @media (min-width: 1025px) and (hover: hover) and (pointer: fine) {
    html.ledger-workspace-v1 body #app
      .event-participant-route-backdrop[data-event-route-dialog="true"]
      .event-participant-roster-modal {
      box-sizing: border-box !important;
      height: calc(100dvh - var(--event-route-nav-safe-height, 96px) - 32px - env(safe-area-inset-bottom)) !important;
      min-height: 0 !important;
      max-height: calc(100dvh - var(--event-route-nav-safe-height, 96px) - 32px - env(safe-area-inset-bottom)) !important;
      display: block !important;
      overflow-y: auto !important;
      scroll-padding-block: 12px !important;
    }

    html.ledger-workspace-v1 body #app
      .event-participant-route-backdrop[data-event-route-dialog="true"]
      .event-participant-roster-modal > .event-modal-header {
      position: static !important;
    }

    html.ledger-workspace-v1 body #app
      .event-participant-route-backdrop[data-event-route-dialog="true"]
      .event-participant-roster-modal > .event-modal-body {
      overflow-y: visible !important;
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
setupKeyboardViewport();

function setupKeyboardViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const root = document.documentElement;
  let frame = 0;
  let keyboardOpen = false;
  let safeAreaProbe;
  let observedModal;

  const safeAreaTop = () => {
    const configured = Number.parseFloat(getComputedStyle(root).getPropertyValue("--app-keyboard-safe-area-top"));
    if (Number.isFinite(configured)) return Math.max(0, configured);
    if (!safeAreaProbe) {
      safeAreaProbe = document.createElement("span");
      safeAreaProbe.setAttribute("aria-hidden", "true");
      safeAreaProbe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;padding-top:env(safe-area-inset-top)";
      document.body.append(safeAreaProbe);
    }
    return Number.parseFloat(getComputedStyle(safeAreaProbe).paddingTop) || 0;
  };

  const revealFocusedExpenseField = (visibleHeight, offsetTop) => {
    const field = document.activeElement;
    if (!field?.matches?.('[data-action="expense-total"], [data-action="expense-name"]')) return;
    const modal = field.closest(".expense-step-modal");
    if (!modal) return;
    const header = modal.querySelector(".expense-modal-step-header");
    const headerStyle = header ? getComputedStyle(header) : null;
    const headerInset = headerStyle ? Number.parseFloat(headerStyle.paddingTop) || 0 : 0;
    const controlsBottom = Math.max(0, ...[...modal.querySelectorAll(
      ".expense-modal-step-header .expense-accessibility-button, .expense-modal-step-header .modal-section-back-button"
    )].map(control => control.getBoundingClientRect().bottom));
    const safeTop = Math.max(
      offsetTop + Math.max(safeAreaTop(), headerInset),
      headerStyle?.position === "sticky" ? header.getBoundingClientRect().bottom : 0,
      controlsBottom + 4
    ) + 4;
    const actions = modal.querySelector(".expense-modal-actions");
    // Correct the modal scrollport against its actually unobscured bounds.
    // scrollIntoView(center) also applies accumulated scroll margins/padding:
    // with the sticky footer it can leave the field covered or move it beneath
    // the header. An already visible field keeps the user's scroll position.
    // The first scroll can move the footer into its sticky position. Measure
    // that final position once more rather than assuming its old top is fixed.
    for (let adjustment = 0; adjustment < 2; adjustment += 1) {
      const safeBottom = Math.min(offsetTop + visibleHeight, actions?.getBoundingClientRect().top ?? Infinity) - 8;
      const bounds = field.getBoundingClientRect();
      if (bounds.height > safeBottom - safeTop) return;
      if (bounds.top >= safeTop && bounds.bottom <= safeBottom) return;
      const delta = bounds.top < safeTop ? bounds.top - safeTop : bounds.bottom - safeBottom;
      modal.scrollTop += delta < 0 ? Math.floor(delta) : Math.ceil(delta);
    }
  };

  const sync = () => {
    frame = 0;
    const active = document.activeElement;
    const editing = !active?.readOnly && !active?.disabled && active?.matches?.(
      'textarea, [contenteditable]:not([contenteditable="false"]), input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="hidden"])'
    );
    const visibleHeight = Number(viewport.height);
    const offsetTop = Math.max(0, Number(viewport.offsetTop) || 0);
    // Pinch zoom also shrinks the visual viewport. Never fight the user's zoom.
    const unzoomed = Math.abs(Number(viewport.scale ?? 1) - 1) < 0.01;
    const obscured = window.innerHeight - visibleHeight - offsetTop;
    keyboardOpen = Boolean(
      unzoomed && visibleHeight > 0 && obscured > 150 && (editing || keyboardOpen)
    );
    root.classList.toggle("app-software-keyboard-open", keyboardOpen);
    const modal = keyboardOpen ? active?.closest?.(".expense-step-modal") : null;
    if (modal !== observedModal) {
      focusedLayoutObserver?.disconnect();
      observedModal = modal;
      if (modal) {
        // A font or rendered template can change layout after the viewport
        // event, without another keyboard or input event. Keep the field clear
        // when its real content/header/footer boxes change size as well.
        for (const element of [modal, ...modal.querySelectorAll(
          ".expense-modal-step-header, .expense-flow-fields, .expense-flow-body, .expense-modal-actions"
        )]) focusedLayoutObserver?.observe(element);
      }
    }
    if (keyboardOpen) {
      const height = `${Math.round(visibleHeight)}px`;
      const top = `${Math.round(offsetTop)}px`;
      if (root.style.getPropertyValue("--app-keyboard-viewport-height") !== height) {
        root.style.setProperty("--app-keyboard-viewport-height", height);
      }
      if (root.style.getPropertyValue("--app-keyboard-viewport-top") !== top) {
        root.style.setProperty("--app-keyboard-viewport-top", top);
      }
    } else {
      root.style.removeProperty("--app-keyboard-viewport-height");
      root.style.removeProperty("--app-keyboard-viewport-top");
    }
    if (keyboardOpen) revealFocusedExpenseField(visibleHeight, offsetTop);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(sync);
  };
  const focusedLayoutObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(schedule)
    : null;
  viewport.addEventListener("resize", schedule, { passive: true });
  viewport.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  document.addEventListener("focusin", schedule, { passive: true });
  document.addEventListener("input", schedule, { passive: true });
  schedule();
}

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
