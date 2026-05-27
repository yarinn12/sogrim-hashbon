import {
  parseInviteEventId,
  parseInviteSnapshot
} from "./domain/inviteLinks.mjs";
import { loadLocalProfile, loadSharedState } from "./data/localStore.mjs";

const STYLE_ID = "public-profile-context-layer-style";

injectStyle();
enhanceProfileContext();
new MutationObserver(() => enhanceProfileContext()).observe(document.body, {
  childList: true,
  subtree: true
});

async function enhanceProfileContext() {
  enhanceProfileMemoryStatus();
  await enhanceInviteProfilePreview();
}

async function enhanceInviteProfilePreview() {
  const form = document.querySelector("[data-public-profile-form] .public-profile-form");
  if (!form || form.querySelector(".invite-profile-preview")) return;

  const invitedEvent = await getInvitedEvent();
  if (!invitedEvent) return;

  const participantCount = invitedEvent.participantIds?.length ?? 0;
  const participantLabel = participantCount
    ? `${participantCount} משתתפים באירוע`
    : "תיכנס בשם שלך ונחבר אותך לאירוע";

  form.insertAdjacentHTML(
    "afterbegin",
    `<section class="invite-profile-preview" aria-label="פרטי האירוע">
      <span>מצטרפים אל</span>
      <strong>${escapeHtml(invitedEvent.name)}</strong>
      <p>${escapeHtml(participantLabel)}</p>
    </section>`
  );
}

function enhanceProfileMemoryStatus() {
  const summary = document.querySelector(".profile-summary");
  const details = summary?.querySelector("div");
  if (!details || details.querySelector(".profile-memory-status")) return;

  details.insertAdjacentHTML(
    "beforeend",
    `<small class="profile-memory-status">${escapeHtml(profileMemoryLabel())}</small>`
  );
}

async function getInvitedEvent() {
  const snapshot = parseInviteSnapshot(window.location.href);
  if (snapshot?.event) return snapshot.event;

  const invitedEventId = parseInviteEventId(window.location.href);
  if (!invitedEventId) return null;

  const sharedState = await loadSharedState();
  return sharedState.events?.find((event) => event.id === invitedEventId) ?? null;
}

function profileMemoryLabel() {
  const profile = loadLocalProfile();
  if (profile?.authProvider === "google") {
    return "מחובר עם Google";
  }

  return "נשמר עבורך במכשיר הזה";
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .invite-profile-preview {
      display: grid;
      gap: 7px;
      margin: 0 0 16px;
      padding: 14px 16px;
      border: 1px solid rgba(8, 123, 116, 0.18);
      border-radius: 12px;
      background: linear-gradient(145deg, rgba(8, 123, 116, 0.09), rgba(255, 255, 255, 0.82));
      box-shadow: 0 16px 38px rgba(18, 32, 29, 0.08);
    }

    .invite-profile-preview span,
    .profile-memory-status {
      color: #6d7a73;
      font-size: 0.86rem;
      font-weight: 800;
    }

    .invite-profile-preview strong {
      color: #101916;
      font-size: 1.08rem;
      font-weight: 900;
    }

    .invite-profile-preview p {
      margin: 0;
      color: #66736e;
      font-size: 0.92rem;
      font-weight: 750;
    }

    .profile-memory-status {
      display: block;
      margin-top: 3px;
    }
  `;
  document.head.append(style);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
