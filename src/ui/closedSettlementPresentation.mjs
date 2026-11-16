import {iconSvg} from "../uiIcons.mjs";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// The adapter supplies the canonical outgoing message. This view never calculates debts.
export function renderClosedSettlementShareActionsView({eventId, hasPendingTransfers, formattedSummary}) {
  const lines = formattedSummary.split("\n");
  const pendingLines = lines.filter(line => line.startsWith("• "));
  const previewLines = pendingLines.length ? pendingLines : [lines.at(-1)];
  const messageLines = previewLines.map(line => {
    const currencyStart = line.lastIndexOf("\u2066");
    const hasTerminalCurrency = currencyStart >= 0 && line.endsWith("\u2069");
    const text = hasTerminalCurrency
      ? escapeHtml(line.slice(0, currencyStart)) + `<span class="settlement-share-currency">${escapeHtml(line.slice(currencyStart))}</span>`
      : escapeHtml(line);
    return `<p class="settlement-share-message-line">${text}</p>`;
  }).join("");
  return `
    <details class="settlement-debt-share">
      <summary>
        <span class="settlement-debt-share-icon" aria-hidden="true">${iconSvg("share")}</span>
        <span>${hasPendingTransfers ? "שתף חובות" : "שתף סיכום"}</span>
      </summary>
      <div class="settlement-debt-share-options">
        <button class="secondary-button whatsapp-button" data-action="share-whatsapp" data-event-id="${escapeHtml(eventId)}">שלח בוואטסאפ</button>
        <button class="secondary-button" data-action="copy-settlement" data-event-id="${escapeHtml(eventId)}">${hasPendingTransfers ? "העתק חובות" : "העתק סיכום"}</button>
        <button class="secondary-button" data-action="copy-event-report" data-event-id="${escapeHtml(eventId)}">העתק פירוט הוצאות</button>
      </div>
    </details>
    <details class="settlement-debt-preview">
      <summary>
        <span>${hasPendingTransfers ? "הצג חובות" : "הצג סיכום"}</span>
        <span class="settlement-debt-preview-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </summary>
      <div class="settlement-share-message" role="region" aria-label="החובות לשיתוף">${messageLines}</div>
    </details>
  `;
}

// Amounts, permissions and trusted description markup come from the existing adapter.
export function renderClosedSettlementHeroView({
  eventId, stateClass, balanced, title, descriptionHtml, formattedTotal, totalLabel,
  groupTotal, featured, actionsHtml, canManage
}) {
  const reopen = canManage
    ? `<button class="secondary-button settlement-reopen-action" data-action="reopen-event" data-event-id="${escapeHtml(eventId)}">פתח אירוע מחדש</button>` : "";
  if (featured) return `
    <section data-settlement-phase="existing" data-settlement-closed="true" class="panel settlement-hero is-pending is-personal-pending is-explained">
      <div class="settlement-featured-action">
        <span class="status-chip is-ok">האירוע נסגר</span>
        <p class="settlement-featured-route">${escapeHtml(featured.title)}<span class="settlement-featured-counterparty">${escapeHtml(featured.counterparty)}</span></p>
        <strong class="settlement-featured-amount amount"><span class="font-num">${escapeHtml(featured.formattedAmount)}</span></strong>
        <button class="primary-button settlement-featured-complete" data-action="mark-paid" data-transfer-id="${escapeHtml(featured.transferId)}">${escapeHtml(featured.completionLabel)}</button>
      </div>
      <div class="settlement-hero-actions settlement-featured-actions">${actionsHtml}${reopen}</div>
    </section>
  `;
  return `
    <section data-settlement-phase="existing" data-settlement-closed="true" class="panel settlement-hero ${escapeHtml(stateClass)}  ${balanced ? "is-balanced" : ""}">
      <div class="settlement-hero-main">
        <span class="status-chip is-ok">האירוע נסגר</span>
        <div class="settlement-hero-title-row">
          <div>
            <h2>${escapeHtml(title)}</h2>
            ${descriptionHtml ? `<p class="muted">${descriptionHtml}</p>` : ""}
          </div>
          ${formattedTotal ? `
            <div class="settlement-hero-total${groupTotal ? " is-group-total" : ""}">
              <span>${escapeHtml(totalLabel)}</span>
              <strong class="settlement-hero-amount amount"><span class="font-num">${escapeHtml(formattedTotal)}</span></strong>
            </div>
          ` : ""}
        </div>
      </div>
      <div class="settlement-hero-actions">${actionsHtml}${reopen}</div>
    </section>
  `;
}


// Ephemeral DOM state only: never persist disclosures across a different event or debt summary.
export function captureClosedSettlementDisclosureState(root) {
  const screen = root.querySelector(".settlement-screen[data-event-id]");
  const message = screen?.querySelector(".settlement-share-message");
  if (!message) return null;
  return {
    eventId: screen.dataset.eventId,
    summary: message.textContent,
    shareOpen: Boolean(screen.querySelector(".settlement-debt-share")?.open),
    previewOpen: Boolean(screen.querySelector(".settlement-debt-preview")?.open)
  };
}

export function restoreClosedSettlementDisclosureState(root, snapshot) {
  const current = captureClosedSettlementDisclosureState(root);
  if (!snapshot || !current || current.eventId !== snapshot.eventId || current.summary !== snapshot.summary) return false;
  const screen = root.querySelector(".settlement-screen[data-event-id]");
  for (const [selector, open] of [[".settlement-debt-share", snapshot.shareOpen], [".settlement-debt-preview", snapshot.previewOpen]]) {
    const details = screen.querySelector(selector);
    if (details) details.open = Boolean(open);
  }
  return true;
}
