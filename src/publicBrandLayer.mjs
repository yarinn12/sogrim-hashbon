const STYLE_ID = "public-brand-layer-style";
const APP_NAME = "סוגרים חשבון";
const APP_TAGLINE = "חובות בין חברים, בלי כאב ראש";

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
      ${renderHeaderNav()}
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

function renderHeaderNav() {
  return `
    <nav class="product-app-nav" aria-label="main">
      <button class="product-nav-button" data-action="edit-profile" type="button">
        <svg viewBox="0 0 24 24" focusable="false"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/></svg>
        <span>&#1508;&#1512;&#1493;&#1508;&#1497;&#1500;</span>
      </button>
      <button class="product-nav-button" data-action="join-event-screen" type="button">
        <svg viewBox="0 0 24 24" focusable="false"><path d="M12 5v14"/><path d="M5 12h14"/><path d="M4.8 5.8h4.4v4.4H4.8z"/><path d="M14.8 13.8h4.4v4.4h-4.4z"/></svg>
        <span>&#1492;&#1510;&#1496;&#1512;&#1508;&#1493;&#1514;</span>
      </button>
      <button class="product-nav-button" data-action="groups" type="button">
        <svg viewBox="0 0 24 24" focusable="false"><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M16.5 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M3.5 20a4.8 4.8 0 0 1 9 0"/><path d="M13.5 18.5a4 4 0 0 1 7 0"/></svg>
        <span>&#1511;&#1489;&#1493;&#1510;&#1493;&#1514;</span>
      </button>
    </nav>
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
  const eventSection =
    screen.querySelector(".event-list")?.closest(".section") ??
    screen.querySelector(".home-empty-events");
  const advancedEventFilter = screen.querySelector(".advanced-event-filter");
  const contextBar = screen.querySelector(".product-context-bar");
  const profilePanel = screen.querySelector(".profile-panel");
  const quickGuide = screen.querySelector(".product-home-kicker");
  const groupsAction = screen.querySelector('.hero-actions [data-action="groups"]');

  screen.classList.toggle("product-empty-home", shouldSimplify);
  syncHomeHeroArtwork(screen, shouldSimplify);
  if (!shouldSimplify) syncEmptyEventIllustration(eventSection, false);
  setHidden(dashboard, shouldSimplify);
  setHidden(personalActions, shouldSimplify);
  setSuppressed(advancedEventFilter, shouldSimplify);
  setSuppressed(contextBar, shouldSimplify);
  setSuppressed(profilePanel, shouldSimplify);
  setSuppressed(quickGuide, shouldSimplify);
  setSuppressed(groupsAction, shouldSimplify);
  if (eventSection) eventSection.classList.toggle("home-empty-events", shouldSimplify);

  screen.querySelectorAll('[data-action="event-status-filter"]').forEach((button) => {
    setHidden(button, shouldSimplify);
  });

  if (!shouldSimplify || !eventSection) return;

  const eventCopy = eventSection.querySelector(".section-title-row .muted");
  setTextIfChanged(eventCopy, "פתח אירוע או הצטרף לקישור שקיבלת.");

  const emptyState = eventSection.querySelector(".empty-state");
  setTextIfChanged(emptyState, "אין אירועים שלך עדיין");
  syncEmptyEventIllustration(eventSection, true);

  eventSection.querySelectorAll(".empty-state").forEach((node, index) => {
    setSuppressed(node, index > 0);
  });
}

function syncHomeHeroArtwork(screen, shouldShow) {
  const top = screen.querySelector(":scope > .top");
  const existing = top?.querySelector(".product-home-artwork");

  if (!top) return;

  if (!shouldShow) {
    existing?.remove();
    return;
  }

  if (existing) return;
  top.insertAdjacentHTML("beforeend", renderHomeArtwork());
}

function syncEmptyEventIllustration(eventSection, shouldShow) {
  const emptyState = eventSection?.querySelector(".empty-state");
  const existing = emptyState?.querySelector(".product-empty-icon");

  if (!emptyState) return;

  if (!shouldShow) {
    existing?.remove();
    return;
  }

  if (existing) return;
  emptyState.insertAdjacentHTML("afterbegin", renderEmptyEventArtwork());
}

function renderHomeArtwork() {
  return `
    <aside class="product-home-artwork" aria-hidden="true">
      <svg viewBox="0 0 260 220" focusable="false">
        <defs>
          <linearGradient id="home-art-green" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="#0f8b7e" />
            <stop offset="1" stop-color="#06413d" />
          </linearGradient>
          <linearGradient id="home-art-gold" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="#ffe7a8" />
            <stop offset="1" stop-color="#c58a28" />
          </linearGradient>
        </defs>
        <path class="home-art-loop" d="M34 98c30-48 74-48 96 0 22 48 66 48 96 0" />
        <circle class="home-art-orbit" cx="208" cy="54" r="8" />
        <circle class="home-art-face" cx="84" cy="76" r="24" />
        <path class="home-art-smile" d="M74 78c7 8 14 8 21 0" />
        <path class="home-art-body" d="M52 162c8-42 18-62 33-62 18 0 38 22 53 62" />
        <circle class="home-art-coin" cx="168" cy="132" r="42" />
        <path class="home-art-shekel" d="M159 110v44m0-32h18c10 0 15 5 15 14v18m-33-18h-13" />
        <path class="home-art-hand" d="M91 151c28 21 54 25 86 8 13-7 22-7 29-1" />
      </svg>
    </aside>
  `;
}

function renderEmptyEventArtwork() {
  return `
    <span class="product-empty-icon" aria-hidden="true">
      <svg viewBox="0 0 74 62" focusable="false">
        <rect x="14" y="13" width="46" height="38" rx="7" />
        <path d="M14 25h46" />
        <path d="M25 9v10M49 9v10" />
        <path d="M27 35h6M41 35h6M27 44h6M41 44h6" />
        <path class="empty-icon-spark" d="M8 18l5-5M7 40l6 3M63 14l5-5" />
      </svg>
    </span>
  `;
}

function setHidden(node, value) {
  if (!node || node.hidden === value) return;
  node.hidden = value;
}

function setSuppressed(node, value) {
  if (!node) return;
  setHidden(node, value);

  if (value) {
    node.style.setProperty("display", "none", "important");
    return;
  }

  node.style.removeProperty("display");
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

    .product-app-nav {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-inline-start: auto;
      min-width: 0;
    }

    .product-nav-button {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 12px;
      border: 1px solid rgba(18, 29, 27, 0.1);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.76);
      color: #20302d;
      box-shadow: 0 8px 22px rgba(18, 29, 27, 0.06);
      font: inherit;
      font-size: 0.86rem;
      font-weight: 850;
      cursor: pointer;
      white-space: nowrap;
      transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
    }

    .product-nav-button svg {
      width: 17px;
      height: 17px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .product-nav-button:hover {
      transform: translateY(-1px);
      border-color: rgba(8, 123, 116, 0.22);
      background: #fff;
      box-shadow: 0 12px 28px rgba(18, 29, 27, 0.09);
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

    .product-home-artwork {
      position: absolute;
      inset-inline-start: clamp(14px, 3vw, 38px);
      bottom: -18px;
      width: min(28vw, 250px);
      min-width: 170px;
      pointer-events: none;
      opacity: 0.98;
      filter: drop-shadow(0 26px 44px rgba(0, 0, 0, 0.22));
    }

    .product-home-artwork svg {
      width: 100%;
      height: auto;
      display: block;
      overflow: visible;
    }

    .home-art-loop {
      fill: none;
      stroke: rgba(255, 224, 163, 0.8);
      stroke-width: 10;
      stroke-linecap: round;
    }

    .home-art-orbit {
      fill: #ffe0a3;
    }

    .home-art-face {
      fill: #f2c888;
      stroke: rgba(255, 255, 255, 0.72);
      stroke-width: 3;
    }

    .home-art-smile,
    .home-art-shekel,
    .home-art-hand {
      fill: none;
      stroke: #fffdf8;
      stroke-width: 7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .home-art-body {
      fill: url(#home-art-green);
      stroke: rgba(255, 255, 255, 0.24);
      stroke-width: 3;
    }

    .home-art-coin {
      fill: url(#home-art-gold);
      stroke: rgba(255, 255, 255, 0.72);
      stroke-width: 5;
    }

    .home-art-shekel {
      stroke: #07574e;
      stroke-width: 8;
    }

    .home-art-hand {
      stroke-width: 9;
    }

    .product-empty-icon {
      width: 74px;
      height: 62px;
      display: inline-grid;
      place-items: center;
      margin-bottom: 10px;
      color: #6b7974;
      opacity: 0.9;
    }

    .product-empty-icon svg {
      width: 74px;
      height: 62px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .product-empty-icon rect {
      fill: rgba(255, 255, 255, 0.74);
    }

    .empty-icon-spark {
      stroke: rgba(8, 123, 116, 0.42);
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

    html.product-v1 .screen.product-empty-home,
    html.product-v1-live .screen.product-empty-home {
      max-width: 1080px !important;
      gap: 18px !important;
    }

    html.product-v1 .screen.product-empty-home .product-app-identity,
    html.product-v1-live .screen.product-empty-home .product-app-identity {
      margin: 0 0 10px !important;
      padding: 4px 2px !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }

    html.product-v1 .screen.product-empty-home .product-app-identity .product-brand-mark,
    html.product-v1-live .screen.product-empty-home .product-app-identity .product-brand-mark {
      width: 60px !important;
      height: 60px !important;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.26),
        0 18px 34px rgba(8, 123, 116, 0.2) !important;
    }

    html.product-v1 .screen.product-empty-home .product-app-identity .product-brand-copy strong,
    html.product-v1-live .screen.product-empty-home .product-app-identity .product-brand-copy strong {
      font-size: clamp(30px, 3.2vw, 42px) !important;
      letter-spacing: 0 !important;
    }

      html.product-v1 .screen.product-empty-home > .top,
      html.product-v1-live .screen.product-empty-home > .top {
      position: relative !important;
      min-height: clamp(260px, 34vw, 350px) !important;
      display: grid !important;
      place-items: center !important;
      padding: clamp(30px, 5vw, 54px) clamp(26px, 5vw, 60px) !important;
      text-align: center !important;
      overflow: hidden !important;
      border: 1px solid rgba(255, 255, 255, 0.18) !important;
      border-radius: 8px !important;
      background:
        linear-gradient(120deg, rgba(255, 224, 163, 0.18), transparent 34%),
        linear-gradient(145deg, #061d1b 0%, #083d38 45%, #076b64 100%) !important;
      box-shadow:
        0 34px 70px rgba(8, 35, 32, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.16) !important;
    }

    html.product-v1 .screen.product-empty-home > .top::before,
    html.product-v1-live .screen.product-empty-home > .top::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
      background-size: 64px 64px;
      mask-image: linear-gradient(90deg, transparent 0%, black 22%, black 100%);
      opacity: 0.56;
    }

    html.product-v1 .screen.product-empty-home > .top::after,
    html.product-v1-live .screen.product-empty-home > .top::after {
      content: "";
      position: absolute;
      inset-inline: 36px;
      bottom: 0;
      height: 4px;
      pointer-events: none;
      background: linear-gradient(90deg, #087b74, #f2cf8f, #cf6a45);
      border-radius: 8px 8px 0 0;
    }

    html.product-v1 .screen.product-empty-home > .top .brand,
    html.product-v1-live .screen.product-empty-home > .top .brand {
      position: relative !important;
      z-index: 1 !important;
      max-width: 780px !important;
      margin: 0 auto !important;
      padding-inline: clamp(0px, 17vw, 150px) !important;
    }

    html.product-v1 .screen.product-empty-home > .top .eyebrow,
    html.product-v1-live .screen.product-empty-home > .top .eyebrow {
      color: #ffe0a3 !important;
      font-size: 0.88rem !important;
      font-weight: 900 !important;
    }

    html.product-v1 .screen.product-empty-home > .top h1,
    html.product-v1-live .screen.product-empty-home > .top h1 {
      max-width: 760px !important;
      color: #fffdf8 !important;
      font-size: clamp(38px, 6vw, 70px) !important;
      line-height: 0.98 !important;
      text-wrap: balance;
      text-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
    }

    html.product-v1 .screen.product-empty-home > .top .muted,
    html.product-v1-live .screen.product-empty-home > .top .muted {
      color: rgba(255, 255, 255, 0.78) !important;
      font-size: clamp(1rem, 1.8vw, 1.18rem) !important;
      font-weight: 800 !important;
    }

    html.product-v1 .screen.product-empty-home .hero-actions,
    html.product-v1-live .screen.product-empty-home .hero-actions {
      position: relative !important;
      z-index: 2 !important;
      width: min(620px, calc(100% - 36px)) !important;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 14px !important;
      margin: -72px auto 22px !important;
      padding: 0 !important;
    }

    html.product-v1 .screen.product-empty-home .hero-actions button,
    html.product-v1-live .screen.product-empty-home .hero-actions button {
      min-height: 72px !important;
      border-radius: 8px !important;
      font-size: 1.05rem !important;
      font-weight: 950 !important;
      box-shadow: 0 18px 44px rgba(8, 35, 32, 0.14) !important;
      transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease !important;
    }

    html.product-v1 .screen.product-empty-home .hero-actions button:hover,
    html.product-v1-live .screen.product-empty-home .hero-actions button:hover {
      transform: translateY(-2px);
      box-shadow: 0 24px 56px rgba(8, 35, 32, 0.18) !important;
    }

    html.product-v1 .screen.product-empty-home .home-empty-events,
    html.product-v1-live .screen.product-empty-home .home-empty-events {
      margin: 0 auto !important;
      width: min(680px, 100%) !important;
      background: rgba(255, 254, 250, 0.72) !important;
      border: 1px dashed rgba(8, 123, 116, 0.2) !important;
      border-radius: 8px !important;
      box-shadow: none !important;
    }

    html.product-v1 .screen.product-empty-home .home-empty-events .section-title-row,
    html.product-v1-live .screen.product-empty-home .home-empty-events .section-title-row {
      display: none !important;
    }

    html.product-v1 .screen.product-empty-home .home-empty-events .empty-state,
    html.product-v1-live .screen.product-empty-home .home-empty-events .empty-state {
      min-height: 154px !important;
      display: grid !important;
      place-items: center !important;
      border: 0 !important;
      background: transparent !important;
      color: #43524e !important;
      font-weight: 900 !important;
    }

    @media (max-width: 700px) {
      html.product-v1 .screen.product-empty-home > .top,
      html.product-v1-live .screen.product-empty-home > .top {
        min-height: 260px !important;
        padding: 26px 22px !important;
      }

      .product-app-nav {
        width: 100%;
        justify-content: space-between;
        order: 2;
      }

      .product-nav-button {
        flex: 1 1 0;
        min-width: 0;
        padding-inline: 8px;
      }

      .product-home-artwork {
        width: 156px;
        min-width: 0;
        bottom: -10px;
        opacity: 0.36;
      }

      html.product-v1 .screen.product-empty-home > .top .brand,
      html.product-v1-live .screen.product-empty-home > .top .brand {
        padding-inline: 0 !important;
      }

      html.product-v1 .screen.product-empty-home .hero-actions,
      html.product-v1-live .screen.product-empty-home .hero-actions {
        width: 100% !important;
        grid-template-columns: 1fr !important;
        margin: -28px auto 16px !important;
      }

      html.product-v1 .screen.product-empty-home .hero-actions button,
      html.product-v1-live .screen.product-empty-home .hero-actions button {
        min-height: 64px !important;
      }
    }
  `;
  document.head.append(style);
}
