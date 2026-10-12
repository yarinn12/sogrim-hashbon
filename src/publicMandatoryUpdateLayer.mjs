import { refreshRuntimeConfigNow, pendingSharedSyncStatus } from "./data/localStore.mjs";
import { decideNativeUpdate } from "./domain/appUpdatePolicy.mjs";
import { hasUpdateSensitiveWork } from "./domain/updateSafety.mjs";

const CHECKING_CLASS = "mandatory-update-checking";
const REQUIRED_CLASS = "mandatory-update-required";
const GATE_ID = "mandatory-update-gate";
const OPTIONAL_ID = "available-update-prompt";
const STYLE_ID = "mandatory-update-styles";
const UPDATE_CHECK_EVENT = "sogrim:mandatory-update-check";
const NATIVE_BACK_EVENT = "settle-friends:native-back";
const NATIVE_RESUME_EVENT = "settle-friends:native-resume";
const ANDROID_PACKAGE_ID = "com.sogrimhashbon.app";
const PLAY_MARKET_URL = `market://details?id=${ANDROID_PACKAGE_ID}`;
const INITIAL_UPDATE_CHECK_BUDGET_MS = 1_200;
const LATER_MS = 24 * 60 * 60 * 1_000;
const PLATFORM = nativePlatform();

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

  .mandatory-update-gate[hidden] {
    display: none !important;
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

  .available-update-actions {
    display: grid;
    gap: 10px;
    margin-top: 28px;
  }

  .available-update-actions .mandatory-update-button {
    margin-top: 0;
  }

  .available-update-later {
    min-height: 48px;
    border: 1px solid #b9cbc5;
    border-radius: 12px;
    background: #fff;
    color: #075a48;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .available-update-later:focus-visible {
    outline: 3px solid rgba(17, 145, 116, 0.34);
    outline-offset: 3px;
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
let lifecycleCheckChain = Promise.resolve();
let verifiedPolicy = null;
let verifiedBuild = 0;
let visibleDecision = null;
let previousFocus = null;
let connectivityGeneration = 0;

if (PLATFORM) {
  installStyles();
  document.documentElement.classList.add(CHECKING_CLASS);
  checkForMandatoryUpdate().catch(releaseUpdateCheck);
  window.addEventListener(NATIVE_RESUME_EVENT, () => {
    queueLifecycleCheck().catch(() => {});
  });
  window.addEventListener("online", () => {
    queueLifecycleCheck().catch(() => {});
  });
  window.addEventListener("offline", () => {
    connectivityGeneration += 1;
    clearVerifiedPolicy();
  });
  window.addEventListener("sogrim:sync-status", reconsiderVerifiedPolicy);
  document.addEventListener("settle-friends:screen-rendered", reconsiderVerifiedPolicy);
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && visibleDecision?.kind === "optional") deferOptionalUpdate();
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

function queueLifecycleCheck() {
  lifecycleCheckChain = lifecycleCheckChain.catch(() => {}).then(async () => {
    if (checkPromise) await checkPromise.catch(() => {});
    return checkForMandatoryUpdate({ showCheckingState: false });
  });
  return lifecycleCheckChain;
}

function checkForMandatoryUpdate({ showCheckingState = true } = {}) {
  if (checkPromise) return checkPromise;
  if (showCheckingState) {
    document.documentElement.classList.add(CHECKING_CLASS);
  }

  checkPromise = performUpdateCheck()
    .catch((error) => {
      clearVerifiedPolicy();
      throw error;
    })
    .finally(() => {
      checkPromise = null;
    });
  return checkPromise;
}

async function performUpdateCheck() {
  const generation = connectivityGeneration;
  if (navigator.onLine === false) {
    clearVerifiedPolicy();
    return;
  }
  const freshRequest = Promise.all([nativeBuildNumber(), refreshRuntimeConfigNow()]);

  const firstResult = await Promise.race([
    freshRequest.then(
      ([build, config]) => ({ status: "ready", build, config }),
      () => ({ status: "failed" })
    ),
    wait(INITIAL_UPDATE_CHECK_BUDGET_MS).then(() => ({ status: "timeout" }))
  ]);

  if (firstResult.status === "ready") {
    if (generation === connectivityGeneration) {
      applyUpdatePolicy(firstResult.config?.updates?.[PLATFORM], firstResult.build);
    }
    return;
  }
  if (firstResult.status === "failed") {
    if (generation === connectivityGeneration) clearVerifiedPolicy();
    return;
  }

  // A slow or failed check never holds the app behind the launch screen.
  releaseUpdateCheck();
  try {
    const [build, freshConfig] = await freshRequest;
    if (generation === connectivityGeneration) {
      applyUpdatePolicy(freshConfig?.updates?.[PLATFORM], build);
    }
  } catch {
    if (generation === connectivityGeneration) clearVerifiedPolicy();
  }
}

function clearVerifiedPolicy() {
  verifiedPolicy = null;
  verifiedBuild = 0;
  visibleDecision = null;
  hideUpdatePrompts();
}

function applyUpdatePolicy(policy, build) {
  verifiedPolicy = policy ?? null;
  verifiedBuild = build;
  reconsiderVerifiedPolicy();
}

function reconsiderVerifiedPolicy() {
  if (navigator.onLine === false) {
    clearVerifiedPolicy();
    return;
  }
  if (!verifiedPolicy) {
    hideUpdatePrompts();
    return;
  }
  const decision = decideNativeUpdate(PLATFORM, verifiedBuild, verifiedPolicy, {
    deferredBuild: deferredOptionalBuild(),
    unsafeWork: hasUnsyncedOrOpenWork()
  });
  if (decision.kind === "required") {
    visibleDecision = decision;
    hideOptionalUpdate();
    showUpdateGate();
  } else if (decision.kind === "optional") {
    visibleDecision = decision;
    hideUpdateGate();
    showOptionalUpdate();
  } else {
    visibleDecision = null;
    hideUpdatePrompts();
  }
  releaseUpdateCheck();
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
      openNativeStore
    );
    document.body.append(gate);
  }
  gate.removeAttribute("inert");
  gate.hidden = false;
  gate.querySelector(".mandatory-update-copy").textContent = PLATFORM === "ios"
    ? "כדי להמשיך להשתמש בסוגרים חשבון, יש לעדכן לגרסה החדשה דרך App Store."
    : "כדי להמשיך להשתמש בסוגרים חשבון, יש לעדכן לגרסה החדשה דרך Google Play.";
  gate.querySelector(".mandatory-update-note").textContent =
    "אם יש עבודה שלא סונכרנה, השלימו אותה לפני העדכון.";
  setAppUpdateInert(true);
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
  restoreAppInteractionIfClear();
  releaseUpdateCheck();
}

function showOptionalUpdate() {
  let prompt = document.querySelector(`#${OPTIONAL_ID}`);
  const wasVisible = Boolean(prompt && !prompt.hidden);
  if (!prompt) {
    prompt = document.createElement("section");
    prompt.id = OPTIONAL_ID;
    prompt.className = "mandatory-update-gate";
    prompt.setAttribute("role", "dialog");
    prompt.setAttribute("aria-modal", "true");
    prompt.setAttribute("aria-labelledby", "available-update-title");
    prompt.setAttribute("tabindex", "-1");
    prompt.innerHTML = `
      <div class="mandatory-update-panel">
        <img class="mandatory-update-brand" src="./brand-mark-v3.png" alt="" width="72" height="72">
        <p class="mandatory-update-eyebrow">עדכון חדש זמין</p>
        <h1 class="mandatory-update-title" id="available-update-title">אפשר לעדכן את האפליקציה</h1>
        <p class="mandatory-update-copy">הגרסה החדשה זמינה בחנות. אפשר להמשיך עכשיו ולעדכן מאוחר יותר.</p>
        <div class="available-update-actions">
          <button class="mandatory-update-button" type="button">עדכון עכשיו</button>
          <button class="available-update-later" type="button">מאוחר יותר</button>
        </div>
        <p class="mandatory-update-note" role="status" aria-live="polite"></p>
      </div>`;
    prompt.querySelector(".mandatory-update-button")?.addEventListener("click", openNativeStore);
    prompt.querySelector(".available-update-later")?.addEventListener("click", deferOptionalUpdate);
    document.body.append(prompt);
  }
  if (!wasVisible) {
    previousFocus = document.activeElement;
    prompt.removeAttribute("inert");
    prompt.hidden = false;
    setAppUpdateInert(true);
    prompt.querySelector(".mandatory-update-button")?.focus({ preventScroll: true });
  }
}

function hideOptionalUpdate() {
  const prompt = document.querySelector(`#${OPTIONAL_ID}`);
  const hadFocus = prompt?.contains(document.activeElement);
  if (prompt) {
    prompt.hidden = true;
    prompt.setAttribute("inert", "");
  }
  restoreAppInteractionIfClear();
  if (hadFocus && previousFocus?.isConnected && !updateRequired) {
    previousFocus.focus?.({ preventScroll: true });
  }
  previousFocus = null;
}

function hideUpdatePrompts() {
  hideUpdateGate();
  hideOptionalUpdate();
  releaseUpdateCheck();
}

function deferOptionalUpdate() {
  if (visibleDecision?.kind !== "optional") return;
  try {
    window.localStorage.setItem(laterKey(), JSON.stringify({
      build: visibleDecision.targetBuild,
      until: Date.now() + LATER_MS
    }));
  } catch {}
  visibleDecision = null;
  hideOptionalUpdate();
}

function deferredOptionalBuild() {
  try {
    const record = JSON.parse(window.localStorage.getItem(laterKey()) || "null");
    const now = Date.now();
    return Number.isSafeInteger(record?.build) && record.until > now &&
      record.until <= now + LATER_MS ? record.build : 0;
  } catch { return 0; }
}

function laterKey() {
  return `settle-friends-native-update-later-v1:${PLATFORM}`;
}

function hasUnsyncedOrOpenWork() {
  try {
    return hasUpdateSensitiveWork({
      document, storage: window.localStorage,
      pending: pendingSharedSyncStatus().pending,
      checkOutbox: true
    });
  } catch { return true; }
}

async function nativeBuildNumber() {
  try {
    const info = await globalThis.SogrimNative?.app?.getInfo?.() ??
      await globalThis.Capacitor?.Plugins?.App?.getInfo?.();
    const build = toBuildNumber(info?.build);
    if (build) return build;
  } catch {}
  return toBuildNumber(globalThis.SogrimNativeRuntimeConfig?.updates?.[PLATFORM]?.currentBuild);
}

function setAppUpdateInert(enabled) {
  const app = document.querySelector("#app");
  if (!app) return;
  if (enabled && !app.hasAttribute("inert")) {
    app.setAttribute("inert", "");
    app.dataset.updateInert = "1";
  } else if (!enabled && app.dataset.updateInert === "1") {
    app.removeAttribute("inert");
    delete app.dataset.updateInert;
  }
}

function restoreAppInteractionIfClear() {
  if (document.querySelector(`#${GATE_ID}:not([hidden]), #${OPTIONAL_ID}:not([hidden])`)) return;
  setAppUpdateInert(false);
}

async function openNativeStore(event) {
  const button = event.currentTarget;
  const note = button.closest(".mandatory-update-panel")?.querySelector(".mandatory-update-note");
  if (!button || button.getAttribute("aria-busy") === "true") return;
  const decision = visibleDecision;
  if (!decision || hasUnsyncedOrOpenWork()) {
    if (note) note.textContent = "יש להשלים שמירה וסנכרון לפני פתיחת החנות.";
    return;
  }

  button.setAttribute("aria-busy", "true");
  if (note) note.textContent = "פותחים את החנות.";
  try {
    const opened = await globalThis.SogrimNative?.app?.openStore?.({
      marketUrl: PLATFORM === "android" ? PLAY_MARKET_URL : "",
      storeUrl: decision.storeUrl
    });
    if (!opened && note) note.textContent = "לא ניתן לפתוח את החנות כרגע. נסו שוב מאוחר יותר.";
    if (opened && decision.kind === "optional" &&
        visibleDecision?.targetBuild === decision.targetBuild) deferOptionalUpdate();
  } catch {
    if (note) note.textContent = "לא ניתן לפתוח את החנות כרגע. נסו שוב מאוחר יותר.";
  } finally {
    window.setTimeout(() => button.removeAttribute("aria-busy"), 1200);
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
  const build = Number(value);
  return Number.isSafeInteger(build) && build > 0 ? build : 0;
}

function nativePlatform() {
  const capacitor = globalThis.Capacitor;
  const platform = String(capacitor?.getPlatform?.() ?? "").toLowerCase();
  return capacitor?.isNativePlatform?.() && ["android", "ios"].includes(platform)
    ? platform : "";
}
