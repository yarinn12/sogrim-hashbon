import "./platformCompatibility.mjs";
import { hasUpdateSensitiveWork } from "./domain/updateSafety.mjs";

const PWA_RELEASE = "520";
const SERVICE_WORKER_URL = `/sw.js?pwa_release=${PWA_RELEASE}`;
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
    let updateAwaitingReload = false;
    const safeToReload = () => !hasUpdateSensitiveWork({
      document, storage: window.localStorage, checkOutbox: true
    });
    const reloadWhenSafe = () => {
      if (!updateAwaitingReload || reloadingForUpdate || !safeToReload()) return;
      reloadingForUpdate = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type !== "SOGRIM_UPDATE_NAVIGATION_CHECK") return;
      event.ports?.[0]?.postMessage({ safe: safeToReload() });
    });
    if (hadActiveController) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        updateAwaitingReload = true;
        reloadWhenSafe();
      });
      window.addEventListener("sogrim:sync-status", reloadWhenSafe);
      document.addEventListener("settle-friends:screen-rendered", reloadWhenSafe);
      window.addEventListener("focus", reloadWhenSafe);
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
      reloadWhenSafe();
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
