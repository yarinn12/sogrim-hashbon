const VISUAL_REFRESH_STYLE_ID = "public-visual-refresh-layer-style";

document.documentElement.classList.add("visual-refresh-v5");
injectVisualRefreshStyles();
installVisualRefreshLayer();

function installVisualRefreshLayer() {
  const app = document.querySelector("#app");
  if (!app) return;

  new MutationObserver(scheduleVisualRefresh).observe(app, {
    childList: true,
    subtree: true
  });
  scheduleVisualRefresh();
}

let refreshScheduled = false;

function scheduleVisualRefresh() {
  if (refreshScheduled) return;

  refreshScheduled = true;
  requestAnimationFrame(() => {
    refreshScheduled = false;
    enhanceCurrentScreen();
  });
}

function enhanceCurrentScreen() {
  const screen = document.querySelector("#app .screen");
  if (!screen) return;

  const isHome = Boolean(screen.querySelector('[data-action="new-event"]'));
  const isEvent = Boolean(screen.querySelector('[data-action="show-expense-form"]'));
  const isSettlement = Boolean(screen.querySelector('[data-action="copy-settlement"]'));

  screen.classList.add("premium-live-screen");
  screen.classList.toggle("premium-live-home", isHome);
  screen.classList.toggle("premium-live-event", isEvent);
  screen.classList.toggle("premium-live-settlement", isSettlement);

  if (isHome) cleanHomeScreen(screen);
  enhancePrimaryActions(screen);
  enhanceCommandCards(screen);
  enhanceSurfaces(screen);
}

function cleanHomeScreen(screen) {
  screen.querySelectorAll(".product-context-bar, .product-home-kicker").forEach((node) => {
    node.remove();
  });

  screen.querySelector(".profile-panel")?.classList.add("premium-live-profile-panel");
  screen.querySelector(".personal-actions-section")?.classList.add("premium-live-next-actions");
}

function enhancePrimaryActions(screen) {
  const actions = screen.querySelector(".hero-actions");
  if (!actions) return;

  actions.classList.add("premium-live-actions");
  setIcon(actions.querySelector('[data-action="new-event"]'), "+");
  setIcon(actions.querySelector('[data-action="join-event-screen"]'), "->");
  setIcon(actions.querySelector('[data-action="groups"]'), "::");
}

function enhanceCommandCards(screen) {
  const icons = {
    "show-expense-form": "+",
    share: "->",
    participants: "2",
    settings: "*",
    settle: "NIS",
    "copy-settlement": "[]",
    "copy-event-report": "=",
    "share-whatsapp": "->"
  };

  screen.querySelectorAll("button[data-action]").forEach((button) => {
    setIcon(button, icons[button.dataset.action]);
  });
}

function setIcon(button, icon) {
  if (!button || !icon || button.dataset.premiumIcon) return;
  button.dataset.premiumIcon = icon;
}

function enhanceSurfaces(screen) {
  screen
    .querySelectorAll(".panel, .event-row, .expense-row, .transfer-row, .group-row, .empty-state")
    .forEach((node) => node.classList.add("premium-live-surface"));
}

function injectVisualRefreshStyles() {
  if (document.getElementById(VISUAL_REFRESH_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = VISUAL_REFRESH_STYLE_ID;
  style.textContent = `
    html.visual-refresh-v5 {
      --live-bg: #f4f6f2;
      --live-surface: #fffef9;
      --live-ink: #111714;
      --live-muted: #66736d;
      --live-line: rgba(17, 23, 20, 0.1);
      --live-teal: #087b74;
      --live-teal-dark: #044f49;
      --live-blue: #245d84;
      --live-gold: #b9852f;
      --live-coral: #c56749;
      --live-danger: #b42318;
      --live-radius: 8px;
      --live-ease: cubic-bezier(0.22, 1, 0.36, 1);
      --live-shadow-card: 0 1px 0 rgba(255,255,255,0.92) inset, 0 18px 44px rgba(17,23,20,0.085);
      --live-shadow-hover: 0 1px 0 rgba(255,255,255,0.95) inset, 0 24px 58px rgba(17,23,20,0.14);
      --live-shadow-high: 0 1px 0 rgba(255,255,255,0.24) inset, 0 34px 90px rgba(17,23,20,0.22);
      color: var(--live-ink);
    }

    html.visual-refresh-v5 body {
      min-height: 100vh;
      color: var(--live-ink);
      background:
        linear-gradient(180deg, #fbfbf7 0%, var(--live-bg) 44%, #f8f7f1 100%),
        linear-gradient(115deg, rgba(8, 123, 116, 0.075) 0 30%, transparent 55%),
        linear-gradient(245deg, rgba(36, 93, 132, 0.06) 0 24%, transparent 48%) !important;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    html.visual-refresh-v5 :where(h1, h2, h3, p, span, small, strong, button, input, select, textarea) {
      letter-spacing: 0;
    }

    html.visual-refresh-v5 .app::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(8, 123, 116, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(17, 23, 20, 0.026) 1px, transparent 1px);
      background-size: 76px 76px;
      mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.28), transparent 76%);
      opacity: 0.62;
    }

    html.visual-refresh-v5 .premium-live-screen,
    html.visual-refresh-v5 .screen {
      position: relative;
      z-index: 1;
      width: min(100%, 1180px);
      padding: clamp(14px, 2.2vw, 24px);
      animation: premium-live-enter 380ms var(--live-ease) both;
    }

    html.visual-refresh-v5 .product-app-identity {
      position: sticky;
      top: 10px;
      z-index: 40;
      min-height: 62px;
      margin: 0 0 14px;
      padding: 8px 10px;
      border: 1px solid rgba(255,255,255,0.74);
      border-radius: var(--live-radius);
      background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(248,250,246,0.76)) !important;
      box-shadow: 0 10px 30px rgba(17,23,20,0.075);
      backdrop-filter: blur(18px);
    }

    html.visual-refresh-v5 .product-brand-mark {
      width: 48px;
      height: 48px;
      border-radius: var(--live-radius);
      background: linear-gradient(145deg, var(--live-ink) 0%, var(--live-teal-dark) 58%, var(--live-blue) 132%) !important;
      color: #fffef9;
      box-shadow: 0 1px 0 rgba(255,255,255,0.2) inset, 0 15px 32px rgba(8,123,116,0.2);
    }

    html.visual-refresh-v5 .product-brand-mark::after {
      background: var(--live-gold);
      border-color: #fffef9;
    }

    html.visual-refresh-v5 .product-brand-copy strong {
      color: var(--live-ink);
      font-size: clamp(1.34rem, 2vw, 1.72rem);
      font-weight: 950;
      line-height: 1.04;
    }

    html.visual-refresh-v5 .product-brand-copy small,
    html.visual-refresh-v5 .muted,
    html.visual-refresh-v5 small {
      color: var(--live-muted);
    }

    html.visual-refresh-v5 .screen > .top,
    html.visual-refresh-v5 .product-v2 .top {
      position: relative;
      min-height: 174px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
      margin: 0 0 18px;
      padding: clamp(20px, 3vw, 34px);
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: var(--live-radius);
      background: linear-gradient(135deg, #111714 0%, #063f3b 54%, #245d84 136%) !important;
      box-shadow: var(--live-shadow-high);
    }

    html.visual-refresh-v5 .screen > .top::before,
    html.visual-refresh-v5 .product-v2 .top::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(100deg, rgba(255,255,255,0.14), transparent 44%),
        repeating-linear-gradient(115deg, rgba(255,255,255,0.075) 0 1px, transparent 1px 34px);
      opacity: 0.72;
    }

    html.visual-refresh-v5 .screen > .top > *,
    html.visual-refresh-v5 .product-v2 .top > * {
      position: relative;
      z-index: 1;
    }

    html.visual-refresh-v5 .screen > .top .brand,
    html.visual-refresh-v5 .product-v2 .top .brand {
      max-width: 820px;
      padding-inline-start: 0;
    }

    html.visual-refresh-v5 .screen > .top .brand::before,
    html.visual-refresh-v5 .product-v2 .top .brand::before {
      display: none;
    }

    html.visual-refresh-v5 .screen > .top h1,
    html.visual-refresh-v5 .product-v2 .top h1 {
      max-width: 800px;
      margin: 0 0 10px;
      color: #fffef9;
      font-size: clamp(2.15rem, 4vw, 3.45rem);
      font-weight: 950;
      line-height: 1.03;
    }

    html.visual-refresh-v5 .screen > .top .eyebrow,
    html.visual-refresh-v5 .screen > .top .muted,
    html.visual-refresh-v5 .product-v2 .top .eyebrow,
    html.visual-refresh-v5 .product-v2 .top .muted,
    html.visual-refresh-v5 .product-hero-note {
      max-width: 62ch;
      color: rgba(255,254,249,0.76);
      font-weight: 740;
    }

    html.visual-refresh-v5 .premium-live-home .product-context-bar,
    html.visual-refresh-v5 .premium-live-home .product-home-kicker {
      display: none !important;
    }

    html.visual-refresh-v5 .premium-live-actions,
    html.visual-refresh-v5 .hero-actions {
      display: grid;
      grid-template-columns: 1.18fr 1fr 0.92fr;
      gap: 12px;
      margin: 0 0 18px;
    }

    html.visual-refresh-v5 .hero-actions > button {
      min-height: 82px;
      justify-content: flex-start;
      padding: 16px;
      text-align: start;
      white-space: normal;
    }

    html.visual-refresh-v5 button[data-premium-icon] {
      display: inline-flex;
      align-items: center;
      gap: 11px;
    }

    html.visual-refresh-v5 button[data-premium-icon]::before {
      content: attr(data-premium-icon);
      width: 38px;
      height: 38px;
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
      border-radius: var(--live-radius);
      background: rgba(8,123,116,0.1);
      color: var(--live-teal-dark);
      font-size: 1.05rem;
      font-weight: 950;
    }

    html.visual-refresh-v5 .primary-button[data-premium-icon]::before {
      background: rgba(255,255,255,0.14);
      color: #fffef9;
    }

    html.visual-refresh-v5 .primary-button,
    html.visual-refresh-v5 .secondary-button,
    html.visual-refresh-v5 .icon-button,
    html.visual-refresh-v5 .event-workspace-tab,
    html.visual-refresh-v5 .product-home-button,
    html.visual-refresh-v5 .file-button {
      min-height: 46px;
      border-radius: var(--live-radius);
      font-weight: 850;
      transition: transform 140ms var(--live-ease), box-shadow 180ms var(--live-ease), border-color 180ms var(--live-ease), background 180ms var(--live-ease), color 180ms var(--live-ease), filter 180ms var(--live-ease);
    }

    html.visual-refresh-v5 .primary-button {
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.16);
      background: linear-gradient(135deg, var(--live-teal) 0%, var(--live-teal-dark) 74%, var(--live-ink) 138%) !important;
      color: #fffef9;
      box-shadow: 0 1px 0 rgba(255,255,255,0.18) inset, 0 16px 34px rgba(8,123,116,0.22);
    }

    html.visual-refresh-v5 .primary-button::after {
      content: "";
      position: absolute;
      inset: 1px;
      border-radius: inherit;
      pointer-events: none;
      background: linear-gradient(180deg, rgba(255,255,255,0.2), transparent 48%);
    }

    html.visual-refresh-v5 .secondary-button,
    html.visual-refresh-v5 .icon-button,
    html.visual-refresh-v5 .file-button,
    html.visual-refresh-v5 .product-home-button {
      border: 1px solid var(--live-line) !important;
      background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(249,250,246,0.9)) !important;
      color: var(--live-ink);
      box-shadow: 0 1px 0 rgba(255,255,255,0.88) inset, 0 8px 20px rgba(17,23,20,0.055);
    }

    html.visual-refresh-v5 .premium-live-surface,
    html.visual-refresh-v5 .panel,
    html.visual-refresh-v5 .event-row,
    html.visual-refresh-v5 .expense-row,
    html.visual-refresh-v5 .group-row,
    html.visual-refresh-v5 .transfer-row,
    html.visual-refresh-v5 .balance-row,
    html.visual-refresh-v5 .personal-action-card,
    html.visual-refresh-v5 .public-personal-action-card {
      border: 1px solid var(--live-line) !important;
      border-radius: var(--live-radius);
      background: linear-gradient(180deg, rgba(255,255,255,0.985), rgba(250,251,247,0.92)), var(--live-surface) !important;
      box-shadow: var(--live-shadow-card) !important;
    }

    html.visual-refresh-v5 .panel {
      padding: clamp(16px, 2vw, 22px);
    }

    html.visual-refresh-v5 .premium-live-profile-panel {
      margin: 0 0 18px;
      padding: 14px 16px;
    }

    html.visual-refresh-v5 .section {
      margin-top: clamp(22px, 3vw, 32px);
    }

    html.visual-refresh-v5 .section-title-row {
      align-items: center;
      gap: 14px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(17,23,20,0.075);
    }

    html.visual-refresh-v5 .section-title-row h2,
    html.visual-refresh-v5 .panel h2,
    html.visual-refresh-v5 .section > h2 {
      margin-bottom: 4px;
      color: var(--live-ink);
      font-size: clamp(1.18rem, 2vw, 1.48rem);
      font-weight: 920;
      line-height: 1.16;
    }

    html.visual-refresh-v5 .empty-state {
      min-height: 116px;
      display: grid;
      place-items: center;
      border: 1px dashed rgba(8,123,116,0.24) !important;
      background: linear-gradient(180deg, rgba(255,255,255,0.72), rgba(247,249,245,0.66)) !important;
      color: var(--live-muted);
      font-weight: 820;
    }

    html.visual-refresh-v5 .summary-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      padding: 0;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    html.visual-refresh-v5 .summary-item {
      position: relative;
      min-height: 94px;
      padding: 14px 15px;
      overflow: hidden;
      border: 1px solid var(--live-line);
      border-radius: var(--live-radius);
      background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,245,0.92));
      box-shadow: 0 10px 26px rgba(17,23,20,0.06);
    }

    html.visual-refresh-v5 .summary-item::before,
    html.visual-refresh-v5 .event-row::before,
    html.visual-refresh-v5 .expense-row::before,
    html.visual-refresh-v5 .transfer-row::before {
      content: "";
      position: absolute;
      inset-block: 14px;
      inset-inline-start: 0;
      width: 2px;
      border-radius: 0 8px 8px 0;
      background: linear-gradient(180deg, var(--live-teal), var(--live-gold) 58%, var(--live-coral));
    }

    html.visual-refresh-v5 .summary-item strong,
    html.visual-refresh-v5 .amount {
      color: var(--live-ink);
      font-variant-numeric: tabular-nums;
      font-weight: 930;
    }

    html.visual-refresh-v5 .event-row,
    html.visual-refresh-v5 .expense-row,
    html.visual-refresh-v5 .transfer-row,
    html.visual-refresh-v5 .group-row {
      position: relative;
      min-height: 84px;
      padding: 15px 16px;
      overflow: hidden;
    }

    html.visual-refresh-v5 .avatar,
    html.visual-refresh-v5 .public-profile-avatar {
      width: 36px;
      height: 36px;
      display: inline-grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,0.72);
      border-radius: 50%;
      background: linear-gradient(145deg, rgba(8,123,116,0.15), rgba(36,93,132,0.11));
      color: var(--live-teal-dark);
      box-shadow: 0 8px 18px rgba(17,23,20,0.08);
      font-weight: 950;
    }

    html.visual-refresh-v5 .event-insight-panel,
    html.visual-refresh-v5 .settlement-hero,
    html.visual-refresh-v5 .product-event-command {
      position: relative;
      overflow: hidden;
      color: #fffef9;
      border-color: rgba(255,255,255,0.18) !important;
      background: linear-gradient(135deg, #111714 0%, #0a3f3a 56%, #245d84 132%) !important;
      box-shadow: var(--live-shadow-high) !important;
    }

    html.visual-refresh-v5 .field input,
    html.visual-refresh-v5 .field select,
    html.visual-refresh-v5 .compact-field input,
    html.visual-refresh-v5 .guest-input,
    html.visual-refresh-v5 .invite-link-row input,
    html.visual-refresh-v5 .network-url-row input,
    html.visual-refresh-v5 .payer-row input,
    html.visual-refresh-v5 .payer-row select {
      min-height: 48px;
      border: 1px solid rgba(17,23,20,0.15);
      border-radius: var(--live-radius);
      background: rgba(255,255,255,0.98);
      color: var(--live-ink);
      box-shadow: 0 1px 0 rgba(255,255,255,0.9) inset, 0 8px 18px rgba(17,23,20,0.04);
    }

    html.visual-refresh-v5 .expense-modal-backdrop,
    html.visual-refresh-v5 .event-modal-backdrop {
      background: linear-gradient(180deg, rgba(17,23,20,0.44), rgba(17,23,20,0.66));
      backdrop-filter: blur(20px);
    }

    html.visual-refresh-v5 .expense-modal,
    html.visual-refresh-v5 .event-modal {
      border: 1px solid rgba(255,255,255,0.76) !important;
      border-radius: var(--live-radius);
      background: linear-gradient(180deg, #fff, #f8faf6) !important;
      box-shadow: var(--live-shadow-high) !important;
    }

    html.visual-refresh-v5 .expense-guest-box {
      margin-top: 18px;
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid rgba(8,123,116,0.14);
      border-radius: var(--live-radius);
      background: linear-gradient(135deg, rgba(8,123,116,0.075), rgba(185,133,47,0.075)), rgba(255,255,255,0.72);
    }

    @media (hover: hover) {
      html.visual-refresh-v5 .primary-button:hover:not(:disabled),
      html.visual-refresh-v5 .secondary-button:hover:not(:disabled),
      html.visual-refresh-v5 .icon-button:hover:not(:disabled),
      html.visual-refresh-v5 .event-row:hover,
      html.visual-refresh-v5 .expense-row:hover,
      html.visual-refresh-v5 .transfer-row:hover,
      html.visual-refresh-v5 .event-command-card:hover,
      html.visual-refresh-v5 .personal-action-card:hover {
        transform: translateY(-2px);
        border-color: rgba(8,123,116,0.2) !important;
        box-shadow: var(--live-shadow-hover) !important;
      }
    }

    @media (max-width: 760px) {
      html.visual-refresh-v5 .screen {
        padding: 10px;
      }

      html.visual-refresh-v5 .product-app-identity {
        position: relative;
        top: auto;
        margin-bottom: 10px;
      }

      html.visual-refresh-v5 .screen > .top,
      html.visual-refresh-v5 .product-v2 .top {
        min-height: 0;
        align-items: stretch;
        padding: 16px;
        margin-bottom: 12px;
      }

      html.visual-refresh-v5 .screen > .top h1,
      html.visual-refresh-v5 .product-v2 .top h1 {
        font-size: clamp(1.7rem, 8vw, 2.15rem);
      }

      html.visual-refresh-v5 .hero-actions,
      html.visual-refresh-v5 .summary-strip,
      html.visual-refresh-v5 .event-insight-panel,
      html.visual-refresh-v5 .settlement-hero {
        grid-template-columns: 1fr;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      html.visual-refresh-v5 *,
      html.visual-refresh-v5 *::before,
      html.visual-refresh-v5 *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }

    @keyframes premium-live-enter {
      from {
        opacity: 0;
        transform: translateY(10px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.append(style);
}
