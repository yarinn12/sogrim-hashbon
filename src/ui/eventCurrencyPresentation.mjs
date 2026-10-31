const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

// Presentation only: the adapter supplies the original currency and restrictions.
export function renderEventCurrencyView({
  eventId, eventName, currency, canManage, hasExistingExpenses, hasConvertedExpenses
}, {renderEventDialogShell, renderCurrencyOptions}) {
  return renderEventDialogShell({
    eventId,
    eyebrow: "",
    title: "מטבע האירוע",
    description: eventName,
    modalClass: "event-task-modal event-currency-screen",
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
    body: `
      <label class="field event-currency-field">
        <span>באיזה מטבע מתחשבנים?</span>
        <select data-action="event-currency" name="eventCurrency" data-event-id="${escapeHtml(eventId)}" data-choice-search-placeholder="מטבע או מדינה" ${!canManage || hasConvertedExpenses ? "disabled" : ""}>
          ${renderCurrencyOptions(currency)}
        </select>
        <small>${!canManage
          ? "רק מנהלי האירוע יכולים לשנות את המטבע."
          : hasConvertedExpenses
            ? "יש באירוע הוצאה שהומרה ממטבע אחר. כדי לשמור על הסכומים והחובות, אי אפשר לשנות את מטבע האירוע."
            : hasExistingExpenses
              ? "הסכומים הקיימים לא יומרו. נבקש אישור לפני השינוי."
              : "זה המטבע שבו יוצגו ההוצאות וההחזרים באירוע."
        }</small>
      </label>
    `
  });
}
