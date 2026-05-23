import {
  loadLocalProfile,
  loadSharedState,
  saveLocalProfile,
  saveSharedState
} from "./data/localStore.mjs";
import { parseInviteEventId } from "./domain/inviteLinks.mjs";
import {
  ensureNamedParticipant,
  normalizeProfileName
} from "./domain/userProfile.mjs";

const app = document.querySelector("#app");
const STYLE_ID = "public-profile-overlay-style";

injectStyle();
setupPublicProfile();
watchRenderedApp();

async function setupPublicProfile() {
  const profile = loadLocalProfile();
  if (!profile) {
    renderProfileGate();
    return;
  }

  await syncInvitedEvent(profile);
  cleanPublicUi();
}

function watchRenderedApp() {
  if (!app) return;
  const observer = new MutationObserver(() => cleanPublicUi());
  observer.observe(app, { childList: true, subtree: true });
}

function cleanPublicUi() {
  const profile = loadLocalProfile();

  document.querySelectorAll(".network-panel, .launch-panel").forEach((item) => item.remove());
  document.querySelectorAll('[data-action="reset"]').forEach((item) => item.remove());

  const selector = document.querySelector('[data-action="current-participant"]');
  const panel = selector?.closest(".profile-panel");
  if (panel && profile) {
    panel.innerHTML = `
      <div class="public-profile-card">
        <span class="public-profile-avatar">${escapeHtml(initials(profile.displayName))}</span>
        <div>
          <span>אתה נכנס בתור</span>
          <strong>${escapeHtml(profile.displayName)}</strong>
        </div>
        <button class="secondary-button" type="button" data-public-action="edit-profile">החלף שם</button>
      </div>
    `;
  }

  document.querySelector('[data-public-action="edit-profile"]')?.addEventListener("click", () => {
    renderProfileGate(profile?.displayName ?? "");
  }, { once: true });
}

function renderProfileGate(defaultName = "") {
  const shell = document.createElement("section");
  shell.className = "public-profile-gate";
  shell.innerHTML = `
    <form class="public-profile-modal" data-public-profile-form>
      <p class="eyebrow">סוגרים חשבון</p>
      <h1>איך קוראים לך?</h1>
      <p class="muted">נשמור את השם רק במכשיר הזה, כדי שכל חבר יראה את האפליקציה בתור עצמו.</p>
      <label class="field">
        <span>השם שלך</span>
        <input name="displayName" value="${escapeAttribute(defaultName)}" placeholder="למשל דני" autocomplete="name" autofocus />
      </label>
      <p class="field-error" data-public-profile-error hidden></p>
      <button class="primary-button" type="submit">המשך</button>
    </form>
  `;

  document.querySelector(".public-profile-gate")?.remove();
  document.body.append(shell);
  shell.querySelector("input")?.focus();
  shell.querySelector("form")?.addEventListener("submit", saveProfile);
}

async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = form.querySelector("[data-public-profile-error]");
  const displayName = normalizeProfileName(new FormData(form).get("displayName"));

  if (!displayName) {
    error.hidden = false;
    error.textContent = "צריך להזין שם כדי להמשיך.";
    return;
  }

  const invitedEventId = parseInviteEventId(window.location.href);
  const previous = loadLocalProfile();
  const nextState = ensureNamedParticipant(
    await loadSharedState(),
    {
      id: previous?.participantId ?? makeUserId(),
      displayName
    },
    invitedEventId
  );
  const participant = nextState.participants.find(
    (item) => item.id === nextState.currentParticipantId
  );

  saveLocalProfile({
    participantId: nextState.currentParticipantId,
    displayName: participant?.displayName ?? displayName
  });
  await saveSharedState(nextState);
  window.location.reload();
}

async function syncInvitedEvent(profile) {
  const invitedEventId = parseInviteEventId(window.location.href);
  if (!invitedEventId) return;

  const state = await loadSharedState();
  const event = state.events.find((item) => item.id === invitedEventId);
  if (!event || event.participantIds.includes(profile.participantId)) return;

  const nextState = ensureNamedParticipant(
    state,
    { id: profile.participantId, displayName: profile.displayName },
    invitedEventId
  );
  const participant = nextState.participants.find(
    (item) => item.id === nextState.currentParticipantId
  );

  saveLocalProfile({
    participantId: nextState.currentParticipantId,
    displayName: participant?.displayName ?? profile.displayName
  });
  await saveSharedState(nextState);
  window.location.reload();
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .public-profile-gate {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: grid;
      place-items: center;
      padding: 18px;
      background: rgba(238, 243, 242, 0.92);
      backdrop-filter: blur(14px);
    }

    .public-profile-modal {
      width: min(100%, 460px);
      background: #fffefd;
      border: 1px solid #d7e2de;
      border-radius: 8px;
      box-shadow: 0 22px 54px rgba(18, 29, 27, 0.16);
      padding: 24px;
    }

    .public-profile-modal h1 {
      margin: 0 0 8px;
      max-width: none;
    }

    .public-profile-card {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: center;
    }

    .public-profile-card span:not(.public-profile-avatar) {
      display: block;
      color: #63756f;
      font-size: 0.9rem;
    }

    .public-profile-card strong {
      display: block;
      margin-top: 2px;
    }

    .public-profile-avatar {
      width: 38px;
      height: 38px;
      display: inline-grid;
      place-items: center;
      border-radius: 50%;
      background: #dff3ef;
      border: 1px solid #b8ddd7;
      color: #063f3b;
      font-weight: 900;
    }

    @media (max-width: 440px) {
      .public-profile-card {
        grid-template-columns: auto 1fr;
      }

      .public-profile-card button {
        grid-column: 1 / -1;
      }
    }
  `;
  document.head.append(style);
}

function makeUserId() {
  if (crypto.randomUUID) return `user-${crypto.randomUUID()}`;
  return `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initials(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("") || "?";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
