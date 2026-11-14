import {iconSvg} from "../uiIcons.mjs";
const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

// Presentation only: the app supplies the existing mode and permission facts.
// Rounding calculations, payment marks and persistence remain in their owners.
export function renderEventRoundingView({eventId,eventName,rounded,canManage}, {renderEventDialogShell}) {
  return renderEventDialogShell({
    eventId,
    eyebrow: "",
    title: "עיגול סכומים",
    description: eventName,
    modalClass: "event-task-modal event-rounding-screen",
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
    body: `
      <fieldset class="event-management-field event-rounding-field event-settings-management-field">
        <legend>לעגל את ההחזרים?</legend>
        <div class="event-management-options" role="radiogroup" aria-label="עיגול סכומי ההעברות">
          ${[
            {
              id: "rounded",
              enabled: true,
              title: "סכומים נוחים",
              description: "מעגלים את ההחזרים לסכומים שלמים ומאזנים את ההפרש."
            },
            {
              id: "exact",
              enabled: false,
              title: "דיוק מלא",
              description: "משאירים כל העברה מדויקת, ללא עיגול."
            }
          ]
            .map((option, index) => {
              const selected = rounded === option.enabled;
              return `
                <button
                  type="button"
                  class="event-management-option ${selected ? "is-active" : ""}"
                  data-action="set-event-rounding-mode"
                  data-event-id="${escapeHtml(eventId)}"
                  data-rounding-mode="${option.id}"
                  role="radio"
                  aria-checked="${selected}"
                  tabindex="${selected || (!rounded && index === 1) ? "0" : "-1"}"
                  ${!canManage ? "disabled" : ""}
                >
                  <span class="event-management-copy">
                    <strong>${option.title}</strong>
                    <small>${option.description}</small>
                  </span>
                  <span class="event-management-check app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </fieldset>
      <p class="event-rounding-note">סכומי ההוצאות נשארים בדיוק כפי שהוזנו.</p>
      ${!canManage ? '<p class="event-setting-note">רק מנהלי האירוע יכולים לשנות את עיגול הסכומים.</p>' : ""}
    `
  });
}
