import { iconSvg } from "../uiIcons.mjs";

function escapeText(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);
}

// Presentation only. Eligibility, permissions, drafts and writes stay in the app adapter.
export function renderExpenseParticipantAddRouteView({ eventId = "", view = "menu", canEdit = false, blockedMessage = "", invitationMessage = "", progressHtml = "", bodyHtml = "", navHtml = "" } = {}) {
  const title = view === "friends"
    ? "בחר מחברים"
    : view === "offline"
      ? "הוספה לפי שם"
      : "הוספת משתתף";
  const description = view === "friends"
    ? "בחירה תוסיף את החבר לאירוע ולהוצאה."
    : view === "offline"
      ? "מוסיפים אדם שלא משתמש באפליקציה, ומנהלים את ההוצאות בשמו."
      : "מצרפים משתתף לאירוע ולהוצאה.";

  return `
    <section class="expense-modal-backdrop expense-route-backdrop expense-step-route-backdrop" aria-label="הוספת משתתף להוצאה">
      <section
        class="panel expense-modal expense-step-modal expense-participant-add-route"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-participant-add-title"
        aria-describedby="expense-participant-add-description"
        data-event-id="${escapeText(eventId)}"
        data-expense-step="participants"
        data-expense-participant-add-view="${view}"
        tabindex="-1"
      >
        <div class="expense-modal-header expense-modal-step-header">
          <div>
            <p class="eyebrow">הוספת הוצאה · משתתפים</p>
            <h2 id="expense-participant-add-title">${escapeText(title)}</h2>
            <p class="muted" id="expense-participant-add-description">${escapeText(description)}</p>
          </div>
          <div class="expense-modal-header-actions">
            <button class="accessibility-entry-button accessibility-entry-header expense-accessibility-button" data-open-accessibility type="button" aria-label="פתיחת הגדרות נגישות" title="נגישות"><span aria-hidden="true">${iconSvg("accessibility")}</span></button>
            <button class="icon-button modal-section-back-button" data-action="expense-participant-add-back" aria-label="חזרה" title="חזרה"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>
          </div>
        </div>
        ${progressHtml}
        <p class="expense-loop-status" role="status" aria-live="polite" hidden></p>
        <p class="expense-sync-status" data-inline-sync-status data-sync-event-id="${escapeText(eventId)}" role="status" aria-live="polite" hidden></p>
        ${!canEdit ? `<p class="notice" role="status">${escapeText(blockedMessage)}</p>` : ""}
        <fieldset class="expense-flow-fields" ${!canEdit ? "disabled" : ""}>
          <div class="expense-flow-body expense-participant-add-route-body">
            ${bodyHtml}
            ${invitationMessage ? `<p class="expense-participant-invite-message" role="status">${escapeText(invitationMessage)}</p>` : ""}
          </div>
        </fieldset>
      </section>
      ${navHtml}
    </section>
  `;
}

export function renderExpenseParticipantAddMenuView({ eventId = "", hasFriends = false, friendDescription = "", canEdit = false } = {}) {
  return `
    <div class="expense-participant-add-menu" aria-label="דרכים להוספת משתתף">
      <button
        class="expense-participant-choice"
        type="button"
        data-action="expense-participant-add-view"
        data-view="friends"
        ${hasFriends && canEdit ? "" : "disabled"}
      >
        <span class="expense-participant-choice-icon" aria-hidden="true">${iconSvg("users")}</span>
        <span><strong>מהחברים שלי</strong><small>${escapeText(friendDescription)}</small></span>
        <span class="expense-participant-choice-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </button>
      <button
        class="expense-participant-choice"
        type="button"
        data-action="expense-share-invite"
        data-event-id="${escapeText(eventId)}"
        ${canEdit ? "" : "disabled"}
      >
        <span class="expense-participant-choice-icon" aria-hidden="true">${iconSvg("share")}</span>
        <span><strong>שלח קישור לאירוע</strong><small>מצטרפים לאירוע דרך הקישור.</small></span>
        <span class="expense-participant-choice-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </button>
      <button
        class="expense-participant-choice"
        type="button"
        data-action="expense-participant-add-view"
        data-view="offline"
        ${canEdit ? "" : "disabled"}
      >
        <span class="expense-participant-choice-icon" aria-hidden="true">${iconSvg("edit")}</span>
        <span><strong>הוספה לפי שם</strong><small>למי שלא משתמש באפליקציה.</small></span>
        <span class="expense-participant-choice-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </button>
    </div>
  `;
}

export function renderExpenseParticipantFriendListView({ eventId = "", friends = [], friendDescription = "", canEdit = false } = {}) {
  if (!friends.length) {
    return `<p class="expense-participant-add-empty">${escapeText(friendDescription)}</p>`;
  }

  return `
    <p class="expense-participant-context">בחירה מוסיפה את החבר לאירוע ולהוצאה.</p>
    <div class="expense-participant-friend-list">
      ${friends
        .map(
          (participant) => `
            <button
              class="expense-participant-friend-option"
              type="button"
              data-action="expense-add-friend-participant"
              data-event-id="${escapeText(eventId)}"
              data-participant-id="${escapeText(participant.id)}"
              ${canEdit ? "" : "disabled"}
            >
              ${participant.avatarHtml}
              <span>
                <strong>${escapeText(participant.name)}</strong>
                ${participant.usernameHtml}
              </span>
              <b>הוסף</b>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderExpenseParticipantOfflineFormView({ eventId = "", canEdit = false } = {}) {
  return `
    <p class="expense-participant-context">מוסיפים אדם שלא משתמש באפליקציה, ומנהלים את ההוצאות בשמו.</p>
    <div class="expense-participant-offline-form">
      <label class="field">
        <span>שם המשתתף</span>
        <input class="guest-input" data-action="event-guest-name" name="expenseGuestName" autocomplete="off" enterkeyhint="done" placeholder="שם מלא" ${canEdit ? "" : "disabled"} />
      </label>
      <button class="primary-button" data-action="event-add-guest" data-event-id="${escapeText(eventId)}" ${canEdit ? "" : "disabled"}>הוסף להוצאה</button>
    </div>
  `;
}
