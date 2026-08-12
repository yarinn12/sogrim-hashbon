const PREMIUM_STYLE_ID = "public-premium-visual-layer-style";
const SCREEN_CLASSES = [
  "premium-screen-home",
  "premium-screen-event",
  "premium-screen-new-event",
  "premium-screen-join-event",
  "premium-screen-profile",
  "premium-screen-settlement",
  "premium-screen-groups",
  "premium-screen-general"
];

let premiumVisualScheduled = false;

document.documentElement.classList.add("premium-visual-v1");
injectPremiumVisualStyles();
installPremiumVisualLayer();

function installPremiumVisualLayer() {
  schedulePremiumVisualEnhancement();

  if (!document.body) return;

  new MutationObserver(schedulePremiumVisualEnhancement).observe(document.body, {
    childList: true,
    subtree: true
  });

  window.addEventListener("hashchange", schedulePremiumVisualEnhancement);
  window.addEventListener("popstate", schedulePremiumVisualEnhancement);
}

function schedulePremiumVisualEnhancement() {
  if (premiumVisualScheduled) return;
  premiumVisualScheduled = true;

  requestAnimationFrame(() => {
    premiumVisualScheduled = false;
    enhancePremiumVisuals();
  });
}

function enhancePremiumVisuals() {
  const app = document.querySelector("#app");
  const screen = app?.querySelector(".screen");
  if (!app || !screen) return;

  app.classList.add("premium-app-shell");
  screen.classList.remove(...SCREEN_CLASSES);

  const kind = detectScreenKind(screen);
  screen.classList.add(`premium-screen-${kind}`);
  screen.dataset.premiumScreen = kind;

  markPremiumSurfaces(screen);
  normalizePremiumBranding(screen);
}

function detectScreenKind(screen) {
  if (screen.matches('[data-screen-kind="home"]')) return "home";

  if (screen.matches(".profile-setup-screen") || screen.querySelector('[data-action="save-profile"]')) {
    return "profile";
  }

  if (screen.matches('[data-screen-kind="new-event"]') || screen.querySelector('[data-action="create-event"]')) return "new-event";

  if (
    screen.querySelector('[data-action="join-existing-event"], [data-public-join-existing-event]') &&
    screen.querySelector('[data-action="join-event-link"], [data-public-join-event-link]')
  ) {
    return "join-event";
  }

  if (screen.querySelector(".transfer-row") && screen.querySelector(".balance-row")) {
    return "settlement";
  }

  if (screen.querySelector(".event-workspace-nav, .event-command-grid, .event-insight-panel")) {
    return "event";
  }

  if (screen.querySelector('[data-action="new-event"], .event-list, .personal-actions-section')) return "home";
  if (screen.querySelector(".group-row, .profile-panel")) return "groups";

  return "general";
}

function markPremiumSurfaces(screen) {
  markAll(screen, ".hero-actions", "primary-actions");
  markAll(screen, ".event-workspace-nav", "event-navigation");
  markAll(screen, ".event-command-grid", "event-actions");
  markAll(screen, ".summary-strip", "summary");
  markAll(screen, ".section-title-row", "section-header");
  markAll(screen, ".event-row", "event-row");
  markAll(screen, ".personal-action-card, .public-personal-action-card", "personal-action");
  markAll(screen, ".create-event-panel, .join-event-panel", "focused-flow");
}

function markAll(root, selector, role) {
  root.querySelectorAll(selector).forEach((element) => {
    if (element.dataset.premiumRole !== role) element.dataset.premiumRole = role;
  });
}

function normalizePremiumBranding(screen) {
  const identity = screen.querySelector(".product-app-identity");
  if (identity) identity.dataset.premiumRole = "app-bar";

  screen.querySelectorAll(".product-brand-mark").forEach((mark) => {
    mark.dataset.premiumRole = "brand-mark";
  });
}

function injectPremiumVisualStyles() {
  if (document.getElementById(PREMIUM_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = PREMIUM_STYLE_ID;
  style.textContent = `
    html.premium-visual-v1 {
      --premium-ink: #111a18;
      --premium-muted: #66756f;
      --premium-line: rgba(17, 26, 24, 0.1);
      --premium-line-strong: rgba(17, 26, 24, 0.16);
      --premium-surface: #fffdf8;
      --premium-surface-2: #f7fbf8;
      --premium-mint: #087b74;
      --premium-mint-deep: #064f49;
      --premium-clay: #cf5d3f;
      --premium-gold: #c29a3b;
      --premium-blue: #2f6f9f;
      --premium-shadow-1: 0 10px 24px rgba(17, 26, 24, 0.08);
      --premium-shadow-2: 0 18px 46px rgba(17, 26, 24, 0.12);
      --premium-shadow-3: 0 28px 70px rgba(17, 26, 24, 0.18);
      color: var(--premium-ink);
      font-family: "Heebo", "Noto Sans Hebrew", "Assistant", "Segoe UI", Arial, Helvetica, sans-serif;
    }

    html.premium-visual-v1 body {
      background:
        linear-gradient(132deg, rgba(8, 123, 116, 0.12) 0 18%, transparent 36%),
        linear-gradient(250deg, rgba(207, 93, 63, 0.1) 0 16%, transparent 34%),
        linear-gradient(180deg, #fffdf8 0%, #eff6f3 44%, #fbfaf6 100%) !important;
      color: var(--premium-ink);
      font-family: "Heebo", "Noto Sans Hebrew", "Assistant", "Segoe UI", Arial, Helvetica, sans-serif;
      text-rendering: optimizeLegibility;
    }

    html.premium-visual-v1 .app::before {
      background-image:
        linear-gradient(rgba(8, 123, 116, 0.055) 1px, transparent 1px),
        linear-gradient(90deg, rgba(8, 123, 116, 0.055) 1px, transparent 1px),
        linear-gradient(135deg, rgba(255, 255, 255, 0.5), transparent 38%);
      background-size: 56px 56px, 56px 56px, 100% 100%;
      mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.32), transparent 74%);
      opacity: 0.72;
    }

    html.premium-visual-v1 .premium-app-shell .screen {
      width: min(100%, 1080px);
      padding: clamp(14px, 3vw, 34px);
    }

    html.premium-visual-v1 .product-app-identity {
      position: sticky;
      top: 10px;
      z-index: 30;
      min-height: 74px;
      margin: 0 0 14px;
      padding: 12px 14px;
      border: 1px solid rgba(255, 255, 255, 0.74);
      border-radius: 8px;
      background:
        linear-gradient(180deg, rgba(255, 253, 248, 0.94), rgba(247, 251, 248, 0.84));
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.95) inset,
        var(--premium-shadow-1);
      backdrop-filter: blur(18px);
    }

    html.premium-visual-v1 .product-brand-mark {
      width: 56px;
      height: 56px;
      border-radius: 8px;
      font-size: 0 !important;
      background:
        linear-gradient(145deg, #075f58 0%, #087b74 48%, #cf5d3f 118%) !important;
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.34) inset,
        0 16px 34px rgba(8, 123, 116, 0.24);
    }

    html.premium-visual-v1 .product-brand-mark::before {
      content: "\\20AA";
      position: relative;
      z-index: 2;
      color: #fffdf8;
      font-size: 30px;
      font-weight: 950;
      line-height: 1;
    }

    html.premium-visual-v1 .product-brand-mark::after {
      width: 18px;
      height: 18px;
      border-width: 3px;
      background: #fff0bf;
    }

    html.premium-visual-v1 .product-brand-copy strong {
      color: var(--premium-ink);
      font-weight: 950;
    }

    html.premium-visual-v1 .product-brand-copy small {
      color: var(--premium-muted);
      font-weight: 760;
    }

    html.premium-visual-v1 .screen > .top {
      position: relative;
      overflow: hidden;
      align-items: flex-start;
      margin: 0 0 18px;
      padding: clamp(18px, 3.2vw, 30px);
      border: 1px solid rgba(255, 255, 255, 0.74);
      border-radius: 8px;
      background:
        linear-gradient(135deg, rgba(7, 95, 88, 0.98) 0%, rgba(8, 123, 116, 0.95) 54%, rgba(207, 93, 63, 0.92) 150%),
        var(--premium-mint);
      color: #fffdf8;
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.24) inset,
        var(--premium-shadow-2);
    }

    html.premium-visual-v1 .screen > .top::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.22), transparent 45%),
        repeating-linear-gradient(118deg, rgba(255, 255, 255, 0.12) 0 1px, transparent 1px 24px);
      opacity: 0.48;
    }

    html.premium-visual-v1 .screen > .top > * {
      position: relative;
      z-index: 1;
    }

    html.premium-visual-v1 .screen > .top .brand {
      min-height: 0;
      padding-inline-start: 0;
    }

    html.premium-visual-v1 .screen > .top .brand::before {
      display: none;
    }

    html.premium-visual-v1 .screen > .top .eyebrow,
    html.premium-visual-v1 .screen > .top .muted {
      color: rgba(255, 253, 248, 0.78);
    }

    html.premium-visual-v1 .screen > .top h1 {
      max-width: 760px;
      margin: 0 0 8px;
      color: #fffdf8;
      font-size: clamp(30px, 5vw, 50px);
      font-weight: 950;
      line-height: 1.05;
    }

    html.premium-visual-v1 .product-home-button,
    html.premium-visual-v1 .screen > .top .icon-button {
      background: rgba(255, 253, 248, 0.96);
      border-color: rgba(255, 255, 255, 0.72);
      color: var(--premium-mint-deep);
      box-shadow: 0 12px 26px rgba(17, 26, 24, 0.14);
    }

    html.premium-visual-v1 .hero-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin: 16px 0 20px;
    }

    html.premium-visual-v1 .primary-button,
    html.premium-visual-v1 .secondary-button,
    html.premium-visual-v1 .icon-button,
    html.premium-visual-v1 .event-workspace-tab,
    html.premium-visual-v1 .product-home-button {
      min-height: 48px;
      border-radius: 8px;
      letter-spacing: 0;
      transition:
        transform 160ms ease,
        box-shadow 160ms ease,
        border-color 160ms ease,
        background 160ms ease;
    }

    html.premium-visual-v1 .primary-button {
      background:
        linear-gradient(135deg, #087b74 0%, #055c56 74%, #063f3b 100%) !important;
      color: #fffdf8;
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.24) inset,
        0 14px 30px rgba(8, 123, 116, 0.24);
    }

    html.premium-visual-v1 .secondary-button,
    html.premium-visual-v1 .icon-button {
      background:
        linear-gradient(180deg, rgba(255, 253, 248, 0.98), rgba(247, 251, 248, 0.9)) !important;
      border: 1px solid var(--premium-line);
      color: var(--premium-ink);
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.9) inset,
        0 8px 20px rgba(17, 26, 24, 0.06);
    }

    html.premium-visual-v1 .primary-button:hover:not(:disabled),
    html.premium-visual-v1 .secondary-button:hover:not(:disabled),
    html.premium-visual-v1 .icon-button:hover:not(:disabled),
    html.premium-visual-v1 .event-row:hover {
      transform: translateY(-1px);
      box-shadow: var(--premium-shadow-2);
    }

    html.premium-visual-v1 button:focus-visible,
    html.premium-visual-v1 input:focus-visible,
    html.premium-visual-v1 select:focus-visible {
      outline: 3px solid rgba(194, 154, 59, 0.42);
      outline-offset: 3px;
    }

    html.premium-visual-v1 .panel,
    html.premium-visual-v1 .event-row,
    html.premium-visual-v1 .expense-row,
    html.premium-visual-v1 .group-row,
    html.premium-visual-v1 .transfer-row,
    html.premium-visual-v1 .balance-row,
    html.premium-visual-v1 .personal-action-card,
    html.premium-visual-v1 .public-personal-action-card {
      border: 1px solid var(--premium-line) !important;
      border-radius: 8px;
      background:
        linear-gradient(180deg, rgba(255, 253, 248, 0.98), rgba(247, 251, 248, 0.94)),
        var(--premium-surface) !important;
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.94) inset,
        var(--premium-shadow-1) !important;
    }

    html.premium-visual-v1 .section {
      margin-top: 22px;
    }

    html.premium-visual-v1 .section-title-row {
      align-items: end;
      gap: 14px;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(17, 26, 24, 0.08);
    }

    html.premium-visual-v1 .section-title-row h2,
    html.premium-visual-v1 .panel h2 {
      margin-bottom: 4px;
      color: var(--premium-ink);
      font-size: clamp(20px, 2.2vw, 25px);
      font-weight: 920;
    }

    html.premium-visual-v1 .muted {
      color: var(--premium-muted);
      font-weight: 520;
    }

    html.premium-visual-v1 .summary-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
      padding: 0;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    html.premium-visual-v1 .summary-item {
      min-width: 0;
      min-height: 96px;
      padding: 14px;
      border: 1px solid var(--premium-line);
      border-radius: 8px;
      background:
        linear-gradient(180deg, rgba(255, 253, 248, 0.98), rgba(240, 248, 244, 0.88));
      box-shadow: var(--premium-shadow-1);
    }

    html.premium-visual-v1 .summary-item span {
      color: var(--premium-muted);
      font-weight: 760;
    }

    html.premium-visual-v1 .summary-item strong {
      color: var(--premium-ink);
      font-size: clamp(24px, 4vw, 34px);
      font-weight: 950;
      line-height: 1.05;
    }

    html.premium-visual-v1 .personal-dashboard {
      padding: 16px;
      background:
        linear-gradient(135deg, rgba(255, 253, 248, 0.98), rgba(238, 247, 243, 0.92)),
        var(--premium-surface) !important;
    }

    html.premium-visual-v1 .personal-summary-strip {
      margin-top: 12px;
    }

    html.premium-visual-v1 .personal-next-step {
      margin-top: 12px;
      padding: 10px 12px;
      border: 1px solid rgba(8, 123, 116, 0.14);
      border-radius: 8px;
      background: rgba(8, 123, 116, 0.07);
      color: var(--premium-mint-deep);
      font-weight: 850;
    }

    html.premium-visual-v1 .event-list,
    html.premium-visual-v1 .stack,
    html.premium-visual-v1 .personal-action-list,
    html.premium-visual-v1 .public-personal-action-list {
      display: grid;
      gap: 12px;
    }

    html.premium-visual-v1 .event-row {
      position: relative;
      min-height: 88px;
      overflow: hidden;
      padding: 16px 18px;
    }

    html.premium-visual-v1 .event-row::before {
      content: "";
      position: absolute;
      inset-block: 14px;
      inset-inline-start: 0;
      width: 4px;
      border-radius: 0 8px 8px 0;
      background: linear-gradient(180deg, var(--premium-mint), var(--premium-clay));
    }

    html.premium-visual-v1 .event-row-main strong {
      color: var(--premium-ink);
      font-size: clamp(18px, 2.4vw, 23px);
      font-weight: 920;
    }

    html.premium-visual-v1 .event-row-side {
      align-items: end;
      gap: 8px;
    }

    html.premium-visual-v1 .status-chip {
      min-height: 28px;
      padding: 4px 10px;
      border-radius: 8px;
      border: 1px solid rgba(8, 123, 116, 0.14);
      background: rgba(8, 123, 116, 0.08);
      color: var(--premium-mint-deep);
      font-weight: 850;
    }

    html.premium-visual-v1 .event-workspace-nav {
      position: sticky;
      top: 94px;
      z-index: 20;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      margin: 14px 0;
      padding: 6px;
      border: 1px solid rgba(255, 255, 255, 0.76);
      border-radius: 8px;
      background:
        linear-gradient(180deg, rgba(255, 253, 248, 0.94), rgba(247, 251, 248, 0.86));
      box-shadow: var(--premium-shadow-1);
      backdrop-filter: blur(16px);
    }

    html.premium-visual-v1 .event-workspace-tab {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      min-height: 44px;
      padding: 0 12px;
      border: 1px solid transparent;
      border-radius: 8px;
      color: var(--premium-muted);
      font-weight: 870;
      text-decoration: none;
    }

    html.premium-visual-v1 .event-workspace-tab.is-active,
    html.premium-visual-v1 .event-workspace-tab:hover:not(:disabled) {
      background: rgba(8, 123, 116, 0.1);
      border-color: rgba(8, 123, 116, 0.16);
      color: var(--premium-mint-deep);
    }

    html.premium-visual-v1 .event-insight-panel {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(260px, 0.85fr);
      gap: 16px;
      align-items: stretch;
      padding: clamp(16px, 2.6vw, 24px);
      background:
        linear-gradient(135deg, #0b3935 0%, #0a675f 58%, #2f6f9f 145%) !important;
      color: #fffdf8;
      box-shadow: var(--premium-shadow-2) !important;
    }

    html.premium-visual-v1 .event-insight-panel h2,
    html.premium-visual-v1 .event-insight-panel .muted {
      color: #fffdf8;
    }

    html.premium-visual-v1 .event-insight-panel .muted {
      opacity: 0.76;
    }

    html.premium-visual-v1 .event-insight-metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    html.premium-visual-v1 .event-insight-metrics > div {
      min-height: 86px;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.1);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.12) inset;
    }

    html.premium-visual-v1 .event-insight-metrics span {
      color: rgba(255, 253, 248, 0.72);
      font-weight: 760;
    }

    html.premium-visual-v1 .event-insight-metrics strong {
      color: #fffdf8;
      font-size: 24px;
      font-weight: 940;
    }

    html.premium-visual-v1 .event-command-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(176px, 1fr));
      gap: 12px;
      margin: 16px 0 20px;
    }

    html.premium-visual-v1 .event-command-card {
      min-height: 138px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 16px;
      text-align: inherit;
      border: 1px solid var(--premium-line) !important;
      background:
        linear-gradient(180deg, rgba(255, 253, 248, 0.99), rgba(247, 251, 248, 0.92)) !important;
      color: var(--premium-ink);
    }

    html.premium-visual-v1 .primary-button.event-command-card {
      background:
        linear-gradient(135deg, #087b74 0%, #065e57 70%, #cf5d3f 142%) !important;
      color: #fffdf8;
    }

    html.premium-visual-v1 .event-command-card .command-card-icon {
      width: 46px;
      height: 46px;
      border-radius: 8px;
      background: rgba(8, 123, 116, 0.1);
      color: var(--premium-mint-deep);
    }

    html.premium-visual-v1 .primary-button.event-command-card .command-card-icon {
      background: rgba(255, 255, 255, 0.14);
      color: #fffdf8;
    }

    html.premium-visual-v1 .event-command-card strong {
      color: inherit;
      font-size: 18px;
      font-weight: 920;
    }

    html.premium-visual-v1 .event-command-card .event-command-copy > span {
      color: var(--premium-muted);
      font-weight: 660;
    }

    html.premium-visual-v1 .primary-button.event-command-card .event-command-copy > span {
      color: rgba(255, 253, 248, 0.76);
    }

    html.premium-visual-v1 .create-event-panel,
    html.premium-visual-v1 .join-event-panel,
    html.premium-visual-v1 .profile-setup-panel {
      width: min(100%, 760px);
      margin-inline: auto;
      padding: clamp(16px, 3vw, 24px);
    }

    html.premium-visual-v1 .premium-screen-new-event .top,
    html.premium-visual-v1 .premium-screen-join-event .top,
    html.premium-visual-v1 .premium-screen-profile .top {
      width: min(100%, 760px);
      margin-inline: auto;
    }

    html.premium-visual-v1 .field {
      gap: 8px;
    }

    html.premium-visual-v1 .field span {
      color: var(--premium-ink);
      font-weight: 850;
    }

    html.premium-visual-v1 .field input,
    html.premium-visual-v1 .field select,
    html.premium-visual-v1 .compact-field input,
    html.premium-visual-v1 .guest-input {
      min-height: 52px;
      border: 1px solid var(--premium-line-strong);
      border-radius: 8px;
      background: rgba(255, 253, 248, 0.96);
      color: var(--premium-ink);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.9) inset;
    }

    html.premium-visual-v1 .field input::placeholder,
    html.premium-visual-v1 .guest-input::placeholder {
      color: rgba(102, 117, 111, 0.72);
    }

    html.premium-visual-v1 .expense-modal-backdrop,
    html.premium-visual-v1 .event-modal-backdrop {
      background:
        linear-gradient(180deg, rgba(7, 31, 28, 0.34), rgba(7, 31, 28, 0.56));
      backdrop-filter: blur(16px);
    }

    html.premium-visual-v1 .expense-modal,
    html.premium-visual-v1 .event-modal {
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.78) !important;
      background:
        linear-gradient(180deg, rgba(255, 253, 248, 0.99), rgba(247, 251, 248, 0.96)) !important;
      box-shadow: var(--premium-shadow-3) !important;
    }

    html.premium-visual-v1 .expense-modal-header,
    html.premium-visual-v1 .event-modal-header {
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(17, 26, 24, 0.08);
    }

    html.premium-visual-v1 .expense-row,
    html.premium-visual-v1 .transfer-row,
    html.premium-visual-v1 .balance-row {
      padding: 14px;
    }

    html.premium-visual-v1 .amount {
      font-variant-numeric: tabular-nums;
      font-weight: 930;
    }

    html.premium-visual-v1 .empty-state {
      border: 1px dashed rgba(8, 123, 116, 0.24);
      border-radius: 8px;
      background: rgba(255, 253, 248, 0.74);
      color: var(--premium-muted);
      box-shadow: none;
    }

    @media (max-width: 680px) {
      html.premium-visual-v1 .premium-app-shell .screen {
        padding: 12px;
      }

      html.premium-visual-v1 .product-app-identity {
        position: relative;
        top: auto;
        min-height: 0;
        align-items: stretch;
      }

      html.premium-visual-v1 .screen > .top {
        padding: 18px;
      }

      html.premium-visual-v1 .screen > .top h1 {
        font-size: 31px;
      }

      html.premium-visual-v1 .hero-actions {
        grid-template-columns: 1fr;
      }

      html.premium-visual-v1 .summary-strip,
      html.premium-visual-v1 .event-insight-panel,
      html.premium-visual-v1 .event-insight-metrics,
      html.premium-visual-v1 .event-command-grid {
        grid-template-columns: 1fr;
      }

      html.premium-visual-v1 .event-workspace-nav {
        top: 8px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      html.premium-visual-v1 .event-row {
        align-items: stretch;
        gap: 12px;
      }

      html.premium-visual-v1 .event-row-side {
        align-items: flex-start;
      }

      html.premium-visual-v1 .event-command-card {
        min-height: 112px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      html.premium-visual-v1 *,
      html.premium-visual-v1 *::before,
      html.premium-visual-v1 *::after {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
      }
    }
  `;
  document.head.append(style);
}
