const STYLE_ID = "public-brand-layer-style";
const APP_NAME = "סוגרים חשבון";
const APP_TAGLINE = "התחשבנות חכמה לחברים";

injectBrandStyle();
enhanceBranding();
watchBranding();

function watchBranding() {
  if (!document.body) return;

  new MutationObserver(() => enhanceBranding()).observe(document.body, {
    childList: true,
    subtree: true
  });
}

function enhanceBranding() {
  enhanceAppScreenBrand();
  enhanceProfileGateBrand();
}

function enhanceAppScreenBrand() {
  const screen = document.querySelector("#app .screen");
  if (!screen || hasDirectChild(screen, "product-app-identity")) return;

  const html = `
    <header class="product-app-identity" aria-label="${APP_NAME}">
      ${renderBrandLockup("product-app-lockup")}
      <span class="product-app-badge">בטא ציבורית</span>
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
      <span class="product-brand-mark" aria-hidden="true"><span>₪</span></span>
      <span class="product-brand-copy">
        <strong>${APP_NAME}</strong>
        <small>${APP_TAGLINE}</small>
      </span>
    </div>
  `;
}

function hasDirectChild(parent, className) {
  return Array.from(parent.children).some((child) => child.classList.contains(className));
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
        radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.36), transparent 34%),
        linear-gradient(145deg, #087b74 0%, #07574e 55%, #cf5d3f 132%);
      color: #fffdf8;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        0 16px 30px rgba(8, 123, 116, 0.28);
      font-size: 30px;
      font-weight: 950;
      line-height: 1;
    }

    .product-brand-mark::after {
      content: "";
      position: absolute;
      inset-inline-end: -2px;
      bottom: -2px;
      width: 21px;
      height: 21px;
      border: 3px solid #fffdf8;
      border-radius: 50%;
      background: #fff0bf;
      box-shadow: 0 5px 12px rgba(18, 29, 27, 0.18);
    }

    .product-brand-mark span {
      position: relative;
      z-index: 1;
      transform: translateY(-1px);
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
        linear-gradient(145deg, #fffdf8 0%, #dff3ef 62%, #fff0bf 132%);
      color: #07574e;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.68),
        0 18px 36px rgba(0, 0, 0, 0.18);
    }

    .product-gate-brand .product-brand-mark::after {
      background: #cf5d3f;
      border-color: #fffdf8;
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
  `;
  document.head.append(style);
}
