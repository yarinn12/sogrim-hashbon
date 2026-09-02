import {
  loadRuntimeConfig,
  refreshRuntimeConfigNow
} from "./data/localStore.mjs";

const CHECKING_CLASS = "mandatory-update-checking";
const REQUIRED_CLASS = "mandatory-update-required";
const GATE_ID = "mandatory-update-gate";
const STYLE_ID = "mandatory-update-styles";
const UPDATE_CHECK_EVENT = "sogrim:mandatory-update-check";
const NATIVE_BACK_EVENT = "settle-friends:native-back";
const NATIVE_RESUME_EVENT = "settle-friends:native-resume";
const ANDROID_PACKAGE_ID = "com.sogrimhashbon.app";
const PLAY_STORE_URL =
  `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`;
const PLAY_MARKET_URL = `market://details?id=${ANDROID_PACKAGE_ID}`;
const INITIAL_UPDATE_CHECK_BUDGET_MS = 1_200;

const CSS = `
  html.mandatory-update-checking body {
    pointer-events: none;
  }

  html.mandatory-update-required,
  html.mandatory-update-required body {
    min-height: 100%;
    overflow: hidden !important;
    overscroll-behavior: none;
  }

  html.mandatory-update-required #app-splash {
    display: none !important;
  }

  .mandatory-update-gate {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    min-height: 100dvh;
    padding:
      max(28px, env(safe-area-inset-top))
      max(22px, env(safe-area-inset-right))
      max(28px, env(safe-area-inset-bottom))
      max(22px, env(safe-area-inset-left));
    overflow-y: auto;
    pointer-events: auto;
    direction: rtl;
    color: #10221f;
    background: #f6f9f8;
    font-family: "Rubik", "Heebo", "Assistant", sans-serif;
  }

  .mandatory-update-panel {
    width: min(100%, 440px);
    padding: 34px 26px 28px;
    border: 1px solid #d8e3e0;
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 18px 45px rgba(19, 62, 53, 0.12);
    text-align: center;
  }

  .mandatory-update-brand {
    display: block;
    width: 72px;
    height: 72px;
    margin: 0 auto 24px;
    border-radius: 16px;
    object-fit: contain;
  }

  .mandatory-update-eyebrow {
    margin: 0 0 10px;
    color: #11624f;
    font-size: 0.88rem;
    font-weight: 600;
  }

  .mandatory-update-title {
    margin: 0;
    color: #10221f;
    font-size: clamp(1.75rem, 7vw, 2.15rem);
    font-weight: 700;
    line-height: 1.16;
    letter-spacing: 0;
  }

  .mandatory-update-copy {
    margin: 18px auto 0;
    max-width: 32ch;
    color: #5e706c;
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.65;
  }

  .mandatory-update-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 54px;
    margin-top: 28px;
    padding: 0 24px;
    border: 1px solid #064c3d;
    border-radius: 12px;
    color: #ffffff;
    background: #075a48;
    box-shadow: 0 5px 14px rgba(7, 90, 72, 0.18);
    font: inherit;
    font-size: 1.05rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
  }

  .mandatory-update-button:active {
    transform: translateY(1px);
    background: #064c3d;
    box-shadow: 0 2px 7px rgba(7, 90, 72, 0.16);
  }

  .mandatory-update-button:focus-visible {
    outline: 3px solid rgba(17, 145, 116, 0.34);
    outline-offset: 3px;
  }

  .mandatory-update-button[aria-busy="true"] {
    cursor: wait;
  }

  .mandatory-update-note {
    min-height: 1.45em;
    margin: 14px 0 0;
    color: #75837f;
    font-size: 0.82rem;
    font-weight: 500;
    line-height: 1.45;
  }

  @media (max-height: 560px) {
    .mandatory-update-gate {
      place-items: start center;
    }

    .mandatory-update-panel {
      padding-block: 24px 22px;
    }

    .mandatory-update-brand {
      width: 56px;
      height: 56px;
      margin-bottom: 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mandatory-update-button {
      transition: none;
    }
  }
`;

let updateRequired = false;
let checkPromise = null;

if (isNativeAndroidRuntime()) {
  installStyles();
  document.documentElement.classList.add(CHECKING_CLASS);
  checkForMandatoryUpdate().catch(releaseUpdateCheck);
  window.addEventListener(NATIVE_RESUME_EVENT, () => {
    checkForMandatoryUpdate({ showCheckingState: false }).catch(() => {});
  });
  window.addEventListener("online", () => {
    checkForMandatoryUpdate({ showCheckingState: false }).catch(() => {});
  });
  window.addEventListener(
    NATIVE_BACK_EVENT,
    (event) => {
      if (!updateRequired) return;
      event.preventDefault();
      // The gate blocks the entire app. Do not let app.mjs navigate the hidden
      // screen underneath it while the user is required to update.
      event.stopImmediatePropagation();
      document.querySelector(`#${GATE_ID}`)?.focus({
        preventScroll: true
      });
    },
    true
  );
}

function checkForMandatoryUpdate({ showCheckingState = true } = {}) {
  if (checkPromise) return checkPromise;
  if (showCheckingState) {
    document.documentElement.classList.add(CHECKING_CLASS);
  }

  checkPromise = performUpdateCheck()
    .catch((error) => {
      if (!updateRequired) releaseUpdateCheck();
      throw error;
    })
    .finally(() => {
      checkPromise = null;
    });
  return checkPromise;
}

async function performUpdateCheck() {
  let initialConfig = null;
  let initialPolicyRequired = false;
  let initialPolicyKnown = false;
  try {
    initialConfig = await loadRuntimeConfig();
    initialPolicyKnown = toBuildNumber(
      initialConfig?.updates?.android?.currentBuild
    ) > 0;
    initialPolicyRequired = applyUpdatePolicy(
      initialConfig?.updates?.android,
      { final: false }
    );
  } catch {}

  const freshConfigRequest = refreshRuntimeConfigNow();
  if (initialPolicyRequired) {
    try {
      const freshConfig = await freshConfigRequest;
      applyUpdatePolicy(freshConfig?.updates?.android, { final: true });
    } catch {
      // A locally known mandatory update remains blocking while offline.
    }
    return;
  }

  if (initialPolicyKnown) {
    // Native store builds embed a validated policy. Let the first screen open
    // immediately, while the network refresh can still present a newer gate.
    releaseUpdateCheck();
    try {
      const freshConfig = await freshConfigRequest;
      applyUpdatePolicy(freshConfig?.updates?.android, { final: true });
    } catch {
      releaseUpdateCheck();
    }
    return;
  }

  const firstResult = await Promise.race([
    freshConfigRequest.then(
      (config) => ({ status: "ready", config }),
      () => ({ status: "failed" })
    ),
    wait(INITIAL_UPDATE_CHECK_BUDGET_MS).then(() => ({ status: "timeout" }))
  ]);

  if (firstResult.status === "ready") {
    applyUpdatePolicy(firstResult.config?.updates?.android, { final: true });
    return;
  }
  if (firstResult.status === "failed") {
    hideUpdateGate();
    return;
  }

  // Do not keep the branded launch screen waiting on a slow failover host.
  // The same in-flight request can still present the mandatory gate later.
  releaseUpdateCheck();
  try {
    const freshConfig = await freshConfigRequest;
    applyUpdatePolicy(freshConfig?.updates?.android, { final: true });
  } catch {
    releaseUpdateCheck();
  }
}

function applyUpdatePolicy(policy, { final = true } = {}) {
  const minimumSupportedBuild = toBuildNumber(policy?.minimumSupportedBuild);
  const currentBuild = toBuildNumber(policy?.currentBuild);
  const required = Boolean(
    policy?.required === true &&
    minimumSupportedBuild > 0 &&
    currentBuild > 0 &&
    currentBuild < minimumSupportedBuild
  );

  if (required) {
    showUpdateGate();
    return true;
  }
  if (final) hideUpdateGate();
  return false;
}

function showUpdateGate() {
  updateRequired = true;
  document.documentElement.classList.remove(CHECKING_CLASS);
  document.documentElement.classList.add(REQUIRED_CLASS);
  let gate = document.querySelector(`#${GATE_ID}`);
  if (!gate) {
    gate = document.createElement("section");
    gate.id = GATE_ID;
    gate.className = "mandatory-update-gate";
    gate.setAttribute("role", "alertdialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "mandatory-update-title");
    gate.setAttribute("aria-describedby", "mandatory-update-copy");
    gate.setAttribute("tabindex", "-1");
    gate.style.setProperty("outline", "none", "important");
    gate.innerHTML = `
      <div class="mandatory-update-panel">
        <img class="mandatory-update-brand" src="./brand-mark-v3.png" alt="" width="72" height="72">
        <p class="mandatory-update-eyebrow">עדכון חדש זמין</p>
        <h1 class="mandatory-update-title" id="mandatory-update-title">צריך לעדכן כדי להמשיך</h1>
        <p class="mandatory-update-copy" id="mandatory-update-copy">כדי להמשיך להשתמש בסוגרים חשבון, יש לעדכן לגרסה החדשה דרך Google Play.</p>
        <button class="mandatory-update-button" type="button">עדכון עכשיו</button>
        <p class="mandatory-update-note" role="status" aria-live="polite">האירועים והמידע שלך נשמרים.</p>
      </div>
    `;
    gate.querySelector(".mandatory-update-button")?.addEventListener(
      "click",
      openPlayStore
    );
    document.body.append(gate);
  }
  gate.removeAttribute("inert");
  gate.hidden = false;
  gate.focus({ preventScroll: true });
  announceUpdateCheckComplete();
}

function hideUpdateGate() {
  updateRequired = false;
  document.documentElement.classList.remove(REQUIRED_CLASS);
  const gate = document.querySelector(`#${GATE_ID}`);
  if (gate) {
    gate.hidden = true;
    gate.setAttribute("inert", "");
  }
  releaseUpdateCheck();
}

async function openPlayStore() {
  const button = document.querySelector(".mandatory-update-button");
  const note = document.querySelector(".mandatory-update-note");
  if (!button || button.getAttribute("aria-busy") === "true") return;

  button.setAttribute("aria-busy", "true");
  if (note) note.textContent = "פותחים את Google Play…";
  try {
    const opened = await globalThis.SogrimNative?.app?.openStore?.({
      marketUrl: PLAY_MARKET_URL,
      storeUrl: PLAY_STORE_URL
    });
    if (!opened) window.location.assign(PLAY_STORE_URL);
  } catch {
    window.location.assign(PLAY_STORE_URL);
  } finally {
    window.setTimeout(() => {
      button.removeAttribute("aria-busy");
      if (note) note.textContent = "האירועים והמידע שלך נשמרים.";
    }, 1200);
  }
}

function releaseUpdateCheck() {
  document.documentElement.classList.remove(CHECKING_CLASS);
  announceUpdateCheckComplete();
}

function announceUpdateCheckComplete() {
  document.dispatchEvent(new CustomEvent(UPDATE_CHECK_EVENT));
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function installStyles() {
  if (document.querySelector(`#${STYLE_ID}`)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

function toBuildNumber(value) {
  const build = Number.parseInt(value, 10);
  return Number.isSafeInteger(build) && build > 0 ? build : 0;
}

function isNativeAndroidRuntime() {
  const capacitor = globalThis.Capacitor;
  return Boolean(
    capacitor?.isNativePlatform?.() &&
    String(capacitor?.getPlatform?.() ?? "").toLowerCase() === "android"
  );
}
