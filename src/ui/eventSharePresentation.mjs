import {iconSvg} from "../uiIcons.mjs";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
const escapeAttribute = escapeHtml;

// Presentation only; the app supplies its existing verified-link state.
export function renderEventShareLinkView({
  eventId = "", inviteUrl = "", shareReady = false, shareFailed = false,
  shareDelayed = false, shareUnavailableLabel = "הקישור לא זמין",
  shareFailureMessage = "", shareCanRetry = false
} = {}) {
  return `
      <div class="event-share-route" data-event-share-view="link">
      <section class="event-share-open" aria-label="שיתוף קישור האירוע">
        <div id="event-share-preparation" class="event-share-link-status ${shareReady ? "is-ready" : shareFailed ? "is-error" : "is-loading"}" role="status">
          ${shareReady ? "" : `<span aria-hidden="true">${iconSvg("share")}</span>`}
          <span>
            <strong>${shareReady ? "שולחים את הקישור או מציגים QR למי שרוצים לצרף." : shareFailed ? escapeHtml(shareUnavailableLabel) : shareDelayed ? "עדיין מכינים את הקישור" : "מכינים את הקישור"}</strong>
            ${shareReady ? "" : `<small>${shareFailed ? escapeHtml(shareFailureMessage) : shareDelayed ? "החיבור איטי מהרגיל, אבל ההכנה ממשיכה ותתעדכן כאן אוטומטית." : "עוד רגע אפשר יהיה לשתף."}</small>`}
          </span>
        </div>
        <div class="invite-link-row">
          <label class="event-invite-link-field" aria-label="קישור ההזמנה">
            <input type="hidden" name="eventInviteUrl" data-share-ready="${shareReady}" value="${shareReady ? escapeAttribute(inviteUrl) : ""}" />
          </label>
          <div class="event-invite-link-actions">
            <button class="primary-button whatsapp-button" data-action="share-invite-whatsapp" data-event-id="${escapeAttribute(eventId)}" aria-describedby="event-share-preparation" ${shareReady ? "" : shareFailed ? 'disabled aria-disabled="true"' : 'disabled aria-disabled="true" aria-busy="true"'}>שתף קישור</button>
            <button class="secondary-button" data-action="copy-invite" data-copy-rest-label="העתק קישור" data-open-link="true" data-event-id="${escapeAttribute(eventId)}" aria-describedby="event-share-preparation" ${shareReady ? "" : 'disabled aria-disabled="true"'}>העתק קישור</button>
          </div>
        </div>
        ${shareCanRetry ? `<button class="secondary-button event-invite-retry-button" type="button" data-action="retry-event-share" data-event-id="${escapeAttribute(eventId)}">נסה שוב</button>` : ""}
      </section>
      </div>
  `;
}

// Only the exact redundant preparation success is omitted; errors/sync notices stay visible.
export function shouldSuppressReadyShareNotice({ notice = "", isLinkView = false, preparationStatus = "" } = {}) {
  return isLinkView && preparationStatus === "verified" && notice === "קישור ההצטרפות מוכן לשיתוף.";
}

// qrSvg is trusted markup from the unchanged QR generator in the parent layer.
export function renderEventShareQrView({ qrSvg = "" } = {}) {
    return `
      <summary class="public-invite-qr-summary">
        <strong>הצג QR להצטרפות</strong>
        <span class="public-invite-qr-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </summary>
      <div class="public-invite-qr-body">
        <div class="public-invite-qr-code" aria-hidden="true">
          ${qrSvg}
        </div>
        <p class="public-invite-qr-instruction">סריקה במצלמת הטלפון פותחת את ההזמנה.</p>
      </div>
    `;
}
