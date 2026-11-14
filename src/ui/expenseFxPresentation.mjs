export const EXPENSE_CURRENCY_REENTRY_NOTICE = "המטבע הוחלף; יש להזין מחדש את הסכום ואת סכומי המשלמים.";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Display names only. Currency selection, rates, arithmetic and persistence stay in adapters.
export function expenseFxCurrencyNames({ source, target }) {
  return {
    sourceName: source.id === "ILS" ? "שקלים" : source.label,
    targetName: target.id === "ILS" ? "שקלים" : target.label,
    sourceUnit: `${source.label} ${["GBP", "CZK", "TRY", "EGP"].includes(source.id) ? "אחת" : "אחד"}`
  };
}

export function renderExpenseFxSourceMetadataView({ kind, updatedAt, nextUpdateAt, sourceDate }) {
  if (kind === "open-access") return `<span data-fx-provider="open-access">עודכן <bdi dir="ltr">${escapeHtml(updatedAt)}</bdi></span><span>עדכון הבא <bdi dir="ltr">${escapeHtml(nextUpdateAt)}</bdi></span>`;
  if (kind === "legacy-ecb") return `ECB דרך Frankfurter v2 · תאריך שער ${escapeHtml(sourceDate || "לא ידוע")}`;
  return "שער אישי";
}

export function renderExpenseFxPreviewView(model) {
  if (!model) return "";
  const { amount, sourceName, targetName, value, message, error, automatic } = model;
  const accessible = value ? `הוצאה של ${amount} ${sourceName}. הסכום ${automatic ? "המשוער " : ""}באירוע: ${value} ${targetName}` : "";
  return `<div class="expense-fx-preview ${error ? "is-error" : ""}" role="status" aria-live="polite" ${accessible ? `aria-label="${escapeHtml(accessible)}"` : ""}>${value
    ? `<span class="expense-fx-preview-label"><bdi dir="ltr">${escapeHtml(amount)}</bdi> ${escapeHtml(sourceName)} <span aria-hidden="true">≈</span></span><strong class="expense-fx-preview-value font-num" dir="ltr">${escapeHtml(value)}</strong>`
    : `<span class="expense-fx-preview-message">${escapeHtml(message)}</span>`}</div>`;
}

export function renderExpenseFxFieldsView(model) {
  const { sourceCurrency, foreign, options, error, automatic, manual, loading, rate, names, preview, expanded, metadata, attributionUrl } = model;
  return `
    <label class="field expense-source-currency-field">
      <span>מטבע ההוצאה</span>
      <select data-action="expense-source-currency" name="expenseSourceCurrency">
        ${options.map(currency => `<option value="${escapeHtml(currency.id)}" ${sourceCurrency === currency.id ? "selected" : ""}>${escapeHtml(currency.label)} (${escapeHtml(currency.id)})</option>`).join("")}
      </select>
    </label>
    ${!foreign && error ? `<p class="notice" role="status" data-expense-fx-notice>${escapeHtml(error)}</p>` : ""}
    ${foreign ? `<section class="expense-fx-fields" aria-label="המרת מטבע">
      ${renderExpenseFxPreviewView(preview)}
      <details class="expense-fx-details" ${expanded ? "open" : ""}>
        <summary>פרטי המרה</summary>
        <div class="expense-fx-details-content">
          <p class="expense-fx-explanation">הזינו את הסכום ב<strong>${escapeHtml(names.sourceName)}</strong>. הסכום יומר ל<strong>${escapeHtml(names.targetName)}</strong> לצורך חלוקת החשבון.</p>
          <div class="expense-fx-mode" role="group" aria-label="בחירת שער המרה">
            <button type="button" class="secondary-button" data-action="expense-fx-automatic" aria-pressed="${automatic}">שער אוטומטי</button>
            <button type="button" class="secondary-button" data-action="expense-fx-manual" aria-pressed="${manual}">שער אישי</button>
          </div>
          <label class="field expense-fx-rate-field"><span>כמה ${escapeHtml(names.targetName)} שווה ${escapeHtml(names.sourceUnit)}?</span>
            <input data-action="expense-fx-rate" name="expenseFxRate" inputmode="decimal" dir="ltr" value="${escapeHtml(rate)}" ${manual ? "" : "readonly"} placeholder="לדוגמה 3.5" />
          </label>
          ${automatic ? `<p class="expense-fx-details-explanation">שער יומי להערכה. החיוב בפועל עשוי להיות שונה.</p><div class="expense-fx-source-row"><div class="muted" data-expense-fx-source>${renderExpenseFxSourceMetadataView(metadata)}</div><button type="button" class="secondary-button" data-action="expense-fx-refresh" ${loading ? "disabled" : ""}>רענן שער</button></div>` : ""}
        </div>
      </details>
      ${automatic ? `<p class="expense-fx-credit">נתוני שערים: <a href="${escapeHtml(attributionUrl)}" target="_blank" rel="noopener noreferrer" dir="ltr">ExchangeRate-API</a></p>` : ""}
    </section>` : ""}
  `;
}

// Review copy is presentation only: values and provenance come from the existing FX adapter.
export function renderExpenseFxReviewAmountView({amount,sourceName,value,targetName}) {
  return `<span class="expense-review-fx-amount"><span><bdi dir="ltr">${escapeHtml(amount)}</bdi> ${escapeHtml(sourceName)}</span><span>≈ <bdi class="font-num" dir="ltr">${escapeHtml(value)}</bdi> ${escapeHtml(targetName)}</span></span>`;
}

export function renderExpenseFxReviewDetailsView({names,rate,automatic,metadata,attributionUrl}) {
  return `<div class="expense-review-fx-info">
    <p class="expense-review-fx-confirmation">בדקו שהסכום ב${escapeHtml(names.targetName)} נכון לפני השמירה.</p>
    <details class="expense-review-fx-details">
      <summary>פרטי המרה</summary>
      <p>${escapeHtml(names.sourceUnit)} שווה <bdi dir="ltr">${escapeHtml(rate)}</bdi> ${escapeHtml(names.targetName)}.</p>
      ${automatic ? '<p>שער יומי להערכה. החיוב בפועל עשוי להיות שונה.</p>' : ''}
      <div data-expense-fx-review-source>${renderExpenseFxSourceMetadataView(metadata)}</div>
    </details>
    ${metadata.kind === "open-access" ? `<p class="expense-review-fx-credit">נתוני שערים: <a href="${escapeHtml(attributionUrl)}" target="_blank" rel="noopener noreferrer" dir="ltr">ExchangeRate-API</a></p>` : ''}
  </div>`;
}
