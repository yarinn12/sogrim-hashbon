import { iconSvg } from "../uiIcons.mjs";

// The adapter chooses the state and formats time. Only adapter-generated HTML
// belongs in backButtonHtml/noticeHtml; notification content is always escaped.
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

export function renderNotificationInboxView(model) {
  const accountPending = model.state === "account-pending";
  const content = model.state === "loading"
    ? renderNotificationInboxLoadingView()
    : model.state === "error"
      ? `
        <section class="notification-inbox-empty" role="status">
          <span class="notification-inbox-empty-icon is-error" aria-hidden="true">${iconSvg("x")}</span>
          <h2>לא הצלחנו לטעון את ההתראות</h2>
          <p>אפשר לנסות שוב. האירועים וההוצאות שלך נשארו שמורים.</p>
          <button class="secondary-button" type="button" data-action="retry-notifications">נסה שוב</button>
        </section>
      `
      : model.state === "account-pending"
        ? `
          <section class="notification-inbox-empty is-account-pending">
            <div class="notification-account-pending-heading">
              <span class="notification-inbox-empty-icon" aria-hidden="true">${iconSvg("bell")}</span>
              <h2>ההתראות מחכות בחשבון שלך</h2>
            </div>
            <button class="primary-button" type="button" data-action="edit-profile">לפרופיל</button>
          </section>
        `
        : model.state === "items"
          ? `
            <div class="notification-inbox-list" role="list">
              ${model.items.map(renderNotificationInboxItemView).join("")}
            </div>
          `
          : `
            <section class="notification-inbox-empty">
              <span class="notification-inbox-empty-icon" aria-hidden="true">${iconSvg("check")}</span>
              <h2>הכול מעודכן</h2>
              <p>הוצאות חדשות, הצטרפויות ותזכורות יופיעו כאן.</p>
            </section>
          `;

  return `
    <section class="screen font-hebrew notification-inbox-screen" data-screen-kind="notifications">
      <header class="top notification-inbox-header">
        ${model.backButtonHtml}
        <div class="brand">
          <h1>התראות</h1>
          <p class="muted">כל מה שהתעדכן באירועים שמשותפים איתך.</p>
        </div>
        ${
          model.hasUnread
            ? `<button class="notification-mark-all" type="button" data-action="mark-all-notifications-read">סמן הכול כנקרא</button>`
            : ""
        }
      </header>
      ${model.noticeHtml}
      <section class="panel notification-inbox-panel ${accountPending ? "is-account-pending" : ""}" aria-live="polite">
        ${content}
      </section>
    </section>
  `;
}

export function renderNotificationInboxItemView(item) {
  const icon = item.kind === "friend-request"
    ? "user-plus"
    : item.kind === "expense-created"
    ? "receipt"
    : item.kind === "participant-joined"
      ? "user-plus"
      : item.kind === "event-invite"
        ? "log-in"
        : "check";
  return `
    <button
      class="notification-inbox-item ${item.readAt ? "is-read" : "is-unread"}"
      type="button"
      role="listitem"
      data-action="open-notification"
      data-notification-id="${escapeAttribute(item.id)}"
      data-event-id="${escapeAttribute(item.eventId)}"
      data-notification-view="${item.view === "friends" ? "friends" : item.view === "summary" ? "summary" : "event"}"
    >
      <span class="notification-inbox-item-icon" aria-hidden="true">${iconSvg(icon)}</span>
      <span class="notification-inbox-item-copy">
        <span class="notification-inbox-item-heading">
          <strong>${escapeHtml(item.title)}</strong>
          <time datetime="${escapeAttribute(item.createdAt)}">${escapeHtml(item.timeLabel)}</time>
        </span>
        <small>${escapeHtml(item.body)}</small>
      </span>
      ${item.readAt ? "" : '<span class="notification-unread-dot" aria-label="לא נקרא"></span>'}
    </button>
  `;
}

export function renderNotificationInboxLoadingView() {
  return `
    <div class="notification-inbox-skeleton" aria-label="טוען התראות">
      ${Array.from({ length: 3 }, () => `
        <span class="notification-inbox-skeleton-row" aria-hidden="true">
          <i></i><b></b><small></small>
        </span>
      `).join("")}
    </div>
  `;
}
