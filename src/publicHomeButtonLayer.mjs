const STYLE_ID = "public-home-button-layer-style";
const HOME_ACTION = "go-home";

let homeButtonScheduled = false;

injectHomeButtonStyles();
installHomeButtonLayer();

function installHomeButtonLayer() {
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
  const homeScreen = isHomeScreen(screen);

  const target =
    screen.querySelector(":scope > .product-app-identity") ??
    screen.querySelector(":scope > .top");
  if (!target) return;

  let controls = target.querySelector(":scope > .product-route-controls");
  if (!controls) {
    controls = document.createElement("div");
    controls.className = "product-route-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "\u05e0\u05d9\u05d5\u05d5\u05d8 \u05de\u05d4\u05d9\u05e8");
    target.append(controls);
  }

  const backButton = screen.querySelector('[data-action="go-back"]');
  if (backButton && backButton.parentElement !== controls) {
    controls.prepend(backButton);
  }

  screen
    .querySelectorAll(`[data-public-action="${HOME_ACTION}"]`)
    .forEach((button) => button.remove());

  let homeButton = controls.querySelector(":scope > .product-home-button");
  const hasPrimaryNavigation = Boolean(
    screen.querySelector(":scope > .product-app-identity > .product-app-nav")
  );
  if (!homeScreen && !hasPrimaryNavigation) {
    if (!homeButton) {
      homeButton = createHomeButton();
      controls.append(homeButton);
    }
  } else {
    homeButton?.remove();
    homeButton = null;
  }

  syncRouteControlState({
    backButton,
    homeButton
  });

  screen.querySelectorAll(".product-route-controls").forEach((candidate) => {
    if (candidate !== controls) candidate.remove();
  });

  syncDialogRouteControls(screen);

  const dialogOpen = Boolean(screen.querySelector('[role="dialog"][aria-modal="true"]'));
  controls.hidden = false;
  controls.dataset.currentRoute = homeScreen ? "home" : "internal";
  controls.inert = dialogOpen;
  if (dialogOpen) {
    controls.setAttribute("aria-hidden", "true");
  } else {
    controls.removeAttribute("aria-hidden");
  }
}

function isHomeScreen(screen) {
  return (
    screen.dataset.screenKind === "home" ||
    screen.dataset.productScreen === "home" ||
    screen.classList.contains("product-home-screen")
  );
}

function syncDialogRouteControls(screen) {
  const dialog = screen.querySelector('[role="dialog"][aria-modal="true"]');
  const header = dialog?.querySelector(".expense-modal-header, .event-modal-header");
  if (!dialog || !header) return;

  const legacyControls = header.querySelector(":scope > .modal-route-controls");
  const backButton =
    legacyControls?.querySelector(":scope > .modal-back-button") ??
    header.querySelector(":scope > .modal-back-button");
  if (backButton && backButton.parentElement !== header) {
    header.append(backButton);
  }
  legacyControls?.remove();
  dialog
    .querySelectorAll(`.modal-home-button, [data-public-action="${HOME_ACTION}"]`)
    .forEach((button) => button.remove());
}

function createHomeButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "product-home-button";
  button.dataset.action = "home";
  button.setAttribute("aria-label", "\u05d7\u05d6\u05e8\u05d4 \u05dc\u05de\u05e1\u05da \u05d4\u05d1\u05d9\u05ea");
  button.title = "\u05d7\u05d6\u05e8\u05d4 \u05dc\u05de\u05e1\u05da \u05d4\u05d1\u05d9\u05ea";
  button.innerHTML = `
    <span class="product-home-button-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M4.5 11.5 12 5l7.5 6.5"></path>
        <path d="M6.5 10.5v8h11v-8"></path>
        <path d="M10 18.5v-4h4v4"></path>
      </svg>
    </span>
    <span>\u05d1\u05d9\u05ea</span>
  `;
  return button;
}

function syncRouteControlState({ backButton, homeButton }) {
  if (backButton) {
    const backUnavailable = Boolean(backButton.disabled);
    backButton.setAttribute(
      "aria-label",
      backUnavailable ? "\u05d0\u05d9\u05df \u05de\u05e1\u05da \u05e7\u05d5\u05d3\u05dd" : "\u05d7\u05d6\u05e8\u05d4 \u05dc\u05de\u05e1\u05da \u05d4\u05e7\u05d5\u05d3\u05dd"
    );
    backButton.title = backUnavailable
      ? "\u05d0\u05d9\u05df \u05de\u05e1\u05da \u05e7\u05d5\u05d3\u05dd"
      : "\u05d7\u05d6\u05e8\u05d4 \u05dc\u05de\u05e1\u05da \u05d4\u05e7\u05d5\u05d3\u05dd";
  }
  if (homeButton) {
    homeButton.setAttribute("aria-label", "\u05d7\u05d6\u05e8\u05d4 \u05dc\u05de\u05e1\u05da \u05d4\u05d1\u05d9\u05ea");
    homeButton.title = "\u05d7\u05d6\u05e8\u05d4 \u05dc\u05de\u05e1\u05da \u05d4\u05d1\u05d9\u05ea";
  }
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
      width: 20px;
      height: 20px;
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
    }

    .product-home-button-icon svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .screen .top > .product-home-button {
      margin-inline-start: auto;
    }

    .product-route-controls {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-inline-start: auto;
    }

    .product-route-controls[data-current-route="home"] .product-home-button {
      color: #07574e;
      border-color: rgba(8, 123, 116, 0.34);
      background: #e5f4f1;
    }

    .product-route-controls .app-back-button:disabled,
    .product-route-controls .product-home-button:disabled {
      display: inline-flex;
      opacity: 0.42;
      cursor: default;
    }

    .modal-route-controls {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex: 0 0 auto;
    }

    .modal-route-controls .modal-home-button {
      min-width: 48px;
      min-height: 48px;
      box-shadow: none;
    }

    @media (max-width: 560px) {
      .product-app-identity .product-home-button {
        width: 44px;
      }

      .screen .top > .product-home-button {
        min-width: 92px;
      }

      .modal-route-controls .modal-home-button {
        width: 48px;
        min-width: 48px;
        height: 48px;
        padding: 0;
      }

      .modal-route-controls .modal-home-button > span:last-child {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
    }
  `;
  document.head.append(style);
}
