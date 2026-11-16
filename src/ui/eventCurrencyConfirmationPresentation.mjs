const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

// Presentation only. Existing currency guards,amounts,payload,save acknowledgement and rollback stay in the app.
export function renderEventCurrencyConfirmationView({eventName,currencyLabel,currencyCode,processing=false}={}) {
  const explanation = `המטבע ישתנה ל${currencyLabel} (${currencyCode}). סכומי ההוצאות הקיימות לא יומרו לפי שער חליפין. השינוי ישפיע רק על האירוע הזה.`;
  return `
    <section class="important-action-dialog-backdrop" aria-label="אישור שינוי מטבע האירוע">
      <section class="important-action-dialog event-currency-confirmation" role="alertdialog" aria-modal="true"
        aria-labelledby="important-action-title event-currency-confirmation-name" aria-describedby="important-action-description"
        data-important-action-kind="change-event-currency" tabindex="-1">
        <div class="important-action-copy">
          <h2 id="important-action-title">לשנות את מטבע האירוע?</h2>
          <p id="event-currency-confirmation-name">${escapeHtml(eventName)}</p>
          <p id="important-action-description">${escapeHtml(explanation)}</p>
        </div>
        <div class="important-action-dialog-actions">
          <button class="primary-button" type="button" data-action="cancel-important-action">ביטול</button>
          <button class="important-action-confirm-button" type="button" data-action="confirm-important-action" ${processing ? "disabled" : ""}>שנה מטבע</button>
        </div>
      </section>
    </section>
  `;
}
