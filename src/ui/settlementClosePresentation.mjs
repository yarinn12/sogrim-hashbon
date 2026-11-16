import {iconSvg} from "../uiIcons.mjs";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Presentation only; totals arrive already calculated and formatted by the caller.

export function renderSettlementCloseConfirmationView({eventId, pendingCount, formattedTotal, navigationHtml = ""}) {
  const transferLabel = pendingCount === 1
    ? "העברה אחת בסך"
    : `${pendingCount} העברות בסך`;
  return `
    <section class="settlement-close-confirmation-backdrop" aria-label="אישור סגירת האירוע">
      <section class="settlement-close-confirmation" role="alertdialog" aria-modal="true"
        aria-labelledby="settlement-close-confirmation-title"
        aria-describedby="settlement-close-confirmation-summary settlement-close-confirmation-description" tabindex="-1">
        <div class="settlement-close-confirmation-heading">
          <div class="settlement-close-confirmation-copy">
            <h2 id="settlement-close-confirmation-title" tabindex="-1">לסגור את האירוע?</h2>
          </div>
          <button class="app-toast-close settlement-close-confirmation-dismiss" type="button"
            data-action="cancel-close-event-confirmation" aria-label="סגירת חלון האישור">${iconSvg("x")}</button>
        </div>
        <div class="settlement-close-confirmation-body">
          <p class="settlement-close-transfer-summary" id="settlement-close-confirmation-summary">
            <span>${escapeHtml(transferLabel)}</span>
            <bdi dir="ltr" class="font-num">${escapeHtml(formattedTotal)}</bdi>
          </p>
          <p id="settlement-close-confirmation-description">ההוצאות יינעלו לעריכה ותוכלו לסמן תשלומים שבוצעו. יישלח עדכון למשתתפים באפליקציה.</p>
        </div>
        <div class="settlement-close-confirmation-actions">
          <button class="secondary-button" type="button" data-action="cancel-close-event-confirmation">ביטול</button>
          <button class="primary-button" type="button" data-action="confirm-close-event" data-allow-offline-mutation="true"
            data-event-id="${escapeHtml(eventId)}">סגור אירוע</button>
        </div>
      </section>
      ${navigationHtml}
    </section>
  `;
}
