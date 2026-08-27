const PWA_RELEASE = "386";
const SERVICE_WORKER_URL = `/sw.js?pwa_release=${PWA_RELEASE}`;
const UPDATE_RELOAD_STORAGE_KEY = "settle-friends-pwa-update-reload";
const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");

markStandaloneAppMode();
watchStandaloneAppMode();
startPwaLifecycle();

function markStandaloneAppMode() {
  const standalone = Boolean(standaloneQuery?.matches || navigator.standalone === true);
  document.documentElement.classList.toggle("pwa-standalone", standalone);
  document.documentElement.dataset.appDisplayMode = standalone ? "standalone" : "browser";
}

function watchStandaloneAppMode() {
  if (standaloneQuery?.addEventListener) {
    standaloneQuery.addEventListener("change", markStandaloneAppMode);
    return;
  }
  standaloneQuery?.addListener?.(markStandaloneAppMode);
}

async function startPwaLifecycle() {
  if (!("serviceWorker" in navigator)) return;

  if (isNativeRuntime()) {
    await removeBrowserCachesFromNativeRuntime();
    return;
  }

  try {
    const hadActiveController = Boolean(navigator.serviceWorker.controller);
    let reloadingForUpdate = false;
    if (hadActiveController) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadingForUpdate) return;
        if (window.sessionStorage.getItem(UPDATE_RELOAD_STORAGE_KEY) === PWA_RELEASE) {
          return;
        }
        reloadingForUpdate = true;
        window.sessionStorage.setItem(UPDATE_RELOAD_STORAGE_KEY, PWA_RELEASE);
        window.location.reload();
      });
    }

    const registration = await navigator.serviceWorker.register(
      SERVICE_WORKER_URL,
      {
        scope: "/",
        updateViaCache: "none"
      }
    );
    const activateWaitingWorker = () => {
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    };
    registration.addEventListener("updatefound", () => {
      const installingWorker = registration.installing;
      installingWorker?.addEventListener("statechange", () => {
        if (installingWorker.state === "installed") activateWaitingWorker();
      });
    });
    const checkForUpdate = () => registration
      .update()
      .then(activateWaitingWorker)
      .catch(() => {});

    activateWaitingWorker();
    checkForUpdate();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      checkForUpdate();
    });
    window.addEventListener("pageshow", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
  } catch {}
}

function isNativeRuntime() {
  return (
    ["capacitor:", "ionic:"].includes(window.location.protocol) ||
    (window.location.protocol === "https:" && window.location.hostname === "localhost")
  );
}

async function removeBrowserCachesFromNativeRuntime() {
  await Promise.allSettled([
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((item) => item.unregister()))),
    globalThis.caches?.keys?.()
      .then((keys) => Promise.all(keys.map((key) => globalThis.caches.delete(key))))
  ]);
}
