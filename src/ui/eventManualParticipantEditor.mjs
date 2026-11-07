// Presentation only. Participant creation, selection and persistence remain in the app.
export const manualParticipantCopy = Object.freeze({
  title: "הוספת משתתף לפי שם",
  explanation: "מוסיפים אדם שלא משתמש באפליקציה, ומנהלים את ההוצאות בשמו."
});

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function renderEventManualParticipantEditorView({ value = "" } = {}) {
  return `
    <section class="new-event-participant-editor new-event-offline-add" aria-labelledby="new-event-manual-title">
      <div class="inline-actions">
        <label class="manual-name-label" id="new-event-manual-title" for="manual-participant-name">שם המשתתף</label>
        <input id="manual-participant-name" class="guest-input" data-action="new-event-guest-name" name="guestName" autocomplete="off" enterkeyhint="done" aria-label="שם המשתתף" placeholder="שם מלא" value="${escapeHtml(value)}" />
        <button class="secondary-button" type="button" data-action="new-event-add-guest">הוסף משתתף</button>
      </div>
    </section>
  `;
}

// Existing-event actions and validation stay in app.mjs. This view only renders the form.
export function renderExistingEventManualParticipantEditorView({ eventId = "", value = "", canEdit = false } = {}) {
    return `
      <section class="new-event-participant-editor new-event-offline-add">
        <p class="event-manual-explanation">${escapeHtml(manualParticipantCopy.explanation)}</p>
        <div class="event-participant-offline-form">
          <label for="event-offline-participant-name">שם המשתתף</label>
          <input id="event-offline-participant-name" class="guest-input" data-action="event-guest-name" name="eventGuestName" autocomplete="off" enterkeyhint="done" aria-label="שם המשתתף" placeholder="שם מלא" value="${escapeHtml(value)}" ${!canEdit ? "disabled" : ""} />
        </div>
        <button class="primary-button" data-action="event-add-guest" data-event-id="${escapeHtml(eventId)}" ${!canEdit ? "disabled" : ""}>הוסף לאירוע</button>
      </section>
    `;
}
