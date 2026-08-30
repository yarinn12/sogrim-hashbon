import { formatMoney, parseMoneyInput, sumMoneyAmounts } from "./domain/money.mjs";
import { iconSvg } from "./uiIcons.mjs";
import { noticePresentation } from "./domain/userNoticePolicy.mjs";
import { renderPrimaryNavigation } from "./primaryNavigation.mjs";
import {
  formatClockTime,
  formatPreciseClockTime,
  formatRelativeCalendarDate
} from "./domain/dateLabels.mjs";
import {
  DEFAULT_CURRENCY,
  currencyConfig,
  currencyOptions,
  currencySelectLabel,
  formatCurrency,
  normalizeCurrency
} from "./domain/currencies.mjs";
import {
  buildParticipantSettlementBreakdown,
  calculateSettlement,
  groupSettlementTransfersForDisplay,
  pendingBalanceForParticipant,
  reconcileSettlementTransfers,
  settlementOptionsForEvent,
  usesDirectSettlementTransfers,
  usesRoundedSettlementTransfers
} from "./domain/settlement.mjs";
import { buildEventInsights } from "./domain/eventInsights.mjs";
import {
  appendEventActivity,
  eventActivityEntries
} from "./domain/eventActivityLog.mjs";
import { buildParticipantRelationshipInsights } from "./domain/participantRelationshipInsights.mjs";
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
  assignPayerDifference,
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
  parseInviteEventId
} from "./domain/inviteLinks.mjs";
import {
  archiveGroup,
  canLeaveEvent,
  canLinkParticipantAccount,
  canLinkParticipantAccountInEvent,
  canMergeParticipants,
  canRemoveParticipant,
  closeEvent,
  createGroup,
  deactivateEventParticipant,
  deleteEvent,
  leaveEvent,
  linkParticipantAccount,
  linkParticipantAccountInEvent,
  mergeParticipants,
  renameOfflineParticipant,
  reopenEvent,
  removeParticipant,
  removeExpense,
  setEventCurrency,
  setEventAdminsCanEditOnly,
  setEventDirectSettlementTransfers,
  setEventParticipantAdmin,
  setEventRoundSettlementTransfers,
  updateGroup,
  updateTransferStatus,
  updateExpense
} from "./domain/appActions.mjs";
import {
  MAX_EVENT_NOTE_BODY_LENGTH,
  MAX_EVENT_NOTE_TITLE_LENGTH,
  addEventNote,
  removeEventNote,
  updateEventNote
} from "./domain/eventNotes.mjs";
import {
  bindStateBackupToCurrentParticipant,
  parseStateBackup,
  serializeStateBackup
} from "./domain/stateBackup.mjs";
import {
  loadState,
  loadRuntimeConfig,
  refreshRuntimeConfigNow,
  runtimeConfigUsesFallback,
  loadSharedState,
  loadSharedStateForStartup,
  sharedStateSaveRevision,
  loadLocalProfile,
  flushPendingSharedState,
  resetSharedState,
  saveState,
  saveLocalProfile,
  saveSharedState
} from "./data/localStore.mjs";
import {
  emitOperationDeferred,
  emitOperationFailure,
  emitProductMetric
} from "./data/productMetrics.mjs";
import { markStartupMilestone } from "./data/startupMetrics.mjs";
import { sendPaymentReminder } from "./data/paymentReminders.mjs";
import { sendEventActivityNotification } from "./data/eventActivityNotifications.mjs";
import {
  attachOpenInviteToken,
  ensureOpenEventInvite,
  eventOpenInviteToken,
  isEventInviteError,
  resolveEventInviteCredentials,
  rotateOpenEventInvite
} from "./data/eventInvites.mjs";
import {
  loadLegacyOpenInviteCandidate,
  loadVerifiedOpenInviteToken,
  openInviteTokenScope,
  reconcileOpenInviteAccountScope,
  saveVerifiedOpenInviteToken
} from "./data/openInviteTokenStore.mjs";
import {
  accountLinkIsConfirmed,
  forgetPendingAccountLink,
  loadPendingAccountLinks,
  markPendingAccountLinkAttempt,
  rememberPendingAccountLink
} from "./data/pendingAccountLinks.mjs";
import {
  forgetPendingEventJoin,
  loadPendingEventJoins,
  markPendingEventJoinAttempt,
  rememberPendingEventJoin
} from "./data/pendingEventJoins.mjs";
import {
  loadNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead
} from "./data/notificationInbox.mjs";
import { loadAdminAnalyticsOverview } from "./data/adminAnalyticsStore.mjs";
import { buildAdminAnalyticsViewModel } from "./domain/adminAnalytics.mjs";
import {
  blockConnectedUser,
  buildFriendInviteUrl,
  emptyFriendNetwork,
  friendInviteCodeFromUrl,
  friendNetworkAvailable,
  loadFriendNetwork,
  loadOwnFriendProfile,
  manageFriendship,
  normalizeFriendCode,
  requestFriendship,
  requestFriendshipByUsername,
  requestFriendshipFromEvent,
  setFriendUsername,
  submitUserReport,
  unblockConnectedUser,
  syncFriendProfile
} from "./data/friendsStore.mjs";
import {
  formatUsername,
  normalizeUsername,
  profileUsername as publicProfileUsername,
  usernameValidationMessage
} from "./domain/usernames.mjs";
import { normalizeReferralCode } from "./domain/referralCodes.mjs";
import { runtimePublicOrigin } from "./domain/publicOrigin.mjs";
import {
  EVENT_SPACE_ID_FIELD,
  EVENT_SPACE_KEY_FIELD,
  ensureEventShareCredentials,
  eventShareCredentials,
  mergeSharedEventIntoState,
  readSharedEventState,
  recoverAccessibleSharedEvents,
  saveSharedEventState
} from "./data/sharedEventStore.mjs";
import {
  ensureNamedParticipant,
  isFullProfileName,
  normalizeProfileName,
  normalizeProfileUpdatedAt
} from "./domain/userProfile.mjs";
import { resolveProfileAvatar } from "./domain/profileAvatarSync.mjs";
import { requestImageCrop } from "./imageCropper.mjs";
import {
  initializeParticipantMembership,
  isActiveEventParticipant,
  markParticipantMembershipChanges
} from "./domain/eventMembership.mjs";
import {
  duplicateParticipantNameGroups,
  eventDuplicateParticipantGroups,
  findOfflineParticipantByName,
  normalizeParticipantDisplayName,
  participantEventDisplayName,
  participantHasConnectedAccount,
  participantPairIncludes,
  sanitizeParticipantAlias,
  unresolvedDuplicateParticipantPairs
} from "./domain/participantIdentity.mjs";
import {
  canAddEventParticipant,
  canEditEvent,
  canManageEventSettings,
  eventAdminIds
} from "./domain/permissions.mjs";
import {
  eventRelevanceTimestamp,
  visibleEventsForParticipant,
  visibleGroupsForParticipant
} from "./domain/personalMemory.mjs";
import { findMatchingActiveGroup } from "./domain/groupIdentity.mjs";
import {
  activeFriendParticipantIds,
  removeFriendContact,
  saveFriendContact,
  syncNetworkFriendContacts
} from "./domain/friendContacts.mjs";
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
import {
  AVATAR_PRESETS,
  avatarPresetForParticipant,
  avatarPresetSource,
  avatarSourceForParticipant,
  normalizeAvatarImage,
  normalizeAvatarPreset
} from "./domain/avatarPresets.mjs";
import {
  clearNotificationTargetFromUrl,
  notificationTargetFromUrl
} from "./domain/notificationTargets.mjs";
import { notificationInboxDestination } from "./domain/notificationInboxDestination.mjs";

const app = document.querySelector("#app");
markStartupMilestone("app-module-ready");
const APP_HISTORY_STATE_KEY = "settleFriendsAppHistory";
const NATIVE_BACK_EVENT = "settle-friends:native-back";
const NATIVE_DESTINATION_EVENT = "settle-friends:native-destination";
const NATIVE_RESUME_EVENT = "settle-friends:native-resume";
// iOS may suspend a PWA while it is still visually in the foreground. Keep the
// cooldown deliberately short, and force a read when Safari reports that the
// document became visible again, so a second device never has to wait for the
// next background polling window to see a completed action.
const RESUME_SYNC_COOLDOWN_MS = 1_000;
// Shared state is the product's source of truth across devices. Poll an open
// event frequently enough that a completed action on another phone appears as
// live UI, while friends and notifications keep their lower background rate.
const ACTIVE_EVENT_SYNC_INTERVAL_MS = 1_500;
const FRIEND_NETWORK_SYNC_INTERVAL_MS = 12_000;
const VISIBLE_BACKGROUND_SYNC_SCREENS = new Set([
  "home",
  "event",
  "event-notes",
  "settlement",
  "notifications",
  "profile",
  "groups",
  "people",
  "friend-profile",
  "admin-overview"
]);
const OWN_PROFILE_STARTUP_WAIT_MS = 3_000;
const RECENT_EVENT_STORAGE_PREFIX = "settle-friends-recent-event";
const PERSONAL_EVENT_ARCHIVE_STORAGE_PREFIX = "settle-friends-personal-event-archive-v1";
const RECENT_EVENT_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const DIALOG_OPEN_ACTIONS = new Set([
  "show-expense-form",
  "edit-expense",
  "open-event-participants",
  "open-event-participant-add",
  "review-duplicate-participants",
  "open-event-share",
  "open-event-settings"
]);
const EVENT_STATUS_FILTERS = [
  { id: "events", label: "אירועים" },
  { id: "archive", label: "ארכיון" }
];
const NEW_EVENT_FLOW_SCREENS = new Set([
  "new-event-type",
  "new-event",
  "new-event-settlement",
  "new-event-participants"
]);
const EVENT_NAME_PLACEHOLDER = "אוכל / מונית / קניות…";
const EVENT_MANAGEMENT_CENTRALIZED = "centralized";
const EVENT_MANAGEMENT_COLLABORATIVE = "collaborative";
const NEW_RESTAURANT_EVENTS_ENABLED = false;
const EXPENSE_TEMPLATES = ["מונית", "אוכל", "שתייה", "כרטיסים", "חניה", "קניות"];
const EXPENSE_FLOW_STEPS = ["amount", "name", "payer", "participants", "review"];
const RESTAURANT_QUICK_STAGES = ["method", "items", "review", "payer"];
const RESTAURANT_CORE_STAGES = ["method", "items", "review"];
const ADD_PAYER_PARTICIPANT_VALUE = "__add-payer-participant__";
const ADD_QUICK_ITEM_GUEST_VALUE = "__add-quick-item-guest__";
const EVENT_LONG_PRESS_DELAY_MS = 560;
const EVENT_LONG_PRESS_MOVE_TOLERANCE_PX = 12;

function eventCurrency(event) {
  return normalizeCurrency(event?.currency);
}

function personalEventArchiveStorageKey() {
  const participantId = String(state?.currentParticipantId ?? "local").trim() || "local";
  return `${PERSONAL_EVENT_ARCHIVE_STORAGE_PREFIX}:${participantId}`;
}

function personalArchivedEventIds() {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(personalEventArchiveStorageKey()) || "[]"
    );
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function isEventPersonallyArchived(eventId) {
  return personalArchivedEventIds().has(String(eventId ?? ""));
}

function setEventPersonallyArchived(eventId, archived) {
  const normalizedEventId = String(eventId ?? "").trim();
  if (!normalizedEventId) return;
  const archivedIds = personalArchivedEventIds();
  if (archived) archivedIds.add(normalizedEventId);
  else archivedIds.delete(normalizedEventId);
  window.localStorage.setItem(
    personalEventArchiveStorageKey(),
    JSON.stringify([...archivedIds])
  );
}

function eventHomeStatusLabel(event) {
  if (!isEventClosed(event)) return "מוסיפים הוצאות";
  const hasPendingTransfers = (event?.transfers ?? []).some(
    (transfer) => transfer.status !== "paid"
  );
  return hasPendingTransfers ? "מתחשבנים" : "הכול שולם";
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
let profileAvatarDraft =
  normalizeAvatarPreset(localProfile?.avatarPreset) || AVATAR_PRESETS[0].id;
let profileAvatarImageDraft = normalizeAvatarImage(localProfile?.avatarImage);
let profileAvatarPendingPreview = "";
let profileError = "";
let profileUsernameDraft = "";
let profileUsernameError = "";
let profileNameEditing = false;
let profileUsernameEditing = false;
let state = syncLocalProfile(loadState());
profileAvatarDraft =
  normalizeAvatarPreset(localProfile?.avatarPreset) || profileAvatarDraft;
profileAvatarImageDraft = normalizeAvatarImage(localProfile?.avatarImage);
let screen = initialScreenFromLaunchAction();
let newEventDraft = null;
let createEventBusy = false;
let joinEventDraft = null;
let joinEventBusy = false;
let expenseDraft = null;
let expenseSaveInProgress = false;
const expenseDeleteRequests = new Set();
let paymentReminderBusyId = "";
const SETTLEMENT_OPEN_TRANSFER_STORAGE_KEY = "settlement-open-transfer-ids";
const PROFILE_IMAGE_PICKER_RETURN_STORAGE_KEY = "profile-image-picker-return";
const PROFILE_SHARED_PUBLICATION_STORAGE_KEY_PREFIX =
  "settle-friends-shared-profile-publication:";
const PENDING_EVENT_MEMBERSHIP_STORAGE_KEY =
  "settle-friends-pending-event-memberships";
const openSettlementTransferIds = loadOpenSettlementTransferIds();

function loadOpenSettlementTransferIds() {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(SETTLEMENT_OPEN_TRANSFER_STORAGE_KEY) ?? "[]"
    );
    return new Set(Array.isArray(stored) ? stored.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function persistOpenSettlementTransferIds() {
  try {
    window.sessionStorage.setItem(
      SETTLEMENT_OPEN_TRANSFER_STORAGE_KEY,
      JSON.stringify([...openSettlementTransferIds])
    );
  } catch {
    // UI continuity is best effort when storage is unavailable.
  }
}
let notificationInbox = {
  status: "idle",
  available: false,
  items: [],
  error: ""
};
let notificationInboxRequest = null;
let notificationInboxRefreshQueued = false;
let readFriendRequestNotificationIds = new Set();
let notificationsReturnScreen = null;
let adminAnalytics = {
  status: "idle",
  available: false,
  overview: null,
  error: ""
};
let adminAnalyticsRequest = null;
let eventDialog = null;
let groupDraft = null;
let editingGroupDraft = null;
let mergeParticipantsDraft = null;
let friendsNewOfflineName = "";
let friendsAddMode = "online";
let friendCodeDraft = friendInviteCodeFromUrl(window.location.href);
let friendNetwork = emptyFriendNetwork();
let friendNetworkBusyAction = "";
let friendNetworkPollRequest = null;
let importantActionDialog = null;
let eventStatusMenu = null;
let settlementCelebration = null;
let settlementCloseConfirmation = null;
const eventSharePreparationPromises = new Map();
const eventSharePreparationStates = new Map();
const eventOpenInviteRuntimeTokens = new Map();
const eventRepaymentModeRequestVersions = new Map();
const transferStatusRequestVersions = new Map();
const closeEventRequests = new Map();
let importantActionReturnFocus = null;
let pendingImportantActionReturnFocus = null;
let pendingConfirmedEventDialog = null;
let notice = "";
let noticeDismissTimer = 0;
let scheduledNoticeKey = "";
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
    pushDeliveryReady: false,
    shareLinksReady: false
  }
};
let eventStatusFilter = "events";
let appHistoryDepth = 0;
let lastNavigationViewKey = "";
let scheduledBrowserHistoryReplacement = null;
let lastRenderedScreenKey = "";
let lastCommittedScreenMarkup = "";
let renderGeneration = 0;
const participantSearchQueries = new Map();
let restoringBrowserHistory = false;
let pendingSettingsReturnFocusSection = "";
let eventLongPressTimer = null;
let eventLongPressTarget = null;
let eventLongPressStartPoint = null;
let suppressedEventOpenId = "";
let suppressEventOpenUntil = 0;
let resumeSyncRequest = null;
let resumeSyncFollowUpRequest = null;
let resumeSyncFollowUpPending = false;
let resumeSyncFollowUpIncludeSecondary = false;
let pendingEventMembershipRetryRequest = null;
let pendingEventJoinRetryRequest = null;
let pendingAccountLinkRetryRequest = null;
let mergeParticipantsRequest = null;
let lastResumeSyncAt = 0;
let appBootHydrationPromise = null;
let appBootHydrated = false;

app.addEventListener("click", handleClick);
app.addEventListener("submit", handleSubmit);
app.addEventListener("keydown", handleParticipantAvatarKeydown);
app.addEventListener("input", handleInput);
app.addEventListener("change", handleChange);
app.addEventListener("selectstart", handleTextSelectionStart);
app.addEventListener("toggle", handleTransientMenuToggle, true);
app.addEventListener("pointerdown", handleEventLongPressStart);
app.addEventListener("pointermove", handleEventLongPressMove);
app.addEventListener("pointerup", cancelEventLongPress);
app.addEventListener("pointercancel", cancelEventLongPress);
app.addEventListener("contextmenu", handleEventContextMenu);
window.addEventListener("popstate", handleBrowserHistoryBack);
window.addEventListener(NATIVE_BACK_EVENT, handleNativeBackRequest);
window.addEventListener(NATIVE_DESTINATION_EVENT, handleNativeDestinationRequest);
window.addEventListener(NATIVE_RESUME_EVENT, requestResumeSync);
window.addEventListener(NATIVE_RESUME_EVENT, retryPendingEventMembershipInvitations);
window.addEventListener(NATIVE_RESUME_EVENT, retryPendingEventJoins);
window.addEventListener(NATIVE_RESUME_EVENT, retryPendingAccountLinks);
window.addEventListener("online", retryPendingEventMembershipInvitations);
window.addEventListener("online", retryPendingEventJoins);
window.addEventListener("online", retryPendingAccountLinks);
window.addEventListener("sogrim:shared-save-reverted", handleSharedSaveReverted);
window.addEventListener("focus", requestVisibleEventSync);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    requestResumeSync({ force: true });
    retryPendingEventMembershipInvitations();
    retryPendingEventJoins();
    retryPendingAccountLinks();
  }
});
window.setInterval(requestVisibleEventSync, ACTIVE_EVENT_SYNC_INTERVAL_MS);
window.setInterval(requestVisibleFriendNetworkSync, FRIEND_NETWORK_SYNC_INTERVAL_MS);
document.addEventListener("keydown", handleDialogKeydown);
window.addEventListener("resize", scheduleOpenExpenseMenuPosition);
window.addEventListener("orientationchange", scheduleOpenExpenseMenuPosition);
document.addEventListener("scroll", scheduleOpenExpenseMenuPosition, true);
window.visualViewport?.addEventListener("resize", scheduleOpenExpenseMenuPosition);
window.visualViewport?.addEventListener("scroll", scheduleOpenExpenseMenuPosition);
document.addEventListener("account-auth-ready", () => {
  hydrateAppAfterAccountReady()
    .then(() => Promise.all([
      retryPendingEventMembershipInvitations(),
      retryPendingEventJoins(),
      retryPendingAccountLinks()
    ]))
    .catch(renderScopedLocalFallback);
});
document.addEventListener("settle-friends:push-status", (event) => {
  if (event.detail?.status !== "received") return;
  requestResumeSync({ force: true }).catch(() => {});
});

function handleSharedSaveReverted(event) {
  state = loadState();
  const failureKind = event?.detail?.failureKind ?? "unavailable";
  notice = failureKind === "auth"
    ? "השינוי לא נשמר כי החיבור לחשבון פג. התחברו מחדש ונסו שוב."
    : failureKind === "permission"
      ? "אין לחשבון הרשאה לבצע את השינוי הזה. המידע הוחזר לגרסה האחרונה שנשמרה."
      : failureKind === "rejected"
        ? "השינוי לא התקבל בשרת. המידע הוחזר לגרסה האחרונה שנשמרה."
        : "לא הצלחנו לשמור את השינוי בשרת. המידע הוחזר לגרסה האחרונה שנשמרה.";
  render();
  if (expenseDraft) {
    expenseDraft.error = "השינוי לא נשמר. בדקו את החיבור ונסו שוב.";
    reactivateDialogAfterRender(".expense-modal", "#expense-form-error");
  }
}
document.addEventListener("settle-friends:notice", handleExternalNotice);
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

function initialScreenFromLaunchAction() {
  try {
    const profilePickerStartedAt = Number(
      window.sessionStorage.getItem(PROFILE_IMAGE_PICKER_RETURN_STORAGE_KEY) ?? 0
    );
    window.sessionStorage.removeItem(PROFILE_IMAGE_PICKER_RETURN_STORAGE_KEY);
    if (
      Number.isFinite(profilePickerStartedAt) &&
      profilePickerStartedAt > 0 &&
      Date.now() - profilePickerStartedAt < 5 * 60_000
    ) {
      return { name: "profile" };
    }
    const url = new URL(window.location.href);
    const action = url.searchParams.get("action");
    if (action !== "new-event" && action !== "profile") return { name: "home" };
    url.searchParams.delete("action");
    window.history.replaceState(window.history.state, "", url);
    return action === "profile" ? { name: "profile" } : { name: "new-event-type" };
  } catch {
    return { name: "home" };
  }
}

function handleExternalNotice(event) {
  const message = String(event.detail?.message ?? "").trim();
  if (!message) return;
  notice = message;
  render();
}

function render() {
  rememberExpenseDraft();
  syncNewEventDraftFromRenderedDetails();
  ensureRenderableScreen();
  syncBrowserHistory();
  if (
    !eventDialog &&
    !expenseDraft &&
    !importantActionDialog &&
    !eventStatusMenu &&
    !settlementCelebration &&
    !settlementCloseConfirmation
  ) {
    document.body.classList.remove("app-dialog-open");
    clearDialogBackgroundInert();
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

  if (screen.name === "new-event") {
    commitRenderedScreen(renderNewEvent());
    return;
  }

  if (screen.name === "new-event-settlement") {
    commitRenderedScreen(renderNewEventSettlement());
    return;
  }

  if (screen.name === "new-event-participants") {
    commitRenderedScreen(renderNewEventParticipants());
    return;
  }

  if (screen.name === "groups") {
    commitRenderedScreen(renderGroups());
    return;
  }

  if (screen.name === "friend-add") {
    commitRenderedScreen(renderFriendAdd());
    return;
  }

  if (screen.name === "friend-profile") {
    commitRenderedScreen(renderFriendRelationshipProfile());
    return;
  }

  if (screen.name === "group-create") {
    commitRenderedScreen(renderGroupCreate());
    return;
  }

  if (screen.name === "group-edit") {
    commitRenderedScreen(renderGroupEdit());
    return;
  }

  if (screen.name === "people") {
    commitRenderedScreen(renderPeople());
    return;
  }

  if (screen.name === "notifications") {
    commitRenderedScreen(renderNotificationInbox());
    return;
  }

  if (screen.name === "admin-overview") {
    commitRenderedScreen(renderAdminAnalyticsOverview());
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

  if (screen.name === "event-notes") {
    commitRenderedScreen(renderEventNotes(event));
    return;
  }

  if (screen.name === "settlement") {
    commitRenderedScreen(renderSettlement(event));
  }
}

function commitRenderedScreen(html) {
  const nextScreenKey = `${screen.name}:${screen.eventId ?? ""}`;
  const screenChanged = nextScreenKey !== lastRenderedScreenKey;
  const nextMarkup = `${html}${renderDetachedEventDialog()}${renderSettlementCelebration()}${renderEventStatusMenu()}${renderImportantActionDialog()}`;

  app.classList.remove("app-boot");
  app.removeAttribute("aria-busy");
  app.dataset.screen = productMetricScreen(screen.name);
  if (!screenChanged && nextMarkup === lastCommittedScreenMarkup) {
    publishNotificationNavigationState();
    syncNoticeLifecycleAfterRender();
    return;
  }

  const currentRenderGeneration = ++renderGeneration;
  const interactionSnapshot = captureRenderInteractionState();
  const persistentIdentity = app.querySelector(
    ":scope > .screen > .product-app-identity"
  );
  persistentIdentity
    ?.querySelector(":scope > .product-route-controls")
    ?.remove();

  app.innerHTML = nextMarkup;
  lastCommittedScreenMarkup = nextMarkup;
  publishNotificationNavigationState();
  syncNoticeLifecycleAfterRender();
  const renderedScreen = app.querySelector(":scope > .screen");
  if (persistentIdentity && renderedScreen) {
    renderedScreen.prepend(persistentIdentity);
  }
  restoreParticipantSearchFilters();
  document.dispatchEvent(new CustomEvent("settle-friends:screen-rendered"));
  markStartupMilestone("first-screen-rendered");
  lastRenderedScreenKey = nextScreenKey;
  if (!screenChanged) {
    restoreRenderInteractionState(interactionSnapshot, currentRenderGeneration);
  }

  if (!screenChanged) return;

  queueMicrotask(() => {
    if (currentRenderGeneration !== renderGeneration) return;
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
  if (eventStatusMenu && !getEvent(eventStatusMenu.eventId)) {
    eventStatusMenu = null;
  }

  if (settlementCelebration) {
    const celebrationEvent = getEvent(settlementCelebration.eventId);
    const allTransfersPaid = Boolean(
      celebrationEvent?.transfers?.length &&
        celebrationEvent.transfers.every((transfer) => transfer.status === "paid")
    );
    if (!allTransfersPaid) settlementCelebration = null;
  }

  if (screen.name === "new-event-management" && newEventDraft?.eventType) {
    newEventDraft.managementMode = EVENT_MANAGEMENT_COLLABORATIVE;
    screen = { name: "new-event" };
  }

  if (
    ["new-event", "new-event-settlement", "new-event-participants"].includes(screen.name) &&
    !newEventDraft?.eventType
  ) {
    screen = { name: "new-event-type" };
    return;
  }

  if (
    ["group-create", "group-edit"].includes(screen.name) ||
    (screen.name === "groups" && screen.tab === "groups")
  ) {
    screen = { name: "groups", tab: "people" };
    groupDraft = null;
    editingGroupDraft = null;
    return;
  }

  if (
    screen.name === "friend-profile" &&
    !canOpenParticipantStatistics(screen.participantId)
  ) {
    screen = { name: "groups", tab: "people" };
    return;
  }

  if (!["event", "event-notes", "settlement"].includes(screen.name)) return;
  const currentEvent = getEvent(screen.eventId);
  if (
    currentEvent &&
    visibleEventsForParticipant(state, state.currentParticipantId).some(
      (event) => event.id === currentEvent.id
    )
  ) return;

  screen = { name: "home" };
  newEventDraft = null;
  expenseDraft = null;
  eventDialog = null;
  groupDraft = null;
  editingGroupDraft = null;
  mergeParticipantsDraft = null;
  importantActionDialog = null;
  eventStatusMenu = null;
  settlementCelebration = null;
  settlementCloseConfirmation = null;
  importantActionReturnFocus = null;
}

function productMetricScreen(screenName) {
  if (
    [
      "new-event-type",
      "new-event",
      "new-event-settlement",
      "new-event-participants",
      "new-event-management"
    ].includes(screenName)
  ) {
    return "new_event";
  }
  if (screenName === "join-event") return "invite";
  if (screenName === "admin-overview") return "profile";
  if (screenName === "event-notes") return "event";
  return [
    "auth",
    "home",
    "event",
    "settlement",
    "groups",
    "profile",
    "notifications"
  ].includes(screenName) ? screenName : "unknown";
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
  try {
    window.history.pushState(createBrowserHistoryState(), "", window.location.href);
  } catch (error) {
    appHistoryDepth = Math.max(0, appHistoryDepth - 1);
    if (error?.name !== "SecurityError") throw error;
  }
  lastNavigationViewKey = key;
}

function renderDetachedEventDialog() {
  if (!eventDialog || ["event", "event-notes", "settlement"].includes(screen.name)) return "";
  const event = getEvent(eventDialog.eventId);
  return event ? renderEventDialog(event) : "";
}

function scheduleBrowserHistoryReplacement() {
  if (!window.history?.replaceState || scheduledBrowserHistoryReplacement !== null) return;

  scheduledBrowserHistoryReplacement = window.setTimeout(() => {
    scheduledBrowserHistoryReplacement = null;
    replaceBrowserHistoryState();
  }, 350);
}

function flushScheduledBrowserHistoryReplacement() {
  if (scheduledBrowserHistoryReplacement === null) return;

  window.clearTimeout(scheduledBrowserHistoryReplacement);
  scheduledBrowserHistoryReplacement = null;
  replaceBrowserHistoryState();
}

function replaceBrowserHistoryState() {
  if (!window.history?.replaceState) return;

  if (scheduledBrowserHistoryReplacement !== null) {
    window.clearTimeout(scheduledBrowserHistoryReplacement);
    scheduledBrowserHistoryReplacement = null;
  }
  const key = navigationViewKey();
  try {
    window.history.replaceState(createBrowserHistoryState(), "", window.location.href);
  } catch (error) {
    if (error?.name !== "SecurityError") throw error;
  }
  lastNavigationViewKey = key;
}

function renderReplacingBrowserHistory() {
  restoringBrowserHistory = true;
  try {
    render();
  } finally {
    restoringBrowserHistory = false;
  }
  replaceBrowserHistoryState();
}

function createBrowserHistoryState() {
  return {
    [APP_HISTORY_STATE_KEY]: true,
    depth: appHistoryDepth,
    view: currentHistoryView()
  };
}

function handleBrowserHistoryBack(event) {
  if (hasIndependentHistoryDialog()) return;
  if (!event.state?.[APP_HISTORY_STATE_KEY]) return;

  const previousEventDialog = cloneNavigationValue(eventDialog);
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
  const targetExpenseDraft = event.state.view?.expenseDraft;
  const activeExpenseDraft =
    expenseDraft &&
    targetExpenseDraft &&
    expenseDraft.eventId === targetExpenseDraft.eventId &&
    (expenseDraft.id ?? "") === (targetExpenseDraft.id ?? "")
      ? cloneNavigationValue(expenseDraft)
      : null;
  const closingDialogReturnFocus = eventDialog || expenseDraft || eventStatusMenu || settlementCelebration
    ? dialogReturnFocus
    : pendingDialogReturnFocus;
  const closingDialogScrollY = eventDialog || expenseDraft || eventStatusMenu || settlementCelebration
    ? dialogReturnScrollY
    : pendingDialogReturnScrollY;
  if (importantActionDialog && importantActionReturnFocus) {
    pendingImportantActionReturnFocus = importantActionReturnFocus;
  }
  appHistoryDepth = Number.isFinite(event.state.depth)
    ? Math.max(0, event.state.depth)
    : 0;
  restoreHistoryView(event.state.view);
  let shouldReplaceConfirmedDialogHistory = false;
  if (pendingConfirmedEventDialog) {
    const confirmedDialog = pendingConfirmedEventDialog;
    pendingConfirmedEventDialog = null;
    if (eventDialog?.eventId === confirmedDialog.eventId) {
      eventDialog = {
        ...eventDialog,
        ...confirmedDialog
      };
      shouldReplaceConfirmedDialogHistory = true;
    }
  }
  if (activeNewEventDraft) newEventDraft = activeNewEventDraft;
  if (activeExpenseDraft) {
    expenseDraft = {
      ...activeExpenseDraft,
      mode: targetExpenseDraft.mode === "items" ? "items" : "single",
      flowStep: normalizeExpenseFlowStep(targetExpenseDraft.flowStep),
      quickStage: targetExpenseDraft.quickStage,
      restaurantEqualSplit: Boolean(targetExpenseDraft.restaurantEqualSplit),
      participantAddView: targetExpenseDraft.participantAddView ?? ""
    };
  }
  restoringBrowserHistory = true;
  try {
    render();
  } finally {
    restoringBrowserHistory = false;
  }
  if (shouldReplaceConfirmedDialogHistory) {
    replaceBrowserHistoryState();
  }
  if (expenseDraft) {
    activateDialog(".expense-modal");
  } else if (eventDialog) {
    const focusSelector = historyEventDialogFocusSelector(
      previousEventDialog,
      eventDialog
    );
    activateDialog(
      ".event-modal",
      focusSelector
    );
    pendingSettingsReturnFocusSection = "";
  } else if (eventStatusMenu) {
    activateDialog(".event-status-menu");
  } else if (settlementCelebration) {
    activateDialog(".settlement-celebration-dialog");
  } else if (settlementCloseConfirmation) {
    activateDialog(
      ".settlement-close-confirmation",
      '[data-action="confirm-close-event"]'
    );
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

function hasIndependentHistoryDialog() {
  return Boolean(
    document.querySelector(
      ".app-choice-picker-backdrop, .accessibility-center-backdrop, [data-account-delete-dialog], .install-app-backdrop, #public-referral-rewards-dialog"
    )
  );
}

function historyEventDialogFocusSelector(previousDialog, restoredDialog) {
  if (
    previousDialog?.kind === "share" &&
    ["friends", "link"].includes(previousDialog.shareView) &&
    restoredDialog?.kind === "share" &&
    !["friends", "link"].includes(restoredDialog.shareView)
  ) {
    return `[data-action="event-share-view"][data-share-view="${previousDialog.shareView}"]`;
  }
  if (
    previousDialog?.kind === "share" &&
    ["participants", "participants-add"].includes(previousDialog.returnKind) &&
    restoredDialog?.kind === previousDialog.returnKind
  ) {
    return '[data-action="open-event-share"]';
  }
  if (
    previousDialog?.kind === "share" &&
    previousDialog.returnKind === "participant-link" &&
    restoredDialog?.kind === "participant-link"
  ) {
    return '[data-action="open-event-participant-link-invite"]';
  }
  if (
    previousDialog?.kind === "participants-add" &&
    restoredDialog?.kind === "participants"
  ) {
    return '[data-action="open-event-participant-add"]';
  }
  if (
    previousDialog?.kind === "participants-add" &&
    restoredDialog?.kind === "share"
  ) {
    return '[data-action="open-event-participant-add"]';
  }
  if (
    previousDialog?.kind === "participant-identities" &&
    restoredDialog?.kind === "participants"
  ) {
    return '[data-action="review-duplicate-participants"]';
  }
  if (restoredDialog?.kind !== "settings") return "";
  const section = previousDialog?.kind?.startsWith("settings-")
    ? previousDialog.kind.slice("settings-".length)
    : pendingSettingsReturnFocusSection;
  if (!["management", "currency", "repayment", "rounding", "activity", "lock", "danger"].includes(section)) {
    return "";
  }

  return eventSettingsSectionFocusSelector(section);
}

function eventSettingsSectionFocusSelector(section) {
  return `[data-action="open-event-settings-section"][data-settings-section="${section}"]`;
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
    eventStatusMenu: cloneNavigationValue(eventStatusMenu),
    settlementCelebration: cloneNavigationValue(settlementCelebration),
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
  eventStatusMenu = cloneNavigationValue(
    view?.eventStatusMenu ?? view?.eventRemovalMenu
  );
  settlementCelebration = cloneNavigationValue(view?.settlementCelebration);
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
    newEventParticipantView:
      screen.name === "new-event-participants"
        ? newEventDraft?.participantView ?? ""
        : "",
    expenseDraft: expenseDraft
      ? {
          eventId: expenseDraft.eventId,
          id: expenseDraft.id ?? "",
          mode: expenseDraft.mode,
          flowStep: normalizeExpenseFlowStep(expenseDraft.flowStep),
          quickStage: expenseDraft.quickStage ?? "",
          participantAddView: expenseDraft.participantAddView ?? ""
        }
      : null,
    eventDialog: eventDialogHistoryKey(eventDialog),
    editingGroupDraft: editingGroupDraft
      ? { id: editingGroupDraft.id ?? "", name: editingGroupDraft.name ?? "" }
      : null,
    mergeParticipantsDraft,
    eventStatusMenu,
    settlementCelebration,
    settlementCloseConfirmation,
    importantActionDialog: importantActionDialog
      ? { kind: importantActionDialog.kind }
      : null
  });
}

function eventDialogHistoryKey(dialog) {
  if (!dialog) return null;

  return {
    eventId: dialog.eventId ?? "",
    kind: dialog.kind ?? "",
    returnKind: dialog.returnKind ?? "",
    participantId: dialog.participantId ?? "",
    noteId: dialog.noteId ?? "",
    shareView: dialog.shareView ?? ""
  };
}

function captureRenderInteractionState() {
  const activeElement =
    document.activeElement instanceof HTMLElement && app.contains(document.activeElement)
      ? document.activeElement
      : null;
  const dialog = app.querySelector(
    ".important-action-dialog, .settlement-celebration-dialog, .event-status-menu, .expense-modal, .event-modal"
  );

  return {
    pageScrollY: window.scrollY,
    dialogSelector: dialog ? dialogRenderSelector(dialog) : "",
    dialogScrollTop: dialog?.scrollTop ?? 0,
    openExpenseParticipantIds: [
      ...app.querySelectorAll(".expense-row:has(.expense-participants-details[open])")
    ]
      .map((row) => row.dataset.expenseId)
      .filter(Boolean),
    openExpenseMenuIds: [
      ...app.querySelectorAll(".expense-row:has(.expense-row-actions-menu[open])")
    ]
      .map((row) => row.dataset.expenseId)
      .filter(Boolean),
    openEventCoverMenuIds: [
      ...app.querySelectorAll(".event-cover-actions-menu[open][data-event-id]")
    ]
      .map((menu) => menu.dataset.eventId)
      .filter(Boolean),
    settlementMoreActionsOpen: Boolean(
      app.querySelector(".settlement-more-actions[open]")
    ),
    openTransferIds: [
      ...app.querySelectorAll(".transfer-row:has(.transfer-explanation[open])")
    ]
      .map((row) => row.dataset.transferId)
      .filter(Boolean),
    focus: activeElement ? focusIdentity(activeElement) : null
  };
}

function restoreRenderInteractionState(snapshot, expectedRenderGeneration) {
  if (!snapshot) return;
  const dialog = snapshot.dialogSelector
    ? app.querySelector(snapshot.dialogSelector)
    : null;

  if (dialog) {
    document.body.classList.add("app-dialog-open");
    setDialogBackgroundInert(dialog);
  }

  requestAnimationFrame(() => {
    if (expectedRenderGeneration !== renderGeneration) return;
    const currentDialog = snapshot.dialogSelector
      ? app.querySelector(snapshot.dialogSelector)
      : null;
    if (snapshot.dialogSelector && !currentDialog) return;
    if (currentDialog) {
      currentDialog.scrollTop = Math.max(0, snapshot.dialogScrollTop);
    }

    const eventId = app.querySelector('[data-screen-kind="event"]')?.dataset.eventId;
    const event = getEvent(eventId);
    for (const expenseId of snapshot.openExpenseParticipantIds ?? []) {
      const row = app.querySelector(
        `.expense-row[data-expense-id="${CSS.escape(expenseId)}"]`
      );
      const details = row?.querySelector(".expense-participants-details");
      const trigger = row?.querySelector('[data-action="toggle-expense-participants"]');
      const expense = event?.expenses.find((item) => item.id === expenseId);
      if (!(details instanceof HTMLDetailsElement) || !expense || !event) continue;
      hydrateExpenseParticipants(details, event, expense);
      details.open = true;
      trigger?.setAttribute("aria-expanded", "true");
    }

    for (const expenseId of snapshot.openExpenseMenuIds ?? []) {
      const menu = app.querySelector(
        `.expense-row[data-expense-id="${CSS.escape(expenseId)}"] .expense-row-actions-menu`
      );
      if (menu instanceof HTMLDetailsElement) menu.open = true;
    }

    for (const eventId of snapshot.openEventCoverMenuIds ?? []) {
      const menu = app.querySelector(
        `.event-cover-actions-menu[data-event-id="${CSS.escape(eventId)}"]`
      );
      if (menu instanceof HTMLDetailsElement) menu.open = true;
    }

    if (snapshot.settlementMoreActionsOpen) {
      const menu = app.querySelector(".settlement-more-actions");
      if (menu instanceof HTMLDetailsElement) menu.open = true;
    }

    for (const transferId of snapshot.openTransferIds ?? []) {
      const row = app.querySelector(
        `.transfer-row[data-transfer-id="${CSS.escape(transferId)}"]`
      );
      const details = row?.querySelector(".transfer-explanation");
      if (!(details instanceof HTMLDetailsElement)) continue;
      details.open = true;
      row.classList.add("is-explanation-open");
    }

    window.scrollTo?.(0, Math.max(0, snapshot.pageScrollY ?? 0));

    const focusRoot = currentDialog ?? app;
    const focusTarget = findFocusReplacement(focusRoot, snapshot.focus);
    if (!focusTarget || focusTarget.disabled || focusTarget.inert) return;
    focusTarget.focus({ preventScroll: true });
    if (
      typeof snapshot.focus?.selectionStart === "number" &&
      typeof focusTarget.setSelectionRange === "function"
    ) {
      focusTarget.setSelectionRange(
        snapshot.focus.selectionStart,
        snapshot.focus.selectionEnd
      );
    }
  });
}

function dialogRenderSelector(dialog) {
  if (dialog.classList.contains("important-action-dialog")) {
    return ".important-action-dialog";
  }
  if (dialog.classList.contains("settlement-celebration-dialog")) {
    return ".settlement-celebration-dialog";
  }
  if (dialog.classList.contains("event-status-menu")) {
    return ".event-status-menu";
  }
  if (dialog.classList.contains("expense-modal")) return ".expense-modal";
  if (dialog.classList.contains("event-modal")) return ".event-modal";
  return "";
}

function focusIdentity(element) {
  return {
    id: element.id ?? "",
    name: element.getAttribute("name") ?? "",
    tagName: element.tagName,
    dataset: Object.fromEntries(
      [
        "action",
        "eventId",
        "expenseId",
        "participantId",
        "transferId",
        "index",
        "section"
      ]
        .filter((key) => element.dataset[key] !== undefined)
        .map((key) => [key, element.dataset[key]])
    ),
    selectionStart:
      typeof element.selectionStart === "number" ? element.selectionStart : null,
    selectionEnd:
      typeof element.selectionEnd === "number" ? element.selectionEnd : null
  };
}

function findFocusReplacement(root, identity) {
  if (!identity) return null;
  if (identity.id) {
    const byId = document.getElementById(identity.id);
    if (byId && root.contains(byId)) return byId;
  }

  const candidates = [...root.querySelectorAll(identity.tagName.toLowerCase())];
  const identityEntries = Object.entries(identity.dataset);
  const exact = candidates.find((candidate) =>
    identityEntries.every(([key, value]) => candidate.dataset[key] === value)
  );
  if (exact) return exact;

  for (const fallbackKey of ["transferId", "participantId", "expenseId", "eventId"]) {
    const fallbackValue = identity.dataset[fallbackKey];
    if (!fallbackValue) continue;
    const fallback = candidates.find(
      (candidate) => candidate.dataset[fallbackKey] === fallbackValue
    );
    if (fallback) return fallback;
  }

  if (identity.name) {
    return candidates.find(
      (candidate) => candidate.getAttribute("name") === identity.name
    ) ?? null;
  }
  return null;
}

function cloneNavigationValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function currentFriendProfile() {
  return (friendNetwork.profiles ?? []).find(
    (profile) => profile.user_id === friendNetwork.userId
  ) ?? null;
}

function currentFriendUsername() {
  return publicProfileUsername(currentFriendProfile());
}

function profileUsernameEditorReady() {
  return friendNetworkAvailable(runtimeConfig) && friendNetwork.status === "ready";
}

function renderProfileUsernameField() {
  if (!friendNetworkAvailable(runtimeConfig)) {
    return `
      <div class="profile-username-status" role="status">
        <span>עריכת שם המשתמש זמינה אחרי חיבור לחשבון.</span>
      </div>
    `;
  }
  if (friendNetwork.status === "loading") {
    return `
      <div class="profile-username-status" role="status">
        <span class="friend-network-skeleton" aria-hidden="true"></span>
        <span>טוענים את שם המשתמש שלך…</span>
      </div>
    `;
  }
  if (friendNetwork.status !== "ready") {
    return `
      <div class="profile-username-status" role="status">
        <span>לא הצלחנו לטעון את שם המשתמש כרגע. אפשר לחזור ולנסות שוב.</span>
      </div>
    `;
  }

  const usernameValue = profileUsernameDraft
    ? `@${profileUsernameDraft.replace(/^@+/, "")}`
    : "";
  return `
    <div class="profile-username-section">
      <label class="field profile-username-field">
        <span>שם משתמש</span>
        <input
          data-action="profile-username"
          name="username"
          dir="ltr"
          value="${escapeAttribute(usernameValue)}"
          placeholder="שם משתמש"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          enterkeyhint="done"
          required
          ${profileUsernameError ? 'aria-invalid="true" aria-describedby="profile-username-error"' : ""}
        />
        <small>חברים ימצאו אותך לפי השם הזה, גם אם יש עוד אנשים עם אותו שם מלא.</small>
      </label>
      ${
        profileUsernameError
          ? `<p class="field-error" id="profile-username-error" role="alert">${escapeHtml(profileUsernameError)}</p>`
          : ""
      }
    </div>
  `;
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
    <section class="screen font-hebrew profile-setup-screen ${isEditingProfile ? "profile-edit-screen" : "profile-first-run-screen"}" data-screen-kind="${isEditingProfile ? "profile" : "profile-setup"}">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          ${isEditingProfile ? "" : '<p class="eyebrow">סוגרים חשבון</p>'}
          <h1>${title}</h1>
          <p class="muted">${escapeHtml(helper)}</p>
        </div>
      </header>
      ${renderNotice()}
      ${invitedEvent ? renderInviteProfilePreview(invitedEvent) : ""}

      <section class="panel profile-setup-panel">
        ${renderProfileAvatarPicker()}
        ${
          isEditingProfile
            ? `<div class="profile-identity-grid">
                <section class="profile-identity-summary" data-profile-identity="display-name">
                  ${
                    profileNameEditing
                      ? `<label class="field">
                          <span>שם פרטי ושם משפחה</span>
                          <input data-action="profile-name" name="displayName" value="${escapeAttribute(profileNameDraft)}" placeholder="שם פרטי ושם משפחה" autocomplete="name" enterkeyhint="done" ${profileError ? 'aria-invalid="true" aria-describedby="profile-name-error"' : ""} />
                        </label>
                        <div class="profile-field-actions">
                          <button class="primary-button" data-action="save-profile">שמור</button>
                          <button class="secondary-button" type="button" data-action="cancel-profile-name-edit">ביטול</button>
                        </div>`
                      : `<div class="profile-identity-copy">
                          <span>שם פרטי ושם משפחה</span>
                          <strong>${escapeHtml(profileNameDraft || localProfile?.displayName || "")}</strong>
                        </div>
                        <button class="secondary-button profile-identity-edit" type="button" data-action="edit-profile-name" aria-label="עריכת שם פרטי ושם משפחה">
                          <span aria-hidden="true">${iconSvg("edit")}</span><span>עריכה</span>
                        </button>`
                  }
                </section>
                <section class="profile-identity-summary" data-profile-identity="username">
                  ${
                    profileUsernameEditing
                      ? `${renderProfileUsernameField()}
                        <div class="profile-field-actions">
                          ${profileUsernameEditorReady() ? '<button class="primary-button" data-action="save-profile">שמור</button>' : ""}
                          <button class="secondary-button" type="button" data-action="cancel-profile-username-edit">ביטול</button>
                        </div>`
                      : `<div class="profile-identity-copy">
                          <span>שם משתמש</span>
                          <strong><bdi dir="ltr">${currentFriendUsername() ? `@${escapeHtml(currentFriendUsername())}` : "—"}</bdi></strong>
                        </div>
                        <button class="secondary-button profile-identity-edit" type="button" data-action="edit-profile-username" aria-label="עריכת שם משתמש">
                          <span aria-hidden="true">${iconSvg("edit")}</span><span>עריכה</span>
                        </button>`
                  }
                </section>
              </div>`
            : `<label class="field">
                <span>שם פרטי ושם משפחה</span>
                <input data-action="profile-name" name="displayName" value="${escapeAttribute(profileNameDraft)}" placeholder="שם פרטי ושם משפחה" autocomplete="name" enterkeyhint="done" ${profileError ? 'aria-invalid="true" aria-describedby="profile-name-error"' : ""} />
              </label>`
        }
        ${profileError ? `<p class="field-error" id="profile-name-error" role="alert">${escapeHtml(profileError)}</p>` : ""}
        ${
          isEditingProfile
            ? ""
            : `<button class="primary-button" data-action="save-profile">המשך</button>`
        }
        ${
          isEditingProfile
            ? `<nav class="profile-shortcuts" aria-label="אפשרויות פרופיל">
                <button class="secondary-button profile-friends-entry" data-action="groups" data-tab="people" type="button">
                  <span class="profile-shortcut-icon" aria-hidden="true">${iconSvg("users")}</span>
                  <span class="profile-shortcut-label">חברים</span>
                  <span class="profile-shortcut-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
                </button>
                <button class="secondary-button profile-accessibility-entry" data-open-accessibility type="button">
                  <span class="profile-shortcut-icon" aria-hidden="true">${iconSvg("accessibility")}</span>
                  <span class="profile-shortcut-label">הגדרות נגישות</span>
                  <span class="profile-shortcut-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
                </button>
              </nav>`
            : ""
        }
        ${
          isEditingProfile && adminAnalytics.status === "ready" && adminAnalytics.available
            ? `<button class="secondary-button profile-admin-entry" data-action="open-admin-overview" type="button">
                <span aria-hidden="true">${iconSvg("sliders")}</span>
                <span>בקרת מוצר</span>
              </button>`
            : ""
        }
      </section>
    </section>
  `;
}

function renderAdminAnalyticsOverview() {
  const loading = adminAnalytics.status === "loading" || adminAnalytics.status === "idle";
  const failed = adminAnalytics.status === "error";
  const viewModel = adminAnalytics.overview
    ? buildAdminAnalyticsViewModel(adminAnalytics.overview)
    : null;

  return `
    <section class="screen font-hebrew admin-analytics-screen" data-screen-kind="admin" aria-busy="${loading}">
      <header class="admin-overview-heading">
        <div>
          <p class="eyebrow">אזור פרטי</p>
          <h1>בקרת מוצר</h1>
          <p class="muted">תמונת מצב של האפליקציה, בלי מידע אישי.</p>
        </div>
        ${renderAppBackButton()}
      </header>
      ${renderNotice()}
      ${
        loading
          ? renderAdminAnalyticsLoading()
          : failed || !viewModel
            ? renderAdminAnalyticsError()
            : renderAdminAnalyticsContent(viewModel)
      }
    </section>
  `;
}

function renderAdminAnalyticsLoading() {
  return `
    <div class="admin-overview-loading" role="status" aria-live="polite">
      <span class="visually-hidden">טוען את נתוני בקרת המוצר</span>
      <div class="admin-loading-hero" aria-hidden="true"></div>
      <div class="admin-loading-stats" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <div class="admin-loading-list" aria-hidden="true"></div>
    </div>
  `;
}

function renderAdminAnalyticsError() {
  return `
    <section class="admin-overview-error" role="alert">
      <span class="admin-overview-error-icon" aria-hidden="true">${iconSvg("history")}</span>
      <h2>לא הצלחנו לטעון את תמונת המצב</h2>
      <p>המידע באפליקציה לא נפגע. אפשר לבדוק את החיבור ולנסות שוב.</p>
      <button class="secondary-button" type="button" data-action="refresh-admin-overview">נסה שוב</button>
    </section>
  `;
}

function renderAdminAnalyticsContent(viewModel) {
  const attention = viewModel.status === "attention";
  return `
    <section class="admin-status-hero is-${escapeAttribute(viewModel.status)}" aria-labelledby="admin-status-title">
      <span class="admin-status-indicator" aria-hidden="true"></span>
      <p class="eyebrow">מצב המערכת</p>
      <h2 id="admin-status-title">${escapeHtml(viewModel.statusTitle)}</h2>
      <p>${escapeHtml(viewModel.statusDescription)}</p>
      <div class="admin-status-meta">
        <span>${escapeHtml(viewModel.updatedLabel)}</span>
        <button type="button" data-action="refresh-admin-overview">רענון</button>
      </div>
    </section>

    <section class="admin-quick-section" aria-labelledby="admin-quick-title">
      <h2 id="admin-quick-title">תמונה מהירה</h2>
      <div class="admin-quick-stats">
        ${viewModel.quickStats.map((stat) => `
          <div class="admin-quick-stat" data-admin-stat="${escapeAttribute(stat.id)}">
            <span class="font-num admin-quick-stat-value">${escapeHtml(stat.value)}</span>
            <span>${escapeHtml(stat.label)}</span>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="admin-detail-section" aria-labelledby="admin-detail-title">
      <h2 id="admin-detail-title">כל הנתונים</h2>
      <div class="admin-detail-grid">
        ${viewModel.detailGroups.map((group) => `
          <article class="admin-detail-card" data-admin-group="${escapeAttribute(group.id)}">
            <header class="admin-detail-card-heading">
              <span class="admin-detail-card-icon" aria-hidden="true">${iconSvg(group.icon)}</span>
              <h3>${escapeHtml(group.title)}</h3>
            </header>
            <div class="admin-detail-list">
              ${group.items.map((item) => `
                <div class="admin-detail-row">
                  <div>
                    <span>${escapeHtml(item.label)}</span>
                    <small>${escapeHtml(item.detail)}</small>
                  </div>
                  <strong><span class="font-num">${escapeHtml(item.value)}</span></strong>
                </div>
              `).join("")}
            </div>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="admin-reliability-section" aria-labelledby="admin-reliability-title">
      <div class="admin-section-heading-row">
        <h2 id="admin-reliability-title">יציבות המערכת</h2>
        <span class="admin-health-rate"><span class="font-num">${escapeHtml(viewModel.reliability.rate)}</span> תקינות</span>
      </div>
      <div class="admin-reliability-summary">
        <div><strong><span class="font-num">${escapeHtml(viewModel.reliability.totalSessions)}</span></strong><span>הפעלות</span></div>
        <div><strong><span class="font-num">${escapeHtml(viewModel.reliability.affectedSessions)}</span></strong><span>הפעלות עם תקלה</span></div>
        <div><strong><span class="font-num">${escapeHtml(viewModel.reliability.failureCount)}</span></strong><span>כשלי פעולה</span></div>
        <div><strong><span class="font-num">${escapeHtml(viewModel.reliability.deferredCount)}</span></strong><span>פעולות שנדחו זמנית</span></div>
      </div>
      ${viewModel.reliability.failures.length ? `
        <div class="admin-breakdown-list" aria-label="כשלים לפי פעולה">
          ${viewModel.reliability.failures.map((item) => `
            <div><span>${escapeHtml(item.label)}</span><strong><span class="font-num">${escapeHtml(item.value)}</span></strong></div>
          `).join("")}
        </div>
      ` : ""}
      ${viewModel.reliability.deferred.length ? `
        <div class="admin-breakdown-list is-deferred" aria-label="פעולות שנדחו זמנית לפי סוג">
          ${viewModel.reliability.deferred.map((item) => `
            <div><span>${escapeHtml(item.label)}</span><strong><span class="font-num">${escapeHtml(item.value)}</span></strong></div>
          `).join("")}
        </div>
      ` : ""}
      ${viewModel.reliability.platforms.length ? `
        <div class="admin-platform-list" aria-label="הפעלות לפי פלטפורמה">
          ${viewModel.reliability.platforms.map((item) => `
            <div>
              <strong>${escapeHtml(item.label)}</strong>
              <span><bdi><span class="font-num">${escapeHtml(item.sessions)}</span></bdi> הפעלות · <bdi><span class="font-num">${escapeHtml(item.affected)}</span></bdi> עם תקלה</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </section>

    <section class="admin-monitor-section" aria-labelledby="admin-monitor-title">
      <h2 id="admin-monitor-title">מערכת ואחסון</h2>
      <div class="admin-monitor-list">
        <div class="admin-monitor-row${attention ? " is-attention" : ""}">
          <span class="admin-monitor-icon" aria-hidden="true">${iconSvg(attention ? "history" : "check")}</span>
          <div>
            <strong>${escapeHtml(viewModel.failure.title)}</strong>
            <span>${escapeHtml(viewModel.failure.detail)}</span>
          </div>
        </div>
        <div class="admin-monitor-row">
          <span class="admin-monitor-icon" aria-hidden="true">${iconSvg("archive")}</span>
          <div>
            <strong>${escapeHtml(viewModel.storage.title)}</strong>
            <span>${escapeHtml(viewModel.storage.detail)}</span>
          </div>
        </div>
        <div class="admin-monitor-row${viewModel.telemetry.attention ? " is-attention" : ""}">
          <span class="admin-monitor-icon" aria-hidden="true">${iconSvg(viewModel.telemetry.attention ? "history" : "check")}</span>
          <div>
            <strong>${escapeHtml(viewModel.telemetry.title)}</strong>
            <span>${escapeHtml(viewModel.telemetry.detail)}</span>
          </div>
        </div>
        <div class="admin-monitor-row${viewModel.delivery.attention ? " is-attention" : ""}">
          <span class="admin-monitor-icon" aria-hidden="true">${iconSvg(viewModel.delivery.attention ? "history" : "bell")}</span>
          <div>
            <strong>${escapeHtml(viewModel.delivery.title)}</strong>
            <span>${escapeHtml(viewModel.delivery.detail)}</span>
          </div>
        </div>
        <div class="admin-monitor-row${viewModel.continuity.attention ? " is-attention" : ""}">
          <span class="admin-monitor-icon" aria-hidden="true">${iconSvg(viewModel.continuity.attention ? "history" : "check")}</span>
          <div>
            <strong>${escapeHtml(viewModel.continuity.title)}</strong>
            <span>${escapeHtml(viewModel.continuity.detail)}</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

async function refreshAdminAnalytics({ force = false } = {}) {
  if (adminAnalyticsRequest) return adminAnalyticsRequest;
  if (!force && ["ready", "unavailable"].includes(adminAnalytics.status)) {
    return adminAnalytics;
  }

  adminAnalytics = {
    ...adminAnalytics,
    status: "loading",
    error: ""
  };
  if (screen.name === "admin-overview") render();

  adminAnalyticsRequest = (async () => {
    const config = runtimeConfig?.storage?.account?.accessToken
      ? runtimeConfig
      : await loadRuntimeConfig();
    runtimeConfig = config;
    const result = await loadAdminAnalyticsOverview(config);

    if (!result.available) {
      adminAnalytics = {
        status: "unavailable",
        available: false,
        overview: null,
        error: ""
      };
      if (screen.name === "admin-overview") {
        screen = { name: "profile" };
        notice = "אזור בקרת המוצר זמין רק למנהל מורשה.";
      }
      return adminAnalytics;
    }

    adminAnalytics = {
      status: "ready",
      available: true,
      overview: result.overview,
      error: ""
    };
    return adminAnalytics;
  })()
    .catch(() => {
      adminAnalytics = {
        ...adminAnalytics,
        status: "error",
        error: "load-failed"
      };
      return adminAnalytics;
    })
    .finally(() => {
      adminAnalyticsRequest = null;
      if (["profile", "admin-overview"].includes(screen.name)) render();
    });

  return adminAnalyticsRequest;
}

function renderNotificationInbox() {
  const visibleItems = visibleNotificationInboxItems();
  const unread = notificationUnreadCount();
  const accountPending = notificationInbox.status !== "loading"
    && !notificationInbox.error
    && !notificationInbox.available;
  const content = notificationInbox.status === "loading"
    ? renderNotificationInboxLoading()
    : notificationInbox.error
      ? `
        <section class="notification-inbox-empty" role="status">
          <span class="notification-inbox-empty-icon is-error" aria-hidden="true">${iconSvg("x")}</span>
          <h2>לא הצלחנו לטעון את ההתראות</h2>
          <p>אפשר לנסות שוב. האירועים וההוצאות שלך נשארו שמורים.</p>
          <button class="secondary-button" type="button" data-action="retry-notifications">נסה שוב</button>
        </section>
      `
      : !notificationInbox.available
        ? `
          <section class="notification-inbox-empty is-account-pending">
            <div class="notification-account-pending-heading">
              <span class="notification-inbox-empty-icon" aria-hidden="true">${iconSvg("bell")}</span>
              <h2>ההתראות מחכות בחשבון שלך</h2>
            </div>
            <button class="primary-button" type="button" data-action="edit-profile">לפרופיל</button>
          </section>
        `
        : visibleItems.length
          ? `
            <div class="notification-inbox-list" role="list">
              ${visibleItems.map(renderNotificationInboxItem).join("")}
            </div>
          `
          : `
            <section class="notification-inbox-empty">
              <span class="notification-inbox-empty-icon" aria-hidden="true">${iconSvg("check")}</span>
              <h2>הכול מעודכן</h2>
              <p>הוצאות חדשות, הצטרפויות ותזכורות יופיעו כאן.</p>
            </section>
          `;

  return `
    <section class="screen font-hebrew notification-inbox-screen" data-screen-kind="notifications">
      <header class="top notification-inbox-header">
        ${renderAppBackButton()}
        <div class="brand">
          <h1>התראות</h1>
          <p class="muted">כל מה שהתעדכן באירועים שמשותפים איתך.</p>
        </div>
        ${
          unread
            ? `<button class="notification-mark-all" type="button" data-action="mark-all-notifications-read">סמן הכול כנקרא</button>`
            : ""
        }
      </header>
      ${renderNotice()}
      <section class="panel notification-inbox-panel ${accountPending ? "is-account-pending" : ""}" aria-live="polite">
        ${content}
      </section>
    </section>
  `;
}

function renderNotificationInboxItem(item) {
  const icon = item.kind === "friend-request"
    ? "user-plus"
    : item.kind === "expense-created"
    ? "receipt"
    : item.kind === "participant-joined"
      ? "user-plus"
      : item.kind === "event-invite"
        ? "log-in"
        : "check";
  return `
    <button
      class="notification-inbox-item ${item.readAt ? "is-read" : "is-unread"}"
      type="button"
      role="listitem"
      data-action="open-notification"
      data-notification-id="${escapeAttribute(item.id)}"
      data-event-id="${escapeAttribute(item.eventId)}"
      data-notification-view="${item.view === "friends" ? "friends" : item.view === "summary" ? "summary" : "event"}"
    >
      <span class="notification-inbox-item-icon" aria-hidden="true">${iconSvg(icon)}</span>
      <span class="notification-inbox-item-copy">
        <span class="notification-inbox-item-heading">
          <strong>${escapeHtml(item.title)}</strong>
          <time datetime="${escapeAttribute(item.createdAt)}">${escapeHtml(formatNotificationTime(item.createdAt))}</time>
        </span>
        <small>${escapeHtml(item.body)}</small>
      </span>
      ${item.readAt ? "" : '<span class="notification-unread-dot" aria-label="לא נקרא"></span>'}
    </button>
  `;
}

function renderNotificationInboxLoading() {
  return `
    <div class="notification-inbox-skeleton" aria-label="טוען התראות">
      ${Array.from({ length: 3 }, () => `
        <span class="notification-inbox-skeleton-row" aria-hidden="true">
          <i></i><b></b><small></small>
        </span>
      `).join("")}
    </div>
  `;
}

function formatNotificationTime(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const calendarLabel = formatRelativeCalendarDate(value);
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (calendarLabel === "היום") {
    if (elapsedMinutes < 1) return "עכשיו";
    if (elapsedMinutes < 60) return `לפני ${elapsedMinutes} דק׳`;
    return `לפני ${Math.floor(elapsedMinutes / 60)} שע׳`;
  }
  return calendarLabel;
}

function renderProfileAvatarPicker() {
  const selectedPreset =
    AVATAR_PRESETS.find((preset) => preset.id === profileAvatarDraft) ??
    AVATAR_PRESETS[0];
  const selectedSource = profileAvatarPendingPreview || profileAvatarImageDraft || selectedPreset.src;
  const picker = `
    <fieldset class="profile-avatar-picker">
      <legend>${profileAvatarImageDraft ? "או בחר תמונה מוכנה" : "בחר תמונת פרופיל"}</legend>
      <div class="profile-avatar-options">
        ${AVATAR_PRESETS.map(
          (preset) => `
            <label class="profile-avatar-option" title="${escapeAttribute(preset.label)}">
              <input
                type="radio"
                name="avatarPreset"
                value="${preset.id}"
                data-action="profile-avatar"
                ${!profileAvatarImageDraft && profileAvatarDraft === preset.id ? "checked" : ""}
              />
              <span class="profile-avatar-preview" aria-hidden="true">
                <img src="${preset.src}" alt="" width="256" height="256" loading="eager" decoding="async" />
              </span>
              <span class="visually-hidden">${escapeHtml(preset.label)}</span>
            </label>
          `
        ).join("")}
      </div>
    </fieldset>
  `;

  if (!localProfile || screen.name !== "profile") return picker;

  return `
    <details class="profile-avatar-picker-shell">
      <summary class="profile-avatar-picker-summary">
        <span class="profile-avatar-summary-preview" aria-hidden="true">
          <img src="${escapeAttribute(selectedSource)}" alt="" width="256" height="256" loading="eager" decoding="async" />
        </span>
        <span class="profile-avatar-summary-copy">
          <strong>תמונת פרופיל</strong>
          <small>${profileAvatarImageDraft ? "החלפה או הסרה" : "בחירת תמונה"}</small>
        </span>
        <span class="profile-avatar-summary-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </summary>
      <div class="profile-avatar-picker-body">
        <div class="profile-avatar-source-grid">
          <label class="secondary-button profile-avatar-upload">
            <span>מהגלריה</span>
            <input data-action="profile-avatar-image" data-image-source="gallery" type="file" accept="image/*" hidden />
          </label>
          <label class="secondary-button profile-avatar-upload">
            <span>מצלמה</span>
            <input data-action="profile-avatar-image" data-image-source="camera" type="file" accept="image/*" capture="environment" hidden />
          </label>
          ${profileAvatarImageDraft ? '<button class="secondary-button" type="button" data-action="remove-profile-avatar-image">הסר</button>' : ""}
        </div>
        ${picker}
      </div>
    </details>
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
    .sort(
      (a, b) =>
        eventRelevanceTimestamp(b, state.currentParticipantId) -
          eventRelevanceTimestamp(a, state.currentParticipantId) ||
        creationTimestamp(b.createdAt, b.id) - creationTimestamp(a.createdAt, a.id)
    );
  const homeDialogEvent =
    eventDialog?.kind === "share" ? getEvent(eventDialog.eventId) : null;
  const archivedEventIds = personalArchivedEventIds();
  const events = sortedEvents.filter((event) =>
    eventStatusFilter === "archive"
      ? archivedEventIds.has(event.id)
      : !archivedEventIds.has(event.id)
  );
  const homeParticipant = state.participants.find(
    (participant) => participant.id === state.currentParticipantId
  );
  const homeAvatarSource = avatarSourceForParticipant(
    homeParticipant,
    state.currentParticipantId
  );
  const homeTitle = "מה סוגרים היום?";
  const homeDescription = "אירוע חדש, חברים קבועים, או חשבון שכבר מחכה לסגירה.";

  return `
    <section class="screen font-hebrew product-home-screen${sortedEvents.length ? "" : " product-empty-home"}" data-screen-kind="home" data-product-screen="home" data-profile-avatar-src="${escapeAttribute(homeAvatarSource)}">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">היי, <bdi>${escapeHtml(participantName(state.currentParticipantId))}</bdi></p>
          <h1>${homeTitle}</h1>
          <p class="muted">${homeDescription}</p>
        </div>
      </header>
      ${renderNotice()}
      ${renderHomeCreateEventAction()}
      <section class="home-benefit-actions" aria-label="הטבות וחברים">
        <button class="home-quick-action home-friends-action" data-action="groups" data-tab="people">
          <span class="home-quick-action-icon" aria-hidden="true">${iconSvg("users")}</span>
          <span><strong>חברים</strong></span>
        </button>
      </section>

      ${
        sortedEvents.length
          ? `
            <section class="section">
              <div class="section-title-row">
                <div>
                  <h2>אירועים</h2>
                </div>
                ${renderEventStatusFilter(sortedEvents)}
              </div>
              <div class="event-list">
                ${
                  events.length
                    ? events.map(renderEventRow).join("")
                    : `<div class="empty-state">${eventStatusFilter === "archive" ? "אין אירועים בארכיון" : "אין אירועים להצגה"}</div>`
                }
              </div>
            </section>
          `
          : `
            <section class="section home-empty-events">
              <div class="section-title-row">
                <div>
                  <h2>אירועים</h2>
                  <p class="muted">פתח אירוע חדש. הזמנה שקיבלת נפתחת ישירות מהקישור.</p>
                </div>
              </div>
              <div class="empty-state home-empty-visual">
                <img src="./sogrim-home-hero.png" alt="חברים סוגרים יחד חשבון במסעדה" width="1672" height="941" fetchpriority="high" decoding="async" />
                <strong>אין אירועים שלך עדיין</strong>
              </div>
            </section>
            `
      }
      ${homeDialogEvent ? renderEventDialog(homeDialogEvent) : ""}
    </section>
  `;
}

function renderHomeCreateEventAction() {
  const label = "אירוע חדש";
  return `
    <section class="home-quick-actions" aria-label="פעולות מהירות">
      <button class="home-quick-action is-primary home-create-event-action" data-action="new-event" type="button" aria-label="${escapeAttribute(label)}">
        <span class="home-quick-action-icon" aria-hidden="true">${iconSvg("plus-square")}</span>
        <span><strong>${label}</strong></span>
      </button>
    </section>
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
          ${myBalance ? `<strong class="amount"><span class="font-num">${formatEventMoney(event, Math.abs(myBalance))}</span></strong>` : ""}
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
        <strong class="amount is-${balanceDirection}"><span class="font-num">${headlineValue}</span></strong>
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
                            ? `<bdi class="amount is-debt">לשלם <span class="font-num">${formatCurrency(item.toPay, item.currency)}</span></bdi>`
                            : ""
                        }
                        ${
                          item.toReceive
                            ? `<bdi class="amount is-credit">לקבל <span class="font-num">${formatCurrency(item.toReceive, item.currency)}</span></bdi>`
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
      ? `להעביר ל${participantName(otherParticipantId, event)}`
      : `צפויה אליך העברה מאת ${participantName(otherParticipantId, event)}`;
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
      <span class="amount"><span class="font-num">${formatEventMoney(event, transfer.amount)}</span></span>
    </button>
  `;
}

function renderEventStatusFilter(events) {
  return `
    <div class="segmented-control" role="group" aria-label="אירועים וארכיון">
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
          </button>
        `
      ).join("")}
    </div>
  `;
}

function renderNotice() {
  const presentation = noticePresentation(notice);
  return presentation.visible
    ? `
        <div class="notice app-toast" role="status" aria-live="polite" aria-atomic="true">
          <span class="app-toast-icon" aria-hidden="true">${iconSvg("bell")}</span>
          <span class="app-toast-copy">${escapeHtml(notice)}</span>
          <button class="app-toast-close" type="button" data-action="dismiss-notice" aria-label="סגירת ההודעה" title="סגירת ההודעה">
            ${iconSvg("x")}
          </button>
        </div>
      `
    : "";
}

function clearRenderedNotice() {
  cancelNoticeDismissTimer();
  notice = "";
  lastCommittedScreenMarkup = "";
  app.querySelector(".app-toast")?.remove();
}

function syncNoticeLifecycleAfterRender() {
  const presentation = noticePresentation(notice);
  if (!presentation.visible) {
    cancelNoticeDismissTimer();
    if (notice) notice = "";
    return;
  }

  const noticeKey = `${presentation.kind}:${notice}`;
  if (scheduledNoticeKey === noticeKey && noticeDismissTimer) return;
  cancelNoticeDismissTimer();
  scheduledNoticeKey = noticeKey;
  noticeDismissTimer = window.setTimeout(() => {
    if (`${noticePresentation(notice).kind}:${notice}` !== noticeKey) return;
    notice = "";
    scheduledNoticeKey = "";
    noticeDismissTimer = 0;
    lastCommittedScreenMarkup = "";
    app.querySelector(".app-toast")?.remove();
  }, presentation.ttlMs);
}

function cancelNoticeDismissTimer() {
  if (noticeDismissTimer) window.clearTimeout(noticeDismissTimer);
  noticeDismissTimer = 0;
  scheduledNoticeKey = "";
}

function renderAppBackButton() {
  const disabled = canNavigateBackWithinApp() ? "" : "disabled";
  return `
    <button class="icon-button app-back-button" data-action="go-back" aria-label="&#1495;&#1494;&#1512;&#1492; &#1500;&#1502;&#1505;&#1498; &#1492;&#1511;&#1493;&#1491;&#1501;" title="&#1495;&#1494;&#1512;&#1492; &#1500;&#1502;&#1505;&#1498; &#1492;&#1511;&#1493;&#1491;&#1501;" ${disabled}>
      <span class="app-back-button-glyph" aria-hidden="true">${iconSvg("chevron-left")}</span>
      <span class="app-back-button-label">&#1495;&#1494;&#1512;&#1492;</span>
    </button>
  `;
}

function canNavigateBackWithinApp() {
  return Boolean(
    appHistoryDepth > 0 ||
      screen.name !== "home" ||
      hasOpenTransientMenu() ||
      expenseDraft ||
      eventDialog ||
      editingGroupDraft ||
      settlementCloseConfirmation ||
      importantActionDialog ||
      eventStatusMenu ||
      settlementCelebration
  );
}

function handleNativeBackRequest(event) {
  if (hasIndependentHistoryDialog()) return;
  if (!canNavigateBackWithinApp()) return;

  event.preventDefault();
  goBackInApp();
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
          <p class="muted">שמירה ידנית של כל החברים, האירועים וההוצאות בקובץ אחד.</p>
        </div>
        <div class="section-title-actions">
          <button class="secondary-button" data-action="export-state">ייצא גיבוי</button>
          <label class="secondary-button file-button">
            שחזר מגיבוי
            <input class="visually-hidden" type="file" name="stateBackupFile" data-action="import-state-file" accept="application/json" />
          </label>
        </div>
      </div>
    </section>
  `;
}

function renderGroups() {
  const activeTab = ["people", "requests"].includes(screen.tab)
    ? screen.tab
    : "people";
  const acceptedFriendships = friendRelationships("accepted");
  const incomingFriendships = friendRelationships("pending", "incoming");
  const outgoingFriendships = friendRelationships("pending", "outgoing");
  const savedFriendIds = new Set(activeFriendParticipantIds(state));
  const offlineParticipants = sortFriends(
    state.participants.filter(
      (participant) =>
        savedFriendIds.has(participant.id) &&
        !participantConnectionStatus(participant).connected
    )
  );
  const friendCount = acceptedFriendships.length + offlineParticipants.length;
  const requestCount = incomingFriendships.length + outgoingFriendships.length;
  const hubTitle = activeTab === "requests"
      ? "בקשות"
      : "חברים";

  return `
    <section class="screen font-hebrew groups-overview-screen friends-hub-screen" data-screen-kind="groups" data-friends-tab="${activeTab}">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">האנשים שלך</p>
          <h1>${hubTitle}</h1>
          <p class="muted">חברים ובקשות חברות.</p>
        </div>
      </header>
      ${renderNotice()}

      <nav class="friends-hub-tabs" role="tablist" aria-label="חברים ובקשות חברות">
        <button
          class="friends-hub-tab ${activeTab === "people" ? "is-active" : ""}"
          data-action="friends-hub-tab"
          data-tab="people"
          type="button"
          role="tab"
          id="friends-tab-people"
          aria-controls="friends-panel-people"
          aria-selected="${activeTab === "people"}"
          tabindex="${activeTab === "people" ? "0" : "-1"}"
        >
          <span>חברים</span>
          <strong><span class="font-num">${friendCount}</span></strong>
        </button>
        <button
          class="friends-hub-tab ${activeTab === "requests" ? "is-active" : ""}"
          data-action="friends-hub-tab"
          data-tab="requests"
          type="button"
          role="tab"
          id="friends-tab-requests"
          aria-controls="friends-panel-requests"
          aria-selected="${activeTab === "requests"}"
          tabindex="${activeTab === "requests" ? "0" : "-1"}"
        >
          <span>בקשות</span>
          <strong class="${incomingFriendships.length ? "has-new-requests" : ""}"><span class="font-num">${requestCount}</span></strong>
        </button>
      </nav>

      ${
        activeTab === "people"
          ? renderFriendsPeopleTab({
              acceptedFriendships,
              offlineParticipants,
              friendCount
            })
          : renderFriendsRequestsTab({
              incomingFriendships,
              outgoingFriendships
            })
      }
    </section>
  `;
}

function renderFriendsPeopleTab({
  acceptedFriendships,
  offlineParticipants,
  friendCount
}) {
  const duplicateGroups = mergeableDuplicateParticipantGroups();
  const duplicateGroupCount = duplicateGroups.length;
  const showSearch = friendCount >= 5;
  const mergeTitle = duplicateGroupCount
    ? duplicateGroupCount === 1
      ? "מצאנו שם כפול"
      : `מצאנו ${duplicateGroupCount} שמות כפולים`
    : "ניהול ואיחוד שמות";
  const mergeHelper = duplicateGroupCount
    ? "בודקים ומאחדים רישומים בלי לאבד אירועים או הוצאות."
    : "שימושי אם אותו אדם נשמר אצלך בשמות שונים.";

  return `
    <section
      class="friends-hub-panel friends-people-panel"
      id="friends-panel-people"
      role="tabpanel"
      aria-labelledby="friends-tab-people"
    >
      ${
        friendCount
          ? `<div class="friends-toolbar ${showSearch ? "has-search" : "is-compact"}">
              ${
                showSearch
                  ? `<label class="field friends-search-field">
                      <span>חיפוש חבר</span>
                      <input
                        data-action="friends-search"
                        name="friendSearch"
                        type="search"
                        autocomplete="off"
                        enterkeyhint="search"
                        placeholder="שם או @username"
                        aria-label="חיפוש ברשימת החברים"
                      />
                    </label>`
                  : ""
              }
              <button class="primary-button friends-add-trigger" data-action="open-friend-add" type="button">
                ${renderCommandIcon("participants")}
                <span>הוסף חבר</span>
              </button>
            </div>`
          : ""
      }

      <div class="friends-roster" data-friends-roster>
        ${renderConnectedFriendSection(acceptedFriendships)}
        ${renderFriendIdentitySection(
          offlineParticipants,
          "offline",
          "שמות אופליין",
          "שמות ידניים לניהול משותף ממכשיר אחד"
        )}
        ${
          friendCount
            ? ""
            : `<section class="friends-empty-state" aria-labelledby="friends-empty-title">
                <span class="friends-empty-icon" aria-hidden="true">${renderCommandIcon("participants")}</span>
                <h2 id="friends-empty-title">עוד אין חברים</h2>
                <button class="primary-button" data-action="open-friend-add" type="button">הוסף חבר</button>
              </section>`
        }
        <p class="empty-state friends-search-empty" data-friends-search-empty role="status" hidden>
          לא נמצא חבר שמתאים לחיפוש.
        </p>
      </div>

      ${renderBlockedUsersPanel()}

      ${
        duplicateGroupCount
          ? `
            <button class="friends-merge-entry ${duplicateGroupCount ? "has-duplicates" : ""}" data-action="manage-people" type="button">
              <span>
                <strong>${mergeTitle}</strong>
                <small>${mergeHelper}</small>
              </span>
              <span class="inline-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
            </button>
          `
          : ""
      }

      <details class="friend-privacy-note">
        <summary>
          <span class="friend-privacy-summary-label">איך נשמרת הפרטיות?</span>
          <span class="inline-chevron friend-privacy-chevron">${iconSvg("chevron-left")}</span>
        </summary>
        <p>משתמש מחובר מופיע רק אחרי אישור הדדי. שם אופליין נשמר רק אצלך.</p>
      </details>
    </section>
  `;
}

function renderBlockedUsersPanel() {
  const blockedUsers = friendNetwork.blockedUsers ?? [];
  if (!blockedUsers.length) return "";

  return `
    <details class="friend-privacy-note blocked-users-panel">
      <summary>
        <span class="friend-privacy-summary-label">משתמשים חסומים (${blockedUsers.length})</span>
        <span class="inline-chevron friend-privacy-chevron">${iconSvg("chevron-left")}</span>
      </summary>
      <div class="blocked-users-list">
        ${blockedUsers
          .map(
            (blockedUser) => `
              <div class="blocked-user-row">
                <span>
                  <strong>${escapeHtml(blockedUser.blocked_display_name)}</strong>
                  ${
                    blockedUser.blocked_username
                      ? `<small><bdi dir="ltr">@${escapeHtml(blockedUser.blocked_username)}</bdi></small>`
                      : ""
                  }
                </span>
                <button
                  class="secondary-button"
                  type="button"
                  data-action="unblock-connected-user"
                  data-target-user-id="${escapeAttribute(blockedUser.blocked_user_id)}"
                  ${friendNetworkBusyAction ? "disabled" : ""}
                >בטל חסימה</button>
              </div>
            `
          )
          .join("")}
      </div>
    </details>
  `;
}

function renderFriendAdd() {
  const mode = friendsAddMode === "offline" ? "offline" : "online";
  return `
    <section class="screen font-hebrew friend-add-screen" data-screen-kind="friends-add" data-friend-add-mode="${mode}">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">חברים</p>
          <h1>הוספת חבר</h1>
          <p class="muted">בוחרים סוג אחד ומסיימים בלי לעבור בין טפסים.</p>
        </div>
      </header>
      ${renderNotice()}

      <nav class="friend-add-mode-switch" role="tablist" aria-label="סוג החבר">
        <button
          class="friend-add-mode-button ${mode === "online" ? "is-active" : ""}"
          data-action="friend-add-mode"
          data-mode="online"
          type="button"
          role="tab"
          aria-selected="${mode === "online"}"
          tabindex="${mode === "online" ? "0" : "-1"}"
        >
          <span class="friend-add-mode-icon" aria-hidden="true">${renderCommandIcon("participants")}</span>
          <span><strong>משתמש באפליקציה</strong><small>חשבון אמיתי עם אישור</small></span>
        </button>
        <button
          class="friend-add-mode-button ${mode === "offline" ? "is-active" : ""}"
          data-action="friend-add-mode"
          data-mode="offline"
          type="button"
          role="tab"
          aria-selected="${mode === "offline"}"
          tabindex="${mode === "offline" ? "0" : "-1"}"
        >
          <span class="friend-add-mode-icon is-offline" aria-hidden="true">${renderCommandIcon("profile")}</span>
          <span><strong>שם אופליין</strong><small>שם ידני שנשמר אצלך</small></span>
        </button>
      </nav>

      <section class="friend-add-step" role="tabpanel">
        ${mode === "online" ? renderFriendNetworkPanel() : renderOfflineFriendAddStep()}
      </section>
    </section>
  `;
}

function renderOfflineFriendAddStep() {
  return `
    <section class="friend-add-focus-panel friends-offline-panel" aria-labelledby="friends-offline-add-title">
      <div class="friend-add-focus-heading">
        <span class="friend-add-kind is-offline">אופליין</span>
        <h2 id="friends-offline-add-title">איך לקרוא לו באירועים?</h2>
        <p>השם לא יוכל להיכנס בעצמו או לראות את האירוע. אתה מנהל אותו מהמכשיר שלך.</p>
      </div>
      <div class="friends-add-offline-form">
        <label class="field">
          <span>שם מלא</span>
          <input
            data-action="friends-new-offline-name"
            name="offlineFriendName"
            autocomplete="off"
            enterkeyhint="done"
            placeholder="שם פרטי ושם משפחה"
            value="${escapeAttribute(friendsNewOfflineName)}"
          />
        </label>
        <button class="primary-button" data-action="friends-add-offline" type="button">הוסף לרשימת החברים</button>
      </div>
    </section>
  `;
}

function renderFriendsRequestsTab({
  incomingFriendships,
  outgoingFriendships
}) {
  const hasRequests = incomingFriendships.length || outgoingFriendships.length;

  return `
    <section
      class="friends-hub-panel friends-requests-panel"
      id="friends-panel-requests"
      role="tabpanel"
      aria-labelledby="friends-tab-requests"
    >
      <div class="friends-panel-heading">
        <div>
          <h2>בקשות חברות</h2>
          <p class="muted">בקשה הופכת לחברות רק אחרי אישור.</p>
        </div>
      </div>
      <div class="friends-roster">
        ${renderFriendRequestSection(
          incomingFriendships,
          "בקשות שקיבלת",
          "incoming"
        )}
        ${renderFriendRequestSection(
          outgoingFriendships,
          "בקשות ששלחת",
          "outgoing"
        )}
        ${
          hasRequests
            ? ""
            : `
              <div class="empty-state friends-requests-empty">
                <strong>אין בקשות שממתינות עכשיו</strong>
                <span>בקשות חדשות יופיעו כאן בלי להעמיס על רשימת החברים.</span>
              </div>
            `
        }
      </div>
    </section>
  `;
}

function friendRelationships(status, direction = "") {
  return (friendNetwork.friendships ?? []).filter((friendship) => {
    if (friendship.status !== status) return false;
    if (direction === "incoming") {
      return friendship.addressee_id === friendNetwork.userId;
    }
    if (direction === "outgoing") {
      return friendship.requester_id === friendNetwork.userId;
    }
    return true;
  });
}

function friendProfileForRelationship(friendship) {
  const friendUserId =
    friendship.requester_id === friendNetwork.userId
      ? friendship.addressee_id
      : friendship.requester_id;
  return (friendNetwork.profiles ?? []).find(
    (profile) => profile.user_id === friendUserId
  );
}

function renderFriendProfileAvatar(profile, participantId = "") {
  const preset =
    normalizeAvatarPreset(profile?.avatar_preset) || AVATAR_PRESETS[0].id;
  const source =
    normalizeAvatarImage(profile?.avatar_image) || avatarPresetSource(preset);
  const displayName = String(profile?.display_name ?? "משתמש").trim() || "משתמש";
  const opensStatistics = canOpenParticipantStatistics(participantId);
  return `
    <span
      class="avatar has-picture is-account ${opensStatistics ? "is-participant-statistics-action" : ""}"
      data-avatar-preset="${preset}"
      data-participant-identity="account"
      ${participantStatisticsAvatarAttributes(participantId, displayName)}
    >
      <img src="${escapeAttribute(source)}" alt="" width="256" height="256" loading="lazy" decoding="async" />
    </span>
  `;
}

function friendInviteUrl() {
  return buildFriendInviteUrl(
    runtimePublicOrigin(runtimeConfig),
    friendNetwork.friendCode
  );
}

function friendRequestTargetFromDraft() {
  const friendCode =
    friendInviteCodeFromUrl(friendCodeDraft) ||
    normalizeFriendCode(friendCodeDraft);
  if (friendCode) return { type: "code", value: friendCode };

  const username = normalizeUsername(friendCodeDraft);
  return username ? { type: "username", value: username } : null;
}

function renderFriendNetworkPanel() {
  if (friendNetwork.status === "loading") {
    return `
      <section class="friend-network-panel is-loading" aria-live="polite">
        <span class="friend-network-skeleton" aria-hidden="true"></span>
        <span>טוענים את החברים הפרטיים שלך…</span>
      </section>
    `;
  }

  if (friendNetwork.status === "signed-out") {
    return `
      <section class="friend-network-panel">
        <span class="friend-add-kind is-online">אונליין</span>
        <strong>בקשות חברות זמינות למשתמשים מחוברים</strong>
        <span>אחרי התחברות עם Google או אימייל אפשר לשלוח ולאשר בקשות גם בלי קבוצה משותפת.</span>
      </section>
    `;
  }

  if (friendNetwork.status === "error") {
    return `
      <section class="friend-network-panel is-error" role="status">
        <span class="friend-add-kind is-online">אונליין</span>
        <strong>לא הצלחנו לטעון את החברים כרגע</strong>
        <span>השמות המקומיים נשארו שמורים. אפשר לנסות שוב כשיש חיבור.</span>
        <button class="secondary-button" data-action="friends-retry-network" type="button">נסה שוב</button>
      </section>
    `;
  }

  const inviteUrl = friendInviteUrl();
  const ownUsername = formatUsername(currentFriendUsername());
  return `
    <section class="friend-network-panel">
      ${
        friendNetwork.stale
          ? '<div class="friend-network-stale" role="status">מציגים את הרשימה השמורה. נעדכן אותה כשהחיבור יחזור.</div>'
          : ""
      }
      <div class="friend-network-heading">
        <span>
          <span class="friend-add-kind is-online">אונליין</span>
          <strong>משתמש מחובר</strong>
          ${
            ownUsername
              ? `<bdi class="friend-username is-own" dir="ltr">${escapeHtml(ownUsername)}</bdi>`
              : ""
          }
          <small>אפשר לבחור שם משתמש נקי וייחודי כדי שחברים ימצאו אותך. חברות נוצרת רק אחרי אישור.</small>
        </span>
        ${
          inviteUrl
            ? `<button class="secondary-button" data-action="copy-friend-link" type="button">שתף קישור חברות</button>`
            : ""
        }
      </div>
      <div class="friend-request-form">
        <label class="field">
          <span>שם משתמש או קישור שקיבלת</span>
          <input
            data-action="friend-code"
            name="friendCode"
            dir="ltr"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            enterkeyhint="send"
            placeholder="@username"
            value="${escapeAttribute(friendCodeDraft)}"
          />
        </label>
        <button
          class="primary-button"
          data-action="send-friend-request"
          type="button"
          ${friendNetworkBusyAction ? "disabled" : ""}
        >
          ${friendNetworkBusyAction === "request" ? "שולח…" : "שלח בקשה"}
        </button>
      </div>
    </section>
  `;
}

function renderConnectedFriendSection(friendships) {
  if (!friendships.length) return "";
  return `
    <section class="friend-identity-section is-connected" data-friend-identity-section="connected">
      <header class="friend-identity-heading">
        <span class="friend-identity-marker" aria-hidden="true"></span>
        <span>
          <strong>חברים מאושרים</strong>
          <small>רק משתמשים שאישרתם זה את זה</small>
        </span>
        <bdi>${formatCount(friendships.length, "חבר", "חברים")}</bdi>
      </header>
      <div class="friend-list">
        ${friendships.map(renderNetworkFriendRow).join("")}
      </div>
    </section>
  `;
}

function renderFriendRequestSection(friendships, title, direction) {
  if (!friendships.length) return "";
  const helper = direction === "incoming"
    ? "ממתינים לאישור שלך"
    : "ממתינים לאישור מהצד השני";
  return `
    <section class="friend-request-section is-${direction}" data-friend-identity-section="${direction}">
      <header class="friend-identity-heading">
        <span class="friend-identity-marker" aria-hidden="true"></span>
        <span>
          <strong>${title}</strong>
          <small>${helper}</small>
        </span>
        <bdi>${friendships.length}</bdi>
      </header>
      <div class="friend-list">
        ${friendships
          .map((friendship) => renderPendingFriendRow(friendship, direction))
          .join("")}
      </div>
    </section>
  `;
}

function renderNetworkFriendRow(friendship) {
  const profile = friendProfileForRelationship(friendship);
  if (!profile) return "";
  const participantId = `account-${profile.user_id}`;
  const username = formatUsername(publicProfileUsername(profile));
  const searchableIdentity = [profile.display_name, username]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("he");
  return `
    <article
      class="friend-row is-connected"
      data-friend-name="${escapeAttribute(searchableIdentity)}"
    >
      <span class="friend-row-person">
        ${renderFriendProfileAvatar(profile, participantId)}
        <span class="friend-row-copy">
          <span class="friend-row-name">
            <strong>${escapeHtml(profile.display_name)}</strong>
          </span>
          ${username ? `<bdi class="friend-username" dir="ltr">${escapeHtml(username)}</bdi>` : ""}
        </span>
      </span>
      <button
        class="friend-remove-button"
        data-action="remove-network-friend"
        data-friendship-id="${friendship.id}"
        data-participant-id="${participantId}"
        type="button"
        ${friendNetworkBusyAction ? "disabled" : ""}
        title="הסר חבר"
        aria-label="הסר את ${escapeAttribute(profile.display_name)} מרשימת החברים"
      ></button>
    </article>
  `;
}

function renderFriendRelationshipProfile() {
  const participant = participantForStatistics(screen.participantId);
  if (!participant || !canOpenParticipantStatistics(participant.id)) {
    screen = { name: "groups", tab: "people" };
    return renderGroups();
  }

  const sharedEvents = visibleEventsForParticipant(state, state.currentParticipantId)
    .filter((event) => event.participantIds.includes(participant.id))
    .sort(
      (left, right) =>
        creationTimestamp(right.createdAt, right.id) -
        creationTimestamp(left.createdAt, left.id)
    );
  const contextEvent = sharedEvents[0] ?? {
    id: "friend-relationship",
    name: "",
    currency: DEFAULT_CURRENCY,
    participantIds: [state.currentParticipantId, participant.id],
    expenses: [],
    transfers: []
  };
  const targetName = participant.displayName;
  const acceptedFriend = isAcceptedNetworkFriendParticipant(participant.id);
  const identityClass = participantConnectionStatus(participant).connected
    ? "is-account"
    : "is-offline";
  const identityView = identityClass === "is-account" ? "account" : "offline";
  const insights = buildParticipantRelationshipInsights({
    events: sharedEvents,
    currentParticipantId: state.currentParticipantId,
    targetParticipantId: participant.id,
    currency: eventCurrency(contextEvent)
  });

  return `
    <section
      class="screen font-hebrew friends-hub-screen friend-relationship-screen"
      data-screen-kind="groups"
      data-friends-tab="people"
      data-friend-profile-id="${escapeAttribute(participant.id)}"
    >
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">סטטיסטיקה משותפת</p>
          <h1>הקשר עם ${escapeHtml(targetName)}</h1>
          <p class="muted">הפעילות המשותפת שלכם במקום אחד.</p>
        </div>
      </header>
      ${renderNotice()}
      <main class="friend-relationship-content">
        <section
          class="event-participant-profile-card event-participant-detail event-participant-relationship ${identityClass}"
          data-participant-detail-view="${identityView}"
          data-participant-id="${escapeAttribute(participant.id)}"
        >
          <header class="event-participant-profile-identity event-participant-detail-identity relationship-identity-card">
            ${renderAvatar(participant.id)}
            <div class="relationship-identity-copy">
              <strong>${escapeHtml(targetName)}</strong>
              ${renderParticipantUsername(participant)}
            </div>
            ${acceptedFriend
              ? '<span class="relationship-friendship-badge is-accepted">חבר</span>'
              : renderParticipantConnectionBadge(participant)}
          </header>
          ${renderParticipantRelationshipScorecard(
            contextEvent,
            participant,
            insights,
            { targetName, avatarEvent: null }
          )}
          ${renderParticipantRelationshipHabit(targetName, insights)}
          ${renderParticipantRelationshipFacts(contextEvent, insights)}
          ${renderParticipantSafetyPanel(null, participant)}
        </section>
      </main>
    </section>
  `;
}

function isAcceptedNetworkFriendParticipant(participantId) {
  const userId = accountUserIdFromParticipantId(participantId);
  if (!userId) return false;
  return friendRelationships("accepted").some(
    (friendship) =>
      friendship.requester_id === userId || friendship.addressee_id === userId
  );
}

function participantForStatistics(participantId) {
  const normalizedId = String(participantId ?? "").trim();
  const savedParticipant = state.participants.find(
    (participant) => participant.id === normalizedId
  );
  if (savedParticipant) return savedParticipant;

  const userId = accountUserIdFromParticipantId(normalizedId);
  const profile = userId
    ? (friendNetwork.profiles ?? []).find((item) => item.user_id === userId)
    : null;
  if (!profile?.display_name) return null;

  return {
    id: normalizedId,
    displayName: profile.display_name,
    username: publicProfileUsername(profile),
    kind: "member",
    accountLinked: true,
    authSubject: userId,
    avatarPreset: normalizeAvatarPreset(profile.avatar_preset),
    avatarImage: normalizeAvatarImage(profile.avatar_image),
    avatarImageUpdatedAt: profile.avatar_image_updated_at,
    profileUpdatedAt: profile.updated_at
  };
}

function canOpenParticipantStatistics(participantId) {
  const normalizedId = String(participantId ?? "").trim();
  return Boolean(
    normalizedId &&
    normalizedId !== state.currentParticipantId &&
    participantForStatistics(normalizedId)
  );
}

function renderPendingFriendRow(friendship, direction) {
  const profile = friendProfileForRelationship(friendship);
  if (!profile) return "";
  const participantId = `account-${profile.user_id}`;
  const busy = friendNetworkBusyAction === friendship.id;
  const username = formatUsername(publicProfileUsername(profile));
  const searchableIdentity = [profile.display_name, username]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("he");
  return `
    <article
      class="friend-row friend-request-row is-connected"
      data-friend-name="${escapeAttribute(searchableIdentity)}"
    >
      <span class="friend-row-person">
        ${renderFriendProfileAvatar(profile, participantId)}
        <span class="friend-row-copy">
          <span class="friend-row-name"><strong>${escapeHtml(profile.display_name)}</strong></span>
          ${username ? `<bdi class="friend-username" dir="ltr">${escapeHtml(username)}</bdi>` : ""}
          <small>${direction === "incoming" ? "רוצה להתחבר אליך כחבר" : "הבקשה נשלחה"}</small>
        </span>
      </span>
      <span class="friend-request-actions">
        ${
          direction === "incoming"
            ? `
              <button class="primary-button" data-action="accept-friend-request" data-friendship-id="${friendship.id}" type="button" ${busy ? "disabled" : ""}>אשר</button>
              <button class="secondary-button" data-action="decline-friend-request" data-friendship-id="${friendship.id}" type="button" ${busy ? "disabled" : ""}>דחה</button>
            `
            : `<button class="secondary-button" data-action="cancel-friend-request" data-friendship-id="${friendship.id}" type="button" ${busy ? "disabled" : ""}>בטל בקשה</button>`
        }
      </span>
    </article>
  `;
}

function renderFriendIdentitySection(participants, identity, title, description) {
  if (!participants.length) return "";
  const countLabel = identity === "connected"
    ? formatCount(participants.length, "משתמש", "משתמשים")
    : formatCount(participants.length, "שם", "שמות");

  return `
    <section class="friend-identity-section is-${identity}" data-friend-identity-section="${identity}">
      <header class="friend-identity-heading">
        <span class="friend-identity-marker" aria-hidden="true"></span>
        <span>
          <strong>${title}</strong>
          <small>${description}</small>
        </span>
        <bdi>${countLabel}</bdi>
      </header>
      <div class="friend-list">
        ${participants.map(renderFriendRow).join("")}
      </div>
    </section>
  `;
}

function renderFriendRow(participant) {
  const isCurrent = participant.id === state.currentParticipantId;
  const identity = participantConnectionStatus(participant);
  const visibleEvents = visibleEventsForParticipant(state, state.currentParticipantId)
    .filter((event) => event.participantIds.includes(participant.id));
  const activity = visibleEvents.length
    ? formatCount(visibleEvents.length, "אירוע", "אירועים")
    : "";
  const helper = isCurrent
    ? "החשבון שלך"
    : activity || (identity.connected ? "מחובר לאפליקציה" : "שם ידני");
  const hasDuplicate = mergeableDuplicateParticipantGroups().some((group) =>
    group.some((item) => item.id === participant.id)
  );

  return `
    <article
      class="friend-row ${identity.connected ? "is-connected" : "is-offline"}"
      data-friend-name="${escapeAttribute(participant.displayName.toLowerCase())}"
    >
      <span class="friend-row-person">
        ${renderAvatar(participant.id)}
        <span class="friend-row-copy">
          <span class="friend-row-name">
            <strong>${escapeHtml(participant.displayName)}</strong>
            ${renderParticipantConnectionBadge(participant)}
            ${
              hasDuplicate
                ? `<small class="participant-connection-badge is-duplicate">שם כפול</small>`
                : ""
            }
          </span>
          <small>${escapeHtml(helper)}</small>
        </span>
      </span>
      ${
        !identity.connected && !isCurrent
          ? `<button class="friend-remove-button" data-action="remove-offline-friend" data-participant-id="${participant.id}" type="button" title="הסר שם אופליין" aria-label="הסר את ${escapeAttribute(participant.displayName)} מרשימת החברים"></button>`
          : `<span class="friend-row-state">${isCurrent ? "אתה" : "מחובר"}</span>`
      }
    </article>
  `;
}

function mergeableDuplicateParticipantGroups() {
  return duplicateParticipantNameGroups(state.participants).filter((group) =>
    group.some((participant) => !participantConnectionStatus(participant).connected)
  );
}

function renderFriendsGroupsTab(activeGroups) {
  return `
    <section
      class="friends-hub-panel groups-list-section"
      id="friends-panel-groups"
      role="tabpanel"
      aria-labelledby="friends-tab-groups"
    >
      <div class="section-title-row friends-groups-heading">
        <div>
          <h2>הקבוצות שלך</h2>
          <p class="muted">שומרים הרכב פעם אחת ומשתמשים בו בכל יציאה מחדש.</p>
        </div>
        ${
          activeGroups.length
            ? '<button class="primary-button" data-action="new-group" type="button">קבוצה חדשה</button>'
            : ""
        }
      </div>
      <div class="stack ${activeGroups.length ? "has-groups" : "is-empty"}">
        ${
          activeGroups.length
            ? activeGroups.map((group) => renderGroupRow(group, activeGroups)).join("")
            : `
              <div class="empty-state groups-empty-state">
                <strong>אין קבוצות עדיין</strong>
                <span>צור קבוצה לאנשים שחוזרים איתך לאירועים.</span>
                <button class="primary-button" data-action="new-group" type="button">צור קבוצה ראשונה</button>
              </div>
            `
        }
      </div>
    </section>
  `;
}

function sortFriends(participants) {
  return [...participants].sort((left, right) => {
    const currentOrder =
      Number(right.id === state.currentParticipantId) -
      Number(left.id === state.currentParticipantId);
    return currentOrder || left.displayName.localeCompare(right.displayName, "he");
  });
}

function renderGroupCreate() {
  if (!groupDraft) {
    groupDraft = {
      name: "",
      memberIds: [state.currentParticipantId],
      newMemberName: ""
    };
  }

  return `
    <section class="screen font-hebrew group-workflow-screen" data-screen-kind="group-create">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">קבוצות</p>
          <h1>קבוצה חדשה</h1>
          <p class="muted">מי בדרך כלל יוצא יחד? תמיד אפשר לשנות את ההרכב אחר כך.</p>
        </div>
      </header>
      ${renderNotice()}

      <section class="panel group-create-panel">
        <section class="group-create-section group-create-details" aria-labelledby="group-create-details-title">
          <div class="group-create-section-heading">
            <span class="group-create-section-icon" aria-hidden="true">${iconSvg("edit")}</span>
            <div>
              <h2 id="group-create-details-title">פרטי הקבוצה</h2>
              <p class="muted">שם קצר שיעזור לזהות אותה בפעם הבאה.</p>
            </div>
          </div>
          <label class="field">
            <span>שם הקבוצה</span>
            <input data-action="group-name" name="groupName" autocomplete="off" enterkeyhint="next" value="${escapeAttribute(groupDraft.name)}" placeholder="למשל: החברים מהעבודה…" required />
          </label>
        </section>

        <section class="group-create-section group-create-members" aria-labelledby="group-create-members-title">
          <div class="group-create-section-heading">
            <span class="group-create-section-icon" aria-hidden="true">${iconSvg("users")}</span>
            <div>
              <h2 id="group-create-members-title">חברי הקבוצה</h2>
              <p class="muted">בחר את מי שנמצא בדרך כלל.</p>
            </div>
          </div>
          ${renderParticipantChecks(groupDraft.memberIds, "group-member")}

          <details class="group-editor-disclosure group-editor-offline-add section">
            <summary>
              <span class="group-editor-disclosure-copy">
                <strong>הוסף שם אופליין</strong>
                <small>לאדם שלא משתמש עדיין באפליקציה.</small>
              </span>
              <span class="group-editor-disclosure-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
            </summary>
            <div class="inline-actions group-editor-disclosure-body">
              <input class="guest-input" data-action="group-member-name" name="groupMemberName" autocomplete="off" enterkeyhint="done" aria-label="שם אופליין חדש" placeholder="שם פרטי ושם משפחה" value="${escapeAttribute(groupDraft.newMemberName)}" />
              <button class="secondary-button" data-action="group-add-member" type="button">הוסף לקבוצה</button>
            </div>
          </details>
        </section>

        <div class="group-create-footer">
          <span>
            <strong>לסיום</strong>
            <small>${escapeHtml(formatCount(groupDraft.memberIds.length, "משתתף נבחר", "משתתפים נבחרו"))}</small>
          </span>
          <button class="primary-button" data-action="create-group" ${!groupDraft.name.trim() || groupDraft.memberIds.length === 0 ? "disabled" : ""}>שמור קבוצה</button>
        </div>
      </section>
    </section>
  `;
}

function renderGroupEdit() {
  if (!editingGroupDraft) {
    screen = { name: "groups", tab: "people" };
    return renderGroups();
  }

  return `
    <section class="screen font-hebrew group-workflow-screen" data-screen-kind="group-edit">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">קבוצות</p>
          <h1>עריכת קבוצה</h1>
          <p class="muted">השינוי יחול באירועים חדשים. אירועים קיימים יישארו כמו שהם.</p>
        </div>
      </header>
      ${renderNotice()}
      ${renderEditGroupPanel()}
    </section>
  `;
}

function renderPeople() {
  ensureMergeParticipantsDraft();

  return `
    <section class="screen font-hebrew group-workflow-screen people-management-screen" data-screen-kind="people">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">קבוצות</p>
          <h1>אנשים ושמות</h1>
          <p class="muted">מנקים שמות ישנים ומאחדים כפילויות במקום אחד.</p>
        </div>
      </header>
      ${renderNotice()}
      ${renderMergeParticipantsPanel()}
      ${renderKnownParticipantsPanel()}
    </section>
  `;
}

function renderEditGroupPanel() {
  if (!editingGroupDraft) return "";

  return `
    <section class="panel edit-group-panel">
      <label class="field">
        <span>שם הקבוצה</span>
        <input data-action="edit-group-name" name="editGroupName" autocomplete="off" enterkeyhint="next" value="${escapeAttribute(editingGroupDraft.name)}" />
      </label>

      <section class="section">
        <h3>חברי קבוצה</h3>
        ${renderParticipantChecks(editingGroupDraft.memberIds, "edit-group-member")}
      </section>

      <details class="group-editor-disclosure section">
        <summary>
          <span class="group-editor-disclosure-copy">
            <strong>מנהלים</strong>
            <small>בחר מי יכול לנהל את הקבוצה.</small>
          </span>
          <bdi class="group-editor-disclosure-count">${formatCount(editingGroupDraft.adminIds.length, "מנהל", "מנהלים")}</bdi>
          <span class="group-editor-disclosure-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
        </summary>
        <div class="group-editor-disclosure-body">
          ${renderParticipantChecks(editingGroupDraft.adminIds, "edit-group-admin")}
        </div>
      </details>

      <details class="group-editor-disclosure group-editor-offline-add section">
        <summary>
          <span class="group-editor-disclosure-copy">
            <strong>הוסף שם אופליין</strong>
            <small>לאדם שלא משתמש עדיין באפליקציה.</small>
          </span>
          <span class="group-editor-disclosure-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
        </summary>
        <div class="inline-actions group-editor-disclosure-body">
          <input class="guest-input" data-action="edit-group-member-name" name="editGroupMemberName" autocomplete="off" enterkeyhint="done" aria-label="שם אופליין חדש" placeholder="שם פרטי ושם משפחה" value="${escapeAttribute(editingGroupDraft.newMemberName)}" />
          <button class="secondary-button" data-action="edit-group-add-member">הוסף לקבוצה</button>
        </div>
      </details>

      <div class="actions section">
        <button class="primary-button" data-action="save-edit-group" ${editingGroupDraft.memberIds.length === 0 ? "disabled" : ""}>שמור שינויים</button>
        <button class="secondary-button" data-action="cancel-edit-group">ביטול</button>
      </div>
    </section>
  `;
}

function renderGroupRow(group, peerGroups = []) {
  const memberNames = group.memberIds
    .map((participantId) => participantName(participantId))
    .filter(Boolean);
  const memberPreview = memberNames.slice(0, 3).join(" · ");
  const remainingMemberCount = Math.max(0, memberNames.length - 3);
  const matchingGroup = findMatchingActiveGroup(peerGroups, group, {
    excludeId: group.id
  });

  return `
    <article class="group-row">
      <div class="group-row-copy">
        <strong>${escapeHtml(group.name)}</strong>
        ${renderGroupOpenedAt(group, Boolean(matchingGroup))}
        ${matchingGroup ? `<small class="participant-connection-badge is-duplicate">קבוצה זהה נוספת</small>` : ""}
        <small>${formatCount(group.memberIds.length, "חבר קבוע", "חברים קבועים")}</small>
        ${memberPreview ? `<span class="group-member-preview">${escapeHtml(memberPreview)}${remainingMemberCount ? ` ועוד ${remainingMemberCount}` : ""}</span>` : ""}
      </div>
      <div class="section-title-actions">
        <button class="secondary-button" data-action="edit-group" data-group-id="${group.id}">עריכה</button>
        <button class="secondary-button danger-button group-archive-button" data-action="archive-group" data-group-id="${group.id}" title="ארכב קבוצה" aria-label="ארכב את הקבוצה ${escapeAttribute(group.name)}"></button>
      </div>
    </article>
  `;
}

function renderKnownParticipantsPanel() {
  return `
    <details class="panel section known-participants-panel people-management-disclosure">
      <summary>
        <span class="people-management-disclosure-copy">
          <strong>כל השמות השמורים</strong>
          <small>צפייה והסרה של שמות שלא מופיעים בהוצאות.</small>
        </span>
        <bdi class="people-management-disclosure-count"><span class="font-num">${state.participants.length}</span> ${state.participants.length === 1 ? "שם" : "שמות"}</bdi>
        <span class="people-management-disclosure-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </summary>
      <div class="stack people-management-disclosure-body">
        ${
          state.participants.length
            ? state.participants.map(renderKnownParticipantRow).join("")
            : `<div class="empty-state">עדיין לא נשמרו שמות</div>`
        }
      </div>
    </details>
  `;
}

function renderMergeParticipantsPanel() {
  if (state.participants.length < 2 || !mergeParticipantsDraft) return "";

  const sourceOptions = mergeParticipantSourceCandidates()
    .filter((participant) => participant.id !== mergeParticipantsDraft.targetId)
    .map((participant) => renderParticipantOption(participant, mergeParticipantsDraft.sourceId))
    .join("");
  const targetOptions = mergeParticipantTargetCandidates(mergeParticipantsDraft.sourceId)
    .map((participant) => renderParticipantOption(participant, mergeParticipantsDraft.targetId))
    .join("");
  const disabled =
    !mergeParticipantsDraft.sourceId ||
    !mergeParticipantsDraft.targetId ||
    !canMergeParticipants(
      state,
      mergeParticipantsDraft.sourceId,
      mergeParticipantsDraft.targetId
    );

  return `
    <section class="panel section merge-participants-panel">
      <div class="section-title-row">
        <div>
          <h2>איחוד שם כפול</h2>
          <p class="muted">בוחרים את השם המיותר ואת החשבון שיישאר. האירועים וההוצאות נשמרים.</p>
        </div>
      </div>
      <div class="merge-participants-grid">
        <label class="field">
          <span>השם שיוסר</span>
          <select data-action="merge-source" name="mergeSourceParticipant">${sourceOptions}</select>
        </label>
        <label class="field">
          <span>החשבון שיישאר</span>
          <select data-action="merge-target" name="mergeTargetParticipant">${targetOptions}</select>
        </label>
      </div>
      <button class="primary-button section" data-action="merge-participants" data-allow-offline-mutation="true" ${disabled ? "disabled" : ""}>אחד שמות</button>
    </section>
  `;
}

function renderParticipantOption(participant, selectedId) {
  const identity = participantConnectionStatus(participant);
  const identityLabel = identity.connected && !accountUserIdFromParticipantId(participant.id)
    ? "זהות ישנה לאיחוד"
    : identity.label;
  return `
    <option value="${escapeAttribute(participant.id)}" ${participant.id === selectedId ? "selected" : ""}>
      ${escapeHtml(`${participant.displayName} · ${identityLabel}`)}
    </option>
  `;
}

function renderGroupOpenedAt(group, includeSeconds = false) {
  if (!includeSeconds) return renderOpenedAt(group.createdAt, group.id);

  const date = creationDate(group.createdAt, group.id);
  if (!date) return renderOpenedAt(group.createdAt, group.id);
  const dateLabel = formatRelativeCalendarDate(date);
  const renderedDate = /\d/.test(dateLabel)
    ? `<bdi><span class="font-num">${escapeHtml(dateLabel)}</span></bdi>`
    : `<bdi>${escapeHtml(dateLabel)}</bdi>`;
  return `<time class="opened-at font-hebrew" datetime="${escapeAttribute(date.toISOString())}">נפתח <span class="opened-at-value" dir="ltr">${renderedDate}<span aria-hidden="true"> · </span><span class="font-num">${escapeHtml(formatPreciseClockTime(date))}</span></span></time>`;
}

function renderKnownParticipantRow(participant) {
  const isCurrent = participant.id === state.currentParticipantId;
  const canRemove = canRemoveParticipant(state, participant.id);
  const identity = participantConnectionStatus(participant);
  const helper = isCurrent && identity.connected
    ? "זה החשבון שלך"
    : isCurrent
      ? "זה השם המקומי שלך במכשיר הזה"
    : canRemove
      ? "לא מופיע בהוצאות, אפשר להסיר"
      : "מופיע בהוצאה קיימת";

  return `
    <article class="group-row known-participant-row">
      <div class="known-participant-main">
        ${renderAvatar(participant.id)}
        <span class="known-participant-copy">
          <span class="known-participant-identity">
            <strong>${escapeHtml(participant.displayName)}</strong>
            ${renderParticipantConnectionBadge(participant)}
          </span>
          <small>${helper}</small>
        </span>
      </div>
      <button class="secondary-button danger-button" data-action="remove-participant" data-participant-id="${participant.id}" ${canRemove ? "" : "disabled"}>הסר</button>
    </article>
  `;
}

function eventRowDisplayName(event) {
  const originalName = String(event?.name ?? "").trim();
  const defaultName = eventTypeConfig(event?.eventType).defaultName;
  const parts = originalName.split(" · ");
  const isGeneratedName =
    parts[0] === defaultName &&
    /^\d{2}\.\d{2}$/.test(parts[1] ?? "") &&
    /^\d{2}:\d{2}$/.test(parts[2] ?? "") &&
    (parts.length === 3 || (parts.length === 4 && /^\d+$/.test(parts[3])));

  if (!isGeneratedName) return originalName || defaultName;
  return parts[3] ? `${defaultName} ${parts[3]}` : defaultName;
}

function renderEventRowMeta(event, participants) {
  const date = creationDate(event.createdAt, event.id);
  const statusLabel = eventHomeStatusLabel(event);
  const statusClass =
    statusLabel === "מוסיפים הוצאות"
      ? "is-adding"
      : statusLabel === "מתחשבנים"
        ? "is-settling"
        : "is-paid";
  const participantLabel = formatCount(
    participants.length,
    "משתתף",
    "משתתפים"
  );
  if (!date) {
    return `<span class="event-row-meta"><span class="event-row-state ${statusClass}">${escapeHtml(statusLabel)}</span><span class="event-row-meta-separator" aria-hidden="true">·</span><span>${escapeHtml(participantLabel)}</span></span>`;
  }

  const dateLabel = formatRelativeCalendarDate(date);
  const renderedDate = /\d/.test(dateLabel)
    ? `<bdi><span class="font-num">${escapeHtml(dateLabel)}</span></bdi>`
    : `<bdi>${escapeHtml(dateLabel)}</bdi>`;

  return `
    <span class="event-row-meta">
      <span class="event-row-state ${statusClass}">${escapeHtml(statusLabel)}</span>
      <span class="event-row-meta-separator" aria-hidden="true">·</span>
      <time datetime="${escapeAttribute(date.toISOString())}">${renderedDate}</time>
      <span class="event-row-meta-separator" aria-hidden="true">·</span>
      <time class="event-row-meta-time" datetime="${escapeAttribute(date.toISOString())}" dir="ltr"><span class="font-num">${escapeHtml(formatClockTime(date))}</span></time>
      <span class="event-row-meta-separator" aria-hidden="true">·</span>
      <span>${escapeHtml(participantLabel)}</span>
    </span>
  `;
}

function renderEventRow(event) {
  const participants = activeEventParticipants(event);
  const optionsLabel = `אפשרויות לאירוע ${event.name}: שיתוף או הסרה`;

  return `
    <article
      class="event-row"
      data-event-id="${event.id}"
      data-long-press-event="true"
      aria-haspopup="dialog"
    >
      <button
        class="event-row-open"
        type="button"
        data-action="open-event"
        data-event-id="${event.id}"
      >
        ${renderAvatarStack(participants.map((participant) => participant.id), event, {
          suppressParticipantAction: true
        })}
        <span class="event-row-main">
          <span class="event-row-title">
            <strong>${escapeHtml(eventRowDisplayName(event))}</strong>
          </span>
          ${renderEventRowMeta(event, participants)}
        </span>
      </button>
      <button
        type="button"
        class="event-status-toggle"
        data-action="event-status-select"
        data-event-id="${event.id}"
        aria-haspopup="dialog"
        aria-expanded="${eventStatusMenu?.eventId === event.id ? "true" : "false"}"
        aria-label="${escapeAttribute(optionsLabel)}"
        title="${escapeAttribute(optionsLabel)}"
      >
        <span class="event-row-options-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </button>
      <span class="visually-hidden">לחיצה ארוכה פותחת את אפשרויות האירוע: שיתוף או הסרה.</span>
    </article>
  `;
}

function ensureNewEventDraft() {
  if (!newEventDraft) {
    newEventDraft = {
      name: "",
      eventType: "",
      managementMode: EVENT_MANAGEMENT_COLLABORATIVE,
      roundSettlementTransfers: true,
      directSettlementTransfers: true,
      settlementChoiceOpen: "",
      currency: "ILS",
      groupId: "",
      participantIds: state.currentParticipantId ? [state.currentParticipantId] : [],
      guestName: "",
      participantView: "",
      inviteAfterCreate: false
    };
  }
}

function eventCreationTypeOptions() {
  return eventTypeOptions().filter(
    (type) => NEW_RESTAURANT_EVENTS_ENABLED || type.id !== EVENT_TYPE_RESTAURANT
  );
}

function newEventParticipantSelectionLabel(participantIds) {
  const selectedIds = Array.isArray(participantIds) ? participantIds : [];
  if (
    selectedIds.length === 1 &&
    selectedIds[0] === state.currentParticipantId
  ) {
    return "רק אתה כרגע";
  }
  return formatCount(
    selectedIds.length,
    "משתתף נבחר",
    "משתתפים נבחרו"
  );
}

function renderNewEventType() {
  ensureNewEventDraft();

  return `
    <section class="screen font-hebrew new-event-type-screen" data-screen-kind="new-event" data-event-creation-step="type">
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
          ${eventCreationTypeOptions()
            .map(
              (type, index) => `
                <button
                  type="button"
                  class="event-type-option ${newEventDraft.eventType === type.id ? "is-active" : ""}"
                  data-action="new-event-type"
                  data-event-type="${type.id}"
                  role="radio"
                  aria-checked="${newEventDraft.eventType === type.id}"
                  tabindex="${newEventDraft.eventType === type.id || (!newEventDraft.eventType && index === 0) ? "0" : "-1"}"
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
    <section class="screen font-hebrew new-event-management-screen" data-screen-kind="new-event" data-event-creation-step="management" data-event-type="${escapeAttribute(selectedType.id)}">
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
        <div class="event-management-step-actions">
          <button class="primary-button" type="button" data-action="continue-new-event-management">
            המשך לפרטי האירוע
          </button>
        </div>
      </section>
    </section>
  `;
}

function renderNewEvent() {
  ensureNewEventDraft();
  const selectedType = eventTypeConfig(newEventDraft.eventType);

  return `
    <section class="screen font-hebrew new-event-details-screen" data-screen-kind="new-event" data-event-creation-step="details" data-event-type="${escapeAttribute(selectedType.id)}">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">${escapeHtml(selectedType.label)}</p>
          <h1>${escapeHtml(selectedType.creationTitle || "אירוע חדש")}</h1>
        </div>
      </header>

      ${renderEventCreationProgress("details")}
      ${renderNotice()}

      <section class="panel create-event-panel">
        <div class="section-title-row">
          <div>
            <h2>איך נקרא לאירוע?</h2>
            <p class="muted">אפשר לתת שם, או להמשיך ולקבל שם אוטומטי.</p>
          </div>
        </div>
        <label class="field">
          <span>שם האירוע (לא חובה)</span>
          <input data-action="new-event-name" name="eventName" autocomplete="off" enterkeyhint="next" value="${escapeAttribute(newEventDraft.name)}" placeholder="${escapeAttribute(eventTypeConfig(newEventDraft.eventType).namePlaceholder || EVENT_NAME_PLACEHOLDER)}" />
        </label>
        ${renderNewEventInlinePicker({
          label: "מטבע האירוע",
          valueLabel: currencySelectLabel(newEventDraft.currency),
          action: "new-event-currency-choice",
          selectedValue: newEventDraft.currency,
          options: currencyOptions().map((currency) => ({ value: currency.id, label: currencySelectLabel(currency.id) })),
          hint: "כל ההוצאות וההעברות באירוע יוצגו במטבע הזה."
        })}

        <div class="actions section">
          <button class="primary-button create-event-submit" data-action="open-new-event-settlement">הבא</button>
          <button class="secondary-button" data-action="home">ביטול</button>
        </div>
      </section>
    </section>
  `;
}

function syncNewEventParticipantControls() {
  if (!newEventDraft) return;

  ensureCurrentParticipantInNewEventDraft();

  const selectedIds = new Set(newEventDraft.participantIds);
  app.querySelectorAll('[data-action="new-event-participant"]').forEach((input) => {
    input.checked = selectedIds.has(input.dataset.participantId);
    const membershipStatus = input
      .closest(".participant-pill")
      ?.querySelector("[data-membership-state]");
    if (membershipStatus) {
      membershipStatus.dataset.membershipState = input.checked ? "active" : "inactive";
      const membershipLabel = membershipStatus.querySelector(
        ".participant-membership-label"
      );
      if (membershipLabel) {
        membershipLabel.textContent = input.checked ? "באירוע" : "לא באירוע";
      }
    }
  });

  const count = newEventDraft.participantIds.length;
  const countNode = app.querySelector("[data-new-event-participant-count]");
  if (countNode) {
    countNode.textContent = newEventParticipantSelectionLabel(
      newEventDraft.participantIds
    );
  }

  const createButton = app.querySelector('[data-action="create-event"]');
  if (createButton) createButton.disabled = count === 0;
}

function renderEventCreationProgress(activeStep) {
  const steps = [
    { id: "type", label: "אירוע" },
    { id: "details", label: "פרטים" },
    { id: "settlement", label: "הגדרות חשבון" },
    { id: "participants", label: "משתתפים" }
  ];
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeStep));

  return `
    <ol class="event-creation-progress" aria-label="שלבי יצירת אירוע">
      ${steps
        .map(
          (step, index) => `
            <li class="${index === activeIndex ? "is-active" : index < activeIndex ? "is-complete" : ""}" ${index === activeIndex ? 'aria-current="step"' : ""}>
              <button type="button" data-action="go-new-event-step" data-new-event-step="${step.id}" ${!newEventDraft?.eventType && step.id !== "type" ? "disabled" : ""}>
                <span aria-hidden="true">${index + 1}</span>
                <strong>${step.label}</strong>
              </button>
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
    <section class="screen font-hebrew" data-screen-kind="join-event">
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
            placeholder="https://sogrim-hesbon-app.vercel.app/?event=…"
            ${joinEventDraft.error ? 'aria-invalid="true" aria-describedby="join-event-error"' : ""}
          />
        </label>
        ${joinEventDraft.error ? `<p class="field-error" id="join-event-error" role="alert">${escapeHtml(joinEventDraft.error)}</p>` : ""}
        <div class="actions section">
          <button class="primary-button" data-action="join-existing-event" ${joinEventBusy ? "disabled" : ""}>
            ${joinEventBusy ? "מצטרפים…" : "הצטרף לאירוע"}
          </button>
          <button class="secondary-button" data-action="cancel-join-event" type="button">ביטול וחזרה לבית</button>
        </div>
      </section>
    </section>
  `;
}

function renderEvent(event) {
  rememberRecentEvent(event.id);
  const participants = eventParticipants(event);
  const activeParticipants = activeEventParticipants(event);
  const total = sumMoneyAmounts(event.expenses.map((expense) => expense.total));
  const canEdit = canCurrentParticipantEdit(event);
  const canManage = canCurrentParticipantManage(event);
  const adminNames =
    eventAdminIds(state, event)
      .map((participantId) => participantName(participantId, event))
      .join(", ") || "אין מנהל";
  const isEmptyEvent = event.expenses.length === 0;
  const hasOpenEventOverlay =
    expenseDraft?.eventId === event.id || eventDialog?.eventId === event.id;

  return `
    <section class="screen font-hebrew${isEmptyEvent ? "" : " event-has-action-dock"}" data-screen-kind="event" data-event-id="${escapeAttribute(event.id)}">
      ${renderEventHeader(event, activeParticipants)}
      ${renderNotice()}
      ${renderEventWorkspaceNav(event, "expenses")}
      ${renderEventCover(event)}
      ${isEmptyEvent ? renderEventStartPanel(event) : ""}
      ${isEmptyEvent ? "" : renderEventPersonalBalance(event, participants)}

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
      ${isEmptyEvent || hasOpenEventOverlay ? "" : renderEventActionDock(event, total, canEdit)}

      ${
        event.expenses.length
          ? `
              <section class="section event-expenses-section" id="event-expenses" aria-labelledby="event-expenses-title">
                <div class="event-expenses-heading">
                  <h2 id="event-expenses-title">הוצאות</h2>
                </div>
                <div class="stack expense-ledger${event.expenses.length >= 50 ? " is-long-expense-ledger" : ""}">${renderEventExpenseGroups(event)}</div>
              </section>
            `
          : ""
      }
    </section>
  `;
}

function renderEventHeader(event, participants = activeEventParticipants(event)) {
  const shareLabel = participants.length === 1 ? "הזמנת חברים" : "שיתוף";
  const shareAccessibleLabel = participants.length === 1
    ? "הזמנת חברים לאירוע"
    : "שיתוף והצטרפות לאירוע";
  return `
    <header class="top event-overview-header">
      ${renderAppBackButton()}
      <div class="brand">
        <p class="eyebrow">אירוע</p>
        <h1>${escapeHtml(event.name)}</h1>
        <p class="muted">${escapeHtml(currencySelectLabel(event.currency))} · ${formatCount(participants.length, "משתתף", "משתתפים")}</p>
      </div>
      <div class="hero-actions event-header-actions">
        <button class="secondary-button event-header-utility-button" data-action="open-event-participants" data-event-id="${event.id}" aria-label="משתתפים באירוע" title="משתתפים באירוע"><span class="event-header-action-label">משתתפים</span></button>
        <button class="secondary-button event-header-utility-button" data-action="open-event-participant-add" data-event-id="${event.id}" aria-label="${shareAccessibleLabel}" title="${shareAccessibleLabel}"><span class="button-action-icon" aria-hidden="true">${iconSvg("share")}</span><span class="event-header-action-label">${shareLabel}</span></button>
        <button class="secondary-button event-settings-button event-header-utility-button" data-action="open-event-settings" data-event-id="${event.id}" aria-label="הגדרות האירוע" title="הגדרות האירוע"><span class="event-settings-label event-header-action-label">הגדרות</span></button>
      </div>
    </header>
  `;
}

function renderEventIdentityNotice(event) {
  if (!canCurrentParticipantManage(event)) return "";
  const unresolvedPairs = unresolvedDuplicateParticipantPairs(
    state.participants,
    event
  );
  if (!unresolvedPairs.length) return "";

  const message = unresolvedPairs.length === 1
    ? "שני שמות דומים"
    : `${unresolvedPairs.length} זוגות שמות דומים`;

  return `
    <button
      class="event-identity-notice"
      type="button"
      data-action="review-duplicate-participants"
      data-event-id="${escapeAttribute(event.id)}"
      aria-label="${escapeAttribute(`${message}. פתיחת בדיקה`)}"
    >
      <span class="event-identity-notice-mark" aria-hidden="true">i</span>
      <span>
        <strong>${escapeHtml(message)}</strong>
        <small>כדאי לבדוק אם מדובר באותו אדם.</small>
      </span>
      <span class="event-identity-notice-action">בדיקה</span>
    </button>
  `;
}

function renderEventActionDock(event, total, canEdit) {
  return `
    <aside class="event-action-dock" aria-label="פעולות באירוע">
      <div class="event-action-total">
        <span>סה"כ באירוע</span>
        <strong class="amount"><span class="font-num">${formatEventMoney(event, total)}</span></strong>
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
      ? `מול ${participantName(counterpartIds[0], event)}`
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
        <strong class="amount"><span class="font-num">${formatEventMoney(event, Math.abs(personalBalance))}</span></strong>
        <span>לסיכום <span class="inline-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span></span>
      </span>
    </button>
  `;
}

function renderEventStartPanel(event) {
  const type = eventTypeConfig(event.eventType);
  const participantCount = activeEventParticipants(event).length;
  return renderEventEmptyExpenseState(event, {
    context: "expenses",
    eyebrow: type.label,
    title: "אין עדיין הוצאות",
    description: formatCount(participantCount, "משתתף", "משתתפים"),
    actionLabel: type.actionLabel.replace("מסעדה", "").trim() || "הוסף הוצאה"
  });
}

function renderEventCover(event) {
  if (!event.coverImage) return "";
  return `
    <figure class="event-cover-image">
      <img src="${escapeAttribute(event.coverImage)}" alt="תמונת האירוע ${escapeAttribute(event.name)}" />
      ${canCurrentParticipantManage(event) ? `
        <details class="event-cover-actions-menu" data-event-id="${escapeAttribute(event.id)}">
          <summary class="event-cover-menu-button" aria-label="החלפה או הסרה של תמונת האירוע" title="אפשרויות תמונה">${iconSvg("more")}</summary>
          <div class="event-cover-actions-panel">
            <label class="event-cover-action"><span>מהגלריה</span><input data-action="event-cover-image" data-event-id="${escapeAttribute(event.id)}" type="file" accept="image/*" hidden /></label>
            <label class="event-cover-action"><span>מצלמה</span><input data-action="event-cover-image" data-event-id="${escapeAttribute(event.id)}" type="file" accept="image/*" capture="environment" hidden /></label>
            <button class="event-cover-action is-danger" type="button" data-action="remove-event-cover" data-event-id="${escapeAttribute(event.id)}">הסר תמונה</button>
          </div>
        </details>
      ` : ""}
    </figure>
  `;
}

function renderEventEmptyExpenseState(event, {
  context,
  eyebrow,
  title,
  description,
  actionLabel = "הוסף הוצאה"
}) {
  const titleId = `event-empty-expense-${context}-title`;
  const canReopenFromEmptySummary =
    context === "summary" &&
    isEventClosed(event) &&
    canCurrentParticipantManage(event);
  return `
    <section class="panel event-empty-expense-state event-empty-expense-${escapeAttribute(context)} ${context === "expenses" ? "event-start-panel" : "settlement-hero is-empty"}" ${context === "expenses" ? 'id="event-expenses"' : ""} aria-labelledby="${titleId}">
      <div class="event-empty-expense-copy ${context === "expenses" ? "event-start-copy" : ""}">
        ${eyebrow ? `<span class="event-empty-expense-eyebrow event-type-chip">${escapeHtml(eyebrow)}</span>` : ""}
        <h2 id="${titleId}">${escapeHtml(title)}</h2>
        <p class="muted">${escapeHtml(description)}</p>
      </div>
      <div class="event-empty-expense-actions">
        ${canReopenFromEmptySummary
          ? `<button class="secondary-button settlement-reopen-action" data-action="reopen-event" data-event-id="${escapeAttribute(event.id)}">פתח אירוע מחדש</button>`
          : `<button class="primary-button event-start-primary" data-action="show-expense-form" data-event-id="${escapeAttribute(event.id)}" ${!canCurrentParticipantEdit(event) ? "disabled" : ""}>
              ${renderCommandIcon("expense")}
              <span>${escapeHtml(actionLabel)}</span>
            </button>`}
      </div>
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

function renderEventWorkspaceNav(event, activeView = "expenses") {
  const summaryIsActive = activeView === "summary";
  const notesAreActive = activeView === "notes";
  const expenseTabContent = `
    ${renderCommandIcon("expense")}
    <strong>הוצאות</strong>
  `;
  return `
    <nav class="event-workspace-nav" aria-label="ניווט באירוע" data-active-event-view="${escapeAttribute(activeView)}">
      ${
        summaryIsActive || notesAreActive
          ? `<button type="button" class="event-workspace-tab event-workspace-expenses" data-action="back-to-event" data-event-id="${event.id}">${expenseTabContent}</button>`
          : `<a class="event-workspace-tab event-workspace-expenses is-active" href="#event-expenses" aria-current="page">${expenseTabContent}</a>`
      }
      <button type="button" class="event-workspace-tab event-workspace-summary${summaryIsActive ? " is-active" : ""}"
        data-action="settle"
        data-event-id="${event.id}"
        ${summaryIsActive ? 'aria-current="page"' : ""}
        aria-label="${summaryIsActive ? "סיכום, המסך הנוכחי" : "פתיחת הסיכום: מי מעביר למי"}"
      >
        ${renderCommandIcon("summary")}
        <strong>סיכום</strong>
      </button>
      <button type="button" class="event-workspace-tab event-workspace-notes${notesAreActive ? " is-active" : ""}"
        data-action="open-event-notes"
        data-event-id="${event.id}"
        ${notesAreActive ? 'aria-current="page"' : ""}
        aria-label="${notesAreActive ? "פתקים, המסך הנוכחי" : "פתיחת פתקים משותפים"}"
      >
        <span class="command-card-icon" aria-hidden="true">${iconSvg("message")}</span>
        <strong>פתקים</strong>
      </button>
    </nav>
  `;
}

function renderEventInsightPanel(event, insights) {
  return renderEventInsightPanelContent(event, insights);
}

function renderEventNotes(event) {
  rememberRecentEvent(event.id);
  const notes = [...(event.notes ?? [])].sort((first, second) => {
    const pinnedDifference = Number(second.pinned === true) - Number(first.pinned === true);
    if (pinnedDifference) return pinnedDifference;
    const timeDifference = Date.parse(second.updatedAt) - Date.parse(first.updatedAt);
    return (Number.isFinite(timeDifference) ? timeDifference : 0) ||
      String(first.id).localeCompare(String(second.id));
  });
  const pinnedNotes = notes.filter((note) => note.pinned === true);
  const otherNotes = notes.filter((note) => note.pinned !== true);
  const canEdit = canCurrentParticipantEdit(event);

  return `
    <section class="screen font-hebrew event-notes-screen" data-screen-kind="event-notes" data-event-id="${escapeAttribute(event.id)}">
      ${renderEventHeader(event, activeEventParticipants(event))}
      ${renderNotice()}
      ${renderEventWorkspaceNav(event, "notes")}
      <section class="panel event-notes-intro" aria-labelledby="event-notes-title">
        <div>
          <p class="eyebrow">פתקים משותפים</p>
          <h2 id="event-notes-title">כל מה שחשוב לאירוע, במקום אחד</h2>
          <p class="muted">כל משתתף באירוע רואה את העדכונים.</p>
        </div>
        <button class="primary-button" type="button" data-action="new-event-note" data-event-id="${escapeAttribute(event.id)}" ${canEdit ? "" : "disabled"}>
          <span aria-hidden="true">${iconSvg("edit")}</span>
          <span>${canEdit ? "פתק חדש" : "האירוע סגור"}</span>
        </button>
      </section>
      <section class="event-notes-content" aria-labelledby="event-notes-list-title">
        <h2 class="visually-hidden" id="event-notes-list-title">הפתקים באירוע</h2>
        ${notes.length
          ? `${renderEventNotesSection(event, pinnedNotes, "מוצמד", true)}${renderEventNotesSection(event, otherNotes, pinnedNotes.length ? "" : "פתקים", false)}`
          : renderEventNotesEmptyState(event, canEdit)}
      </section>

      ${eventDialog?.eventId === event.id ? renderEventDialog(event) : ""}
    </section>
  `;
}

function renderEventNotesSection(event, notes, label, pinnedSection) {
  if (!notes.length) return "";
  const sectionLabel = label || "פתקים";
  return `
    <section class="event-notes-section${pinnedSection ? " is-pinned" : ""}" aria-label="${escapeAttribute(sectionLabel)}">
      ${label ? `<div class="event-notes-section-label">
        ${pinnedSection ? `<span aria-hidden="true">${iconSvg("pin")}</span>` : ""}
        <strong>${escapeHtml(label)}</strong>
      </div>` : ""}
      <div class="event-notes-list">
        ${notes.map((note) => renderEventNoteRow(event, note)).join("")}
      </div>
    </section>
  `;
}

function renderEventNoteRow(event, note) {
  const title = String(note.title ?? "").trim() || "פתק ללא כותרת";
  const body = String(note.body ?? "").trim();
  const participantIds = [
    ...new Set([note.createdByParticipantId, note.updatedByParticipantId].filter(Boolean))
  ];
  const updatedBy = participantName(note.updatedByParticipantId, event);
  const updatedLabel = formatEventNoteUpdatedAt(note.updatedAt);

  return `
    <article class="event-note-row${note.pinned === true ? " is-pinned" : ""}" data-note-id="${escapeAttribute(note.id)}">
      <button class="event-note-open" type="button" data-action="open-event-note" data-event-id="${escapeAttribute(event.id)}" data-note-id="${escapeAttribute(note.id)}" aria-label="פתיחת הפתק ${escapeAttribute(title)}">
        <span class="event-note-copy">
          <span class="event-note-title-line">
            <strong>${escapeHtml(title)}</strong>
            ${note.pinned === true ? `<span class="event-note-pin" aria-label="פתק מוצמד">${iconSvg("pin")}</span>` : ""}
          </span>
          ${body ? `<span class="event-note-preview">${escapeHtml(body)}</span>` : ""}
          <small>${escapeHtml(updatedBy)} · ${escapeHtml(updatedLabel)}</small>
        </span>
      </button>
      <span class="event-note-avatars">${renderAvatarStack(participantIds, event)}</span>
      <button class="event-note-chevron" type="button" data-action="open-event-note" data-event-id="${escapeAttribute(event.id)}" data-note-id="${escapeAttribute(note.id)}" aria-label="פתיחת הפתק ${escapeAttribute(title)}">${iconSvg("chevron-left")}</button>
    </article>
  `;
}

function renderEventNotesEmptyState(event, canEdit) {
  return `
    <section class="panel event-notes-empty">
      <span class="event-notes-empty-icon" aria-hidden="true">${iconSvg("message")}</span>
      <h2>עוד אין פתקים משותפים</h2>
      <p>אפשר לשמור כאן פרטי טיסה, רשימת ציוד, כתובות וכל דבר שחשוב לכל משתתפי האירוע.</p>
      <button class="primary-button" type="button" data-action="new-event-note" data-event-id="${escapeAttribute(event.id)}" ${canEdit ? "" : "disabled"}>
        ${canEdit ? "כתבו את הפתק הראשון" : "האירוע סגור"}
      </button>
    </section>
  `;
}

function formatEventNoteUpdatedAt(value, now = Date.now()) {
  const updatedAt = Date.parse(value);
  if (!Number.isFinite(updatedAt)) return "עודכן לאחרונה";
  const elapsedMinutes = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  if (elapsedMinutes < 1) return "עודכן עכשיו";
  if (elapsedMinutes < 60) return `עודכן לפני ${elapsedMinutes} ${elapsedMinutes === 1 ? "דקה" : "דקות"}`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `עודכן לפני ${elapsedHours} ${elapsedHours === 1 ? "שעה" : "שעות"}`;
  return `עודכן ${formatRelativeCalendarDate(value)}`;
}

function renderEventInsightPanelContent(event, insights) {
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
        <div><span>פתוח להעברה</span><strong class="amount"><span class="font-num">${formatEventMoney(event, insights.pendingTotal)}</span></strong></div>
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
  edit: iconSvg("edit"),
  expense: iconSvg("receipt"),
  participants: iconSvg("users"),
  profile: iconSvg("user"),
  share: iconSvg("share"),
  link: iconSvg("link"),
  settings: iconSvg("sliders"),
  settle: iconSvg("balance"),
  summary: iconSvg("transfers"),
  danger: iconSvg("trash")
};

function renderCommandIcon(iconName) {
  return `<span class="command-card-icon" aria-hidden="true">${commandIconSvgs[iconName] ?? ""}</span>`;
}

function renderEventDialog(event) {
  if (!eventDialog || eventDialog.eventId !== event.id) return "";

  if (eventDialog.kind === "participants") return renderEventParticipantsDialog(event);
  if (eventDialog.kind === "participants-add") {
    return renderEventParticipantAddDialog(event);
  }
  if (eventDialog.kind === "participant-rename") {
    return renderEventOfflineParticipantRenameDialog(event);
  }
  if (eventDialog.kind === "participant-identities") {
    return renderEventParticipantIdentityDialog(event);
  }
  if (eventDialog.kind === "participant-profile") {
    return renderEventParticipantProfileDialog(event);
  }
  if (eventDialog.kind === "participant-report") {
    return renderEventParticipantReportDialog(event);
  }
  if (eventDialog.kind === "participant-link") {
    return renderEventParticipantLinkDialog(event);
  }
  if (eventDialog.kind === "note-editor") return renderEventNoteDialog(event);
  if (eventDialog.kind === "share") return renderEventShareDialog(event);
  if (eventDialog.kind === "settings") return renderEventSettingsDialog(event);
  if (eventDialog.kind === "settings-management") {
    return renderEventSettingsManagementDialog(event);
  }
  if (eventDialog.kind === "settings-currency") {
    return renderEventSettingsCurrencyDialog(event);
  }
  if (eventDialog.kind === "settings-repayment") {
    return renderEventSettingsRepaymentDialog(event);
  }
  if (eventDialog.kind === "settings-rounding") {
    return renderEventSettingsRoundingDialog(event);
  }
  if (eventDialog.kind === "settings-activity") {
    return renderEventSettingsActivityDialog(event);
  }
  if (eventDialog.kind === "settings-lock") return renderEventSettingsLockDialog(event);
  if (eventDialog.kind === "settings-danger") {
    return renderEventSettingsDangerDialog(event);
  }

  return "";
}

function renderSettlementCelebration() {
  if (!settlementCelebration) return "";

  const event = getEvent(settlementCelebration.eventId);
  const allTransfersPaid = Boolean(
    event?.transfers?.length &&
      event.transfers.every((transfer) => transfer.status === "paid")
  );
  if (!event || !allTransfersPaid) return "";

  const isClosed = isEventClosed(event);
  const confetti = Array.from(
    { length: 12 },
    (_, index) => `<span class="settlement-confetti-piece is-piece-${index + 1}" aria-hidden="true"></span>`
  ).join("");

  return `
    <section class="settlement-celebration-backdrop" aria-label="כל ההעברות הושלמו">
      <section
        class="settlement-celebration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settlement-celebration-title"
        aria-describedby="settlement-celebration-description"
        data-event-id="${escapeAttribute(event.id)}"
        tabindex="-1"
      >
        <div class="settlement-confetti" aria-hidden="true">${confetti}</div>
        <span class="settlement-celebration-mark" aria-hidden="true">✓</span>
        <span class="settlement-celebration-eyebrow">הכול נסגר</span>
        <h2 id="settlement-celebration-title">כל ההעברות הושלמו</h2>
        <p id="settlement-celebration-description">
          ${isClosed
            ? `החשבון של "${escapeHtml(event.name)}" שולם ונשאר ברשימת האירועים שלך.`
            : `החשבון של "${escapeHtml(event.name)}" מאוזן. אפשר לסגור אותו; המעבר לארכיון תמיד ידני.`}
        </p>
        <div class="settlement-celebration-actions">
          <button
            class="primary-button"
            type="button"
            data-action="archive-settled-event"
            data-event-id="${escapeAttribute(event.id)}"
          >${isClosed ? "חזרה לאירועים" : "סגור חשבון"}</button>
          <button
            class="secondary-button"
            type="button"
            data-action="dismiss-settlement-celebration"
          >הישאר בסיכום</button>
        </div>
      </section>
    </section>
  `;
}

function renderEventStatusMenu() {
  if (!eventStatusMenu) return "";

  const event = getEvent(eventStatusMenu.eventId);
  if (!event) return "";

  const canShare = canCurrentParticipantEdit(event) && !isEventClosed(event);
  const removesForEveryone = canCurrentParticipantManage(event);
  const canRemove = removesForEveryone ||
    canLeaveEvent(state, event.id, state.currentParticipantId);
  const removalDescription = removesForEveryone
    ? "מחיקה לכל המשתתפים, לאחר אישור נוסף"
    : canRemove
      ? "הסרה מהאירועים שלי, לאחר אישור נוסף"
      : "מנהל יחיד צריך להעביר ניהול לפני עזיבה";
  const shareDescription = canShare
    ? "קישור או QR, בחירה מחברים או הוספת שם ידנית"
    : isEventClosed(event)
      ? "כדי להזמין משתתפים צריך לפתוח את האירוע מחדש"
      : "רק מנהל יכול להזמין משתתפים במצב הנוכחי";
  const isPersonallyArchived = isEventPersonallyArchived(event.id);

  return `
    <section class="event-status-menu-backdrop" aria-label="אפשרויות לאירוע ${escapeAttribute(event.name)}">
      <section
        class="event-status-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-status-menu-title"
        aria-describedby="event-status-menu-description"
        data-event-id="${escapeAttribute(event.id)}"
        tabindex="-1"
      >
        <span class="event-status-menu-handle" aria-hidden="true"></span>
        <div class="event-status-menu-copy">
          <span class="event-status-menu-label">אפשרויות אירוע</span>
          <h2 id="event-status-menu-title">${escapeHtml(event.name)}</h2>
          <p id="event-status-menu-description">בחרו פעולה לאירוע.</p>
        </div>
        <div class="event-home-menu-actions" aria-label="פעולות לאירוע">
          <button
            class="event-share-option"
            type="button"
            data-action="share-event-from-list"
            data-event-id="${escapeAttribute(event.id)}"
            ${canShare ? "" : 'disabled aria-disabled="true"'}
          >
            ${renderCommandIcon("share")}
            <span>
              <strong>שיתוף</strong>
              <small>${escapeHtml(shareDescription)}</small>
            </span>
            <span class="event-share-route-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
          </button>
          <button
            class="event-share-option"
            type="button"
            data-action="toggle-personal-event-archive"
            data-event-id="${escapeAttribute(event.id)}"
          >
            ${renderCommandIcon("archive")}
            <span>
              <strong>${isPersonallyArchived ? "החזר לאירועים" : "העבר לארכיון"}</strong>
              <small>${isPersonallyArchived ? "האירוע יחזור לרשימה שלך בלבד" : "האירוע יעבור לארכיון רק אצלך"}</small>
            </span>
            <span class="event-share-route-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
          </button>
        </div>
        <div class="event-status-danger-zone">
          <button
            class="event-removal-option"
            type="button"
            data-action="remove-event-from-list"
            data-event-id="${escapeAttribute(event.id)}"
            ${canRemove ? "" : "disabled"}
          >
            ${renderCommandIcon("danger")}
            <span>
              <strong>הסר אירוע</strong>
              <small>${escapeHtml(removalDescription)}</small>
            </span>
            <span class="event-share-route-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
          </button>
        </div>
        <button class="secondary-button event-status-menu-cancel" type="button" data-action="cancel-event-status-menu">ביטול</button>
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
          <span class="important-action-label">${escapeHtml(importantActionDialog.label ?? "פעולה חשובה")}</span>
          <h2 id="important-action-title">${escapeHtml(importantActionDialog.title)}</h2>
          <p id="important-action-description">${escapeHtml(importantActionDialog.description)}</p>
          ${
            importantActionDialog.metrics?.length
              ? `<dl class="important-action-impact" aria-label="השפעת הפעולה">
                  ${importantActionDialog.metrics
                    .map(
                      (metric) => `
                        <div>
                          <dt>${escapeHtml(metric.label)}</dt>
                          <dd><span class="font-num">${escapeHtml(metric.value)}</span></dd>
                        </div>
                      `
                    )
                    .join("")}
                </dl>`
              : ""
          }
          ${
            importantActionDialog.kind === "reopen-event"
              ? renderReopenPaymentOptions(importantActionDialog)
              : ""
          }
        </div>
        <div class="important-action-dialog-actions ${importantActionDialog.alternateLabel ? "has-alternate" : ""}">
          <button class="secondary-button" type="button" data-action="cancel-important-action">ביטול</button>
          ${
            importantActionDialog.alternateLabel
              ? `<button
                  class="secondary-button important-action-alternate-button"
                  type="button"
                  data-action="confirm-important-action-alternate"
                  ${importantActionDialog.alternateDisabled ? "disabled" : ""}
                  ${importantActionDialog.alternateDescription ? `title="${escapeAttribute(importantActionDialog.alternateDescription)}"` : ""}
                >${escapeHtml(importantActionDialog.alternateLabel)}</button>`
              : ""
          }
          <button
            class="important-action-confirm-button"
            type="button"
            data-action="confirm-important-action"
            ${importantActionDialog.kind === "merge-participants" ? 'data-allow-offline-mutation="true"' : ""}
          >
            ${escapeHtml(importantActionDialog.confirmLabel)}
          </button>
        </div>
      </section>
    </section>
  `;
}

function renderEventDialogShell({
  eyebrow,
  title,
  description,
  body,
  backAction = "",
  backLabel = "חזרה להגדרות",
  backdropClass = "",
  modalClass = "",
  routeMode = false,
  showClose = true,
  settingsMode = false
}) {
  return `
    <section
      class="event-modal-backdrop ${escapeAttribute(backdropClass)}"
      ${routeMode ? "" : `aria-label="${escapeAttribute(title)}"`}
      ${routeMode ? 'data-event-route-dialog="true"' : ""}
    >
      <section
        class="panel event-modal ${escapeAttribute(modalClass)}"
        role="${routeMode ? "region" : "dialog"}"
        ${routeMode ? "" : 'aria-modal="true"'}
        aria-labelledby="event-modal-title"
        ${description ? 'aria-describedby="event-modal-description"' : ""}
        tabindex="-1"
      >
        <div class="event-modal-header">
          <div>
            ${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
            <h2 id="event-modal-title">${escapeHtml(title)}</h2>
            ${description ? `<p class="muted" id="event-modal-description">${escapeHtml(description)}</p>` : ""}
          </div>
          <div class="event-modal-header-actions">
            ${
              settingsMode || routeMode
                ? `<button class="accessibility-entry-button accessibility-entry-header event-settings-accessibility-button" data-open-accessibility type="button" aria-label="פתיחת הגדרות נגישות" title="נגישות"><span aria-hidden="true">${iconSvg("accessibility")}</span></button>`
                : ""
            }
            ${
              backAction
                ? `<button class="icon-button modal-section-back-button" data-action="${backAction}" aria-label="${escapeAttribute(backLabel)}" title="${escapeAttribute(backLabel)}"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>`
                : ""
            }
            ${
              showClose
                ? `<button class="icon-button modal-back-button modal-close-button" data-action="close-event-dialog" aria-label="סגירת החלון" title="סגירת החלון"><span class="modal-control-icon" aria-hidden="true">${iconSvg("x")}</span></button>`
                : ""
            }
          </div>
        </div>
        ${
          routeMode
            ? `<div class="event-route-sync-status" data-route-sync-status hidden role="status" aria-live="polite">
                <span data-inline-sync-status hidden></span>
                <button type="button" data-inline-sync-retry data-sync-retry hidden>נסה שוב</button>
              </div>`
            : ""
        }
        <div class="event-modal-body">
          ${body}
        </div>
      </section>
      ${routeMode ? renderEventRoutePrimaryNav() : ""}
    </section>
  `;
}

function renderEventRoutePrimaryNav() {
  return renderPrimaryNavigation("event-route-primary-nav");
}

function renderNewEventSettlement() {
  ensureNewEventDraft();
  return `
    <section class="screen font-hebrew new-event-settlement-screen" data-screen-kind="new-event" data-event-creation-step="settlement">
      <header class="top">${renderAppBackButton()}<div class="brand"><p class="eyebrow">אירוע חדש</p><h1>איך סוגרים את החשבון?</h1></div></header>
      ${renderEventCreationProgress("settlement")}
      <section class="panel create-event-panel new-event-settlement-panel">
        ${renderNewEventInlinePicker({ label: "עיגול סכומים", valueLabel: newEventDraft.roundSettlementTransfers ? "סכומים נוחים (מומלץ)" : "דיוק מלא עד האגורה", action: "new-event-rounding-choice", selectedValue: newEventDraft.roundSettlementTransfers ? "rounded" : "exact", options: [{ value: "rounded", label: "סכומים נוחים (מומלץ)" }, { value: "exact", label: "דיוק מלא עד האגורה" }], hint: "משפיע רק על ההעברות הסופיות, לא על ההוצאות." })}
        ${renderNewEventInlinePicker({ label: "חלוקת החזרים", valueLabel: newEventDraft.directSettlementTransfers ? "החזר לפי מי ששילם" : "קיזוז חכם (מומלץ) — פחות העברות", action: "new-event-repayment-choice", selectedValue: newEventDraft.directSettlementTransfers ? "direct" : "optimized", options: [{ value: "direct", label: "החזר לפי מי ששילם" }, { value: "optimized", label: "קיזוז חכם (מומלץ) — פחות העברות" }], hint: "אפשר לשנות גם אחר כך בהגדרות האירוע." })}
        <div class="actions section"><button class="primary-button" data-action="open-new-event-participants">המשך למשתתפים</button></div>
      </section>
    </section>`;
}

function renderNewEventInlinePicker({ label, valueLabel, action, selectedValue, options, hint }) {
  return `<div class="field new-event-inline-picker"><span>${escapeHtml(label)}</span><details><summary><span>${escapeHtml(valueLabel)}</span><span class="new-event-inline-picker-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span></summary><div class="new-event-inline-picker-menu">${options.map((option) => `<button type="button" class="${option.value === selectedValue ? "is-selected" : ""}" data-action="${action}" data-choice-value="${escapeAttribute(option.value)}" aria-pressed="${option.value === selectedValue}"><span>${escapeHtml(option.label)}</span>${option.value === selectedValue ? `<span aria-hidden="true">${iconSvg("check")}</span>` : ""}</button>`).join("")}</div></details><small>${escapeHtml(hint)}</small></div>`;
}

function closeNewEventInlinePicker(target) {
  const details = target.closest("details");
  if (details instanceof HTMLDetailsElement) details.open = false;
}

function restoreNewEventInlinePickerFocus(action) {
  requestAnimationFrame(() => {
    app
      .querySelector(`[data-action="${CSS.escape(action)}"]`)
      ?.closest("details")
      ?.querySelector("summary")
      ?.focus({ preventScroll: true });
  });
}

function renderNewEventSettlementOption({ action, value, selected, title, description }) {
  return `
    <button type="button" class="event-management-option ${selected ? "is-active" : ""}" data-action="${action}" data-choice-value="${value}" role="radio" aria-checked="${selected}">
      <span class="event-management-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span>
      <span class="event-management-check app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
    </button>
  `;
}

function renderEventParticipantsDialog(event) {
  const canEdit = canCurrentParticipantEdit(event);
  const currentParticipants = activeEventParticipants(event).sort((left, right) =>
    compareEventParticipantRoster(left, right, event)
  );
  const inactiveParticipants = eventParticipants(event)
    .filter((participant) => isEventParticipantInactive(event, participant.id))
    .sort((left, right) => compareEventParticipantRoster(left, right, event));
  const participantMessage =
    eventDialog?.eventId === event.id &&
    eventDialog?.kind === "participants"
      ? eventDialog.message
      : "";

  return renderEventDialogShell({
    eyebrow: "",
    title: "מי באירוע",
    description: event.name,
    backdropClass: "event-participant-route-backdrop",
    modalClass: "event-participant-route-modal event-participant-roster-modal",
    routeMode: true,
    backAction: "event-participants-back",
    backLabel: "חזרה לאירוע",
    showClose: false,
    body: `
      ${
        participantMessage
          ? `<p class="event-participant-notice" role="status">${escapeHtml(participantMessage)}</p>`
          : ""
      }
      ${renderEventIdentityNotice(event)}
      ${renderCurrentEventParticipants(event, currentParticipants, canEdit)}
      <div class="event-participant-primary-actions">
        <button
          class="primary-button event-participant-add-launch"
          type="button"
          data-action="open-event-participant-add"
          data-event-id="${escapeAttribute(event.id)}"
          ${canEdit ? "" : "disabled"}
        >
          ${renderCommandIcon("participants")}
          <span>הוסף משתתפים</span>
        </button>
      </div>
      ${renderInactiveEventParticipants(event, inactiveParticipants, canEdit)}
    `
  });
}

function renderEventParticipantAddDialog(event) {
  const canEdit = canCurrentParticipantEdit(event);
  const currentParticipantIds = new Set(event.participantIds);
  const seenOfflineNames = new Set();
  const availableParticipants = state.participants
    .filter(participantCandidateFilter(event.participantIds, "event-participant"))
    .filter((participant) => !currentParticipantIds.has(participant.id))
    .filter((participant) => {
      if (participantConnectionStatus(participant).connected) return true;
      const normalizedName = normalizeParticipantDisplayName(participant.displayName);
      if (!normalizedName || seenOfflineNames.has(normalizedName)) return false;
      seenOfflineNames.add(normalizedName);
      return true;
    })
    .sort((left, right) => compareEventParticipantRoster(left, right, event));
  const participantMessage =
    eventDialog?.eventId === event.id &&
    eventDialog?.kind === "participants-add"
      ? eventDialog.message
      : "";
  const participantView = ["friends", "manual"].includes(eventDialog?.participantView)
    ? eventDialog.participantView
    : "";
  const routeTitle = participantView === "friends"
    ? "בחר מחברים"
    : participantView === "manual"
      ? "הוסף שם ידנית"
      : "מי מצטרף לאירוע?";

  return renderEventDialogShell({
    eyebrow: "",
    title: routeTitle,
    description: "",
    backdropClass: "event-participant-route-backdrop",
    modalClass: "event-participant-route-modal event-participant-add-route-modal",
    routeMode: true,
    backAction: participantView
      ? "event-participant-add-view-back"
      : "event-participants-back",
    backLabel: participantView
      ? "חזרה לדרכי ההוספה"
      : eventDialog?.returnKind === "home"
        ? "חזרה לאירועים"
        : "חזרה למשתתפים",
    showClose: false,
    body: `
      <div class="event-participant-add-screen" data-participant-add-view>
        ${
          participantMessage
            ? `<p class="event-participant-notice" role="status">${escapeHtml(participantMessage)}</p>`
            : ""
        }
        ${participantView
          ? renderEventParticipantAddEditor(event, availableParticipants, canEdit, participantView)
          : renderEventParticipantAddRoutes(event, availableParticipants, canEdit)}
      </div>
    `
  });
}

function renderEventOfflineParticipantRenameDialog(event) {
  const participant = state.participants.find(
    (item) => item.id === eventDialog?.participantId
  );
  if (!participant || participantHasConnectedAccount(participant)) {
    return renderEventParticipantsDialog(event);
  }

  const canEdit = canCurrentParticipantEdit(event);
  const nameDraft = eventDialog?.offlineNameDraft ?? participant.displayName;
  const error = eventDialog?.error ?? "";

  return renderEventDialogShell({
    eyebrow: "משתתפים",
    title: "עריכת שם אופליין",
    description: "השם יתעדכן בכל מקום שבו האדם הזה מופיע. ההוצאות שלו יישארו ללא שינוי.",
    backAction: "event-participant-rename-back",
    backLabel: "חזרה למשתתפים",
    body: `
      <section class="event-participant-rename-card">
        <div class="event-participant-rename-person">
          ${renderAvatar(participant.id, event)}
          <div>
            <strong>${escapeHtml(participant.displayName)}</strong>
            <small>שם אופליין</small>
          </div>
        </div>
        <label class="field event-participant-rename-field">
          <span>שם חדש</span>
          <input
            type="text"
            name="offlineParticipantName"
            maxlength="48"
            autocomplete="off"
            enterkeyhint="done"
            data-action="event-offline-participant-rename"
            data-event-id="${escapeAttribute(event.id)}"
            data-participant-id="${escapeAttribute(participant.id)}"
            value="${escapeAttribute(nameDraft)}"
            aria-describedby="event-participant-rename-note"
            ${canEdit ? "" : "disabled"}
          />
          <small id="event-participant-rename-note">אותו אדם, אותו חישוב - רק השם משתנה.</small>
        </label>
        ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ""}
        <div class="event-modal-actions event-participant-rename-actions">
          <button class="secondary-button" type="button" data-action="event-participant-rename-back">ביטול</button>
          <button
            class="primary-button"
            type="button"
            data-action="save-offline-participant-name"
            data-event-id="${escapeAttribute(event.id)}"
            data-participant-id="${escapeAttribute(participant.id)}"
            ${canEdit ? "" : "disabled"}
          >שמור שם</button>
        </div>
      </section>
    `
  });
}

function renderEventParticipantProfileDialog(event) {
  const participant = state.participants.find(
    (item) => item.id === eventDialog?.participantId
  );
  if (
    !participant ||
    !event.participantIds.includes(participant.id) ||
    isEventParticipantInactive(event, participant.id)
  ) {
    return renderEventParticipantsDialog(event);
  }

  return participantConnectionStatus(participant).connected
    ? renderConnectedEventParticipantProfile(event, participant)
    : renderOfflineEventParticipantProfile(event, participant);
}

function renderConnectedEventParticipantProfile(event, participant) {
  const targetUserId = accountUserIdFromParticipantId(participant.id);
  if (!targetUserId) return renderEventParticipantsDialog(event);

  const isCurrentParticipant = participant.id === state.currentParticipantId;
  const friendship = isCurrentParticipant
    ? null
    : eventParticipantFriendshipState(participant);
  const message = eventDialog?.message ?? "";
  const busy = friendNetworkBusyAction === `event-friend:${participant.id}`;
  const sharedEventReady = Boolean(event[EVENT_SPACE_ID_FIELD]);
  const canRequest = friendship && ["available", "incoming"].includes(friendship.kind);
  const actionLabel = friendship?.kind === "incoming"
    ? "אשר חברות"
    : "הוסף כחבר";
  const canEdit = canCurrentParticipantEdit(event);
  const canChangeMembership = canCurrentParticipantChangeEventMembership(
    event,
    participant.id
  );
  const targetName = participantName(participant.id, event);

  return renderEventDialogShell({
    eyebrow: "משתתף באירוע",
    title: "ניהול משתתף",
    description: event.name,
    backdropClass: "event-participant-route-backdrop",
    modalClass: "event-participant-route-modal event-participant-detail-modal event-participant-management-modal",
    routeMode: true,
    backAction: "event-participants-back",
    backLabel: "חזרה למשתתפים",
    showClose: false,
    body: `
      <section
        class="event-participant-detail event-participant-management is-account"
        data-participant-detail-view="account"
        data-participant-id="${escapeAttribute(participant.id)}"
      >
        <header class="event-participant-management-identity">
          ${renderAvatar(participant.id, event)}
          <div>
            <strong>${escapeHtml(targetName)}</strong>
            ${renderParticipantUsername(participant)}
            ${renderParticipantConnectionBadge(participant)}
          </div>
        </header>
        ${
          message
            ? `<p class="event-participant-notice" role="status">${escapeHtml(message)}</p>`
            : ""
        }
        <div class="event-participant-management-list">
          ${renderEventParticipantAdminControl(event, participant)}
          ${
            !isCurrentParticipant && friendship
              ? `<div class="event-participant-management-row is-friendship">
                  <span class="event-participant-management-icon" aria-hidden="true">${commandIconSvgs.participants}</span>
                  <span class="event-participant-management-copy">
                    <strong>חברות</strong>
                    <small>${canRequest && !sharedEventReady ? "אפשר להציע חברות אחרי שהאירוע יסיים להסתנכרן" : "הישארו בקשר גם אחרי האירוע"}</small>
                  </span>
                  ${renderRelationshipFriendshipControl({
                    friendship,
                    event,
                    participant,
                    busy,
                    sharedEventReady,
                    actionLabel
                  })}
                </div>`
              : ""
          }
          ${
            canChangeMembership && !isCurrentParticipant
              ? renderEventParticipantRemovalRow(event, participant)
              : ""
          }
        </div>
      </section>
    `
  });
}

function renderEventParticipantAdminControl(event, participant) {
  const adminIds = eventAdminIds(state, event);
  const isAdmin = adminIds.includes(participant.id);
  const canManage = canCurrentParticipantManage(event);
  const canDisable = !isAdmin || adminIds.length > 1;
  const enabled =
    canManage &&
    participantConnectionStatus(participant).connected &&
    canDisable;
  const description = !canDisable
      ? "חייב להישאר לפחות מנהל אחד"
      : "יכול לערוך הוצאות ומשתתפים";

  return `
    <label class="event-participant-management-row is-admin-control">
      <span class="event-participant-management-icon" aria-hidden="true">${commandIconSvgs.profile}</span>
      <span class="event-participant-management-copy">
        <strong>מנהל אירוע</strong>
        <small>${escapeHtml(description)}</small>
      </span>
      <input
        class="event-participant-admin-toggle"
        type="checkbox"
        role="switch"
        data-action="toggle-event-participant-admin"
        data-event-id="${escapeAttribute(event.id)}"
        data-participant-id="${escapeAttribute(participant.id)}"
        ${isAdmin ? "checked" : ""}
        ${enabled ? "" : "disabled"}
        aria-label="${isAdmin ? "הסרת" : "הוספת"} הרשאת מנהל עבור ${escapeAttribute(participantName(participant.id, event))}"
      />
    </label>
  `;
}

function renderEventParticipantRemovalRow(event, participant) {
  return `
    <button
      class="event-participant-management-row is-danger"
      type="button"
      data-action="remove-event-participant"
      data-event-id="${escapeAttribute(event.id)}"
      data-participant-id="${escapeAttribute(participant.id)}"
    >
      <span class="event-participant-management-icon" aria-hidden="true">${iconSvg("user-minus")}</span>
      <span class="event-participant-management-copy">
        <strong>הסר מהאירוע</strong>
        <small>ההיסטוריה הכספית תישמר</small>
      </span>
    </button>
  `;
}

function renderParticipantSafetyPanel(event, participant) {
  const targetUserId = accountUserIdFromParticipantId(participant?.id);
  if (!targetUserId) return "";
  const blocked = isConnectedUserBlocked(targetUserId);
  const busy = friendNetworkBusyAction === `user-safety:${targetUserId}`;
  const canReport = Boolean(event?.[EVENT_SPACE_ID_FIELD]);

  return `
    <details class="relationship-event-management relationship-safety-management">
      <summary>בטיחות ופרטיות</summary>
      <div class="relationship-safety-copy">
        <p>${
          blocked
            ? "המשתמש חסום. האירועים וההוצאות המשותפים נשארו בהיסטוריה."
            : "דיווח נשמר באופן פרטי. חסימה מונעת בקשות חברות חדשות ולא משנה חישובים קיימים."
        }</p>
        <div class="relationship-safety-actions">
          ${
            !blocked && canReport
              ? `<button
                  class="secondary-button"
                  type="button"
                  data-action="open-participant-report"
                  data-event-id="${escapeAttribute(event.id)}"
                  data-participant-id="${escapeAttribute(participant.id)}"
                >דווח על המשתמש</button>`
              : ""
          }
          ${
            blocked
              ? `<button
                  class="secondary-button"
                  type="button"
                  data-action="unblock-connected-user"
                  data-target-user-id="${escapeAttribute(targetUserId)}"
                  data-event-id="${escapeAttribute(event?.id ?? "")}"
                  ${busy ? "disabled" : ""}
                >${busy ? "מעדכן…" : "בטל חסימה"}</button>`
              : `<button
                  class="event-participant-detail-remove"
                  type="button"
                  data-action="block-connected-user"
                  data-target-user-id="${escapeAttribute(targetUserId)}"
                  data-participant-id="${escapeAttribute(participant.id)}"
                  data-event-id="${escapeAttribute(event?.id ?? "")}"
                  ${busy ? "disabled" : ""}
                >חסום משתמש</button>`
          }
        </div>
      </div>
    </details>
  `;
}

function renderEventParticipantReportDialog(event) {
  const participant = state.participants.find(
    (item) => item.id === eventDialog?.participantId
  );
  const targetUserId = accountUserIdFromParticipantId(participant?.id);
  if (
    !participant ||
    !targetUserId ||
    participant.id === state.currentParticipantId ||
    !event.participantIds.includes(participant.id) ||
    isEventParticipantInactive(event, participant.id)
  ) {
    return renderEventParticipantsDialog(event);
  }

  const category = eventDialog?.reportCategory ?? "";
  const details = eventDialog?.reportDetails ?? "";
  const error = eventDialog?.error ?? "";
  const busy = friendNetworkBusyAction === `report:${participant.id}`;

  return renderEventDialogShell({
    eyebrow: "בטיחות",
    title: `דיווח על ${participantName(participant.id, event)}`,
    description: "הדיווח פרטי ואינו נשלח למשתמש שעליו דיווחת.",
    backAction: "back-to-participant-profile",
    backLabel: "חזרה לפרטי המשתתף",
    showClose: false,
    modalClass: "event-participant-report-modal",
    body: `
      <div class="participant-report-form">
        <label class="field">
          <span>מה קרה?</span>
          <select data-action="participant-report-category" required>
            <option value="" ${category ? "" : "selected"} disabled>בחירת סיבה</option>
            <option value="harassment" ${category === "harassment" ? "selected" : ""}>הטרדה או התנהגות פוגענית</option>
            <option value="impersonation" ${category === "impersonation" ? "selected" : ""}>התחזות או זהות שגויה</option>
            <option value="offensive_content" ${category === "offensive_content" ? "selected" : ""}>תוכן לא ראוי</option>
            <option value="spam" ${category === "spam" ? "selected" : ""}>ספאם או הזמנות חוזרות</option>
            <option value="other" ${category === "other" ? "selected" : ""}>סיבה אחרת</option>
          </select>
        </label>
        <label class="field">
          <span>פרטים נוספים <small>(לא חובה)</small></span>
          <textarea
            data-action="participant-report-details"
            maxlength="1000"
            rows="4"
            placeholder="אפשר לכתוב בקצרה מה קרה"
          >${escapeHtml(details)}</textarea>
        </label>
        ${error ? `<p class="field-error" role="alert">${escapeHtml(error)}</p>` : ""}
        <button class="primary-button" type="button" data-action="submit-participant-report" ${!category || busy ? "disabled" : ""}>
          ${busy ? "שולח…" : "שלח דיווח"}
        </button>
      </div>
    `
  });
}

function renderRelationshipFriendshipControl({
  friendship,
  event,
  participant,
  busy,
  sharedEventReady,
  actionLabel
}) {
  if (friendship.kind === "blocked") {
    return '<span class="relationship-friendship-badge is-pending">חסום</span>';
  }
  if (friendship.kind === "accepted") {
    return '<span class="relationship-friendship-badge is-accepted">חבר</span>';
  }
  if (friendship.kind === "outgoing") {
    return '<span class="relationship-friendship-badge is-pending">בקשה נשלחה</span>';
  }

  return `
    <button
      class="secondary-button relationship-friendship-action"
      type="button"
      data-action="request-event-friendship"
      data-event-id="${escapeAttribute(event.id)}"
      data-participant-id="${escapeAttribute(participant.id)}"
      ${busy || !sharedEventReady ? "disabled" : ""}
    >${busy ? "מעדכן…" : actionLabel}</button>
  `;
}

function renderParticipantRelationshipScorecard(
  event,
  participant,
  insights,
  { targetName = participantName(participant.id, event), avatarEvent = event } = {}
) {
  const paymentQuestion = insights.hasHistory
    ? "מי שילם יותר?"
    : "עוד אין מספיק היסטוריה";

  return `
    <section class="relationship-scorecard" aria-labelledby="relationship-scorecard-title">
      <h3 id="relationship-scorecard-title">אתם במספרים</h3>
      <div class="relationship-duo" aria-label="${escapeAttribute(`השוואה בין ${targetName} לבינך`)}">
        <span data-relationship-person="current">
          ${renderAvatar(state.currentParticipantId, avatarEvent)}
          <small>אתה</small>
        </span>
        <span data-relationship-person="target">
          ${renderAvatar(participant.id, avatarEvent)}
          <small>${escapeHtml(targetName)}</small>
        </span>
      </div>
      ${renderRelationshipComparison({
        label: paymentQuestion,
        currentValue: formatEventMoney(event, insights.paid.current),
        targetValue: formatEventMoney(event, insights.paid.target),
        currentShare: insights.paidShare.current,
        targetShare: insights.paidShare.target,
        leader: insights.paymentLeader,
        targetName
      })}
      ${renderRelationshipComparison({
        label: "מי הוסיף יותר הוצאות?",
        currentValue: String(insights.expensesAdded.current),
        targetValue: String(insights.expensesAdded.target),
        currentShare: relationshipMetricShare(
          insights.expensesAdded.current,
          insights.expensesAdded.target
        ).current,
        targetShare: relationshipMetricShare(
          insights.expensesAdded.current,
          insights.expensesAdded.target
        ).target,
        leader: insights.expenseLeader,
        targetName
      })}
      ${renderRelationshipComparison({
        label: "מי היה יותר מעורב?",
        currentValue: `${insights.involvement.current} פעולות`,
        targetValue: `${insights.involvement.target} פעולות`,
        currentShare: relationshipMetricShare(
          insights.involvement.current,
          insights.involvement.target
        ).current,
        targetShare: relationshipMetricShare(
          insights.involvement.current,
          insights.involvement.target
        ).target,
        leader: insights.involvementLeader,
        targetName
      })}
      <p class="relationship-scorecard-note">מבוסס על ${formatCount(insights.financialEventCount, "אירוע משותף", "אירועים משותפים")} במטבע ${escapeHtml(currencyCompactLabel(event))}.</p>
    </section>
  `;
}

function renderRelationshipComparison({
  label,
  currentValue,
  targetValue,
  currentShare,
  targetShare,
  leader,
  targetName
}) {
  const leaderLabel = leader === "target"
    ? `${targetName} מוביל`
    : leader === "current"
      ? "אתה מוביל"
      : "די שווה";

  return `
    <div class="relationship-comparison">
      <strong>${escapeHtml(label)}</strong>
      <div class="relationship-comparison-values">
        <span data-relationship-person="current"><span class="font-num" dir="ltr">${escapeHtml(currentValue)}</span><small>אתה</small></span>
        <span data-relationship-person="target"><span class="font-num" dir="ltr">${escapeHtml(targetValue)}</span><small>${escapeHtml(targetName)}</small></span>
      </div>
      <progress
        max="100"
        value="${currentShare}"
        aria-label="${escapeAttribute(`${leaderLabel}: אתה ${currentShare}% מול ${targetName} ${targetShare}%`)}"
      >${currentShare}%</progress>
      <small class="relationship-comparison-leader">${escapeHtml(leaderLabel)}</small>
    </div>
  `;
}

function relationshipMetricShare(currentValue, targetValue) {
  const total = currentValue + targetValue;
  if (total <= 0) return { current: 50, target: 50 };
  const current = Math.max(0, Math.min(100, Math.round((currentValue / total) * 100)));
  return { current, target: 100 - current };
}

function renderParticipantRelationshipHabit(targetName, insights) {
  return `
    <section class="relationship-habit" aria-labelledby="relationship-habit-title">
      <span class="relationship-habit-icon" aria-hidden="true">${commandIconSvgs.settle}</span>
      <div>
        <h3 id="relationship-habit-title">ההרגל שלכם</h3>
        <p>${escapeHtml(participantRelationshipHabitText(targetName, insights))}</p>
      </div>
    </section>
  `;
}

function participantRelationshipHabitText(targetName, insights) {
  if (!insights.hasHistory) {
    return "אחרי עוד כמה הוצאות משותפות נוכל לזהות כאן את דפוס ההתנהלות שלכם.";
  }
  if (insights.paymentLeader === "target" && insights.expenseLeader === "current") {
    return `${targetName} בדרך כלל משלם במקום, ואתה מתעד יותר הוצאות.`;
  }
  if (insights.paymentLeader === "current" && insights.expenseLeader === "target") {
    return `אתה בדרך כלל משלם במקום, ו-${targetName} מתעד יותר הוצאות.`;
  }
  if (insights.paymentLeader === "target" && insights.expenseLeader === "target") {
    return `${targetName} בדרך כלל מוביל גם בתשלום וגם בתיעוד.`;
  }
  if (insights.paymentLeader === "current" && insights.expenseLeader === "current") {
    return "אתה בדרך כלל מוביל גם בתשלום וגם בתיעוד.";
  }
  return "אתם מתחלקים די שווה בתשלום ובתיעוד ההוצאות.";
}

function renderParticipantRelationshipFacts(event, insights) {
  const largestEvent = insights.largestEvent
    ? `
      <div class="relationship-fact">
        <span aria-hidden="true">${commandIconSvgs.expense}</span>
        <small>האירוע הכי גדול</small>
        <strong>${escapeHtml(insights.largestEvent.name)}</strong>
        <span class="font-num" dir="ltr">${formatEventMoney(event, insights.largestEvent.total)}</span>
      </div>
    `
    : `
      <div class="relationship-fact is-empty">
        <span aria-hidden="true">${commandIconSvgs.expense}</span>
        <small>האירוע הכי גדול</small>
        <strong>עוד אין נתונים</strong>
      </div>
    `;
  const recurringExpense = insights.recurringExpense
    ? `
      <div class="relationship-fact">
        <span aria-hidden="true">${commandIconSvgs.edit}</span>
        <small>הוצאה שחוזרת</small>
        <strong>${escapeHtml(insights.recurringExpense.name)}</strong>
        <span class="font-num" dir="ltr">${insights.recurringExpense.count} פעמים</span>
      </div>
    `
    : `
      <div class="relationship-fact is-empty">
        <span aria-hidden="true">${commandIconSvgs.edit}</span>
        <small>הוצאה שחוזרת</small>
        <strong>עוד אין דפוס קבוע</strong>
      </div>
    `;

  return `
    <section class="relationship-facts" aria-labelledby="relationship-facts-title">
      <h3 id="relationship-facts-title">עוד דברים מעניינים</h3>
      <div class="relationship-facts-grid">
        ${largestEvent}
        ${recurringExpense}
        <div class="relationship-fact">
          <span aria-hidden="true">${commandIconSvgs.participants}</span>
          <small>היסטוריה משותפת</small>
          <strong>${formatCount(insights.sharedEventCount, "אירוע", "אירועים")}</strong>
          <span class="font-num" dir="ltr">${formatCount(insights.expenseCount, "הוצאה", "הוצאות")}</span>
        </div>
      </div>
    </section>
  `;
}

function participantRelationshipOpenBalance(event, targetParticipantId) {
  const currentParticipantId = state.currentParticipantId;
  const transfers = eventSettlementTransfers(event).filter(
    (transfer) =>
      transfer.status !== "paid" &&
      ((transfer.fromParticipantId === targetParticipantId &&
        transfer.toParticipantId === currentParticipantId) ||
        (transfer.fromParticipantId === currentParticipantId &&
          transfer.toParticipantId === targetParticipantId))
  );
  const net = sumMoneyAmounts(
    transfers.map((transfer) =>
      transfer.fromParticipantId === targetParticipantId
        ? transfer.amount
        : -transfer.amount
    )
  );

  return {
    amount: Math.abs(net),
    direction: net > 0 ? "incoming" : net < 0 ? "outgoing" : "balanced",
    reminderTransfer: transfers.find(
      (transfer) => transfer.fromParticipantId === targetParticipantId
    ) ?? null
  };
}

function renderParticipantRelationshipBalance(event, participant, openBalance) {
  const targetName = participantName(participant.id, event);
  if (openBalance.direction === "balanced") {
    return `
      <section class="relationship-open-balance is-balanced">
        <div>
          <small>פתוח עכשיו</small>
          <strong>אין חוב פתוח ביניכם</strong>
        </div>
        <button class="secondary-button" type="button" data-action="settle" data-event-id="${escapeAttribute(event.id)}">פתח סיכום</button>
      </section>
    `;
  }

  const incoming = openBalance.direction === "incoming";
  const reminderAllowed = incoming && paymentReminderEligibility(openBalance.reminderTransfer).allowed;
  const amountText = incoming
    ? `${formatEventMoney(event, openBalance.amount)} אליך`
    : `${formatEventMoney(event, openBalance.amount)} ל-${targetName}`;
  const action = reminderAllowed ? "send-payment-reminder" : "settle";
  const label = reminderAllowed ? "שלח תזכורת" : "פתח סיכום";

  return `
    <section class="relationship-open-balance is-${openBalance.direction}">
      <div>
        <small>פתוח עכשיו</small>
        <strong><span class="font-num">${escapeHtml(amountText)}</span></strong>
      </div>
      <button
        class="primary-button ${reminderAllowed ? "transfer-reminder-button" : ""}"
        type="button"
        data-action="${action}"
        data-event-id="${escapeAttribute(event.id)}"
        ${reminderAllowed ? `data-transfer-id="${escapeAttribute(openBalance.reminderTransfer.id)}"` : ""}
      >${escapeHtml(label)}</button>
    </section>
  `;
}

function renderOfflineEventParticipantProfile(event, participant) {
  const canEdit = canCurrentParticipantEdit(event);
  const canManage = canCurrentParticipantManage(event);
  const canChangeMembership = canCurrentParticipantChangeEventMembership(
    event,
    participant.id
  );
  const linkCandidates = linkableEventAccountParticipants(event, participant.id);
  const message = eventDialog?.message ?? "";

  return renderEventDialogShell({
    eyebrow: "משתתף באירוע",
    title: "ניהול משתתף",
    description: event.name,
    backdropClass: "event-participant-route-backdrop",
    modalClass: "event-participant-route-modal event-participant-detail-modal event-participant-management-modal",
    routeMode: true,
    backAction: "event-participants-back",
    backLabel: "חזרה למשתתפים",
    showClose: false,
    body: `
      <section
        class="event-participant-detail event-participant-management is-offline"
        data-participant-detail-view="offline"
        data-participant-id="${escapeAttribute(participant.id)}"
      >
        <header class="event-participant-management-identity">
          ${renderAvatar(participant.id, event)}
          <div>
            <strong>${escapeHtml(participantName(participant.id, event))}</strong>
            ${renderParticipantConnectionBadge(participant)}
          </div>
        </header>
        ${
          message
            ? `<p class="event-participant-notice" role="status">${escapeHtml(message)}</p>`
            : ""
        }
        <div class="event-participant-management-list">
          <button
            class="event-participant-management-row"
            type="button"
            data-action="open-offline-participant-rename"
            data-event-id="${escapeAttribute(event.id)}"
            data-participant-id="${escapeAttribute(participant.id)}"
            ${canEdit ? "" : "disabled"}
          >
            <span class="event-participant-management-icon" aria-hidden="true">${commandIconSvgs.edit}</span>
            <span class="event-participant-management-copy">
              <strong>עריכת שם</strong>
              <small>אותו אדם ואותה היסטוריה כספית</small>
            </span>
          </button>
          <button
            class="event-participant-management-row"
            type="button"
            data-action="open-event-participant-link"
            data-event-id="${escapeAttribute(event.id)}"
            data-participant-id="${escapeAttribute(participant.id)}"
            ${canManage ? "" : "disabled"}
          >
            <span class="event-participant-management-icon" aria-hidden="true">${commandIconSvgs.link}</span>
            <span class="event-participant-management-copy">
              <strong>קישור לחשבון</strong>
              <small>${
                linkCandidates.length
                  ? "בחרו חשבון שכבר באירוע או הזמינו חשבון חדש"
                  : "הזמינו אותו ב-WhatsApp, בקישור או ב-QR"
              }</small>
            </span>
            <span class="event-participant-roster-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
          </button>
          ${canChangeMembership ? renderEventParticipantRemovalRow(event, participant) : ""}
        </div>
      </section>
    `
  });
}

function linkableEventAccountParticipants(event, sourceParticipantId) {
  return activeEventParticipants(event)
    .filter(
      (participant) =>
        participant.id !== sourceParticipantId &&
        participantConnectionStatus(participant).connected
    )
    .sort((left, right) => compareEventParticipantRoster(left, right, event));
}

function renderEventParticipantLinkDialog(event) {
  const participant = state.participants.find(
    (item) => item.id === eventDialog?.participantId
  );
  if (
    !participant ||
    participantConnectionStatus(participant).connected ||
    !event.participantIds.includes(participant.id) ||
    isEventParticipantInactive(event, participant.id)
  ) {
    return renderEventParticipantsDialog(event);
  }

  const candidates = linkableEventAccountParticipants(event, participant.id);
  const canInvite = canCurrentParticipantEdit(event) && !isEventClosed(event);
  return renderEventDialogShell({
    eyebrow: "",
    title: "קישור לחשבון",
    description: participantName(participant.id, event),
    backdropClass: "event-participant-route-backdrop",
    modalClass: "event-participant-route-modal event-participant-link-modal",
    routeMode: true,
    backAction: "event-participants-back",
    backLabel: "חזרה לניהול המשתתף",
    showClose: false,
    body: `
      <section class="event-participant-link-screen">
        <div class="event-participant-link-intro">
          <strong>איזה חשבון שייך לאדם הזה?</strong>
          <p>${candidates.length ? "בחרו חשבון שכבר באירוע, או הזמינו את האדם להתחבר." : "הזמינו את האדם להתחבר, ולאחר שיצטרף תוכלו לקשר את החשבון."}</p>
        </div>
        <section class="event-share-choice event-share-route-list event-participant-link-invite" aria-label="הזמנת חשבון חדש">
          <button
            class="event-share-route-choice"
            type="button"
            data-action="open-event-participant-link-invite"
            data-event-id="${escapeAttribute(event.id)}"
            data-participant-id="${escapeAttribute(participant.id)}"
            ${canInvite ? "" : 'disabled aria-disabled="true"'}
          >
            ${renderCommandIcon("share")}
            <span>
              <strong>הזמן אותו להתחבר</strong>
              <small>${canInvite ? "WhatsApp, העתקת קישור או סריקת QR" : "כדי להזמין צריך לפתוח את האירוע לעריכה"}</small>
            </span>
            <span class="event-share-route-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
          </button>
        </section>
        ${
          candidates.length
            ? `<div class="event-participant-link-list" role="list" aria-label="חשבונות שכבר באירוע">
                ${candidates
                  .map(
                    (candidate) => `
                      <button
                        class="event-participant-link-candidate"
                        type="button"
                        role="listitem"
                        data-action="link-offline-participant-account"
                        data-allow-offline-mutation="true"
                        data-event-id="${escapeAttribute(event.id)}"
                        data-source-participant-id="${escapeAttribute(participant.id)}"
                        data-target-participant-id="${escapeAttribute(candidate.id)}"
                      >
                        ${renderAvatar(candidate.id, event)}
                        <span>
                          <strong>${escapeHtml(participantName(candidate.id, event))}</strong>
                          ${renderParticipantUsername(candidate)}
                          <small>משתמש בסוגרים חשבון</small>
                        </span>
                        <span class="event-participant-link-arrow" aria-hidden="true">${iconSvg("chevron-left")}</span>
                      </button>
                    `
                  )
                  .join("")}
              </div>`
            : ""
        }
      </section>
    `
  });
}

function compareEventParticipantRoster(left, right, event) {
  const currentOrder =
    Number(right.id === state.currentParticipantId) -
    Number(left.id === state.currentParticipantId);
  if (currentOrder) return currentOrder;

  const connectionOrder =
    Number(participantConnectionStatus(right).connected) -
    Number(participantConnectionStatus(left).connected);
  if (connectionOrder) return connectionOrder;

  return participantName(left.id, event).localeCompare(
    participantName(right.id, event),
    "he"
  );
}

function renderCurrentEventParticipants(event, participants, canEdit) {
  const adminIds = new Set(eventAdminIds(state, event));
  const countLabel = formatCount(participants.length, "משתתף", "משתתפים");
  const duplicateParticipantIds = new Set(
    unresolvedDuplicateParticipantPairs(state.participants, event)
      .flatMap((pair) => [pair.left.id, pair.right.id])
  );
  const showSearch = participants.length > EVENT_PARTICIPANT_SEARCH_THRESHOLD;

  return `
    <section
      class="event-participant-roster"
      data-event-participant-roster
      aria-labelledby="event-participant-roster-title"
    >
      <header class="event-participant-section-header is-compact">
        <span id="event-participant-roster-title" class="event-participant-count">
          ${countLabel} · לחצו על שם לניהול
        </span>
      </header>
      ${
        showSearch
          ? `<label class="field participant-search-field event-participant-roster-search">
              <span>חיפוש באירוע</span>
              <input
                data-action="participant-search"
                data-participant-search-for="event-participant-roster"
                type="search"
                autocomplete="off"
                enterkeyhint="search"
                name="eventParticipantSearch"
                placeholder="חיפוש לפי שם…"
                aria-label="חיפוש במשתתפי האירוע"
              />
            </label>`
          : ""
      }
      <div
        class="event-participant-roster-list"
        data-participant-checks-for="event-participant-roster"
      >
        ${participants
          .map((participant) =>
            renderCurrentEventParticipantRow(event, participant, {
              canEdit,
              isAdmin: adminIds.has(participant.id),
              needsIdentityReview: duplicateParticipantIds.has(participant.id)
            })
          )
          .join("")}
        <p class="muted" data-participant-search-empty role="status" hidden>אין משתתף שמתאים לחיפוש.</p>
      </div>
    </section>
  `;
}

function renderCurrentEventParticipantGroup(
  event,
  participants,
  { canEdit, adminIds, duplicateParticipantIds, identity, title, description, showCount }
) {
  if (!participants.length) {
    return `
      <button class="new-event-participant-route-action event-participant-empty-friends" type="button" disabled aria-disabled="true">
        <span class="new-event-participant-route-icon" aria-hidden="true">${iconSvg("users")}</span>
        <strong>בחר מחברים</strong>
        <span class="new-event-participant-route-state">אין חברים זמינים</span>
      </button>
    `;
  }
  const countLabel = identity === "account"
    ? formatCount(participants.length, "משתמש", "משתמשים")
    : formatCount(participants.length, "שם", "שמות");

  return `
    <section
      class="event-participant-roster-identity-group is-${identity}"
      data-participant-identity-group="${identity}"
      aria-label="${escapeAttribute(title)}"
    >
      <header class="event-participant-roster-identity-heading">
        <span class="event-participant-roster-identity-marker" aria-hidden="true"></span>
        <span>
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(description)}</small>
        </span>
        ${showCount ? `<bdi>${escapeHtml(countLabel)}</bdi>` : ""}
      </header>
      <div class="event-participant-roster-identity-list">
        ${participants
          .map((participant) =>
            renderCurrentEventParticipantRow(event, participant, {
              canEdit,
              isAdmin: adminIds.has(participant.id),
              needsIdentityReview: duplicateParticipantIds.has(participant.id)
            })
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderCurrentEventParticipantRow(
  event,
  participant,
  { canEdit, isAdmin, needsIdentityReview }
) {
  const displayName = participantName(participant.id, event);
  const isCurrentParticipant = participant.id === state.currentParticipantId;
  const identity = participantConnectionStatus(participant);
  const roleLabel = isAdmin ? "מנהל" : "";
  const rowAction = isCurrentParticipant
    ? "open-event-settings"
    : "open-event-participant-profile";
  const rowLabel = isCurrentParticipant
    ? "פתיחת הגדרות האירוע"
    : `ניהול ${displayName}`;
  const friendship = identity.connected && !isCurrentParticipant
    ? eventParticipantFriendshipState(participant)
    : null;

  return `
    <button
      type="button"
      class="event-participant-roster-row ${identity.connected ? "is-account" : "is-offline"} ${needsIdentityReview ? "has-identity-review" : ""}"
      data-action="${rowAction}"
      data-event-id="${escapeAttribute(event.id)}"
      data-participant-name="${escapeAttribute(participantSearchIdentity(participant, displayName))}"
      data-participant-id="${escapeAttribute(participant.id)}"
      aria-label="${escapeAttribute(rowLabel)}"
    >
      <span class="event-participant-person">
        ${renderAvatar(participant.id, event, { openCurrentProfile: isCurrentParticipant })}
        <span class="event-participant-person-copy">
          <strong>${escapeHtml(displayName)}</strong>
          <span class="event-participant-meta">
            ${identity.connected ? renderParticipantUsername(participant) : renderParticipantConnectionBadge(participant)}
            ${isCurrentParticipant ? '<small class="event-participant-status-tag event-participant-current-label">אתה</small>' : ""}
            ${roleLabel ? `<small class="event-participant-status-tag event-participant-role">${roleLabel}</small>` : ""}
            ${needsIdentityReview ? '<small class="event-participant-duplicate-status">בדיקת שם</small>' : ""}
            ${
              friendship
                ? `<small class="event-participant-status-tag event-participant-friend-hint is-${friendship.kind}">${escapeHtml(friendship.label)}</small>`
                : ""
            }
          </span>
        </span>
      </span>
      <span class="event-participant-roster-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
    </button>
  `;
}

function eventParticipantFriendshipState(participant) {
  const targetUserId = accountUserIdFromParticipantId(participant?.id);
  if (!targetUserId) {
    return { kind: "unavailable", label: "משתמש באפליקציה", relationship: null };
  }

  if (isConnectedUserBlocked(targetUserId)) {
    return { kind: "blocked", label: "משתמש חסום", relationship: null };
  }

  const relationship = (friendNetwork.friendships ?? []).find(
    (item) =>
      [item.requester_id, item.addressee_id].includes(friendNetwork.userId) &&
      [item.requester_id, item.addressee_id].includes(targetUserId)
  ) ?? null;

  if (relationship?.status === "accepted") {
    return { kind: "accepted", label: "חברים", relationship };
  }
  if (relationship?.status === "pending") {
    if (relationship.requester_id === friendNetwork.userId) {
      return { kind: "outgoing", label: "בקשה נשלחה", relationship };
    }
    return { kind: "incoming", label: "בקשה מחכה לך", relationship };
  }
  if (friendNetwork.status === "loading") {
    return { kind: "loading", label: "משתמש באפליקציה", relationship };
  }
  return { kind: "available", label: "הצע חברות", relationship };
}

function isConnectedUserBlocked(targetUserId) {
  return (friendNetwork.blockedUsers ?? []).some(
    (blockedUser) => blockedUser.blocked_user_id === targetUserId
  );
}

function renderInactiveEventParticipants(event, participants, canEdit) {
  if (!participants.length) return "";
  const countLabel = formatCount(
    participants.length,
    "משתתף שהוסר",
    "משתתפים שהוסרו"
  );

  return `
    <details class="event-participant-add-existing event-participant-inactive">
      <summary>
        <span>
          <strong>הוסרו מהאירוע</strong>
          <small>לא יופיעו בהוצאות חדשות; ההיסטוריה הכספית שלהם נשמרת.</small>
        </span>
        <span class="event-participant-count">${countLabel}</span>
      </summary>
      <div class="event-participant-candidates">
        <div class="event-participant-candidate-list">
          ${participants
            .map((participant) =>
              renderInactiveEventParticipantRow(event, participant, canEdit)
            )
            .join("")}
        </div>
      </div>
    </details>
  `;
}

function renderInactiveEventParticipantRow(event, participant, canEdit) {
  const displayName = participantName(participant.id, event);
  const identity = participantConnectionStatusForEvent(participant, event);

  return `
    <article
      class="event-participant-candidate-row event-participant-inactive-row ${identity.connected ? "is-account" : "is-offline"}"
      data-participant-name="${escapeAttribute(displayName.toLowerCase())}"
      data-participant-id="${escapeAttribute(participant.id)}"
    >
      <span class="event-participant-person">
        ${renderAvatar(participant.id, event)}
        <span class="event-participant-person-copy">
          <strong>${escapeHtml(displayName)}</strong>
          <span class="event-participant-meta">
            ${renderParticipantConnectionBadge(participant, event)}
            <small class="event-participant-money-status">נשמר בהיסטוריה</small>
          </span>
        </span>
      </span>
      <button
        class="event-participant-membership-button event-participant-add-button"
        type="button"
        data-action="restore-event-participant"
        data-event-id="${escapeAttribute(event.id)}"
        data-participant-id="${escapeAttribute(participant.id)}"
        aria-label="${escapeAttribute(displayName)} לא באירוע. לחץ כדי להחזיר לאירוע"
        ${canEdit && canCurrentParticipantChangeEventMembership(event, participant.id) ? "" : "disabled"}
      >${renderParticipantMembershipStatus(false)}</button>
    </article>
  `;
}

function renderAvailableEventParticipants(
  event,
  participants,
  canEdit
) {
  if (!participants.length) return "";
  const countLabel = formatCount(participants.length, "חבר שמור", "חברים שמורים");
  const connectedParticipants = participants.filter(
    (participant) => participantConnectionStatus(participant).connected
  );
  const offlineParticipants = participants.filter(
    (participant) => !participantConnectionStatus(participant).connected
  );
  const showSearch = participants.length > EVENT_PARTICIPANT_SEARCH_THRESHOLD;

  return `
    <details class="event-participant-add-existing participant-add-choice participant-add-friends new-event-participant-route-action">
      <summary>
        <span class="new-event-participant-route-icon" aria-hidden="true">${iconSvg("users")}</span>
        <span class="participant-invite-copy">
          <strong>בחר מרשימת החברים</strong>
          <small>הוסף משתמש שכבר מחובר אליך</small>
        </span>
        <span class="event-participant-count">${countLabel}</span>
      </summary>
      <div
        class="event-participant-candidates"
        data-participant-checks-for="event-participant"
      >
        ${
          showSearch
            ? `<label class="field participant-search-field">
                <span>חיפוש שם</span>
                <input
                  data-action="participant-search"
                  data-participant-search-for="event-participant"
                  type="search"
                  autocomplete="off"
                  enterkeyhint="search"
                  name="savedFriendSearch"
                  placeholder="הקלד כדי לסנן…"
                  aria-label="חיפוש ברשימת החברים"
                />
              </label>`
            : ""
        }
        <div class="event-participant-candidate-list">
          ${renderAvailableEventParticipantGroup(
            event,
            connectedParticipants,
            canEdit,
            {
              className: "is-connected",
              title: "משתמשים באפליקציה",
              description: "חשבונות אמיתיים שאפשר להוסיף ישירות."
            }
          )}
          ${renderAvailableEventParticipantGroup(
            event,
            offlineParticipants,
            canEdit,
            {
              className: "is-offline",
              title: "שמות אופליין",
              description: "שמות ידניים שנשמרו אצלך."
            }
          )}
        </div>
        <p class="muted" data-participant-search-empty role="status" hidden>אין חבר שמתאים לחיפוש.</p>
      </div>
    </details>
  `;
}

function renderAvailableEventParticipantGroup(
  event,
  participants,
  canEdit,
  {
    className,
    title,
    description,
    selectionMode = false,
    selectedParticipantId = ""
  }
) {
  if (!participants.length) return "";

  return `
    <section
      class="event-participant-identity-group ${className}"
      data-participant-identity-group
      aria-label="${escapeAttribute(title)}"
    >
      <header>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(description)}</small>
      </header>
      ${participants
        .map((participant) =>
          renderAvailableEventParticipantRow(event, participant, canEdit, {
            selectionMode,
            selected: participant.id === selectedParticipantId
          })
        )
        .join("")}
    </section>
  `;
}

function renderAvailableEventParticipantRow(
  event,
  participant,
  canEdit,
  { selectionMode = false, selected = false } = {}
) {
  const displayName = participantName(participant.id, event);
  const identity = participantConnectionStatus(participant);
  const action = selectionMode
    ? "select-event-participant-candidate"
    : "add-event-participant";

  return `
    <article
      class="event-participant-candidate-row ${identity.connected ? "is-account" : "is-offline"}${selected ? " is-selected" : ""}"
      data-participant-name="${escapeAttribute(participantSearchIdentity(participant, displayName))}"
      data-participant-id="${escapeAttribute(participant.id)}"
    >
      <span class="event-participant-person">
        ${renderAvatar(participant.id, event)}
        <span class="event-participant-person-copy">
          <strong>${escapeHtml(displayName)}</strong>
          ${renderParticipantUsername(participant)}
        </span>
      </span>
      <button
        class="${selectionMode ? "event-participant-selection-button" : "event-participant-membership-button event-participant-add-button"}${selected ? " is-selected" : ""}"
        type="button"
        data-action="${action}"
        data-event-id="${escapeAttribute(event.id)}"
        data-participant-id="${escapeAttribute(participant.id)}"
        ${selectionMode ? `aria-pressed="${selected}"` : ""}
        aria-label="${escapeAttribute(selectionMode ? `${selected ? "בטל בחירה של" : "בחר את"} ${displayName}` : `${displayName} לא באירוע. לחץ כדי להוסיף לאירוע`)}"
        ${canEdit ? "" : "disabled"}
      >${selectionMode
        ? `<span class="event-participant-selection-check" aria-hidden="true">${iconSvg("check")}</span><span>${selected ? "נבחר" : "בחר"}</span>`
        : renderParticipantMembershipStatus(false)}</button>
    </article>
  `;
}

function renderEventShareDialog(event) {
  const canEdit = canCurrentParticipantEdit(event);
  const shareView = ["friends", "link"].includes(eventDialog?.shareView)
    ? eventDialog.shareView
    : "menu";
  const inviteUrl = eventInviteUrl(event.id);
  // A token in local state is only a server candidate. Copy, WhatsApp and QR
  // stay disabled until this account/event scope has completed a successful
  // ensure, or a previously verified scoped token is deliberately reused
  // while the network is unavailable.
  const preparationState = eventSharePreparationState(event);
  const shareReady = preparationState.status === "verified" && Boolean(
    currentEventOpenInviteToken(event)
  );
  const shareFailed = preparationState.status === "error";
  const shareAuthRequired = shareFailed && eventInviteAuthRefreshRequired(preparationState);
  const shareNotAllowed = shareFailed && preparationState.code === "EVENT_INVITE_NOT_ALLOWED";
  const shareCanRetry = shareFailed && !shareAuthRequired && !shareNotAllowed;
  const shareUnavailableLabel = shareAuthRequired
    ? "נדרשת התחברות"
    : shareNotAllowed
      ? "אין הרשאה לשתף"
      : "הקישור לא זמין";
  const shareFailureMessage = shareFailed
    ? eventInvitePreparationNotice(
        preparationState,
        "לא הצלחנו להכין את הקישור כרגע. אפשר לבדוק את החיבור ולנסות שוב."
      )
    : "";
  const returnsToParticipants = ["participants", "participants-add"].includes(
    eventDialog?.returnKind
  );
  const returnsToParticipantLink = eventDialog?.returnKind === "participant-link";
  const returnsToParentRoute = returnsToParticipants || returnsToParticipantLink;
  const isShareRoute = shareView !== "menu";
  const dialogCopy = shareView === "friends"
    ? {
        title: "בחר חבר",
        description: "רק חברים מחוברים שעדיין לא נמצאים באירוע."
      }
    : shareView === "link"
      ? {
          title: `שיתוף ${event.name}`,
          description: "קישור קבוע, WhatsApp או QR."
        }
      : {
          title: "איך מזמינים?",
          description: "בוחרים דרך אחת וממשיכים."
        };

  return renderEventDialogShell({
    eyebrow: "הזמנה לאירוע",
    title: dialogCopy.title,
    description: dialogCopy.description,
    backdropClass: "event-participant-route-backdrop event-share-route-backdrop",
    modalClass: "event-task-modal event-share-modal event-participant-route-modal",
    routeMode: true,
    showClose: false,
    backAction: returnsToParentRoute
      ? "event-share-back"
      : isShareRoute
        ? "event-share-view-back"
        : "",
    backLabel: returnsToParticipantLink
      ? "חזרה לקישור החשבון"
      : returnsToParticipants
        ? "חזרה למשתתפים"
        : "חזרה לדרכי ההזמנה",
    body: shareView === "friends"
      ? renderEventShareFriends(event, canEdit)
      : shareView === "link"
        ? `
      <div class="event-share-route" data-event-share-view="link">
      <section class="event-share-open" aria-labelledby="open-invite-title">
        <div class="event-share-open-heading">
          <span>
            <small>קישור קבוע</small>
            <strong id="open-invite-title">הזמנה ל${escapeHtml(event.name)}</strong>
          </span>
          <p>שולחים את אותו הקישור בכל פעם שרוצים לצרף מישהו.</p>
        </div>
        <div class="event-share-link-status ${shareReady ? "is-ready" : shareFailed ? "is-error" : "is-loading"}" role="status">
          <span aria-hidden="true">${iconSvg(shareReady ? "check" : "share")}</span>
          <span>
            <strong>${shareReady ? "הקישור מוכן" : shareFailed ? shareUnavailableLabel : "מכינים את הקישור"}</strong>
            <small>${shareReady ? "אפשר להעתיק או לשלוח בוואטסאפ." : shareFailed ? escapeHtml(shareFailureMessage) : "עוד רגע אפשר יהיה לשתף."}</small>
          </span>
        </div>
        <div class="invite-link-row">
          <label class="event-invite-link-field" aria-label="קישור ההזמנה">
            <input
              type="hidden"
              name="eventInviteUrl"
              data-share-ready="${shareReady}"
              value="${shareReady ? escapeAttribute(inviteUrl) : ""}"
            />
          </label>
          <div class="event-invite-link-actions">
            <button
              class="primary-button whatsapp-button"
              data-action="share-invite-whatsapp"
              data-event-id="${escapeAttribute(event.id)}"
              ${shareReady ? "" : shareFailed ? 'disabled aria-disabled="true"' : 'disabled aria-disabled="true" aria-busy="true"'}
            >${shareReady ? "שלח בוואטסאפ" : shareFailed ? shareUnavailableLabel : "מכין קישור…"}</button>
            <button
              class="secondary-button"
              data-action="copy-invite"
              data-open-link="true"
              data-event-id="${escapeAttribute(event.id)}"
              ${shareReady ? "" : 'disabled aria-disabled="true"'}
            >העתק</button>
          </div>
        </div>
        ${
          shareCanRetry
            ? `<button
                class="secondary-button event-invite-retry-button"
                type="button"
                data-action="retry-event-share"
                data-event-id="${escapeAttribute(event.id)}"
              >נסה להכין את הקישור הקבוע שוב</button>`
            : ""
        }
      </section>
      </div>
    `
        : renderEventShareMenu(event)
  });
}

function renderEventParticipantAddRoutes(event, availableParticipants, canEdit) {
  return `
    <section class="event-participant-add-zone event-participant-add-routes" aria-label="דרכים להוספת משתתפים">
      <div class="new-event-participant-actions">
        ${renderExistingEventParticipantAction(event, "open-event-share", "share", "שתף קישור או QR", "is-primary")}
        ${renderExistingEventParticipantAction(event, "set-event-participant-add-view", "users", "בחר מחברים", "", "friends")}
        ${renderExistingEventParticipantAction(event, "set-event-participant-add-view", "user-plus", "הוסף שם ידנית", "", "manual")}
      </div>
    </section>
  `;
}

function renderExistingEventParticipantAction(event, action, icon, title, className = "", view = "", disabled = false) {
  return `
    <button
      class="new-event-participant-route-action ${className}"
      type="button"
      data-action="${escapeAttribute(action)}"
      data-event-id="${escapeAttribute(event.id)}"
      ${view ? `data-participant-view="${escapeAttribute(view)}"` : ""}
      ${disabled ? 'disabled aria-disabled="true"' : ""}
    >
      <span class="new-event-participant-route-icon" aria-hidden="true">${iconSvg(icon)}</span>
      <strong>${escapeHtml(title)}</strong>
      ${disabled ? '<span class="new-event-participant-route-state">אין חברים זמינים</span>' : ""}
    </button>
  `;
}

function renderEventParticipantAddEditor(event, participants, canEdit, participantView) {
  if (participantView === "friends") {
    if (!participants.length) {
      return `
        <section class="new-event-participant-editor event-participant-empty-friends-panel" role="status">
          <header><h2>עדיין אין חברים זמינים</h2><p>אפשר להוסיף חברים במסך החברים ואז לחזור לאירוע.</p></header>
          <button class="primary-button" type="button" data-action="open-friends-from-event-add">עבור למסך החברים</button>
        </section>
      `;
    }
    const connected = participants.filter((participant) => participantConnectionStatus(participant).connected);
    const offline = participants.filter((participant) => !participantConnectionStatus(participant).connected);
    const selectedParticipantId = participants.some(
      (participant) => participant.id === eventDialog?.pendingParticipantId
    )
      ? eventDialog.pendingParticipantId
      : "";
    const selectedParticipant = participants.find(
      (participant) => participant.id === selectedParticipantId
    );
    return `
      <section class="new-event-participant-editor new-event-participant-picker">
        <header><h2>בחר מחברים</h2><p>בחר אדם, בדוק את הבחירה ואשר לפני ההוספה.</p></header>
        <div class="event-participant-candidate-list">
          ${renderAvailableEventParticipantGroup(event, connected, canEdit, {
            className: "is-connected",
            title: "משתמשים באפליקציה",
            description: "חשבונות שאפשר להוסיף ישירות.",
            selectionMode: true,
            selectedParticipantId
          })}
          ${renderAvailableEventParticipantGroup(event, offline, canEdit, {
            className: "is-offline",
            title: "שמות אופליין",
            description: "שמות ידניים שכבר שמורים אצלך.",
            selectionMode: true,
            selectedParticipantId
          })}
        </div>
        <div class="event-participant-add-confirmation" aria-live="polite">
          <p>${selectedParticipant
            ? `<strong>${escapeHtml(participantName(selectedParticipant.id, event))}</strong><span>ייבחר להוספה רק לאחר האישור.</span>`
            : "בחר חבר אחד כדי להמשיך."}</p>
          <button
            class="primary-button"
            type="button"
            data-action="confirm-event-participant-add"
            data-event-id="${escapeAttribute(event.id)}"
            ${selectedParticipant && canEdit && !eventDialog?.addInProgress ? "" : "disabled"}
            ${eventDialog?.addInProgress ? 'aria-busy="true"' : ""}
          >${eventDialog?.addInProgress ? "מוסיף…" : "אישור והוספה לאירוע"}</button>
        </div>
      </section>
    `;
  }
  if (participantView === "manual") {
    return `
      <section class="new-event-participant-editor new-event-offline-add">
        <header><h2>הוסף שם ידנית</h2><p>לאדם שלא יתחבר לאפליקציה.</p></header>
        <div class="event-participant-offline-form">
          <input id="event-offline-participant-name" class="guest-input" data-action="event-guest-name" name="eventGuestName" autocomplete="off" enterkeyhint="done" aria-label="שם חדש להוספה ידנית" placeholder="שם מלא" value="${escapeAttribute(eventDialog?.contactNameDraft ?? "")}" ${!canEdit ? "disabled" : ""} />
          <button class="secondary-button" data-action="event-add-guest" data-event-id="${escapeAttribute(event.id)}" ${!canEdit ? "disabled" : ""}>הוסף לאירוע</button>
        </div>
        <p class="participant-add-privacy-note"><strong>שם ידני</strong><span>השם יוצג למשתתפי האירוע, אך לא ייצור לאדם חשבון.</span></p>
      </section>
    `;
  }
  return "";
}

function renderEventNoteDialog(event) {
  const note = (event.notes ?? []).find((item) => item.id === eventDialog.noteId);
  const isNew = !eventDialog.noteId;
  const canEdit = canCurrentParticipantEdit(event);
  const title = isNew ? "פתק חדש" : canEdit ? "עריכת פתק" : "פתק משותף";
  const body = `
    <form class="event-note-editor" data-event-id="${escapeAttribute(event.id)}" data-note-id="${escapeAttribute(eventDialog.noteId ?? "")}">
      <label class="field event-note-title-field">
        <span>כותרת</span>
        <input
          data-action="event-note-title"
          type="text"
          name="eventNoteTitle"
          maxlength="${MAX_EVENT_NOTE_TITLE_LENGTH}"
          value="${escapeAttribute(eventDialog.titleDraft ?? note?.title ?? "")}"
          placeholder="למשל פרטי הטיסה"
          ${canEdit ? "" : "readonly"}
        />
      </label>
      <label class="field event-note-body-field">
        <span>תוכן הפתק</span>
        <textarea
          data-action="event-note-body"
          name="eventNoteBody"
          maxlength="${MAX_EVENT_NOTE_BODY_LENGTH}"
          rows="8"
          placeholder="כתבו כאן מידע שכולם צריכים לראות…"
          ${canEdit ? "" : "readonly"}
        >${escapeHtml(eventDialog.bodyDraft ?? note?.body ?? "")}</textarea>
      </label>
      ${canEdit ? `
        <button class="event-note-pin-toggle${eventDialog.pinned ? " is-active" : ""}" type="button" data-action="toggle-event-note-pin" aria-pressed="${eventDialog.pinned ? "true" : "false"}">
          <span aria-hidden="true">${iconSvg("pin")}</span>
          <span>${eventDialog.pinned ? "הפתק מוצמד" : "הצמד לראש הרשימה"}</span>
        </button>
      ` : note?.pinned === true ? `<p class="event-note-readonly-pin"><span aria-hidden="true">${iconSvg("pin")}</span> פתק מוצמד</p>` : ""}
      ${eventDialog.error ? `<p class="field-error" id="event-note-error" role="alert">${escapeHtml(eventDialog.error)}</p>` : ""}
      ${canEdit ? `
        <div class="event-note-editor-actions">
          ${isNew ? "" : `<button class="secondary-button event-note-delete" type="button" data-action="request-delete-event-note" data-event-id="${escapeAttribute(event.id)}" data-note-id="${escapeAttribute(eventDialog.noteId)}">${iconSvg("trash")}<span>מחק פתק</span></button>`}
          <button class="primary-button" type="submit" data-action="save-event-note" data-event-id="${escapeAttribute(event.id)}" ${eventDialog.saving ? "disabled" : ""}>${eventDialog.saving ? "שומרים…" : "שמור פתק"}</button>
        </div>
      ` : ""}
    </form>
  `;

  return renderEventDialogShell({
    eyebrow: event.name,
    title,
    description: canEdit ? "השינויים יופיעו אצל כל משתתפי האירוע." : "האירוע סגור ולכן הפתק מוצג לקריאה בלבד.",
    body,
    modalClass: "event-note-modal"
  });
}

function renderEventShareMenu(event) {
  return `
    <div class="event-share-route" data-event-share-view="menu">
      <section class="event-share-choice event-share-route-list" aria-label="דרכי הזמנה">
        <button
          class="event-share-route-choice"
          type="button"
          data-action="event-share-view"
          data-share-view="friends"
          data-event-id="${escapeAttribute(event.id)}"
        >
          ${renderCommandIcon("participants")}
          <span>
            <strong>בחר חבר</strong>
            <small>הזמנה פרטית לחשבון שכבר מחובר אליך</small>
          </span>
          <span class="event-share-route-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
        </button>
        <button
          class="event-share-route-choice"
          type="button"
          data-action="event-share-view"
          data-share-view="link"
          data-event-id="${escapeAttribute(event.id)}"
        >
          ${renderCommandIcon("share")}
          <span>
            <strong>שתף קישור</strong>
            <small>WhatsApp, העתקה או סריקת QR</small>
          </span>
          <span class="event-share-route-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
        </button>
      </section>
    </div>
  `;
}

function renderNewEventParticipantAction({
  action,
  icon,
  title,
  className = "",
  pressed = false,
  view = ""
}) {
  return `
    <button
      class="new-event-participant-route-action ${className} ${pressed ? "is-active" : ""}"
      type="button"
      data-action="${escapeAttribute(action)}"
      ${view ? `data-participant-view="${escapeAttribute(view)}"` : ""}
      ${action === "toggle-new-event-invite-after-create" ? `aria-pressed="${pressed}"` : ""}
    >
      <span class="new-event-participant-route-icon" aria-hidden="true">${iconSvg(icon)}</span>
      <strong>${escapeHtml(title)}</strong>
      ${pressed ? '<span class="new-event-participant-route-state">נבחר</span>' : ""}
    </button>
  `;
}

function renderNewEventSelectedParticipant(participant) {
  const isCurrent = participant.id === state.currentParticipantId;
  if (isCurrent) {
    return `
      <div
        class="new-event-selected-participant is-account is-current-participant"
        data-participant-id="${escapeAttribute(participant.id)}"
        data-participant-name="${escapeAttribute(participantSearchIdentity(participant, participant.displayName))}"
      >
        ${renderAvatar(participant.id)}
        <span class="new-event-selected-participant-copy">
          <strong>${escapeHtml(participant.displayName)}</strong>
          ${renderParticipantUsername(participant)}
        </span>
        <small class="new-event-selected-participant-self">אתה · יוצר האירוע</small>
        <span class="new-event-selected-participant-check app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
      </div>
    `;
  }
  return `
    <label
      class="new-event-selected-participant ${participantConnectionStatus(participant).connected ? "is-account" : "is-offline"}"
      data-action="toggle-new-event-participant"
      data-participant-id="${escapeAttribute(participant.id)}"
      data-participant-name="${escapeAttribute(participantSearchIdentity(participant, participant.displayName))}"
    >
      <input
        type="checkbox"
        data-action="new-event-participant"
        data-participant-id="${escapeAttribute(participant.id)}"
        name="participantSelection"
        value="${escapeAttribute(participant.id)}"
        checked
      />
      ${renderAvatar(participant.id)}
      <span class="new-event-selected-participant-copy">
        <strong>${escapeHtml(participant.displayName)}</strong>
        ${renderParticipantUsername(participant)}
      </span>
      ${renderParticipantConnectionBadge(participant)}
      <span class="new-event-selected-participant-check app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
    </label>
  `;
}

function renderNewEventParticipantEditor() {
  if (newEventDraft.participantView === "friends") {
    return `
      <section class="new-event-participant-editor new-event-participant-picker" aria-labelledby="new-event-friends-title">
        <header>
          <h2 id="new-event-friends-title">בחר מחברים</h2>
          <p>מסמנים רק את מי שמצטרף לאירוע הזה.</p>
        </header>
        ${renderParticipantChecks(newEventDraft.participantIds, "new-event-participant")}
      </section>
    `;
  }

  if (newEventDraft.participantView === "manual") {
    return `
      <section class="new-event-participant-editor new-event-offline-add" aria-labelledby="new-event-manual-title">
        <header>
          <h2 id="new-event-manual-title">הוסף שם ידנית</h2>
          <p>לאדם שלא יתחבר לאפליקציה.</p>
        </header>
        <div class="inline-actions">
          <input class="guest-input" data-action="new-event-guest-name" name="guestName" autocomplete="off" enterkeyhint="done" aria-label="שם אופליין חדש" placeholder="שם מלא" value="${escapeAttribute(newEventDraft.guestName)}" />
          <button class="secondary-button" type="button" data-action="new-event-add-guest">הוסף</button>
        </div>
      </section>
    `;
  }

  return "";
}

function renderNewEventParticipantSubview() {
  const isFriendsView = newEventDraft.participantView === "friends";
  const title = isFriendsView ? "בחירת חברים" : "הוספת שם ידנית";
  const description = isFriendsView
    ? "סמן את החברים שמצטרפים לאירוע. הבחירה נשמרת מיד."
    : "הוסף אדם שלא יתחבר לאפליקציה. תמיד אפשר לערוך אחר כך.";

  return `
    <section class="screen font-hebrew new-event-participants-screen new-event-participant-subscreen" data-screen-kind="new-event" data-event-creation-step="participants" data-new-event-participant-subview="${escapeAttribute(newEventDraft.participantView)}">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">משתתפים</p>
          <h1>${escapeHtml(title)}</h1>
          <p class="muted">${escapeHtml(description)}</p>
        </div>
      </header>

      ${renderNotice()}
      ${renderNewEventParticipantEditor()}

      <div class="new-event-participant-footer new-event-participant-subview-footer">
        <button class="primary-button" type="button" data-action="close-new-event-participant-view">שמירה וחזרה</button>
      </div>
    </section>
  `;
}

function renderNewEventParticipants() {
  ensureNewEventDraft();
  ensureCurrentParticipantInNewEventDraft();
  if (["friends", "manual"].includes(newEventDraft.participantView)) {
    return renderNewEventParticipantSubview();
  }
  const selectedParticipants = newEventDraft.participantIds
    .map((participantId) => state.participants.find((participant) => participant.id === participantId))
    .filter(Boolean);
  const createLabel = newEventDraft.inviteAfterCreate
    ? "צור אירוע ופתח הזמנה"
    : eventTypeConfig(newEventDraft.eventType).createLabel;

  return `
    <section class="screen font-hebrew new-event-participants-screen" data-screen-kind="new-event" data-event-creation-step="participants">
      <header class="top">
        ${renderAppBackButton()}
        <div class="brand">
          <p class="eyebrow">משתתפים</p>
          <h1>מי באירוע?</h1>
        </div>
      </header>

      ${renderEventCreationProgress("participants")}
      ${renderNotice()}

      <section class="new-event-selected-participants" aria-labelledby="new-event-selected-title">
        <div class="new-event-selected-participants-heading">
          <h2 id="new-event-selected-title">משתתפים שנבחרו</h2>
          <span data-new-event-participant-count aria-live="polite">${escapeHtml(newEventParticipantSelectionLabel(newEventDraft.participantIds))}</span>
        </div>
        <div class="new-event-selected-participant-list">
          ${
            selectedParticipants.length
              ? selectedParticipants.map(renderNewEventSelectedParticipant).join("")
              : '<p class="new-event-participants-empty">עדיין לא נבחרו משתתפים.</p>'
          }
        </div>
      </section>

      <section class="new-event-participant-additions" aria-labelledby="new-event-additions-title">
        <h2 id="new-event-additions-title">הוספת משתתפים</h2>
        <div class="new-event-participant-actions" aria-label="דרכים להוספת משתתפים">
          ${renderNewEventParticipantAction({
            action: "toggle-new-event-invite-after-create",
            icon: "share",
            title: "הזמן בקישור",
            className: "is-primary",
            pressed: newEventDraft.inviteAfterCreate
          })}
          ${renderNewEventParticipantAction({
            action: "set-new-event-participant-view",
            icon: "users",
            title: "בחר מחברים",
            pressed: newEventDraft.participantView === "friends",
            view: "friends"
          })}
          ${renderNewEventParticipantAction({
            action: "set-new-event-participant-view",
            icon: "user-plus",
            title: "הוסף שם ידנית",
            pressed: newEventDraft.participantView === "manual",
            view: "manual"
          })}
        </div>
        ${renderNewEventParticipantEditor()}
      </section>

      <div class="new-event-participant-footer">
        <button class="primary-button" type="button" data-action="create-event" ${selectedParticipants.length && !createEventBusy ? "" : "disabled"}>${escapeHtml(createEventBusy ? "שומר…" : createLabel)}</button>
        <button class="secondary-button" type="button" data-action="cancel-new-event-participants">חזרה לפרטים</button>
      </div>
    </section>
  `;
}

function renderEventShareFriends(event, canEdit) {
  const friendIds = new Set(activeFriendParticipantIds(state));
  const participants = state.participants
    .filter((participant) =>
      participant.id !== state.currentParticipantId &&
      friendIds.has(participant.id) &&
      participantConnectionStatus(participant).connected &&
      !event.participantIds.includes(participant.id)
    )
    .sort((left, right) => compareEventParticipantRoster(left, right, event));
  const message = eventDialog?.message ?? "";

  return `
    <div class="event-share-route event-share-friends" data-event-share-view="friends">
      ${message ? `<p class="event-participant-notice" role="status">${escapeHtml(message)}</p>` : ""}
      ${
        participants.length
          ? `<section class="event-share-friend-list" aria-label="חברים זמינים להזמנה">
              ${participants
                .map((participant) =>
                  renderAvailableEventParticipantRow(event, participant, canEdit)
                )
                .join("")}
            </section>`
          : `<section class="event-share-empty" role="status">
              ${renderCommandIcon("participants")}
              <strong>אין כרגע חבר זמין להזמנה</strong>
              <p>חברים שכבר באירוע לא יופיעו כאן.</p>
            </section>`
      }
    </div>
  `;
}

function renderEventSettingsDialog(event) {
  const canManage = canCurrentParticipantManage(event);
  const canLeave = canLeaveEvent(state, event.id, state.currentParticipantId);
  const adminNames =
    eventAdminIds(state, event)
      .map((participantId) => participantName(participantId, event))
      .join(", ") || "אין מנהל";
  const managementStatus = event.adminsCanEditOnly ? "ניהול מרוכז" : "ניהול משותף";
  const currencyStatus = currencySelectLabel(event.currency);
  const repaymentStatus = usesDirectSettlementTransfers(event)
    ? "לפי מי ששילם"
    : "קיזוז חכם";
  const roundingStatus = usesRoundedSettlementTransfers(event)
    ? "פעיל · העברות בשקלים שלמים"
    : "כבוי · דיוק מלא באגורות";
  const lockStatus = event.locked ? "האירוע נעול" : "האירוע פתוח לעריכה";
  const dangerStatus = canManage ? "עזיבה או מחיקת האירוע" : canLeave ? "עזיבת האירוע" : "אין פעולות זמינות";

  return renderEventDialogShell({
    eyebrow: "הגדרות",
    title: "הגדרות האירוע",
    description: "בוחרים נושא אחד ומטפלים בו במסך נפרד.",
    modalClass: "event-task-modal event-settings-modal",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    backAction: "close-event-dialog",
    backLabel: "חזרה לאירוע",
    showClose: false,
    body: `
      <section class="event-cover-settings" aria-labelledby="event-cover-settings-title">
        <div class="event-cover-settings-copy">
          <strong id="event-cover-settings-title">תמונת האירוע</strong>
          <small>${event.coverImage ? "אפשר להחליף או להסיר את התמונה." : "לא חובה · מוסיפה זיהוי מהיר לאירוע."}</small>
        </div>
        ${event.coverImage ? `<img src="${escapeAttribute(event.coverImage)}" alt="" />` : ""}
        <div class="event-cover-settings-actions event-cover-source-grid">
          <label class="secondary-button event-cover-upload">
            <span>מהגלריה</span>
            <input data-action="event-cover-image" data-event-id="${escapeAttribute(event.id)}" type="file" accept="image/*" hidden ${!canManage ? "disabled" : ""} />
          </label>
          <label class="secondary-button event-cover-upload">
            <span>מצלמה</span>
            <input data-action="event-cover-image" data-event-id="${escapeAttribute(event.id)}" type="file" accept="image/*" capture="environment" hidden ${!canManage ? "disabled" : ""} />
          </label>
          ${event.coverImage && canManage ? `<button class="secondary-button" type="button" data-action="remove-event-cover" data-event-id="${escapeAttribute(event.id)}">הסר</button>` : ""}
        </div>
      </section>
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
          section: "repayment",
          title: "חלוקת ההחזרים",
          description: repaymentStatus
        })}
        ${renderEventSettingsMenuItem({
          eventId: event.id,
          section: "rounding",
          title: "עיגול סכומים",
          description: roundingStatus
        })}
        ${renderEventSettingsMenuItem({
          eventId: event.id,
          section: "activity",
          title: "פעילות באירוע",
          description: "מי הוסיף, עדכן וסימן תשלום"
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

function renderEventParticipantIdentityDialog(event) {
  return renderEventDialogShell({
    eyebrow: "בדיקת שמות",
    title: "שמות דומים",
    description: "בודקים רק כשנוח. שום דבר לא משתנה בלי אישור מפורש.",
    backAction: "participant-identities-back",
    backLabel: "חזרה למשתתפים",
    body: renderDuplicateParticipantReview(event)
  });
}

function renderDuplicateParticipantReview(event) {
  const duplicateGroups = eventDuplicateParticipantGroups(
    state.participants,
    event
  );
  const unresolvedPairs = unresolvedDuplicateParticipantPairs(
    state.participants,
    event
  );
  const canManage = canCurrentParticipantManage(event);
  const duplicateParticipants = duplicateGroups.flat();
  const resolvedPairIds = new Set(
    eventDialog?.kind === "participant-identities"
      ? eventDialog.resolvedPairIds ?? []
      : []
  );
  const aliasParticipants = duplicateParticipants.filter((participant) =>
    resolvedPairIds.has(participant.id)
  );
  const reviewMessage =
    eventDialog?.kind === "participant-identities"
      ? eventDialog.message ?? ""
      : "";

  if (!duplicateGroups.length) {
    return `
      <section class="participant-identity-success" role="status">
        <span class="participant-identity-success-mark" aria-hidden="true">✓</span>
        <span>
          <h3>${reviewMessage ? escapeHtml(reviewMessage) : "אין שמות שדורשים בדיקה"}</h3>
          <p>אפשר לחזור לרשימת המשתתפים.</p>
        </span>
      </section>
    `;
  }

  return `
    <section class="participant-identity-review" aria-labelledby="participant-identity-title">
      <div class="participant-identity-heading">
        <span class="participant-identity-mark" aria-hidden="true">i</span>
        <span>
          <h3 id="participant-identity-title">בדיקה קצרה לפני שמאחדים</h3>
          <p>שמות דומים לא מתאחדים אוטומטית. בוחרים רק כשבטוחים.</p>
        </span>
      </div>
      ${reviewMessage ? `<p class="participant-identity-resolved" role="status">${escapeHtml(reviewMessage)}</p>` : ""}
      ${
        unresolvedPairs.length
          ? `<div class="participant-identity-pairs">
              ${unresolvedPairs
                .map((pair) =>
                  renderDuplicateParticipantPair(event, pair, canManage)
                )
                .join("")}
            </div>`
          : `<p class="participant-identity-resolved" role="status">הבדיקה הושלמה.</p>`
      }
      ${
        canManage && aliasParticipants.length
          ? `<details class="participant-aliases">
              <summary>רוצה להבדיל ביניהם בקלות?</summary>
              <p>אפשר להוסיף כינוי קצר שיופיע רק באירוע הזה, כמו "מהעבודה" או "בן דוד".</p>
              <div class="participant-alias-list">
                ${aliasParticipants
                  .map((participant) =>
                    renderParticipantAliasEditor(event, participant)
                  )
                  .join("")}
              </div>
            </details>`
          : ""
      }
    </section>
  `;
}

function renderDuplicateParticipantPair(event, pair, canManage) {
  const canConnect = Boolean(pair.mergeSourceId && pair.mergeTargetId);
  const source = canConnect
    ? state.participants.find((participant) => participant.id === pair.mergeSourceId)
    : null;
  const target = canConnect
    ? state.participants.find((participant) => participant.id === pair.mergeTargetId)
    : null;
  const leftName = participantName(pair.left.id, event);
  const rightName = participantName(pair.right.id, event);

  return `
    <article class="participant-identity-pair">
      <div class="participant-identity-question">
        <h3>${escapeHtml(leftName)} ו-${escapeHtml(rightName)} — אותו אדם?</h3>
        <p>אם זה אותו אדם, אפשר לאחד לחשבון אחד. כל ההוצאות וההעברות יישמרו.</p>
      </div>
      <div class="participant-identity-people">
        ${[pair.left, pair.right]
          .map(
            (participant) => `
              <span class="participant-identity-person">
                ${renderAvatar(participant.id, event)}
                <span>
                  <strong>${escapeHtml(participantName(participant.id, event))}</strong>
                  ${renderParticipantConnectionBadge(participant)}
                </span>
              </span>
            `
          )
          .join("")}
      </div>
      ${
        canManage
          ? `<div class="participant-identity-actions">
              ${
                canConnect
                  ? `<button
                      class="primary-button"
                      type="button"
                      data-action="connect-duplicate-participant"
                      data-event-id="${escapeAttribute(event.id)}"
                      data-source-participant-id="${escapeAttribute(source.id)}"
                      data-target-participant-id="${escapeAttribute(target.id)}"
                    >כן, אותו אדם</button>`
                  : `<p class="participant-identity-connected-note">
                      שני השמות שייכים למשתמשים מחוברים. הם יישארו חשבונות נפרדים.
                    </p>`
              }
              <button
                class="secondary-button"
                type="button"
                data-action="keep-duplicate-participants"
                data-event-id="${escapeAttribute(event.id)}"
                data-participant-pair="${escapeAttribute(pair.key)}"
              >לא, אנשים שונים</button>
              <button
                class="participant-identity-defer"
                type="button"
                data-action="defer-duplicate-participant"
                data-event-id="${escapeAttribute(event.id)}"
              >לא בטוח, אחר כך</button>
            </div>`
          : `<p class="participant-identity-manager-note">מנהל האירוע יכול לאשר את הזהויות.</p>`
      }
    </article>
  `;
}

function renderParticipantAliasEditor(event, participant) {
  const alias = event.participantAliases?.[participant.id] ?? "";
  return `
    <label class="participant-alias-row">
      <span>${escapeHtml(participant.displayName)}</span>
      <span class="participant-alias-control">
        <input
          type="text"
          name="participantAlias"
          maxlength="32"
          autocomplete="off"
          enterkeyhint="done"
          data-action="participant-alias"
          data-event-id="${escapeAttribute(event.id)}"
          data-participant-id="${escapeAttribute(participant.id)}"
          value="${escapeAttribute(alias)}"
          placeholder="כינוי קצר"
          aria-label="כינוי עבור ${escapeAttribute(participant.displayName)}"
        />
        <button
          class="secondary-button"
          type="button"
          data-action="save-participant-alias"
          data-event-id="${escapeAttribute(event.id)}"
          data-participant-id="${escapeAttribute(participant.id)}"
        >שמור</button>
      </span>
    </label>
  `;
}

function renderEventSettingsManagementDialog(event) {
  const canManage = canCurrentParticipantManage(event);
  const adminNames =
    eventAdminIds(state, event)
      .map((participantId) => participantName(participantId, event))
      .join(", ") || "אין מנהל";

  return renderEventDialogShell({
    eyebrow: "הגדרות",
    title: "אופן ניהול",
    description: `מנהל האירוע: ${adminNames}`,
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
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
  const hasExistingExpenses = event.expenses.length > 0;

  return renderEventDialogShell({
    eyebrow: "הגדרות",
    title: "מטבע האירוע",
    description: "כל הסכומים באירוע מוצגים באותו מטבע.",
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
    body: `
      <label class="field event-currency-field section">
        <span>מטבע האירוע</span>
        <select
          data-action="event-currency"
          name="eventCurrency"
          data-event-id="${event.id}"
          ${!canManage ? "disabled" : ""}
        >
          ${renderCurrencyOptions(event.currency)}
        </select>
        <small>${
          !canManage
            ? "רק מנהל האירוע יכול לשנות את המטבע."
            : hasExistingExpenses
              ? "אפשר לשנות. לפני העדכון נבקש אישור, כי הסכומים הקיימים לא יומרו לפי שער חליפין."
              : "המטבע יחול על כל ההוצאות וההעברות באירוע."
        }</small>
      </label>
    `
  });
}

function renderEventSettingsRepaymentDialog(event) {
  const canManage = canCurrentParticipantManage(event);
  const direct = usesDirectSettlementTransfers(event);

  return renderEventDialogShell({
    eyebrow: "הגדרות",
    title: "חלוקת ההחזרים",
    description: "בוחרים אם לקזז בין כולם או להחזיר ישירות למי ששילם.",
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
    body: `
      <fieldset class="event-management-field event-repayment-field">
        <legend>איך לחלק את ההחזרים?</legend>
        <div class="event-management-options" role="radiogroup" aria-label="אופן חישוב ההעברות">
          ${[
            {
              id: "optimized",
              enabled: false,
              title: "קיזוז חכם (מומלץ)",
              description: "כל אחד משלם בדיוק את היתרה שלו, בפחות העברות. המקבל לא תמיד מי ששילם עבורו."
            },
            {
              id: "direct",
              enabled: true,
              title: "החזר לפי מי ששילם",
              description: "כל אחד מחזיר ישירות למי שמימן יותר. קל לעקוב, אבל בדרך כלל יש יותר העברות."
            }
          ]
            .map((option, index) => {
              const selected = direct === option.enabled;
              return `
                <button
                  type="button"
                  class="event-management-option ${selected ? "is-active" : ""}"
                  data-action="set-event-repayment-mode"
                  data-event-id="${event.id}"
                  data-repayment-mode="${option.id}"
                  role="radio"
                  aria-checked="${selected}"
                  tabindex="${selected || (!direct && index === 0) ? "0" : "-1"}"
                  ${!canManage ? "disabled" : ""}
                >
                  <span class="event-management-copy">
                    <strong>${option.title}</strong>
                    <small>${option.description}</small>
                  </span>
                  <span class="event-management-check app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </fieldset>
      <p class="event-setting-note">
        ${direct
          ? "נבחר כרגע: החזר לפי מי ששילם. לא מקזזים דרך חברים אחרים, ולכן ייתכנו יותר העברות."
          : "נבחר כרגע: קיזוז חכם. לדוגמה, אם דני חייב למאור 50 ₪ ומאור חייב לאבי 50 ₪, דני יעביר 50 ₪ ישירות לאבי."}
      </p>
      <p class="event-setting-note">סימוני תשלום שכבר בוצעו נשמרים. לא יוצגו העברות נגדיות או כפולות.</p>
      ${!canManage ? '<p class="event-setting-note">רק מנהל האירוע יכול לשנות את ההגדרה.</p>' : ""}
    `
  });
}

function renderEventSettingsRoundingDialog(event) {
  const canManage = canCurrentParticipantManage(event);
  const rounded = usesRoundedSettlementTransfers(event);

  return renderEventDialogShell({
    eyebrow: "הגדרות",
    title: "עיגול סכומים",
    description: "בוחרים אם ההעברות הסופיות יהיו נוחות או מדויקות עד האגורה.",
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
    body: `
      <fieldset class="event-management-field event-rounding-field">
        <legend>איך להציג את ההעברות?</legend>
        <div class="event-management-options" role="radiogroup" aria-label="עיגול סכומי ההעברות">
          ${[
            {
              id: "rounded",
              enabled: true,
              title: "סכומים נוחים (מומלץ)",
              description: "מעגלים רק את ההעברות שנותרו לשקל שלם ומאזנים את ההפרש בין כולם."
            },
            {
              id: "exact",
              enabled: false,
              title: "דיוק מלא",
              description: "כל העברה נשארת מדויקת עד האגורה."
            }
          ]
            .map((option, index) => {
              const selected = rounded === option.enabled;
              return `
                <button
                  type="button"
                  class="event-management-option ${selected ? "is-active" : ""}"
                  data-action="set-event-rounding-mode"
                  data-event-id="${event.id}"
                  data-rounding-mode="${option.id}"
                  role="radio"
                  aria-checked="${selected}"
                  tabindex="${selected || (!rounded && index === 1) ? "0" : "-1"}"
                  ${!canManage ? "disabled" : ""}
                >
                  <span class="event-management-copy">
                    <strong>${option.title}</strong>
                    <small>${option.description}</small>
                  </span>
                  <span class="event-management-check app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </fieldset>
      <p class="event-setting-note">סכומי ההוצאות תמיד נשמרים בדיוק כפי שהוזנו. העיגול משפיע רק על ההעברות הסופיות.</p>
      ${!canManage ? '<p class="event-setting-note">רק מנהל האירוע יכול לשנות את ההגדרה.</p>' : ""}
    `
  });
}

function renderEventSettingsActivityDialog(event) {
  const entries = eventActivityEntries(event);

  return renderEventDialogShell({
    eyebrow: "הגדרות",
    title: "פעילות באירוע",
    description: "הפעולות החשובות נשמרות כאן לפי סדר הזמן.",
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
    body: `
      <section class="event-activity-panel" aria-labelledby="event-activity-heading">
        <h3 id="event-activity-heading" class="visually-hidden">היסטוריית הפעילות</h3>
        ${
          entries.length
            ? `<ol class="event-activity-list">
                ${entries.map((entry) => renderEventActivityEntry(event, entry)).join("")}
              </ol>`
            : `<p class="event-activity-empty">עוד אין פעילות שנשמרה באירוע.</p>`
        }
      </section>
    `
  });
}

function renderEventActivityEntry(event, entry) {
  const copy = eventActivityCopy(event, entry);
  const actorName = participantName(entry.actorParticipantId, event);
  const dateLabel = formatRelativeCalendarDate(entry.occurredAt);
  const timeLabel = formatClockTime(entry.occurredAt);

  return `
    <li class="event-activity-item" data-activity-kind="${escapeAttribute(entry.kind)}">
      <span class="event-activity-marker" aria-hidden="true"></span>
      <span class="event-activity-copy">
        <strong>${escapeHtml(copy.title)}</strong>
        ${copy.detail ? `<span>${escapeHtml(copy.detail)}</span>` : ""}
        <small>
          ${escapeHtml(actorName)}
          <span aria-hidden="true"> · </span>
          <time datetime="${escapeAttribute(entry.occurredAt)}">
            ${escapeHtml(dateLabel)}
            <span aria-hidden="true"> · </span>
            <span class="font-num" dir="ltr">${escapeHtml(timeLabel)}</span>
          </time>
        </small>
      </span>
    </li>
  `;
}

function eventActivityCopy(event, entry) {
  const subjectName = participantName(entry.subjectParticipantId, event);
  const expenseLabel = entry.label || "הוצאה";

  switch (entry.kind) {
    case "event-created":
      return { title: "האירוע נוצר", detail: "" };
    case "event-closed":
      return { title: "האירוע נסגר", detail: "האירוע ננעל לעריכה" };
    case "event-reopened":
      return { title: "האירוע נפתח מחדש", detail: "אפשר לחזור ולעדכן" };
    case "expense-created":
      return { title: "נוספה הוצאה", detail: expenseLabel };
    case "expense-updated":
      return { title: "הוצאה עודכנה", detail: expenseLabel };
    case "expense-deleted":
      return { title: "הוצאה נמחקה", detail: expenseLabel };
    case "participant-added":
      return { title: `${subjectName} נוסף לאירוע`, detail: "" };
    case "participant-restored":
      return { title: `${subjectName} חזר לאירוע`, detail: "" };
    case "participant-removed":
      return { title: `${subjectName} הוסר מהאירוע`, detail: "" };
    case "participant-left":
      return { title: `${subjectName} עזב את האירוע`, detail: "" };
    case "transfer-paid":
      return {
        title: "העברה סומנה כשולמה",
        detail: `${participantName(entry.fromParticipantId, event)} אל ${participantName(entry.toParticipantId, event)}`
      };
    case "transfer-pending":
      return {
        title: "סימון תשלום בוטל",
        detail: `${participantName(entry.fromParticipantId, event)} אל ${participantName(entry.toParticipantId, event)}`
      };
    default:
      return { title: "האירוע עודכן", detail: "" };
  }
}

function renderEventSettingsLockDialog(event) {
  const canManage = canCurrentParticipantManage(event);

  return renderEventDialogShell({
    eyebrow: "הגדרות",
    title: "עריכת האירוע",
    description: "נעילה מונעת שינוי בהוצאות ובמשתתפים עד שפותחים שוב.",
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
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
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
    body: `
      <section class="event-danger-zone section">
        <div class="event-danger-zone-heading">
          <span class="event-danger-zone-icon" aria-hidden="true">${iconSvg("log-out")}</span>
          <div>
            <strong>עזיבת האירוע</strong>
            <p class="muted">אפשר לעזוב גם כשיש הוצאות על שמך. ההיסטוריה תישמר כשם אופליין; מנהל יחיד צריך קודם להעביר ניהול.</p>
          </div>
        </div>
        <button class="secondary-button danger-button" data-action="leave-event" data-event-id="${event.id}" ${!canLeave ? "disabled" : ""}>עזוב אירוע</button>
      </section>
      <section class="event-danger-zone event-delete-zone section">
        <div class="event-danger-zone-heading">
          <span class="event-danger-zone-icon" aria-hidden="true">${iconSvg("trash")}</span>
          <div>
            <strong>מחיקת האירוע</strong>
            <p class="muted">מחיקה מסירה את האירוע לכל המשתתפים וזמינה למנהל בלבד.</p>
          </div>
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
      <span class="event-settings-menu-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
    </button>
  `;
}

function renderEventSettingsMenuIcon(section) {
  const icons = {
    management: "user-check",
    currency: "coins",
    repayment: "transfers",
    rounding: "calculator",
    activity: "history",
    lock: "edit",
    danger: "trash"
  };

  return `<span class="event-settings-menu-icon" aria-hidden="true">${iconSvg(icons[section] ?? icons.management)}</span>`;
}

function renderInviteStatus(event, ready, available = ready) {
  const publicSharingReady = runtimeConfig.launch.shareLinksReady;
  const failed = eventSharePreparationState(event).status === "error";
  const stateLabel = failed
    ? "נדרש חיבור כדי להכין את הקישור"
    : ready
    ? ""
    : available
      ? "הקישור לא זמין כרגע"
      : "מכינים את הקישור…";

  return `
    <section
      class="invite-status event-invite-pass ${failed ? "is-error" : ready ? "is-ready" : "is-local"} ${publicSharingReady ? "is-public" : "is-snapshot"}"
      aria-label="כרטיס הצטרפות לאירוע ${escapeAttribute(event.name)}"
    >
      <div class="event-invite-pass-main">
        ${renderCommandIcon("share")}
        <span class="event-invite-pass-copy">
          <small>כרטיס כניסה לאירוע</small>
          <strong>${escapeHtml(event.name)}</strong>
          <span>קישור ישיר שמכניס את החברים לאירוע</span>
        </span>
      </div>
      ${
        stateLabel
          ? `<span class="event-invite-pass-stub">
              <span class="event-invite-pass-state">${stateLabel}</span>
            </span>`
          : ""
      }
    </section>
  `;
}

function eventInviteUrl(eventId) {
  const event = getEvent(eventId);
  const inviteToken = currentEventOpenInviteToken(event);
  const cloudInvite =
    runtimeConfig.storage?.mode === "supabase" ||
    Boolean(eventShareCredentials(event)) ||
    Boolean(inviteToken);
  const referralCode = currentReferralInviteCode();
  return buildEventInviteUrl(
    runtimePublicOrigin(runtimeConfig),
    eventId,
    cloudInvite ? null : buildEventInviteSnapshot(state, eventId),
    inviteToken
      ? {
          inviteToken,
          referralCode
        }
      : { referralCode }
  );
}

function currentReferralInviteCode() {
  return normalizeReferralCode(
    globalThis.SogrimMonetization?.status?.referralCode
  );
}

async function prepareReferralForEventInvite() {
  const monetization = globalThis.SogrimMonetization;
  if (!monetization?.refresh || monetization.status?.status === "ready") return;
  // The event link also acts as the referral link for a new account. Wait for
  // the referral code before composing the URL so the earned ad-free month is
  // not lost when sharing immediately after sign-in.
  await monetization.refresh();
}

function renderExpenseForm(event) {
  const participants = expenseParticipantsForCurrentDraft(event);
  const canEdit = canCurrentParticipantEdit(event);
  if (expenseDraft.notesOnly) {
    return renderExpenseNotesDialog(event, canEdit);
  }
  const isRestaurantEvent =
    eventTypeConfig(event.eventType).id === EVENT_TYPE_RESTAURANT;
  const isTripEvent = eventTypeConfig(event.eventType).id === EVENT_TYPE_TRIP;
  if (expenseDraft.mode === "items" && !expenseDraft.id && isRestaurantEvent) {
    return renderQuickExpenseForm(event, participants, canEdit);
  }
  if (expenseDraft.mode === "items") expenseDraft.mode = "single";
  const flowStep = normalizeExpenseFlowStep(expenseDraft.flowStep);
  expenseDraft.flowStep = flowStep;
  const flowMeta = expenseFlowMeta(flowStep);
  if (flowStep === "participants" && expenseDraft.participantAddView) {
    return renderExpenseParticipantAddRoute(event, canEdit);
  }

  return `
    <section class="expense-modal-backdrop expense-route-backdrop" aria-label="חלון הוצאה">
      <section class="panel expense-modal expense-step-modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title" aria-describedby="expense-modal-description" data-event-id="${event.id}" data-currency="${eventCurrency(event)}" data-expense-step="${flowStep}" tabindex="-1">
        <div class="expense-modal-header expense-modal-step-header">
          <div>
            <p class="eyebrow">${expenseDraft.id ? "עריכת הוצאה" : expenseDraft.restaurantEqualSplit ? "חלוקה שווה" : isTripEvent ? "הוצאה בטיול" : "הוספת הוצאה"} · שלב ${flowMeta.number} מתוך ${flowMeta.total}</p>
            <h2 id="expense-modal-title">${escapeHtml(flowMeta.title)}</h2>
            <p class="muted" id="expense-modal-description">${escapeHtml(flowMeta.description)}</p>
            ${flowStep === "amount" ? renderRestoredDraftNote() : ""}
          </div>
          <div class="expense-modal-header-actions">
            <button class="accessibility-entry-button accessibility-entry-header expense-accessibility-button" data-open-accessibility type="button" aria-label="פתיחת הגדרות נגישות" title="נגישות"><span aria-hidden="true">${iconSvg("accessibility")}</span></button>
            ${
              flowMeta.number > 1 || expenseDraft.restaurantEqualSplit
                ? `<button class="icon-button modal-section-back-button" data-action="expense-step-back" aria-label="חזרה לשלב הקודם" title="חזרה לשלב הקודם"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>`
                : `<button class="icon-button modal-section-back-button" data-action="cancel-expense" aria-label="חזרה לאירוע" title="חזרה לאירוע"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>`
            }
          </div>
        </div>

      ${renderExpenseFlowProgress(flowStep)}
      <p class="expense-loop-status" role="status" aria-live="polite" hidden></p>
      <p class="expense-sync-status" data-inline-sync-status role="status" aria-live="polite" hidden></p>
      ${!canEdit ? `<p class="notice" role="status">${escapeHtml(editBlockedMessage(event))}</p>` : ""}
      <fieldset class="expense-flow-fields" ${!canEdit ? "disabled" : ""}>
      <div class="expense-flow-body">
      <label class="field expense-total-field">
        <span>סכום כולל <span class="currency-input-badge font-num" dir="ltr">${escapeHtml(currencyCompactLabel(event))}</span></span>
        <input data-action="expense-total" name="expenseTotal" autocomplete="off" inputmode="decimal" enterkeyhint="next" dir="ltr" value="${escapeAttribute(expenseDraft.total)}" placeholder="0.00" ${expenseFlowFieldErrorAttributes("amount")} />
      </label>
      <label class="field expense-name-field">
        <span>שם ההוצאה</span>
        <input data-action="expense-name" name="expenseName" autocomplete="off" enterkeyhint="next" value="${escapeAttribute(expenseDraft.name)}" placeholder="לדוגמה: מונית או ארוחת ערב" ${expenseFlowFieldErrorAttributes("name")} />
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

      ${renderExpenseModeSwitch(event)}

      <details class="expense-details-panel" open>
        <summary>
          <span class="expense-details-summary-copy">
            <span class="expense-details-summary-label">${isTripEvent ? "חלוקה ומשלמים" : "חלוקה, משלמים ותאריך"}</span>
            ${renderExpenseDetailsSummary(event, participants)}
          </span>
        </summary>

        <div class="expense-details-body">
          ${isTripEvent ? "" : renderExpenseDateField()}

          <section class="section expense-payer-section" ${expenseFlowFieldErrorAttributes("payer")}>
            <h3>מי שילם וכמה?</h3>
            <div class="payer-list">
              ${expenseDraft.payers
                .map(
                  (payer, index) => `
                    <div class="payer-row">
                      <select data-action="expense-payer-id" data-index="${index}" name="expensePayerId-${index}" aria-label="משלם ${index + 1}">
                        ${participants
                          .map(
                            (participant) => `
                              <option value="${participant.id}" ${payer.participantId === participant.id ? "selected" : ""}>
                                ${escapeHtml(`${participant.displayName} · ${participantConnectionStatus(participant).label}`)}
                              </option>
                            `
                          )
                          .join("")}
                        <option value="${ADD_PAYER_PARTICIPANT_VALUE}" ${expenseDraft.inlinePayerGuestIndex === index ? "selected" : ""}>
                          + הוסף שם חדש
                        </option>
                      </select>
                      <input data-action="expense-payer-amount" data-index="${index}" name="expensePayerAmount-${index}" autocomplete="off" inputmode="decimal" enterkeyhint="next" dir="ltr" aria-label="סכום ששילם משלם ${index + 1}" value="${escapeAttribute(payer.amount)}" placeholder="כמה שילם" />
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
                                name="expenseNewPayerName-${index}"
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
            ${renderExpensePayerDifferenceAssignment(event)}
            ${renderExpensePayerSummary()}
            <button
              class="secondary-button section expense-add-payer-button"
              data-action="add-payer"
              type="button"
              aria-label="יותר מאדם אחד שילם? הוסף משלם נוסף"
            >
              <span>יותר מאדם אחד שילם?</span>
              <strong>הוסף משלם נוסף</strong>
            </button>
          </section>

          <section class="section expense-participant-section" ${expenseFlowFieldErrorAttributes("participants")}>
            <h3>מי שותף בהוצאה?</h3>
            ${renderParticipantChecks(expenseDraft.sharedByParticipantIds, "expense-shared", event)}
            ${renderExpenseParticipantToolbar(event, participants)}
          </section>

          <button
            class="expense-participant-add-launch"
            type="button"
            data-action="expense-open-participant-add"
            ${canEdit ? "" : "disabled"}
          >
            <span class="expense-participant-add-launch-icon" aria-hidden="true">${iconSvg("user-plus")}</span>
            <span>
              <strong>הוסף משתתף</strong>
              <small>חבר, קישור או שם אופליין</small>
            </span>
            <span class="expense-participant-add-launch-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
          </button>
        </div>
      </details>

      ${flowStep === "review" ? renderExpenseFlowReview(event, participants) : ""}
      ${expenseDraft.error ? `<p class="error" id="expense-form-error" role="alert" tabindex="-1">${escapeHtml(expenseDraft.error)}</p>` : ""}
      </div>
      </fieldset>

      <div class="actions section expense-modal-actions ${flowStep === "review" ? "is-review" : "is-next"}">
        ${
          flowStep === "review"
            ? `
                <button class="primary-button" data-action="save-expense" data-event-id="${event.id}" ${canEdit && expenseFlowReady("review") ? "" : "disabled"}>${expenseDraft.id ? "שמור שינויים" : "שמור הוצאה"}</button>
                ${
                  expenseDraft.id
                    ? ""
                    : `<button class="secondary-button expense-save-more" data-action="save-expense-and-continue" data-event-id="${event.id}" ${canEdit && expenseFlowReady("review") ? "" : "disabled"}>שמור והוסף עוד</button>`
                }
              `
            : `<button class="primary-button expense-step-next" data-action="expense-step-next" type="button" ${canEdit ? "" : "disabled"}>${escapeHtml(expenseFlowNextLabel(flowStep))}</button>`
        }
      </div>
      </section>
      ${renderEventRoutePrimaryNav()}
    </section>
  `;
}

function renderExpenseParticipantToolbar(event, participants) {
  const availableIds = participants.map((participant) => participant.id);
  const availableIdSet = new Set(availableIds);
  const selectedIds = [
    ...new Set(
      expenseDraft.sharedByParticipantIds.filter((participantId) =>
        availableIdSet.has(participantId)
      )
    )
  ];
  const allSelected =
    availableIds.length > 0 && selectedIds.length === availableIds.length;

  return `
    <div class="expense-participant-toolbar" data-expense-participant-toolbar ${allSelected ? "hidden" : ""}>
      <button class="expense-select-all-compact" type="button" data-action="expense-select-all">
        <span aria-hidden="true">${iconSvg("check")}</span>
        <span>סמן את כולם</span>
      </button>
    </div>
  `;
}

function renderExpenseNotesDialog(event, canEdit) {
  return `
    <section class="expense-modal-backdrop expense-route-backdrop" aria-label="הערות ותמונה להוצאה">
      <section class="panel expense-modal expense-notes-modal" role="dialog" aria-modal="true" aria-labelledby="expense-notes-title" tabindex="-1">
        <div class="expense-modal-header expense-modal-step-header">
          <div>
            <p class="eyebrow">${escapeHtml(expenseDraft.name)}</p>
            <h2 id="expense-notes-title">הערות ותמונה</h2>
          </div>
          <div class="expense-modal-header-actions">
            <button class="accessibility-entry-button accessibility-entry-header expense-accessibility-button" data-open-accessibility type="button" aria-label="פתיחת הגדרות נגישות" title="נגישות"><span aria-hidden="true">${iconSvg("accessibility")}</span></button>
            <button class="icon-button modal-section-back-button" data-action="cancel-expense" aria-label="חזרה לאירוע" title="חזרה לאירוע"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>
          </div>
        </div>
        <fieldset class="expense-flow-fields" ${!canEdit ? "disabled" : ""}>
          <label class="field">
            <span>הערה <small>(לא חובה)</small></span>
            <textarea data-action="expense-notes" rows="5" maxlength="500" placeholder="לדוגמה: כתובת, פרטי הזמנה או מידע שחשוב לזכור">${escapeHtml(expenseDraft.notes ?? "")}</textarea>
          </label>
          <div class="expense-attachment-control">
            <label class="secondary-button expense-attachment-upload">
              <span aria-hidden="true">${iconSvg("receipt")}</span>
              <span>${expenseDraft.attachmentImage ? "החלף מהגלריה" : "הוסף מהגלריה"}</span>
              <input data-action="expense-attachment-image" type="file" accept="image/*" hidden />
            </label>
            <button class="secondary-button expense-attachment-upload" type="button" data-action="capture-expense-attachment" aria-label="פתיחת המצלמה">
              <span aria-hidden="true">${iconSvg("camera")}</span>
              <span>מצלמה</span>
            </button>
            <input data-action="expense-attachment-image" data-image-source="camera-fallback" type="file" accept="image/*" capture="environment" hidden />
            ${expenseDraft.attachmentImage ? `
              <img class="expense-attachment-preview" src="${escapeAttribute(expenseDraft.attachmentImage)}" alt="תמונה מצורפת להוצאה" />
              <button class="secondary-button" type="button" data-action="remove-expense-attachment">הסר תמונה</button>
            ` : ""}
          </div>
        </fieldset>
        <div class="actions expense-notes-actions">
          <button class="primary-button" type="button" data-action="save-expense" data-event-id="${escapeAttribute(event.id)}" ${!canEdit ? "disabled" : ""}>שמור</button>
        </div>
      </section>
      ${renderEventRoutePrimaryNav()}
    </section>`;
}

function expenseAvailableFriendParticipants(event) {
  const friendParticipantIds = new Set(activeFriendParticipantIds(state));
  const activeParticipantIds = new Set(
    activeEventParticipants(event).map((participant) => participant.id)
  );

  return state.participants
    .filter(
      (participant) =>
        participant.id !== state.currentParticipantId &&
        friendParticipantIds.has(participant.id) &&
        participantConnectionStatus(participant).connected &&
        !activeParticipantIds.has(participant.id)
    )
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "he"));
}

function renderExpenseParticipantAddRoute(event, canEdit) {
  const view = ["friends", "offline"].includes(expenseDraft.participantAddView)
    ? expenseDraft.participantAddView
    : "menu";
  const friends = expenseAvailableFriendParticipants(event);
  const invitationMessage = String(expenseDraft?.participantInviteMessage ?? "").trim();
  const title = view === "friends"
    ? "בחר חבר"
    : view === "offline"
      ? "שם אופליין"
      : "איך להוסיף?";
  const description = view === "friends"
    ? "בחירה תוסיף את החבר לאירוע ולהוצאה."
    : view === "offline"
      ? "למי שלא יתחבר לאפליקציה."
      : "בוחרים דרך אחת וממשיכים.";

  return `
    <section class="expense-modal-backdrop expense-route-backdrop" aria-label="הוספת משתתף להוצאה">
      <section
        class="panel expense-modal expense-step-modal expense-participant-add-route"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-participant-add-title"
        aria-describedby="expense-participant-add-description"
        data-event-id="${escapeAttribute(event.id)}"
        data-expense-step="participants"
        data-expense-participant-add-view="${view}"
        tabindex="-1"
      >
        <div class="expense-modal-header expense-modal-step-header">
          <div>
            <p class="eyebrow">הוספת הוצאה · משתתפים</p>
            <h2 id="expense-participant-add-title">${escapeHtml(title)}</h2>
            <p class="muted" id="expense-participant-add-description">${escapeHtml(description)}</p>
          </div>
          <div class="expense-modal-header-actions">
            <button class="accessibility-entry-button accessibility-entry-header expense-accessibility-button" data-open-accessibility type="button" aria-label="פתיחת הגדרות נגישות" title="נגישות"><span aria-hidden="true">${iconSvg("accessibility")}</span></button>
            <button class="icon-button modal-section-back-button" data-action="expense-participant-add-back" aria-label="חזרה" title="חזרה"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>
          </div>
        </div>
        ${renderExpenseFlowProgress("participants")}
        <p class="expense-loop-status" role="status" aria-live="polite" hidden></p>
        <p class="expense-sync-status" data-inline-sync-status role="status" aria-live="polite" hidden></p>
        ${!canEdit ? `<p class="notice" role="status">${escapeHtml(editBlockedMessage(event))}</p>` : ""}
        <fieldset class="expense-flow-fields" ${!canEdit ? "disabled" : ""}>
          <div class="expense-flow-body expense-participant-add-route-body">
            ${view === "menu" ? renderExpenseParticipantAddMenu(event, friends, canEdit) : ""}
            ${view === "friends" ? renderExpenseParticipantFriendList(event, friends, canEdit) : ""}
            ${view === "offline" ? renderExpenseParticipantOfflineForm(event, canEdit) : ""}
            ${invitationMessage ? `<p class="expense-participant-invite-message" role="status">${escapeHtml(invitationMessage)}</p>` : ""}
          </div>
        </fieldset>
      </section>
      ${renderEventRoutePrimaryNav()}
    </section>
  `;
}

function renderExpenseParticipantAddMenu(event, friends, canEdit) {
  return `
    <div class="expense-participant-add-menu" aria-label="דרכים להוספת משתתף">
      <button
        class="expense-participant-choice"
        type="button"
        data-action="expense-participant-add-view"
        data-view="friends"
        ${friends.length && canEdit ? "" : "disabled"}
      >
        <span class="expense-participant-choice-icon" aria-hidden="true">${iconSvg("users")}</span>
        <span><strong>מהחברים שלי</strong><small>${friends.length ? "בחר משתמש שכבר מחובר אליך" : "אין כרגע חבר נוסף להוספה"}</small></span>
        <span class="expense-participant-choice-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </button>
      <button
        class="expense-participant-choice"
        type="button"
        data-action="expense-share-invite"
        data-event-id="${escapeAttribute(event.id)}"
        ${canEdit ? "" : "disabled"}
      >
        <span class="expense-participant-choice-icon" aria-hidden="true">${iconSvg("share")}</span>
        <span><strong>הזמן בקישור</strong><small>שלח קישור הצטרפות לאירוע</small></span>
        <span class="expense-participant-choice-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </button>
      <button
        class="expense-participant-choice"
        type="button"
        data-action="expense-participant-add-view"
        data-view="offline"
        ${canEdit ? "" : "disabled"}
      >
        <span class="expense-participant-choice-icon" aria-hidden="true">${iconSvg("edit")}</span>
        <span><strong>שם אופליין</strong><small>למי שלא יתחבר לאפליקציה</small></span>
        <span class="expense-participant-choice-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </button>
    </div>
  `;
}

function renderExpenseParticipantFriendList(event, friends, canEdit) {
  if (!friends.length) {
    return '<p class="expense-participant-add-empty">אין כרגע חברים נוספים שאפשר להוסיף.</p>';
  }

  return `
    <div class="expense-participant-friend-list">
      ${friends
        .map(
          (participant) => `
            <button
              class="expense-participant-friend-option"
              type="button"
              data-action="expense-add-friend-participant"
              data-event-id="${escapeAttribute(event.id)}"
              data-participant-id="${escapeAttribute(participant.id)}"
              ${canEdit ? "" : "disabled"}
            >
              ${renderAvatar(participant.id, event)}
              <span>
                <strong>${escapeHtml(participantName(participant.id, event))}</strong>
                ${renderParticipantUsername(participant)}
              </span>
              <b>הוסף</b>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderExpenseParticipantOfflineForm(event, canEdit) {
  return `
    <div class="expense-participant-offline-form">
      <label class="field">
        <span>שם פרטי ומשפחה</span>
        <input class="guest-input" data-action="event-guest-name" name="expenseGuestName" autocomplete="off" enterkeyhint="done" placeholder="שם פרטי ושם משפחה" ${canEdit ? "" : "disabled"} />
      </label>
      <button class="primary-button" data-action="event-add-guest" data-event-id="${escapeAttribute(event.id)}" ${canEdit ? "" : "disabled"}>הוסף להוצאה</button>
    </div>
  `;
}

function applyExpenseParticipantPreset(mode, trigger) {
  const event = getEvent(expenseDraft?.eventId);
  if (!event) return;

  const participants = expenseParticipantsForCurrentDraft(event);
  const availableIds = participants.map((participant) => participant.id);
  const nextIds = availableIds;

  expenseDraft.sharedByParticipantIds = [...nextIds];
  expenseDraft.error = "";

  const dialog = trigger.closest(".expense-modal") ?? app;
  dialog
    .querySelectorAll('[data-action="expense-shared"]')
    .forEach((checkbox) => {
      if (!(checkbox instanceof HTMLInputElement)) return;
      checkbox.checked = nextIds.includes(checkbox.dataset.participantId);
      checkbox.closest(".participant-pill, .expense-participant-row")?.classList.toggle(
        "is-selected",
        checkbox.checked
      );
    });

  const toolbar = dialog.querySelector("[data-expense-participant-toolbar]");
  if (toolbar) {
    toolbar.outerHTML = renderExpenseParticipantToolbar(event, participants);
  }

  dialog.querySelector("#expense-form-error")?.remove();
  syncExpenseDetailsSummary();
  syncExpenseConfirmationSummary();
  syncExpenseFlowActionState();
  rememberExpenseDraft();
  replaceBrowserHistoryState();

  requestAnimationFrame(() => {
    dialog
      .querySelector('[data-action="expense-shared"]')
      ?.focus({ preventScroll: true });
  });
}

function normalizeExpenseFlowStep(step) {
  return EXPENSE_FLOW_STEPS.includes(step) ? step : "amount";
}

function expenseFlowStepsForDraft() {
  return EXPENSE_FLOW_STEPS;
}

function expenseFlowMeta(step) {
  const normalizedStep = normalizeExpenseFlowStep(step);
  const flowSteps = expenseFlowStepsForDraft();
  const copy = {
    amount: {
      title: "מה הסכום הכולל?",
      description: "זה כל מה שצריך בשלב הראשון."
    },
    name: {
      title: "על מה הייתה ההוצאה?",
      description: "אפשר לכתוב שם קצר או לבחור אחת מהאפשרויות."
    },
    payer: {
      title: "מי שילם?",
      description: "אם יותר מאדם אחד שילם, מוסיפים כאן משלם נוסף. היתרה תתמלא אוטומטית."
    },
    participants: {
      title: "מי השתתף בהוצאה?",
      description: "כולם מסומנים מראש. מורידים רק את מי שלא היה חלק."
    },
    review: {
      title: "הכול מוכן?",
      description: "בדיקה קצרה ושומרים את ההוצאה."
    }
  };

  return {
    ...copy[normalizedStep],
    number: flowSteps.indexOf(normalizedStep) + 1,
    total: flowSteps.length
  };
}

function expenseFlowFieldErrorAttributes(step) {
  const isInvalid =
    Boolean(expenseDraft?.error) &&
    normalizeExpenseFlowStep(expenseDraft?.flowStep) === step;
  return isInvalid
    ? 'aria-invalid="true" aria-describedby="expense-form-error"'
    : 'aria-invalid="false"';
}

function renderExpenseFlowProgress(step) {
  const flowSteps = expenseFlowStepsForDraft();
  const currentIndex = flowSteps.indexOf(normalizeExpenseFlowStep(step));
  return `
    <ol class="expense-flow-progress" aria-label="התקדמות בהוספת הוצאה">
      ${flowSteps.map((item, index) => {
        const stateClass =
          index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : "";
        const stepTitle = expenseFlowMeta(item).title;
        return `
          <li class="${stateClass}" ${index === currentIndex ? 'aria-current="step"' : ""}>
            <span>שלב ${index + 1} מתוך ${flowSteps.length}: ${escapeHtml(stepTitle)}</span>
          </li>
        `;
      }).join("")}
    </ol>
  `;
}

function renderExpenseFlowReview(event, participants) {
  const values = expenseDetailsSummaryValues(event, participants);
  let totalLabel = expenseDraft.total;
  try {
    totalLabel = formatEventMoney(event, parseMoneyInput(expenseDraft.total));
  } catch {
    // The amount step owns validation.
  }

  return `
    <section class="expense-flow-review" aria-label="סיכום ההוצאה לפני שמירה">
      <div class="expense-review-list">
        ${renderExpenseReviewRow("amount", "סכום", totalLabel)}
        ${renderExpenseReviewRow("name", "שם ההוצאה", expenseDraft.name.trim())}
        ${renderExpenseReviewRow("payer", "שילם", values.payer)}
        ${renderExpenseReviewRow("participants", "משתתפים", values.participants)}
        ${renderExpenseDateField("expense-review-date")}
      </div>
      <section class="expense-optional-details" aria-label="פרטים נוספים להוצאה">
        <label class="field">
          <span>הערות <small>(לא חובה)</small></span>
          <textarea data-action="expense-notes" rows="3" maxlength="500" placeholder="לדוגמה: כתובת, פרטי הזמנה או מידע שחשוב לזכור">${escapeHtml(expenseDraft.notes ?? "")}</textarea>
        </label>
        <div class="expense-attachment-control">
          <label class="secondary-button expense-attachment-upload">
            <span aria-hidden="true">${iconSvg("receipt")}</span>
            <span>${expenseDraft.attachmentImage ? "החלף מהגלריה" : "הוסף מהגלריה"}</span>
            <input data-action="expense-attachment-image" type="file" accept="image/*" hidden />
          </label>
          <button class="secondary-button expense-attachment-upload" type="button" data-action="capture-expense-attachment" aria-label="פתיחת המצלמה">
            <span aria-hidden="true">${iconSvg("camera")}</span>
            <span>מצלמה</span>
          </button>
          <input data-action="expense-attachment-image" data-image-source="camera-fallback" type="file" accept="image/*" capture="environment" hidden />
          ${expenseDraft.attachmentImage ? `
            <img class="expense-attachment-preview" src="${escapeAttribute(expenseDraft.attachmentImage)}" alt="תמונה מצורפת להוצאה" />
            <button class="secondary-button" type="button" data-action="remove-expense-attachment">הסר תמונה</button>
          ` : ""}
        </div>
      </section>
      ${renderExpenseConfirmationSummary(event, participants)}
    </section>
  `;
}

function renderExpenseReviewRow(step, label, value) {
  return `
    <button class="expense-review-row" type="button" data-action="expense-step-edit" data-step="${step}">
      <span>
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value || "לא הוזן")}</strong>
      </span>
      <span class="expense-review-edit" aria-hidden="true">${iconSvg("chevron-left")}</span>
    </button>
  `;
}

function expenseFlowReady(step = normalizeExpenseFlowStep(expenseDraft?.flowStep)) {
  if (!expenseDraft) return false;
  const normalizedStep = normalizeExpenseFlowStep(step);
  const event = getEvent(expenseDraft.eventId);
  const participantIds = new Set(event?.participantIds ?? []);
  const payerSummary = summarizePayerDraft(expenseDraft.total, expenseDraft.payers);
  const payerIds = expenseDraft.payers.map((payer) => payer.participantId).filter(Boolean);
  const payersAreKnown =
    payerIds.length > 0 &&
    payerIds.every((participantId) => participantIds.has(participantId)) &&
    new Set(payerIds).size === payerIds.length;
  const selectedParticipantIds = [
    ...new Set(
      expenseDraft.sharedByParticipantIds.filter((participantId) =>
        participantIds.has(participantId)
      )
    )
  ];

  const readiness = {
    amount: hasPositiveExpenseTotal(expenseDraft.total),
    name: expenseDraft.name.trim().length > 0,
    payer: payerSummary.balanced && payersAreKnown,
    participants: selectedParticipantIds.length > 0
  };

  if (normalizedStep === "review") {
    return Object.values(readiness).every(Boolean);
  }
  return Boolean(readiness[normalizedStep]);
}

function expenseFlowNextLabel(step) {
  const labels = {
    amount: "המשך לשם ההוצאה",
    name: "המשך למי שילם",
    payer: "המשך למשתתפים",
    participants: "בדיקה ושמירה"
  };
  return labels[normalizeExpenseFlowStep(step)] ?? "המשך";
}

function expenseFlowFocusSelector(step) {
  const selectors = {
    amount: '[data-action="expense-total"]',
    name: '[data-action="expense-name"]',
    payer: '[data-action="expense-payer-id"]',
    participants: '[data-action="expense-shared"]',
    review: '[data-action="save-expense"]'
  };
  return selectors[normalizeExpenseFlowStep(step)];
}

function advanceExpenseFlow() {
  if (!expenseDraft) return;
  const flowSteps = expenseFlowStepsForDraft();
  const currentStep = normalizeExpenseFlowStep(expenseDraft.flowStep);
  const currentIndex = flowSteps.indexOf(currentStep);
  if (currentIndex < 0 || currentIndex >= flowSteps.length - 1) return;
  if (!expenseFlowReady(currentStep)) {
    expenseDraft.error = expenseFlowValidationMessage(currentStep);
    render();
    activateExpenseEntryDialog();
    return;
  }

  expenseDraft.flowStep = flowSteps[currentIndex + 1];
  expenseDraft.error = "";
  render();
  activateExpenseEntryDialog();
}

function expenseFlowValidationMessage(step) {
  const normalizedStep = normalizeExpenseFlowStep(step);
  if (normalizedStep === "amount") return "יש להזין סכום גדול מאפס.";
  if (normalizedStep === "name") return "יש להזין שם קצר להוצאה.";
  if (normalizedStep === "participants") return "יש לבחור לפחות משתתף אחד בהוצאה.";

  if (normalizedStep === "payer") {
    const event = getEvent(expenseDraft?.eventId);
    const participantIds = new Set(event?.participantIds ?? []);
    const payerIds = expenseDraft?.payers
      ?.map((payer) => payer.participantId)
      .filter(Boolean) ?? [];
    const payersAreKnown =
      payerIds.length > 0 &&
      payerIds.every((participantId) => participantIds.has(participantId)) &&
      new Set(payerIds).size === payerIds.length;

    if (!payersAreKnown) return "יש לבחור משלם שונה לכל שורת תשלום.";

    const summary = summarizePayerDraft(expenseDraft?.total, expenseDraft?.payers);
    if (!summary.valid) return "יש להזין סכום תקין לכל משלם.";
    if (summary.remaining > 0) {
      return `נשאר לשייך ${formatEventMoney(event, summary.remaining)} למי ששילם.`;
    }
    if (summary.overpaid > 0) {
      return `סכומי המשלמים גבוהים ב-${formatEventMoney(event, summary.overpaid)} מהסכום הכולל.`;
    }
  }

  return "יש להשלים את השלב כדי להמשיך.";
}

function moveExpenseFlowTo(step) {
  if (!expenseDraft || !EXPENSE_FLOW_STEPS.includes(step)) return;
  expenseDraft.flowStep = step;
  expenseDraft.error = "";
  render();
  activateExpenseEntryDialog();
}

function expenseDialogRewindSteps() {
  const baseDepth = Number.isFinite(expenseDraft?.historyBaseDepth)
    ? expenseDraft.historyBaseDepth
    : Math.max(0, appHistoryDepth - 1);
  return Math.max(1, appHistoryDepth - baseDepth);
}

function syncExpenseFlowActionState() {
  if (!expenseDraft) return;
  const nextButton = app.querySelector('[data-action="expense-step-next"]');
  if (nextButton instanceof HTMLButtonElement) {
    nextButton.disabled = !expenseFlowReady(expenseDraft.flowStep);
  }
}

function renderExpenseDateField(extraClass = "", label = "תאריך ההוצאה") {
  return `
    <label class="field expense-date-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input data-action="expense-date" name="expenseDate" type="date" lang="he-IL" value="${escapeAttribute(expenseDraft.occurredOn ?? "")}" />
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
  const formattedDate = formatExpenseDetailsDate(occurredOn);
  const dateLabel = occurredOn === todayInputValue() ? `היום · ${formattedDate}` : formattedDate;

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
  return formatExpenseDay(value);
}

function renderExpenseModeSwitch(event) {
  if (
    eventTypeConfig(event?.eventType).id !== EVENT_TYPE_RESTAURANT ||
    expenseDraft.id ||
    expenseDraft.restaurantEqualSplit
  ) {
    return "";
  }
  const itemMode = expenseDraft.mode === "items";

  return `
    <div class="expense-mode-switch">
      <button
        type="button"
        class="expense-mode-alternate"
        data-action="expense-mode"
        data-mode="${itemMode ? "single" : "items"}"
      >
        ${itemMode ? "חזרה להוצאה רגילה" : "צריך חשבון לפי מנות? מעבר להזנה מהירה"}
      </button>
    </div>
  `;
}

function renderQuickExpenseForm(event, participants, canEdit) {
  if (eventTypeConfig(event.eventType).id === EVENT_TYPE_RESTAURANT) {
    return renderRestaurantQuickExpenseForm(event, participants, canEdit);
  }
  return renderGenericQuickExpenseForm(event, participants, canEdit);
}

function normalizeRestaurantQuickStage(stage) {
  return RESTAURANT_QUICK_STAGES.includes(stage) ? stage : "method";
}

function renderRestaurantQuickExpenseForm(event, participants, canEdit) {
  const stage = normalizeRestaurantQuickStage(expenseDraft.quickStage);
  expenseDraft.quickStage = stage;
  const summary = summarizeQuickItemShares(
    expenseDraft.quickItems,
    participants.map((participant) => participant.id)
  );
  const ready = summary.billTotal > 0 && !summary.error;
  const copy = {
    method: {
      eyebrow: "חשבון מסעדה",
      title: "איך תרצו לחלק?",
      description: "בוחרים דרך אחת וממשיכים. אפשר לחזור ולשנות."
    },
    items: {
      eyebrow: expenseDraft.restaurantEqualSplit ? "חלוקה שווה" : "חלוקה לפי מנות",
      title: expenseDraft.restaurantEqualSplit
        ? "מה הסכום ומי היה בארוחה?"
        : "מחיר ומי חלק במנה",
      description: expenseDraft.restaurantEqualSplit
        ? "מקלידים סכום ומורידים רק את מי שלא השתתף."
        : "מקלידים מחיר ובוחרים למי הוא שייך. התיאור נשאר אופציונלי."
    },
    review: {
      eyebrow: "החלוקה מוכנה",
      title: "זה הסכום של כל אחד",
      description: "אפשר להעתיק ולסיים, או לשמור באירוע כדי לעקוב אחרי התשלום."
    },
    payer: {
      eyebrow: "שמירה באירוע · לא חובה",
      title: "מי שילם?",
      description: "נשמור את המנות באירוע ונחשב את ההעברות."
    }
  }[stage];

  return `
    <section class="expense-modal-backdrop expense-route-backdrop" aria-label="חלון חשבון מסעדה">
      <section
        class="panel expense-modal quick-expense-modal restaurant-quick-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-expense-title"
        aria-describedby="quick-expense-description"
        data-event-id="${event.id}"
        data-currency="${eventCurrency(event)}"
        data-quick-stage="${stage}"
        tabindex="-1"
      >
        <div class="expense-modal-header expense-modal-step-header">
          <div>
            <p class="eyebrow">${copy.eyebrow}</p>
            <h2 id="quick-expense-title">${copy.title}</h2>
            <p class="muted" id="quick-expense-description">${copy.description}</p>
            ${renderRestoredDraftNote()}
          </div>
          <div class="expense-modal-header-actions">
            <button class="accessibility-entry-button accessibility-entry-header expense-accessibility-button" data-open-accessibility type="button" aria-label="פתיחת הגדרות נגישות" title="נגישות"><span aria-hidden="true">${iconSvg("accessibility")}</span></button>
            ${
              stage !== "method"
                ? `<button class="icon-button modal-section-back-button" data-action="expense-step-back" aria-label="חזרה לשלב הקודם" title="חזרה לשלב הקודם"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>`
                : `<button class="icon-button modal-section-back-button" data-action="cancel-expense" aria-label="חזרה לאירוע" title="חזרה לאירוע"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>`
            }
          </div>
        </div>

        ${renderRestaurantQuickProgress(stage)}
        ${!canEdit ? `<p class="notice" role="status">${escapeHtml(editBlockedMessage(event))}</p>` : ""}
        <fieldset class="expense-flow-fields restaurant-quick-fields" ${!canEdit ? "disabled" : ""}>
          ${renderRestaurantQuickStage(event, participants, stage, summary)}
          ${expenseDraft.error ? `<p class="error" id="expense-form-error" role="alert" tabindex="-1">${escapeHtml(expenseDraft.error)}</p>` : ""}
        </fieldset>
        ${renderRestaurantQuickActions(event, stage, ready, canEdit)}
      </section>
      ${renderEventRoutePrimaryNav()}
    </section>
  `;
}

function renderRestaurantQuickProgress(stage) {
  const currentIndex =
    stage === "payer"
      ? RESTAURANT_CORE_STAGES.length
      : RESTAURANT_CORE_STAGES.indexOf(stage);
  return `
    <ol class="expense-flow-progress restaurant-quick-progress" aria-label="התקדמות בחלוקת חשבון מסעדה">
      ${RESTAURANT_CORE_STAGES.map(
        (item, index) => `
          <li class="${index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : ""}" ${index === currentIndex ? 'aria-current="step"' : ""}>
            <span>${index === 0 ? "בחירת חלוקה" : index === 1 ? "הזנת החשבון" : "תוצאה"}</span>
          </li>
        `
      ).join("")}
    </ol>
  `;
}

function renderRestaurantEqualSplitStep(event, participants) {
  const item =
    expenseDraft.quickItems[0] ??
    createQuickItemDraft(
      QUICK_ITEM_CUSTOM_PARTICIPANTS,
      participants.map((participant) => participant.id)
    );
  const selectedParticipantIds = item.sharedByParticipantIds ?? [];

  return `
    <section class="restaurant-equal-step">
      <label class="field restaurant-equal-amount">
        <span>סכום החשבון <span class="currency-input-badge font-num" dir="ltr">${escapeHtml(currencyCompactLabel(event))}</span></span>
        <input
          data-action="quick-item-amount"
          data-index="0"
          name="restaurantEqualAmount"
          autocomplete="off"
          inputmode="decimal"
          enterkeyhint="done"
          dir="ltr"
          value="${escapeAttribute(item.amount)}"
          placeholder="0.00"
        />
      </label>
      <section class="restaurant-equal-participants" aria-labelledby="restaurant-equal-participants-title">
        <div class="section-title-row">
          <div>
            <span class="eyebrow">מי מתחלק בחשבון?</span>
            <h3 id="restaurant-equal-participants-title">כולם מסומנים מראש</h3>
          </div>
          <strong>${selectedParticipantIds.length}</strong>
        </div>
        <div class="quick-item-custom-share" role="group" aria-label="בחירת סועדים לחלוקה שווה">
          ${participants
            .map(
              (participant) => `
                <label class="${selectedParticipantIds.includes(participant.id) ? "is-selected" : ""}">
                  <input
                    type="checkbox"
                    data-action="quick-item-custom-participant"
                    data-index="0"
                    data-participant-id="${participant.id}"
                    name="restaurantParticipant-0"
                    value="${participant.id}"
                    ${selectedParticipantIds.includes(participant.id) ? "checked" : ""}
                  />
                  <span class="quick-person-option-copy">
                    <span>${escapeHtml(participant.displayName)}</span>
                    ${renderParticipantConnectionBadge(participant)}
                  </span>
                  <span class="app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
                </label>
              `
            )
            .join("")}
        </div>
      </section>
      ${renderQuickSplitSummary(event, participants)}
    </section>
  `;
}

function renderRestaurantQuickStage(event, participants, stage, summary) {
  if (stage === "method") {
    return `
      <section class="restaurant-method-step">
        <button class="restaurant-method-option is-equal" type="button" data-action="restaurant-split-mode" data-mode="equal">
          <span class="restaurant-method-icon">${renderCommandIcon("settle")}</span>
          <span>
            <strong>חלוקה שווה</strong>
            <small>סכום אחד שמתחלק בין מי שהיה בארוחה</small>
          </span>
          <span class="restaurant-method-arrow" aria-hidden="true">${iconSvg("chevron-left")}</span>
        </button>
        <button class="restaurant-method-option is-items" type="button" data-action="restaurant-split-mode" data-mode="items">
          <span class="restaurant-method-icon">${renderCommandIcon("expense")}</span>
          <span>
            <strong>לפי מנות</strong>
            <small>כל אחד משלם רק על מה שאכל או שתה</small>
          </span>
          <span class="restaurant-method-arrow" aria-hidden="true">${iconSvg("chevron-left")}</span>
        </button>
      </section>
    `;
  }

  if (stage === "items") {
    if (expenseDraft.restaurantEqualSplit) {
      return renderRestaurantEqualSplitStep(event, participants);
    }
    return `
      <section class="quick-items-section restaurant-items-step">
        <div class="quick-item-list">
          ${expenseDraft.quickItems
            .map((item, index) => renderQuickItemRow(item, index, participants))
            .join("")}
        </div>
        <button class="secondary-button quick-add-item" data-action="quick-item-add" type="button">הוסף מנה נוספת</button>
      </section>
      <details class="expense-guest-box quick-expense-guest-box quick-expense-guest-details">
        <summary>
          <span>
            <strong>חסר סועד ברשימה?</strong>
            <small>אפשר להוסיף שם אופליין בלי לצאת מהחשבון</small>
          </span>
        </summary>
        <div class="inline-actions expense-guest-actions">
          <input class="guest-input" data-action="event-guest-name" name="restaurantGuestName" aria-label="שם אופליין לחשבון" placeholder="שם הסועד" autocomplete="off" enterkeyhint="done" />
          <button class="secondary-button" data-action="event-add-guest" data-event-id="${event.id}">הוסף סועד</button>
        </div>
      </details>
      ${renderQuickSplitSummary(event, participants)}
    `;
  }

  if (stage === "review") {
    const reviewCount = expenseDraft.restaurantEqualSplit
      ? formatCount(
          participants.filter((participant) => summary.totals[participant.id] > 0).length,
          "משתתף בחלוקה",
          "משתתפים בחלוקה"
        )
      : formatCount(
          expenseDraft.quickItems.filter((item) => String(item.amount ?? "").trim()).length,
          "מנה הוזנה",
          "מנות הוזנו"
        );
    return `
      <section class="restaurant-review-step">
        ${renderQuickSplitSummary(event, participants)}
        <p class="restaurant-review-count">${reviewCount}</p>
      </section>
    `;
  }

  return `
    <section class="restaurant-payer-step">
      ${renderQuickSplitSummary(event, participants)}
      <label class="field restaurant-payer-field">
        <span>מי שילם את החשבון?</span>
        <select data-action="quick-expense-payer" name="quickExpensePayer">
          ${participants
            .map(
              (participant) => `
                <option value="${participant.id}" ${expenseDraft.quickPayerId === participant.id ? "selected" : ""}>
                  ${escapeHtml(`${participant.displayName} · ${participantConnectionStatus(participant).label}`)}
                </option>
              `
            )
            .join("")}
        </select>
      </label>
      ${renderExpenseDateField("restaurant-date-field", "תאריך")}
    </section>
  `;
}

function renderRestaurantQuickActions(event, stage, ready, canEdit) {
  if (stage === "method") return "";
  const disabled = !canEdit || !ready ? "disabled" : "";
  if (stage === "items") {
    return `
      <div class="actions section expense-modal-actions">
        <button class="primary-button" data-action="restaurant-quick-stage" data-stage="review" ${disabled}>המשך לסיכום</button>
      </div>
    `;
  }
  if (stage === "review") {
    return `
      <div class="actions section expense-modal-actions restaurant-review-actions">
        <button class="primary-button" data-action="copy-and-finish-restaurant-calculation" type="button" ${ready ? "" : "disabled"}>העתק וסיים</button>
        <button class="secondary-button" data-action="restaurant-quick-stage" data-stage="payer" ${disabled}>שמור באירוע</button>
        <button class="restaurant-dismiss-action" data-action="finish-restaurant-calculation" type="button">סגור בלי לשמור</button>
      </div>
    `;
  }
  return `
    <div class="actions section expense-modal-actions">
      <button class="primary-button" data-action="save-quick-expenses" data-event-id="${event.id}" ${disabled}>שמור באירוע</button>
    </div>
  `;
}

function renderGenericQuickExpenseForm(event, participants, canEdit) {
  const isPaidExpense = expenseDraft.quickPurpose === "paid";
  const isRestaurantEvent = eventTypeConfig(event.eventType).id === EVENT_TYPE_RESTAURANT;
  const showQuickExpenseMeta = !isRestaurantEvent || isPaidExpense;
  const quickSummary = summarizeQuickItemShares(
    expenseDraft.quickItems,
    participants.map((participant) => participant.id)
  );
  const quickActionReady = quickSummary.billTotal > 0 && !quickSummary.error;
  return `
    <section class="expense-modal-backdrop expense-route-backdrop" aria-label="חלון הוצאה">
      <section class="panel expense-modal quick-expense-modal" role="dialog" aria-modal="true" aria-labelledby="quick-expense-title" aria-describedby="quick-expense-description" data-event-id="${event.id}" data-currency="${eventCurrency(event)}" tabindex="-1">
        <div class="expense-modal-header expense-modal-step-header">
          <div>
            <p class="eyebrow">${isRestaurantEvent ? "חשבון מסעדה" : "מסעדה או קניות"}</p>
            <h2 id="quick-expense-title">${isPaidExpense ? "הזנה מהירה לפי פריטים" : isRestaurantEvent ? "כמה כל אחד צריך לשלם?" : "חלוקת חשבון מהירה"}</h2>
            <p class="muted" id="quick-expense-description">${isPaidExpense ? "מקלידים כמה שורות ושומרים את כל החשבון בפעם אחת." : "מקלידים את המחירים ומיד רואים כמה כל אחד צריך לשלם."} מטבע: ${escapeHtml(currencySelectLabel(event.currency))}.</p>
            ${renderRestoredDraftNote()}
          </div>
          <div class="expense-modal-header-actions">
            <button class="accessibility-entry-button accessibility-entry-header expense-accessibility-button" data-open-accessibility type="button" aria-label="פתיחת הגדרות נגישות" title="נגישות"><span aria-hidden="true">${iconSvg("accessibility")}</span></button>
            <button class="icon-button modal-section-back-button" data-action="cancel-expense" aria-label="חזרה לאירוע" title="חזרה לאירוע"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>
          </div>
        </div>

        ${!canEdit ? `<p class="notice" role="status">${escapeHtml(editBlockedMessage(event))}</p>` : ""}
        <fieldset class="expense-flow-fields" ${!canEdit ? "disabled" : ""}>
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
                        <select data-action="quick-expense-payer" name="quickExpensePayer">
                          ${participants
                            .map(
                              (participant) => `
                                <option value="${participant.id}" ${expenseDraft.quickPayerId === participant.id ? "selected" : ""}>
                                  ${escapeHtml(`${participant.displayName} · ${participantConnectionStatus(participant).label}`)}
                                </option>
                              `
                            )
                            .join("")}
                        </select>
                      </label>`
                    : ""
                }
                ${renderExpenseDateField("", "תאריך")}
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
              <strong>הוסף שם אופליין לחשבון</strong>
              <small>אם הוא לא מופיע ברשימה</small>
            </span>
          </summary>
          <div class="inline-actions expense-guest-actions">
            <input class="guest-input" data-action="event-guest-name" name="quickExpenseGuestName" aria-label="שם אופליין לחשבון" placeholder="שם אופליין" autocomplete="off" enterkeyhint="done" ${!canEdit ? "disabled" : ""} />
            <button class="secondary-button" data-action="event-add-guest" data-event-id="${event.id}" ${!canEdit ? "disabled" : ""}>הוסף שם אופליין</button>
          </div>
        </details>

        ${expenseDraft.quickPurpose !== "paid" ? renderQuickSplitSummary(event, participants) : ""}

        ${expenseDraft.error ? `<p class="error" id="expense-form-error" role="alert" tabindex="-1">${escapeHtml(expenseDraft.error)}</p>` : ""}
        </fieldset>

        <div class="actions section expense-modal-actions">
          ${
            expenseDraft.quickPurpose === "paid"
              ? `<button class="primary-button" data-action="save-quick-expenses" data-event-id="${event.id}" ${!canEdit || !quickActionReady ? "disabled" : ""}>שמור את כל הפריטים</button>`
              : `<button class="primary-button" data-action="copy-quick-split" type="button" ${!quickActionReady ? "disabled" : ""}>העתק את החלוקה</button>`
          }
          <button class="secondary-button" data-action="cancel-expense">${isPaidExpense ? "ביטול" : "סיום"}</button>
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
          <h3>סה״כ החשבון</h3>
        </div>
        <strong class="amount"><span class="font-num">${formatEventMoney(event, summary.billTotal)}</span></strong>
      </div>
      ${rows.length ? `<p class="quick-split-list-title">כמה כל אחד משלם</p>` : ""}
      <div class="quick-split-list">
        ${
          rows.length
            ? rows
                .map(
                  (participant) => `
                    <div>
                      <span>${escapeHtml(participant.displayName)}</span>
                      <strong class="amount"><span class="font-num">${formatEventMoney(event, summary.totals[participant.id])}</span></strong>
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

  const participants = expenseParticipantsForCurrentDraft(event);
  if (expenseDraft.quickPurpose !== "paid") {
    const current = app.querySelector(".quick-split-summary");
    if (current) current.outerHTML = renderQuickSplitSummary(event, participants);
  }

  const summary = summarizeQuickItemShares(
    expenseDraft.quickItems,
    participants.map((participant) => participant.id)
  );
  const ready = summary.billTotal > 0 && !summary.error;
  const isRestaurantItems =
    eventTypeConfig(event.eventType).id === EVENT_TYPE_RESTAURANT &&
    normalizeRestaurantQuickStage(expenseDraft.quickStage) === "items";
  const action = app.querySelector(
    isRestaurantItems
      ? '[data-action="restaurant-quick-stage"][data-stage="review"]'
      : expenseDraft.quickPurpose === "paid"
      ? '[data-action="save-quick-expenses"]'
      : '[data-action="copy-quick-split"]'
  );
  if (action) action.disabled = !ready || !canCurrentParticipantEdit(event);
}

async function copyQuickSplitSummary() {
  const event = getEvent(expenseDraft?.eventId);
  if (!event) return false;
  const participants = expenseParticipantsForCurrentDraft(event);
  const summary = summarizeQuickItemShares(
    expenseDraft.quickItems,
    participants.map((participant) => participant.id)
  );

  if (summary.error) {
    expenseDraft.error = summary.error;
    render();
    activateDialog(".expense-modal");
    return false;
  }

  if (summary.billTotal <= 0) {
    expenseDraft.error = "צריך להזין לפחות מחיר אחד כדי לחשב את החלוקה.";
    render();
    activateDialog(".expense-modal");
    return false;
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

  const copied = await copyText(lines.join("\n"), "החלוקה הועתקה.");
  activateDialog(".expense-modal");
  return copied;
}

function renderQuickItemRow(item, index, participants) {
  const customParticipantIds = item.sharedByParticipantIds ?? [];
  const isRestaurantItem =
    eventTypeConfig(getEvent(expenseDraft.eventId)?.eventType).id ===
    EVENT_TYPE_RESTAURANT;
  return `
    <div class="quick-item-row">
      <span class="quick-item-number">${index + 1}</span>
      <label class="field quick-item-amount-field">
        <span>מחיר <span class="currency-input-badge font-num" dir="ltr">${escapeHtml(currencyCompactLabel(getEvent(expenseDraft.eventId)))}</span></span>
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
      <label class="field quick-item-owner-field">
        <span>מי אכל או שתה?</span>
        <select data-action="quick-item-shared-by" data-index="${index}" name="quickItemSharedBy-${index}">
          ${participants
            .map(
              (participant) => `
                <option value="${participant.id}" ${item.sharedBy === participant.id ? "selected" : ""}>
                  ${escapeHtml(`${participant.displayName} · ${participantConnectionStatus(participant).label}`)}
                </option>
              `
            )
            .join("")}
          <option value="${ADD_QUICK_ITEM_GUEST_VALUE}" ${expenseDraft.quickInlineGuestIndex === index ? "selected" : ""}>＋ הוסף שם אופליין…</option>
          <option value="${QUICK_ITEM_ALL_PARTICIPANTS}" ${item.sharedBy === QUICK_ITEM_ALL_PARTICIPANTS ? "selected" : ""}>משותף לכולם</option>
          <option value="${QUICK_ITEM_CUSTOM_PARTICIPANTS}" ${item.sharedBy === QUICK_ITEM_CUSTOM_PARTICIPANTS ? "selected" : ""}>כמה אנשים…</option>
        </select>
      </label>
      ${
        isRestaurantItem
          ? `
            <details class="quick-item-description-details" ${String(item.name ?? "").trim() ? "open" : ""}>
              <summary>${String(item.name ?? "").trim() ? "תיאור המנה" : "הוסף תיאור (לא חובה)"}</summary>
              <label class="field quick-item-name-field">
                <span>תיאור המנה</span>
                <input
                  data-action="quick-item-name"
                  data-index="${index}"
                  name="quickItemName-${index}"
                  autocomplete="off"
                  enterkeyhint="next"
                  value="${escapeAttribute(item.name)}"
                  placeholder="לדוגמה: פסטה או שתייה"
                />
              </label>
            </details>
          `
          : `
            <label class="field quick-item-name-field">
              <span>תיאור <small>(לא חובה)</small></span>
              <input
                data-action="quick-item-name"
                data-index="${index}"
                name="quickItemName-${index}"
                autocomplete="off"
                enterkeyhint="next"
                value="${escapeAttribute(item.name)}"
                placeholder="לדוגמה: פסטה או שתייה"
              />
            </label>
          `
      }
      ${
        expenseDraft.quickInlineGuestIndex === index
          ? `
            <div class="quick-item-inline-guest" role="group" aria-label="הוספת שם אופליין לשורה ${index + 1}">
              <input
                data-action="quick-item-new-guest-name"
                data-index="${index}"
                name="quickItemGuest-${index}"
                autocomplete="off"
                enterkeyhint="done"
                value="${escapeAttribute(expenseDraft.quickInlineGuestName ?? "")}"
                placeholder="שם אופליין"
                aria-label="שם אופליין חדש"
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
                        name="quickItemParticipant-${index}"
                        value="${participant.id}"
                        ${customParticipantIds.includes(participant.id) ? "checked" : ""}
                      />
                      <span class="quick-person-option-copy">
                        <span>${escapeHtml(participant.displayName)}</span>
                        ${renderParticipantConnectionBadge(participant)}
                      </span>
                      <span class="app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
                    </label>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
      ${
        expenseDraft.quickItems.length > 1
          ? `
            <button
              type="button"
              class="icon-button quick-item-remove"
              data-action="quick-item-remove"
              data-index="${index}"
              aria-label="הסר שורה ${index + 1}"
              title="הסר שורה"
            ><span class="modal-control-icon" aria-hidden="true">${iconSvg("x")}</span></button>
          `
          : ""
      }
    </div>
  `;
}

function renderEventExpenseGroups(event) {
  const groups = groupExpensesByDay(event.expenses);
  const showDayHeadings = eventTypeConfig(event.eventType).id === EVENT_TYPE_TRIP || groups.length > 1;

  return groups
    .map((group) => {
      const groupTotal = sumMoneyAmounts(
        group.expenses.map((expense) => expense.total)
      );
      return `
        <section class="expense-day-group${showDayHeadings ? " has-day-heading" : ""}" role="list">
          ${
            showDayHeadings
              ? `
                <div class="expense-day-heading">
                  <span class="expense-day-label">${escapeHtml(formatExpenseDay(group.date))}</span>
                  <span class="expense-day-summary">
                    <small>${formatCount(group.expenses.length, "הוצאה", "הוצאות")}</small>
                    <strong class="amount"><span class="font-num">${formatEventMoney(event, groupTotal)}</span></strong>
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

  if (!summary.valid) {
    return `<p class="expense-payer-summary is-error" aria-live="polite">צריך להשלים סכום תקין לכל משלם.</p>`;
  }

  if (summary.balanced) {
    return `<p class="expense-payer-summary is-balanced" aria-live="polite">הסכום הושלם</p>`;
  }

  if (summary.remaining > 0) {
    return `<p class="expense-payer-summary is-warning" aria-live="polite">נשאר לשייך ${formatEventMoney(event, summary.remaining)} למי ששילם.</p>`;
  }

  return `<p class="expense-payer-summary is-error" aria-live="polite">סכומי המשלמים גבוהים ב-${formatEventMoney(event, summary.overpaid)} מהסכום הכולל.</p>`;
}

function renderExpensePayerDifferenceAssignment(event) {
  if (!expenseDraft || expenseDraft.payers.length < 2) return "";

  const summary = summarizePayerDraft(expenseDraft.total, expenseDraft.payers);
  if (!summary.valid || summary.balanced) return "";

  const difference = summary.remaining || summary.overpaid;
  const isIncrease = summary.remaining > 0;
  return `
    <section class="payer-difference-assignment" aria-labelledby="payer-difference-title">
      <div>
        <strong id="payer-difference-title">
          ${isIncrease ? "למי לשייך את התוספת?" : "ממי להפחית את ההפרש?"}
        </strong>
        <span class="amount"><span class="font-num">${formatEventMoney(event, difference)}</span></span>
      </div>
      <div class="payer-difference-options" role="group" aria-label="בחירת משלם לשיוך ההפרש">
        ${expenseDraft.payers
          .map(
            (payer, index) => `
              <button
                type="button"
                class="secondary-button"
                data-action="assign-payer-difference"
                data-index="${index}"
              >${escapeHtml(participantName(payer.participantId, event))}</button>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderExpenseRow(event, expense) {
  const canEdit = canCurrentParticipantEdit(event);
  const needsReview = calculateSettlement(eventParticipants(event), [expense]).issues.length > 0;
  const payers = expense.payers
    .map((payer) => participantName(payer.participantId, event))
    .join(", ");
  const sharedParticipantIds = [...new Set(expense.sharedByParticipantIds)];

  return `
    <article class="expense-row${needsReview ? " is-review" : ""}" data-expense-id="${escapeAttribute(expense.id)}" data-expense-search="${escapeAttribute(`${expense.name} ${payers}`.toLocaleLowerCase("he"))}" role="listitem">
      <button
        type="button"
        class="expense-row-main"
        data-action="toggle-expense-participants"
        aria-expanded="false"
        aria-controls="expense-participants-${escapeAttribute(expense.id)}"
      >
        <strong>${escapeHtml(expense.name)}</strong>
        <small>שילמו: ${escapeHtml(payers)}</small>
        ${
          needsReview
            ? '<span class="expense-review-badge" role="status">צריך תיקון · לא נכנסה לחישוב</span>'
            : ""
        }
      </button>
      <span class="expense-actions">
        <span class="amount"><span class="font-num">${formatEventMoney(event, expense.total)}</span></span>
        <details class="expense-row-actions-menu">
          <summary aria-label="אפשרויות להוצאה ${escapeAttribute(expense.name)}" title="אפשרויות">
            <span class="expense-row-actions-icon" aria-hidden="true">${iconSvg("more")}</span>
          </summary>
          <div>
            <button class="secondary-button" data-action="edit-expense" data-event-id="${event.id}" data-expense-id="${expense.id}" ${!canEdit ? "disabled" : ""}>ערוך הוצאה</button>
            <button class="secondary-button" data-action="edit-expense-notes" data-event-id="${event.id}" data-expense-id="${expense.id}" ${!canEdit ? "disabled" : ""}>הערות ותמונה</button>
            <button class="secondary-button danger-button" data-action="delete-expense" data-event-id="${event.id}" data-expense-id="${expense.id}" ${!canEdit ? "disabled" : ""}>מחק הוצאה</button>
          </div>
        </details>
      </span>
      <details class="expense-participants-details" id="expense-participants-${escapeAttribute(expense.id)}">
        <summary aria-label="הצג את כל השותפים">
          <span>שותפים</span>
          <span class="expense-participants-count">${sharedParticipantIds.length}</span>
        </summary>
        ${expense.notes ? `<p class="expense-saved-notes">${escapeHtml(expense.notes)}</p>` : ""}
        ${expense.attachmentImage ? `<img class="expense-saved-image" src="${escapeAttribute(expense.attachmentImage)}" alt="תמונה מצורפת להוצאה ${escapeAttribute(expense.name)}" />` : ""}
        <p class="expense-participants-list-title" id="expense-participants-title-${escapeAttribute(expense.id)}">רשימת משתתפים</p>
        <div class="expense-participants-list" role="list" aria-labelledby="expense-participants-title-${escapeAttribute(expense.id)}"></div>
      </details>
    </article>
  `;
}

function hydrateExpenseParticipants(details, event, expense) {
  if (details.dataset.participantsHydrated === "true") return;
  const list = details.querySelector(".expense-participants-list");
  if (!list) return;

  list.innerHTML = [...new Set(expense.sharedByParticipantIds)]
    .map((participantId) => renderExpenseParticipant(event, participantId))
    .join("");
  details.dataset.participantsHydrated = "true";
}

function renderExpenseParticipant(event, participantId) {
  const participant = state.participants.find((item) => item.id === participantId);
  const isCurrentParticipant = participantId === state.currentParticipantId;

  return `
    <div class="expense-participant-item ${isCurrentParticipant ? "is-current" : ""}" role="listitem">
      <button
        type="button"
        class="expense-participant-avatar-action"
        data-action="open-event-participant-profile"
        data-event-id="${escapeAttribute(event.id)}"
        data-participant-id="${escapeAttribute(participantId)}"
        aria-label="פתיחת ${escapeAttribute(participantName(participantId, event))}"
      >${renderAvatar(participantId, event)}</button>
      <span class="expense-participant-copy">
        <strong>${escapeHtml(participantName(participantId, event))}</strong>
        <span class="expense-participant-meta">
          ${isCurrentParticipant ? '<span class="expense-participant-you">אתה</span>' : ""}
          ${participant && !isCurrentParticipant ? renderParticipantConnectionBadge(participant) : ""}
        </span>
      </span>
    </div>
  `;
}

function renderSettlement(event) {
  rememberRecentEvent(event.id);
  const participants = eventParticipants(event);
  const calculated = calculateSettlement(
    participants,
    event.expenses,
    settlementOptionsForEvent(event)
  );
  const transfers = event.transfers.length ? event.transfers : calculated.transfers;
  const pendingTransfers = transfers.filter((transfer) => transfer.status !== "paid");
  const hasPersonalIdentity = hasReliableSettlementIdentity(event);
  const hasPersonalPendingTransfers =
    hasPersonalIdentity &&
    pendingTransfers.some(
      (transfer) =>
        transfer.fromParticipantId === state.currentParticipantId ||
        transfer.toParticipantId === state.currentParticipantId
    );
  const orderedTransfers = orderSettlementTransfers(transfers);
  const displayTransfers = groupSettlementTransfersForDisplay(orderedTransfers);
  const hasTransfers = displayTransfers.length > 0;
  const pendingTotal = sumMoneyAmounts(
    transfers
      .filter((transfer) => transfer.status !== "paid")
      .map((transfer) => transfer.amount)
  );

  return `
    <section class="screen font-hebrew settlement-screen" data-screen-kind="event" data-event-view="summary" data-event-id="${escapeAttribute(event.id)}">
      ${renderEventHeader(event, activeEventParticipants(event))}
      ${renderNotice()}
      ${renderEventWorkspaceNav(event, "summary")}

      ${expenseDraft?.eventId === event.id ? renderExpenseForm(event) : ""}
      ${eventDialog?.eventId === event.id ? renderEventDialog(event) : ""}

      ${renderSettlementHero(event, transfers, pendingTotal, calculated.issues)}

      ${
        hasTransfers
          ? `
              <section class="section settlement-stage" aria-labelledby="settlement-transfers-title">
                <div class="settlement-stage-heading">
                  <div>
                    <h2 id="settlement-transfers-title">מי מעביר למי</h2>
                    <small>${usesDirectSettlementTransfers(event) ? "החזר ישיר למי שמימן יותר" : "המקבל עשוי להיות שונה ממי ששילם, כי קיזזנו בין כולם"}</small>
                  </div>
                  ${renderSettlementRepaymentShortcut(event)}
                </div>
                <div class="settlement-transfer-board">
                  ${renderSettlementOfflineNotice(event, orderedTransfers)}
                  ${displayTransfers
                    .map(({ transfer, paidHistory, groupedPaidTransfers }) =>
                      renderTransferRow(event, transfer, {
                        highlightPersonal: hasPersonalIdentity,
                        paidHistory,
                        groupedPaidTransfers
                      })
                    )
                    .join("")}
                </div>
                ${renderSettlementListActions(event)}
              </section>
            `
          : ""
      }
    </section>
    ${
      settlementCloseConfirmation?.eventId === event.id &&
      pendingTransfers.length > 0 &&
      !isEventClosed(event)
        ? renderSettlementCloseConfirmation(event, pendingTransfers, pendingTotal)
        : ""
    }
  `;
}

async function saveProfileAvatarImage(file) {
  if (file.type && !file.type.startsWith("image/")) {
    profileError = "אפשר לבחור קובץ תמונה בלבד.";
    render();
    return;
  }
  try {
    const croppedCanvas = await requestImageCrop(file, {
      shape: "circle",
      aspectRatio: 1,
      outputWidth: 480,
      outputHeight: 480,
      title: "בחר את תמונת הפרופיל",
      description: "הזז והגדל עד שהאזור הרצוי נמצא בתוך העיגול."
    });
    if (!croppedCanvas) return;
    profileAvatarImageDraft = compressProfileAvatarImage(croppedCanvas);
    profileError = "";
    render();
    await persistProfileAvatarDraft();
    render();
    requestAnimationFrame(() => {
      app
        .querySelector(".profile-avatar-picker-summary")
        ?.focus({ preventScroll: true });
    });
  } catch (error) {
    profileAvatarPendingPreview = "";
    console.warn("[images] Profile image processing failed", {
      type: String(file?.type ?? ""),
      size: Number(file?.size ?? 0),
      error: String(error?.message ?? error)
    });
    profileError = "לא הצלחנו לפתוח את התמונה. נסה תמונה אחרת מהגלריה.";
    render();
  }
}

async function persistProfileAvatarDraft() {
  const participantId = state.currentParticipantId;
  const currentParticipant = state.participants.find(
    (participant) => participant.id === participantId
  );
  if (!currentParticipant || !localProfile) return false;

  const avatarImage = normalizeAvatarImage(profileAvatarImageDraft);
  const avatarPreset =
    normalizeAvatarPreset(profileAvatarDraft) || AVATAR_PRESETS[0].id;
  const profileUpdatedAt = new Date().toISOString();
  const displayName = currentParticipant.displayName || localProfile.displayName;

  state = {
    ...state,
    participants: state.participants.map((participant) =>
      participant.id === participantId
        ? {
            ...participant,
            avatarImage,
            avatarImageUpdatedAt: profileUpdatedAt,
            avatarPreset,
            profileUpdatedAt
          }
        : participant
    )
  };
  localProfile = saveLocalProfile({
    ...localProfile,
    participantId,
    displayName,
    avatarImage,
    avatarImageUpdatedAt: profileUpdatedAt,
    avatarPreset,
    profileUpdatedAt
  });

  const [accountResult, stateResult, friendProfileResult] = await Promise.allSettled([
    globalThis.SogrimAccountProfile?.updateProfile?.({
      displayName,
      username: profileUsernameDraft || currentFriendUsername(),
      avatarImage
    }) ?? true,
    saveSharedState(state),
    friendNetworkAvailable(runtimeConfig)
      ? syncFriendProfile(runtimeConfig, localProfile)
      : true
  ]);
  const accountSynced =
    accountResult.status === "fulfilled" && accountResult.value !== false;
  const stateSynced =
    stateResult.status === "fulfilled" &&
    stateResult.value !== false &&
    stateResult.value?.ok !== false &&
    stateResult.value?.pending !== true;
  const friendProfileSynced =
    friendProfileResult.status === "fulfilled" && friendProfileResult.value !== false;
  const fullySynced = accountSynced && stateSynced && friendProfileSynced;
  if (stateSynced) rememberPublishedSharedProfile(state.currentParticipantId);
  notice = globalThis.navigator?.onLine === false
    ? "התמונה נשמרה במכשיר ותסתנכרן כשהחיבור יחזור."
    : "תמונת הפרופיל נשמרה.";
  return fullySynced;
}

async function publishCurrentProfileToSharedEventsOnce() {
  const participantId = state.currentParticipantId;
  const participant = state.participants.find((item) => item.id === participantId);
  const profileUpdatedAt = String(participant?.profileUpdatedAt ?? "").trim();
  if (!participantId || !profileUpdatedAt) return false;
  const hasSharedEvent = state.events.some((event) =>
    event?.participantIds?.includes(participantId) &&
    event?.sharedSpaceId &&
    event?.sharedSpaceKey
  );
  if (!hasSharedEvent) return false;
  const markerKey = `${PROFILE_SHARED_PUBLICATION_STORAGE_KEY_PREFIX}${participantId}`;
  if (window.localStorage.getItem(markerKey) === profileUpdatedAt) return false;

  const result = await saveSharedState(state, {
    forceSharedParticipantIds: [participantId],
    suppressRevertNotice: true
  });
  if (result?.ok && result?.pending !== true) {
    rememberPublishedSharedProfile(participantId);
    return true;
  }
  return false;
}

function rememberPublishedSharedProfile(participantId) {
  const participant = state.participants.find((item) => item.id === participantId);
  const profileUpdatedAt = String(participant?.profileUpdatedAt ?? "").trim();
  if (!participantId || !profileUpdatedAt) return;
  window.localStorage.setItem(
    `${PROFILE_SHARED_PUBLICATION_STORAGE_KEY_PREFIX}${participantId}`,
    profileUpdatedAt
  );
}

function encodeCanvasJpegWithinLimit(
  sourceCanvas,
  {
    maxLength,
    initialQuality = 0.78,
    minQuality = 0.42,
    minEdge = 160
  }
) {
  let canvas = sourceCanvas;
  const qualities = [
    initialQuality,
    Math.max(minQuality, initialQuality - 0.12),
    Math.max(minQuality, initialQuality - 0.24),
    minQuality
  ];

  for (let resizeAttempt = 0; resizeAttempt < 6; resizeAttempt += 1) {
    for (const quality of [...new Set(qualities)]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.startsWith("data:image/jpeg") && dataUrl.length <= maxLength) {
        return dataUrl;
      }
    }

    const longestEdge = Math.max(canvas.width, canvas.height);
    if (longestEdge <= minEdge) break;
    const scale = Math.max(minEdge / longestEdge, 0.78);
    const resized = document.createElement("canvas");
    resized.width = Math.max(1, Math.round(canvas.width * scale));
    resized.height = Math.max(1, Math.round(canvas.height * scale));
    const context = resized.getContext("2d");
    if (!context) throw new Error("Image canvas is unavailable");
    context.drawImage(canvas, 0, 0, resized.width, resized.height);
    canvas = resized;
  }

  throw new Error("Image remains too large after compression");
}

function compressProfileAvatarImage(croppedCanvas) {
  const dataUrl = encodeCanvasJpegWithinLimit(croppedCanvas, {
    maxLength: 180_000,
    initialQuality: 0.76,
    minQuality: 0.4,
    minEdge: 128
  });
  const avatarImage = normalizeAvatarImage(dataUrl);
  if (!avatarImage) throw new Error("Profile image is too large");
  return avatarImage;
}

async function saveEventCoverImage(eventId, file) {
  const event = getEvent(eventId);
  if (!event || !canCurrentParticipantManage(event)) return;
  if (file.type && !file.type.startsWith("image/")) {
    notice = "אפשר לבחור קובץ תמונה בלבד.";
    render();
    return;
  }
  try {
    const croppedCanvas = await requestImageCrop(file, {
      shape: "rectangle",
      aspectRatio: 16 / 7,
      outputWidth: 1280,
      outputHeight: 560,
      title: "בחר את תמונת האירוע",
      description: "הזז והגדל עד שהאזור הרצוי נמצא בתוך המלבן."
    });
    if (!croppedCanvas) return;
    const coverImage = encodeCanvasJpegWithinLimit(croppedCanvas, {
      maxLength: 240_000,
      initialQuality: 0.76,
      minQuality: 0.42,
      minEdge: 320
    });
    await updateEventCoverImage(eventId, coverImage);
  } catch (error) {
    console.warn("[images] Event cover processing failed", {
      eventId,
      type: String(file?.type ?? ""),
      size: Number(file?.size ?? 0),
      error: String(error?.message ?? error)
    });
    notice = "לא הצלחנו לעבד את התמונה שנבחרה. נסה תמונה אחרת מהגלריה או מהמצלמה.";
    render();
  }
}

function compressEventCoverImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = encodeCanvasJpegWithinLimit(canvas, {
          maxLength: 240_000,
          initialQuality: 0.76,
          minQuality: 0.42,
          minEdge: 320
        });
        resolve(dataUrl);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function captureExpenseAttachment(trigger) {
  if (!expenseDraft) return;
  const nativeCamera = globalThis.SogrimNative?.camera;
  if (!nativeCamera?.available || typeof nativeCamera.takePhoto !== "function") {
    trigger
      .closest(".expense-attachment-control")
      ?.querySelector('[data-image-source="camera-fallback"]')
      ?.click();
    return;
  }

  trigger.disabled = true;
  trigger.setAttribute("aria-busy", "true");
  try {
    const file = await nativeCamera.takePhoto();
    if (file) await applyExpenseAttachmentImage(file);
  } catch (error) {
    console.warn("[images] Expense camera failed", {
      code: String(error?.code ?? ""),
      error: String(error?.message ?? error)
    });
    if (!expenseDraft) return;
    expenseDraft.error =
      "לא הצלחנו לפתוח את המצלמה. בדוק שהרשאת המצלמה פעילה ונסה שוב.";
    render();
    activateExpenseEntryDialog();
  } finally {
    trigger.disabled = false;
    trigger.removeAttribute("aria-busy");
  }
}

async function applyExpenseAttachmentImage(file) {
  if (!file || !expenseDraft) return;
  try {
    expenseDraft.attachmentImage = await compressEventCoverImage(file);
    expenseDraft.error = "";
  } catch {
    expenseDraft.error = "לא הצלחנו לעבד את התמונה. נסה תמונה אחרת.";
  }
  render();
  activateExpenseEntryDialog();
}

async function updateEventCoverImage(eventId, coverImage) {
  const event = getEvent(eventId);
  if (!event || !canCurrentParticipantManage(event)) return false;
  const previousState = state;
  const updatedAt = new Date().toISOString();
  state = {
    ...state,
    events: state.events.map((event) => event.id === eventId ? {
      ...event,
      coverImage,
      settingsUpdatedAt: updatedAt,
      settingsFieldUpdatedAt: { ...(event.settingsFieldUpdatedAt ?? {}), coverImage: updatedAt }
    } : event)
  };
  notice = coverImage ? "שומר את תמונת האירוע…" : "מסיר את תמונת האירוע…";
  render();
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (result?.ok === false && result?.pending !== true) {
    console.warn("[images] Event cover persistence failed", {
      eventId,
      mode: String(result?.mode ?? "unknown"),
      error: String(result?.error?.message ?? result?.error ?? "unknown")
    });
    state = previousState;
    notice = "לא הצלחנו לשמור את תמונת האירוע. התמונה הקודמת נשארה ללא שינוי.";
    render();
    return false;
  }
  notice = result?.pending
    ? globalThis.navigator?.onLine === false
      ? "התמונה נשמרה במכשיר ותסתנכרן כשהחיבור יחזור."
      : "תמונת האירוע נשמרה ומסתנכרנת ברקע."
    : coverImage
      ? "תמונת האירוע נשמרה."
      : "תמונת האירוע הוסרה.";
  render();
  return true;
}

function renderSettlementRepaymentShortcut(event) {
  const label = usesDirectSettlementTransfers(event)
    ? "לפי מי ששילם"
    : "קיזוז חכם";
  const canManage = canCurrentParticipantManage(event);

  return `
    <button
      class="settlement-repayment-shortcut"
      type="button"
      data-action="open-event-repayment-settings"
      data-event-id="${escapeAttribute(event.id)}"
      aria-label="שנה את חלוקת ההחזרים. כרגע: ${escapeAttribute(label)}"
    >
      <span aria-hidden="true">${iconSvg("transfers")}</span>
      <span>${escapeHtml(label)}</span>
      <small>${canManage ? "הסבר ושינוי" : "הסבר"}</small>
    </button>
  `;
}

function renderSettlementListActions(event) {
  return `
    <details class="settlement-list-actions">
      <summary>
        <span class="settlement-share-summary-icon" aria-hidden="true">${iconSvg("share")}</span>
        <span>שיתוף והעתקה</span>
      </summary>
      <div>
        <button class="secondary-button whatsapp-button" data-action="share-whatsapp" data-event-id="${event.id}">שלח סיכום בוואטסאפ</button>
        <button class="secondary-button" data-action="copy-settlement" data-event-id="${event.id}">העתק סיכום</button>
        <button class="secondary-button" data-action="copy-event-report" data-event-id="${event.id}">העתק פירוט הוצאות</button>
      </div>
    </details>
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

function renderSettlementOfflineNotice(event, transfers) {
  const offlineParticipantIds = [
    ...new Set(
      (transfers ?? [])
        .flatMap((transfer) => [
          transfer.fromParticipantId,
          transfer.toParticipantId
        ])
        .filter((participantId) => {
          const participant = state.participants.find(
            (item) => item.id === participantId
          );
          return participant && !participantConnectionStatus(participant).connected;
        })
    )
  ];
  if (!offlineParticipantIds.length) return "";

  const participantLabel = formatCount(
    offlineParticipantIds.length,
    "משתתף אופליין",
    "משתתפי אופליין"
  );
  return `
    <aside class="settlement-offline-note" role="note">
      <span class="settlement-offline-note-icon" aria-hidden="true">i</span>
      <span>
        <strong>יש כאן ${escapeHtml(participantLabel)}</strong>
        <small>הם אינם מחוברים לאפליקציה ולא יכולים לעדכן בעצמם. כשהכסף עבר, סמן את התשלום בשמם.</small>
      </span>
    </aside>
  `;
}

function orderSettlementTransfers(transfers) {
  const currentParticipantId = state.currentParticipantId;
  return [...transfers].sort((first, second) => {
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
            (option, index) => `
              <button
                type="button"
                class="event-management-option ${selectedMode === option.id ? "is-active" : ""}"
                data-action="${action}"
                data-management-mode="${option.id}"
                ${eventId ? `data-event-id="${eventId}"` : ""}
                role="radio"
                aria-checked="${selectedMode === option.id}"
                tabindex="${selectedMode === option.id || (!selectedMode && index === 0) ? "0" : "-1"}"
                ${disabled ? "disabled" : ""}
              >
                <span class="event-management-copy">
                  <strong>${option.title}</strong>
                  <small>${option.description}</small>
                </span>
                <span class="event-management-check app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
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
      ${iconSvg("chevron-left")}
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

function renderSettlementHero(event, transfers, pendingTotal, issues = []) {
  const needsReview = issues.length > 0;
  const hasExpenses = event.expenses.length > 0;
  if (!hasExpenses) {
    return renderEventEmptyExpenseState(event, {
      context: "summary",
      eyebrow: "",
      title: "אין עדיין סיכום",
      description: "הוסף הוצאה ראשונה כדי לראות כאן מי שילם וכמה נשאר להתחשבן."
    });
  }
  const pendingTransfers = transfers.filter((transfer) => transfer.status !== "paid");
  const hasPendingTransfers = pendingTransfers.length > 0;
  const hasPersonalIdentity = hasReliableSettlementIdentity(event);
  const personalPendingTransfers = hasPersonalIdentity
    ? pendingTransfers.filter(
        (transfer) =>
          transfer.fromParticipantId === state.currentParticipantId ||
          transfer.toParticipantId === state.currentParticipantId
      )
    : [];
  const personalPayments = personalPendingTransfers.filter(
    (transfer) => transfer.fromParticipantId === state.currentParticipantId
  );
  const personalReceipts = personalPendingTransfers.filter(
    (transfer) => transfer.toParticipantId === state.currentParticipantId
  );
  const personalPaymentTotal = sumMoneyAmounts(
    personalPayments.map((transfer) => transfer.amount)
  );
  const personalReceiptTotal = sumMoneyAmounts(
    personalReceipts.map((transfer) => transfer.amount)
  );
  const singlePersonalPayment =
    personalPayments.length === 1 && !personalReceipts.length
      ? personalPayments[0]
      : null;
  const singlePersonalReceipt =
    personalReceipts.length === 1 && !personalPayments.length
      ? personalReceipts[0]
      : null;
  const isClosed = isEventClosed(event);
  const hasTransfers = transfers.length > 0;
  const isBalancedWithoutTransfers =
    hasExpenses && !needsReview && !hasTransfers;
  const settlementHeroStateClass = !hasExpenses
    ? "is-empty"
    : needsReview
    ? "is-review"
    : hasPendingTransfers
    ? "is-pending"
    : "is-complete";
  const settlementHeroPersonalStateClass =
    settlementHeroStateClass === "is-pending" &&
    !isClosed &&
    personalPendingTransfers.length
      ? "is-personal-pending"
      : "";
  const featuredPersonalTransfer = singlePersonalPayment ?? singlePersonalReceipt;
  const title = !isClosed && hasExpenses && !needsReview
    ? "עוד לא משלמים"
    : !hasExpenses
    ? "עוד אין מה לסכם"
    : needsReview
    ? "צריך לתקן הוצאה לפני הסגירה"
    : singlePersonalPayment
    ? "הפעולה שלך עכשיו"
    : singlePersonalReceipt
    ? "מגיע לך כסף"
    : personalPendingTransfers.length
    ? `${formatCount(personalPendingTransfers.length, "העברה", "העברות")} לטיפול שלך`
    : hasPendingTransfers
    ? `${formatCount(pendingTransfers.length, "העברה", "העברות")} ${pendingTransfers.length === 1 ? "נשארה פתוחה" : "נשארו פתוחות"}`
    : "הכול שולם";
  const descriptionHtml = !isClosed && hasExpenses && !needsReview
    ? "אפשר לראות את המצב כרגע. מעבירים כסף רק לאחר סגירת האירוע."
    : !hasExpenses
    ? "אחרי הוספת ההוצאה הראשונה יופיע כאן מיד מי מעביר למי."
    : needsReview
    ? "יש הוצאה שלא נכנסה לחישוב. חזור להוצאות, תקן אותה ורק אז סגור את האירוע."
    : singlePersonalPayment
    ? `להעביר <span class="font-num">${formatEventMoney(event, singlePersonalPayment.amount)}</span> ל־<strong class="settlement-route-person">${escapeHtml(participantName(singlePersonalPayment.toParticipantId, event))}</strong>.`
    : singlePersonalReceipt
    ? `<strong class="settlement-route-person">${escapeHtml(participantName(singlePersonalReceipt.fromParticipantId, event))}</strong> צריך להעביר לך <span class="font-num">${formatEventMoney(event, singlePersonalReceipt.amount)}</span>.`
    : personalPayments.length && personalReceipts.length
    ? `צריך להעביר <span class="font-num">${formatEventMoney(event, personalPaymentTotal)}</span> ולקבל <span class="font-num">${formatEventMoney(event, personalReceiptTotal)}</span>. ההעברות שלך מודגשות למטה.`
    : personalPayments.length
    ? `${formatCount(personalPayments.length, "תשלום", "תשלומים")} לביצוע בסך <span class="font-num">${formatEventMoney(event, personalPaymentTotal)}</span>.`
    : personalReceipts.length
    ? `${formatCount(personalReceipts.length, "תשלום", "תשלומים")} ${personalReceipts.length === 1 ? "צריך" : "צריכים"} להגיע אליך בסך <span class="font-num">${formatEventMoney(event, personalReceiptTotal)}</span>.`
    : hasPersonalIdentity && hasPendingTransfers
    ? "אין לך העברה לטיפול כרגע. אפשר לעקוב אחרי שאר הקבוצה למטה."
    : hasPendingTransfers
    ? "כל ההעברות בקבוצה מופיעות למטה לפי סדר הטיפול."
    : isBalancedWithoutTransfers
    ? "אין צורך להעביר כסף בין המשתתפים."
    : "כל ההעברות סומנו כשולמו.";
  const shareButtonClass = isClosed || (hasPendingTransfers && !personalPendingTransfers.length)
    ? "primary-button whatsapp-button"
    : "secondary-button whatsapp-button";

  if (featuredPersonalTransfer) {
    return renderFeaturedSettlementHero(event, featuredPersonalTransfer, {
      isClosed,
      needsReview,
      pendingTransfers,
      pendingTotal,
      isCurrentParticipantPaying: Boolean(singlePersonalPayment)
    });
  }

  return `
    <section class="panel settlement-hero ${settlementHeroStateClass} ${settlementHeroPersonalStateClass} ${isBalancedWithoutTransfers ? "is-balanced" : ""}">
      <div class="settlement-hero-main">
        <span class="status-chip ${isClosed ? "is-ok" : "is-warn"}">${isClosed ? "האירוע נסגר" : "אירוע פתוח"}</span>
        <div class="settlement-hero-title-row">
          <div>
            <h2>${escapeHtml(title)}</h2>
            ${descriptionHtml ? `<p class="muted">${descriptionHtml}</p>` : ""}
          </div>
          ${
            isClosed && hasPendingTransfers
              ? `
                  <div class="settlement-hero-total">
                    <span>סה"כ פתוח בקבוצה</span>
                    <strong class="settlement-hero-amount amount"><span class="font-num">${formatEventMoney(event, pendingTotal)}</span></strong>
                  </div>
                `
              : ""
          }
        </div>
      </div>
      <div class="settlement-hero-actions">
        ${
          !hasExpenses
            ? `
                <button class="primary-button" data-action="show-expense-form" data-event-id="${event.id}"><span>הוסף הוצאה</span></button>
              `
            : `
                ${!isClosed
                  ? `<button class="primary-button settlement-close-primary" data-action="close-event" data-event-id="${event.id}" ${needsReview ? "disabled" : ""}>${needsReview ? "תקן הוצאות לפני סגירה" : "בואו נסגור חשבון"}</button>`
                  : `<button class="${shareButtonClass}" data-action="share-whatsapp" data-event-id="${event.id}">שלח בוואטסאפ</button>
                <button class="secondary-button settlement-reopen-action" data-action="reopen-event" data-event-id="${event.id}">פתח אירוע מחדש</button>
                <details class="settlement-more-actions">
                  <summary>עוד</summary>
                  <div>
                    <button class="secondary-button" data-action="copy-settlement" data-event-id="${event.id}">העתק סיכום</button>
                    <button class="secondary-button" data-action="copy-event-report" data-event-id="${event.id}">העתק פירוט הוצאות</button>
                  </div>
                </details>`
                }
              `
        }
      </div>
    </section>
  `;
}

function renderFeaturedSettlementHero(
  event,
  transfer,
  {
    isClosed,
    needsReview,
    pendingTransfers,
    pendingTotal,
    isCurrentParticipantPaying
  }
) {
  const otherParticipantId = isCurrentParticipantPaying
    ? transfer.toParticipantId
    : transfer.fromParticipantId;
  const otherParticipantName = participantName(otherParticipantId, event);
  const routeLabel = isCurrentParticipantPaying
    ? `${isClosed ? "עליך להעביר" : "יתרה זמנית להעברה"} ל־${otherParticipantName}`
    : `${isClosed ? "אמור להגיע אליך" : "יתרה זמנית לקבלה"} מ־${otherParticipantName}`;
  const completionLabel = isCurrentParticipantPaying ? "העברתי" : "קיבלתי";

  return `
    <section class="panel settlement-hero is-pending is-personal-pending is-explained">
      <div class="settlement-featured-action">
        <span class="status-chip ${isClosed ? "is-ok" : "is-warn"}">${isClosed ? "האירוע נסגר" : "אירוע פתוח — עוד לא משלמים"}</span>
        <p class="settlement-featured-route">${escapeHtml(routeLabel)}</p>
        <strong class="settlement-featured-amount amount"><span class="font-num">${formatEventMoney(event, transfer.amount)}</span></strong>
        ${isClosed
          ? `<button class="primary-button settlement-featured-complete" data-action="mark-paid" data-transfer-id="${escapeAttribute(transfer.id)}">${completionLabel}</button>`
          : `<button class="primary-button settlement-close-primary" data-action="close-event" data-event-id="${event.id}" ${needsReview ? "disabled" : ""}>בואו נסגור חשבון</button>`
        }
      </div>

      <div class="settlement-hero-actions settlement-featured-actions">
        <button class="secondary-button whatsapp-button" data-action="share-whatsapp" data-event-id="${event.id}">שלח בוואטסאפ</button>
        ${isClosed ? `<button class="secondary-button settlement-reopen-action" data-action="reopen-event" data-event-id="${event.id}">פתח אירוע מחדש</button>` : ""}
        <details class="settlement-more-actions">
          <summary>עוד</summary>
          <div>
            ${
              isClosed
                ? ""
                : `<button class="secondary-button" data-action="close-event" data-event-id="${event.id}" ${needsReview ? "disabled" : ""}>${needsReview ? "תקן הוצאות לפני סגירה" : "סגור ונעל אירוע"}</button>`
            }
            <button class="secondary-button" data-action="copy-settlement" data-event-id="${event.id}">העתק סיכום</button>
            <button class="secondary-button" data-action="copy-event-report" data-event-id="${event.id}">העתק פירוט הוצאות</button>
          </div>
        </details>
      </div>
    </section>
  `;
}

function renderFeaturedSettlementBreakdown(event, transfer) {
  if (usesDirectSettlementTransfers(event)) {
    return renderDirectFeaturedSettlementBreakdown(event, transfer);
  }

  const participants = eventParticipants(event);
  const debtorId = transfer.fromParticipantId;
  const debtorName = participantName(debtorId, event);
  const breakdown = buildParticipantSettlementBreakdown(
    participants,
    event.expenses,
    debtorId
  );
  const visibleExpenseShares = breakdown.expenseShares.slice(0, 3);
  const remainingExpenseShares = breakdown.expenseShares.slice(3);
  const remainingShareTotal = remainingExpenseShares.reduce(
    (sum, expenseShare) => sum + expenseShare.participantShare,
    0
  );
  const debtTotal = Math.max(0, -breakdown.balance);
  const settledTransferTotal = Math.max(
    0,
    event.transfers
      .filter((item) => item.status === "paid")
      .reduce((sum, item) => {
        if (item.fromParticipantId === debtorId) return sum + item.amount;
        if (item.toParticipantId === debtorId) return sum - item.amount;
        return sum;
      }, 0)
  );
  const allocatedToOtherRecipients = Math.max(
    0,
    debtTotal - settledTransferTotal - transfer.amount
  );
  const paidLabel = debtorId === state.currentParticipantId
    ? "פחות מה שכבר שילמת"
    : `פחות מה ש${debtorName} כבר שילם`;

  return `
    <details class="settlement-featured-breakdown">
      <summary>
        <span>
          <strong>איך חישבנו?</strong>
          <small>פירוט ההוצאות והקיזוזים</small>
        </span>
      </summary>
      <div class="settlement-featured-breakdown-body">
        <div class="settlement-featured-breakdown-list">
        ${visibleExpenseShares
          .map(
            (expenseShare) => `
              <div class="settlement-featured-breakdown-row">
                <span>
                  <strong>${escapeHtml(expenseShare.name)}</strong>
                  <small>${formatCount(expenseShare.participantCount, "משתתף", "משתתפים")}</small>
                </span>
                <span class="amount"><span class="font-num">${formatEventMoney(event, expenseShare.participantShare)}</span></span>
              </div>
            `
          )
          .join("")}
        ${
          remainingExpenseShares.length
            ? `
                <div class="settlement-featured-breakdown-row is-more-expenses">
                  <span>
                    <strong>${formatCount(remainingExpenseShares.length, "הוצאה נוספת", "הוצאות נוספות")}</strong>
                    <small>מופיעות בפירוט המלא</small>
                  </span>
                  <span class="amount"><span class="font-num">${formatEventMoney(event, remainingShareTotal)}</span></span>
                </div>
              `
            : ""
        }
        ${
          breakdown.paidTotal > 0
            ? `
                <div class="settlement-featured-breakdown-row is-adjustment">
                  <span><strong>${escapeHtml(paidLabel)}</strong></span>
                  <span class="amount">−<span class="font-num">${formatEventMoney(event, breakdown.paidTotal)}</span></span>
                </div>
              `
            : ""
        }
        ${
          settledTransferTotal > 0
            ? `
                <div class="settlement-featured-breakdown-row is-adjustment">
                  <span>
                    <strong>פחות העברות שכבר שולמו</strong>
                    <small>תשלומים שסומנו כהושלמו נשמרים בהיסטוריה</small>
                  </span>
                  <span class="amount">−<span class="font-num">${formatEventMoney(event, settledTransferTotal)}</span></span>
                </div>
              `
            : ""
        }
        ${
          allocatedToOtherRecipients > 0.005
            ? `
                <div class="settlement-featured-breakdown-row is-adjustment">
                  <span>
                    <strong>פחות מה שמועבר לאחרים</strong>
                    <small>המערכת צמצמה את מספר ההעברות בקבוצה</small>
                  </span>
                  <span class="amount">−<span class="font-num">${formatEventMoney(event, allocatedToOtherRecipients)}</span></span>
                </div>
              `
            : ""
        }
        <div class="settlement-featured-breakdown-row is-total">
          <span><strong>סה״כ להעברה</strong></span>
          <span class="amount"><span class="font-num">${formatEventMoney(event, transfer.amount)}</span></span>
        </div>
        </div>
        ${
          usesRoundedSettlementTransfers(event)
            ? '<p class="settlement-featured-rounding">ההעברה עוגלה לשקל שלם; פירוט ההוצאות נשאר מדויק עד האגורה.</p>'
            : ""
        }
        <a class="settlement-featured-full" href="#settlement-transfers-title">לכל ההעברות</a>
      </div>
    </details>
  `;
}

function renderSettlementCloseConfirmation(event, pendingTransfers, pendingTotal) {
  const message = pendingTransfers.length === 1
    ? `יתרה סופית אחת בסך ${formatEventMoney(event, pendingTotal)} תישלח לתשלום.`
    : `${pendingTransfers.length} יתרות סופיות בסך ${formatEventMoney(event, pendingTotal)} יישלחו לתשלום.`;

  return `
    <section class="settlement-close-confirmation-backdrop" aria-label="אישור סגירת האירוע">
      <section
        class="settlement-close-confirmation"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="settlement-close-confirmation-title"
        aria-describedby="settlement-close-confirmation-description"
        tabindex="-1"
      >
        <div class="settlement-close-confirmation-heading">
          <div class="settlement-close-confirmation-copy">
            <h2 id="settlement-close-confirmation-title">בואו נסגור חשבון?</h2>
          </div>
          <button
            class="app-toast-close settlement-close-confirmation-dismiss"
            type="button"
            data-action="cancel-close-event-confirmation"
            aria-label="סגירת חלון האישור"
          >${iconSvg("x")}</button>
        </div>
        <p id="settlement-close-confirmation-description">
          ${escapeHtml(message)} אחרי הסגירה לא ניתן לערוך הוצאות, וכל המשתתפים יקבלו עדכון.
        </p>
        <div class="settlement-close-confirmation-actions">
          <button class="secondary-button" type="button" data-action="cancel-close-event-confirmation">ביטול</button>
          <button class="primary-button" type="button" data-action="confirm-close-event" data-allow-offline-mutation="true" data-event-id="${event.id}">סוגרים חשבון</button>
        </div>
      </section>
      ${renderEventRoutePrimaryNav()}
    </section>
  `;
}

function renderTransferRow(
  event,
  transfer,
  {
    highlightPersonal = false,
    paidHistory = [],
    groupedPaidTransfers = []
  } = {}
) {
  const paid = transfer.status === "paid";
  const paymentActionsEnabled = isEventClosed(event);
  const isGroupedPaidTransfer = paid && groupedPaidTransfers.length > 1;
  const historicalPaidTotal = paidHistory.reduce(
    (sum, paidTransfer) => sum + paidTransfer.amount,
    0
  );
  const isPersonal =
    highlightPersonal &&
    (transfer.fromParticipantId === state.currentParticipantId ||
      transfer.toParticipantId === state.currentParticipantId);
  const isCurrentParticipantPaying =
    transfer.fromParticipantId === state.currentParticipantId;
  const pendingStatusText = isPersonal
    ? isCurrentParticipantPaying
      ? "מחכה שתעביר"
      : "מחכה שיגיע"
    : paymentActionsEnabled ? "ממתין להעברה" : "יתרה זמנית";
  const statusText = paid
    ? isGroupedPaidTransfer
      ? `${formatCount(groupedPaidTransfers.length, "תשלום הושלם", "תשלומים הושלמו")}`
      : transferPaidStatusText(event, transfer)
    : pendingStatusText;
  const pendingActionLabel = isPersonal
    ? isCurrentParticipantPaying
      ? "שילמתי"
      : "קיבלתי"
    : "סמן כשולם";
  const fromParticipant = state.participants.find(
    (participant) => participant.id === transfer.fromParticipantId
  );
  const toParticipant = state.participants.find(
    (participant) => participant.id === transfer.toParticipantId
  );
  const fromName = participantName(transfer.fromParticipantId, event);
  const toName = participantName(transfer.toParticipantId, event);
  const personalBadgeLabel = isCurrentParticipantPaying
    ? "ממך"
    : "אליך";
  const personalRoleClass = isPersonal
    ? isCurrentParticipantPaying
      ? "is-personal-payer"
      : "is-personal-receiver"
    : "";
  const canSendReminder =
    !paid && paymentReminderEligibility(transfer).allowed;
  const canUpdatePayment = canCurrentParticipantUpdateTransfer(event, transfer);
  const canUpdateGroupedPayments = groupedPaidTransfers.every((paidTransfer) =>
    canCurrentParticipantUpdateTransfer(event, paidTransfer)
  );
  const reminderBusy = paymentReminderBusyId === transfer.id;
  const explanationOpen = openSettlementTransferIds.has(transfer.id);
  const explanationId = `transfer-explanation-${transfer.id}`;
  return `
    <article
      class="transfer-row ${paid ? "is-paid" : "is-pending"} ${isPersonal ? "is-personal" : ""} ${personalRoleClass} ${explanationOpen ? "is-explanation-open" : ""}"
      data-transfer-id="${escapeAttribute(transfer.id)}"
      tabindex="0"
      aria-expanded="${explanationOpen ? "true" : "false"}"
      aria-controls="${escapeAttribute(explanationId)}"
      aria-label="${escapeAttribute(`${fromName} מעביר ${formatEventMoney(event, transfer.amount)} ל-${toName}. ${historicalPaidTotal ? `${formatEventMoney(event, historicalPaidTotal)} כבר שולמו. ` : ""}${statusText}`)}"
    >
      <div class="transfer-main">
        <div class="transfer-card-meta">
          ${isPersonal ? `<span class="personal-transfer-badge">${personalBadgeLabel}</span>` : '<span class="group-transfer-badge">בין חברים</span>'}
          <span class="transfer-status-cluster">
            <span class="transfer-expand-indicator" aria-hidden="true">⌄</span>
            <small class="transfer-status ${paid ? "status-paid" : ""}">${escapeHtml(statusText)}</small>
          </span>
        </div>
        <div class="transfer-people">
          <div class="transfer-party">
            <span class="transfer-party-label">מי מעביר</span>
            ${renderTransferParticipant(event, transfer.fromParticipantId, fromParticipant)}
          </div>
          <span class="transfer-arrow" aria-hidden="true">אל</span>
          <div class="transfer-party">
            <span class="transfer-party-label">מי מקבל</span>
            ${renderTransferParticipant(event, transfer.toParticipantId, toParticipant)}
          </div>
        </div>
      </div>
      <div class="transfer-actions">
        <span class="transfer-amount">
          <small>${historicalPaidTotal ? "נשאר להעביר" : "סכום להעברה"}</small>
          <span class="amount"><bdi dir="ltr"><span class="font-num">${formatEventMoney(event, transfer.amount)}</span></bdi></span>
          ${historicalPaidTotal ? `<span class="transfer-paid-summary">כבר שולם <bdi dir="ltr"><span class="font-num">${formatEventMoney(event, historicalPaidTotal)}</span></bdi></span>` : ""}
        </span>
        <span class="transfer-action-buttons">
          ${
            canSendReminder
              ? `<button
                  class="secondary-button transfer-reminder-button"
                  type="button"
                  data-action="send-payment-reminder"
                  data-event-id="${escapeAttribute(event.id)}"
                  data-transfer-id="${escapeAttribute(transfer.id)}"
                  aria-label="${escapeAttribute(`שלח תזכורת ל${fromName}`)}"
                  title="${escapeAttribute(`שלח תזכורת ל${fromName}`)}"
                  aria-busy="${reminderBusy ? "true" : "false"}"
                  ${reminderBusy ? "disabled" : ""}
                ><span class="button-action-icon" aria-hidden="true" data-command-icon="send-payment-reminder">${iconSvg("bell")}</span></button>`
              : ""
          }
          ${
            !canUpdatePayment || (!paymentActionsEnabled && !paid)
              ? ""
              : paid && isGroupedPaidTransfer && canUpdateGroupedPayments
              ? `<button class="secondary-button transfer-complete-button" data-action="mark-pending-group" data-transfer-ids="${escapeAttribute(groupedPaidTransfers.map((paidTransfer) => paidTransfer.id).join(","))}" aria-label="${escapeAttribute(`${formatCount(groupedPaidTransfers.length, "העברה שסומנה", "העברות שסומנו")} כהועברו. לחיצה תבטל את כל הסימונים`)}"><span aria-hidden="true">✓</span> הועבר</button>`
              : paid
              ? `<button class="secondary-button transfer-complete-button" data-action="mark-pending" data-transfer-id="${transfer.id}" aria-label="${escapeAttribute(`ההעברה מ-${fromName} ל-${toName} סומנה כהועברה. לחיצה תבטל את הסימון`)}"><span aria-hidden="true">✓</span> הועבר</button>`
              : `<button class="${isPersonal ? "primary-button" : "secondary-button transfer-group-complete-button"}" data-action="mark-paid" data-transfer-id="${transfer.id}">${pendingActionLabel}</button>`
          }
        </span>
      </div>
      ${renderTransferExplanation(event, transfer, { open: explanationOpen, id: explanationId })}
      ${renderTransferPaidHistory(event, paidHistory)}
      ${renderTransferPaidHistory(event, groupedPaidTransfers, {
        summaryLabel: `פירוט ${formatCount(groupedPaidTransfers.length, "תשלום", "תשלומים")}`
      })}
    </article>
  `;
}

function renderDirectFeaturedSettlementBreakdown(event, transfer) {
  const debtorName = participantName(transfer.fromParticipantId, event);
  const creditorName = participantName(transfer.toParticipantId, event);
  const relatedExpenses = event.expenses.filter(
    (expense) =>
      expense.sharedByParticipantIds?.includes(transfer.fromParticipantId) &&
      expense.payers?.some(
        (payer) => payer.participantId === transfer.toParticipantId
      )
  );
  const visibleExpenses = relatedExpenses.slice(0, 3);
  const remainingCount = Math.max(0, relatedExpenses.length - visibleExpenses.length);

  return `
    <details class="settlement-featured-breakdown">
      <summary>
        <span>
          <strong>איך חישבנו?</strong>
          <small>פירוט ההוצאות והקיזוזים</small>
        </span>
      </summary>
      <div class="settlement-featured-breakdown-body">
        <h3>החזר ישיר למי ששילם</h3>
        <p class="muted">${escapeHtml(creditorName)} מימן הוצאות שבהן ${escapeHtml(debtorName)} השתתף. במצב הזה מחזירים כסף ישירות למי שהוציא אותו.</p>
        <div class="settlement-featured-breakdown-list">
        ${
          visibleExpenses.length
            ? visibleExpenses
                .map(
                  (expense) => `
                    <div class="settlement-featured-breakdown-row">
                      <span><strong>${escapeHtml(expense.name || "הוצאה")}</strong></span>
                    </div>
                  `
                )
                .join("")
            : ""
        }
        ${
          remainingCount
            ? `<div class="settlement-featured-breakdown-row is-more-expenses"><span><strong>${formatCount(remainingCount, "הוצאה נוספת", "הוצאות נוספות")}</strong></span></div>`
            : ""
        }
        <div class="settlement-featured-breakdown-row is-total">
          <span><strong>סה״כ להעברה</strong></span>
          <span class="amount"><bdi dir="ltr"><span class="font-num">${formatEventMoney(event, transfer.amount)}</span></bdi></span>
        </div>
        </div>
        ${
          usesRoundedSettlementTransfers(event)
            ? '<p class="settlement-featured-rounding">ההעברה עוגלה לשקל שלם; ההוצאות עצמן נשארו מדויקות.</p>'
            : ""
        }
        <a class="settlement-featured-full" href="#settlement-transfers-title">לכל ההעברות</a>
      </div>
    </details>
  `;
}

function renderTransferPaidHistory(
  event,
  paidHistory,
  { summaryLabel = "תשלומים קודמים" } = {}
) {
  if (!paidHistory.length) return "";

  const total = sumMoneyAmounts(
    paidHistory.map((transfer) => transfer.amount)
  );
  return `
    <details class="transfer-paid-history" open>
      <summary>
        <span>${escapeHtml(summaryLabel)}</span>
        <strong class="amount"><bdi dir="ltr"><span class="font-num">${formatEventMoney(event, total)}</span></bdi></strong>
      </summary>
      <div class="transfer-paid-history-list">
        ${paidHistory
          .map(
            (transfer) => `
              <div class="transfer-paid-history-item">
                <span>
                  <strong class="amount"><bdi dir="ltr"><span class="font-num">${formatEventMoney(event, transfer.amount)}</span></bdi></strong>
                  <small>${escapeHtml(transferPaidStatusText(event, transfer))}</small>
                </span>
                <button
                  type="button"
                  class="secondary-button"
                  data-action="mark-pending"
                  data-transfer-id="${escapeAttribute(transfer.id)}"
                >בטל סימון</button>
              </div>
            `
          )
          .join("")}
      </div>
    </details>
  `;
}

function paymentReminderEligibility(transfer) {
  const accountUserId = String(
    runtimeConfig?.storage?.account?.userId ?? ""
  ).trim();
  const currentAccountParticipantId = accountUserId
    ? `account-${accountUserId}`
    : "";
  const payerUserId = accountUserIdFromParticipantId(
    transfer?.fromParticipantId
  );

  if (
    !currentAccountParticipantId ||
    transfer?.toParticipantId !== currentAccountParticipantId
  ) {
    return { allowed: false, reason: "not-recipient" };
  }
  if (!payerUserId || payerUserId === accountUserId) {
    return { allowed: false, reason: "payer-offline" };
  }
  return { allowed: true, payerUserId };
}

function accountUserIdFromParticipantId(participantId) {
  const match = String(participantId ?? "").match(
    /^account-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
  );
  return match?.[1] ?? "";
}

function renderTransferParticipant(
  event,
  participantId,
  participant
) {
  const showOfflineBadge =
    participant && !participantConnectionStatus(participant).connected;
  const opensStatistics = canOpenParticipantStatistics(participantId);
  const participantAction = opensStatistics
    ? "open-participant-statistics"
    : "open-event-participant-profile";
  const participantActionLabel = opensStatistics
    ? `פתיחת הסטטיסטיקה בינך לבין ${participantName(participantId, event)}`
    : `ניהול ${participantName(participantId, event)}`;
  return `
    <span class="transfer-participant">
      <button
        type="button"
        class="transfer-participant-avatar-action"
        data-action="${participantAction}"
        data-event-id="${escapeAttribute(event.id)}"
        data-participant-id="${escapeAttribute(participantId)}"
        aria-label="${escapeAttribute(participantActionLabel)}"
      >${renderAvatar(participantId, event, { suppressParticipantAction: true })}</button>
      <span class="transfer-participant-copy">
        <span class="transfer-participant-name">
          <strong><bdi>${escapeHtml(participantName(participantId, event))}</bdi></strong>
        </span>
        ${showOfflineBadge ? renderParticipantConnectionBadge(participant) : ""}
      </span>
    </span>
  `;
}

function transferPaidStatusText(event, transfer) {
  const markerId = transfer.markedPaidByParticipantId;
  const marker = markerId
    ? markerId === state.currentParticipantId
      ? "סומן על ידך"
      : `סומן על ידי ${participantName(markerId, event)}`
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

function renderTransferExplanation(event, transfer, { open = false, id = "" } = {}) {
  const idAttribute = id ? ` id="${escapeAttribute(id)}"` : "";
  if (usesDirectSettlementTransfers(event)) {
    const debtorName = participantName(transfer.fromParticipantId, event);
    const creditorName = participantName(transfer.toParticipantId, event);
    return `
      <details class="transfer-explanation"${idAttribute} ${open ? "open" : ""}>
        <summary>איך הסכום חושב?</summary>
        <div class="transfer-explanation-body">
          <p class="transfer-debt-summary"><strong><bdi>${escapeHtml(debtorName)}</bdi> חייב ל־<bdi>${escapeHtml(creditorName)}</bdi> <bdi dir="ltr"><span class="font-num">${formatEventMoney(event, transfer.amount)}</span></bdi></strong></p>
          <p class="transfer-route-note">
            <bdi>${escapeHtml(debtorName)}</bdi> מעביר <bdi dir="ltr"><span class="font-num">${formatEventMoney(event, transfer.amount)}</span></bdi> ל־<bdi>${escapeHtml(creditorName)}</bdi> לפי ההוצאות ש<bdi>${escapeHtml(creditorName)}</bdi> מימן.
          </p>
          ${
            usesRoundedSettlementTransfers(event)
              ? '<p class="transfer-rounding-note">סכומי ההעברה עוגלו לשקלים שלמים. ההוצאות נשארו מדויקות עד האגורה.</p>'
              : ""
          }
        </div>
      </details>
    `;
  }

  const participants = eventParticipants(event);
  const debtorId = transfer.fromParticipantId;
  const debtorName = participantName(debtorId, event);
  const breakdown = buildParticipantSettlementBreakdown(
    participants,
    event.expenses,
    debtorId
  );
  const debtTotal = Math.max(0, -breakdown.balance);
  const isSplitAcrossTransfers = debtTotal > transfer.amount;
  const creditorName = participantName(transfer.toParticipantId, event);

  return `
    <details class="transfer-explanation"${idAttribute} ${open ? "open" : ""}>
      <summary>איך הסכום חושב?</summary>
      <div class="transfer-explanation-body">
        <p class="transfer-debt-summary"><strong><bdi>${escapeHtml(debtorName)}</bdi> חייב ל־<bdi>${escapeHtml(creditorName)}</bdi> <bdi dir="ltr"><span class="font-num">${formatEventMoney(event, transfer.amount)}</span></bdi></strong></p>
        <div class="transfer-equation" aria-label="פירוט החישוב של ${escapeHtml(debtorName)}">
          <div class="transfer-equation-item">
            <span>החלק של ${escapeHtml(debtorName)}</span>
            <strong class="amount"><bdi dir="ltr"><span class="font-num">${formatEventMoney(event, breakdown.shareTotal)}</span></bdi></strong>
          </div>
          <span class="transfer-equation-sign" aria-hidden="true">−</span>
          <div class="transfer-equation-item">
            <span>${escapeHtml(debtorName)} כבר שילם</span>
            <strong class="amount"><bdi dir="ltr"><span class="font-num">${formatEventMoney(event, breakdown.paidTotal)}</span></bdi></strong>
          </div>
          <span class="transfer-equation-sign" aria-hidden="true">=</span>
          <div class="transfer-equation-item is-result">
            <span>נשאר לשלם</span>
            <strong class="amount"><bdi dir="ltr"><span class="font-num">${formatEventMoney(event, debtTotal)}</span></bdi></strong>
          </div>
        </div>
        ${
          usesRoundedSettlementTransfers(event)
            ? '<p class="transfer-rounding-note">סכומי ההעברה עוגלו לשקלים שלמים. הפירוט נשאר מדויק עד האגורה.</p>'
            : ""
        }
        <p class="transfer-route-note">
          <bdi>${escapeHtml(debtorName)}</bdi> מעביר <bdi dir="ltr"><span class="font-num">${formatEventMoney(event, transfer.amount)}</span></bdi> ל־<bdi>${escapeHtml(creditorName)}</bdi>${isSplitAcrossTransfers ? ` מתוך חוב כולל של <bdi dir="ltr"><span class="font-num">${formatEventMoney(event, debtTotal)}</span></bdi>` : ""}.
        </p>
      </div>
    </details>
  `;
}

function setTransferExplanationOpen(transferRow, open) {
  const explanation = transferRow?.querySelector?.(".transfer-explanation");
  if (!(transferRow instanceof HTMLElement) || !(explanation instanceof HTMLDetailsElement)) {
    return false;
  }

  explanation.open = open;
  transferRow.classList.toggle("is-explanation-open", open);
  transferRow.setAttribute("aria-expanded", String(open));
  const transferId = transferRow.dataset.transferId;
  if (transferId) {
    if (open) openSettlementTransferIds.add(transferId);
    else openSettlementTransferIds.delete(transferId);
    persistOpenSettlementTransferIds();
  }
  return true;
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
        <strong class="amount"><span class="font-num">${formatEventMoney(event, expenseShare.participantShare)}</span></strong>
      </span>
    </div>
  `;
}

function renderBalanceRow(event, participantId, balance) {
  const className = balance > 0 ? "is-credit" : balance < 0 ? "is-debt" : "";
  const label = balance > 0 ? "מקבל" : balance < 0 ? "משלם" : "מאוזן";
  return `
    <div class="balance-row ${className}">
      <strong>${escapeHtml(participantName(participantId, event))}</strong>
      <span>${label} <span class="amount"><span class="font-num">${formatEventMoney(event, Math.abs(balance))}</span></span></span>
    </div>
  `;
}

const PARTICIPANT_SEARCH_THRESHOLD = 15;
const EVENT_PARTICIPANT_SEARCH_THRESHOLD = 6;
const IDENTITY_GROUPED_PARTICIPANT_ACTIONS = new Set([
  "event-participant",
  "new-event-participant",
  "expense-shared",
  "group-member",
  "edit-group-member",
  "edit-group-admin"
]);

function filterParticipantChecks(input) {
  const checks = input.closest(
    ".participant-checks-set, [data-participant-checks-for], [data-event-participant-roster]"
  );
  if (!checks) return;

  const query = input.value.trim().toLowerCase();
  let visibleCount = 0;
  checks.querySelectorAll("[data-participant-name]").forEach((row) => {
    const name = row.dataset.participantName ?? "";
    const matches = !query || name.includes(query);
    setSearchResultHidden(row, !matches);
    if (matches) visibleCount += 1;
  });

  checks.querySelectorAll("[data-participant-identity-group]").forEach((group) => {
    setSearchResultHidden(
      group,
      ![...group.querySelectorAll("[data-participant-name]")].some(
        (row) => !row.hidden
      )
    );
  });

  const emptyNote = checks.querySelector(
    '[data-participant-search-empty][role="status"]'
  );
  if (emptyNote) emptyNote.hidden = visibleCount > 0;
}

function rememberParticipantSearch(input) {
  const searchFor = input.dataset.participantSearchFor ?? "";
  if (!searchFor) return;
  const query = input.value.trim();
  if (query) {
    participantSearchQueries.set(searchFor, query);
  } else {
    participantSearchQueries.delete(searchFor);
  }
}

function restoreParticipantSearchFilters() {
  app.querySelectorAll('[data-action="participant-search"][data-participant-search-for]').forEach((input) => {
    const query = participantSearchQueries.get(input.dataset.participantSearchFor) ?? "";
    if (!query) return;
    input.value = query;
    filterParticipantChecks(input);
  });
}

function setSearchResultHidden(element, hidden) {
  element.hidden = hidden;
  if (hidden) {
    element.style.setProperty("display", "none", "important");
  } else {
    element.style.removeProperty("display");
  }
}

function filterFriendRows(input) {
  const roster = input.closest(".friends-hub-panel")?.querySelector("[data-friends-roster]");
  if (!roster) return;

  const query = input.value.trim().toLocaleLowerCase("he");
  let visibleCount = 0;
  roster.querySelectorAll("[data-friend-name]").forEach((row) => {
    const name = row.dataset.friendName ?? "";
    const matches = !query || name.includes(query);
    setSearchResultHidden(row, !matches);
    if (matches) visibleCount += 1;
  });

  roster.querySelectorAll("[data-friend-identity-section]").forEach((section) => {
    setSearchResultHidden(
      section,
      ![...section.querySelectorAll("[data-friend-name]")].some(
        (row) => !row.hidden
      )
    );
  });

  const emptyNote = roster.querySelector("[data-friends-search-empty]");
  if (emptyNote) emptyNote.hidden = visibleCount > 0;
}

function participantCandidateFilter(selectedIds, action = "") {
  const allowedIds = new Set([
    state.currentParticipantId,
    ...activeFriendParticipantIds(state),
    ...(selectedIds ?? [])
  ]);

  if (action === "new-event-participant" && newEventDraft?.groupId) {
    const selectedGroup = state.groups.find(
      (group) => group.id === newEventDraft.groupId
    );
    for (const participantId of selectedGroup?.memberIds ?? []) {
      allowedIds.add(participantId);
    }
  }

  if (action === "edit-group-admin") {
    for (const participantId of editingGroupDraft?.memberIds ?? []) {
      allowedIds.add(participantId);
    }
  }

  return (participant) =>
    allowedIds.has(participant.id) &&
    !(
      action === "new-event-participant" &&
      participant.id === state.currentParticipantId
    );
}

function participantConnectionStatus(participant) {
  return participantConnectionStatusForEvent(participant, null);
}

function participantConnectionStatusForEvent(participant, event) {
  const isCurrentParticipant = participant.id === state.currentParticipantId;
  const isHistoricalOffline = Boolean(
    event && isEventParticipantInactive(event, participant.id)
  );
  const authProvider =
    participant.authProvider ??
    (isCurrentParticipant ? localProfile?.authProvider : "");
  const authSubject =
    participant.authSubject ??
    (isCurrentParticipant ? localProfile?.authSubject : "");
  const connected =
    participant.accountLinked === true ||
    (
      ["google", "apple", "email"].includes(authProvider) &&
      Boolean(authSubject)
    );

  if (connected && !isHistoricalOffline) {
    return {
      connected: true,
      label: isCurrentParticipant ? "אתה" : "חבר באפליקציה",
      className: "is-connected",
      description: isCurrentParticipant
        ? `${participant.displayName} הוא הפרופיל שלך`
        : `${participant.displayName} הוא חבר באפליקציה`
    };
  }

  return {
    connected: false,
    label: "שם אופליין",
    className: "is-offline",
    description: isHistoricalOffline
      ? `${participant.displayName} אינו משתתף פעיל באירוע והשם נשמר עבור ההיסטוריה`
      : `${participant.displayName} הוא שם שהוזן ידנית ואינו משתמש מחובר`
  };
}

function renderParticipantConnectionBadge(participant, event = null) {
  const status = participantConnectionStatusForEvent(participant, event);
  return `
    <small
      class="participant-connection-badge ${status.className}"
      title="${escapeAttribute(status.description)}"
      aria-label="${escapeAttribute(status.description)}"
    >
      <span class="participant-connection-dot" aria-hidden="true"></span>
      ${status.label}
    </small>
  `;
}

function participantUsernameLabel(participant) {
  const currentUsername =
    participant?.id === state.currentParticipantId
      ? currentFriendUsername() || profileUsernameDraft
      : "";
  return formatUsername(participant?.username || currentUsername);
}

function participantSearchIdentity(participant, displayName) {
  return [displayName, participantUsernameLabel(participant)]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("he");
}

function renderParticipantUsername(participant) {
  const username = participantUsernameLabel(participant);
  return username
    ? `<bdi class="participant-username" dir="ltr">${escapeHtml(username)}</bdi>`
    : "";
}

function renderParticipantPill(participant, selectedIds, action, event, disabled) {
  const displayName = event
    ? participantName(participant.id, event)
    : participant.displayName;
  const identity = participantConnectionStatus(participant);
  const selected = selectedIds.includes(participant.id);
  const groupedIdentity = IDENTITY_GROUPED_PARTICIPANT_ACTIONS.has(action);
  const secondaryIdentity = groupedIdentity
    ? renderParticipantUsername(participant)
    : renderParticipantConnectionBadge(participant);
  return `
    <label class="participant-pill ${identity.connected ? "is-account" : "is-offline"}" ${action === "new-event-participant" ? `data-action="toggle-new-event-participant" data-participant-id="${escapeAttribute(participant.id)}"` : ""} data-participant-name="${escapeAttribute(participantSearchIdentity(participant, displayName))}" data-participant-identity="${identity.connected ? "account" : "offline"}">
      <input
        type="checkbox"
        data-action="${action}"
        data-participant-id="${participant.id}"
        name="participantSelection"
        value="${participant.id}"
        ${selected ? "checked" : ""}
        ${disabled ? "disabled" : ""}
      />
      ${renderAvatar(participant.id, event)}
      <span class="participant-pill-copy">
        <span class="participant-pill-name">${escapeHtml(displayName)}</span>
        ${secondaryIdentity}
      </span>
      <span class="new-event-selection-check app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
    </label>
  `;
}

function renderReopenPaymentOptions(dialog) {
  const selectedMode = dialog.payload?.paymentMode === "reset" ? "reset" : "keep";
  return `
    <fieldset class="reopen-payment-options">
      <legend>איך להתייחס להעברות שכבר סומנו?</legend>
      <button class="reopen-payment-option ${selectedMode === "keep" ? "is-selected" : ""}" type="button" data-action="select-reopen-payment-mode" data-payment-mode="keep" aria-pressed="${selectedMode === "keep"}">
        <strong>לשמור תשלומים שבוצעו <span class="recommended-label">מומלץ</span></strong>
        <span>נחשב מחדש רק את היתרה שנותרה</span>
      </button>
      <button class="reopen-payment-option is-destructive ${selectedMode === "reset" ? "is-selected" : ""}" type="button" data-action="select-reopen-payment-mode" data-payment-mode="reset" aria-pressed="${selectedMode === "reset"}">
        <strong>לאפס את כל התשלומים</strong>
        <span>נחשב מחדש את כל האירוע מההתחלה</span>
      </button>
    </fieldset>
  `;
}

function renderExpenseParticipantRow(participant, selectedIds, event, disabled) {
  const displayName = participantName(participant.id, event);
  const identity = participantConnectionStatus(participant);
  const selected = selectedIds.includes(participant.id);

  return `
    <label
      class="expense-participant-row ${identity.connected ? "is-account" : "is-offline"}"
      data-participant-name="${escapeAttribute(participantSearchIdentity(participant, displayName))}"
      data-participant-identity="${identity.connected ? "account" : "offline"}"
    >
      <input
        class="expense-participant-checkbox"
        type="checkbox"
        data-action="expense-shared"
        data-participant-id="${participant.id}"
        name="participantSelection"
        value="${participant.id}"
        ${selected ? "checked" : ""}
        ${disabled ? "disabled" : ""}
      />
      ${renderAvatar(participant.id, event)}
      <span class="expense-participant-row-copy">
        <strong>${escapeHtml(displayName)}</strong>
        <small>${escapeHtml(identity.label)}</small>
      </span>
      <span class="expense-participant-row-check app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
    </label>
  `;
}

function renderParticipantMembershipStatus(selected) {
  return `
    <span
      class="participant-membership-status"
      data-membership-state="${selected ? "active" : "inactive"}"
      aria-hidden="true"
    >
      <span class="participant-membership-icon"></span>
      <span class="participant-membership-label">${selected ? "באירוע" : "לא באירוע"}</span>
    </span>
  `;
}

function renderParticipantIdentityGroup(
  participants,
  selectedIds,
  action,
  event,
  disabled,
  identity
) {
  if (!participants.length) return "";

  const isAccount = identity === "account";
  const title = isAccount ? "משתמשים באפליקציה" : "שמות אופליין";
  const description = isAccount
    ? "חשבונות מחוברים שמנהלים את ההוצאות שלהם"
    : "שמות שהוזנו ידנית ואינם משתמשים מחוברים";
  const count = isAccount
    ? formatCount(participants.length, "משתמש", "משתמשים")
    : formatCount(participants.length, "שם", "שמות");
  const titleId = `${action}-${identity}-participants-title`;
  const isEventCreationGroup = action === "new-event-participant";

  return `
    <section
      class="participant-identity-group ${isAccount ? "is-account" : "is-offline"} ${isEventCreationGroup ? "is-event-creation-group" : ""}"
      data-participant-identity-group="${identity}"
      aria-labelledby="${escapeAttribute(titleId)}"
    >
      <header class="participant-identity-group-header">
        ${isEventCreationGroup ? "" : '<span class="participant-identity-group-marker" aria-hidden="true"></span>'}
        <span class="participant-identity-group-copy">
          <strong id="${escapeAttribute(titleId)}">${title}</strong>
          <small>${description}</small>
        </span>
        ${isEventCreationGroup ? "" : `<span class="participant-identity-group-count">${count}</span>`}
      </header>
      <div class="participant-grid">
        ${participants
          .map((participant) =>
            renderParticipantPill(participant, selectedIds, action, event, disabled)
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderParticipantChecks(selectedIds, action, event = null) {
  const participantSource = event && action === "event-participant"
    ? [...state.participants]
        .filter(participantCandidateFilter(selectedIds, action))
    : event
      ? selectableEventParticipants(event, selectedIds)
      : IDENTITY_GROUPED_PARTICIPANT_ACTIONS.has(action)
        ? state.participants.filter(participantCandidateFilter(selectedIds, action))
        : state.participants;
  const participants = [...participantSource].sort((left, right) => {
    const selectedOrder =
      Number(selectedIds.includes(right.id)) - Number(selectedIds.includes(left.id));
    if (selectedOrder) return selectedOrder;

    const connectionOrder =
      Number(participantConnectionStatus(right).connected) -
      Number(participantConnectionStatus(left).connected);
    if (connectionOrder) return connectionOrder;

    return left.displayName.localeCompare(right.displayName, "he");
  });
  const disabled = event && !canCurrentParticipantEdit(event);
  const showSearch =
    ["event-participant", "new-event-participant"].includes(action) &&
    participants.length > PARTICIPANT_SEARCH_THRESHOLD;
  const groupByIdentity = IDENTITY_GROUPED_PARTICIPANT_ACTIONS.has(action);
  const participantList = action === "expense-shared"
    ? `
      <div class="expense-participant-list" role="group" aria-label="משתתפים בהוצאה">
        ${participants
          .map((participant) =>
            renderExpenseParticipantRow(participant, selectedIds, event, disabled)
          )
          .join("")}
      </div>
    `
    : groupByIdentity
      ? `
      <div class="participant-identity-groups">
        ${renderParticipantIdentityGroup(
          participants.filter((participant) => participantConnectionStatus(participant).connected),
          selectedIds,
          action,
          event,
          disabled,
          "account"
        )}
        ${renderParticipantIdentityGroup(
          participants.filter((participant) => !participantConnectionStatus(participant).connected),
          selectedIds,
          action,
          event,
          disabled,
          "offline"
        )}
      </div>
    `
      : `
      <div class="participant-grid">
        ${participants
          .map((participant) =>
            renderParticipantPill(participant, selectedIds, action, event, disabled)
          )
          .join("")}
      </div>
    `;

  return `
    <div class="participant-checks-set" data-participant-checks-for="${escapeAttribute(action)}">
      ${
        showSearch
          ? `<label class="field participant-search-field">
              <span>חיפוש שם</span>
              <input
                data-action="participant-search"
                data-participant-search-for="${escapeAttribute(action)}"
                type="search"
                autocomplete="off"
                enterkeyhint="search"
                name="participantSearch"
                placeholder="הקלד כדי לסנן…"
                aria-label="חיפוש בשמות שנשמרו"
              />
            </label>`
          : ""
      }
      ${participantList}
      <p class="muted" data-participant-search-empty role="status" hidden>אין שם שמתאים לחיפוש.</p>
    </div>
  `;
}

function openEventDialog(eventId, kind, trigger = document.activeElement) {
  openEventDialogWithDetails(eventId, kind, trigger);
}

function openEventDialogWithDetails(
  eventId,
  kind,
  trigger = document.activeElement,
  details = {}
) {
  const event = getEvent(eventId);
  if (!event) return;

  const returnKind =
    kind === "share" &&
    eventDialog?.eventId === eventId &&
    ["participants", "participants-add", "participant-link"].includes(eventDialog.kind)
      ? eventDialog.kind
      : "";
  const returnParticipantId = returnKind === "participant-link"
    ? eventDialog?.participantId
    : "";
  rememberDialogReturnFocus(trigger);
  expenseDraft = null;
  eventDialog = {
    ...details,
    eventId,
    kind,
    returnKind,
    ...(returnParticipantId ? { returnParticipantId } : {}),
    historyBaseDepth: Number.isFinite(eventDialog?.historyBaseDepth)
      ? eventDialog.historyBaseDepth
      : appHistoryDepth
  };
  render();
  activateDialog(".event-modal");
}

function handleEventLongPressStart(event) {
  if (!event.isPrimary || event.button !== 0) return;
  if (event.target.closest('[data-action="open-participant-statistics"]')) return;
  if (event.target.closest('[data-action="event-status-select"]')) return;

  const target = event.target.closest('[data-long-press-event="true"][data-event-id]');
  if (!target || eventStatusMenu || importantActionDialog) return;

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
    openEventStatusMenu(eventId, trigger);
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
  if (isEditableTextTarget(event.target)) return;

  event.preventDefault();
  if (event.target.closest('[data-action="open-participant-statistics"]')) return;
  if (event.target.closest('[data-action="event-status-select"]')) return;

  const target = event.target.closest('[data-long-press-event="true"][data-event-id]');
  if (!target) return;

  cancelEventLongPress();
  suppressedEventOpenId = target.dataset.eventId;
  suppressEventOpenUntil = performance.now() + 900;
  openEventStatusMenu(target.dataset.eventId, target);
}

function isEditableTextTarget(target) {
  const control = target?.closest?.(
    'input, textarea, [contenteditable], [role="textbox"]'
  );
  if (!control) return false;
  if (control.matches("textarea")) {
    return !control.readOnly && !control.disabled;
  }
  if (control.matches("input")) {
    return (
      !control.readOnly &&
      !control.disabled &&
      ![
        "button",
        "checkbox",
        "color",
        "file",
        "hidden",
        "image",
        "radio",
        "range",
        "reset",
        "submit"
      ].includes(control.type)
    );
  }
  if (control.matches('[role="textbox"]')) {
    return control.getAttribute("aria-readonly") !== "true";
  }
  return control.isContentEditable;
}

function handleTextSelectionStart(event) {
  if (!isEditableTextTarget(event.target)) event.preventDefault();
}

function handleParticipantAvatarKeydown(event) {
  const avatar = event.target.closest?.(
    '.avatar[data-action="open-participant-statistics"], .avatar[data-action="edit-profile"]'
  );
  if (!avatar || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  avatar.click();
}

function openEventStatusMenu(eventId, trigger) {
  const event = getEvent(eventId);
  if (
    !event ||
    eventStatusMenu ||
    importantActionDialog
  ) {
    return;
  }

  rememberDialogReturnFocus(trigger);
  eventStatusMenu = { eventId };
  render();
  activateDialog(".event-status-menu");
  requestAnimationFrame(() => {
    app
      .querySelector(
        ".event-share-option:not(:disabled), .event-removal-option:not(:disabled), .event-status-menu-cancel"
      )
      ?.focus({ preventScroll: true });
  });
}

function openEventParticipantAddFromHomeMenu(eventId) {
  const event = getEvent(eventId);
  if (!event || !eventStatusMenu) return;
  if (!canCurrentParticipantEdit(event) || isEventClosed(event)) {
    notice = isEventClosed(event)
      ? "כדי להזמין משתתפים צריך לפתוח את האירוע מחדש."
      : editBlockedMessage(event);
    eventStatusMenu = null;
    closeDialogWithHistory();
    return;
  }

  const historyBaseDepth = Math.max(0, appHistoryDepth - 1);
  eventStatusMenu = null;
  eventDialog = {
    eventId,
    kind: "participants-add",
    returnKind: "home",
    historyBaseDepth
  };
  restoringBrowserHistory = true;
  try {
    render();
  } finally {
    restoringBrowserHistory = false;
  }
  replaceBrowserHistoryState();
  activateDialog(".event-modal");
}

async function handleClick(event) {
  flushScheduledBrowserHistoryReplacement();
  const clickedTransientMenu = event.target.closest?.(
    ".expense-row-actions-menu, .settlement-more-actions, .event-cover-actions-menu"
  );
  closeOpenTransientMenus(clickedTransientMenu);
  if (dismissTransientBackdrop(event)) return;

  const transferRow = event.target.closest?.(".transfer-row");
  if (
    transferRow &&
    !event.target.closest("button, a, summary, input, select, textarea")
  ) {
    const explanation = transferRow.querySelector(".transfer-explanation");
    if (explanation) {
      setTransferExplanationOpen(transferRow, !explanation.open);
    }
    return;
  }

  const target = event.target.closest("[data-action]");
  if (!target) return;
  if (clickedTransientMenu) clickedTransientMenu.open = false;

  const action = target.dataset.action;

  if (action === "dismiss-notice") {
    event.preventDefault();
    clearRenderedNotice();
    return;
  }

  if (action === "profile-avatar-image") {
    try {
      window.sessionStorage.setItem(
        PROFILE_IMAGE_PICKER_RETURN_STORAGE_KEY,
        String(Date.now())
      );
    } catch {
      // The picker still works when session storage is unavailable.
    }
    return;
  }

  if (["toggle-new-event-participant", "new-event-participant"].includes(action)) {
    event.preventDefault();
    const participantId = target.dataset.participantId;
    if (!participantId || !newEventDraft) return;
    if (participantId === state.currentParticipantId) {
      ensureCurrentParticipantInNewEventDraft();
      syncNewEventParticipantControls();
      return;
    }
    if (newEventDraft.participantIds.includes(participantId)) {
      requestNewEventParticipantRemoval(participantId, target);
    } else {
      toggleId(newEventDraft.participantIds, participantId, true);
      render();
    }
    return;
  }

  if (action === "focus-event-offline-name") {
    const details = target.closest(".event-participant-offline-entry");
    if (!(details instanceof HTMLDetailsElement)) return;

    event.preventDefault();
    const nextOpen = !details.open;
    details.open = nextOpen;
    if (
      eventDialog?.kind === "participants-add" &&
      eventDialog.eventId
    ) {
      eventDialog = {
        ...eventDialog,
        offlineEntryOpen: nextOpen
      };
    }
    if (!details.open) return;

    const input = details.querySelector('[data-action="event-guest-name"]');
    if (!(input instanceof HTMLInputElement) || input.disabled) return;
    input.focus({ preventScroll: true });
    window.requestAnimationFrame(() => {
      input.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return;
  }

  if (action === "dismiss-settlement-celebration") {
    const settlementReturnTarget = app.querySelector(
      '.event-workspace-nav [data-action="settle"]'
    );
    if (settlementReturnTarget) {
      dialogReturnFocus = createActionFocusDescriptor(settlementReturnTarget);
    }
    settlementCelebration = null;
    closeDialogWithHistory();
    return;
  }

  if (action === "archive-settled-event") {
    archiveSettledEvent(target.dataset.eventId);
    return;
  }

  if (action === "event-status-select") {
    event.preventDefault();
    event.stopPropagation();
    openEventStatusMenu(target.dataset.eventId, target);
    return;
  }

  if (action === "cancel-event-status-menu") {
    eventStatusMenu = null;
    closeDialogWithHistory();
    return;
  }

  if (action === "share-event-from-list") {
    openEventParticipantAddFromHomeMenu(target.dataset.eventId);
    return;
  }

  if (action === "toggle-personal-event-archive") {
    const selectedEvent = getEvent(target.dataset.eventId);
    if (!selectedEvent) return;
    const archive = !isEventPersonallyArchived(selectedEvent.id);
    setEventPersonallyArchived(selectedEvent.id, archive);
    eventStatusMenu = null;
    closeDialogWithHistory();
    notice = archive
      ? `"${selectedEvent.name}" עבר לארכיון שלך.`
      : `"${selectedEvent.name}" חזר לאירועים שלך.`;
    render();
    return;
  }

  if (action === "choose-event-status") {
    await chooseEventStatusFromMenu(
      target.dataset.eventId,
      target.dataset.eventStatus,
      target
    );
    return;
  }

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

  if (action === "confirm-important-action-alternate") {
    await confirmImportantAction("alternate");
    return;
  }

  if (action === "select-reopen-payment-mode") {
    if (importantActionDialog?.kind !== "reopen-event") return;
    importantActionDialog.payload.paymentMode =
      target.dataset.paymentMode === "reset" ? "reset" : "keep";
    render();
    activateDialog(".important-action-dialog");
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
    notificationsReturnScreen = null;
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
    requestResumeSync({ force: true }).catch(() => {});
  }

  if (action === "save-profile") {
    await saveProfileFromDraft();
  }

  if (action === "edit-profile-name") {
    profileNameEditing = true;
    profileError = "";
    render();
    window.requestAnimationFrame(() => {
      document.querySelector('[data-action="profile-name"]')?.focus({ preventScroll: true });
    });
  }

  if (action === "edit-profile-username") {
    profileUsernameEditing = true;
    profileUsernameError = "";
    render();
    window.requestAnimationFrame(() => {
      document.querySelector('[data-action="profile-username"]')?.focus({ preventScroll: true });
    });
  }

  if (action === "cancel-profile-name-edit") {
    profileNameEditing = false;
    profileNameDraft = localProfile?.displayName ?? participantName(state.currentParticipantId);
    profileError = "";
    render();
  }

  if (action === "cancel-profile-username-edit") {
    profileUsernameEditing = false;
    profileUsernameDraft = currentFriendUsername();
    profileUsernameError = "";
    render();
  }

  if (action === "edit-profile") {
    notice = "";
    eventDialog = null;
    screen = { name: "profile" };
    profileNameDraft = localProfile?.displayName ?? participantName(state.currentParticipantId);
    profileAvatarDraft = avatarPresetForParticipant(
      state.participants.find((participant) => participant.id === state.currentParticipantId),
      state.currentParticipantId
    );
    profileAvatarImageDraft = normalizeAvatarImage(
      state.participants.find((participant) => participant.id === state.currentParticipantId)?.avatarImage ??
        localProfile?.avatarImage
    );
    profileError = "";
    profileUsernameDraft = currentFriendUsername();
    profileUsernameError = "";
    profileNameEditing = false;
    profileUsernameEditing = false;
    const shouldRefreshFriendIdentity =
      friendNetworkAvailable(runtimeConfig) &&
      friendNetwork.status !== "ready";
    if (shouldRefreshFriendIdentity) {
      friendNetwork = emptyFriendNetwork("loading");
    }
    render();
    if (shouldRefreshFriendIdentity) {
      refreshFriendNetwork().catch(() => {});
    }
    refreshAdminAnalytics().catch(() => {});
  }

  if (action === "open-admin-overview") {
    if (!adminAnalytics.available) return;
    notice = "";
    screen = { name: "admin-overview" };
    render();
    await refreshAdminAnalytics({ force: true });
    return;
  }

  if (action === "refresh-admin-overview") {
    await refreshAdminAnalytics({ force: true });
    return;
  }

  if (action === "open-notifications") {
    notice = "";
    if (screen.name !== "notifications") {
      notificationsReturnScreen = cloneNavigationValue(screen);
    }
    eventDialog = null;
    screen = { name: "notifications" };
    render();
    await refreshNotificationInbox({ force: true });
    return;
  }

  if (action === "retry-notifications") {
    await refreshNotificationInbox({ force: true });
    return;
  }

  if (action === "mark-all-notifications-read") {
    await markAllInboxItemsRead();
    return;
  }

  if (action === "open-notification") {
    await openInboxNotification({
      notificationId: target.dataset.notificationId,
      eventId: target.dataset.eventId,
      view: target.dataset.notificationView
    });
    return;
  }

  if (action === "reset") {
    requestApplicationReset(target);
    return;
  }

  if (action === "new-event") {
    notice = "";
    emitProductMetric("event_creation_started", { screen: "home" });
    screen = { name: "new-event-type" };
    newEventDraft = null;
    joinEventDraft = null;
    eventDialog = null;
    editingGroupDraft = null;
    mergeParticipantsDraft = null;
    render();
    if (friendNetworkAvailable(runtimeConfig)) {
      refreshFriendNetwork({ preserveNotice: true }).catch(() => {});
    }
  }

  if (action === "new-event-type") {
    const selectedEventType = normalizeEventType(target.dataset.eventType);
    newEventDraft.eventType = selectedEventType;
    newEventDraft.managementMode = EVENT_MANAGEMENT_COLLABORATIVE;
    screen = { name: "new-event" };
    render();
    requestAnimationFrame(() => {
      document
        .querySelector('[data-action="new-event-name"]')
        ?.focus();
    });
  }

  if (action === "go-new-event-step") {
    const step = target.dataset.newEventStep;
    const destinations = {
      type: "new-event-type",
      details: "new-event",
      settlement: "new-event-settlement",
      participants: "new-event-participants"
    };
    const destination = destinations[step];
    if (!destination || (step !== "type" && !newEventDraft?.eventType)) return;
    syncNewEventDraftFromRenderedDetails();
    if (newEventDraft) newEventDraft.participantView = "";
    screen = { name: destination };
    render();
    return;
  }

  if (action === "open-new-event-settlement") {
    if (!newEventDraft) return;
    syncNewEventDraftFromRenderedDetails();
    newEventDraft.settlementChoiceOpen = "";
    screen = { name: "new-event-settlement" };
    render();
    return;
  }

  if (action === "toggle-new-event-settlement-choice") {
    if (!newEventDraft) return;
    const choice = target.dataset.choiceValue;
    newEventDraft.settlementChoiceOpen = newEventDraft.settlementChoiceOpen === choice ? "" : choice;
    render();
    return;
  }

  if (action === "open-new-event-participants") {
    if (!newEventDraft) return;
    participantSearchQueries.delete("new-event-participant");
    newEventDraft.participantView = "";
    screen = { name: "new-event-participants" };
    render();
    return;
  }

  if (action === "cancel-new-event-participants") {
    if (!newEventDraft) return;
    newEventDraft.participantView = "";
    screen = { name: "new-event-settlement" };
    renderHistoryFallback();
    return;
  }

  if (action === "set-new-event-participant-view") {
    if (!newEventDraft) return;
    const nextView = ["friends", "manual"].includes(target.dataset.participantView)
      ? target.dataset.participantView
      : "";
    participantSearchQueries.delete("new-event-participant");
    newEventDraft.participantView = nextView;
    render();
    if (newEventDraft.participantView === "manual") {
      requestAnimationFrame(() => {
        app.querySelector('[data-action="new-event-guest-name"]')?.focus();
      });
    }
    return;
  }

  if (action === "close-new-event-participant-view") {
    if (!newEventDraft) return;
    const previousView = newEventDraft.participantView;
    participantSearchQueries.delete("new-event-participant");
    newEventDraft.participantView = "";
    renderHistoryFallback();
    requestAnimationFrame(() => {
      app
        .querySelector(`[data-action="set-new-event-participant-view"][data-participant-view="${CSS.escape(previousView)}"]`)
        ?.focus({ preventScroll: true });
    });
    return;
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
    const friendsTab = "people";
    screen = { name: "groups", tab: friendsTab };
    groupDraft = null;
    joinEventDraft = null;
    eventDialog = null;
    editingGroupDraft = null;
    mergeParticipantsDraft = null;
    friendsNewOfflineName = "";
    if (friendsTab === "people" && friendNetwork.status !== "ready") {
      friendNetwork = emptyFriendNetwork("loading");
    }
    render();
    if (friendsTab === "people") {
      refreshFriendNetwork().catch(() => {});
    }
  }

  if (action === "open-friend-add") {
    notice = "";
    friendsAddMode = friendNetworkAvailable(runtimeConfig) ? "online" : "offline";
    screen = { name: "friend-add" };
    if (friendsAddMode === "online" && friendNetwork.status !== "ready") {
      friendNetwork = emptyFriendNetwork("loading");
    }
    render();
    if (friendsAddMode === "online" && friendNetwork.status !== "ready") {
      refreshFriendNetwork().catch(() => {});
    } else {
      requestAnimationFrame(() => {
        app.querySelector('[data-action="friends-new-offline-name"]')?.focus();
      });
    }
  }

  if (action === "open-friend-profile") {
    const participantId = target.dataset.participantId;
    if (!canOpenParticipantStatistics(participantId)) return;
    notice = "";
    screen = { name: "friend-profile", participantId };
    render();
    return;
  }

  if (action === "open-participant-statistics") {
    event.preventDefault();
    event.stopPropagation();
    const participantId = target.dataset.participantId;
    if (!canOpenParticipantStatistics(participantId)) return;
    if (
      screen.name === "friend-profile" &&
      screen.participantId === participantId
    ) {
      return;
    }
    notice = "";
    screen = { name: "friend-profile", participantId };
    expenseDraft = null;
    eventDialog = null;
    eventStatusMenu = null;
    render();
    return;
  }

  if (action === "friend-add-mode") {
    const nextMode = target.dataset.mode === "offline" ? "offline" : "online";
    if (friendsAddMode !== nextMode) {
      friendsAddMode = nextMode;
      notice = "";
      render();
      requestAnimationFrame(() => {
        const selector = nextMode === "offline"
          ? '[data-action="friends-new-offline-name"]'
          : '[data-action="friend-code"]';
        app.querySelector(selector)?.focus({ preventScroll: true });
      });
    }
  }

  if (action === "friends-hub-tab") {
    const nextTab = ["people", "requests"].includes(target.dataset.tab)
      ? target.dataset.tab
      : "people";
    if (screen.name !== "groups" || screen.tab !== nextTab) {
      notice = "";
      screen = { name: "groups", tab: nextTab };
      if (friendNetwork.status === "idle") {
        friendNetwork = emptyFriendNetwork("loading");
      }
      renderReplacingBrowserHistory();
      if (friendNetwork.status !== "ready") {
        refreshFriendNetwork().catch(() => {});
      }
      requestAnimationFrame(() => {
        app.querySelector(`[data-action="friends-hub-tab"][data-tab="${nextTab}"]`)
          ?.focus({ preventScroll: true });
      });
    }
  }

  if (action === "event-status-filter") {
    eventStatusFilter = target.dataset.filter === "archive" ? "archive" : "events";
    render();
  }

  if (action === "new-group") {
    notice = "";
    screen = { name: "groups", tab: "people" };
    groupDraft = null;
    editingGroupDraft = null;
    mergeParticipantsDraft = null;
    render();
    return;
  }

  if (action === "manage-people") {
    notice = "";
    screen = { name: "people" };
    groupDraft = null;
    editingGroupDraft = null;
    ensureMergeParticipantsDraft();
    render();
  }

  if (action === "friends-add-offline") {
    addOfflineFriend();
  }

  if (action === "friends-retry-network") {
    friendNetwork = emptyFriendNetwork("loading");
    render();
    await refreshFriendNetwork();
  }

  if (action === "copy-friend-link") {
    const inviteUrl = friendInviteUrl();
    if (inviteUrl) {
      await copyText(inviteUrl, "קישור החברות הועתק.");
    }
  }

  if (action === "send-friend-request") {
    await sendFriendRequest();
  }

  if (action === "accept-friend-request") {
    await performFriendshipAction(target.dataset.friendshipId, "accept");
  }

  if (action === "decline-friend-request") {
    await performFriendshipAction(target.dataset.friendshipId, "decline");
  }

  if (action === "cancel-friend-request") {
    await performFriendshipAction(target.dataset.friendshipId, "cancel");
  }

  if (action === "remove-network-friend") {
    requestNetworkFriendRemoval(target.dataset.friendshipId, target);
  }

  if (action === "remove-offline-friend") {
    requestOfflineFriendRemoval(target.dataset.participantId, target);
  }

  if (action === "open-event-participant-profile") {
    const eventId = target.dataset.eventId;
    const participantId = target.dataset.participantId;
    const event = getEvent(eventId);
    const participant = state.participants.find((item) => item.id === participantId);
    if (participantId === state.currentParticipantId) {
      app.querySelector('.product-nav-button[data-nav-destination="profile"]')?.click();
      return;
    }
    if (
      !event ||
      !participant ||
      !event.participantIds.includes(participantId) ||
      isEventParticipantInactive(event, participantId)
    ) {
      return;
    }
    openEventDialogWithDetails(eventId, "participant-profile", target, { participantId });
    return;
  }

  if (action === "open-event-participant-link") {
    const eventId = target.dataset.eventId;
    const participantId = target.dataset.participantId;
    const event = getEvent(eventId);
    const participant = state.participants.find((item) => item.id === participantId);
    if (
      !event ||
      !participant ||
      participantConnectionStatus(participant).connected ||
      !event.participantIds.includes(participantId) ||
      !canCurrentParticipantManage(event)
    ) {
      return;
    }
    openEventDialogWithDetails(eventId, "participant-link", target, { participantId });
    return;
  }

  if (action === "link-offline-participant-account") {
    requestExplicitParticipantLink(
      target.dataset.eventId,
      target.dataset.sourceParticipantId,
      target.dataset.targetParticipantId,
      target
    );
    return;
  }

  if (action === "request-event-friendship") {
    await sendEventFriendRequest(
      target.dataset.eventId,
      target.dataset.participantId
    );
    return;
  }

  if (action === "open-participant-report") {
    const eventId = target.dataset.eventId;
    const participantId = target.dataset.participantId;
    const event = getEvent(eventId);
    const participant = state.participants.find((item) => item.id === participantId);
    if (
      !event ||
      !participant ||
      !event[EVENT_SPACE_ID_FIELD] ||
      participantId === state.currentParticipantId ||
      !participantConnectionStatus(participant).connected
    ) {
      return;
    }
    openEventDialogWithDetails(eventId, "participant-report", target, {
      participantId,
      reportCategory: "",
      reportDetails: "",
      error: ""
    });
    return;
  }

  if (action === "back-to-participant-profile") {
    goBackInApp();
    return;
  }

  if (action === "submit-participant-report") {
    await sendParticipantReport();
    return;
  }

  if (action === "block-connected-user") {
    requestConnectedUserBlock(
      target.dataset.targetUserId,
      target.dataset.participantId,
      target.dataset.eventId,
      target
    );
    return;
  }

  if (action === "unblock-connected-user") {
    await performConnectedUserUnblock(
      target.dataset.targetUserId,
      target.dataset.eventId
    );
    return;
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
    await requestResumeSync({ force: true, includeSecondary: false });
    return;
  }

  if (action === "open-event-notes") {
    const eventId = target.dataset.eventId;
    if (!getEvent(eventId)) return;
    notice = "";
    expenseDraft = null;
    eventDialog = null;
    screen = { name: "event-notes", eventId };
    rememberRecentEvent(eventId);
    render();
    await requestResumeSync({ force: true, includeSecondary: false });
    return;
  }

  if (action === "new-event-note") {
    const eventId = target.dataset.eventId;
    await requestResumeSync({ force: true, includeSecondary: false });
    const selectedEvent = getEvent(eventId);
    if (!selectedEvent || !canCurrentParticipantEdit(selectedEvent)) return;
    openEventDialogWithDetails(eventId, "note-editor", target, {
      noteId: "",
      titleDraft: "",
      bodyDraft: "",
      pinned: false,
      error: "",
      saving: false
    });
    return;
  }

  if (action === "open-event-note") {
    const eventId = target.dataset.eventId;
    const noteId = target.dataset.noteId;
    await requestResumeSync({ force: true, includeSecondary: false });
    const selectedEvent = getEvent(eventId);
    const note = selectedEvent?.notes?.find((item) => item.id === noteId);
    if (!selectedEvent || !note) return;
    openEventDialogWithDetails(eventId, "note-editor", target, {
      noteId,
      titleDraft: note.title ?? "",
      bodyDraft: note.body ?? "",
      pinned: note.pinned === true,
      error: "",
      saving: false
    });
    return;
  }

  if (action === "toggle-event-note-pin") {
    if (eventDialog?.kind !== "note-editor") return;
    event.preventDefault();
    eventDialog.pinned = !eventDialog.pinned;
    eventDialog.error = "";
    render();
    reactivateDialogAfterRender(
      ".event-note-modal",
      '[data-action="toggle-event-note-pin"]'
    );
    return;
  }

  if (action === "save-event-note") {
    event.preventDefault();
    await saveEventNoteFromDialog(target.dataset.eventId);
    return;
  }

  if (action === "request-delete-event-note") {
    event.preventDefault();
    requestEventNoteDeletion(
      target.dataset.eventId,
      target.dataset.noteId,
      target
    );
    return;
  }

  if (action === "new-event-add-guest") {
    if (!newEventDraft) return;
    newEventDraft.participantView = "manual";
    const guestNameInput = app.querySelector('[data-action="new-event-guest-name"]');
    if (guestNameInput instanceof HTMLInputElement) {
      newEventDraft.guestName = guestNameInput.value;
    }
    addGuestToDraft(newEventDraft);
    const renderedGuestNameInput = app.querySelector('[data-action="new-event-guest-name"]');
    if (renderedGuestNameInput instanceof HTMLInputElement) {
      renderedGuestNameInput.value = newEventDraft.guestName;
    }
    requestAnimationFrame(() => {
      if (document.activeElement?.matches?.('[data-action="participant-search"]')) {
        return;
      }
      app.querySelector('[data-action="new-event-guest-name"]')?.focus();
    });
  }

  if (action === "toggle-new-event-invite-after-create") {
    if (!newEventDraft) return;
    newEventDraft.inviteAfterCreate = !newEventDraft.inviteAfterCreate;
    render();
    requestAnimationFrame(() => {
      app
        .querySelector('[data-action="toggle-new-event-invite-after-create"]')
        ?.focus({ preventScroll: true });
    });
    return;
  }

  if (action === "open-event-participant-link-invite") {
    const eventId = target.dataset.eventId;
    const participantId = target.dataset.participantId;
    const event = getEvent(eventId);
    const participant = state.participants.find((item) => item.id === participantId);
    if (
      !event ||
      !participant ||
      participantConnectionStatus(participant).connected ||
      !event.participantIds.includes(participantId) ||
      !canCurrentParticipantEdit(event) ||
      isEventClosed(event)
    ) {
      return;
    }
    await openPreparedEventShare(eventId, target, "link");
    return;
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
    screen = { name: "groups", tab: "people" };
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
    await createEventFromDraft();
    return;
  }

  if (action === "set-event-management-mode") {
    await setEventManagementMode(
      target.dataset.eventId,
      target.dataset.managementMode
    );
    return;
  }

  if (action === "new-event-currency-choice") {
    if (!newEventDraft) return;
    newEventDraft.currency = normalizeCurrency(target.dataset.choiceValue);
    closeNewEventInlinePicker(target, action);
    render();
    restoreNewEventInlinePickerFocus(action);
    return;
  }

  if (action === "new-event-rounding-choice") {
    if (!newEventDraft) return;
    newEventDraft.roundSettlementTransfers = target.dataset.choiceValue !== "exact";
    closeNewEventInlinePicker(target, action);
    render();
    restoreNewEventInlinePickerFocus(action);
    return;
  }

  if (action === "new-event-repayment-choice") {
    if (!newEventDraft) return;
    newEventDraft.directSettlementTransfers = target.dataset.choiceValue === "direct";
    closeNewEventInlinePicker(target, action);
    render();
    restoreNewEventInlinePickerFocus(action);
    return;
  }

  if (action === "new-event-rounding-mode") {
    if (!newEventDraft) return;
    newEventDraft.roundSettlementTransfers = target.dataset.choiceValue !== "exact";
    newEventDraft.settlementChoiceOpen = "";
    render();
    return;
  }

  if (action === "new-event-repayment-mode") {
    if (!newEventDraft) return;
    newEventDraft.directSettlementTransfers = target.dataset.choiceValue === "direct";
    newEventDraft.settlementChoiceOpen = "";
    render();
    return;
  }

  if (action === "set-event-rounding-mode") {
    await setEventRoundingMode(
      target.dataset.eventId,
      target.dataset.roundingMode
    );
    return;
  }

  if (action === "set-event-repayment-mode") {
    await setEventRepaymentMode(
      target.dataset.eventId,
      target.dataset.repaymentMode
    );
    return;
  }

  if (action === "join-existing-event") {
    await joinExistingEventFromDraft();
  }

  if (action === "event-add-guest") {
    await addGuestToEvent(target.dataset.eventId);
    return;
  }

  if (action === "pick-event-contact") {
    await pickEventContact(target.dataset.eventId);
    return;
  }

  if (action === "add-event-participant") {
    await toggleEventParticipant(
      target.dataset.eventId,
      target.dataset.participantId,
      true
    );
    return;
  }

  if (action === "remove-event-participant") {
    requestEventParticipantRemoval(
      target.dataset.eventId,
      target.dataset.participantId,
      target
    );
    return;
  }

  if (action === "restore-event-participant") {
    await restoreEventParticipant(
      target.dataset.eventId,
      target.dataset.participantId
    );
    return;
  }

  if (action === "connect-duplicate-participant") {
    requestDuplicateParticipantMerge(
      target.dataset.eventId,
      target.dataset.sourceParticipantId,
      target.dataset.targetParticipantId,
      target
    );
    return;
  }

  if (action === "keep-duplicate-participants") {
    await keepDuplicateParticipantsSeparate(
      target.dataset.eventId,
      target.dataset.participantPair
    );
    return;
  }

  if (action === "save-participant-alias") {
    await saveParticipantAlias(
      target.dataset.eventId,
      target.dataset.participantId
    );
    return;
  }

  if (action === "open-offline-participant-rename") {
    const eventId = target.dataset.eventId;
    const participantId = target.dataset.participantId;
    const event = getEvent(eventId);
    const participant = state.participants.find((item) => item.id === participantId);
    if (
      !event ||
      !participant ||
      participantHasConnectedAccount(participant) ||
      !event.participantIds.includes(participantId) ||
      !canCurrentParticipantEdit(event)
    ) {
      return;
    }

    eventDialog = {
      eventId,
      kind: "participant-rename",
      returnKind: eventDialog?.kind === "participant-profile"
        ? "participant-profile"
        : "participants",
      participantId,
      offlineNameDraft: participant.displayName,
      error: "",
      historyBaseDepth: Number.isFinite(eventDialog?.historyBaseDepth)
        ? eventDialog.historyBaseDepth
        : Math.max(0, appHistoryDepth - 1)
    };
    render();
    reactivateDialogAfterRender(
      ".event-modal",
      '[data-action="event-offline-participant-rename"]'
    );
    return;
  }

  if (action === "save-offline-participant-name") {
    await saveOfflineParticipantName(
      target.dataset.eventId,
      target.dataset.participantId
    );
    return;
  }

  if (action === "event-participant-rename-back") {
    goBackInApp();
    return;
  }

  if (action === "open-event-participants") {
    const eventId = target.dataset.eventId;
    if (!getEvent(eventId)) return;
    openEventDialog(eventId, "participants", target);
    requestResumeSync({ force: true, includeSecondary: false }).catch(() => {});
    return;
  }

  if (action === "open-event-participant-add") {
    const eventId = target.dataset.eventId;
    if (!getEvent(eventId)) return;
    const returnKind = eventDialog?.kind === "share" ? "share" : "participants";
    eventDialog = {
      eventId,
      kind: "participants-add",
      returnKind,
      historyBaseDepth: Number.isFinite(eventDialog?.historyBaseDepth)
        ? eventDialog.historyBaseDepth
        : Math.max(0, appHistoryDepth - 1)
    };
    render();
    reactivateDialogAfterRender(".event-modal");
    requestResumeSync({ force: true }).catch(() => {});
    return;
  }

  if (action === "event-participants-back") {
    goBackInApp();
    return;
  }

  if (action === "review-duplicate-participants") {
    const eventId = target.dataset.eventId;
    if (!getEvent(eventId)) return;
    eventDialog = {
      eventId,
      kind: "participant-identities",
      historyBaseDepth: Number.isFinite(eventDialog?.historyBaseDepth)
        ? eventDialog.historyBaseDepth
        : Math.max(0, appHistoryDepth - 1)
    };
    render();
    reactivateDialogAfterRender(".event-modal");
    return;
  }

  if (
    action === "participant-identities-back" ||
    action === "defer-duplicate-participant"
  ) {
    goBackInApp();
    return;
  }

  if (action === "open-event-share") {
    await openPreparedEventShare(
      target.dataset.eventId,
      target,
      target.closest(".event-participant-add-routes") ? "link" : ""
    );
    return;
  }

  if (action === "select-event-participant-candidate") {
    if (
      eventDialog?.kind !== "participants-add" ||
      eventDialog.participantView !== "friends" ||
      eventDialog.eventId !== target.dataset.eventId
    ) {
      return;
    }
    const participantId = target.dataset.participantId;
    const event = getEvent(eventDialog.eventId);
    const selectable = state.participants.some(
      (participant) =>
        participant.id === participantId &&
        participantCandidateFilter(event?.participantIds ?? [], "event-participant")(participant)
    );
    if (!event || !selectable || !canCurrentParticipantEdit(event)) return;
    eventDialog = {
      ...eventDialog,
      pendingParticipantId:
        eventDialog.pendingParticipantId === participantId ? "" : participantId,
      message: ""
    };
    render();
    reactivateDialogAfterRender(
      ".event-modal",
      `[data-action="select-event-participant-candidate"][data-participant-id="${participantId}"]`
    );
    return;
  }

  if (action === "confirm-event-participant-add") {
    if (
      eventDialog?.kind !== "participants-add" ||
      eventDialog.participantView !== "friends" ||
      eventDialog.eventId !== target.dataset.eventId ||
      eventDialog.addInProgress
    ) {
      return;
    }
    const participantId = eventDialog.pendingParticipantId;
    if (!participantId) return;
    eventDialog = { ...eventDialog, addInProgress: true };
    render();
    reactivateDialogAfterRender(".event-modal", '[data-action="confirm-event-participant-add"]');
    await toggleEventParticipant(target.dataset.eventId, participantId, true);
    return;
  }

  if (action === "retry-event-share") {
    await retryEventShare(target.dataset.eventId);
    return;
  }

  if (action === "open-event-settings") {
    openEventDialog(target.dataset.eventId, "settings", target);
  }

  if (action === "open-event-cover-settings") {
    openEventDialogWithDetails(target.dataset.eventId, "settings", target, { coverFocus: true });
    requestAnimationFrame(() => {
      const coverSettings = app.querySelector(".event-cover-settings");
      coverSettings?.scrollIntoView({ block: "start" });
      coverSettings?.querySelector(".event-cover-upload")?.focus({ preventScroll: true });
    });
    return;
  }

  if (action === "remove-expense-attachment") {
    if (!expenseDraft) return;
    expenseDraft.attachmentImage = "";
    render();
    activateExpenseEntryDialog();
    return;
  }

  if (action === "capture-expense-attachment") {
    event.preventDefault();
    await captureExpenseAttachment(target);
    return;
  }

  if (action === "open-event-repayment-settings") {
    openEventDialog(target.dataset.eventId, "settings-repayment", target);
    return;
  }

  if (action === "set-event-participant-add-view") {
    if (eventDialog?.kind !== "participants-add") return;
    const participantView = ["friends", "manual"].includes(target.dataset.participantView)
      ? target.dataset.participantView
      : "";
    eventDialog = {
      ...eventDialog,
      participantView,
      pendingParticipantId: "",
      addInProgress: false,
      message: ""
    };
    render();
    reactivateDialogAfterRender(
      ".event-modal",
      participantView === "manual"
        ? '[data-action="event-guest-name"]'
        : '[data-action="select-event-participant-candidate"]'
    );
    return;
  }

  if (action === "event-participant-add-view-back") {
    if (eventDialog?.kind !== "participants-add") return;
    eventDialog = {
      ...eventDialog,
      participantView: "",
      contactNameDraft: "",
      pendingParticipantId: "",
      addInProgress: false,
      message: ""
    };
    render();
    reactivateDialogAfterRender(".event-modal", '[data-action="set-event-participant-add-view"]');
    return;
  }

  if (action === "open-friends-from-event-add") {
    eventDialog = null;
    screen = { name: "groups", tab: "people" };
    render();
    return;
  }

  if (action === "open-event-settings-section") {
    const section = target.dataset.settingsSection;
    if (!["management", "currency", "repayment", "rounding", "activity", "lock", "danger"].includes(section)) return;
    eventDialog = {
      eventId: target.dataset.eventId,
      kind: `settings-${section}`,
      historyBaseDepth: Number.isFinite(eventDialog?.historyBaseDepth)
        ? eventDialog.historyBaseDepth
        : Math.max(0, appHistoryDepth - 1)
    };
    render();
    reactivateDialogAfterRender(".event-modal");
  }

  if (action === "event-settings-back") {
    goBackInApp();
    return;
  }

  if (action === "event-share-back") {
    goBackInApp();
    return;
  }

  if (action === "event-share-view") {
    const shareView = target.dataset.shareView;
    if (
      eventDialog?.kind !== "share" ||
      eventDialog.eventId !== target.dataset.eventId ||
      !["friends", "link"].includes(shareView)
    ) {
      return;
    }
    eventDialog = {
      ...eventDialog,
      shareView,
      message: ""
    };
    render();
    reactivateDialogAfterRender(
      ".event-modal",
      shareView === "friends"
        ? '[data-action="add-event-participant"]'
        : '[data-action="share-invite-whatsapp"]'
    );
    return;
  }

  if (action === "event-share-view-back") {
    goBackInApp();
    return;
  }

  if (action === "close-event-dialog") {
    const historyBaseDepth = Number.isFinite(eventDialog?.historyBaseDepth)
      ? eventDialog.historyBaseDepth
      : Math.max(0, appHistoryDepth - 1);
    const rewindSteps = Math.max(1, appHistoryDepth - historyBaseDepth);
    eventDialog = null;
    closeDialogWithHistory(rewindSteps);
  }

  if (action === "copy-invite") {
    await copyInviteLink(target.dataset.eventId);
  }

  if (action === "share-invite-whatsapp") {
    await shareInviteOnWhatsApp(target.dataset.eventId);
  }

  if (action === "rotate-event-invite") {
    requestOpenInviteRotation(target.dataset.eventId, target);
    return;
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
    await toggleAdminEditMode(target.dataset.eventId);
    return;
  }

  if (action === "leave-event") {
    requestEventLeave(target.dataset.eventId, target);
    return;
  }

  if (action === "delete-event") {
    requestEventDeletion(target.dataset.eventId, target);
    return;
  }

  if (action === "remove-event-cover") {
    await updateEventCoverImage(target.dataset.eventId, "");
    return;
  }

  if (action === "remove-profile-avatar-image") {
    if (profileAvatarPendingPreview) URL.revokeObjectURL(profileAvatarPendingPreview);
    profileAvatarPendingPreview = "";
    profileAvatarImageDraft = "";
    await persistProfileAvatarDraft();
    render();
    requestAnimationFrame(() => {
      app
        .querySelector(".profile-avatar-picker-summary")
        ?.focus({ preventScroll: true });
    });
    return;
  }

  if (action === "show-expense-form") {
    await requestResumeSync({ force: true, includeSecondary: false });
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
    await requestResumeSync({ force: true, includeSecondary: false });
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
    await requestResumeSync({ force: true, includeSecondary: false });
    const event = getEvent(target.dataset.eventId);
    if (event && canCurrentParticipantEdit(event)) {
      eventDialog = null;
      startExpenseDraft(target.dataset.eventId, target.dataset.expenseId, target);
    }
  }

  if (action === "cancel-expense") {
    const rewindSteps = expenseDialogRewindSteps();
    rememberExpenseDraft();
    expenseDraft = null;
    closeDialogWithHistory(rewindSteps);
  }

  if (action === "toggle-expense-participants") {
    const row = target.closest(".expense-row");
    const details = row?.querySelector(".expense-participants-details");
    if (!(details instanceof HTMLDetailsElement)) return;

    if (!details.open) {
      const eventId = target.closest('[data-screen-kind="event"]')?.dataset.eventId;
      const event = getEvent(eventId);
      const expense = event?.expenses.find((item) => item.id === row?.dataset.expenseId);
      if (event && expense) hydrateExpenseParticipants(details, event, expense);
    }
    details.open = !details.open;
    target.setAttribute("aria-expanded", String(details.open));
    return;
  }

  if (action === "expense-step-next") {
    advanceExpenseFlow();
  }

  if (action === "expense-step-back") {
    goBackInApp();
    return;
  }

  if (action === "expense-step-edit") {
    moveExpenseFlowTo(target.dataset.step);
  }

  if (action === "expense-select-all") {
    applyExpenseParticipantPreset("all", target);
  }

  if (action === "edit-expense-notes") {
    const selectedEvent = getEvent(target.dataset.eventId);
    if (selectedEvent && canCurrentParticipantEdit(selectedEvent)) {
      eventDialog = null;
      startExpenseDraft(target.dataset.eventId, target.dataset.expenseId, target);
      if (expenseDraft) expenseDraft.notesOnly = true;
      render();
      activateExpenseEntryDialog();
      requestAnimationFrame(() => {
        app.querySelector('[data-action="expense-notes"]')?.focus({ preventScroll: true });
      });
    }
    return;
  }

  if (action === "expense-open-participant-add") {
    expenseDraft.participantAddView = "menu";
    expenseDraft.participantAddHistoryBaseDepth = appHistoryDepth;
    expenseDraft.participantInviteMessage = "";
    expenseDraft.error = "";
    render();
    activateDialog(
      ".expense-modal",
      '[data-action="expense-participant-add-view"]:not([disabled]), [data-action="expense-share-invite"]'
    );
    return;
  }

  if (action === "expense-participant-add-view") {
    const view = target.dataset.view;
    if (!expenseDraft || !["friends", "offline"].includes(view)) return;
    expenseDraft.participantAddView = view;
    expenseDraft.participantInviteMessage = "";
    render();
    activateDialog(
      ".expense-modal",
      view === "offline"
        ? '[data-action="event-guest-name"]'
        : '[data-action="expense-add-friend-participant"]'
    );
    return;
  }

  if (action === "expense-participant-add-back") {
    goBackInApp();
    return;
  }

  if (action === "expense-add-friend-participant") {
    await addFriendParticipantToExpense(
      target.dataset.eventId,
      target.dataset.participantId
    );
    return;
  }

  if (action === "expense-copy-invite") {
    await shareExpenseParticipantInvite(target.dataset.eventId, "copy");
    return;
  }

  if (action === "expense-share-invite") {
    await shareExpenseParticipantInvite(target.dataset.eventId, "share");
    return;
  }

  if (action === "add-payer") {
    const payerIndex = expenseDraft?.payers.length ?? 0;
    const dialogScrollTop = app.querySelector(".expense-modal")?.scrollTop ?? 0;
    addPayerToExpenseDraft();
    render();
    reactivateDialogAfterRender(
      ".expense-modal",
      `[data-action="expense-payer-id"][data-index="${payerIndex}"]`,
      dialogScrollTop
    );
  }

  if (action === "assign-payer-difference") {
    const payerIndex = Number(target.dataset.index);
    const dialogScrollTop = app.querySelector(".expense-modal")?.scrollTop ?? 0;
    expenseDraft.payers = assignPayerDifference(
      expenseDraft.total,
      expenseDraft.payers,
      payerIndex
    );
    expenseDraft.error = "";
    render();
    reactivateDialogAfterRender(
      ".expense-modal",
      `[data-action="expense-payer-amount"][data-index="${payerIndex}"]`,
      dialogScrollTop
    );
    return;
  }

  if (action === "expense-add-payer-guest") {
    await addInlinePayerGuest(target.dataset.eventId, Number(target.dataset.index));
    return;
  }

  if (action === "quick-item-add-guest") {
    await addInlineQuickItemGuest(target.dataset.eventId, Number(target.dataset.index));
    return;
  }

  if (action === "expense-template") {
    applyExpenseTemplate(target.dataset.template);
  }

  if (action === "expense-mode") {
    expenseDraft.mode = target.dataset.mode === "items" ? "items" : "single";
    if (expenseDraft.mode === "items") {
      expenseDraft.restaurantEqualSplit = false;
      expenseDraft.quickStage = "items";
    }
    expenseDraft.error = "";
    render();
    activateDialog(".expense-modal");
  }

  if (action === "restaurant-split-mode") {
    const event = getEvent(expenseDraft.eventId);
    const participants = expenseParticipantsForCurrentDraft(event);
    const previousAmount = expenseDraft.quickItems?.[0]?.amount ?? "";
    const wasEqualSplit = expenseDraft.restaurantEqualSplit;
    expenseDraft.mode = "items";
    expenseDraft.quickStage = "items";
    expenseDraft.quickPurpose = "split";
    if (target.dataset.mode === "equal") {
      expenseDraft.restaurantEqualSplit = true;
      const equalItem = createQuickItemDraft(
        QUICK_ITEM_CUSTOM_PARTICIPANTS,
        participants.map((participant) => participant.id)
      );
      equalItem.amount = previousAmount;
      expenseDraft.quickItems = [equalItem];
    } else {
      const previousItem = expenseDraft.quickItems?.[0];
      const previousParticipantIds = previousItem?.sharedByParticipantIds ?? [];
      const looksLikeEqualSplit =
        expenseDraft.quickItems?.length === 1 &&
        previousItem?.sharedBy === QUICK_ITEM_CUSTOM_PARTICIPANTS &&
        participants.every((participant) =>
          previousParticipantIds.includes(participant.id)
        );
      expenseDraft.restaurantEqualSplit = false;
      if (wasEqualSplit || looksLikeEqualSplit || !expenseDraft.quickItems?.length) {
        const item = createQuickItemDraft(defaultExpensePayerId(event));
        item.amount = previousAmount;
        expenseDraft.quickItems = [item];
      }
    }
    expenseDraft.error = "";
    render();
    activateExpenseEntryDialog();
  }

  if (action === "finish-restaurant-calculation") {
    const eventId = expenseDraft?.eventId;
    const rewindSteps = expenseDialogRewindSteps();
    if (eventId) clearRememberedExpenseDraft(eventId);
    expenseDraft = null;
    closeDialogWithHistory(rewindSteps);
    return;
  }

  if (action === "copy-and-finish-restaurant-calculation") {
    const eventId = expenseDraft?.eventId;
    const rewindSteps = expenseDialogRewindSteps();
    const copied = await copyQuickSplitSummary();
    if (!copied) return;
    if (eventId) clearRememberedExpenseDraft(eventId);
    expenseDraft = null;
    closeDialogWithHistory(rewindSteps);
    return;
  }

  if (action === "restaurant-quick-stage") {
    const stage = normalizeRestaurantQuickStage(target.dataset.stage);
    if (stage === "review") {
      const event = getEvent(expenseDraft.eventId);
      const participants = expenseParticipantsForCurrentDraft(event);
      const summary = summarizeQuickItemShares(
        expenseDraft.quickItems,
        participants.map((participant) => participant.id)
      );
      if (summary.billTotal <= 0 || summary.error) {
        expenseDraft.error =
          summary.error || "צריך להזין לפחות מחיר אחד כדי להמשיך לסיכום.";
        render();
        reactivateDialogAfterRender(".expense-modal", "#expense-form-error");
        return;
      }
    }
    expenseDraft.quickStage = stage;
    expenseDraft.quickPurpose = stage === "payer" ? "paid" : "split";
    expenseDraft.error = "";
    render();
    activateExpenseEntryDialog();
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
    expenseDraft.error = "";
    render();
    activateDialog(".expense-modal");
    requestAnimationFrame(() => {
      const index = expenseDraft.quickItems.length - 1;
      app.querySelector(`[data-action="quick-item-amount"][data-index="${index}"]`)?.focus();
    });
  }

  if (action === "quick-item-remove") {
    const index = Number(target.dataset.index);
    if (expenseDraft.quickItems.length > 1) {
      const dialogScrollTop = app.querySelector(".expense-modal")?.scrollTop ?? 0;
      expenseDraft.quickItems.splice(index, 1);
      if (expenseDraft.quickInlineGuestIndex === index) {
        expenseDraft.quickInlineGuestIndex = null;
        expenseDraft.quickInlineGuestName = "";
      } else if (expenseDraft.quickInlineGuestIndex > index) {
        expenseDraft.quickInlineGuestIndex -= 1;
      }
      render();
      const nextItemIndex = Math.max(
        0,
        Math.min(index, expenseDraft.quickItems.length - 1)
      );
      reactivateDialogAfterRender(
        ".expense-modal",
        `[data-action="quick-item-amount"][data-index="${nextItemIndex}"]`,
        dialogScrollTop
      );
    }
  }

  if (action === "remove-payer") {
    const payerIndex = Number(target.dataset.index);
    const dialogScrollTop = app.querySelector(".expense-modal")?.scrollTop ?? 0;
    expenseDraft.payers.splice(payerIndex, 1);
    if (expenseDraft.inlinePayerGuestIndex === payerIndex) {
      expenseDraft.inlinePayerGuestIndex = null;
      expenseDraft.inlinePayerGuestName = "";
    } else if (expenseDraft.inlinePayerGuestIndex > payerIndex) {
      expenseDraft.inlinePayerGuestIndex -= 1;
    }
    rebalanceExpenseDraftPayers();
    render();
    const nextPayerIndex = Math.max(
      0,
      Math.min(payerIndex, expenseDraft.payers.length - 1)
    );
    reactivateDialogAfterRender(
      ".expense-modal",
      `[data-action="expense-payer-id"][data-index="${nextPayerIndex}"]`,
      dialogScrollTop
    );
  }

  if (action === "save-expense") {
    saveExpense(target.dataset.eventId);
  }

  if (action === "save-expense-and-continue") {
    saveExpense(target.dataset.eventId, { continueAdding: true });
  }

  if (action === "save-quick-expenses") {
    await saveQuickExpenses(target.dataset.eventId);
    return;
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
    await requestResumeSync({ force: true, includeSecondary: false });
    prepareSettlement(target.dataset.eventId);
    return;
  }

  if (action === "toggle-lock") {
    await toggleEventLock(target.dataset.eventId);
    return;
  }

  if (action === "close-event") {
    requestCloseCurrentEvent(target.dataset.eventId);
    return;
  }

  if (action === "confirm-close-event") {
    const eventId = settlementCloseConfirmation?.eventId || target.dataset.eventId;
    await closeCurrentEvent(eventId);
    return;
  }

  if (action === "cancel-close-event-confirmation") {
    cancelSettlementCloseConfirmation();
    return;
  }

  if (action === "reopen-event") {
    requestReopenCurrentEvent(target.dataset.eventId, target);
    return;
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
    await markTransferPaid(target.dataset.transferId, target);
    return;
  }

  if (action === "mark-pending") {
    await markTransferPending(target.dataset.transferId);
    return;
  }

  if (action === "mark-pending-group") {
    await markTransfersPending(
      String(target.dataset.transferIds || "")
        .split(",")
        .filter(Boolean)
    );
    return;
  }

  if (action === "send-payment-reminder") {
    await sendTransferReminder(
      target.dataset.eventId,
      target.dataset.transferId
    );
    return;
  }
}

async function handleSubmit(event) {
  const form = event.target.closest?.(".event-note-editor");
  if (!form) return;
  event.preventDefault();
  await saveEventNoteFromDialog(form.dataset.eventId);
}

function closeOpenTransientMenus(exceptMenu = null) {
  let closedMenu = false;
  for (const menu of app.querySelectorAll(
    ".expense-row-actions-menu[open], .settlement-more-actions[open], .event-cover-actions-menu[open]"
  )) {
    if (menu === exceptMenu) continue;
    menu.open = false;
    closedMenu = true;
  }
  return closedMenu;
}

function handleTransientMenuToggle(event) {
  const menu = event.target;
  if (!(menu instanceof HTMLDetailsElement) || !menu.matches(".expense-row-actions-menu")) {
    return;
  }
  if (!menu.open) {
    menu.classList.remove("opens-upward");
    menu.classList.remove("is-viewport-positioned");
    menu.style.removeProperty("--expense-menu-left");
    menu.style.removeProperty("--expense-menu-top");
    menu.style.removeProperty("--expense-menu-max-height");
    return;
  }
  requestAnimationFrame(() => {
    positionExpenseActionsMenu(menu);
  });
}

let openExpenseMenuPositionFrame = 0;

function scheduleOpenExpenseMenuPosition() {
  if (openExpenseMenuPositionFrame) return;
  openExpenseMenuPositionFrame = requestAnimationFrame(() => {
    openExpenseMenuPositionFrame = 0;
    const menu = app.querySelector(".expense-row-actions-menu[open]");
    if (menu instanceof HTMLDetailsElement) positionExpenseActionsMenu(menu);
  });
}

function positionExpenseActionsMenu(menu) {
  if (!menu.isConnected || !menu.open) return;
  const panel = menu.querySelector(":scope > div");
  const trigger = menu.querySelector(":scope > summary");
  if (!(panel instanceof HTMLElement) || !(trigger instanceof HTMLElement)) return;

  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const nav = app.querySelector(
    ".event-route-primary-nav:not([hidden]), .product-app-nav:not([hidden])"
  );
  const navTop = nav instanceof HTMLElement
    ? nav.getBoundingClientRect().top
    : viewportTop + viewportHeight;
  const safeTop = viewportTop + 8;
  const safeBottom = Math.min(viewportTop + viewportHeight, navTop) - 8;
  const triggerRect = trigger.getBoundingClientRect();
  const panelWidth = Math.min(panel.scrollWidth || 166, viewportWidth - 16);
  const panelHeight = Math.min(panel.scrollHeight, Math.max(0, safeBottom - safeTop));
  const roomBelow = safeBottom - triggerRect.bottom - 6;
  const roomAbove = triggerRect.top - safeTop - 6;
  const opensUpward = roomBelow < panelHeight && roomAbove > roomBelow;
  const unclampedTop = opensUpward
    ? triggerRect.top - panelHeight - 6
    : triggerRect.bottom + 6;
  const maxTop = Math.max(safeTop, safeBottom - panelHeight);
  const top = Math.min(Math.max(unclampedTop, safeTop), maxTop);
  const left = Math.min(
    Math.max(triggerRect.right - panelWidth, viewportLeft + 8),
    viewportLeft + viewportWidth - panelWidth - 8
  );

  menu.classList.toggle("opens-upward", opensUpward);
  menu.classList.add("is-viewport-positioned");
  menu.style.setProperty("--expense-menu-left", `${Math.round(left)}px`);
  menu.style.setProperty("--expense-menu-top", `${Math.round(top)}px`);
  menu.style.setProperty(
    "--expense-menu-max-height",
    `${Math.max(44, Math.floor(safeBottom - top))}px`
  );
}

function hasOpenTransientMenu() {
  return Boolean(app.querySelector(
    ".expense-row-actions-menu[open], .settlement-more-actions[open]"
  ));
}

function dismissTransientBackdrop(event) {
  if (!event.target.matches?.(
    ".event-status-menu-backdrop, .important-action-dialog-backdrop, .settlement-celebration-backdrop"
  )) {
    return false;
  }

  event.preventDefault();
  goBackInApp();
  return true;
}

function goBackInApp() {
  if (closeOpenTransientMenus()) return;

  if (importantActionDialog) {
    closeImportantActionDialog();
    return;
  }

  if (settlementCelebration) {
    settlementCelebration = null;
    closeDialogWithHistory();
    return;
  }

  if (eventStatusMenu) {
    eventStatusMenu = null;
    closeDialogWithHistory();
    return;
  }

  if (settlementCloseConfirmation) {
    settlementCloseConfirmation = null;
    renderHistoryFallback();
    return;
  }

  if (screen.name === "admin-overview") {
    screen = { name: "profile" };
    renderHistoryFallback();
    return;
  }

  if (
    eventDialog?.kind === "share" &&
    ["participants", "participants-add"].includes(eventDialog.returnKind)
  ) {
    renderHistoryFallback();
    return;
  }

  if (
    eventDialog?.kind === "share" &&
    eventDialog.returnKind === "participant-link"
  ) {
    const participantId = eventDialog.returnParticipantId;
    eventDialog = {
      eventId: eventDialog.eventId,
      kind: "participant-link",
      participantId,
      historyBaseDepth: eventDialog.historyBaseDepth
    };
    renderHistoryFallback();
    reactivateDialogAfterRender(
      ".event-modal",
      '[data-action="open-event-participant-link-invite"]'
    );
    return;
  }

  if (
    eventDialog?.kind === "share" &&
    ["friends", "link"].includes(eventDialog.shareView)
  ) {
    if (appHistoryDepth === 0) {
      eventDialog = {
        ...eventDialog,
        shareView: "menu",
        message: ""
      };
    }
    renderHistoryFallback();
    return;
  }

  if (eventDialog?.kind === "participants-add") {
    renderHistoryFallback();
    return;
  }

  if (eventDialog?.kind === "participant-rename") {
    const participantId = eventDialog.participantId;
    eventDialog = {
      eventId: eventDialog.eventId,
      kind: eventDialog.returnKind === "participant-profile"
        ? "participant-profile"
        : "participants",
      participantId: eventDialog.returnKind === "participant-profile"
        ? participantId
        : undefined,
      historyBaseDepth: eventDialog.historyBaseDepth
    };
    renderHistoryFallback();
    reactivateDialogAfterRender(
      ".event-modal",
      eventDialog.kind === "participant-profile"
        ? `[data-action="open-offline-participant-rename"][data-participant-id="${participantId}"]`
        : `[data-action="open-event-participant-profile"][data-participant-id="${participantId}"]`
    );
    return;
  }

  if (eventDialog?.kind === "participant-link") {
    const participantId = eventDialog.participantId;
    eventDialog = {
      eventId: eventDialog.eventId,
      kind: "participant-profile",
      participantId,
      historyBaseDepth: eventDialog.historyBaseDepth
    };
    renderHistoryFallback();
    reactivateDialogAfterRender(
      ".event-modal",
      `[data-action="open-event-participant-link"][data-participant-id="${participantId}"]`
    );
    return;
  }

  if (eventDialog?.kind === "participant-report") {
    const participantId = eventDialog.participantId;
    eventDialog = {
      eventId: eventDialog.eventId,
      kind: "participant-profile",
      participantId,
      historyBaseDepth: eventDialog.historyBaseDepth
    };
    renderHistoryFallback();
    reactivateDialogAfterRender(
      ".event-modal",
      '[data-action="open-participant-report"]'
    );
    return;
  }

  if (eventDialog?.kind === "participant-profile") {
    const participantId = eventDialog.participantId;
    eventDialog = {
      eventId: eventDialog.eventId,
      kind: "participants",
      historyBaseDepth: eventDialog.historyBaseDepth
    };
    renderHistoryFallback();
    reactivateDialogAfterRender(
      ".event-modal",
      `[data-action="open-event-participant-profile"][data-participant-id="${participantId}"]`
    );
    return;
  }

  if (eventDialog?.kind === "participant-identities") {
    eventDialog = {
      eventId: eventDialog.eventId,
      kind: "participants",
      historyBaseDepth: eventDialog.historyBaseDepth
    };
    renderHistoryFallback();
    reactivateDialogAfterRender(
      ".event-modal",
      '[data-action="review-duplicate-participants"]'
    );
    return;
  }

  if (eventDialog?.kind?.startsWith("settings-")) {
    const settingsSection = eventDialog.kind.slice("settings-".length);
    pendingSettingsReturnFocusSection = settingsSection;
    eventDialog = {
      eventId: eventDialog.eventId,
      kind: "settings",
      historyBaseDepth: eventDialog.historyBaseDepth
    };
    renderHistoryFallback();
    reactivateDialogAfterRender(
      ".event-modal",
      eventSettingsSectionFocusSelector(settingsSection)
    );
    window.setTimeout(() => {
      if (pendingSettingsReturnFocusSection === settingsSection) {
        pendingSettingsReturnFocusSection = "";
      }
    }, 500);
    return;
  }

  if (expenseDraft?.participantAddView) {
    if (appHistoryDepth === 0) {
      expenseDraft.participantAddView =
        expenseDraft.participantAddView === "menu" ? "" : "menu";
    }
    renderHistoryFallback();
    return;
  }

  if (
    expenseDraft?.mode === "items" &&
    eventTypeConfig(getEvent(expenseDraft.eventId)?.eventType).id === EVENT_TYPE_RESTAURANT &&
    normalizeRestaurantQuickStage(expenseDraft.quickStage) !== "method"
  ) {
    rememberExpenseDraft();
    if (expenseDraft.restored) {
      const currentStage = normalizeRestaurantQuickStage(expenseDraft.quickStage);
      const currentIndex = RESTAURANT_QUICK_STAGES.indexOf(currentStage);
      expenseDraft.quickStage =
        RESTAURANT_QUICK_STAGES[Math.max(0, currentIndex - 1)] ?? "method";
      expenseDraft.restored = false;
      expenseDraft.error = "";
      renderHistoryFallback(0);
      activateExpenseEntryDialog();
      return;
    }
    renderHistoryFallback();
    return;
  }

  if (
    expenseDraft &&
    normalizeExpenseFlowStep(expenseDraft.flowStep) !== expenseFlowStepsForDraft()[0]
  ) {
    rememberExpenseDraft();
    renderHistoryFallback();
    return;
  }

  if (eventDialog || expenseDraft) {
    if (expenseDraft) rememberExpenseDraft();
    eventDialog = null;
    const rewindSteps = expenseDialogRewindSteps();
    expenseDraft = null;
    closeDialogWithHistory(rewindSteps);
    return;
  }

  if (screen.name === "settlement" && screen.eventId) {
    screen = { name: "event", eventId: screen.eventId };
    eventDialog = null;
    renderHistoryFallback();
    return;
  }

  if (screen.name === "event-notes" && screen.eventId) {
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

  if (screen.name === "new-event-participants" && newEventDraft) {
    if (["friends", "manual"].includes(newEventDraft.participantView)) {
      newEventDraft.participantView = "";
      renderHistoryFallback();
      return;
    }
    newEventDraft.participantView = "";
    screen = { name: "new-event-settlement" };
    renderHistoryFallback();
    return;
  }

  if (screen.name === "new-event-settlement" && newEventDraft) {
    screen = { name: "new-event" };
    renderHistoryFallback();
    return;
  }

  if (screen.name === "new-event" && newEventDraft) {
    screen = { name: "new-event-type" };
    renderHistoryFallback();
    return;
  }

  if (screen.name === "notifications") {
    const returnScreen = notificationsReturnScreen;
    notificationsReturnScreen = null;
    screen = returnScreen?.name ? returnScreen : { name: "home" };
    renderHistoryFallback();
    return;
  }

  if (screen.name === "friend-add") {
    screen = { name: "groups", tab: "people" };
    friendsNewOfflineName = "";
    renderHistoryFallback();
    return;
  }

  if (screen.name === "friend-profile") {
    screen = { name: "groups", tab: "people" };
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

  if (["group-create", "group-edit", "people"].includes(screen.name)) {
    screen = {
      name: "groups",
      tab: "people"
    };
    groupDraft = null;
    editingGroupDraft = null;
    mergeParticipantsDraft = null;
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

function renderHistoryFallback(rewindSteps = 1) {
  const historyDistance = Math.min(
    appHistoryDepth,
    Math.max(0, Number.isFinite(rewindSteps) ? Math.floor(rewindSteps) : 1)
  );
  const shouldRewindBrowserHistory =
    historyDistance > 0 &&
    Boolean(historyDistance === 1 ? window.history?.back : window.history?.go);

  restoringBrowserHistory = true;
  try {
    render();
  } finally {
    restoringBrowserHistory = false;
  }

  if (shouldRewindBrowserHistory) {
    appHistoryDepth = Math.max(0, appHistoryDepth - historyDistance);
    lastNavigationViewKey = navigationViewKey();
    if (historyDistance === 1) {
      window.history.back();
    } else {
      window.history.go(-historyDistance);
    }
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

function closeDialogWithHistory(rewindSteps = 1) {
  const historyDistance = Math.min(
    appHistoryDepth,
    Math.max(0, Number.isFinite(rewindSteps) ? Math.floor(rewindSteps) : 1)
  );
  const deferFocus = historyDistance > 0 &&
    Boolean(historyDistance === 1 ? window.history?.back : window.history?.go);
  deactivateDialog({ deferFocus });
  renderHistoryFallback(historyDistance);
}

function handleInput(event) {
  const target = event.target;
  const action = target.dataset.action;

  if (action === "participant-search") {
    rememberParticipantSearch(target);
    filterParticipantChecks(target);
    return;
  }
  if (action === "friends-search") {
    filterFriendRows(target);
    return;
  }
  if (action === "event-offline-participant-rename") {
    if (eventDialog?.kind !== "participant-rename") return;
    eventDialog.offlineNameDraft = target.value;
    eventDialog.error = "";
    scheduleBrowserHistoryReplacement();
    return;
  }
  if (action === "participant-report-details") {
    if (eventDialog?.kind !== "participant-report") return;
    eventDialog.reportDetails = target.value;
    eventDialog.error = "";
    scheduleBrowserHistoryReplacement();
    return;
  }
  if (action === "friends-new-offline-name") {
    friendsNewOfflineName = target.value;
    return;
  }
  if (action === "friend-code") {
    friendCodeDraft = target.value;
    return;
  }
  if (action === "profile-username") {
    profileUsernameDraft = target.value;
    profileUsernameError = "";
  }
  if (action === "profile-name") {
    profileNameDraft = target.value;
    profileError = "";
  }
  if (action === "new-event-name" && newEventDraft) {
    newEventDraft.name = target.value;
    scheduleBrowserHistoryReplacement();
    return;
  }
  if (action === "event-note-title") {
    if (eventDialog?.kind !== "note-editor") return;
    eventDialog.titleDraft = target.value.slice(0, MAX_EVENT_NOTE_TITLE_LENGTH);
    eventDialog.error = "";
    scheduleBrowserHistoryReplacement();
    return;
  }
  if (action === "event-note-body") {
    if (eventDialog?.kind !== "note-editor") return;
    eventDialog.bodyDraft = target.value.slice(0, MAX_EVENT_NOTE_BODY_LENGTH);
    eventDialog.error = "";
    scheduleBrowserHistoryReplacement();
    return;
  }
  if (action === "new-event-guest-name" && newEventDraft) {
    newEventDraft.guestName = target.value;
    scheduleBrowserHistoryReplacement();
    return;
  }
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
  if (action === "expense-name") {
    expenseDraft.name = target.value;
    syncExpenseFlowActionState();
  }
  if (action === "expense-date") {
    expenseDraft.occurredOn = target.value;
    syncExpenseDetailsSummary();
  }
  if (action === "expense-notes" && expenseDraft) {
    // Keep the draft current on every keystroke. WebKit does not always emit
    // a textarea change event before a file picker replaces the active field.
    expenseDraft.notes = target.value.slice(0, 500);
  }
  if (action === "expense-total") {
    expenseDraft.total = target.value;
    if (expenseDraft.payers.length === 1) {
      expenseDraft.payers = assignPayerDifference(
        expenseDraft.total,
        expenseDraft.payers,
        0,
        { automatic: true }
      );
    } else {
      rebalanceExpenseDraftPayers();
    }
    syncExpensePayerAmountInputs();
    syncExpensePayerSummary();
    syncExpenseConfirmationSummary();
    syncExpenseSaveState();
    syncExpenseFlowActionState();
  }
  if (action === "expense-payer-amount") {
    const index = Number(target.dataset.index);
    expenseDraft.payers[index] = markPayerAmountEdited(expenseDraft.payers[index], target.value);
    rebalanceExpenseDraftPayers();
    syncExpensePayerAmountInputs(index);
    syncExpensePayerSummary();
    syncExpenseFlowActionState();
  }
  if (action === "expense-new-payer-name") {
    expenseDraft.inlinePayerGuestIndex = Number(target.dataset.index);
    expenseDraft.inlinePayerGuestName = target.value;
  }
  if (action === "quick-item-name") {
    expenseDraft.quickItems[Number(target.dataset.index)].name = target.value;
    expenseDraft.error = "";
    syncQuickSplitSummary();
  }
  if (action === "quick-item-amount") {
    expenseDraft.quickItems[Number(target.dataset.index)].amount = target.value;
    expenseDraft.error = "";
    syncQuickSplitSummary();
  }
  if (action === "quick-item-new-guest-name") {
    expenseDraft.quickInlineGuestIndex = Number(target.dataset.index);
    expenseDraft.quickInlineGuestName = target.value;
  }

  if (action?.startsWith("expense-") || action?.startsWith("quick-")) {
    rememberExpenseDraft();
  }

  scheduleBrowserHistoryReplacement();
}

async function handleChange(event) {
  const target = event.target;
  const action = target.dataset.action;

  if (action === "event-cover-image") {
    const file = target.files?.[0];
    if (file) await saveEventCoverImage(target.dataset.eventId, file);
    target.value = "";
    return;
  }
  if (action === "expense-notes") {
    expenseDraft.notes = target.value.slice(0, 500);
  }

  if (action === "profile-avatar-image") {
    const file = target.files?.[0];
    if (file) await saveProfileAvatarImage(file);
    target.value = "";
    return;
  }

  if (action === "expense-attachment-image") {
    const file = target.files?.[0];
    if (file) await applyExpenseAttachmentImage(file);
    target.value = "";
    return;
  }

  if (action === "participant-report-category") {
    if (eventDialog?.kind !== "participant-report") return;
    eventDialog.reportCategory = target.value;
    eventDialog.error = "";
    app
      .querySelector('[data-action="submit-participant-report"]')
      ?.toggleAttribute("disabled", !target.value);
    replaceBrowserHistoryState();
    return;
  }

  if (action === "profile-avatar") {
    profileAvatarDraft =
      normalizeAvatarPreset(target.value) || AVATAR_PRESETS[0].id;
    profileAvatarImageDraft = "";
    const selectedPreset =
      AVATAR_PRESETS.find((preset) => preset.id === profileAvatarDraft) ??
      AVATAR_PRESETS[0];
    const pickerShell = target.closest(".profile-avatar-picker-shell");
    const summaryImage = pickerShell?.querySelector(
      ".profile-avatar-summary-preview img"
    );
    if (summaryImage) summaryImage.src = selectedPreset.src;
    if (pickerShell instanceof HTMLDetailsElement) {
      pickerShell.open = false;
    }
    await persistProfileAvatarDraft();
    render();
    requestAnimationFrame(() => {
      app
        .querySelector(".profile-avatar-picker-summary")
        ?.focus({ preventScroll: true });
    });
    return;
  }

  if (action === "new-event-group") {
    clearRenderedNotice();
    const group = state.groups.find((item) => item.id === target.value);
    newEventDraft.groupId = target.value;
    newEventDraft.participantIds = group?.memberIds ? [...group.memberIds] : [state.currentParticipantId];
    if (screen.name === "new-event-participants") {
      render();
    } else {
      syncNewEventParticipantControls();
    }
  }

  if (action === "new-event-currency") {
    newEventDraft.currency = normalizeCurrency(target.value);
  }

  if (action === "new-event-rounding-select") {
    newEventDraft.roundSettlementTransfers = target.value !== "exact";
  }

  if (action === "new-event-repayment-select") {
    newEventDraft.directSettlementTransfers = target.value === "direct";
  }

  if (action === "new-event-participant") {
    return;
  }

  if (action === "group-member") {
    clearRenderedNotice();
    toggleId(groupDraft.memberIds, target.dataset.participantId, target.checked);
    syncCreateGroupButton();
  }

  if (action === "edit-group-member") {
    clearRenderedNotice();
    toggleId(editingGroupDraft.memberIds, target.dataset.participantId, target.checked);
  }

  if (action === "edit-group-admin") {
    toggleId(editingGroupDraft.adminIds, target.dataset.participantId, target.checked);
  }

  if (action === "merge-source") {
    ensureMergeParticipantsDraft();
    const source = mergeParticipantSourceCandidates().find(
      (participant) => participant.id === target.value
    );
    if (!source) return;
    mergeParticipantsDraft.sourceId = source.id;
    const targetCandidates = mergeParticipantTargetCandidates(source.id);
    if (!targetCandidates.some((participant) => participant.id === mergeParticipantsDraft.targetId)) {
      mergeParticipantsDraft.targetId = targetCandidates[0]?.id ?? "";
    }
    syncMergeParticipantControls("merge-source");
    return;
  }

  if (action === "merge-target") {
    ensureMergeParticipantsDraft();
    const nextTarget = state.participants.find(
      (participant) => participant.id === target.value
    );
    if (!nextTarget) return;
    mergeParticipantsDraft.targetId = nextTarget.id;
    if (mergeParticipantsDraft.sourceId === target.value) {
      mergeParticipantsDraft.sourceId =
        mergeParticipantSourceCandidates().find(
          (participant) => participant.id !== target.value
        )?.id ?? "";
    }
    syncMergeParticipantControls("merge-target");
    return;
  }

  if (action === "event-participant") {
    await toggleEventParticipant(screen.eventId, target.dataset.participantId, target.checked);
  }

  if (action === "toggle-event-participant-admin") {
    await toggleEventParticipantAdmin(
      target.dataset.eventId,
      target.dataset.participantId,
      target.checked
    );
    return;
  }

  if (action === "event-currency") {
    const event = getEvent(target.dataset.eventId);
    if (!event || !canCurrentParticipantManage(event)) return;

    const nextCurrency = normalizeCurrency(target.value);
    if (nextCurrency === eventCurrency(event)) return;

    if (event.expenses.length > 0) {
      requestEventCurrencyChange(event, nextCurrency, target);
      return;
    }

    await applyEventCurrencyChange(event.id, nextCurrency);
  }

  if (action === "expense-shared") {
    toggleId(expenseDraft.sharedByParticipantIds, target.dataset.participantId, target.checked);
    const event = getEvent(expenseDraft.eventId);
    const toolbar = target
      .closest(".expense-participant-section")
      ?.querySelector("[data-expense-participant-toolbar]");
    if (event && toolbar) {
      toolbar.outerHTML = renderExpenseParticipantToolbar(
        event,
        expenseParticipantsForCurrentDraft(event)
      );
    }
    syncExpenseDetailsSummary();
    syncExpenseConfirmationSummary();
    syncExpenseFlowActionState();
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
    syncExpenseFlowActionState();
  }

  if (action === "quick-expense-payer") {
    expenseDraft.quickPayerId = target.value;
    expenseDraft.error = "";
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
    expenseDraft.error = "";
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
    expenseDraft.error = "";
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

async function createEventFromDraft() {
  if (createEventBusy) return;
  ensureCurrentParticipantInNewEventDraft();
  if (newEventDraft.participantIds.length === 0) {
    notice = "צריך לבחור לפחות משתתף אחד.";
    screen = { name: "new-event-participants" };
    newEventDraft.participantView = "friends";
    render();
    requestAnimationFrame(() => {
      app
        .querySelector('[data-action="set-new-event-participant-view"][data-participant-view="friends"]')
        ?.focus({ preventScroll: false });
    });
    return;
  }

  const submittedDraft = structuredClone(newEventDraft);
  const stateBeforeCreate = structuredClone(state);
  const inviteAfterCreate = newEventDraft.inviteAfterCreate === true;
  const createdAt = new Date();
  const createdAtIso = createdAt.toISOString();
  const event = appendEventActivity({
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
    membershipUpdatedAtByParticipant: initializeParticipantMembership(
      newEventDraft.participantIds,
      createdAtIso
    ),
    expenses: [],
    transfers: [],
    adminIds: [state.currentParticipantId],
    createdByParticipantId: state.currentParticipantId,
    adminsCanEditOnly: managementModeRequiresAdmin(newEventDraft.managementMode),
    roundSettlementTransfers: newEventDraft.roundSettlementTransfers !== false,
    directSettlementTransfers: newEventDraft.directSettlementTransfers === true,
    locked: false,
    createdAt: createdAtIso,
    settingsUpdatedAt: createdAtIso
  }, {
    id: makeId("activity"),
    kind: "event-created",
    actorParticipantId: state.currentParticipantId,
    occurredAt: createdAtIso
  });

  const invitedAccountParticipants = event.participantIds
    .filter(
      (participantId) =>
        participantId !== state.currentParticipantId &&
        Boolean(accountUserIdFromParticipantId(participantId))
    )
    .map((participantId) =>
      state.participants.find((participant) => participant.id === participantId)
    )
    .filter(Boolean);
  // An event that already contains connected accounts must be durable as a
  // shared event in the very first save. Creating it as personal first and
  // publishing it in a later request leaves other devices with nothing to
  // discover if iOS suspends the app or that second request is interrupted.
  // The credentials are also kept in the crash-safe outbox, so a temporary
  // outage can finish the same canonical publication after reconnecting.
  if (invitedAccountParticipants.length) {
    ensureEventShareCredentials(event);
  }

  state.events.unshift(event);
  createEventBusy = true;
  const saveRequest = persistState({
    awaitCloud: invitedAccountParticipants.length > 0,
    forceSharedEventIds: invitedAccountParticipants.length ? [event.id] : []
  });
  render();

  try {
    const saveResult = await saveRequest;
    if (!saveResult?.ok && !saveResult?.pending) {
      state = stateBeforeCreate;
      saveState(stateBeforeCreate);
      newEventDraft = submittedDraft;
      screen = { name: "new-event-settlement" };
      notice = "לא הצלחנו לשמור את האירוע. הפרטים נשארו כאן ואפשר לנסות שוב.";
      render();
      return;
    }
    emitProductMetric("event_created", {
      screen: "new_event",
      detail: normalizeEventType(event.eventType)
    });
    newEventDraft = null;
    joinEventDraft = null;
    screen = { name: "event", eventId: event.id };
    notice = "";
    appHistoryDepth = 0;
    lastNavigationViewKey = "";
    render();

    // Selecting an existing account during event creation is already an
    // explicit invitation. Publish the shared event and activate those
    // memberships immediately; otherwise the event exists only in the
    // creator's personal workspace and the other device has nothing to load.
    for (const participant of invitedAccountParticipants) {
      rememberPendingEventMembershipInvitation(event.id, participant.id);
    }
    if (!saveResult?.pending) {
      for (const participant of invitedAccountParticipants) {
        await publishEventInvitation(event.id, participant, {
          showMessage: false
        });
      }
    }

    if (!inviteAfterCreate || saveResult?.pending) return;
    await openPreparedEventShare(
      event.id,
      app.querySelector('[data-action="open-event-share"]')
    );
  } catch {
    state = stateBeforeCreate;
    saveState(stateBeforeCreate);
    newEventDraft = submittedDraft;
    screen = { name: "new-event-settlement" };
    notice = "לא הצלחנו לשמור את האירוע. הפרטים נשארו כאן ואפשר לנסות שוב.";
    render();
  } finally {
    createEventBusy = false;
    if (newEventDraft) render();
  }
}

function syncNewEventDraftFromRenderedDetails() {
  if (!newEventDraft) return;
  const nameInput = app.querySelector('[data-action="new-event-name"]');
  if (nameInput instanceof HTMLInputElement) {
    newEventDraft.name = nameInput.value;
  }
  const guestNameInput = app.querySelector(
    '[data-action="new-event-guest-name"]'
  );
  if (guestNameInput instanceof HTMLInputElement) {
    newEventDraft.guestName = guestNameInput.value;
  }
}

async function joinExistingEventFromDraft() {
  if (joinEventBusy) return;
  ensureJoinEventDraft();
  joinEventDraft.link = joinEventDraft.link.trim();

  if (!joinEventDraft.link) {
    joinEventDraft.error = "צריך להדביק קישור הצטרפות.";
    render();
    return;
  }

  const inviteLink = joinEventDraft.link;
  const eventId = parseEventIdFromJoinInput();
  if (!eventId) {
    joinEventDraft.error = "הקישור לא נראה כמו קישור הצטרפות תקין.";
    render();
    return;
  }

  joinEventBusy = true;
  joinEventDraft.error = "";
  render();
  try {
    const joinRuntimeConfig = await loadRuntimeConfig();
    runtimeConfig = joinRuntimeConfig;
    const inviteCredentials = await resolveEventInviteCredentials(
      joinRuntimeConfig,
      inviteLink
    );
    if (!inviteCredentials?.id || !inviteCredentials?.key) {
      throw new Error("Invite credentials are unavailable");
    }
    // The server has now redeemed the token and activated membership. Keep a
    // small, owner-scoped receipt before any further reads or writes: iOS can
    // suspend the page here, and the next resume must still recover the event
    // from the canonical membership index instead of making the user open the
    // link again.
    rememberPendingIncomingEventJoin(eventId, joinRuntimeConfig);
    const sharedEventState = await readSharedEventState(
      joinRuntimeConfig,
      inviteCredentials,
      eventId
    );
    if (!sharedEventState) {
      throw new Error("Verified invite event is unavailable");
    }
    state = mergeSharedEventIntoState(state, sharedEventState, inviteCredentials);
    let event = getEvent(eventId);
    if (!event) {
      state = syncLocalProfile(
        mergeSharedEventIntoState(
          await loadSharedState(),
          sharedEventState,
          inviteCredentials
        )
      );
      event = getEvent(eventId);
    }

    if (!event) {
      joinEventDraft.error = "לא מצאנו אירוע לפי הקישור הזה. כדאי לוודא שהקישור הועתק במלואו.";
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
      eventId,
      { reactivateInactive: false }
    );
    const participant = state.participants.find(
      (item) => item.id === state.currentParticipantId
    );
    const joinedEvent = getEvent(eventId);
    if (
      participant &&
      !isActiveEventParticipant(joinedEvent, participant.id)
    ) {
      joinEventDraft.error =
        "הוסרת מהאירוע הזה. כדי להצטרף מחדש, מנהל האירוע צריך להוסיף אותך שוב.";
      return;
    }

    if (participant) {
      localProfile = saveLocalProfile({
        ...profile,
        participantId: participant.id,
        displayName: participant.displayName
      });
      profileNameDraft = participant.displayName;
    }

    const saveResult = await saveSharedState(state, {
      awaitCloud: true,
      forceSharedEventIds: [eventId]
    });
    if (!saveResult?.ok && !saveResult?.partial) {
      joinEventDraft.error =
        "החיבור לאירוע הוכן, אבל השמירה עדיין לא הושלמה. בדקו את החיבור ולחצו שוב.";
      return;
    }
    forgetPendingIncomingEventJoin(eventId, joinRuntimeConfig);
    joinEventDraft = null;
    newEventDraft = null;
    screen = { name: "event", eventId };
    notice = saveResult?.partial || saveResult?.pending
      ? "ההצטרפות אושרה והסנכרון יושלם אוטומטית כשהחיבור יתייצב."
      : "הצטרפת לאירוע.";
    emitProductMetric("invite_joined", { screen: "invite" });
  } catch (error) {
    emitOperationFailure("event_invite", { screen: "invite", error });
    joinEventDraft.error = inviteJoinErrorMessage(error);
  } finally {
    joinEventBusy = false;
    render();
  }
}

function inviteJoinErrorMessage(error) {
  if (error?.code === "EVENT_INVITE_REVOKED") {
    return "קישור ההצטרפות הזה כבר לא פעיל. צריך לבקש ממנהל האירוע קישור חדש.";
  }
  if (error?.code === "EVENT_INVITE_EXPIRED") {
    return "תוקף קישור ההצטרפות הסתיים. צריך לבקש קישור חדש.";
  }
  if (error?.code === "PRIVATE_INVITE_AUTH_REQUIRED") {
    return "זו הזמנה פרטית. צריך להתחבר לחשבון שאליו היא נשלחה.";
  }
  if (error?.code === "PRIVATE_INVITE_RECIPIENT_MISMATCH") {
    return "ההזמנה הפרטית נשלחה לחשבון אחר.";
  }
  return "לא הצלחנו לפתוח את הקישור כרגע. כדאי לבדוק את החיבור ולנסות שוב.";
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
  const name = normalizeProfileName(
    String(draft.guestName ?? "").normalize("NFKC")
  );
  if (!name) return;
  const { participant, created } = resolveOfflineParticipant(name, "guest");
  if (!draft.participantIds.includes(participant.id)) {
    draft.participantIds.push(participant.id);
  }
  draft.guestName = "";
  const guestNameInput = app.querySelector(
    '[data-action="new-event-guest-name"]'
  );
  if (guestNameInput instanceof HTMLInputElement) {
    guestNameInput.value = "";
  }
  notice = created ? "" : `${participant.displayName} כבר קיים ונבחר.`;
  persistState();
  render();
}

function addMemberToGroupDraft() {
  if (!groupDraft) return;

  const name = normalizeProfileName(
    String(groupDraft.newMemberName ?? "").normalize("NFKC")
  );
  if (!name) return;

  const { participant: member, created } = resolveOfflineParticipant(name, "member");
  if (!groupDraft.memberIds.includes(member.id)) {
    groupDraft.memberIds.push(member.id);
  }
  groupDraft.newMemberName = "";
  notice = created ? "" : `${member.displayName} כבר קיים ונבחר.`;
  persistState();
  render();
}

function startEditGroup(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) return;

  notice = "";
  screen = { name: "group-edit" };
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

  const name = normalizeProfileName(
    String(editingGroupDraft.newMemberName ?? "").normalize("NFKC")
  );
  if (!name) return;

  const { participant: member, created } = resolveOfflineParticipant(name, "member");
  if (!editingGroupDraft.memberIds.includes(member.id)) {
    editingGroupDraft.memberIds.push(member.id);
  }
  editingGroupDraft.newMemberName = "";
  notice = created ? "" : `${member.displayName} כבר קיים ונבחר.`;
  persistState();
  render();
}

function resolveOfflineParticipant(name, idPrefix = "guest") {
  const existingParticipant = findOfflineParticipantByName(state.participants, name);
  if (existingParticipant) {
    return { participant: existingParticipant, created: false };
  }

  const participant = {
    id: makeId(idPrefix),
    displayName: name,
    kind: "guest"
  };
  state.participants.push(participant);
  return { participant, created: true };
}

function addOfflineFriend() {
  const name = normalizeProfileName(String(friendsNewOfflineName ?? "").normalize("NFKC"));
  if (!name) {
    app.querySelector('[data-action="friends-new-offline-name"]')?.focus();
    return;
  }

  const { participant, created } = resolveOfflineParticipant(name, "friend");
  const wasSaved = activeFriendParticipantIds(state).includes(participant.id);
  state = saveFriendContact(state, participant.id, "offline");
  friendsNewOfflineName = "";
  notice = created || !wasSaved
    ? `${participant.displayName} נוסף לרשימת החברים.`
    : `${participant.displayName} כבר נמצא ברשימה.`;
  if (screen.name === "friend-add") {
    screen = { name: "groups", tab: "people" };
  }
  persistState();
  render();
  requestAnimationFrame(() => {
    if (!created && wasSaved) {
      app
        .querySelector(`[data-action="remove-offline-friend"][data-participant-id="${participant.id}"]`)
        ?.closest("[data-friend-name]")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
}

async function sendFriendRequest() {
  const requestTarget = friendRequestTargetFromDraft();
  if (!requestTarget) {
    notice = "צריך להזין @שם_משתמש תקין או להדביק קישור חברות.";
    render();
    app.querySelector('[data-action="friend-code"]')?.focus();
    return;
  }

  friendNetworkBusyAction = "request";
  notice = "";
  let completedTab = "";
  render();
  try {
    runtimeConfig = await loadRuntimeConfig();
    const result = requestTarget.type === "username"
      ? await requestFriendshipByUsername(runtimeConfig, requestTarget.value)
      : await requestFriendship(runtimeConfig, requestTarget.value);
    friendCodeDraft = "";
    notice = result?.status === "accepted"
      ? "בקשת החברות ההדדית אושרה."
      : "בקשת החברות נשלחה.";
    completedTab = result?.status === "accepted" ? "people" : "requests";
  } catch (error) {
    notice = friendRequestErrorMessage(error);
  } finally {
    friendNetworkBusyAction = "";
  }
  if (completedTab) {
    screen = { name: "groups", tab: completedTab };
  }
  await refreshFriendNetwork({ preserveNotice: true });
}

async function sendEventFriendRequest(eventId, participantId) {
  const event = getEvent(eventId);
  const participant = state.participants.find((item) => item.id === participantId);
  const targetUserId = accountUserIdFromParticipantId(participantId);
  const sharedSpaceId = String(event?.[EVENT_SPACE_ID_FIELD] ?? "").trim();
  if (
    !event ||
    !participant ||
    !targetUserId ||
    participantId === state.currentParticipantId ||
    !event.participantIds.includes(participantId) ||
    isEventParticipantInactive(event, participantId)
  ) {
    return;
  }

  if (!sharedSpaceId) {
    eventDialog = {
      ...eventDialog,
      message: "האירוע עדיין מסתנכרן. נסה שוב בעוד רגע."
    };
    render();
    reactivateDialogAfterRender(".event-modal");
    return;
  }

  const busyKey = `event-friend:${participantId}`;
  if (friendNetworkBusyAction) return;
  friendNetworkBusyAction = busyKey;
  eventDialog = { ...eventDialog, message: "" };
  render();
  reactivateDialogAfterRender(".event-modal");

  let message = "";
  try {
    runtimeConfig = await loadRuntimeConfig();
    const result = await requestFriendshipFromEvent(
      runtimeConfig,
      sharedSpaceId,
      targetUserId
    );
    message = result?.status === "accepted"
      ? "אתם חברים עכשיו."
      : "בקשת החברות נשלחה.";
  } catch (error) {
    message = friendRequestErrorMessage(error);
  } finally {
    friendNetworkBusyAction = "";
  }

  await refreshFriendNetwork({ preserveNotice: true });
  if (
    eventDialog?.eventId === eventId &&
    eventDialog?.kind === "participant-profile" &&
    eventDialog?.participantId === participantId
  ) {
    eventDialog = { ...eventDialog, message };
    render();
    reactivateDialogAfterRender(".event-modal");
  }
}

async function sendParticipantReport() {
  if (eventDialog?.kind !== "participant-report" || friendNetworkBusyAction) return;

  const event = getEvent(eventDialog.eventId);
  const participant = state.participants.find(
    (item) => item.id === eventDialog.participantId
  );
  const targetUserId = accountUserIdFromParticipantId(participant?.id);
  const sharedSpaceId = String(event?.[EVENT_SPACE_ID_FIELD] ?? "").trim();
  const category = String(eventDialog.reportCategory ?? "").trim();
  const details = String(eventDialog.reportDetails ?? "").trim();
  if (!event || !participant || !targetUserId || !sharedSpaceId || !category) {
    eventDialog = {
      ...eventDialog,
      error: "צריך לבחור סיבה לדיווח."
    };
    render();
    reactivateDialogAfterRender(".event-modal");
    return;
  }

  const busyKey = `report:${participant.id}`;
  friendNetworkBusyAction = busyKey;
  eventDialog = { ...eventDialog, error: "" };
  render();
  reactivateDialogAfterRender(".event-modal");

  try {
    runtimeConfig = await loadRuntimeConfig();
    await submitUserReport(runtimeConfig, {
      sharedSpaceId,
      targetUserId,
      category,
      details
    });
    const nextDialog = {
      eventId: event.id,
      kind: "participant-profile",
      participantId: participant.id,
      historyBaseDepth: eventDialog.historyBaseDepth,
      message: "הדיווח נשלח ונשמר לבדיקה."
    };
    friendNetworkBusyAction = "";
    eventDialog = nextDialog;
    if (appHistoryDepth > 0 && window.history?.back) {
      pendingConfirmedEventDialog = cloneNavigationValue(nextDialog);
      appHistoryDepth = Math.max(0, appHistoryDepth - 1);
      lastNavigationViewKey = navigationViewKey();
      window.history.back();
    } else {
      renderReplacingBrowserHistory();
      reactivateDialogAfterRender(".event-modal");
    }
  } catch (error) {
    friendNetworkBusyAction = "";
    eventDialog = {
      ...eventDialog,
      error: reportSubmissionErrorMessage(error)
    };
    render();
    reactivateDialogAfterRender(".event-modal");
  }
}

function requestConnectedUserBlock(
  targetUserId,
  participantId,
  eventId,
  trigger
) {
  const participant = state.participants.find((item) => item.id === participantId);
  const blockedName = participant?.displayName || "המשתמש";
  if (!targetUserId || !participant) return;

  openImportantActionDialog(
    {
      kind: "block-connected-user",
      label: "בטיחות ופרטיות",
      title: `לחסום את ${blockedName}?`,
      description:
        "לא תוכלו לשלוח בקשות חברות זה לזה. אירועים, הוצאות וחובות משותפים יישארו ללא שינוי.",
      confirmLabel: "חסום משתמש",
      payload: { targetUserId, participantId, eventId }
    },
    trigger
  );
}

async function performConnectedUserBlock({
  targetUserId,
  participantId,
  eventId = ""
}) {
  const busyKey = `user-safety:${targetUserId}`;
  if (friendNetworkBusyAction) return;
  friendNetworkBusyAction = busyKey;
  try {
    runtimeConfig = await loadRuntimeConfig();
    await blockConnectedUser(runtimeConfig, targetUserId);
    notice = "המשתמש נחסם. ההיסטוריה הכספית לא השתנתה.";
    await refreshFriendNetwork({ preserveNotice: true });
    if (
      eventId &&
      eventDialog?.eventId === eventId &&
      eventDialog?.participantId === participantId
    ) {
      eventDialog = {
        ...eventDialog,
        kind: "participant-profile",
        message: "המשתמש נחסם. ההוצאות והחובות באירוע נשארו ללא שינוי."
      };
    } else if (screen.name === "friend-profile") {
      screen = { name: "groups", tab: "people" };
    }
  } catch (error) {
    const message = userSafetyErrorMessage(error, "לא הצלחנו לחסום את המשתמש כרגע.");
    notice = message;
    if (eventDialog?.eventId === eventId) {
      eventDialog = { ...eventDialog, message };
    }
  } finally {
    friendNetworkBusyAction = "";
  }
  render();
}

async function performConnectedUserUnblock(targetUserId, eventId = "") {
  if (!targetUserId || friendNetworkBusyAction) return;
  friendNetworkBusyAction = `user-safety:${targetUserId}`;
  render();
  try {
    runtimeConfig = await loadRuntimeConfig();
    await unblockConnectedUser(runtimeConfig, targetUserId);
    notice = "החסימה בוטלה. חברות אינה מתחדשת אוטומטית.";
    await refreshFriendNetwork({ preserveNotice: true });
    if (eventId && eventDialog?.eventId === eventId) {
      eventDialog = {
        ...eventDialog,
        message: "החסימה בוטלה. אפשר לשלוח בקשת חברות חדשה."
      };
    }
  } catch (error) {
    notice = userSafetyErrorMessage(error, "לא הצלחנו לבטל את החסימה כרגע.");
  } finally {
    friendNetworkBusyAction = "";
  }
  render();
  if (eventDialog) reactivateDialogAfterRender(".event-modal");
}

function reportSubmissionErrorMessage(error) {
  const message = String(error?.message ?? "").toLowerCase();
  if (message.includes("active participants") || message.includes("shared event")) {
    return "לא הצלחנו לאמת ששניכם עדיין באירוע. רענן ונסה שוב.";
  }
  if (message.includes("too long")) {
    return "הפירוט ארוך מדי. אפשר לכתוב עד 1,000 תווים.";
  }
  if (message.includes("sign in") || message.includes("authentication")) {
    return "צריך להתחבר לחשבון כדי לשלוח דיווח.";
  }
  return "לא הצלחנו לשלוח את הדיווח כרגע. נסה שוב בעוד רגע.";
}

function userSafetyErrorMessage(error, fallback) {
  const message = String(error?.message ?? "").toLowerCase();
  if (message.includes("not found")) return "החשבון הזה כבר אינו זמין.";
  if (message.includes("sign in") || message.includes("authentication")) {
    return "צריך להתחבר לחשבון כדי לבצע את הפעולה.";
  }
  return fallback;
}

async function performFriendshipAction(friendshipId, action) {
  if (!friendshipId || friendNetworkBusyAction) return;
  friendNetworkBusyAction = friendshipId;
  render();
  try {
    runtimeConfig = await loadRuntimeConfig();
    await manageFriendship(runtimeConfig, friendshipId, action);
    notice = {
      accept: "בקשת החברות אושרה.",
      decline: "בקשת החברות נדחתה.",
      cancel: "בקשת החברות בוטלה.",
      remove: "החבר הוסר מהרשימה."
    }[action] ?? "רשימת החברים עודכנה.";
  } catch {
    notice = "לא הצלחנו לעדכן את בקשת החברות כרגע.";
  } finally {
    friendNetworkBusyAction = "";
  }
  await refreshFriendNetwork({ preserveNotice: true });
}

function requestNetworkFriendRemoval(friendshipId, trigger) {
  const friendship = (friendNetwork.friendships ?? []).find(
    (item) => item.id === friendshipId
  );
  const profile = friendship ? friendProfileForRelationship(friendship) : null;
  if (!friendship || !profile) return;

  openImportantActionDialog(
    {
      kind: "remove-network-friend",
      title: `להסיר את ${profile.display_name} מרשימת החברים?`,
      description:
        "האירועים וההוצאות המשותפים יישארו בהיסטוריה. תוכלו לשלוח בקשת חברות חדשה בעתיד.",
      confirmLabel: "הסר חבר",
      payload: { friendshipId }
    },
    trigger
  );
}

function requestOfflineFriendRemoval(participantId, trigger) {
  const participant = state.participants.find((item) => item.id === participantId);
  if (!participant) return;

  openImportantActionDialog(
    {
      kind: "remove-offline-friend",
      title: `להסיר את ${participant.displayName} מרשימת החברים?`,
      description:
        "השם יישאר באירועים ובהוצאות קיימים כדי שהחישובים וההיסטוריה לא ייפגעו.",
      confirmLabel: "הסר מהרשימה",
      payload: { participantId }
    },
    trigger
  );
}

async function refreshFriendNetwork({ preserveNotice = false } = {}) {
  const previousNotice = notice;
  const previousRenderKey = friendNetworkRenderKey();
  try {
    runtimeConfig = await loadRuntimeConfig();
    if (!friendNetworkAvailable(runtimeConfig)) {
      friendNetwork = emptyFriendNetwork("signed-out");
      if (
        screen.name === "groups" &&
        previousRenderKey !== friendNetworkRenderKey()
      ) {
        render();
      }
      return;
    }

    let nextNetwork = await loadFriendNetwork(runtimeConfig);
    const ownNetworkProfile = nextNetwork.profiles.find(
      (profile) => profile.user_id === nextNetwork.userId
    );
    let localAvatarPreset = normalizeAvatarPreset(localProfile?.avatarPreset) || null;
    const networkAvatarPreset = normalizeAvatarPreset(ownNetworkProfile?.avatar_preset) || null;
    let localProfileUpdatedAt = normalizeProfileUpdatedAt(localProfile?.profileUpdatedAt);
    const networkProfileUpdatedAt = normalizeProfileUpdatedAt(ownNetworkProfile?.updated_at);
    const avatarResolution = resolveProfileAvatar(
      {
        avatarImage: localProfile?.avatarImage,
        avatarImageUpdatedAt: localProfile?.avatarImageUpdatedAt
      },
      {
        avatarImage: ownNetworkProfile?.avatar_image,
        avatarImageUpdatedAt: ownNetworkProfile?.avatar_image_updated_at
      }
    );
    const publicIdentityDiffers = Boolean(
      ownNetworkProfile &&
      (
        ownNetworkProfile.display_name !== localProfile?.displayName?.trim() ||
        networkAvatarPreset !== localAvatarPreset
      )
    );
    const publicIdentityIsNewer = Boolean(
      ownNetworkProfile &&
      networkProfileUpdatedAt &&
      publicIdentityDiffers &&
      (
        !localProfileUpdatedAt ||
        Date.parse(networkProfileUpdatedAt) >= Date.parse(localProfileUpdatedAt)
      )
    );
    if (publicIdentityIsNewer || avatarResolution.source === "remote") {
      localProfile = saveLocalProfile({
        ...localProfile,
        participantId: state.currentParticipantId,
        displayName: publicIdentityIsNewer
          ? ownNetworkProfile.display_name
          : localProfile?.displayName,
        avatarPreset: publicIdentityIsNewer && Object.hasOwn(ownNetworkProfile, "avatar_preset")
          ? normalizeAvatarPreset(ownNetworkProfile.avatar_preset)
          : localProfile?.avatarPreset,
        avatarImage: avatarResolution.avatarImage,
        avatarImageUpdatedAt: avatarResolution.avatarImageUpdatedAt,
        profileUpdatedAt: publicIdentityIsNewer
          ? networkProfileUpdatedAt
          : localProfileUpdatedAt
      });
      state = syncLocalProfile(state);
      localAvatarPreset = normalizeAvatarPreset(localProfile?.avatarPreset) || null;
      localProfileUpdatedAt = normalizeProfileUpdatedAt(localProfile?.profileUpdatedAt);
    }
    const identityStillDiffers = Boolean(
      ownNetworkProfile &&
      (
        ownNetworkProfile.display_name !== localProfile?.displayName?.trim() ||
        networkAvatarPreset !== localAvatarPreset
      )
    );
    const profileNeedsSync = Boolean(
      localProfile?.displayName &&
        (
          !ownNetworkProfile ||
          avatarResolution.needsRemoteSync ||
          identityStillDiffers &&
            (
              !networkProfileUpdatedAt ||
              Date.parse(localProfileUpdatedAt || "1970-01-01") >
                Date.parse(networkProfileUpdatedAt)
            )
        )
    );
    if (profileNeedsSync) {
      try {
        const syncedProfile = await syncFriendProfile(runtimeConfig, localProfile);
        if (syncedProfile?.user_id) {
          nextNetwork = {
            ...nextNetwork,
            profiles: [
              ...nextNetwork.profiles.filter(
                (profile) => profile.user_id !== syncedProfile.user_id
              ),
              syncedProfile
            ]
          };
        }
      } catch {
        console.warn("[friends] Profile refresh skipped");
      }
    }
    const previousState = state;
    const nextState = applyFriendNetworkToState(state, nextNetwork);
    friendNetwork = nextNetwork;
    const ownUsername = currentFriendUsername();
    if (screen.name !== "profile" || !profileUsernameDraft) {
      profileUsernameDraft = ownUsername;
    }
    state = nextState;
    if (JSON.stringify(previousState) !== JSON.stringify(nextState)) {
      try {
        await saveSharedState(state, { suppressRevertNotice: true });
      } catch {
        console.warn("[friends] Local friend cache save deferred");
      }
    }
    if (preserveNotice) notice = previousNotice || notice;
  } catch (error) {
    console.warn("[friends] Online friend load failed");
    emitOperationDeferred("friend_network", { screen: "groups", error });
    friendNetwork = friendNetwork.status === "ready"
      ? {
          ...friendNetwork,
          stale: true,
          staleAt: friendNetwork.staleAt || new Date().toISOString()
        }
      : emptyFriendNetwork("error");
    if (preserveNotice) notice = previousNotice || notice;
  }

  const visibleFriendDataChanged = previousRenderKey !== friendNetworkRenderKey();
  const profileAvatarPickerIsOpen = Boolean(
    screen.name === "profile" &&
      app.querySelector(".profile-avatar-picker-shell[open]")
  );
  if (
    visibleFriendDataChanged &&
    !profileAvatarPickerIsOpen &&
    (
      screen.name === "groups" ||
      screen.name === "profile" ||
      screen.name === "friend-add" ||
      screen.name === "friend-profile"
    )
  ) {
    render();
  } else if (
    visibleFriendDataChanged &&
    (
      ["new-event", "new-event-settlement", "new-event-participants"].includes(screen.name) ||
      eventDialog?.kind === "participant-add"
    )
  ) {
    const focusedAction = document.activeElement?.dataset?.action ?? "";
    render();
    if (focusedAction) {
      requestAnimationFrame(() => {
        app
          .querySelector(`[data-action="${CSS.escape(focusedAction)}"]`)
          ?.focus({ preventScroll: true });
      });
    }
  }
  publishNotificationNavigationState();
}

function friendNetworkRenderKey() {
  return JSON.stringify({
    network: friendNetwork,
    profile: localProfile
      ? {
          displayName: localProfile.displayName,
          username: localProfile.username,
          avatarPreset: localProfile.avatarPreset,
          avatarImage: localProfile.avatarImage,
          avatarImageUpdatedAt: localProfile.avatarImageUpdatedAt,
          profileUpdatedAt: localProfile.profileUpdatedAt
        }
      : null,
    participants: state.participants,
    friendContacts: state.friendContacts
  });
}

async function hydrateOwnPublicAvatarBeforeFirstRender() {
  if (!localProfile || !friendNetworkAvailable(runtimeConfig)) return;

  try {
    const ownNetworkProfile = await loadOwnFriendProfile(runtimeConfig, {
      timeoutMs: OWN_PROFILE_STARTUP_WAIT_MS
    });
    if (!ownNetworkProfile) return;

    const avatarResolution = resolveProfileAvatar(
      {
        avatarImage: localProfile.avatarImage,
        avatarImageUpdatedAt: localProfile.avatarImageUpdatedAt
      },
      {
        avatarImage: ownNetworkProfile.avatar_image,
        avatarImageUpdatedAt: ownNetworkProfile.avatar_image_updated_at
      }
    );
    if (avatarResolution.source !== "remote") return;

    localProfile = saveLocalProfile({
      ...localProfile,
      participantId: state.currentParticipantId,
      avatarImage: avatarResolution.avatarImage,
      avatarImageUpdatedAt: avatarResolution.avatarImageUpdatedAt
    });
    state = syncLocalProfile(state);
  } catch {
    // Keep startup usable offline; the regular friend refresh retries later.
  }
}

function requestVisibleFriendNetworkSync() {
  const screenUsesFriends = [
    "groups",
    "friend-add",
    "friend-profile",
    "profile",
    "home",
    "new-event",
    "new-event-settlement",
    "new-event-participants"
  ].includes(screen.name);
  const dialogUsesFriends = ["participants", "participant-add", "share-friends"].includes(eventDialog?.kind);
  if (
    document.visibilityState !== "visible" ||
    !appBootHydrated ||
    !friendNetworkAvailable(runtimeConfig) ||
    friendNetworkBusyAction ||
    (!screenUsesFriends && !dialogUsesFriends)
  ) {
    return Promise.resolve();
  }
  if (friendNetworkPollRequest) return friendNetworkPollRequest;
  friendNetworkPollRequest = refreshFriendNetwork({ preserveNotice: true })
    .catch(() => {})
    .finally(() => {
      friendNetworkPollRequest = null;
    });
  return friendNetworkPollRequest;
}

function applyFriendNetworkToState(currentState, network) {
  const accepted = (network.friendships ?? []).filter(
    (friendship) => friendship.status === "accepted"
  );
  const profileById = new Map(
    (network.profiles ?? []).map((profile) => [profile.user_id, profile])
  );
  const participants = [...(currentState.participants ?? [])];
  const friendParticipantIds = [];

  for (const friendship of accepted) {
    const friendUserId =
      friendship.requester_id === network.userId
        ? friendship.addressee_id
        : friendship.requester_id;
    const profile = profileById.get(friendUserId);
    if (!profile?.display_name) continue;
    const participantId = `account-${friendUserId}`;
    friendParticipantIds.push(participantId);
    const participantIndex = participants.findIndex(
      (participant) => participant.id === participantId
    );
    const previousParticipant = participantIndex >= 0
      ? participants[participantIndex]
      : {};
    const avatarResolution = resolveProfileAvatar(
      {
        avatarImage: previousParticipant.avatarImage,
        avatarImageUpdatedAt: previousParticipant.avatarImageUpdatedAt
      },
      {
        avatarImage: profile.avatar_image,
        avatarImageUpdatedAt: profile.avatar_image_updated_at
      }
    );
    const participant = {
      ...previousParticipant,
      id: participantId,
      displayName: profile.display_name,
      username: publicProfileUsername(profile),
      kind: "member",
      accountLinked: true,
      authSubject: friendUserId,
      avatarPreset:
        Object.hasOwn(profile, "avatar_preset")
          ? normalizeAvatarPreset(profile.avatar_preset)
          : participants[participantIndex]?.avatarPreset,
      avatarImage:
        Object.hasOwn(profile, "avatar_image") || avatarResolution.avatarImageUpdatedAt
          ? avatarResolution.avatarImage
          : previousParticipant.avatarImage,
      avatarImageUpdatedAt:
        Object.hasOwn(profile, "avatar_image_updated_at") || avatarResolution.avatarImageUpdatedAt
          ? avatarResolution.avatarImageUpdatedAt
          : previousParticipant.avatarImageUpdatedAt,
      profileUpdatedAt: profile.updated_at
    };
    if (participantIndex >= 0) {
      participants[participantIndex] = participant;
    } else {
      participants.push(participant);
    }
  }

  return syncNetworkFriendContacts(
    {
      ...currentState,
      participants
    },
    friendParticipantIds
  );
}

function friendRequestErrorMessage(error) {
  const message = String(error?.message ?? "").toLowerCase();
  if (message.includes("active participants") || message.includes("shared event")) {
    return "לא הצלחנו לאמת ששניכם עדיין באירוע. רענן ונסה שוב.";
  }
  if (message.includes("friend account")) {
    return "החשבון של המשתתף עדיין לא זמין להצעת חברות.";
  }
  if (message.includes("username") && message.includes("not found")) {
    return "לא מצאנו משתמש בשם הזה.";
  }
  if (message.includes("not found")) return "קוד החברות לא נמצא.";
  if (message.includes("yourself")) return "אי אפשר לשלוח בקשת חברות לעצמך.";
  if (message.includes("sign in") || message.includes("authentication")) {
    return "צריך להתחבר לחשבון כדי לשלוח בקשת חברות.";
  }
  return "לא הצלחנו לשלוח את בקשת החברות כרגע.";
}

function profileUsernameErrorMessage(error) {
  const message = String(error?.message ?? "").toLowerCase();
  if (message.includes("already taken") || error?.code === "23505") {
    return "שם המשתמש הזה כבר תפוס. נסה שם אחר.";
  }
  if (message.includes("invalid")) {
    return usernameValidationMessage(profileUsernameDraft);
  }
  if (message.includes("sign in") || message.includes("authentication")) {
    return "צריך להתחבר לחשבון כדי לשנות שם משתמש.";
  }
  return "לא הצלחנו לעדכן את שם המשתמש כרגע.";
}

function saveEditedGroup() {
  if (!editingGroupDraft) return;

  if (editingGroupDraft.memberIds.length === 0) {
    notice = "צריך לבחור לפחות חבר אחד לקבוצה.";
    render();
    requestAnimationFrame(() => {
      app
        .querySelector('[data-action="edit-group-member"]')
        ?.focus({ preventScroll: false });
    });
    return;
  }

  state = updateGroup(state, editingGroupDraft.id, {
    name: editingGroupDraft.name,
    memberIds: editingGroupDraft.memberIds,
    adminIds: editingGroupDraft.adminIds
  });
  editingGroupDraft = null;
  screen = { name: "groups", tab: "people" };
  notice = "הקבוצה עודכנה.";
  persistState();
  render();
}

function createGroupFromDraft() {
  if (!groupDraft) return;

  const groupName = groupDraft.name.trim();
  if (!groupName) {
    app.querySelector('[data-action="group-name"]')?.focus();
    return;
  }

  if (groupDraft.memberIds.length === 0) {
    notice = "צריך לבחור לפחות חבר אחד לקבוצה.";
    render();
    requestAnimationFrame(() => {
      app
        .querySelector('[data-action="group-member"]')
        ?.focus({ preventScroll: false });
    });
    return;
  }

  const candidateGroup = {
    name: groupName,
    memberIds: [...new Set([state.currentParticipantId, ...groupDraft.memberIds])]
  };
  const matchingGroup = findMatchingActiveGroup(state.groups, candidateGroup);
  if (matchingGroup) {
    groupDraft = null;
    screen = { name: "groups", tab: "people" };
    notice = "כבר קיימת קבוצה עם אותו שם ואותם חברים, לכן לא יצרנו עותק נוסף.";
    render();
    requestAnimationFrame(() => {
      app
        .querySelector(`[data-action="edit-group"][data-group-id="${matchingGroup.id}"]`)
        ?.focus({ preventScroll: false });
    });
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
  screen = { name: "groups", tab: "people" };
  notice = "הקבוצה נשמרה.";
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
  if (!mergeParticipantSourceCandidates().some((participant) => participant.id === source.id)) {
    notice = "אפשר להסיר באיחוד רק שם אופליין. משתמש מחובר נשאר החשבון הראשי.";
    mergeParticipantsDraft = null;
    ensureMergeParticipantsDraft();
    render();
    return;
  }
  if (!canMergeParticipants(state, source.id, target.id)) {
    notice = "אפשר לאחד רק שמות זהים כשיש לך הרשאת ניהול בכל האירועים שיושפעו.";
    render();
    return;
  }

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

function requestDuplicateParticipantMerge(
  eventId,
  sourceParticipantId,
  targetParticipantId,
  trigger
) {
  const event = getEvent(eventId);
  const source = state.participants.find(
    (participant) => participant.id === sourceParticipantId
  );
  const target = state.participants.find(
    (participant) => participant.id === targetParticipantId
  );
  const sameName =
    normalizeParticipantDisplayName(source?.displayName) &&
    normalizeParticipantDisplayName(source?.displayName) ===
      normalizeParticipantDisplayName(target?.displayName);
  const sourceConnected = participantHasConnectedAccount(source);
  const targetConnected = participantHasConnectedAccount(target);
  const unresolvedPair = event
    ? unresolvedDuplicateParticipantPairs(state.participants, event).find(
        (pair) =>
          pair.mergeSourceId === sourceParticipantId &&
          pair.mergeTargetId === targetParticipantId
      )
    : null;

  if (
    !event ||
    !canCurrentParticipantManage(event) ||
    !source ||
    !target ||
    source.id === target.id ||
    !sameName ||
    sourceConnected ||
    !unresolvedPair ||
    !canMergeParticipants(state, sourceParticipantId, targetParticipantId)
  ) {
    notice = "לא ניתן לחבר את הזהויות האלה.";
    render();
    return;
  }

  const impact = participantMergeImpact(source.id);
  openImportantActionDialog(
    {
      kind: "merge-participants",
      label: "בדיקת שינוי",
      title: "לפני האיחוד",
      description: targetConnected
        ? `${source.displayName} ו-${target.displayName} יהפכו לחשבון אחד בשם ${target.displayName}. נשתמש בחשבון המחובר שלו וכל ההוצאות וההעברות יישמרו.`
        : `${source.displayName} ו-${target.displayName} יהפכו לחשבון אחד בשם ${target.displayName}. כל ההוצאות וההעברות יישמרו.`,
      metrics: [
        { label: "אירועים", value: String(impact.events) },
        { label: "הוצאות", value: String(impact.expenses) },
        { label: "העברות", value: String(impact.transfers) }
      ],
      confirmLabel: "אחד את החשבונות",
      payload: { sourceId: source.id, targetId: target.id }
    },
    trigger
  );
}

function requestExplicitParticipantLink(
  eventId,
  sourceParticipantId,
  targetParticipantId,
  trigger
) {
  const event = getEvent(eventId);
  const source = state.participants.find(
    (participant) => participant.id === sourceParticipantId
  );
  const target = state.participants.find(
    (participant) => participant.id === targetParticipantId
  );
  const sourceIsActive = Boolean(
    event?.participantIds.includes(sourceParticipantId) &&
      !isEventParticipantInactive(event, sourceParticipantId)
  );
  const targetIsActive = Boolean(
    event?.participantIds.includes(targetParticipantId) &&
      !isEventParticipantInactive(event, targetParticipantId)
  );

  if (
    !event ||
    !canCurrentParticipantManage(event) ||
    !source ||
    !target ||
    source.id === target.id ||
    participantHasConnectedAccount(source) ||
    !participantHasConnectedAccount(target) ||
    !sourceIsActive ||
    !targetIsActive ||
    !canLinkParticipantAccountInEvent(
      state,
      eventId,
      sourceParticipantId,
      targetParticipantId
    )
  ) {
    showEventParticipantMessage(
      eventId,
      "לא ניתן לקשר את המשתתפים האלה כרגע."
    );
    return;
  }

  const impact = participantMergeImpactForEvent(event, source.id);
  openImportantActionDialog(
    {
      kind: "merge-participants",
      label: "אישור קישור",
      title: `לקשר את ${source.displayName} לחשבון של ${target.displayName}?`,
      description: `באירוע הזה, כל ההוצאות וההעברות של ${source.displayName} יעברו לחשבון של ${target.displayName}. אירועים אחרים לא ישתנו.`,
      metrics: [
        { label: "הוצאות", value: String(impact.expenses) },
        { label: "העברות", value: String(impact.transfers) }
      ],
      confirmLabel: "קשר לחשבון",
      payload: {
        sourceId: source.id,
        targetId: target.id,
        eventId,
        mergeKind: "account-link"
      }
    },
    trigger
  );
}

function participantMergeImpactForEvent(event, participantId) {
  return {
    expenses: (event.expenses ?? []).filter(
      (expense) =>
        expense.createdByParticipantId === participantId ||
        expense.sharedByParticipantIds.includes(participantId) ||
        expense.payers.some((payer) => payer.participantId === participantId)
    ).length,
    transfers: (event.transfers ?? []).filter(
      (transfer) =>
        transfer.fromParticipantId === participantId ||
        transfer.toParticipantId === participantId ||
        transfer.markedPaidByParticipantId === participantId
    ).length
  };
}

function participantMergeImpact(participantId) {
  return state.events.reduce(
    (impact, event) => {
      const expenses = (event.expenses ?? []).filter(
        (expense) =>
          expense.createdByParticipantId === participantId ||
          expense.sharedByParticipantIds.includes(participantId) ||
          expense.payers.some((payer) => payer.participantId === participantId)
      ).length;
      const transfers = (event.transfers ?? []).filter(
        (transfer) =>
          transfer.fromParticipantId === participantId ||
          transfer.toParticipantId === participantId ||
          transfer.markedPaidByParticipantId === participantId
      ).length;
      const appearsInEvent =
        event.participantIds.includes(participantId) ||
        expenses > 0 ||
        transfers > 0;
      return {
        events: impact.events + Number(appearsInEvent),
        expenses: impact.expenses + expenses,
        transfers: impact.transfers + transfers
      };
    },
    { events: 0, expenses: 0, transfers: 0 }
  );
}

async function keepDuplicateParticipantsSeparate(eventId, pairKey) {
  const event = getEvent(eventId);
  if (!event || !canCurrentParticipantManage(event)) return;

  const unresolvedPair = unresolvedDuplicateParticipantPairs(
    state.participants,
    event
  ).find((pair) => pair.key === pairKey);
  if (!unresolvedPair) return;

  const previousPairs = [...(event.distinctParticipantPairs ?? [])];
  event.distinctParticipantPairs = [
    ...new Set([...(event.distinctParticipantPairs ?? []), pairKey])
  ];
  if (
    eventDialog?.eventId === eventId &&
    eventDialog.kind === "participant-identities"
  ) {
    eventDialog = {
      ...eventDialog,
      message: "נשמר. אלה שני אנשים נפרדים.",
      resolvedPairIds: [
        unresolvedPair.left.id,
        unresolvedPair.right.id
      ]
    };
  }
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (!result?.ok) {
    event.distinctParticipantPairs = previousPairs;
    if (eventDialog?.eventId === eventId) {
      eventDialog = {
        ...eventDialog,
        message: "לא הצלחנו לשמור את ההפרדה. אפשר לנסות שוב."
      };
    }
  }
  render();
  reactivateDialogAfterRender(
    ".event-modal",
    `[data-action="participant-alias"][data-participant-id="${unresolvedPair.left.id}"]`
  );
  return result;
}

async function saveOfflineParticipantName(eventId, participantId) {
  const event = getEvent(eventId);
  const participant = state.participants.find((item) => item.id === participantId);
  if (
    !event ||
    !participant ||
    participantHasConnectedAccount(participant) ||
    !event.participantIds.includes(participantId) ||
    !canCurrentParticipantEdit(event) ||
    eventDialog?.kind !== "participant-rename"
  ) {
    return;
  }

  const displayName = normalizeProfileName(eventDialog.offlineNameDraft).slice(0, 48);
  const showError = (message) => {
    eventDialog = { ...eventDialog, error: message };
    render();
    reactivateDialogAfterRender(
      ".event-modal",
      '[data-action="event-offline-participant-rename"]'
    );
  };

  if (!displayName) {
    showError("צריך להזין שם.");
    return;
  }

  const duplicate = state.participants.find(
    (item) =>
      item.id !== participantId &&
      !participantHasConnectedAccount(item) &&
      normalizeParticipantDisplayName(item.displayName) ===
        normalizeParticipantDisplayName(displayName)
  );
  if (duplicate) {
    showError(`כבר קיים שם אופליין בשם ${duplicate.displayName}. כדאי להוסיף פרט שמבדיל ביניהם.`);
    return;
  }

  if (displayName !== participant.displayName) {
    const previousState = cloneNavigationValue(state);
    const nextState = renameOfflineParticipant(state, participantId, displayName);
    if (nextState === state) {
      showError("לא הצלחנו לעדכן את השם. אפשר לנסות שוב.");
      return;
    }
    state = nextState;
    const result = await persistState({
      awaitCloud: true,
      forceSharedEventIds: [eventId]
    });
    if (!result?.ok) {
      state = previousState;
      showError("לא הצלחנו לשמור את השם. לא בוצע שינוי ואפשר לנסות שוב.");
      return result;
    }
  }

  goBackInApp();
  return { ok: true };
}

async function saveParticipantAlias(eventId, participantId) {
  const event = getEvent(eventId);
  if (
    !event ||
    !canCurrentParticipantManage(event) ||
    !event.participantIds.includes(participantId)
  ) {
    return;
  }

  const input = app.querySelector(
    `[data-action="participant-alias"][data-event-id="${eventId}"][data-participant-id="${participantId}"]`
  );
  if (!(input instanceof HTMLInputElement)) return;

  const alias = sanitizeParticipantAlias(input.value);
  const dialogScrollTop = app.querySelector(".event-modal")?.scrollTop ?? 0;
  const previousAliases = { ...(event.participantAliases ?? {}) };
  event.participantAliases = {
    ...(event.participantAliases ?? {}),
    [participantId]: alias
  };
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (!result?.ok) {
    event.participantAliases = previousAliases;
    notice = "לא הצלחנו לשמור את הכינוי. לא בוצע שינוי ואפשר לנסות שוב.";
  }
  render();
  reactivateDialogAfterRender(
    ".event-modal",
    `[data-action="participant-alias"][data-event-id="${eventId}"][data-participant-id="${participantId}"]`,
    dialogScrollTop
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

async function saveEventNoteFromDialog(eventId) {
  const event = getEvent(eventId);
  if (
    !event ||
    eventDialog?.kind !== "note-editor" ||
    eventDialog.eventId !== eventId ||
    eventDialog.saving ||
    !canCurrentParticipantEdit(event)
  ) {
    return;
  }

  const title = String(eventDialog.titleDraft ?? "").trim();
  const body = String(eventDialog.bodyDraft ?? "").trim();
  if (!title && !body) {
    eventDialog.error = "צריך לכתוב כותרת או תוכן לפני השמירה.";
    render();
    reactivateDialogAfterRender(".event-note-modal", '[data-action="event-note-title"]');
    return;
  }

  const previousState = cloneNavigationValue(state);
  const noteId = eventDialog.noteId || makeId("note");
  const nextState = eventDialog.noteId
    ? updateEventNote(state, eventId, noteId, {
        title,
        body,
        pinned: eventDialog.pinned === true,
        participantId: state.currentParticipantId
      })
    : addEventNote(state, eventId, {
        id: noteId,
        title,
        body,
        pinned: eventDialog.pinned === true,
        participantId: state.currentParticipantId
      });

  if (nextState === state) {
    if (eventDialog.noteId) {
      eventDialog = null;
      closeDialogWithHistory();
      return { ok: true, unchanged: true };
    }
    eventDialog.error = "לא הצלחנו להכין את הפתק לשמירה. אפשר לנסות שוב.";
    render();
    reactivateDialogAfterRender(".event-note-modal");
    return;
  }

  state = nextState;
  eventDialog.saving = true;
  render();
  reactivateDialogAfterRender(".event-note-modal");
  const result = await completedSaveResult(
    persistState({
      awaitCloud: true,
      forceSharedEventIds: [eventId]
    })
  );

  if (!result?.ok) {
    state = previousState;
    eventDialog.saving = false;
    eventDialog.error = "הפתק לא נשמר כדי למנוע הבדל בין המכשירים. בדקו את החיבור ונסו שוב.";
    render();
    reactivateDialogAfterRender(".event-note-modal");
    return result;
  }

  eventDialog = null;
  closeDialogWithHistory();
  return result;
}

function requestEventNoteDeletion(eventId, noteId, trigger) {
  const event = getEvent(eventId);
  const note = event?.notes?.find((item) => item.id === noteId);
  if (!event || !note || !canCurrentParticipantEdit(event)) return;
  const title = String(note.title ?? "").trim() || "הפתק הזה";
  openImportantActionDialog(
    {
      kind: "delete-event-note",
      label: "פתק משותף",
      title: `למחוק את "${title}"?`,
      description: "הפתק יוסר אצל כל משתתפי האירוע. אי אפשר לבטל את הפעולה.",
      confirmLabel: "מחק פתק",
      payload: { eventId, noteId }
    },
    trigger
  );
}

async function deleteEventNote(eventId, noteId) {
  const event = getEvent(eventId);
  if (!event || !canCurrentParticipantEdit(event)) return;
  const previousState = cloneNavigationValue(state);
  const editorSnapshot = cloneNavigationValue(eventDialog);
  const nextState = removeEventNote(state, eventId, noteId, {
    participantId: state.currentParticipantId
  });
  if (nextState === state) return;

  state = nextState;
  const result = await completedSaveResult(
    persistState({
      awaitCloud: true,
      forceSharedEventIds: [eventId]
    })
  );
  if (!result?.ok) {
    state = previousState;
    eventDialog = {
      ...editorSnapshot,
      saving: false,
      error: "לא הצלחנו למחוק את הפתק. לא בוצע שינוי ואפשר לנסות שוב."
    };
  } else {
    eventDialog = null;
  }
  render();
  return result;
}

function requestEventLeave(eventId, trigger) {
  const event = getEvent(eventId);
  if (!event) return;

  if (!canLeaveEvent(state, eventId, state.currentParticipantId)) {
    notice = "אי אפשר לעזוב כשאתה המנהל היחיד. קודם מעבירים את הניהול למשתתף אחר.";
    render();
    return;
  }

  const hasMoneyHistory = eventParticipantHasMoneyHistory(
    event,
    state.currentParticipantId
  );

  openImportantActionDialog(
    {
      kind: "leave-event",
      title: `לעזוב את "${event.name}"?`,
      description: hasMoneyHistory
        ? "הגישה שלך לאירוע תוסר, אבל השם שלך וההוצאות וההעברות שכבר רשומות עליו יישארו בהיסטוריה כשם אופליין. כדי לחזור תצטרך הזמנה חדשה."
        : "האירוע יוסר מהמסך שלך. כדי לחזור אליו תצטרך לקבל קישור הצטרפות חדש.",
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
      label: "מחיקת אירוע",
      title: `למחוק את "${event.name}"?`,
      description: "כל ההוצאות, המשתתפים וההעברות באירוע יימחקו לצמיתות. אי אפשר לשחזר אותו.",
      confirmLabel: "מחק אירוע",
      metrics: [
        {
          label: "משתתפים",
          value: String(event.participantIds?.length ?? 0)
        },
        {
          label: "הוצאות",
          value: String(event.expenses?.length ?? 0)
        },
        {
          label: "העברות",
          value: String(event.transfers?.length ?? 0)
        }
      ],
      payload: { eventId }
    },
    trigger
  );
}

function requestOpenInviteRotation(eventId, trigger) {
  const event = getEvent(eventId);
  if (!event) return;
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול להחליף את קישור ההצטרפות.";
    render();
    return;
  }

  openImportantActionDialog(
    {
      kind: "rotate-event-invite",
      label: "קישור פתוח",
      title: "להחליף את קישור ההצטרפות?",
      description:
        "הקישור הישן יפסיק לצרף אנשים חדשים. מי שכבר הצטרף יישאר באירוע וימשיך לעבוד כרגיל.",
      confirmLabel: "בטל והפק חדש",
      payload: { eventId }
    },
    trigger
  );
}

function openImportantActionDialog(config, trigger) {
  if (importantActionDialog) return;

  const replacesEventMenu = Boolean(eventStatusMenu);
  importantActionReturnFocus = replacesEventMenu
    ? dialogReturnFocus
    : createActionFocusDescriptor(trigger);
  eventStatusMenu = null;
  importantActionDialog = config;
  if (replacesEventMenu) {
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
  const variant = arguments[0] === "alternate" ? "alternate" : "primary";
  let pendingAction = importantActionDialog;
  if (!pendingAction) return;
  if (variant === "alternate" && pendingAction.alternatePayload) {
    pendingAction = {
      ...pendingAction,
      payload: {
        ...(pendingAction.payload ?? {}),
        ...pendingAction.alternatePayload
      }
    };
  }

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

  if (underlyingDialogSelector && app.querySelector(underlyingDialogSelector)) {
    activateDialog(underlyingDialogSelector);
  } else {
    deactivateDialog();
  }

  if (shouldRewindBrowserHistory) {
    pendingConfirmedEventDialog = cloneNavigationValue(eventDialog);
    pendingImportantActionReturnFocus = returnFocus;
    appHistoryDepth = Math.max(0, appHistoryDepth - 1);
    lastNavigationViewKey = navigationViewKey();
    window.history.back();
  } else {
    replaceBrowserHistoryState();
    window.setTimeout(() => restoreActionFocus(returnFocus), 180);
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

  if (action.kind === "remove-event-participant") {
    await removeEventParticipant(
      action.payload.eventId,
      action.payload.participantId,
      action.payload.removalMode
    );
    return;
  }

  if (action.kind === "remove-new-event-participant") {
    if (action.payload.participantId === state.currentParticipantId) {
      ensureCurrentParticipantInNewEventDraft();
      render();
      return;
    }
    toggleId(newEventDraft.participantIds, action.payload.participantId, false);
    render();
    return;
  }

  if (action.kind === "merge-participants") {
    mergeParticipantsDraft = {
      sourceId: action.payload.sourceId,
      targetId: action.payload.targetId,
      eventId: action.payload.eventId ?? "",
      mergeKind: action.payload.mergeKind ?? "duplicate"
    };
    await mergeParticipantsInState();
    return;
  }

  if (action.kind === "delete-expense") {
    await deleteExpense(action.payload.eventId, action.payload.expenseId);
    return;
  }

  if (action.kind === "delete-event-note") {
    await deleteEventNote(action.payload.eventId, action.payload.noteId);
    return;
  }

  if (action.kind === "leave-event") {
    await leaveCurrentEvent(action.payload.eventId);
    return;
  }

  if (action.kind === "delete-event") {
    await deleteCurrentEvent(action.payload.eventId);
    return;
  }

  if (action.kind === "rotate-event-invite") {
    await rotateCurrentEventInvite(action.payload.eventId);
    return;
  }

  if (action.kind === "close-event-from-home") {
    await closeCurrentEvent(action.payload.eventId, { destination: "home" });
    return;
  }

  if (action.kind === "reopen-event") {
    await reopenCurrentEvent(action.payload.eventId, {
      resetPayments: action.payload.paymentMode === "reset"
    });
    return;
  }

  if (action.kind === "change-event-currency") {
    await applyEventCurrencyChange(
      action.payload.eventId,
      action.payload.currency,
      { allowExistingExpenses: true }
    );
    return;
  }

  if (action.kind === "remove-network-friend") {
    await performFriendshipAction(action.payload.friendshipId, "remove");
    return;
  }

  if (action.kind === "block-connected-user") {
    await performConnectedUserBlock(action.payload);
    return;
  }

  if (action.kind === "remove-offline-friend") {
    const previousState = state;
    state = removeFriendContact(state, action.payload.participantId);
    const result = await persistState();
    if (!result?.ok) {
      state = previousState;
      notice = "לא הצלחנו להסיר את השם. לא בוצע שינוי ואפשר לנסות שוב.";
    } else {
      notice = "השם הוסר מרשימת החברים. האירועים וההוצאות נשמרו.";
    }
    render();
    return;
  }

  if (action.kind === "restore-backup") {
    await restoreStateBackup(action.payload.restoredState);
    return;
  }

  render();
}

function requestEventCurrencyChange(event, currency, trigger) {
  const expenseLabel = formatCount(
    event.expenses.length,
    "הוצאה קיימת",
    "הוצאות קיימות"
  );
  const visibleTrigger = trigger?.nextElementSibling?.matches?.(
    '[data-choice-select-action="event-currency"]'
  )
    ? trigger.nextElementSibling
    : trigger;
  openImportantActionDialog(
    {
      kind: "change-event-currency",
      title: `לשנות ל${currencySelectLabel(currency)}?`,
      description: `באירוע יש ${expenseLabel}. הסכומים יישארו בדיוק כפי שהוזנו ולא יומרו לפי שער חליפין. רק סימון המטבע באירוע הזה ישתנה; אירועים אחרים לא יושפעו.`,
      confirmLabel: "שנה מטבע",
      payload: {
        eventId: event.id,
        currency: normalizeCurrency(currency)
      }
    },
    visibleTrigger
  );
}

async function applyEventCurrencyChange(
  eventId,
  currency,
  { allowExistingExpenses = false } = {}
) {
  const event = getEvent(eventId);
  if (!event || !canCurrentParticipantManage(event)) return;

  const nextCurrency = normalizeCurrency(currency);
  if (nextCurrency === eventCurrency(event)) return { ok: true, unchanged: true };

  const previousState = state;
  state = setEventCurrency(state, eventId, nextCurrency, {
    allowExistingExpenses
  });
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (!result?.ok) {
    state = previousState;
    notice = result?.error?.code === "SHARED_EVENT_MEMBERSHIP_REVOKED"
      ? "הגישה שלך לאירוע בוטלה. רעננו את המסך."
      : "לא הצלחנו לשנות את מטבע האירוע. לא בוצע שינוי.";
  } else {
    notice = `מטבע האירוע עודכן ל${currencySelectLabel(nextCurrency)}.`;
  }
  render();
  reactivateDialogAfterRender(".event-modal");
  window.setTimeout(() => {
    app
      .querySelector('[data-choice-select-action="event-currency"]')
      ?.focus({ preventScroll: true });
  }, 180);
  return result;
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
    choiceSelectAction: element.dataset.choiceSelectAction ?? "",
    eventId: element.dataset.eventId ?? "",
    expenseId: element.dataset.expenseId ?? "",
    groupId: element.dataset.groupId ?? "",
    participantId: element.dataset.participantId ?? ""
  };
}

function restoreActionFocus(returnTarget, attempt = 0) {
  if (!returnTarget) return;
  if (returnTarget.element?.isConnected) {
    returnTarget.element.focus({ preventScroll: true });
    if (document.activeElement === returnTarget.element || attempt >= 8) return;
    requestAnimationFrame(() => restoreActionFocus(returnTarget, attempt + 1));
    return;
  }

  const focusCandidates = returnTarget.choiceSelectAction
    ? app.querySelectorAll("[data-choice-select-action]")
    : app.querySelectorAll("[data-action]");
  const replacement = [...focusCandidates].find((element) =>
    (returnTarget.choiceSelectAction
      ? element.dataset.choiceSelectAction === returnTarget.choiceSelectAction
      : element.dataset.action === returnTarget.action) &&
    (!returnTarget.eventId || element.dataset.eventId === returnTarget.eventId) &&
    (!returnTarget.expenseId || element.dataset.expenseId === returnTarget.expenseId) &&
    (!returnTarget.groupId || element.dataset.groupId === returnTarget.groupId) &&
    (!returnTarget.participantId || element.dataset.participantId === returnTarget.participantId)
  );

  replacement?.focus({ preventScroll: true });
  if (document.activeElement === replacement || attempt >= 8) return;
  requestAnimationFrame(() => restoreActionFocus(returnTarget, attempt + 1));
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

  const source = mergeParticipantSourceCandidates()[0];
  const targetCandidates = mergeParticipantTargetCandidates(source?.id);
  const target =
    targetCandidates.find((participant) => participantConnectionStatus(participant).connected) ??
    targetCandidates[0];
  mergeParticipantsDraft = source && target
    ? { sourceId: source.id, targetId: target.id }
    : null;
}

function participantsExistForMerge(draft) {
  const ids = new Set(state.participants.map((participant) => participant.id));
  return (
    ids.has(draft.sourceId) &&
    ids.has(draft.targetId) &&
    draft.sourceId !== draft.targetId &&
    mergeParticipantSourceCandidates().some(
      (participant) => participant.id === draft.sourceId
    )
  );
}

function mergeParticipantSourceCandidates() {
  const duplicateIds = new Set(
    mergeableDuplicateParticipantGroups()
      .flat()
      .map((participant) => participant.id)
  );
  return state.participants.filter(
    (participant) =>
      duplicateIds.has(participant.id) &&
      (
        !participantConnectionStatus(participant).connected ||
        !accountUserIdFromParticipantId(participant.id)
      )
  );
}

function mergeParticipantTargetCandidates(sourceParticipantId) {
  const source = state.participants.find(
    (participant) => participant.id === sourceParticipantId
  );
  const sourceName = normalizeParticipantDisplayName(source?.displayName);
  if (!sourceName) return [];

  return state.participants.filter(
    (participant) =>
      participant.id !== sourceParticipantId &&
      normalizeParticipantDisplayName(participant.displayName) === sourceName
  );
}

function syncMergeParticipantControls(changedAction) {
  if (!mergeParticipantsDraft) return;

  const sourceSelect = app.querySelector('[data-action="merge-source"]');
  const targetSelect = app.querySelector('[data-action="merge-target"]');
  const mergeButton = app.querySelector('[data-action="merge-participants"]');
  if (!sourceSelect || !targetSelect || !mergeButton) return;

  if (changedAction === "merge-source") {
    targetSelect.innerHTML = mergeParticipantTargetCandidates(mergeParticipantsDraft.sourceId)
      .map((participant) =>
        renderParticipantOption(participant, mergeParticipantsDraft.targetId)
      )
      .join("");
    targetSelect.value = mergeParticipantsDraft.targetId;
  } else {
    sourceSelect.innerHTML = mergeParticipantSourceCandidates()
      .filter((participant) => participant.id !== mergeParticipantsDraft.targetId)
      .map((participant) =>
        renderParticipantOption(participant, mergeParticipantsDraft.sourceId)
      )
      .join("");
    sourceSelect.value = mergeParticipantsDraft.sourceId;
  }

  mergeButton.disabled =
    !mergeParticipantsDraft.sourceId ||
    !mergeParticipantsDraft.targetId ||
    !canMergeParticipants(
      state,
      mergeParticipantsDraft.sourceId,
      mergeParticipantsDraft.targetId
    );
}

function mergeParticipantsInState() {
  if (mergeParticipantsRequest) return mergeParticipantsRequest;
  mergeParticipantsRequest = mergeParticipantsInStateNow().finally(() => {
    mergeParticipantsRequest = null;
  });
  return mergeParticipantsRequest;
}

async function mergeParticipantsInStateNow() {
  ensureMergeParticipantsDraft();
  if (!mergeParticipantsDraft) return;

  const pendingMerge = { ...mergeParticipantsDraft };
  let source = state.participants.find((participant) => participant.id === pendingMerge.sourceId);
  let target = state.participants.find((participant) => participant.id === pendingMerge.targetId);
  if (!source || !target || source.id === target.id) return;

  if (pendingMerge.mergeKind === "account-link" && pendingMerge.eventId) {
    if (eventDialog?.eventId === pendingMerge.eventId) {
      eventDialog = {
        ...eventDialog,
        message: "מכינים חיבור מאובטח ושומרים אותו בענן…"
      };
      render();
      reactivateDialogAfterRender(".event-modal");
    }
    try {
      await prepareSharedEventForInvitation(pendingMerge.eventId, {
        publishExisting: true
      });
    } catch (error) {
      mergeParticipantsDraft = null;
      emitOperationFailure("account_link", {
        screen: "event",
        error
      });
      const failureMessage =
        "לא הצלחנו להכין חיבור מאובטח לחשבון. לא בוצע שינוי, ואפשר לנסות שוב.";
      eventDialog = eventDialog?.eventId === pendingMerge.eventId
        ? { ...eventDialog, message: failureMessage }
        : eventDialog;
      notice = eventDialog?.eventId === pendingMerge.eventId ? "" : failureMessage;
      render();
      reactivateDialogAfterRender(".event-modal");
      return { ok: false, error };
    }
    source = state.participants.find((participant) => participant.id === pendingMerge.sourceId);
    target = state.participants.find((participant) => participant.id === pendingMerge.targetId);
    if (!source || !target || source.id === target.id) return;
  }

  const nextState = pendingMerge.mergeKind === "account-link"
    ? pendingMerge.eventId
      ? linkParticipantAccountInEvent(
          state,
          pendingMerge.eventId,
          source.id,
          target.id
        )
      : linkParticipantAccount(state, source.id, target.id)
    : mergeParticipants(state, source.id, target.id);
  if (nextState === state) {
    mergeParticipantsDraft = null;
    notice = "לא ניתן לאחד את השמות בלי הרשאת ניהול בכל האירועים שיושפעו.";
    render();
    return;
  }

  const previousState = cloneNavigationValue(state);
  const accountLinkReceipt = pendingMerge.mergeKind === "account-link"
    ? pendingAccountLinkReceipt(nextState, pendingMerge)
    : null;
  if (accountLinkReceipt) rememberPendingAccountLink(accountLinkReceipt);
  state = nextState;
  if (pendingMerge.mergeKind === "account-link" && eventDialog?.eventId === pendingMerge.eventId) {
    eventDialog = {
      ...eventDialog,
      message: `מקשרים את ${source.displayName} לחשבון של ${target.displayName}…`
    };
    notice = "";
  } else {
    notice = "שומרים את האיחוד…";
  }
  render();
  reactivateDialogAfterRender(".event-modal");

  const result = pendingMerge.mergeKind === "account-link"
    ? await saveSharedState(state, {
        awaitCloud: true,
        forceSharedEventIds: [pendingMerge.eventId]
      })
    : await persistState();
  if (!result?.ok && !result?.pending) {
    state = previousState;
    mergeParticipantsDraft = null;
    if (accountLinkReceipt) forgetPendingAccountLink(accountLinkReceipt);
    const failureMessage = "לא הצלחנו לקשר את החשבון. לא בוצע שינוי, ואפשר לנסות שוב.";
    if (pendingMerge.mergeKind === "account-link") {
      emitOperationFailure("account_link", {
        screen: "participants",
        error: result?.error
      });
      eventDialog = eventDialog?.eventId === pendingMerge.eventId
        ? { ...eventDialog, message: failureMessage }
        : eventDialog;
      notice = eventDialog?.eventId === pendingMerge.eventId ? "" : failureMessage;
    } else {
      notice = "לא הצלחנו לשמור את האיחוד. לא בוצע שינוי.";
    }
    render();
    reactivateDialogAfterRender(".event-modal");
    return result;
  }

  let accountLinkConfirmed = pendingMerge.mergeKind !== "account-link";
  if (accountLinkReceipt) {
    try {
      accountLinkConfirmed = await confirmPendingAccountLink(accountLinkReceipt);
    } catch (error) {
      emitOperationDeferred("account_link", {
        screen: "event",
        error
      });
    }
    if (accountLinkConfirmed) {
      forgetPendingAccountLink(accountLinkReceipt);
    } else {
      rememberPendingAccountLink(accountLinkReceipt);
    }
  }
  const accountLinkPending = Boolean(
    pendingMerge.mergeKind === "account-link" && !accountLinkConfirmed
  );

  if (localProfile?.participantId === source.id) {
    localProfile = saveLocalProfile({
      ...localProfile,
      participantId: target.id,
      displayName: target.displayName
    });
  }
  if (
    eventDialog?.kind === "participant-identities" &&
    eventDialog.eventId
  ) {
    eventDialog = {
      ...eventDialog,
      message: accountLinkPending
        ? `החיבור של ${source.displayName} לחשבון של ${target.displayName} נשמר וממתין לאישור מהענן. נשלים אותו אוטומטית.`
        : `אוחד. ${target.displayName} הוא עכשיו חשבון אחד.`,
      resolvedPairIds: []
    };
  } else if (
    ["participant-profile", "participant-link"].includes(eventDialog?.kind) &&
    eventDialog.eventId
  ) {
    eventDialog = {
      eventId: eventDialog.eventId,
      kind: "participants",
      message: accountLinkPending
        ? `החיבור של ${source.displayName} לחשבון של ${target.displayName} נשמר וממתין לאישור מהענן. נשלים אותו אוטומטית.`
        : `קישרנו את ${source.displayName} לחשבון של ${target.displayName}.`,
      historyBaseDepth: eventDialog.historyBaseDepth
    };
  }
  dropParticipantFromDrafts(source.id);
  mergeParticipantsDraft = null;
  notice = pendingMerge.mergeKind === "account-link"
    ? ""
    : result?.pending
      ? `אוחד. ${target.displayName} הוא עכשיו חשבון אחד והסנכרון יושלם אוטומטית.`
      : `אוחד. ${target.displayName} הוא עכשיו חשבון אחד.`;
  render();
  reactivateDialogAfterRender(".event-modal");
  return accountLinkPending
    ? { ...result, ok: true, pending: true, confirmed: false }
    : { ...result, confirmed: true };
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

function nativeContactPickerAvailable() {
  return Boolean(
    globalThis.SogrimNative?.contacts?.available &&
      typeof globalThis.SogrimNative.contacts.pick === "function"
  );
}

async function pickEventContact(eventId) {
  const event = getEvent(eventId);
  if (!event || !canCurrentParticipantEdit(event) || !nativeContactPickerAvailable()) {
    return;
  }

  try {
    const contact = await globalThis.SogrimNative.contacts.pick();
    if (!contact) return;
    const displayName = normalizeProfileName(contact.displayName);
    if (!displayName) {
      eventDialog = {
        ...eventDialog,
        message: "לאיש הקשר שבחרת אין שם שאפשר להוסיף."
      };
      render();
      return;
    }

    eventDialog = {
      ...eventDialog,
      offlineEntryOpen: true,
      contactNameDraft: displayName,
      message: "השם נוסף מהטלפון. המספר עצמו לא נשמר."
    };
    render();
    window.requestAnimationFrame(() => {
      const input = app.querySelector('[data-action="event-guest-name"]');
      input?.focus({ preventScroll: true });
      input?.select?.();
    });
  } catch {
    console.warn("[contacts] Contact selection failed");
    eventDialog = {
      ...eventDialog,
      message: "לא הצלחנו לפתוח את אנשי הקשר כרגע. אפשר להקליד שם ידנית."
    };
    render();
  }
}

async function addGuestToEvent(eventId) {
  const input =
    app.querySelector('.event-modal [data-action="event-guest-name"]') ??
    app.querySelector('[data-action="event-guest-name"]');
  const dialogSelector = input?.closest(".expense-modal")
    ? ".expense-modal"
    : input?.closest(".event-modal")
      ? ".event-modal"
      : "";
  const returnsToExpenseParticipants = Boolean(
    input?.closest(".expense-participant-add-route") &&
    expenseDraft?.participantAddView
  );
  const dialogScrollTop = input?.closest(".expense-modal, .event-modal")?.scrollTop ?? 0;
  const name = normalizeProfileName(
    String(input?.value ?? "").normalize("NFKC")
  );
  if (!name) return;
  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    notice = editBlockedMessage(event);
    render();
    reactivateDialogAfterRender(dialogSelector);
    return;
  }
  const previousState = cloneNavigationValue(state);
  const previousExpenseDraft = cloneNavigationValue(expenseDraft);
  const previousEventDialog = cloneNavigationValue(eventDialog);
  const { participant: guest, created } = resolveOfflineParticipant(name, "guest");
  const participantAdded = activateParticipantForEvent(event, guest.id);
  if (participantAdded) {
    recordEventActivity(event.id, "participant-added", {
      subjectParticipantId: guest.id
    });
  }
  if (expenseDraft?.eventId === event.id && !expenseDraft.sharedByParticipantIds.includes(guest.id)) {
    expenseDraft.sharedByParticipantIds.push(guest.id);
  }
  const participantMessage = created
    ? `${guest.displayName} נוסף לאירוע.`
    : `${guest.displayName} כבר היה שמור ונוסף לאירוע.`;
  const returnsToParticipantRoster = eventDialog?.kind === "participants-add";
  if (returnsToParticipantRoster) {
    eventDialog = {
      eventId: event.id,
      kind: "participants",
      message: participantMessage,
      historyBaseDepth: eventDialog.historyBaseDepth
    };
    notice = "";
  } else if (isEventParticipantsDialog(event.id)) {
    eventDialog = {
      ...eventDialog,
      message: participantMessage,
      offlineEntryOpen: true
    };
    notice = "";
  } else {
    notice = participantMessage;
  }
  const saveRequest = persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (returnsToParticipantRoster) {
    renderHistoryFallback();
    reactivateDialogAfterRender(
      ".event-modal",
      `[data-action="open-event-participant-profile"][data-participant-id="${guest.id}"]`
    );
  } else if (returnsToExpenseParticipants) {
    finishExpenseParticipantAddRoute();
  } else {
    render();
    reactivateDialogAfterRender(
      dialogSelector,
      `${dialogSelector} [data-action="event-guest-name"]`,
      dialogScrollTop
    );
  }

  const result = await completedSaveResult(saveRequest);
  if (!result?.ok) {
    state = previousState;
    expenseDraft = previousExpenseDraft;
    eventDialog = previousEventDialog;
    const failureMessage = "לא הצלחנו להוסיף את המשתתף. לא בוצע שינוי ואפשר לנסות שוב.";
    if (expenseDraft) expenseDraft.error = failureMessage;
    if (eventDialog) eventDialog.message = failureMessage;
    notice = failureMessage;
    render();
    reactivateDialogAfterRender(dialogSelector, '[data-action="event-guest-name"]', dialogScrollTop);
  }
  return result;
}

function expenseParticipantAddRewindSteps() {
  const baseDepth = Number.isFinite(expenseDraft?.participantAddHistoryBaseDepth)
    ? expenseDraft.participantAddHistoryBaseDepth
    : Math.max(0, appHistoryDepth - 1);
  return Math.max(1, appHistoryDepth - baseDepth);
}

function finishExpenseParticipantAddRoute() {
  if (!expenseDraft) return;
  const rewindSteps = expenseParticipantAddRewindSteps();
  expenseDraft.participantAddView = "";
  expenseDraft.participantInviteMessage = "";
  delete expenseDraft.participantAddHistoryBaseDepth;
  renderHistoryFallback(rewindSteps);
}

async function addFriendParticipantToExpense(eventId, participantId) {
  const event = getEvent(eventId);
  const participant = state.participants.find((item) => item.id === participantId);
  const friendParticipantIds = new Set(activeFriendParticipantIds(state));
  const dialogScrollTop = app.querySelector(".expense-modal")?.scrollTop ?? 0;

  if (
    !expenseDraft ||
    expenseDraft.eventId !== eventId ||
    !event ||
    !participant ||
    !friendParticipantIds.has(participantId) ||
    !participantConnectionStatus(participant).connected
  ) {
    return;
  }

  if (!canCurrentParticipantEdit(event)) {
    expenseDraft.error = editBlockedMessage(event);
    render();
    reactivateDialogAfterRender(".expense-modal", "", dialogScrollTop);
    return;
  }

  const previousState = cloneNavigationValue(state);
  const previousSharedParticipantIds = [...expenseDraft.sharedByParticipantIds];
  const participantAdded = activateParticipantForEvent(event, participantId);
  if (participantAdded) {
    recordEventActivity(eventId, "participant-added", {
      subjectParticipantId: participantId
    });
  }
  if (!expenseDraft.sharedByParticipantIds.includes(participantId)) {
    expenseDraft.sharedByParticipantIds.push(participantId);
  }
  expenseDraft.error = "";
  expenseDraft.participantInviteMessage = `${participant.displayName} נוסף לאירוע ולהוצאה.`;

  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (!result?.ok) {
    state = previousState;
    expenseDraft.sharedByParticipantIds = previousSharedParticipantIds;
    expenseDraft.participantInviteMessage = "";
    expenseDraft.error = "לא הצלחנו להוסיף את החבר. לא בוצע שינוי.";
    render();
    reactivateDialogAfterRender(
      ".expense-modal",
      `[data-action="expense-add-friend-participant"][data-participant-id="${participantId}"]`,
      dialogScrollTop
    );
    return;
  }

  await publishEventInvitation(eventId, participant);
  finishExpenseParticipantAddRoute();
}

async function addInlinePayerGuest(eventId, payerIndex) {
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
  const name = normalizeProfileName(
    String(expenseDraft.inlinePayerGuestName ?? input?.value ?? "").normalize("NFKC")
  );
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

  const previousState = cloneNavigationValue(state);
  const previousExpenseDraft = cloneNavigationValue(expenseDraft);
  const { participant: guest } = resolveOfflineParticipant(name, "guest");
  if (activateParticipantForEvent(event, guest.id)) {
    recordEventActivity(event.id, "participant-added", {
      subjectParticipantId: guest.id
    });
  }
  if (!expenseDraft.sharedByParticipantIds.includes(guest.id)) {
    expenseDraft.sharedByParticipantIds.push(guest.id);
  }
  const duplicatePayerIndex = expenseDraft.payers.findIndex(
    (payer, index) => index !== payerIndex && payer.participantId === guest.id
  );
  if (duplicatePayerIndex >= 0) {
    expenseDraft.error = `${guest.displayName} כבר נמצא ברשימת המשלמים.`;
    expenseDraft.inlinePayerGuestIndex = null;
    expenseDraft.inlinePayerGuestName = "";
    const result = await completedSaveResult(persistState());
    if (!result?.ok) {
      state = previousState;
      expenseDraft = previousExpenseDraft;
      expenseDraft.error = "לא הצלחנו להוסיף את המשתתף. לא בוצע שינוי.";
    }
    render();
    reactivateDialogAfterRender(".expense-modal", "", dialogScrollTop);
    return;
  }
  expenseDraft.payers[payerIndex].participantId = guest.id;
  expenseDraft.inlinePayerGuestIndex = null;
  expenseDraft.inlinePayerGuestName = "";
  expenseDraft.error = "";
  rebalanceExpenseDraftPayers(payerIndex);
  const saveRequest = persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  render();
  reactivateDialogAfterRender(
    ".expense-modal",
    `[data-action="expense-payer-amount"][data-index="${payerIndex}"]`,
    dialogScrollTop
  );
  const result = await completedSaveResult(saveRequest);
  if (!result?.ok) {
    state = previousState;
    expenseDraft = previousExpenseDraft;
    expenseDraft.error = "לא הצלחנו להוסיף את המשתתף. לא בוצע שינוי.";
    render();
    reactivateDialogAfterRender(".expense-modal", "", dialogScrollTop);
  }
}

async function addInlineQuickItemGuest(eventId, itemIndex) {
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
  const name = normalizeProfileName(
    String(expenseDraft.quickInlineGuestName ?? input?.value ?? "").normalize("NFKC")
  );
  if (!name) {
    expenseDraft.error = "צריך להזין שם אופליין.";
    render();
    activateDialog(".expense-modal");
    requestAnimationFrame(() => {
      app.querySelector(
        `[data-action="quick-item-new-guest-name"][data-index="${itemIndex}"]`
      )?.focus();
    });
    return;
  }

  const previousState = cloneNavigationValue(state);
  const previousExpenseDraft = cloneNavigationValue(expenseDraft);
  const { participant: guest } = resolveOfflineParticipant(name, "guest");
  if (activateParticipantForEvent(event, guest.id)) {
    recordEventActivity(event.id, "participant-added", {
      subjectParticipantId: guest.id
    });
  }
  if (!expenseDraft.sharedByParticipantIds.includes(guest.id)) {
    expenseDraft.sharedByParticipantIds.push(guest.id);
  }
  expenseDraft.quickItems[itemIndex].sharedBy = guest.id;
  delete expenseDraft.quickItems[itemIndex].sharedByParticipantIds;
  expenseDraft.quickInlineGuestIndex = null;
  expenseDraft.quickInlineGuestName = "";
  expenseDraft.error = "";
  const saveRequest = persistState();
  render();
  activateDialog(".expense-modal");
  const result = await completedSaveResult(saveRequest);
  if (!result?.ok) {
    state = previousState;
    expenseDraft = previousExpenseDraft;
    expenseDraft.error = "לא הצלחנו להוסיף את המשתתף. לא בוצע שינוי.";
    render();
    activateDialog(".expense-modal");
  }
}

function prepareEventShare(eventId) {
  const activePreparation = eventSharePreparationPromises.get(eventId);
  if (activePreparation) return activePreparation;

  const event = getEvent(eventId);
  if (!event) return Promise.reject(new Error("Event not found"));
  const existingState = eventSharePreparationState(event);
  if (
    existingState.status === "verified" &&
    existingState.token === currentEventOpenInviteToken(event)
  ) {
    return Promise.resolve(eventInviteUrl(eventId));
  }

  const previouslyVerifiedToken = currentEventOpenInviteToken(event);
  if (navigator.onLine === false && previouslyVerifiedToken) {
    markEventShareVerified(event, previouslyVerifiedToken, "offline-cache");
    return Promise.resolve(eventInviteUrl(eventId));
  }

  markEventSharePreparing(event);
  const preparation = settleEventSharePreparation(
    prepareEventShareNow(eventId)
  )
    .then((inviteUrl) => {
      const preparedEvent = getEvent(eventId);
      const verifiedToken = currentEventOpenInviteToken(preparedEvent);
      if (!preparedEvent || !verifiedToken) {
        const error = new Error("Open event invitation was not verified");
        error.code = "EVENT_INVITE_NOT_READY";
        throw error;
      }
      markEventShareVerified(preparedEvent, verifiedToken, "server");
      return inviteUrl;
    })
    .catch((error) => {
      const currentEvent = getEvent(eventId);
      const verifiedToken = currentEventOpenInviteToken(currentEvent);
      if (
        currentEvent &&
        previouslyVerifiedToken &&
        verifiedToken === previouslyVerifiedToken &&
        canReuseVerifiedInviteAfterTransportFailure(error)
      ) {
        markEventShareVerified(currentEvent, verifiedToken, "offline-cache");
        return eventInviteUrl(eventId);
      }
      if (currentEvent) markEventShareFailed(currentEvent, error);
      throw error;
    })
    .finally(() => {
      eventSharePreparationPromises.delete(eventId);
    });
  eventSharePreparationPromises.set(eventId, preparation);
  return preparation;
}

function eventSharePreparationState(event) {
  const eventId = String(event?.id ?? "");
  const preparationState = eventSharePreparationStates.get(eventId);
  if (!eventId || !preparationState) return { status: "idle" };
  if (preparationState.status !== "verified") return preparationState;

  const scope = openInviteTokenScope(runtimeConfig, event);
  const verifiedToken = currentEventOpenInviteToken(event);
  if (
    !scope ||
    preparationState.scopeKey !== scope.storageKey ||
    !verifiedToken ||
    preparationState.token !== verifiedToken
  ) {
    eventSharePreparationStates.delete(eventId);
    return { status: "idle" };
  }
  return preparationState;
}

function markEventSharePreparing(event) {
  eventSharePreparationStates.set(String(event?.id ?? ""), {
    status: "preparing",
    scopeKey: openInviteTokenScope(runtimeConfig, event)?.storageKey ?? ""
  });
}

function markEventShareVerified(event, token, source = "server") {
  const normalizedToken = eventOpenInviteToken({ openInviteToken: token });
  const scope = openInviteTokenScope(runtimeConfig, event);
  if (!event?.id || !scope || !normalizedToken) return false;
  eventSharePreparationStates.set(String(event.id), {
    status: "verified",
    scopeKey: scope.storageKey,
    token: normalizedToken,
    source
  });
  return true;
}

function markEventShareFailed(event, error) {
  eventSharePreparationStates.set(String(event?.id ?? ""), {
    status: "error",
    scopeKey: openInviteTokenScope(runtimeConfig, event)?.storageKey ?? "",
    code: String(error?.code ?? ""),
    message: String(error?.message ?? "")
  });
}

function canReuseVerifiedInviteAfterTransportFailure(error) {
  if (navigator.onLine === false) return true;
  if (error?.code === "EVENT_INVITE_TIMEOUT") return true;
  if (error?.cachedInviteFallbackAllowed === true) return true;
  if (
    error?.code === "EVENT_INVITE_CLOUD_REQUIRED" &&
    runtimeConfigUsesFallback()
  ) return true;
  if (isEventInviteError(error)) return false;
  const message = String(error?.message ?? "");
  return (
    error?.name === "TypeError" ||
    /failed to fetch|networkerror|network request failed|load failed/i.test(message)
  );
}

function reconcileEventInviteAccountBoundary(config) {
  if (!reconcileOpenInviteAccountScope(config)) return;
  eventOpenInviteRuntimeTokens.clear();
  eventSharePreparationStates.clear();
}

function settleEventSharePreparation(task, timeoutMs = 20_000) {
  let timeoutId = 0;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      const error = new Error("Event invitation preparation timed out");
      error.code = "EVENT_INVITE_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([task, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function preparePrivateEventInvitation(eventId) {
  const preparationKey = `private:${eventId}`;
  const activePreparation = eventSharePreparationPromises.get(preparationKey);
  if (activePreparation) return activePreparation;

  const preparation = settleEventSharePreparation(
    preparePrivateEventInvitationNow(eventId)
  )
    .finally(() => {
      eventSharePreparationPromises.delete(preparationKey);
    });
  eventSharePreparationPromises.set(preparationKey, preparation);
  return preparation;
}

async function preparePrivateEventInvitationNow(eventId) {
  const initialConfig = await loadRuntimeConfig();
  runtimeConfig = initialConfig;
  const configuredUserId = String(
    initialConfig?.storage?.account?.userId ?? ""
  ).trim();
  const currentParticipantId = String(state?.currentParticipantId ?? "").trim();
  const expectedUserId = configuredUserId || (
    currentParticipantId.startsWith("account-")
      ? currentParticipantId.slice("account-".length)
      : ""
  );

  try {
    return await prepareSharedEventForInvitation(eventId, {
      publishExisting: true
    });
  } catch (error) {
    if (!eventInviteAuthRefreshRequired(error) || !expectedUserId) throw error;

    const refreshedSession = await globalThis.SogrimAccountSession?.refresh?.();
    if (!refreshedSession) throw error;
    const freshRuntimeConfig = await loadRuntimeConfig();
    const freshUserId = String(
      freshRuntimeConfig?.storage?.account?.userId ?? ""
    ).trim();
    if (freshUserId !== expectedUserId) throw error;
    runtimeConfig = freshRuntimeConfig;
    return prepareSharedEventForInvitation(eventId, { publishExisting: true });
  }
}

async function openPreparedEventShare(eventId, trigger, shareView = "") {
  const event = getEvent(eventId);
  if (!event) return;
  if (isEventClosed(event)) {
    notice = "כדי להזמין משתתפים צריך לפתוח את האירוע לעריכה.";
    render();
    return;
  }

  const sharePreparation = prepareEventShare(eventId);
  openEventDialogWithDetails(
    eventId,
    "share",
    trigger,
    ["friends", "link"].includes(shareView) ? { shareView } : {}
  );
  try {
    await sharePreparation;
  } catch (error) {
    emitOperationFailure("event_invite", { screen: "invite", error });
    if (eventDialog?.eventId !== eventId || eventDialog.kind !== "share") {
      return;
    }
    notice = eventInvitePreparationNotice(
      error,
      "לא הצלחנו להכין קישור בטוח כרגע. כדאי לבדוק את החיבור ולנסות שוב."
    );
    render();
    reactivateDialogAfterRender(".event-modal");
    return;
  }

  notice = "קישור ההצטרפות מוכן לשיתוף.";
  if (eventDialog?.eventId === eventId && eventDialog.kind === "share") {
    render();
    reactivateDialogAfterRender(".event-modal");
  }
}

async function retryEventShare(eventId) {
  const event = getEvent(eventId);
  if (!event || eventDialog?.eventId !== eventId || eventDialog.kind !== "share") {
    return;
  }

  const sharePreparation = prepareEventShare(eventId);
  render();
  reactivateDialogAfterRender(".event-modal");

  try {
    await sharePreparation;
    notice = "קישור ההצטרפות מוכן לשיתוף.";
  } catch (error) {
    emitOperationFailure("event_invite", { screen: "invite", error });
    notice = eventInvitePreparationNotice(
      error,
      "עדיין לא הצלחנו להכין את הקישור. בדקו את החיבור ונסו שוב."
    );
  }

  if (eventDialog?.eventId === eventId && eventDialog.kind === "share") {
    render();
    reactivateDialogAfterRender(".event-modal");
  }
}

async function prepareEventShareNow(eventId) {
  const initialConfig = await loadRuntimeConfig();
  const configuredUserId = String(
    initialConfig?.storage?.account?.userId ?? ""
  ).trim();
  const currentParticipantId = String(state?.currentParticipantId ?? "").trim();
  const expectedUserId = configuredUserId || (
    currentParticipantId.startsWith("account-")
      ? currentParticipantId.slice("account-".length)
      : ""
  );
  try {
    return await prepareEventShareWithCurrentSession(eventId);
  } catch (error) {
    if (
      error?.code === "EVENT_INVITE_CLOUD_REQUIRED" &&
      expectedUserId
    ) {
      try {
        const freshRuntimeConfig = await refreshRuntimeConfigNow();
        const freshUserId = String(
          freshRuntimeConfig?.storage?.account?.userId ?? ""
        ).trim();
        if (
          freshRuntimeConfig?.storage?.mode === "supabase" &&
          freshUserId === expectedUserId
        ) {
          runtimeConfig = freshRuntimeConfig;
          return await prepareEventShareWithCurrentSession(eventId);
        }
      } catch {
        // Continue with the regular authenticated-session recovery below.
      }
    }
    if (!eventInviteAuthRefreshRequired(error) || !expectedUserId) throw error;

    const refreshedSession = await globalThis.SogrimAccountSession?.refresh?.();
    if (!refreshedSession) throw error;
    const freshRuntimeConfig = await loadRuntimeConfig();
    const freshUserId = String(
      freshRuntimeConfig?.storage?.account?.userId ?? ""
    ).trim();
    if (freshUserId !== expectedUserId) throw error;
    return prepareEventShareWithCurrentSession(eventId);
  }
}

async function prepareEventShareWithCurrentSession(eventId) {
  const initialRuntimeConfig = await loadRuntimeConfig();
  runtimeConfig = initialRuntimeConfig;
  reconcileEventInviteAccountBoundary(initialRuntimeConfig);
  if (initialRuntimeConfig.storage?.mode !== "supabase") {
    const error = new Error("נדרש חיבור לענן כדי להכין קישור מאובטח.");
    error.code = "EVENT_INVITE_CLOUD_REQUIRED";
    throw error;
  }
  const hadSharedCredentials = Boolean(
    eventShareCredentials(getEvent(eventId))
  );
  let shareRuntimeConfig = initialRuntimeConfig;
  if (!hadSharedCredentials) {
    shareRuntimeConfig = await prepareSharedEventForInvitation(eventId);
  }
  if (shareRuntimeConfig.storage?.mode === "supabase") {
    let openInvite;
    try {
      openInvite = await ensureCompatibleOpenEventInvite(
        shareRuntimeConfig,
        eventId
      );
    } catch (error) {
      if (
        hadSharedCredentials &&
        ["EVENT_INVITE_NOT_READY", "EVENT_INVITE_NOT_ALLOWED"].includes(
          String(error?.code ?? "")
        )
      ) {
        // Older personal copies can retain share credentials even when their
        // canonical snapshot was never published. Repair that exceptional
        // case once, after the invite server has confirmed it is necessary.
        shareRuntimeConfig = await prepareSharedEventForInvitation(eventId, {
          publishExisting: true
        });
        openInvite = await ensureCompatibleOpenEventInvite(
          shareRuntimeConfig,
          eventId
        );
      } else {
        throw error;
      }
    }
    const sharedEvent = getEvent(eventId);
    rememberEventOpenInviteToken(eventId, openInvite.token);
    if (!attachOpenInviteToken(sharedEvent, openInvite.token)) {
      throw new Error("Open event invitation could not be attached");
    }
  }
  await prepareReferralForEventInvite();
  return eventInviteUrl(eventId);
}

async function ensureCompatibleOpenEventInvite(config, eventId) {
  try {
    return await ensureOpenEventInvite(
      config,
      eventId,
      eventOpenInviteCandidateForServer(getEvent(eventId)) ?? ""
    );
  } catch (error) {
    // Compatibility with an older server: recover a valid share link when
    // the active raw token was lost during a device or account transition.
    if (error?.code !== "EVENT_INVITE_ACTIVE_REQUIRES_ROTATION") throw error;
    return rotateOpenEventInvite(config, eventId);
  }
}

function eventInviteAuthRefreshRequired(error) {
  const code = String(error?.code ?? "").trim();
  return Boolean(
    Number(error?.status ?? 0) === 401 ||
    [
      "AUTH_REQUIRED",
      "CLOUD_STATE_AUTH_EXPIRED",
      "SHARED_EVENT_ACCOUNT_REQUIRED"
    ].includes(code)
  );
}

async function prepareSharedEventForInvitation(
  eventId,
  { publishExisting = false } = {}
) {
  const event = getEvent(eventId);
  if (!event) throw new Error("Event not found");
  const shareRuntimeConfig = await loadRuntimeConfig();
  runtimeConfig = shareRuntimeConfig;
  reconcileEventInviteAccountBoundary(shareRuntimeConfig);
  if (shareRuntimeConfig.storage?.mode === "supabase") {
    const existingCredentials = eventShareCredentials(event);
    ensureEventShareCredentials(event);
    if (!existingCredentials || publishExisting) {
      try {
        state = await saveSharedEventState(shareRuntimeConfig, state, eventId);
      } catch (error) {
        if (!existingCredentials) {
          delete event[EVENT_SPACE_ID_FIELD];
          delete event[EVENT_SPACE_KEY_FIELD];
        }
        throw error;
      }
    }
  }
  const accountSave = await saveSharedState(state, { awaitCloud: true });
  if (!accountSave?.ok || accountSave?.pending) {
    const error = new Error("האירוע עדיין מסתנכרן. כדאי לנסות שוב בעוד רגע.");
    error.code = "EVENT_INVITE_NOT_READY";
    error.retryable = true;
    error.cachedInviteFallbackAllowed = Boolean(
      accountSave?.ok && accountSave?.pending
    );
    if (accountSave?.error) error.cause = accountSave.error;
    throw error;
  }
  return shareRuntimeConfig;
}

async function rotateCurrentEventInvite(eventId) {
  const event = getEvent(eventId);
  if (!event || !canCurrentParticipantEdit(event)) {
    notice = "אין לך הרשאה להחליף את קישור ההצטרפות.";
    render();
    return;
  }

  let replacementCreated = false;
  try {
    const inviteRuntimeConfig = await loadRuntimeConfig();
    runtimeConfig = inviteRuntimeConfig;
    const replacement = await rotateOpenEventInvite(
      inviteRuntimeConfig,
      eventId
    );
    replacementCreated = true;
    rememberEventOpenInviteToken(eventId, replacement.token);
    if (!attachOpenInviteToken(event, replacement.token)) {
      throw new Error("Open event invitation could not be attached");
    }
    const saveResult = await saveSharedState(state, { awaitCloud: true });
    markEventShareVerified(event, replacement.token, "server");
    if (!saveResult?.ok || saveResult?.pending) {
      const error = saveResult?.error instanceof Error
        ? saveResult.error
        : new Error("Replacement invitation is still syncing");
      error.code ||= "EVENT_INVITE_SAVE_PENDING";
      throw error;
    }
    notice = "הקישור הישן בוטל וקישור חדש מוכן לשיתוף.";
  } catch (error) {
    emitOperationFailure("event_invite", { screen: "invite", error });
    notice = replacementCreated
      ? "הקישור הוחלף, אבל השמירה במכשיר לא הושלמה. אפשר לשתף אותו עכשיו או לנסות שוב."
      : "לא הצלחנו להחליף את הקישור כרגע. הקישור הקיים לא השתנה.";
  }
  render();
}

async function copyInviteLink(eventId) {
  if (eventSharePreparationPromises.has(`copy:${eventId}`)) return;
  const request = (async () => {
    try {
      const inviteUrl = await prepareEventShare(eventId);
      await copyText(inviteUrl, "קישור ההזמנה הועתק.");
      emitProductMetric("invite_shared", { screen: "invite" });
    } catch (error) {
      emitOperationFailure("event_invite", { screen: "invite", error });
      notice = eventInvitePreparationNotice(
        error,
        "לא הצלחנו להכין את קישור ההזמנה כרגע. נסו שוב בעוד רגע."
      );
      render();
    }
  })();
  eventSharePreparationPromises.set(`copy:${eventId}`, request);
  try {
    await request;
  } finally {
    eventSharePreparationPromises.delete(`copy:${eventId}`);
  }
}

function currentEventOpenInviteToken(event) {
  const eventId = String(event?.id ?? "");
  const scope = openInviteTokenScope(runtimeConfig, event);
  if (!eventId || !scope) return null;
  const memoryRecord = eventOpenInviteRuntimeTokens.get(eventId);
  if (memoryRecord?.storageKey === scope.storageKey && memoryRecord.token) {
    return memoryRecord.token;
  }
  if (memoryRecord) eventOpenInviteRuntimeTokens.delete(eventId);

  const storedRecord = loadVerifiedOpenInviteToken(runtimeConfig, event);
  if (storedRecord) {
    eventOpenInviteRuntimeTokens.set(eventId, storedRecord);
    return storedRecord.token;
  }
  return null;
}

function rememberEventOpenInviteToken(eventId, token) {
  const event = getEvent(eventId);
  const normalizedToken = eventOpenInviteToken({ openInviteToken: token });
  const scope = openInviteTokenScope(runtimeConfig, event);
  if (!event || !scope || !normalizedToken) return false;
  const storedRecord = saveVerifiedOpenInviteToken(
    runtimeConfig,
    event,
    normalizedToken
  );
  eventOpenInviteRuntimeTokens.set(eventId, storedRecord ?? {
    ...scope,
    token: normalizedToken,
    verifiedAt: new Date().toISOString()
  });
  return true;
}

function eventOpenInviteCandidateForServer(event) {
  return (
    currentEventOpenInviteToken(event) ||
    eventOpenInviteToken(event) ||
    loadLegacyOpenInviteCandidate(event) ||
    ""
  );
}

function eventInvitePreparationNotice(error, fallback) {
  if (eventInviteAuthRefreshRequired(error)) {
    return "החיבור לחשבון פג. התחברו מחדש ונסו שוב.";
  }
  if (!isEventInviteError(error)) return fallback;
  const message = String(error?.message ?? "").trim();
  return message || fallback;
}

async function shareExpenseParticipantInvite(eventId, method) {
  if (!expenseDraft || expenseDraft.eventId !== eventId) return;
  const dialogScrollTop = app.querySelector(".expense-modal")?.scrollTop ?? 0;
  const action = method === "share" ? "expense-share-invite" : "expense-copy-invite";

  if (method === "share") {
    await shareInviteOnWhatsApp(eventId);
  } else {
    await copyInviteLink(eventId);
  }

  if (!expenseDraft || expenseDraft.eventId !== eventId) return;
  expenseDraft.participantInviteMessage = notice || (
    method === "share" ? "אפשרויות השיתוף נפתחו." : "קישור ההזמנה הועתק."
  );
  notice = "";
  render();
  reactivateDialogAfterRender(
    ".expense-modal",
    `[data-action="${action}"]`,
    dialogScrollTop
  );
}

async function shareInviteOnWhatsApp(eventId) {
  const event = getEvent(eventId);
  if (!event) return;

  const nativeShare =
    typeof globalThis.SogrimNative?.share === "function"
      ? globalThis.SogrimNative.share.bind(globalThis.SogrimNative)
      : null;
  const shareWindow = nativeShare ? null : openPendingShareWindow();

  try {
    const inviteUrl = await prepareEventShare(eventId);
    const message = `מצטרפים לאירוע "${event.name}" בסוגרים חשבון:\n${inviteUrl}`;
    if (nativeShare) {
      try {
        const shared = await nativeShare({
          title: "הצטרפות לאירוע בסוגרים חשבון",
          text: `מצטרפים לאירוע "${event.name}" וסוגרים יחד את החשבון.`,
          url: inviteUrl,
          dialogTitle: "שיתוף הזמנה"
        });
        if (shared) {
          emitProductMetric("invite_shared", { screen: "invite" });
          notice = "פתחתי את אפשרויות השיתוף עם קישור ההצטרפות.";
          render();
          return;
        }
      } catch {
        // Continue to the WhatsApp fallback below.
      }
    }

    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    emitProductMetric("invite_shared", { screen: "invite" });

    if (shareWindow && !shareWindow.closed) {
      shareWindow.location.replace(url);
    } else {
      window.location.assign(url);
      return;
    }
    notice = "פתחתי הודעת וואטסאפ עם קישור ההצטרפות.";
  } catch (error) {
    emitOperationFailure("share", { screen: "invite", error });
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
    currency: event.currency,
    participantAliases: event.participantAliases,
    directSettlementTransfers: usesDirectSettlementTransfers(event)
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
    currency: event.currency,
    participantAliases: event.participantAliases,
    directSettlementTransfers: usesDirectSettlementTransfers(event)
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
    currency: event.currency,
    participantAliases: event.participantAliases,
    directSettlementTransfers: usesDirectSettlementTransfers(event)
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
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    notice = successMessage;
    copied = true;
  } catch {
    notice = `אפשר להעתיק ידנית: ${text}`;
  }
  render();
  return copied;
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

async function restoreStateBackup(restoredState) {
  const previousState = state;
  const previousScreen = screen;
  state = bindStateBackupToCurrentParticipant(restoredState, state);
  screen = { name: "home" };
  newEventDraft = null;
  joinEventDraft = null;
  expenseDraft = null;
  eventDialog = null;
  groupDraft = null;
  editingGroupDraft = null;
  mergeParticipantsDraft = null;
  notice = "משחזרים את הגיבוי…";
  render();
  const result = await persistState({ awaitCloud: true });
  if (!result?.ok) {
    state = previousState;
    screen = previousScreen;
    notice = "לא הצלחנו לשחזר את הגיבוי. הנתונים הקיימים נשארו ללא שינוי.";
    render();
    return result;
  }
  notice = result?.pending
    ? "הגיבוי שוחזר במכשיר ויסתנכרן אוטומטית."
    : "הגיבוי שוחזר.";
  render();
  return result;
}

async function saveProfileFromDraft() {
  const displayName = normalizeProfileName(profileNameDraft);
  if (!isFullProfileName(displayName)) {
    profileError = "צריך להזין שם פרטי ושם משפחה כדי להמשיך.";
    render();
    window.requestAnimationFrame(() => {
      document
        .querySelector('[data-action="profile-name"]')
        ?.focus({ preventScroll: true });
    });
    return;
  }

  if (screen.name === "profile" && friendNetwork.status === "ready") {
    const currentUsername = currentFriendUsername();
    const usernameInput = String(profileUsernameDraft ?? "").trim();
    const username = normalizeUsername(usernameInput);
    if (!username) {
      profileUsernameError = usernameValidationMessage(profileUsernameDraft);
      render();
      window.requestAnimationFrame(() => {
        document
          .querySelector('[data-action="profile-username"]')
          ?.focus({ preventScroll: true });
      });
      return;
    }

    if (username && username !== currentUsername) {
      try {
        runtimeConfig = await loadRuntimeConfig();
        await setFriendUsername(runtimeConfig, username);
        profileUsernameDraft = username;
        profileUsernameError = "";
      } catch (error) {
        profileUsernameError = profileUsernameErrorMessage(error);
        render();
        window.requestAnimationFrame(() => {
          document
            .querySelector('[data-action="profile-username"]')
            ?.focus({ preventScroll: true });
        });
        return;
      }
    }
  }

  const invitedEventId = parseInviteEventId(window.location.href);
  const profileUpdatedAt = new Date().toISOString();
  const nextState = ensureNamedParticipant(
    state,
    {
      id: localProfile?.participantId ?? makeId("user"),
      displayName,
      avatarPreset: profileAvatarDraft,
      avatarImage: profileAvatarImageDraft,
      avatarImageUpdatedAt: profileUpdatedAt,
      profileUpdatedAt,
      authProvider: localProfile?.authProvider,
      authSubject: localProfile?.authSubject,
      email: localProfile?.email
    },
    invitedEventId,
    { reactivateInactive: false }
  );
  const participant = nextState.participants.find(
    (item) => item.id === nextState.currentParticipantId
  );

  state = nextState;
  localProfile = saveLocalProfile({
    participantId: state.currentParticipantId,
    displayName: participant?.displayName ?? displayName,
    avatarImage:
      normalizeAvatarImage(participant?.avatarImage) ||
      profileAvatarImageDraft,
    avatarImageUpdatedAt:
      participant?.avatarImageUpdatedAt || profileUpdatedAt,
    avatarPreset:
      normalizeAvatarPreset(participant?.avatarPreset) ||
      profileAvatarDraft,
    profileUpdatedAt: participant?.profileUpdatedAt ?? profileUpdatedAt,
    authProvider: participant?.authProvider ?? localProfile?.authProvider,
    authSubject: participant?.authSubject ?? localProfile?.authSubject,
    email: participant?.email ?? localProfile?.email
  });
  profileNameDraft = localProfile.displayName;
  profileError = "";
  profileNameEditing = false;
  profileUsernameEditing = false;
  screen = invitedEventId && getEvent(invitedEventId)
    ? { name: "event", eventId: invitedEventId }
    : friendCodeDraft
      ? { name: "groups", tab: "people" }
      : { name: "home" };
  notice = `נכנסת בתור ${participantName(state.currentParticipantId)}.`;

  const [profileSaveResult] = await Promise.allSettled([
    globalThis.SogrimAccountProfile?.updateProfile?.({
      displayName,
      username: profileUsernameDraft,
      avatarImage: profileAvatarImageDraft
    }) ?? globalThis.SogrimAccountProfile?.updateDisplayName?.(displayName)
  ]);
  await saveSharedState(state);
  if (
    (
      profileSaveResult.status === "rejected" ||
      profileSaveResult.value === false
    ) &&
    localProfile?.authSubject
  ) {
    notice = "השם נשמר באפליקציה. עדכון החשבון יושלם כשהחיבור יחזור.";
  }
  await refreshFriendNetwork({ preserveNotice: true });
  appHistoryDepth = 0;
  lastNavigationViewKey = "";
  render();
}

function startExpenseDraft(eventId, expenseId = null, trigger = document.activeElement) {
  const event = getEvent(eventId);
  const existingExpense = event.expenses.find((expense) => expense.id === expenseId);

  if (!existingExpense) {
    emitProductMetric("expense_started", { screen: "event" });
  }

  rememberDialogReturnFocus(trigger);

  if (existingExpense) {
    expenseDraft = {
      id: existingExpense.id,
      eventId,
      mode: "single",
      flowStep: "review",
      historyBaseDepth: appHistoryDepth,
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
      notes: existingExpense.notes ?? "",
      attachmentImage: existingExpense.attachmentImage ?? "",
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

  let rememberedDraft = restoreExpenseDraft(event);
  if (
    rememberedDraft?.mode === "items" &&
    eventTypeConfig(event.eventType).id !== EVENT_TYPE_RESTAURANT
  ) {
    clearRememberedExpenseDraft(event.id);
    rememberedDraft = null;
  }
  if (rememberedDraft) {
    if (
      eventTypeConfig(event.eventType).id === EVENT_TYPE_RESTAURANT &&
      rememberedDraft.restaurantEqualSplit &&
      rememberedDraft.mode !== "items"
    ) {
      const equalItem = createQuickItemDraft(
        QUICK_ITEM_CUSTOM_PARTICIPANTS,
        activeEventParticipants(event).map((participant) => participant.id)
      );
      equalItem.amount = rememberedDraft.total ?? "";
      rememberedDraft.mode = "items";
      rememberedDraft.quickStage = "items";
      rememberedDraft.quickPurpose = "split";
      rememberedDraft.quickItems = [equalItem];
    }
    expenseDraft = {
      ...rememberedDraft,
      flowStep: "amount",
      historyBaseDepth: appHistoryDepth
    };
    render();
    activateExpenseEntryDialog();
    return;
  }

  const defaultPayerId = defaultExpensePayerId(event);
  expenseDraft = {
    eventId,
    mode: defaultExpenseModeForEvent(event.eventType),
    flowStep: "amount",
    historyBaseDepth: appHistoryDepth,
    name: "",
    total: "",
    occurredOn: todayInputValue(),
    notes: "",
    attachmentImage: "",
    payers: [createPayerDraft(defaultPayerId)],
    sharedByParticipantIds: activeEventParticipants(event).map(
      (participant) => participant.id
    ),
    quickPurpose: "split",
    quickStage:
      eventTypeConfig(event.eventType).id === EVENT_TYPE_RESTAURANT ? "method" : "items",
    quickPayerId: defaultPayerId,
    quickItems: [createQuickItemDraft(defaultPayerId)],
    restaurantEqualSplit: false,
    inlinePayerGuestIndex: null,
    inlinePayerGuestName: "",
    quickInlineGuestIndex: null,
    quickInlineGuestName: "",
    error: ""
  };
  render();
  activateExpenseEntryDialog();
}

function defaultExpensePayerId(event) {
  const activeParticipantIds = activeEventParticipants(event).map(
    (participant) => participant.id
  );
  if (activeParticipantIds.includes(state.currentParticipantId)) {
    return state.currentParticipantId;
  }
  return activeParticipantIds[0] ?? event?.participantIds?.[0] ?? state.currentParticipantId;
}

function activateExpenseEntryDialog() {
  const event = getEvent(expenseDraft?.eventId);
  const isRestaurantItems =
    expenseDraft?.mode === "items" &&
    eventTypeConfig(event?.eventType).id === EVENT_TYPE_RESTAURANT;
  const quickStage = normalizeRestaurantQuickStage(expenseDraft?.quickStage);
  const focusSelector = expenseDraft?.mode === "items"
    ? isRestaurantItems && quickStage === "method"
      ? '[data-action="restaurant-split-mode"][data-mode="equal"]'
      : isRestaurantItems && quickStage === "review"
        ? '[data-action="restaurant-quick-stage"][data-stage="payer"]'
        : isRestaurantItems && quickStage === "payer"
          ? '[data-action="quick-expense-payer"]'
          : '[data-action="quick-item-amount"][data-index="0"]'
    : expenseFlowFocusSelector(normalizeExpenseFlowStep(expenseDraft?.flowStep));
  activateDialog(".expense-modal", focusSelector);
  requestAnimationFrame(() => {
    const dialog = app.querySelector(".expense-step-modal");
    const scrollSurface = dialog?.querySelector(".expense-flow-body");
    if (scrollSurface) scrollSurface.scrollTop = 0;
  });
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
  if (!key) return;

  try {
    if (!serializedDraft) {
      window.localStorage.removeItem(key);
      return;
    }
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
      participantIds: activeEventParticipants(event).map(
        (participant) => participant.id
      ),
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

  const renderedNameInput = app.querySelector('[data-action="expense-name"]');
  const currentName = String(
    renderedNameInput instanceof HTMLInputElement
      ? renderedNameInput.value
      : expenseDraft.name ?? ""
  ).trim();
  expenseDraft.name = currentName;
  if (!currentName || EXPENSE_TEMPLATES.includes(currentName)) {
    expenseDraft.name = template;
  }
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
  const participants = event ? activeEventParticipants(event) : state.participants;
  const unusedParticipant = participants.find(
    (participant) => !usedPayerIds.has(participant.id)
  );

  return unusedParticipant?.id ?? participants[0]?.id ?? state.currentParticipantId;
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

  const values = expenseDetailsSummaryValues(
    event,
    expenseParticipantsForCurrentDraft(event)
  );
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
    expenseParticipantsForCurrentDraft(event)
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

async function saveExpense(eventId, { continueAdding = false } = {}) {
  if (!expenseDraft || expenseSaveInProgress) return;
  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    expenseDraft.error = editBlockedMessage(event);
    render();
    reactivateDialogAfterRender(
      ".expense-modal",
      '[data-action="cancel-expense"]'
    );
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
      notes: String(expenseDraft.notes ?? "").trim().slice(0, 500),
      attachmentImage: String(expenseDraft.attachmentImage ?? ""),
      updatedAt: new Date().toISOString()
    };

    const errors = validateExpense(expense, { participantIds: event.participantIds });
    if (errors.length) {
      expenseDraft.error = errors[0];
      render();
      reactivateDialogAfterRender(".expense-modal", "#expense-form-error");
      return;
    }

    const wasNewExpense = !expenseDraft.id;
    const previousTransfers = [...(event.transfers ?? [])];
    if (!wasNewExpense) {
      state = updateExpense(state, eventId, expense);
    } else {
      event.expenses.unshift(expense);
    }
    recordEventActivity(
      eventId,
      wasNewExpense ? "expense-created" : "expense-updated",
      { entityId: expense.id, label: expense.name },
      expense.updatedAt
    );
    reconcileEventTransfers(getEvent(eventId), previousTransfers);
    const saveRequest = persistState({
      awaitCloud: true,
      forceSharedEventIds: [eventId]
    });
    const saveResult = await saveRequest;
    if (!saveResult?.ok) {
      if (saveResult?.reverted && wasNewExpense) {
        delete expenseDraft.id;
        delete expenseDraft.createdByParticipantId;
      } else {
        expenseDraft.id = expense.id;
        expenseDraft.createdByParticipantId = expense.createdByParticipantId;
      }
      expenseDraft.error =
        "ההוצאה לא נשמרה כדי למנוע הבדל בין חברי הקבוצה. בדקו את החיבור ולחצו שוב על שמירה.";
      render();
      reactivateDialogAfterRender(".expense-modal", "#expense-form-error");
      return;
    }

    publishReferralActivityAfterSave(
      saveResult,
      eventId,
      wasNewExpense ? "expense-created" : "expense-updated"
    );
    if (wasNewExpense) {
      emitProductMetric("expense_created", { screen: "expense" });
      publishEventActivityAfterSave(
        saveResult,
        eventId,
        "expense-created",
        expense.id
      );
    }
    if (wasNewExpense) clearRememberedExpenseDraft(eventId);

    if (continueAdding && wasNewExpense) {
      continueExpenseEntry(event);
      return;
    }

    const rewindSteps = expenseDialogRewindSteps();
    expenseDraft = null;
    closeDialogWithHistory(rewindSteps);
  } catch (error) {
    if (expenseDraft) {
      expenseDraft.error = error instanceof Error ? error.message : "אי אפשר לשמור את ההוצאה.";
      render();
      reactivateDialogAfterRender(".expense-modal", "#expense-form-error");
    }
  } finally {
    expenseSaveInProgress = false;
  }
}

function continueExpenseEntry(event) {
  const previousDraft = expenseDraft;
  const activeParticipantIds = new Set(
    activeEventParticipants(event).map((participant) => participant.id)
  );
  const payerIds = [
    ...new Set(
      previousDraft.payers
        .map((payer) => payer.participantId)
        .filter((participantId) => activeParticipantIds.has(participantId))
    )
  ];
  const defaultPayerId = defaultExpensePayerId(event);
  const nextPayerIds = payerIds.length ? payerIds : [defaultPayerId];

  expenseDraft = {
    eventId: event.id,
    mode: "single",
    flowStep: "amount",
    historyBaseDepth: previousDraft.historyBaseDepth,
    name: "",
    total: "",
    occurredOn: previousDraft.occurredOn || todayInputValue(),
    payers: nextPayerIds.map(createPayerDraft),
    sharedByParticipantIds: previousDraft.sharedByParticipantIds.filter((participantId) =>
      activeParticipantIds.has(participantId)
    ),
    quickPurpose: "split",
    quickStage: "items",
    quickPayerId: nextPayerIds[0],
    quickItems: [createQuickItemDraft(nextPayerIds[0])],
    restaurantEqualSplit: false,
    inlinePayerGuestIndex: null,
    inlinePayerGuestName: "",
    quickInlineGuestIndex: null,
    quickInlineGuestName: "",
    savedInSession: (previousDraft.savedInSession ?? 0) + 1,
    error: ""
  };

  restoringBrowserHistory = true;
  try {
    render();
  } finally {
    restoringBrowserHistory = false;
  }
  replaceBrowserHistoryState();
  activateExpenseEntryDialog();
}

async function saveQuickExpenses(eventId) {
  if (!expenseDraft || expenseSaveInProgress) return;
  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    expenseDraft.error = editBlockedMessage(event);
    render();
    return;
  }

  expenseSaveInProgress = true;
  const previousState = cloneNavigationValue(state);
  try {
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

    const previousTransfers = [...(event.transfers ?? [])];
    event.expenses.unshift(...result.expenses);
    for (const expense of result.expenses) {
      recordEventActivity(
        eventId,
        "expense-created",
        { entityId: expense.id, label: expense.name },
        expense.updatedAt
      );
    }
    reconcileEventTransfers(event, previousTransfers);
    const saveResult = await persistState({
      awaitCloud: true,
      forceSharedEventIds: [eventId]
    });
    if (!saveResult?.ok) {
      state = previousState;
      expenseDraft.error =
        "הפריטים לא נשמרו כדי למנוע הבדל בין חברי האירוע. בדקו את החיבור ונסו שוב.";
      render();
      reactivateDialogAfterRender(".expense-modal", "#expense-form-error");
      return saveResult;
    }

    publishReferralActivityAfterSave(saveResult, eventId, "expense-created");
    const firstExpense = result.expenses[0];
    if (firstExpense) {
      emitProductMetric("expense_created", { screen: "expense" });
      publishEventActivityAfterSave(
        saveResult,
        eventId,
        "expense-created",
        firstExpense.id
      );
    }
    clearRememberedExpenseDraft(eventId);
    const rewindSteps = expenseDialogRewindSteps();
    expenseDraft = null;
    notice = `${formatCount(result.expenses.length, "פריט נוסף", "פריטים נוספו")} לאירוע.`;
    closeDialogWithHistory(rewindSteps);
    return saveResult;
  } catch (error) {
    state = previousState;
    if (expenseDraft) {
      expenseDraft.error = "לא הצלחנו לשמור את הפריטים. אפשר לנסות שוב.";
      render();
      reactivateDialogAfterRender(".expense-modal", "#expense-form-error");
    }
    return { ok: false, error };
  } finally {
    expenseSaveInProgress = false;
  }
}

async function deleteExpense(eventId, expenseId) {
  const requestId = `${eventId}:${expenseId}`;
  if (expenseDeleteRequests.has(requestId)) return;

  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    notice = editBlockedMessage(event);
    render();
    return;
  }

  expenseDeleteRequests.add(requestId);
  const deletedExpense = event.expenses.find((expense) => expense.id === expenseId);
  const previousTransfers = [...(event.transfers ?? [])];
  state = removeExpense(state, eventId, expenseId);
  if (deletedExpense) {
    recordEventActivity(eventId, "expense-deleted", {
      entityId: deletedExpense.id,
      label: deletedExpense.name
    });
  }
  reconcileEventTransfers(getEvent(eventId), previousTransfers);
  render();
  try {
    const saveResult = await persistState({ awaitCloud: true });
    if (!saveResult?.ok) {
      state = loadState();
      notice =
        "המחיקה לא נשמרה כדי למנוע הבדל בין חברי האירוע. בדקו את החיבור ונסו שוב.";
      render();
    }
  } finally {
    expenseDeleteRequests.delete(requestId);
  }
}

function prepareSettlement(eventId) {
  const event = getEvent(eventId);
  prepareEventTransfers(event);
  persistState();
  settlementCloseConfirmation = null;
  screen = { name: "settlement", eventId };
  emitProductMetric("settlement_opened", { screen: "settlement" });
  render();
}

function requestCloseCurrentEvent(eventId) {
  const event = getEvent(eventId);
  if (!event) return;

  const pendingTransfers = eventSettlementTransfers(event).filter(
    (transfer) => transfer.status !== "paid"
  );
  if (!pendingTransfers.length || isEventClosed(event)) {
    void closeCurrentEvent(eventId);
    return;
  }

  settlementCloseConfirmation = { eventId };
  render();
  activateDialog(
    ".settlement-close-confirmation",
    '[data-action="confirm-close-event"]'
  );
}

async function chooseEventStatusFromMenu(eventId, nextStatus, trigger) {
  if (!eventStatusMenu || eventStatusMenu.eventId !== eventId) return;

  await setEventStatusFromHome(eventId, nextStatus, trigger);
  if (importantActionDialog || !eventStatusMenu) return;

  eventStatusMenu = null;
  closeDialogWithHistory();
}

async function setEventStatusFromHome(eventId, nextStatus, trigger) {
  const event = getEvent(eventId);
  if (!event || !["open", "closed"].includes(nextStatus)) return;

  const currentStatus = isEventClosed(event) ? "closed" : "open";
  if (nextStatus === currentStatus) {
    trigger?.blur();
    return;
  }

  if (!canCurrentParticipantManage(event)) {
    notice = nextStatus === "open"
      ? "רק מנהל יכול לפתוח אירוע מחדש."
      : "רק מנהל יכול לסגור אירוע.";
    render();
    return;
  }

  if (nextStatus === "open") {
    await reopenCurrentEvent(eventId);
    return;
  }

  const settlement = calculateSettlement(
    eventParticipants(event),
    event.expenses,
    settlementOptionsForEvent(event)
  );
  if (settlement.issues.length) {
    notice = "אי אפשר לסגור את האירוע עד שמתקנים את ההוצאות שסומנו לבדיקה.";
    render();
    return;
  }

  prepareEventTransfers(event);
  const pendingTransfers = event.transfers.filter((transfer) => transfer.status !== "paid");
  if (!pendingTransfers.length) {
    await closeCurrentEvent(eventId, { destination: "home" });
    return;
  }

  const pendingTotal = sumMoneyAmounts(
    pendingTransfers.map((transfer) => transfer.amount)
  );
  const transferDescription = pendingTransfers.length === 1
    ? `נותרה העברה פתוחה בסך ${formatEventMoney(event, pendingTotal)}. עדיין יהיה אפשר לסמן אותה כשולמה אחרי הסגירה.`
    : `נותרו ${pendingTransfers.length} העברות פתוחות בסך ${formatEventMoney(event, pendingTotal)}. עדיין יהיה אפשר לסמן אותן כשולמו אחרי הסגירה.`;

  openImportantActionDialog(
    {
      kind: "close-event-from-home",
      title: `לסגור את "${event.name}"?`,
      description: transferDescription,
      confirmLabel: "סגור אירוע",
      payload: { eventId }
    },
    trigger
  );
}

function cancelSettlementCloseConfirmation() {
  if (!settlementCloseConfirmation) return;
  settlementCloseConfirmation = null;
  renderHistoryFallback();
}

function closeCurrentEvent(eventId, options = {}) {
  const existingRequest = closeEventRequests.get(eventId);
  if (existingRequest) return existingRequest;

  const request = closeCurrentEventNow(eventId, options).finally(() => {
    if (closeEventRequests.get(eventId) === request) {
      closeEventRequests.delete(eventId);
    }
  });
  closeEventRequests.set(eventId, request);
  return request;
}

async function closeCurrentEventNow(eventId, { destination = "settlement" } = {}) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לסגור אירוע.";
    render();
    return { ok: false, reason: "forbidden" };
  }

  if (isEventClosed(event)) {
    settlementCloseConfirmation = null;
    if (destination === "settlement") {
      screen = { name: "settlement", eventId };
    }
    render();
    return { ok: true, unchanged: true };
  }

  const settlement = calculateSettlement(
    eventParticipants(event),
    event.expenses,
    settlementOptionsForEvent(event)
  );
  if (settlement.issues.length) {
    notice = "אי אפשר לסגור את האירוע עד שמתקנים את ההוצאות שסומנו לבדיקה.";
    render();
    return { ok: false, reason: "invalid-expenses" };
  }

  const previousState = cloneNavigationValue(state);
  prepareEventTransfers(event);
  const closedAt = new Date().toISOString();
  state = closeEvent(state, eventId, closedAt);
  const activityId = recordEventActivity(eventId, "event-closed", {}, closedAt);
  settlementCloseConfirmation = null;
  expenseDraft = null;
  eventDialog = null;
  notice = "האירוע נסגר וננעל לעריכה.";
  const saveRequest = persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  screen = destination === "home"
    ? { name: "home" }
    : { name: "settlement", eventId };
  render();

  let result;
  try {
    result = await saveRequest;
  } catch (error) {
    result = { ok: false, error };
  }
  if (!result?.ok && !result?.pending) {
    state = previousState;
    notice = result?.error?.code === "SHARED_EVENT_MEMBERSHIP_REVOKED"
      ? "אין לחשבון הרשאה לסגור את האירוע. רעננו את המסך."
      : "לא הצלחנו לסגור את האירוע. לא בוצע שינוי ואפשר לנסות שוב.";
    render();
    return result;
  }

  notice = result?.pending
    ? "האירוע נסגר. הסנכרון עם שאר המשתתפים יושלם אוטומטית."
    : "האירוע נסגר וננעל לעריכה.";
  publishEventActivityAfterSave(Promise.resolve(result), eventId, "event-closed", activityId);
  render();
  return result;
}

function requestReopenCurrentEvent(eventId, trigger) {
  const event = getEvent(eventId);
  if (!event) return;
  const paidCount = (event.transfers ?? []).filter(
    (transfer) => transfer.status === "paid"
  ).length;
  openImportantActionDialog(
    {
      kind: "reopen-event",
      label: "פתיחה מחדש",
      title: `לפתוח מחדש את "${event.name}"?`,
      description: paidCount
        ? `${formatCount(paidCount, "העברה שסומנה", "העברות שסומנו")} יושפעו מהבחירה.`
        : "האירוע יחזור למצב ביניים ויהיה אפשר להוסיף ולערוך הוצאות.",
      confirmLabel: "פתח מחדש",
      payload: { eventId, paymentMode: "keep" }
    },
    trigger
  );
}

async function reopenCurrentEvent(eventId, { resetPayments = false } = {}) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לפתוח אירוע לעריכה.";
    render();
    return { ok: false, reason: "forbidden" };
  }

  const previousState = cloneNavigationValue(state);
  if (resetPayments) {
    const statusUpdatedAt = new Date().toISOString();
    event.transfers = (event.transfers ?? []).map((transfer) => {
      const { markedPaidAt, markedPaidByParticipantId, ...pendingTransfer } = transfer;
      return { ...pendingTransfer, status: "pending", statusUpdatedAt };
    });
  }
  const reopenedAt = new Date().toISOString();
  state = reopenEvent(state, eventId, reopenedAt);
  recordEventActivity(eventId, "event-reopened", {}, reopenedAt);
  settlementCloseConfirmation = null;
  notice = "פותח את האירוע ושומר…";
  render();
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (result?.ok === false) {
    state = previousState;
    notice = "האירוע לא נפתח כי הסנכרון לא זמין. לא בוצע שינוי.";
  } else {
    notice = resetPayments
      ? "האירוע נפתח מחדש וכל סימוני התשלום אופסו."
      : "האירוע נפתח מחדש והתשלומים שבוצעו נשמרו.";
  }
  render();
  return result;
}

function prepareEventTransfers(event) {
  if (!event) return;

  reconcileEventTransfers(event, event.transfers);
}

function reconcileEventTransfers(event, previousTransfers = []) {
  if (!event) return;
  const result = reconcileSettlementTransfers(
    eventParticipants(event),
    event.expenses,
    previousTransfers,
    settlementOptionsForEvent(event)
  );
  event.transfers = result.transfers;
}

async function toggleEventLock(eventId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לנעול או לפתוח עריכה.";
    render();
    return;
  }
  const previousState = cloneNavigationValue(state);
  const statusUpdatedAt = new Date().toISOString();
  const opening = isEventClosed(event);
  if (opening) {
    state = reopenEvent(state, eventId, statusUpdatedAt);
    recordEventActivity(eventId, "event-reopened", {}, statusUpdatedAt);
  } else {
    prepareEventTransfers(event);
    state = closeEvent(state, eventId, statusUpdatedAt);
    recordEventActivity(eventId, "event-closed", {}, statusUpdatedAt);
    expenseDraft = null;
  }
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (!result?.ok) {
    state = previousState;
    notice = result?.error?.code === "SHARED_EVENT_MEMBERSHIP_REVOKED"
      ? "הגישה שלך לאירוע בוטלה. רעננו את המסך."
      : opening
        ? "לא הצלחנו לפתוח את האירוע. לא בוצע שינוי."
        : "לא הצלחנו לנעול את האירוע. לא בוצע שינוי.";
  } else {
    notice = opening
      ? "האירוע נפתח לעריכה ונשמר."
      : "האירוע ננעל לעריכה ונשמר.";
  }
  render();
  reactivateDialogAfterRender(
    ".event-modal",
    '[data-action="toggle-lock"]'
  );
  return result;
}

async function toggleAdminEditMode(eventId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לשנות הרשאות עריכה.";
    render();
    return;
  }

  return setEventManagementMode(
    eventId,
    event.adminsCanEditOnly
      ? EVENT_MANAGEMENT_COLLABORATIVE
      : EVENT_MANAGEMENT_CENTRALIZED
  );
}

async function leaveCurrentEvent(eventId) {
  const event = getEvent(eventId);
  if (!canLeaveEvent(state, eventId, state.currentParticipantId)) {
    notice = "אי אפשר לעזוב כשאתה המנהל היחיד. קודם מעבירים את הניהול למשתתף אחר.";
    render();
    return { ok: false, mode: "permission" };
  }

  const previousState = cloneNavigationValue(state);
  const previousScreen = cloneNavigationValue(screen);
  state = leaveEvent(state, eventId, state.currentParticipantId);
  recordEventActivity(eventId, "participant-left", {
    subjectParticipantId: state.currentParticipantId
  });
  expenseDraft = null;
  eventDialog = null;
  screen = { name: "home" };
  notice = `מסיים את העזיבה מ־"${event.name}"…`;
  render();
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (!result?.ok && !result?.pending) {
    state = previousState;
    screen = previousScreen;
    notice = "לא הצלחנו להשלים את העזיבה. לא בוצע שינוי ואפשר לנסות שוב.";
    render();
    return result;
  }
  notice = result?.pending
    ? `העזיבה מ־"${event.name}" נשמרה במכשיר ותושלם אוטומטית כשהחיבור יחזור.`
    : `עזבת את "${event.name}".`;
  render();
  return result;
}

async function deleteCurrentEvent(eventId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול למחוק אירוע.";
    render();
    return { ok: false, mode: "permission" };
  }

  const previousState = state;
  state = deleteEvent(state, eventId);
  expenseDraft = null;
  eventDialog = null;
  screen = { name: "home" };
  notice = `האירוע "${event.name}" נמחק.`;
  render();

  const result = await saveSharedState(state, { awaitCloud: true });
  if (!result?.ok && !result?.pending) {
    state = previousState;
    screen = { name: "event", eventId };
    notice = "לא הצלחנו להשלים את מחיקת האירוע. האירוע נשאר שמור ואפשר לנסות שוב.";
    render();
  }

  return result;
}

async function markTransferPaid(transferId, trigger) {
  const event = getEvent(screen.eventId);
  const transfer = event?.transfers.find((item) => item.id === transferId);
  if (!transfer || transfer.status === "paid") return;
  if (!canCurrentParticipantUpdateTransfer(event, transfer)) {
    notice = "רק מי שמעורב בהעברה או מנהל האירוע יכול לעדכן את התשלום.";
    render();
    return;
  }

  const previousState = cloneNavigationValue(state);
  const requestKey = `${event.id}:${transfer.id}`;
  const requestVersion = (transferStatusRequestVersions.get(requestKey) ?? 0) + 1;
  transferStatusRequestVersions.set(requestKey, requestVersion);
  const hadPendingTransfers = event.transfers.some(
    (transfer) => transfer.status !== "paid"
  );
  const markedAt = new Date().toISOString();
  state = updateTransferStatus(state, event.id, transferId, {
    status: "paid",
    participantId: state.currentParticipantId,
    markedAt
  });
  recordEventActivity(event.id, "transfer-paid", {
    entityId: transfer.id,
    fromParticipantId: transfer.fromParticipantId,
    toParticipantId: transfer.toParticipantId
  }, markedAt);
  syncSettlementCloseConfirmation(event.id);
  notice = "שומרים את סימון התשלום…";
  render();
  const saveRequest = persistState({
    awaitCloud: true,
    forceSharedEventIds: [event.id]
  });
  publishReferralActivityAfterSave(saveRequest, event.id, "transfer-paid");
  const result = await saveRequest;
  if (transferStatusRequestVersions.get(requestKey) !== requestVersion) return result;
  transferStatusRequestVersions.delete(requestKey);
  if (!result?.ok && !result?.pending) {
    state = previousState;
    settlementCelebration = null;
    notice = "לא הצלחנו לשמור את סימון התשלום. המצב הקודם נשמר.";
    render();
    return result;
  }

  emitProductMetric("transfer_marked_paid", { screen: "settlement" });
  const updatedEvent = getEvent(event.id);
  const completedAllTransfers = Boolean(
    hadPendingTransfers &&
      updatedEvent?.transfers?.length &&
      updatedEvent.transfers.every((updatedTransfer) => updatedTransfer.status === "paid")
  );
  if (completedAllTransfers) {
    rememberDialogReturnFocus(trigger);
    settlementCelebration = { eventId: event.id };
    notice = "";
    render();
    activateDialog(".settlement-celebration-dialog");
    requestAnimationFrame(() => {
      app
        .querySelector('[data-action="archive-settled-event"]')
        ?.focus({ preventScroll: true });
    });
  } else {
    notice = "ההעברה סומנה כשולמה. אפשר לבטל את הסימון מאותה שורה.";
    render();
  }
  return result;
}

async function markTransferPending(transferId) {
  return markTransfersPending([transferId]);
}

async function markTransfersPending(transferIds) {
  const event = getEvent(screen.eventId);
  const transferIdsToUpdate = new Set(transferIds);
  const transfers = (event?.transfers ?? []).filter(
    (transfer) =>
      transferIdsToUpdate.has(transfer.id) && transfer.status === "paid"
  );
  if (!event || !transfers.length) return;
  if (transfers.some((transfer) => !canCurrentParticipantUpdateTransfer(event, transfer))) {
    notice = "רק מי שמעורב בהעברה או מנהל האירוע יכול לבטל את הסימון.";
    render();
    return;
  }

  const previousState = cloneNavigationValue(state);
  const requestKey = `${event.id}:${transfers.map((transfer) => transfer.id).sort().join(",")}`;
  const requestVersion = (transferStatusRequestVersions.get(requestKey) ?? 0) + 1;
  transferStatusRequestVersions.set(requestKey, requestVersion);
  const markedAt = new Date().toISOString();
  for (const transfer of transfers) {
    state = updateTransferStatus(state, event.id, transfer.id, {
      status: "pending",
      markedAt
    });
  }
  const updatedEvent = getEvent(event.id);
  reconcileEventTransfers(updatedEvent, updatedEvent?.transfers ?? []);
  for (const transfer of transfers) {
    recordEventActivity(event.id, "transfer-pending", {
      entityId: transfer.id,
      fromParticipantId: transfer.fromParticipantId,
      toParticipantId: transfer.toParticipantId
    }, markedAt);
  }
  syncSettlementCloseConfirmation(event.id);
  notice = transfers.length === 1
    ? "מבטלים את סימון התשלום…"
    : "מבטלים את סימוני התשלומים…";
  render();
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [event.id]
  });
  if (transferStatusRequestVersions.get(requestKey) !== requestVersion) return;
  transferStatusRequestVersions.delete(requestKey);
  if (!result?.ok && !result?.pending) {
    state = previousState;
    notice = "לא הצלחנו לבטל את סימון התשלום. המצב הקודם נשמר.";
    render();
    return result;
  }
  notice = result?.pending
    ? "סימון התשלום בוטל."
    : transfers.length === 1
      ? "סימון התשלום בוטל ונשמר."
      : "סימוני התשלומים בוטלו ונשמרו.";
  render();
  return result;
}

async function sendTransferReminder(eventId, transferId) {
  if (paymentReminderBusyId) return;

  const event = getEvent(eventId);
  const transfer = event?.transfers?.find(
    (item) => item.id === transferId
  );
  const eligibility = paymentReminderEligibility(transfer);
  if (!event || !transfer || !eligibility.allowed) {
    notice = "אפשר לשלוח תזכורת רק למשתמש מחובר שחייב לך באירוע.";
    render();
    return;
  }

  const payerName = participantName(transfer.fromParticipantId, event);
  paymentReminderBusyId = transfer.id;
  notice = "";
  render();

  try {
    const result = await sendPaymentReminderWithAccountRecovery(
      event.id,
      transfer.id
    );

    if (result?.ok && result?.delivered > 0) {
      notice = `שלחנו תזכורת ל${payerName}.`;
    } else if (result?.ok && result?.reason === "in-app-only") {
      notice = `התזכורת מחכה ל${payerName} בתוך האפליקציה.`;
    } else if (result?.reason === "notifications-disabled") {
      notice = `${payerName} עדיין לא הפעיל התראות באפליקציה.`;
    } else {
      notice = "לא הצלחנו לשלוח את התזכורת כרגע.";
    }
  } catch (error) {
    if (error?.code === "REMINDER_COOLDOWN") {
      notice = "כבר נשלחה תזכורת לאחרונה. אפשר לנסות שוב מאוחר יותר.";
    } else if (error?.code === "EVENT_NOT_SYNCED") {
      notice = "האירוע עדיין מסתנכרן אצל הצד השני. נסו שוב בעוד רגע.";
    } else if (error?.code === "RECIPIENT_OFFLINE") {
      notice = "אפשר לשלוח תזכורת רק למשתמש מחובר.";
    } else {
      notice = "לא הצלחנו לשלוח את התזכורת כרגע.";
    }
  } finally {
    paymentReminderBusyId = "";
    render();
  }
}

async function sendPaymentReminderWithAccountRecovery(eventId, transferId) {
  const initialConfig = await loadRuntimeConfig();
  runtimeConfig = initialConfig;
  const expectedUserId = String(
    initialConfig?.storage?.account?.userId ?? ""
  ).trim();
  const request = () =>
    sendPaymentReminder(runtimeConfig, { eventId, transferId });

  try {
    const result = await request();
    if (result?.reason !== "unavailable" || !expectedUserId) return result;
  } catch (error) {
    if (!paymentReminderSessionRefreshRequired(error) || !expectedUserId) {
      throw error;
    }
  }

  const refreshedSession = await globalThis.SogrimAccountSession?.refresh?.();
  if (!refreshedSession?.access_token) {
    const error = new Error("Account session is unavailable");
    error.code = "AUTH_REQUIRED";
    throw error;
  }

  const freshConfig = await loadRuntimeConfig();
  const freshUserId = String(
    freshConfig?.storage?.account?.userId ?? ""
  ).trim();
  if (freshUserId !== expectedUserId) {
    const error = new Error("Account changed during reminder recovery");
    error.code = "AUTH_REQUIRED";
    throw error;
  }

  runtimeConfig = freshConfig;
  return request();
}

function paymentReminderSessionRefreshRequired(error) {
  return Boolean(
    Number(error?.status ?? 0) === 401 ||
      String(error?.code ?? "").toUpperCase() === "AUTH_REQUIRED"
  );
}

async function refreshNotificationInbox({ force = false } = {}) {
  if (notificationInboxRequest && !force) return notificationInboxRequest;
  if (notificationInboxRequest && force) {
    notificationInboxRefreshQueued = true;
    const pendingRequest = notificationInboxRequest;
    return pendingRequest.then(() => {
      if (!notificationInboxRefreshQueued) return notificationInbox;
      notificationInboxRefreshQueued = false;
      return refreshNotificationInbox();
    });
  }

  const previousInbox = notificationInbox;
  const previousRenderKey = notificationInboxRenderKey();
  const hasUsableInbox = notificationInbox.status === "ready";
  if (!hasUsableInbox) {
    notificationInbox = {
      ...notificationInbox,
      status: "loading",
      error: ""
    };
    if (["profile", "notifications"].includes(screen.name)) render();
  }

  notificationInboxRequest = (async () => {
    try {
      runtimeConfig = await loadRuntimeConfig();
      const result = await loadNotificationInbox(runtimeConfig);
      notificationInbox = {
        status: "ready",
        available: result.available,
        items: result.items,
        error: ""
      };
    } catch (error) {
      emitOperationDeferred("notification_inbox", {
        screen: "notifications",
        error
      });
      notificationInbox = hasUsableInbox
        ? previousInbox
        : {
            ...notificationInbox,
            status: "error",
            error: "load-failed"
          };
    } finally {
      notificationInboxRequest = null;
      publishNotificationNavigationState();
      if (
        ["profile", "notifications"].includes(screen.name) &&
        previousRenderKey !== notificationInboxRenderKey()
      ) {
        render();
      }
    }
  })();

  return notificationInboxRequest;
}

function notificationInboxRenderKey() {
  return JSON.stringify(notificationInbox);
}

function notificationUnreadCount() {
  return visibleNotificationInboxItems().filter((item) => !item.readAt).length;
}

function visibleNotificationInboxItems() {
  const friendRequests = friendRelationships("pending", "incoming").map((friendship) => {
    const profile = friendProfileForRelationship(friendship);
    const id = `friend-request:${friendship.id}`;
    const name = profile?.display_name?.trim() || "משתמש חדש";
    return {
      id,
      eventId: "",
      kind: "friend-request",
      title: `${name} שלח לך בקשת חברות`,
      body: "אפשר לאשר או לדחות במסך החברים.",
      view: "friends",
      createdAt: friendship.created_at || new Date().toISOString(),
      readAt: readFriendRequestNotificationIds.has(id) ? new Date().toISOString() : ""
    };
  });
  return [...friendRequests, ...notificationInbox.items].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
  );
}

function publishNotificationNavigationState() {
  const unread = notificationUnreadCount();
  app.dataset.notificationUnreadCount = String(unread);
  document.dispatchEvent(
    new CustomEvent("settle-friends:notification-inbox-updated", {
      detail: { unread }
    })
  );
}

async function markAllInboxItemsRead() {
  friendRelationships("pending", "incoming").forEach((friendship) => {
    readFriendRequestNotificationIds.add(`friend-request:${friendship.id}`);
  });
  const unreadIds = notificationInbox.items
    .filter((item) => !item.readAt)
    .map((item) => item.id);
  if (!unreadIds.length) {
    render();
    return;
  }

  const readAt = new Date().toISOString();
  notificationInbox = {
    ...notificationInbox,
    items: notificationInbox.items.map((item) =>
      unreadIds.includes(item.id) ? { ...item, readAt } : item
    )
  };
  render();

  try {
    runtimeConfig = await loadRuntimeConfig();
    const saved = await markAllNotificationsRead(runtimeConfig);
    if (!saved) throw new Error("mark-all-failed");
  } catch {
    notice = "הסימון יסתנכרן בחיבור הבא.";
    await refreshNotificationInbox({ force: true });
  }
}

async function openInboxNotification({ notificationId, eventId, view }) {
  const item = visibleNotificationInboxItems().find(
    (candidate) => candidate.id === notificationId
  );
  if (item && !item.readAt) {
    const readAt = new Date().toISOString();
    notificationInbox = {
      ...notificationInbox,
      items: notificationInbox.items.map((candidate) =>
        candidate.id === notificationId
          ? { ...candidate, readAt }
          : candidate
      )
    };
    loadRuntimeConfig()
      .then((config) => markNotificationRead(config, notificationId))
      .catch(() => {});
  }

  const destination = notificationInboxDestination(item, { eventId, view });
  if (!destination) {
    notice = "לא מצאנו יעד מתאים להתראה הזאת.";
    render();
    return;
  }

  if (destination.name === "groups") {
    if (item?.kind === "friend-request") {
      readFriendRequestNotificationIds.add(item.id);
    }
    notice = "";
    screen = { name: "groups", tab: destination.tab ?? "people" };
    render();
    return;
  }

  if (item?.actionUrl && !getEvent(destination.eventId)) {
    joinEventDraft = { link: item.actionUrl, error: "" };
    notice = "";
    await joinExistingEventFromDraft();
  }

  const event = getEvent(destination.eventId);
  if (!event) {
    notice = "האירוע מההתראה עדיין מסתנכרן. נסה שוב בעוד רגע.";
    render();
    await requestResumeSync({ force: true });
    const syncedEvent = getEvent(destination.eventId);
    if (!syncedEvent) return;
  }

  openInboxNotificationDestination(destination);
}

function openInboxNotificationDestination(destination) {
  notice = "";
  joinEventDraft = null;
  expenseDraft = null;
  eventDialog = null;
  importantActionDialog = null;
  eventStatusMenu = null;
  settlementCelebration = null;
  settlementCloseConfirmation = null;
  screen = {
    name: destination.name === "settlement" ? "settlement" : "event",
    eventId: destination.eventId
  };
  rememberRecentEvent(destination.eventId);

  if (destination.surface === "participants") {
    openEventDialog(destination.eventId, "participants");
    revealInboxNotificationTarget(destination);
    return;
  }

  if (destination.surface === "transfer" && destination.entityId) {
    openSettlementTransferIds.add(destination.entityId);
  }
  render();
  revealInboxNotificationTarget(destination);
}

function revealInboxNotificationTarget(destination) {
  if (!destination.entityId) return;
  requestAnimationFrame(() => {
    if (destination.surface === "participants") {
      const row = app.querySelector(
        `.event-participant-roster-row[data-participant-id="${CSS.escape(destination.entityId)}"]`
      );
      row?.scrollIntoView({ block: "center", behavior: "auto" });
      row?.focus({ preventScroll: true });
      return;
    }

    if (destination.surface === "expense") {
      const row = app.querySelector(
        `.expense-row[data-expense-id="${CSS.escape(destination.entityId)}"]`
      );
      const details = row?.querySelector(".expense-participants-details");
      const trigger = row?.querySelector('[data-action="toggle-expense-participants"]');
      const event = getEvent(destination.eventId);
      const expense = event?.expenses.find(
        (candidate) => candidate.id === destination.entityId
      );
      if (details instanceof HTMLDetailsElement && event && expense) {
        hydrateExpenseParticipants(details, event, expense);
        details.open = true;
        trigger?.setAttribute("aria-expanded", "true");
      }
      row?.scrollIntoView({ block: "center", behavior: "auto" });
      trigger?.focus({ preventScroll: true });
      return;
    }

    if (destination.surface === "transfer") {
      const row = app.querySelector(
        `.transfer-row[data-transfer-id="${CSS.escape(destination.entityId)}"]`
      );
      row?.scrollIntoView({ block: "center", behavior: "auto" });
      row?.focus({ preventScroll: true });
    }
  });
}

function archiveSettledEvent(eventId) {
  const event = getEvent(eventId);
  const allTransfersPaid = Boolean(
    event?.transfers?.length &&
      event.transfers.every((transfer) => transfer.status === "paid")
  );
  if (!event || !allTransfersPaid) return;

  const wasClosed = isEventClosed(event);
  settlementCelebration = null;
  deactivateDialog({ deferFocus: true });
  pendingDialogReturnFocus = null;
  pendingDialogReturnScrollY = 0;

  restoringBrowserHistory = true;
  try {
    if (wasClosed) {
      screen = { name: "home" };
      notice = `"${event.name}" שולם ונשאר באירועים שלך.`;
      render();
    } else {
      void closeCurrentEvent(eventId, { destination: "home" });
    }
  } finally {
    restoringBrowserHistory = false;
  }

  replaceBrowserHistoryState();
  requestAnimationFrame(() => {
    app
      .querySelector('[data-action="new-event"]')
      ?.focus({ preventScroll: true });
  });
}

async function setEventManagementMode(eventId, mode) {
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
  if (event.adminsCanEditOnly === adminsCanEditOnly) {
    return { ok: true, unchanged: true };
  }

  const previousState = state;
  state = setEventAdminsCanEditOnly(state, eventId, adminsCanEditOnly);
  expenseDraft = null;
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (!result?.ok) {
    state = previousState;
    notice = result?.error?.code === "SHARED_EVENT_MEMBERSHIP_REVOKED"
      ? "הגישה שלך לאירוע בוטלה. רעננו את המסך."
      : "לא הצלחנו לשנות את אופן הניהול. לא בוצע שינוי.";
  } else {
    notice = adminsCanEditOnly
      ? "ניהול מרוכז הופעל ונשמר."
      : "ניהול משותף הופעל ונשמר.";
  }
  render();
  requestAnimationFrame(() => {
    app
      .querySelector(
        `[data-action="set-event-management-mode"][data-management-mode="${mode}"]`
      )
      ?.focus({ preventScroll: true });
  });
  return result;
}

async function toggleEventParticipantAdmin(eventId, participantId, enabled) {
  const event = getEvent(eventId);
  const participant = state.participants.find((item) => item.id === participantId);
  const focusSelector =
    `[data-action="toggle-event-participant-admin"]` +
    `[data-participant-id="${participantId}"]`;

  if (
    !event ||
    !participant ||
    !event.participantIds.includes(participantId) ||
    isEventParticipantInactive(event, participantId)
  ) {
    return;
  }

  let message = "";
  if (!canCurrentParticipantManage(event)) {
    message = "רק מנהל אירוע יכול לשנות הרשאות ניהול.";
  } else if (!participantConnectionStatus(participant).connected) {
    message = "אפשר להגדיר כמנהל רק משתמש שמחובר לאפליקציה.";
  } else {
    const adminIds = eventAdminIds(state, event).filter(
      (adminId) =>
        event.participantIds.includes(adminId) &&
        !isEventParticipantInactive(event, adminId)
    );
    if (!enabled && adminIds.includes(participantId) && adminIds.length === 1) {
      message = "חייב להישאר לפחות מנהל אחד באירוע.";
    }
  }

  if (message) {
    eventDialog = eventDialog?.eventId === eventId
      ? { ...eventDialog, message }
      : eventDialog;
    notice = eventDialog?.eventId === eventId ? "" : message;
    render();
    reactivateDialogAfterRender(".event-modal", focusSelector);
    return;
  }

  const nextState = setEventParticipantAdmin(
    state,
    eventId,
    participantId,
    enabled
  );
  if (nextState === state) return;

  const previousState = cloneNavigationValue(state);
  state = nextState;
  const participantLabel = participantName(participantId, event);
  eventDialog = eventDialog?.eventId === eventId
    ? {
        ...eventDialog,
        message: enabled
          ? `${participantLabel} הוגדר כמנהל אירוע.`
          : `הרשאת הניהול של ${participantLabel} הוסרה.`
      }
    : eventDialog;
  notice = "";
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (!result?.ok) {
    state = previousState;
    const failureMessage = "לא הצלחנו לשנות את הרשאת הניהול. לא בוצע שינוי.";
    eventDialog = eventDialog?.eventId === eventId
      ? { ...eventDialog, message: failureMessage }
      : eventDialog;
    notice = eventDialog?.eventId === eventId ? "" : failureMessage;
  }
  render();
  reactivateDialogAfterRender(".event-modal", focusSelector);
}

async function setEventRoundingMode(eventId, mode) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לשנות את עיגול הסכומים.";
    render();
    return;
  }

  const enabled = mode !== "exact";
  if (usesRoundedSettlementTransfers(event) === enabled) return;

  const previousState = state;
  state = setEventRoundSettlementTransfers(state, eventId, enabled);
  notice = enabled
    ? "סכומים נוחים הופעלו. רק ההעברות הסופיות יעוגלו."
    : "עיגול הסכומים בוטל. ההעברות יוצגו בדיוק מלא.";
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (!result?.ok) {
    state = previousState;
    notice = result?.error?.code === "SHARED_EVENT_MEMBERSHIP_REVOKED"
      ? "הגישה שלך לאירוע בוטלה. רעננו את המסך."
      : "לא הצלחנו לשנות את עיגול הסכומים. לא בוצע שינוי.";
    render();
    reactivateDialogAfterRender(
      ".event-modal",
      `[data-action="set-event-rounding-mode"][data-rounding-mode="${mode}"]`
    );
    return;
  }
  render();
  requestAnimationFrame(() => {
    app
      .querySelector(
        `[data-action="set-event-rounding-mode"][data-rounding-mode="${mode}"]`
      )
      ?.focus({ preventScroll: true });
  });
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

function eventParticipantHasMoneyHistory(event, participantId) {
  return (
    event.expenses.some(
      (expense) =>
        expense.sharedByParticipantIds.includes(participantId) ||
        expense.payers.some((payer) => payer.participantId === participantId)
    ) ||
    (event.transfers ?? []).some(
      (transfer) =>
        transfer.fromParticipantId === participantId ||
        transfer.toParticipantId === participantId ||
        transfer.markedPaidByParticipantId === participantId
    )
  );
}

function isEventParticipantsDialog(eventId) {
  return (
    eventDialog?.eventId === eventId &&
    (
      ["participants", "participants-add"].includes(eventDialog.kind) ||
      (eventDialog.kind === "share" && eventDialog.shareView === "friends")
    )
  );
}

function showEventParticipantMessage(eventId, message, focusSelector = "") {
  if (isEventParticipantsDialog(eventId)) {
    eventDialog = { ...eventDialog, message };
  } else {
    notice = message;
  }
  render();
  if (isEventParticipantsDialog(eventId)) {
    reactivateDialogAfterRender(".event-modal", focusSelector);
  }
}

function requestEventParticipantRemoval(eventId, participantId, trigger) {
  const event = getEvent(eventId);
  const participant = state.participants.find((item) => item.id === participantId);
  if (!event || !participant || !event.participantIds.includes(participantId)) return;

  if (!canCurrentParticipantManage(event)) {
    showEventParticipantMessage(eventId, editBlockedMessage(event));
    return;
  }

  if (participantId === state.currentParticipantId) {
    showEventParticipantMessage(
      eventId,
      "זה החשבון שלך. כדי לצאת מהאירוע משתמשים באפשרות \"עזיבת האירוע\" בהגדרות."
    );
    return;
  }

  const hasMoneyHistory = eventParticipantHasMoneyHistory(event, participantId);
  const keepsHistoricalReference =
    hasMoneyHistory || participantId === event.createdByParticipantId;
  const participantLabel = participantName(participantId, event);

  openImportantActionDialog(
    {
      kind: "remove-event-participant",
      title: `איך להסיר את ${participantLabel} מהאירוע?`,
      description: keepsHistoricalReference
        ? "יש על שמו היסטוריה באירוע, לכן אי אפשר למחוק את השם בלי לפגוע בחישוב. אפשר להסיר את הגישה ולהשאיר אותו כשם אופליין."
        : "אפשר להסיר אותו לגמרי מהאירוע, או להשאיר את השם ברשימה ההיסטורית כאופליין.",
      confirmLabel: keepsHistoricalReference ? "השאר שם אופליין" : "הסר לגמרי",
      alternateLabel: keepsHistoricalReference
        ? "הסר לגמרי (לא זמין)"
        : "השאר שם אופליין",
      alternateDisabled: keepsHistoricalReference,
      alternateDescription: keepsHistoricalReference
        ? "לא ניתן למחוק לגמרי שם שמופיע בהוצאות או בהעברות קיימות"
        : "הגישה תוסר והשם יישאר ברשימה ההיסטורית",
      payload: {
        eventId,
        participantId,
        removalMode: keepsHistoricalReference ? "offline" : "remove"
      },
      alternatePayload: { removalMode: "offline" }
    },
    trigger
  );
}

async function removeEventParticipant(eventId, participantId) {
  const removalMode = arguments[2] === "offline" ? "offline" : "remove";
  const event = getEvent(eventId);
  const participant = state.participants.find((item) => item.id === participantId);
  if (
    !event ||
    !participant ||
    !canCurrentParticipantManage(event) ||
    participantId === state.currentParticipantId ||
    isEventParticipantInactive(event, participantId)
  ) {
    showEventParticipantMessage(
      eventId,
      "לא ניתן להסיר את המשתתף כרגע."
    );
    return;
  }

  const preservesMoneyHistory =
    participantId === event.createdByParticipantId ||
    eventParticipantHasMoneyHistory(event, participantId);
  const preserveOffline = preservesMoneyHistory || removalMode === "offline";
  const removalMessage = preservesMoneyHistory
    ? `הסרנו את ${participant.displayName} מהאירוע. ההיסטוריה הכספית נשמרה כשם אופליין.`
    : preserveOffline
      ? `הסרנו את ${participant.displayName} מהאירוע והשארנו את השם כאופליין.`
      : `הסרנו את ${participant.displayName} מהאירוע.`;
  const removedFromProfile =
    eventDialog?.kind === "participant-profile" &&
    eventDialog.eventId === eventId &&
    eventDialog.participantId === participantId;
  const previousState = cloneNavigationValue(state);
  state = deactivateEventParticipant(
    state,
    eventId,
    participantId,
    new Date().toISOString(),
    { preserveOffline }
  );
  recordEventActivity(eventId, "participant-removed", {
    subjectParticipantId: participantId
  });
  eventDialog = removedFromProfile
    ? {
        eventId,
        kind: "participants",
        historyBaseDepth: eventDialog.historyBaseDepth
      }
    : isEventParticipantsDialog(eventId)
    ? {
        ...eventDialog,
        message: ""
      }
    : eventDialog;
  notice = removalMessage;
  const saveRequest = persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  render();
  reactivateDialogAfterRender(".event-modal");
  const result = await saveRequest;
  if (!result?.ok) {
    state = previousState;
    eventDialog = eventDialog && eventDialog.eventId === eventId
      ? {
          ...eventDialog,
          message: ""
        }
      : eventDialog;
    notice = result?.error?.code === "SHARED_EVENT_MEMBERSHIP_REVOKED"
      ? "הגישה שלך לאירוע בוטלה. רעננו את המסך."
      : "לא הצלחנו להסיר את המשתתף. לא בוצע שינוי.";
    render();
    reactivateDialogAfterRender(".event-modal");
    return;
  }
}

function requestNewEventParticipantRemoval(participantId, trigger) {
  const participant = state.participants.find((item) => item.id === participantId);
  if (
    !participant ||
    participantId === state.currentParticipantId ||
    !newEventDraft?.participantIds.includes(participantId)
  ) return;

  openImportantActionDialog(
    {
      kind: "remove-new-event-participant",
      label: "הסרת משתתף",
      title: `להסיר את ${participant.displayName} מהאירוע?`,
      description: "המשתתף יוסר מהאירוע החדש. תמיד אפשר לבחור אותו שוב לפני פתיחת האירוע.",
      confirmLabel: "הסר מהאירוע",
      payload: { participantId }
    },
    trigger
  );
}

function ensureCurrentParticipantInNewEventDraft() {
  const currentParticipantId = String(state.currentParticipantId ?? "").trim();
  if (!newEventDraft || !currentParticipantId) return false;
  if (newEventDraft.participantIds.includes(currentParticipantId)) return false;
  newEventDraft.participantIds.unshift(currentParticipantId);
  return true;
}

async function restoreEventParticipant(eventId, participantId) {
  const event = getEvent(eventId);
  const participant = state.participants.find((item) => item.id === participantId);
  if (
    !event ||
    !participant ||
    !canCurrentParticipantManage(event) ||
    !isEventParticipantInactive(event, participantId)
  ) {
    showEventParticipantMessage(eventId, "לא ניתן להחזיר את המשתתף כרגע.");
    return;
  }

  const previousState = cloneNavigationValue(state);
  event.inactiveParticipantIds = (event.inactiveParticipantIds ?? []).filter(
    (id) => id !== participantId
  );
  event.membershipUpdatedAt = new Date().toISOString();
  event.membershipUpdatedAtByParticipant = markParticipantMembershipChanges(
    event,
    [participantId],
    event.membershipUpdatedAt
  );
  recordEventActivity(eventId, "participant-restored", {
    subjectParticipantId: participantId
  });
  eventDialog = isEventParticipantsDialog(eventId)
    ? {
        ...eventDialog,
        message: `${participant.displayName} חזר לאירוע.`
      }
    : eventDialog;
  notice = "";
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (!result?.ok) {
    state = previousState;
    eventDialog = isEventParticipantsDialog(eventId)
      ? {
          ...eventDialog,
          message: "לא הצלחנו להחזיר את המשתתף. לא בוצע שינוי."
        }
      : eventDialog;
    notice = eventDialog ? "" : "לא הצלחנו להחזיר את המשתתף. לא בוצע שינוי.";
    render();
    reactivateDialogAfterRender(".event-modal");
    return;
  }
  render();
  reactivateDialogAfterRender(
    ".event-modal",
    `[data-action="remove-event-participant"][data-participant-id="${participantId}"]`
  );
}

async function toggleEventParticipant(eventId, participantId, checked) {
  const event = getEvent(eventId);
  const canChangeMembership = checked
    ? canCurrentParticipantAddEventMember(event, participantId)
    : canCurrentParticipantChangeEventMembership(event, participantId);
  if (!canChangeMembership) {
    notice = editBlockedMessage(event);
    render();
    return;
  }

  if (!checked) {
    requestEventParticipantRemoval(
      eventId,
      participantId,
      [...app.querySelectorAll('[data-action="event-participant"]')].find(
        (input) => input.dataset.participantId === participantId
      )
    );
    return;
  }

  const participant = state.participants.find((item) => item.id === participantId);
  if (!participant) return;
  if (isEventParticipantInactive(event, participantId)) {
    await restoreEventParticipant(eventId, participantId);
    return;
  }
  if (event.participantIds.includes(participantId)) return;
  const previousState = cloneNavigationValue(state);
  const returnsToParticipantRoster = eventDialog?.kind === "participants-add";
  if (returnsToParticipantRoster) {
    eventDialog = {
      eventId,
      kind: "participants",
      message: `${participant.displayName} נוסף לאירוע.`,
      historyBaseDepth: eventDialog.historyBaseDepth
    };
    notice = "";
  } else if (isEventParticipantsDialog(eventId)) {
    eventDialog = {
      ...eventDialog,
      message: `${participant.displayName} נוסף לאירוע.`
    };
    notice = "";
  }
  const participantAdded = activateParticipantForEvent(event, participantId);
  if (participantAdded) {
    recordEventActivity(eventId, "participant-added", {
      subjectParticipantId: participantId
    });
  }
  render();
  reactivateDialogAfterRender(
    ".event-modal",
    returnsToParticipantRoster
      ? `[data-action="open-event-participant-profile"][data-participant-id="${participantId}"]`
      : `[data-action="remove-event-participant"][data-participant-id="${participantId}"]`
  );
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (!result?.ok) {
    state = previousState;
    eventDialog = isEventParticipantsDialog(eventId)
      ? {
          ...eventDialog,
          message: "לא הצלחנו להוסיף את המשתתף. לא בוצע שינוי."
        }
      : eventDialog;
    notice = eventDialog ? "" : "לא הצלחנו להוסיף את המשתתף. לא בוצע שינוי.";
    render();
    reactivateDialogAfterRender(".event-modal");
    return;
  }
  await publishEventInvitation(eventId, participant);
  if (returnsToParticipantRoster) {
    // Adding from the focused picker creates one optimistic roster history
    // entry. Rewind both that entry and the picker route so the user lands on
    // the real participant roster instead of the add-method menu.
    renderHistoryFallback(2);
    reactivateDialogAfterRender(
      ".event-modal",
      `[data-action="open-event-participant-profile"][data-participant-id="${participantId}"]`
    );
    return;
  }
  if (app.querySelector("[data-event-participant-roster]")) {
    render();
    reactivateDialogAfterRender(
      ".event-modal",
      `[data-action="remove-event-participant"][data-participant-id="${participantId}"]`
    );
    return;
  }
  if (syncEventParticipantDialog(event)) return;
  render();
  if (
    eventDialog?.kind === "participants-add" ||
    (eventDialog?.kind === "share" && eventDialog.shareView === "friends")
  ) {
    reactivateDialogAfterRender(".event-modal");
  }
}

function pendingAccountLinkReceipt(candidateState, pendingMerge) {
  const event = candidateState?.events?.find(
    (item) => item.id === pendingMerge?.eventId
  );
  const link = (event?.participantAccountLinks ?? []).find(
    (item) =>
      item?.sourceParticipantId === pendingMerge?.sourceId &&
      item?.targetParticipantId === pendingMerge?.targetId
  );
  const ownerUserId =
    accountUserIdFromParticipantId(link?.linkedByParticipantId) ||
    String(runtimeConfig?.storage?.account?.userId ?? "").trim() ||
    accountUserIdFromParticipantId(candidateState?.currentParticipantId);
  if (!event || !link?.linkedAt || !ownerUserId) return null;
  return {
    ownerUserId,
    eventId: event.id,
    sourceParticipantId: pendingMerge.sourceId,
    targetParticipantId: pendingMerge.targetId,
    linkedAt: link.linkedAt,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: ""
  };
}

async function confirmPendingAccountLink(receipt) {
  const event = getEvent(receipt?.eventId);
  const credentials = eventShareCredentials(event);
  if (!event || !credentials) return false;

  const config = await loadRuntimeConfig();
  runtimeConfig = config;
  if (config.storage?.mode !== "supabase") return false;
  const remoteState = await readSharedEventState(
    config,
    credentials,
    receipt.eventId
  );
  if (!accountLinkIsConfirmed(remoteState, receipt)) return false;

  state = mergeSharedEventIntoState(state, remoteState, credentials);
  saveState(state);
  return true;
}

function retryPendingAccountLinks() {
  if (
    pendingAccountLinkRetryRequest ||
    !appBootHydrated ||
    navigator.onLine === false
  ) {
    return pendingAccountLinkRetryRequest ?? Promise.resolve();
  }

  const ownerUserId = pendingEventMembershipOwnerId();
  const pendingEntries = loadPendingAccountLinks(
    window.localStorage,
    ownerUserId
  );
  if (!ownerUserId || !pendingEntries.length) return Promise.resolve();

  pendingAccountLinkRetryRequest = (async () => {
    await flushPendingSharedState().catch(() => null);
    for (const entry of pendingEntries) {
      markPendingAccountLinkAttempt(entry);
      try {
        if (await confirmPendingAccountLink(entry)) {
          forgetPendingAccountLink(entry);
          continue;
        }

        const replayedState = accountLinkIsConfirmed(state, entry)
          ? state
          : linkParticipantAccountInEvent(
              state,
              entry.eventId,
              entry.sourceParticipantId,
              entry.targetParticipantId
            );
        if (replayedState === state && !accountLinkIsConfirmed(state, entry)) {
          continue;
        }
        state = replayedState;
        const result = await saveSharedState(state, {
          awaitCloud: true,
          suppressRevertNotice: true,
          forceSharedEventIds: [entry.eventId]
        });
        if (result?.ok && await confirmPendingAccountLink(entry)) {
          forgetPendingAccountLink(entry);
          continue;
        }
        emitOperationDeferred("account_link", {
          screen: "event",
          error: result?.error
        });
      } catch (error) {
        emitOperationDeferred("account_link", {
          screen: "event",
          error
        });
      }
    }
  })().finally(() => {
    pendingAccountLinkRetryRequest = null;
  });
  return pendingAccountLinkRetryRequest;
}

async function publishEventInvitation(
  eventId,
  participant,
  { showMessage = true } = {}
) {
  if (
    !accountUserIdFromParticipantId(participant?.id) ||
    participant.id === state.currentParticipantId
  ) {
    return { ok: true, skipped: true };
  }

  rememberPendingEventMembershipInvitation(eventId, participant.id);
  try {
    await preparePrivateEventInvitation(eventId);
    const result = await sendEventActivityNotificationWithAccountRecovery({
      eventId,
      activityId: participant.id,
      kind: "event-invite"
    });
    if (!result?.ok || Number(result.membershipRecipients ?? 0) < 1) {
      const error = new Error("Event membership was not confirmed");
      error.code = "EVENT_MEMBERSHIP_NOT_CONFIRMED";
      error.retryable = true;
      throw error;
    }
    forgetPendingEventMembershipInvitation(eventId, participant.id);
    if (showMessage) {
      updateParticipantInvitationMessage(
        eventId,
        `${participant.displayName} נוסף לאירוע ולחשבון שלו.`
      );
    }
    return { ok: true, result };
  } catch (error) {
    (error?.retryable || navigator.onLine === false
      ? emitOperationDeferred
      : emitOperationFailure)("event_invite", {
      screen: "participants",
      error
    });
    if (showMessage) {
      updateParticipantInvitationMessage(
        eventId,
        `${participant.displayName} נוסף לאירוע. החיבור לחשבון שלו יושלם אוטומטית כשהחיבור יחזור.`
      );
    }
    return { ok: false, error };
  }
}

async function sendEventActivityNotificationWithAccountRecovery(payload) {
  const initialConfig = await loadRuntimeConfig();
  runtimeConfig = initialConfig;
  const expectedUserId = String(
    initialConfig?.storage?.account?.userId ?? ""
  ).trim();
  const request = () => sendEventActivityNotification(runtimeConfig, payload);

  try {
    return await request();
  } catch (error) {
    if (!eventInviteAuthRefreshRequired(error) || !expectedUserId) {
      throw error;
    }
  }

  const refreshedSession = await globalThis.SogrimAccountSession?.refresh?.();
  if (!refreshedSession?.access_token) {
    const error = new Error("Account session is unavailable");
    error.code = "AUTH_REQUIRED";
    throw error;
  }

  const freshConfig = await loadRuntimeConfig();
  const freshUserId = String(
    freshConfig?.storage?.account?.userId ?? ""
  ).trim();
  if (freshUserId !== expectedUserId) {
    const error = new Error("Account changed during notification recovery");
    error.code = "AUTH_REQUIRED";
    throw error;
  }

  runtimeConfig = freshConfig;
  return request();
}

function pendingEventMembershipOwnerId() {
  return String(
    runtimeConfig?.storage?.account?.userId ||
      accountUserIdFromParticipantId(state?.currentParticipantId) ||
      ""
  ).trim();
}

function rememberPendingIncomingEventJoin(eventId, config = runtimeConfig) {
  const ownerUserId = String(config?.storage?.account?.userId ?? "").trim();
  if (!ownerUserId || !eventId) return false;
  return rememberPendingEventJoin({
    ownerUserId,
    eventId,
    queuedAt: new Date().toISOString()
  });
}

function forgetPendingIncomingEventJoin(eventId, config = runtimeConfig) {
  const ownerUserId = String(config?.storage?.account?.userId ?? "").trim();
  if (!ownerUserId || !eventId) return false;
  return forgetPendingEventJoin({ ownerUserId, eventId });
}

function retryPendingEventJoins() {
  if (
    pendingEventJoinRetryRequest ||
    !appBootHydrated ||
    navigator.onLine === false
  ) {
    return pendingEventJoinRetryRequest ?? Promise.resolve();
  }

  const ownerUserId = pendingEventMembershipOwnerId();
  const pendingEntries = loadPendingEventJoins(window.localStorage, ownerUserId);
  if (!ownerUserId || !pendingEntries.length) return Promise.resolve();

  pendingEventJoinRetryRequest = (async () => {
    runtimeConfig = await loadRuntimeConfig();
    if (runtimeConfig?.storage?.account?.userId !== ownerUserId) return;

    for (const entry of pendingEntries) {
      markPendingEventJoinAttempt(entry, window.localStorage);
      try {
        state = syncLocalProfile(
          await recoverAccessibleSharedEvents(runtimeConfig, state)
        );
        const event = getEvent(entry.eventId);
        const participantId = state.currentParticipantId;
        if (!event || !participantId || !isActiveEventParticipant(event, participantId)) {
          continue;
        }
        const result = await saveSharedState(state, {
          awaitCloud: true,
          suppressRevertNotice: true,
          forceSharedEventIds: [entry.eventId]
        });
        // A confirmed server membership is already canonical. Once the local
        // account save is accepted or queued, normal outbox recovery owns the
        // remaining write and this receipt must not trigger duplicate joins.
        if (result?.ok || result?.pending || result?.partial) {
          forgetPendingEventJoin(entry, window.localStorage);
        }
      } catch (error) {
        emitOperationDeferred("event_join", { screen: "invite", error });
      }
    }
  })().finally(() => {
    pendingEventJoinRetryRequest = null;
  });
  return pendingEventJoinRetryRequest;
}

function loadPendingEventMembershipInvitations() {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PENDING_EVENT_MEMBERSHIP_STORAGE_KEY) || "[]"
    );
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry) =>
            entry &&
            typeof entry.ownerUserId === "string" &&
            typeof entry.eventId === "string" &&
            typeof entry.participantId === "string"
        )
      : [];
  } catch {
    return [];
  }
}

function savePendingEventMembershipInvitations(entries) {
  try {
    if (entries.length) {
      window.localStorage.setItem(
        PENDING_EVENT_MEMBERSHIP_STORAGE_KEY,
        JSON.stringify(entries)
      );
    } else {
      window.localStorage.removeItem(PENDING_EVENT_MEMBERSHIP_STORAGE_KEY);
    }
  } catch {
    // A blocked storage area must not prevent the immediate server attempt.
  }
}

function rememberPendingEventMembershipInvitation(eventId, participantId) {
  const ownerUserId = pendingEventMembershipOwnerId();
  if (!ownerUserId || !eventId || !participantId) return;
  const entries = loadPendingEventMembershipInvitations();
  if (
    entries.some(
      (entry) =>
        entry.ownerUserId === ownerUserId &&
        entry.eventId === eventId &&
        entry.participantId === participantId
    )
  ) {
    return;
  }
  entries.push({
    ownerUserId,
    eventId,
    participantId,
    queuedAt: new Date().toISOString()
  });
  savePendingEventMembershipInvitations(entries);
}

function forgetPendingEventMembershipInvitation(eventId, participantId) {
  const ownerUserId = pendingEventMembershipOwnerId();
  savePendingEventMembershipInvitations(
    loadPendingEventMembershipInvitations().filter(
      (entry) =>
        !(
          entry.ownerUserId === ownerUserId &&
          entry.eventId === eventId &&
          entry.participantId === participantId
        )
    )
  );
}

function retryPendingEventMembershipInvitations() {
  if (
    pendingEventMembershipRetryRequest ||
    !appBootHydrated ||
    navigator.onLine === false
  ) {
    return pendingEventMembershipRetryRequest ?? Promise.resolve();
  }

  const ownerUserId = pendingEventMembershipOwnerId();
  if (!ownerUserId) return Promise.resolve();
  const pendingEntries = loadPendingEventMembershipInvitations().filter(
    (entry) => entry.ownerUserId === ownerUserId
  );
  if (!pendingEntries.length) return Promise.resolve();

  pendingEventMembershipRetryRequest = (async () => {
    for (const entry of pendingEntries) {
      const event = getEvent(entry.eventId);
      const participant = state.participants.find(
        (item) => item.id === entry.participantId
      );
      if (
        !event ||
        !participant ||
        !event.participantIds.includes(entry.participantId) ||
        isEventParticipantInactive(event, entry.participantId)
      ) {
        forgetPendingEventMembershipInvitation(
          entry.eventId,
          entry.participantId
        );
        continue;
      }
      await publishEventInvitation(entry.eventId, participant, {
        showMessage: false
      });
    }
  })().finally(() => {
    pendingEventMembershipRetryRequest = null;
  });
  return pendingEventMembershipRetryRequest;
}

function updateParticipantInvitationMessage(eventId, message) {
  if (!isEventParticipantsDialog(eventId)) {
    return;
  }
  eventDialog = { ...eventDialog, message };
  render();
  reactivateDialogAfterRender(".event-modal");
}

function syncEventParticipantDialog(event) {
  const search = app.querySelector('[data-action="participant-search"]');
  if (
    eventDialog?.kind !== "participants" ||
    eventDialog.eventId !== event.id
  ) {
    return false;
  }

  const selectedIds = new Set(event.participantIds);
  app.querySelectorAll('[data-action="event-participant"]').forEach((input) => {
    input.checked = selectedIds.has(input.dataset.participantId);
  });
  if (search) filterParticipantChecks(search);
  return true;
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
  if (!date) {
    return `<time class="opened-at font-hebrew"${datetime}>${escapeHtml(formatOpenedAt(value, id))}</time>`;
  }

  const dateLabel = formatRelativeCalendarDate(date);
  const renderedDate = /\d/.test(dateLabel)
    ? `<bdi><span class="font-num">${escapeHtml(dateLabel)}</span></bdi>`
    : `<bdi>${escapeHtml(dateLabel)}</bdi>`;
  return `<time class="opened-at font-hebrew"${datetime}>נפתח <span class="opened-at-value" dir="ltr">${renderedDate}<span aria-hidden="true"> · </span><span class="font-num">${escapeHtml(formatClockTime(date))}</span></span></time>`;
}

function groupSelectLabel(group) {
  const visibleGroups = visibleGroupsForParticipant(state, state.currentParticipantId);
  const matchingGroup = findMatchingActiveGroup(visibleGroups, group, {
    excludeId: group.id
  });
  const date = creationDate(group.createdAt, group.id);
  if (!matchingGroup || !date) {
    return `${group.name} · ${formatOpenedAt(group.createdAt, group.id)}`;
  }

  return `${group.name} · נפתח ${formatRelativeCalendarDate(date)} · ${formatPreciseClockTime(date)}`;
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

  const cloudParticipant = nextState.participants.find(
    (participant) =>
      participant.id === localProfile.participantId ||
      (
        participant.authProvider === localProfile.authProvider &&
        participant.authSubject &&
        participant.authSubject === localProfile.authSubject
      )
  );
  const cloudProfileUpdatedAt = normalizeProfileUpdatedAt(
    cloudParticipant?.profileUpdatedAt
  );
  const localProfileUpdatedAt = normalizeProfileUpdatedAt(
    localProfile.profileUpdatedAt
  );
  const cloudProfileIsNewer = Boolean(
    cloudParticipant &&
      cloudProfileUpdatedAt &&
      (
        !localProfileUpdatedAt ||
        Date.parse(cloudProfileUpdatedAt) > Date.parse(localProfileUpdatedAt)
      )
  );
  const avatarResolution = resolveProfileAvatar(
    {
      avatarImage: localProfile.avatarImage,
      avatarImageUpdatedAt: localProfile.avatarImageUpdatedAt
    },
    {
      avatarImage: cloudParticipant?.avatarImage,
      avatarImageUpdatedAt: cloudParticipant?.avatarImageUpdatedAt
    }
  );

  const stateWithProfile = ensureNamedParticipant(
    nextState,
    {
      id: cloudParticipant?.id ?? localProfile.participantId,
      displayName: cloudProfileIsNewer
        ? cloudParticipant.displayName
        : localProfile.displayName,
      avatarPreset: cloudProfileIsNewer
        ? normalizeAvatarPreset(cloudParticipant.avatarPreset)
        : localProfile.avatarPreset,
      avatarImage: avatarResolution.avatarImage,
      avatarImageUpdatedAt: avatarResolution.avatarImageUpdatedAt,
      profileUpdatedAt: cloudProfileIsNewer
        ? cloudProfileUpdatedAt
        : localProfileUpdatedAt,
      authProvider: localProfile.authProvider,
      authSubject: localProfile.authSubject,
      email: localProfile.email
    }
  );
  const participant = stateWithProfile.participants.find(
    (item) => item.id === stateWithProfile.currentParticipantId
  );

  localProfile = saveLocalProfile({
    participantId: stateWithProfile.currentParticipantId,
    displayName: participant?.displayName ?? localProfile.displayName,
    avatarImage:
      Object.hasOwn(participant ?? {}, "avatarImage")
        ? normalizeAvatarImage(participant.avatarImage)
        : avatarResolution.avatarImage,
    avatarImageUpdatedAt:
      participant?.avatarImageUpdatedAt || avatarResolution.avatarImageUpdatedAt,
    avatarPreset:
      normalizeAvatarPreset(participant?.avatarPreset) ||
      localProfile.avatarPreset,
    profileUpdatedAt:
      participant?.profileUpdatedAt ?? localProfile.profileUpdatedAt,
    authProvider: participant?.authProvider ?? localProfile.authProvider,
    authSubject: participant?.authSubject ?? localProfile.authSubject,
    email: participant?.email ?? localProfile.email
  });
  profileNameDraft = localProfile.displayName;
  profileAvatarDraft =
    normalizeAvatarPreset(localProfile.avatarPreset) || AVATAR_PRESETS[0].id;
  profileAvatarImageDraft = normalizeAvatarImage(localProfile.avatarImage);
  return stateWithProfile;
}

async function hydrateIncomingSharedEvent(nextState) {
  const inviteUrl = window.location.href;
  const eventId = parseInviteEventId(inviteUrl);
  if (!eventId) return nextState;

  try {
    const inviteRuntimeConfig = await loadRuntimeConfig();
    const credentials = await resolveEventInviteCredentials(
      inviteRuntimeConfig,
      inviteUrl
    );
    if (!credentials) return nextState;
    rememberPendingIncomingEventJoin(eventId, inviteRuntimeConfig);
    const sharedEventState = await readSharedEventState(
      inviteRuntimeConfig,
      credentials,
      eventId
    );
    if (!sharedEventState) return nextState;
    const merged = mergeSharedEventIntoState(nextState, sharedEventState, credentials);
    // Startup still needs to persist the user profile into the event. Keep the
    // receipt until the normal join or resume path confirms that durable save.
    return merged;
  } catch {
    return nextState;
  }
}

function openInvitedEventFromUrl() {
  const invitedEventId = parseInviteEventId(window.location.href);
  if (!invitedEventId) return;
  const inviteUrl = new URL(window.location.href);
  const openedFromInvite = ["invite", "space", "key", "join", "t"]
    .some((parameter) => inviteUrl.searchParams.has(parameter));

  if (getEvent(invitedEventId)) {
    screen = { name: "event", eventId: invitedEventId };
    notice = "פתחת אירוע מקישור הזמנה.";
  } else {
    notice = "קישור ההזמנה לא נמצא.";
  }

  if (!openedFromInvite && getEvent(invitedEventId)) notice = "";
}

function openNotificationTargetFromUrl(value, { cleanUrl = true } = {}) {
  const target = notificationTargetFromUrl(value);
  if (!target) {
    try {
      const url = new URL(value, window.location.href);
      if (cleanUrl && url.searchParams.has("openEvent")) {
        cleanNotificationTargetUrl(url.toString());
      }
    } catch {}
    return false;
  }

  const event = getEvent(target.eventId);
  if (!event) {
    notice = "האירוע מההתראה עדיין לא זמין בחשבון הזה.";
    if (cleanUrl) cleanNotificationTargetUrl(value);
    return false;
  }

  screen = {
    name: target.view === "summary" ? "settlement" : "event",
    eventId: target.eventId
  };
  expenseDraft = null;
  eventDialog = null;
  importantActionDialog = null;
  eventStatusMenu = null;
  settlementCelebration = null;
  settlementCloseConfirmation = null;
  notice = "";
  rememberRecentEvent(target.eventId);
  if (cleanUrl) cleanNotificationTargetUrl(value);
  return true;
}

function cleanNotificationTargetUrl(value) {
  const absoluteUrl = new URL(value, window.location.href).toString();
  window.history.replaceState(
    window.history.state,
    "",
    clearNotificationTargetFromUrl(absoluteUrl)
  );
}

function handleNativeDestinationRequest(event) {
  const destination = event.detail?.destination;
  const target = notificationTargetFromUrl(destination);
  if (!target || !getEvent(target.eventId)) return;

  event.preventDefault();
  openNotificationTargetFromUrl(destination);
  render();
}

function persistState(options = {}) {
  return saveSharedState(state, options);
}

function recordEventActivity(
  eventId,
  kind,
  details = {},
  occurredAt = new Date().toISOString()
) {
  const event = getEvent(eventId);
  if (!event) return;

  const activityId = makeId("activity");
  const nextEvent = appendEventActivity(event, {
    id: activityId,
    kind,
    occurredAt,
    ...details,
    actorParticipantId: state.currentParticipantId
  });
  event.activityLog = nextEvent.activityLog;
  return activityId;
}

function publishReferralActivityAfterSave(saveRequest, eventId, kind) {
  const sharedSpaceId = String(getEvent(eventId)?.sharedSpaceId ?? "").trim();
  completedSaveResult(saveRequest)
    .then((result) => {
      if (!result?.ok || result.mode !== "cloud" || !sharedSpaceId) return;
      document.dispatchEvent(
        new CustomEvent("settle-friends:qualifying-activity", {
          detail: { eventId: sharedSpaceId, kind }
        })
      );
    })
    .catch(() => {});
}

function publishEventActivityAfterSave(
  saveRequest,
  eventId,
  kind,
  activityId
) {
  completedSaveResult(saveRequest)
    .then(async (result) => {
      if (!result?.ok || result.mode !== "cloud" || !eventId || !activityId) {
        return;
      }
      await sendEventActivityNotificationWithAccountRecovery({
        eventId,
        activityId,
        kind
      });
    })
    .catch(() => {});
}

function completedSaveResult(saveRequest) {
  return Promise.resolve(saveRequest).then((result) =>
    result?.completion ? result.completion : result
  );
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
  const activeModalDialog =
    document.body.classList.contains("app-dialog-open") &&
    app.querySelector(':is([role="dialog"], [role="alertdialog"])[aria-modal="true"]');
  if (!returnTarget || activeModalDialog) return;

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
    ".expense-modal-backdrop, .event-modal-backdrop, .settlement-celebration-backdrop, .event-status-menu-backdrop, .important-action-dialog-backdrop, .settlement-close-confirmation-backdrop"
  );
  if (!backdrop) return;

  const keepsRouteChromeActive = backdrop.matches("[data-event-route-dialog]");
  const isRouteChrome = (element) =>
    Boolean(element.closest(".product-app-identity, .product-app-nav"));
  const isDismissibleNotice = (element) =>
    Boolean(element.closest(".app-toast"));

  const screen = backdrop.closest(".screen");
  screen?.querySelectorAll(":scope > *").forEach((element) => {
    // A dialog can be rendered inside a screen section (for example the
    // settlement summary). Never make the dialog's own ancestor inert: doing
    // so also disables every button inside the visually active dialog.
    if (element === backdrop || element.contains(backdrop)) return;
    if (isDismissibleNotice(element)) return;
    if (keepsRouteChromeActive && isRouteChrome(element)) return;
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
      if (isDismissibleNotice(element)) return;
      if (keepsRouteChromeActive && isRouteChrome(element)) return;
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
    let next = scope.querySelector(selector) ?? app.querySelector(selector);
    if (next instanceof HTMLSelectElement && next.hidden) {
      const choiceTrigger = next.nextElementSibling;
      if (choiceTrigger?.classList.contains("app-choice-trigger")) {
        next = choiceTrigger;
      }
    }
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
  if (action === "profile-username") return clickAction('[data-action="save-profile"]');
  if (action === "join-event-link") return clickAction('[data-action="join-existing-event"]');
  if (action === "new-event-guest-name") return clickAction('[data-action="new-event-add-guest"]');
  if (action === "event-offline-participant-rename") {
    return clickAction('[data-action="save-offline-participant-name"]');
  }
  if (action === "friends-new-offline-name") return clickAction('[data-action="friends-add-offline"]');
  if (action === "friend-code") return clickAction('[data-action="send-friend-request"]');
  if (action === "group-member-name") return clickAction('[data-action="group-add-member"]');
  if (action === "edit-group-member-name") return clickAction('[data-action="edit-group-add-member"]');
  if (action === "event-guest-name") return clickAction('[data-action="event-add-guest"]');
  if (action === "expense-new-payer-name") {
    return clickAction(`[data-action="expense-add-payer-guest"][data-index="${index}"]`);
  }
  if (action === "quick-item-new-guest-name") {
    return clickAction(`[data-action="quick-item-add-guest"][data-index="${index}"]`);
  }
  if (action === "expense-total" || action === "expense-name") {
    return clickAction('[data-action="expense-step-next"]');
  }
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
  if (handleRadioGroupKeyboardNavigation(event)) return;
  if (handleFriendsHubTabKeyboardNavigation(event)) return;
  if (handleInputKeyboardShortcut(event)) return;

  const transferRow = event.target.closest?.(".transfer-row[tabindex]");
  if (
    transferRow &&
    event.target === transferRow &&
    (event.key === "Enter" || event.key === " ")
  ) {
    event.preventDefault();
    const explanation = transferRow.querySelector(".transfer-explanation");
    if (explanation) setTransferExplanationOpen(transferRow, !explanation.open);
    return;
  }

  if (event.key === "Escape" && closeOpenTransientMenus()) {
    event.preventDefault();
    return;
  }

  const eventRow = event.target.closest?.(
    '[data-long-press-event="true"][data-event-id]'
  );
  if (
    eventRow &&
    (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
  ) {
    event.preventDefault();
    openEventStatusMenu(eventRow.dataset.eventId, eventRow);
    return;
  }

  if (event.key === "Escape" && settlementCloseConfirmation) {
    event.preventDefault();
    goBackInApp();
    return;
  }

  const dialog = app.querySelector(
    '.settlement-close-confirmation[role="alertdialog"], .important-action-dialog[role="alertdialog"], .settlement-celebration-dialog[role="dialog"], .event-status-menu[role="dialog"], .expense-modal[role="dialog"], .event-modal[role="dialog"], .event-modal[role="region"]'
  );
  if (!dialog) return;

  if (event.key === "Escape") {
    event.preventDefault();
    goBackInApp();
    return;
  }

  if (event.key !== "Tab") return;
  const focusableSelector =
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])';
  const routeDialog = dialog.closest("[data-event-route-dialog]");
  const candidates = routeDialog
    ? [...app.querySelectorAll(focusableSelector)].filter(
        (element) =>
          dialog.contains(element) ||
          Boolean(element.closest(".product-app-identity, .product-app-nav, .event-route-primary-nav"))
      )
    : [...dialog.querySelectorAll(focusableSelector)];
  const focusable = [...new Set(candidates)].filter(
    (element) => element.offsetParent !== null && !element.inert
  );
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

function handleFriendsHubTabKeyboardNavigation(event) {
  if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return false;

  const tab = event.target.closest?.(
    '.friends-hub-tab[role="tab"], .friend-add-mode-button[role="tab"]'
  );
  const tabList = tab?.closest?.('[role="tablist"]');
  if (!tab || !tabList) return false;

  const tabSelector = tab.classList.contains("friend-add-mode-button")
    ? '.friend-add-mode-button[role="tab"]'
    : '.friends-hub-tab[role="tab"]';
  const tabs = [...tabList.querySelectorAll(tabSelector)];
  const currentIndex = tabs.indexOf(tab);
  if (currentIndex < 0 || tabs.length < 2) return false;

  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? tabs.length - 1
      : (currentIndex + (event.key === "ArrowLeft" ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[nextIndex].click();
  return true;
}

function eventParticipants(event, includeAllKnown = false) {
  if (includeAllKnown) return state.participants;
  return state.participants.filter((participant) => event.participantIds.includes(participant.id));
}

function eventInactiveParticipantIds(event) {
  const participantIds = new Set(event?.participantIds ?? []);
  return new Set(
    (event?.inactiveParticipantIds ?? []).filter((participantId) =>
      participantIds.has(participantId)
    )
  );
}

function isEventParticipantInactive(event, participantId) {
  return eventInactiveParticipantIds(event).has(participantId);
}

function activeEventParticipants(event) {
  const inactiveParticipantIds = eventInactiveParticipantIds(event);
  return eventParticipants(event).filter(
    (participant) => !inactiveParticipantIds.has(participant.id)
  );
}

function activateParticipantForEvent(event, participantId) {
  let changed = false;
  if (!event.participantIds.includes(participantId)) {
    event.participantIds.push(participantId);
    changed = true;
  }

  const nextInactiveParticipantIds = (event.inactiveParticipantIds ?? []).filter(
    (id) => id !== participantId
  );
  if (nextInactiveParticipantIds.length !== (event.inactiveParticipantIds ?? []).length) {
    event.inactiveParticipantIds = nextInactiveParticipantIds;
    changed = true;
  }

  if (changed) {
    event.membershipUpdatedAt = new Date().toISOString();
    event.membershipUpdatedAtByParticipant =
      markParticipantMembershipChanges(
        event,
        [participantId],
        event.membershipUpdatedAt
      );
  }
  return changed;
}

function selectableEventParticipants(event, selectedIds = []) {
  const selectedParticipantIds = new Set(selectedIds);
  const inactiveParticipantIds = eventInactiveParticipantIds(event);
  return eventParticipants(event).filter(
    (participant) =>
      !inactiveParticipantIds.has(participant.id) ||
      selectedParticipantIds.has(participant.id)
  );
}

function expenseDraftParticipantIds() {
  if (!expenseDraft) return [];
  return [
    ...new Set([
      ...(expenseDraft.sharedByParticipantIds ?? []),
      ...(expenseDraft.payers ?? []).map((payer) => payer.participantId),
      expenseDraft.quickPayerId,
      ...(expenseDraft.quickItems ?? []).flatMap((item) => [
        item.sharedBy,
        ...(item.sharedByParticipantIds ?? [])
      ])
    ].filter(Boolean))
  ];
}

function expenseParticipantsForCurrentDraft(event) {
  return selectableEventParticipants(event, expenseDraftParticipantIds());
}

function eventSettlementTransfers(event, participants = eventParticipants(event)) {
  const settlement = reconcileSettlementTransfers(
    participants,
    event.expenses,
    event.transfers,
    settlementOptionsForEvent(event)
  );
  return settlement.issues.length && event.transfers.length
    ? event.transfers
    : settlement.transfers;
}

function handleRadioGroupKeyboardNavigation(event) {
  if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
    return false;
  }

  const radio = event.target.closest?.('[role="radio"]');
  const group = radio?.closest?.('[role="radiogroup"]');
  if (!radio || !group) return false;

  const radios = [...group.querySelectorAll('[role="radio"]:not([disabled])')];
  const currentIndex = radios.indexOf(radio);
  if (currentIndex < 0 || radios.length < 2) return false;

  let nextIndex;
  if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = radios.length - 1;
  } else {
    const movesForward = ["ArrowLeft", "ArrowDown"].includes(event.key);
    nextIndex = (currentIndex + (movesForward ? 1 : -1) + radios.length) % radios.length;
  }

  event.preventDefault();
  radios[nextIndex].focus({ preventScroll: true });
  radios[nextIndex].click();
  return true;
}

function renderAvatarStack(
  participantIds,
  event = null,
  { suppressParticipantAction = false } = {}
) {
  const visibleLimit = participantIds.length > 3 ? 2 : 3;
  const visibleIds = participantIds.slice(0, visibleLimit);
  const hiddenCount = participantIds.length - visibleIds.length;
  const hiddenCountLabel = hiddenCount > 99 ? "+99+" : `+${hiddenCount}`;

  return `
    <span class="avatar-stack" aria-label="משתתפים">
      ${visibleIds
        .map((participantId) =>
          renderAvatar(participantId, event, { suppressParticipantAction })
        )
        .join("")}
      ${
        hiddenCount > 0
          ? `<span class="avatar avatar-more" aria-label="${escapeAttribute(
              formatCount(hiddenCount, "משתתף נוסף", "משתתפים נוספים")
            )}" title="${escapeAttribute(
              formatCount(hiddenCount, "משתתף נוסף", "משתתפים נוספים")
            )}">${hiddenCountLabel}</span>`
          : ""
      }
    </span>
  `;
}

function renderAvatar(
  participantId,
  event = null,
  { openCurrentProfile = false, suppressParticipantAction = false } = {}
) {
  const participant = participantForStatistics(participantId);
  const name = event
    ? participantName(participantId, event)
    : participant?.displayName ?? "משתתף";
  const guestClass = participant?.kind === "guest" ? "is-guest" : "";
  const identity = participant
    ? participantConnectionStatus(participant)
    : { connected: false, label: "אופליין" };
  const identityClass = identity.connected ? "is-account" : "is-offline";
  const avatarPreset = avatarPresetForParticipant(participant, participantId);
  const avatarSource = avatarSourceForParticipant(participant, participantId);
  const opensStatistics =
    !suppressParticipantAction && canOpenParticipantStatistics(participantId);
  const opensProfile =
    !suppressParticipantAction &&
    openCurrentProfile &&
    participantId === state.currentParticipantId;
  const eventId = event?.id ?? "";
  const actionClass = opensStatistics
    ? "is-participant-statistics-action"
    : opensProfile
      ? "is-current-profile-action"
      : "";
  const actionAttributes = suppressParticipantAction
    ? 'aria-hidden="true"'
    : opensProfile
      ? `data-action="edit-profile" role="button" tabindex="0" aria-label="פתיחת הפרופיל שלך"`
      : participantStatisticsAvatarAttributes(participantId, name, eventId);

  return `<span class="avatar has-picture ${guestClass} ${identityClass} ${actionClass}" data-avatar-preset="${avatarPreset}" data-participant-identity="${identity.connected ? "account" : "offline"}" title="${escapeAttribute(`${name} · ${identity.label}`)}" ${actionAttributes}><img src="${escapeAttribute(avatarSource)}" alt="" width="256" height="256" loading="lazy" decoding="async" /></span>`;
}

function participantStatisticsAvatarAttributes(
  participantId,
  displayName,
  eventId = ""
) {
  if (!canOpenParticipantStatistics(participantId)) return 'aria-hidden="true"';
  return `data-action="open-participant-statistics" data-participant-id="${escapeAttribute(participantId)}" ${eventId ? `data-event-id="${escapeAttribute(eventId)}"` : ""} role="button" tabindex="0" aria-label="${escapeAttribute(`פתיחת הסטטיסטיקה בינך לבין ${displayName}`)}"`;
}

function canCurrentParticipantEdit(event) {
  return event ? canEditEvent(state, event, state.currentParticipantId) : false;
}

function canCurrentParticipantManage(event) {
  return event ? canManageEventSettings(state, event, state.currentParticipantId) : false;
}

function canCurrentParticipantUpdateTransfer(event, transfer) {
  if (!event || !transfer) return false;
  const participantId = state.currentParticipantId;
  return Boolean(
    participantId &&
      (canCurrentParticipantManage(event) ||
        transfer.fromParticipantId === participantId ||
        transfer.toParticipantId === participantId)
  );
}

function canCurrentParticipantChangeEventMembership(event, participantId) {
  return Boolean(participantId && canCurrentParticipantManage(event));
}

function canCurrentParticipantAddEventMember(event, participantId) {
  if (!participantId || !event) return false;
  if (canCurrentParticipantChangeEventMembership(event, participantId)) return true;
  return Boolean(
    !(event.participantIds ?? []).includes(participantId) &&
      canAddEventParticipant(state, event, state.currentParticipantId)
  );
}

function editBlockedMessage(event) {
  if (!event) return "האירוע לא נמצא.";
  return event.locked ? "האירוע נעול לעריכה." : "רק מנהל יכול לערוך את האירוע עכשיו.";
}

function getEvent(eventId) {
  return state.events.find((event) => event.id === eventId);
}

function participantName(participantId, event = null) {
  if (event) {
    return participantEventDisplayName(
      state.participants,
      event,
      participantId
    );
  }
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
  if (!document.documentElement.classList.contains("account-auth-pending")) {
    hydrateAppAfterAccountReady()
      .then(() => Promise.all([
        retryPendingEventMembershipInvitations(),
        retryPendingAccountLinks()
      ]))
      .catch(renderScopedLocalFallback);
  }
  loadRuntimeConfig().then((config) => {
    runtimeConfig = config;
    if (appBootHydrated) render();
  });
}

function hydrateAppAfterAccountReady() {
  if (appBootHydrated) {
    refreshFriendNetwork().catch(() => {});
    refreshNotificationInbox({ force: true }).catch(() => {});
    return Promise.resolve();
  }
  if (appBootHydrationPromise) return appBootHydrationPromise;

  appBootHydrationPromise = hydrateAppForActiveAccount()
    .finally(() => {
      appBootHydrationPromise = null;
    });
  return appBootHydrationPromise;
}

async function hydrateAppForActiveAccount() {
  localProfile = loadLocalProfile();
  profileNameDraft = localProfile?.displayName ?? "";
  profileAvatarDraft =
    normalizeAvatarPreset(localProfile?.avatarPreset) || AVATAR_PRESETS[0].id;
  profileAvatarImageDraft = normalizeAvatarImage(localProfile?.avatarImage);
  runtimeConfig = await loadRuntimeConfig();
  reconcileEventInviteAccountBoundary(runtimeConfig);

  // Account bootstrap already saved its synchronized snapshot locally. Render it
  // immediately and let the returned refresh reconcile any later cloud change.
  // The account bootstrap has already completed the bounded initial cloud
  // reconciliation before it emits account-auth-ready. Do not make the app
  // wait for the same workspace a second time; render the synchronized local
  // snapshot and keep this extra refresh strictly in the background.
  const startupState = await loadSharedStateForStartup({
    maxWaitMs: 0
  });
  const sharedState = startupState.state;
  const hydratedState = await hydrateIncomingSharedEvent(sharedState);
  const nextState = syncLocalProfile(hydratedState);
  const shouldSaveJoinedProfile = Boolean(
    localProfile && hasSharedStateChanged(sharedState, nextState)
  );
  state = nextState;
  await hydrateOwnPublicAvatarBeforeFirstRender();

  const invitedEventId = parseInviteEventId(window.location.href);
  const openedNotificationTarget = openNotificationTargetFromUrl(
    window.location.href
  );
  if (!openedNotificationTarget) {
    if (friendCodeDraft && !invitedEventId) {
      screen = { name: "groups", tab: "people" };
      friendNetwork = emptyFriendNetwork(
        friendNetworkAvailable(runtimeConfig) ? "loading" : "signed-out"
      );
    } else {
      openInvitedEventFromUrl();
    }
  }

  notificationInbox = {
    status: "idle",
    available: false,
    items: [],
    error: ""
  };
  appBootHydrated = true;
  render();
  // A cached account snapshot can still contain membership credentials that the
  // cloud refresh is about to replace. Never write that stale snapshot during
  // startup: wait for the refresh, then publish the profile against the current
  // memberships. Background reconciliation must also stay silent because the
  // user did not initiate a change on this screen.
  const startupProfileSaveRequest = shouldSaveJoinedProfile && !startupState.refresh
    ? saveSharedState(state, { suppressRevertNotice: true })
    : null;
  startupProfileSaveRequest?.catch(() => {});
  const startupRefreshRequest = refreshStartupSharedState(startupState.refresh);
  const profilePublicationReady = startupState.refresh
    ? startupRefreshRequest
    : Promise.resolve(startupProfileSaveRequest);
  profilePublicationReady
    .then(() => publishCurrentProfileToSharedEventsOnce())
    .catch(() => {});
  refreshFriendNetwork()
    .then(() => render())
    .catch(() => {});
  refreshNotificationInbox({ force: true }).catch(() => {});
  refreshAdminAnalytics().catch(() => {});
}

async function setEventRepaymentMode(eventId, mode) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לשנות את אופן ההחזר.";
    render();
    return;
  }

  const direct = mode === "direct";
  const requestVersion =
    (eventRepaymentModeRequestVersions.get(eventId) ?? 0) + 1;
  eventRepaymentModeRequestVersions.set(eventId, requestVersion);

  const previousDirect = usesDirectSettlementTransfers(event);
  const previousTransfers = eventSettlementTransfers(event);
  state = setEventDirectSettlementTransfers(state, eventId, direct);
  const nextEvent = getEvent(eventId);
  const nextTransfers = eventSettlementTransfers(nextEvent);
  const transferPlanChanged = settlementTransferPlanKey(previousTransfers) !==
    settlementTransferPlanKey(nextTransfers);
  notice = direct
    ? transferPlanChanged
      ? "החזר לפי מי ששילם הופעל וההעברות עודכנו."
      : "החזר לפי מי ששילם הופעל. במקרה הזה סכומי ההעברות כבר היו זהים."
    : transferPlanChanged
      ? "קיזוז חכם הופעל ומספר ההעברות צומצם."
      : "קיזוז חכם הופעל. במקרה הזה כבר לא ניתן לצמצם עוד העברות.";
  render();
  reactivateDialogAfterRender(
    ".event-modal",
    `[data-action="set-event-repayment-mode"][data-repayment-mode="${mode}"]`
  );
  const result = await persistState({
    awaitCloud: true,
    forceSharedEventIds: [eventId]
  });
  if (eventRepaymentModeRequestVersions.get(eventId) !== requestVersion) return;
  eventRepaymentModeRequestVersions.delete(eventId);
  if (!result?.ok) {
    state = setEventDirectSettlementTransfers(
      state,
      eventId,
      previousDirect
    );
    notice = result?.error?.code === "SHARED_EVENT_MEMBERSHIP_REVOKED"
      ? "הגישה שלך לאירוע בוטלה. רעננו את המסך."
      : "לא הצלחנו לשנות את אופן ההחזר. לא בוצע שינוי.";
    render();
    reactivateDialogAfterRender(
      ".event-modal",
      `[data-action="set-event-repayment-mode"][data-repayment-mode="${mode}"]`
    );
    return;
  }
  requestAnimationFrame(() => {
    app
      .querySelector(
        `[data-action="set-event-repayment-mode"][data-repayment-mode="${mode}"]`
      )
      ?.focus({ preventScroll: true });
  });
}

function settlementTransferPlanKey(transfers) {
  return (transfers ?? [])
    .filter((transfer) => transfer?.status !== "paid")
    .map((transfer) =>
      [
        transfer.fromParticipantId,
        transfer.toParticipantId,
        transfer.amount
      ].join(":")
    )
    .sort()
    .join("|");
}

function refreshStartupSharedState(refreshRequest) {
  if (!refreshRequest) return Promise.resolve();
  const saveRevisionAtRequest = sharedStateSaveRevision();
  return refreshRequest
    .then((sharedState) => {
      if (!appBootHydrated) return;
      // A user save that began after this refresh makes its payload stale.
      // This is especially important after returning from a camera or gallery,
      // where the native resume refresh can finish after the new image is saved.
      if (saveRevisionAtRequest !== sharedStateSaveRevision()) return;
      const nextState = syncLocalProfile(sharedState);
      if (!hasSharedStateChanged(state, nextState)) return;
      state = nextState;
      render();
    })
    .catch(() => {});
}

function renderScopedLocalFallback(error) {
  const deferred =
    navigator.onLine === false ||
    /failed to fetch|fetch failed|network|connection|internet|timeout|timed out/i
      .test(String(error?.message ?? ""));
  (deferred ? emitOperationDeferred : emitOperationFailure)(
    "state_load",
    { screen: "boot", error }
  );
  localProfile = loadLocalProfile();
  profileNameDraft = localProfile?.displayName ?? "";
  profileAvatarDraft =
    normalizeAvatarPreset(localProfile?.avatarPreset) || AVATAR_PRESETS[0].id;
  profileAvatarImageDraft = normalizeAvatarImage(localProfile?.avatarImage);
  state = syncLocalProfile(loadState());
  appBootHydrated = true;
  render();
}

function requestResumeSync({ force = false, includeSecondary = true } = {}) {
  if (resumeSyncRequest) {
    return force
      ? queueForcedResumeSync({ includeSecondary })
      : resumeSyncRequest;
  }
  if (!force && Date.now() - lastResumeSyncAt < RESUME_SYNC_COOLDOWN_MS) {
    return Promise.resolve();
  }

  lastResumeSyncAt = Date.now();
  const saveRevisionAtRequest = sharedStateSaveRevision();
  resumeSyncRequest = loadSharedState()
    .then((sharedState) => {
      if (saveRevisionAtRequest !== sharedStateSaveRevision()) {
        void queueForcedResumeSync({ includeSecondary: false });
        return;
      }
      const nextState = syncLocalProfile(sharedState);
      if (!hasSharedStateChanged(state, nextState)) return;
      state = nextState;
      render();
    })
    .then(() => includeSecondary
      ? Promise.all([
          refreshFriendNetwork(),
          refreshNotificationInbox({ force: true })
        ])
      : undefined)
    .catch(() => {})
    .finally(() => {
      resumeSyncRequest = null;
    });

  return resumeSyncRequest;
}

function queueForcedResumeSync({ includeSecondary = false } = {}) {
  resumeSyncFollowUpPending = true;
  resumeSyncFollowUpIncludeSecondary ||= includeSecondary;
  if (resumeSyncFollowUpRequest) return resumeSyncFollowUpRequest;

  const activeRequest = resumeSyncRequest ?? Promise.resolve();
  resumeSyncFollowUpRequest = Promise.resolve(activeRequest)
    .catch(() => {})
    .then(() => {
      const shouldIncludeSecondary = resumeSyncFollowUpIncludeSecondary;
      resumeSyncFollowUpPending = false;
      resumeSyncFollowUpIncludeSecondary = false;
      return requestResumeSync({
        force: true,
        includeSecondary: shouldIncludeSecondary
      });
    })
    .finally(() => {
      resumeSyncFollowUpRequest = null;
      if (resumeSyncFollowUpPending) {
        void queueForcedResumeSync({
          includeSecondary: resumeSyncFollowUpIncludeSecondary
        });
      }
    });

  return resumeSyncFollowUpRequest;
}

function requestVisibleEventSync() {
  if (
    document.visibilityState !== "visible" ||
    !appBootHydrated ||
    !VISIBLE_BACKGROUND_SYNC_SCREENS.has(screen.name) ||
    expenseDraft ||
    eventDialog?.kind === "note-editor" ||
    profileNameEditing ||
    profileUsernameEditing ||
    groupDraft ||
    editingGroupDraft ||
    mergeParticipantsDraft
  ) {
    return Promise.resolve();
  }

  return requestResumeSync({ includeSecondary: false });
}

bootstrapApp();
