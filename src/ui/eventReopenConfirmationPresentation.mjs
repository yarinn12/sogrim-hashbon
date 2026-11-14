import {iconSvg} from "../uiIcons.mjs";
const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

// Presentation only. Existing payment status rules,permissions,save acknowledgement and rollback stay in the app.
export function renderEventReopenConfirmationView({eventName,paidCount,paymentMode="keep",processing=false}={}) {
  return `
    <section class="important-action-dialog-backdrop" aria-label="אישור פתיחת האירוע מחדש">
      <section class="important-action-dialog event-reopen-confirmation" role="alertdialog" aria-modal="true"
        aria-labelledby="important-action-title event-reopen-confirmation-name" aria-describedby="important-action-description"
        data-important-action-kind="reopen-event" tabindex="-1">
        <div class="important-action-copy">
          <h2 id="important-action-title">לפתוח את האירוע מחדש?</h2>
          <p id="event-reopen-confirmation-name">${escapeHtml(eventName)}</p>
          <p id="important-action-description">אפשר יהיה שוב להוסיף ולערוך הוצאות.</p>
          ${paidCount > 0 ? renderEventReopenPaymentOptionsView({paymentMode}) : ""}
        </div>
        <div class="important-action-dialog-actions">
          <button class="primary-button" type="button" data-action="cancel-important-action">ביטול</button>
          <button class="important-action-confirm-button" type="button" data-action="confirm-important-action" ${processing ? "disabled" : ""}>פתח מחדש</button>
        </div>
      </section>
    </section>
  `;
}

export function renderEventReopenPaymentOptionsView({paymentMode="keep"}={}) {
  const selectedMode = paymentMode === "reset" ? "reset" : "keep";
  return `
    <fieldset class="reopen-payment-options">
      <legend>מה לעשות עם סימוני התשלום?</legend>
      <button class="reopen-payment-option ${selectedMode === "keep" ? "is-selected" : ""}" type="button" data-action="select-reopen-payment-mode" data-payment-mode="keep" aria-pressed="${selectedMode === "keep"}">
        <span class="reopen-payment-copy"><strong>לשמור סימוני תשלום</strong><small>רק היתרה שנותרה תחושב מחדש.</small></span>
        <span class="reopen-payment-check" aria-hidden="true">${iconSvg("check")}</span>
      </button>
      <button class="reopen-payment-option is-destructive ${selectedMode === "reset" ? "is-selected" : ""}" type="button" data-action="select-reopen-payment-mode" data-payment-mode="reset" aria-pressed="${selectedMode === "reset"}">
        <span class="reopen-payment-copy"><strong>לאפס סימוני תשלום</strong><small>כל ההחזרים יחושבו מחדש כאילו לא שולמו.</small></span>
        <span class="reopen-payment-check" aria-hidden="true">${iconSvg("check")}</span>
      </button>
    </fieldset>
  `;
}
