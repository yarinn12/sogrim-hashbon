import {
  loadRuntimeConfig,
  loadSharedState,
  saveLocalProfile,
  saveSharedState
} from "./data/localStore.mjs";
import {
  mergeInviteSnapshotIntoState,
  parseInviteEventId,
  parseInviteSnapshot
} from "./domain/inviteLinks.mjs";
import { clearPendingInviteUrl, pendingInviteUrl } from "./data/pendingInvite.mjs";
import { ensureNamedParticipant } from "./domain/userProfile.mjs";
import { fetchWithTimeout } from "./data/fetchTimeout.mjs";

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const STYLE_ID = "public-google-auth-layer-style";
const GOOGLE_AUTH_TIMEOUT_MS = 10_000;
const GOOGLE_SCRIPT_TIMEOUT_MS = 8_000;

let googleScriptPromise = null;
let googleInitialized = false;
let googleClientId = "";
let googleCredentialRequest = null;

injectGoogleAuthStyle();
setupGoogleAuthLayer();
watchProfileGate();

async function setupGoogleAuthLayer() {
  const config = await loadRuntimeConfig();
  googleClientId = config.auth?.googleClientId ?? "";
  if (!googleClientId) return;

  enhanceProfileGate();
}

function watchProfileGate() {
  const observer = new MutationObserver(() => enhanceProfileGate());
  observer.observe(document.body, { childList: true, subtree: true });
}

async function enhanceProfileGate() {
  if (!googleClientId) return;

  const form = document.querySelector("[data-public-profile-form] .public-profile-form");
  if (!form || form.querySelector("[data-google-auth-slot]")) return;

  const nameField = form.querySelector(".field");
  nameField?.insertAdjacentHTML(
    "beforebegin",
    `<div class="public-google-auth" data-google-auth-slot>
      <div class="public-google-button" data-google-auth-button></div>
      <div class="public-google-divider"><span>או</span></div>
    </div>`
  );

  await renderGoogleButton(form.querySelector("[data-google-auth-button]"));
}

async function renderGoogleButton(target) {
  if (!target) return;

  try {
    await loadGoogleScript();
    initializeGoogleAuth();
    window.google.accounts.id.renderButton(target, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: "continue_with",
      locale: "he",
      width: target.getBoundingClientRect().width || 320
    });
  } catch {
    target.closest("[data-google-auth-slot]")?.remove();
  }
}

function initializeGoogleAuth() {
  if (googleInitialized) return;

  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: true,
    ux_mode: "popup"
  });
  googleInitialized = true;
}

async function handleGoogleCredential(response) {
  if (googleCredentialRequest) return googleCredentialRequest;

  const request = handleGoogleCredentialOnce(response).finally(() => {
    if (googleCredentialRequest === request) googleCredentialRequest = null;
  });
  googleCredentialRequest = request;
  return request;
}

async function handleGoogleCredentialOnce(response) {
  const form = document.querySelector("[data-public-profile-form]");
  const error = form?.querySelector("[data-public-profile-error]");

  try {
    setGoogleBusy(true);
    const googleProfile = await verifyGoogleCredential(response?.credential);
    if (!googleProfile) throw new Error("Google profile needs a full name");

    const inviteUrl = pendingInviteUrl(window.location.href);
    const invitedEventId = parseInviteEventId(inviteUrl);
    const inviteSnapshot = parseInviteSnapshot(inviteUrl);
    const sharedState = mergeInviteSnapshotIntoState(await loadSharedState(), inviteSnapshot);
    const nextState = ensureNamedParticipant(
      sharedState,
      {
        id: googleProfile.participantId,
        displayName: googleProfile.displayName,
        authProvider: googleProfile.authProvider,
        authSubject: googleProfile.authSubject,
        email: googleProfile.email
      },
      invitedEventId,
      { reactivateInactive: false }
    );
    const participant = nextState.participants.find(
      (item) => item.id === nextState.currentParticipantId
    );

    saveLocalProfile({
      participantId: nextState.currentParticipantId,
      displayName: participant?.displayName ?? googleProfile.displayName,
      authProvider: googleProfile.authProvider,
      authSubject: googleProfile.authSubject,
      email: googleProfile.email
    });
    await saveSharedState(nextState);
    if (!invitedEventId || nextState.events.some((event) => event.id === invitedEventId)) {
      clearPendingInviteUrl();
    }
    window.location.reload();
  } catch {
    if (error) {
      error.hidden = false;
      error.textContent = "לא הצלחנו להתחבר עם Google כרגע. אפשר להמשיך עם שם מלא.";
    }
  } finally {
    setGoogleBusy(false);
  }
}

async function verifyGoogleCredential(credential) {
  const response = await fetchWithTimeout(
    globalThis.fetch,
    "/api/auth/google",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential })
    },
    GOOGLE_AUTH_TIMEOUT_MS
  );
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.profile ?? null;
}

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      script.remove();
      reject(new Error("Google sign-in did not load in time"));
    }, GOOGLE_SCRIPT_TIMEOUT_MS);
    const finish = (callback, value) => {
      window.clearTimeout(timeoutId);
      callback(value);
    };
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => finish(resolve);
    script.onerror = (error) => finish(reject, error);
    document.head.append(script);
  }).catch((error) => {
    googleScriptPromise = null;
    throw error;
  });

  return googleScriptPromise;
}

function setGoogleBusy(isBusy) {
  document.documentElement.classList.toggle("public-google-auth-busy", isBusy);
}

function injectGoogleAuthStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .public-google-auth {
      display: grid;
      gap: 14px;
      margin: 0 0 18px;
    }

    .public-google-button {
      min-height: 44px;
      display: grid;
      place-items: center;
    }

    .public-google-divider {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 10px;
      color: #69756f;
      font-size: 0.86rem;
      font-weight: 800;
    }

    .public-google-divider::before,
    .public-google-divider::after {
      content: "";
      height: 1px;
      background: #dfe6dd;
    }

    .public-google-auth-busy [data-public-profile-form] {
      pointer-events: none;
      opacity: 0.76;
    }
  `;
  document.head.append(style);
}
