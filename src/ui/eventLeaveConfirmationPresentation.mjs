const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

// Presentation only. The app owns membership, original confirmations,
// financial history, durable writes, acknowledgement and rollback.
export function renderEventLeaveConfirmationView({eventName,hasMoneyHistory,processing=false}={}) {
  const explanation = hasMoneyHistory
    ? "הגישה שלך לאירוע תוסר. השם שלך וההוצאות וההעברות הרשומות עליו יישארו באירוע. לחזרה תידרש הזמנה חדשה."
    : "הגישה שלך לאירוע תוסר. לחזרה תידרש הזמנה חדשה.";
  return `
    <section class="important-action-dialog-backdrop" aria-label="אישור עזיבת האירוע">
      <section class="important-action-dialog event-leave-confirmation" role="alertdialog" aria-modal="true"
        aria-labelledby="important-action-title event-leave-name" aria-describedby="important-action-description"
        data-important-action-kind="leave-event" tabindex="-1">
        <div class="important-action-copy">
          <h2 id="important-action-title">לעזוב את האירוע?</h2>
          <p id="event-leave-name">${escapeHtml(eventName)}</p>
          <p id="important-action-description">${escapeHtml(explanation)}</p>
        </div>
        <div class="important-action-dialog-actions">
          <button class="primary-button" type="button" data-action="cancel-important-action">ביטול</button>
          <button class="important-action-confirm-button" type="button" data-action="confirm-important-action" ${processing ? "disabled" : ""}>עזוב את האירוע</button>
        </div>
      </section>
    </section>
  `;
}
