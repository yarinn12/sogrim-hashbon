const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

// Presentation only. The original app owns permissions, close/reopen,
// transfer preparation, activity records, canonical ACK and rollback.
export function renderEventEditingView({eventId,eventName,locked,canManage}, {renderEventDialogShell}) {
  return renderEventDialogShell({
    eventId,
    eyebrow: "",
    title: "עריכת האירוע",
    description: eventName,
    modalClass: "event-task-modal event-lock-screen",
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
    body: `
      <section class="event-lock-status" aria-labelledby="event-lock-state-title">
        <h3 id="event-lock-state-title">${locked ? "האירוע נעול לעריכה" : "האירוע פתוח לעריכה"}</h3>
        <p id="event-lock-state-description">${locked ? "לא ניתן לשנות הוצאות או משתתפים. אפשר לפתוח שוב לעריכה בכל זמן." : "נעילה מונעת שינויים בהוצאות ובמשתתפים. אפשר לפתוח שוב לעריכה בכל זמן."}</p>
      </section>
      ${!canManage ? `<p class="event-lock-permission" id="event-lock-permission">רק מנהלי האירוע יכולים לנעול או לפתוח עריכה.</p>` : ""}
      <div class="event-setting-primary-action">
        <button class="${locked ? "primary-button" : "secondary-button"}" data-action="toggle-lock" data-event-id="${escapeHtml(eventId)}" aria-describedby="event-lock-state-description${!canManage ? " event-lock-permission" : ""}" ${!canManage ? "disabled" : ""}>${locked ? "פתח שוב לעריכה" : "נעל את האירוע"}</button>
      </div>
    `
  });
}
