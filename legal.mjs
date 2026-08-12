const APP_URL = "./";
let backNavigationStarted = false;

function returnToPreviousPage() {
  if (backNavigationStarted) return;
  backNavigationStarted = true;

  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.assign(APP_URL);
}

const nativeApp = globalThis.Capacitor?.Plugins?.App;
if (
  globalThis.Capacitor?.getPlatform?.() === "android" &&
  typeof nativeApp?.addListener === "function"
) {
  void nativeApp.addListener("backButton", returnToPreviousPage);
}
