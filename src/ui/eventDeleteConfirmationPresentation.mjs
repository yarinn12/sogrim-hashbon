const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

// Presentation only; permissions, deletion, durable acknowledgement and rollback remain in the app.
export function renderEventDeleteConfirmationView({eventName,processing=false}={}) {
  const explanation = "האירוע וכל ההוצאות וההעברות שבו יימחקו לצמיתות לכל המשתתפים. אי אפשר לשחזר אותו.";
  return `
    <section class="important-action-dialog-backdrop" aria-label="אישור מחיקת האירוע">
      <section class="important-action-dialog event-delete-confirmation" role="alertdialog" aria-modal="true"
        aria-labelledby="important-action-title event-delete-name" aria-describedby="important-action-description"
        data-important-action-kind="delete-event" tabindex="-1">
        <div class="important-action-copy">
          <h2 id="important-action-title">למחוק את האירוע?</h2>
          <p id="event-delete-name">${escapeHtml(eventName)}</p>
          <p id="important-action-description">${escapeHtml(explanation)}</p>
        </div>
        <div class="important-action-dialog-actions">
          <button class="primary-button" type="button" data-action="cancel-important-action">ביטול</button>
          <button class="important-action-confirm-button" type="button" data-action="confirm-important-action" ${processing ? "disabled" : ""}>מחק לכולם</button>
        </div>
      </section>
    </section>
  `;
}
