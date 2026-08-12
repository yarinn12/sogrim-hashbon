import { markStartupMilestone } from "./data/startupMetrics.mjs";

const splash = document.querySelector("#app-splash");
const app = document.querySelector("#app");
const video = splash?.querySelector(".app-splash-video");
const SKIP_NEXT_SPLASH_MARKER = "settle-friends-skip-next-splash";
const VIDEO_LOAD_TIMEOUT_MS = 6000;
const VIDEO_PROGRESS_TIMEOUT_MS = 4500;
const VIDEO_STALL_TIMEOUT_MS = 2400;
const VIDEO_WATCHDOG_INTERVAL_MS = 800;
const APP_READY_VIDEO_GRACE_MS = 200;
const MIN_VISIBLE_VIDEO_MS = 300;
const MAX_SPLASH_WAIT_MS = 5500;
const MAX_SPLASH_RENDER_RETRY_MS = 750;
const SPLASH_EXIT_MS = 100;

const showPosterOnly = consumeSplashBypass();

if (splash && app) {
  installSplash({ showPosterOnly });
}

function installSplash({ showPosterOnly = false } = {}) {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let fallbackMode = Boolean(showPosterOnly || reduceMotion || !video);
  let dismissed = false;
  let loadTimeoutId = 0;
  let progressTimeoutId = 0;
  let appReadyGraceId = 0;
  let minimumVisibleId = 0;
  let maximumWaitId = 0;
  let watchdogIntervalId = 0;
  let videoReady = false;
  let videoStartedAt = 0;
  let lastProgressAt = 0;
  let lastVideoTime = 0;
  let frameRevealPending = false;
  let playbackPending = false;

  setNativeSystemBarStyle(true);
  document.documentElement.classList.add("app-splash-active");

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
  maximumWaitId = window.setTimeout(
    dismissAfterMaximumWait,
    MAX_SPLASH_WAIT_MS
  );

  if (fallbackMode) {
    splash.classList.add("is-fallback");
    video?.pause();
  } else {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = false;
    video.loop = true;
    video.addEventListener("loadeddata", handleVideoReady, { once: true });
    video.addEventListener("playing", handleVideoPlaying);
    video.addEventListener("timeupdate", handleVideoProgress);
    video.addEventListener("error", useFallback, { once: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    loadTimeoutId = window.setTimeout(useFallback, VIDEO_LOAD_TIMEOUT_MS);
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
    window.clearTimeout(appReadyGraceId);
    appReadyGraceId = 0;
    lastProgressAt = Date.now();
    if (!videoStartedAt) videoStartedAt = Date.now();
    splash.classList.add("is-video-ready");
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
    window.clearTimeout(appReadyGraceId);
    window.clearTimeout(minimumVisibleId);
    window.clearInterval(watchdogIntervalId);
    appReadyGraceId = 0;
    minimumVisibleId = 0;
    watchdogIntervalId = 0;
    splash.classList.add("is-fallback");
    video?.pause();
    dismissWhenReady();
  }

  function dismissAfterMaximumWait() {
    maximumWaitId = 0;
    if (dismissed) return;
    if (app.classList.contains("app-boot")) {
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

    if (fallbackMode) {
      dismiss();
      return;
    }

    if (!videoStartedAt) {
      if (!appReadyGraceId) {
        appReadyGraceId = window.setTimeout(useFallback, APP_READY_VIDEO_GRACE_MS);
      }
      return;
    }

    const remainingVisibleMs =
      MIN_VISIBLE_VIDEO_MS - (Date.now() - videoStartedAt);
    if (remainingVisibleMs > 0) {
      if (!minimumVisibleId) {
        minimumVisibleId = window.setTimeout(() => {
          minimumVisibleId = 0;
          dismissWhenReady();
        }, remainingVisibleMs);
      }
      return;
    }

    dismiss();
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    markStartupMilestone("splash-dismissed");
    window.clearTimeout(loadTimeoutId);
    window.clearTimeout(progressTimeoutId);
    window.clearTimeout(appReadyGraceId);
    window.clearTimeout(minimumVisibleId);
    window.clearTimeout(maximumWaitId);
    window.clearInterval(watchdogIntervalId);
    appObserver.disconnect();
    document.removeEventListener("account-auth-ready", dismissWhenReady);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    video?.removeEventListener("playing", handleVideoPlaying);
    video?.removeEventListener("timeupdate", handleVideoProgress);
    video?.pause();
    splash.setAttribute("inert", "");
    splash.classList.add("is-leaving");
    document.documentElement.classList.remove("app-splash-active");
    // The app canvas is light, so Android needs dark status-bar icons after splash too.
    setNativeSystemBarStyle(true);
    window.setTimeout(() => splash.remove(), SPLASH_EXIT_MS);
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
  return !accountAuthPending && (accountGateRendered || appRendered);
}
