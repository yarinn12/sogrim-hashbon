import { markStartupMilestone } from "./data/startupMetrics.mjs";
import { loadAccessibilityPreferences } from "./data/accessibilityPreferences.mjs";

const splash = document.querySelector("#app-splash");
const app = document.querySelector("#app");
const hold = splash?.querySelector(".app-splash-hold");
const SKIP_NEXT_SPLASH_MARKER = "settle-friends-skip-next-splash";
const VIDEO_LOAD_TIMEOUT_MS = 6000;
const VIDEO_PROGRESS_TIMEOUT_MS = 4500;
const VIDEO_STALL_TIMEOUT_MS = 2400;
const VIDEO_WATCHDOG_INTERVAL_MS = 800;
// Hand the native splash over quickly, then give the branded loop a short,
// stable presentation without holding an already interactive app for seconds.
const VIDEO_PRESENTATION_GRACE_MS = 650;
const MIN_VIDEO_PRESENTATION_MS = 800;
const MAX_SPLASH_WAIT_MS = 5500;
const MAX_SPLASH_RENDER_RETRY_MS = 750;
const SPLASH_EXIT_MS = 100;
const UPDATE_CHECK_EVENT = "sogrim:mandatory-update-check";
const NATIVE_STYLES_READY_EVENT = "sogrim:native-styles-ready";

const showPosterOnly = consumeSplashBypass();

if (splash && app) {
  installSplash({ showPosterOnly });
}

function installSplash({ showPosterOnly = false } = {}) {
  const splashStartedAt = performance.now();
  const staticIOSLaunch =
    window.location.protocol === "capacitor:" ||
    globalThis.Capacitor?.getPlatform?.() === "ios";
  const reduceMotion =
    loadAccessibilityPreferences().reduceMotion ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  // Keep media out of the live document until the platform can opt into playback.
  // The iOS app stays on the branded still and never creates a live video layer.
  const videoTemplate = splash.querySelector(".app-splash-video-template");
  const video = showPosterOnly || staticIOSLaunch || reduceMotion
    ? null
    : videoTemplate?.content.querySelector("video")?.cloneNode(true);
  let fallbackMode = !video;
  let dismissed = false;
  let loadTimeoutId = 0;
  let progressTimeoutId = 0;
  let maximumWaitId = 0;
  let presentationWaitId = 0;
  let watchdogIntervalId = 0;
  let videoReady = false;
  let lastProgressAt = 0;
  let lastVideoTime = 0;
  let frameRevealPending = false;
  let playbackPending = false;
  let videoPresentedAt = 0;

  setNativeSystemBarStyle(true);
  document.documentElement.classList.add("app-splash-active");
  // The web splash is already rendered by index.html. Releasing the Android
  // system splash here avoids waiting for video decoding before the WebView can
  // become visible; the branded web splash remains in place until the app is
  // actually ready.
  notifyNativeWebSplashReady();

  const appObserver = new MutationObserver(() => {
    dismissWhenReady();
  });
  appObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true
  });
  document.addEventListener("account-auth-ready", dismissWhenReady);
  document.addEventListener("settle-friends:screen-rendered", dismissWhenReady);
  document.addEventListener(UPDATE_CHECK_EVENT, dismissWhenReady);
  document.addEventListener(NATIVE_STYLES_READY_EVENT, dismissWhenReady);
  maximumWaitId = window.setTimeout(
    dismissAfterMaximumWait,
    MAX_SPLASH_WAIT_MS
  );

  if (fallbackMode) {
    videoTemplate?.remove();
    splash.classList.add("is-fallback");
  } else {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.loop = true;
    video.addEventListener("loadeddata", handleVideoReady, { once: true });
    video.addEventListener("playing", handleVideoPlaying);
    video.addEventListener("timeupdate", handleVideoProgress);
    video.addEventListener("error", useFallback, { once: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    loadTimeoutId = window.setTimeout(useFallback, VIDEO_LOAD_TIMEOUT_MS);
    videoTemplate.replaceWith(video);
    // Reveal the video only after it has a frame to present.
    requestPlayback({ fallbackOnFailure: false });
    if (video.readyState >= 2) {
      handleVideoReady();
    }
  }

  dismissWhenReady();

  function handleVideoReady() {
    if (dismissed || videoReady) return;
    videoReady = true;
    window.clearTimeout(loadTimeoutId);
    progressTimeoutId = window.setTimeout(useFallback, VIDEO_PROGRESS_TIMEOUT_MS);
    requestPlayback({ fallbackOnFailure: true });
    dismissWhenReady();
  }

  function handleVideoPlaying() {
    if (dismissed || fallbackMode) return;
    lastProgressAt = Date.now();
    revealPresentedFrame();
  }

  function handleVideoProgress() {
    if (dismissed) return;
    const currentTime = Number(video.currentTime) || 0;
    if (
      currentTime > lastVideoTime + 0.01 ||
      currentTime < lastVideoTime - 0.25
    ) {
      lastProgressAt = Date.now();
      lastVideoTime = currentTime;
    }
    if (currentTime > 0) revealVideo();
    dismissWhenReady();
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== "visible" || dismissed || fallbackMode) return;
    if (applicationIsReady()) {
      dismissWhenReady();
      return;
    }
    if (video.paused) requestPlayback({ fallbackOnFailure: true });
  }

  function revealPresentedFrame() {
    if (frameRevealPending || dismissed || fallbackMode) return;
    if (typeof video.requestVideoFrameCallback === "function") {
      frameRevealPending = true;
      video.requestVideoFrameCallback(() => {
        frameRevealPending = false;
        revealVideo();
      });
      return;
    }
    window.requestAnimationFrame(revealVideo);
  }

  function revealVideo() {
    if (dismissed || fallbackMode) return;
    window.clearTimeout(progressTimeoutId);
    lastProgressAt = Date.now();
    if (!videoPresentedAt) videoPresentedAt = performance.now();
    video.style.opacity = "1";
    if (hold) hold.style.opacity = "0";
    splash.classList.add("is-video-ready");
    notifyNativeWebSplashReady();
    startPlaybackWatchdog();
    dismissWhenReady();
  }

  function startPlaybackWatchdog() {
    if (watchdogIntervalId) return;
    watchdogIntervalId = window.setInterval(() => {
      if (
        dismissed ||
        fallbackMode ||
        document.visibilityState !== "visible" ||
        applicationIsReady()
      ) {
        dismissWhenReady();
        return;
      }
      if (lastProgressAt && Date.now() - lastProgressAt > VIDEO_STALL_TIMEOUT_MS) {
        useFallback();
      }
    }, VIDEO_WATCHDOG_INTERVAL_MS);
  }

  function requestPlayback({ fallbackOnFailure = false } = {}) {
    if (dismissed || fallbackMode || playbackPending) return;
    let playRequest;
    try {
      playRequest = video.play();
    } catch {
      if (fallbackOnFailure) useFallback();
      return;
    }
    if (!playRequest?.catch) return;
    playbackPending = true;
    playRequest.catch(() => {
      if (fallbackOnFailure) {
        useFallback();
      }
    }).finally(() => {
      playbackPending = false;
    });
  }

  function useFallback() {
    if (fallbackMode || dismissed) return;
    fallbackMode = true;
    window.clearTimeout(loadTimeoutId);
    window.clearTimeout(progressTimeoutId);
    window.clearInterval(watchdogIntervalId);
    watchdogIntervalId = 0;
    video.style.opacity = "0";
    if (hold) hold.style.opacity = "1";
    splash.classList.add("is-fallback");
    video?.pause();
    notifyNativeWebSplashReady();
    dismissWhenReady();
  }

  function dismissAfterMaximumWait() {
    maximumWaitId = 0;
    if (dismissed) return;
    if (
      app.classList.contains("app-boot") ||
      document.documentElement.classList.contains("mandatory-update-checking")
    ) {
      maximumWaitId = window.setTimeout(
        dismissAfterMaximumWait,
        MAX_SPLASH_RENDER_RETRY_MS
      );
      return;
    }
    dismiss();
  }

  function dismissWhenReady() {
    if (dismissed || !applicationIsReady()) return;

    if (!fallbackMode && !showPosterOnly) {
      const now = performance.now();
      const waitForVideo = videoPresentedAt
        ? MIN_VIDEO_PRESENTATION_MS - (now - videoPresentedAt)
        : VIDEO_PRESENTATION_GRACE_MS - (now - splashStartedAt);
      if (waitForVideo > 0) {
        window.clearTimeout(presentationWaitId);
        presentationWaitId = window.setTimeout(dismissWhenReady, waitForVideo);
        return;
      }
    }

    dismiss();
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    markStartupMilestone("splash-dismissed");
    window.clearTimeout(loadTimeoutId);
    window.clearTimeout(progressTimeoutId);
    window.clearTimeout(maximumWaitId);
    window.clearTimeout(presentationWaitId);
    window.clearInterval(watchdogIntervalId);
    appObserver.disconnect();
    document.removeEventListener("account-auth-ready", dismissWhenReady);
    document.removeEventListener("settle-friends:screen-rendered", dismissWhenReady);
    document.removeEventListener(UPDATE_CHECK_EVENT, dismissWhenReady);
    document.removeEventListener(NATIVE_STYLES_READY_EVENT, dismissWhenReady);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    video?.removeEventListener("playing", handleVideoPlaying);
    video?.removeEventListener("timeupdate", handleVideoProgress);
    video?.pause();
    document.documentElement.classList.remove("app-splash-active");
    // The app canvas is light, so Android needs dark status-bar icons after splash too.
    setNativeSystemBarStyle(true);
    if (staticIOSLaunch) {
      splash.remove();
    } else {
      splash.setAttribute("inert", "");
      splash.classList.add("is-leaving");
      window.setTimeout(() => splash.remove(), SPLASH_EXIT_MS);
    }
  }

}

function setNativeSystemBarStyle(light) {
  const capacitor = globalThis.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return;
  capacitor.Plugins?.SogrimCapabilities?.setSystemBarStyle?.({ light }).catch(() => {});
}

function consumeSplashBypass() {
  try {
    const shouldSkip =
      window.sessionStorage.getItem(SKIP_NEXT_SPLASH_MARKER) === "1";
    if (shouldSkip) {
      window.sessionStorage.removeItem(SKIP_NEXT_SPLASH_MARKER);
    }
    return shouldSkip;
  } catch {
    return false;
  }
}

function applicationIsReady() {
  const appRendered = !app.classList.contains("app-boot");
  const accountAuthPending = document.documentElement.classList.contains(
    "account-auth-pending"
  );
  const accountGateRendered = Boolean(
    document.querySelector("#public-account-auth-gate")
  );
  const updateCheckPending = document.documentElement.classList.contains(
    "mandatory-update-checking"
  );
  const nativeStylesPending = document.documentElement.classList.contains(
    "native-styles-pending"
  );
  return !updateCheckPending && !nativeStylesPending && !accountAuthPending && (accountGateRendered || appRendered);
}

function notifyNativeWebSplashReady() {
  const capacitor = globalThis.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return;
  capacitor.Plugins?.SogrimCapabilities?.notifyWebSplashReady?.().catch(() => {});
}
