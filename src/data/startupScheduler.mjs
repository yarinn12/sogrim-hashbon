const AUTH_READY_EVENT = "account-auth-ready";
const FIRST_SCREEN_EVENT = "settle-friends:screen-rendered";

export function runAfterFirstInteractiveScreen(
  callback,
  {
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    idleTimeoutMs = 1_200
  } = {}
) {
  if (typeof callback !== "function" || !documentRef || !windowRef) {
    return () => {};
  }

  let cancelled = false;
  let idleHandle = null;
  let timeoutHandle = null;

  const cleanupListeners = () => {
    documentRef.removeEventListener?.(AUTH_READY_EVENT, scheduleWhenReady);
    documentRef.removeEventListener?.(FIRST_SCREEN_EVENT, scheduleWhenReady);
  };

  const appIsReady = () =>
    !documentRef.documentElement?.classList?.contains("account-auth-pending") &&
    Boolean(documentRef.querySelector?.("#app:not(.app-boot) .screen"));

  const run = () => {
    if (cancelled) return;
    cancelled = true;
    cleanupListeners();
    callback();
  };

  function scheduleWhenReady() {
    if (cancelled || idleHandle !== null || timeoutHandle !== null || !appIsReady()) {
      return;
    }

    cleanupListeners();
    if (typeof windowRef.requestIdleCallback === "function") {
      idleHandle = windowRef.requestIdleCallback(
        () => {
          idleHandle = null;
          run();
        },
        { timeout: idleTimeoutMs }
      );
      return;
    }

    timeoutHandle = windowRef.setTimeout(() => {
      timeoutHandle = null;
      run();
    }, 0);
  }

  documentRef.addEventListener?.(AUTH_READY_EVENT, scheduleWhenReady);
  documentRef.addEventListener?.(FIRST_SCREEN_EVENT, scheduleWhenReady);
  scheduleWhenReady();

  return () => {
    if (cancelled) return;
    cancelled = true;
    cleanupListeners();
    if (idleHandle !== null) windowRef.cancelIdleCallback?.(idleHandle);
    if (timeoutHandle !== null) windowRef.clearTimeout?.(timeoutHandle);
  };
}
