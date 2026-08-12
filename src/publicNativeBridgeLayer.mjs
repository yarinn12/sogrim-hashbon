import {
  NATIVE_AUTH_PATH,
  NATIVE_PUBLIC_HOST,
  nativeDestination
} from "./domain/nativeDeepLinks.mjs";
import {
  buildNotificationDestination,
  notificationTargetFromPayload
} from "./domain/notificationTargets.mjs";

const NATIVE_AUTH_CALLBACK = `https://${NATIVE_PUBLIC_HOST}${NATIVE_AUTH_PATH}`;
const NATIVE_BACK_EVENT = "settle-friends:native-back";
const NATIVE_DESTINATION_EVENT = "settle-friends:native-destination";
const PUSH_TOKEN_EVENT = "settle-friends:push-token";
const PUSH_STATUS_EVENT = "settle-friends:push-status";
const NATIVE_CAPABILITIES_EVENT = "settle-friends:native-capabilities";
const NATIVE_RESUME_EVENT = "settle-friends:native-resume";

setupNativeBridge();

function setupNativeBridge() {
  if (!isNativeRuntime()) return;
  document.documentElement.classList.add("native-app");

  const plugins = globalThis.Capacitor?.Plugins ?? {};
  const appPlugin = plugins.App;
  const browserPlugin = plugins.Browser;
  const hapticsPlugin = plugins.Haptics;
  const sharePlugin = plugins.Share;
  const pushPlugin = plugins.PushNotifications;
  const capabilitiesPlugin = plugins.SogrimCapabilities;
  const contactPickerPlugin = plugins.SogrimContactPicker;
  const nativePlatform = globalThis.Capacitor?.getPlatform?.() ?? "";
  let lastOpenedUrl = "";
  let lastOpenedAt = 0;

  globalThis.SogrimNative = {
    authCallbackUrl: NATIVE_AUTH_CALLBACK,
    app: {
      platform: nativePlatform,
      async getInfo() {
        const info = await appPlugin?.getInfo?.();
        return {
          version: String(info?.version ?? ""),
          build: String(info?.build ?? ""),
          platform: nativePlatform
        };
      }
    },
    async openAuth(url) {
      if (!browserPlugin?.open) return false;
      await browserPlugin.open({ url, presentationStyle: "popover" });
      return true;
    },
    async share(options) {
      if (!sharePlugin?.share) return false;
      await sharePlugin.share(options);
      return true;
    },
    contacts: {
      available: Boolean(contactPickerPlugin?.pickContact),
      async pick() {
        if (!contactPickerPlugin?.pickContact) return null;
        const result = await contactPickerPlugin.pickContact();
        if (result?.cancelled) return null;
        return {
          displayName: String(result?.displayName ?? "").trim()
        };
      }
    },
    notifications:
      nativePlatform === "android"
        ? createNativeNotificationApi(null)
        : createNativeNotificationApi(pushPlugin)
  };

  const openNativeUrl = async (url) => {
    const destination = nativeDestination(url);
    const now = Date.now();
    if (
      !destination ||
      (url === lastOpenedUrl && now - lastOpenedAt < 1500)
    ) {
      return false;
    }
    lastOpenedUrl = url;
    lastOpenedAt = now;
    try {
      await browserPlugin?.close?.();
    } catch {}
    if (isNativeAuthCallback(url)) {
      history.replaceState(history.state, "", destination);
      window.location.reload();
      return true;
    }
    const navigationRequest = new CustomEvent(NATIVE_DESTINATION_EVENT, {
      cancelable: true,
      detail: { destination }
    });
    if (!window.dispatchEvent(navigationRequest)) return true;
    window.location.replace(destination);
    return true;
  };

  if (nativePlatform === "android") {
    resolveAndroidPushAvailability(capabilitiesPlugin).then((available) => {
      globalThis.SogrimNative.notifications = createNativeNotificationApi(
        available ? pushPlugin : null
      );
      if (available) setupPushNotificationListeners(pushPlugin, openNativeUrl);
      document.dispatchEvent(
        new CustomEvent(NATIVE_CAPABILITIES_EVENT, {
          detail: { pushNotifications: available }
        })
      );
    });
  } else {
    setupPushNotificationListeners(pushPlugin, openNativeUrl);
  }

  appPlugin?.addListener?.("appUrlOpen", ({ url }) => {
    openNativeUrl(url).catch(() => {});
  });

  appPlugin?.addListener?.("appStateChange", ({ isActive }) => {
    if (!isActive) return;
    window.dispatchEvent(new CustomEvent(NATIVE_RESUME_EVENT));
  });

  appPlugin?.getLaunchUrl?.()
    .then((launch) => openNativeUrl(launch?.url))
    .catch(() => {});

  appPlugin?.addListener?.("backButton", () => {
    const choicePickerBack = document.querySelector(
      ".app-choice-picker .app-choice-picker-close"
    );
    if (choicePickerBack) {
      choicePickerBack.click();
      return;
    }

    const backRequest = new CustomEvent(NATIVE_BACK_EVENT, {
      cancelable: true
    });
    if (!window.dispatchEvent(backRequest)) {
      return;
    }

    appPlugin.minimizeApp?.();
  });

  document.addEventListener("click", (event) => {
    const primaryAction = event.target.closest(
      ".primary-button, [data-action='show-expense-form'], [data-action='create-event']"
    );
    if (primaryAction) hapticsPlugin?.impact?.({ style: "LIGHT" }).catch?.(() => {});

  }, true);
}

async function resolveAndroidPushAvailability(capabilitiesPlugin) {
  if (!capabilitiesPlugin?.getCapabilities) return false;
  try {
    const capabilities = await capabilitiesPlugin.getCapabilities();
    return capabilities?.pushNotifications === true;
  } catch {
    return false;
  }
}

function createNativeNotificationApi(pushPlugin) {
  if (!pushPlugin) {
    return {
      available: false,
      checkPermission: async () => ({ supported: false, receive: "unavailable" }),
      enable: async () => ({ supported: false, receive: "unavailable" }),
      registerIfGranted: async () => ({ supported: false, receive: "unavailable" }),
      disable: async () => false
    };
  }

  const checkPermission = async () => {
    const permission = await pushPlugin.checkPermissions();
    return {
      supported: true,
      receive: permission?.receive ?? "prompt"
    };
  };

  const prepareRegistration = async () => {
    if (globalThis.Capacitor?.getPlatform?.() === "android") {
      await pushPlugin.createChannel?.({
        id: "event-updates",
        name: "עדכונים על אירועים",
        description: "הוצאות, העברות והזמנות שקשורות לאירועים שלך",
        importance: 4,
        visibility: 0,
        vibration: true
      });
    }
    await pushPlugin.register();
  };

  return {
    available: true,
    checkPermission,
    async enable() {
      let permission = await checkPermission();
      if (["prompt", "prompt-with-rationale"].includes(permission.receive)) {
        const requested = await pushPlugin.requestPermissions();
        permission = {
          supported: true,
          receive: requested?.receive ?? "denied"
        };
      }
      if (permission.receive === "granted") {
        await prepareRegistration();
      }
      return permission;
    },
    async registerIfGranted() {
      const permission = await checkPermission();
      if (permission.receive === "granted") {
        await prepareRegistration();
      }
      return permission;
    },
    async disable() {
      await pushPlugin.unregister();
      return true;
    }
  };
}

function setupPushNotificationListeners(pushPlugin, openNativeUrl) {
  if (!pushPlugin) return;

  pushPlugin.addListener?.("registration", (token) => {
    const value = String(token?.value ?? "").trim();
    if (!value) return;
    document.dispatchEvent(
      new CustomEvent(PUSH_TOKEN_EVENT, {
        detail: {
          token: value,
          platform: globalThis.Capacitor?.getPlatform?.() ?? ""
        }
      })
    );
  });

  pushPlugin.addListener?.("registrationError", (error) => {
    document.dispatchEvent(
      new CustomEvent(PUSH_STATUS_EVENT, {
        detail: {
          status: "error",
          message: String(error?.error ?? "")
        }
      })
    );
  });

  pushPlugin.addListener?.("pushNotificationReceived", (notification) => {
    document.dispatchEvent(
      new CustomEvent(PUSH_STATUS_EVENT, {
        detail: {
          status: "received",
          notification
        }
      })
    );
  });

  pushPlugin.addListener?.("pushNotificationActionPerformed", (action) => {
    const actionUrl = String(
      action?.notification?.data?.actionUrl ??
      action?.notification?.data?.action_url ??
      ""
    ).trim();
    if (actionUrl && nativeDestination(actionUrl)) {
      openNativeUrl(actionUrl).catch(() => {});
      return;
    }
    const target = notificationTargetFromPayload(action?.notification);
    const url = buildNotificationDestination(
      `https://${NATIVE_PUBLIC_HOST}/`,
      target
    );
    if (!url) return;
    openNativeUrl(url).catch(() => {});
  });
}

function isNativeRuntime() {
  return Boolean(
    globalThis.Capacitor?.isNativePlatform?.() ||
    ["capacitor:", "ionic:"].includes(window.location.protocol) ||
    (window.location.hostname === "localhost" && window.location.protocol === "https:")
  );
}

function isNativeAuthCallback(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === NATIVE_PUBLIC_HOST &&
      url.pathname === NATIVE_AUTH_PATH
    );
  } catch {
    return false;
  }
}
