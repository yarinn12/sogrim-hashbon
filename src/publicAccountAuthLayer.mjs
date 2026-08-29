import { iconSvg } from "./uiIcons.mjs";

import {
  ACCOUNT_OAUTH_FLOW_QUERY_PARAM,
  ACCOUNT_RECOVERY_FLOW_PURPOSE,
  clearAccountRecoverySession,
  ACCOUNT_RETURN_URL_STORAGE_KEY,
  ACCOUNT_SESSION_STORAGE_KEY,
  ACCOUNT_SESSION_SYNC_STORAGE_KEY,
  accountAuthErrorMessage,
  appleOAuthUrl,
  authCallbackType,
  accountProfileFromUser,
  clearAccountOAuthFlow,
  clearAccountOAuthFlows,
  clearAccountSession,
  clearAccountWorkspace,
  createAccountOAuthFlowId,
  createOAuthPkce,
  deleteAccount,
  ensureAccountWorkspace,
  exchangeOAuthCode,
  loadAccountOAuthFlow,
  loadAccountRecoverySession,
  loadAccountUser,
  loadStoredAccountSession,
  normalizeAccountEmail,
  parseAccountSessionSync,
  publishAccountSessionSync,
  refreshAccountSession,
  requestPasswordReset,
  resendSignupConfirmation,
  saveAccountOAuthFlow,
  saveAccountRecoverySession,
  saveAccountSession,
  sessionFromOAuthHash,
  signInWithIdToken,
  signInWithPassword,
  signOutAccount,
  signUpWithPassword,
  updateAccountPassword,
  updateAccountUser
} from "./data/accountAuth.mjs";
import {
  clearLocalAccountData,
  getActiveCloudSpaceId,
  loadLocalProfile,
  loadRuntimeConfig,
  loadState,
  loadSharedStateForStartup,
  retryRuntimeConfig,
  runtimeConfigUsesFallback,
  saveLocalProfile,
  saveSharedState
} from "./data/localStore.mjs";
import { hasSharedStateChanged } from "./data/localIdentity.mjs";
import {
  clearPendingInviteUrl,
  pendingInviteUrl,
  rememberPendingInviteUrl
} from "./data/pendingInvite.mjs";
import {
  parseInviteEventId,
  parseInviteSnapshot
} from "./domain/inviteLinks.mjs";
import {
  isEventInviteError,
  resolveEventInviteCredentials
} from "./data/eventInvites.mjs";
import {
  mergeSharedEventIntoState,
  readSharedEventState
} from "./data/sharedEventStore.mjs";
import { submitAppFeedback } from "./data/appFeedback.mjs";
import { setFriendUsername } from "./data/friendsStore.mjs";
import { markStartupMilestone } from "./data/startupMetrics.mjs";
import { emitOperationFailure } from "./data/productMetrics.mjs";
import {
  ensureNamedParticipant,
  isFullProfileName,
  normalizeProfileName,
  normalizeProfileUpdatedAt
} from "./domain/userProfile.mjs";
import { normalizeAvatarImage } from "./domain/avatarPresets.mjs";
import { resolveProfileAvatar } from "./domain/profileAvatarSync.mjs";
import {
  normalizeUsername,
  usernameValidationMessage
} from "./domain/usernames.mjs";

const GATE_ID = "public-account-auth-gate";
const STYLE_ID = "public-account-auth-style";
const AUTH_CHANGED_MARKER = "settle-friends-account-ready";
const ACCOUNT_DELETED_MARKER = "settle-friends-account-deleted";
const ACCOUNT_NOTICE_MARKER = "settle-friends-account-notice";
const SKIP_NEXT_SPLASH_MARKER = "settle-friends-skip-next-splash";
const APP_NOTICE_EVENT = "settle-friends:notice";
const ACCOUNT_SETUP_TIMEOUT_MS = 12_000;
const ACCOUNT_DELETE_HISTORY_KEY = "settleFriendsAccountDelete";
const ACCOUNT_FEEDBACK_HISTORY_KEY = "settleFriendsAccountFeedback";
const NATIVE_BACK_EVENT = "settle-friends:native-back";
const ACCOUNT_REFRESH_MARGIN_SECONDS = 5 * 60;
const ACCOUNT_REFRESH_RETRY_MS = 60_000;
const ACCOUNT_CONFIG_RETRY_MS = 5_000;
const EMPTY_ACCOUNT_CLOUD_WAIT_MS = 8_000;
const OAUTH_PKCE_VERIFIER_KEY = "settle-friends-oauth-pkce-verifier";
const GOOGLE_IDENTITY_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

let runtimeConfig = null;
let accountSession = null;
let googleEnabled = false;
let appleEnabled = false;
let authBusy = false;
let accountDeleteBusy = false;
let emailAuthExpanded = false;
let accountDeleteReturnFocus = null;
let accountDeleteHistoryActive = false;
let accountDeleteHistoryClosing = false;
let accountFeedbackBusy = false;
let accountFeedbackReturnFocus = null;
let accountFeedbackHistoryActive = false;
let accountFeedbackHistoryClosing = false;
let accountRefreshTimer = null;
let accountRefreshPromise = null;
let accountRefreshGeneration = 0;
let accountConfigRetryTimer = null;
let accountConfigRetryPromise = null;
let accountSyncReloadScheduled = false;
let nativeGoogleLoginPromise = null;
let webGoogleScriptPromise = null;
let webGoogleInitializationPromise = null;
let webGoogleInitializationClientId = "";
let webGoogleInitialized = false;
let webGoogleClientId = "";
let webGoogleNonce = "";

globalThis.SogrimAccountProfile = Object.freeze({
  updateDisplayName: updateSignedInAccountDisplayName,
  updateProfile: updateSignedInAccountProfile
});
globalThis.SogrimAccountSession = Object.freeze({
  refresh: refreshActiveAccountSession
});

rememberPendingInviteUrl();
injectStyle();
document.documentElement.classList.add("account-auth-locked");
lockAccountGate();
const accountSetupTimeoutId = window.setTimeout(
  handleAccountSetupTimeout,
  ACCOUNT_SETUP_TIMEOUT_MS
);
setupAccountAuth()
  .catch(handleAccountSetupFailure)
  .finally(() => window.clearTimeout(accountSetupTimeoutId));
document.addEventListener("click", handleAccountClick);
document.addEventListener("change", handleAccountChange);
document.addEventListener("keydown", handleAccountGateKeydown);
document.addEventListener("keydown", handleAccountDeletionKeydown);
document.addEventListener("keydown", handleAccountFeedbackKeydown);
window.addEventListener("popstate", handleAccountDeletionHistoryBack, true);
window.addEventListener("popstate", handleAccountFeedbackHistoryBack, true);
window.addEventListener(NATIVE_BACK_EVENT, handleAccountGateNativeBack, true);
window.addEventListener(NATIVE_BACK_EVENT, handleAccountDeletionNativeBack, true);
window.addEventListener(NATIVE_BACK_EVENT, handleAccountFeedbackNativeBack, true);
window.addEventListener("online", refreshAccountSessionIfNeeded);
window.addEventListener("storage", handleAccountSessionStorageSync);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshAccountSessionIfNeeded();
});

function handleAccountSetupFailure(error) {
  emitOperationFailure("auth", { screen: "auth", error });
  if (runtimeConfig?.storage?.mode === "supabase") {
    const storedSession = accountSession ?? loadStoredAccountSession();
    if (storedSession) {
      accountSession = storedSession;
      renderAccountRecoveryGate();
      return;
    }
    renderAccountGate({
      error: "לא הצלחנו להתחבר לשירות החשבון כרגע. כדאי לבדוק את החיבור ולנסות שוב."
    });
    return;
  }
  unlockAccountGate();
}

function handleAccountSetupTimeout() {
  if (!document.documentElement.classList.contains("account-auth-pending")) return;
  renderAccountRecoveryGate();
}

async function setupAccountAuth({ retryConfig = false } = {}) {
  runtimeConfig = await (retryConfig ? retryRuntimeConfig() : loadRuntimeConfig());
  if (runtimeConfigUsesFallback() && !isLocalDevelopmentOrigin()) {
    renderAccountRecoveryGate();
    return;
  }
  if (runtimeConfig.storage?.mode !== "supabase") {
    unlockAccountGate();
    return;
  }

  const callbackParams = new URLSearchParams(window.location.search);
  const callbackCode = callbackParams.get("code");
  const callbackFlowId = callbackParams.get(ACCOUNT_OAUTH_FLOW_QUERY_PARAM) ?? "";
  const callbackFlow = loadAccountOAuthFlow(callbackFlowId);
  const callbackType = authCallbackType(window.location.hash);
  const fragmentSession = sessionFromOAuthHash(window.location.hash);
  // Provider sign-in must return through the state-bound PKCE code flow below.
  // Recovery sessions are accepted only for the locally initiated reset attempt.
  const validRecoveryCallback =
    callbackType === "recovery" &&
    fragmentSession &&
    callbackFlow?.purpose === ACCOUNT_RECOVERY_FLOW_PURPOSE;
  let callbackSession = validRecoveryCallback ? fragmentSession : null;
  if (fragmentSession && !callbackSession) {
    if (callbackFlowId) clearAccountOAuthFlow(callbackFlowId);
    cleanAuthHash(callbackFlow);
  }
  let sessionBeforeCallback = null;
  if (!callbackSession && callbackCode) {
    const verifier = callbackFlow?.purpose === "oauth"
      ? callbackFlow.verifier
      : (callbackFlowId ? "" : oauthPkceVerifier());
    if (verifier) {
      callbackSession = await exchangeOAuthCode(
        runtimeConfig,
        callbackCode,
        verifier
      );
      if (callbackFlowId) clearAccountOAuthFlow(callbackFlowId);
      clearOAuthPkceVerifier();
    }
  }
  if (callbackSession) {
    sessionBeforeCallback = loadStoredAccountSession();
    accountSession = callbackSession;
    cleanAuthHash(callbackFlow);
  } else {
    accountSession = loadStoredAccountSession();
  }

  if (accountSession) {
    try {
      accountSession = await restoreAccountSession(accountSession, {
        previousSession: sessionBeforeCallback,
        expectedEmail: validRecoveryCallback ? callbackFlow.email : ""
      });
      const recoverySessionActive = validRecoveryCallback
        ? saveAccountRecoverySession(accountSession)
        : (!callbackSession && loadAccountRecoverySession(accountSession));
      if (validRecoveryCallback && callbackFlowId) {
        clearAccountOAuthFlow(callbackFlowId);
      }
      scheduleAccountSessionRefresh();
      if (recoverySessionActive) {
        renderPasswordResetGate();
        return;
      }
      await connectAccountToApp(accountSession, {
        forceReload: Boolean(callbackSession)
      });
      watchAccountControls();
      enhanceAccountControls();
      return;
    } catch (error) {
      if (
        accountSession?.user &&
        accountProfileNeedsCompletion(error)
      ) {
        const accountProfile = accountProfileFromUser(accountSession.user);
        renderAccountNameCompletionGate({
          displayName: accountProfile?.displayName ?? "",
          username: accountProfile?.username ?? ""
        });
        return;
      }
      if (accountSession?.user && isEventInviteError(error)) {
        rememberAccountNotice(error?.message);
        discardFailedInviteContext();
        await connectAccountToApp(accountSession, {
          forceReload: Boolean(callbackSession),
          ignoreInvite: true
        });
        watchAccountControls();
        enhanceAccountControls();
        return;
      }
      if (canResumeOffline(accountSession, error)) {
        resumeAccountLocally(accountSession);
        watchAccountControls();
        enhanceAccountControls();
        return;
      }
      if (accountSession && isTransientAccountError(error)) {
        saveAccountSession(accountSession);
        renderAccountRecoveryGate();
        return;
      }
      if (
        accountSession?.refresh_token &&
        isUnauthorizedAccountError(error)
      ) {
        try {
          accountSession = await refreshAccountSession(runtimeConfig, accountSession);
          accountSession = saveAccountSession(accountSession);
          scheduleAccountSessionRefresh();
          await connectAccountToApp(accountSession, {
            forceReload: Boolean(callbackSession)
          });
          watchAccountControls();
          enhanceAccountControls();
          return;
        } catch (refreshError) {
          if (accountSession && isTransientAccountError(refreshError)) {
            saveAccountSession(accountSession);
            renderAccountRecoveryGate();
            return;
          }
        }
      }
      if (
        callbackSession &&
        callbackFlow?.purpose === "oauth" &&
        !accountSession?.user &&
        isTransientAccountError(error)
      ) {
        saveAccountSession(accountSession);
        renderAccountRecoveryGate();
        return;
      }
      // A terminal session failure invalidates credentials, not the user's
      // durable local outbox. Keep the account-scoped state and pending sync
      // so signing back into the same account can safely reconcile it.
      clearAccountSession();
      clearAccountRecoverySession();
      accountSession = null;
    }
  }

  removeSessionValue(AUTH_CHANGED_MARKER);
  const accountDeleted = sessionValue(ACCOUNT_DELETED_MARKER) === "1";
  removeSessionValue(ACCOUNT_DELETED_MARKER);
  googleEnabled = Boolean(
    runtimeConfig.auth?.googleClientId ||
    runtimeConfig.launch?.googleAuthReady
  );
  appleEnabled = false;
  emailAuthExpanded = !googleEnabled && !appleEnabled;
  // Start preparing Google before the gate is painted. On slower phones the
  // old flow could consume the first tap merely loading the provider SDK, so
  // the account picker only appeared after another tap.
  if (googleEnabled) {
    if (isNativeAndroid()) {
      prepareNativeGoogleSignIn().catch(() => {});
    } else {
      initializeWebGoogleIdentity().catch(() => {});
    }
  }
  renderAccountGate({
    message: accountDeleted ? "החשבון והמידע האישי שלך נמחקו." : ""
  });
  refreshProviderOptions().catch(() => {});
}

function isLocalDevelopmentOrigin() {
  return (
    window.location.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  );
}

async function restoreAccountSession(
  session,
  { previousSession = null, expectedEmail = "" } = {}
) {
  let nextSession = session;
  if (isExpiring(session)) {
    nextSession = await refreshAccountSession(runtimeConfig, session);
  }
  // User metadata can be repaired server-side while an installed PWA still
  // holds an older session object. Always refresh the authenticated user so a
  // corrected workspace becomes active without requiring sign-out.
  const user = await loadAccountUser(runtimeConfig, nextSession);
  nextSession = { ...nextSession, user };
  const normalizedExpectedEmail = String(expectedEmail).trim().toLowerCase();
  const normalizedSessionEmail = String(nextSession?.user?.email ?? "")
    .trim()
    .toLowerCase();
  if (
    normalizedExpectedEmail &&
    normalizedSessionEmail !== normalizedExpectedEmail
  ) {
    const error = new Error(
      "Recovery session does not match the requested account"
    );
    error.status = 403;
    throw error;
  }
  const switchedAccount = clearPreviousAccountAfterSwitch(
    previousSession,
    nextSession
  );
  nextSession = await ensureAccountWorkspace(runtimeConfig, nextSession);
  if (switchedAccount) {
    publishAccountSessionSync(nextSession, { reason: "switching" });
  }
  return saveAccountSession(nextSession);
}

function clearPreviousAccountAfterSwitch(previousSession, nextSession) {
  const previousUserId = String(previousSession?.user?.id ?? "").trim();
  const nextUserId = String(nextSession?.user?.id ?? "").trim();
  if (!previousUserId || !nextUserId || previousUserId === nextUserId) {
    return false;
  }

  clearLocalAccountData(
    getActiveCloudSpaceId(runtimeConfig),
    previousUserId
  );
  clearAccountWorkspace(previousSession.user);
  return true;
}

function accountProfileNeedsCompletion(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("full name") || message.includes("username");
}

async function connectAccountToApp(
  session,
  { forceReload = false, ignoreInvite = false } = {}
) {
  runtimeConfig = await loadRuntimeConfig();
  const accountProfile = accountProfileFromUser(session.user);
  const previousProfile = loadLocalProfile();
  const displayName = normalizeProfileName(accountProfile?.displayName);
  if (!accountProfile || !isFullProfileName(displayName)) {
    throw new Error("Account profile needs a full name");
  }
  if (!normalizeUsername(accountProfile.username)) {
    throw new Error("Account profile needs a username");
  }
  await setFriendUsername(runtimeConfig, accountProfile.username);

  const inviteUrl = ignoreInvite ? "" : pendingInviteUrl(window.location.href);
  const invitedEventId = parseInviteEventId(inviteUrl);
  const localAccountState = loadState();
  const localAccountHasHistory = Boolean(
    localAccountState.events?.length ||
    localAccountState.groups?.length ||
    localAccountState.friendContacts?.length
  );
  const startupState = await loadSharedStateForStartup({
    maxWaitMs: localAccountHasHistory ? 0 : EMPTY_ACCOUNT_CLOUD_WAIT_MS
  });
  let sharedState = startupState.state;
  let verifiedInvitedEventId = "";
  const inviteCredentials = invitedEventId
    ? await resolveEventInviteCredentials(runtimeConfig, inviteUrl)
    : null;
  if (invitedEventId && inviteCredentials) {
    try {
      const remoteEvent = await readSharedEventState(
        runtimeConfig,
        inviteCredentials,
        invitedEventId
      );
      if (remoteEvent) {
        sharedState = mergeSharedEventIntoState(
          sharedState,
          remoteEvent,
          inviteCredentials
        );
        verifiedInvitedEventId = invitedEventId;
      }
    } catch {
      // Keep the invite URL available until connectivity returns.
    }
  }
  const storedProfile = loadLocalProfile();
  const storedAvatarImage =
    storedProfile?.participantId === accountProfile.participantId
      ? normalizeAvatarImage(storedProfile.avatarImage)
      : "";
  const sharedAccountParticipant = sharedState.participants.find(
    (participant) => participant.id === accountProfile.participantId
  );
  const storedProfileUpdatedAt = normalizeProfileUpdatedAt(
    storedProfile?.profileUpdatedAt
  );
  const sharedProfileUpdatedAt = normalizeProfileUpdatedAt(
    sharedAccountParticipant?.profileUpdatedAt
  );
  const sharedProfileIsNewer = Boolean(
    sharedProfileUpdatedAt &&
    (
      !storedProfileUpdatedAt ||
      Date.parse(sharedProfileUpdatedAt) > Date.parse(storedProfileUpdatedAt)
    )
  );
  const avatarResolution = resolveProfileAvatar(
    {
      avatarImage: storedAvatarImage,
      avatarImageUpdatedAt:
        storedProfile?.participantId === accountProfile.participantId
          ? storedProfile?.avatarImageUpdatedAt
          : ""
    },
    {
      avatarImage: sharedAccountParticipant?.avatarImage,
      avatarImageUpdatedAt: sharedAccountParticipant?.avatarImageUpdatedAt
    }
  );
  const accountAvatarImage = normalizeAvatarImage(accountProfile.avatarImage);
  const resolvedAvatarImage =
    avatarResolution.avatarImage ||
    (
      !avatarResolution.avatarImageUpdatedAt
        ? accountAvatarImage
        : ""
    );
  const resolvedAvatarImageUpdatedAt = avatarResolution.avatarImageUpdatedAt;
  const resolvedAvatarPreset = sharedProfileIsNewer
    ? sharedAccountParticipant?.avatarPreset
    : storedProfile?.avatarPreset;
  const resolvedProfileUpdatedAt = sharedProfileIsNewer
    ? sharedProfileUpdatedAt
    : storedProfileUpdatedAt;
  const nextState = ensureNamedParticipant(
    sharedState,
    {
      id: accountProfile.participantId,
      displayName,
      ...(resolvedAvatarImage || resolvedAvatarImageUpdatedAt || sharedProfileIsNewer
        ? { avatarImage: resolvedAvatarImage }
        : {}),
      ...(resolvedAvatarImageUpdatedAt
        ? { avatarImageUpdatedAt: resolvedAvatarImageUpdatedAt }
        : {}),
      avatarPreset: resolvedAvatarPreset,
      profileUpdatedAt: resolvedProfileUpdatedAt,
      authProvider: accountProfile.authProvider,
      authSubject: accountProfile.authSubject,
      email: accountProfile.email
    },
    verifiedInvitedEventId,
    { reactivateInactive: false }
  );
  const participant = nextState.participants.find(
    (item) => item.id === nextState.currentParticipantId
  );

  saveLocalProfile({
    participantId: nextState.currentParticipantId,
    displayName: participant?.displayName ?? displayName,
    avatarImage: participant?.avatarImage ?? resolvedAvatarImage,
    avatarImageUpdatedAt:
      participant?.avatarImageUpdatedAt ?? resolvedAvatarImageUpdatedAt,
    avatarPreset: participant?.avatarPreset,
    profileUpdatedAt: normalizeProfileUpdatedAt(participant?.profileUpdatedAt),
    authProvider: accountProfile.authProvider,
    authSubject: accountProfile.authSubject,
    email: accountProfile.email
  });
  const profileChanged =
    previousProfile?.authSubject !== accountProfile.authSubject ||
    previousProfile?.authProvider !== accountProfile.authProvider;
  const accountStateChanged = hasSharedStateChanged(
    startupState.state,
    nextState
  );
  const saveRequest = accountStateChanged
    ? saveSharedState(nextState, {
        suppressRevertNotice: true,
        // A first OAuth connection or an account switch reloads the document
        // below. Wait for the personal workspace write so that the reload
        // cannot abort it and leave account metadata pointing at no snapshot.
        awaitCloud: forceReload || profileChanged
      })
    : Promise.resolve({ ok: true, mode: "unchanged" });
  const saveResult = await saveRequest;
  const invitedEventWasDeleted = nextState.deletedEvents?.some(
    (item) => item.id === verifiedInvitedEventId
  );
  if (
    !invitedEventId ||
    verifiedInvitedEventId &&
      (
        invitedEventWasDeleted ||
        nextState.events.some((event) => event.id === verifiedInvitedEventId)
      ) &&
      (saveResult?.ok || saveResult?.partial)
  ) {
    clearPendingInviteUrl();
    clearAccountReturnUrl();
  }
  if (forceReload || profileChanged) {
    publishAccountSessionSync(accountSession);
    setSessionValue(AUTH_CHANGED_MARKER, "1");
    setSessionValue(SKIP_NEXT_SPLASH_MARKER, "1");
    window.location.reload();
    return;
  }

  document.getElementById(GATE_ID)?.remove();
  document.querySelector(".public-profile-gate")?.remove();
  document.documentElement.classList.remove("account-auth-locked");
  document.querySelector("#app")?.removeAttribute("inert");
  markAccountAuthReady();
  publishAccountSessionSync(accountSession);
  deliverPendingAccountNotice();
  saveRequest.catch(() => {});
}

function discardFailedInviteContext() {
  clearPendingInviteUrl();
  clearAccountReturnUrl();
  try {
    const url = new URL(window.location.href);
    url.pathname = "/";
    url.hash = "";
    for (const key of ["event", "space", "key", "invite", "t"]) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // Clearing the remembered invite is enough when the address is unavailable.
  }
}

function rememberAccountNotice(message) {
  const normalized = String(message ?? "").trim();
  if (normalized) setSessionValue(ACCOUNT_NOTICE_MARKER, normalized);
}

function deliverPendingAccountNotice() {
  const message = String(sessionValue(ACCOUNT_NOTICE_MARKER) ?? "").trim();
  if (!message) return;
  removeSessionValue(ACCOUNT_NOTICE_MARKER);
  window.setTimeout(() => {
    document.dispatchEvent(
      new CustomEvent(APP_NOTICE_EVENT, { detail: { message } })
    );
  }, 0);
}

function handleAccountSessionStorageSync(event) {
  if (
    ![ACCOUNT_SESSION_STORAGE_KEY, ACCOUNT_SESSION_SYNC_STORAGE_KEY].includes(
      event.key
    ) ||
    (event.storageArea && event.storageArea !== window.localStorage)
  ) {
    return;
  }

  const storedSession = loadStoredAccountSession();
  const currentUserId = String(accountSession?.user?.id ?? "").trim();
  const storedUserId = String(storedSession?.user?.id ?? "").trim();
  if (event.key === ACCOUNT_SESSION_STORAGE_KEY) {
    if (accountSyncReloadScheduled) return;
    if (currentUserId && currentUserId === storedUserId) {
      accountSession = storedSession;
      scheduleAccountSessionRefresh();
      return;
    }
    lockForAccountSessionChange();
    return;
  }

  const change = parseAccountSessionSync(event.newValue);
  if (!change || accountSyncReloadScheduled) return;
  if (change.reason === "switching") {
    if (change.userId !== currentUserId) lockForAccountSessionChange();
    return;
  }
  if (change.reason === "signed-in" && change.userId !== storedUserId) return;

  if (currentUserId && currentUserId === storedUserId) {
    accountSession = storedSession;
    scheduleAccountSessionRefresh();
    return;
  }

  lockForAccountSessionChange();
}

function resumeAccountLocally(session) {
  const accountProfile = accountProfileFromUser(session?.user);
  if (
    !accountProfile?.participantId ||
    !isFullProfileName(accountProfile.displayName) ||
    !normalizeUsername(accountProfile.username)
  ) {
    renderAccountNameCompletionGate({
      displayName: accountProfile?.displayName ?? "",
      username: accountProfile?.username ?? ""
    });
    return;
  }

  saveAccountSession(session);
  const storedProfile = loadLocalProfile();
  const storedAvatarImage =
    storedProfile?.participantId === accountProfile.participantId
      ? normalizeAvatarImage(storedProfile.avatarImage)
      : "";
  saveLocalProfile({
    participantId: accountProfile.participantId,
    displayName: accountProfile.displayName,
    avatarImage:
      normalizeAvatarImage(accountProfile.avatarImage) || storedAvatarImage,
    authProvider: accountProfile.authProvider,
    authSubject: accountProfile.authSubject,
    email: accountProfile.email
  });
  unlockAccountGate();
  publishAccountSessionSync(session);
}

function lockForAccountSessionChange() {
  if (accountSyncReloadScheduled) return;
  clearPendingInviteUrl();
  clearAccountReturnUrl();
  clearAccountOAuthFlows();
  accountSyncReloadScheduled = true;
  accountRefreshGeneration += 1;
  accountSession = null;
  authBusy = true;
  window.clearTimeout(accountRefreshTimer);
  document.documentElement.classList.add("account-auth-locked");
  lockAccountGate();
  removeSessionValue(AUTH_CHANGED_MARKER);
  setSessionValue(SKIP_NEXT_SPLASH_MARKER, "1");
  window.setTimeout(() => window.location.reload(), 0);
}

async function updateSignedInAccountDisplayName(value) {
  return updateSignedInAccountProfile({ displayName: value });
}

async function updateSignedInAccountProfile({
  displayName: value,
  username,
  avatarImage
} = {}) {
  const displayName = normalizeProfileName(value);
  if (
    !isFullProfileName(displayName) ||
    !accountSession?.user ||
    runtimeConfig?.storage?.mode !== "supabase"
  ) {
    return false;
  }

  const currentMetadata = accountSession.user.user_metadata ?? {};
  const normalizedAvatarImage = normalizeAvatarImage(
    avatarImage ?? currentMetadata.avatar_image
  );
  // A gallery image is a large data URL. Keeping it in auth metadata bloats every
  // refreshed JWT and can make an otherwise valid sign-in/profile update fail.
  // Gallery avatars are persisted in the shared state and user_profiles instead.
  const accountMetadataAvatarImage = normalizedAvatarImage.startsWith("https://")
    ? normalizedAvatarImage
    : null;
  const normalizedUsername = normalizeUsername(
    username ?? currentMetadata.username
  );
  accountSession = saveAccountSession(
    await updateAccountUser(runtimeConfig, accountSession, {
      ...currentMetadata,
      full_name: displayName,
      name: displayName,
      display_name: displayName,
      username: normalizedUsername || null,
      avatar_image: accountMetadataAvatarImage
    })
  );
  scheduleAccountSessionRefresh();
  return true;
}

function lockAccountGate() {
  document.querySelector(".public-profile-gate")?.remove();
  document.getElementById(GATE_ID)?.remove();
  document.querySelector("#app")?.setAttribute("inert", "");
}

function unlockAccountGate() {
  document.getElementById(GATE_ID)?.remove();
  document.documentElement.classList.remove("account-auth-locked");
  document.querySelector("#app")?.removeAttribute("inert");
  markAccountAuthReady();
}

function renderAccountGate({
  mode = "login",
  message = "",
  error = "",
  errorFieldName = "",
  showVerificationResend = false,
  values = {}
} = {}) {
  const emailDeliveryReady = runtimeConfig?.launch?.authEmailDeliveryReady === true;
  if (mode === "signup" && !emailDeliveryReady) mode = "login";
  document.querySelector(".public-profile-gate")?.remove();
  document.getElementById(GATE_ID)?.remove();
  document.querySelector("#app")?.setAttribute("inert", "");

  const inviteContext = accountInviteContext();
  const inviteMarkup = accountInviteMarkup(inviteContext);
  const heading = inviteContext
    ? `מצטרפים ל־${escapeHtml(inviteContext.eventName)}`
    : mode === "signup"
      ? "יוצרים חשבון"
      : "טוב שחזרת";
  const headingDescription = inviteContext
    ? "נכנסים או נרשמים, ומיד ממשיכים לאירוע שקיבלת."
    : mode === "signup"
      ? "שם מלא, שם משתמש ומייל שומרים את ההיסטוריה שלך ומאפשרים לחברים למצוא אותך."
      : "נכנסים וממשיכים בדיוק מהמקום שבו עצרת.";
  const providerAvailable = googleEnabled || appleEnabled;
  const showEmailAuth =
    emailAuthExpanded ||
    !providerAvailable ||
    mode === "signup" ||
    Boolean(message) ||
    Boolean(error);
  const safeErrorFieldName = /^[a-zA-Z][\w-]*$/.test(errorFieldName)
    ? errorFieldName
    : "";
  const fieldErrorAttributes = (fieldName) =>
    safeErrorFieldName === fieldName
      ? 'aria-invalid="true" aria-describedby="account-auth-feedback"'
      : 'aria-invalid="false"';
  const gate = document.createElement("section");
  gate.id = GATE_ID;
  gate.className = "account-auth-gate font-hebrew";
  gate.setAttribute("role", "main");
  gate.innerHTML = `
    <div class="account-auth-shell">
      <section class="account-auth-brand">
        <span class="account-auth-mark" aria-hidden="true"><img src="./icon-192.png" alt="" width="50" height="50" /></span>
        <div>
          <p class="eyebrow">סוגרים חשבון</p>
          <h1>החשבון נשאר איתך</h1>
          <p>האירועים, ההוצאות והחברים נשמרים בענן ומחכים לך בכל מכשיר.</p>
        </div>
        <ul>
          <li>היסטוריה אישית שנשמרת בענן</li>
          <li>כניסה מאובטחת ושמירת מידע בענן</li>
          <li>קישורי הצטרפות ממשיכים לעבוד כרגיל</li>
        </ul>
      </section>

      <section class="account-auth-form-panel">
        ${inviteMarkup}
        <div class="account-auth-heading">
          <h2>${heading}</h2>
          <p>${headingDescription}</p>
        </div>

        <div class="account-google-slot" data-google-auth-slot>
          ${providerOptionsMarkup()}
        </div>

        ${
          providerAvailable && mode === "login"
            ? `<button
                class="account-email-toggle"
                type="button"
                data-account-action="toggle-email"
                aria-expanded="${showEmailAuth}"
                aria-controls="account-email-auth"
              >${showEmailAuth ? "חזרה לאפשרויות הכניסה" : "כניסה עם אימייל"}</button>`
            : ""
        }

        <div id="account-email-auth" class="account-email-auth" ${showEmailAuth ? "" : "hidden"}>
          <div class="account-auth-tabs" role="group" aria-label="כניסה או הרשמה">
            <button type="button" data-account-mode="login" aria-pressed="${mode === "login"}" class="${mode === "login" ? "is-active" : ""}">התחברות</button>
            ${emailDeliveryReady ? `<button type="button" data-account-mode="signup" aria-pressed="${mode === "signup"}" class="${mode === "signup" ? "is-active" : ""}">הרשמה</button>` : ""}
          </div>

          <form class="account-auth-form" data-account-form data-mode="${mode}" novalidate>
            ${
              mode === "signup"
                ? `<label>
                    <span>שם פרטי ושם משפחה</span>
                    <input name="displayName" autocomplete="name" value="${escapeAttribute(values.displayName ?? "")}" ${fieldErrorAttributes("displayName")} required />
                  </label>
                  <label>
                    <span>שם משתמש</span>
                    <input name="username" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" value="${escapeAttribute(values.username ?? "")}" ${fieldErrorAttributes("username")} required />
                  </label>`
                : ""
            }
            <label>
              <span>אימייל</span>
              <input name="email" type="email" inputmode="email" autocomplete="email" spellcheck="false" value="${escapeAttribute(values.email ?? "")}" ${fieldErrorAttributes("email")} required />
              ${mode === "signup" ? '<small class="account-auth-field-hint">נשלח קישור אימות לכתובת הזו. החשבון יופעל רק אחרי פתיחת הקישור.</small>' : ""}
            </label>
            <label>
              <span>סיסמה</span>
              <span class="account-password-input">
                <input name="password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" minlength="8" ${fieldErrorAttributes("password")} required />
                <button class="account-password-toggle" type="button" data-account-action="toggle-password" aria-label="הצג סיסמה" aria-pressed="false">${iconSvg("eye")}</button>
              </span>
            </label>
            ${
              mode === "login" && emailDeliveryReady
                ? `<button class="account-forgot-button" type="button" data-account-action="forgot-password">שכחתי סיסמה</button>`
                : ""
            }
            ${message ? `<p id="account-auth-feedback" class="account-auth-message" role="status">${escapeHtml(message)}</p>` : ""}
            ${error ? `<p id="account-auth-feedback" class="account-auth-error" role="alert">${escapeHtml(error)}</p>` : ""}
            ${
              showVerificationResend && emailDeliveryReady
                ? `<button class="account-forgot-button" type="button" data-account-action="resend-verification">שלח שוב קישור אימות</button>`
                : ""
            }
            <button class="primary-button account-auth-submit" type="submit">
              ${
                inviteContext
                  ? mode === "signup"
                    ? "צור חשבון והצטרף"
                    : "התחבר והצטרף"
                  : mode === "signup"
                    ? "צור חשבון"
                    : "התחבר"
              }
            </button>
          </form>
        </div>
        <p class="account-auth-legal">בהמשך השימוש אתה מאשר את <a href="./terms.html">תנאי השימוש</a> ואת <a href="./privacy.html">מדיניות הפרטיות</a>.</p>
        <p class="visually-hidden" data-account-auth-status role="status" aria-live="polite"></p>
      </section>
    </div>
  `;
  document.body.append(gate);
  gate.querySelector("form")?.addEventListener("submit", handleAccountSubmit);
  markAccountAuthReady();
  renderWebGoogleButton().catch(() => {});
  if (showEmailAuth) focusAccountInput(gate);
}

function renderAccountRecoveryGate() {
  document.querySelector(".public-profile-gate")?.remove();
  document.getElementById(GATE_ID)?.remove();
  document.querySelector("#app")?.setAttribute("inert", "");

  const gate = document.createElement("section");
  gate.id = GATE_ID;
  gate.className = "account-auth-gate";
  gate.setAttribute("role", "main");
  gate.innerHTML = `
    <div class="account-auth-shell account-auth-shell-compact">
      <section class="account-auth-brand">
        <span class="account-auth-mark" aria-hidden="true"><img src="./icon-192.png" alt="" width="50" height="50" /></span>
        <div>
          <p class="eyebrow">סוגרים חשבון</p>
          <h1>המידע שלך נשאר מוגן</h1>
          <p>לא נציג את האירועים לפני שהחיבור לחשבון הושלם.</p>
        </div>
      </section>
      <section class="account-auth-form-panel">
        <div class="account-auth-heading">
          <h2>החיבור מתעכב</h2>
          <p>כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.</p>
        </div>
        <button class="primary-button account-auth-submit" type="button" data-account-retry>
          נסה שוב
        </button>
      </section>
    </div>
  `;
  document.body.append(gate);
  gate.querySelector("[data-account-retry]")?.addEventListener("click", retryAccountSetup);
  scheduleAccountSetupRetry();
  markAccountAuthReady();
}

function scheduleAccountSetupRetry() {
  window.clearTimeout(accountConfigRetryTimer);
  if (navigator.onLine === false) return;
  accountConfigRetryTimer = window.setTimeout(
    retryAccountSetup,
    ACCOUNT_CONFIG_RETRY_MS
  );
}

function retryAccountSetup() {
  if (accountConfigRetryPromise) return accountConfigRetryPromise;
  window.clearTimeout(accountConfigRetryTimer);
  const gate = document.getElementById(GATE_ID);
  const retryButton = gate?.querySelector("[data-account-retry]");
  retryButton?.setAttribute("aria-busy", "true");
  if (retryButton) retryButton.disabled = true;

  accountConfigRetryPromise = setupAccountAuth({ retryConfig: true })
    .catch(() => {
      renderAccountRecoveryGate();
    })
    .finally(() => {
      accountConfigRetryPromise = null;
      if (!document.querySelector("[data-account-retry]")) {
        window.clearTimeout(accountConfigRetryTimer);
      }
    });
  return accountConfigRetryPromise;
}

function renderAccountNameCompletionGate({
  displayName = "",
  username = "",
  error = "",
  errorFieldName = ""
} = {}) {
  document.querySelector(".public-profile-gate")?.remove();
  document.getElementById(GATE_ID)?.remove();
  document.querySelector("#app")?.setAttribute("inert", "");
  const hasSavedFullName = isFullProfileName(normalizeProfileName(displayName));
  const inviteContext = accountInviteContext();

  const gate = document.createElement("section");
  gate.id = GATE_ID;
  gate.className = "account-auth-gate font-hebrew";
  gate.setAttribute("role", "main");
  gate.innerHTML = `
    <div class="account-auth-shell account-auth-shell-compact">
      <section class="account-auth-brand">
        <span class="account-auth-mark" aria-hidden="true"><img src="./icon-192.png" alt="" width="50" height="50" /></span>
        <div>
          <p class="eyebrow">סוגרים חשבון</p>
          <h1>${inviteContext ? "עוד רגע מצטרפים לאירוע" : "משלימים את החשבון"}</h1>
          <p>${hasSavedFullName ? "נשאר לבחור שם משתמש חד־פעמי כדי שחברים יוכלו לזהות אותך." : "שם מלא ושם משתמש עוזרים לחברים לזהות ולמצוא אותך."}</p>
        </div>
      </section>
      <section class="account-auth-form-panel">
        <div class="account-auth-heading">
          <h2>${hasSavedFullName ? "בחירת שם משתמש" : "איך לקרוא לך?"}</h2>
          <p>${inviteContext ? "אחרי השמירה נמשיך אוטומטית לאירוע מהקישור." : "זהו שלב חד־פעמי, ואחריו ממשיכים לחשבון."}</p>
        </div>
        <form class="account-auth-form" data-account-form data-mode="complete-profile" novalidate>
          ${hasSavedFullName
            ? `<input name="displayName" type="hidden" value="${escapeAttribute(displayName)}" />`
            : `<label>
                <span>שם פרטי ושם משפחה</span>
                <input name="displayName" autocomplete="name" value="${escapeAttribute(displayName)}" />
              </label>`}
          <label>
            <span>שם משתמש</span>
            <input name="username" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" value="${escapeAttribute(username)}" ${errorFieldName === "username" ? 'aria-invalid="true" aria-describedby="account-auth-feedback"' : ""} required />
          </label>
          ${error ? `<p id="account-auth-feedback" class="account-auth-error" role="alert">${escapeHtml(error)}</p>` : ""}
          <button class="primary-button account-auth-submit" type="submit">שמור והמשך</button>
        </form>
        <button class="account-forgot-button" type="button" data-account-action="signout">כניסה עם חשבון אחר</button>
        <p class="visually-hidden" data-account-auth-status role="status" aria-live="polite"></p>
      </section>
    </div>
  `;
  document.body.append(gate);
  gate.querySelector("form")?.addEventListener("submit", handleAccountSubmit);
  markAccountAuthReady();
  focusAccountInput(gate, { includeMobile: true, fieldName: "username" });
}

async function handleAccountSubmit(event) {
  event.preventDefault();
  if (authBusy) return;

  const form = event.currentTarget;
  const mode = form.dataset.mode ?? "login";
  const values = new FormData(form);
  const email = String(values.get("email") ?? "").trim().toLowerCase();
  const password = String(values.get("password") ?? "");
  const usernameValue = String(values.get("username") ?? "");
  const validationError = accountFormValidationError(form, {
    mode,
    email,
    password,
    displayName: String(values.get("displayName") ?? ""),
    username: usernameValue,
    passwordConfirmation: String(values.get("passwordConfirmation") ?? "")
  });
  if (validationError) {
    const displayName = String(values.get("displayName") ?? "");
    if (mode === "complete-profile") {
      renderAccountNameCompletionGate({
        displayName,
        username: usernameValue,
        error: validationError.message,
        errorFieldName: validationError.fieldName
      });
    } else if (mode === "reset-password") {
      renderPasswordResetGate(validationError.message);
    } else {
      renderAccountGate({
        mode,
        values: { email, displayName, username: usernameValue },
        error: validationError.message,
        errorFieldName: validationError.fieldName
      });
    }
    focusAccountInput(document.getElementById(GATE_ID), {
      includeMobile: true,
      fieldName: validationError.fieldName
    });
    return;
  }

  setAuthBusy(true);
  try {
    if (mode === "reset-password") {
      const confirmation = String(values.get("passwordConfirmation") ?? "");
      if (password.length < 8 || password !== confirmation) {
        throw new Error("password confirmation");
      }
      accountSession = saveAccountSession(
        await updateAccountPassword(runtimeConfig, accountSession, password)
      );
      clearAccountRecoverySession();
    } else if (mode === "complete-profile") {
      const displayName = normalizeProfileName(values.get("displayName"));
      const username = normalizeUsername(usernameValue);
      runtimeConfig = await loadRuntimeConfig();
      await setFriendUsername(runtimeConfig, username);
      const currentMetadata = accountSession.user.user_metadata ?? {};
      accountSession = saveAccountSession(
        await updateAccountUser(runtimeConfig, accountSession, {
          ...currentMetadata,
          full_name: displayName,
          name: displayName,
          display_name: displayName,
          username
        })
      );
    } else if (mode === "signup") {
      const displayName = normalizeProfileName(values.get("displayName"));
      const username = normalizeUsername(usernameValue);
      if (!isFullProfileName(displayName)) {
        throw new Error("full name required");
      }
      rememberAccountReturnUrl();
      const result = await signUpWithPassword(runtimeConfig, {
        email,
        password,
        displayName,
        username,
        redirectTo: authRedirectUrl()
      });
      if (!result.session) {
        renderAccountGate({
          mode: "login",
          message: "שלחנו אליך קישור לאישור המייל. אחרי האישור אפשר להתחבר.",
          values: { email },
          showVerificationResend: true
        });
        return;
      }
      accountSession = result.session;
    } else {
      accountSession = await signInWithPassword(runtimeConfig, {
        email,
        password
      });
    }

    accountSession = await restoreAccountSession(accountSession);
    scheduleAccountSessionRefresh();
    await connectAccountToApp(accountSession, { forceReload: true });
  } catch (error) {
    emitOperationFailure("auth", { screen: "auth", error });
    if (accountSession?.user && accountProfileNeedsCompletion(error)) {
      const accountProfile = accountProfileFromUser(accountSession.user);
      renderAccountNameCompletionGate({
        displayName: accountProfile?.displayName ?? "",
        username: accountProfile?.username ?? ""
      });
      return;
    }
    const fullNameError = String(error?.message ?? "").includes("full name");
    const usernameError =
      String(error?.message ?? "").toLowerCase().includes("username is already taken") ||
      String(error?.message ?? "").includes("user_profiles_username_unique") ||
      error?.code === "23505";
    const confirmationError = String(error?.message ?? "").includes("password confirmation");
    if (mode === "reset-password") {
      renderPasswordResetGate(
        confirmationError
          ? "הסיסמאות אינן זהות או קצרות מדי."
          : accountAuthErrorMessage(error)
      );
      return;
    }
    if (mode === "complete-profile") {
      renderAccountNameCompletionGate({
        displayName: String(values.get("displayName") ?? ""),
        username: usernameValue,
        error: fullNameError
          ? "צריך להזין שם פרטי ושם משפחה."
          : usernameError
            ? "שם המשתמש הזה כבר תפוס. נסה שם אחר."
            : accountAuthErrorMessage(error),
        errorFieldName: usernameError ? "username" : "displayName"
      });
      focusAccountInput(document.getElementById(GATE_ID), {
        includeMobile: true,
        fieldName: usernameError ? "username" : "displayName"
      });
      return;
    }
    const emailNotConfirmed = String(error?.message ?? "")
      .toLowerCase()
      .includes("email not confirmed");
    renderAccountGate({
      mode,
      values: {
        email,
        displayName: String(values.get("displayName") ?? ""),
        username: usernameValue
      },
      error: fullNameError
        ? "צריך להזין שם פרטי ושם משפחה."
        : confirmationError
          ? "הסיסמאות אינן זהות או קצרות מדי."
        : accountAuthErrorMessage(error, mode),
      showVerificationResend: emailNotConfirmed
    });
  } finally {
    setAuthBusy(false);
  }
}

function accountFormValidationError(
  form,
  { mode, email, password, displayName, username, passwordConfirmation }
) {
  if (mode === "login" || mode === "signup") {
    if (!email) {
      return { fieldName: "email", message: "צריך להזין כתובת אימייל." };
    }
    if (
      form.querySelector('input[name="email"]')?.validity?.typeMismatch ||
      !normalizeAccountEmail(email)
    ) {
      return { fieldName: "email", message: "כתובת האימייל אינה תקינה." };
    }
  }

  if (
    (mode === "signup" || mode === "complete-profile") &&
    !isFullProfileName(normalizeProfileName(displayName))
  ) {
    return {
      fieldName: "displayName",
      message: "צריך להזין שם פרטי ושם משפחה."
    };
  }

  if (
    (mode === "signup" || mode === "complete-profile") &&
    !normalizeUsername(username)
  ) {
    return {
      fieldName: "username",
      message: usernameValidationMessage(username)
    };
  }

  if (mode !== "complete-profile" && password.length < 8) {
    return {
      fieldName: "password",
      message: "הסיסמה צריכה להכיל לפחות 8 תווים."
    };
  }

  if (mode === "reset-password" && password !== passwordConfirmation) {
    return {
      fieldName: "passwordConfirmation",
      message: "הסיסמאות אינן זהות."
    };
  }

  return null;
}

async function handleAccountClick(event) {
  const legalLink = event.target.closest('.account-data-link[href$=".html"]');
  if (legalLink) rememberProfileRouteBeforeLegalNavigation();

  const modeButton = event.target.closest("[data-account-mode]");
  if (modeButton) {
    emailAuthExpanded = true;
    renderAccountGate({
      mode: modeButton.dataset.accountMode,
      values: {
        email: document.querySelector('[data-account-form] input[name="email"]')?.value ?? "",
        displayName: document.querySelector('[data-account-form] input[name="displayName"]')?.value ?? "",
        username: document.querySelector('[data-account-form] input[name="username"]')?.value ?? ""
      }
    });
    return;
  }

  const action = event.target.closest("[data-account-action]")?.dataset.accountAction;
  if (action === "toggle-password") {
    const button = event.target.closest('[data-account-action="toggle-password"]');
    const input = button?.closest(".account-password-input")?.querySelector("input");
    if (!(input instanceof HTMLInputElement)) return;
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.setAttribute("aria-pressed", String(reveal));
    button.setAttribute("aria-label", reveal ? "הסתר סיסמה" : "הצג סיסמה");
    button.innerHTML = iconSvg(reveal ? "eye-off" : "eye");
    input.focus({ preventScroll: true });
    return;
  }
  if (action === "toggle-email") {
    const currentForm = document.querySelector("[data-account-form]");
    const mode = currentForm?.dataset.mode ?? "login";
    const values = {
      email: currentForm?.querySelector('input[name="email"]')?.value ?? "",
      displayName: currentForm?.querySelector('input[name="displayName"]')?.value ?? "",
      username: currentForm?.querySelector('input[name="username"]')?.value ?? ""
    };
    emailAuthExpanded = !emailAuthExpanded;
    renderAccountGate({ mode, values });
    if (emailAuthExpanded) {
      focusAccountInput(document.getElementById(GATE_ID), {
        includeMobile: true
      });
    }
    return;
  }

  if (action === "google") {
    // The browser uses Google's official rendered control. Only Android's
    // native button is handled here, so a browser tap can never be spent just
    // replacing a fallback with the real Google button.
    if (authBusy || !isNativeAndroid()) return;
    setAuthBusy(true);
    try {
      await signInWithNativeGoogle();
    } catch (error) {
      handleGoogleSignInError(error);
    } finally {
      setAuthBusy(false);
    }
    return;
  }

  if (action === "retry-google") {
    if (authBusy || isNativeAndroid()) return;
    setAuthBusy(true);
    try {
      await renderWebGoogleButton();
    } catch {
      const status = document.querySelector("[data-account-auth-status]");
      if (status) status.textContent = "Google עדיין לא זמין. כדאי לבדוק את החיבור ולנסות שוב.";
    } finally {
      setAuthBusy(false);
    }
    return;
  }

  if (action === "apple") {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      await openOAuthUrl(
        await secureOAuthUrl(appleOAuthUrl)
      );
    } finally {
      setAuthBusy(false);
    }
    return;
  }

  if (action === "forgot-password") {
    const enteredEmail = String(
      document.querySelector('[data-account-form] input[name="email"]')?.value ?? ""
    ).trim().toLowerCase();
    const email = normalizeAccountEmail(enteredEmail);
    if (!email) {
      renderAccountGate({
        mode: "login",
        error: enteredEmail
          ? "כתובת האימייל אינה תקינה."
          : "צריך להזין אימייל כדי לשלוח קישור לאיפוס הסיסמה.",
        values: { email: enteredEmail }
      });
      focusAccountInput(document.getElementById(GATE_ID), {
        includeMobile: true,
        fieldName: "email"
      });
      return;
    }
    setAuthBusy(true);
    try {
      clearAccountRecoverySession();
      rememberAccountReturnUrl();
      const pkce = await createOAuthPkce();
      const flowId = createAccountOAuthFlowId();
      const flow = saveAccountOAuthFlow({
        id: flowId,
        verifier: pkce.verifier,
        returnPath: accountReturnPath(),
        purpose: ACCOUNT_RECOVERY_FLOW_PURPOSE,
        email
      });
      if (!flow) throw new Error("Secure password recovery is unavailable");
      try {
        await requestPasswordReset(
          runtimeConfig,
          email,
          authRedirectUrl(flowId)
        );
      } catch (error) {
        clearAccountOAuthFlow(flowId);
        throw error;
      }
      renderAccountGate({
        mode: "login",
        message: "שלחנו קישור לאיפוס הסיסמה. כדאי לבדוק גם בתיקיית הספאם.",
        values: { email }
      });
    } catch (error) {
      emitOperationFailure("auth", { screen: "auth", error });
      renderAccountGate({
        mode: "login",
        error: accountAuthErrorMessage(error),
        values: { email }
      });
      focusAccountInput(document.getElementById(GATE_ID), {
        includeMobile: true,
        fieldName: "email"
      });
    } finally {
      setAuthBusy(false);
    }
    return;
  }

  if (action === "resend-verification") {
    const enteredEmail = String(
      document.querySelector('[data-account-form] input[name="email"]')?.value ?? ""
    ).trim().toLowerCase();
    const email = normalizeAccountEmail(enteredEmail);
    if (!email) {
      renderAccountGate({
        mode: "login",
        error: enteredEmail
          ? "כתובת האימייל אינה תקינה."
          : "צריך להזין אימייל כדי לשלוח קישור אימות חדש.",
        values: { email: enteredEmail },
        showVerificationResend: true
      });
      focusAccountInput(document.getElementById(GATE_ID), {
        includeMobile: true,
        fieldName: "email"
      });
      return;
    }
    setAuthBusy(true);
    try {
      await resendSignupConfirmation(runtimeConfig, email, authRedirectUrl());
      renderAccountGate({
        mode: "login",
        message: "שלחנו קישור אימות חדש. כדאי לבדוק גם בתיקיית הספאם.",
        values: { email },
        showVerificationResend: true
      });
    } catch (error) {
      emitOperationFailure("auth", { screen: "auth", error });
      renderAccountGate({
        mode: "login",
        error: accountAuthErrorMessage(error),
        values: { email },
        showVerificationResend: true
      });
    } finally {
      setAuthBusy(false);
    }
    return;
  }

  if (action === "signout") {
    const button = event.target.closest("[data-account-action]");
    if (!button || authBusy) return;
    const accountSpaceId = getActiveCloudSpaceId(runtimeConfig);
    const sessionToSignOut = accountSession;
    const accountUserId = String(sessionToSignOut?.user?.id ?? "").trim();
    accountRefreshGeneration += 1;
    accountSession = null;
    authBusy = true;
    button.disabled = true;
    button.textContent = "מתנתק…";
    clearTimeout(accountRefreshTimer);
    clearPendingInviteUrl();
    clearAccountReturnUrl();
    clearAccountOAuthFlows();
    clearAccountRecoverySession();
    try {
      await settleWithin(
        globalThis.SogrimNotifications?.prepareSignOut?.(),
        1_500
      );
    } catch {}
    try {
      await settleWithin(
        signOutAccount(runtimeConfig, sessionToSignOut),
        4_000
      );
    } catch {}
    clearLocalAccountData(accountSpaceId, accountUserId);
    publishAccountSessionSync(null, { reason: "signed-out" });
    removeSessionValue(AUTH_CHANGED_MARKER);
    window.location.reload();
    return;
  }

  if (action === "ad-privacy") {
    rememberProfileRouteBeforeLegalNavigation();
    const button = event.target.closest("[data-account-action]");
    if (button) button.disabled = true;
    try {
      const opened = await globalThis.SogrimAds?.showPrivacyOptions?.();
      if (!opened) window.location.assign("./privacy.html");
    } catch {
      window.location.assign("./privacy.html");
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
    return;
  }

  if (action === "feedback-open") {
    renderAccountFeedbackDialog();
    return;
  }

  if (action === "feedback-cancel" || action === "feedback-done") {
    if (accountFeedbackBusy) return;
    closeAccountFeedbackDialog();
    return;
  }

  if (action === "delete-account-open") {
    renderAccountDeletionDialog();
    return;
  }

  if (action === "delete-account-cancel") {
    if (accountDeleteBusy) return;
    closeAccountDeletionDialog();
    return;
  }

  if (action === "delete-account-confirm") {
    const confirmation = document.querySelector("[data-account-delete-confirmation]");
    if (!confirmation?.checked || authBusy) return;
    const button = event.target.closest("[data-account-action]");
    setAccountDeletionBusy(true);
    try {
      await deleteAccount(runtimeConfig, accountSession);
      clearPendingInviteUrl();
      clearAccountReturnUrl();
      clearAccountOAuthFlows();
      clearAccountRecoverySession();
      clearLocalAccountData();
      clearAccountSession();
      publishAccountSessionSync(null, { reason: "deleted" });
      removeSessionValue(AUTH_CHANGED_MARKER);
      setSessionValue(ACCOUNT_DELETED_MARKER, "1");
      window.location.replace("/");
    } catch {
      const error = document.querySelector("[data-account-delete-error]");
      if (error) {
        error.hidden = false;
        error.textContent = "לא הצלחנו להשלים את המחיקה כרגע. אפשר לנסות שוב או לפנות לתמיכה.";
      }
      if (button) button.disabled = false;
      setAccountDeletionBusy(false);
    }
  }
}

function isNativeAndroid() {
  return Boolean(
    globalThis.Capacitor?.isNativePlatform?.() &&
    globalThis.Capacitor?.getPlatform?.() === "android"
  );
}

async function renderWebGoogleButton() {
  const control = document.querySelector("[data-account-google-control]");
  const target = control?.querySelector("[data-account-google-button]");
  if (
    !control ||
    !target ||
    isNativeAndroid() ||
    control.classList.contains("is-google-ready") ||
    control.classList.contains("is-google-rendering")
  ) {
    return;
  }

  control.classList.add("is-google-rendering");
  setWebGoogleLoadingState(control);
  try {
    await initializeWebGoogleIdentity();
    if (!target.isConnected) return;
    target.replaceChildren();
    const width = Math.max(
      200,
      Math.min(400, Math.round(control.getBoundingClientRect().width || 320))
    );
    window.google.accounts.id.renderButton(target, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: "continue_with",
      locale: "he",
      width
    });
    control.classList.add("is-google-ready");
  } catch (error) {
    control.classList.remove("is-google-ready");
    setWebGoogleRetryState(control);
    throw error;
  } finally {
    control.classList.remove("is-google-rendering");
  }
}

function setWebGoogleLoadingState(control) {
  const fallback = control?.querySelector(".account-google-fallback");
  if (!(fallback instanceof HTMLButtonElement)) return;
  fallback.dataset.accountGooglePlaceholder = "";
  delete fallback.dataset.accountAction;
  fallback.classList.add("account-google-loading");
  fallback.disabled = true;
  fallback.setAttribute("aria-busy", "true");
}

function setWebGoogleRetryState(control) {
  const fallback = control?.querySelector(".account-google-fallback");
  if (!(fallback instanceof HTMLButtonElement)) return;
  delete fallback.dataset.accountGooglePlaceholder;
  fallback.dataset.accountAction = "retry-google";
  fallback.classList.remove("account-google-loading");
  fallback.disabled = false;
  fallback.setAttribute("aria-busy", "false");
}

function showWebGoogleCompletionState() {
  const control = document.querySelector("[data-account-google-control]");
  if (!control) return;
  control.classList.add("is-google-signing-in");
  const fallback = control.querySelector(".account-google-fallback");
  if (fallback instanceof HTMLButtonElement) {
    fallback.replaceChildren();
    const label = document.createElement("span");
    label.textContent = "משלימים את הכניסה…";
    fallback.append(label);
    fallback.disabled = true;
    fallback.setAttribute("aria-busy", "true");
  }
}

function initializeWebGoogleIdentity() {
  const clientId = String(runtimeConfig?.auth?.googleClientId ?? "").trim();
  if (!clientId) return Promise.reject(new Error("Google client is unavailable"));
  if (webGoogleInitialized && webGoogleClientId === clientId) {
    return Promise.resolve();
  }
  if (
    webGoogleInitializationPromise &&
    webGoogleInitializationClientId === clientId
  ) {
    return webGoogleInitializationPromise;
  }

  webGoogleInitializationClientId = clientId;
  webGoogleInitializationPromise = (async () => {
    await loadWebGoogleScript();
    if (webGoogleInitialized && webGoogleClientId === clientId) return;

    const nonce = await createWebGoogleNonce();
    webGoogleNonce = nonce.raw;
    webGoogleClientId = clientId;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleWebGoogleCredential,
      context: "signin",
      auto_select: false,
      button_auto_select: false,
      cancel_on_tap_outside: true,
      itp_support: true,
      use_fedcm_for_button: true,
      ux_mode: "popup",
      nonce: nonce.hashed
    });
    webGoogleInitialized = true;
  })().catch((error) => {
    webGoogleInitializationPromise = null;
    webGoogleInitializationClientId = "";
    throw error;
  });
  return webGoogleInitializationPromise;
}

function loadWebGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (webGoogleScriptPromise) return webGoogleScriptPromise;

  webGoogleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Google sign-in is unavailable"));
    document.head.append(script);
  }).catch((error) => {
    webGoogleScriptPromise = null;
    throw error;
  });
  return webGoogleScriptPromise;
}

async function createWebGoogleNonce() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  const raw = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw)
  );
  const hashed = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}

async function handleWebGoogleCredential(response) {
  if (authBusy) return;
  setAuthBusy(true);
  showWebGoogleCompletionState();
  try {
    const idToken = String(response?.credential ?? "").trim();
    if (!idToken) throw new Error("Google identity token is unavailable");
    await completeGoogleIdTokenSignIn({
      idToken,
      nonce: webGoogleNonce
    });
  } catch (error) {
    handleGoogleSignInError(error);
  } finally {
    setAuthBusy(false);
  }
}

function handleGoogleSignInError(error) {
  if (accountSession?.user && accountProfileNeedsCompletion(error)) {
    const accountProfile = accountProfileFromUser(accountSession.user);
    renderAccountNameCompletionGate({
      displayName: accountProfile?.displayName ?? "",
      username: accountProfile?.username ?? ""
    });
    return;
  }
  if (isCancelledNativeGoogleLogin(error)) return;
  emitOperationFailure("auth", { screen: "auth", error });
  renderAccountGate({
    mode: "login",
    error: accountAuthErrorMessage(error, "google")
  });
}

function prepareNativeGoogleSignIn() {
  if (!nativeGoogleLoginPromise) {
    nativeGoogleLoginPromise = import("@capgo/capacitor-social-login")
      .then(async ({ SocialLogin }) => {
        const webClientId = String(runtimeConfig?.auth?.googleClientId ?? "").trim();
        if (!webClientId) throw new Error("Google client is unavailable");
        await SocialLogin.initialize({
          google: { webClientId, mode: "online" }
        });
        return SocialLogin;
      })
      .catch((error) => {
        nativeGoogleLoginPromise = null;
        throw error;
      });
  }

  return nativeGoogleLoginPromise;
}

async function signInWithNativeGoogle() {
  const socialLogin = await prepareNativeGoogleSignIn();
  const login = await socialLogin.login({
    provider: "google",
    options: {
      // The bottom credential sheet can first fail with NoCredentialException
      // and only then retry with the standard Google chooser. Going directly
      // to the standard chooser removes that silent delay from the first tap.
      style: "standard",
      filterByAuthorizedAccounts: false,
      autoSelectEnabled: false
    }
  });
  const result = login?.result;
  const idToken = String(result?.idToken ?? "").trim();
  const accessToken = String(result?.accessToken?.token ?? "").trim();
  if (!idToken) throw new Error("Google identity token is unavailable");

  await completeGoogleIdTokenSignIn({ idToken, accessToken });
}

async function completeGoogleIdTokenSignIn({
  idToken,
  accessToken = "",
  nonce = ""
}) {
  const previousSession = loadStoredAccountSession();
  accountSession = saveAccountSession(
    await signInWithIdToken(runtimeConfig, {
      provider: "google",
      token: idToken,
      accessToken,
      nonce
    })
  );

  try {
    accountSession = await restoreAccountSession(accountSession, {
      previousSession
    });
    scheduleAccountSessionRefresh();
    await connectAccountToApp(accountSession, { forceReload: true });
  } catch (error) {
    if (accountSession?.user && accountProfileNeedsCompletion(error)) {
      throw error;
    }
    if (canResumeOffline(accountSession, error)) {
      resumeAccountLocally(accountSession);
      watchAccountControls();
      enhanceAccountControls();
      return;
    }
    if (accountSession?.user) {
      // Google has already authenticated this account. A later workspace or
      // network failure must never send the user back to the provider button
      // and make a second sign-in look necessary.
      saveAccountSession(accountSession);
      emitOperationFailure("auth", { screen: "auth", error });
      renderAccountRecoveryGate();
      return;
    }
    throw error;
  }
}

function isCancelledNativeGoogleLogin(error) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return (
    message.includes("cancel") ||
    message.includes("canceled") ||
    message.includes("cancelled") ||
    message.includes("user denied")
  );
}

function handleAccountGateKeydown(event) {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  if (!collapseAccountEmailAuth()) return;
  event.preventDefault();
}

function handleAccountGateNativeBack(event) {
  if (event.defaultPrevented || !collapseAccountEmailAuth()) return;
  event.preventDefault();
}

function collapseAccountEmailAuth() {
  if (
    !document.getElementById(GATE_ID) ||
    !emailAuthExpanded ||
    (!googleEnabled && !appleEnabled) ||
    authBusy
  ) {
    return false;
  }

  const currentForm = document.querySelector("[data-account-form]");
  const values = {
    email: currentForm?.querySelector('input[name="email"]')?.value ?? "",
    displayName:
      currentForm?.querySelector('input[name="displayName"]')?.value ?? "",
    username: currentForm?.querySelector('input[name="username"]')?.value ?? ""
  };
  emailAuthExpanded = false;
  renderAccountGate({ mode: "login", values });
  document
    .querySelector('[data-account-action="toggle-email"]')
    ?.focus({ preventScroll: true });
  return true;
}

function handleAccountChange(event) {
  if (!event.target.matches("[data-account-delete-confirmation]")) return;
  const button = document.querySelector('[data-account-action="delete-account-confirm"]');
  if (button) button.disabled = !event.target.checked;
}

function enhanceAccountControls() {
  if (!accountSession?.user) return;
  const host =
    document.querySelector(".profile-summary") ??
    document.querySelector(".public-profile-card") ??
    document.querySelector(".profile-setup-panel");
  if (!host || host.querySelector("[data-account-controls]")) return;

  const email = String(accountSession.user.email ?? "").trim();
  const adPrivacyControl =
    globalThis.Capacitor?.getPlatform?.() === "android"
      ? `<button class="account-data-link" type="button" data-account-action="ad-privacy">העדפות פרסום</button>`
      : "";
  host.insertAdjacentHTML(
    "beforeend",
    `<details class="account-profile-controls" data-account-controls>
      <summary class="account-profile-controls-summary">
        <span class="account-profile-controls-summary-copy">
          <strong>חשבון ותמיכה</strong>
          <small>פרטיות, התקנה וניהול החשבון</small>
        </span>
        <span class="account-profile-controls-summary-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </summary>
      <div class="account-profile-controls-body">
        <span class="account-profile-email">${escapeHtml(email)}</span>
        <button class="account-feedback-entry" type="button" data-account-action="feedback-open">
          <span class="account-feedback-entry-icon" aria-hidden="true">
            ${iconSvg("message")}
          </span>
          <span class="account-feedback-entry-copy">
            <strong>משוב לבודקים</strong>
            <small>תקלה, משהו שלא היה ברור או רעיון לשיפור</small>
          </span>
          <span class="account-feedback-entry-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
        </button>
        <nav class="account-data-links" aria-label="מידע על החשבון">
          <a href="./privacy.html" class="account-data-link">מדיניות פרטיות</a>
          <a href="./terms.html" class="account-data-link">תנאי שימוש</a>
          <a href="./accessibility.html" class="account-data-link">הצהרת נגישות</a>
          <a href="./support.html" class="account-data-link">תמיכה</a>
          ${adPrivacyControl}
        </nav>
        <div class="account-profile-actions">
          <button class="secondary-button" type="button" data-account-action="signout">התנתק</button>
        </div>
        <div class="account-danger-zone">
          <span class="account-danger-copy">
            <strong>מחיקת חשבון</strong>
            <small>החשבון והמידע האישי יימחקו לצמיתות.</small>
          </span>
          <button class="secondary-button account-delete-button" type="button" data-account-action="delete-account-open">מחק חשבון</button>
        </div>
      </div>
    </details>`
  );
}

function renderAccountFeedbackDialog() {
  closeAccountFeedbackDialog({ fromHistory: true, restoreFocus: false });
  accountFeedbackReturnFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const dialog = document.createElement("section");
  dialog.className = "account-feedback-backdrop";
  dialog.dataset.accountFeedbackDialog = "true";
  dialog.innerHTML = `
    <div class="account-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="account-feedback-title" aria-describedby="account-feedback-description" tabindex="-1">
      <header class="account-feedback-header">
        <div>
          <p class="eyebrow">עוזרים לנו להשתפר</p>
          <h2 id="account-feedback-title">מה תרצה לספר לנו?</h2>
          <p id="account-feedback-description">בחר נושא וכתוב בקצרה מה קרה. פרטי הגרסה יצורפו אוטומטית.</p>
        </div>
        <button class="account-feedback-close modal-close-button" type="button" data-account-action="feedback-cancel" aria-label="סגירת המשוב"><span class="modal-control-icon" aria-hidden="true">${iconSvg("x")}</span></button>
      </header>
      <form class="account-feedback-form" data-account-feedback-form novalidate>
        <fieldset class="account-feedback-categories">
          <legend>נושא המשוב</legend>
          <label>
            <input type="radio" name="category" value="bug" checked />
            <span>תקלה</span>
          </label>
          <label>
            <input type="radio" name="category" value="clarity" />
            <span>לא היה ברור</span>
          </label>
          <label>
            <input type="radio" name="category" value="idea" />
            <span>רעיון</span>
          </label>
        </fieldset>
        <label class="account-feedback-message">
          <span>מה קרה?</span>
          <textarea
            name="message"
            rows="6"
            minlength="10"
            maxlength="1200"
            autocomplete="off"
            placeholder="לדוגמה: לחצתי על הוספת הוצאה ולא היה לי ברור מה השלב הבא…"
            required
          ></textarea>
          <small>אין צורך לצרף שמות, מספרי טלפון או מידע כספי.</small>
        </label>
        <p class="account-feedback-error" role="alert" data-account-feedback-error hidden></p>
        <div class="account-feedback-actions">
          <button class="secondary-button" type="button" data-account-action="feedback-cancel">ביטול</button>
          <button class="primary-button" type="submit">שלח משוב</button>
        </div>
      </form>
    </div>`;
  document.body.append(dialog);
  document.querySelector("#app")?.setAttribute("inert", "");
  document.documentElement.classList.add("account-feedback-open");
  pushAccountFeedbackHistoryState();
  dialog
    .querySelector("[data-account-feedback-form]")
    ?.addEventListener("submit", handleAccountFeedbackSubmit);
  dialog.querySelector("textarea")?.focus({ preventScroll: true });
}

async function handleAccountFeedbackSubmit(event) {
  event.preventDefault();
  if (accountFeedbackBusy) return;

  const form = event.currentTarget;
  const values = new FormData(form);
  const error = form.querySelector("[data-account-feedback-error]");
  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
  const message = String(values.get("message") ?? "").trim();
  if (message.length < 10) {
    if (error) {
      error.hidden = false;
      error.textContent = "כדאי לכתוב לפחות 10 תווים כדי שנוכל להבין מה קרה.";
    }
    form.querySelector('textarea[name="message"]')?.focus({ preventScroll: true });
    return;
  }
  setAccountFeedbackBusy(true);

  try {
    await submitAppFeedback(runtimeConfig, {
      category: values.get("category"),
      message,
      context: await accountFeedbackContext()
    });
    renderAccountFeedbackSuccess();
  } catch {
    if (error) {
      error.hidden = false;
      error.textContent =
        "לא הצלחנו לשלוח כרגע. כדאי לבדוק את החיבור ולנסות שוב.";
    }
    setAccountFeedbackBusy(false);
  }
}

async function accountFeedbackContext() {
  let nativeInfo = {};
  try {
    nativeInfo = (await globalThis.SogrimNative?.app?.getInfo?.()) ?? {};
  } catch {}
  const platform =
    nativeInfo.platform ||
    globalThis.Capacitor?.getPlatform?.() ||
    "web";
  return {
    appVersion: nativeInfo.version || "web",
    buildNumber: nativeInfo.build || "",
    platform,
    locale: navigator.language || document.documentElement.lang || "",
    screen:
      document.querySelector("#app .screen")?.dataset.screenKind ||
      "profile",
    viewport: `${window.innerWidth}x${window.innerHeight}`
  };
}

function renderAccountFeedbackSuccess() {
  const dialog = document.querySelector(".account-feedback-dialog");
  if (!dialog) return;
  accountFeedbackBusy = false;
  document.documentElement.classList.remove("account-feedback-busy");
  dialog.innerHTML = `
    <div class="account-feedback-success" role="status">
      <span aria-hidden="true">✓</span>
      <p class="eyebrow">המשוב נשלח</p>
      <h2>תודה שעזרת לנו להשתפר</h2>
      <p>קיבלנו את ההודעה יחד עם פרטי הגרסה. אין צורך לשלוח אותה שוב.</p>
      <button class="primary-button" type="button" data-account-action="feedback-done">סיום</button>
    </div>`;
  dialog
    .querySelector('[data-account-action="feedback-done"]')
    ?.focus({ preventScroll: true });
}

function closeAccountFeedbackDialog({
  fromHistory = false,
  restoreFocus = true
} = {}) {
  const dialog = document.querySelector("[data-account-feedback-dialog]");
  if (!dialog) return;
  if (
    !fromHistory &&
    accountFeedbackHistoryActive &&
    window.history?.back
  ) {
    if (accountFeedbackHistoryClosing) return;
    accountFeedbackHistoryClosing = true;
    window.history.back();
    return;
  }

  accountFeedbackBusy = false;
  accountFeedbackHistoryActive = false;
  accountFeedbackHistoryClosing = false;
  dialog.remove();
  document.querySelector("#app")?.removeAttribute("inert");
  document.documentElement.classList.remove(
    "account-feedback-open",
    "account-feedback-busy"
  );
  const returnTarget = accountFeedbackReturnFocus;
  accountFeedbackReturnFocus = null;
  if (restoreFocus) {
    requestAnimationFrame(() => {
      if (returnTarget?.isConnected) {
        returnTarget.focus({ preventScroll: true });
      }
    });
  }
}

function pushAccountFeedbackHistoryState() {
  if (!window.history?.pushState) return;
  try {
    window.history.pushState(
      {
        ...(window.history.state ?? {}),
        [ACCOUNT_FEEDBACK_HISTORY_KEY]: true
      },
      "",
      window.location.href
    );
    accountFeedbackHistoryActive = true;
  } catch {
    accountFeedbackHistoryActive = false;
  }
}

function handleAccountFeedbackHistoryBack(event) {
  if (!accountFeedbackHistoryActive) return;
  event.stopImmediatePropagation();
  closeAccountFeedbackDialog({ fromHistory: true });
}

function handleAccountFeedbackNativeBack(event) {
  if (!document.querySelector("[data-account-feedback-dialog]")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeAccountFeedbackDialog();
}

function handleAccountFeedbackKeydown(event) {
  const dialog = document.querySelector(
    '.account-feedback-dialog[role="dialog"]'
  );
  if (!dialog) return;

  if (event.key === "Escape" && !accountFeedbackBusy) {
    event.preventDefault();
    closeAccountFeedbackDialog();
    return;
  }
  if (event.key !== "Tab") return;
  trapAccountDialogFocus(event, dialog);
}

function trapAccountDialogFocus(event, dialog) {
  const focusable = [...dialog.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  )].filter((element) => element.offsetParent !== null);
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus({ preventScroll: true });
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function setAccountFeedbackBusy(value) {
  accountFeedbackBusy = value;
  document.documentElement.classList.toggle("account-feedback-busy", value);
  document
    .querySelectorAll(
      "[data-account-feedback-dialog] button, [data-account-feedback-dialog] input, [data-account-feedback-dialog] textarea"
    )
    .forEach((element) => {
      element.disabled = value;
    });
}

function renderAccountDeletionDialog() {
  closeAccountDeletionDialog({ fromHistory: true, restoreFocus: false });
  accountDeleteReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const dialog = document.createElement("section");
  dialog.className = "account-delete-backdrop";
  dialog.dataset.accountDeleteDialog = "true";
  dialog.innerHTML = `
    <div class="account-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="account-delete-title" aria-describedby="account-delete-description" tabindex="-1">
      <p class="eyebrow">חשבון ופרטיות</p>
      <h2 id="account-delete-title">למחוק את החשבון?</h2>
      <p id="account-delete-description">החשבון, סביבת הענן והמידע האישי יימחקו לצמיתות. ברישומי הוצאות משותפים השם שלך יוחלף ב"משתמש שנמחק", כדי לא לפגוע בחישובים של חברים אחרים.</p>
      <label class="account-delete-confirmation">
        <input type="checkbox" name="deleteAccountConfirmation" data-account-delete-confirmation />
        <span>אני מבין שהפעולה קבועה ואי אפשר לבטל אותה.</span>
      </label>
      <p class="account-delete-error" role="alert" data-account-delete-error hidden></p>
      <div class="account-delete-actions">
        <button class="secondary-button" type="button" data-account-action="delete-account-cancel">חזרה</button>
        <button class="primary-button account-delete-confirm" type="button" data-account-action="delete-account-confirm" disabled>מחק את החשבון</button>
      </div>
    </div>`;
  document.body.append(dialog);
  document.querySelector("#app")?.setAttribute("inert", "");
  document.documentElement.classList.add("account-delete-open");
  pushAccountDeletionHistoryState();
  dialog.querySelector("[data-account-delete-confirmation]")?.focus();
}

function closeAccountDeletionDialog({
  fromHistory = false,
  restoreFocus = true
} = {}) {
  const dialog = document.querySelector("[data-account-delete-dialog]");
  if (!dialog) return;
  if (
    !fromHistory &&
    accountDeleteHistoryActive &&
    window.history?.back
  ) {
    if (accountDeleteHistoryClosing) return;
    accountDeleteHistoryClosing = true;
    window.history.back();
    return;
  }

  accountDeleteHistoryActive = false;
  accountDeleteHistoryClosing = false;
  dialog.remove();
  document.querySelector("#app")?.removeAttribute("inert");
  document.documentElement.classList.remove("account-delete-open", "account-delete-busy");
  const returnTarget = accountDeleteReturnFocus;
  accountDeleteReturnFocus = null;
  if (restoreFocus) {
    requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    });
  }
}

function pushAccountDeletionHistoryState() {
  if (!window.history?.pushState) return;
  try {
    window.history.pushState(
      {
        ...(window.history.state ?? {}),
        [ACCOUNT_DELETE_HISTORY_KEY]: true
      },
      "",
      window.location.href
    );
    accountDeleteHistoryActive = true;
  } catch {
    accountDeleteHistoryActive = false;
  }
}

function handleAccountDeletionHistoryBack(event) {
  if (!accountDeleteHistoryActive) return;
  event.stopImmediatePropagation();
  closeAccountDeletionDialog({ fromHistory: true });
}

function handleAccountDeletionNativeBack(event) {
  if (!document.querySelector("[data-account-delete-dialog]")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeAccountDeletionDialog();
}

function handleAccountDeletionKeydown(event) {
  const dialog = document.querySelector('.account-delete-dialog[role="dialog"]');
  if (!dialog) return;

  if (event.key === "Escape" && !accountDeleteBusy) {
    event.preventDefault();
    closeAccountDeletionDialog();
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = [...dialog.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  )].filter((element) => element.offsetParent !== null);
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function setAccountDeletionBusy(value) {
  accountDeleteBusy = value;
  document.documentElement.classList.toggle("account-delete-busy", value);
  document.querySelectorAll("[data-account-delete-dialog] button, [data-account-delete-dialog] input")
    .forEach((element) => {
      element.disabled = value || (
        element.matches('[data-account-action="delete-account-confirm"]') &&
        !document.querySelector("[data-account-delete-confirmation]")?.checked
      );
    });
}

function renderPasswordResetGate(error = "") {
  document.querySelector(".public-profile-gate")?.remove();
  document.getElementById(GATE_ID)?.remove();
  document.querySelector("#app")?.setAttribute("inert", "");

  const gate = document.createElement("section");
  gate.id = GATE_ID;
  gate.className = "account-auth-gate";
  gate.setAttribute("role", "main");
  gate.innerHTML = `
    <div class="account-auth-shell account-auth-shell-compact">
      <section class="account-auth-brand">
        <span class="account-auth-mark" aria-hidden="true"><img src="./icon-192.png" alt="" width="50" height="50" /></span>
        <div>
          <p class="eyebrow">סוגרים חשבון</p>
          <h1>בוחרים סיסמה חדשה</h1>
          <p>אחרי השמירה נחזיר אותך ישר לחשבון שלך.</p>
        </div>
      </section>
      <section class="account-auth-form-panel">
        <div class="account-auth-heading">
          <h2>איפוס סיסמה</h2>
          <p>הסיסמה החדשה צריכה להכיל לפחות 8 תווים.</p>
        </div>
        <form class="account-auth-form" data-account-form data-mode="reset-password" novalidate>
          <label>
            <span>סיסמה חדשה</span>
            <span class="account-password-input">
              <input name="password" type="password" autocomplete="new-password" minlength="8" required />
              <button class="account-password-toggle" type="button" data-account-action="toggle-password" aria-label="הצג סיסמה" aria-pressed="false">${iconSvg("eye")}</button>
            </span>
          </label>
          <label>
            <span>אימות סיסמה</span>
            <span class="account-password-input">
              <input name="passwordConfirmation" type="password" autocomplete="new-password" minlength="8" required />
              <button class="account-password-toggle" type="button" data-account-action="toggle-password" aria-label="הצג סיסמה" aria-pressed="false">${iconSvg("eye")}</button>
            </span>
          </label>
          ${error ? `<p id="account-auth-feedback" class="account-auth-error" role="alert">${escapeHtml(error)}</p>` : ""}
          <button class="primary-button account-auth-submit" type="submit">שמור סיסמה</button>
        </form>
        <p class="visually-hidden" data-account-auth-status role="status" aria-live="polite"></p>
      </section>
    </div>
  `;
  document.body.append(gate);
  gate.querySelector("form")?.addEventListener("submit", handleAccountSubmit);
  markAccountAuthReady();
  focusAccountInput(gate);
}

function markAccountAuthReady() {
  markStartupMilestone("auth-ready");
  document.documentElement.classList.remove("account-auth-pending");
  document.dispatchEvent(new Event("account-auth-ready"));
}

function watchAccountControls() {
  const app = document.querySelector("#app");
  if (!app) return;
  const observer = new MutationObserver(() => enhanceAccountControls());
  observer.observe(app, { childList: true, subtree: true });
}

async function providerEnabled(provider) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${runtimeConfig.storage.url}/auth/v1/settings`, {
      headers: { apikey: runtimeConfig.storage.anonKey },
      signal: controller.signal
    });
    if (!response.ok) return false;
    const settings = await response.json();
    return Boolean(settings.external?.[provider]);
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function refreshProviderOptions() {
  const [googleAvailable, appleAvailable] = await Promise.all([
    providerEnabled("google"),
    providerEnabled("apple")
  ]);
  const nextGoogleEnabled = googleEnabled || googleAvailable;
  if (
    nextGoogleEnabled === googleEnabled &&
    appleAvailable === appleEnabled
  ) {
    return;
  }
  googleEnabled = nextGoogleEnabled;
  appleEnabled = appleAvailable;
  enableProviderOptions();
}

function enableProviderOptions() {
  const slot = document.querySelector("[data-google-auth-slot]");
  if (!slot) return;
  const googleSelector = isNativeAndroid()
    ? '[data-account-action="google"]'
    : "[data-account-google-control]";
  const existingGoogle = slot.querySelector(googleSelector);

  // Provider discovery can finish while a finger is already pressing the
  // Google control. Preserve that exact node (and Google's iframe) instead of
  // replacing it and silently consuming the tap.
  if (!googleEnabled || !existingGoogle) {
    slot.innerHTML = providerOptionsMarkup();
    renderWebGoogleButton().catch(() => {});
    return;
  }

  const existingApple = slot.querySelector('[data-account-action="apple"]');
  if (appleEnabled && !existingApple) {
    slot.insertAdjacentHTML("beforeend", appleProviderMarkup());
  } else if (!appleEnabled) {
    existingApple?.remove();
  }

  if (
    !isNativeAndroid() &&
    !existingGoogle.classList.contains("is-google-ready")
  ) {
    renderWebGoogleButton().catch(() => {});
  }
}

function appleProviderMarkup() {
  return `<button class="account-google-button account-apple-button" type="button" data-account-action="apple" aria-label="המשך עם Apple">
    <img class="account-apple-button-art" src="./assets/sign-in-with-apple-iw.png" alt="" width="375" height="56" />
  </button>`;
}

function providerOptionsMarkup() {
  const googleMarkup = isNativeAndroid()
    ? `<button class="account-google-button account-google-fallback" type="button" data-account-action="google">
        ${googleIcon()}
        <span>המשך עם Google</span>
      </button>`
    : `<div class="account-google-control" data-account-google-control>
        <div class="account-google-official" data-account-google-button aria-label="המשך עם Google"></div>
        <button class="account-google-button account-google-fallback account-google-loading" type="button" data-account-google-placeholder disabled aria-busy="true">
          ${googleIcon()}
          <span>המשך עם Google</span>
        </button>
      </div>`;
  const buttons = [
    googleEnabled
      ? googleMarkup
      : "",
    appleEnabled ? appleProviderMarkup() : ""
  ].filter(Boolean).join("");
  return buttons;
}

function canResumeOffline(session, error) {
  return Boolean(session?.user && isTransientAccountError(error));
}

function isTransientAccountError(error) {
  const status = Number(error?.status);
  return !status || status >= 500;
}

function isUnauthorizedAccountError(error) {
  const status = Number(error?.status);
  if (status === 401) return true;
  if (status !== 403) return false;
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("invalid jwt") ||
    message.includes("jwt expired") ||
    message.includes("token is malformed") ||
    message.includes("bad_jwt")
  );
}

function rememberAccountReturnUrl() {
  localStorage.setItem(
    ACCOUNT_RETURN_URL_STORAGE_KEY,
    accountReturnPath()
  );
}

function clearAccountReturnUrl() {
  try {
    localStorage.removeItem(ACCOUNT_RETURN_URL_STORAGE_KEY);
  } catch {}
}

function accountReturnPath() {
  const inviteUrl = pendingInviteUrl(window.location.href);
  const returnUrl = new URL(inviteUrl || window.location.href, window.location.origin);
  for (const key of [
    "code",
    "error",
    "error_code",
    "error_description",
    ACCOUNT_OAUTH_FLOW_QUERY_PARAM
  ]) {
    returnUrl.searchParams.delete(key);
  }
  return `${returnUrl.pathname}${returnUrl.search}`;
}

function accountInviteContext() {
  const inviteUrl = pendingInviteUrl(window.location.href);
  const eventId = parseInviteEventId(inviteUrl);
  if (!eventId) return null;

  const event = parseInviteSnapshot(inviteUrl)?.event;
  return {
    eventId,
    eventName: event?.name?.trim() || "האירוע שקיבלת",
    participantCount: event?.participantIds?.length ?? 0
  };
}

function accountInviteMarkup(context = accountInviteContext()) {
  if (!context) return "";

  const eventName = escapeHtml(context.eventName);
  const participantCount = context.participantCount;
  const detail = participantCount
    ? `${participantCount} משתתפים כבר באירוע`
    : "אחרי הכניסה נחבר אותך ישר לאירוע";
  return `<section class="account-invite-preview" aria-label="הזמנה לאירוע">
    <span>קיבלת הזמנה</span>
    <strong>${eventName}</strong>
    <p>${escapeHtml(detail)}</p>
  </section>`;
}

function focusAccountInput(
  gate,
  { includeMobile = false, fieldName = "" } = {}
) {
  const isDesktop = window.matchMedia?.("(min-width: 761px)").matches;
  if (!gate || (!isDesktop && !includeMobile)) return;

  const safeFieldName = /^[a-zA-Z][\w-]*$/.test(fieldName)
    ? fieldName
    : "";
  const input =
    (safeFieldName
      ? gate.querySelector(`input[name="${safeFieldName}"]`)
      : null) ??
    gate.querySelector('input[name="email"], input');
  if (!input) return;

  requestAnimationFrame(() => {
    if (!input.isConnected) return;
    const activeElement = document.activeElement;
    if (
      activeElement &&
      activeElement !== document.body &&
      activeElement !== document.documentElement &&
      activeElement !== input
    ) {
      return;
    }
    input.focus();
    const feedback = gate.querySelector("#account-auth-feedback");
    if (feedback) input.setAttribute("aria-describedby", feedback.id);
    if (!isDesktop) {
      input.scrollIntoView({ block: "center", inline: "nearest" });
    }
  });
}

function authRedirectUrl(flowId = "") {
  const baseUrl = globalThis.SogrimNative?.authCallbackUrl ||
    `${window.location.origin}${window.location.pathname}`;
  if (!flowId) return baseUrl;
  const redirectUrl = new URL(baseUrl, window.location.origin);
  redirectUrl.searchParams.set(ACCOUNT_OAUTH_FLOW_QUERY_PARAM, flowId);
  return redirectUrl.toString();
}

async function secureOAuthUrl(urlBuilder) {
  const pkce = await createOAuthPkce();
  const flowId = createAccountOAuthFlowId();
  const flow = saveAccountOAuthFlow({
    id: flowId,
    verifier: pkce.verifier,
    returnPath: accountReturnPath()
  });
  if (!flow) throw new Error("Secure OAuth is unavailable");
  return urlBuilder(runtimeConfig, authRedirectUrl(flowId), {
    codeChallenge: pkce.challenge
  });
}

async function openOAuthUrl(url) {
  if (await globalThis.SogrimNative?.openAuth?.(url)) return;
  location.assign(url);
}

async function settleWithin(task, timeoutMs) {
  if (!task?.then) return task;
  let timeoutId = 0;
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error("Timed out")),
          timeoutMs
        );
      })
    ]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function cleanAuthHash(oauthFlow = null) {
  const returnPath = oauthFlow?.returnPath ||
    localStorage.getItem(ACCOUNT_RETURN_URL_STORAGE_KEY);
  clearAccountReturnUrl();
  const fallbackUrl = new URL(location.href);
  for (const key of [
    "code",
    "error",
    "error_code",
    "error_description",
    ACCOUNT_OAUTH_FLOW_QUERY_PARAM
  ]) {
    fallbackUrl.searchParams.delete(key);
  }
  history.replaceState(
    history.state,
    "",
    returnPath || `${fallbackUrl.pathname}${fallbackUrl.search}`
  );
}

function isExpiring(session) {
  return !session.expires_at || session.expires_at <= Math.floor(Date.now() / 1000) + 60;
}

function scheduleAccountSessionRefresh(delayOverride = null) {
  clearTimeout(accountRefreshTimer);
  if (!accountSession?.refresh_token || !runtimeConfig) return;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const refreshAtSeconds =
    Number(accountSession.expires_at ?? 0) - ACCOUNT_REFRESH_MARGIN_SECONDS;
  const delay = delayOverride ?? Math.max(
    1_000,
    (refreshAtSeconds - nowSeconds) * 1_000
  );
  accountRefreshTimer = window.setTimeout(
    refreshActiveAccountSession,
    delay
  );
}

function refreshAccountSessionIfNeeded() {
  if (
    accountSession?.expires_at >
    Math.floor(Date.now() / 1000) + ACCOUNT_REFRESH_MARGIN_SECONDS
  ) {
    scheduleAccountSessionRefresh();
    return;
  }
  refreshActiveAccountSession();
}

function refreshActiveAccountSession() {
  if (accountRefreshPromise) return accountRefreshPromise;
  if (!accountSession?.refresh_token || !runtimeConfig) {
    return Promise.resolve(null);
  }

  const previousSession = accountSession;
  const requestGeneration = accountRefreshGeneration;
  accountRefreshPromise = refreshAccountSession(runtimeConfig, previousSession)
    .then((refreshedSession) => {
      if (!refreshedSession) throw new Error("Account refresh failed");
      if (
        requestGeneration !== accountRefreshGeneration ||
        accountSession !== previousSession
      ) {
        return null;
      }
      accountSession = saveAccountSession({
        ...refreshedSession,
        user: refreshedSession.user ?? previousSession.user
      });
      publishAccountSessionSync(accountSession);
      scheduleAccountSessionRefresh();
      return accountSession;
    })
    .catch(() => {
      if (
        requestGeneration === accountRefreshGeneration &&
        accountSession === previousSession
      ) {
        scheduleAccountSessionRefresh(ACCOUNT_REFRESH_RETRY_MS);
      }
      return null;
    })
    .finally(() => {
      accountRefreshPromise = null;
    });
  return accountRefreshPromise;
}

function setAuthBusy(value) {
  authBusy = value;
  document.documentElement.classList.toggle("account-auth-busy", value);
  const gate = document.getElementById(GATE_ID);
  gate?.setAttribute("aria-busy", String(value));
  const status = gate?.querySelector("[data-account-auth-status]");
  if (status) status.textContent = value ? "מתחברים לחשבון…" : "";
  document.querySelectorAll("#public-account-auth-gate button, #public-account-auth-gate input")
    .forEach((element) => {
      element.disabled = value || element.hasAttribute("data-account-google-placeholder");
    });
}

function rememberProfileRouteBeforeLegalNavigation() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("action", "profile");
    window.history.replaceState(window.history.state, "", url);
  } catch {}
}

function sessionValue(key) {
  try {
    return window.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setSessionValue(key, value) {
  try {
    window.sessionStorage?.setItem(key, value);
  } catch {}
}

function removeSessionValue(key) {
  try {
    window.sessionStorage?.removeItem(key);
  } catch {}
}

function oauthPkceVerifier() {
  try {
    return window.localStorage?.getItem(OAUTH_PKCE_VERIFIER_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveOAuthPkceVerifier(verifier) {
  try {
    window.localStorage?.setItem(OAUTH_PKCE_VERIFIER_KEY, verifier);
  } catch {}
}

function clearOAuthPkceVerifier() {
  try {
    window.localStorage?.removeItem(OAUTH_PKCE_VERIFIER_KEY);
  } catch {}
}

function googleIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.19-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/>
    <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/>
    <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.55l3.35-2.62Z"/>
    <path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"/>
  </svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .account-auth-gate {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      padding: 24px;
      overflow: auto;
      color: #17201d;
      background: #f4f7f5;
    }

    html.account-auth-locked .skip-link {
      display: none;
    }

    html.account-auth-locked #app {
      visibility: hidden !important;
      pointer-events: none !important;
    }

    .account-auth-shell {
      width: min(100%, 940px);
      min-height: 590px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(360px, 0.88fr);
      overflow: hidden;
      border: 1px solid #dbe4df;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 28px 80px rgba(17, 43, 36, 0.16);
    }

    .account-auth-brand {
      display: grid;
      align-content: space-between;
      gap: 28px;
      padding: 44px;
      color: #ffffff;
      background: #0b3b38;
    }

    .account-auth-mark {
      width: 50px;
      height: 50px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 8px;
      color: #dff4f5;
      background: rgba(255,255,255,.1);
      font-size: 24px;
      font-weight: 900;
    }

    #public-account-auth-gate .account-auth-brand h1 {
      max-width: 13ch;
      margin: 8px 0 14px;
      color: #ffffff !important;
      font-size: clamp(32px, 5vw, 50px);
      line-height: 1.1;
    }

    #public-account-auth-gate .account-auth-brand .eyebrow {
      color: #71d9de !important;
    }

    #public-account-auth-gate .account-auth-brand p {
      margin: 0;
      color: rgba(255,255,255,.82) !important;
      font-size: 16px;
      line-height: 1.65;
    }

    .account-auth-brand ul {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
      color: rgba(255,255,255,.88);
      font-weight: 650;
    }

    .account-auth-brand li::before {
      content: "✓";
      margin-inline-end: 9px;
      color: #71d9de;
    }

    .account-auth-form-panel {
      display: grid;
      align-content: center;
      gap: 20px;
      padding: 40px;
    }

    .account-invite-preview {
      display: grid;
      gap: 5px;
      padding: 14px 16px;
      border: 1px solid rgba(7, 95, 89, .18);
      border-radius: 8px;
      background: #edf7f4;
    }

    .account-invite-preview span {
      color: #08766c;
      font-size: 13px;
      font-weight: 850;
    }

    .account-invite-preview strong {
      color: #14201d;
      font-size: 18px;
    }

    .account-invite-preview p {
      margin: 0;
      color: #65736e;
      font-size: 14px;
    }

    .account-auth-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      padding: 4px;
      border: 1px solid #dce5e0;
      border-radius: 8px;
      background: #f4f7f5;
    }

    .account-auth-tabs button {
      min-height: 44px;
      border: 0;
      border-radius: 6px;
      color: #63716b;
      background: transparent;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }

    .account-auth-tabs button.is-active {
      color: #075e55;
      background: #ffffff;
      box-shadow: 0 2px 9px rgba(19, 56, 46, .1);
    }

    .account-auth-heading h2 {
      margin: 0 0 6px;
      font-size: 28px;
      line-height: 1.2;
      text-wrap: balance;
      overflow-wrap: anywhere;
    }

    .account-auth-heading p,
    .account-auth-legal {
      margin: 0;
      color: #68766f;
      line-height: 1.5;
    }

    .account-auth-legal a {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      color: #08766c;
      font-weight: 750;
    }

    .account-google-slot:empty {
      display: none;
    }

    .account-google-slot:not(:empty) {
      display: grid;
      gap: 20px;
    }

    .account-google-control {
      min-height: 48px;
      display: grid;
      place-items: stretch;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    .account-google-control > * {
      grid-area: 1 / 1;
    }

    .account-google-official {
      min-height: 48px;
      display: none;
      place-items: center;
      overflow: hidden;
      border-radius: 8px;
      outline: none;
      -webkit-tap-highlight-color: transparent;
    }

    .account-google-official iframe {
      outline: none !important;
      -webkit-tap-highlight-color: transparent !important;
    }

    .account-google-official:focus-within {
      outline: none;
      box-shadow: none;
    }

    .account-google-control.is-google-ready .account-google-official {
      display: grid;
    }

    .account-google-control.is-google-ready .account-google-fallback {
      display: none;
    }

    .account-google-control.is-google-ready.is-google-signing-in .account-google-official {
      display: none;
    }

    .account-google-control.is-google-ready.is-google-signing-in .account-google-fallback {
      display: flex;
    }

    .account-google-official > div,
    .account-google-official iframe {
      max-width: 100% !important;
    }

    .account-google-button {
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      border: 1px solid #cfdbd5;
      border-radius: 8px;
      color: #17201d;
      background: #ffffff;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
      transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    }

    .account-google-button:hover {
      border-color: #aebfb7;
      box-shadow: 0 6px 16px rgba(20, 59, 49, .08);
      transform: translateY(-1px);
    }

    .account-google-button:active {
      border-color: #cfdbd5;
      color: #17201d;
      background: #ffffff;
      box-shadow: none;
      transform: scale(.985);
    }

    .account-google-loading {
      cursor: wait;
      pointer-events: none;
    }

    .account-google-button svg {
      width: 20px;
      height: 20px;
    }

    .account-email-toggle {
      width: 100%;
      min-height: 48px;
      padding: 0 16px;
      border: 1px solid #cfdbd5;
      border-radius: 8px;
      color: #075e55;
      background: #ffffff;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }

    .account-apple-button {
      border-color: #171b19;
      color: #ffffff;
      background: #171b19;
    }

    .account-apple-button:hover {
      border-color: #000000;
      background: #000000;
    }

    .account-auth-divider {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 10px;
      color: #78867f;
      font-size: 13px;
      font-weight: 700;
    }

    .account-auth-divider::before,
    .account-auth-divider::after {
      content: "";
      height: 1px;
      background: #e0e7e3;
    }

    .account-auth-form {
      display: grid;
      gap: 14px;
    }

    .account-auth-form label {
      display: grid;
      gap: 7px;
      font-weight: 750;
    }

    .account-auth-field-hint {
      color: #60746d;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.45;
    }

    .account-auth-form input {
      width: 100%;
      min-height: 48px;
      padding: 0 13px;
      border: 1px solid #cfdbd5;
      border-radius: 8px;
      color: #17201d;
      background: #ffffff;
      font: inherit;
      font-size: 16px;
      outline: none;
    }

    .account-auth-form input:focus-visible {
      border-color: #087c78;
      box-shadow: 0 0 0 1px #087c78;
      outline: 3px solid #087c78;
      outline-offset: 2px;
    }

    .account-password-input {
      position: relative;
      display: block;
    }

    .account-password-input > input {
      padding-inline-end: 56px;
    }

    .account-password-toggle {
      position: absolute;
      inset-inline-end: 4px;
      inset-block-start: 50%;
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 8px;
      color: #49615a;
      background: transparent;
      transform: translateY(-50%);
    }

    .account-password-toggle:active {
      transform: translateY(-50%) scale(0.96);
    }

    .account-password-toggle .ui-icon-svg {
      width: 21px;
      height: 21px;
    }

    #public-account-auth-gate button:focus-visible,
    #public-account-auth-gate a:focus-visible {
      outline: 3px solid #087c78;
      outline-offset: 3px;
    }

    .account-auth-submit {
      width: 100%;
      min-height: 50px;
      margin-top: 4px;
    }

    .account-forgot-button {
      justify-self: start;
      min-height: 44px;
      padding: 0;
      border: 0;
      color: #08766c;
      background: transparent;
      font: inherit;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
    }

    .account-auth-message,
    .account-auth-error {
      margin: 0;
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 700;
    }

    .account-auth-message {
      color: #075e55;
      background: #e7f5f1;
    }

    .account-auth-error {
      color: #9a3f2c;
      background: #fff0ec;
    }

    .account-auth-legal {
      font-size: 12px;
      text-align: center;
    }

    .account-auth-busy .account-auth-shell {
      opacity: .72;
      pointer-events: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .account-google-button {
        transition: none;
      }
    }

    .account-profile-controls {
      min-width: 0;
      display: block;
      width: 100%;
      margin-inline-start: auto;
      border-top: 1px solid rgba(16, 35, 33, .1);
    }

    .account-profile-controls-summary {
      min-height: 68px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 24px;
      align-items: center;
      gap: 12px;
      padding: 12px 2px;
      color: #163a34;
      cursor: pointer;
      list-style: none;
    }

    .account-profile-controls-summary::-webkit-details-marker {
      display: none;
    }

    .account-profile-controls-summary-copy {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .account-profile-controls-summary-copy strong {
      font-size: 15px;
      font-weight: 800;
    }

    .account-profile-controls-summary-copy small {
      color: #677872;
      font-size: 12px;
      line-height: 1.45;
    }

    .account-profile-controls-summary-chevron {
      width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      color: #78918a;
      transition: transform .18s ease;
    }

    .account-profile-controls-summary-chevron svg {
      width: 20px;
      height: 20px;
    }

    .account-profile-controls[open] .account-profile-controls-summary-chevron {
      transform: rotate(-90deg);
    }

    .account-profile-controls-body {
      min-width: 0;
      display: grid;
      align-items: start;
      gap: 10px;
      padding-top: 4px;
    }

    .account-profile-email {
      max-width: 220px;
      overflow: hidden;
      color: #6a7771;
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .account-profile-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .account-feedback-entry {
      width: 100%;
      min-height: 76px;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 20px;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border: 1px solid rgba(12, 91, 79, .14);
      border-radius: 8px;
      color: #163a34;
      text-align: start;
      background: rgba(237, 247, 244, .72);
      box-shadow: 0 8px 24px rgba(13, 73, 63, .06);
      cursor: pointer;
      transition:
        border-color .2s ease,
        background-color .2s ease,
        transform .2s ease;
    }

    .account-feedback-entry:hover,
    .account-feedback-entry:focus-visible {
      border-color: rgba(8, 123, 116, .34);
      background: #edf8f5;
      transform: translateY(-1px);
    }

    .account-feedback-entry-icon {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: #087b74;
      background: #ffffff;
      box-shadow: 0 5px 16px rgba(8, 123, 116, .12);
    }

    .account-feedback-entry-icon svg {
      width: 23px;
      height: 23px;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.8;
    }

    .account-feedback-entry-copy {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .account-feedback-entry-copy strong {
      font-size: 15px;
      font-weight: 800;
    }

    .account-feedback-entry-copy small {
      color: #677872;
      font-size: 12px;
      line-height: 1.45;
    }

    .account-feedback-entry-chevron {
      color: #78918a;
      font-size: 27px;
      line-height: 1;
    }

    .account-feedback-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1110;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(18, 29, 27, .52);
      backdrop-filter: blur(8px);
    }

    html.account-feedback-open,
    html.account-feedback-open body {
      overflow: hidden;
    }

    .account-feedback-dialog {
      width: min(560px, 100%);
      max-height: min(760px, calc(100dvh - 40px));
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 26px;
      border: 1px solid rgba(23, 32, 29, .12);
      border-radius: 12px;
      color: #17201d;
      background: #ffffff;
      box-shadow: 0 24px 64px rgba(18, 29, 27, .22);
    }

    .account-feedback-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 44px;
      align-items: start;
      gap: 16px;
      margin-bottom: 22px;
    }

    .account-feedback-header h2,
    .account-feedback-success h2 {
      margin: 3px 0 7px;
      font-size: 26px;
      line-height: 1.18;
    }

    .account-feedback-header p,
    .account-feedback-success p {
      margin: 0;
      color: #66746f;
      line-height: 1.55;
    }

    .account-feedback-close {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid rgba(23, 32, 29, .12);
      border-radius: 50%;
      color: #33413c;
      font-size: 26px;
      line-height: 1;
      background: #f5f8f7;
      cursor: pointer;
    }

    .account-feedback-form {
      display: grid;
      gap: 20px;
    }

    .account-feedback-categories {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .account-feedback-categories legend {
      margin-bottom: 9px;
      color: #52625c;
      font-size: 13px;
      font-weight: 800;
    }

    .account-feedback-categories label {
      position: relative;
      min-width: 0;
    }

    .account-feedback-categories input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .account-feedback-categories span {
      min-height: 46px;
      display: grid;
      place-items: center;
      padding: 8px;
      border: 1px solid rgba(25, 49, 44, .14);
      border-radius: 8px;
      color: #53635d;
      font-size: 13px;
      font-weight: 800;
      text-align: center;
      background: #f8faf9;
      cursor: pointer;
    }

    .account-feedback-categories input:checked + span {
      border-color: #087b74;
      color: #075f59;
      background: #e6f4f1;
      box-shadow: inset 0 0 0 1px rgba(8, 123, 116, .16);
    }

    .account-feedback-categories input:focus-visible + span {
      outline: 3px solid rgba(38, 184, 173, .3);
      outline-offset: 2px;
    }

    .account-feedback-message {
      display: grid;
      gap: 8px;
      color: #3f4d48;
      font-size: 14px;
      font-weight: 800;
    }

    .account-feedback-message textarea {
      width: 100%;
      min-height: 150px;
      resize: vertical;
      padding: 14px 15px;
      border: 1px solid rgba(25, 49, 44, .18);
      border-radius: 8px;
      color: #18231f;
      font: inherit;
      font-weight: 500;
      line-height: 1.55;
      background: #fbfcfc;
    }

    .account-feedback-message textarea:focus {
      border-color: #1c958d;
      outline: 3px solid rgba(38, 184, 173, .22);
    }

    .account-feedback-message small {
      color: #7a8782;
      font-size: 12px;
      font-weight: 500;
    }

    .account-feedback-error {
      margin: 0;
      padding: 10px 12px;
      border-radius: 6px;
      color: #963b31;
      font-size: 13px;
      font-weight: 700;
      background: #fff0ec;
    }

    .account-feedback-actions {
      display: grid;
      grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr);
      gap: 10px;
    }

    .account-feedback-actions button {
      width: 100%;
    }

    html.account-feedback-busy .account-feedback-dialog {
      cursor: wait;
    }

    .account-feedback-success {
      min-height: 350px;
      display: grid;
      align-content: center;
      justify-items: center;
      gap: 10px;
      text-align: center;
    }

    .account-feedback-success > span {
      width: 62px;
      height: 62px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: #ffffff;
      font-size: 30px;
      background: #087b74;
      box-shadow: 0 12px 30px rgba(8, 123, 116, .24);
    }

    .account-feedback-success .primary-button {
      min-width: 180px;
      margin-top: 12px;
    }

    .account-danger-zone {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      margin-top: 14px;
      padding-top: 18px;
      border-top: 1px solid rgba(16, 35, 33, .12);
    }

    .account-danger-copy {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .account-danger-copy strong {
      color: #394842;
      font-size: 13px;
    }

    .account-danger-copy small {
      color: #77837e;
      font-size: 12px;
      line-height: 1.45;
    }

    .account-data-links {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .account-data-link {
      min-width: 44px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #52605a;
      font-size: 13px;
      font-weight: 750;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    button.account-data-link {
      padding: 0;
      border: 0;
      background: transparent;
      font: inherit;
      cursor: pointer;
    }

    .account-delete-button {
      color: #a33d32;
      border-color: rgba(163, 61, 50, .28);
    }

    .account-delete-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(18, 29, 27, .52);
      backdrop-filter: blur(8px);
    }

    html.account-delete-open,
    html.account-delete-open body {
      overflow: hidden;
    }

    .account-delete-dialog {
      width: min(480px, 100%);
      padding: 28px;
      border: 1px solid rgba(23, 32, 29, .12);
      border-radius: 12px;
      color: #17201d;
      background: #ffffff;
      box-shadow: 0 24px 64px rgba(18, 29, 27, .22);
    }

    .account-delete-dialog h2 {
      margin: 4px 0 10px;
      font-size: 28px;
      letter-spacing: 0;
    }

    .account-delete-dialog > p:not(.eyebrow) {
      margin: 0;
      color: #5f6c66;
      line-height: 1.65;
    }

    .account-delete-confirmation {
      min-height: 52px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 22px 0 0;
      padding: 14px;
      border: 1px solid #e2e7e4;
      border-radius: 8px;
      background: #f8faf9;
      cursor: pointer;
    }

    .account-delete-confirmation input {
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
      accent-color: #a33d32;
    }

    .account-delete-confirmation span {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.45;
    }

    .account-delete-error {
      margin-top: 14px !important;
      color: #a33d32 !important;
      font-weight: 750;
    }

    .account-delete-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 22px;
    }

    .account-delete-confirm {
      background: #a33d32;
      border-color: #a33d32;
    }

    .account-delete-confirm:hover:not(:disabled) {
      background: #873229;
      border-color: #873229;
    }

    .account-delete-busy .account-delete-dialog {
      opacity: .72;
      pointer-events: none;
    }

    @media (max-width: 760px),
      (min-width: 761px) and (max-width: 1366px) and (hover: none) and (pointer: coarse) {
      .account-auth-gate {
        place-items: stretch;
        padding: 0;
        scroll-padding-block-end: calc(120px + env(safe-area-inset-bottom));
        background: #ffffff;
      }

      .account-auth-shell {
        width: 100%;
        min-height: 100dvh;
        grid-template-columns: 1fr;
        overflow: visible;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      .account-auth-brand {
        min-height: 230px;
        align-content: start;
        gap: 18px;
        padding-top: calc(24px + env(safe-area-inset-top));
        padding-bottom: 26px;
        padding-left: max(24px, env(safe-area-inset-left));
        padding-right: max(24px, env(safe-area-inset-right));
      }

      .account-auth-brand h1 {
        max-width: 16ch;
        margin-block: 4px 10px;
        font-size: 32px;
      }

      .account-auth-brand ul {
        display: none;
      }

      .account-auth-form-panel {
        align-content: start;
        padding-top: 24px;
        padding-bottom: calc(28px + env(safe-area-inset-bottom));
        padding-left: max(20px, env(safe-area-inset-left));
        padding-right: max(20px, env(safe-area-inset-right));
      }

      .account-email-auth {
        scroll-margin-block: 18px calc(120px + env(safe-area-inset-bottom));
      }

      .account-auth-heading h2 {
        font-size: clamp(1.45rem, 7vw, 1.7rem);
      }

      .account-profile-controls {
        width: 100%;
        align-items: flex-start;
        margin: 10px 0 0;
      }

      .account-data-links {
        width: 100%;
        gap: 12px;
        padding-top: 4px;
        border-top: 1px solid rgba(16, 35, 33, .1);
      }

      .account-profile-actions {
        width: 100%;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
      }

      .account-profile-actions .secondary-button {
        width: 100%;
        min-width: 0;
      }

      .account-profile-actions .account-install-button {
        grid-column: 1 / -1;
      }

      .account-feedback-backdrop {
        display: block;
        padding: 0;
        background: #ffffff;
        backdrop-filter: none;
      }

      .account-feedback-dialog {
        width: 100%;
        max-height: 100dvh;
        min-height: 100dvh;
        padding:
          calc(22px + env(safe-area-inset-top))
          max(18px, env(safe-area-inset-right))
          calc(24px + env(safe-area-inset-bottom))
          max(18px, env(safe-area-inset-left));
        border: 0;
        border-radius: 0;
        box-shadow: none;
        scroll-padding-block-end: calc(80px + env(safe-area-inset-bottom));
      }

      .account-feedback-header h2,
      .account-feedback-success h2 {
        font-size: 24px;
      }

      .account-feedback-categories {
        grid-template-columns: 1fr;
      }

      .account-feedback-categories span {
        justify-items: start;
        padding-inline: 14px;
      }

      .account-feedback-actions {
        grid-template-columns: 1fr;
      }

      .account-feedback-actions .primary-button {
        grid-row: 1;
      }

      .account-danger-zone {
        width: 100%;
        align-items: stretch;
        flex-direction: column;
        gap: 12px;
        margin-top: 18px;
      }

      .account-danger-zone .account-delete-button {
        width: 100%;
      }

      .account-delete-backdrop {
        align-items: end;
        padding: 0;
      }

      .account-delete-dialog {
        width: 100%;
        max-height: 100dvh;
        overflow: auto;
        padding:
          24px
          max(20px, env(safe-area-inset-right))
          calc(20px + env(safe-area-inset-bottom))
          max(20px, env(safe-area-inset-left));
        border-radius: 12px 12px 0 0;
      }

      .account-delete-actions {
        position: sticky;
        bottom: 0;
        padding-top: 14px;
        background: #ffffff;
      }
    }

    /* iPad home-screen apps use tablet CSS widths even when the intended UI is phone-like. */
    @media (min-width: 761px) and (max-width: 1366px) and (hover: none) and (pointer: coarse) {
      .account-auth-gate {
        justify-items: center;
        padding-inline:
          max(16px, env(safe-area-inset-left))
          max(16px, env(safe-area-inset-right));
        background: #f4f7f5;
      }

      .account-auth-shell {
        width: min(100%, 430px);
      }
    }
  `;
  document.head.append(style);
}
