import { iconSvg } from "../uiIcons.mjs";

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Read-only display models: calculation, authorization and persistence remain
// in the existing adapters. Both native platforms and the web use this markup.
export function renderEventActionDockView({ eventId, totalText, canEdit, isClosed = false }) {
  return `
    <aside class="event-action-dock" aria-label="פעולות באירוע">
      <div class="event-action-total">
        <span>סה״כ הוצאות</span>
        <strong class="amount"><span class="font-num">${escapeHtml(totalText)}</span></strong>
        <span class="event-action-sync-wrap">
          <small class="event-action-sync" data-inline-sync-status data-sync-event-id="${escapeHtml(eventId)}" hidden></small>
          <button type="button" class="event-action-sync-retry" data-inline-sync-retry data-sync-retry hidden>נסה שוב</button>
        </span>
      </div>
      <button class="primary-button" data-action="show-expense-form" data-event-id="${escapeHtml(eventId)}" ${!canEdit ? "disabled" : ""}>
        <span class="command-card-icon" aria-hidden="true">${iconSvg("receipt")}</span>
        <span>${canEdit ? "הוסף הוצאה" : isClosed ? "האירוע סגור" : "קריאה בלבד"}</span>
      </button>
    </aside>
  `;
}

export function renderEventPersonalBalanceView({ eventId, direction, amountText, counterpartLabel }) {
  const label = direction === "credit" ? "צריכים להחזיר לך"
    : direction === "debt" ? "עליך להעביר" : "אתה מאוזן";
  const detail = direction === "credit" ? "לפי ההוצאות עד עכשיו" : counterpartLabel;
  return `
    <button type="button" class="event-personal-balance is-${escapeHtml(direction)}"
      data-action="settle" data-event-id="${escapeHtml(eventId)}"
      aria-label="${escapeHtml(`${label}: ${amountText}. ${detail}. פתיחת הסיכום`)}">
      <span class="event-personal-balance-copy">
        <small>המצב שלך</small>
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(detail)}</span>
      </span>
      <span class="event-personal-balance-value">
        <span class="event-personal-balance-summary">לסיכום <span class="inline-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span></span>
        <strong class="amount"><span class="font-num">${escapeHtml(amountText)}</span></strong>
      </span>
    </button>
  `;
}
