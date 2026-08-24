import {
  flushPendingSharedState,
  loadRuntimeConfig
} from "./data/localStore.mjs";

const STYLE_ID = "public-sync-status-layer-style";
const STATUS_EVENT = "sogrim:sync-status";
const ROUTINE_SYNC_STATUSES = new Set([
  "saving",
  "saved",
  "reconnecting",
  "unavailable"
]);
const ONLINE_MUTATION_ACTIONS = new Set([
  "accept-friend-request",
  "add-event-participant",
  "archive-group",
  "archive-settled-event",
  "block-connected-user",
  "cancel-friend-request",
  "choose-event-status",
  "confirm-close-event",
  "confirm-important-action",
  "connect-duplicate-participant",
  "create-event",
  "create-group",
  "decline-friend-request",
  "delete-event",
  "delete-expense",
  "edit-group-add-member",
  "event-add-guest",
  "expense-add-friend-participant",
  "expense-add-payer-guest",
  "finish-restaurant-calculation",
  "friends-add-offline",
  "group-add-member",
  "join-existing-event",
  "leave-event",
  "link-offline-participant-account",
  "mark-all-notifications-read",
  "mark-paid",
  "mark-pending",
  "mark-pending-group",
  "merge-participants",
  "new-event-add-guest",
  "remove-event-from-list",
  "remove-event-participant",
  "remove-network-friend",
  "remove-offline-friend",
  "remove-participant",
  "request-event-friendship",
  "reset",
  "restore-event-participant",
  "rotate-event-invite",
  "save-edit-group",
  "save-expense",
  "save-expense-and-continue",
  "save-offline-participant-name",
  "save-participant-alias",
  "save-profile",
  "save-quick-expenses",
  "send-friend-request",
  "set-event-management-mode",
  "set-event-repayment-mode",
  "set-event-rounding-mode",
  "submit-participant-report",
  "toggle-admin-edit",
  "toggle-lock",
  "unblock-connected-user"
]);
const ONLINE_MUTATION_CHANGE_ACTIONS = new Set([
  "event-currency",
  "event-participant",
  "import-state-file",
  "toggle-event-participant-admin"
]);

let hideTimer = null;
let currentStatus = "";
let lastScreenSignature = screenSignature();
let activeSaveScreenSignature = "";
let mutationLockReason = "";
let reconnectPromise = null;
let offlineProbePromise = null;
const controlSnapshots = new WeakMap();

injectStyles();
window.addEventListener(STATUS_EVENT, handleSyncStatus);
window.addEventListener("offline", handleOffline);
window.addEventListener("online", recoverOnlineMutationAccess);
document.addEventListener("click", handleRetryClick);
document.addEventListener("click", blockOfflineMutation, true);
document.addEventListener("change", blockOfflineMutation, true);
document.addEventListener("focusin", rememberControlSnapshot, true);
document.addEventListener("pointerdown", rememberControlSnapshot, true);
observeInlineStatusTargets();
syncMutationControls();
if (navigator.onLine === false) void handleOffline();

function handleSyncStatus(event) {
  const status = event.detail?.status ?? "";
  const currentScreenSignature = screenSignature();

  if (["offline", "conflict"].includes(status)) {
    mutationLockReason = status;
  } else if (status === "saved") {
    mutationLockReason = "";
  }
  syncMutationControls();

  if (status === "saving") activeSaveScreenSignature = currentScreenSignature;
  if (status === "saved" && !activeSaveScreenSignature) {
    showStatus("");
    return;
  }
  if (
    status === "saved" &&
    activeSaveScreenSignature &&
    currentScreenSignature !== activeSaveScreenSignature
  ) {
    activeSaveScreenSignature = "";
    showStatus("");
    return;
  }

  if (!["saving", "saved"].includes(status)) activeSaveScreenSignature = "";
  showStatus(status);
  if (status === "saved") activeSaveScreenSignature = "";
}

async function handleOffline() {
  if (offlineProbePromise || mutationLockReason === "conflict") {
    return offlineProbePromise;
  }

  offlineProbePromise = confirmServerIsUnreachable()
    .then((offline) => {
      if (!offline) return;
      mutationLockReason = "offline";
      showStatus("offline");
      syncMutationControls();
    })
    .finally(() => {
      offlineProbePromise = null;
    });
  return offlineProbePromise;
}

async function confirmServerIsUnreachable() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 4000);
  try {
    const config = await loadRuntimeConfig();
    const apiBaseUrl = String(config?.apiBaseUrl ?? "").replace(/\/$/, "");
    const response = await fetch(`${apiBaseUrl}/api/health`, {
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal
    });
    if (response.ok) {
      mutationLockReason = "";
      showStatus("");
      syncMutationControls();
      return false;
    }
  } catch {
    // A failed health request confirms that online-only changes must wait.
  } finally {
    window.clearTimeout(timeoutId);
  }
  return true;
}

async function recoverOnlineMutationAccess() {
  if (reconnectPromise || mutationLockReason === "conflict") return reconnectPromise;

  mutationLockReason = "reconnecting";
  showStatus("reconnecting");
  syncMutationControls();
  reconnectPromise = flushPendingSharedState()
    .then(async (result) => {
      if (!result?.ok) {
        const config = await loadRuntimeConfig();
        if (config?.storage?.mode === "supabase") {
          throw result?.error ?? new Error("Sync unavailable");
        }
      }
      mutationLockReason = "";
      showStatus("");
      return result;
    })
    .catch(() => {
      mutationLockReason = "offline";
      showStatus("offline");
      return { ok: false };
    })
    .finally(() => {
      reconnectPromise = null;
      syncMutationControls();
    });
  return reconnectPromise;
}

function blockOfflineMutation(event) {
  if (!mutationLockReason) return;

  const target = event.target?.closest?.("[data-action]");
  if (!target) return;
  const action = target.dataset.action ?? "";
  const requiresOnline = event.type === "change"
    ? ONLINE_MUTATION_CHANGE_ACTIONS.has(action)
    : ONLINE_MUTATION_ACTIONS.has(action) || ONLINE_MUTATION_CHANGE_ACTIONS.has(action);
  if (!requiresOnline) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  restoreControlSnapshot(target);
  showStatus(mutationLockReason === "conflict" ? "conflict" : "offline");
  target.setAttribute("aria-disabled", "true");
  target.dataset.onlineMutationDisabled = "true";
}

function rememberControlSnapshot(event) {
  const target = event.target?.closest?.("[data-action]");
  if (!target || !ONLINE_MUTATION_CHANGE_ACTIONS.has(target.dataset.action ?? "")) return;
  controlSnapshots.set(target, {
    checked: "checked" in target ? target.checked : undefined,
    value: "value" in target ? target.value : undefined
  });
}

function restoreControlSnapshot(target) {
  const snapshot = controlSnapshots.get(target);
  if (!snapshot) return;
  if (snapshot.checked !== undefined && "checked" in target) {
    target.checked = snapshot.checked;
  }
  if (snapshot.value !== undefined && "value" in target) {
    target.value = snapshot.value;
  }
}

async function handleRetryClick(event) {
  const button = event.target.closest("[data-sync-retry]");
  if (!button) return;

  button.disabled = true;
  try {
    await flushPendingSharedState();
  } finally {
    button.disabled = false;
  }
}

function showStatus(status) {
  window.clearTimeout(hideTimer);

  // Saving, successful saves and reconnect checks are background work. They
  // must never replace or expand the current screen with sync UI.
  if (!status || ROUTINE_SYNC_STATUSES.has(status)) {
    currentStatus = "";
    const existingNode = document.querySelector("[data-sync-status]");
    if (existingNode) existingNode.hidden = true;
    syncInlineStatusTargets();
    return;
  }

  currentStatus = status;
  const content = statusContent(status);

  let node = document.querySelector("[data-sync-status]");
  if (!node) {
    node = document.createElement("div");
    node.className = "public-sync-status";
    node.dataset.syncStatus = "";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    document.body.append(node);
  }

  node.className = `public-sync-status is-${status}`;
  node.hidden = false;
  node.innerHTML = `
    <span class="public-sync-dot" aria-hidden="true"></span>
    <span>${content.message}</span>
    ${content.retry ? '<button type="button" data-sync-retry>נסה שוב</button>' : ""}
  `;
  syncInlineStatusTargets();

}

function observeInlineStatusTargets() {
  const app = document.querySelector("#app");
  if (!app) return;

  const observer = new MutationObserver(() => {
    const nextScreenSignature = screenSignature();
    if (
      currentStatus === "saved" &&
      lastScreenSignature &&
      nextScreenSignature &&
      nextScreenSignature !== lastScreenSignature
    ) {
      showStatus("");
    }
    if (nextScreenSignature) lastScreenSignature = nextScreenSignature;
    syncInlineStatusTargets();
  });
  observer.observe(app, { childList: true, subtree: true });
}

function screenSignature() {
  const app = document.querySelector("#app");
  const screen = app?.dataset?.screen || "";
  const screenKind = app?.querySelector(".screen")?.dataset?.screenKind || "";
  return `${screen}:${screenKind}`;
}

function syncInlineStatusTargets() {
  const hasEventActionDock = Boolean(document.querySelector(".event-action-dock"));
  const hasEventRouteDialog = Boolean(
    document.querySelector('[data-event-route-dialog="true"]')
  );
  document.body.classList.toggle("has-event-action-dock", hasEventActionDock);
  document.body.classList.toggle("has-event-route-dialog", hasEventRouteDialog);

  document.querySelectorAll("[data-inline-sync-status]").forEach((target) => {
    target.className = `${target.className
      .split(/\s+/)
      .filter((name) => name && !name.startsWith("is-sync-"))
      .join(" ")}`;
    target.textContent = "";
    target.hidden = true;
    const routeStatus = target.closest("[data-route-sync-status]");
    if (routeStatus) routeStatus.hidden = true;
  });

  document.querySelectorAll("[data-inline-sync-retry]").forEach((button) => {
    button.hidden = true;
  });
  syncMutationControls();
}

function syncMutationControls() {
  const locked = Boolean(mutationLockReason);
  document.querySelectorAll("[data-action]").forEach((control) => {
    const action = control.dataset.action ?? "";
    const isMutation =
      ONLINE_MUTATION_ACTIONS.has(action) ||
      ONLINE_MUTATION_CHANGE_ACTIONS.has(action);
    if (!isMutation) return;

    if (locked) {
      if (!control.hasAttribute("data-online-mutation-disabled")) {
        control.dataset.onlineMutationPreviousAriaDisabled =
          control.getAttribute("aria-disabled") ?? "__missing__";
      }
      control.setAttribute("aria-disabled", "true");
      control.dataset.onlineMutationDisabled = "true";
    } else {
      if (!control.hasAttribute("data-online-mutation-disabled")) return;
      const previousAriaDisabled =
        control.dataset.onlineMutationPreviousAriaDisabled ?? "__missing__";
      if (previousAriaDisabled === "__missing__") {
        control.removeAttribute("aria-disabled");
      } else {
        control.setAttribute("aria-disabled", previousAriaDisabled);
      }
      delete control.dataset.onlineMutationDisabled;
      delete control.dataset.onlineMutationPreviousAriaDisabled;
    }
  });
  document.documentElement.classList.toggle("app-online-mutations-locked", locked);
}

function statusContent(status) {
  if (status === "conflict") {
    return {
      message: "המידע עודכן במכשיר אחר",
      retry: true,
      autoHide: false
    };
  }

  if (status === "unavailable") {
    return {
      message: "הסנכרון מתעכב כרגע",
      retry: true,
      autoHide: false
    };
  }

  return {
    message: "אין רשת כרגע",
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
      max-width: min(360px, calc(100vw - 32px));
      margin-inline: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 10px 14px;
      border-radius: 14px;
      background: #ffffff;
      color: #17332f;
      border: 0;
      box-shadow:
        0 12px 32px rgba(7, 63, 57, 0.14),
        0 2px 8px rgba(7, 63, 57, 0.08);
      font: 700 0.88rem/1.35 "Heebo", "Noto Sans Hebrew", system-ui, sans-serif;
      direction: rtl;
    }

    .public-sync-status[hidden] { display: none; }
    body.app-dialog-open .public-sync-status {
      z-index: 160;
      top: auto;
      bottom: calc(24px + env(safe-area-inset-bottom));
    }
    body.has-event-action-dock .public-sync-status {
      z-index: 160;
      top: auto;
      bottom: calc(188px + env(safe-area-inset-bottom));
    }
    html.account-auth-locked .public-sync-status { display: none !important; }
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
      min-width: 44px;
      min-height: 44px;
      margin-inline-start: 4px;
      padding: 8px 12px;
      box-sizing: border-box;
      border: 0;
      border-radius: 8px;
      background: #e5f3ef;
      color: #075f57;
      font: inherit;
      cursor: pointer;
      touch-action: manipulation;
      white-space: nowrap;
      transition-property: transform, background-color, opacity;
      transition-duration: 160ms;
      transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
    }

    .public-sync-status button:hover { background: #d4ebe5; }
    .public-sync-status button:focus-visible { outline: 3px solid rgba(10, 123, 111, 0.28); }
    .public-sync-status button:disabled { cursor: wait; opacity: 0.6; }
    .public-sync-status button:active:not(:disabled) { transform: scale(0.96); }

    [data-online-mutation-disabled="true"] {
      cursor: not-allowed !important;
    }

    @media (max-width: 720px) {
      .public-sync-status {
        bottom: calc(94px + env(safe-area-inset-bottom));
      }
    }

    [data-inline-sync-status][hidden] { display: none !important; }

    .event-route-sync-status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 44px;
      margin: 0 20px 12px;
      padding: 8px 12px;
      border: 1px solid #cbd8d4;
      border-radius: 8px;
      color: #17332f;
      background: #ffffff;
      font: 700 0.86rem/1.4 "Heebo", "Noto Sans Hebrew", system-ui, sans-serif;
      direction: rtl;
    }

    .event-route-sync-status[hidden] { display: none !important; }

    .event-route-sync-status [data-inline-sync-status] {
      flex: 1 1 auto;
      min-width: 0;
    }

    .event-route-sync-status button {
      flex: 0 0 auto;
      min-width: 44px;
      min-height: 44px;
      padding: 8px 12px;
      border: 0;
      border-radius: 8px;
      color: #075f57;
      background: #e5f3ef;
      font: inherit;
    }

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
