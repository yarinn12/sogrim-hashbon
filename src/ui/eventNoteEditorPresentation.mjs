import {iconSvg} from "../uiIcons.mjs";
const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const escapeAttribute = escapeHtml;

// Presentation only. Permission, draft, ACK and rollback decisions remain in the adapter.
export function renderEventNoteEditorView({eventId,eventName,noteId,title,isNew,canEdit,locked,pendingDeletion,saving,error,titleDraft,bodyDraft,pinned,storedPinned,maxTitleLength,maxBodyLength}, {renderEventDialogShell}) {
  const noteTitle = titleDraft ?? "";
  const noteBody = bodyDraft ?? "";
  const body = canEdit ? `
    <p class="event-note-sharing-help">${isNew ? "אחרי השמירה הפתק יופיע לכל משתתפי האירוע." : "השינויים יופיעו אצל כולם אחרי השמירה."}</p>
    <form class="event-note-editor" data-event-id="${escapeAttribute(eventId)}" data-note-id="${escapeAttribute(noteId ?? "")}">
      <label class="field event-note-title-field"><span>כותרת</span><input data-action="event-note-title" type="text" name="eventNoteTitle" maxlength="${maxTitleLength}" value="${escapeAttribute(noteTitle)}" placeholder="למשל פרטי הלינה" ${pendingDeletion ? "readonly" : ""} /></label>
      <label class="field event-note-body-field"><span>תוכן הפתק</span><textarea data-action="event-note-body" name="eventNoteBody" maxlength="${maxBodyLength}" rows="7" placeholder="מה חשוב שהמשתתפים ידעו?" ${pendingDeletion ? "readonly" : ""}>${escapeHtml(noteBody)}</textarea></label>
      <button class="event-note-pin-toggle${pinned ? " is-active" : ""}" type="button" data-action="toggle-event-note-pin" aria-pressed="${pinned ? "true" : "false"}" ${pendingDeletion ? "disabled" : ""}><span class="event-note-pin-check" aria-hidden="true">${iconSvg("check")}</span><span>להצמיד לראש הרשימה</span></button>
      ${error ? `<p class="field-error" id="event-note-error" role="alert">${escapeHtml(error)}</p>` : ""}
      <div class="event-note-editor-actions"><button class="primary-button" type="submit" data-action="save-event-note" data-event-id="${escapeAttribute(eventId)}" ${saving || pendingDeletion ? "disabled" : ""}>${saving ? "שומרים…" : isNew ? "צור פתק" : "שמור שינויים"}</button>${isNew ? "" : `<button class="secondary-button event-note-delete" type="button" data-action="request-delete-event-note" data-event-id="${escapeAttribute(eventId)}" data-note-id="${escapeAttribute(noteId)}">${iconSvg("trash")}<span>${pendingDeletion ? "נסה שוב למחוק" : "מחק פתק"}</span></button>`}</div>
    </form>
  ` : `<p class="event-note-sharing-help">${locked ? "האירוע סגור. הפתק זמין לקריאה." : "אין לך הרשאה לערוך את הפתק. אפשר לקרוא את התוכן."}</p><section class="event-note-readonly-content"><h3>${escapeHtml(noteTitle || "פתק ללא כותרת")}</h3><p>${escapeHtml(noteBody)}</p>${storedPinned ? '<small>פתק מוצמד</small>' : ""}</section>`;
  return renderEventDialogShell({eventId:eventId,eyebrow:"",title,description:eventName,body,modalClass:"event-task-modal event-note-modal event-note-screen",backAction:"close-event-dialog",backLabel:"חזרה לפתקים",backdropClass:"event-settings-route-backdrop",routeMode:true,settingsMode:true,showClose:false});
}
