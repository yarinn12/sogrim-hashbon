import { iconSvg } from "../uiIcons.mjs";

// Presentation receives a read-only view model. It neither reads account state
// nor performs storage, network, permission or settlement operations.
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function renderEventHeaderActionsView({ eventId, participantCount }) {
  const shareLabel = participantCount === 1 ? "הזמנת חברים" : "שיתוף";
  const shareAccessibleLabel = participantCount === 1
    ? "הזמנת חברים לאירוע" : "שיתוף והצטרפות לאירוע";
  return `
    <div class="hero-actions event-header-actions">
      <button class="secondary-button event-header-utility-button" data-action="open-event-participants" data-event-id="${escapeHtml(eventId)}" aria-label="משתתפים באירוע" title="משתתפים באירוע"><span class="event-header-action-label">משתתפים</span></button>
      <button class="secondary-button event-header-utility-button" data-action="open-event-participant-add" data-event-id="${escapeHtml(eventId)}" aria-label="${shareAccessibleLabel}" title="${shareAccessibleLabel}"><span class="button-action-icon" aria-hidden="true">${iconSvg("share")}</span><span class="event-header-action-label">${shareLabel}</span></button>
      <button class="secondary-button event-settings-button event-header-utility-button" data-action="open-event-settings" data-event-id="${escapeHtml(eventId)}" aria-label="הגדרות האירוע" title="הגדרות האירוע"><span class="event-settings-label event-header-action-label">הגדרות</span></button>
    </div>
  `;
}

export function renderEventHeaderMetaView({ currencyLabel, participantsLabel }) {
  return `<p class="muted event-header-meta">${escapeHtml(currencyLabel)} · ${participantsLabel}</p>`;
}

export function renderEventHeaderView(model, { showActions = true, showMeta = true } = {}) {
  return `
    <header class="top event-overview-header">
      ${model.backButtonHtml}
      <div class="brand">
        <p class="eyebrow">אירוע</p>
        <h1>${escapeHtml(model.name)}</h1>
        ${showMeta ? renderEventHeaderMetaView(model) : ""}
      </div>
      ${showActions ? renderEventHeaderActionsView(model) : ""}
    </header>
  `;
}
