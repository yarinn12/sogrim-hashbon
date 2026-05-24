const VISUAL_REFRESH_STYLE_ID = "public-visual-refresh-layer-style";

document.documentElement.classList.add("visual-refresh-v3");
injectVisualRefreshStyles();

function injectVisualRefreshStyles() {
  if (document.getElementById(VISUAL_REFRESH_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = VISUAL_REFRESH_STYLE_ID;
  style.textContent = `
    html.visual-refresh-v3 body {
      background:
        linear-gradient(145deg, rgba(8, 123, 116, 0.14) 0 22%, transparent 42%),
        linear-gradient(245deg, rgba(207, 93, 63, 0.1) 0 18%, transparent 40%),
        linear-gradient(180deg, #f7faf8, #edf4f1 48%, #fbfaf6) !important;
    }

    html.visual-refresh-v3 .app {
      position: relative;
    }

    html.visual-refresh-v3 .app::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(8, 123, 116, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(8, 123, 116, 0.08) 1px, transparent 1px);
      background-size: 42px 42px;
      mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.34), transparent 68%);
      opacity: 0.42;
    }

    html.visual-refresh-v3 .screen {
      position: relative;
      z-index: 1;
    }

    html.visual-refresh-v3 .product-v2 .top {
      min-height: 196px;
      background:
        linear-gradient(135deg, #123b36 0%, #0a7d6f 56%, #d66a4c 142%) !important;
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.2) inset,
        0 30px 74px rgba(18, 29, 27, 0.2);
    }

    html.visual-refresh-v3 .product-v2 .top::before {
      background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.18), transparent 44%),
        repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.12) 0 1px, transparent 1px 20px);
      opacity: 0.48;
    }

    html.visual-refresh-v3 .panel,
    html.visual-refresh-v3 .event-row,
    html.visual-refresh-v3 .expense-row,
    html.visual-refresh-v3 .group-row,
    html.visual-refresh-v3 .transfer-row,
    html.visual-refresh-v3 .balance-row,
    html.visual-refresh-v3 .summary-strip {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(250, 252, 250, 0.9)),
        #fffefd;
      border-color: rgba(18, 29, 27, 0.08) !important;
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.92) inset,
        0 18px 42px rgba(18, 29, 27, 0.11) !important;
    }

    html.visual-refresh-v3 .primary-button,
    html.visual-refresh-v3 .secondary-button,
    html.visual-refresh-v3 .icon-button {
      position: relative;
      overflow: hidden;
    }

    html.visual-refresh-v3 .primary-button::after {
      content: "";
      position: absolute;
      inset: 1px;
      border-radius: inherit;
      pointer-events: none;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.24), transparent 48%);
    }

    html.visual-refresh-v3 .secondary-button,
    html.visual-refresh-v3 .icon-button {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 248, 0.9)) !important;
      border-color: rgba(18, 29, 27, 0.1) !important;
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.88) inset,
        0 8px 18px rgba(18, 29, 27, 0.06);
    }

    html.visual-refresh-v3 .expense-modal,
    html.visual-refresh-v3 .event-modal {
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.94) inset,
        0 36px 90px rgba(18, 29, 27, 0.24) !important;
    }

    html.visual-refresh-v3 .expense-guest-box {
      margin-top: 18px;
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid rgba(8, 123, 116, 0.14);
      border-radius: 8px;
      background:
        linear-gradient(135deg, rgba(8, 123, 116, 0.08), rgba(207, 93, 63, 0.06)),
        rgba(255, 255, 255, 0.72);
    }
  `;
  document.head.append(style);
}
