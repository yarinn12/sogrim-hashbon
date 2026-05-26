const STYLE_ID = "public-empty-home-polish-layer-style";

injectEmptyHomePolish();
syncEmptyHomePolish();
watchEmptyHomePolish();

let emptyHomeScheduled = false;

function watchEmptyHomePolish() {
  const root = document.querySelector("#app") ?? document.body;
  if (!root) return;

  new MutationObserver(scheduleEmptyHomePolish).observe(root, {
    childList: true,
    subtree: true
  });
}

function scheduleEmptyHomePolish() {
  if (emptyHomeScheduled) return;
  emptyHomeScheduled = true;

  requestAnimationFrame(() => {
    emptyHomeScheduled = false;
    syncEmptyHomePolish();
  });
}

function syncEmptyHomePolish() {
  document.querySelectorAll("#app .screen").forEach((screen) => {
    const isHome = Boolean(screen.querySelector('[data-action="new-event"]'));
    const hasEvents = Boolean(screen.querySelector(".event-row"));
    screen.classList.toggle("product-empty-home", isHome && !hasEvents);
  });
}

function injectEmptyHomePolish() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html.product-v1 .screen.product-empty-home,
    html.product-v1-live .screen.product-empty-home {
      max-width: 1080px !important;
      gap: 18px !important;
    }

    html.product-v1 .screen.product-empty-home .product-app-identity,
    html.product-v1-live .screen.product-empty-home .product-app-identity {
      margin: 0 0 4px !important;
      padding: 4px !important;
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
      min-height: clamp(230px, 30vw, 310px) !important;
      display: flex !important;
      align-items: flex-end !important;
      padding: clamp(28px, 4.8vw, 48px) !important;
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
      max-width: 760px !important;
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
      width: min(860px, calc(100% - 36px)) !important;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 14px !important;
      margin: -42px auto 20px !important;
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
      margin-top: 0 !important;
      background: rgba(255, 254, 250, 0.8) !important;
      border: 1px dashed rgba(8, 123, 116, 0.22) !important;
      border-radius: 8px !important;
      box-shadow: none !important;
    }

    html.product-v1 .screen.product-empty-home .home-empty-events .empty-state,
    html.product-v1-live .screen.product-empty-home .home-empty-events .empty-state {
      min-height: 116px !important;
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
