// Presentation only. The app supplies existing permission and settlement labels.
const escapeAttribute = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
export function renderEventSettingsOverviewView({
  eventId, eventName, coverImage, canManage, managementStatus, currencyStatus,
  repaymentStatus, roundingStatus, lockStatus
}, { renderEventDialogShell, renderEventSettingsMenuItem }) {
  return renderEventDialogShell({
    eventId,
    eyebrow: "",
    title: "הגדרות האירוע",
    description: eventName,
    modalClass: "event-task-modal event-settings-modal settings-overview-screen",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    backAction: "close-event-dialog",
    backLabel: "חזרה לאירוע",
    showClose: false,
    body: `
      <section class="event-cover-settings" aria-labelledby="event-cover-settings-title">
        <div class="event-cover-settings-copy">
          <strong id="event-cover-settings-title">תמונת האירוע</strong>
          <small>${!canManage ? "שינוי תמונה דורש הרשאת ניהול." : coverImage ? "אפשר להחליף או להסיר." : "לא חובה"}</small>
        </div>
        ${coverImage ? `<img src="${escapeAttribute(coverImage)}" alt="" />` : ""}
        <div class="event-cover-settings-actions event-cover-source-grid">
          <label class="secondary-button event-cover-upload" role="button" tabindex="${canManage ? "0" : "-1"}" aria-disabled="${!canManage}">
            <span>מהגלריה</span>
            <input data-action="event-cover-image" data-event-id="${escapeAttribute(eventId)}" type="file" accept="image/*" hidden ${!canManage ? "disabled" : ""} />
          </label>
          <label class="secondary-button event-cover-upload" role="button" tabindex="${canManage ? "0" : "-1"}" aria-disabled="${!canManage}">
            <span>מצלמה</span>
            <input data-action="event-cover-image" data-event-id="${escapeAttribute(eventId)}" type="file" accept="image/*" capture="environment" hidden ${!canManage ? "disabled" : ""} />
          </label>
          ${coverImage && canManage ? `<button class="secondary-button" type="button" data-action="remove-event-cover" data-event-id="${escapeAttribute(eventId)}">הסר</button>` : ""}
        </div>
      </section>
      <div class="event-settings-menu">
        ${renderEventSettingsMenuItem({
          eventId,
          section: "management",
          title: "אופן ניהול",
          description: managementStatus
        })}
        ${renderEventSettingsMenuItem({
          eventId,
          section: "currency",
          title: "מטבע האירוע",
          description: currencyStatus
        })}
        ${renderEventSettingsMenuItem({
          eventId,
          section: "repayment",
          title: "חלוקת ההחזרים",
          description: repaymentStatus
        })}
        ${renderEventSettingsMenuItem({
          eventId,
          section: "rounding",
          title: "עיגול סכומים",
          description: roundingStatus
        })}
        ${renderEventSettingsMenuItem({
          eventId,
          section: "activity",
          title: "פעילות באירוע",
          description: "מי הוסיף, עדכן וסימן תשלום"
        })}
        ${renderEventSettingsMenuItem({
          eventId,
          section: "lock",
          title: "עריכת האירוע",
          description: lockStatus
        })}
        ${renderEventSettingsMenuItem({
          eventId,
          section: "danger",
          title: "עזיבה ומחיקה",
          description: "אישור נדרש לפני ביצוע",
          danger: true
        })}
      </div>
    `
  });
}

// Delegate once through the existing app key handler. Use the original input so
// Native camera/gallery selection and disabled permission guards stay intact.
export function handleEventSettingsPhotoKeydown(event) {
  if (event.defaultPrevented || !["Enter", " "].includes(event.key)) return false;
  const label = event.target.closest?.('.settings-overview-screen .event-cover-upload[role="button"]');
  if (!label) return false;
  event.preventDefault();
  const input = label.querySelector('input[type="file"]');
  if (input && !input.disabled) input.click();
  return true;
}
