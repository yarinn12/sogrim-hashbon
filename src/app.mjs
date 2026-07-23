import { formatMoney, parseMoneyInput } from "./domain/money.mjs";
import {
  formatClockTime,
  formatRelativeCalendarDate
} from "./domain/dateLabels.mjs";
import {
  currencyConfig,
  currencyOptions,
  currencySelectLabel,
  formatCurrency,
  normalizeCurrency
} from "./domain/currencies.mjs";
import {
  buildParticipantSettlementBreakdown,
  calculateSettlement,
  pendingBalanceForParticipant
} from "./domain/settlement.mjs";
import { buildEventInsights } from "./domain/eventInsights.mjs";
import {
  countEventsByStatus,
  filterEventsByStatus,
  isEventClosed,
  isEventOpen
} from "./domain/eventFilters.mjs";
import {
  formatEventReport,
  formatSettlementSummary
} from "./domain/settlementSummary.mjs";
import {
  balancePayerAmounts,
  createPayerDraft,
  markPayerAmountEdited,
  summarizePayerDraft
} from "./domain/expenseDraft.mjs";
import {
  buildQuickItemExpenses,
  formatExpenseDay,
  groupExpensesByDay,
  QUICK_ITEM_ALL_PARTICIPANTS,
  QUICK_ITEM_CUSTOM_PARTICIPANTS,
  summarizeQuickItemShares
} from "./domain/quickExpenses.mjs";
import {
  expenseDraftMemoryKey,
  parseExpenseDraftMemory,
  serializeExpenseDraftMemory
} from "./domain/expenseDraftMemory.mjs";
import { validateExpense } from "./domain/validation.mjs";
import {
  buildEventInviteSnapshot,
  buildEventInviteUrl,
  mergeInviteSnapshotIntoState,
  parseInviteSnapshot,
  parseInviteEventId
} from "./domain/inviteLinks.mjs";
import { parseInviteSpaceId, parseInviteSpaceKey } from "./domain/cloudSpace.mjs";
import {
  archiveGroup,
  canLeaveEvent,
  canRemoveParticipant,
  closeEvent,
  createGroup,
  deleteEvent,
  leaveEvent,
  mergeParticipants,
  reopenEvent,
  removeParticipant,
  removeExpense,
  setEventCurrency,
  setEventAdminsCanEditOnly,
  updateGroup,
  updateTransferStatus,
  updateExpense
} from "./domain/appActions.mjs";
import {
  parseStateBackup,
  serializeStateBackup
} from "./domain/stateBackup.mjs";
import {
  loadState,
  loadRuntimeConfig,
  loadSharedState,
  loadLocalProfile,
  resetSharedState,
  saveLocalProfile,
  saveState,
  saveSharedState
} from "./data/localStore.mjs";
import {
  ensureEventShareCredentials,
  eventShareCredentials,
  mergeSharedEventIntoState,
  readSharedEventState,
  saveSharedEventState
} from "./data/sharedEventStore.mjs";
import {
  ensureNamedParticipant,
  isFullProfileName,
  normalizeProfileName
} from "./domain/userProfile.mjs";
import {
  canEditEvent,
  canManageEventSettings,
  eventAdminIds
} from "./domain/permissions.mjs";
import {
  visibleEventsForParticipant,
  visibleGroupsForParticipant
} from "./domain/personalMemory.mjs";
import { hasSharedStateChanged } from "./data/localIdentity.mjs";
import {
  EVENT_TYPE_RESTAURANT,
  EVENT_TYPE_TRIP,
  defaultExpenseModeForEvent,
  eventTypeConfig,
  eventTypeOptions,
  normalizeEventType,
  uniqueDefaultEventName
} from "./domain/eventTypes.mjs";

const app = document.querySelector("#app");
const APP_HISTORY_STATE_KEY = "settleFriendsAppHistory";
const RECENT_EVENT_STORAGE_PREFIX = "settle-friends-recent-event";
const RECENT_EVENT_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const DIALOG_OPEN_ACTIONS = new Set([
  "show-expense-form",
  "edit-expense",
  "open-event-participants",
  "open-event-share",
  "open-event-settings"
]);
const EVENT_STATUS_FILTERS = [
  { id: "open", label: "פתוחים" },
  { id: "closed", label: "סגורים" },
  { id: "all", label: "הכל" }
];
const NEW_EVENT_FLOW_SCREENS = new Set([
  "new-event-type",
  "new-event-management",
  "new-event"
]);
const EVENT_NAME_PLACEHOLDER = "אוכל / מונית / קניות…";
const EVENT_MANAGEMENT_CENTRALIZED = "centralized";
const EVENT_MANAGEMENT_COLLABORATIVE = "collaborative";
const EXPENSE_TEMPLATES = ["מונית", "אוכל", "שתייה", "כרטיסים", "חניה", "קניות"];
const ADD_PAYER_PARTICIPANT_VALUE = "__add-payer-participant__";
const ADD_QUICK_ITEM_GUEST_VALUE = "__add-quick-item-guest__";
const EVENT_LONG_PRESS_DELAY_MS = 560;
const EVENT_LONG_PRESS_MOVE_TOLERANCE_PX = 12;

function eventCurrency(event) {
  return normalizeCurrency(event?.currency);
}

function formatEventMoney(event, amount) {
  return formatCurrency(amount, eventCurrency(event));
}

function currencyCompactLabel(event) {
  const currency = currencyConfig(eventCurrency(event));
  return currency.symbol || currency.id;
}

function renderCurrencyOptions(selectedCurrency) {
  const selected = normalizeCurrency(selectedCurrency);
  return currencyOptions()
    .map(
      (currency) => `
        <option value="${currency.id}" ${selected === currency.id ? "selected" : ""}>
          ${escapeHtml(currencySelectLabel(currency.id))}
        </option>
      `
    )
    .join("");
}

let localProfile = loadLocalProfile();
let profileNameDraft = localProfile?.displayName ?? "";
let profileError = "";
let state = syncLocalProfile(applyInviteSnapshot(loadState()));
let screen = initialScreenFromLaunchAction();
let newEventDraft = null;
let joinEventDraft = null;
let expenseDraft = null;
let expenseSaveInProgress = false;
let eventDialog = null;
let groupDraft = null;
let editingGroupDraft = null;
let mergeParticipantsDraft = null;
let importantActionDialog = null;
let eventRemovalMenu = null;
let settlementCloseConfirmation = null;
const eventSharePreparationPromises = new Map();
let importantActionReturnFocus = null;
let pendingImportantActionReturnFocus = null;
let notice = "";
let dialogReturnFocus = null;
let pendingDialogReturnFocus = null;
let dialogReturnScrollY = 0;
let pendingDialogReturnScrollY = 0;
let runtimeConfig = {
  publicUrl: "",
  storage: { mode: "local" },
  launch: {
    publicUrlReady: false,
    cloudStorageReady: false,
    googleAuthReady: false,
    shareLinksReady: false
  }
};
let eventStatusFilter = "open";
let appHistoryDepth = 0;
let lastNavigationViewKey = "";
let lastRenderedScreenKey = "";
let restoringBrowserHistory = false;
let eventLongPressTimer = null;
let eventLongPressTarget = null;
let eventLongPressStartPoint = null;
let suppressedEventOpenId = "";
let suppressEventOpenUntil = 0;

app.addEventListener("click", handleClick);
app.addEventListener("input", handleInput);
app.addEventListener("change", handleChange);
app.addEventListener("pointerdown", handleEventLongPressStart);
app.addEventListener("pointermove", handleEventLongPressMove);
app.addEventListener("pointerup", cancelEventLongPress);
app.addEventListener("pointercancel", cancelEventLongPress);
app.addEventListener("contextmenu", handleEventContextMenu);
window.addEventListener("popstate", handleBrowserHistoryBack);
document.addEventListener("keydown", handleDialogKeydown);
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

function initialScreenFromLaunchAction() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("action") !== "new-event") return { name: "home" };
    url.searchParams.delete("action");
    window.history.replaceState(window.history.state, "", url);
    return { name: "new-event-type" };
  } catch {
    return { name: "home" };
  }
}

function render() {
  rememberExpenseDraft();
  ensureRenderableScreen();
  syncBrowserHistory();
  if (!eventDialog && !expenseDraft && !importantActionDialog && !eventRemovalMenu) {
    document.body.classList.remove("app-dialog-open");
  }

  if (!localProfile || screen.name === "profile") {
    commitRenderedScreen(renderProfileSetup());
    return;
  }

  if (screen.name === "home") {
    commitRenderedScreen(renderHome());
    return;
  }

  if (screen.name === "join-event") {
    commitRenderedScreen(renderJoinEvent());
    return;
  }

  if (screen.name === "new-event-type") {
    commitRenderedScreen(renderNewEventType());
    return;
  }

  if (screen.name === "new-event-management") {
    commitRenderedScreen(renderNewEventManagement());
    return;
  }

  if (screen.name === "new-event") {
    commitRenderedScreen(renderNewEvent());
    return;
  }

  if (screen.name === "groups") {
    commitRenderedScreen(renderGroups());
    return;
  }

  const event = getEvent(screen.eventId);
  if (!event) {
    screen = { name: "home" };
    commitRenderedScreen(renderHome());
    return;
  }

  if (screen.name === "event") {
    commitRenderedScreen(renderEvent(event));
    return;
  }

  if (screen.name === "settlement") {
    commitRenderedScreen(renderSettlement(event));
  }
}

function commitRenderedScreen(html) {
  const nextScreenKey = `${screen.name}:${screen.eventId ?? ""}`;
  const screenChanged = nextScreenKey !== lastRenderedScreenKey;
  const persistentIdentity = app.querySelector(
    ":scope > .screen > .product-app-identity"
  );
  persistentIdentity
    ?.querySelector(":scope > .product-route-controls")
    ?.remove();

  app.classList.remove("app-boot");
  app.removeAttribute("aria-busy");
  app.innerHTML = `${html}${renderEventRemovalMenu()}${renderImportantActionDialog()}`;
  const renderedScreen = app.querySelector(":scope > .screen");
  if (persistentIdentity && renderedScreen) {
    renderedScreen.prepend(persistentIdentity);
  }
  lastRenderedScreenKey = nextScreenKey;

  if (!screenChanged) return;

  queueMicrotask(() => {
    window.scrollTo?.(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    focusRenderedScreen();
  });
}

function focusRenderedScreen() {
  const heading = app.querySelector(".screen h1");
  const focusTarget = heading ?? app;
  if (heading) heading.tabIndex = -1;
  focusTarget.focus?.({ preventScroll: true });
}

function ensureRenderableScreen() {
  if (eventRemovalMenu && !getEvent(eventRemovalMenu.eventId)) {
    eventRemovalMenu = null;
  }

  if (
    ["new-event-management", "new-event"].includes(screen.name) &&
    !newEventDraft?.eventType
  ) {
    screen = { name: "new-event-type" };
    return;
  }

  if (!["event", "settlement"].includes(screen.name)) return;
  if (getEvent(screen.eventId)) return;

  screen = { name: "home" };
  newEventDraft = null;
  expenseDraft = null;
  eventDialog = null;
  groupDraft = null;
  editingGroupDraft = null;
  mergeParticipantsDraft = null;
  importantActionDialog = null;
  eventRemovalMenu = null;
  settlementCloseConfirmation = null;
  importantActionReturnFocus = null;
}

function syncBrowserHistory() {
  if (!window.history?.replaceState) return;

  const key = navigationViewKey();
  if (restoringBrowserHistory) {
    lastNavigationViewKey = key;
    return;
  }

  if (!lastNavigationViewKey) {
    replaceBrowserHistoryState();
    return;
  }

  if (key === lastNavigationViewKey) return;

  appHistoryDepth += 1;
  window.history.pushState(createBrowserHistoryState(), "", window.location.href);
  lastNavigationViewKey = key;
}

function replaceBrowserHistoryState() {
  if (!window.history?.replaceState) return;

  window.history.replaceState(createBrowserHistoryState(), "", window.location.href);
  lastNavigationViewKey = navigationViewKey();
}

function createBrowserHistoryState() {
  return {
    [APP_HISTORY_STATE_KEY]: true,
    depth: appHistoryDepth,
    view: currentHistoryView()
  };
}

function handleBrowserHistoryBack(event) {
  if (!event.state?.[APP_HISTORY_STATE_KEY]) return;

  const targetScreenName = event.state.view?.screen?.name;
  const leavingCompletedEventCreation =
    screen.name === "event" &&
    NEW_EVENT_FLOW_SCREENS.has(targetScreenName) &&
    !newEventDraft;
  if (leavingCompletedEventCreation) {
    appHistoryDepth = 0;
    screen = { name: "home" };
    restoringBrowserHistory = true;
    try {
      render();
    } finally {
      restoringBrowserHistory = false;
    }
    replaceBrowserHistoryState();
    return;
  }
  const activeNewEventDraft =
    NEW_EVENT_FLOW_SCREENS.has(screen.name) &&
    NEW_EVENT_FLOW_SCREENS.has(targetScreenName)
      ? cloneNavigationValue(newEventDraft)
      : null;
  const closingDialogReturnFocus = eventDialog || expenseDraft || eventRemovalMenu
    ? dialogReturnFocus
    : pendingDialogReturnFocus;
  const closingDialogScrollY = eventDialog || expenseDraft || eventRemovalMenu
    ? dialogReturnScrollY
    : pendingDialogReturnScrollY;
  if (importantActionDialog && importantActionReturnFocus) {
    pendingImportantActionReturnFocus = importantActionReturnFocus;
  }
  appHistoryDepth = Number.isFinite(event.state.depth)
    ? Math.max(0, event.state.depth)
    : 0;
  restoreHistoryView(event.state.view);
  if (activeNewEventDraft) newEventDraft = activeNewEventDraft;
  restoringBrowserHistory = true;
  try {
    render();
  } finally {
    restoringBrowserHistory = false;
  }
  if (expenseDraft) {
    activateDialog(".expense-modal");
  } else if (eventDialog) {
    activateDialog(".event-modal");
  } else if (eventRemovalMenu) {
    activateDialog(".event-removal-menu");
  } else {
    document.body.classList.remove("app-dialog-open");
    clearDialogBackgroundInert();
    pendingDialogReturnFocus = closingDialogReturnFocus;
    pendingDialogReturnScrollY = 0;
    dialogReturnFocus = null;
    dialogReturnScrollY = 0;
    requestAnimationFrame(() => window.scrollTo(0, closingDialogScrollY));
  }
  window.setTimeout(restorePendingDialogReturnFocus, 220);
  if (pendingImportantActionReturnFocus) {
    const returnFocus = pendingImportantActionReturnFocus;
    pendingImportantActionReturnFocus = null;
    window.setTimeout(() => restoreActionFocus(returnFocus), 180);
  }
}

function currentHistoryView() {
  return {
    screen: effectiveScreenForHistory(),
    newEventDraft: cloneNavigationValue(newEventDraft),
    joinEventDraft: cloneNavigationValue(joinEventDraft),
    expenseDraft: cloneNavigationValue(expenseDraft),
    eventDialog: cloneNavigationValue(eventDialog),
    groupDraft: cloneNavigationValue(groupDraft),
    editingGroupDraft: cloneNavigationValue(editingGroupDraft),
    mergeParticipantsDraft: cloneNavigationValue(mergeParticipantsDraft),
    eventRemovalMenu: cloneNavigationValue(eventRemovalMenu),
    settlementCloseConfirmation: cloneNavigationValue(settlementCloseConfirmation)
  };
}

function restoreHistoryView(view) {
  screen = view?.screen?.name ? view.screen : { name: "home" };
  newEventDraft = cloneNavigationValue(view?.newEventDraft);
  joinEventDraft = cloneNavigationValue(view?.joinEventDraft);
  expenseDraft = cloneNavigationValue(view?.expenseDraft);
  eventDialog = cloneNavigationValue(view?.eventDialog);
  groupDraft = cloneNavigationValue(view?.groupDraft);
  editingGroupDraft = cloneNavigationValue(view?.editingGroupDraft);
  mergeParticipantsDraft = cloneNavigationValue(view?.mergeParticipantsDraft);
  eventRemovalMenu = cloneNavigationValue(view?.eventRemovalMenu);
  settlementCloseConfirmation = cloneNavigationValue(view?.settlementCloseConfirmation);
  importantActionDialog = null;
  importantActionReturnFocus = null;
  clearDialogBackgroundInert();
}

function effectiveScreenForHistory() {
  if (!localProfile || screen.name === "profile") return { name: "profile" };
  return cloneNavigationValue(screen);
}

function navigationViewKey() {
  return JSON.stringify({
    screen: effectiveScreenForHistory(),
    expenseDraft: expenseDraft
      ? { eventId: expenseDraft.eventId, id: expenseDraft.id ?? "" }
      : null,
    eventDialog,
    editingGroupDraft: editingGroupDraft
      ? { id: editingGroupDraft.id ?? "", name: editingGroupDraft.name ?? "" }
      : null,
    mergeParticipantsDraft,
    eventRemovalMenu,
    settlementCloseConfirmation,
    importantActionDialog: importantActionDialog
      ? { kind: importantActionDialog.kind }
      : null
  });
}

function cloneNavigationValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function renderProfileSetup() {
  const invitedEventId = parseInviteEventId(window.location.href);
  const invitedEvent = invitedEventId ? getEvent(invitedEventId) : null;
  const isEditingProfile = Boolean(localProfile && screen.name === "profile" && !invitedEvent);
  const title = invitedEvent
    ? "קיבלת קישור לאירוע"
    : isEditingProfile
      ? "הפרופיל שלך"
      : "איך קוראים לך?";
  const helper = invitedEvent
    ? `נכניס אותך אל "${invitedEvent.name}" עם השם שתבחר. בפעם הבאה נזכור אותך במכשיר הזה.`
    : isEditingProfile
      ? "אפשר לעדכן כאן את השם שמופיע באירועים ובהוצאות שלך."
      : "נשמור את השם במכשיר הזה, כדי שהמסך יהיה אישי ונוח בכל כניסה.";

  return `
    <section class="screen profile-setup-screen">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">${isEditingProfile ? "פרופיל" : "סוגרים חשבון"}</p>
          <h1>${title}</h1>
          <p class="muted">${escapeHtml(helper)}</p>
        </div>
      </header>
      ${renderNotice()}
      ${invitedEvent ? renderInviteProfilePreview(invitedEvent) : ""}

      <section class="panel profile-setup-panel">
        ${
          isEditingProfile
            ? ""
            : `<div class="profile-brand-lockup" role="img" aria-label="סוגרים חשבון - ניהול הוצאות משותפות">
                <img src="./sogrim-logo-lockup.png" alt="" width="967" height="417" />
              </div>`
        }
        <label class="field">
          <span>שם פרטי ושם משפחה</span>
          <input data-action="profile-name" name="displayName" value="${escapeAttribute(profileNameDraft)}" placeholder="שם פרטי ושם משפחה" autocomplete="name" enterkeyhint="done" />
        </label>
        ${profileError ? `<p class="field-error">${escapeHtml(profileError)}</p>` : ""}
        <button class="primary-button" data-action="save-profile">${isEditingProfile ? "שמור שינויים" : "המשך"}</button>
      </section>
      ${isEditingProfile ? renderBackupPanel() : ""}
    </section>
  `;
}

function renderInviteProfilePreview(invitedEvent) {
  const participantCount = invitedEvent.participantIds?.length ?? 0;
  const participantLabel = participantCount
    ? `${formatCount(participantCount, "משתתף", "משתתפים")} באירוע`
    : "תיכנס בשם שלך ונחבר אותך לאירוע";

  return `
    <section class="panel invite-profile-preview" aria-label="פרטי האירוע">
      <div>
        <span>מצטרפים אל</span>
        <strong>${escapeHtml(invitedEvent.name)}</strong>
      </div>
      <p>${escapeHtml(participantLabel)}</p>
    </section>
  `;
}

function renderHome() {
  const sortedEvents = visibleEventsForParticipant(state, state.currentParticipantId)
    .sort((a, b) => creationTimestamp(b.createdAt, b.id) - creationTimestamp(a.createdAt, a.id));
  const statusCounts = countEventsByStatus(sortedEvents);
  const showEventStatusFilter = statusCounts.open > 0 && statusCounts.closed > 0;
  const events = showEventStatusFilter
    ? filterEventsByStatus(sortedEvents, eventStatusFilter)
    : sortedEvents;
  const visibleEventCount = events.length;

  return `
    <section class="screen" data-screen-kind="home">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">שלום <bdi>${escapeHtml(participantName(state.currentParticipantId))}</bdi></p>
          <h1>מה סוגרים היום?</h1>
          <p class="muted">אירוע חדש, הזמנה שקיבלת, או חשבון שכבר מחכה לסגירה.</p>
        </div>
        <div class="hero-actions is-single">
        <button class="primary-button" data-action="new-event">
          <span>אירוע חדש</span>
        </button>
        </div>
      </header>
      ${renderNotice()}

      ${renderHomeEventTools()}

      ${
        sortedEvents.length
          ? `
            <section class="section">
              <div class="section-title-row">
                <div>
                  <h2>אירועים</h2>
                  <p class="muted">${
                    visibleEventCount === sortedEvents.length
                      ? formatCount(visibleEventCount, "אירוע מוצג", "אירועים מוצגים")
                      : `${formatCount(visibleEventCount, "אירוע מוצג", "אירועים מוצגים")} מתוך ${sortedEvents.length}`
                  }</p>
                </div>
                ${showEventStatusFilter ? renderEventStatusFilter(sortedEvents) : ""}
              </div>
              <div class="event-list">
                ${
                  events.length
                    ? events.map(renderEventRow).join("")
                    : `<div class="empty-state">אין אירועים שמתאימים לסינון הזה</div>`
                }
              </div>
            </section>
          `
          : `
            <section class="section home-empty-events">
              <div class="section-title-row">
                <div>
                  <h2>אירועים</h2>
                  <p class="muted">פתח אירוע או הצטרף לקישור שקיבלת.</p>
                </div>
              </div>
              <div class="empty-state home-empty-visual">
                <img src="./sogrim-home-hero.png" alt="חברים סוגרים יחד חשבון במסעדה" width="1672" height="941" fetchpriority="high" decoding="async" />
                <strong>אין אירועים שלך עדיין</strong>
              </div>
            </section>
            `
      }
    </section>
  `;
}

function renderHomeEventTools() {
  return `
    <nav class="home-event-tools" aria-label="אפשרויות אירועים">
      <button class="secondary-button" data-action="join-event-screen" type="button">הצטרפות</button>
      <button class="secondary-button" data-action="groups" type="button">קבוצות</button>
    </nav>
  `;
}

function renderRecentEventShortcut(events) {
  const event = resolveRecentActiveEvent(events);
  if (!event) return "";

  const participants = eventParticipants(event);
  const myBalance = pendingBalanceForParticipant(
    eventSettlementTransfers(event, participants),
    state.currentParticipantId
  );
  const balanceClass = myBalance > 0 ? "is-credit" : myBalance < 0 ? "is-debt" : "is-balanced";
  const balanceLabel = myBalance > 0 ? "מגיע לך" : myBalance < 0 ? "עליך להעביר" : "אין לך יתרה פתוחה";

  return `
    <section class="recent-event-shortcut" aria-label="חזרה לאירוע האחרון">
      <button class="recent-event-main" data-action="open-event" data-event-id="${event.id}">
        <span class="recent-event-eyebrow">ממשיכים ב־</span>
        <strong>${escapeHtml(event.name)}</strong>
        <small>${formatCount(event.expenses.length, "הוצאה", "הוצאות")} · ${formatCount(participants.length, "משתתף", "משתתפים")}</small>
      </button>
      <div class="recent-event-action">
        <span class="recent-event-balance ${balanceClass}">
          <span>${escapeHtml(balanceLabel)}</span>
          ${myBalance ? `<strong class="amount">${formatEventMoney(event, Math.abs(myBalance))}</strong>` : ""}
        </span>
        <button class="primary-button" data-action="continue-event-expense" data-event-id="${event.id}">
          ${renderCommandIcon("expense")}
          <span>הוסף הוצאה</span>
        </button>
      </div>
    </section>
  `;
}

function resolveRecentActiveEvent(events) {
  const openEvents = events.filter(isEventOpen);
  if (!openEvents.length) return null;

  const recentVisit = loadRecentEventVisit();
  if (
    recentVisit &&
    Date.now() - recentVisit.openedAt <= RECENT_EVENT_MAX_AGE_MS
  ) {
    const recentEvent = openEvents.find((event) => event.id === recentVisit.eventId);
    if (recentEvent) return recentEvent;
  }

  return openEvents[0];
}

function recentEventStorageKey() {
  return `${RECENT_EVENT_STORAGE_PREFIX}:${state.currentParticipantId || "anonymous"}`;
}

function loadRecentEventVisit() {
  try {
    const visit = JSON.parse(window.localStorage.getItem(recentEventStorageKey()) || "null");
    if (
      !visit ||
      typeof visit.eventId !== "string" ||
      !Number.isFinite(visit.openedAt)
    ) {
      return null;
    }
    return visit;
  } catch {
    return null;
  }
}

function rememberRecentEvent(eventId) {
  if (!eventId || !state.currentParticipantId) return;

  try {
    window.localStorage.setItem(
      recentEventStorageKey(),
      JSON.stringify({ eventId, openedAt: Date.now() })
    );
  } catch {
    // Recent-event memory is a shortcut and must never block the event itself.
  }
}

function renderPersonalDashboard(events) {
  const currentParticipantId = state.currentParticipantId;
  const totals = events.reduce(
    (summary, event) => {
      if (isEventOpen(event)) summary.openEvents += 1;

      const participants = eventParticipants(event);
      const transfers = eventSettlementTransfers(event, participants);
      const myBalance = pendingBalanceForParticipant(transfers, currentParticipantId);
      const currency = eventCurrency(event);
      const currencyTotals = summary.byCurrency.get(currency) ?? {
        currency,
        toPay: 0,
        toReceive: 0
      };
      if (myBalance > 0) currencyTotals.toReceive += myBalance;
      if (myBalance < 0) currencyTotals.toPay += Math.abs(myBalance);
      summary.byCurrency.set(currency, currencyTotals);

      const openTransfers = transfers.filter(
        (transfer) => transfer.status !== "paid"
      );
      summary.groupPendingTransfers += openTransfers.length;
      summary.pendingTransfers += openTransfers.filter(
        (transfer) =>
          transfer.fromParticipantId === currentParticipantId ||
          transfer.toParticipantId === currentParticipantId
      ).length;

      return summary;
    },
    {
      openEvents: 0,
      pendingTransfers: 0,
      groupPendingTransfers: 0,
      byCurrency: new Map()
    }
  );
  const currencyTotals = [...totals.byCurrency.values()].filter(
    (item) => item.toPay || item.toReceive
  );

  if (!events.length || (!currencyTotals.length && !totals.pendingTransfers)) {
    return "";
  }

  const singleCurrency = currencyTotals.length === 1 ? currencyTotals[0] : null;
  const netBalance = singleCurrency
    ? singleCurrency.toReceive - singleCurrency.toPay
    : 0;
  const balanceDirection = singleCurrency
    ? netBalance > 0
      ? "credit"
      : netBalance < 0
        ? "debt"
        : "balanced"
    : "balanced";
  const balanceLabel = singleCurrency
    ? balanceDirection === "credit"
        ? "מגיע לך"
      : balanceDirection === "debt"
        ? "עליך להעביר"
        : "אתה מאוזן"
    : currencyTotals.length
      ? "המאזן מופרד לפי מטבע"
      : "אתה מאוזן";
  const headlineValue = singleCurrency
    ? formatCurrency(Math.abs(netBalance), singleCurrency.currency)
    : currencyTotals.length
      ? `${currencyTotals.length} מטבעות`
      : formatCurrency(0);

  return `
    <section class="panel personal-dashboard">
      <div class="personal-balance-main">
        <span>המאזן שלך</span>
        <strong class="amount is-${balanceDirection}">${headlineValue}</strong>
        <p>${balanceLabel}</p>
      </div>
      <div class="personal-balance-details" aria-label="פירוט המאזן שלך">
        <div>
          <span>אירועים פתוחים</span>
          <strong>${totals.openEvents}</strong>
        </div>
        ${
          currencyTotals.length
            ? currencyTotals
                .map(
                  (item) => `
                    <div class="personal-currency-balance">
                      <span>${escapeHtml(item.currency)}</span>
                      <strong>
                        ${
                          item.toPay
                            ? `<bdi class="amount is-debt">לשלם ${formatCurrency(item.toPay, item.currency)}</bdi>`
                            : ""
                        }
                        ${
                          item.toReceive
                            ? `<bdi class="amount is-credit">לקבל ${formatCurrency(item.toReceive, item.currency)}</bdi>`
                            : ""
                        }
                      </strong>
                    </div>
                  `
                )
                .join("")
            : `
                <div>
                  <span>יתרה</span>
                  <strong>הכול מאוזן</strong>
                </div>
              `
        }
      </div>
      <div class="personal-next-step">
        <span>${
          totals.pendingTransfers
            ? totals.groupPendingTransfers > totals.pendingTransfers
              ? `${totals.pendingTransfers} אליך · ${totals.groupPendingTransfers} בקבוצה`
              : `${formatCount(totals.pendingTransfers, "העברה שקשורה אליך", "העברות שקשורות אליך")} עדיין ${totals.pendingTransfers === 1 ? "פתוחה" : "פתוחות"}`
            : "אין העברות פתוחות שקשורות אליך"
        }</span>
      </div>
    </section>
  `;
}

function renderPersonalActionList(events) {
  const actions = collectPersonalTransferActions(events);

  if (!actions.length) {
    return `<section class="section personal-actions-section is-empty-personal-actions" hidden></section>`;
  }

  return `
    <section class="section personal-actions-section">
      <div class="section-title-row">
        <div>
          <h2>מה עכשיו?</h2>
          <p class="muted">רק דברים שקשורים אליך, בלי להציף את כל החשבון.</p>
        </div>
      </div>
      <div class="personal-action-list">
        ${actions.slice(0, 4).map(renderPersonalTransferAction).join("")}
      </div>
    </section>
  `;
}

function collectPersonalTransferActions(events) {
  const currentParticipantId = state.currentParticipantId;

  return events
    .flatMap((event) => {
      const participants = eventParticipants(event);
      return eventSettlementTransfers(event, participants)
        .filter(
          (transfer) =>
            transfer.status !== "paid" &&
            (transfer.fromParticipantId === currentParticipantId ||
              transfer.toParticipantId === currentParticipantId)
        )
        .map((transfer) => ({
          event,
          transfer,
          direction: transfer.fromParticipantId === currentParticipantId ? "pay" : "receive"
        }));
    })
    .sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === "pay" ? -1 : 1;
      return Date.parse(b.event.createdAt ?? 0) - Date.parse(a.event.createdAt ?? 0);
    });
}

function renderPersonalTransferAction(action) {
  const { event, transfer, direction } = action;
  const otherParticipantId =
    direction === "pay" ? transfer.toParticipantId : transfer.fromParticipantId;
  const title =
    direction === "pay"
      ? `להעביר ל${participantName(otherParticipantId)}`
      : `צפויה אליך העברה מאת ${participantName(otherParticipantId)}`;
  const helper =
    direction === "pay"
      ? `מתוך האירוע "${event.name}"`
      : `כדאי לפתוח סיכום ולסמן כששולם`;

  return `
    <button class="personal-action-card ${direction === "pay" ? "is-debt" : "is-credit"}" data-action="settle" data-event-id="${event.id}">
      <span class="personal-action-card-main">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(helper)}</small>
      </span>
      <span class="amount">${formatEventMoney(event, transfer.amount)}</span>
    </button>
  `;
}

function renderEventStatusFilter(events) {
  const counts = countEventsByStatus(events);

  return `
    <div class="segmented-control" role="group" aria-label="סינון אירועים">
      ${EVENT_STATUS_FILTERS.map(
        (filter) => `
          <button
            type="button"
            class="${eventStatusFilter === filter.id ? "is-active" : ""}"
            data-action="event-status-filter"
            data-filter="${filter.id}"
            aria-pressed="${eventStatusFilter === filter.id}"
          >
            <span>${filter.label}</span>
            <strong>${counts[filter.id]}</strong>
          </button>
        `
      ).join("")}
    </div>
  `;
}

function renderNotice() {
  return notice
    ? `<p class="notice" role="status" aria-live="polite">${escapeHtml(notice)}</p>`
    : "";
}

function renderAppBackButton() {
  const disabled = canNavigateBackWithinApp() ? "" : "disabled";
  return `
    <button class="icon-button app-back-button" data-action="go-back" aria-label="&#1495;&#1494;&#1512;&#1492; &#1500;&#1502;&#1505;&#1498; &#1492;&#1511;&#1493;&#1491;&#1501;" title="&#1495;&#1494;&#1512;&#1492; &#1500;&#1502;&#1505;&#1498; &#1492;&#1511;&#1493;&#1491;&#1501;" ${disabled}>
      <span class="app-back-button-glyph" aria-hidden="true">&#8250;</span>
      <span class="app-back-button-label">&#1495;&#1494;&#1512;&#1492;</span>
    </button>
  `;
}

function canNavigateBackWithinApp() {
  if (screen.name === "home") return false;

  return Boolean(
    appHistoryDepth > 0 ||
      screen.name !== "home" ||
      expenseDraft ||
      eventDialog ||
      editingGroupDraft ||
      settlementCloseConfirmation ||
      importantActionDialog ||
      eventRemovalMenu
  );
}

function renderProfileSummary() {
  return `
    <section class="panel profile-panel">
      <div class="profile-summary">
        ${renderAvatar(state.currentParticipantId)}
        <div>
          <span>אתה נכנס בתור</span>
          <strong>${escapeHtml(participantName(state.currentParticipantId))}</strong>
          <small class="profile-memory-status">${escapeHtml(profileMemoryLabel())}</small>
        </div>
        <button class="secondary-button" data-action="edit-profile">החלף שם</button>
      </div>
    </section>
  `;
}

function profileMemoryLabel() {
  if (localProfile?.authProvider === "google") {
    return "מחובר עם Google";
  }
  if (localProfile?.authProvider === "apple") {
    return "מחובר עם Apple";
  }
  if (localProfile?.authProvider === "email") {
    return "מחובר לחשבון האישי";
  }

  return "נשמר עבורך במכשיר הזה";
}

function renderBackupPanel() {
  return `
    <section class="panel backup-panel">
      <div class="section-title-row">
        <div>
          <h2>גיבוי ושחזור</h2>
          <p class="muted">שמירה ידנית של כל הקבוצות, האירועים וההוצאות בקובץ אחד.</p>
        </div>
        <div class="section-title-actions">
          <button class="secondary-button" data-action="export-state">ייצא גיבוי</button>
          <label class="secondary-button file-button">
            שחזר מגיבוי
            <input class="visually-hidden" type="file" data-action="import-state-file" accept="application/json" />
          </label>
        </div>
      </div>
    </section>
  `;
}

function renderGroups() {
  if (!groupDraft) {
    groupDraft = {
      name: "",
      memberIds: [state.currentParticipantId],
      newMemberName: ""
    };
  }
  ensureMergeParticipantsDraft();

  const activeGroups = visibleGroupsForParticipant(state, state.currentParticipantId)
    .sort((a, b) => creationTimestamp(b.createdAt, b.id) - creationTimestamp(a.createdAt, a.id));

  return `
    <section class="screen" data-screen-kind="groups">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">קבוצות</p>
          <h1>חברים שחוזרים על עצמם</h1>
          <p class="muted">קבוצה רק חוסכת בחירת משתתפים. האירוע עצמו עדיין נפרד.</p>
        </div>
      </header>

      <section class="panel group-create-panel">
        <h2>קבוצה חדשה</h2>
        <label class="field">
          <span>שם הקבוצה</span>
          <input data-action="group-name" name="groupName" autocomplete="off" enterkeyhint="next" value="${escapeAttribute(groupDraft.name)}" placeholder="למשל: החברים מהעבודה…" required />
        </label>

        <h3>חברי קבוצה</h3>
        ${renderParticipantChecks(groupDraft.memberIds, "group-member")}

        <div class="inline-actions section">
          <input class="guest-input" data-action="group-member-name" name="groupMemberName" autocomplete="off" enterkeyhint="done" aria-label="שם חבר חדש" placeholder="שם חבר חדש…" value="${escapeAttribute(groupDraft.newMemberName)}" />
          <button class="secondary-button" data-action="group-add-member">הוסף חבר</button>
        </div>

        <button class="primary-button section" data-action="create-group" ${!groupDraft.name.trim() || groupDraft.memberIds.length === 0 ? "disabled" : ""}>שמור קבוצה</button>
      </section>

      ${renderEditGroupPanel()}

      <section class="section">
        <h2>קבוצות פעילות</h2>
        <div class="stack">
          ${
            activeGroups.length
              ? activeGroups.map(renderGroupRow).join("")
              : `<div class="empty-state">אין קבוצות פעילות עדיין</div>`
          }
        </div>
      </section>

      ${renderKnownParticipantsPanel()}
      ${renderMergeParticipantsPanel()}
    </section>
  `;
}

function renderEditGroupPanel() {
  if (!editingGroupDraft) return "";

  return `
    <section class="panel section edit-group-panel">
      <div class="section-title-row">
        <div>
          <h2>עריכת קבוצה</h2>
          <p class="muted">שינוי כאן ישפיע על אירועים חדשים שתפתח מהקבוצה. אירועים קיימים נשארים כמו שהיו.</p>
        </div>
        <button class="icon-button" data-action="cancel-edit-group" aria-label="סגור" title="סגור">×</button>
      </div>

      <label class="field">
        <span>שם הקבוצה</span>
        <input data-action="edit-group-name" name="editGroupName" autocomplete="off" enterkeyhint="next" value="${escapeAttribute(editingGroupDraft.name)}" />
      </label>

      <section class="section">
        <h3>חברי קבוצה</h3>
        ${renderParticipantChecks(editingGroupDraft.memberIds, "edit-group-member")}
      </section>

      <section class="section">
        <h3>מנהלים</h3>
        ${renderParticipantChecks(editingGroupDraft.adminIds, "edit-group-admin")}
      </section>

      <div class="inline-actions section">
        <input class="guest-input" data-action="edit-group-member-name" name="editGroupMemberName" autocomplete="off" enterkeyhint="done" aria-label="שם חבר חדש" placeholder="שם חבר חדש…" value="${escapeAttribute(editingGroupDraft.newMemberName)}" />
        <button class="secondary-button" data-action="edit-group-add-member">הוסף חבר</button>
      </div>

      <div class="actions section">
        <button class="primary-button" data-action="save-edit-group" ${editingGroupDraft.memberIds.length === 0 ? "disabled" : ""}>שמור שינויים</button>
        <button class="secondary-button" data-action="cancel-edit-group">ביטול</button>
      </div>
    </section>
  `;
}

function renderGroupRow(group) {
  return `
    <article class="group-row">
      <div>
        <strong>${escapeHtml(group.name)}</strong>
        ${renderOpenedAt(group.createdAt, group.id)}
        <small>${formatCount(group.memberIds.length, "חבר קבוע", "חברים קבועים")}</small>
      </div>
      <div class="section-title-actions">
        <button class="secondary-button" data-action="edit-group" data-group-id="${group.id}">עריכה</button>
        <button class="secondary-button danger-button" data-action="archive-group" data-group-id="${group.id}">ארכוב</button>
      </div>
    </article>
  `;
}

function renderKnownParticipantsPanel() {
  return `
    <section class="panel section known-participants-panel">
      <div class="section-title-row">
        <div>
          <h2>שמות שנשמרו</h2>
          <p class="muted">כאן מנהלים שמות ששמרת. אפשר להסיר שם שלא מופיע בהוצאות קיימות.</p>
        </div>
      </div>
      <div class="stack">
        ${
          state.participants.length
            ? state.participants.map(renderKnownParticipantRow).join("")
            : `<div class="empty-state">עדיין לא נשמרו שמות</div>`
        }
      </div>
    </section>
  `;
}

function renderMergeParticipantsPanel() {
  if (state.participants.length < 2 || !mergeParticipantsDraft) return "";

  const sourceOptions = state.participants
    .filter((participant) => participant.id !== mergeParticipantsDraft.targetId)
    .map((participant) => renderParticipantOption(participant, mergeParticipantsDraft.sourceId))
    .join("");
  const targetOptions = state.participants
    .filter((participant) => participant.id !== mergeParticipantsDraft.sourceId)
    .map((participant) => renderParticipantOption(participant, mergeParticipantsDraft.targetId))
    .join("");
  const disabled =
    !mergeParticipantsDraft.sourceId ||
    !mergeParticipantsDraft.targetId ||
    mergeParticipantsDraft.sourceId === mergeParticipantsDraft.targetId;

  return `
    <section class="panel section merge-participants-panel">
      <div class="section-title-row">
        <div>
          <h2>איחוד שמות כפולים</h2>
          <p class="muted">אם אותו אדם נכנס כאורח ואז כמשתמש, מאחדים את כל ההיסטוריה שלו לשם אחד.</p>
        </div>
      </div>
      <div class="merge-participants-grid">
        <label class="field">
          <span>שם שמאחדים ומסירים</span>
          <select data-action="merge-source">${sourceOptions}</select>
        </label>
        <label class="field">
          <span>השם שנשאר</span>
          <select data-action="merge-target">${targetOptions}</select>
        </label>
      </div>
      <button class="primary-button section" data-action="merge-participants" ${disabled ? "disabled" : ""}>אחד שמות</button>
    </section>
  `;
}

function renderParticipantOption(participant, selectedId) {
  return `
    <option value="${escapeAttribute(participant.id)}" ${participant.id === selectedId ? "selected" : ""}>
      ${escapeHtml(participant.displayName)}
    </option>
  `;
}

function renderKnownParticipantRow(participant) {
  const isCurrent = participant.id === state.currentParticipantId;
  const canRemove = canRemoveParticipant(state, participant.id);
  const helper = isCurrent
    ? "זה השם שלך במכשיר הזה"
    : canRemove
      ? "לא מופיע בהוצאות, אפשר להסיר"
      : "מופיע בהוצאה קיימת";

  return `
    <article class="group-row known-participant-row">
      <div class="known-participant-main">
        ${renderAvatar(participant.id)}
        <span>
          <strong>${escapeHtml(participant.displayName)}</strong>
          <small>${helper}</small>
        </span>
      </div>
      <button class="secondary-button danger-button" data-action="remove-participant" data-participant-id="${participant.id}" ${canRemove ? "" : "disabled"}>הסר</button>
    </article>
  `;
}

function renderEventRow(event) {
  const participants = eventParticipants(event);
  const transfers = eventSettlementTransfers(event, participants);
  const pendingPersonalTransfers = transfers.filter(
    (transfer) =>
      transfer.status !== "paid" &&
      (transfer.fromParticipantId === state.currentParticipantId ||
        transfer.toParticipantId === state.currentParticipantId)
  );
  const needsPayment = pendingPersonalTransfers.some(
    (transfer) => transfer.fromParticipantId === state.currentParticipantId
  );
  const awaitsReceipt = pendingPersonalTransfers.some(
    (transfer) => transfer.toParticipantId === state.currentParticipantId
  );
  const amountToPay = pendingPersonalTransfers
    .filter((transfer) => transfer.fromParticipantId === state.currentParticipantId)
    .reduce((sum, transfer) => sum + transfer.amount, 0);
  const amountToReceive = pendingPersonalTransfers
    .filter((transfer) => transfer.toParticipantId === state.currentParticipantId)
    .reduce((sum, transfer) => sum + transfer.amount, 0);
  const attentionLabel = needsPayment
    ? `עליך להעביר ${formatEventMoney(event, amountToPay)}`
    : awaitsReceipt
      ? `מגיע לך ${formatEventMoney(event, amountToReceive)}`
      : "";
  const attentionClass = needsPayment ? "is-action" : "is-waiting";
  const statusClass = isEventClosed(event) ? "is-locked" : "is-open";
  const statusLabel = isEventClosed(event) ? "סגור" : "פתוח";

  return `
    <button
      class="event-row"
      type="button"
      data-action="open-event"
      data-event-id="${event.id}"
      data-long-press-event="true"
      aria-haspopup="dialog"
    >
      <span class="event-row-main">
        <span class="event-row-title"><strong>${escapeHtml(event.name)}</strong></span>
        ${renderOpenedAt(event.createdAt, event.id)}
      </span>
      <span class="event-row-side">
        ${attentionLabel ? `<span class="event-row-attention ${attentionClass}">${attentionLabel}</span>` : ""}
        <span class="status-chip ${statusClass}">${statusLabel}</span>
      </span>
      <span class="visually-hidden">לחיצה ארוכה מציגה אפשרות להסרת האירוע.</span>
    </button>
  `;
}

function ensureNewEventDraft() {
  if (!newEventDraft) {
    const visibleGroups = visibleGroupsForParticipant(state, state.currentParticipantId);
    const defaultGroup = visibleGroups[0];
    newEventDraft = {
      name: "",
      eventType: "",
      managementMode: EVENT_MANAGEMENT_COLLABORATIVE,
      currency: "ILS",
      groupId: defaultGroup?.id ?? "",
      participantIds: defaultGroup?.memberIds ? [...defaultGroup.memberIds] : [state.currentParticipantId],
      guestName: ""
    };
  }
}

function renderNewEventType() {
  ensureNewEventDraft();

  return `
    <section class="screen new-event-type-screen" data-screen-kind="new-event" data-event-creation-step="type">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">אירוע חדש</p>
          <h1>איזה אירוע פותחים?</h1>
        </div>
      </header>

      ${renderEventCreationProgress("type")}

      <section class="panel create-event-panel event-type-step-panel">
        <div class="event-type-options" role="radiogroup" aria-label="סוג האירוע">
          ${eventTypeOptions()
            .map(
              (type) => `
                <button
                  type="button"
                  class="event-type-option ${newEventDraft.eventType === type.id ? "is-active" : ""}"
                  data-action="new-event-type"
                  data-event-type="${type.id}"
                  role="radio"
                  aria-checked="${newEventDraft.eventType === type.id}"
                >
                  <strong>${escapeHtml(type.label)}</strong>
                  <span>${escapeHtml(type.description)}</span>
                  ${renderForwardChevron()}
                </button>
              `
            )
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderNewEventManagement() {
  ensureNewEventDraft();
  const selectedType = eventTypeConfig(newEventDraft.eventType);

  return `
    <section class="screen new-event-management-screen" data-screen-kind="new-event" data-event-creation-step="management" data-event-type="${escapeAttribute(selectedType.id)}">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">${escapeHtml(selectedType.label)}</p>
          <h1>איך מנהלים את האירוע?</h1>
        </div>
      </header>

      ${renderEventCreationProgress("management")}

      <section class="panel create-event-panel event-management-step-panel">
        <div class="section-title-row">
          <div>
            <h2>מי יעדכן את ההוצאות?</h2>
            <p class="muted">בוחרים את הדרך שמתאימה לאירוע. אפשר לשנות אותה אחר כך בהגדרות.</p>
          </div>
        </div>
        ${renderEventManagementOptions({
          selectedMode: newEventDraft.managementMode,
          action: "new-event-management-mode",
          showLegend: false
        })}
      </section>
    </section>
  `;
}

function renderNewEvent() {
  ensureNewEventDraft();
  const selectedType = eventTypeConfig(newEventDraft.eventType);
  const availableGroups = visibleGroupsForParticipant(state, state.currentParticipantId);
  const selectedParticipantLabel = formatCount(
    newEventDraft.participantIds.length,
    "משתתף נבחר",
    "משתתפים נבחרו"
  );

  return `
    <section class="screen new-event-details-screen" data-screen-kind="new-event" data-event-creation-step="details" data-event-type="${escapeAttribute(selectedType.id)}">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">${escapeHtml(selectedType.label)}</p>
          <h1>${escapeHtml(selectedType.creationTitle || "אירוע חדש")}</h1>
        </div>
      </header>

      ${renderEventCreationProgress("details")}

      <section class="panel create-event-panel">
        <div class="section-title-row">
          <div>
            <h2>איך נקרא לאירוע?</h2>
            <p class="muted">נותנים שם וממשיכים. את המשתתפים אפשר לשנות גם אחר כך.</p>
          </div>
        </div>
        <label class="field">
          <span>שם האירוע</span>
          <input data-action="new-event-name" name="eventName" autocomplete="off" enterkeyhint="next" value="${escapeAttribute(newEventDraft.name)}" placeholder="${escapeAttribute(eventTypeConfig(newEventDraft.eventType).namePlaceholder || EVENT_NAME_PLACEHOLDER)}" />
        </label>
        <label class="field event-currency-field">
          <span>מטבע האירוע</span>
          <select data-action="new-event-currency" name="eventCurrency">
            ${renderCurrencyOptions(newEventDraft.currency)}
          </select>
          <small>כל ההוצאות וההעברות באירוע יוצגו במטבע הזה.</small>
        </label>

        <details class="new-event-participants">
          <summary>
            <span class="new-event-participants-summary">
              <strong>משתתפים</strong>
              <span data-new-event-participant-count aria-live="polite">${escapeHtml(selectedParticipantLabel)}</span>
            </span>
            <span class="new-event-participants-action">שינוי</span>
          </summary>
          <div class="new-event-participants-body">
            ${
              availableGroups.length
                ? `
                  <label class="field">
                    <span>קבוצה קבועה <small>(לא חובה)</small></span>
                    <select data-action="new-event-group" name="eventGroup">
                      <option value="" ${newEventDraft.groupId === "" ? "selected" : ""}>ללא קבוצה קבועה</option>
                      ${availableGroups
                        .map(
                          (group) => `
                            <option value="${group.id}" ${newEventDraft.groupId === group.id ? "selected" : ""}>
                              ${escapeHtml(groupSelectLabel(group))}
                            </option>
                          `
                        )
                        .join("")}
                    </select>
                  </label>
                `
                : ""
            }

            <section class="new-event-participant-picker">
              <h3>מי משתתף?</h3>
              ${renderParticipantChecks(newEventDraft.participantIds, "new-event-participant")}
            </section>

            <div class="inline-actions">
              <input class="guest-input" data-action="new-event-guest-name" name="guestName" autocomplete="off" enterkeyhint="done" aria-label="שם אורח" placeholder="שם אורח" value="${escapeAttribute(newEventDraft.guestName)}" />
              <button class="secondary-button" data-action="new-event-add-guest">הוסף אורח</button>
            </div>
          </div>
        </details>

        <div class="actions section">
          <button class="primary-button create-event-submit" data-action="create-event" ${newEventDraft.participantIds.length === 0 ? "disabled" : ""}>${escapeHtml(eventTypeConfig(newEventDraft.eventType).createLabel)}</button>
          <button class="secondary-button" data-action="home">ביטול</button>
        </div>
      </section>
    </section>
  `;
}

function syncNewEventParticipantControls() {
  if (!newEventDraft) return;

  const selectedIds = new Set(newEventDraft.participantIds);
  app.querySelectorAll('[data-action="new-event-participant"]').forEach((input) => {
    input.checked = selectedIds.has(input.dataset.participantId);
  });

  const count = newEventDraft.participantIds.length;
  const countNode = app.querySelector("[data-new-event-participant-count]");
  if (countNode) {
    countNode.textContent = formatCount(count, "משתתף נבחר", "משתתפים נבחרו");
  }

  const createButton = app.querySelector('[data-action="create-event"]');
  if (createButton) createButton.disabled = count === 0;
}

function renderEventCreationProgress(activeStep) {
  const steps = [
    { id: "type", label: "סוג" },
    { id: "management", label: "ניהול" },
    { id: "details", label: "פרטים" }
  ];
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeStep));

  return `
    <ol class="event-creation-progress" aria-label="שלבי יצירת אירוע">
      ${steps
        .map(
          (step, index) => `
            <li class="${index === activeIndex ? "is-active" : index < activeIndex ? "is-complete" : ""}" ${index === activeIndex ? 'aria-current="step"' : ""}>
              <span aria-hidden="true">${index + 1}</span>
              <strong>${step.label}</strong>
            </li>
          `
        )
        .join("")}
    </ol>
  `;
}

function renderJoinEvent() {
  ensureJoinEventDraft();

  return `
    <section class="screen" data-screen-kind="join-event">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">אירועים</p>
          <h1>הצטרפות לאירוע</h1>
          <p class="muted">מדביקים קישור שקיבלת מחבר ונכנסים ישר לאירוע.</p>
        </div>
      </header>

      <section class="panel join-event-panel">
        <label class="field">
          <span>קישור לאירוע</span>
          <input
            data-action="join-event-link"
            type="url"
            inputmode="url"
            name="joinEventLink"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="go"
            dir="ltr"
            value="${escapeAttribute(joinEventDraft.link)}"
            placeholder="https://sogrim-hashbon.vercel.app/?event=…"
            ${joinEventDraft.error ? 'aria-invalid="true" aria-describedby="join-event-error"' : ""}
          />
        </label>
        ${joinEventDraft.error ? `<p class="field-error" id="join-event-error" role="alert">${escapeHtml(joinEventDraft.error)}</p>` : ""}
        <div class="actions section">
          <button class="primary-button" data-action="join-existing-event">הצטרף לאירוע</button>
          <button class="secondary-button" data-action="cancel-join-event" type="button">ביטול וחזרה לבית</button>
        </div>
      </section>
    </section>
  `;
}

function renderEvent(event) {
  rememberRecentEvent(event.id);
  const participants = eventParticipants(event);
  const total = event.expenses.reduce((sum, expense) => sum + expense.total, 0);
  const canEdit = canCurrentParticipantEdit(event);
  const canManage = canCurrentParticipantManage(event);
  const adminNames =
    eventAdminIds(state, event).map(participantName).join(", ") || "אין מנהל";
  const type = eventTypeConfig(event.eventType);
  const isEmptyEvent = event.expenses.length === 0;

  return `
    <section class="screen${isEmptyEvent ? "" : " event-has-action-dock"}" data-screen-kind="event" data-event-id="${escapeAttribute(event.id)}">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">אירוע</p>
          <h1>${escapeHtml(event.name)}</h1>
          <p class="muted">${escapeHtml(type.label)} · ${escapeHtml(currencySelectLabel(event.currency))} · ${formatCount(participants.length, "משתתף", "משתתפים")} · ${formatCount(event.expenses.length, "הוצאה", "הוצאות")}</p>
          ${renderOpenedAt(event.createdAt, event.id)}
        </div>
        <div class="hero-actions event-header-actions">
          <button class="secondary-button event-header-utility-button" data-action="open-event-participants" data-event-id="${event.id}" aria-label="משתתפים באירוע" title="משתתפים באירוע"><span class="event-header-action-label">משתתפים</span></button>
          <button class="secondary-button event-header-utility-button" data-action="open-event-share" data-event-id="${event.id}" aria-label="שיתוף והצטרפות לאירוע" title="שיתוף והצטרפות לאירוע"><span class="event-header-action-label">שיתוף</span></button>
          <button class="secondary-button event-settings-button event-header-utility-button" data-action="open-event-settings" data-event-id="${event.id}" aria-label="הגדרות האירוע" title="הגדרות האירוע"><span class="event-settings-label event-header-action-label">הגדרות</span></button>
        </div>
      </header>
      ${renderNotice()}
      ${renderEventWorkspaceNav(event)}
      ${isEmptyEvent ? "" : renderEventPersonalBalance(event, participants)}

      ${isEmptyEvent ? renderEventStartPanel(event) : ""}

      <section class="panel permissions-panel event-inline-panel" hidden>
        <div class="section-title-row">
          <div>
            <h2>הרשאות</h2>
            <p class="muted">מנהל: ${escapeHtml(adminNames)}</p>
          </div>
          <button class="secondary-button" data-action="toggle-admin-edit" data-event-id="${event.id}" ${!canManage || event.locked ? "disabled" : ""}>
            ${event.adminsCanEditOnly ? "אפשר לכולם לערוך" : "רק מנהלים עורכים"}
          </button>
        </div>
      </section>

      ${expenseDraft?.eventId === event.id ? renderExpenseForm(event) : ""}
      ${eventDialog?.eventId === event.id ? renderEventDialog(event) : ""}

      ${
        event.expenses.length
          ? `
              <section class="section" id="event-expenses">
                <h2>הוצאות</h2>
                <div class="stack">${renderEventExpenseGroups(event)}</div>
              </section>
            `
          : ""
      }
      ${isEmptyEvent ? "" : renderEventActionDock(event, total, canEdit)}
    </section>
  `;
}

function renderEventActionDock(event, total, canEdit) {
  return `
    <aside class="event-action-dock" aria-label="פעולות באירוע">
      <div class="event-action-total">
        <span>סה"כ באירוע</span>
        <strong class="amount">${formatEventMoney(event, total)}</strong>
        <span class="event-action-sync-wrap">
          <small class="event-action-sync" data-inline-sync-status hidden></small>
          <button type="button" class="event-action-sync-retry" data-inline-sync-retry data-sync-retry hidden>נסה שוב</button>
        </span>
      </div>
      <button class="primary-button" data-action="show-expense-form" data-event-id="${event.id}" ${!canEdit ? "disabled" : ""}>
        ${renderCommandIcon("expense")}
        <span>${canEdit ? "הוסף הוצאה" : "האירוע סגור"}</span>
      </button>
    </aside>
  `;
}

function renderEventPersonalBalance(event, participants) {
  const pendingTransfers = eventSettlementTransfers(event, participants).filter(
    (transfer) => transfer.status !== "paid"
  );
  const personalTransfers = pendingTransfers.filter(
    (transfer) =>
      transfer.fromParticipantId === state.currentParticipantId ||
      transfer.toParticipantId === state.currentParticipantId
  );
  const personalBalance = pendingBalanceForParticipant(
    personalTransfers,
    state.currentParticipantId
  );
  if (personalTransfers.length === 0 && personalBalance === 0) {
    return `<p class="visually-hidden" role="status">אין לך העברה פתוחה באירוע הזה.</p>`;
  }
  const balanceDirection =
    personalBalance > 0 ? "credit" : personalBalance < 0 ? "debt" : "balanced";
  const balanceLabel =
    personalBalance > 0 ? "מגיע לך" : personalBalance < 0 ? "עליך להעביר" : "אתה מאוזן";
  const counterpartIds = [
    ...new Set(
      personalTransfers.map((transfer) =>
        transfer.fromParticipantId === state.currentParticipantId
          ? transfer.toParticipantId
          : transfer.fromParticipantId
      )
    )
  ];
  const counterpartLabel =
    counterpartIds.length === 1
      ? `מול ${participantName(counterpartIds[0])}`
      : counterpartIds.length > 1
        ? `מול ${formatCount(counterpartIds.length, "משתתף", "משתתפים")}`
        : "אין לך העברה פתוחה";

  return `
    <button
      type="button"
      class="event-personal-balance is-${balanceDirection}"
      data-action="settle"
      data-event-id="${event.id}"
      aria-label="${escapeAttribute(`${balanceLabel}: ${formatEventMoney(event, Math.abs(personalBalance))}. ${counterpartLabel}. פתיחת הסיכום`)}"
    >
      <span class="event-personal-balance-copy">
        <small>המצב שלך</small>
        <strong>${escapeHtml(balanceLabel)}</strong>
        <span>${escapeHtml(counterpartLabel)}</span>
      </span>
      <span class="event-personal-balance-value">
        <strong class="amount">${formatEventMoney(event, Math.abs(personalBalance))}</strong>
        <span>לסיכום <span aria-hidden="true">‹</span></span>
      </span>
    </button>
  `;
}

function renderEventStartPanel(event) {
  const type = eventTypeConfig(event.eventType);
  const participantCount = eventParticipants(event).length;
  const expenseButton = `
    <button class="primary-button event-start-primary" data-action="show-expense-form" data-event-id="${event.id}" ${!canCurrentParticipantEdit(event) ? "disabled" : ""}>
      ${renderCommandIcon("expense")}
      <span>${escapeHtml(type.actionLabel.replace("מסעדה", "" ).trim() || "הוסף חשבון")}</span>
    </button>`;

  return `
    <section class="panel event-start-panel" id="event-expenses" aria-labelledby="event-start-title">
      <div class="event-start-copy">
        <span class="event-type-chip">${escapeHtml(type.label)}</span>
        <h2 id="event-start-title">אין עדיין הוצאות</h2>
        <p>${formatCount(participantCount, "משתתף", "משתתפים")}</p>
      </div>
      ${expenseButton}
    </section>
  `;
}

function renderEventTypeGuide(event) {
  const type = eventTypeConfig(event.eventType);
  if (type.id === "standard") return "";

  const guide = type.id === EVENT_TYPE_RESTAURANT
    ? {
        title: "חשבון לפי מנות, בלי חישובים בראש",
        description: "מוסיפים כל מנה או פריט, בוחרים מי אכל או שתה, והחלוקה מתעדכנת מיד."
      }
    : {
        title: "כל ימי הטיול נשארים באירוע אחד",
        description: "מוסיפים הוצאות עם תאריך והן מסתדרות אוטומטית לפי ימים עד לסיכום הסופי."
      };

  return `
    <section class="event-type-guide event-type-guide-${type.id}" aria-label="איך עובדים באירוע ${escapeAttribute(type.label)}">
      <span class="event-type-chip">${escapeHtml(type.label)}</span>
      <div>
        <strong>${escapeHtml(guide.title)}</strong>
        <p>${escapeHtml(guide.description)}</p>
      </div>
    </section>
  `;
}

function renderEventWorkspaceNav(event) {
  return `
    <nav class="event-workspace-nav" aria-label="ניווט באירוע">
      <a class="event-workspace-tab is-active" href="#event-expenses" aria-current="page">הוצאות</a>
      <button type="button" class="event-workspace-tab" data-action="settle" data-event-id="${event.id}" ${event.expenses.length === 0 ? "disabled" : ""}>סיכום</button>
    </nav>
  `;
}

function renderEventInsightPanel(event, insights) {
  const message = eventInsightMessage(insights.status);
  const primaryAction = eventInsightPrimaryAction(event, insights.status);

  return `
    <section class="panel event-insight-panel">
      <div class="event-insight-main">
        <span class="status-chip ${insights.status === "needs-review" ? "is-locked" : "is-open"}">${escapeHtml(message.label)}</span>
        <h2>${escapeHtml(message.title)}</h2>
        <p class="muted">${escapeHtml(message.description)}</p>
        ${primaryAction}
      </div>
      <div class="event-insight-metrics" aria-label="מצב האירוע">
        <div><span>הוצאות</span><strong>${insights.expenseCount}</strong></div>
        <div><span>משתתפים</span><strong>${insights.participantCount}</strong></div>
        <div><span>פתוח להעברה</span><strong class="amount">${formatEventMoney(event, insights.pendingTotal)}</strong></div>
        <div><span>בדיקה</span><strong>${insights.invalidExpenseCount ? `${insights.invalidExpenseCount} לתקן` : "תקין"}</strong></div>
      </div>
    </section>
  `;
}

function eventInsightMessage(status) {
  const messages = {
    empty: {
      label: "מתחילים",
      title: "עוד לא נוספה הוצאה",
      description: "הכפתור הראשון פותח חלון נקי להוצאה, ואחרי השמירה חוזרים לכאן."
    },
    "ready-to-settle": {
      label: "מוכן לסיכום",
      title: "אפשר לראות מי מעביר למי",
      description: "החישוב כבר מתחשב במי שילם, מי השתתף בכל הוצאה, ובכמה העברות צריך לסגור."
    },
    balanced: {
      label: "מאוזן",
      title: "האירוע מאוזן",
      description: "אפשר עדיין להוסיף הוצאות, או לסגור את האירוע כדי לשמור את המצב."
    },
    "pending-payments": {
      label: "ממתין להעברות",
      title: "נשאר לסמן תשלומים",
      description: "ברגע שמישהו שילם, מסמנים את ההעברה והסכום הפתוח מתעדכן."
    },
    settled: {
      label: "הכול שולם",
      title: "כל ההעברות סומנו כשולמו",
      description: "האירוע עדיין פתוח. אפשר להוסיף הוצאות, או לסגור ולנעול אותו מתוך הסיכום."
    },
    closed: {
      label: "סגור",
      title: "האירוע נסגר",
      description: "אפשר לפתוח לעריכה מההגדרות אם צריך לתקן משהו."
    },
    "needs-review": {
      label: "צריך בדיקה",
      title: "יש הוצאה שצריך לתקן",
      description: "כדאי לעבור על ההוצאות ולוודא שסכומי המשלמים שווים לסכום הכולל ושיש משתתפים מסומנים."
    }
  };

  return messages[status] ?? messages.empty;
}

function eventInsightPrimaryAction(event, status) {
  if (status === "empty" || status === "needs-review") {
    return `<button class="primary-button" data-action="show-expense-form" data-event-id="${event.id}" ${!canCurrentParticipantEdit(event) ? "disabled" : ""}>${escapeHtml(eventTypeConfig(event.eventType).actionLabel)}</button>`;
  }

  return "";
}

const commandIconSvgs = {
  expense: `
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M8 4.5h8A2.5 2.5 0 0 1 18.5 7v13l-2.7-1.5L13.2 20 12 19.3 10.8 20l-2.6-1.5L5.5 20V7A2.5 2.5 0 0 1 8 4.5Z" />
      <path d="M9.5 9h5" />
      <path d="M9.5 13h5" />
      <path d="M9.5 17h3" />
    </svg>
  `,
  participants: `
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M4.5 19v-1.1c0-2.2 1.9-4 4.5-4s4.5 1.8 4.5 4V19" />
      <path d="M16.5 11.2a2.7 2.7 0 1 0 0-5.4" />
      <path d="M15.4 14.2c2.4.4 4.1 1.8 4.1 3.7V19" />
    </svg>
  `,
  share: `
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <circle cx="6.5" cy="12" r="3" />
      <circle cx="17.5" cy="6.5" r="3" />
      <circle cx="17.5" cy="17.5" r="3" />
      <path d="m9.2 10.7 5.6-2.8" />
      <path d="m9.2 13.3 5.6 2.8" />
    </svg>
  `,
  settings: `
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M4 7h16" />
      <circle cx="9" cy="7" r="2" />
      <path d="M4 12h16" />
      <circle cx="15" cy="12" r="2" />
      <path d="M4 17h16" />
      <circle cx="11" cy="17" r="2" />
    </svg>
  `,
  settle: `
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M8 7 5.5 13h5L8 7Z" />
      <path d="M16 7 13.5 13h5L16 7Z" />
      <path d="M12 4.5v14" />
      <path d="M8.5 19.5h7" />
    </svg>
  `
};

function renderCommandIcon(iconName) {
  return `<span class="command-card-icon" aria-hidden="true">${commandIconSvgs[iconName] ?? ""}</span>`;
}

function renderEventDialog(event) {
  if (!eventDialog || eventDialog.eventId !== event.id) return "";

  if (eventDialog.kind === "participants") return renderEventParticipantsDialog(event);
  if (eventDialog.kind === "share") return renderEventShareDialog(event);
  if (eventDialog.kind === "settings") return renderEventSettingsDialog(event);
  if (eventDialog.kind === "settings-management") {
    return renderEventSettingsManagementDialog(event);
  }
  if (eventDialog.kind === "settings-currency") {
    return renderEventSettingsCurrencyDialog(event);
  }
  if (eventDialog.kind === "settings-lock") return renderEventSettingsLockDialog(event);
  if (eventDialog.kind === "settings-danger") {
    return renderEventSettingsDangerDialog(event);
  }

  return "";
}

function renderEventRemovalMenu() {
  if (!eventRemovalMenu) return "";

  const event = getEvent(eventRemovalMenu.eventId);
  if (!event) return "";

  const removesForEveryone = canCurrentParticipantManage(event);
  const canRemove = removesForEveryone ||
    canLeaveEvent(state, event.id, state.currentParticipantId);
  const impactText = removesForEveryone
    ? "האירוע יימחק אצל כל המשתתפים, לאחר אישור נוסף."
    : canRemove
      ? "האירוע יוסר רק מהאירועים שלך, לאחר אישור נוסף."
      : "לא ניתן להסיר אירוע שיש בו הוצאות או העברות על שמך.";

  return `
    <section class="event-removal-menu-backdrop" aria-label="אפשרויות לאירוע ${escapeAttribute(event.name)}">
      <section
        class="event-removal-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-removal-menu-title"
        aria-describedby="event-removal-menu-description"
        data-event-id="${escapeAttribute(event.id)}"
        tabindex="-1"
      >
        <span class="event-removal-menu-handle" aria-hidden="true"></span>
        <div class="event-removal-menu-copy">
          <span class="event-removal-menu-label">אפשרויות אירוע</span>
          <h2 id="event-removal-menu-title">${escapeHtml(event.name)}</h2>
          <p id="event-removal-menu-description">${escapeHtml(impactText)}</p>
        </div>
        <div class="event-removal-menu-actions">
          <button
            class="event-removal-option"
            type="button"
            data-action="remove-event-from-list"
            data-event-id="${escapeAttribute(event.id)}"
            ${canRemove ? "" : "disabled"}
          >
            <strong>הסר אירוע</strong>
            <span>${removesForEveryone ? "מחיקה לכל המשתתפים" : "הסרה מהאירועים שלי"}</span>
          </button>
          <button class="secondary-button" type="button" data-action="cancel-event-removal-menu">ביטול</button>
        </div>
      </section>
    </section>
  `;
}

function renderImportantActionDialog() {
  if (!importantActionDialog) return "";

  return `
    <section class="important-action-dialog-backdrop" aria-label="${escapeAttribute(importantActionDialog.title)}">
      <section
        class="important-action-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="important-action-title"
        aria-describedby="important-action-description"
        data-important-action-kind="${escapeAttribute(importantActionDialog.kind)}"
        tabindex="-1"
      >
        <div class="important-action-copy">
          <span class="important-action-label">פעולה חשובה</span>
          <h2 id="important-action-title">${escapeHtml(importantActionDialog.title)}</h2>
          <p id="important-action-description">${escapeHtml(importantActionDialog.description)}</p>
        </div>
        <div class="important-action-dialog-actions">
          <button class="secondary-button" type="button" data-action="cancel-important-action">ביטול</button>
          <button class="important-action-confirm-button" type="button" data-action="confirm-important-action">
            ${escapeHtml(importantActionDialog.confirmLabel)}
          </button>
        </div>
      </section>
    </section>
  `;
}

function renderEventDialogShell({ eyebrow, title, description, body, backAction = "" }) {
  return `
    <section class="event-modal-backdrop" aria-label="${escapeAttribute(title)}">
      <section class="panel event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title" tabindex="-1">
        <div class="event-modal-header">
          <div>
            <p class="eyebrow">${escapeHtml(eyebrow)}</p>
            <h2 id="event-modal-title">${escapeHtml(title)}</h2>
            ${description ? `<p class="muted">${escapeHtml(description)}</p>` : ""}
          </div>
          <div class="event-modal-header-actions">
            ${
              backAction
                ? `<button class="icon-button modal-section-back-button" data-action="${backAction}" aria-label="חזרה להגדרות" title="חזרה להגדרות"><span aria-hidden="true">›</span></button>`
                : ""
            }
            <button class="icon-button modal-back-button modal-close-button" data-action="close-event-dialog" aria-label="סגירת החלון" title="סגירת החלון"><span class="modal-back-button-glyph" aria-hidden="true">×</span></button>
          </div>
        </div>
        <div class="event-modal-body">
          ${body}
        </div>
      </section>
    </section>
  `;
}

function renderEventParticipantsDialog(event) {
  const canEdit = canCurrentParticipantEdit(event);

  return renderEventDialogShell({
    eyebrow: "משתתפים",
    title: "מי נמצא באירוע",
    description: "מסמנים רק את מי שהיה חלק מהאירוע הזה.",
    body: `
      <section class="event-window-section">
        ${renderParticipantChecks(event.participantIds, "event-participant", event)}
      </section>
      <div class="inline-actions section">
        <input class="guest-input" data-action="event-guest-name" autocomplete="off" enterkeyhint="done" aria-label="שם אורח" placeholder="שם אורח" ${!canEdit ? "disabled" : ""} />
        <button class="secondary-button" data-action="event-add-guest" data-event-id="${event.id}" ${!canEdit ? "disabled" : ""}>הוסף אורח</button>
      </div>
      <div class="event-modal-actions">
        <button class="primary-button" type="button" data-action="close-event-dialog">סיום</button>
      </div>
    `
  });
}

function renderEventShareDialog(event) {
  const inviteUrl = eventInviteUrl(event.id);

  return renderEventDialogShell({
    eyebrow: "שיתוף",
    title: "קישור הצטרפות",
    description: "מי שמקבל את הקישור נכנס לאירוע הזה עם הפרופיל שלו.",
    body: `
      ${renderInviteStatus()}
      <div class="invite-link-row">
        <input readonly aria-label="קישור הצטרפות" dir="ltr" value="${escapeAttribute(inviteUrl)}" />
        <button class="primary-button whatsapp-button" data-action="share-invite-whatsapp" data-event-id="${event.id}">שלח בוואטסאפ</button>
        <button class="secondary-button" data-action="copy-invite" data-event-id="${event.id}">העתק</button>
      </div>
    `
  });
}

function renderEventSettingsDialog(event) {
  const canManage = canCurrentParticipantManage(event);
  const canLeave = canLeaveEvent(state, event.id, state.currentParticipantId);
  const adminNames =
    eventAdminIds(state, event).map(participantName).join(", ") || "אין מנהל";
  const managementStatus = event.adminsCanEditOnly ? "ניהול מרוכז" : "ניהול משותף";
  const currencyStatus = currencySelectLabel(event.currency);
  const lockStatus = event.locked ? "האירוע נעול" : "האירוע פתוח לעריכה";
  const dangerStatus = canManage ? "עזיבה או מחיקת האירוע" : canLeave ? "עזיבת האירוע" : "אין פעולות זמינות";

  return renderEventDialogShell({
    eyebrow: "הגדרות",
    title: "הגדרות האירוע",
    description: "בוחרים נושא אחד ומטפלים בו במסך נפרד.",
    body: `
      <div class="event-settings-menu">
        ${renderEventSettingsMenuItem({
          eventId: event.id,
          section: "management",
          title: "אופן ניהול",
          description: `${managementStatus} · מנהל: ${adminNames}`
        })}
        ${renderEventSettingsMenuItem({
          eventId: event.id,
          section: "currency",
          title: "מטבע האירוע",
          description: currencyStatus
        })}
        ${renderEventSettingsMenuItem({
          eventId: event.id,
          section: "lock",
          title: "עריכת האירוע",
          description: lockStatus
        })}
        ${renderEventSettingsMenuItem({
          eventId: event.id,
          section: "danger",
          title: "עזיבה ומחיקה",
          description: dangerStatus,
          danger: true
        })}
      </div>
    `
  });
}

function renderEventSettingsManagementDialog(event) {
  const canManage = canCurrentParticipantManage(event);
  const adminNames =
    eventAdminIds(state, event).map(participantName).join(", ") || "אין מנהל";

  return renderEventDialogShell({
    eyebrow: "הגדרות",
    title: "אופן ניהול",
    description: `מנהל האירוע: ${adminNames}`,
    backAction: "event-settings-back",
    body: `
      ${renderEventManagementOptions({
        selectedMode: eventManagementMode(event),
        action: "set-event-management-mode",
        eventId: event.id,
        disabled: !canManage || event.locked
      })}
      ${
        event.locked
          ? '<p class="event-setting-note">האירוע נעול. צריך לפתוח עריכה לפני שמשנים את אופן הניהול.</p>'
          : ""
      }
    `
  });
}

function renderEventSettingsCurrencyDialog(event) {
  const canManage = canCurrentParticipantManage(event);
  const currencyLocked = event.expenses.length > 0;

  return renderEventDialogShell({
    eyebrow: "הגדרות",
    title: "מטבע האירוע",
    description: "כל הסכומים באירוע מוצגים באותו מטבע.",
    backAction: "event-settings-back",
    body: `
      <label class="field event-currency-field section">
        <span>מטבע האירוע</span>
        <select
          data-action="event-currency"
          data-event-id="${event.id}"
          ${!canManage || currencyLocked ? "disabled" : ""}
        >
          ${renderCurrencyOptions(event.currency)}
        </select>
        <small>${
          currencyLocked
            ? "המטבע ננעל אחרי שנוספה הוצאה, כדי לא לשנות בטעות סכומים קיימים."
            : canManage
              ? "אפשר לשנות את המטבע עד להוספת ההוצאה הראשונה."
              : "רק מנהל האירוע יכול לשנות את המטבע."
        }</small>
      </label>
    `
  });
}

function renderEventSettingsLockDialog(event) {
  const canManage = canCurrentParticipantManage(event);

  return renderEventDialogShell({
    eyebrow: "הגדרות",
    title: "עריכת האירוע",
    description: "נעילה מונעת שינוי בהוצאות ובמשתתפים עד שפותחים שוב.",
    backAction: "event-settings-back",
    body: `
      <div class="event-setting-focus-status ${event.locked ? "is-locked" : "is-open"}">
        <span class="status-chip ${event.locked ? "is-locked" : "is-open"}">${event.locked ? "נעול" : "פתוח"}</span>
        <div>
          <strong>${event.locked ? "האירוע נעול לעריכה" : "אפשר עדיין לעדכן את האירוע"}</strong>
          <p>${event.locked ? "המידע נשמר וניתן לפתוח אותו שוב בכל זמן." : "משתתפים בעלי הרשאה יכולים להוסיף ולעדכן הוצאות."}</p>
        </div>
      </div>
      <div class="event-setting-primary-action">
        <button class="${event.locked ? "primary-button" : "secondary-button"}" data-action="toggle-lock" data-event-id="${event.id}" ${!canManage ? "disabled" : ""}>${event.locked ? "פתח עריכה" : "נעל עריכה"}</button>
      </div>
    `
  });
}

function renderEventSettingsDangerDialog(event) {
  const canManage = canCurrentParticipantManage(event);
  const canLeave = canLeaveEvent(state, event.id, state.currentParticipantId);

  return renderEventDialogShell({
    eyebrow: "הגדרות",
    title: "עזיבה ומחיקה",
    description: "הפעולות כאן דורשות אישור לפני ביצוע.",
    backAction: "event-settings-back",
    body: `
      <section class="event-danger-zone section">
        <div>
          <strong>עזיבת האירוע</strong>
          <p class="muted">אפשר לעזוב רק אם אין הוצאות או העברות על שמך ואינך המנהל היחיד.</p>
        </div>
        <button class="secondary-button danger-button" data-action="leave-event" data-event-id="${event.id}" ${!canLeave ? "disabled" : ""}>עזוב אירוע</button>
      </section>
      <section class="event-danger-zone event-delete-zone section">
        <div>
          <strong>מחיקת האירוע</strong>
          <p class="muted">מחיקה מסירה את האירוע לכל המשתתפים וזמינה למנהל בלבד.</p>
        </div>
        <button class="secondary-button danger-button" data-action="delete-event" data-event-id="${event.id}" ${!canManage ? "disabled" : ""}>מחק אירוע</button>
      </section>
    `
  });
}

function renderEventSettingsMenuItem({
  eventId,
  section,
  title,
  description,
  danger = false
}) {
  return `
    <button
      type="button"
      class="event-settings-menu-item ${danger ? "is-danger" : ""}"
      data-action="open-event-settings-section"
      data-event-id="${eventId}"
      data-settings-section="${section}"
    >
      ${renderEventSettingsMenuIcon(section)}
      <span class="event-settings-menu-copy">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(description)}</small>
      </span>
      <span class="event-settings-menu-chevron" aria-hidden="true">‹</span>
    </button>
  `;
}

function renderEventSettingsMenuIcon(section) {
  const icons = {
    management: `
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <circle cx="8" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3.5 19v-1.2c0-2.4 2-4.3 4.5-4.3s4.5 1.9 4.5 4.3V19" />
        <path d="M14 14.2c3.6-.5 6 1.1 6 3.6V19" />
      </svg>
    `,
    currency: `
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M15.5 8.5h-5a2.5 2.5 0 0 0 0 5h3a2.5 2.5 0 0 1 0 5h-5" />
        <path d="M12 6v2.5M12 18.5V21" />
      </svg>
    `,
    lock: `
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14v2" />
      </svg>
    `,
    danger: `
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="m7 7 1 13h8l1-13" />
        <path d="M10 11v5M14 11v5" />
      </svg>
    `
  };

  return `<span class="event-settings-menu-icon" aria-hidden="true">${icons[section] ?? icons.management}</span>`;
}

function renderInviteStatus() {
  const ready = runtimeConfig.launch.shareLinksReady;

  return `
    <div class="invite-status ${ready ? "is-ready" : "is-local"}">
      <span class="status-chip ${ready ? "is-open" : "is-locked"}">קישור הצטרפות</span>
      <p class="muted">אפשר לשלוח את הקישור לחברים.</p>
    </div>
  `;
}

function eventInviteUrl(eventId) {
  const credentials = runtimeConfig.storage?.mode === "supabase"
    ? eventShareCredentials(getEvent(eventId))
    : null;
  return buildEventInviteUrl(
    runtimeConfig.publicUrl || window.location.href,
    eventId,
    buildEventInviteSnapshot(state, eventId),
    credentials
      ? { spaceId: credentials.id, spaceKey: credentials.key, compact: true }
      : {}
  );
}

function renderExpenseForm(event) {
  const participants = eventParticipants(event);
  const canEdit = canCurrentParticipantEdit(event);
  const expenseDetailsOpen = shouldOpenExpenseDetails(event, participants);
  const isTripEvent = eventTypeConfig(event.eventType).id === EVENT_TYPE_TRIP;
  if (expenseDraft.mode === "items" && !expenseDraft.id) {
    return renderQuickExpenseForm(event, participants, canEdit);
  }

  return `
    <section class="expense-modal-backdrop" aria-label="חלון הוצאה">
      <section class="panel expense-modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title" data-event-id="${event.id}" data-currency="${eventCurrency(event)}" tabindex="-1">
        <div class="expense-modal-header">
          <div>
            <p class="eyebrow">${isTripEvent ? "הוצאה בטיול" : "הוצאה באירוע"}</p>
            <h2 id="expense-modal-title">${expenseDraft.id ? "עריכת הוצאה" : "הוספת הוצאה"}</h2>
            <p class="muted">ממלאים את ההוצאה כאן, שומרים, וחוזרים ישר למסך האירוע. מטבע: ${escapeHtml(currencySelectLabel(event.currency))}.</p>
            ${renderRestoredDraftNote()}
          </div>
          <button class="icon-button modal-back-button modal-close-button" data-action="cancel-expense" aria-label="סגירת חלון ההוצאה" title="סגירת חלון ההוצאה"><span class="modal-back-button-glyph" aria-hidden="true">×</span></button>
        </div>

      <p class="expense-loop-status" role="status" aria-live="polite" hidden></p>
      <p class="expense-sync-status" data-inline-sync-status role="status" aria-live="polite" hidden></p>
      <label class="field expense-total-field">
        <span>סכום כולל <small class="currency-input-badge" dir="ltr">${escapeHtml(currencyCompactLabel(event))}</small></span>
        <input data-action="expense-total" name="expenseTotal" autocomplete="off" inputmode="decimal" enterkeyhint="next" dir="ltr" value="${escapeAttribute(expenseDraft.total)}" placeholder="0.00" />
      </label>
      <label class="field">
        <span>שם ההוצאה</span>
        <input data-action="expense-name" name="expenseName" autocomplete="off" enterkeyhint="done" value="${escapeAttribute(expenseDraft.name)}" placeholder="לדוגמה: מונית או ארוחת ערב" />
      </label>

      <section class="expense-template-grid" aria-label="תבניות הוצאה מהירות">
        ${EXPENSE_TEMPLATES.map(
          (template) => `
            <button class="secondary-button ${expenseDraft.name === template ? "is-active" : ""}" type="button" data-action="expense-template" data-template="${escapeAttribute(template)}" aria-pressed="${expenseDraft.name === template}">
              ${escapeHtml(template)}
            </button>
          `
        ).join("")}
      </section>

      ${isTripEvent ? renderExpenseDateField("expense-date-prominent") : ""}

      ${renderExpenseModeSwitch()}

      <details class="expense-details-panel" ${expenseDetailsOpen ? "open" : ""}>
        <summary>
          <span class="expense-details-summary-copy">
            <span class="expense-details-summary-label">${isTripEvent ? "חלוקה ומשלמים" : "חלוקה, משלמים ותאריך"}</span>
            ${renderExpenseDetailsSummary(event, participants)}
          </span>
        </summary>

        <div class="expense-details-body">
          ${isTripEvent ? "" : renderExpenseDateField()}

          <section class="section">
            <h3>מי שילם וכמה?</h3>
            <div class="payer-list">
              ${expenseDraft.payers
                .map(
                  (payer, index) => `
                    <div class="payer-row">
                      <select data-action="expense-payer-id" data-index="${index}" aria-label="משלם ${index + 1}">
                        ${participants
                          .map(
                            (participant) => `
                              <option value="${participant.id}" ${payer.participantId === participant.id ? "selected" : ""}>
                                ${escapeHtml(participant.displayName)}
                              </option>
                            `
                          )
                          .join("")}
                        <option value="${ADD_PAYER_PARTICIPANT_VALUE}" ${expenseDraft.inlinePayerGuestIndex === index ? "selected" : ""}>
                          + הוסף שם חדש
                        </option>
                      </select>
                      <input data-action="expense-payer-amount" data-index="${index}" name="expensePayerAmount-${index}" autocomplete="off" inputmode="decimal" enterkeyhint="done" dir="ltr" aria-label="סכום ששילם משלם ${index + 1}" value="${escapeAttribute(payer.amount)}" placeholder="כמה שילם" />
                      ${
                        expenseDraft.payers.length > 1
                          ? `<button class="secondary-button" data-action="remove-payer" data-index="${index}">הסר</button>`
                          : ""
                      }
                      ${
                        expenseDraft.inlinePayerGuestIndex === index
                          ? `
                            <div class="payer-inline-add">
                              <input
                                class="guest-input"
                                data-action="expense-new-payer-name"
                                data-index="${index}"
                                autocomplete="off"
                                enterkeyhint="done"
                                aria-label="שם משלם חדש"
                                placeholder="שם משלם חדש"
                                value="${escapeAttribute(expenseDraft.inlinePayerGuestName ?? "")}"
                                ${!canEdit ? "disabled" : ""}
                              />
                              <button
                                class="secondary-button"
                                data-action="expense-add-payer-guest"
                                data-event-id="${event.id}"
                                data-index="${index}"
                                ${!canEdit ? "disabled" : ""}
                              >
                                הוסף
                              </button>
                            </div>
                          `
                          : ""
                      }
                    </div>
                  `
                )
                .join("")}
            </div>
            ${renderExpensePayerSummary()}
            <button class="secondary-button section" data-action="add-payer">הוסף משלם</button>
          </section>

          <section class="section">
            <h3>מי שותף בהוצאה?</h3>
            ${renderParticipantChecks(expenseDraft.sharedByParticipantIds, "expense-shared", event)}
          </section>

          <section class="expense-guest-box">
            <div>
              <strong>חסר מישהו?</strong>
              <span>מוסיפים אורח בלי לצאת מההוצאה. הוא יופיע מיד ברשימות כאן.</span>
            </div>
            <div class="inline-actions expense-guest-actions">
              <input class="guest-input" data-action="event-guest-name" autocomplete="off" enterkeyhint="done" aria-label="שם אורח להוצאה" placeholder="שם אורח" ${!canEdit ? "disabled" : ""} />
              <button class="secondary-button" data-action="event-add-guest" data-event-id="${event.id}" ${!canEdit ? "disabled" : ""}>הוסף אורח להוצאה</button>
            </div>
          </section>
        </div>
      </details>

      ${expenseDraft.error ? `<p class="error" id="expense-form-error" role="alert">${escapeHtml(expenseDraft.error)}</p>` : ""}

      <div class="actions section expense-modal-actions">
        ${renderExpenseConfirmationSummary(event, participants)}
        <button class="primary-button" data-action="save-expense" data-event-id="${event.id}" ${hasPositiveExpenseTotal(expenseDraft.total) ? "" : "disabled"}>${expenseDraft.id ? "שמור שינויים" : "שמור וסיים"}</button>
        ${
          expenseDraft.id
            ? `<button class="secondary-button" data-action="cancel-expense">ביטול</button>`
            : `<button class="secondary-button expense-save-more" data-action="save-expense-and-continue" data-event-id="${event.id}" ${hasPositiveExpenseTotal(expenseDraft.total) ? "" : "disabled"}>שמור והוסף עוד</button>`
        }
      </div>
      </section>
    </section>
  `;
}

function renderExpenseDateField(extraClass = "") {
  return `
    <label class="field expense-date-field ${extraClass}">
      <span>תאריך ההוצאה</span>
      <input data-action="expense-date" type="date" value="${escapeAttribute(expenseDraft.occurredOn ?? "")}" />
    </label>
  `;
}

function renderExpenseConfirmationSummary(event, participants) {
  const knownParticipantIds = new Set(participants.map((participant) => participant.id));
  const participantCount = new Set(
    expenseDraft.sharedByParticipantIds.filter((participantId) =>
      knownParticipantIds.has(participantId)
    )
  ).size;

  let total = 0;
  try {
    total = parseMoneyInput(expenseDraft.total);
  } catch {
    // The amount field owns validation; the summary stays quiet until it is valid.
  }

  if (total <= 0 || participantCount < 2) {
    return `<p class="expense-confirmation-summary" data-expense-confirmation-summary aria-live="polite" hidden></p>`;
  }

  const baseShare = Math.floor(total / participantCount);
  const remainder = total % participantCount;
  const splitLabel = remainder
    ? `${formatEventMoney(event, baseShare)}–${formatEventMoney(event, baseShare + 1)} לאדם`
    : `${formatEventMoney(event, baseShare)} לאדם`;

  return `
    <p class="expense-confirmation-summary" data-expense-confirmation-summary aria-live="polite">
      <span>לפני השמירה</span>
      <strong>${formatEventMoney(event, total)} · ${formatCount(participantCount, "משתתף", "משתתפים")} · ${splitLabel}</strong>
    </p>
  `;
}

function shouldOpenExpenseDetails(event, participants) {
  const participantIds = new Set(participants.map((participant) => participant.id));
  const selectedParticipantIds = expenseDraft.sharedByParticipantIds.filter((participantId) => participantIds.has(participantId));
  const everyoneParticipates =
    selectedParticipantIds.length === participantIds.size &&
    selectedParticipantIds.every((participantId) => participantIds.has(participantId));

  return Boolean(
    expenseDraft.id ||
      expenseDraft.error ||
      expenseDraft.payers.length > 1 ||
      expenseDraft.inlinePayerGuestIndex !== null ||
      !everyoneParticipates ||
      eventTypeConfig(event.eventType).id === EVENT_TYPE_TRIP ||
      (expenseDraft.occurredOn && expenseDraft.occurredOn !== todayInputValue())
  );
}

function renderExpenseDetailsSummary(event, participants) {
  const values = expenseDetailsSummaryValues(event, participants);

  return `
    <span class="expense-detail-shortcut">
      <span>משלם</span>
      <strong data-expense-detail-value="payer">${escapeHtml(values.payer)}</strong>
    </span>
    <span class="expense-detail-shortcut">
      <span>משתתפים</span>
      <strong data-expense-detail-value="participants">${escapeHtml(values.participants)}</strong>
    </span>
    <span class="expense-detail-shortcut">
      <span>תאריך</span>
      <strong data-expense-detail-value="date">${escapeHtml(values.date)}</strong>
    </span>
  `;
}

function expenseDetailsSummaryText(event, participants) {
  const values = expenseDetailsSummaryValues(event, participants);
  return [`משלם: ${values.payer}`, values.participants, values.date].join(" · ");
}

function expenseDetailsSummaryValues(event, participants) {
  const participantById = new Map(participants.map((participant) => [participant.id, participant.displayName]));
  const payer =
    expenseDraft.payers.length === 1
      ? participantById.get(expenseDraft.payers[0]?.participantId) ?? "לא נבחר"
      : `${expenseDraft.payers.length} משלמים`;
  const selectedParticipantCount = expenseDraft.sharedByParticipantIds.filter((participantId) =>
    participantById.has(participantId)
  ).length;
  const participantLabel =
    selectedParticipantCount === participants.length
      ? `כולם משתתפים (${participants.length})`
      : `${selectedParticipantCount} מתוך ${participants.length} משתתפים`;
  const occurredOn = expenseDraft.occurredOn || todayInputValue();
  const dateLabel = occurredOn === todayInputValue() ? "היום" : formatExpenseDetailsDate(occurredOn);

  return {
    payer,
    participants: participantLabel,
    date: dateLabel
  };
}

function hasPositiveExpenseTotal(value) {
  try {
    return parseMoneyInput(value) > 0;
  } catch {
    return false;
  }
}

function formatExpenseDetailsDate(value) {
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}.${month}.${year}` : String(value);
}

function renderExpenseModeSwitch() {
  if (expenseDraft.id) return "";

  return `
    <div class="expense-mode-switch" role="group" aria-label="סוג הזנת הוצאה">
      <button
        type="button"
        class="${expenseDraft.mode !== "items" ? "is-active" : ""}"
        data-action="expense-mode"
        data-mode="single"
        aria-pressed="${expenseDraft.mode !== "items"}"
      >
        הוצאה רגילה
      </button>
      <button
        type="button"
        class="${expenseDraft.mode === "items" ? "is-active" : ""}"
        data-action="expense-mode"
        data-mode="items"
        aria-pressed="${expenseDraft.mode === "items"}"
      >
        חשבון לפי מנות
      </button>
    </div>
  `;
}

function renderQuickExpenseForm(event, participants, canEdit) {
  const isPaidExpense = expenseDraft.quickPurpose === "paid";
  const isRestaurantEvent = eventTypeConfig(event.eventType).id === EVENT_TYPE_RESTAURANT;
  const showQuickExpenseMeta = !isRestaurantEvent || isPaidExpense;
  const quickSummary = summarizeQuickItemShares(
    expenseDraft.quickItems,
    participants.map((participant) => participant.id)
  );
  const quickActionReady = quickSummary.billTotal > 0 && !quickSummary.error;
  return `
    <section class="expense-modal-backdrop" aria-label="חלון הוצאה">
      <section class="panel expense-modal quick-expense-modal" role="dialog" aria-modal="true" aria-labelledby="quick-expense-title" data-event-id="${event.id}" data-currency="${eventCurrency(event)}" tabindex="-1">
        <div class="expense-modal-header">
          <div>
            <p class="eyebrow">${isRestaurantEvent ? "חשבון מסעדה" : "מסעדה או קניות"}</p>
            <h2 id="quick-expense-title">${isPaidExpense ? "הזנה מהירה לפי פריטים" : isRestaurantEvent ? "כמה כל אחד צריך לשלם?" : "חלוקת חשבון מהירה"}</h2>
            <p class="muted">${isPaidExpense ? "מקלידים כמה שורות ושומרים את כל החשבון בפעם אחת." : "מקלידים את המחירים ומיד רואים כמה כל אחד צריך לשלם."} מטבע: ${escapeHtml(currencySelectLabel(event.currency))}.</p>
            ${renderRestoredDraftNote()}
          </div>
          <button class="icon-button modal-back-button modal-close-button" data-action="cancel-expense" aria-label="סגירת חלון ההוצאה" title="סגירת חלון ההוצאה"><span class="modal-back-button-glyph" aria-hidden="true">×</span></button>
        </div>

        ${renderExpenseModeSwitch()}

        <div class="quick-purpose-switch" role="group" aria-label="מטרת החשבון">
          <button
            type="button"
            class="${expenseDraft.quickPurpose !== "paid" ? "is-active" : ""}"
            data-action="quick-purpose"
            data-purpose="split"
            aria-pressed="${expenseDraft.quickPurpose !== "paid"}"
          >רק לחשב לכל אחד</button>
          <button
            type="button"
            class="${expenseDraft.quickPurpose === "paid" ? "is-active" : ""}"
            data-action="quick-purpose"
            data-purpose="paid"
            aria-pressed="${expenseDraft.quickPurpose === "paid"}"
          >מישהו כבר שילם</button>
        </div>

        ${
          showQuickExpenseMeta
            ? `<div class="quick-expense-meta">
                ${
                  isPaidExpense
                    ? `<label class="field">
                        <span>מי שילם את החשבון?</span>
                        <select data-action="quick-expense-payer">
                          ${participants
                            .map(
                              (participant) => `
                                <option value="${participant.id}" ${expenseDraft.quickPayerId === participant.id ? "selected" : ""}>
                                  ${escapeHtml(participant.displayName)}
                                </option>
                              `
                            )
                            .join("")}
                        </select>
                      </label>`
                    : ""
                }
                <label class="field">
                  <span>תאריך</span>
                  <input data-action="expense-date" type="date" value="${escapeAttribute(expenseDraft.occurredOn ?? "")}" />
                </label>
              </div>`
            : ""
        }

        <section class="quick-items-section">
          <div class="section-title-row">
            <div>
              <h3>מנות ופריטים</h3>
              <p class="muted">אפשר לבחור אדם אחד, כמה אנשים או את כולם. מחירים ב-${escapeHtml(currencyCompactLabel(event))}.</p>
            </div>
          </div>
          <div class="quick-item-list">
            ${expenseDraft.quickItems
              .map((item, index) => renderQuickItemRow(item, index, participants))
              .join("")}
          </div>
          <button class="secondary-button quick-add-item" data-action="quick-item-add" type="button">הוסף שורה</button>
        </section>

        <details class="expense-guest-box quick-expense-guest-box quick-expense-guest-details">
          <summary>
            <span>
              <strong>הוסף אורח לחשבון</strong>
              <small>אם הוא לא מופיע ברשימה</small>
            </span>
          </summary>
          <div class="inline-actions expense-guest-actions">
            <input class="guest-input" data-action="event-guest-name" aria-label="שם אורח לחשבון" placeholder="שם אורח" autocomplete="off" enterkeyhint="done" ${!canEdit ? "disabled" : ""} />
            <button class="secondary-button" data-action="event-add-guest" data-event-id="${event.id}" ${!canEdit ? "disabled" : ""}>הוסף לחשבון</button>
          </div>
        </details>

        ${expenseDraft.quickPurpose !== "paid" ? renderQuickSplitSummary(event, participants) : ""}

        ${expenseDraft.error ? `<p class="error" id="expense-form-error" role="alert">${escapeHtml(expenseDraft.error)}</p>` : ""}

        <div class="actions section expense-modal-actions">
          ${
            expenseDraft.quickPurpose === "paid"
              ? `<button class="primary-button" data-action="save-quick-expenses" data-event-id="${event.id}" ${!canEdit || !quickActionReady ? "disabled" : ""}>שמור את כל הפריטים</button>`
              : `<button class="primary-button" data-action="copy-quick-split" type="button" ${!quickActionReady ? "disabled" : ""}>העתק את החלוקה</button>`
          }
          <button class="secondary-button" data-action="cancel-expense">ביטול</button>
        </div>
      </section>
    </section>
  `;
}

function renderQuickSplitSummary(event, participants) {
  const summary = summarizeQuickItemShares(
    expenseDraft.quickItems,
    participants.map((participant) => participant.id)
  );
  const rows = participants.filter((participant) => summary.totals[participant.id] > 0);

  return `
    <section class="quick-split-summary" aria-live="polite">
      <div class="section-title-row">
        <div>
          <span class="eyebrow">חלוקה נוכחית</span>
          <h3>כמה כל אחד צריך לשלם</h3>
        </div>
        <strong class="amount">${formatEventMoney(event, summary.billTotal)}</strong>
      </div>
      <div class="quick-split-list">
        ${
          rows.length
            ? rows
                .map(
                  (participant) => `
                    <div>
                      <span>${escapeHtml(participant.displayName)}</span>
                      <strong class="amount">${formatEventMoney(event, summary.totals[participant.id])}</strong>
                    </div>
                  `
                )
                .join("")
            : `<p class="muted">הסכומים יופיעו כאן בזמן שמקלידים.</p>`
        }
      </div>
    </section>
  `;
}

function syncQuickSplitSummary() {
  const event = getEvent(expenseDraft?.eventId);
  if (!event) return;

  const participants = eventParticipants(event);
  if (expenseDraft.quickPurpose !== "paid") {
    const current = app.querySelector(".quick-split-summary");
    if (current) current.outerHTML = renderQuickSplitSummary(event, participants);
  }

  const summary = summarizeQuickItemShares(
    expenseDraft.quickItems,
    participants.map((participant) => participant.id)
  );
  const ready = summary.billTotal > 0 && !summary.error;
  const action = app.querySelector(
    expenseDraft.quickPurpose === "paid"
      ? '[data-action="save-quick-expenses"]'
      : '[data-action="copy-quick-split"]'
  );
  if (action) action.disabled = !ready || !canCurrentParticipantEdit(event);
}

async function copyQuickSplitSummary() {
  const event = getEvent(expenseDraft?.eventId);
  if (!event) return;
  const participants = eventParticipants(event);
  const summary = summarizeQuickItemShares(
    expenseDraft.quickItems,
    participants.map((participant) => participant.id)
  );

  if (summary.error) {
    expenseDraft.error = summary.error;
    render();
    activateDialog(".expense-modal");
    return;
  }

  if (summary.billTotal <= 0) {
    expenseDraft.error = "צריך להזין לפחות מחיר אחד כדי לחשב את החלוקה.";
    render();
    activateDialog(".expense-modal");
    return;
  }

  const lines = [
    `חלוקת החשבון באירוע ${event.name}:`,
    ...participants
      .filter((participant) => summary.totals[participant.id] > 0)
      .map(
        (participant) =>
          `${participant.displayName}: ${formatEventMoney(event, summary.totals[participant.id])}`
      ),
    `סה״כ: ${formatEventMoney(event, summary.billTotal)}`
  ];

  await copyText(lines.join("\n"), "החלוקה הועתקה.");
  activateDialog(".expense-modal");
}

function renderQuickItemRow(item, index, participants) {
  const customParticipantIds = item.sharedByParticipantIds ?? [];
  return `
    <div class="quick-item-row">
      <span class="quick-item-number">${index + 1}</span>
      <label class="field">
        <span>מנה או פריט</span>
        <input
          data-action="quick-item-name"
          data-index="${index}"
          name="quickItemName-${index}"
          autocomplete="off"
          enterkeyhint="next"
          value="${escapeAttribute(item.name)}"
          placeholder="פסטה / שתייה / טיפ…"
        />
      </label>
      <label class="field">
        <span>מחיר</span>
        <input
          data-action="quick-item-amount"
          data-index="${index}"
          name="quickItemAmount-${index}"
          autocomplete="off"
          inputmode="decimal"
          enterkeyhint="next"
          dir="ltr"
          value="${escapeAttribute(item.amount)}"
          placeholder="0.00"
        />
      </label>
      <label class="field">
        <span>למי?</span>
        <select data-action="quick-item-shared-by" data-index="${index}" name="quickItemSharedBy-${index}">
          ${participants
            .map(
              (participant) => `
                <option value="${participant.id}" ${item.sharedBy === participant.id ? "selected" : ""}>
                  ${escapeHtml(participant.displayName)}
                </option>
              `
            )
            .join("")}
          <option value="${ADD_QUICK_ITEM_GUEST_VALUE}" ${expenseDraft.quickInlineGuestIndex === index ? "selected" : ""}>＋ הוסף אורח…</option>
          <option value="${QUICK_ITEM_ALL_PARTICIPANTS}" ${item.sharedBy === QUICK_ITEM_ALL_PARTICIPANTS ? "selected" : ""}>משותף לכולם</option>
          <option value="${QUICK_ITEM_CUSTOM_PARTICIPANTS}" ${item.sharedBy === QUICK_ITEM_CUSTOM_PARTICIPANTS ? "selected" : ""}>כמה אנשים…</option>
        </select>
      </label>
      ${
        expenseDraft.quickInlineGuestIndex === index
          ? `
            <div class="quick-item-inline-guest" role="group" aria-label="הוספת אורח לשורה ${index + 1}">
              <input
                data-action="quick-item-new-guest-name"
                data-index="${index}"
                name="quickItemGuest-${index}"
                autocomplete="off"
                enterkeyhint="done"
                value="${escapeAttribute(expenseDraft.quickInlineGuestName ?? "")}"
                placeholder="שם האורח"
                aria-label="שם אורח חדש"
              />
              <button
                type="button"
                class="secondary-button"
                data-action="quick-item-add-guest"
                data-event-id="${expenseDraft.eventId}"
                data-index="${index}"
              >הוסף ובחר</button>
            </div>
          `
          : ""
      }
      ${
        item.sharedBy === QUICK_ITEM_CUSTOM_PARTICIPANTS
          ? `
            <div class="quick-item-custom-share" role="group" aria-label="בחר למי שייך פריט ${index + 1}">
              ${participants
                .map(
                  (participant) => `
                    <label class="${customParticipantIds.includes(participant.id) ? "is-selected" : ""}">
                      <input
                        type="checkbox"
                        data-action="quick-item-custom-participant"
                        data-index="${index}"
                        data-participant-id="${participant.id}"
                        ${customParticipantIds.includes(participant.id) ? "checked" : ""}
                      />
                      <span>${escapeHtml(participant.displayName)}</span>
                    </label>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
      <button
        type="button"
        class="icon-button quick-item-remove"
        data-action="quick-item-remove"
        data-index="${index}"
        aria-label="הסר שורה ${index + 1}"
        title="הסר שורה"
        ${expenseDraft.quickItems.length === 1 ? "disabled" : ""}
      >×</button>
    </div>
  `;
}

function renderEventExpenseGroups(event) {
  const groups = groupExpensesByDay(event.expenses);
  const showDayHeadings = eventTypeConfig(event.eventType).id === EVENT_TYPE_TRIP || groups.length > 1;

  return groups
    .map((group) => {
      const groupTotal = group.expenses.reduce((sum, expense) => sum + expense.total, 0);
      return `
        <section class="expense-day-group${showDayHeadings ? " has-day-heading" : ""}">
          ${
            showDayHeadings
              ? `
                <div class="expense-day-heading">
                  <span class="expense-day-label">${escapeHtml(formatExpenseDay(group.date))}</span>
                  <span class="expense-day-summary">
                    <small>${formatCount(group.expenses.length, "הוצאה", "הוצאות")}</small>
                    <strong class="amount">${formatEventMoney(event, groupTotal)}</strong>
                  </span>
                </div>
              `
              : ""
          }
          ${group.expenses.map((expense) => renderExpenseRow(event, expense)).join("")}
        </section>
      `;
    })
    .join("");
}

function renderExpensePayerSummary() {
  const summary = summarizePayerDraft(expenseDraft.total, expenseDraft.payers);
  const event = getEvent(expenseDraft.eventId);
  if (summary.total <= 0) return `<p class="expense-payer-summary" aria-live="polite" hidden></p>`;

  if (summary.balanced) {
    return `<p class="expense-payer-summary is-balanced" aria-live="polite">סכומי המשלמים תואמים לסכום הכולל.</p>`;
  }

  if (summary.remaining > 0) {
    return `<p class="expense-payer-summary is-warning" aria-live="polite">נשאר לשייך ${formatEventMoney(event, summary.remaining)} למי ששילם.</p>`;
  }

  return `<p class="expense-payer-summary is-error" aria-live="polite">סכומי המשלמים גבוהים ב-${formatEventMoney(event, summary.overpaid)} מהסכום הכולל.</p>`;
}

function renderExpenseRow(event, expense) {
  const canEdit = canCurrentParticipantEdit(event);
  const payers = expense.payers.map((payer) => participantName(payer.participantId)).join(", ");
  const shared = expense.sharedByParticipantIds.map(participantName).join(", ");

  return `
    <article class="expense-row" data-expense-id="${escapeAttribute(expense.id)}">
      <span>
        <strong>${escapeHtml(expense.name)}</strong>
        <small>שילמו: ${escapeHtml(payers)}</small>
        <small>שותפים: ${escapeHtml(shared)}</small>
      </span>
      <span class="expense-actions">
        <span class="amount">${formatEventMoney(event, expense.total)}</span>
        <button class="secondary-button" data-action="edit-expense" data-event-id="${event.id}" data-expense-id="${expense.id}" ${!canEdit ? "disabled" : ""}>ערוך</button>
        <button class="secondary-button danger-button" data-action="delete-expense" data-event-id="${event.id}" data-expense-id="${expense.id}" ${!canEdit ? "disabled" : ""}>מחק</button>
      </span>
    </article>
  `;
}

function renderSettlement(event) {
  rememberRecentEvent(event.id);
  const participants = eventParticipants(event);
  const calculated = calculateSettlement(participants, event.expenses);
  const transfers = event.transfers.length ? event.transfers : calculated.transfers;
  const pendingTransfers = transfers.filter((transfer) => transfer.status !== "paid");
  const paidTransfers = transfers.filter((transfer) => transfer.status === "paid");
  const hasPersonalIdentity = hasReliableSettlementIdentity(event);
  const personalPendingTransfers = hasPersonalIdentity
    ? pendingTransfers.filter(
        (transfer) =>
          transfer.fromParticipantId === state.currentParticipantId ||
          transfer.toParticipantId === state.currentParticipantId
      )
    : [];
  const groupPendingTransfers = hasPersonalIdentity
    ? pendingTransfers.filter(
        (transfer) =>
          transfer.fromParticipantId !== state.currentParticipantId &&
          transfer.toParticipantId !== state.currentParticipantId
      )
    : pendingTransfers;
  const orderedPendingTransfers = orderSettlementTransfers(groupPendingTransfers);
  const orderedPaidTransfers = orderSettlementTransfers(paidTransfers);
  const paidTransferCount = transfers.length - pendingTransfers.length;
  const pendingTotal = transfers
    .filter((transfer) => transfer.status !== "paid")
    .reduce((sum, transfer) => sum + transfer.amount, 0);

  return `
    <section class="screen settlement-screen" data-screen-kind="settlement" data-event-id="${escapeAttribute(event.id)}">
      <header class="top settlement-top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">סגירת אירוע</p>
          <h1>${escapeHtml(event.name)}</h1>
          <p class="muted">${isEventClosed(event) ? "האירוע סגור לשינויים" : "בודקים, מעבירים ומסמנים כשולם"}</p>
        </div>
      </header>
      ${renderNotice()}

      ${hasPersonalIdentity ? renderPersonalSettlement(event, transfers) : ""}
      ${renderSettlementHero(event, transfers, pendingTotal, calculated.issues)}

      <section class="section settlement-stage" aria-labelledby="settlement-transfers-title">
        <div class="settlement-stage-heading">
          <div>
            <span class="eyebrow">${personalPendingTransfers.length ? "תמונה מלאה" : "סוגרים עכשיו"}</span>
            <h2 id="settlement-transfers-title">${personalPendingTransfers.length ? "שאר ההעברות בקבוצה" : "מי מעביר למי"}</h2>
            <p class="muted">${
              groupPendingTransfers.length
                ? "אלה ההעברות שלא דורשות ממך פעולה."
                : pendingTransfers.length
                  ? "כל מה שקשור אליך כבר מרוכז למעלה."
                  : "כל ההעברות באירוע הושלמו."
            }</p>
          </div>
          <span class="settlement-progress-chip">${
            groupPendingTransfers.length
              ? formatCount(groupPendingTransfers.length, "העברה נוספת", "העברות נוספות")
              : pendingTransfers.length
                ? "אין נוספות"
              : transfers.length
                ? `${paidTransferCount} מתוך ${transfers.length} הושלמו`
                : "אין העברות"
          }</span>
        </div>
        <div class="settlement-transfer-board">
          ${
            orderedPendingTransfers.length
              ? orderedPendingTransfers
                  .map((transfer) => renderTransferRow(event, transfer))
                  .join("")
              : pendingTransfers.length
                ? renderSettlementPersonalOnlyState()
                : renderSettlementCompleteState(event, transfers.length > 0)
          }
        </div>
        ${
          orderedPaidTransfers.length
            ? renderCompletedTransfers(event, orderedPaidTransfers)
            : ""
        }
      </section>

      <section class="section settlement-audit-section">
        <details class="settlement-audit-details">
          <summary>
            <span>
              <strong>בדיקת חישוב ויתרות</strong>
              <small>פירוט מלא של מצב כל משתתף</small>
            </span>
            <span class="settlement-audit-count">${participants.length}</span>
          </summary>
          <div class="settlement-audit-list">
            ${Object.entries(calculated.balances)
              .map(([participantId, balance]) => renderBalanceRow(event, participantId, balance))
              .join("")}
          </div>
        </details>
      </section>
    </section>
  `;
}

function hasReliableSettlementIdentity(event) {
  const profileParticipantId = localProfile?.participantId ?? "";
  return Boolean(
    profileParticipantId &&
      profileParticipantId === state.currentParticipantId &&
      event.participantIds.includes(profileParticipantId)
  );
}

function renderSettlementPersonalOnlyState() {
  return `
    <div class="settlement-personal-only-state">
      <span class="settlement-complete-mark" aria-hidden="true">✓</span>
      <div>
        <strong>אין העברות נוספות בקבוצה</strong>
        <p>הפעולות שקשורות אליך מופיעות בראש המסך.</p>
      </div>
    </div>
  `;
}

function renderSettlementCompleteState(event, hadTransfers) {
  return `
    <div class="settlement-complete-state ${hadTransfers ? "is-settled" : "is-balanced"}">
      <span class="settlement-complete-mark" aria-hidden="true">✓</span>
      <strong>${hadTransfers ? "החשבון סגור" : "האירוע מאוזן"}</strong>
      <p>${hadTransfers ? "כל ההעברות סומנו כשולמו." : "אין צורך להעביר כסף בין המשתתפים."}</p>
      <div class="settlement-complete-actions">
        <button class="secondary-button" data-action="back-to-event" data-event-id="${event.id}">חזרה לאירוע</button>
      </div>
    </div>
  `;
}

function renderCompletedTransfers(event, transfers) {
  return `
    <details class="completed-transfers-details">
      <summary>
        <span>
          <strong>העברות שהושלמו</strong>
          <small>אפשר לפתוח כדי לבדוק או לבטל סימון</small>
        </span>
        <span class="completed-transfers-count">${transfers.length}</span>
      </summary>
      <div class="completed-transfers-list">
        ${transfers.map((transfer) => renderTransferRow(event, transfer)).join("")}
      </div>
    </details>
  `;
}

function orderSettlementTransfers(transfers) {
  const currentParticipantId = state.currentParticipantId;
  return [...transfers].sort((first, second) => {
    const paidDifference = Number(first.status === "paid") - Number(second.status === "paid");
    if (paidDifference !== 0) return paidDifference;

    const firstIsPersonal =
      first.fromParticipantId === currentParticipantId ||
      first.toParticipantId === currentParticipantId;
    const secondIsPersonal =
      second.fromParticipantId === currentParticipantId ||
      second.toParticipantId === currentParticipantId;
    return Number(secondIsPersonal) - Number(firstIsPersonal);
  });
}

function renderEventManagementOptions({
  selectedMode,
  action,
  eventId = "",
  disabled = false,
  className = "",
  showLegend = true
}) {
  const options = [
    {
      id: EVENT_MANAGEMENT_CENTRALIZED,
      title: "אני מנהל עבור כולם",
      description: "רק מנהלים מזינים ומתקנים הוצאות. שאר המשתתפים יכולים לצפות."
    },
    {
      id: EVENT_MANAGEMENT_COLLABORATIVE,
      title: "כולם מעדכנים יחד",
      description: "כל מי שמצטרף לאירוע יכול להוסיף ולעדכן הוצאות."
    }
  ];

  return `
    <fieldset class="event-management-field ${className}">
      ${showLegend ? "<legend>מי יעדכן את ההוצאות?</legend>" : ""}
      <div class="event-management-options" role="radiogroup" aria-label="מי יעדכן את ההוצאות">
        ${options
          .map(
            (option) => `
              <button
                type="button"
                class="event-management-option ${selectedMode === option.id ? "is-active" : ""}"
                data-action="${action}"
                data-management-mode="${option.id}"
                ${eventId ? `data-event-id="${eventId}"` : ""}
                role="radio"
                aria-checked="${selectedMode === option.id}"
                ${disabled ? "disabled" : ""}
              >
                <span class="event-management-check" aria-hidden="true"></span>
                <span class="event-management-copy">
                  <strong>${option.title}</strong>
                  <small>${option.description}</small>
                </span>
                ${action === "new-event-management-mode" ? renderForwardChevron() : ""}
              </button>
            `
          )
          .join("")}
      </div>
    </fieldset>
  `;
}

function renderForwardChevron() {
  return `
    <span class="event-choice-forward" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
    </span>
  `;
}

function eventManagementMode(event) {
  return event?.adminsCanEditOnly
    ? EVENT_MANAGEMENT_CENTRALIZED
    : EVENT_MANAGEMENT_COLLABORATIVE;
}

function managementModeRequiresAdmin(mode) {
  return mode === EVENT_MANAGEMENT_CENTRALIZED;
}

function renderPersonalSettlement(event, transfers) {
  const currentParticipantId = state.currentParticipantId;
  const personalTransfers = transfers.filter(
    (transfer) =>
      transfer.status !== "paid" &&
      (transfer.fromParticipantId === currentParticipantId ||
        transfer.toParticipantId === currentParticipantId)
  );

  if (!personalTransfers.length) {
    return `
      <section class="panel personal-settlement is-balanced" aria-label="הסיכום שלך">
        <span class="personal-settlement-eyebrow">הסיכום שלך</span>
        <h2>הצד שלך סגור</h2>
        <p>אין לך העברות פתוחות באירוע הזה.</p>
      </section>
    `;
  }

  return `
    <section class="panel personal-settlement" aria-label="הפעולות שלך">
      <div class="personal-settlement-heading">
        <span class="personal-settlement-eyebrow">מה צריך לעשות עכשיו</span>
        <h2>${formatCount(personalTransfers.length, "פעולה שקשורה אליך", "פעולות שקשורות אליך")}</h2>
      </div>
      <div class="personal-settlement-list">
        ${personalTransfers
          .map((transfer) => renderPersonalSettlementRow(event, transfer))
          .join("")}
      </div>
    </section>
  `;
}

function renderPersonalSettlementRow(event, transfer) {
  const isPaying = transfer.fromParticipantId === state.currentParticipantId;
  const otherParticipantId = isPaying
    ? transfer.toParticipantId
    : transfer.fromParticipantId;
  const sentence = isPaying
    ? `עליך להעביר ל־${participantName(otherParticipantId)}`
    : `מגיע לך מ־${participantName(otherParticipantId)}`;
  const paidButtonLabel = isPaying ? "העברתי" : "קיבלתי";

  return `
    <article class="personal-settlement-row ${isPaying ? "is-debt" : "is-credit"}">
      <div class="personal-settlement-copy">
        <span>${renderAvatar(otherParticipantId)}</span>
        <span>
          <strong>${escapeHtml(sentence)}</strong>
          <small>${escapeHtml(event.name)}</small>
        </span>
      </div>
      <strong class="amount">${formatEventMoney(event, transfer.amount)}</strong>
      <div class="personal-settlement-actions">
        <button class="primary-button" data-action="mark-paid" data-transfer-id="${transfer.id}">${paidButtonLabel}</button>
      </div>
      ${renderTransferExplanation(event, transfer)}
    </article>
  `;
}

function renderSettlementHero(event, transfers, pendingTotal, issues = []) {
  const needsReview = issues.length > 0;
  const pendingTransfers = transfers.filter((transfer) => transfer.status !== "paid");
  const hasPendingTransfers = pendingTransfers.length > 0;
  const isClosed = isEventClosed(event);
  const showCloseConfirmation =
    settlementCloseConfirmation?.eventId === event.id &&
    hasPendingTransfers &&
    !isClosed;
  const title = needsReview
    ? "צריך לתקן הוצאה לפני הסגירה"
    : hasPendingTransfers
    ? `${formatCount(pendingTransfers.length, "העברה", "העברות")} ${pendingTransfers.length === 1 ? "נשארה פתוחה" : "נשארו פתוחות"}`
    : "הכל שולם";
  const description = needsReview
    ? "יש הוצאה שלא נכנסה לחישוב. חזור להוצאות, תקן אותה ורק אז סגור את האירוע."
    : hasPendingTransfers
    ? "אפשר לשלוח את הסיכום לקבוצה ולעדכן כאן כל תשלום."
    : "כל ההעברות סומנו כשולמו.";
  const shareButtonClass = hasPendingTransfers || isClosed
    ? "primary-button whatsapp-button"
    : "secondary-button whatsapp-button";
  const closeButtonClass = hasPendingTransfers ? "secondary-button" : "primary-button";

  return `
    <section class="panel settlement-hero">
      <div class="settlement-hero-main">
        <span class="status-chip ${hasPendingTransfers ? "is-warn" : "is-ok"}">${isClosed ? "אירוע סגור" : "לפני סגירה"}</span>
        <div class="settlement-hero-title-row">
          <div>
            <h2>${escapeHtml(title)}</h2>
            <p class="muted">${escapeHtml(description)}</p>
          </div>
          <div class="settlement-hero-total">
            <span>נותר להעביר</span>
            <strong class="settlement-hero-amount amount">${formatEventMoney(event, pendingTotal)}</strong>
          </div>
        </div>
      </div>
      <div class="settlement-hero-actions">
        <button class="secondary-button" data-action="copy-settlement" data-event-id="${event.id}">העתק סיכום</button>
        <button class="${shareButtonClass}" data-action="share-whatsapp" data-event-id="${event.id}">שלח בוואטסאפ</button>
        <button class="secondary-button" data-action="copy-event-report" data-event-id="${event.id}">העתק דוח מלא</button>
        ${
          isClosed
            ? `<button class="secondary-button" data-action="reopen-event" data-event-id="${event.id}">פתח לעריכה</button>`
            : `<button class="${closeButtonClass}" data-action="close-event" data-event-id="${event.id}" ${needsReview ? "disabled" : ""}>${needsReview ? "תקן הוצאות לפני סגירה" : "סגור ונעל אירוע"}</button>`
        }
      </div>
      ${
        showCloseConfirmation
          ? renderSettlementCloseConfirmation(event, pendingTransfers, pendingTotal)
          : ""
      }
    </section>
  `;
}

function renderSettlementCloseConfirmation(event, pendingTransfers, pendingTotal) {
  const message = pendingTransfers.length === 1
    ? `נותרה העברה פתוחה בסך ${formatEventMoney(event, pendingTotal)}. לנעול בכל זאת?`
    : `נותרו ${pendingTransfers.length} העברות פתוחות בסך ${formatEventMoney(event, pendingTotal)}. לנעול בכל זאת?`;

  return `
    <div class="settlement-close-confirmation" role="region" aria-label="אישור נעילת האירוע" aria-live="polite">
      <p>${escapeHtml(message)}</p>
      <div class="settlement-close-confirmation-actions">
        <button class="primary-button" type="button" data-action="confirm-close-event" data-event-id="${event.id}">נעל אירוע</button>
        <button class="secondary-button" type="button" data-action="cancel-close-event-confirmation">ביטול</button>
      </div>
    </div>
  `;
}

function renderTransferRow(event, transfer) {
  const paid = transfer.status === "paid";
  const statusText = paid ? transferPaidStatusText(transfer) : "ממתין לתשלום";
  return `
    <article class="transfer-row ${paid ? "is-paid" : "is-pending"}">
      <div class="transfer-main">
        <div class="transfer-people">
          ${renderAvatar(transfer.fromParticipantId)}
          <strong>${escapeHtml(participantName(transfer.fromParticipantId))}</strong>
          <span class="transfer-arrow">←</span>
          ${renderAvatar(transfer.toParticipantId)}
          <strong>${escapeHtml(participantName(transfer.toParticipantId))}</strong>
        </div>
        <small class="${paid ? "status-paid" : ""}">${escapeHtml(statusText)}</small>
      </div>
      <div class="transfer-actions">
        <span class="amount">${formatEventMoney(event, transfer.amount)}</span>
        ${
          paid
            ? `<button class="secondary-button" data-action="mark-pending" data-transfer-id="${transfer.id}">בטל סימון</button>`
            : `<button class="primary-button" data-action="mark-paid" data-transfer-id="${transfer.id}">סמן כשולם</button>`
        }
      </div>
      ${renderTransferExplanation(event, transfer)}
    </article>
  `;
}

function transferPaidStatusText(transfer) {
  const markerId = transfer.markedPaidByParticipantId;
  const marker = markerId
    ? markerId === state.currentParticipantId
      ? "סומן על ידך"
      : `סומן על ידי ${participantName(markerId)}`
    : "סומן כשולם";
  const markedAt = transfer.markedPaidAt ? new Date(transfer.markedPaidAt) : null;
  const time = markedAt && !Number.isNaN(markedAt.getTime())
    ? new Intl.DateTimeFormat("he-IL", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(markedAt)
    : "";

  return `שולם · ${marker}${time ? ` · ${time}` : ""}`;
}

function renderTransferExplanation(event, transfer) {
  const participants = eventParticipants(event);
  const debtorId = transfer.fromParticipantId;
  const debtorName = participantName(debtorId);
  const breakdown = buildParticipantSettlementBreakdown(
    participants,
    event.expenses,
    debtorId
  );
  const debtTotal = Math.max(0, -breakdown.balance);
  const isSplitAcrossTransfers = debtTotal > transfer.amount;

  return `
    <details class="transfer-explanation">
      <summary>איך הסכום חושב?</summary>
      <div class="transfer-explanation-body">
        <div class="transfer-equation" aria-label="פירוט החישוב של ${escapeHtml(debtorName)}">
          <div class="transfer-equation-item">
            <span>החלק בחלוקה</span>
            <strong class="amount">${formatEventMoney(event, breakdown.shareTotal)}</strong>
          </div>
          <span class="transfer-equation-sign" aria-hidden="true">−</span>
          <div class="transfer-equation-item">
            <span>שולם בהוצאות</span>
            <strong class="amount">${formatEventMoney(event, breakdown.paidTotal)}</strong>
          </div>
          <span class="transfer-equation-sign" aria-hidden="true">=</span>
          <div class="transfer-equation-item is-result">
            <span>חוב שנוצר</span>
            <strong class="amount">${formatEventMoney(event, debtTotal)}</strong>
          </div>
        </div>
        <p class="transfer-route-note">
          ${escapeHtml(debtorName)} מעביר ${formatEventMoney(event, transfer.amount)} ל־${escapeHtml(participantName(transfer.toParticipantId))}${isSplitAcrossTransfers ? ` מתוך חוב כולל של ${formatEventMoney(event, debtTotal)}` : ""}.
        </p>
        ${
          breakdown.expenseShares.length
            ? `
              <details class="transfer-expense-breakdown">
                <summary>פירוט לפי הוצאה</summary>
                <div class="transfer-expense-share-list">
                  ${breakdown.expenseShares
                    .map((expenseShare) => renderSettlementExpenseShare(event, expenseShare))
                    .join("")}
                </div>
              </details>
            `
            : ""
        }
        <p class="transfer-minimization-note">
          המקבל נבחר כדי לצמצם את מספר ההעברות בקבוצה, ולכן הוא לא בהכרח האדם ששילם ישירות עבור ${escapeHtml(debtorName)}.
        </p>
      </div>
    </details>
  `;
}

function renderSettlementExpenseShare(event, expenseShare) {
  const paidCopy = expenseShare.participantPaid
    ? ` · שולם ${formatEventMoney(event, expenseShare.participantPaid)}`
    : "";

  return `
    <div class="transfer-expense-share-row">
      <span>
        <strong>${escapeHtml(expenseShare.name)}</strong>
        <small>${formatEventMoney(event, expenseShare.total)} · ${formatCount(expenseShare.participantCount, "משתתף", "משתתפים")}${paidCopy}</small>
      </span>
      <span>
        <small>החלק בחלוקה</small>
        <strong class="amount">${formatEventMoney(event, expenseShare.participantShare)}</strong>
      </span>
    </div>
  `;
}

function renderBalanceRow(event, participantId, balance) {
  const className = balance > 0 ? "is-credit" : balance < 0 ? "is-debt" : "";
  const label = balance > 0 ? "מקבל" : balance < 0 ? "משלם" : "מאוזן";
  return `
    <div class="balance-row ${className}">
      <strong>${escapeHtml(participantName(participantId))}</strong>
      <span>${label} <span class="amount">${formatEventMoney(event, Math.abs(balance))}</span></span>
    </div>
  `;
}

function renderParticipantChecks(selectedIds, action, event = null) {
  const participants = event && action === "event-participant"
    ? [...state.participants].sort(
        (left, right) =>
          Number(selectedIds.includes(right.id)) - Number(selectedIds.includes(left.id))
      )
    : event
      ? eventParticipants(event)
      : state.participants;
  const disabled = event && !canCurrentParticipantEdit(event);
  return `
    <div class="participant-grid">
      ${participants
        .map(
          (participant) => `
            <label class="participant-pill ${participant.kind === "guest" ? "is-guest" : ""}">
              <input
                type="checkbox"
                data-action="${action}"
                data-participant-id="${participant.id}"
                ${selectedIds.includes(participant.id) ? "checked" : ""}
                ${disabled ? "disabled" : ""}
              />
              ${renderAvatar(participant.id)}
              <span>${escapeHtml(participant.displayName)}</span>
            </label>
          `
        )
        .join("")}
    </div>
  `;
}

function openEventDialog(eventId, kind, trigger = document.activeElement) {
  const event = getEvent(eventId);
  if (!event) return;

  rememberDialogReturnFocus(trigger);
  expenseDraft = null;
  eventDialog = { eventId, kind };
  render();
  activateDialog(".event-modal");
}

function handleEventLongPressStart(event) {
  if (!event.isPrimary || event.button !== 0) return;

  const target = event.target.closest('[data-long-press-event="true"][data-event-id]');
  if (!target || eventRemovalMenu || importantActionDialog) return;

  cancelEventLongPress();
  eventLongPressTarget = target;
  eventLongPressStartPoint = { x: event.clientX, y: event.clientY };
  target.classList.add("is-long-pressing");
  eventLongPressTimer = window.setTimeout(() => {
    const eventId = eventLongPressTarget?.dataset.eventId;
    const trigger = eventLongPressTarget;
    if (!eventId || !trigger) return;

    suppressedEventOpenId = eventId;
    suppressEventOpenUntil = performance.now() + 900;
    cancelEventLongPress();
    openEventRemovalMenu(eventId, trigger);
  }, EVENT_LONG_PRESS_DELAY_MS);
}

function handleEventLongPressMove(event) {
  if (!eventLongPressTimer || !eventLongPressStartPoint) return;

  const distance = Math.hypot(
    event.clientX - eventLongPressStartPoint.x,
    event.clientY - eventLongPressStartPoint.y
  );
  if (distance > EVENT_LONG_PRESS_MOVE_TOLERANCE_PX) cancelEventLongPress();
}

function cancelEventLongPress() {
  if (eventLongPressTimer) window.clearTimeout(eventLongPressTimer);
  eventLongPressTarget?.classList.remove("is-long-pressing");
  eventLongPressTimer = null;
  eventLongPressTarget = null;
  eventLongPressStartPoint = null;
}

function handleEventContextMenu(event) {
  const target = event.target.closest('[data-long-press-event="true"][data-event-id]');
  if (!target) return;

  event.preventDefault();
  cancelEventLongPress();
  suppressedEventOpenId = target.dataset.eventId;
  suppressEventOpenUntil = performance.now() + 900;
  openEventRemovalMenu(target.dataset.eventId, target);
}

function openEventRemovalMenu(eventId, trigger) {
  if (!getEvent(eventId) || eventRemovalMenu || importantActionDialog) return;

  rememberDialogReturnFocus(trigger);
  eventRemovalMenu = { eventId };
  render();
  activateDialog(".event-removal-menu");
  requestAnimationFrame(() => {
    app
      .querySelector('[data-action="cancel-event-removal-menu"]')
      ?.focus({ preventScroll: true });
  });
}

async function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;

  if (
    action === "open-event" &&
    target.dataset.eventId === suppressedEventOpenId &&
    performance.now() < suppressEventOpenUntil
  ) {
    event.preventDefault();
    suppressedEventOpenId = "";
    suppressEventOpenUntil = 0;
    return;
  }

  if (action === "cancel-event-removal-menu") {
    eventRemovalMenu = null;
    closeDialogWithHistory();
    return;
  }

  if (action === "remove-event-from-list") {
    const selectedEvent = getEvent(target.dataset.eventId);
    if (!selectedEvent) return;
    if (canCurrentParticipantManage(selectedEvent)) {
      requestEventDeletion(selectedEvent.id, target);
    } else {
      requestEventLeave(selectedEvent.id, target);
    }
    return;
  }

  if (action === "cancel-important-action") {
    closeImportantActionDialog();
    return;
  }

  if (action === "confirm-important-action") {
    await confirmImportantAction();
    return;
  }

  if (DIALOG_OPEN_ACTIONS.has(action)) {
    rememberDialogReturnFocus(target);
  }

  if (action === "go-back") {
    goBackInApp();
  }

  if (action === "home") {
    notice = "";
    clearInviteRouteFromAddress();
    screen = { name: "home" };
    newEventDraft = null;
    joinEventDraft = null;
    expenseDraft = null;
    eventDialog = null;
    groupDraft = null;
    editingGroupDraft = null;
    mergeParticipantsDraft = null;
    render();
  }

  if (action === "save-profile") {
    await saveProfileFromDraft();
  }

  if (action === "edit-profile") {
    screen = { name: "profile" };
    profileNameDraft = localProfile?.displayName ?? participantName(state.currentParticipantId);
    profileError = "";
    render();
  }

  if (action === "reset") {
    requestApplicationReset(target);
    return;
  }

  if (action === "new-event") {
    notice = "";
    screen = { name: "new-event-type" };
    newEventDraft = null;
    joinEventDraft = null;
    eventDialog = null;
    editingGroupDraft = null;
    mergeParticipantsDraft = null;
    render();
  }

  if (action === "new-event-type") {
    const selectedEventType = normalizeEventType(target.dataset.eventType);
    newEventDraft.eventType = selectedEventType;
    newEventDraft.managementMode =
      selectedEventType === EVENT_TYPE_TRIP
        ? EVENT_MANAGEMENT_COLLABORATIVE
        : EVENT_MANAGEMENT_CENTRALIZED;
    screen = { name: "new-event-management" };
    render();
    requestAnimationFrame(() => {
      document
        .querySelector('[data-action="new-event-management-mode"][aria-checked="true"]')
        ?.focus();
    });
  }

  if (action === "join-event-screen") {
    notice = "";
    screen = { name: "join-event" };
    newEventDraft = null;
    ensureJoinEventDraft();
    joinEventDraft.error = "";
    eventDialog = null;
    editingGroupDraft = null;
    mergeParticipantsDraft = null;
    render();
  }

  if (action === "cancel-join-event") {
    notice = "";
    screen = { name: "home" };
    render();
    return;
  }

  if (action === "groups") {
    notice = "";
    screen = { name: "groups" };
    groupDraft = null;
    joinEventDraft = null;
    eventDialog = null;
    editingGroupDraft = null;
    mergeParticipantsDraft = null;
    render();
  }

  if (action === "event-status-filter") {
    eventStatusFilter = target.dataset.filter ?? "open";
    render();
  }

  if (action === "open-event") {
    notice = "";
    screen = { name: "event", eventId: target.dataset.eventId };
    rememberRecentEvent(target.dataset.eventId);
    expenseDraft = null;
    joinEventDraft = null;
    eventDialog = null;
    editingGroupDraft = null;
    render();
  }

  if (action === "new-event-add-guest") {
    const keepParticipantsOpen = Boolean(app.querySelector(".new-event-participants")?.open);
    addGuestToDraft(newEventDraft);
    if (keepParticipantsOpen) {
      const participantDetails = app.querySelector(".new-event-participants");
      if (participantDetails) participantDetails.open = true;
    }
  }

  if (action === "group-add-member") {
    addMemberToGroupDraft();
  }

  if (action === "edit-group-add-member") {
    addMemberToEditingGroupDraft();
  }

  if (action === "create-group") {
    createGroupFromDraft();
  }

  if (action === "edit-group") {
    startEditGroup(target.dataset.groupId);
  }

  if (action === "save-edit-group") {
    saveEditedGroup();
  }

  if (action === "cancel-edit-group") {
    editingGroupDraft = null;
    render();
  }

  if (action === "archive-group") {
    requestGroupArchive(target.dataset.groupId, target);
    return;
  }

  if (action === "remove-participant") {
    requestParticipantRemoval(target.dataset.participantId, target);
    return;
  }

  if (action === "create-event") {
    createEventFromDraft();
  }

  if (action === "new-event-management-mode") {
    newEventDraft.managementMode = target.dataset.managementMode;
    screen = { name: "new-event" };
    render();
    requestAnimationFrame(() => {
      document.querySelector('[data-action="new-event-name"]')?.focus();
    });
  }

  if (action === "set-event-management-mode") {
    setEventManagementMode(target.dataset.eventId, target.dataset.managementMode);
  }

  if (action === "join-existing-event") {
    await joinExistingEventFromDraft();
  }

  if (action === "event-add-guest") {
    addGuestToEvent(target.dataset.eventId);
  }

  if (action === "open-event-participants") {
    openEventDialog(target.dataset.eventId, "participants", target);
  }

  if (action === "open-event-share") {
    const eventId = target.dataset.eventId;
    openEventDialog(eventId, "share", target);
    try {
      await prepareEventShare(eventId);
    } catch {
      notice = "קישור ההצטרפות זמין להעתקה. הסנכרון לענן ינסה שוב כשיהיה חיבור.";
      render();
      reactivateDialogAfterRender(".event-modal");
      return;
    }

    notice = "קישור ההצטרפות מוכן לשיתוף.";
    if (eventDialog?.eventId === eventId && eventDialog.kind === "share") {
      render();
      reactivateDialogAfterRender(".event-modal");
    }
    return;
  }

  if (action === "open-event-settings") {
    openEventDialog(target.dataset.eventId, "settings", target);
  }

  if (action === "open-event-settings-section") {
    const section = target.dataset.settingsSection;
    if (!["management", "currency", "lock", "danger"].includes(section)) return;
    eventDialog = {
      eventId: target.dataset.eventId,
      kind: `settings-${section}`
    };
    render();
    reactivateDialogAfterRender(".event-modal");
  }

  if (action === "event-settings-back") {
    goBackInApp();
    return;
  }

  if (action === "close-event-dialog") {
    eventDialog = null;
    closeDialogWithHistory();
  }

  if (action === "copy-invite") {
    await copyInviteLink(target.dataset.eventId);
  }

  if (action === "share-invite-whatsapp") {
    await shareInviteOnWhatsApp(target.dataset.eventId);
  }

  if (action === "copy-settlement") {
    copySettlementSummary(target.dataset.eventId);
  }

  if (action === "copy-event-report") {
    copyEventReport(target.dataset.eventId);
  }

  if (action === "share-whatsapp") {
    shareSettlementOnWhatsApp(target.dataset.eventId);
  }

  if (action === "export-state") {
    exportStateBackup();
  }

  if (action === "toggle-admin-edit") {
    toggleAdminEditMode(target.dataset.eventId);
  }

  if (action === "leave-event") {
    requestEventLeave(target.dataset.eventId, target);
    return;
  }

  if (action === "delete-event") {
    requestEventDeletion(target.dataset.eventId, target);
    return;
  }

  if (action === "show-expense-form") {
    const event = getEvent(target.dataset.eventId);
    if (event && canCurrentParticipantEdit(event)) {
      notice = "";
      screen = { name: "event", eventId: event.id };
      rememberRecentEvent(event.id);
      eventDialog = null;
      startExpenseDraft(target.dataset.eventId, null, target);
    }
  }

  if (action === "continue-event-expense") {
    const event = getEvent(target.dataset.eventId);
    if (event && canCurrentParticipantEdit(event)) {
      notice = "";
      screen = { name: "event", eventId: event.id };
      rememberRecentEvent(event.id);
      eventDialog = null;
      startExpenseDraft(event.id, null, target);
    }
  }

  if (action === "edit-expense") {
    const event = getEvent(target.dataset.eventId);
    if (event && canCurrentParticipantEdit(event)) {
      eventDialog = null;
      startExpenseDraft(target.dataset.eventId, target.dataset.expenseId, target);
    }
  }

  if (action === "cancel-expense") {
    rememberExpenseDraft();
    expenseDraft = null;
    closeDialogWithHistory();
  }

  if (action === "add-payer") {
    addPayerToExpenseDraft();
    render();
  }

  if (action === "expense-add-payer-guest") {
    addInlinePayerGuest(target.dataset.eventId, Number(target.dataset.index));
  }

  if (action === "quick-item-add-guest") {
    addInlineQuickItemGuest(target.dataset.eventId, Number(target.dataset.index));
  }

  if (action === "expense-template") {
    applyExpenseTemplate(target.dataset.template);
  }

  if (action === "expense-mode") {
    expenseDraft.mode = target.dataset.mode === "items" ? "items" : "single";
    expenseDraft.error = "";
    render();
    activateDialog(".expense-modal");
  }

  if (action === "quick-purpose") {
    expenseDraft.quickPurpose = target.dataset.purpose === "paid" ? "paid" : "split";
    expenseDraft.error = "";
    render();
    activateDialog(".expense-modal");
  }

  if (action === "quick-item-add") {
    const previousItem = expenseDraft.quickItems.at(-1);
    expenseDraft.quickItems.push(
      createQuickItemDraft(previousItem?.sharedBy, previousItem?.sharedByParticipantIds)
    );
    render();
    activateDialog(".expense-modal");
    requestAnimationFrame(() => {
      const index = expenseDraft.quickItems.length - 1;
      app.querySelector(`[data-action="quick-item-name"][data-index="${index}"]`)?.focus();
    });
  }

  if (action === "quick-item-remove") {
    const index = Number(target.dataset.index);
    if (expenseDraft.quickItems.length > 1) {
      expenseDraft.quickItems.splice(index, 1);
      if (expenseDraft.quickInlineGuestIndex === index) {
        expenseDraft.quickInlineGuestIndex = null;
        expenseDraft.quickInlineGuestName = "";
      } else if (expenseDraft.quickInlineGuestIndex > index) {
        expenseDraft.quickInlineGuestIndex -= 1;
      }
      render();
      activateDialog(".expense-modal");
    }
  }

  if (action === "remove-payer") {
    const payerIndex = Number(target.dataset.index);
    expenseDraft.payers.splice(payerIndex, 1);
    if (expenseDraft.inlinePayerGuestIndex === payerIndex) {
      expenseDraft.inlinePayerGuestIndex = null;
      expenseDraft.inlinePayerGuestName = "";
    } else if (expenseDraft.inlinePayerGuestIndex > payerIndex) {
      expenseDraft.inlinePayerGuestIndex -= 1;
    }
    rebalanceExpenseDraftPayers();
    render();
  }

  if (action === "save-expense") {
    saveExpense(target.dataset.eventId);
  }

  if (action === "save-expense-and-continue") {
    saveExpense(target.dataset.eventId, { continueAdding: true });
  }

  if (action === "save-quick-expenses") {
    saveQuickExpenses(target.dataset.eventId);
  }

  if (action === "copy-quick-split") {
    await copyQuickSplitSummary();
  }

  if (action === "delete-expense") {
    requestExpenseDeletion(target.dataset.eventId, target.dataset.expenseId, target);
    return;
  }

  if (action === "settle") {
    notice = "";
    eventDialog = null;
    prepareSettlement(target.dataset.eventId);
  }

  if (action === "toggle-lock") {
    toggleEventLock(target.dataset.eventId);
  }

  if (action === "close-event") {
    requestCloseCurrentEvent(target.dataset.eventId);
    return;
  }

  if (action === "confirm-close-event") {
    const eventId = settlementCloseConfirmation?.eventId || target.dataset.eventId;
    closeCurrentEvent(eventId);
    return;
  }

  if (action === "cancel-close-event-confirmation") {
    cancelSettlementCloseConfirmation();
    return;
  }

  if (action === "reopen-event") {
    reopenCurrentEvent(target.dataset.eventId);
  }

  if (action === "merge-participants") {
    requestParticipantMerge(target);
    return;
  }

  if (action === "back-to-event") {
    screen = { name: "event", eventId: target.dataset.eventId };
    eventDialog = null;
    render();
  }

  if (action === "mark-paid") {
    markTransferPaid(target.dataset.transferId);
  }

  if (action === "mark-pending") {
    markTransferPending(target.dataset.transferId);
  }
}

function goBackInApp() {
  if (importantActionDialog) {
    closeImportantActionDialog();
    return;
  }

  if (eventRemovalMenu) {
    eventRemovalMenu = null;
    closeDialogWithHistory();
    return;
  }

  if (settlementCloseConfirmation) {
    settlementCloseConfirmation = null;
    renderHistoryFallback();
    return;
  }

  if (eventDialog?.kind?.startsWith("settings-")) {
    eventDialog = { eventId: eventDialog.eventId, kind: "settings" };
    renderHistoryFallback();
    reactivateDialogAfterRender(".event-modal");
    return;
  }

  if (eventDialog || expenseDraft || editingGroupDraft) {
    if (expenseDraft) rememberExpenseDraft();
    eventDialog = null;
    expenseDraft = null;
    editingGroupDraft = null;
    closeDialogWithHistory();
    return;
  }

  if (screen.name === "settlement" && screen.eventId) {
    screen = { name: "event", eventId: screen.eventId };
    eventDialog = null;
    renderHistoryFallback();
    return;
  }

  if (screen.name === "join-event") {
    screen = { name: "home" };
    renderHistoryFallback();
    return;
  }

  if (screen.name === "new-event" && newEventDraft) {
    screen = { name: "new-event-management" };
    renderHistoryFallback();
    return;
  }

  if (screen.name === "new-event-management" && newEventDraft) {
    screen = { name: "new-event-type" };
    renderHistoryFallback();
    return;
  }

  if (screen.name === "new-event-type") {
    screen = { name: "home" };
    newEventDraft = null;
    renderHistoryFallback();
    return;
  }

  if (screen.name !== "home") {
    const clearedInviteRoute = clearInviteRouteFromAddress();
    if (clearedInviteRoute) appHistoryDepth = 0;
    screen = { name: "home" };
    newEventDraft = null;
    joinEventDraft = null;
    expenseDraft = null;
    eventDialog = null;
    groupDraft = null;
    editingGroupDraft = null;
    mergeParticipantsDraft = null;
    renderHistoryFallback();
  }
}

function renderHistoryFallback() {
  const shouldRewindBrowserHistory = appHistoryDepth > 0 && window.history?.back;

  restoringBrowserHistory = true;
  try {
    render();
  } finally {
    restoringBrowserHistory = false;
  }

  if (shouldRewindBrowserHistory) {
    appHistoryDepth = Math.max(0, appHistoryDepth - 1);
    lastNavigationViewKey = navigationViewKey();
    window.history.back();
    return;
  }

  replaceBrowserHistoryState();
}

function clearInviteRouteFromAddress() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("event")) return false;
    url.searchParams.delete("event");
    window.history.replaceState(window.history.state, "", url);
    return true;
  } catch {
    return false;
  }
}

function closeDialogWithHistory() {
  const deferFocus = appHistoryDepth > 0 && Boolean(window.history?.back);
  deactivateDialog({ deferFocus });
  renderHistoryFallback();
}

function handleInput(event) {
  const target = event.target;
  const action = target.dataset.action;

  if (action === "profile-name") {
    profileNameDraft = target.value;
    profileError = "";
  }
  if (action === "new-event-name") newEventDraft.name = target.value;
  if (action === "new-event-guest-name") newEventDraft.guestName = target.value;
  if (action === "join-event-link") {
    ensureJoinEventDraft();
    joinEventDraft.link = target.value;
    joinEventDraft.error = "";
  }
  if (action === "group-name") {
    groupDraft.name = target.value;
    syncCreateGroupButton();
  }
  if (action === "group-member-name") groupDraft.newMemberName = target.value;
  if (action === "edit-group-name") editingGroupDraft.name = target.value;
  if (action === "edit-group-member-name") editingGroupDraft.newMemberName = target.value;
  if (action === "expense-name") expenseDraft.name = target.value;
  if (action === "expense-date") {
    expenseDraft.occurredOn = target.value;
    syncExpenseDetailsSummary();
  }
  if (action === "expense-total") {
    expenseDraft.total = target.value;
    rebalanceExpenseDraftPayers();
    syncExpensePayerAmountInputs();
    syncExpensePayerSummary();
    syncExpenseConfirmationSummary();
    syncExpenseSaveState();
  }
  if (action === "expense-payer-amount") {
    const index = Number(target.dataset.index);
    expenseDraft.payers[index] = markPayerAmountEdited(expenseDraft.payers[index], target.value);
    rebalanceExpenseDraftPayers();
    syncExpensePayerAmountInputs(index);
    syncExpensePayerSummary();
  }
  if (action === "expense-new-payer-name") {
    expenseDraft.inlinePayerGuestIndex = Number(target.dataset.index);
    expenseDraft.inlinePayerGuestName = target.value;
  }
  if (action === "quick-item-name") {
    expenseDraft.quickItems[Number(target.dataset.index)].name = target.value;
    syncQuickSplitSummary();
  }
  if (action === "quick-item-amount") {
    expenseDraft.quickItems[Number(target.dataset.index)].amount = target.value;
    syncQuickSplitSummary();
  }
  if (action === "quick-item-new-guest-name") {
    expenseDraft.quickInlineGuestIndex = Number(target.dataset.index);
    expenseDraft.quickInlineGuestName = target.value;
  }

  if (action?.startsWith("expense-") || action?.startsWith("quick-")) {
    rememberExpenseDraft();
  }

  replaceBrowserHistoryState();
}

async function handleChange(event) {
  const target = event.target;
  const action = target.dataset.action;

  if (action === "new-event-group") {
    const group = state.groups.find((item) => item.id === target.value);
    newEventDraft.groupId = target.value;
    newEventDraft.participantIds = group?.memberIds ? [...group.memberIds] : [state.currentParticipantId];
    syncNewEventParticipantControls();
  }

  if (action === "new-event-currency") {
    newEventDraft.currency = normalizeCurrency(target.value);
  }

  if (action === "new-event-participant") {
    toggleId(newEventDraft.participantIds, target.dataset.participantId, target.checked);
    syncNewEventParticipantControls();
  }

  if (action === "group-member") {
    toggleId(groupDraft.memberIds, target.dataset.participantId, target.checked);
    syncCreateGroupButton();
  }

  if (action === "edit-group-member") {
    toggleId(editingGroupDraft.memberIds, target.dataset.participantId, target.checked);
  }

  if (action === "edit-group-admin") {
    toggleId(editingGroupDraft.adminIds, target.dataset.participantId, target.checked);
  }

  if (action === "merge-source") {
    ensureMergeParticipantsDraft();
    mergeParticipantsDraft.sourceId = target.value;
    if (mergeParticipantsDraft.targetId === target.value) {
      mergeParticipantsDraft.targetId = firstParticipantIdExcept(target.value);
    }
    render();
  }

  if (action === "merge-target") {
    ensureMergeParticipantsDraft();
    mergeParticipantsDraft.targetId = target.value;
    if (mergeParticipantsDraft.sourceId === target.value) {
      mergeParticipantsDraft.sourceId = firstParticipantIdExcept(target.value);
    }
    render();
  }

  if (action === "event-participant") {
    toggleEventParticipant(screen.eventId, target.dataset.participantId, target.checked);
  }

  if (action === "event-currency") {
    const event = getEvent(target.dataset.eventId);
    if (
      event &&
      event.expenses.length === 0 &&
      canCurrentParticipantManage(event)
    ) {
      state = setEventCurrency(state, event.id, target.value);
      persistState();
      notice = `מטבע האירוע עודכן ל${currencySelectLabel(target.value)}.`;
      render();
    }
  }

  if (action === "expense-shared") {
    toggleId(expenseDraft.sharedByParticipantIds, target.dataset.participantId, target.checked);
    syncExpenseDetailsSummary();
    syncExpenseConfirmationSummary();
  }

  if (action === "expense-payer-id") {
    const payerIndex = Number(target.dataset.index);
    if (target.value === ADD_PAYER_PARTICIPANT_VALUE) {
      expenseDraft.inlinePayerGuestIndex = payerIndex;
      expenseDraft.inlinePayerGuestName = "";
      render();
      requestAnimationFrame(() => {
        app.querySelector(`[data-action="expense-new-payer-name"][data-index="${payerIndex}"]`)?.focus();
      });
      replaceBrowserHistoryState();
      return;
    }

    expenseDraft.payers[payerIndex].participantId = target.value;
    if (expenseDraft.inlinePayerGuestIndex === payerIndex) {
      expenseDraft.inlinePayerGuestIndex = null;
      expenseDraft.inlinePayerGuestName = "";
    }
    syncExpenseDetailsSummary();
  }

  if (action === "quick-expense-payer") {
    expenseDraft.quickPayerId = target.value;
  }

  if (action === "quick-item-shared-by") {
    const itemIndex = Number(target.dataset.index);
    const item = expenseDraft.quickItems[itemIndex];
    const previousSharedBy = item.sharedBy;

    if (target.value === ADD_QUICK_ITEM_GUEST_VALUE) {
      expenseDraft.quickInlineGuestIndex = itemIndex;
      expenseDraft.quickInlineGuestName = "";
      render();
      activateDialog(".expense-modal");
      requestAnimationFrame(() => {
        app.querySelector(
          `[data-action="quick-item-new-guest-name"][data-index="${itemIndex}"]`
        )?.focus();
      });
      replaceBrowserHistoryState();
      return;
    }

    if (expenseDraft.quickInlineGuestIndex === itemIndex) {
      expenseDraft.quickInlineGuestIndex = null;
      expenseDraft.quickInlineGuestName = "";
    }
    item.sharedBy = target.value;
    if (target.value === QUICK_ITEM_CUSTOM_PARTICIPANTS) {
      const event = getEvent(expenseDraft.eventId);
      item.sharedByParticipantIds =
        previousSharedBy === QUICK_ITEM_ALL_PARTICIPANTS
          ? [...(event?.participantIds ?? [])]
          : [previousSharedBy].filter((participantId) =>
              event?.participantIds.includes(participantId)
            );
      render();
      activateDialog(".expense-modal");
      replaceBrowserHistoryState();
      return;
    }
    delete item.sharedByParticipantIds;
    syncQuickSplitSummary();
  }

  if (action === "quick-item-custom-participant") {
    const item = expenseDraft.quickItems[Number(target.dataset.index)];
    item.sharedByParticipantIds ??= [];
    toggleId(item.sharedByParticipantIds, target.dataset.participantId, target.checked);
    target.closest("label")?.classList.toggle("is-selected", target.checked);
    syncQuickSplitSummary();
  }

  if (action === "import-state-file") {
    await importStateBackup(target.files[0], target);
    target.value = "";
  }

  if (action?.startsWith("expense-") || action?.startsWith("quick-")) {
    rememberExpenseDraft();
  }
  replaceBrowserHistoryState();
}

function createEventFromDraft() {
  if (newEventDraft.participantIds.length === 0) {
    window.alert("צריך לבחור לפחות משתתף אחד.");
    return;
  }

  const createdAt = new Date();
  const event = {
    id: makeId("event"),
    name:
      newEventDraft.name.trim() ||
      uniqueDefaultEventName(
        newEventDraft.eventType,
        createdAt,
        state.events.map((item) => item.name)
      ),
    eventType: normalizeEventType(newEventDraft.eventType),
    currency: normalizeCurrency(newEventDraft.currency),
    groupId: newEventDraft.groupId || undefined,
    participantIds: [...newEventDraft.participantIds],
    expenses: [],
    transfers: [],
    adminIds: [state.currentParticipantId],
    createdByParticipantId: state.currentParticipantId,
    adminsCanEditOnly: managementModeRequiresAdmin(newEventDraft.managementMode),
    locked: false,
    createdAt: createdAt.toISOString()
  };

  state.events.unshift(event);
  persistState();
  newEventDraft = null;
  joinEventDraft = null;
  screen = { name: "event", eventId: event.id };
  appHistoryDepth = 0;
  lastNavigationViewKey = "";
  render();
}

async function joinExistingEventFromDraft() {
  ensureJoinEventDraft();
  joinEventDraft.link = joinEventDraft.link.trim();

  if (!joinEventDraft.link) {
    joinEventDraft.error = "צריך להדביק קישור הצטרפות.";
    render();
    return;
  }

  const eventId = parseEventIdFromJoinInput();
  if (!eventId) {
    joinEventDraft.error = "הקישור לא נראה כמו קישור הצטרפות תקין.";
    render();
    return;
  }

  const inviteCredentials = {
    id: parseInviteSpaceId(joinEventDraft.link),
    key: parseInviteSpaceKey(joinEventDraft.link)
  };
  const inviteSnapshot = parseInviteSnapshot(joinEventDraft.link);
  state = applyInviteSnapshot(state, joinEventDraft.link, inviteSnapshot);
  if (inviteCredentials.id && inviteCredentials.key) {
    try {
      const joinRuntimeConfig = await loadRuntimeConfig();
      runtimeConfig = joinRuntimeConfig;
      const sharedEventState = await readSharedEventState(
        joinRuntimeConfig,
        inviteCredentials,
        eventId
      );
      if (sharedEventState) {
        state = mergeSharedEventIntoState(state, sharedEventState, inviteCredentials);
      } else {
        const invitedEvent = state.events.find((item) => item.id === eventId);
        if (invitedEvent) {
          invitedEvent.sharedSpaceId = inviteCredentials.id;
          invitedEvent.sharedSpaceKey = inviteCredentials.key;
        }
      }
    } catch {
      // The safe invite preview still lets the user enter and retry syncing later.
    }
  }
  let event = getEvent(eventId);
  if (!event) {
    state = syncLocalProfile(applyInviteSnapshot(await loadSharedState(), joinEventDraft.link, inviteSnapshot));
    event = getEvent(eventId);
  }

  if (!event) {
    joinEventDraft.error = "לא מצאנו אירוע לפי הקישור הזה. כדאי לוודא שהקישור הועתק במלואו.";
    render();
    return;
  }

  const profile = localProfile ?? {
    participantId: state.currentParticipantId || makeId("user"),
    displayName: participantName(state.currentParticipantId)
  };
  state = ensureNamedParticipant(
    state,
    {
      ...profile,
      id: profile.participantId,
      displayName: profile.displayName
    },
    eventId
  );
  const participant = state.participants.find(
    (item) => item.id === state.currentParticipantId
  );

  if (participant) {
    localProfile = saveLocalProfile({
      ...profile,
      participantId: participant.id,
      displayName: participant.displayName
    });
    profileNameDraft = participant.displayName;
  }

  await saveSharedState(state);
  joinEventDraft = null;
  newEventDraft = null;
  screen = { name: "event", eventId };
  notice = "הצטרפת לאירוע.";
  render();
}

function ensureJoinEventDraft() {
  if (!joinEventDraft) {
    joinEventDraft = { link: "", error: "" };
  }
}

function parseEventIdFromJoinInput() {
  try {
    return parseInviteEventId(joinEventDraft.link) ?? "";
  } catch {
    return joinEventDraft.link.startsWith("event-") ? joinEventDraft.link : "";
  }
}

function addGuestToDraft(draft) {
  const name = draft.guestName.trim();
  if (!name) return;
  const guest = { id: makeId("guest"), displayName: name, kind: "guest" };
  state.participants.push(guest);
  draft.participantIds.push(guest.id);
  draft.guestName = "";
  persistState();
  render();
}

function addMemberToGroupDraft() {
  const name = groupDraft.newMemberName.trim();
  if (!name) return;

  const member = { id: makeId("member"), displayName: name, kind: "guest" };
  state.participants.push(member);
  groupDraft.memberIds.push(member.id);
  groupDraft.newMemberName = "";
  persistState();
  render();
}

function startEditGroup(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) return;

  editingGroupDraft = {
    id: group.id,
    name: group.name,
    memberIds: [...group.memberIds],
    adminIds: [...(group.adminIds ?? [])],
    newMemberName: ""
  };
  render();
}

function addMemberToEditingGroupDraft() {
  if (!editingGroupDraft) return;

  const name = editingGroupDraft.newMemberName.trim();
  if (!name) return;

  const member = { id: makeId("member"), displayName: name, kind: "guest" };
  state.participants.push(member);
  editingGroupDraft.memberIds.push(member.id);
  editingGroupDraft.newMemberName = "";
  persistState();
  render();
}

function saveEditedGroup() {
  if (!editingGroupDraft) return;

  if (editingGroupDraft.memberIds.length === 0) {
    window.alert("צריך לבחור לפחות חבר אחד לקבוצה.");
    return;
  }

  state = updateGroup(state, editingGroupDraft.id, {
    name: editingGroupDraft.name,
    memberIds: editingGroupDraft.memberIds,
    adminIds: editingGroupDraft.adminIds
  });
  editingGroupDraft = null;
  notice = "הקבוצה עודכנה.";
  persistState();
  render();
}

function createGroupFromDraft() {
  const groupName = groupDraft.name.trim();
  if (!groupName) {
    app.querySelector('[data-action="group-name"]')?.focus();
    return;
  }

  if (groupDraft.memberIds.length === 0) {
    window.alert("צריך לבחור לפחות חבר אחד לקבוצה.");
    return;
  }

  state = createGroup(state, {
    id: makeId("group"),
    name: groupName,
    memberIds: groupDraft.memberIds,
    adminId: state.currentParticipantId,
    createdAt: new Date().toISOString()
  });
  persistState();
  groupDraft = null;
  render();
}

function syncCreateGroupButton() {
  const button = app.querySelector('[data-action="create-group"]');
  if (!button || !groupDraft) return;

  button.disabled = !groupDraft.name.trim() || groupDraft.memberIds.length === 0;
}

function requestApplicationReset(trigger) {
  openImportantActionDialog(
    {
      kind: "reset-application",
      title: "למחוק את כל הנתונים במכשיר הזה?",
      description: "כל הקבוצות, האירועים וההוצאות המקומיים יימחקו. אי אפשר לבטל את הפעולה.",
      confirmLabel: "מחק את כל הנתונים",
      payload: {}
    },
    trigger
  );
}

function requestGroupArchive(groupId, trigger) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group || group.archived) return;

  openImportantActionDialog(
    {
      kind: "archive-group",
      title: `להעביר את "${group.name}" לארכיון?`,
      description: "הקבוצה לא תופיע יותר ברשימת הקבוצות הפעילות. אירועים שכבר נוצרו ממנה יישארו.",
      confirmLabel: "העבר לארכיון",
      payload: { groupId }
    },
    trigger
  );
}

function requestParticipantRemoval(participantId, trigger) {
  const participant = state.participants.find((item) => item.id === participantId);
  if (!participant) return;

  if (!canRemoveParticipant(state, participantId)) {
    notice = participantRemovalBlockedMessage(participantId);
    render();
    return;
  }

  openImportantActionDialog(
    {
      kind: "remove-participant",
      title: `להסיר את ${participant.displayName} מהשמות השמורים?`,
      description: "השם יוסר מהקבוצות ומהאירועים שבהם אין לו היסטוריית תשלומים, ולא יוצע באירועים חדשים.",
      confirmLabel: "הסר שם",
      payload: { participantId }
    },
    trigger
  );
}

function requestParticipantMerge(trigger) {
  ensureMergeParticipantsDraft();
  if (!mergeParticipantsDraft) return;

  const source = state.participants.find(
    (participant) => participant.id === mergeParticipantsDraft.sourceId
  );
  const target = state.participants.find(
    (participant) => participant.id === mergeParticipantsDraft.targetId
  );
  if (!source || !target || source.id === target.id) return;

  openImportantActionDialog(
    {
      kind: "merge-participants",
      title: `לאחד את ${source.displayName} עם ${target.displayName}?`,
      description: `כל ההיסטוריה של ${source.displayName} תעבור אל ${target.displayName}, והשם ${source.displayName} יוסר. אי אפשר לבטל את הפעולה.`,
      confirmLabel: "אחד שמות",
      payload: { sourceId: source.id, targetId: target.id }
    },
    trigger
  );
}

function requestExpenseDeletion(eventId, expenseId, trigger) {
  const event = getEvent(eventId);
  const expense = event?.expenses.find((item) => item.id === expenseId);
  if (!event || !expense) return;

  if (!canCurrentParticipantEdit(event)) {
    notice = editBlockedMessage(event);
    render();
    return;
  }

  openImportantActionDialog(
    {
      kind: "delete-expense",
      title: `למחוק את "${expense.name}"?`,
      description: `ההוצאה בסך ${formatEventMoney(event, expense.total)} תימחק והחישוב של האירוע יתעדכן. אי אפשר לבטל את הפעולה.`,
      confirmLabel: "מחק הוצאה",
      payload: { eventId, expenseId }
    },
    trigger
  );
}

function requestEventLeave(eventId, trigger) {
  const event = getEvent(eventId);
  if (!event) return;

  if (!canLeaveEvent(state, eventId, state.currentParticipantId)) {
    notice = "אי אפשר לעזוב אירוע שיש בו הוצאות או העברות על שמך, או כשאתה המנהל היחיד.";
    render();
    return;
  }

  openImportantActionDialog(
    {
      kind: "leave-event",
      title: `לעזוב את "${event.name}"?`,
      description: "האירוע יוסר מהמסך שלך. כדי לחזור אליו תצטרך לקבל קישור הצטרפות חדש.",
      confirmLabel: "עזוב אירוע",
      payload: { eventId }
    },
    trigger
  );
}

function requestEventDeletion(eventId, trigger) {
  const event = getEvent(eventId);
  if (!event) return;

  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול למחוק אירוע.";
    render();
    return;
  }

  openImportantActionDialog(
    {
      kind: "delete-event",
      title: `למחוק את "${event.name}"?`,
      description: "כל ההוצאות, המשתתפים וההעברות באירוע יימחקו לצמיתות. אי אפשר לשחזר אותו.",
      confirmLabel: "מחק אירוע",
      payload: { eventId }
    },
    trigger
  );
}

function openImportantActionDialog(config, trigger) {
  if (importantActionDialog) return;

  const replacesEventRemovalMenu = Boolean(eventRemovalMenu);
  importantActionReturnFocus = replacesEventRemovalMenu
    ? dialogReturnFocus
    : createActionFocusDescriptor(trigger);
  eventRemovalMenu = null;
  importantActionDialog = config;
  if (replacesEventRemovalMenu) {
    restoringBrowserHistory = true;
    try {
      render();
    } finally {
      restoringBrowserHistory = false;
    }
    replaceBrowserHistoryState();
  } else {
    render();
  }
  activateDialog(".important-action-dialog");
  requestAnimationFrame(() => {
    app
      .querySelector('[data-action="cancel-important-action"]')
      ?.focus({ preventScroll: true });
  });
}

function closeImportantActionDialog() {
  if (!importantActionDialog) return;

  const returnFocus = importantActionReturnFocus;
  const underlyingDialogSelector = expenseDraft
    ? ".expense-modal"
    : eventDialog
      ? ".event-modal"
      : "";
  const shouldRewindBrowserHistory = appHistoryDepth > 0 && window.history?.back;

  importantActionDialog = null;
  importantActionReturnFocus = null;
  clearDialogBackgroundInert();

  restoringBrowserHistory = true;
  try {
    render();
  } finally {
    restoringBrowserHistory = false;
  }

  if (underlyingDialogSelector) {
    activateDialog(underlyingDialogSelector);
  } else {
    deactivateDialog();
  }

  if (shouldRewindBrowserHistory) {
    appHistoryDepth = Math.max(0, appHistoryDepth - 1);
    lastNavigationViewKey = navigationViewKey();
    window.history.back();
  } else {
    replaceBrowserHistoryState();
  }

  window.setTimeout(() => restoreActionFocus(returnFocus), 180);
}

async function confirmImportantAction() {
  const pendingAction = importantActionDialog;
  if (!pendingAction) return;

  const shouldRewindBrowserHistory = appHistoryDepth > 0 && window.history?.back;
  importantActionDialog = null;
  importantActionReturnFocus = null;
  clearDialogBackgroundInert();
  document.body.classList.remove("app-dialog-open");
  dialogReturnFocus = null;
  pendingDialogReturnFocus = null;
  dialogReturnScrollY = 0;

  restoringBrowserHistory = true;
  try {
    await executeImportantAction(pendingAction);
  } finally {
    restoringBrowserHistory = false;
  }

  if (shouldRewindBrowserHistory) {
    appHistoryDepth = Math.max(0, appHistoryDepth - 1);
    lastNavigationViewKey = navigationViewKey();
    window.history.back();
  } else {
    replaceBrowserHistoryState();
  }
}

async function executeImportantAction(action) {
  if (action.kind === "reset-application") {
    await resetApplicationState();
    return;
  }

  if (action.kind === "archive-group") {
    archiveGroupInState(action.payload.groupId);
    return;
  }

  if (action.kind === "remove-participant") {
    removeParticipantFromState(action.payload.participantId);
    return;
  }

  if (action.kind === "merge-participants") {
    mergeParticipantsDraft = {
      sourceId: action.payload.sourceId,
      targetId: action.payload.targetId
    };
    mergeParticipantsInState();
    return;
  }

  if (action.kind === "delete-expense") {
    deleteExpense(action.payload.eventId, action.payload.expenseId);
    return;
  }

  if (action.kind === "leave-event") {
    leaveCurrentEvent(action.payload.eventId);
    return;
  }

  if (action.kind === "delete-event") {
    deleteCurrentEvent(action.payload.eventId);
    return;
  }

  if (action.kind === "restore-backup") {
    restoreStateBackup(action.payload.restoredState);
    return;
  }

  render();
}

async function resetApplicationState() {
  state = await resetSharedState();
  screen = { name: "home" };
  newEventDraft = null;
  joinEventDraft = null;
  expenseDraft = null;
  eventDialog = null;
  groupDraft = null;
  editingGroupDraft = null;
  mergeParticipantsDraft = null;
  notice = "הנתונים במכשיר נמחקו.";
  render();
}

function createActionFocusDescriptor(element) {
  if (!(element instanceof HTMLElement)) return null;

  return {
    element,
    action: element.dataset.action ?? "",
    eventId: element.dataset.eventId ?? "",
    expenseId: element.dataset.expenseId ?? "",
    groupId: element.dataset.groupId ?? "",
    participantId: element.dataset.participantId ?? ""
  };
}

function restoreActionFocus(returnTarget) {
  if (!returnTarget) return;
  if (returnTarget.element?.isConnected) {
    returnTarget.element.focus({ preventScroll: true });
    return;
  }

  const replacement = [...app.querySelectorAll("[data-action]")].find((element) =>
    element.dataset.action === returnTarget.action &&
    (!returnTarget.eventId || element.dataset.eventId === returnTarget.eventId) &&
    (!returnTarget.expenseId || element.dataset.expenseId === returnTarget.expenseId) &&
    (!returnTarget.groupId || element.dataset.groupId === returnTarget.groupId) &&
    (!returnTarget.participantId || element.dataset.participantId === returnTarget.participantId)
  );

  replacement?.focus({ preventScroll: true });
}

function archiveGroupInState(groupId) {
  state = archiveGroup(state, groupId);
  persistState();
  render();
}

function removeParticipantFromState(participantId) {
  const participant = state.participants.find((item) => item.id === participantId);
  if (!participant) return;

  if (!canRemoveParticipant(state, participantId)) {
    notice = participantRemovalBlockedMessage(participantId);
    render();
    return;
  }

  state = removeParticipant(state, participantId);
  dropParticipantFromDrafts(participantId);
  notice = `${participant.displayName} הוסר מהשמות השמורים.`;
  persistState();
  render();
}

function participantRemovalBlockedMessage(participantId) {
  return participantId === state.currentParticipantId
    ? "אי אפשר להסיר את השם שמחובר במכשיר הזה. אפשר להחליף שם מהמסך הראשי."
    : "אי אפשר להסיר שם שכבר מופיע בהוצאות. קודם עורכים או מוחקים את ההוצאות שלו.";
}

function ensureMergeParticipantsDraft() {
  if (mergeParticipantsDraft && participantsExistForMerge(mergeParticipantsDraft)) return;

  const [source, target] = state.participants;
  mergeParticipantsDraft = source && target
    ? { sourceId: source.id, targetId: target.id }
    : null;
}

function participantsExistForMerge(draft) {
  const ids = new Set(state.participants.map((participant) => participant.id));
  return ids.has(draft.sourceId) && ids.has(draft.targetId) && draft.sourceId !== draft.targetId;
}

function firstParticipantIdExcept(participantId) {
  return state.participants.find((participant) => participant.id !== participantId)?.id ?? "";
}

function mergeParticipantsInState() {
  ensureMergeParticipantsDraft();
  if (!mergeParticipantsDraft) return;

  const source = state.participants.find((participant) => participant.id === mergeParticipantsDraft.sourceId);
  const target = state.participants.find((participant) => participant.id === mergeParticipantsDraft.targetId);
  if (!source || !target || source.id === target.id) return;

  state = mergeParticipants(state, source.id, target.id);
  if (localProfile?.participantId === source.id) {
    localProfile = saveLocalProfile({
      ...localProfile,
      participantId: target.id,
      displayName: target.displayName
    });
  }
  dropParticipantFromDrafts(source.id);
  mergeParticipantsDraft = null;
  notice = `${source.displayName} אוחד לתוך ${target.displayName}.`;
  persistState();
  render();
}

function dropParticipantFromDrafts(participantId) {
  if (groupDraft) {
    groupDraft.memberIds = groupDraft.memberIds.filter((id) => id !== participantId);
  }

  if (editingGroupDraft) {
    editingGroupDraft.memberIds = editingGroupDraft.memberIds.filter((id) => id !== participantId);
    editingGroupDraft.adminIds = editingGroupDraft.adminIds.filter((id) => id !== participantId);
  }

  if (newEventDraft) {
    newEventDraft.participantIds = newEventDraft.participantIds.filter((id) => id !== participantId);
  }

  if (expenseDraft) {
    expenseDraft.sharedByParticipantIds = expenseDraft.sharedByParticipantIds.filter((id) => id !== participantId);
    expenseDraft.payers = expenseDraft.payers.filter((payer) => payer.participantId !== participantId);
  }

  if (mergeParticipantsDraft) {
    if (mergeParticipantsDraft.sourceId === participantId || mergeParticipantsDraft.targetId === participantId) {
      mergeParticipantsDraft = null;
    }
  }
}

function addGuestToEvent(eventId) {
  const input =
    app.querySelector('.event-modal [data-action="event-guest-name"]') ??
    app.querySelector('[data-action="event-guest-name"]');
  const dialogSelector = input?.closest(".expense-modal")
    ? ".expense-modal"
    : input?.closest(".event-modal")
      ? ".event-modal"
      : "";
  const dialogScrollTop = input?.closest(".expense-modal, .event-modal")?.scrollTop ?? 0;
  const name = input?.value.trim();
  if (!name) return;
  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    notice = editBlockedMessage(event);
    render();
    reactivateDialogAfterRender(dialogSelector);
    return;
  }
  const guest = { id: makeId("guest"), displayName: name, kind: "guest" };
  state.participants.push(guest);
  event.participantIds.push(guest.id);
  event.membershipUpdatedAt = new Date().toISOString();
  if (expenseDraft?.eventId === event.id && !expenseDraft.sharedByParticipantIds.includes(guest.id)) {
    expenseDraft.sharedByParticipantIds.push(guest.id);
  }
  persistState();
  render();
  reactivateDialogAfterRender(
    dialogSelector,
    `${dialogSelector} [data-action="event-guest-name"]`,
    dialogScrollTop
  );
}

function addInlinePayerGuest(eventId, payerIndex) {
  if (!expenseDraft || !Number.isInteger(payerIndex) || !expenseDraft.payers[payerIndex]) return;
  const dialogScrollTop = app.querySelector(".expense-modal")?.scrollTop ?? 0;

  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    expenseDraft.error = editBlockedMessage(event);
    render();
    reactivateDialogAfterRender(".expense-modal");
    return;
  }

  const input = app.querySelector(
    `[data-action="expense-new-payer-name"][data-index="${payerIndex}"]`
  );
  const name = (expenseDraft.inlinePayerGuestName ?? input?.value ?? "").trim();
  if (!name) {
    expenseDraft.error = "צריך להזין שם משלם.";
    render();
    reactivateDialogAfterRender(
      ".expense-modal",
      `[data-action="expense-new-payer-name"][data-index="${payerIndex}"]`,
      dialogScrollTop
    );
    return;
  }

  const guest = { id: makeId("guest"), displayName: name, kind: "guest" };
  state.participants.push(guest);
  event.participantIds.push(guest.id);
  event.membershipUpdatedAt = new Date().toISOString();
  if (!expenseDraft.sharedByParticipantIds.includes(guest.id)) {
    expenseDraft.sharedByParticipantIds.push(guest.id);
  }
  expenseDraft.payers[payerIndex].participantId = guest.id;
  expenseDraft.inlinePayerGuestIndex = null;
  expenseDraft.inlinePayerGuestName = "";
  expenseDraft.error = "";
  rebalanceExpenseDraftPayers(payerIndex);
  persistState();
  render();
  reactivateDialogAfterRender(
    ".expense-modal",
    `[data-action="expense-payer-amount"][data-index="${payerIndex}"]`,
    dialogScrollTop
  );
}

function addInlineQuickItemGuest(eventId, itemIndex) {
  if (!expenseDraft || !Number.isInteger(itemIndex) || !expenseDraft.quickItems[itemIndex]) return;

  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    expenseDraft.error = editBlockedMessage(event);
    render();
    activateDialog(".expense-modal");
    return;
  }

  const input = app.querySelector(
    `[data-action="quick-item-new-guest-name"][data-index="${itemIndex}"]`
  );
  const name = (expenseDraft.quickInlineGuestName ?? input?.value ?? "").trim();
  if (!name) {
    expenseDraft.error = "צריך להזין שם אורח.";
    render();
    activateDialog(".expense-modal");
    requestAnimationFrame(() => {
      app.querySelector(
        `[data-action="quick-item-new-guest-name"][data-index="${itemIndex}"]`
      )?.focus();
    });
    return;
  }

  const guest = { id: makeId("guest"), displayName: name, kind: "guest" };
  state.participants.push(guest);
  event.participantIds.push(guest.id);
  event.membershipUpdatedAt = new Date().toISOString();
  if (!expenseDraft.sharedByParticipantIds.includes(guest.id)) {
    expenseDraft.sharedByParticipantIds.push(guest.id);
  }
  expenseDraft.quickItems[itemIndex].sharedBy = guest.id;
  delete expenseDraft.quickItems[itemIndex].sharedByParticipantIds;
  expenseDraft.quickInlineGuestIndex = null;
  expenseDraft.quickInlineGuestName = "";
  expenseDraft.error = "";
  persistState();
  render();
  activateDialog(".expense-modal");
}

function prepareEventShare(eventId) {
  const activePreparation = eventSharePreparationPromises.get(eventId);
  if (activePreparation) return activePreparation;

  const preparation = prepareEventShareNow(eventId).finally(() => {
    eventSharePreparationPromises.delete(eventId);
  });
  eventSharePreparationPromises.set(eventId, preparation);
  return preparation;
}

async function prepareEventShareNow(eventId) {
  const event = getEvent(eventId);
  if (!event) throw new Error("Event not found");
  const shareRuntimeConfig = await loadRuntimeConfig();
  runtimeConfig = shareRuntimeConfig;
  if (shareRuntimeConfig.storage?.mode === "supabase") {
    ensureEventShareCredentials(event);
    state = await saveSharedEventState(shareRuntimeConfig, state, eventId);
  }
  await saveSharedState(state);
  return eventInviteUrl(eventId);
}

async function copyInviteLink(eventId) {
  const inviteUrl = await prepareEventShare(eventId);
  copyText(inviteUrl, "קישור ההזמנה הועתק.");
}

async function shareInviteOnWhatsApp(eventId) {
  const event = getEvent(eventId);
  if (!event) return;

  const shareWindow = openPendingShareWindow();

  try {
    const inviteUrl = await prepareEventShare(eventId);
    const message = `מצטרפים לאירוע "${event.name}" בסוגרים חשבון:\n${inviteUrl}`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;

    if (shareWindow && !shareWindow.closed) {
      shareWindow.location.replace(url);
    } else {
      window.location.assign(url);
      return;
    }
    notice = "פתחתי הודעת וואטסאפ עם קישור ההצטרפות.";
  } catch {
    shareWindow?.close();
    notice = "לא הצלחנו לפתוח את WhatsApp. אפשר עדיין להעתיק את קישור ההצטרפות.";
  }
  render();
}

function openPendingShareWindow() {
  try {
    const shareWindow = window.open("about:blank", "_blank");
    if (!shareWindow) return null;
    shareWindow.opener = null;
    shareWindow.document.title = "פותחים את WhatsApp";
    return shareWindow;
  } catch {
    return null;
  }
}

async function copySettlementSummary(eventId) {
  const event = getEvent(eventId);
  if (!event) return;

  const participants = eventParticipants(event);
  const summary = formatSettlementSummary({
    eventName: event.name,
    participants,
    transfers: eventSettlementTransfers(event, participants),
    currency: event.currency
  });
  copyText(summary, "סיכום ההתחשבנות הועתק.");
}

async function copyEventReport(eventId) {
  const event = getEvent(eventId);
  if (!event) return;

  const participants = eventParticipants(event);
  const report = formatEventReport({
    eventName: event.name,
    participants,
    expenses: event.expenses,
    transfers: eventSettlementTransfers(event, participants),
    currency: event.currency
  });
  copyText(report, "דוח האירוע הועתק.");
}

function shareSettlementOnWhatsApp(eventId) {
  const event = getEvent(eventId);
  if (!event) return;

  const participants = eventParticipants(event);
  const summary = formatSettlementSummary({
    eventName: event.name,
    participants,
    transfers: eventSettlementTransfers(event, participants),
    currency: event.currency
  });
  const url = `https://wa.me/?text=${encodeURIComponent(summary)}`;

  try {
    window.open(url, "_blank", "noopener,noreferrer");
    notice = "פתחתי הודעת וואטסאפ עם הסיכום.";
  } catch {
    notice = `אפשר לשלוח ידנית: ${summary}`;
  }
  render();
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    notice = successMessage;
  } catch {
    notice = `אפשר להעתיק ידנית: ${text}`;
  }
  render();
}

function exportStateBackup() {
  const json = serializeStateBackup(state);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `settle-friends-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  notice = "קובץ גיבוי נוצר.";
  render();
}

async function importStateBackup(file, trigger) {
  if (!file) return;

  try {
    const restoredState = parseStateBackup(await file.text());
    openImportantActionDialog(
      {
        kind: "restore-backup",
        title: "לשחזר את קובץ הגיבוי?",
        description: "כל הקבוצות, האירועים וההוצאות הקיימים יוחלפו בתוכן הקובץ שבחרת.",
        confirmLabel: "שחזר גיבוי",
        payload: { restoredState }
      },
      trigger
    );
  } catch {
    notice = "קובץ הגיבוי לא מתאים או פגום.";
    render();
  }
}

function restoreStateBackup(restoredState) {
  state = restoredState;
  screen = { name: "home" };
  newEventDraft = null;
  joinEventDraft = null;
  expenseDraft = null;
  eventDialog = null;
  groupDraft = null;
  editingGroupDraft = null;
  mergeParticipantsDraft = null;
  notice = "הגיבוי שוחזר.";
  persistState();
  render();
}

async function saveProfileFromDraft() {
  const displayName = normalizeProfileName(profileNameDraft);
  if (!isFullProfileName(displayName)) {
    profileError = "צריך להזין שם פרטי ושם משפחה כדי להמשיך.";
    render();
    return;
  }

  const invitedEventId = parseInviteEventId(window.location.href);
  state = applyInviteSnapshot(state);
  const nextState = ensureNamedParticipant(
    state,
    {
      id: localProfile?.participantId ?? makeId("user"),
      displayName,
      authProvider: localProfile?.authProvider,
      authSubject: localProfile?.authSubject,
      email: localProfile?.email
    },
    invitedEventId
  );
  const participant = nextState.participants.find(
    (item) => item.id === nextState.currentParticipantId
  );

  state = nextState;
  localProfile = saveLocalProfile({
    participantId: state.currentParticipantId,
    displayName: participant?.displayName ?? displayName,
    authProvider: participant?.authProvider ?? localProfile?.authProvider,
    authSubject: participant?.authSubject ?? localProfile?.authSubject,
    email: participant?.email ?? localProfile?.email
  });
  profileNameDraft = localProfile.displayName;
  profileError = "";
  screen = invitedEventId && getEvent(invitedEventId)
    ? { name: "event", eventId: invitedEventId }
    : { name: "home" };
  notice = `נכנסת בתור ${participantName(state.currentParticipantId)}.`;

  await saveSharedState(state);
  appHistoryDepth = 0;
  lastNavigationViewKey = "";
  render();
}

function startExpenseDraft(eventId, expenseId = null, trigger = document.activeElement) {
  const event = getEvent(eventId);
  const existingExpense = event.expenses.find((expense) => expense.id === expenseId);

  rememberDialogReturnFocus(trigger);

  if (existingExpense) {
    expenseDraft = {
      id: existingExpense.id,
      eventId,
      mode: "single",
      name: existingExpense.name,
      total: formatMoney(existingExpense.total),
      occurredOn: existingExpense.occurredOn ?? dateFromIso(existingExpense.updatedAt),
      payers: existingExpense.payers.map((payer) => ({
        participantId: payer.participantId,
        amount: formatMoney(payer.amount),
        amountTouched: true,
        autoAmount: false
      })),
      sharedByParticipantIds: [...existingExpense.sharedByParticipantIds],
      createdByParticipantId: existingExpense.createdByParticipantId,
      inlinePayerGuestIndex: null,
      inlinePayerGuestName: "",
      quickInlineGuestIndex: null,
      quickInlineGuestName: "",
      error: ""
    };
    render();
    activateExpenseEntryDialog();
    return;
  }

  const rememberedDraft = restoreExpenseDraft(event);
  if (rememberedDraft) {
    expenseDraft = rememberedDraft;
    render();
    activateExpenseEntryDialog();
    return;
  }

  expenseDraft = {
    eventId,
    mode: defaultExpenseModeForEvent(event.eventType),
    name: "",
    total: "",
    occurredOn: todayInputValue(),
    payers: [createPayerDraft(state.currentParticipantId)],
    sharedByParticipantIds: [...event.participantIds],
    quickPurpose: "split",
    quickPayerId: state.currentParticipantId,
    quickItems: [createQuickItemDraft()],
    inlinePayerGuestIndex: null,
    inlinePayerGuestName: "",
    quickInlineGuestIndex: null,
    quickInlineGuestName: "",
    error: ""
  };
  render();
  activateExpenseEntryDialog();
}

function activateExpenseEntryDialog() {
  const focusSelector = expenseDraft?.mode === "quick"
    ? '[data-action="quick-item-name"][data-index="0"]'
    : '[data-action="expense-total"]';
  activateDialog(".expense-modal", focusSelector);
}

function createQuickItemDraft(sharedBy = state.currentParticipantId, sharedByParticipantIds) {
  return {
    name: "",
    amount: "",
    sharedBy,
    ...(Array.isArray(sharedByParticipantIds)
      ? { sharedByParticipantIds: [...sharedByParticipantIds] }
      : {})
  };
}

function renderRestoredDraftNote() {
  if (!expenseDraft?.restored) return "";
  return `<p class="draft-restored-note" role="status">הטיוטה האחרונה שלך שוחזרה אוטומטית</p>`;
}

function rememberExpenseDraft() {
  const key = expenseDraftMemoryKey(state?.currentParticipantId, expenseDraft?.eventId);
  const serializedDraft = serializeExpenseDraftMemory(expenseDraft);
  if (!key || !serializedDraft) return;

  try {
    window.localStorage.setItem(key, serializedDraft);
  } catch {
    // Draft recovery is a convenience; storage failures must never block expense entry.
  }
}

function restoreExpenseDraft(event) {
  const key = expenseDraftMemoryKey(state.currentParticipantId, event?.id);
  if (!key) return null;

  try {
    const rawDraft = window.localStorage.getItem(key);
    const restoredDraft = parseExpenseDraftMemory(rawDraft, {
      eventId: event.id,
      participantIds: event.participantIds,
      fallbackParticipantId: state.currentParticipantId
    });
    if (!restoredDraft && rawDraft) window.localStorage.removeItem(key);
    return restoredDraft;
  } catch {
    return null;
  }
}

function clearRememberedExpenseDraft(eventId) {
  const key = expenseDraftMemoryKey(state.currentParticipantId, eventId);
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Keep the primary action working if browser storage is unavailable.
  }
}

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function dateFromIso(value) {
  if (!value) return todayInputValue();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return todayInputValue();
  return parsed.toISOString().slice(0, 10);
}

function addPayerToExpenseDraft() {
  if (!expenseDraft) return;

  const event = getEvent(expenseDraft.eventId);
  const participantId = nextExpensePayerId(event);
  const nextIndex = expenseDraft.payers.length;
  expenseDraft.payers.push(createPayerDraft(participantId));
  rebalanceExpenseDraftPayers(nextIndex);
}

function applyExpenseTemplate(template) {
  if (!expenseDraft || !template) return;

  expenseDraft.name = template;
  render();
  activateDialog(".expense-modal");
  requestAnimationFrame(() => {
    [...app.querySelectorAll('[data-action="expense-template"]')]
      .find((button) => button.dataset.template === template)
      ?.focus({ preventScroll: true });
  });
}

function nextExpensePayerId(event) {
  const usedPayerIds = new Set(expenseDraft.payers.map((payer) => payer.participantId));
  const participants = event ? eventParticipants(event) : state.participants;
  const unusedParticipant = participants.find(
    (participant) => !usedPayerIds.has(participant.id)
  );

  return unusedParticipant?.id ?? event?.participantIds[0] ?? state.currentParticipantId;
}

function rebalanceExpenseDraftPayers(preferredIndex = undefined) {
  if (!expenseDraft) return;

  expenseDraft.payers = balancePayerAmounts(
    expenseDraft.total,
    expenseDraft.payers,
    preferredIndex
  );
}

function syncExpensePayerAmountInputs(skipIndex = null) {
  app.querySelectorAll('[data-action="expense-payer-amount"]').forEach((input) => {
    const index = Number(input.dataset.index);
    if (index === skipIndex || document.activeElement === input) return;

    const amount = expenseDraft?.payers[index]?.amount ?? "";
    if (input.value !== amount) input.value = amount;
  });
}

function syncExpensePayerSummary() {
  const summaryNode = app.querySelector(".expense-payer-summary");
  if (!summaryNode || !expenseDraft) return;

  const template = document.createElement("template");
  template.innerHTML = renderExpensePayerSummary().trim();
  const nextSummary = template.content.firstElementChild;
  if (!nextSummary) return;

  if (summaryNode.className !== nextSummary.className) {
    summaryNode.className = nextSummary.className;
  }
  if (summaryNode.textContent !== nextSummary.textContent) {
    summaryNode.textContent = nextSummary.textContent;
  }
  if (summaryNode.hidden !== nextSummary.hidden) {
    summaryNode.hidden = nextSummary.hidden;
  }
}

function syncExpenseDetailsSummary() {
  const event = getEvent(expenseDraft?.eventId);
  if (!event || !expenseDraft) return;

  const values = expenseDetailsSummaryValues(event, eventParticipants(event));
  Object.entries(values).forEach(([key, value]) => {
    const node = app.querySelector(`[data-expense-detail-value="${key}"]`);
    if (node && node.textContent !== value) node.textContent = value;
  });
}

function syncExpenseConfirmationSummary() {
  const event = getEvent(expenseDraft?.eventId);
  const current = app.querySelector("[data-expense-confirmation-summary]");
  if (!event || !expenseDraft || !current) return;

  const template = document.createElement("template");
  template.innerHTML = renderExpenseConfirmationSummary(
    event,
    eventParticipants(event)
  ).trim();
  const next = template.content.firstElementChild;
  if (next) current.replaceWith(next);
}

function syncExpenseSaveState() {
  if (!expenseDraft) return;
  const isDisabled = !hasPositiveExpenseTotal(expenseDraft.total);
  app
    .querySelectorAll('[data-action="save-expense"], [data-action="save-expense-and-continue"]')
    .forEach((button) => {
      button.disabled = isDisabled;
    });
}

function saveExpense(eventId, { continueAdding = false } = {}) {
  if (!expenseDraft || expenseSaveInProgress) return;
  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    expenseDraft.error = editBlockedMessage(event);
    render();
    return;
  }

  expenseSaveInProgress = true;
  try {
    const total = parseMoneyInput(expenseDraft.total);
    const payers = mergePayers(
      expenseDraft.payers
        .map((payer) => ({
          participantId: payer.participantId,
          amount: parseMoneyInput(payer.amount)
        }))
        .filter((payer) => payer.amount > 0)
    );

    const expense = {
      id: expenseDraft.id ?? makeId("expense"),
      name: expenseDraft.name.trim(),
      total,
      payers,
      sharedByParticipantIds: [...expenseDraft.sharedByParticipantIds],
      createdByParticipantId:
        expenseDraft.createdByParticipantId ?? state.currentParticipantId,
      occurredOn: expenseDraft.occurredOn || todayInputValue(),
      updatedAt: new Date().toISOString()
    };

    const errors = validateExpense(expense, { participantIds: event.participantIds });
    if (errors.length) {
      expenseDraft.error = errors[0];
      render();
      return;
    }

    const wasNewExpense = !expenseDraft.id;
    if (!wasNewExpense) {
      state = updateExpense(state, eventId, expense);
    } else {
      event.expenses.unshift(expense);
      event.transfers = [];
    }
    persistState();
    if (wasNewExpense) clearRememberedExpenseDraft(eventId);

    if (continueAdding && wasNewExpense) {
      continueExpenseEntry(event);
      return;
    }

    expenseDraft = null;
    closeDialogWithHistory();
  } catch (error) {
    if (expenseDraft) {
      expenseDraft.error = error instanceof Error ? error.message : "אי אפשר לשמור את ההוצאה.";
      render();
      activateDialog(".expense-modal");
    }
  } finally {
    expenseSaveInProgress = false;
  }
}

function continueExpenseEntry(event) {
  const previousDraft = expenseDraft;
  const payerIds = [
    ...new Set(
      previousDraft.payers
        .map((payer) => payer.participantId)
        .filter((participantId) => event.participantIds.includes(participantId))
    )
  ];

  expenseDraft = {
    eventId: event.id,
    mode: "single",
    name: "",
    total: "",
    occurredOn: previousDraft.occurredOn || todayInputValue(),
    payers: (payerIds.length ? payerIds : [state.currentParticipantId]).map(createPayerDraft),
    sharedByParticipantIds: previousDraft.sharedByParticipantIds.filter((participantId) =>
      event.participantIds.includes(participantId)
    ),
    quickPurpose: "split",
    quickPayerId: payerIds[0] ?? state.currentParticipantId,
    quickItems: [createQuickItemDraft()],
    inlinePayerGuestIndex: null,
    inlinePayerGuestName: "",
    quickInlineGuestIndex: null,
    quickInlineGuestName: "",
    savedInSession: (previousDraft.savedInSession ?? 0) + 1,
    error: ""
  };

  const totalInput = app.querySelector('[data-action="expense-total"]');
  const nameInput = app.querySelector('[data-action="expense-name"]');
  if (totalInput) totalInput.value = "";
  if (nameInput) nameInput.value = "";

  app.querySelectorAll('[data-action="expense-payer-amount"]').forEach((input) => {
    input.value = "";
  });
  app.querySelectorAll('[data-action="expense-template"]').forEach((button) => {
    button.classList.remove("is-active");
    button.setAttribute("aria-pressed", "false");
  });

  const status = app.querySelector(".expense-loop-status");
  if (status) {
    status.hidden = false;
    status.textContent = `${formatCount(expenseDraft.savedInSession, "הוצאה נשמרה", "הוצאות נשמרו")}. אפשר להוסיף את הבאה.`;
  }

  syncExpensePayerSummary();
  syncExpenseDetailsSummary();
  syncExpenseConfirmationSummary();
  syncExpenseSaveState();
  requestAnimationFrame(() => {
    totalInput?.focus();
    totalInput?.scrollIntoView({ block: "center" });
  });
}

function saveQuickExpenses(eventId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    expenseDraft.error = editBlockedMessage(event);
    render();
    return;
  }

  const result = buildQuickItemExpenses({
    items: expenseDraft.quickItems,
    payerParticipantId: expenseDraft.quickPayerId,
    participantIds: event.participantIds,
    occurredOn: expenseDraft.occurredOn,
    createdByParticipantId: state.currentParticipantId,
    makeExpenseId: () => makeId("expense")
  });

  if (result.error) {
    expenseDraft.error = result.error;
    render();
    activateDialog(".expense-modal");
    return;
  }

  const validationError = result.expenses
    .flatMap((expense) => validateExpense(expense, { participantIds: event.participantIds }))
    .find(Boolean);
  if (validationError) {
    expenseDraft.error = validationError;
    render();
    activateDialog(".expense-modal");
    return;
  }

  event.expenses.unshift(...result.expenses);
  persistState();
  clearRememberedExpenseDraft(eventId);
  expenseDraft = null;
  notice = `${result.expenses.length} פריטים נוספו לאירוע.`;
  closeDialogWithHistory();
}

function deleteExpense(eventId, expenseId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    notice = editBlockedMessage(event);
    render();
    return;
  }

  state = removeExpense(state, eventId, expenseId);
  persistState();
  render();
}

function prepareSettlement(eventId) {
  const event = getEvent(eventId);
  prepareEventTransfers(event);
  persistState();
  settlementCloseConfirmation = null;
  screen = { name: "settlement", eventId };
  render();
}

function requestCloseCurrentEvent(eventId) {
  const event = getEvent(eventId);
  if (!event) return;

  const pendingTransfers = eventSettlementTransfers(event).filter(
    (transfer) => transfer.status !== "paid"
  );
  if (!pendingTransfers.length || isEventClosed(event)) {
    closeCurrentEvent(eventId);
    return;
  }

  settlementCloseConfirmation = { eventId };
  render();
  requestAnimationFrame(() => {
    app
      .querySelector('[data-action="confirm-close-event"]')
      ?.focus({ preventScroll: true });
  });
}

function cancelSettlementCloseConfirmation() {
  if (!settlementCloseConfirmation) return;
  settlementCloseConfirmation = null;
  renderHistoryFallback();
}

function closeCurrentEvent(eventId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לסגור אירוע.";
    render();
    return;
  }

  if (isEventClosed(event)) {
    settlementCloseConfirmation = null;
    screen = { name: "settlement", eventId };
    render();
    return;
  }

  const settlement = calculateSettlement(eventParticipants(event), event.expenses);
  if (settlement.issues.length) {
    notice = "אי אפשר לסגור את האירוע עד שמתקנים את ההוצאות שסומנו לבדיקה.";
    render();
    return;
  }

  prepareEventTransfers(event);
  state = closeEvent(state, eventId, new Date().toISOString());
  settlementCloseConfirmation = null;
  expenseDraft = null;
  eventDialog = null;
  notice = "האירוע נסגר וננעל לעריכה.";
  persistState();
  screen = { name: "settlement", eventId };
  render();
}

function reopenCurrentEvent(eventId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לפתוח אירוע לעריכה.";
    render();
    return;
  }

  state = reopenEvent(state, eventId);
  settlementCloseConfirmation = null;
  notice = "האירוע נפתח לעריכה.";
  persistState();
  render();
}

function prepareEventTransfers(event) {
  if (!event) return;

  const result = calculateSettlement(eventParticipants(event), event.expenses);
  const previousTransfers = new Map(event.transfers.map((transfer) => [transfer.id, transfer]));
  event.transfers = result.transfers.map((transfer) => {
    const previous = previousTransfers.get(transfer.id);
    return previous?.status === "paid"
      ? {
          ...transfer,
          status: "paid",
          markedPaidByParticipantId: previous.markedPaidByParticipantId,
          markedPaidAt: previous.markedPaidAt
        }
      : transfer;
  });
}

function toggleEventLock(eventId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לנעול או לפתוח עריכה.";
    render();
    return;
  }
  event.locked = !event.locked;
  if (event.locked) expenseDraft = null;
  persistState();
  render();
}

function toggleAdminEditMode(eventId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לשנות הרשאות עריכה.";
    render();
    return;
  }

  state = setEventAdminsCanEditOnly(state, eventId, !event.adminsCanEditOnly);
  expenseDraft = null;
  persistState();
  render();
}

function leaveCurrentEvent(eventId) {
  const event = getEvent(eventId);
  if (!canLeaveEvent(state, eventId, state.currentParticipantId)) {
    notice = "אי אפשר לעזוב אירוע שיש בו הוצאות או העברות על שמך, או כשאתה המנהל היחיד.";
    render();
    return;
  }

  state = leaveEvent(state, eventId, state.currentParticipantId);
  expenseDraft = null;
  eventDialog = null;
  screen = { name: "home" };
  notice = `עזבת את "${event.name}".`;
  persistState();
  render();
}

function deleteCurrentEvent(eventId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול למחוק אירוע.";
    render();
    return;
  }

  state = deleteEvent(state, eventId);
  expenseDraft = null;
  eventDialog = null;
  screen = { name: "home" };
  notice = `האירוע "${event.name}" נמחק.`;
  persistState();
  render();
}

function markTransferPaid(transferId) {
  const event = getEvent(screen.eventId);
  if (!event?.transfers.some((item) => item.id === transferId)) return;

  state = updateTransferStatus(state, event.id, transferId, {
    status: "paid",
    participantId: state.currentParticipantId,
    markedAt: new Date().toISOString()
  });
  syncSettlementCloseConfirmation(event.id);
  notice = "ההעברה סומנה כשולמה. אפשר לבטל את הסימון מאותה שורה.";
  persistState();
  render();
}

function markTransferPending(transferId) {
  const event = getEvent(screen.eventId);
  if (!event?.transfers.some((item) => item.id === transferId)) return;

  state = updateTransferStatus(state, event.id, transferId, { status: "pending" });
  syncSettlementCloseConfirmation(event.id);
  notice = "סימון התשלום בוטל.";
  persistState();
  render();
}

function setEventManagementMode(eventId, mode) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לשנות את אופן ניהול האירוע.";
    render();
    return;
  }

  if (event.locked) {
    notice = "צריך לפתוח את האירוע לעריכה לפני שמשנים את אופן הניהול.";
    render();
    return;
  }

  const adminsCanEditOnly = managementModeRequiresAdmin(mode);
  if (event.adminsCanEditOnly === adminsCanEditOnly) return;

  state = setEventAdminsCanEditOnly(state, eventId, adminsCanEditOnly);
  expenseDraft = null;
  persistState();
  render();
}

function syncSettlementCloseConfirmation(eventId) {
  if (settlementCloseConfirmation?.eventId !== eventId) return;
  const event = getEvent(eventId);
  const hasPendingTransfer = eventSettlementTransfers(event).some(
    (transfer) => transfer.status !== "paid"
  );
  if (!hasPendingTransfer || isEventClosed(event)) {
    settlementCloseConfirmation = null;
  }
}

function toggleEventParticipant(eventId, participantId, checked) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    notice = editBlockedMessage(event);
    render();
    return;
  }

  const isUsed = event.expenses.some(
    (expense) =>
      expense.sharedByParticipantIds.includes(participantId) ||
      expense.payers.some((payer) => payer.participantId === participantId)
  );

  if (!checked && isUsed) {
    window.alert("המשתתף כבר מופיע בהוצאות. צריך לערוך את ההוצאות לפני שמסירים אותו.");
    render();
    return;
  }

  toggleId(event.participantIds, participantId, checked);
  event.membershipUpdatedAt = new Date().toISOString();
  persistState();
  render();
}

function toggleId(ids, id, checked) {
  const index = ids.indexOf(id);
  if (checked && index === -1) ids.push(id);
  if (!checked && index !== -1) ids.splice(index, 1);
}

function formatCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function creationDate(value, id) {
  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const timestamp = String(id ?? "").match(/^[^-]+-(\d{13})(?:-|$)/)?.[1];
  if (!timestamp) return null;
  const date = new Date(Number(timestamp));
  return Number.isNaN(date.getTime()) ? null : date;
}

function creationTimestamp(value, id) {
  return creationDate(value, id)?.getTime() ?? 0;
}

function formatOpenedAt(value, id) {
  const date = creationDate(value, id);
  if (!date) return "מועד פתיחה לא זמין";

  const dateLabel = formatRelativeCalendarDate(date);
  const timeLabel = formatClockTime(date);
  return `נפתח ${dateLabel} · ${timeLabel}`;
}

function renderOpenedAt(value, id) {
  const date = creationDate(value, id);
  const datetime = date ? ` datetime="${escapeAttribute(date.toISOString())}"` : "";
  return `<time class="opened-at"${datetime}>${escapeHtml(formatOpenedAt(value, id))}</time>`;
}

function groupSelectLabel(group) {
  return `${group.name} · ${formatOpenedAt(group.createdAt, group.id)}`;
}

function mergePayers(payers) {
  const totals = new Map();
  for (const payer of payers) {
    totals.set(payer.participantId, (totals.get(payer.participantId) ?? 0) + payer.amount);
  }
  return [...totals.entries()].map(([participantId, amount]) => ({ participantId, amount }));
}

function syncLocalProfile(nextState) {
  if (!localProfile) return nextState;

  const invitedEventId = parseInviteEventId(window.location.href);
  const stateWithProfile = ensureNamedParticipant(
    nextState,
    {
      id: localProfile.participantId,
      displayName: localProfile.displayName,
      authProvider: localProfile.authProvider,
      authSubject: localProfile.authSubject,
      email: localProfile.email
    },
    invitedEventId
  );
  const participant = stateWithProfile.participants.find(
    (item) => item.id === stateWithProfile.currentParticipantId
  );

  localProfile = saveLocalProfile({
    participantId: stateWithProfile.currentParticipantId,
    displayName: participant?.displayName ?? localProfile.displayName,
    authProvider: participant?.authProvider ?? localProfile.authProvider,
    authSubject: participant?.authSubject ?? localProfile.authSubject,
    email: participant?.email ?? localProfile.email
  });
  profileNameDraft = localProfile.displayName;
  return stateWithProfile;
}

function applyInviteSnapshot(nextState, urlValue = window.location.href, inviteSnapshot = parseInviteSnapshot(urlValue)) {
  if (!inviteSnapshot) return nextState;

  const stateWithInvite = mergeInviteSnapshotIntoState(nextState, inviteSnapshot);
  saveState(stateWithInvite);
  return stateWithInvite;
}

async function hydrateIncomingSharedEvent(nextState) {
  const eventId = parseInviteEventId(window.location.href);
  const id = parseInviteSpaceId(window.location.href);
  const key = parseInviteSpaceKey(window.location.href);
  if (!eventId || !id || !key) return nextState;

  try {
    const sharedEventState = await readSharedEventState(
      await loadRuntimeConfig(),
      { id, key },
      eventId
    );
    return sharedEventState
      ? mergeSharedEventIntoState(nextState, sharedEventState, { id, key })
      : nextState;
  } catch {
    return nextState;
  }
}

function openInvitedEventFromUrl() {
  const invitedEventId = parseInviteEventId(window.location.href);
  if (!invitedEventId) return;
  const inviteUrl = new URL(window.location.href);
  const openedFromInvite = ["invite", "space", "key", "join"]
    .some((parameter) => inviteUrl.searchParams.has(parameter));

  if (getEvent(invitedEventId)) {
    screen = { name: "event", eventId: invitedEventId };
    notice = "פתחת אירוע מקישור הזמנה.";
  } else {
    notice = "קישור ההזמנה לא נמצא.";
  }

  if (!openedFromInvite && getEvent(invitedEventId)) notice = "";
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloadingForUpdate = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });

    try {
      const registration = await navigator.serviceWorker.register("./sw.js", {
        updateViaCache: "none"
      });

      if (!window.location.hash.includes("access_token")) {
        registration.update().catch(() => {});
      }

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "hidden") return;
        registration.update().catch(() => {});
      });

      window.addEventListener("online", () => registration.update().catch(() => {}));
    } catch {}
  });
}

function persistState() {
  saveSharedState(state);
}

function reactivateDialogAfterRender(selector, focusSelector = "", scrollTop = 0) {
  if (!selector) return;
  activateDialog(selector);
  requestAnimationFrame(() => {
    const dialog = app.querySelector(selector);
    if (!dialog) return;
    const focusTarget = focusSelector ? app.querySelector(focusSelector) : null;
    focusTarget?.closest("details")?.setAttribute("open", "");
    dialog.scrollTop = Math.max(0, scrollTop);
    focusTarget?.focus({ preventScroll: true });
  });
}

function activateDialog(selector, focusSelector = "") {
  if (!dialogReturnFocus) {
    rememberDialogReturnFocus(document.activeElement);
  }

  if (!document.body.classList.contains("app-dialog-open")) {
    dialogReturnScrollY = window.scrollY;
    window.scrollTo(0, 0);
  }

  document.body.classList.add("app-dialog-open");
  const immediateDialog = app.querySelector(selector);
  const immediateFocusTarget = focusSelector
    ? immediateDialog?.querySelector(focusSelector)
    : null;
  immediateFocusTarget?.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    const dialog = app.querySelector(selector);
    if (!dialog) return;
    setDialogBackgroundInert(dialog);
    dialog.scrollTop = 0;
    const focusTarget = focusSelector ? dialog.querySelector(focusSelector) : dialog;
    focusTarget?.focus({ preventScroll: true });
  });
}

function rememberDialogReturnFocus(element) {
  if (!(element instanceof HTMLElement)) return;
  if (element === document.body || element === document.documentElement || element === app) return;

  dialogReturnFocus = {
    element,
    action: element.dataset.action ?? "",
    eventId: element.dataset.eventId ?? "",
    expenseId: element.dataset.expenseId ?? ""
  }
}

function deactivateDialog({ deferFocus = false } = {}) {
  const returnScrollY = dialogReturnScrollY;
  dialogReturnScrollY = 0;
  document.body.classList.remove("app-dialog-open");
  clearDialogBackgroundInert();
  pendingDialogReturnFocus = dialogReturnFocus;
  pendingDialogReturnScrollY = returnScrollY;
  dialogReturnFocus = null;
  requestAnimationFrame(() => window.scrollTo(0, returnScrollY));
  if (!deferFocus) window.setTimeout(restorePendingDialogReturnFocus, 120);
}

function restorePendingDialogReturnFocus() {
  const returnTarget = pendingDialogReturnFocus;
  if (!returnTarget || app.querySelector('[role="dialog"][aria-modal="true"]')) return;

  if (returnTarget.element?.isConnected) {
    pendingDialogReturnFocus = null;
    pendingDialogReturnScrollY = 0;
    returnTarget.element.focus({ preventScroll: true });
    return;
  }

  const replacement = [...app.querySelectorAll("[data-action]")].find((element) =>
    element.dataset.action === returnTarget.action &&
    (!returnTarget.eventId || element.dataset.eventId === returnTarget.eventId) &&
    (!returnTarget.expenseId || element.dataset.expenseId === returnTarget.expenseId)
  );
  const fallback = app.querySelector(
    '[data-action="show-expense-form"], [data-action="open-event-settings"]'
  );
  const focusTarget = replacement ?? fallback;
  pendingDialogReturnFocus = null;
  pendingDialogReturnScrollY = 0;
  focusTarget?.focus({ preventScroll: true });
}

function setDialogBackgroundInert(dialog) {
  clearDialogBackgroundInert();
  const backdrop = dialog.closest(
    ".expense-modal-backdrop, .event-modal-backdrop, .event-removal-menu-backdrop, .important-action-dialog-backdrop"
  );
  if (!backdrop) return;

  const screen = backdrop.closest(".screen");
  screen?.querySelectorAll(":scope > *").forEach((element) => {
    if (element === backdrop) return;
    element.dataset.appDialogInertContainer = "true";
    element.inert = true;
  });

  document.querySelectorAll(".skip-link").forEach((element) => {
    element.dataset.appDialogInertContainer = "true";
    element.inert = true;
  });

  app
    .querySelectorAll('button, input, select, textarea, a[href], [tabindex]')
    .forEach((element) => {
      if (backdrop.contains(element)) return;
      element.dataset.appDialogInert = "true";
      element.inert = true;
    });
}

function clearDialogBackgroundInert() {
  document.querySelectorAll("[data-app-dialog-inert-container]").forEach((element) => {
    element.inert = false;
    delete element.dataset.appDialogInertContainer;
  });

  app.querySelectorAll("[data-app-dialog-inert]").forEach((element) => {
    element.inert = false;
    delete element.dataset.appDialogInert;
  });
}

function handleInputKeyboardShortcut(event) {
  if (
    event.key !== "Enter" ||
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return false;
  }

  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.closest("form")) return false;
  const action = input.dataset.action;
  const index = input.dataset.index;
  const scope = input.closest(".expense-modal, .event-modal, .screen") ?? app;

  const focusAction = (selector) => {
    const next = scope.querySelector(selector) ?? app.querySelector(selector);
    if (!(next instanceof HTMLElement) || next.matches(":disabled")) return false;
    event.preventDefault();
    next.focus({ preventScroll: false });
    return true;
  };

  const clickAction = (selector) => {
    const button = scope.querySelector(selector) ?? app.querySelector(selector);
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    event.preventDefault();
    button.click();
    return true;
  };

  if (action === "profile-name") return clickAction('[data-action="save-profile"]');
  if (action === "join-event-link") return clickAction('[data-action="join-existing-event"]');
  if (action === "new-event-guest-name") return clickAction('[data-action="new-event-add-guest"]');
  if (action === "group-member-name") return clickAction('[data-action="group-add-member"]');
  if (action === "edit-group-member-name") return clickAction('[data-action="edit-group-add-member"]');
  if (action === "event-guest-name") return clickAction('[data-action="event-add-guest"]');
  if (action === "expense-new-payer-name") {
    return clickAction(`[data-action="expense-add-payer-guest"][data-index="${index}"]`);
  }
  if (action === "quick-item-new-guest-name") {
    return clickAction(`[data-action="quick-item-add-guest"][data-index="${index}"]`);
  }
  if (action === "expense-total") return focusAction('[data-action="expense-name"]');
  if (action === "group-name") return focusAction('[data-action="group-member-name"]');
  if (action === "edit-group-name") return focusAction('[data-action="edit-group-member-name"]');
  if (action === "new-event-name") return focusAction('[data-action="new-event-currency"]');
  if (action === "quick-item-name") {
    return focusAction(`[data-action="quick-item-amount"][data-index="${index}"]`);
  }
  if (action === "quick-item-amount") {
    return focusAction(`[data-action="quick-item-shared-by"][data-index="${index}"]`);
  }

  return false;
}

function handleDialogKeydown(event) {
  if (handleInputKeyboardShortcut(event)) return;

  const eventRow = event.target.closest?.(
    '[data-long-press-event="true"][data-event-id]'
  );
  if (
    eventRow &&
    (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
  ) {
    event.preventDefault();
    openEventRemovalMenu(eventRow.dataset.eventId, eventRow);
    return;
  }

  if (event.key === "Escape" && settlementCloseConfirmation) {
    event.preventDefault();
    goBackInApp();
    return;
  }

  const dialog = app.querySelector(
    '.important-action-dialog[role="alertdialog"], .event-removal-menu[role="dialog"], .expense-modal[role="dialog"], .event-modal[role="dialog"]'
  );
  if (!dialog) return;

  if (event.key === "Escape") {
    event.preventDefault();
    goBackInApp();
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = [...dialog.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => element.offsetParent !== null);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus({ preventScroll: true });
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

function eventParticipants(event, includeAllKnown = false) {
  if (includeAllKnown) return state.participants;
  return state.participants.filter((participant) => event.participantIds.includes(participant.id));
}

function eventSettlementTransfers(event, participants = eventParticipants(event)) {
  const calculated = calculateSettlement(participants, event.expenses);
  return event.transfers.length ? event.transfers : calculated.transfers;
}

function renderAvatarStack(participantIds) {
  const visibleIds = participantIds.slice(0, 4);
  const hiddenCount = participantIds.length - visibleIds.length;

  return `
    <span class="avatar-stack" aria-label="משתתפים">
      ${visibleIds.map((participantId) => renderAvatar(participantId)).join("")}
      ${hiddenCount > 0 ? `<span class="avatar avatar-more">+${hiddenCount}</span>` : ""}
    </span>
  `;
}

function renderAvatar(participantId) {
  const participant = state.participants.find((item) => item.id === participantId);
  const name = participant?.displayName ?? "משתתף";
  const guestClass = participant?.kind === "guest" ? "is-guest" : "";

  return `<span class="avatar ${guestClass}" title="${escapeAttribute(name)}" aria-hidden="true">${escapeHtml(participantInitials(name))}</span>`;
}

function participantInitials(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("");

  return initials || "?";
}

function canCurrentParticipantEdit(event) {
  return event ? canEditEvent(state, event, state.currentParticipantId) : false;
}

function canCurrentParticipantManage(event) {
  return event ? canManageEventSettings(state, event, state.currentParticipantId) : false;
}

function editBlockedMessage(event) {
  if (!event) return "האירוע לא נמצא.";
  return event.locked ? "האירוע נעול לעריכה." : "רק מנהל יכול לערוך את האירוע עכשיו.";
}

function getEvent(eventId) {
  return state.events.find((event) => event.id === eventId);
}

function participantName(participantId) {
  return state.participants.find((participant) => participant.id === participantId)?.displayName ?? "משתתף";
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function bootstrapApp() {
  render();
  loadSharedState().then(async (sharedState) => {
    const hydratedState = await hydrateIncomingSharedEvent(sharedState);
    const nextState = syncLocalProfile(applyInviteSnapshot(hydratedState));
    const shouldSaveJoinedProfile = Boolean(
      localProfile && hasSharedStateChanged(sharedState, nextState)
    );
    state = nextState;
    if (shouldSaveJoinedProfile) await saveSharedState(state);
    openInvitedEventFromUrl();
    render();
  });
  loadRuntimeConfig().then((config) => {
    runtimeConfig = config;
    render();
  });
  registerServiceWorker();
}

bootstrapApp();
