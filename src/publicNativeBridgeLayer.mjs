const NATIVE_AUTH_CALLBACK = "com.sogrimhashbon.app://auth/callback";

setupNativeBridge();

function setupNativeBridge() {
  if (!isNativeRuntime()) return;
  document.documentElement.classList.add("native-app");

  const plugins = globalThis.Capacitor?.Plugins ?? {};
  const appPlugin = plugins.App;
  const browserPlugin = plugins.Browser;
  const hapticsPlugin = plugins.Haptics;
  const sharePlugin = plugins.Share;

  globalThis.SogrimNative = {
    authCallbackUrl: NATIVE_AUTH_CALLBACK,
    async openAuth(url) {
      if (!browserPlugin?.open) return false;
      await browserPlugin.open({ url, presentationStyle: "popover" });
      return true;
    }
  };

  appPlugin?.addListener?.("appUrlOpen", async ({ url }) => {
    const destination = nativeDestination(url);
    if (!destination) return;
    try {
      await browserPlugin?.close?.();
    } catch {}
    window.location.replace(destination);
  });

  appPlugin?.addListener?.("backButton", () => {
    const dialogBack = document.querySelector(
      '[role="dialog"][aria-modal="true"] .modal-back-button:not(:disabled), ' +
        '.important-action-dialog [data-action="cancel-important-action"]'
    );
    if (dialogBack) {
      dialogBack.click();
      return;
    }

    const appBack = document.querySelector('[data-action="go-back"]:not(:disabled)');
    if (appBack) {
      appBack.click();
      return;
    }

    appPlugin.minimizeApp?.();
  });

  document.addEventListener("click", (event) => {
    const primaryAction = event.target.closest(
      ".primary-button, [data-action='show-expense-form'], [data-action='create-event']"
    );
    if (primaryAction) hapticsPlugin?.impact?.({ style: "LIGHT" }).catch?.(() => {});

    const shareAction = event.target.closest(
      "[data-action='share-invite-whatsapp'], [data-action='share-whatsapp']"
    );
    if (!shareAction || !sharePlugin?.share) return;
    const inviteUrl = shareAction.closest(".event-modal, .invite-link-row")
      ?.querySelector("input")?.value?.trim();
    if (!inviteUrl) return;
    const eventName = document.querySelector(".screen .brand h1")?.textContent?.trim();
    event.preventDefault();
    event.stopImmediatePropagation();
    sharePlugin.share({
      title: "הצטרפות לאירוע בסוגרים חשבון",
      text: eventName
        ? `מצטרפים לאירוע "${eventName}" וסוגרים יחד את החשבון.`
        : "מצטרפים לאירוע וסוגרים יחד את החשבון.",
      url: inviteUrl,
      dialogTitle: "שיתוף הזמנה"
    }).catch?.(() => {});
  }, true);
}

function nativeDestination(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "com.sogrimhashbon.app:") {
      return `./${url.search}${url.hash}`;
    }
    if (url.hostname === "sogrim-hashbon.vercel.app") {
      return `./${url.search}${url.hash}`;
    }
  } catch {}
  return "";
}

function isNativeRuntime() {
  return Boolean(
    globalThis.Capacitor?.isNativePlatform?.() ||
    ["capacitor:", "ionic:"].includes(window.location.protocol) ||
    (window.location.hostname === "localhost" && window.location.protocol === "https:")
  );
}
