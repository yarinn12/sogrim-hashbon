import { flushPendingSharedState } from "./data/localStore.mjs";

const STYLE_ID = "public-sync-status-layer-style";
const STATUS_EVENT = "sogrim:sync-status";
const HIDE_DELAY_MS = 1400;

let hideTimer = null;
let currentStatus = "";

injectStyles();
window.addEventListener(STATUS_EVENT, handleSyncStatus);
document.addEventListener("click", handleRetryClick);
observeInlineStatusTargets();

function handleSyncStatus(event) {
  showStatus(event.detail?.status ?? "");
}

async function handleRetryClick(event) {
  const button = event.target.closest("[data-sync-retry]");
  if (!button) return;

  button.disabled = true;
  await flushPendingSharedState();
  button.disabled = false;
}

function showStatus(status) {
  if (!status) return;
  currentStatus = status;
  window.clearTimeout(hideTimer);

  let node = document.querySelector("[data-sync-status]");
  if (!node) {
    node = document.createElement("div");
    node.className = "public-sync-status";
    node.dataset.syncStatus = "";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    document.body.append(node);
  }

  const content = statusContent(status);
  node.className = `public-sync-status is-${status}`;
  node.hidden = false;
  node.innerHTML = `
    <span class="public-sync-dot" aria-hidden="true"></span>
    <span>${content.message}</span>
    ${content.retry ? '<button type="button" data-sync-retry>נסה שוב</button>' : ""}
  `;
  syncInlineStatusTargets();

  if (content.autoHide) {
    hideTimer = window.setTimeout(() => {
      if (currentStatus !== status) return;
      node.hidden = true;
      document.querySelectorAll("[data-inline-sync-status]").forEach((target) => {
        target.hidden = true;
      });
    }, HIDE_DELAY_MS);
  }
}

function observeInlineStatusTargets() {
  const app = document.querySelector("#app");
  if (!app) return;

  const observer = new MutationObserver(() => syncInlineStatusTargets());
  observer.observe(app, { childList: true, subtree: true });
}

function syncInlineStatusTargets() {
  const content = inlineStatusContent(currentStatus);
  const hasEventActionDock = Boolean(document.querySelector(".event-action-dock"));
  document.body.classList.toggle("has-event-action-dock", hasEventActionDock);

  document.querySelectorAll("[data-inline-sync-status]").forEach((target) => {
    target.className = `${target.className
      .split(/\s+/)
      .filter((name) => name && !name.startsWith("is-sync-"))
      .join(" ")}${currentStatus ? ` is-sync-${currentStatus}` : ""}`;
    target.textContent = content;
    target.hidden = !content;
  });

  document.querySelectorAll("[data-inline-sync-retry]").forEach((button) => {
    button.hidden = !["offline", "conflict"].includes(currentStatus);
  });
}

function inlineStatusContent(status) {
  if (status === "saving") return "שומר לענן...";
  if (status === "saved") return "נשמר";
  if (status === "conflict") return "המידע השתנה במכשיר אחר. צריך לרענן לפני שינוי נוסף.";
  if (status === "unavailable") return "השיתוף בין מכשירים עדיין לא מחובר.";
  if (status === "offline") return "נשמר במכשיר וממתין לסנכרון";
  return "";
}

function statusContent(status) {
  if (status === "saving") return { message: "שומר שינויים…", autoHide: false };
  if (status === "saved") return { message: "השינויים נשמרו", autoHide: true };
  if (status === "conflict") {
    return {
      message: "האירוע עודכן במכשיר אחר. רענן לפני שינוי נוסף.",
      autoHide: false
    };
  }
  if (status === "unavailable") {
    return {
      message: "השיתוף בין מכשירים עדיין לא מחובר.",
      autoHide: false
    };
  }

  return {
    message: "השינוי נשמר במכשיר ויעלה כשהחיבור יחזור.",
    retry: true,
    autoHide: false
  };
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .public-sync-status {
      position: fixed;
      z-index: 70;
      inset-inline: 16px;
      bottom: calc(16px + env(safe-area-inset-bottom));
      width: fit-content;
      max-width: min(440px, calc(100vw - 32px));
      margin-inline: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 10px 14px;
      border-radius: 12px;
      background: #ffffff;
      color: #17332f;
      border: 1px solid #cbd8d4;
      font: 700 0.88rem/1.35 "Heebo", "Noto Sans Hebrew", system-ui, sans-serif;
      direction: rtl;
    }

    .public-sync-status[hidden] { display: none; }
    body.app-dialog-open .public-sync-status { display: none !important; }
    body.has-event-action-dock .public-sync-status { display: none !important; }
    html.account-auth-locked .public-sync-status { display: none !important; }
    .public-sync-status.is-offline,
    .public-sync-status.is-unavailable { border-color: #d6b46b; }
    .public-sync-status.is-conflict { border-color: #d98978; }

    .public-sync-dot {
      flex: 0 0 auto;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #0a7b6f;
    }

    .public-sync-status > span:not(.public-sync-dot) {
      flex: 1 1 auto;
      min-width: 0;
    }

    .is-saving .public-sync-dot { animation: public-sync-pulse 900ms ease-in-out infinite alternate; }
    .is-offline .public-sync-dot,
    .is-unavailable .public-sync-dot { background: #b7791f; }
    .is-conflict .public-sync-dot { background: #c44f3f; }

    .public-sync-status button {
      flex: 0 0 auto;
      min-height: 36px;
      margin-inline-start: 4px;
      padding: 6px 10px;
      border: 0;
      border-radius: 8px;
      background: #e5f3ef;
      color: #075f57;
      font: inherit;
      cursor: pointer;
      touch-action: manipulation;
      white-space: nowrap;
    }

    .public-sync-status button:hover { background: #d4ebe5; }
    .public-sync-status button:focus-visible { outline: 3px solid rgba(10, 123, 111, 0.28); }
    .public-sync-status button:disabled { cursor: wait; opacity: 0.6; }

    [data-inline-sync-status][hidden] { display: none !important; }

    @keyframes public-sync-pulse {
      from { opacity: 0.45; transform: scale(0.82); }
      to { opacity: 1; transform: scale(1); }
    }

    @media (prefers-reduced-motion: reduce) {
      .is-saving .public-sync-dot { animation: none; }
    }
  `;
  document.head.append(style);
}
