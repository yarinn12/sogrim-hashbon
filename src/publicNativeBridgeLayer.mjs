import {
  NATIVE_AUTH_PATH,
  NATIVE_PUBLIC_HOST,
  nativePublicOrigin,
  nativeDestination
} from "./domain/nativeDeepLinks.mjs";
import {
  buildNotificationDestination,
  notificationTargetFromPayload
} from "./domain/notificationTargets.mjs";
import { fetchWithTimeout } from "./data/fetchTimeout.mjs";

const NATIVE_AUTH_CALLBACK = new URL(
  NATIVE_AUTH_PATH,
  nativePublicOrigin()
).toString();
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
  const appLauncherPlugin = plugins.AppLauncher;
  const browserPlugin = plugins.Browser;
  const hapticsPlugin = plugins.Haptics;
  const sharePlugin = plugins.Share;
  const pushPlugin = plugins.PushNotifications;
  const cameraPlugin = plugins.Camera;
  const capabilitiesPlugin = plugins.SogrimCapabilities;
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
      },
      async openStore({ marketUrl = "", storeUrl = "" } = {}) {
        if (appLauncherPlugin?.openUrl && marketUrl) {
          try {
            const result = await appLauncherPlugin.openUrl({ url: marketUrl });
            if (result?.completed !== false) return true;
          } catch {}
        }
        if (!browserPlugin?.open || !storeUrl) return false;
        await browserPlugin.open({ url: storeUrl, presentationStyle: "popover" });
        return true;
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
    camera: createNativeCameraApi(cameraPlugin),
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

  registerNativeListener(() =>
    appPlugin?.addListener?.("appUrlOpen", ({ url }) => {
      openNativeUrl(url).catch(() => {});
    })
  );

  registerNativeListener(() =>
    appPlugin?.addListener?.("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      window.dispatchEvent(new CustomEvent(NATIVE_RESUME_EVENT));
    })
  );

  appPlugin?.getLaunchUrl?.()
    .then((launch) => openNativeUrl(launch?.url))
    .catch(() => {});

  registerNativeListener(() =>
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
    })
  );

  document.addEventListener("click", (event) => {
    const primaryAction = event.target.closest(
      ".primary-button, [data-action='show-expense-form'], [data-action='create-event']"
    );
    if (primaryAction) hapticsPlugin?.impact?.({ style: "LIGHT" }).catch?.(() => {});

  }, true);
}

function createNativeCameraApi(cameraPlugin) {
  if (!cameraPlugin?.takePhoto) {
    return {
      available: false,
      takePhoto: async () => null
    };
  }

  return {
    available: true,
    async takePhoto() {
      let media;
      try {
        media = await cameraPlugin.takePhoto({
          quality: 90,
          targetWidth: 1600,
          targetHeight: 1200,
          correctOrientation: true,
          encodingType: 0,
          saveToGallery: false,
          cameraDirection: "REAR",
          editable: "no",
          presentationStyle: "fullscreen",
          includeMetadata: true
        });
      } catch (error) {
        if (String(error?.code ?? "") === "OS-PLUG-CAMR-0006") return null;
        throw error;
      }

      const webPath = String(media?.webPath ?? "").trim();
      if (!webPath) throw new Error("Native camera returned no image path");
      const { response, blob } = await fetchWithTimeout(
        globalThis.fetch,
        webPath,
        {},
        10_000,
        async (imageResponse) => ({
          response: imageResponse,
          blob: imageResponse.ok
            ? await imageResponse.blob()
            : null
        })
      );
      if (!response.ok) throw new Error("Native camera image could not be read");
      const format = String(media?.metadata?.format ?? "jpeg")
        .toLowerCase()
        .replace("jpg", "jpeg");
      const mimeType = blob.type.startsWith("image/")
        ? blob.type
        : `image/${format}`;
      if (!mimeType.startsWith("image/")) {
        throw new Error("Native camera returned a non-image file");
      }
      const extension = format === "png" ? "png" : "jpg";
      return new File([blob], `expense-camera-${Date.now()}.${extension}`, {
        type: mimeType,
        lastModified: Date.now()
      });
    }
  };
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

  registerNativeListener(() =>
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
    })
  );

  registerNativeListener(() =>
    pushPlugin.addListener?.("registrationError", (error) => {
      document.dispatchEvent(
        new CustomEvent(PUSH_STATUS_EVENT, {
          detail: {
            status: "error",
            message: String(error?.error ?? "")
          }
        })
      );
    })
  );

  registerNativeListener(() =>
    pushPlugin.addListener?.("pushNotificationReceived", (notification) => {
      document.dispatchEvent(
        new CustomEvent(PUSH_STATUS_EVENT, {
          detail: {
            status: "received",
            notification
          }
        })
      );
    })
  );

  registerNativeListener(() =>
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
    })
  );
}

function registerNativeListener(factory) {
  try {
    Promise.resolve(factory?.()).catch(() => {});
  } catch {
    // An optional native capability must never block the rest of the app.
  }
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
