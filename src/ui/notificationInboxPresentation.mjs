import { iconSvg } from "../uiIcons.mjs";
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
const escapeAttribute = escapeHtml;
// Presentation only: read acknowledgements, ownership, refresh and destinations remain in app.mjs.
export function renderNotificationInboxView({items: visibleItems = [], unread = 0, status = "idle", available = false, error = "", backHtml = "", noticeHtml = "", loadingHtml = ""} = {}) {
  const accountPending = status !== "loading"
    && !error
    && !available;
  const content = status === "loading"
    ? loadingHtml
    : error
      ? `
        <section class="notification-inbox-empty" role="status">
          <span class="notification-inbox-empty-icon is-error" aria-hidden="true">${iconSvg("x")}</span>
          <h2>לא הצלחנו לטעון את ההתראות</h2>
          <p>אפשר לנסות שוב. האירועים וההוצאות שלך נשארו שמורים.</p>
          <button class="secondary-button" type="button" data-action="retry-notifications">נסה שוב</button>
        </section>
      `
      : !available
        ? `
          <section class="notification-inbox-empty is-account-pending">
            <div class="notification-account-pending-heading">
              <span class="notification-inbox-empty-icon" aria-hidden="true">${iconSvg("bell")}</span>
              <h2>ההתראות מחכות בחשבון שלך</h2>
            </div>
            <button class="primary-button" type="button" data-action="edit-profile">לפרופיל</button>
          </section>
        `
        : visibleItems.length
          ? `
            <div class="notification-inbox-list" role="list">
              ${visibleItems.map(renderNotificationInboxItem).join("")}
            </div>
          `
          : `
            <section class="notification-inbox-empty">
              <span class="notification-inbox-empty-icon" aria-hidden="true">${iconSvg("bell")}</span>
              <h2>אין התראות כרגע</h2>
              <p>עדכונים מהאירועים ובקשות חברות יופיעו כאן.</p>
            </section>
          `;

  return `
    <section class="screen font-hebrew notification-inbox-screen" data-screen-kind="notifications">
      <header class="top notification-inbox-header">
        ${backHtml}
        <div class="brand">
          <h1>התראות</h1>
          <p class="muted">עדכונים מהאירועים ומהחברים</p>
        </div>

      </header>
      ${noticeHtml}
      ${visibleItems.length ? `<div class="notification-inbox-toolbar"><button class="notification-mark-all" type="button" data-action="mark-all-notifications-read" ${unread ? "" : "disabled"}>סמן הכול כנקרא</button></div>` : ""}
      <section class="panel notification-inbox-panel ${accountPending ? "is-account-pending" : ""}" aria-live="polite">
        ${content}
      </section>
    </section>
  `;
}

function renderNotificationInboxItem(item) {
  const title = item.kind === "friend-request" ? "בקשת חברות מ" + item.title.replace(/ שלח לך בקשת חברות$/, "") : item.title;
  const icon = item.kind === "friend-request"
    ? "user-plus"
    : item.kind === "expense-created"
    ? "receipt"
    : item.kind === "participant-joined"
      ? "user-plus"
      : item.kind === "event-invite"
        ? "log-in"
        : item.kind === "payment-reminder" ? "bell" : "check";
  return `
    <div class="notification-inbox-list-entry" role="listitem"><button
      class="notification-inbox-item ${item.readAt ? "is-read" : "is-unread"}"
      type="button"
      data-action="open-notification"
      data-notification-id="${escapeAttribute(item.id)}"
      data-event-id="${escapeAttribute(item.eventId)}"
      data-notification-view="${item.view === "friends" ? "friends" : item.view === "summary" ? "summary" : "event"}"
    >
      <span class="notification-inbox-item-icon" aria-hidden="true">${iconSvg(icon)}</span>
      <span class="notification-inbox-item-copy">
        <span class="notification-inbox-item-heading">
          <strong>${escapeHtml(title)}</strong>
        </span>
        <small>${escapeHtml(item.body)}</small>
        <time datetime="${escapeAttribute(item.createdAt)}">${escapeHtml(item.timeLabel)}</time>
      </span>
      ${item.readAt ? "" : '<span class="notification-unread-dot" role="img" aria-label="לא נקרא"></span>'}
    </button></div>
  `;
}

