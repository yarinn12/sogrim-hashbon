const VISUAL_REFRESH_STYLE_ID = "public-visual-refresh-layer-style";

document.documentElement.classList.add("visual-refresh-v3");
document.documentElement.classList.add("visual-refresh-v4");
injectVisualRefreshStyles();

function injectVisualRefreshStyles() {
  if (document.getElementById(VISUAL_REFRESH_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = VISUAL_REFRESH_STYLE_ID;
  style.textContent = `
    html.visual-refresh-v4 {
      --live-ink: #101614;
      --live-ink-soft: #1d2926;
      --live-muted: #5f6d68;
      --live-faint: #87928e;
      --live-canvas: #f6f7f3;
      --live-surface: rgba(255, 255, 251, 0.96);
      --live-line: rgba(16, 22, 20, 0.11);
      --live-line-strong: rgba(16, 22, 20, 0.18);
      --live-teal: #087b74;
      --live-teal-dark: #04534e;
      --live-blue: #245a7c;
      --live-gold: #b8872f;
      --live-coral: #c96b4b;
      --live-shadow-low: 0 8px 22px rgba(16, 22, 20, 0.055);
      --live-shadow-card: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 18px 44px rgba(16, 22, 20, 0.085);
      --live-shadow-hover: 0 1px 0 rgba(255, 255, 255, 0.92) inset, 0 24px 58px rgba(16, 22, 20, 0.13);
      --live-shadow-high: 0 1px 0 rgba(255, 255, 255, 0.24) inset, 0 32px 86px rgba(16, 22, 20, 0.18);
    }

    html.visual-refresh-v4 body {
      background:
        linear-gradient(180deg, rgba(255, 255, 251, 0.98) 0%, rgba(243, 247, 243, 0.98) 42%, rgba(250, 249, 244, 1) 100%),
        linear-gradient(115deg, rgba(8, 123, 116, 0.09) 0 26%, transparent 48%),
        linear-gradient(250deg, rgba(201, 107, 75, 0.055) 0 22%, transparent 42%) !important;
      color: var(--live-ink);
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    html.visual-refresh-v4 :where(h1, h2, h3, button, input, select, small, span, strong) {
      letter-spacing: 0;
    }

    html.visual-refresh-v4 .app {
      position: relative;
    }

    html.visual-refresh-v4 .app::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(8, 123, 116, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(16, 22, 20, 0.035) 1px, transparent 1px);
      background-size: 72px 72px;
      mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.3), transparent 72%);
      opacity: 0.62;
    }

    html.visual-refresh-v4 .screen {
      position: relative;
      z-index: 1;
      width: min(100%, 1180px);
      padding: clamp(14px, 2.2vw, 24px);
      animation: live-premium-enter 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    html.visual-refresh-v4 .product-app-identity {
      top: 8px;
      min-height: 60px;
      margin-bottom: 14px;
      padding: 8px 10px;
      border: 1px solid rgba(16, 22, 20, 0.08);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(250, 251, 247, 0.78)) !important;
      box-shadow: 0 10px 30px rgba(16, 22, 20, 0.075);
      backdrop-filter: blur(18px);
    }

    html.visual-refresh-v4 .product-brand-mark {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      background: linear-gradient(145deg, var(--live-ink) 0%, var(--live-teal-dark) 58%, var(--live-blue) 132%) !important;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.22) inset, 0 15px 32px rgba(8, 123, 116, 0.2);
    }

    html.visual-refresh-v4 .product-brand-copy strong {
      color: var(--live-ink);
      font-size: clamp(1.35rem, 2vw, 1.75rem);
      line-height: 1.04;
    }

    html.visual-refresh-v4 .screen > .top,
    html.visual-refresh-v4 .product-v2 .top {
      min-height: 118px;
      align-items: flex-start;
      margin: 0 0 18px;
      padding: clamp(18px, 2.6vw, 26px);
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 8px;
      background: linear-gradient(135deg, #101614 0%, #0b3f3b 58%, #245a7c 134%) !important;
      box-shadow: var(--live-shadow-high);
    }

    html.visual-refresh-v4 .screen > .top::before,
    html.visual-refresh-v4 .product-v2 .top::before {
      background:
        linear-gradient(100deg, rgba(255, 255, 255, 0.14), transparent 44%),
        repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.075) 0 1px, transparent 1px 32px);
      opacity: 0.64;
    }

    html.visual-refresh-v4 .screen > .top h1,
    html.visual-refresh-v4 .product-v2 .top h1 {
      max-width: 780px;
      color: #fffffb;
      font-size: clamp(1.86rem, 3.2vw, 2.6rem);
      line-height: 1.07;
      font-weight: 950;
    }

    html.visual-refresh-v4 .screen > .top .eyebrow,
    html.visual-refresh-v4 .screen > .top .muted,
    html.visual-refresh-v4 .product-v2 .top .eyebrow,
    html.visual-refresh-v4 .product-v2 .top .muted {
      color: rgba(255, 255, 251, 0.74);
    }

    html.visual-refresh-v4 .hero-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 12px 0 18px;
    }

    html.visual-refresh-v4 .primary-button,
    html.visual-refresh-v4 .secondary-button,
    html.visual-refresh-v4 .icon-button,
    html.visual-refresh-v4 .event-workspace-tab,
    html.visual-refresh-v4 .product-home-button,
    html.visual-refresh-v4 .file-button {
      min-height: 44px;
      border-radius: 8px;
      font-weight: 850;
      transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms cubic-bezier(0.22, 1, 0.36, 1), background 180ms cubic-bezier(0.22, 1, 0.36, 1), color 180ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    html.visual-refresh-v4 .primary-button {
      position: relative;
      overflow: hidden;
      background: linear-gradient(135deg, var(--live-teal) 0%, var(--live-teal-dark) 76%, var(--live-ink) 140%) !important;
      color: #fffffb;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.18) inset, 0 16px 34px rgba(8, 123, 116, 0.22);
    }

    html.visual-refresh-v4 .primary-button::after {
      content: "";
      position: absolute;
      inset: 1px;
      border-radius: inherit;
      pointer-events: none;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), transparent 48%);
    }

    html.visual-refresh-v4 .secondary-button,
    html.visual-refresh-v4 .icon-button,
    html.visual-refresh-v4 .file-button,
    html.visual-refresh-v4 .product-home-button {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 250, 246, 0.9)) !important;
      border-color: rgba(16, 22, 20, 0.12) !important;
      color: var(--live-ink);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.86) inset, 0 8px 20px rgba(16, 22, 20, 0.055);
    }

    html.visual-refresh-v4 .panel,
    html.visual-refresh-v4 .event-row,
    html.visual-refresh-v4 .expense-row,
    html.visual-refresh-v4 .group-row,
    html.visual-refresh-v4 .transfer-row,
    html.visual-refresh-v4 .balance-row,
    html.visual-refresh-v4 .summary-strip,
    html.visual-refresh-v4 .personal-action-card,
    html.visual-refresh-v4 .public-personal-action-card {
      border: 1px solid var(--live-line) !important;
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.985), rgba(250, 251, 247, 0.92)), #fffffb !important;
      box-shadow: var(--live-shadow-card) !important;
    }

    html.visual-refresh-v4 .panel {
      padding: clamp(16px, 2vw, 22px);
    }

    html.visual-refresh-v4 .section-title-row h2,
    html.visual-refresh-v4 .panel h2,
    html.visual-refresh-v4 .section > h2 {
      color: var(--live-ink);
      font-size: clamp(1.18rem, 2vw, 1.48rem);
      line-height: 1.16;
      font-weight: 920;
    }

    html.visual-refresh-v4 .muted,
    html.visual-refresh-v4 small {
      color: var(--live-muted);
    }

    html.visual-refresh-v4 .summary-strip {
      gap: 8px;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    html.visual-refresh-v4 .summary-item {
      min-height: 92px;
      padding: 14px 15px;
      border: 1px solid var(--live-line);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 245, 0.92));
      box-shadow: var(--live-shadow-low);
    }

    html.visual-refresh-v4 .summary-item strong,
    html.visual-refresh-v4 .amount {
      color: var(--live-ink);
      font-variant-numeric: tabular-nums;
      font-weight: 930;
    }

    html.visual-refresh-v4 .event-row,
    html.visual-refresh-v4 .expense-row,
    html.visual-refresh-v4 .transfer-row,
    html.visual-refresh-v4 .group-row {
      position: relative;
      min-height: 82px;
      padding: 15px 16px;
      overflow: hidden;
    }

    html.visual-refresh-v4 .event-row::before,
    html.visual-refresh-v4 .expense-row::before,
    html.visual-refresh-v4 .transfer-row::before,
    html.visual-refresh-v4 .summary-item::before {
      content: "";
      position: absolute;
      inset-block: 14px;
      inset-inline-start: 0;
      width: 2px;
      border-radius: 0 8px 8px 0;
      background: linear-gradient(180deg, var(--live-teal), var(--live-gold) 58%, var(--live-coral));
    }

    html.visual-refresh-v4 .event-row-main strong,
    html.visual-refresh-v4 .expense-row strong,
    html.visual-refresh-v4 .transfer-row strong,
    html.visual-refresh-v4 .group-row strong {
      color: var(--live-ink);
      font-weight: 910;
    }

    html.visual-refresh-v4 .avatar {
      border: 1px solid rgba(255, 255, 255, 0.72);
      background: linear-gradient(145deg, rgba(8, 123, 116, 0.15), rgba(36, 90, 124, 0.11));
      color: var(--live-teal-dark);
      box-shadow: 0 8px 18px rgba(16, 22, 20, 0.08);
    }

    html.visual-refresh-v4 .status-chip {
      min-height: 26px;
      border: 1px solid rgba(8, 123, 116, 0.15);
      border-radius: 8px;
      background: rgba(8, 123, 116, 0.075);
      color: var(--live-teal-dark);
      font-weight: 850;
    }

    html.visual-refresh-v4 .event-workspace-nav {
      top: 82px;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
      margin: 12px 0 16px;
      padding: 5px;
      border: 1px solid rgba(16, 22, 20, 0.08);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(248, 250, 246, 0.78)) !important;
      box-shadow: 0 10px 26px rgba(16, 22, 20, 0.075);
      backdrop-filter: blur(16px);
    }

    html.visual-refresh-v4 .event-workspace-tab {
      min-height: 40px;
      color: #66736e;
      text-decoration: none;
    }

    html.visual-refresh-v4 .event-workspace-tab.is-active,
    html.visual-refresh-v4 .event-workspace-tab[aria-current="page"],
    html.visual-refresh-v4 .event-workspace-tab:hover:not(:disabled) {
      background: rgba(8, 123, 116, 0.11);
      border-color: rgba(8, 123, 116, 0.18);
      color: var(--live-teal-dark);
    }

    html.visual-refresh-v4 .event-insight-panel,
    html.visual-refresh-v4 .settlement-hero {
      position: relative;
      gap: 18px;
      padding: clamp(18px, 2.6vw, 24px);
      overflow: hidden;
      color: #fffffb;
      background: linear-gradient(135deg, #101614 0%, #0a3a36 56%, #245a7c 132%) !important;
      box-shadow: var(--live-shadow-high) !important;
    }

    html.visual-refresh-v4 .event-command-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 11px;
      margin: 16px 0 22px;
    }

    html.visual-refresh-v4 .event-command-card {
      min-height: 118px;
      padding: 15px;
      border: 1px solid var(--live-line) !important;
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.985), rgba(249, 250, 246, 0.93)) !important;
      box-shadow: var(--live-shadow-card) !important;
    }

    html.visual-refresh-v4 .primary-button.event-command-card {
      background: linear-gradient(135deg, var(--live-teal) 0%, var(--live-teal-dark) 74%, var(--live-ink) 142%) !important;
    }

    html.visual-refresh-v4 .field input,
    html.visual-refresh-v4 .field select,
    html.visual-refresh-v4 .compact-field input,
    html.visual-refresh-v4 .guest-input,
    html.visual-refresh-v4 .invite-link-row input,
    html.visual-refresh-v4 .network-url-row input,
    html.visual-refresh-v4 .payer-row input,
    html.visual-refresh-v4 .payer-row select {
      min-height: 48px;
      border: 1px solid rgba(16, 22, 20, 0.15);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.98);
      color: var(--live-ink);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 8px 18px rgba(16, 22, 20, 0.04);
      transition: border-color 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    html.visual-refresh-v4 .field input:focus,
    html.visual-refresh-v4 .field select:focus,
    html.visual-refresh-v4 .guest-input:focus,
    html.visual-refresh-v4 .payer-row input:focus,
    html.visual-refresh-v4 .payer-row select:focus {
      border-color: rgba(8, 123, 116, 0.52);
      box-shadow: 0 0 0 4px rgba(8, 123, 116, 0.12), 0 12px 26px rgba(16, 22, 20, 0.07);
      outline: 0;
    }

    html.visual-refresh-v4 .participant-pill {
      border-color: rgba(16, 22, 20, 0.1);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.82);
    }

    html.visual-refresh-v4 .participant-pill:has(input:checked) {
      border-color: rgba(8, 123, 116, 0.34);
      background: linear-gradient(180deg, rgba(8, 123, 116, 0.12), rgba(255, 255, 255, 0.88));
    }

    html.visual-refresh-v4 .expense-modal-backdrop,
    html.visual-refresh-v4 .event-modal-backdrop {
      background: linear-gradient(180deg, rgba(16, 22, 20, 0.44), rgba(16, 22, 20, 0.66));
      backdrop-filter: blur(20px);
    }

    html.visual-refresh-v4 .expense-modal,
    html.visual-refresh-v4 .event-modal {
      border: 1px solid rgba(255, 255, 255, 0.76) !important;
      border-radius: 8px;
      background: linear-gradient(180deg, #ffffff, #f8faf6) !important;
      box-shadow: var(--live-shadow-high) !important;
    }

    html.visual-refresh-v4 .expense-modal-header,
    html.visual-refresh-v4 .event-modal-header {
      border-bottom: 1px solid rgba(16, 22, 20, 0.08);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 246, 0.92));
    }

    html.visual-refresh-v4 .expense-guest-box {
      margin-top: 18px;
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid rgba(8, 123, 116, 0.14);
      border-radius: 8px;
      background: linear-gradient(135deg, rgba(8, 123, 116, 0.075), rgba(184, 135, 47, 0.075)), rgba(255, 255, 255, 0.72);
    }

    @media (hover: hover) {
      html.visual-refresh-v4 .primary-button:hover:not(:disabled),
      html.visual-refresh-v4 .secondary-button:hover:not(:disabled),
      html.visual-refresh-v4 .icon-button:hover:not(:disabled),
      html.visual-refresh-v4 .event-workspace-tab:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: var(--live-shadow-hover) !important;
      }

      html.visual-refresh-v4 .event-row:hover,
      html.visual-refresh-v4 .expense-row:hover,
      html.visual-refresh-v4 .transfer-row:hover,
      html.visual-refresh-v4 .summary-item:hover,
      html.visual-refresh-v4 .event-command-card:hover {
        transform: translateY(-2px);
        border-color: rgba(8, 123, 116, 0.2) !important;
        box-shadow: var(--live-shadow-hover) !important;
      }
    }

    @media (max-width: 760px) {
      html.visual-refresh-v4 .screen {
        padding: 10px;
      }

      html.visual-refresh-v4 .product-app-identity {
        position: relative;
        top: auto;
        margin-bottom: 10px;
      }

      html.visual-refresh-v4 .screen > .top,
      html.visual-refresh-v4 .product-v2 .top {
        min-height: 0;
        padding: 16px;
        margin-bottom: 12px;
      }

      html.visual-refresh-v4 .screen > .top h1,
      html.visual-refresh-v4 .product-v2 .top h1 {
        font-size: clamp(1.55rem, 8vw, 1.95rem);
      }

      html.visual-refresh-v4 .hero-actions,
      html.visual-refresh-v4 .summary-strip,
      html.visual-refresh-v4 .event-insight-panel,
      html.visual-refresh-v4 .settlement-hero {
        grid-template-columns: 1fr;
      }

      html.visual-refresh-v4 .event-workspace-nav {
        top: 6px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin: 10px 0 14px;
      }

      html.visual-refresh-v4 .event-command-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
      }
    }

    @media (max-width: 480px) {
      html.visual-refresh-v4 .hero-actions,
      html.visual-refresh-v4 .event-command-grid {
        grid-template-columns: 1fr;
      }

      html.visual-refresh-v4 .expense-modal,
      html.visual-refresh-v4 .event-modal {
        width: min(100%, calc(100vw - 16px));
        max-height: calc(100vh - 16px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      html.visual-refresh-v4 *,
      html.visual-refresh-v4 *::before,
      html.visual-refresh-v4 *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }

    @keyframes live-premium-enter {
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
