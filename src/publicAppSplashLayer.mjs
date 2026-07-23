const splash = document.querySelector("#app-splash");
const app = document.querySelector("#app");
const video = splash?.querySelector(".app-splash-video");
const MIN_VIDEO_PREVIEW_MS = 1200;
const MAX_VIDEO_PREVIEW_MS = 3200;
const VIDEO_LOAD_TIMEOUT_MS = 2500;
const FALLBACK_MIN_MS = 650;

if (splash && app) {
  installSplash();
}

function installSplash() {
  const startedAt = Date.now();
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let mediaFinished = Boolean(reduceMotion || !video);
  let fallbackMode = Boolean(reduceMotion || !video);
  let dismissed = false;
  let mediaTimerId = 0;
  let loadTimeoutId = 0;

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

  if (fallbackMode) {
    splash.classList.add("is-fallback");
    video?.pause();
  } else {
    video.addEventListener(
      "loadeddata",
      () => splash.classList.add("is-video-ready"),
      { once: true }
    );
    video.addEventListener("playing", startFirstLoopTimer, { once: true });
    video.addEventListener("error", useFallback, { once: true });
    loadTimeoutId = window.setTimeout(useFallback, VIDEO_LOAD_TIMEOUT_MS);
    video.play()?.catch(useFallback);
  }

  dismissWhenReady();

  function startFirstLoopTimer() {
    window.clearTimeout(loadTimeoutId);
    const sourceDurationMs =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.ceil(video.duration * 1000)
        : MAX_VIDEO_PREVIEW_MS;
    const durationMs = Math.min(
      MAX_VIDEO_PREVIEW_MS,
      Math.max(MIN_VIDEO_PREVIEW_MS, sourceDurationMs)
    );
    mediaTimerId = window.setTimeout(() => {
      mediaFinished = true;
      dismissWhenReady();
    }, durationMs);
  }

  function useFallback() {
    if (fallbackMode || dismissed) return;
    fallbackMode = true;
    mediaFinished = true;
    window.clearTimeout(loadTimeoutId);
    window.clearTimeout(mediaTimerId);
    splash.classList.add("is-fallback");
    video?.pause();
    dismissWhenReady();
  }

  function dismissWhenReady() {
    if (dismissed || !applicationIsReady() || !mediaFinished) return;

    const minimumDuration = fallbackMode ? FALLBACK_MIN_MS : 0;
    const remaining = Math.max(0, minimumDuration - (Date.now() - startedAt));
    window.setTimeout(dismiss, remaining);
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    window.clearTimeout(loadTimeoutId);
    window.clearTimeout(mediaTimerId);
    appObserver.disconnect();
    video?.pause();
    splash.classList.add("is-leaving");
    document.documentElement.classList.remove("app-splash-active");
    window.setTimeout(() => splash.remove(), 360);
  }
}

function applicationIsReady() {
  const appRendered = !app.classList.contains("app-boot");
  const accountStillLoading = Boolean(
    document.querySelector(".account-auth-gate.account-auth-boot")
  );
  return appRendered && !accountStillLoading;
}
