const STYLE_ID = "public-install-app-layer-style";
const INSTALL_BUTTON_SELECTOR = "[data-public-install-app]";

let deferredInstallPrompt = null;
let installDialogReturnFocus = null;
let installEnhancementScheduled = false;

injectInstallStyles();
watchInstallSurface();
enhanceInstallSurface();

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  enhanceInstallSurface();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  closeInstallDialog();
  document.querySelectorAll(INSTALL_BUTTON_SELECTOR).forEach((button) => button.remove());
});

document.addEventListener("click", handleInstallClick);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeInstallDialog();
    return;
  }

  if (event.key === "Tab") keepFocusInsideInstallDialog(event);
});

function watchInstallSurface() {
  if (!document.body) return;
  new MutationObserver(scheduleInstallEnhancement).observe(document.body, {
    childList: true,
    subtree: true
  });
}

function scheduleInstallEnhancement() {
  if (installEnhancementScheduled) return;
  installEnhancementScheduled = true;
  requestAnimationFrame(() => {
    installEnhancementScheduled = false;
    enhanceInstallSurface();
  });
}

function enhanceInstallSurface() {
  if (isInstalledApp() || isNativeApp()) {
    document.querySelectorAll(INSTALL_BUTTON_SELECTOR).forEach((button) => button.remove());
    return;
  }

  const actions = document.querySelector(".account-profile-actions");
  if (!actions || actions.querySelector(INSTALL_BUTTON_SELECTOR)) return;

  actions.insertAdjacentHTML(
    "afterbegin",
    `
      <button class="secondary-button account-install-button" data-public-install-app type="button">
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M12 3v11" />
          <path d="m7.5 10 4.5 4.5 4.5-4.5" />
          <path d="M5 17.5V20h14v-2.5" />
        </svg>
        <span>${isIosDevice() ? "הוספה למסך הבית" : "התקנה בטלפון"}</span>
      </button>
    `
  );
}

async function handleInstallClick(event) {
  const installButton = event.target.closest(INSTALL_BUTTON_SELECTOR);
  if (installButton) {
    event.preventDefault();
    installDialogReturnFocus = installButton;

    if (deferredInstallPrompt) {
      const prompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome !== "accepted") enhanceInstallSurface();
      return;
    }

    openInstallDialog();
    return;
  }

  if (event.target.closest("[data-public-close-install]")) {
    closeInstallDialog();
    return;
  }

  const backdrop = event.target.closest(".install-app-backdrop");
  if (backdrop && event.target === backdrop) closeInstallDialog();
}

function openInstallDialog() {
  document.querySelector(".install-app-backdrop")?.remove();
  const ios = isIosDevice();
  const instructions = ios
    ? `
        <ol class="install-app-steps">
          <li><span>1</span><div><strong>פתח את הקישור ב-Safari</strong><p>אם הגעת מוואטסאפ או מדפדפן אחר, בחר פתיחה ב-Safari.</p></div></li>
          <li><span>2</span><div><strong>פתח את כפתור השיתוף</strong><p>הכפתור נראה כמו ריבוע עם חץ כלפי מעלה.</p></div></li>
          <li><span>3</span><div><strong>בחר "הוספה למסך הבית"</strong><p>גלול ברשימת הפעולות אם האפשרות לא מופיעה מיד.</p></div></li>
          <li><span>4</span><div><strong>הפעל "Open as Web App"</strong><p>לאחר הפעלת המתג לחץ "הוסף". כך האפליקציה תיפתח בלי שורת הדפדפן.</p></div></li>
        </ol>
      `
    : `
        <ol class="install-app-steps">
          <li><span>1</span><div><strong>פתח את תפריט הדפדפן</strong><p>בדרך כלל זה כפתור של שלוש נקודות.</p></div></li>
          <li><span>2</span><div><strong>בחר "התקנת אפליקציה"</strong><p>בחלק מהמכשירים האפשרות נקראת "הוספה למסך הבית".</p></div></li>
        </ol>
      `;

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div class="install-app-backdrop">
        <section class="install-app-dialog" role="dialog" aria-modal="true" aria-labelledby="install-app-title" tabindex="-1">
          <header>
            <img src="./icon-192.png" alt="" width="56" height="56" />
            <div>
              <p>סוגרים חשבון</p>
              <h2 id="install-app-title">${ios ? "הוספה כאפליקציה באייפון" : "התקנה בטלפון"}</h2>
            </div>
            <button class="icon-button" data-public-close-install type="button" aria-label="סגור" title="סגור">×</button>
          </header>
          ${instructions}
          <button class="primary-button install-app-done" data-public-close-install type="button">הבנתי</button>
        </section>
      </div>
    `
  );

  document.documentElement.classList.add("install-app-open");
  document.querySelector(".install-app-dialog")?.focus();
}

function closeInstallDialog() {
  const backdrop = document.querySelector(".install-app-backdrop");
  if (!backdrop) return;
  backdrop.remove();
  document.documentElement.classList.remove("install-app-open");
  installDialogReturnFocus?.focus();
  installDialogReturnFocus = null;
}

function keepFocusInsideInstallDialog(event) {
  const dialog = document.querySelector(".install-app-dialog");
  if (!dialog) return;

  const focusable = [...dialog.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")];
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
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
  }
}

function isInstalledApp() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
}

function isNativeApp() {
  return Boolean(
    globalThis.Capacitor?.isNativePlatform?.() ||
    ["capacitor:", "ionic:"].includes(window.location.protocol)
  );
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function injectInstallStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .account-install-button {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: #07554f !important;
      background: #e4f3ef !important;
    }

    .account-install-button svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    html.install-app-open,
    html.install-app-open body {
      overflow: hidden;
    }

    .install-app-backdrop {
      position: fixed;
      inset: 0;
      z-index: 90;
      display: grid;
      place-items: center;
      padding: 18px;
      background: rgba(9, 24, 21, 0.54);
      backdrop-filter: blur(8px);
    }

    .install-app-dialog {
      width: min(100%, 460px);
      display: grid;
      gap: 20px;
      padding: 22px;
      border: 1px solid rgba(255, 255, 255, 0.5);
      border-radius: 8px;
      color: #13201d;
      background: #fff;
      box-shadow: 0 24px 70px rgba(9, 24, 21, 0.28);
      outline: none;
    }

    .install-app-dialog:focus-visible {
      outline: 3px solid rgba(10, 128, 116, 0.34);
      outline-offset: 3px;
    }

    .install-app-dialog > header {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr) 44px;
      align-items: center;
      gap: 12px;
    }

    .install-app-dialog img {
      display: block;
      border-radius: 8px;
      box-shadow: 0 6px 18px rgba(8, 119, 109, 0.2);
    }

    .install-app-dialog header p,
    .install-app-dialog header h2 {
      margin: 0;
    }

    .install-app-dialog header p {
      color: #08776d;
      font-size: 13px;
      font-weight: 800;
    }

    .install-app-dialog header h2 {
      margin-top: 2px;
      font-size: 25px;
      line-height: 1.15;
    }

    .install-app-steps {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .install-app-steps li {
      min-width: 0;
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      padding: 12px;
      border: 1px solid #dce5e2;
      border-radius: 8px;
      background: #f7faf9;
    }

    .install-app-steps li > span {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: #fff;
      background: #08776d;
      font-weight: 800;
    }

    .install-app-steps strong {
      display: block;
      font-size: 15px;
    }

    .install-app-steps p {
      margin: 3px 0 0;
      color: #5c6c67;
      font-size: 13px;
      line-height: 1.45;
    }

    .install-app-done {
      min-height: 48px;
    }

    @media (max-width: 760px) {
      .account-install-button {
        flex: 1 1 160px;
      }

      .install-app-backdrop {
        align-items: end;
        padding: 0;
      }

      .install-app-dialog {
        width: 100%;
        max-height: 92dvh;
        overflow-y: auto;
        padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
        border-width: 1px 0 0;
        border-radius: 8px 8px 0 0;
      }
    }
  `;
  document.head.append(style);
}
