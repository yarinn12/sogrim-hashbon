const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const escapeAttribute = escapeHtml;

// Display metadata only; original confirmed-action handlers perform the deletion.
export function renderEventNoteDeleteConfirmationView({noteTitle,processing=false}={}) {
 return `<section class="important-action-dialog-backdrop" aria-label="אישור מחיקת פתק"><section class="important-action-dialog event-note-delete-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="important-action-title event-note-delete-name" aria-describedby="important-action-description" data-important-action-kind="delete-event-note" tabindex="-1"><div class="important-action-copy"><h2 id="important-action-title">למחוק את הפתק?</h2><p id="event-note-delete-name">${escapeHtml(noteTitle)}</p><p id="important-action-description">הפתק יימחק לכל משתתפי האירוע. לא יהיה אפשר לשחזר אותו.</p></div><div class="important-action-dialog-actions"><button class="primary-button" type="button" data-action="cancel-important-action">ביטול</button><button class="important-action-confirm-button" type="button" data-action="confirm-important-action" ${processing ? "disabled" : ""}>מחק פתק</button></div></section></section>`;
}
