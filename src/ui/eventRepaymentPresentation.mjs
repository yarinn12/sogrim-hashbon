import {iconSvg} from "../uiIcons.mjs";
const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

// Presentation only: the app supplies the existing mode and permission facts.
// Settlement calculations, payment marks and persistence remain in their owners.
export function renderEventRepaymentView({eventId,eventName,direct,canManage}, {renderEventDialogShell}) {
  return renderEventDialogShell({
    eventId,
    eyebrow: "",
    title: "חלוקת ההחזרים",
    description: eventName,
    modalClass: "event-task-modal event-repayment-screen",
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
    body: `
      <fieldset class="event-management-field event-repayment-field event-settings-management-field">
        <legend>איך מחזירים את הכסף?</legend>
        <div class="event-management-options" role="radiogroup" aria-label="אופן חישוב ההעברות">
          ${[
            {
              id: "optimized",
              enabled: false,
              title: "קיזוז חכם",
              description: "מצמצמים את מספר ההעברות. אפשר להחזיר גם למי שלא שילם עבורכם."
            },
            {
              id: "direct",
              enabled: true,
              title: "החזר לפי מי ששילם",
              description: "כל אחד מחזיר ישירות למי ששילם עבורו."
            }
          ]
            .map((option, index) => {
              const selected = direct === option.enabled;
              return `
                <button
                  type="button"
                  class="event-management-option ${selected ? "is-active" : ""}"
                  data-action="set-event-repayment-mode"
                  data-event-id="${escapeHtml(eventId)}"
                  data-repayment-mode="${option.id}"
                  role="radio"
                  aria-checked="${selected}"
                  tabindex="${selected || (!direct && index === 0) ? "0" : "-1"}"
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
      <details class="event-setting-more">
        <summary>תשלומים שכבר סומנו</summary>
        <p>סימוני תשלום שכבר בוצעו נשמרים. לא יוצגו העברות נגדיות או כפולות.</p>
      </details>
      ${!canManage ? '<p class="event-setting-note">רק מנהלי האירוע יכולים לשנות את חלוקת ההחזרים.</p>' : ""}
    `
  });
}
