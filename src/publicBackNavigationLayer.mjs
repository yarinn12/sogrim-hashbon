const HISTORY_STATE_KEY = "settleFriendsPublicBack";

let historyDepth = 0;
let lastScreenKey = "";
let restoringScreen = false;
let scheduled = false;

setupPublicBackNavigation();

function setupPublicBackNavigation() {
  syncBackNavigation();

  const app = document.querySelector("#app");
  if (app) {
    const observer = new MutationObserver(scheduleSync);
    observer.observe(app, { childList: true, subtree: true });
  }

  window.addEventListener("popstate", handleBrowserBack);
  document.addEventListener("click", handleNativeBackClick, true);
  document.addEventListener("click", handlePublicBackClick);
  document.addEventListener("click", handleNativeNavigationClick);
}

function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    syncBackNavigation();
  });
}

function syncBackNavigation() {
  if (hasNativeBackNavigation()) {
    lastScreenKey = "";
    return;
  }

  installBackButton();
  syncHistoryState();
}

function hasNativeBackNavigation() {
  return Boolean(document.querySelector('[data-action="go-back"]'));
}

function installBackButton() {
  const header = document.querySelector(".screen .top");
  if (!header) return;

  header
    .querySelectorAll(':scope > .icon-button[data-action="home"], :scope > .icon-button[data-action="back-to-event"]')
    .forEach((button) => {
      button.hidden = true;
      button.setAttribute("aria-hidden", "true");
      button.tabIndex = -1;
    });

  let button = header.querySelector('[data-public-action="app-back"]');
  if (!button && !header.querySelector('[data-action="go-back"]')) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button app-back-button";
    button.dataset.publicAction = "app-back";
    button.setAttribute("aria-label", "חזור");
    button.title = "חזור";
    button.textContent = "‹";
    header.prepend(button);
  }

  const activeButton = header.querySelector('[data-public-action="app-back"], [data-action="go-back"]');
  if (activeButton) activeButton.disabled = !canGoBack();
}

function syncHistoryState() {
  if (!window.history?.replaceState) return;

  const key = currentScreenKey();
  if (!key) return;

  if (restoringScreen) {
    lastScreenKey = key;
    return;
  }

  if (!lastScreenKey) {
    replaceHistory(key);
    return;
  }

  if (key === lastScreenKey) return;

  historyDepth += 1;
  window.history.pushState(createHistoryState(key), "", window.location.href);
  lastScreenKey = key;
}

function replaceHistory(key = currentScreenKey()) {
  if (!window.history?.replaceState || !key) return;

  window.history.replaceState(createHistoryState(key), "", window.location.href);
  lastScreenKey = key;
}

function createHistoryState(key) {
  return {
    [HISTORY_STATE_KEY]: true,
    depth: historyDepth,
    key
  };
}

function handlePublicBackClick(event) {
  const button = event.target.closest('[data-public-action="app-back"]');
  if (!button) return;

  event.preventDefault();
  goBack();
}

function handleNativeBackClick(event) {
  const button = event.target.closest('[data-action="go-back"]');
  if (!button || button.disabled) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  goBackWithoutHistoryRoundTrip();
}

function handleNativeNavigationClick(event) {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!isNavigationAction(action)) return;

  setTimeout(syncBackNavigation, 0);
  setTimeout(syncBackNavigation, 160);
}

function isNavigationAction(action) {
  return [
    "home",
    "new-event",
    "groups",
    "open-event",
    "back-to-event",
    "settle",
    "show-expense-form",
    "edit-expense",
    "cancel-expense",
    "close-event-dialog"
  ].includes(action);
}

function handleBrowserBack(event) {
  if (!event.state?.[HISTORY_STATE_KEY]) return;

  historyDepth = Number.isFinite(event.state.depth)
    ? Math.max(0, event.state.depth)
    : 0;
  restoringScreen = true;
  restoreScreen(event.state.key);
  queueMicrotask(() => {
    restoringScreen = false;
    syncBackNavigation();
  });
}

function goBack() {
  if (historyDepth > 0 && window.history) {
    window.history.back();
    return;
  }

  if (closeOpenWindow()) {
    replaceAfterFallback();
    return;
  }

  if (!isHomeScreen()) {
    goHome();
    replaceAfterFallback();
  }
}

function goBackWithoutHistoryRoundTrip() {
  const key = currentScreenKey();

  if (closeOpenWindow()) {
    replaceAfterFallback();
    return;
  }

  if (key.startsWith("settlement:")) {
    const eventId = key.split(":")[1];
    clickAction("back-to-event", { eventId });
    replaceAfterFallback();
    return;
  }

  if (!isHomeScreen()) {
    goHome();
    replaceAfterFallback();
  }
}

function restoreScreen(key) {
  if (!key) return;

  if (key === "home") {
    closeOpenWindow();
    goHome();
    return;
  }

  if (key === "groups") {
    closeOpenWindow();
    clickAction("groups");
    return;
  }

  if (key === "new-event") {
    closeOpenWindow();
    clickAction("new-event");
    return;
  }

  if (key.startsWith("event:")) {
    const eventId = key.split(":")[1];
    restoreEvent(eventId);
    return;
  }

  if (key.startsWith("settlement:")) {
    const eventId = key.split(":")[1];
    closeOpenWindow();
    const settleButton = document.querySelector(`[data-action="settle"][data-event-id="${cssEscape(eventId)}"]`);
    settleButton?.click();
  }
}

function restoreEvent(eventId) {
  closeOpenWindow();

  const backToEvent = document.querySelector(`[data-action="back-to-event"][data-event-id="${cssEscape(eventId)}"]`);
  if (backToEvent) {
    backToEvent.click();
    return;
  }

  const alreadyOnEvent = currentScreenKey() === `event:${eventId}`;
  if (alreadyOnEvent) return;

  const eventButton = document.querySelector(`[data-action="open-event"][data-event-id="${cssEscape(eventId)}"]`);
  if (eventButton) {
    eventButton.click();
    return;
  }

  goHome();
}

function closeOpenWindow() {
  const closeDialog = document.querySelector('[data-action="close-event-dialog"]');
  if (closeDialog) {
    closeDialog.click();
    return true;
  }

  const cancelExpense = document.querySelector('[data-action="cancel-expense"]');
  if (cancelExpense) {
    cancelExpense.click();
    return true;
  }

  return false;
}

function goHome() {
  const homeButton = document.querySelector('[data-action="home"]');
  if (homeButton) {
    homeButton.click();
    return;
  }

  if (!isHomeScreen()) clickSyntheticAction("home");
}

function clickAction(action, dataset = {}) {
  const target = findAction(action, dataset);
  if (target) {
    target.click();
    return true;
  }

  return clickSyntheticAction(action, dataset);
}

function findAction(action, dataset = {}) {
  const selector = [`[data-action="${action}"]`]
    .concat(
      Object.entries(dataset).map(([key, value]) => {
        const dataName = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        return `[data-${dataName}="${cssEscape(value)}"]`;
      })
    )
    .join("");
  return document.querySelector(selector);
}

function clickSyntheticAction(action, dataset = {}) {
  const app = document.querySelector("#app");
  if (!app) return false;

  const button = document.createElement("button");
  button.type = "button";
  button.hidden = true;
  button.dataset.action = action;
  Object.entries(dataset).forEach(([key, value]) => {
    button.dataset[key] = value;
  });
  app.append(button);
  button.click();
  button.remove();
  return true;
}

function replaceAfterFallback() {
  historyDepth = 0;
  queueMicrotask(() => replaceHistory());
}

function canGoBack() {
  return historyDepth > 0 || !isHomeScreen() || hasOpenWindow();
}

function hasOpenWindow() {
  return Boolean(
    document.querySelector(".expense-modal-backdrop") ||
      document.querySelector(".event-modal-backdrop")
  );
}

function currentScreenKey() {
  const settlementReport = document.querySelector('[data-action="copy-settlement"][data-event-id]');
  if (settlementReport) return `settlement:${settlementReport.dataset.eventId}`;

  const activeExpense = document.querySelector(".expense-modal-backdrop [data-action='save-expense'][data-event-id]");
  if (activeExpense) return `event:${activeExpense.dataset.eventId}:expense`;

  const eventDialog = document.querySelector(".event-modal-backdrop [data-action][data-event-id]");
  if (eventDialog) return `event:${eventDialog.dataset.eventId}:dialog`;

  const eventAction = document.querySelector('[data-action="show-expense-form"][data-event-id]');
  if (eventAction) return `event:${eventAction.dataset.eventId}`;

  if (document.querySelector('[data-action="create-event"]')) return "new-event";
  if (document.querySelector('[data-action="create-group"]')) return "groups";
  if (document.querySelector('[data-action="save-profile"]')) return "profile";
  if (document.querySelector('[data-action="new-event"]')) return "home";

  return "";
}

function isHomeScreen() {
  return currentScreenKey() === "home";
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/"/g, '\\"');
}
