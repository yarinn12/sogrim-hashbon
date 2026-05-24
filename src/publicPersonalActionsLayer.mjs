import { loadState } from "./data/localStore.mjs";
import { calculateSettlement } from "./domain/settlement.mjs";
import { formatMoney } from "./domain/money.mjs";

const STYLE_ID = "public-personal-actions-layer-style";

let enhancementScheduled = false;

installPersonalActionsLayer();

function installPersonalActionsLayer() {
  injectStyles();
  document.addEventListener("click", handlePersonalActionClick, true);
  new MutationObserver(scheduleEnhancement).observe(document.body, {
    childList: true,
    subtree: true
  });
  scheduleEnhancement();
}

function scheduleEnhancement() {
  if (enhancementScheduled) return;
  enhancementScheduled = true;

  requestAnimationFrame(() => {
    enhancementScheduled = false;
    enhanceHomeActions();
    enhanceInviteSharing();
  });
}

function enhanceHomeActions() {
  const screen = document.querySelector("#app .screen");
  if (!screen) return;

  screen.querySelector(".search-panel")?.remove();
  if (screen.querySelector(".public-personal-actions, .personal-actions-section")) return;

  const eventSection = screen.querySelector(".event-list")?.closest(".section");
  if (!eventSection) return;

  const actions = collectPersonalActions(loadState());
  const section = document.createElement("section");
  section.className = "section public-personal-actions";
  section.innerHTML = `
    <div class="section-title-row">
      <div>
        <h2>מה עכשיו?</h2>
        <p class="muted">העברות פתוחות שקשורות אליך.</p>
      </div>
    </div>
    <div class="public-personal-action-list">
      ${
        actions.length
          ? actions.slice(0, 4).map(renderActionCard).join("")
          : `<div class="empty-state">אין כרגע העברות פתוחות שקשורות אליך</div>`
      }
    </div>
  `;

  eventSection.before(section);
}

function collectPersonalActions(state) {
  const currentParticipantId = state.currentParticipantId;
  if (!currentParticipantId) return [];

  return (state.events ?? [])
    .filter((event) => event.participantIds?.includes(currentParticipantId))
    .flatMap((event) => {
      const participants = (state.participants ?? []).filter((participant) =>
        event.participantIds?.includes(participant.id)
      );
      const calculated = calculateSettlement(participants, event.expenses ?? []);
      const transfers = event.transfers?.length ? event.transfers : calculated.transfers;

      return transfers
        .filter(
          (transfer) =>
            transfer.status !== "paid" &&
            (transfer.fromParticipantId === currentParticipantId ||
              transfer.toParticipantId === currentParticipantId)
        )
        .map((transfer) => ({
          event,
          transfer,
          direction: transfer.fromParticipantId === currentParticipantId ? "pay" : "receive",
          otherParticipantId:
            transfer.fromParticipantId === currentParticipantId
              ? transfer.toParticipantId
              : transfer.fromParticipantId
        }));
    })
    .sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === "pay" ? -1 : 1;
      return b.transfer.amount - a.transfer.amount;
    });
}

function renderActionCard(action) {
  const title =
    action.direction === "pay"
      ? `להעביר ל${participantName(action.otherParticipantId)}`
      : `${participantName(action.otherParticipantId)} אמור להעביר אליך`;
  const helper =
    action.direction === "pay"
      ? `מתוך האירוע "${action.event.name}"`
      : "אפשר לפתוח סיכום ולסמן כששולם";

  return `
    <button class="public-personal-action-card ${action.direction === "pay" ? "is-debt" : "is-credit"}" data-action="settle" data-event-id="${escapeAttribute(action.event.id)}">
      <span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(helper)}</small>
      </span>
      <span class="amount">₪${formatMoney(action.transfer.amount)}</span>
    </button>
  `;
}

function enhanceInviteSharing() {
  document.querySelectorAll('[data-action="copy-invite"][data-event-id]').forEach((copyButton) => {
    const row = copyButton.closest(".invite-link-row");
    if (!row || row.querySelector("[data-public-share-invite]")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary-button whatsapp-button";
    button.dataset.publicShareInvite = "true";
    button.dataset.eventId = copyButton.dataset.eventId;
    button.textContent = "שלח בוואטסאפ";
    copyButton.after(button);
  });
}

function handlePersonalActionClick(event) {
  const button = event.target.closest("[data-public-share-invite]");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  const row = button.closest(".invite-link-row");
  const inviteUrl = row?.querySelector("input")?.value?.trim();
  if (!inviteUrl) return;

  const eventName =
    loadState().events?.find((item) => item.id === button.dataset.eventId)?.name ?? "האירוע";
  const message = `מצטרפים לאירוע "${eventName}" בסוגרים חשבון:\n${inviteUrl}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

function participantName(participantId) {
  return loadState().participants?.find((participant) => participant.id === participantId)?.displayName ?? "משתתף";
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .public-personal-action-list {
      display: grid;
      gap: 10px;
    }

    .public-personal-action-card {
      width: 100%;
      min-height: 74px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      padding: 15px;
      border: 1px solid rgba(18, 29, 27, 0.08);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(250,252,250,.9));
      box-shadow: var(--shadow-panel, var(--shadow));
      color: var(--text);
      text-align: start;
    }

    .public-personal-action-card.is-debt {
      border-inline-start: 4px solid var(--warm);
    }

    .public-personal-action-card.is-credit {
      border-inline-start: 4px solid var(--accent);
    }

    .public-personal-action-card span:first-child {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .public-personal-action-card small {
      color: var(--muted);
      font-weight: 700;
    }

    .invite-link-row {
      grid-template-columns: minmax(0, 1fr) auto auto;
    }

    @media (max-width: 440px) {
      .public-personal-action-card,
      .invite-link-row {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.append(style);
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
