const STYLE_ID = "public-home-button-layer-style";
const HOME_ACTION = "go-home";

let homeButtonScheduled = false;

injectHomeButtonStyles();
installHomeButtonLayer();

function installHomeButtonLayer() {
  document.addEventListener("click", handleHomeButtonClick, true);
  new MutationObserver(scheduleHomeButtonSync).observe(document.body, {
    childList: true,
    subtree: true
  });
  scheduleHomeButtonSync();
}

function scheduleHomeButtonSync() {
  if (homeButtonScheduled) return;
  homeButtonScheduled = true;

  requestAnimationFrame(() => {
    homeButtonScheduled = false;
    syncHomeButton();
  });
}

function syncHomeButton() {
  const screen = document.querySelector("#app .screen");
  if (!screen) return;

  const target =
    screen.querySelector(".product-app-identity") ??
    screen.querySelector(".top");
  if (!target || target.querySelector(`[data-public-action="${HOME_ACTION}"]`)) return;

  target.append(createHomeButton());
}

function createHomeButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "product-home-button";
  button.dataset.publicAction = HOME_ACTION;
  button.setAttribute("aria-label", "\u05de\u05e1\u05da \u05e8\u05d0\u05e9\u05d9");
  button.title = "\u05de\u05e1\u05da \u05e8\u05d0\u05e9\u05d9";
  button.innerHTML = `
    <span class="product-home-button-icon" aria-hidden="true"></span>
    <span>\u05e8\u05d0\u05e9\u05d9</span>
  `;
  return button;
}

function handleHomeButtonClick(event) {
  const button = event.target.closest(`[data-public-action="${HOME_ACTION}"]`);
  if (!button) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  clickSyntheticHome();
}

function clickSyntheticHome() {
  const app = document.querySelector("#app");
  if (!app) return;

  const button = document.createElement("button");
  button.type = "button";
  button.hidden = true;
  button.dataset.action = "home";
  app.append(button);
  button.click();
  button.remove();
}

function injectHomeButtonStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .product-home-button {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0 14px;
      border: 1px solid rgba(8, 123, 116, 0.2);
      border-radius: 8px;
      background: #fffdf8;
      color: #07574e;
      box-shadow: 0 12px 24px rgba(18, 29, 27, 0.1);
      cursor: pointer;
      font: inherit;
      font-size: 0.92rem;
      font-weight: 900;
      white-space: nowrap;
      transition:
        transform 160ms ease,
        box-shadow 160ms ease,
        border-color 160ms ease;
    }

    .product-home-button:hover {
      transform: translateY(-1px);
      border-color: rgba(8, 123, 116, 0.36);
      box-shadow: 0 16px 30px rgba(18, 29, 27, 0.14);
    }

    .product-home-button:focus-visible {
      outline: 3px solid rgba(8, 123, 116, 0.22);
      outline-offset: 2px;
    }

    .product-home-button-icon {
      position: relative;
      width: 18px;
      height: 16px;
      display: inline-block;
      flex: 0 0 auto;
    }

    .product-home-button-icon::before {
      content: "";
      position: absolute;
      inset-inline-start: 1px;
      top: 4px;
      width: 16px;
      height: 12px;
      border: 2px solid currentColor;
      border-top: 0;
      border-radius: 0 0 4px 4px;
    }

    .product-home-button-icon::after {
      content: "";
      position: absolute;
      inset-inline-start: 4px;
      top: 0;
      width: 10px;
      height: 10px;
      border-inline-start: 2px solid currentColor;
      border-top: 2px solid currentColor;
      transform: rotate(45deg);
      border-radius: 2px 0 0 0;
    }

    .screen .top > .product-home-button {
      margin-inline-start: auto;
    }

    @media (max-width: 560px) {
      .product-app-identity .product-home-button {
        width: 100%;
      }

      .screen .top > .product-home-button {
        min-width: 92px;
      }
    }
  `;
  document.head.append(style);
}
