import { iconSvg } from "../uiIcons.mjs";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Trusted avatar/username markup comes from the existing source renderers.
// Membership, permissions, selection state and persistence remain in app.mjs.
export function renderEventFriendsPickerView({
  eventId = "", connected = [], offline = [], selectedParticipantId = "",
  canEdit = false, addInProgress = false, emptyKind = "none"
} = {}) {
  if (!connected.length && !offline.length) {
    const allIncluded = emptyKind === "all-included";
    return `
      <section class="new-event-participant-editor event-participant-empty-friends-panel" role="status">
        <header><h2>${allIncluded ? "כל החברים כבר באירוע" : "עוד אין חברים"}</h2><p>${allIncluded ? "אפשר להזמין משתתפים נוספים בקישור או ב־QR." : "אפשר להוסיף חברים לרשימה ואז לחזור לאירוע."}</p></header>
        <button class="primary-button" type="button" data-action="${allIncluded ? "event-participant-add-view-back" : "open-friends-from-event-add"}">${allIncluded ? "לדרכי ההזמנה" : "למסך החברים"}</button>
      </section>
    `;
  }
  const selectedParticipant = [...connected, ...offline].find(person => person.id === selectedParticipantId);
  const renderRow = (person) => {
    const selected = person.id === selectedParticipant?.id;
    return `<button class="event-participant-candidate-row event-friend-choice-row${selected ? " is-selected" : ""}" type="button" data-action="select-event-participant-candidate" data-event-id="${escapeHtml(eventId)}" data-participant-id="${escapeHtml(person.id)}" aria-pressed="${selected}" aria-label="${escapeHtml((selected ? "בטל בחירה של " : "בחר את ") + person.displayName)}" ${canEdit ? "" : "disabled"}>
      <span class="event-participant-person">${person.avatarHtml ?? ""}<span class="event-participant-person-copy"><strong>${escapeHtml(person.displayName)}</strong>${person.usernameHtml ?? ""}</span></span>
      <span class="event-participant-selection-check" aria-hidden="true">${iconSvg("check")}</span>
    </button>`;
  };
  const renderGroup = (items, title, hint = "") => items.length
    ? `<section class="event-friend-choice-group" aria-label="${escapeHtml(title)}"><header><strong>${escapeHtml(title)}</strong>${hint ? `<p>${escapeHtml(hint)}</p>` : ""}</header>${items.map(renderRow).join("")}</section>`
    : "";
  return `
    <section class="new-event-participant-editor new-event-participant-picker">
      <p class="event-friend-picker-hint">בוחרים אדם ומאשרים את ההוספה.</p>
      <div class="event-participant-candidate-list">
        ${renderGroup(connected, "חברים באפליקציה")}
        ${renderGroup(offline, "שמות ידניים", "אנשים ללא חשבון באפליקציה.")}
      </div>
      <div class="event-participant-add-confirmation" aria-live="polite">
        <p ${selectedParticipant ? "" : "hidden"}>נבחר: <strong>${selectedParticipant ? escapeHtml(selectedParticipant.displayName) : ""}</strong></p>
        <button class="primary-button" type="button" data-action="confirm-event-participant-add" data-event-id="${escapeHtml(eventId)}" ${selectedParticipant && canEdit && !addInProgress ? "" : "disabled"} ${addInProgress ? 'aria-busy="true"' : ""}>${addInProgress ? "מוסיף…" : "הוסף לאירוע"}</button>
      </div>
    </section>
  `;
}
