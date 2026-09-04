import {
  flushPendingSharedState,
  loadRuntimeConfig
} from "./data/localStore.mjs";
import { iconSvg } from "./uiIcons.mjs";
import { pendingSaveMessage } from "./domain/userNoticePolicy.mjs";

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
  "cancel-friend-request",
  "decline-friend-request",
  "join-existing-event",
  "mark-all-notifications-read",
  "request-event-friendship",
  "send-friend-request",
  "submit-participant-report",
  "unblock-connected-user"
]);
// Form changes and ledger mutations are deliberately local-first. The shared
// store queues them durably and reconciles them after connectivity returns, so
// a stale sync state must never turn a visible control into a no-op.
const ONLINE_MUTATION_CHANGE_ACTIONS = new Set();

let currentStatus = "";
let pendingSync = false;
let pendingFailureKind = "";
let connectivityRevision = 0;
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
document.addEventListener("click", handleDismissClick);
document.addEventListener("click", blockOfflineMutation, true);
document.addEventListener("change", blockOfflineMutation, true);
document.addEventListener("focusin", rememberControlSnapshot, true);
document.addEventListener("pointerdown", rememberControlSnapshot, true);
observeInlineStatusTargets();
syncMutationControls();
if (navigator.onLine === false) void handleOffline();

function handleSyncStatus(event) {
  const status = event.detail?.status ?? "";
  if (typeof event.detail?.pending === "boolean") {
    pendingSync = event.detail.pending;
    pendingFailureKind = pendingSync ? event.detail.failureKind ?? "" : "";
  }
  const currentScreenSignature = screenSignature();

  if (status === "offline") {
    mutationLockReason = status;
  } else if (["saved", "conflict"].includes(status)) {
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
  if (offlineProbePromise) {
    return offlineProbePromise;
  }

  const revision = ++connectivityRevision;
  offlineProbePromise = confirmServerIsUnreachable()
    .then((offline) => {
      if (revision !== connectivityRevision || navigator.onLine !== false) return;
      if (!offline) {
        mutationLockReason = "";
        syncMutationControls();
        return;
      }
      mutationLockReason = "offline";
      showStatus("");
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
  ++connectivityRevision;
  // A rejected outbox entry says nothing about connectivity for other actions.
  // Release a stale offline lock immediately when the browser comes online.
  mutationLockReason = navigator.onLine === false ? "offline" : "";
  syncMutationControls();
  if (reconnectPromise) return reconnectPromise;

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
      mutationLockReason = navigator.onLine === false ? "offline" : "";
      showStatus("");
      return result;
    })
    .catch(() => {
      mutationLockReason = navigator.onLine === false ? "offline" : "";
      showStatus("");
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
  // Account linking and duplicate-name merges are durable operations: the app
  // stores them locally and retries/validates them against the canonical cloud
  // state. A stale connectivity lock must not turn their controls into no-ops.
  if (target.dataset.allowOfflineMutation === "true") return;
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
  } catch {
    // Preserve the pending indicator; a failed explicit retry is not proof of
    // offline connectivity and must not become an unhandled rejection.
    syncInlineStatusTargets();
  } finally {
    button.disabled = false;
  }
}

function handleDismissClick(event) {
  const button = event.target.closest("[data-sync-dismiss]");
  if (!button) return;

  const node = button.closest("[data-sync-status]");
  if (node) node.hidden = true;
  currentStatus = "";
  syncInlineStatusTargets();
}

function showStatus(status) {
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
  const message = statusMessage(status);

  let node = document.querySelector("[data-sync-status]");
  if (!node) {
    node = document.createElement("div");
    node.className = "public-sync-status app-toast";
    node.dataset.syncStatus = "";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-atomic", "true");
    document.body.append(node);
  }

  node.className = `public-sync-status app-toast is-${status}`;
  node.hidden = false;
  node.innerHTML = `
    <span class="app-toast-icon" aria-hidden="true">${iconSvg("bell")}</span>
    <span class="app-toast-copy">${message}</span>
    <button class="app-toast-close" type="button" data-sync-dismiss aria-label="סגירת ההודעה" title="סגירת ההודעה">
      ${iconSvg("x")}
    </button>
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
    const message = pendingSync ? pendingSaveMessage(pendingFailureKind) : "";
    if (target.textContent !== message) target.textContent = message;
    target.hidden = !message;
    const routeStatus = target.closest("[data-route-sync-status]");
    if (routeStatus) routeStatus.hidden = !message;
  });

  document.querySelectorAll("[data-inline-sync-retry]").forEach((button) => {
    button.hidden = true;
  });
  syncMutationControls();
}

function syncMutationControls() {
  const locked = Boolean(mutationLockReason);
  document.querySelectorAll("[data-action]").forEach((control) => {
    if (control.dataset.allowOfflineMutation === "true") {
      if (control.hasAttribute("data-online-mutation-disabled")) {
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
      return;
    }
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

function statusMessage(status) {
  if (status === "conflict") {
    return "המידע עודכן במכשיר אחר";
  }

  if (status === "unavailable") {
    return "הסנכרון מתעכב כרגע";
  }

  return "אין רשת כרגע";
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .public-sync-status {
      position: fixed;
      z-index: 180;
      inset-inline: 14px;
      bottom: calc(96px + env(safe-area-inset-bottom));
      margin-inline: auto;
      direction: rtl;
    }

    .public-sync-status[hidden] { display: none !important; }
    body.app-dialog-open .public-sync-status {
      z-index: 320;
      top: auto;
      bottom: calc(96px + env(safe-area-inset-bottom));
    }
    body.has-event-action-dock .public-sync-status {
      z-index: 200;
      top: auto;
      bottom: calc(188px + env(safe-area-inset-bottom));
    }
    html.account-auth-locked .public-sync-status { display: none !important; }

    [data-online-mutation-disabled="true"] {
      cursor: not-allowed !important;
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

  `;
  document.head.append(style);
}
