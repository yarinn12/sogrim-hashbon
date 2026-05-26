const VISUAL_REFRESH_STYLE_ID = "public-visual-refresh-layer-style";

document.documentElement.classList.add("visual-refresh-v6");
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
  const isGroups = Boolean(screen.querySelector('[data-action="create-group"]'));

  screen.classList.add("command-center-screen");
  screen.classList.toggle("command-center-home", isHome);
  screen.classList.toggle("command-center-event", isEvent);
  screen.classList.toggle("command-center-settlement", isSettlement);
  screen.classList.toggle("command-center-groups", isGroups);

  if (isHome) cleanHomeScreen(screen);
  enhancePrimaryActions(screen);
  enhanceCommandCards(screen);
  enhanceSurfaces(screen);
}

function cleanHomeScreen(screen) {
  screen.querySelectorAll(".product-context-bar, .product-home-kicker").forEach((node) => {
    node.remove();
  });

  screen.querySelector(".profile-panel")?.classList.add("command-profile-panel");
  screen.querySelector(".personal-dashboard")?.classList.add("command-dashboard-panel");
  screen.querySelector(".personal-actions-section")?.classList.add("command-next-actions");
}

function enhancePrimaryActions(screen) {
  const actions = screen.querySelector(".hero-actions");
  if (!actions) return;

  actions.classList.add("command-action-grid");
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
    "share-whatsapp": "->",
    "create-event": "+",
    "join-existing-event": "->"
  };

  screen.querySelectorAll("button[data-action]").forEach((button) => {
    setIcon(button, icons[button.dataset.action]);
  });
}

function setIcon(button, icon) {
  if (!button || !icon || button.dataset.commandIcon) return;
  button.dataset.commandIcon = icon;
}

function enhanceSurfaces(screen) {
  screen
    .querySelectorAll(".panel, .event-row, .expense-row, .transfer-row, .group-row, .empty-state")
    .forEach((node) => node.classList.add("command-surface"));
}

function injectVisualRefreshStyles() {
  if (document.getElementById(VISUAL_REFRESH_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = VISUAL_REFRESH_STYLE_ID;
  style.textContent = `
    html.visual-refresh-v6 {
      --cmd-ink: #111513;
      --cmd-ink-soft: #24302b;
      --cmd-muted: #687670;
      --cmd-faint: #97a19c;
      --cmd-page: #f4f6f1;
      --cmd-paper: #fffef7;
      --cmd-line: rgba(17, 21, 19, 0.1);
      --cmd-line-strong: rgba(17, 21, 19, 0.18);
      --cmd-teal: #087b74;
      --cmd-teal-dark: #044b46;
      --cmd-blue: #1f5b7b;
      --cmd-gold: #bd8b32;
      --cmd-coral: #c5694d;
      --cmd-danger: #b42318;
      --cmd-radius: 8px;
      --cmd-ease: cubic-bezier(0.22, 1, 0.36, 1);
      --cmd-shadow-low: 0 8px 22px rgba(17, 21, 19, 0.055);
      --cmd-shadow-card: 0 1px 0 rgba(255,255,255,0.9) inset, 0 18px 44px rgba(17,21,19,0.09);
      --cmd-shadow-hover: 0 1px 0 rgba(255,255,255,0.96) inset, 0 28px 64px rgba(17,21,19,0.15);
      --cmd-shadow-high: 0 1px 0 rgba(255,255,255,0.2) inset, 0 36px 96px rgba(17,21,19,0.24);
      color: var(--cmd-ink);
    }

    html.visual-refresh-v6 body {
      min-height: 100vh;
      background:
        linear-gradient(180deg, #fbfbf6 0%, var(--cmd-page) 42%, #f7f5ee 100%),
        linear-gradient(118deg, rgba(8, 123, 116, 0.08) 0 32%, transparent 58%),
        linear-gradient(248deg, rgba(31, 91, 123, 0.065) 0 24%, transparent 52%) !important;
      color: var(--cmd-ink);
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    html.visual-refresh-v6 :where(h1, h2, h3, p, span, small, strong, button, input, select, textarea) {
      letter-spacing: 0;
    }

    html.visual-refresh-v6 .app::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(8, 123, 116, 0.034) 1px, transparent 1px),
        linear-gradient(90deg, rgba(17, 21, 19, 0.024) 1px, transparent 1px);
      background-size: 82px 82px;
      mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.32), transparent 74%);
      opacity: 0.72;
    }

    html.visual-refresh-v6 .command-center-screen,
    html.visual-refresh-v6 .screen {
      position: relative;
      z-index: 1;
      width: min(100%, 1200px);
      padding: clamp(14px, 2.2vw, 24px);
      animation: command-enter 420ms var(--cmd-ease) both;
    }

    html.visual-refresh-v6 .product-app-identity {
      position: sticky;
      top: 10px;
      z-index: 42;
      min-height: 64px;
      margin: 0 0 14px;
      padding: 8px 10px;
      border: 1px solid rgba(255, 255, 255, 0.74);
      border-radius: var(--cmd-radius);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.9), rgba(247,249,245,0.76)) !important;
      box-shadow: 0 12px 32px rgba(17,21,19,0.08);
      backdrop-filter: blur(18px);
    }

    html.visual-refresh-v6 .product-brand-lockup {
      gap: 10px;
    }

    html.visual-refresh-v6 .product-brand-mark {
      width: 48px;
      height: 48px;
      border: 1px solid rgba(255,255,255,0.24);
      border-radius: var(--cmd-radius);
      background:
        linear-gradient(145deg, var(--cmd-ink) 0%, var(--cmd-teal-dark) 58%, var(--cmd-blue) 136%) !important;
      color: #fffef7;
      box-shadow:
        0 1px 0 rgba(255,255,255,0.2) inset,
        0 15px 32px rgba(8,123,116,0.2);
    }

    html.visual-refresh-v6 .product-brand-mark::after {
      background: var(--cmd-gold);
      border-color: #fffef7;
    }

    html.visual-refresh-v6 .product-brand-copy strong {
      color: var(--cmd-ink);
      font-size: clamp(1.34rem, 2vw, 1.76rem);
      font-weight: 950;
      line-height: 1.04;
    }

    html.visual-refresh-v6 .product-brand-copy small,
    html.visual-refresh-v6 .muted,
    html.visual-refresh-v6 small {
      color: var(--cmd-muted);
    }

    html.visual-refresh-v6 .screen > .top,
    html.visual-refresh-v6 .product-v2 .top {
      position: relative;
      min-height: 210px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
      margin: 0 0 18px;
      padding: clamp(24px, 3.5vw, 42px);
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: var(--cmd-radius);
      background:
        linear-gradient(135deg, #111513 0%, #073e39 52%, #1f5b7b 138%) !important;
      box-shadow: var(--cmd-shadow-high);
    }

    html.visual-refresh-v6 .screen > .top::before,
    html.visual-refresh-v6 .product-v2 .top::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(100deg, rgba(255,255,255,0.14), transparent 44%),
        repeating-linear-gradient(115deg, rgba(255,255,255,0.075) 0 1px, transparent 1px 36px);
      opacity: 0.72;
    }

    html.visual-refresh-v6 .screen > .top::after,
    html.visual-refresh-v6 .product-v2 .top::after {
      content: "";
      position: absolute;
      inset-inline: clamp(18px, 4vw, 52px);
      bottom: 0;
      height: 4px;
      border-radius: 999px 999px 0 0;
      background: linear-gradient(90deg, var(--cmd-teal), var(--cmd-gold), var(--cmd-coral));
      opacity: 0.95;
    }

    html.visual-refresh-v6 .screen > .top > *,
    html.visual-refresh-v6 .product-v2 .top > * {
      position: relative;
      z-index: 1;
    }

    html.visual-refresh-v6 .screen > .top .brand,
    html.visual-refresh-v6 .product-v2 .top .brand {
      max-width: 860px;
      padding-inline-start: 0;
    }

    html.visual-refresh-v6 .screen > .top .brand::before,
    html.visual-refresh-v6 .product-v2 .top .brand::before {
      display: none;
    }

    html.visual-refresh-v6 .screen > .top h1,
    html.visual-refresh-v6 .product-v2 .top h1 {
      max-width: 820px;
      margin: 0 0 10px;
      color: #fffef7;
      font-size: clamp(2.35rem, 4.6vw, 4.05rem);
      font-weight: 950;
      line-height: 0.99;
    }

    html.visual-refresh-v6 .screen > .top .eyebrow,
    html.visual-refresh-v6 .screen > .top .muted,
    html.visual-refresh-v6 .product-v2 .top .eyebrow,
    html.visual-refresh-v6 .product-v2 .top .muted,
    html.visual-refresh-v6 .product-hero-note {
      max-width: 64ch;
      color: rgba(255,254,247,0.78);
      font-weight: 750;
    }

    html.visual-refresh-v6 .screen > .top .eyebrow,
    html.visual-refresh-v6 .product-v2 .top .eyebrow {
      font-size: 0.88rem;
      color: rgba(255,254,247,0.66);
    }

    html.visual-refresh-v6 .app-back-button,
    html.visual-refresh-v6 .screen > .top .icon-button {
      flex: 0 0 auto;
      order: 2;
      align-self: flex-start;
      background: rgba(255,254,247,0.94) !important;
      color: var(--cmd-teal-dark);
      border-color: rgba(255,255,255,0.72) !important;
    }

    html.visual-refresh-v6 .command-center-home .product-context-bar,
    html.visual-refresh-v6 .command-center-home .product-home-kicker {
      display: none !important;
    }

    html.visual-refresh-v6 .command-action-grid,
    html.visual-refresh-v6 .hero-actions {
      display: grid;
      grid-template-columns: 1.2fr 1fr 0.94fr;
      gap: 12px;
      margin: 0 0 18px;
    }

    html.visual-refresh-v6 .hero-actions > button {
      min-height: 94px;
      justify-content: flex-start;
      padding: 16px;
      text-align: start;
      white-space: normal;
    }

    html.visual-refresh-v6 button[data-command-icon] {
      display: inline-flex;
      align-items: center;
      gap: 11px;
    }

    html.visual-refresh-v6 button[data-command-icon]::before {
      content: attr(data-command-icon);
      width: 40px;
      height: 40px;
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
      border-radius: var(--cmd-radius);
      background: rgba(8,123,116,0.1);
      color: var(--cmd-teal-dark);
      font-size: 1rem;
      font-weight: 950;
    }

    html.visual-refresh-v6 .primary-button[data-command-icon]::before {
      background: rgba(255,255,255,0.14);
      color: #fffef7;
    }

    html.visual-refresh-v6 .primary-button,
    html.visual-refresh-v6 .secondary-button,
    html.visual-refresh-v6 .icon-button,
    html.visual-refresh-v6 .event-workspace-tab,
    html.visual-refresh-v6 .product-home-button,
    html.visual-refresh-v6 .file-button {
      min-height: 46px;
      border-radius: var(--cmd-radius);
      font-weight: 850;
      transition:
        transform 150ms var(--cmd-ease),
        box-shadow 190ms var(--cmd-ease),
        border-color 190ms var(--cmd-ease),
        background 190ms var(--cmd-ease),
        color 190ms var(--cmd-ease),
        filter 190ms var(--cmd-ease);
    }

    html.visual-refresh-v6 .primary-button {
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.16);
      background:
        linear-gradient(135deg, var(--cmd-teal) 0%, var(--cmd-teal-dark) 74%, var(--cmd-ink) 138%) !important;
      color: #fffef7;
      box-shadow:
        0 1px 0 rgba(255,255,255,0.18) inset,
        0 16px 34px rgba(8,123,116,0.22);
    }

    html.visual-refresh-v6 .primary-button::after {
      content: "";
      position: absolute;
      inset: 1px;
      border-radius: inherit;
      pointer-events: none;
      background: linear-gradient(180deg, rgba(255,255,255,0.2), transparent 48%);
    }

    html.visual-refresh-v6 .secondary-button,
    html.visual-refresh-v6 .icon-button,
    html.visual-refresh-v6 .file-button,
    html.visual-refresh-v6 .product-home-button {
      border: 1px solid var(--cmd-line) !important;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.98), rgba(249,250,246,0.9)) !important;
      color: var(--cmd-ink);
      box-shadow: 0 1px 0 rgba(255,255,255,0.88) inset, 0 8px 20px rgba(17,21,19,0.055);
    }

    html.visual-refresh-v6 .danger-button {
      color: var(--cmd-danger);
      border-color: rgba(180,35,24,0.24) !important;
      background: linear-gradient(180deg, #fff, #fff4f1) !important;
    }

    html.visual-refresh-v6 .command-surface,
    html.visual-refresh-v6 .panel,
    html.visual-refresh-v6 .event-row,
    html.visual-refresh-v6 .expense-row,
    html.visual-refresh-v6 .group-row,
    html.visual-refresh-v6 .transfer-row,
    html.visual-refresh-v6 .balance-row,
    html.visual-refresh-v6 .personal-action-card,
    html.visual-refresh-v6 .public-personal-action-card {
      border: 1px solid var(--cmd-line) !important;
      border-radius: var(--cmd-radius);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.985), rgba(250,251,247,0.92)),
        var(--cmd-paper) !important;
      box-shadow: var(--cmd-shadow-card) !important;
    }

    html.visual-refresh-v6 .panel {
      padding: clamp(16px, 2vw, 22px);
    }

    html.visual-refresh-v6 .command-profile-panel {
      margin: 0 0 18px;
      padding: 14px 16px;
    }

    html.visual-refresh-v6 .command-dashboard-panel {
      overflow: hidden;
    }

    html.visual-refresh-v6 .command-dashboard-panel .summary-strip {
      margin-top: 2px;
    }

    html.visual-refresh-v6 .section {
      margin-top: clamp(22px, 3vw, 32px);
    }

    html.visual-refresh-v6 .section-title-row {
      align-items: center;
      gap: 14px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(17,21,19,0.075);
    }

    html.visual-refresh-v6 .section-title-row h2,
    html.visual-refresh-v6 .panel h2,
    html.visual-refresh-v6 .section > h2 {
      margin-bottom: 4px;
      color: var(--cmd-ink);
      font-size: clamp(1.18rem, 2vw, 1.48rem);
      font-weight: 920;
      line-height: 1.16;
    }

    html.visual-refresh-v6 .summary-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      padding: 0;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    html.visual-refresh-v6 .summary-item {
      position: relative;
      min-height: 98px;
      padding: 14px 15px;
      overflow: hidden;
      border: 1px solid var(--cmd-line);
      border-radius: var(--cmd-radius);
      background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,245,0.92));
      box-shadow: var(--cmd-shadow-low);
    }

    html.visual-refresh-v6 .summary-item::before,
    html.visual-refresh-v6 .event-row::before,
    html.visual-refresh-v6 .expense-row::before,
    html.visual-refresh-v6 .transfer-row::before,
    html.visual-refresh-v6 .personal-action-card::before {
      content: "";
      position: absolute;
      inset-block: 14px;
      inset-inline-start: 0;
      width: 2px;
      border-radius: 0 8px 8px 0;
      background: linear-gradient(180deg, var(--cmd-teal), var(--cmd-gold) 58%, var(--cmd-coral));
    }

    html.visual-refresh-v6 .summary-item strong,
    html.visual-refresh-v6 .amount {
      color: var(--cmd-ink);
      font-variant-numeric: tabular-nums;
      font-weight: 930;
    }

    html.visual-refresh-v6 .summary-item strong {
      font-size: clamp(1.55rem, 3vw, 2.1rem);
      line-height: 1.04;
    }

    html.visual-refresh-v6 .event-row,
    html.visual-refresh-v6 .expense-row,
    html.visual-refresh-v6 .transfer-row,
    html.visual-refresh-v6 .group-row,
    html.visual-refresh-v6 .personal-action-card {
      position: relative;
      min-height: 86px;
      padding: 15px 16px;
      overflow: hidden;
    }

    html.visual-refresh-v6 .event-row-main strong,
    html.visual-refresh-v6 .expense-row strong,
    html.visual-refresh-v6 .transfer-row strong,
    html.visual-refresh-v6 .group-row strong,
    html.visual-refresh-v6 .personal-action-card strong {
      color: var(--cmd-ink);
      font-weight: 910;
    }

    html.visual-refresh-v6 .empty-state {
      min-height: 118px;
      display: grid;
      place-items: center;
      border: 1px dashed rgba(8,123,116,0.24) !important;
      background: linear-gradient(180deg, rgba(255,255,255,0.76), rgba(247,249,245,0.68)) !important;
      color: var(--cmd-muted);
      font-weight: 820;
    }

    html.visual-refresh-v6 .avatar,
    html.visual-refresh-v6 .public-profile-avatar {
      width: 36px;
      height: 36px;
      display: inline-grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,0.72);
      border-radius: 50%;
      background: linear-gradient(145deg, rgba(8,123,116,0.15), rgba(31,91,123,0.11));
      color: var(--cmd-teal-dark);
      box-shadow: 0 8px 18px rgba(17,21,19,0.08);
      font-weight: 950;
    }

    html.visual-refresh-v6 .status-chip {
      min-height: 27px;
      border: 1px solid rgba(8,123,116,0.16);
      border-radius: var(--cmd-radius);
      background: rgba(8,123,116,0.078);
      color: var(--cmd-teal-dark);
      font-weight: 850;
    }

    html.visual-refresh-v6 .event-workspace-nav {
      position: sticky;
      top: 82px;
      z-index: 30;
      gap: 5px;
      margin: 12px 0 16px;
      padding: 5px;
      border: 1px solid rgba(17,21,19,0.08);
      border-radius: var(--cmd-radius);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.9), rgba(248,250,246,0.78)) !important;
      box-shadow: 0 10px 26px rgba(17,21,19,0.075);
      backdrop-filter: blur(16px);
    }

    html.visual-refresh-v6 .event-workspace-tab.is-active,
    html.visual-refresh-v6 .event-workspace-tab[aria-current="page"],
    html.visual-refresh-v6 .event-workspace-tab:hover:not(:disabled) {
      background: rgba(8,123,116,0.11);
      border-color: rgba(8,123,116,0.18);
      color: var(--cmd-teal-dark);
    }

    html.visual-refresh-v6 .event-insight-panel,
    html.visual-refresh-v6 .settlement-hero,
    html.visual-refresh-v6 .product-event-command {
      position: relative;
      overflow: hidden;
      color: #fffef7;
      border-color: rgba(255,255,255,0.18) !important;
      background:
        linear-gradient(135deg, #111513 0%, #073e39 54%, #1f5b7b 136%) !important;
      box-shadow: var(--cmd-shadow-high) !important;
    }

    html.visual-refresh-v6 .event-insight-panel::before,
    html.visual-refresh-v6 .settlement-hero::before,
    html.visual-refresh-v6 .product-event-command::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(100deg, rgba(255,255,255,0.12), transparent 48%),
        repeating-linear-gradient(115deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 30px);
      opacity: 0.74;
    }

    html.visual-refresh-v6 .event-insight-panel > *,
    html.visual-refresh-v6 .settlement-hero > *,
    html.visual-refresh-v6 .product-event-command > * {
      position: relative;
      z-index: 1;
    }

    html.visual-refresh-v6 .event-insight-panel h2,
    html.visual-refresh-v6 .event-insight-panel .muted,
    html.visual-refresh-v6 .settlement-hero h2,
    html.visual-refresh-v6 .settlement-hero .muted,
    html.visual-refresh-v6 .settlement-hero .amount,
    html.visual-refresh-v6 .product-event-command h2,
    html.visual-refresh-v6 .product-event-command p {
      color: #fffef7;
    }

    html.visual-refresh-v6 .event-command-grid {
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 11px;
      margin: 16px 0 22px;
    }

    html.visual-refresh-v6 .event-command-card {
      min-height: 122px;
      padding: 15px;
    }

    html.visual-refresh-v6 .field input,
    html.visual-refresh-v6 .field select,
    html.visual-refresh-v6 .compact-field input,
    html.visual-refresh-v6 .guest-input,
    html.visual-refresh-v6 .invite-link-row input,
    html.visual-refresh-v6 .network-url-row input,
    html.visual-refresh-v6 .payer-row input,
    html.visual-refresh-v6 .payer-row select {
      min-height: 48px;
      border: 1px solid rgba(17,21,19,0.15);
      border-radius: var(--cmd-radius);
      background: rgba(255,255,255,0.98);
      color: var(--cmd-ink);
      box-shadow: 0 1px 0 rgba(255,255,255,0.9) inset, 0 8px 18px rgba(17,21,19,0.04);
    }

    html.visual-refresh-v6 .field input:focus,
    html.visual-refresh-v6 .field select:focus,
    html.visual-refresh-v6 .guest-input:focus,
    html.visual-refresh-v6 .payer-row input:focus,
    html.visual-refresh-v6 .payer-row select:focus {
      border-color: rgba(8,123,116,0.52);
      box-shadow: 0 0 0 4px rgba(8,123,116,0.12), 0 12px 26px rgba(17,21,19,0.07);
      outline: 0;
    }

    html.visual-refresh-v6 .expense-modal-backdrop,
    html.visual-refresh-v6 .event-modal-backdrop {
      background: linear-gradient(180deg, rgba(17,21,19,0.44), rgba(17,21,19,0.68));
      backdrop-filter: blur(20px);
    }

    html.visual-refresh-v6 .expense-modal,
    html.visual-refresh-v6 .event-modal {
      border: 1px solid rgba(255,255,255,0.76) !important;
      border-radius: var(--cmd-radius);
      background: linear-gradient(180deg, #fff, #f8faf6) !important;
      box-shadow: var(--cmd-shadow-high) !important;
    }

    html.visual-refresh-v6 .expense-modal-header,
    html.visual-refresh-v6 .event-modal-header {
      position: sticky;
      top: 0;
      z-index: 2;
      margin: -1px -1px 0;
      padding: 16px 16px 14px;
      border-bottom: 1px solid rgba(17,21,19,0.08);
      background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,246,0.92));
      backdrop-filter: blur(14px);
    }

    html.visual-refresh-v6 .expense-guest-box {
      margin-top: 18px;
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid rgba(8,123,116,0.14);
      border-radius: var(--cmd-radius);
      background: linear-gradient(135deg, rgba(8,123,116,0.075), rgba(189,139,50,0.075)), rgba(255,255,255,0.72);
    }

    @media (hover: hover) {
      html.visual-refresh-v6 .primary-button:hover:not(:disabled),
      html.visual-refresh-v6 .secondary-button:hover:not(:disabled),
      html.visual-refresh-v6 .icon-button:hover:not(:disabled),
      html.visual-refresh-v6 .event-row:hover,
      html.visual-refresh-v6 .expense-row:hover,
      html.visual-refresh-v6 .transfer-row:hover,
      html.visual-refresh-v6 .event-command-card:hover,
      html.visual-refresh-v6 .personal-action-card:hover,
      html.visual-refresh-v6 .summary-item:hover {
        transform: translateY(-2px);
        border-color: rgba(8,123,116,0.2) !important;
        box-shadow: var(--cmd-shadow-hover) !important;
      }
    }

    @media (max-width: 760px) {
      html.visual-refresh-v6 .screen {
        padding: 10px;
      }

      html.visual-refresh-v6 .product-app-identity {
        position: relative;
        top: auto;
        margin-bottom: 10px;
      }

      html.visual-refresh-v6 .screen > .top,
      html.visual-refresh-v6 .product-v2 .top {
        min-height: 0;
        align-items: stretch;
        padding: 16px;
        margin-bottom: 12px;
      }

      html.visual-refresh-v6 .screen > .top h1,
      html.visual-refresh-v6 .product-v2 .top h1 {
        font-size: clamp(1.72rem, 8vw, 2.2rem);
        line-height: 1.05;
      }

      html.visual-refresh-v6 .hero-actions,
      html.visual-refresh-v6 .summary-strip,
      html.visual-refresh-v6 .event-insight-panel,
      html.visual-refresh-v6 .settlement-hero,
      html.visual-refresh-v6 .settlement-hero-actions {
        grid-template-columns: 1fr;
      }

      html.visual-refresh-v6 .hero-actions > button {
        min-height: 72px;
      }

      html.visual-refresh-v6 .event-workspace-nav {
        top: 6px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 480px) {
      html.visual-refresh-v6 .event-command-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      html.visual-refresh-v6 *,
      html.visual-refresh-v6 *::before,
      html.visual-refresh-v6 *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }

    @keyframes command-enter {
      from {
        opacity: 0;
        transform: translateY(12px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.append(style);
}
