import { iconSvg } from "../uiIcons.mjs";

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Presentation only. The existing row owns its toggle state and shared identities.
export function renderExpenseTitleView({ name }) {
  return `<strong><span class="expense-row-title-text">${escapeHtml(name)}</span><span class="expense-row-expand-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></strong>`;
}

export function renderExpenseParticipantsHeadingView({ expenseId }) {
  return `<p class="expense-participants-list-title" id="expense-participants-title-${escapeHtml(expenseId)}">מתחלקים בהוצאה</p>`;
}


export function renderExpenseParticipantShareView({ formattedShare }) {
  if (typeof formattedShare !== "string" || !formattedShare) return "";
  return `<span class="expense-participant-share"><bdi dir="ltr" class="font-num">${escapeHtml(formattedShare)}</bdi></span>`;
}
