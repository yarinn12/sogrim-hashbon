import {iconSvg} from "../uiIcons.mjs";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Presentation only. Dates remain ISO strings in the draft and persistence.
export function expenseDateCaption(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "בחירת תאריך";
}

export function expenseFormHeading({editing, step, title}) {
  return editing && step === "review" ? "עריכת הוצאה" : title;
}

export function expenseFormBackLabel({editing, historyBaseDepth, historyDepth}) {
  return editing && Number.isFinite(historyBaseDepth) && historyDepth <= historyBaseDepth + 1
    ? "חזרה לאירוע" : "חזרה לשלב הקודם";
}

export function renderExpenseDateFieldView({value, extraClass = "", label = "תאריך ההוצאה"}) {
  const date = expenseDateCaption(value);
  return `
    <div class="field expense-date-field ${escapeHtml(extraClass)}">
      <span>${escapeHtml(label)}</span>
      <span class="expense-date-control" data-date-label="${escapeHtml(label)}">
        <button type="button" class="expense-date-picker-button" data-action="expense-date-picker" aria-label="${escapeHtml(label + ": " + date)}" aria-haspopup="dialog">
          <span class="expense-date-icon" aria-hidden="true">${iconSvg("calendar")}</span>
          <bdi data-expense-date-caption dir="ltr">${escapeHtml(date)}</bdi>
        </button>
        <input class="expense-date-picker-input" data-action="expense-date" name="expenseDate" type="date" lang="he-IL" tabindex="-1" aria-label="${escapeHtml(label)}" value="${escapeHtml(value)}" />
      </span>
    </div>
  `;
}

export function openExpenseDatePicker(button) {
  const control = button.closest(".expense-date-control");
  const input = control?.querySelector('input[type="date"]');
  if (!input || input.matches(":disabled")) return;
  // showPicker consumes the trusted click. Keep the actual native date input
  // editable as a fallback for engines that cannot open it programmatically.
  if (typeof input.showPicker === "function") {
    try {
      input.focus({preventScroll: true});
      input.showPicker();
      return;
    } catch { /* Preserve the native editing path. */ }
  }
  control.classList.add("is-native-date-fallback");
  input.tabIndex = 0;
  input.focus();
  input.click();
}

export function syncExpenseDateCaption(input) {
  const control = input.closest(".expense-date-control");
  if (!control) return;
  const date = expenseDateCaption(input.value);
  control.querySelector("[data-expense-date-caption]").textContent = date;
  control.querySelector("button").setAttribute("aria-label", control.dataset.dateLabel + ": " + date);
}

export function expenseDatePickerOwnsEscape(event) {
  return event.key === "Escape" && Boolean(event.target.matches?.(".expense-date-picker-input"));
}
