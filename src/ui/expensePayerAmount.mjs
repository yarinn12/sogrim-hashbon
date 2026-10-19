function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Presentation only: existing adapters own currency, balancing and input updates.
export function renderExpensePayerAmountView({ index, amount, currency, currencyLabel }) {
  return `<label class="field payer-amount-field"><span>כמה שילם <span class="font-num" dir="ltr">${escapeHtml(currencyLabel)}</span></span><input data-action="expense-payer-amount" data-index="${index}" name="expensePayerAmount-${index}" autocomplete="off" inputmode="decimal" enterkeyhint="next" dir="ltr" aria-label="סכום ששילם משלם ${index + 1} ב־${escapeHtml(currency)}" value="${escapeHtml(amount)}" placeholder="כמה שילם" /></label>`;
}
