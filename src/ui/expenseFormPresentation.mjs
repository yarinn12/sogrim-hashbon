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

// Presentation only: permission and save errors come from the existing controller.
export function renderExpenseNotesView({name, notes, attachmentImage, error, eventId, canEdit}) {
  return `
      <section class="panel expense-modal expense-step-modal expense-notes-modal" data-expense-step="notes" role="dialog" aria-modal="true" aria-labelledby="expense-notes-title" tabindex="-1">
        <div class="expense-modal-header expense-modal-step-header">
          <div>
            <p class="eyebrow" title="${escapeHtml(name)}">${escapeHtml(name)}</p>
            <h2 id="expense-notes-title">הערות ותמונה</h2>
          </div>
          <div class="expense-modal-header-actions">
            <button class="accessibility-entry-button accessibility-entry-header expense-accessibility-button" data-open-accessibility type="button" aria-label="פתיחת הגדרות נגישות" title="נגישות"><span aria-hidden="true">${iconSvg("accessibility")}</span></button>
            <button class="icon-button modal-section-back-button" data-action="cancel-expense" aria-label="חזרה לאירוע" title="חזרה לאירוע"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>
          </div>
        </div>
        <fieldset class="expense-flow-fields" ${!canEdit ? "disabled" : ""}>
          <div class="expense-flow-body expense-notes-body">
          <label class="field">
            <span>הערה <small>(לא חובה)</small></span>
            <textarea data-action="expense-notes" rows="5" maxlength="500" placeholder="לדוגמה: כתובת, פרטי הזמנה או מידע שחשוב לזכור">${escapeHtml(notes ?? "")}</textarea>
          </label>
          <div class="expense-attachment-control">
            <span class="expense-notes-image-label">תמונה <small>(לא חובה)</small></span>
            <button class="secondary-button expense-attachment-upload" type="button" data-action="select-expense-attachment" aria-label="פתיחת הגלריה">
              <span aria-hidden="true">${iconSvg("receipt")}</span>
              <span>${attachmentImage ? "החלף מהגלריה" : "הוסף מהגלריה"}</span>
            </button>
            <input data-action="expense-attachment-image" type="file" accept="image/*" hidden />
            <button class="secondary-button expense-attachment-upload" type="button" data-action="capture-expense-attachment" aria-label="פתיחת המצלמה">
              <span aria-hidden="true">${iconSvg("camera")}</span>
              <span>מצלמה</span>
            </button>
            <input data-action="expense-attachment-image" data-image-source="camera-fallback" type="file" accept="image/*" capture="environment" hidden />
            ${attachmentImage ? `
              <img class="expense-attachment-preview" src="${escapeHtml(attachmentImage)}" alt="תמונה מצורפת להוצאה" />
              <button class="secondary-button" type="button" data-action="remove-expense-attachment">הסר תמונה</button>
            ` : ""}
          </div>
          ${error ? `<p class="error" id="expense-form-error" role="alert" tabindex="-1">${escapeHtml(error)}</p>` : ""}
          </div>
        </fieldset>
        <div class="actions expense-modal-actions is-next expense-notes-actions">
          <button class="primary-button expense-step-next" type="button" data-action="save-expense" data-event-id="${escapeHtml(eventId)}" ${!canEdit ? "disabled" : ""}>שמור שינויים</button>
        </div>
      </section>`;
}
