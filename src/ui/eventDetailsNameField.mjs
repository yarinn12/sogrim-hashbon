// Pure presentation. Draft updates, default names and currency selection stay in the app.
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function renderEventDetailsNameFieldView({ name = "", placeholder = "" } = {}) {
  return `
    <label class="field">
      <span id="new-event-name-label">שם האירוע (לא חובה)</span>
      <input data-action="new-event-name" name="eventName" autocomplete="off" enterkeyhint="next" aria-labelledby="new-event-name-label" aria-describedby="new-event-name-hint" value="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder)}" />
      <small id="new-event-name-hint" class="new-event-name-hint">אפשר להשאיר ריק ולקבל שם אוטומטי.</small>
    </label>
  `;
}
