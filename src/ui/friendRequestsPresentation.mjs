function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Presentation only: adapters provide filtered relationships and the existing avatar HTML.
export function renderFriendRequestsPanelView({incomingHtml = "", outgoingHtml = "", hasRequests = false} = {}) {
  return `
    <section class="friends-hub-panel friends-requests-panel" id="friends-panel-requests" role="tabpanel" aria-labelledby="friends-tab-requests">
      <div class="friends-roster">
        ${incomingHtml}
        ${outgoingHtml}
        ${hasRequests ? "" : `<div class="empty-state friends-requests-empty"><strong>אין בקשות חברות שממתינות</strong><span>כשתקבל או תשלח בקשה, היא תופיע כאן.</span></div>`}
      </div>
    </section>
  `;
}

export function renderFriendRequestSectionView({direction, title, count, rowsHtml}) {
  return `
    <section class="friend-request-section is-${escapeHtml(direction)}" data-friend-identity-section="${escapeHtml(direction)}">
      <header class="friend-identity-heading"><span><strong>${escapeHtml(title)}</strong></span><bdi>${escapeHtml(count)}</bdi></header>
      <div class="friend-list">${rowsHtml}</div>
    </section>
  `;
}

export function renderPendingFriendRowView({friendshipId, displayName, username, searchableIdentity, avatarHtml, direction, busy}) {
  return `
    <article class="friend-row friend-request-row is-connected" data-friend-name="${escapeHtml(searchableIdentity)}">
      <span class="friend-row-person">
        ${avatarHtml}
        <span class="friend-row-copy"><span class="friend-row-name"><strong>${escapeHtml(displayName)}</strong></span>${username ? `<bdi class="friend-username" dir="ltr">${escapeHtml(username)}</bdi>` : ""}</span>
      </span>
      <span class="friend-request-actions">
        ${direction === "incoming" ? `
          <button class="primary-button" data-action="accept-friend-request" data-friendship-id="${escapeHtml(friendshipId)}" type="button" ${busy ? "disabled" : ""}>אשר חברות</button>
          <button class="secondary-button" data-action="decline-friend-request" data-friendship-id="${escapeHtml(friendshipId)}" type="button" ${busy ? "disabled" : ""}>דחה</button>
        ` : `<button class="secondary-button" data-action="cancel-friend-request" data-friendship-id="${escapeHtml(friendshipId)}" type="button" ${busy ? "disabled" : ""}>בטל בקשה</button>`}
      </span>
    </article>
  `;
}
