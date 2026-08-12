import { loadRuntimeConfig } from "./data/localStore.mjs";
import { runAfterFirstInteractiveScreen } from "./data/startupScheduler.mjs";
import {
  canDisplayAds,
  emptyReferralProgramStatus
} from "./domain/entitlements.mjs";

const STYLE_ID = "public-ad-layer-style";
const ENTITLEMENT_EVENT = "settle-friends:entitlements-changed";
const BANNER_RETRY_DELAY_MS = 30_000;
const DEFAULT_BANNER_HEIGHT = 50;
const GOOGLE_ANDROID_FIXED_TEST_BANNER_ID =
  "ca-app-pub-3940256099942544/6300978111";

let runtimeConfig = null;
let entitlementStatus =
  globalThis.SogrimMonetization?.status ?? emptyReferralProgramStatus();
let admobInitialized = false;
let consentState = "unknown";
let consentCanRequestAds = false;
let privacyOptionsRequired = false;
let consentRequest = null;
let bannerRequested = false;
let bannerVisible = false;
let bannerListenersReady = false;
let bannerRetryTimer = null;
let syncScheduled = false;
let syncInFlight = null;
let syncRequestedAfterFlight = false;
let startupReady = false;

setupAdLayer();

function setupAdLayer() {
  injectAdStyles();
  document.addEventListener("settle-friends:screen-rendered", scheduleAdSync);
  document.addEventListener("focusin", scheduleAdSync);
  document.addEventListener("focusout", () => {
    window.setTimeout(scheduleAdSync, 0);
  });
  document.addEventListener("visibilitychange", scheduleAdSync);
  window.addEventListener("online", handleNetworkRestored);
  window.addEventListener("offline", removeBanner);
  document.addEventListener(ENTITLEMENT_EVENT, (event) => {
    entitlementStatus = event.detail?.status ?? emptyReferralProgramStatus();
    scheduleAdSync();
  });

  new MutationObserver(scheduleAdSync).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"]
  });

  globalThis.SogrimAds = {
    createSponsoredCard,
    refresh: scheduleAdSync,
    hide: removeBanner,
    showPrivacyOptions,
    getConsentState
  };

  runAfterFirstInteractiveScreen(() => {
    startupReady = true;
    scheduleAdSync();
  });
}

function scheduleAdSync() {
  if (!startupReady) return;
  if (syncScheduled) return;
  if (syncInFlight) {
    syncRequestedAfterFlight = true;
    return;
  }

  syncScheduled = true;
  requestAnimationFrame(() => {
    syncScheduled = false;
    syncInFlight = syncAdPlacement()
      .catch(() => removeBanner())
      .finally(() => {
        syncInFlight = null;
        if (!syncRequestedAfterFlight) return;
        syncRequestedAfterFlight = false;
        scheduleAdSync();
      });
  });
}

async function syncAdPlacement() {
  runtimeConfig ??= await loadRuntimeConfig();
  const screenKind =
    document.querySelector("#app .screen")?.dataset.screenKind ?? "general";
  const platform = globalThis.Capacitor?.getPlatform?.() ?? "web";
  const eligible = canDisplayAds({
    config: runtimeConfig,
    entitlementStatus,
    screenKind,
    platform,
    dialogOpen: placementBlocked()
  });

  if (!eligible) {
    await removeBanner();
    return;
  }

  const admob = globalThis.Capacitor?.Plugins?.AdMob;
  if (!admob?.showBanner) return;

  await initializeAdMob(admob);
  await prepareBannerListeners(admob);
  if (!(await ensureConsent(admob))) return;

  if (bannerVisible || bannerRequested || bannerRetryTimer) return;

  bannerRequested = true;
  try {
    const testMode = Boolean(runtimeConfig.monetization.testMode);
    await admob.showBanner({
      adId: testMode
        ? GOOGLE_ANDROID_FIXED_TEST_BANNER_ID
        : runtimeConfig.monetization.androidBannerId,
      adSize: "BANNER",
      position: "BOTTOM_CENTER",
      margin: 0,
      isTesting: testMode,
      npa: true
    });
  } catch {
    handleBannerLoadFailure();
  }
}

async function initializeAdMob(admob) {
  if (admobInitialized) return;
  await admob.initialize({
    initializeForTesting: Boolean(runtimeConfig?.monetization?.testMode),
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
    maxAdContentRating: "PG"
  });
  admobInitialized = true;
}

async function prepareBannerListeners(admob) {
  if (bannerListenersReady) return;
  if (!admob?.addListener) throw new Error("AdMob banner events are unavailable");

  await Promise.all([
    admob.addListener("bannerAdLoaded", handleBannerLoaded),
    admob.addListener("bannerAdSizeChanged", handleBannerSizeChanged),
    admob.addListener("bannerAdFailedToLoad", handleBannerLoadFailure)
  ]);
  bannerListenersReady = true;
}

function handleBannerLoaded() {
  if (!currentPlacementEligible()) {
    removeBanner();
    return;
  }
  clearBannerRetry();
  bannerRequested = true;
  bannerVisible = true;
  document.body.classList.add("native-ad-banner-visible");
}

function handleBannerSizeChanged(size = {}) {
  const height = Number(size.height);
  if (!Number.isFinite(height) || height <= 0) {
    clearBannerPresentation();
    return;
  }

  document.documentElement.style.setProperty(
    "--native-ad-banner-height",
    `${Math.max(DEFAULT_BANNER_HEIGHT, Math.ceil(height))}px`
  );
  handleBannerLoaded();
}

function handleBannerLoadFailure() {
  clearBannerPresentation();
  clearBannerRetry();
  if (!currentPlacementEligible()) return;
  bannerRetryTimer = window.setTimeout(() => {
    bannerRetryTimer = null;
    scheduleAdSync();
  }, BANNER_RETRY_DELAY_MS);
}

function currentPlacementEligible() {
  const screenKind =
    document.querySelector("#app .screen")?.dataset.screenKind ?? "general";
  const platform = globalThis.Capacitor?.getPlatform?.() ?? "web";
  return canDisplayAds({
    config: runtimeConfig,
    entitlementStatus,
    screenKind,
    platform,
    dialogOpen: placementBlocked()
  });
}

function placementBlocked() {
  return Boolean(
    document.visibilityState === "hidden" ||
      navigator.onLine === false ||
    document.body.classList.contains("app-dialog-open") ||
      document.body.classList.contains("referral-dialog-open") ||
      document.querySelector(
        ".event-modal, .expense-modal, .important-action-dialog, .app-choice-picker"
      ) ||
      isTextEntryActive()
  );
}

function isTextEntryActive() {
  const activeElement = document.activeElement;
  return Boolean(
    activeElement?.matches?.(
      'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]'
    )
  );
}

async function ensureConsent(admob) {
  if (consentState === "ready") return true;
  if (["blocked", "error"].includes(consentState)) return false;
  if (consentRequest) return consentRequest;

  consentState = "checking";
  publishConsentState();
  consentRequest = prepareConsent(admob)
    .then((consentInfo) => {
      applyConsentInfo(consentInfo);
      return consentCanRequestAds;
    })
    .catch(() => {
      consentState = "error";
      consentCanRequestAds = false;
      publishConsentState();
      return false;
    })
    .finally(() => {
      consentRequest = null;
    });
  return consentRequest;
}

async function prepareConsent(admob) {
  if (!admob.requestConsentInfo) {
    return {
      canRequestAds: true,
      privacyOptionsRequirementStatus: "NOT_REQUIRED"
    };
  }

  let consentInfo = await admob.requestConsentInfo();
  if (
    (consentInfo?.status === "REQUIRED" ||
      consentInfo?.canRequestAds === false) &&
    consentInfo?.isConsentFormAvailable &&
    admob.showConsentForm
  ) {
    consentInfo = await admob.showConsentForm();
  }
  return consentInfo;
}

function applyConsentInfo(consentInfo = {}) {
  consentCanRequestAds = consentInfo.canRequestAds !== false;
  privacyOptionsRequired =
    consentInfo.privacyOptionsRequirementStatus === "REQUIRED";
  consentState = consentCanRequestAds ? "ready" : "blocked";
  publishConsentState();
}

function publishConsentState() {
  document.dispatchEvent(
    new CustomEvent("settle-friends:ad-consent-changed", {
      detail: getConsentState()
    })
  );
}

function getConsentState() {
  return {
    state: consentState,
    canRequestAds: consentCanRequestAds,
    privacyOptionsRequired
  };
}

function retryConsentAfterError() {
  if (consentState !== "error") return;
  consentState = "unknown";
  publishConsentState();
}

function handleNetworkRestored() {
  retryConsentAfterError();
  scheduleAdSync();
}

async function showPrivacyOptions() {
  const admob = globalThis.Capacitor?.Plugins?.AdMob;
  if (!admob?.requestConsentInfo || !admob?.showPrivacyOptionsForm) return false;

  runtimeConfig ??= await loadRuntimeConfig();
  await initializeAdMob(admob);
  const consentInfo = await admob.requestConsentInfo();
  applyConsentInfo(consentInfo);
  if (consentInfo?.privacyOptionsRequirementStatus !== "REQUIRED") return false;

  await removeBanner();
  await admob.showPrivacyOptionsForm();
  applyConsentInfo(await admob.requestConsentInfo());
  scheduleAdSync();
  return true;
}

async function removeBanner() {
  const shouldRemove = bannerRequested || bannerVisible;
  clearBannerRetry();
  clearBannerPresentation();
  if (!shouldRemove) return;

  try {
    await globalThis.Capacitor?.Plugins?.AdMob?.removeBanner?.();
  } catch {}
}

function clearBannerPresentation() {
  bannerRequested = false;
  bannerVisible = false;
  document.body.classList.remove("native-ad-banner-visible");
  document.documentElement.style.removeProperty("--native-ad-banner-height");
}

function clearBannerRetry() {
  if (!bannerRetryTimer) return;
  window.clearTimeout(bannerRetryTimer);
  bannerRetryTimer = null;
}

function createSponsoredCard({
  sponsor = "",
  title = "",
  description = "",
  cta = "",
  url = ""
} = {}) {
  const article = document.createElement("article");
  article.className = "sogrim-sponsored-card";
  article.dataset.sponsoredContent = "true";

  const attribution = document.createElement("span");
  attribution.className = "sogrim-sponsored-label";
  attribution.textContent = "\u05de\u05de\u05d5\u05de\u05df";
  article.append(attribution);

  const copy = document.createElement("span");
  copy.className = "sogrim-sponsored-copy";
  const heading = document.createElement("strong");
  heading.textContent = title || sponsor;
  const body = document.createElement("small");
  body.textContent = description;
  copy.append(heading, body);
  article.append(copy);

  const destination = safeHttpUrl(url);
  if (destination && cta) {
    const link = document.createElement("a");
    link.className = "secondary-button sogrim-sponsored-cta";
    link.href = destination;
    link.target = "_blank";
    link.rel = "noopener noreferrer sponsored";
    link.textContent = cta;
    article.append(link);
  }

  return article;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function injectAdStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    body.native-ad-banner-visible #app > .screen[data-screen-kind="home"],
    body.native-ad-banner-visible #app > .screen[data-screen-kind="groups"] {
      padding-block-end:
        calc(
          124px +
          var(--native-ad-banner-height, ${DEFAULT_BANNER_HEIGHT}px) +
          env(safe-area-inset-bottom)
        ) !important;
      scroll-padding-block-end:
        calc(
          124px +
          var(--native-ad-banner-height, ${DEFAULT_BANNER_HEIGHT}px) +
          env(safe-area-inset-bottom)
        ) !important;
    }

    html.native-app body.native-ad-banner-visible .product-app-nav {
      inset-block-end:
        calc(
          var(--native-ad-banner-height, ${DEFAULT_BANNER_HEIGHT}px) +
          max(14px, env(safe-area-inset-bottom)) +
          18px
        ) !important;
    }

    .sogrim-sponsored-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 14px;
      border: 1px solid rgba(24, 53, 46, 0.11);
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 10px 26px rgba(15, 65, 54, 0.06);
    }

    .sogrim-sponsored-label {
      align-self: start;
      padding: 4px 7px;
      border: 1px solid rgba(31, 63, 55, 0.13);
      border-radius: 999px;
      color: #667570;
      background: #f3f6f5;
      font-size: 0.68rem;
      font-weight: 700;
    }

    .sogrim-sponsored-copy {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .sogrim-sponsored-copy strong {
      color: #172622;
    }

    .sogrim-sponsored-copy small {
      color: #6b7975;
      line-height: 1.45;
    }

    @media (max-width: 520px) {
      .sogrim-sponsored-card {
        grid-template-columns: auto minmax(0, 1fr);
      }

      .sogrim-sponsored-cta {
        grid-column: 1 / -1;
        width: 100%;
      }
    }
  `;
  document.head.append(style);
}
