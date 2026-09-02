// The native iOS project supports iOS 15.0, while a few small platform APIs
// used by the application were introduced only in Safari 15.4. Install the
// narrow fallbacks before account, state and event modules are evaluated.
if (typeof Object.hasOwn !== "function") {
  Object.defineProperty(Object, "hasOwn", {
    configurable: true,
    writable: true,
    value(target, property) {
      return Object.prototype.hasOwnProperty.call(Object(target), property);
    }
  });
}

if (typeof Array.prototype.at !== "function") {
  Object.defineProperty(Array.prototype, "at", {
    configurable: true,
    writable: true,
    value(index) {
      if (this == null) throw new TypeError("Array.prototype.at called on null or undefined");
      const length = Math.min(
        Number.MAX_SAFE_INTEGER,
        Math.max(0, Math.trunc(Number(this.length) || 0))
      );
      const requested = Number(index) || 0;
      const normalized = requested < 0
        ? length + Math.trunc(requested)
        : Math.trunc(requested);
      return normalized >= 0 && normalized < length
        ? this[normalized]
        : undefined;
    }
  });
}

if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = (value) => {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  };
}

installInertFallback();
installCssHasFallback();

function installInertFallback() {
  if (
    typeof HTMLElement === "undefined" ||
    typeof document === "undefined" ||
    "inert" in HTMLElement.prototype
  ) {
    return;
  }

  const previousAriaHidden = new WeakMap();
  const synchronizeAccessibilityState = (element) => {
    if (!(element instanceof HTMLElement)) return;
    if (element.hasAttribute("inert")) {
      if (!previousAriaHidden.has(element)) {
        previousAriaHidden.set(element, element.getAttribute("aria-hidden"));
      }
      element.setAttribute("aria-hidden", "true");
      return;
    }
    if (!previousAriaHidden.has(element)) return;
    const previousValue = previousAriaHidden.get(element);
    previousAriaHidden.delete(element);
    if (previousValue === null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", previousValue);
  };

  Object.defineProperty(HTMLElement.prototype, "inert", {
    configurable: true,
    get() {
      return this.hasAttribute("inert");
    },
    set(value) {
      this.toggleAttribute("inert", Boolean(value));
      synchronizeAccessibilityState(this);
    }
  });

  const style = document.createElement("style");
  style.dataset.sogrimInertFallback = "";
  style.textContent = "[inert]{pointer-events:none!important;user-select:none!important;}";
  (document.head ?? document.documentElement).append(style);

  const blockInertInteraction = (event) => {
    const target = event.target;
    if (
      typeof Element === "undefined" ||
      !(target instanceof Element) ||
      !target.closest("[inert]")
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "focusin") target.blur?.();
  };
  ["pointerdown", "click", "keydown", "focusin"].forEach((eventName) => {
    document.addEventListener(eventName, blockInertInteraction, true);
  });

  if (typeof MutationObserver === "function") {
    const observer = new MutationObserver((records) => {
      records.forEach((record) => synchronizeAccessibilityState(record.target));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["inert"],
      subtree: true
    });
  }
  document
    .querySelectorAll("[inert]")
    .forEach((element) => synchronizeAccessibilityState(element));
}

function installCssHasFallback() {
  if (typeof document === "undefined") return;
  try {
    if (globalThis.CSS?.supports?.("selector(:has(*))")) return;
  } catch {
    // Older WebKit can reject selector() feature queries. In that case the
    // fallback is required as well.
  }

  const root = document.documentElement;
  root.classList.add("sogrim-css-has-fallback");

  const style = document.createElement("style");
  style.dataset.sogrimCssHasFallback = "";
  style.textContent = `
    html.sogrim-css-has-fallback.ledger-workspace-v1 body.sogrim-has-event-settings-route .product-app-identity > .product-app-nav,
    html.sogrim-css-has-fallback.ledger-workspace-v1 body.sogrim-has-event-primary-nav .screen > .product-app-identity > .product-app-nav,
    html.sogrim-css-has-fallback.ledger-workspace-v1 body.sogrim-has-expense-route .screen > .product-app-identity > .product-app-nav {
      display: none !important;
    }

    html.sogrim-css-has-fallback.design-coherence-v1.ledger-workspace-v1 .screen.sogrim-has-event-participant-route > .product-app-identity {
      position: relative !important;
      z-index: 120 !important;
    }

    html.sogrim-css-has-fallback body.sogrim-has-event-participant-route .event-action-dock,
    html.sogrim-css-has-fallback body.sogrim-has-participant-relationship-modal .event-action-dock {
      display: none !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 body.sogrim-has-event-participant-route .product-app-nav {
      display: grid !important;
      z-index: 130 !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1.sogrim-has-account-gate #app {
      visibility: hidden !important;
      pointer-events: none !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 .expense-row.sogrim-has-open-expense-menu,
    html.sogrim-css-has-fallback.ledger-workspace-v1 .expense-day-group.sogrim-has-open-expense-menu,
    html.sogrim-css-has-fallback.ledger-workspace-v1 .expense-ledger.sogrim-has-open-expense-menu {
      overflow: visible !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 .expense-row.sogrim-has-open-expense-menu {
      position: relative !important;
      z-index: 60 !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 .settlement-hero.sogrim-has-open-settlement-menu,
    html.sogrim-css-has-fallback.ledger-workspace-v1 .event-cover-image.sogrim-has-open-cover-menu {
      position: relative !important;
      z-index: 30 !important;
      overflow: visible !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 .participant-pill.is-account.sogrim-has-checked-input,
    html.sogrim-css-has-fallback.ledger-workspace-v1 .participant-pill.is-offline.sogrim-has-checked-input {
      border-style: solid !important;
      border-color: rgba(22, 168, 153, 0.5) !important;
      background: var(--ledger-accent-soft, #dff3ef) !important;
      box-shadow: 0 0 0 3px rgba(22, 168, 153, 0.09) !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 .new-event-participant-picker .participant-pill.sogrim-has-checked-input {
      border-color: rgba(22, 121, 91, 0.38) !important;
      background: rgba(231, 245, 240, 0.62) !important;
      box-shadow: 0 3px 12px -9px rgba(12, 75, 58, 0.44) !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 .expense-participant-row.sogrim-has-checked-input .expense-participant-row-check,
    html.sogrim-css-has-fallback.ledger-workspace-v1 .expense-participant-row.sogrim-has-checked-input .app-selection-check,
    html.sogrim-css-has-fallback.ledger-workspace-v1 .quick-item-custom-share label.sogrim-has-checked-input .app-selection-check {
      border-color: #08745d !important;
      color: #ffffff !important;
      background: #08745d !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 .expense-participant-row.sogrim-has-focus-visible-input {
      outline: 3px solid rgba(22, 168, 153, 0.18) !important;
      outline-offset: -3px !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 .new-event-selected-participant.sogrim-has-focus-visible-input {
      outline: 3px solid rgba(22, 168, 153, 0.2) !important;
      outline-offset: 2px !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 .event-share-friends .event-participant-candidate-row.sogrim-has-focus-visible-button {
      border-color: rgba(8, 116, 93, 0.42) !important;
      background: var(--ledger-surface-soft) !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 .settlement-screen.sogrim-has-ok-status .settlement-hero {
      border-color: rgba(22, 122, 75, 0.28) !important;
      background: #f4fbf7 !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 .transfer-row.sogrim-has-transfer-explanation {
      cursor: pointer !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 body #app .screen[data-event-view="summary"] .transfer-row.sogrim-has-transfer-explanation {
      position: relative !important;
      -webkit-tap-highlight-color: transparent !important;
      user-select: none !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1 .profile-identity-summary.sogrim-has-field {
      flex-direction: column !important;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1.sogrim-has-event-notes-screen {
      scrollbar-width: none;
    }

    html.sogrim-css-has-fallback.ledger-workspace-v1.sogrim-has-event-notes-screen::-webkit-scrollbar {
      width: 0;
      height: 0;
    }

    @media (max-width: 720px) {
      html.sogrim-css-has-fallback.design-coherence-v1 .screen.sogrim-has-event-participant-route > .product-app-identity {
        display: none !important;
      }
    }

    @media (max-width: 760px) {
      html.sogrim-css-has-fallback.product-studio-v3 body.sogrim-has-new-or-join-screen {
        padding-bottom: 0 !important;
      }
    }
  `;
  (document.head ?? root).append(style);

  const toggleDescendantState = (selector, className, descendantSelector) => {
    document.querySelectorAll(selector).forEach((element) => {
      element.classList.toggle(className, Boolean(element.querySelector(descendantSelector)));
    });
  };

  let updateQueued = false;
  const updateState = () => {
    updateQueued = false;
    const body = document.body;
    root.classList.toggle("sogrim-has-account-gate", Boolean(document.querySelector("#public-account-auth-gate")));
    root.classList.toggle("sogrim-has-event-notes-screen", Boolean(document.querySelector("#app .event-notes-screen")));
    if (body) {
      body.classList.toggle("sogrim-has-event-settings-route", Boolean(body.querySelector(".event-settings-route-backdrop")));
      body.classList.toggle("sogrim-has-event-primary-nav", Boolean(body.querySelector(".event-route-primary-nav")));
      body.classList.toggle("sogrim-has-event-participant-route", Boolean(body.querySelector(".event-participant-route-backdrop")));
      body.classList.toggle("sogrim-has-expense-route", Boolean(body.querySelector(".expense-route-backdrop")));
      body.classList.toggle("sogrim-has-participant-relationship-modal", Boolean(body.querySelector(".event-participant-relationship-modal")));
      body.classList.toggle("sogrim-has-new-or-join-screen", Boolean(body.querySelector('.screen[data-product-screen="new-event"], .screen[data-product-screen="join-event"]')));
    }
    toggleDescendantState(".screen", "sogrim-has-event-participant-route", ".event-participant-route-backdrop");
    toggleDescendantState(".expense-row, .expense-day-group, .expense-ledger", "sogrim-has-open-expense-menu", ".expense-row-actions-menu[open]");
    toggleDescendantState(".settlement-hero", "sogrim-has-open-settlement-menu", ".settlement-more-actions[open]");
    toggleDescendantState(".event-cover-image", "sogrim-has-open-cover-menu", ".event-cover-actions-menu[open]");
    toggleDescendantState(".participant-pill, .expense-participant-row, .quick-item-custom-share label", "sogrim-has-checked-input", "input:checked");
    toggleDescendantState(".expense-participant-row, .new-event-selected-participant", "sogrim-has-focus-visible-input", "input:focus-visible");
    toggleDescendantState(".event-share-friends .event-participant-candidate-row", "sogrim-has-focus-visible-button", "button:focus-visible");
    toggleDescendantState(".settlement-screen", "sogrim-has-ok-status", ".settlement-hero .status-chip.is-ok");
    toggleDescendantState(".transfer-row", "sogrim-has-transfer-explanation", ".transfer-explanation");
    toggleDescendantState(".profile-identity-summary", "sogrim-has-field", ".field");
  };
  const queueUpdate = () => {
    if (updateQueued) return;
    updateQueued = true;
    (globalThis.queueMicrotask ?? ((callback) => Promise.resolve().then(callback)))(updateState);
  };

  ["change", "input", "focusin", "focusout", "toggle"].forEach((eventName) => {
    document.addEventListener(eventName, queueUpdate, true);
  });
  if (typeof MutationObserver === "function") {
    const observer = new MutationObserver(queueUpdate);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["checked", "hidden", "open"],
      childList: true,
      subtree: true
    });
  }
  updateState();
}
