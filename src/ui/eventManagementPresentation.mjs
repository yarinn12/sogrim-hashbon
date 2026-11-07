import {iconSvg} from "../uiIcons.mjs";
const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

// Presentation only. The app supplies the existing mode, identity projection and
// disabled guard; this view never changes permissions, saves or acknowledges data.
export function renderEventManagementView({
  eventId, eventName, adminNames, adminCount, selectedMode, modeIds,
  disabled, canManage, locked
}, {renderEventDialogShell}) {
  const options = [
    {id: modeIds.centralized, title: "ניהול מרוכז", description: "רק מנהלי האירוע מוסיפים ומעדכנים הוצאות. כולם יכולים לצפות."},
    {id: modeIds.collaborative, title: "ניהול משותף", description: "כל המשתתפים יכולים להוסיף ולעדכן הוצאות."}
  ];
  return renderEventDialogShell({
    eventId,
    eyebrow: "",
    title: "אופן ניהול",
    description: eventName,
    modalClass: "event-task-modal event-management-screen",
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
    body: `
      <fieldset class="event-management-field event-settings-management-field">
        <legend>מי יעדכן את ההוצאות?</legend>
        <div class="event-management-options" role="radiogroup" aria-label="מי יעדכן את ההוצאות">
          ${options.map((option, index) => `
            <button
              type="button"
              class="event-management-option ${selectedMode === option.id ? "is-active" : ""}"
              data-action="set-event-management-mode"
              data-management-mode="${escapeHtml(option.id)}"
              data-event-id="${escapeHtml(eventId)}"
              role="radio"
              aria-checked="${selectedMode === option.id}"
              tabindex="${selectedMode === option.id || (!selectedMode && index === 0) ? "0" : "-1"}"
              ${disabled ? "disabled" : ""}
            >
              <span class="event-management-copy">
                <strong>${option.title}</strong>
                <small>${option.description}</small>
              </span>
              <span class="event-management-check app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
            </button>
          `).join("")}
        </div>
      </fieldset>
      <p class="event-management-admins"><span>${adminCount > 1 ? "מנהלי האירוע:" : "מנהל האירוע:"}</span> ${escapeHtml(adminNames)}</p>
      ${locked
        ? '<p class="event-setting-note">האירוע נעול. צריך לפתוח עריכה לפני שמשנים את אופן הניהול.</p>'
        : !canManage ? '<p class="event-setting-note">רק מנהלי האירוע יכולים לשנות את אופן הניהול.</p>' : ""}
    `
  });
}
