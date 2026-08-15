import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  loadAccessibilityPreferences,
  saveAccessibilityPreferences
} from "./data/accessibilityPreferences.mjs";
import { iconSvg } from "./uiIcons.mjs";

const STYLE_ID = "public-accessibility-layer-style";
const ENTRY_SELECTOR = "[data-open-accessibility]";
const BACKDROP_SELECTOR = ".accessibility-center-backdrop";
const HISTORY_KEY = "settleFriendsAccessibilityCenter";
const NATIVE_BACK_EVENT = "settle-friends:native-back";
const CENTER_CHANGED_EVENT = "settle-friends:accessibility-center-changed";
const MANUAL_TEXT_CLASS = "dynamic-type-preview";
const TEXT_SIZE_PIXELS = Object.freeze({
  large: 18,
  "extra-large": 20
});

let preferences = loadAccessibilityPreferences();
let returnFocus = null;
let backgroundState = [];
let historyActive = false;
let historyClosing = false;
let enhancementScheduled = false;

applyAccessibilityPreferences(preferences);
injectAccessibilityStyles();
enhanceAccessibilityEntryPoints();
watchAccessibilityEntryPoints();

document.addEventListener("click", handleAccessibilityClick, true);
document.addEventListener("change", handleAccessibilityChange, true);
document.addEventListener("keydown", handleAccessibilityKeydown, true);
document.addEventListener("settle-friends:screen-rendered", scheduleEnhancement);
window.addEventListener("popstate", handleAccessibilityHistoryBack, true);
window.addEventListener(NATIVE_BACK_EVENT, handleAccessibilityNativeBack, true);
window.addEventListener("pageshow", reloadAccessibilityPreferences);
window.addEventListener("storage", handleAccessibilityStorageChange);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) reloadAccessibilityPreferences();
});

function reloadAccessibilityPreferences() {
  applyAccessibilityPreferences(loadAccessibilityPreferences());
}

function handleAccessibilityStorageChange(event) {
  if (event.key !== "settle-friends-accessibility-preferences-v1") return;
  reloadAccessibilityPreferences();
  syncAccessibilityControls();
}

function watchAccessibilityEntryPoints() {
  if (!document.body) return;
  new MutationObserver(scheduleEnhancement).observe(document.body, {
    childList: true,
    subtree: true
  });
}

function scheduleEnhancement() {
  if (enhancementScheduled) return;
  enhancementScheduled = true;
  requestAnimationFrame(() => {
    enhancementScheduled = false;
    enhanceAccessibilityEntryPoints();
  });
}

function enhanceAccessibilityEntryPoints() {
  document.querySelectorAll(".product-app-identity").forEach((identity) => {
    const lockup = identity.querySelector(":scope > .product-brand-lockup");
    const routeControls = identity.querySelector(":scope > .product-route-controls");
    if (!lockup) return;

    let entry = identity.querySelector(ENTRY_SELECTOR);
    if (!entry) {
      lockup.insertAdjacentHTML("beforeend", renderAccessibilityButton());
      entry = identity.querySelector(ENTRY_SELECTOR);
    }
    if (routeControls && entry?.parentElement !== routeControls) {
      routeControls.append(entry);
    }
  });

  document
    .querySelectorAll(
      "#public-account-auth-gate .account-auth-shell, .public-profile-gate .public-profile-modal"
    )
    .forEach((surface) => {
      if (surface.querySelector(`:scope > ${ENTRY_SELECTOR}`)) return;
      surface.insertAdjacentHTML("afterbegin", renderAccessibilityButton("auth"));
    });
}

function renderAccessibilityButton(context = "header") {
  return `
    <button
      class="accessibility-entry-button accessibility-entry-${context}"
      data-open-accessibility
      type="button"
      aria-label="פתיחת הגדרות נגישות"
      title="נגישות"
    >
      ${iconSvg("accessibility")}
    </button>
  `;
}

function handleAccessibilityClick(event) {
  const entry = event.target.closest(ENTRY_SELECTOR);
  if (entry) {
    event.preventDefault();
    openAccessibilityCenter(entry);
    return;
  }

  if (event.target.closest("[data-close-accessibility]")) {
    event.preventDefault();
    closeAccessibilityCenter();
    return;
  }

  if (event.target.closest("[data-reset-accessibility]")) {
    event.preventDefault();
    preferences = saveAccessibilityPreferences(
      DEFAULT_ACCESSIBILITY_PREFERENCES
    );
    applyAccessibilityPreferences(preferences);
    syncAccessibilityControls();
    announceAccessibilityUpdate("הגדרות הנגישות חזרו לברירת המחדל");
    return;
  }

  const backdrop = event.target.closest(BACKDROP_SELECTOR);
  if (backdrop && event.target === backdrop) closeAccessibilityCenter();
}

function handleAccessibilityChange(event) {
  const control = event.target.closest(
    "[data-accessibility-text-size], [data-accessibility-contrast], [data-accessibility-motion]"
  );
  if (!control) return;

  if (control.matches("[data-accessibility-text-size]")) {
    preferences = saveAccessibilityPreferences({
      ...preferences,
      textSize: control.value
    });
    announceAccessibilityUpdate("גודל הטקסט עודכן");
  } else if (control.matches("[data-accessibility-contrast]")) {
    preferences = saveAccessibilityPreferences({
      ...preferences,
      highContrast: control.checked
    });
    announceAccessibilityUpdate(
      control.checked ? "ניגודיות גבוהה הופעלה" : "ניגודיות גבוהה בוטלה"
    );
  } else {
    preferences = saveAccessibilityPreferences({
      ...preferences,
      reduceMotion: control.checked
    });
    announceAccessibilityUpdate(
      control.checked ? "הפחתת תנועה הופעלה" : "הפחתת תנועה בוטלה"
    );
  }

  applyAccessibilityPreferences(preferences);
  syncAccessibilityControls();
}

function openAccessibilityCenter(trigger = document.activeElement) {
  if (document.querySelector(BACKDROP_SELECTOR)) return;
  returnFocus = trigger instanceof HTMLElement ? trigger : null;

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div class="accessibility-center-backdrop">
        <section
          class="accessibility-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="accessibility-center-title"
          aria-describedby="accessibility-center-description"
          tabindex="-1"
        >
          <header class="accessibility-center-header">
            <div>
              <p class="accessibility-center-eyebrow">תצוגה נוחה יותר</p>
              <h2 id="accessibility-center-title">נגישות</h2>
              <p id="accessibility-center-description">
                בחרו את ההעדפות שנוחות לכם במכשיר הזה.
              </p>
            </div>
            <button
              class="accessibility-close-button"
              data-close-accessibility
              type="button"
              aria-label="סגירת הגדרות נגישות"
              title="סגור"
            >${iconSvg("x")}</button>
          </header>

          <div class="accessibility-center-content">
            <fieldset class="accessibility-text-size-control">
              <legend>גודל טקסט</legend>
              <p>ברירת המחדל מתאימה את הטקסט להגדרת המכשיר.</p>
              <div class="accessibility-segmented-control">
                ${renderTextSizeOption("system", "לפי המכשיר")}
                ${renderTextSizeOption("large", "גדול")}
                ${renderTextSizeOption("extra-large", "גדול מאוד")}
              </div>
            </fieldset>

            <label class="accessibility-setting-row">
              <span>
                <strong>ניגודיות גבוהה</strong>
                <small>מחזקת טקסט, גבולות וכפתורים.</small>
              </span>
              <input
                data-accessibility-contrast
                type="checkbox"
                role="switch"
                aria-label="ניגודיות גבוהה"
              />
              <span class="accessibility-switch" aria-hidden="true"></span>
            </label>

            <label class="accessibility-setting-row">
              <span>
                <strong>הפחתת תנועה</strong>
                <small>מצמצמת אנימציות ומעברים.</small>
              </span>
              <input
                data-accessibility-motion
                type="checkbox"
                role="switch"
                aria-label="הפחתת תנועה"
              />
              <span class="accessibility-switch" aria-hidden="true"></span>
            </label>

            <a class="accessibility-statement-link" href="./accessibility.html">
              <span>
                <strong>הצהרת נגישות</strong>
                <small>מידע, התאמות ויצירת קשר.</small>
              </span>
              <span aria-hidden="true">${iconSvg("chevron-left")}</span>
            </a>
          </div>

          <footer class="accessibility-center-footer">
            <button class="accessibility-reset-button" data-reset-accessibility type="button">
              איפוס הגדרות
            </button>
            <button class="accessibility-done-button" data-close-accessibility type="button">
              סיום
            </button>
          </footer>
          <p class="visually-hidden" data-accessibility-status role="status" aria-live="polite"></p>
        </section>
      </div>
    `
  );

  setBackgroundInert(true);
  document.documentElement.classList.add("accessibility-center-open");
  publishAccessibilityCenterState(true);
  syncAccessibilityControls();
  pushAccessibilityHistoryState();
  document.querySelector(".accessibility-center")?.focus();
}

function renderTextSizeOption(value, label) {
  return `
    <label>
      <input
        data-accessibility-text-size
        type="radio"
        name="accessibility-text-size"
        value="${value}"
      />
      <span>${label}</span>
    </label>
  `;
}

function syncAccessibilityControls() {
  const center = document.querySelector(".accessibility-center");
  if (!center) return;

  center
    .querySelectorAll("[data-accessibility-text-size]")
    .forEach((control) => {
      control.checked = control.value === preferences.textSize;
    });
  const contrast = center.querySelector("[data-accessibility-contrast]");
  const motion = center.querySelector("[data-accessibility-motion]");
  if (contrast) contrast.checked = preferences.highContrast;
  if (motion) motion.checked = preferences.reduceMotion;
}

function applyAccessibilityPreferences(value) {
  preferences = value;
  const root = document.documentElement;
  const hasTextOverride = value.textSize !== "system";
  const queryPreview = new URLSearchParams(window.location.search).has(
    "dynamic-type-preview"
  );

  root.dataset.accessibilityTextSize = value.textSize;
  root.classList.toggle("accessibility-high-contrast", value.highContrast);
  root.classList.toggle("accessibility-reduced-motion", value.reduceMotion);
  root.classList.toggle(
    MANUAL_TEXT_CLASS,
    hasTextOverride || queryPreview
  );

  if (hasTextOverride) {
    root.style.setProperty(
      "font-size",
      `${TEXT_SIZE_PIXELS[value.textSize]}px`,
      "important"
    );
  } else if (!queryPreview) {
    root.style.removeProperty("font-size");
  }

  document.dispatchEvent(
    new CustomEvent("settle-friends:accessibility-preferences-changed", {
      detail: { ...value }
    })
  );
}

function announceAccessibilityUpdate(message) {
  const status = document.querySelector("[data-accessibility-status]");
  if (!status) return;
  status.textContent = "";
  requestAnimationFrame(() => {
    status.textContent = message;
  });
}

function closeAccessibilityCenter({ fromHistory = false } = {}) {
  const backdrop = document.querySelector(BACKDROP_SELECTOR);
  if (!backdrop) return;
  if (!fromHistory && historyActive && window.history?.back) {
    if (historyClosing) return;
    historyClosing = true;
    window.history.back();
    return;
  }

  historyActive = false;
  historyClosing = false;
  backdrop.remove();
  setBackgroundInert(false);
  document.documentElement.classList.remove("accessibility-center-open");
  publishAccessibilityCenterState(false);
  const target = returnFocus;
  returnFocus = null;
  if (target?.isConnected && !target.inert) target.focus();
}

function publishAccessibilityCenterState(open) {
  document.dispatchEvent(
    new CustomEvent(CENTER_CHANGED_EVENT, { detail: { open } })
  );
}

function setBackgroundInert(value) {
  if (value) {
    backgroundState = [...document.body.children]
      .filter((element) => !element.matches(BACKDROP_SELECTOR))
      .map((element) => ({ element, inert: element.inert }));
    backgroundState.forEach(({ element }) => {
      element.inert = true;
    });
    return;
  }

  backgroundState.forEach(({ element, inert }) => {
    if (element.isConnected) element.inert = inert;
  });
  backgroundState = [];
}

function pushAccessibilityHistoryState() {
  if (!window.history?.pushState) return;
  try {
    window.history.pushState(
      { ...(window.history.state ?? {}), [HISTORY_KEY]: true },
      "",
      window.location.href
    );
    historyActive = true;
  } catch {
    historyActive = false;
  }
}

function handleAccessibilityHistoryBack(event) {
  if (!historyActive) return;
  event.stopImmediatePropagation();
  closeAccessibilityCenter({ fromHistory: true });
}

function handleAccessibilityNativeBack(event) {
  if (!document.querySelector(BACKDROP_SELECTOR)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeAccessibilityCenter();
}

function handleAccessibilityKeydown(event) {
  const center = document.querySelector(".accessibility-center");
  if (!center) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeAccessibilityCenter();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = [
    ...center.querySelectorAll(
      "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"
    )
  ];
  if (!focusable.length) {
    event.preventDefault();
    center.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  } else if (!center.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  }
}

function injectAccessibilityStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .accessibility-entry-button,
    .accessibility-close-button {
      width: 44px;
      min-width: 44px;
      height: 44px;
      min-height: 44px;
      display: inline-grid;
      place-items: center;
      padding: 0;
      border: 1px solid rgba(11, 74, 56, 0.16);
      border-radius: 50%;
      color: #0b4a38;
      background: #ffffff;
      box-shadow: 0 3px 10px rgba(16, 38, 33, 0.06);
      cursor: pointer;
      touch-action: manipulation;
      transition: transform 160ms ease, border-color 160ms ease, background-color 160ms ease;
    }

    .accessibility-entry-button:hover,
    .accessibility-close-button:hover {
      border-color: rgba(11, 74, 56, 0.34);
      background: #f2f8f6;
      transform: translateY(-1px);
    }

    .accessibility-entry-button:active,
    .accessibility-close-button:active {
      transform: scale(0.96);
    }

    .accessibility-entry-button:focus-visible,
    .accessibility-close-button:focus-visible,
    .accessibility-center button:focus-visible,
    .accessibility-center input:focus-visible + span {
      outline: 3px solid rgba(20, 145, 132, 0.34);
      outline-offset: 3px;
    }

    .accessibility-entry-button .ui-icon-svg,
    .accessibility-close-button .ui-icon-svg {
      width: 22px;
      height: 22px;
    }

    .accessibility-entry-auth {
      position: absolute;
      inset-block-start: calc(14px + env(safe-area-inset-top));
      inset-inline-start: 14px;
      z-index: 3;
    }

    .account-auth-shell,
    .public-profile-modal {
      position: relative;
    }

    html.accessibility-center-open,
    html.accessibility-center-open body {
      overflow: hidden;
    }

    .accessibility-center-backdrop {
      position: fixed;
      inset: 0;
      z-index: 220;
      display: grid;
      place-items: center;
      padding: 18px;
      background: rgba(8, 25, 21, 0.58);
      overscroll-behavior: contain;
    }

    .accessibility-center {
      width: min(100%, 480px);
      max-height: min(92dvh, 760px);
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      overflow: hidden;
      border: 1px solid #d9e4e0;
      border-radius: 12px;
      color: #111f1c;
      background: #ffffff;
      box-shadow: 0 24px 70px rgba(8, 25, 21, 0.24);
      outline: none;
    }

    .accessibility-center:focus-visible {
      outline: 3px solid rgba(20, 145, 132, 0.34);
      outline-offset: 3px;
    }

    .accessibility-center-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 44px;
      align-items: start;
      gap: 16px;
      padding: 24px 24px 20px;
      border-bottom: 1px solid #e1e9e6;
    }

    .accessibility-center-header > div {
      min-width: 0;
    }

    .accessibility-center-header h2,
    .accessibility-center-header p {
      margin: 0;
    }

    .accessibility-center-eyebrow {
      color: #0b6a55;
      font-size: 0.8125rem;
      font-weight: 700;
    }

    .accessibility-center-header h2 {
      margin-top: 3px;
      color: #101c1a;
      font-size: 1.75rem;
      font-weight: 750;
      line-height: 1.2;
      text-wrap: balance;
    }

    .accessibility-center-header p:last-child {
      margin-top: 6px;
      color: #52635e;
      font-size: 0.875rem;
      line-height: 1.5;
      text-wrap: pretty;
    }

    .accessibility-center-content {
      min-height: 0;
      overflow-y: auto;
      padding: 4px 24px;
      overscroll-behavior: contain;
    }

    .accessibility-text-size-control {
      min-width: 0;
      margin: 0;
      padding: 20px 0 22px;
      border: 0;
      border-bottom: 1px solid #e1e9e6;
    }

    .accessibility-text-size-control legend,
    .accessibility-setting-row strong {
      color: #101c1a;
      font-size: 1rem;
      font-weight: 700;
    }

    .accessibility-text-size-control > p {
      margin: 4px 0 14px;
      color: #5d6d68;
      font-size: 0.8125rem;
      line-height: 1.45;
    }

    .accessibility-segmented-control {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 4px;
      padding: 4px;
      border: 1px solid #d7e2de;
      border-radius: 10px;
      background: #f4f7f6;
    }

    .accessibility-segmented-control label {
      position: relative;
      min-width: 0;
      min-height: 44px;
      display: grid;
      place-items: center;
      cursor: pointer;
    }

    .accessibility-segmented-control input {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      opacity: 0;
    }

    .accessibility-segmented-control span {
      width: 100%;
      min-height: 44px;
      display: grid;
      place-items: center;
      padding: 6px 8px;
      border-radius: 8px;
      color: #53645f;
      font-size: 0.8125rem;
      font-weight: 650;
      line-height: 1.25;
      text-align: center;
    }

    .accessibility-segmented-control input:checked + span {
      color: #ffffff;
      background: #0b4a38;
      box-shadow: 0 2px 7px rgba(11, 74, 56, 0.16);
    }

    .accessibility-setting-row {
      position: relative;
      min-height: 78px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 50px;
      align-items: center;
      gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid #e1e9e6;
      cursor: pointer;
    }

    .accessibility-setting-row > span:first-child {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .accessibility-setting-row small {
      color: #60706b;
      font-size: 0.8125rem;
      line-height: 1.4;
    }

    .accessibility-statement-link {
      min-height: 66px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 24px;
      align-items: center;
      gap: 14px;
      padding: 14px 0;
      color: #17302a;
      text-decoration: none;
    }

    .accessibility-statement-link > span:first-child {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .accessibility-statement-link strong {
      font-size: 1rem;
      font-weight: 700;
    }

    .accessibility-statement-link small {
      color: #60706b;
      font-size: 0.8125rem;
      line-height: 1.4;
    }

    .accessibility-statement-link .ui-icon-svg {
      width: 20px;
      height: 20px;
    }

    .accessibility-statement-link:hover {
      color: #0b6a55;
    }

    .accessibility-statement-link:focus-visible {
      outline: 3px solid rgba(20, 145, 132, 0.34);
      outline-offset: 3px;
    }

    .accessibility-setting-row input {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      opacity: 0;
    }

    .accessibility-switch {
      position: relative;
      width: 50px;
      height: 30px;
      border: 1px solid #b9c7c3;
      border-radius: 999px;
      background: #dfe6e4;
      transition: border-color 160ms ease, background-color 160ms ease;
    }

    .accessibility-switch::after {
      content: "";
      position: absolute;
      top: 3px;
      inset-inline-start: 3px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 1px 4px rgba(18, 34, 30, 0.24);
      transition: transform 160ms ease;
    }

    .accessibility-setting-row input:checked + .accessibility-switch {
      border-color: #0b4a38;
      background: #0b4a38;
    }

    .accessibility-setting-row input:checked + .accessibility-switch::after {
      transform: translateX(-20px);
    }

    .accessibility-center-footer {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 10px;
      padding: 18px 24px calc(18px + env(safe-area-inset-bottom));
      border-top: 1px solid #e1e9e6;
      background: #ffffff;
    }

    .accessibility-center-footer button {
      min-height: 48px;
      padding: 10px 14px;
      border-radius: 10px;
      font: inherit;
      font-size: 0.875rem;
      font-weight: 700;
      cursor: pointer;
      touch-action: manipulation;
    }

    .accessibility-reset-button {
      border: 1px solid #ccd8d4;
      color: #33443f;
      background: #ffffff;
    }

    .accessibility-done-button {
      border: 1px solid #0b4a38;
      color: #ffffff;
      background: #0b4a38;
    }

    html.accessibility-high-contrast {
      --ledger-ink: #07110f !important;
      --ledger-muted: #243631 !important;
      --ledger-faint: #3f514c !important;
      --ledger-line: #61736e !important;
      --studio-line: #61736e !important;
    }

    html.accessibility-high-contrast body,
    html.accessibility-high-contrast #app {
      color: #07110f !important;
      background-color: #ffffff !important;
    }

    html.accessibility-high-contrast #app
      :where(.panel, .expense-row, .event-row, .settlement-transfer-card, input, textarea, select, button) {
      border-color: #61736e !important;
    }

    html.accessibility-high-contrast #app
      :where(.muted, small, .event-meta, .product-brand-copy small) {
      color: #2f423d !important;
    }

    html.accessibility-high-contrast #app .screen > .top
      :where(h1, h2, h3, p, small, .muted, .eyebrow, .event-header-action-label) {
      color: #ffffff !important;
    }

    html.accessibility-reduced-motion,
    html.accessibility-reduced-motion * {
      scroll-behavior: auto !important;
    }

    html.accessibility-reduced-motion *:not(.visually-hidden),
    html.accessibility-reduced-motion *:not(.visually-hidden)::before,
    html.accessibility-reduced-motion *:not(.visually-hidden)::after {
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 1ms !important;
    }

    @media (prefers-contrast: more) {
      .accessibility-entry-button,
      .accessibility-center,
      .accessibility-center button,
      .accessibility-segmented-control {
        border-color: currentColor;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .accessibility-entry-button,
      .accessibility-close-button,
      .accessibility-switch,
      .accessibility-switch::after {
        transition-duration: 1ms;
      }
    }

    @media (max-width: 760px) {
      .accessibility-center-backdrop {
        padding: 0;
        background: #ffffff;
      }

      .accessibility-center {
        width: 100%;
        height: 100dvh;
        max-height: none;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      .accessibility-center-header {
        padding:
          calc(18px + env(safe-area-inset-top))
          20px
          18px;
      }

      .accessibility-center-content {
        padding-inline: 20px;
      }

      .accessibility-center-footer {
        padding-inline: 20px;
      }
    }

    @media (max-width: 390px) {
      .accessibility-segmented-control {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `;
  document.head.append(style);
}
