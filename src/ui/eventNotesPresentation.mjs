import {iconSvg} from "../uiIcons.mjs";

const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

// Presentation only. The adapter retains note sorting, permissions and synchronization.
export function renderEventNotesView({eventId, canEdit, locked, hasNotes}, {
  renderHeader, renderNotice, renderWorkspaceNav, renderSections, renderDialog,
  escapeAttribute = escapeHtml
}) {
  return `
    <section class="screen font-hebrew event-notes-screen" data-screen-kind="event-notes" data-event-id="${escapeAttribute(eventId)}">
      ${renderHeader()}
      ${renderNotice()}
      ${renderWorkspaceNav()}
      <p class="muted" data-inline-sync-status data-sync-event-id="${escapeAttribute(eventId)}" role="status" aria-live="polite" hidden></p>
      <div class="event-notes-heading">
        <div class="event-notes-heading-copy"><h2 id="event-notes-title">פתקים</h2><p>${canEdit ? "מידע משותף לכל משתתפי האירוע." : locked ? "האירוע סגור. הפתקים זמינים לקריאה." : "הפתקים זמינים לקריאה בלבד."}</p></div>
        <button class="primary-button event-notes-entry-action" type="button" data-action="new-event-note" data-event-id="${escapeAttribute(eventId)}" ${canEdit ? "" : "disabled"}><span aria-hidden="true">${iconSvg("edit")}</span><span>פתק חדש</span></button>
      </div>
      <section class="event-notes-content" aria-labelledby="event-notes-title">
        ${hasNotes ? renderSections() : '<div class="event-notes-empty"><h3>עוד אין פתקים באירוע</h3><p>אפשר לשמור כאן כתובות, פרטי הזמנה ומידע לקבוצה.</p></div>'}
      </section>
      ${renderDialog()}
    </section>
  `;
}

export function renderEventNoteRowView({eventId, noteId, title, body, pinned, updatedBy, updatedLabel}) {
  const text = String(body ?? "").trim();
  const previewChars = Array.from(text);
  const preview = previewChars.slice(0, 90).join("") + (previewChars.length > 90 ? "…" : "");
  return `
    <article class="event-note-row${pinned === true ? " is-pinned" : ""}" data-event-id="${escapeHtml(eventId)}" data-note-id="${escapeHtml(noteId)}">
      <button class="event-note-open" type="button" data-action="open-event-note" data-event-id="${escapeHtml(eventId)}" data-note-id="${escapeHtml(noteId)}" aria-label="פתיחת הפתק ${escapeHtml(title)}">
        <span class="event-note-copy"><span class="event-note-title-line"><strong>${escapeHtml(title)}</strong></span>${text ? `<span class="event-note-preview">${escapeHtml(preview)}</span>` : ""}<small class="event-note-meta">עודכן על ידי ${escapeHtml(updatedBy)} · ${escapeHtml(updatedLabel)}</small></span>
        <span class="event-note-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </button>
    </article>
  `;
}
