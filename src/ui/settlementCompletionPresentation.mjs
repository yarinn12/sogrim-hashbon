import {iconSvg} from "../uiIcons.mjs";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Presentation only. The caller owns the all-paid guard and payment actions.
export function renderSettlementCompletionView({eventId, isClosed}) {
  return `
    <section class="settlement-celebration-backdrop" aria-label="כל התשלומים סומנו כשולמו">
      <section
        class="settlement-celebration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settlement-celebration-title"
        aria-describedby="settlement-celebration-description"
        data-event-id="${escapeHtml(eventId)}"
        tabindex="-1"
      >
        <span class="settlement-celebration-mark" aria-hidden="true">${iconSvg("check")}</span>
        <h2 id="settlement-celebration-title">הכול שולם</h2>
        <p id="settlement-celebration-description">כל התשלומים באירוע סומנו כשולמו.</p>
        <div class="settlement-celebration-actions">
          <button
            class="primary-button"
            type="button"
            data-action="archive-settled-event"
            data-event-id="${escapeHtml(eventId)}"
          >${isClosed ? "חזרה לאירועים" : "סגור חשבון"}</button>
          <button
            class="secondary-button"
            type="button"
            data-action="dismiss-settlement-celebration"
          >הישאר בסיכום</button>
        </div>
      </section>
    </section>
  `;
}
