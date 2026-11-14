// Presentation only. The app retains participant selection, creation and sharing actions.
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function renderEventParticipantRouteView({ action, title, hint = "", className = "",
  pressed = false, view = "", disabled = false, ariaLabel = "", iconMarkup = "", chevronMarkup = "" }) {
  return `
    <button
      class="new-event-participant-route-action ${escapeHtml(className)} ${pressed ? "is-active" : ""}"
      type="button"
      data-action="${escapeHtml(action)}"
      ${view ? `data-participant-view="${escapeHtml(view)}"` : ""}
      ${ariaLabel ? `aria-label="${escapeHtml(ariaLabel)}"` : ""}
      ${disabled ? "disabled" : ""}
    >
      <span class="new-event-participant-route-icon" aria-hidden="true">${iconMarkup}</span>
      <span class="participant-route-copy"><strong>${escapeHtml(title)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</span>
      <span class="participant-route-chevron" aria-hidden="true">${chevronMarkup}</span>
      ${pressed ? '<span class="new-event-participant-route-state">נבחר</span>' : ""}
    </button>
  `;
}
