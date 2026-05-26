const STYLE_ID = "public-mobile-fullscreen-modal-layer";

const CSS = `
  @media (max-width: 760px) {
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
    html.premium-visual-v1 .event-modal-backdrop {
      position: fixed !important;
      inset: 0 !important;
      z-index: 80 !important;
      display: grid !important;
      place-items: stretch !important;
      align-items: stretch !important;
      justify-items: stretch !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: rgba(17, 21, 19, 0.42) !important;
      backdrop-filter: blur(12px) !important;
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
    html.premium-visual-v1 .event-modal {
      width: 100vw !important;
      max-width: none !important;
      height: 100vh !important;
      height: 100dvh !important;
      max-height: none !important;
      margin: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      overflow-y: auto !important;
      overscroll-behavior: contain !important;
      -webkit-overflow-scrolling: touch;
      box-shadow: none !important;
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
      top: 0 !important;
      z-index: 5 !important;
      margin: -20px -20px 16px !important;
      padding: calc(14px + env(safe-area-inset-top)) 20px 14px !important;
      border-bottom: 1px solid rgba(17, 21, 19, 0.1) !important;
      background: rgba(255, 255, 255, 0.96) !important;
      backdrop-filter: blur(14px) !important;
    }

    .expense-modal .actions,
    .event-modal .actions {
      padding-bottom: max(0px, env(safe-area-inset-bottom)) !important;
    }
  }
`;

injectMobileModalStyles();

function injectMobileModalStyles() {
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(CSS));
  document.head.append(style);
}
