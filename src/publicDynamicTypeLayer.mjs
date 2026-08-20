const STYLE_ID = "public-dynamic-type-style";
const ACTIVE_CLASS = "dynamic-type-active";
const APPLE_CLASS = "dynamic-type-apple";
const ANDROID_CLASS = "dynamic-type-android";
const LARGE_CLASS = "dynamic-type-large";
const EXTRA_LARGE_CLASS = "dynamic-type-extra-large";

export function classifyDynamicTypeSize(fontSize) {
  const size = Number.parseFloat(fontSize);
  if (!Number.isFinite(size) || size < 19) return "normal";
  if (size >= 23) return "extra-large";
  return "large";
}

export function supportsAppleDynamicType(view = globalThis.window) {
  return Boolean(
    view?.CSS?.supports?.("font", "-apple-system-body") &&
      view?.matchMedia?.("(any-pointer: coarse)")?.matches
  );
}

export function classifyAndroidFontScale(fontScale) {
  const scale = Number.parseFloat(fontScale);
  if (!Number.isFinite(scale) || scale <= 1) return "normal";
  return classifyDynamicTypeSize(16 * Math.min(2, Math.max(1, scale)));
}

export function localPreviewSize(location = globalThis.location) {
  if (!location || !["localhost", "127.0.0.1"].includes(location.hostname)) return 0;

  const requested = Number.parseFloat(
    new URLSearchParams(location.search).get("dynamic-type-preview")
  );
  if (!Number.isFinite(requested)) return 0;
  return Math.min(32, Math.max(19, requested));
}

export function refreshDynamicType(root = globalThis.document?.documentElement) {
  if (!root) return "normal";

  const view = root.ownerDocument?.defaultView ?? globalThis.window;
  const active = supportsAppleDynamicType(view);
  root.classList.toggle(ACTIVE_CLASS, active);
  root.classList.toggle(APPLE_CLASS, active);
  root.classList.remove(ANDROID_CLASS);
  root.style.removeProperty("--android-font-scale");
  root.classList.remove(LARGE_CLASS, EXTRA_LARGE_CLASS);

  if (!active) {
    root.dataset.dynamicType = "normal";
    return "normal";
  }

  const level = classifyDynamicTypeSize(view.getComputedStyle(root).fontSize);
  root.classList.toggle(LARGE_CLASS, level === "large");
  root.classList.toggle(EXTRA_LARGE_CLASS, level === "extra-large");
  root.dataset.dynamicType = level;
  return level;
}

export async function refreshAndroidDynamicType(
  root = globalThis.document?.documentElement,
  capacitor = globalThis.Capacitor
) {
  if (!root || capacitor?.getPlatform?.() !== "android") {
    return refreshDynamicType(root);
  }

  const capabilities = await capacitor?.Plugins?.SogrimCapabilities?.getCapabilities?.();
  const rawScale = Number.parseFloat(capabilities?.fontScale);
  const scale = Number.isFinite(rawScale)
    ? Math.min(2, Math.max(1, rawScale))
    : 1;
  const active = scale > 1.01;
  const level = active ? classifyAndroidFontScale(scale) : "normal";

  root.classList.toggle(ACTIVE_CLASS, active);
  root.classList.toggle(ANDROID_CLASS, active);
  root.classList.remove(APPLE_CLASS, LARGE_CLASS, EXTRA_LARGE_CLASS);
  root.style.setProperty("--android-font-scale", String(scale));
  root.classList.toggle(LARGE_CLASS, level === "large");
  root.classList.toggle(EXTRA_LARGE_CLASS, level === "extra-large");
  root.dataset.dynamicType = level;
  return level;
}

function injectDynamicTypeStyles(document) {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html {
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
    }

    /*
     * -apple-system-body carries the user's iOS Dynamic Type preference.
     * The app keeps Rubik for Hebrew, while rem-based sizes inherit the
     * accessible root size supplied by WebKit.
     */
    html.${ACTIVE_CLASS}.${APPLE_CLASS} {
      font: -apple-system-body;
    }

    html.${ACTIVE_CLASS} {
      --dynamic-text-11: 0.647rem;
      --dynamic-text-12: 0.706rem;
      --dynamic-text-13: 0.765rem;
      --dynamic-text-14: 0.824rem;
      --dynamic-text-15: 0.882rem;
      --dynamic-text-16: 0.941rem;
      --dynamic-text-17: 1rem;
      --dynamic-text-20: 1.176rem;
      --dynamic-text-24: 1.412rem;
      --dynamic-text-28: 1.647rem;
      --dynamic-text-32: 1.882rem;
      --dynamic-text-36: 2.118rem;
    }

    html.${ACTIVE_CLASS}.${ANDROID_CLASS} {
      font-size: calc(16px * var(--android-font-scale, 1)) !important;
    }

    html.${ACTIVE_CLASS} body,
    html.${ACTIVE_CLASS} .font-hebrew,
    html.${ACTIVE_CLASS} button,
    html.${ACTIVE_CLASS} input,
    html.${ACTIVE_CLASS} select,
    html.${ACTIVE_CLASS} textarea {
      font-family: "Rubik", "Heebo", "Assistant", sans-serif !important;
    }

    html.${ACTIVE_CLASS} #app,
    html.dynamic-type-preview #app {
      font-size: var(--dynamic-text-16, 1rem) !important;
      line-height: 1.5 !important;
    }

    html.${ACTIVE_CLASS} #app :where(h1),
    html.dynamic-type-preview #app :where(h1) {
      font-size: var(--dynamic-text-32, 2rem) !important;
      line-height: 1.18 !important;
    }

    html.${ACTIVE_CLASS} #app :where(h2),
    html.dynamic-type-preview #app :where(h2) {
      font-size: var(--dynamic-text-24, 1.5rem) !important;
      line-height: 1.25 !important;
    }

    html.${ACTIVE_CLASS} #app :where(h3),
    html.dynamic-type-preview #app :where(h3) {
      font-size: var(--dynamic-text-20, 1.25rem) !important;
      line-height: 1.3 !important;
    }

    html.${ACTIVE_CLASS} #app
      :where(button, input, select, textarea, label, summary, p, li),
    html.dynamic-type-preview #app
      :where(button, input, select, textarea, label, summary, p, li) {
      font-size: var(--dynamic-text-16, 1rem) !important;
      line-height: 1.45 !important;
    }

    html.${ACTIVE_CLASS} #app
      :where(small, .eyebrow, .muted, .event-meta, .event-action-sync, .product-nav-button),
    html.dynamic-type-preview #app
      :where(small, .eyebrow, .muted, .event-meta, .event-action-sync, .product-nav-button) {
      font-size: var(--dynamic-text-13, 0.8125rem) !important;
      line-height: 1.4 !important;
    }

    html.${ACTIVE_CLASS} #app .font-num,
    html.dynamic-type-preview #app .font-num {
      font-size: inherit !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview) #app
      :where(h1, h2, h3, p, label, small, strong, button, summary, a, span:not([aria-hidden="true"])) {
      max-width: 100%;
      overflow: visible !important;
      white-space: normal !important;
      overflow-wrap: anywhere;
      word-break: normal;
      text-overflow: clip !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview) #app
      .visually-hidden {
      position: absolute !important;
      width: 1px !important;
      min-width: 1px !important;
      height: 1px !important;
      min-height: 1px !important;
      margin: -1px !important;
      padding: 0 !important;
      overflow: hidden !important;
      clip: rect(0 0 0 0) !important;
      clip-path: inset(50%) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview) #app
      :where(button, input, select, textarea, summary, .primary-button, .secondary-button, .icon-button) {
      height: auto !important;
      min-height: max(48px, 2.85rem) !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview) #app
      .product-header-profile-avatar {
      width: 48px !important;
      min-width: 48px !important;
      height: 48px !important;
      min-height: 48px !important;
      max-height: 48px !important;
      padding: 0 !important;
      flex: 0 0 48px !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview) #app
      .product-route-controls
      > :is(.app-back-button, .product-home-button, .accessibility-entry-button) {
      width: 48px !important;
      min-width: 48px !important;
      max-width: 48px !important;
      height: 48px !important;
      min-height: 48px !important;
      max-height: 48px !important;
      padding: 0 !important;
      flex: 0 0 48px !important;
      overflow: hidden !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview) #app
      input.event-participant-admin-toggle {
      width: 46px !important;
      min-width: 46px !important;
      max-width: 46px !important;
      height: 28px !important;
      min-height: 28px !important;
      max-height: 28px !important;
      padding: 0 !important;
      flex: 0 0 46px !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview) #app
      :where(input, select, textarea, .app-choice-trigger) {
      padding-block: max(12px, 0.7rem) !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview) #app
      :where(
        .screen > .top,
        .product-app-identity,
        .hero-actions,
        .event-header-actions,
        .event-workspace-nav,
        .summary-strip,
        .personal-summary-strip,
        .event-action-dock,
        .event-command-card,
        .recent-event-card,
        .settlement-transfer-card,
        .expense-card,
        .panel
      ) {
      height: auto !important;
      max-height: none !important;
      min-width: 0 !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview) #app
      :where(.product-brand-lockup, .product-brand-copy, .event-workspace-summary-copy) {
      min-width: 0 !important;
      flex: 1 1 auto !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
      .app-choice-picker {
      max-height: min(88dvh, 760px) !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
      :where(.expense-modal, .event-modal, .important-action-dialog) {
      max-height: 100dvh !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
    }

    html.${ACTIVE_CLASS} #public-account-auth-gate,
    html.dynamic-type-preview #public-account-auth-gate {
      font-size: var(--dynamic-text-16, 1rem) !important;
      line-height: 1.5 !important;
    }

    html.${ACTIVE_CLASS} #public-account-auth-gate h1,
    html.dynamic-type-preview #public-account-auth-gate h1 {
      font-size: var(--dynamic-text-32, 2rem) !important;
      line-height: 1.18 !important;
    }

    html.${ACTIVE_CLASS} #public-account-auth-gate h2,
    html.dynamic-type-preview #public-account-auth-gate h2 {
      font-size: var(--dynamic-text-24, 1.5rem) !important;
      line-height: 1.25 !important;
    }

    html.${ACTIVE_CLASS} #public-account-auth-gate
      :where(button, input, label, p, li, a),
    html.dynamic-type-preview #public-account-auth-gate
      :where(button, input, label, p, li, a) {
      font-size: var(--dynamic-text-16, 1rem) !important;
      line-height: 1.45 !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
      #public-account-auth-gate
      :where(h1, h2, p, label, strong, button, a, span:not([aria-hidden="true"])) {
      max-width: 100%;
      overflow: visible !important;
      white-space: normal !important;
      overflow-wrap: anywhere;
      text-overflow: clip !important;
    }

    html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
      #public-account-auth-gate
      :where(button, input, .primary-button, .secondary-button) {
      height: auto !important;
      min-height: max(48px, 2.85rem) !important;
    }

    @media (max-width: 720px) {
      html:is(.${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .screen[data-screen-kind="home"]
        > .top
        h1 {
        font-size: var(--dynamic-text-28, 1.647rem) !important;
      }

      html:is(.${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .screen[data-screen-kind="home"]
        > .top
        .hero-actions {
        margin-top: max(12px, 0.5rem) !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .product-app-nav {
        height: auto !important;
        min-height: calc(82px + env(safe-area-inset-bottom)) !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .product-nav-button {
        height: auto !important;
        min-height: 64px !important;
        padding-block: 7px !important;
        font-size: var(--dynamic-text-11, 0.6875rem) !important;
        line-height: 1.2 !important;
        white-space: nowrap !important;
        overflow-wrap: normal !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .product-nav-button
        span {
        white-space: nowrap !important;
        overflow-wrap: normal !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .screen {
        padding-bottom: calc(146px + env(safe-area-inset-bottom)) !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .screen[data-screen-kind="home"] {
        padding-bottom: calc(176px + env(safe-area-inset-bottom)) !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .screen.event-has-action-dock {
        padding-bottom: calc(226px + env(safe-area-inset-bottom)) !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .event-action-dock {
        position: static !important;
        inset: auto !important;
        width: 100% !important;
        min-height: 86px !important;
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        gap: 12px !important;
        margin: 24px 0 20px !important;
        transform: none !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .event-action-dock
        .event-action-total {
        width: 100% !important;
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        gap: 4px 12px !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .event-action-dock
        :where(.primary-button, .event-action-sync-wrap) {
        width: 100% !important;
        grid-column: 1 / -1 !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .event-action-dock
        .font-num {
        white-space: nowrap !important;
        overflow-wrap: normal !important;
        word-break: keep-all !important;
      }

      body:has(.event-participant-route-backdrop) #app .event-action-dock {
        display: none !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .screen.event-has-action-dock {
        padding-bottom: calc(146px + env(safe-area-inset-bottom)) !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-header {
        position: static !important;
        display: grid !important;
        grid-template-columns: 48px minmax(0, 1fr) !important;
        align-items: start !important;
        justify-content: stretch !important;
        gap: 10px !important;
        direction: ltr !important;
        padding:
          calc(12px + env(safe-area-inset-top))
          14px
          12px !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-header
        > div:first-child {
        min-width: 0 !important;
        grid-column: 2 !important;
        grid-row: 1 !important;
        direction: rtl !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-header
        > :where(.expense-modal-header-actions, .modal-close-button) {
        grid-column: 1 !important;
        grid-row: 1 !important;
        direction: rtl !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-header
        :where(.eyebrow, .muted) {
        display: none !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-header
        h2 {
        font-size: var(--dynamic-text-20, 1.25rem) !important;
        line-height: 1.2 !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-header
        .draft-restored-note {
        margin-block-start: 4px !important;
        font-size: var(--dynamic-text-11, 0.6875rem) !important;
        line-height: 1.3 !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-header-actions
        :where(.icon-button, .modal-close-button, .modal-section-back-button) {
        width: 48px !important;
        min-width: 48px !important;
        height: 48px !important;
        min-height: 48px !important;
        padding: 0 !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-step-header {
        grid-template-columns: 48px minmax(0, 1fr) 48px !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-step-header
        > .expense-modal-header-actions {
        display: contents !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-step-header
        .modal-section-back-button {
        grid-column: 3 !important;
        grid-row: 1 !important;
        justify-self: end !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-step-header
        .modal-close-button {
        grid-column: 1 !important;
        grid-row: 1 !important;
        justify-self: start !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-actions {
        gap: 8px !important;
        padding:
          10px
          14px
          calc(10px + env(safe-area-inset-bottom)) !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-actions
        :where(.primary-button, .secondary-button) {
        min-height: 56px !important;
        padding-block: 8px !important;
        font-size: var(--dynamic-text-13, 0.8125rem) !important;
        line-height: 1.25 !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-step-modal
        > .expense-flow-fields {
        min-height: 0 !important;
        flex: 1 1 auto !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-step-modal
        .expense-flow-body {
        min-height: 0 !important;
        flex: 1 1 auto !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-step-modal
        .expense-modal-actions {
        position: static !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .expense-modal
        .expense-modal-header
        > .modal-close-button {
        width: 48px !important;
        min-width: 48px !important;
        height: 48px !important;
        min-height: 48px !important;
        padding: 0 !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .screen[data-screen-kind="home"]
        > .top
        .hero-actions {
        position: static !important;
        inset: auto !important;
        width: 100% !important;
        margin-top: max(20px, 1rem) !important;
        transform: none !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .event-row {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        gap: 8px !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .event-row-open {
        width: 100% !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .event-row
        .event-status-toggle {
        position: static !important;
        inset: auto !important;
        width: auto !important;
        min-width: max-content !important;
        justify-self: start !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .expense-row {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        gap: 16px !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .expense-row-main {
        min-width: 0 !important;
        display: grid !important;
        grid-column: 1 !important;
        gap: 6px !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .expense-actions {
        width: 100% !important;
        min-width: 0 !important;
        display: grid !important;
        grid-column: 1 !important;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
        gap: 10px !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .expense-actions
        .amount {
        grid-column: 1 / -1 !important;
        justify-self: start !important;
        font-size: var(--dynamic-text-24, 1.5rem) !important;
      }

      html:is(.${LARGE_CLASS}, .${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .expense-participants-details {
        width: 100% !important;
        grid-column: 1 !important;
      }

      html:is(.${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .settlement-transfer-board
        .transfer-row
        .transfer-people {
        grid-template-columns: minmax(0, 1fr) !important;
        gap: 8px !important;
      }

      html:is(.${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .settlement-transfer-board
        .transfer-row
        .transfer-arrow {
        justify-self: center !important;
        transform: rotate(-90deg) !important;
      }

      html:is(.${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        #app
        .settlement-transfer-board
        .transfer-row
        .transfer-participant-copy
        strong {
        overflow: visible !important;
        white-space: normal !important;
        text-overflow: clip !important;
      }

      html:is(.${EXTRA_LARGE_CLASS}, .dynamic-type-preview) #app
        :where(
          .important-action-dialog-actions,
          .expense-modal-actions,
          .event-command-grid
        ) {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
      }

      html:is(.${EXTRA_LARGE_CLASS}, .dynamic-type-preview)
        .event-workspace-nav {
        align-items: stretch !important;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
      }
    }
  `;
  document.head.append(style);
}

function initializeDynamicType() {
  injectDynamicTypeStyles(document);
  document.documentElement.classList.add("dynamic-type-v1");
  const previewSize = localPreviewSize(window.location);
  if (previewSize) {
    document.documentElement.classList.add("dynamic-type-preview");
    document.documentElement.style.setProperty("font-size", `${previewSize}px`, "important");
  }
  refreshAccessibleText();
}

function refreshAccessibleText() {
  if (globalThis.Capacitor?.getPlatform?.() === "android") {
    return refreshAndroidDynamicType().catch(() => refreshDynamicType());
  }
  return Promise.resolve(refreshDynamicType());
}

if (typeof document !== "undefined") {
  initializeDynamicType();
  window.addEventListener("pageshow", () => refreshAccessibleText());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshAccessibleText();
  });
}
