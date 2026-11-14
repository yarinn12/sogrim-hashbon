const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

// Presentation only. Activity validation, ordering and identity/date resolution
// remain with the app's existing owners; this view never changes event data.
export function renderEventActivityView({eventId,eventName,entries},{renderEventDialogShell}) {
  return renderEventDialogShell({
    eventId,
    eyebrow: "",
    title: "פעילות באירוע",
    description: eventName,
    modalClass: "event-task-modal event-activity-screen",
    backAction: "event-settings-back",
    backdropClass: "event-settings-route-backdrop",
    routeMode: true,
    settingsMode: true,
    showClose: false,
    body: `
      <section class="event-activity-panel" aria-labelledby="event-activity-heading">
        <h3 id="event-activity-heading" class="visually-hidden">היסטוריית הפעילות</h3>
        ${entries.length ? `<ol class="event-activity-list">${entries.map(renderEventActivityEntryView).join("")}</ol>` : `<p class="event-activity-empty">עוד אין פעילות שנשמרה באירוע.</p>`}
      </section>
    `
  });
}

export function renderEventActivityEntryView(entry) {
  return `
    <li class="event-activity-item" data-activity-kind="${escapeHtml(entry.kind)}">
      <span class="event-activity-marker" aria-hidden="true"></span>
      <span class="event-activity-copy">
        <strong>${escapeHtml(entry.title)}</strong>
        ${entry.detail ? `<span>${escapeHtml(entry.detail)}</span>` : ""}
        <small>
          <span class="event-activity-actor">${escapeHtml(entry.actorName)}</span>
          <time datetime="${escapeHtml(entry.occurredAt)}">
            ${escapeHtml(entry.dateLabel)}
            <span aria-hidden="true"> · </span>
            <span class="font-num" dir="ltr">${escapeHtml(entry.timeLabel)}</span>
          </time>
        </small>
      </span>
    </li>
  `;
}
