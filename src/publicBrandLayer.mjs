const STYLE_ID = "public-brand-layer-style";
const APP_NAME = "\u05e1\u05d5\u05d2\u05e8\u05d9\u05dd \u05d7\u05e9\u05d1\u05d5\u05df";
const APP_TAGLINE = "\u05d7\u05d5\u05d1\u05d5\u05ea \u05d1\u05d9\u05df \u05d7\u05d1\u05e8\u05d9\u05dd, \u05d1\u05dc\u05d9 \u05db\u05d0\u05d1 \u05e8\u05d0\u05e9";

injectBrandStyle();
enhanceBranding();
watchBranding();

let scheduledBranding = false;

function watchBranding() {
  if (!document.body) return;

  new MutationObserver(scheduleBranding).observe(document.body, {
    childList: true,
    subtree: true
  });
}

function scheduleBranding() {
  if (scheduledBranding) return;
  scheduledBranding = true;

  requestAnimationFrame(() => {
    scheduledBranding = false;
    enhanceBranding();
  });
}

function enhanceBranding() {
  enhanceAppScreenBrand();
  enhanceProfileGateBrand();
  simplifyEmptyHome();
}

function enhanceAppScreenBrand() {
  const screen = document.querySelector("#app .screen");
  if (!screen || hasDirectChild(screen, "product-app-identity")) return;

  const html = `
    <header class="product-app-identity" aria-label="${APP_NAME}">
      ${renderBrandLockup("product-app-lockup")}
    </header>
  `;

  const top = screen.querySelector(".top");
  if (top) {
    top.insertAdjacentHTML("beforebegin", html);
    return;
  }

  screen.insertAdjacentHTML("afterbegin", html);
}

function enhanceProfileGateBrand() {
  const hero = document.querySelector(".public-profile-hero");
  if (!hero || hero.querySelector(".product-gate-brand")) return;

  const legacyEyebrow = hero.querySelector(":scope > .eyebrow");
  if (legacyEyebrow?.textContent?.trim() === APP_NAME) {
    legacyEyebrow.remove();
  }

  hero.insertAdjacentHTML("afterbegin", renderBrandLockup("product-gate-brand"));
}

function renderBrandLockup(extraClass = "") {
  return `
    <div class="product-brand-lockup ${extraClass}">
      ${renderBrandMark()}
      <span class="product-brand-copy">
        <strong>${APP_NAME}</strong>
        <small>${APP_TAGLINE}</small>
      </span>
    </div>
  `;
}

function renderBrandMark() {
  return `
    <span class="product-brand-mark" aria-hidden="true">
      <svg class="product-brand-symbol" viewBox="0 0 64 64" focusable="false">
        <rect class="brand-symbol-panel" x="12" y="10" width="40" height="44" rx="14" />
        <path class="brand-symbol-flow" d="M22 25h18.5c4.1 0 7.5 3.3 7.5 7.4s-3.4 7.4-7.5 7.4H25" />
        <path class="brand-symbol-return" d="M29 19 22 25l7 6" />
        <path class="brand-symbol-check" d="m24 39 6 6 13-16" />
        <circle class="brand-symbol-dot" cx="47" cy="18" r="4" />
      </svg>
    </span>
  `;
}

function hasDirectChild(parent, className) {
  return Array.from(parent.children).some((child) => child.classList.contains(className));
}

function simplifyEmptyHome() {
  const screen = document.querySelector("#app .screen");
  if (!screen || !screen.querySelector('[data-action="new-event"]')) return;

  const hasEventRows = Boolean(screen.querySelector(".event-row"));
  const shouldSimplify = !hasEventRows;
  const dashboard = screen.querySelector(".personal-dashboard");
  const personalActions = screen.querySelector(".personal-actions-section, .public-personal-actions");
  const eventSection = screen.querySelector(".event-list")?.closest(".section");

  setHidden(dashboard, shouldSimplify);
  setHidden(personalActions, shouldSimplify);
  if (eventSection) eventSection.classList.toggle("home-empty-events", shouldSimplify);

  screen.querySelectorAll('[data-action="event-status-filter"]').forEach((button) => {
    setHidden(button, shouldSimplify);
  });

  if (!shouldSimplify || !eventSection) return;

  const eventCopy = eventSection.querySelector(".section-title-row .muted");
  setTextIfChanged(eventCopy, "\u05e4\u05ea\u05d7 \u05d0\u05d9\u05e8\u05d5\u05e2 \u05d0\u05d5 \u05d4\u05e6\u05d8\u05e8\u05e3 \u05dc\u05e7\u05d9\u05e9\u05d5\u05e8 \u05e9\u05e7\u05d9\u05d1\u05dc\u05ea.");

  const emptyState = eventSection.querySelector(".empty-state");
  setTextIfChanged(emptyState, "\u05d0\u05d9\u05df \u05d0\u05d9\u05e8\u05d5\u05e2\u05d9\u05dd \u05e9\u05dc\u05da \u05e2\u05d3\u05d9\u05d9\u05df");
}

function setHidden(node, value) {
  if (!node || node.hidden === value) return;
  node.hidden = value;
}

function setTextIfChanged(node, text) {
  if (!node || node.textContent === text) return;
  node.textContent = text;
}

function injectBrandStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .product-brand-lockup,
    .product-app-identity {
      display: flex;
      align-items: center;
    }

    .product-brand-lockup {
      gap: 12px;
      min-width: 0;
    }

    .product-brand-mark {
      position: relative;
      width: 54px;
      height: 54px;
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
      overflow: hidden;
      border-radius: 8px;
      background:
        radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.28), transparent 36%),
        linear-gradient(145deg, #082f2b 0%, #087b74 56%, #0d9488 132%);
      color: #fffdf8;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        0 16px 30px rgba(8, 123, 116, 0.22);
      font-size: 30px;
      font-weight: 950;
      line-height: 1;
    }

    .product-brand-mark::after {
      content: none;
    }

    .product-brand-symbol {
      position: relative;
      z-index: 1;
      width: 34px;
      height: 34px;
      display: block;
      overflow: visible;
    }

    .brand-symbol-panel {
      fill: rgba(255, 255, 255, 0.13);
      stroke: rgba(255, 255, 255, 0.26);
      stroke-width: 1.5;
    }

    .brand-symbol-flow,
    .brand-symbol-return,
    .brand-symbol-check {
      fill: none;
      stroke: currentColor;
      stroke-width: 4.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .brand-symbol-return,
    .brand-symbol-check {
      stroke-width: 4.8;
    }

    .brand-symbol-dot {
      fill: #ffe0a3;
      stroke: rgba(255, 255, 255, 0.72);
      stroke-width: 1.4;
    }

    .product-brand-copy {
      display: grid;
      gap: 2px;
      min-width: 0;
      line-height: 1.08;
    }

    .product-brand-copy strong {
      display: block;
      color: #121d1b;
      font-size: clamp(26px, 4vw, 40px);
      font-weight: 950;
      letter-spacing: 0;
      white-space: nowrap;
    }

    .product-brand-copy small {
      color: #63756f;
      font-size: 0.94rem;
      font-weight: 850;
      white-space: nowrap;
    }

    .product-app-identity {
      justify-content: space-between;
      gap: 14px;
      margin: 0 0 14px;
      padding: 12px 14px;
      background: rgba(255, 254, 253, 0.88);
      border: 1px solid rgba(18, 29, 27, 0.08);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(18, 29, 27, 0.08);
      backdrop-filter: blur(14px);
    }

    .product-app-badge {
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 12px;
      border: 1px solid #d7e2de;
      border-radius: 8px;
      background: #ecf7f4;
      color: #055c56;
      font-size: 0.84rem;
      font-weight: 900;
      white-space: nowrap;
    }

    .product-gate-brand {
      align-self: start;
      margin-bottom: clamp(22px, 5vw, 54px);
    }

    .product-gate-brand .product-brand-mark {
      width: 64px;
      height: 64px;
      background:
        radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.42), transparent 34%),
        linear-gradient(145deg, #fffdf8 0%, #dff3ef 58%, #d9f2ed 132%);
      color: #07574e;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.68),
        0 18px 36px rgba(0, 0, 0, 0.18);
    }

    .product-gate-brand .product-brand-symbol {
      width: 40px;
      height: 40px;
    }

    .product-gate-brand .brand-symbol-panel {
      fill: rgba(8, 123, 116, 0.08);
      stroke: rgba(8, 123, 116, 0.18);
    }

    .product-gate-brand .brand-symbol-dot {
      fill: #cf5d3f;
      stroke: #fffdf8;
    }

    .product-gate-brand .product-brand-copy strong {
      color: #fffdf8;
      font-size: clamp(34px, 5vw, 56px);
    }

    .product-gate-brand .product-brand-copy small {
      color: rgba(255, 255, 255, 0.82);
      font-size: clamp(1rem, 2vw, 1.14rem);
    }

    @media (max-width: 560px) {
      .product-app-identity {
        align-items: flex-start;
        flex-direction: column;
      }

      .product-brand-copy strong {
        font-size: 28px;
        white-space: normal;
      }

      .product-brand-copy small {
        white-space: normal;
      }

      .product-app-badge {
        align-self: stretch;
      }

      .product-gate-brand .product-brand-mark {
        width: 56px;
        height: 56px;
      }
    }

    html.product-v1,
    html.product-v1-live {
      --brand-mark-bg:
        radial-gradient(circle at 26% 20%, rgba(255, 255, 255, 0.24), transparent 34%),
        linear-gradient(145deg, #092f2b 0%, #087b74 58%, #0e9388 132%);
    }

    html.product-v1 .product-app-identity .product-brand-mark,
    html.product-v1-live .product-app-identity .product-brand-mark,
    html.product-v1 .public-profile-hero .product-brand-mark,
    html.product-v1-live .public-profile-hero .product-brand-mark {
      background: var(--brand-mark-bg) !important;
      color: #fffdf8 !important;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.24),
        0 12px 26px rgba(8, 123, 116, 0.18) !important;
    }

    html.product-v1 .product-brand-mark::after,
    html.product-v1-live .product-brand-mark::after {
      content: none !important;
      display: none !important;
    }

    html.product-v1 .screen[data-product-screen="home"] .app-back-button,
    html.product-v1-live .screen[data-product-screen="home"] .app-back-button,
    html.product-v1 .screen[data-product-screen="home"] .product-home-button,
    html.product-v1-live .screen[data-product-screen="home"] .product-home-button {
      display: none !important;
    }

    html.product-v1 .screen[data-product-screen="home"] > .top .brand,
    html.product-v1-live .screen[data-product-screen="home"] > .top .brand {
      grid-column: 1 / -1 !important;
    }
  `;
  document.head.append(style);
}
