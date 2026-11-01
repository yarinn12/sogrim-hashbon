const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

// Presentation only. The original app owns permission checks, confirmations,
// membership/history, deletion, canonical acknowledgement and rollback.
export function renderEventDepartureView({eventId,eventName,canManage,canLeave}, {renderEventDialogShell}) {
  return renderEventDialogShell({
    eventId,
    eyebrow: "",
    title: "עזיבה ומחיקה",
    description: eventName,
    modalClass: "event-task-modal event-departure-screen",
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
    body: `
      <section class="event-departure-section" aria-labelledby="event-leave-title">
        <h3 id="event-leave-title">עזיבת האירוע</h3>
        <p id="event-leave-description">הגישה שלך לאירוע תוסר. הוצאות והעברות שכבר רשומות על שמך יישמרו. לחזרה תידרש הזמנה חדשה.</p>
        ${!canLeave ? `<p class="event-departure-permission" id="event-leave-permission">כדי לעזוב, צריך קודם למנות מנהל נוסף דרך רשימת המשתתפים.</p>` : ""}
        <button class="secondary-button event-departure-action" data-action="leave-event" data-event-id="${escapeHtml(eventId)}" aria-describedby="event-leave-description${!canLeave ? " event-leave-permission" : ""}" ${!canLeave ? "disabled" : ""}>עזוב את האירוע</button>
      </section>
      <section class="event-departure-section event-departure-delete" aria-labelledby="event-delete-title">
        <h3 id="event-delete-title">מחיקת האירוע לכולם</h3>
        <p id="event-delete-description">האירוע וכל ההוצאות וההעברות שבו יימחקו אצל כל המשתתפים. לא ניתן לשחזר.</p>
        ${!canManage ? `<p class="event-departure-permission" id="event-delete-permission">רק מנהלי האירוע יכולים למחוק אותו.</p>` : ""}
        <button class="secondary-button event-departure-action" data-action="delete-event" data-event-id="${escapeHtml(eventId)}" aria-describedby="event-delete-description${!canManage ? " event-delete-permission" : ""}" ${!canManage ? "disabled" : ""}>מחק את האירוע לכולם</button>
      </section>
    `
  });
}
