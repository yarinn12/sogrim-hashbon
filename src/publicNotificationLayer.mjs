import {
  clearStoredPushToken,
  disablePushDevice,
  loadStoredPushPreferences,
  pushPreferenceStorageKey,
  registerPushDevice,
  saveStoredPushPreferences,
  saveStoredPushToken,
  storedPushToken
} from "./data/pushDevices.mjs";
import { loadStoredAccountSession } from "./data/accountAuth.mjs";
import { loadRuntimeConfig } from "./data/localStore.mjs";
import { runAfterFirstInteractiveScreen } from "./data/startupScheduler.mjs";
import { iconSvg } from "./uiIcons.mjs";

const STYLE_ID = "public-notification-layer-style";
const PUSH_TOKEN_EVENT = "settle-friends:push-token";
const PUSH_STATUS_EVENT = "settle-friends:push-status";
const NATIVE_CAPABILITIES_EVENT = "settle-friends:native-capabilities";
const NATIVE_RESUME_EVENT = "settle-friends:native-resume";

let permissionState = "prompt";
let notificationBusy = false;
let notificationError = "";
let registeredForCurrentAccount = false;
let startupReady = false;
let notificationInitializationRequest = null;
let notificationInitializationPending = false;
let pushDeviceMutationTail = Promise.resolve();
let notificationUiAccountId = "";
let notificationAction = null;

setupNotificationLayer();

function setupNotificationLayer() {
  injectNotificationStyles();
  document.addEventListener("settle-friends:screen-rendered", renderNotificationSettings);
  document.addEventListener(PUSH_TOKEN_EVENT, handlePushToken);
  document.addEventListener(PUSH_STATUS_EVENT, handlePushStatus);
  document.addEventListener(NATIVE_CAPABILITIES_EVENT, handleNativeCapabilities);
  window.addEventListener("online", requestNotificationInitialization);
  window.addEventListener(NATIVE_RESUME_EVENT, requestNotificationInitialization);
  document.addEventListener("click", handleNotificationAction, true);
  document.addEventListener("change", handleNotificationPreferenceChange, true);

  globalThis.SogrimNotifications = {
    prepareSignOut: () => disableNotifications({ silent: true })
  };

  runAfterFirstInteractiveScreen(() => {
    startupReady = true;
    document.addEventListener("account-auth-ready", requestNotificationInitialization);
    requestNotificationInitialization();
    renderNotificationSettings();
  });
}

function handleNativeCapabilities() {
  if (!startupReady) return;
  requestNotificationInitialization();
  renderNotificationSettings();
}

function requestNotificationInitialization() {
  if (!startupReady) return Promise.resolve(false);
  if (notificationInitializationRequest) {
    notificationInitializationPending = true;
    return notificationInitializationRequest;
  }

  notificationInitializationRequest = (async () => {
    let completed = false;
    do {
      notificationInitializationPending = false;
      completed = await initializeNotifications().then(() => true).catch(() => false);
      // Later resume/account signals request one fresh pass. Failures alone
      // never schedule a loop or prompt for notification permission.
    } while (notificationInitializationPending);
    return completed;
  })()
    .finally(() => {
      notificationInitializationRequest = null;
    });
  return notificationInitializationRequest;
}

function notificationAccountIsCurrent(userId) {
  return Boolean(userId && String(loadStoredAccountSession()?.user?.id ?? "").trim() === String(userId).trim());
}

function synchronizeNotificationUiAccount() {
  const userId = String(loadStoredAccountSession()?.user?.id ?? "").trim();
  if (notificationUiAccountId !== userId) {
    notificationUiAccountId = userId;
    notificationAction = null;
    notificationBusy = false;
    notificationError = "";
    registeredForCurrentAccount = false;
  }
  return userId;
}

function beginNotificationAction(userId, { silent = false } = {}) {
  synchronizeNotificationUiAccount();
  notificationAction = { userId };
  notificationBusy = !silent;
  notificationError = "";
  return notificationAction;
}

function notificationActionIsCurrent(action) {
  return notificationAction === action && notificationAccountIsCurrent(action.userId);
}

function finishNotificationAction(action) {
  if (notificationAction !== action) return;
  notificationAction = null;
  notificationBusy = false;
  renderNotificationSettings();
}

function queuePushDeviceMutation(mutation) {
  // Register, preference updates and disable share one order. An earlier
  // in-flight registration must settle before the newer disable/update.
  const request = pushDeviceMutationTail.then(mutation);
  pushDeviceMutationTail = request.catch(() => {});
  return request;
}

async function initializeNotifications() {
  synchronizeNotificationUiAccount();
  const api = nativeNotificationApi();
  const session = loadStoredAccountSession();
  if (!api || !session?.user?.id) return;

  try {
    const permission = await api.checkPermission();
    if (!notificationAccountIsCurrent(session.user.id)) return;
    permissionState = permission.receive;
    notificationError = "";
    renderNotificationSettings();

    if (!notificationPreferenceEnabled(session.user.id)) {
      await retryDisabledNotificationCleanup(session.user.id);
      return;
    }

    if (
      permissionState === "granted"
    ) {
      await api.registerIfGranted();
      if (!notificationAccountIsCurrent(session.user.id) || !notificationPreferenceEnabled(session.user.id)) return;
      try {
        await syncNotificationPreferences(
          session.user.id,
          loadStoredPushPreferences(session.user.id)
        );
      } catch {
        if (!notificationAccountIsCurrent(session.user.id) || !notificationPreferenceEnabled(session.user.id)) return;
        registeredForCurrentAccount = false;
        notificationError =
          "ההתראות פעילות במכשיר. החיבור לחשבון יושלם אוטומטית.";
      }
      if (notificationAccountIsCurrent(session.user.id)) renderNotificationSettings();
    }
  } catch {
    if (!notificationAccountIsCurrent(session.user.id)) return;
    notificationError = "לא הצלחנו לבדוק את מצב ההתראות.";
    renderNotificationSettings();
  }
}

async function retryDisabledNotificationCleanup(userId) {
  if (!notificationAccountIsCurrent(userId)) return false;
  const token = storedPushToken(userId);
  if (!token) return true;

  try {
    await nativeNotificationApi()?.disable?.();
  } catch {
    // Server cleanup is still required even if the native plugin cannot
    // repeat an unregister call for a token that is already inactive.
  }

  try {
    const result = await disablePushDeviceWithAccountRecovery(userId, token);
    if (!notificationAccountIsCurrent(userId) || notificationPreferenceEnabled(userId)) return false;
    if (!result.ok) return false;
    clearStoredPushToken(userId);
    registeredForCurrentAccount = false;
    return true;
  } catch {
    // Keep the token locally. Online/resume initialization will retry the
    // remote cleanup without re-enabling notifications on the device.
    if (notificationAccountIsCurrent(userId)) registeredForCurrentAccount = false;
    return false;
  }
}

async function handleNotificationAction(event) {
  synchronizeNotificationUiAccount();
  const button =
    event.target instanceof Element
      ? event.target.closest("[data-notification-action]")
      : null;
  if (!button || notificationBusy) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if (button.dataset.notificationAction === "enable") {
    await enableNotifications();
  } else if (button.dataset.notificationAction === "disable") {
    await disableNotifications();
  }
}

async function handleNotificationPreferenceChange(event) {
  synchronizeNotificationUiAccount();
  const input =
    event.target instanceof Element
      ? event.target.closest("[data-notification-preference]")
      : null;
  if (!input || notificationBusy) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const session = loadStoredAccountSession();
  const userId = String(session?.user?.id ?? "").trim();
  const preference = String(input.dataset.notificationPreference ?? "");
  if (
    !userId ||
    !["eventUpdates", "paymentReminders"].includes(preference) ||
    !notificationPreferenceEnabled(userId) ||
    permissionState !== "granted"
  ) {
    renderNotificationSettings();
    return;
  }

  const preferences = loadStoredPushPreferences(userId);
  preferences[preference] = Boolean(input.checked);
  saveStoredPushPreferences(userId, preferences);

  const action = beginNotificationAction(userId);
  renderNotificationSettings();
  try {
    const synced = await syncNotificationPreferences(userId, preferences);
    if (!notificationActionIsCurrent(action)) return;
    if (synced === false) {
      notificationError =
        "הבחירה נשמרה במכשיר ותסתנכרן אוטומטית בחיבור הבא.";
    }
  } catch {
    if (!notificationActionIsCurrent(action)) return;
    registeredForCurrentAccount = false;
    notificationError =
      "הבחירה נשמרה במכשיר ותסתנכרן אוטומטית בחיבור הבא.";
  } finally {
    finishNotificationAction(action);
  }
}

async function enableNotifications() {
  const api = nativeNotificationApi();
  const session = loadStoredAccountSession();
  if (!api || !session?.user?.id) return;

  const action = beginNotificationAction(session.user.id);
  // Native registration can emit its token before enable() resolves.
  // Record the user's intent first so that token is not discarded.
  setNotificationPreference(session.user.id, true);
  registeredForCurrentAccount = false;
  renderNotificationSettings();
  try {
    const permission = await api.enable();
    if (!notificationActionIsCurrent(action)) return;
    permissionState = permission.receive;
    const enabled = permissionState === "granted";
    setNotificationPreference(session.user.id, enabled);
    if (!enabled) {
      notificationError = "ההרשאה לא אושרה. אפשר לשנות זאת בהגדרות המכשיר.";
    } else if (!registeredForCurrentAccount) {
      await syncNotificationPreferences(session.user.id, loadStoredPushPreferences(session.user.id));
    }
  } catch {
    if (!notificationActionIsCurrent(action)) return;
    notificationError = "לא הצלחנו להפעיל התראות כרגע.";
  } finally {
    finishNotificationAction(action);
  }
}

async function disableNotifications({ silent = false } = {}) {
  const api = nativeNotificationApi();
  const session = loadStoredAccountSession();
  const userId = String(session?.user?.id ?? "").trim();
  if (!api || !userId) return false;

  const action = beginNotificationAction(userId, { silent });
  setNotificationPreference(userId, false);
  registeredForCurrentAccount = false;
  renderNotificationSettings();
  const token = storedPushToken(userId);
  let remoteDisabled = !token;

  try {
    await api.disable();
    if (!notificationActionIsCurrent(action)) return false;

    if (token) {
      try {
        const result = await disablePushDeviceWithAccountRecovery(userId, token);
        remoteDisabled = result.ok;
      } catch {
        remoteDisabled = false;
      }
    }

    if (!notificationActionIsCurrent(action)) return false;
    if (remoteDisabled && storedPushToken(userId) === token) clearStoredPushToken(userId);
    if (!remoteDisabled && !silent) {
      notificationError = "ההתראות כובו במכשיר. ניקוי החיבור לשרת יושלם בחיבור הבא.";
    }
    return true;
  } catch {
    if (!notificationActionIsCurrent(action)) return false;
    if (!silent) notificationError = "לא הצלחנו לכבות התראות כרגע.";
    return false;
  } finally {
    finishNotificationAction(action);
  }
}

async function handlePushToken(event) {
  const session = loadStoredAccountSession();
  const userId = String(session?.user?.id ?? "").trim();
  const token = String(event.detail?.token ?? "").trim();
  const platform = String(event.detail?.platform ?? "").trim().toLowerCase();
  if (!userId || !token || !notificationPreferenceEnabled(userId)) return;

  saveStoredPushToken(userId, token);
  try {
    const result = await registerPushDeviceWithAccountRecovery(userId, {
      token,
      platform,
      preferences: loadStoredPushPreferences(userId)
    });
    if (!notificationAccountIsCurrent(userId) || !notificationPreferenceEnabled(userId)) return;
    if (storedPushToken(userId) !== token || result.reason === "superseded") return;
    registeredForCurrentAccount = result.ok;
    notificationError = result.ok
      ? ""
      : "ההתראות פעילות במכשיר, אך החשבון עדיין לא מחובר אליהן.";
  } catch {
    if (!notificationAccountIsCurrent(userId) || !notificationPreferenceEnabled(userId)) return;
    if (storedPushToken(userId) !== token) return;
    registeredForCurrentAccount = false;
    notificationError = "ההתראות פעילות במכשיר. החיבור לחשבון יושלם אוטומטית.";
  }
  renderNotificationSettings();
}

async function syncNotificationPreferences(userId, preferences) {
  if (!notificationAccountIsCurrent(userId) || !notificationPreferenceEnabled(userId)) return false;
  const token = storedPushToken(userId);
  const platform = String(
    globalThis.Capacitor?.getPlatform?.() ?? ""
  ).trim().toLowerCase();
  if (!token || !["android", "ios"].includes(platform)) return false;

  let result;
  try {
    result = await registerPushDeviceWithAccountRecovery(userId, { token, platform, preferences });
  } catch (error) {
    if (notificationAccountIsCurrent(userId) && storedPushToken(userId) !== token) return null;
    throw error;
  }
  if (!notificationAccountIsCurrent(userId) || !notificationPreferenceEnabled(userId)) return false;
  // A replaced token/request is not a failed save or a delivery receipt.
  if (storedPushToken(userId) !== token || result.reason === "superseded") return null;
  registeredForCurrentAccount = result.ok;
  return result.ok;
}

function registerPushDeviceWithAccountRecovery(userId, registration) {
  return queuePushDeviceMutation(() => pushDeviceMutationWithAccountRecovery(userId, (config) => {
    if (!notificationPreferenceEnabled(userId) || storedPushToken(userId) !== registration.token) {
      return { ok: false, reason: "superseded" };
    }
    return registerPushDevice(config, { ...registration, preferences: loadStoredPushPreferences(userId) });
  }));
}

function disablePushDeviceWithAccountRecovery(userId, token) {
  return queuePushDeviceMutation(() => pushDeviceMutationWithAccountRecovery(userId, (config) => {
    if (notificationPreferenceEnabled(userId) || storedPushToken(userId) !== token) {
      return { ok: false, reason: "superseded" };
    }
    return disablePushDevice(config, token);
  }));
}

async function pushDeviceMutationWithAccountRecovery(userId, mutation) {
  const expectedUserId = String(userId ?? "").trim();
  let config = await loadRuntimeConfig();
  const request = () => {
    if (!notificationAccountIsCurrent(expectedUserId) ||
        String(config?.storage?.account?.userId ?? "").trim() !== expectedUserId) {
      const error = new Error("Account changed before push registration");
      error.code = "AUTH_REQUIRED";
      throw error;
    }
    return mutation(config);
  };

  try {
    if (notificationAccountIsCurrent(expectedUserId) && config?.storage?.mode === "supabase" && !config.storage.account) {
      // Expired local identity is omitted from config, so no HTTP request
      // exists to produce a 401. Use the same bounded refresh path.
      throw Object.assign(new Error("Push session needs refresh"), { status: 401 });
    }
    return await request();
  } catch (error) {
    if (
      Number(error?.status ?? 0) !== 401 ||
      !expectedUserId
    ) {
      throw error;
    }
  }

  const refreshedSession = await globalThis.SogrimAccountSession?.refresh?.();
  if (
    !refreshedSession?.access_token ||
    String(refreshedSession?.user?.id ?? "").trim() !== expectedUserId
  ) {
    const error = new Error("Push account session is unavailable");
    error.code = "AUTH_REQUIRED";
    throw error;
  }

  config = await loadRuntimeConfig();
  if (
    String(config?.storage?.account?.userId ?? "").trim() !== expectedUserId
  ) {
    const error = new Error("Account changed during push recovery");
    error.code = "AUTH_REQUIRED";
    throw error;
  }
  return request();
}

function handlePushStatus(event) {
  if (event.detail?.status !== "error") return;
  notificationError = "המכשיר לא הצליח להירשם להתראות.";
  registeredForCurrentAccount = false;
  renderNotificationSettings();
}

function renderNotificationSettings() {
  synchronizeNotificationUiAccount();
  document.querySelector("[data-notification-settings]")?.remove();
  const host = document.querySelector(
    ".profile-edit-screen .profile-setup-panel"
  );
  const api = nativeNotificationApi();
  const session = loadStoredAccountSession();
  const userId = String(session?.user?.id ?? "").trim();
  if (!host || !api || !userId) return;

  const enabled = notificationPreferenceEnabled(userId);
  const preferences = loadStoredPushPreferences(userId);
  const view = notificationViewState(enabled);
  const panel = document.createElement("section");
  panel.className = `notification-settings-card ${view.className}`;
  panel.dataset.notificationSettings = "true";
  panel.setAttribute("aria-labelledby", "notification-settings-title");
  panel.innerHTML = `
    <div class="notification-settings-heading">
      <span class="notification-settings-icon" aria-hidden="true">
        ${iconSvg("bell")}
      </span>
      <span class="notification-settings-copy">
        <strong id="notification-settings-title">התראות חכמות</strong>
        <small>הזמנות, הוצאות והעברות שקשורות אליך בלבד.</small>
      </span>
      ${
        view.action
          ? `<button
              class="notification-master-control"
              type="button"
              role="switch"
              aria-checked="${enabled && permissionState === "granted"}"
              aria-label="${notificationBusy ? "מעדכן את ההתראות" : view.buttonLabel}"
              data-notification-action="${view.action}"
              ${notificationBusy || view.disabled ? "disabled" : ""}
            >
              <span class="notification-settings-status" aria-live="polite">
                ${notificationBusy ? "מעדכן..." : view.status}
              </span>
              <span class="notification-master-switch" aria-hidden="true"></span>
            </button>`
          : `<span class="notification-settings-status" role="status" aria-live="polite">
              ${view.status}
            </span>`
      }
    </div>
    ${
      notificationError
        ? `<p class="notification-settings-error">${notificationError}</p>`
        : ""
    }
    ${
      enabled && permissionState === "granted"
        ? `
          <fieldset class="notification-preferences" ${notificationBusy ? "disabled" : ""}>
            <legend>מה תרצה לקבל?</legend>
            ${notificationPreferenceRow({
              key: "eventUpdates",
              title: "עדכונים באירועים",
              description: "הצטרפות, הוצאה חדשה או שינוי באירוע שמשותף איתך.",
              checked: preferences.eventUpdates
            })}
            ${notificationPreferenceRow({
              key: "paymentReminders",
              title: "תזכורות לתשלום",
              description: "רק כשנשארה העברה שקשורה אליך.",
              checked: preferences.paymentReminders
            })}
          </fieldset>
        `
        : ""
    }
  `;

  const saveButton = host.querySelector(':scope > [data-action="save-profile"]');
  host.insertBefore(panel, saveButton ?? null);
}

function notificationPreferenceRow({ key, title, description, checked }) {
  return `
    <label class="notification-preference-row">
      <span class="notification-preference-copy">
        <strong>${title}</strong>
        <small>${description}</small>
      </span>
      <span class="notification-preference-control">
        <input
          type="checkbox"
          data-notification-preference="${key}"
          aria-label="${title}"
          ${checked ? "checked" : ""}
        />
        <span class="notification-preference-switch" aria-hidden="true"></span>
      </span>
    </label>
  `;
}

function notificationViewState(enabled) {
  if (permissionState === "denied") {
    return {
      className: "is-denied",
      status: "חסום במכשיר",
      action: "",
      buttonLabel: "",
      disabled: true
    };
  }

  if (enabled && permissionState === "granted") {
    return {
      className: "is-enabled",
      status: registeredForCurrentAccount ? "פעיל" : "פעיל במכשיר",
      action: "disable",
      buttonLabel: "כבה התראות",
      disabled: false
    };
  }

  return {
    className: "is-disabled",
    status: "לא פעיל",
    action: "enable",
    buttonLabel: "הפעל התראות",
    disabled: false
  };
}

function nativeNotificationApi() {
  const api = globalThis.SogrimNative?.notifications;
  return api?.available ? api : null;
}

function notificationPreferenceEnabled(userId) {
  try {
    return localStorage.getItem(pushPreferenceStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

function setNotificationPreference(userId, enabled) {
  try {
    localStorage.setItem(pushPreferenceStorageKey(userId), enabled ? "1" : "0");
  } catch {}
}

function injectNotificationStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .notification-settings-card {
      display: grid;
      gap: 12px;
      padding: 15px;
      border: 1px solid rgba(10, 86, 79, 0.12);
      border-radius: 16px;
      background: rgba(248, 251, 250, 0.92);
      box-shadow: 0 12px 28px -24px rgba(4, 63, 58, 0.42);
    }

    .notification-settings-card.is-enabled {
      border-color: rgba(22, 168, 153, 0.25);
      background: rgba(230, 247, 244, 0.72);
    }

    .notification-settings-heading {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
    }

    .notification-settings-icon {
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      color: #087b74;
      background: rgba(32, 169, 174, 0.11);
    }

    .notification-settings-icon svg {
      width: 21px;
      height: 21px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .notification-settings-copy {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .notification-settings-copy strong {
      color: #0d2523;
      font-size: 15px;
      font-weight: 800;
    }

    .notification-settings-copy small {
      color: #647875;
      font-size: 12px;
      line-height: 1.45;
    }

    .notification-settings-status {
      min-height: 26px;
      display: inline-flex;
      align-items: center;
      padding: 4px 9px;
      border-radius: 999px;
      color: #526561;
      background: rgba(12, 65, 61, 0.07);
      font-size: 11px;
      font-weight: 750;
      white-space: nowrap;
    }

    .notification-settings-card.is-enabled .notification-settings-status {
      color: #08675f;
      background: rgba(22, 168, 153, 0.13);
    }

    .notification-master-control {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      border: 0;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }

    .notification-master-control:disabled {
      cursor: wait;
      opacity: 0.68;
    }

    .notification-master-switch {
      position: relative;
      width: 44px;
      height: 26px;
      flex: 0 0 auto;
      border: 1px solid rgba(70, 99, 95, 0.24);
      border-radius: 999px;
      background: #dce5e3;
      transition:
        background-color 180ms ease,
        border-color 180ms ease,
        box-shadow 180ms ease;
    }

    .notification-master-switch::after {
      content: "";
      position: absolute;
      top: 3px;
      right: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 2px 6px rgba(13, 45, 42, 0.2);
      transition: transform 180ms ease;
    }

    .notification-master-control[aria-checked="true"] .notification-master-switch {
      border-color: rgba(8, 123, 116, 0.46);
      background: #087b74;
    }

    .notification-master-control[aria-checked="true"] .notification-master-switch::after {
      transform: translateX(-18px);
    }

    .notification-master-control:focus-visible .notification-master-switch {
      outline: 3px solid rgba(32, 169, 174, 0.24);
      outline-offset: 3px;
    }

    .notification-settings-error {
      margin: 0;
      color: #9b4d3d;
      font-size: 12px;
      line-height: 1.45;
    }

    .notification-preferences {
      min-width: 0;
      display: grid;
      gap: 2px;
      margin: 0;
      padding: 4px 0 0;
      border: 0;
      border-top: 1px solid rgba(10, 86, 79, 0.1);
    }

    .notification-preferences > legend {
      padding: 10px 0 4px;
      color: #526561;
      font-size: 12px;
      font-weight: 750;
    }

    .notification-preference-row {
      min-height: 56px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 8px 2px;
      cursor: pointer;
    }

    .notification-preference-row + .notification-preference-row {
      border-top: 1px solid rgba(10, 86, 79, 0.08);
    }

    .notification-preference-copy {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .notification-preference-copy strong {
      color: #15312e;
      font-size: 13px;
      font-weight: 800;
    }

    .notification-preference-copy small {
      color: #6b7d7a;
      font-size: 11px;
      line-height: 1.45;
    }

    .notification-preference-control {
      position: relative;
      width: 44px;
      height: 26px;
      flex: 0 0 auto;
    }

    .notification-preference-control input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    .notification-preference-switch {
      position: absolute;
      inset: 0;
      border: 1px solid rgba(70, 99, 95, 0.24);
      border-radius: 999px;
      background: #dce5e3;
      transition:
        background-color 180ms ease,
        border-color 180ms ease,
        box-shadow 180ms ease;
    }

    .notification-preference-switch::after {
      content: "";
      position: absolute;
      top: 3px;
      right: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 2px 6px rgba(13, 45, 42, 0.2);
      transition: transform 180ms ease;
    }

    .notification-preference-control input:checked + .notification-preference-switch {
      border-color: rgba(8, 123, 116, 0.46);
      background: #087b74;
    }

    .notification-preference-control input:checked + .notification-preference-switch::after {
      transform: translateX(-18px);
    }

    .notification-preference-control input:focus-visible + .notification-preference-switch {
      outline: 3px solid rgba(32, 169, 174, 0.24);
      outline-offset: 3px;
    }

    .notification-preferences:disabled {
      opacity: 0.66;
    }

    @media (max-width: 520px) {
      .notification-master-control .notification-settings-status {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }

    @media (max-width: 380px) {
      .notification-settings-heading {
        grid-template-columns: 36px minmax(0, 1fr);
      }

      .notification-settings-icon {
        width: 36px;
        height: 36px;
      }

      .notification-master-control,
      .notification-settings-heading > .notification-settings-status {
        grid-column: 2;
        justify-self: start;
      }
    }
  `;
  document.head.append(style);
}
