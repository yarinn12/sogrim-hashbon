import { formatMoney, parseMoneyInput } from "./domain/money.mjs";
import { filterEvents } from "./domain/eventFilters.mjs";
import { calculateSettlement } from "./domain/settlement.mjs";
import {
  formatEventReport,
  formatSettlementSummary
} from "./domain/settlementSummary.mjs";
import {
  balancePayerAmounts,
  createPayerDraft,
  markPayerAmountEdited
} from "./domain/expenseDraft.mjs";
import { validateExpense } from "./domain/validation.mjs";
import {
  buildEventInviteUrl,
  parseInviteEventId
} from "./domain/inviteLinks.mjs";
import {
  archiveGroup,
  canRemoveParticipant,
  createGroup,
  duplicateEvent,
  removeParticipant,
  removeExpense,
  setEventAdminsCanEditOnly,
  updateGroup,
  updateTransferStatus,
  updateExpense
} from "./domain/appActions.mjs";
import {
  parseStateBackup,
  serializeStateBackup
} from "./domain/stateBackup.mjs";
import {
  loadState,
  loadRuntimeConfig,
  loadSharedState,
  loadLocalProfile,
  resetSharedState,
  saveLocalProfile,
  saveSharedState
} from "./data/localStore.mjs";
import {
  ensureNamedParticipant,
  isFullProfileName,
  normalizeProfileName
} from "./domain/userProfile.mjs";
import {
  canEditEvent,
  canManageEventSettings,
  eventAdminIds
} from "./domain/permissions.mjs";

const app = document.querySelector("#app");

let localProfile = loadLocalProfile();
let profileNameDraft = localProfile?.displayName ?? "";
let profileError = "";
let state = syncLocalProfile(loadState());
let screen = { name: "home" };
let newEventDraft = null;
let expenseDraft = null;
let groupDraft = null;
let editingGroupDraft = null;
let notice = "";
let runtimeConfig = {
  publicUrl: "",
  storage: { mode: "local" },
  launch: {
    publicUrlReady: false,
    cloudStorageReady: false,
    googleAuthReady: false,
    shareLinksReady: false
  }
};
let eventSearch = "";

app.addEventListener("click", handleClick);
app.addEventListener("input", handleInput);
app.addEventListener("change", handleChange);

render();
loadSharedState().then(async (sharedState) => {
  state = syncLocalProfile(sharedState);
  if (localProfile) await saveSharedState(state);
  openInvitedEventFromUrl();
  render();
});
loadRuntimeConfig().then((config) => {
  runtimeConfig = config;
  render();
});
registerServiceWorker();

function render() {
  if (!localProfile || screen.name === "profile") {
    app.innerHTML = renderProfileSetup();
    return;
  }

  if (screen.name === "home") {
    app.innerHTML = renderHome();
    return;
  }

  if (screen.name === "new-event") {
    app.innerHTML = renderNewEvent();
    return;
  }

  if (screen.name === "groups") {
    app.innerHTML = renderGroups();
    return;
  }

  const event = getEvent(screen.eventId);
  if (!event) {
    screen = { name: "home" };
    app.innerHTML = renderHome();
    return;
  }

  if (screen.name === "event") {
    app.innerHTML = renderEvent(event);
    return;
  }

  if (screen.name === "settlement") {
    app.innerHTML = renderSettlement(event);
  }
}

function renderProfileSetup() {
  const invitedEventId = parseInviteEventId(window.location.href);
  const invitedEvent = invitedEventId ? getEvent(invitedEventId) : null;
  const title = invitedEvent ? "קיבלת קישור לאירוע" : "איך קוראים לך?";
  const helper = invitedEvent
    ? `נכניס אותך אל "${invitedEvent.name}" עם השם שתבחר. בפעם הבאה נזכור אותך במכשיר הזה.`
    : "נשמור את השם רק בדפדפן הזה, כדי שכל אחד יראה את האפליקציה בתור עצמו.";

  return `
    <section class="screen profile-setup-screen">
      <header class="top">
        <div class="brand">
          <p class="eyebrow">סוגרים חשבון</p>
          <h1>${title}</h1>
          <p class="muted">${escapeHtml(helper)}</p>
        </div>
      </header>
      ${renderNotice()}

      <section class="panel profile-setup-panel">
        <label class="field">
          <span>שם פרטי ושם משפחה</span>
          <input data-action="profile-name" value="${escapeAttribute(profileNameDraft)}" placeholder="שם פרטי ושם משפחה" autocomplete="name" autofocus />
        </label>
        ${profileError ? `<p class="field-error">${escapeHtml(profileError)}</p>` : ""}
        <button class="primary-button" data-action="save-profile">המשך</button>
      </section>
    </section>
  `;
}

function renderHome() {
  const sortedEvents = [...state.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const events = filterEvents(
    sortedEvents,
    eventSearch
  );

  return `
    <section class="screen">
      <header class="top">
        <div class="brand">
          <p class="eyebrow">סוגרים חשבון</p>
          <h1>מי שילם, מי חייב, ולמי מעבירים</h1>
          <p class="muted">שלום ${escapeHtml(participantName(state.currentParticipantId))}</p>
        </div>
      </header>
      ${renderNotice()}

      <div class="hero-actions">
        <button class="primary-button" data-action="new-event">אירוע חדש</button>
        <button class="secondary-button" data-action="groups">קבוצות</button>
      </div>

      ${renderProfileSummary()}
      ${renderBackupPanel()}

      <section class="panel search-panel">
        <label class="field compact-field">
          <span>חיפוש אירוע</span>
          <input data-action="event-search" value="${escapeAttribute(eventSearch)}" placeholder="שם אירוע" />
        </label>
      </section>

      <section class="section">
        <h2>אירועים</h2>
        <div class="event-list">
          ${
            events.length
              ? events.map(renderEventRow).join("")
              : `<div class="empty-state">אין אירועים עדיין</div>`
          }
        </div>
      </section>
    </section>
  `;
}

function renderNotice() {
  return notice ? `<p class="notice">${escapeHtml(notice)}</p>` : "";
}

function renderProfileSummary() {
  return `
    <section class="panel profile-panel">
      <div class="profile-summary">
        ${renderAvatar(state.currentParticipantId)}
        <div>
          <span>אתה נכנס בתור</span>
          <strong>${escapeHtml(participantName(state.currentParticipantId))}</strong>
        </div>
        <button class="secondary-button" data-action="edit-profile">החלף שם</button>
      </div>
    </section>
  `;
}

function renderBackupPanel() {
  return `
    <section class="panel backup-panel">
      <div class="section-title-row">
        <div>
          <h2>גיבוי ושחזור</h2>
          <p class="muted">שמירה ידנית של כל הקבוצות, האירועים וההוצאות בקובץ אחד.</p>
        </div>
        <div class="section-title-actions">
          <button class="secondary-button" data-action="export-state">ייצא גיבוי</button>
          <label class="secondary-button file-button">
            שחזר מגיבוי
            <input class="visually-hidden" type="file" data-action="import-state-file" accept="application/json" />
          </label>
        </div>
      </div>
    </section>
  `;
}

function renderGroups() {
  if (!groupDraft) {
    groupDraft = {
      name: "קבוצה חדשה",
      memberIds: [state.currentParticipantId],
      newMemberName: ""
    };
  }

  const activeGroups = state.groups.filter((group) => !group.archived);

  return `
    <section class="screen">
      <header class="top">
        <button class="icon-button" data-action="home" title="חזרה">‹</button>
        <div class="brand">
          <p class="eyebrow">קבוצות</p>
          <h1>חברים שחוזרים על עצמם</h1>
          <p class="muted">קבוצה רק חוסכת בחירת משתתפים. האירוע עצמו עדיין נפרד.</p>
        </div>
      </header>

      <section class="panel">
        <h2>קבוצה חדשה</h2>
        <label class="field">
          <span>שם הקבוצה</span>
          <input data-action="group-name" value="${escapeAttribute(groupDraft.name)}" />
        </label>

        <h3>חברי קבוצה</h3>
        ${renderParticipantChecks(groupDraft.memberIds, "group-member")}

        <div class="inline-actions section">
          <input class="guest-input" data-action="group-member-name" placeholder="שם חבר חדש" value="${escapeAttribute(groupDraft.newMemberName)}" />
          <button class="secondary-button" data-action="group-add-member">הוסף חבר</button>
        </div>

        <button class="primary-button section" data-action="create-group" ${groupDraft.memberIds.length === 0 ? "disabled" : ""}>שמור קבוצה</button>
      </section>

      ${renderEditGroupPanel()}

      <section class="section">
        <h2>קבוצות פעילות</h2>
        <div class="stack">
          ${
            activeGroups.length
              ? activeGroups.map(renderGroupRow).join("")
              : `<div class="empty-state">אין קבוצות פעילות עדיין</div>`
          }
        </div>
      </section>

      ${renderKnownParticipantsPanel()}
    </section>
  `;
}

function renderEditGroupPanel() {
  if (!editingGroupDraft) return "";

  return `
    <section class="panel section edit-group-panel">
      <div class="section-title-row">
        <div>
          <h2>עריכת קבוצה</h2>
          <p class="muted">שינוי כאן ישפיע על אירועים חדשים שתפתח מהקבוצה. אירועים קיימים נשארים כמו שהיו.</p>
        </div>
        <button class="icon-button" data-action="cancel-edit-group" title="סגור">×</button>
      </div>

      <label class="field">
        <span>שם הקבוצה</span>
        <input data-action="edit-group-name" value="${escapeAttribute(editingGroupDraft.name)}" />
      </label>

      <section class="section">
        <h3>חברי קבוצה</h3>
        ${renderParticipantChecks(editingGroupDraft.memberIds, "edit-group-member")}
      </section>

      <section class="section">
        <h3>מנהלים</h3>
        ${renderParticipantChecks(editingGroupDraft.adminIds, "edit-group-admin")}
      </section>

      <div class="inline-actions section">
        <input class="guest-input" data-action="edit-group-member-name" placeholder="שם חבר חדש" value="${escapeAttribute(editingGroupDraft.newMemberName)}" />
        <button class="secondary-button" data-action="edit-group-add-member">הוסף חבר</button>
      </div>

      <div class="actions section">
        <button class="primary-button" data-action="save-edit-group" ${editingGroupDraft.memberIds.length === 0 ? "disabled" : ""}>שמור שינויים</button>
        <button class="secondary-button" data-action="cancel-edit-group">ביטול</button>
      </div>
    </section>
  `;
}

function renderGroupRow(group) {
  return `
    <article class="group-row">
      <div>
        <strong>${escapeHtml(group.name)}</strong>
        <small>${group.memberIds.length} חברים קבועים</small>
      </div>
      <div class="section-title-actions">
        <button class="secondary-button" data-action="edit-group" data-group-id="${group.id}">עריכה</button>
        <button class="secondary-button danger-button" data-action="archive-group" data-group-id="${group.id}">ארכוב</button>
      </div>
    </article>
  `;
}

function renderKnownParticipantsPanel() {
  return `
    <section class="panel section known-participants-panel">
      <div class="section-title-row">
        <div>
          <h2>שמות שנשמרו</h2>
          <p class="muted">האפליקציה לא ממציאה אנשים. אלה רק שמות שהכנסת, ואפשר להסיר שם שלא מופיע בהוצאה קיימת.</p>
        </div>
      </div>
      <div class="stack">
        ${
          state.participants.length
            ? state.participants.map(renderKnownParticipantRow).join("")
            : `<div class="empty-state">עדיין לא נשמרו שמות</div>`
        }
      </div>
    </section>
  `;
}

function renderKnownParticipantRow(participant) {
  const isCurrent = participant.id === state.currentParticipantId;
  const canRemove = canRemoveParticipant(state, participant.id);
  const helper = isCurrent
    ? "זה השם שלך במכשיר הזה"
    : canRemove
      ? "לא מופיע בהוצאות, אפשר להסיר"
      : "מופיע בהוצאה קיימת";

  return `
    <article class="group-row known-participant-row">
      <div class="known-participant-main">
        ${renderAvatar(participant.id)}
        <span>
          <strong>${escapeHtml(participant.displayName)}</strong>
          <small>${helper}</small>
        </span>
      </div>
      <button class="secondary-button danger-button" data-action="remove-participant" data-participant-id="${participant.id}" ${canRemove ? "" : "disabled"}>הסר</button>
    </article>
  `;
}

function renderEventRow(event) {
  const total = event.expenses.reduce((sum, expense) => sum + expense.total, 0);
  const statusClass = event.locked ? "is-locked" : "is-open";
  const statusLabel = event.locked ? "סגור" : "פתוח";

  return `
    <button class="event-row" data-action="open-event" data-event-id="${event.id}">
      <span class="event-row-main">
        <strong>${escapeHtml(event.name)}</strong>
        <small>${event.participantIds.length} משתתפים · ${event.expenses.length} הוצאות</small>
        ${renderAvatarStack(event.participantIds)}
      </span>
      <span class="event-row-side">
        <span class="amount">₪${formatMoney(total)}</span>
        <span class="status-chip ${statusClass}">${statusLabel}</span>
      </span>
    </button>
  `;
}

function renderNewEvent() {
  if (!newEventDraft) {
    const defaultGroup = state.groups.find((group) => !group.archived);
    newEventDraft = {
      name: "יציאה חדשה",
      groupId: defaultGroup?.id ?? "",
      participantIds: defaultGroup?.memberIds ? [...defaultGroup.memberIds] : [state.currentParticipantId],
      guestName: ""
    };
  }

  return `
    <section class="screen">
      <header class="top">
        <button class="icon-button" data-action="home" title="חזרה">‹</button>
        <div class="brand">
          <p class="eyebrow">אירוע חדש</p>
          <h1>פותחים חשבון לאירוע</h1>
        </div>
      </header>

      <section class="panel">
        <label class="field">
          <span>שם האירוע</span>
          <input data-action="new-event-name" value="${escapeAttribute(newEventDraft.name)}" />
        </label>

        <label class="field">
          <span>קבוצה</span>
          <select data-action="new-event-group">
            <option value="" ${newEventDraft.groupId === "" ? "selected" : ""}>אירוע חד פעמי</option>
            ${state.groups
              .filter((group) => !group.archived)
              .map(
                (group) => `
                  <option value="${group.id}" ${newEventDraft.groupId === group.id ? "selected" : ""}>
                    ${escapeHtml(group.name)}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>

        <section class="section">
          <h2>משתתפים</h2>
          ${renderParticipantChecks(newEventDraft.participantIds, "new-event-participant")}
        </section>

        <div class="inline-actions">
          <input class="guest-input" data-action="new-event-guest-name" placeholder="שם אורח" value="${escapeAttribute(newEventDraft.guestName)}" />
          <button class="secondary-button" data-action="new-event-add-guest">הוסף אורח</button>
        </div>

        <div class="actions section">
          <button class="primary-button" data-action="create-event" ${newEventDraft.participantIds.length === 0 ? "disabled" : ""}>צור אירוע</button>
          <button class="secondary-button" data-action="home">ביטול</button>
        </div>
      </section>
    </section>
  `;
}

function renderEvent(event) {
  const participants = eventParticipants(event);
  const total = event.expenses.reduce((sum, expense) => sum + expense.total, 0);
  const settlement = calculateSettlement(participants, event.expenses);
  const inviteUrl = buildEventInviteUrl(runtimeConfig.publicUrl || window.location.href, event.id);
  const canEdit = canCurrentParticipantEdit(event);
  const canManage = canCurrentParticipantManage(event);
  const adminNames =
    eventAdminIds(state, event).map(participantName).join(", ") || "אין מנהל";
  const editStatus = event.locked
    ? "נעול"
    : event.adminsCanEditOnly
      ? "רק מנהלים"
      : "כולם";

  return `
    <section class="screen">
      <header class="top">
        <button class="icon-button" data-action="home" title="בית">‹</button>
        <div class="brand">
          <p class="eyebrow">אירוע</p>
          <h1>${escapeHtml(event.name)}</h1>
          <p class="muted">${participants.length} משתתפים · ${event.expenses.length} הוצאות</p>
        </div>
      </header>
      ${renderNotice()}

      <section class="summary-strip">
        <div class="summary-item"><span>סך הוצאות</span><strong class="amount">₪${formatMoney(total)}</strong></div>
        <div class="summary-item"><span>העברות</span><strong>${settlement.transfers.length}</strong></div>
        <div class="summary-item"><span>עריכה</span><strong>${editStatus}</strong></div>
      </section>

      <section class="panel permissions-panel">
        <div class="section-title-row">
          <div>
            <h2>הרשאות</h2>
            <p class="muted">מנהל: ${escapeHtml(adminNames)}</p>
          </div>
          <button class="secondary-button" data-action="toggle-admin-edit" data-event-id="${event.id}" ${!canManage || event.locked ? "disabled" : ""}>
            ${event.adminsCanEditOnly ? "אפשר לכולם לערוך" : "רק מנהלים עורכים"}
          </button>
        </div>
      </section>

      <section class="panel invite-panel">
        <h2>קישור הזמנה</h2>
        ${renderInviteStatus()}
        <div class="invite-link-row">
          <input readonly value="${escapeAttribute(inviteUrl)}" />
          <button class="secondary-button" data-action="copy-invite" data-event-id="${event.id}">העתק</button>
        </div>
      </section>

      <section class="panel">
        <h2>משתתפים באירוע</h2>
        ${renderParticipantChecks(event.participantIds, "event-participant", event)}
        <div class="inline-actions section">
          <input class="guest-input" data-action="event-guest-name" placeholder="שם אורח" ${!canEdit ? "disabled" : ""} />
          <button class="secondary-button" data-action="event-add-guest" data-event-id="${event.id}" ${!canEdit ? "disabled" : ""}>הוסף אורח</button>
        </div>
      </section>

      <section class="section">
        <div class="actions">
          <button class="primary-button" data-action="show-expense-form" data-event-id="${event.id}" ${!canEdit ? "disabled" : ""}>הוסף הוצאה</button>
          <button class="secondary-button" data-action="settle" data-event-id="${event.id}" ${event.expenses.length === 0 ? "disabled" : ""}>סגירת אירוע</button>
          <button class="secondary-button" data-action="duplicate-event" data-event-id="${event.id}">צור אירוע דומה</button>
          <button class="secondary-button" data-action="toggle-lock" data-event-id="${event.id}" ${!canManage ? "disabled" : ""}>${event.locked ? "פתח עריכה" : "נעל עריכה"}</button>
        </div>
      </section>

      ${expenseDraft?.eventId === event.id ? renderExpenseForm(event) : ""}

      <section class="section">
        <h2>הוצאות</h2>
        <div class="stack">
          ${
            event.expenses.length
              ? event.expenses.map((expense) => renderExpenseRow(event, expense)).join("")
              : `<div class="empty-state">עוד אין הוצאות באירוע</div>`
          }
        </div>
      </section>
    </section>
  `;
}

function renderInviteStatus() {
  const ready = runtimeConfig.launch.shareLinksReady;

  return `
    <div class="invite-status ${ready ? "is-ready" : "is-local"}">
      <span class="status-chip ${ready ? "is-open" : "is-locked"}">${ready ? "קישור ציבורי" : "קישור מקומי"}</span>
      <p class="muted">${ready ? "אפשר לשלוח את הקישור לחברים." : "הקישור טוב לבדיקה כאן; לשליחה אמיתית צריך כתובת ציבורית ושמירה בענן."}</p>
    </div>
  `;
}

function renderExpenseForm(event) {
  const participants = eventParticipants(event);

  return `
    <section class="expense-modal-backdrop" aria-label="חלון הוצאה">
      <section class="panel expense-modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title">
        <div class="expense-modal-header">
          <div>
            <p class="eyebrow">הוצאה באירוע</p>
            <h2 id="expense-modal-title">${expenseDraft.id ? "עריכת הוצאה" : "הוספת הוצאה"}</h2>
            <p class="muted">ממלאים את ההוצאה כאן, שומרים, וחוזרים ישר למסך האירוע.</p>
          </div>
          <button class="icon-button" data-action="cancel-expense" title="סגור">×</button>
        </div>

      <label class="field">
        <span>שם ההוצאה</span>
        <input data-action="expense-name" value="${escapeAttribute(expenseDraft.name)}" placeholder="שם ההוצאה" />
      </label>
      <label class="field">
        <span>סכום כולל</span>
        <input data-action="expense-total" inputmode="decimal" value="${escapeAttribute(expenseDraft.total)}" placeholder="0" />
      </label>

      <section class="section">
        <h3>מי שילם וכמה?</h3>
        <div class="payer-list">
          ${expenseDraft.payers
            .map(
              (payer, index) => `
                <div class="payer-row">
                  <select data-action="expense-payer-id" data-index="${index}">
                    ${participants
                      .map(
                        (participant) => `
                          <option value="${participant.id}" ${payer.participantId === participant.id ? "selected" : ""}>
                            ${escapeHtml(participant.displayName)}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                  <input data-action="expense-payer-amount" data-index="${index}" inputmode="decimal" value="${escapeAttribute(payer.amount)}" placeholder="כמה שילם" />
                  ${
                    expenseDraft.payers.length > 1
                      ? `<button class="secondary-button" data-action="remove-payer" data-index="${index}">הסר</button>`
                      : ""
                  }
                </div>
              `
            )
            .join("")}
        </div>
        <button class="secondary-button section" data-action="add-payer">הוסף משלם</button>
      </section>

      <section class="section">
        <h3>מי שותף בהוצאה?</h3>
        ${renderParticipantChecks(expenseDraft.sharedByParticipantIds, "expense-shared", event)}
      </section>

      ${expenseDraft.error ? `<p class="error">${escapeHtml(expenseDraft.error)}</p>` : ""}

      <div class="actions section">
        <button class="primary-button" data-action="save-expense" data-event-id="${event.id}">שמור הוצאה</button>
        <button class="secondary-button" data-action="cancel-expense">ביטול</button>
      </div>
      </section>
    </section>
  `;
}

function renderExpenseRow(event, expense) {
  const canEdit = canCurrentParticipantEdit(event);
  const payers = expense.payers
    .map((payer) => `${participantName(payer.participantId)} ₪${formatMoney(payer.amount)}`)
    .join(", ");
  const shared = expense.sharedByParticipantIds.map(participantName).join(", ");

  return `
    <article class="expense-row">
      <span>
        <strong>${escapeHtml(expense.name)}</strong>
        <small>שילמו: ${escapeHtml(payers)}</small>
        <small>שותפים: ${escapeHtml(shared)}</small>
      </span>
      <span class="expense-actions">
        <span class="amount">₪${formatMoney(expense.total)}</span>
        <button class="secondary-button" data-action="edit-expense" data-event-id="${event.id}" data-expense-id="${expense.id}" ${!canEdit ? "disabled" : ""}>ערוך</button>
        <button class="secondary-button danger-button" data-action="delete-expense" data-event-id="${event.id}" data-expense-id="${expense.id}" ${!canEdit ? "disabled" : ""}>מחק</button>
      </span>
    </article>
  `;
}

function renderSettlement(event) {
  const participants = eventParticipants(event);
  const calculated = calculateSettlement(participants, event.expenses);
  const transfers = event.transfers.length ? event.transfers : calculated.transfers;
  const pendingTotal = transfers
    .filter((transfer) => transfer.status === "pending")
    .reduce((sum, transfer) => sum + transfer.amount, 0);

  return `
    <section class="screen">
      <header class="top">
        <button class="icon-button" data-action="back-to-event" data-event-id="${event.id}" title="חזרה">‹</button>
        <div class="brand">
          <p class="eyebrow">סגירת אירוע</p>
          <h1>${escapeHtml(event.name)}</h1>
        </div>
      </header>

      <section class="summary-strip">
        <div class="summary-item"><span>נשאר פתוח</span><strong class="amount">₪${formatMoney(pendingTotal)}</strong></div>
        <div class="summary-item"><span>העברות</span><strong>${transfers.length}</strong></div>
        <div class="summary-item"><span>שולמו</span><strong>${transfers.filter((transfer) => transfer.status === "paid").length}</strong></div>
      </section>

      <section class="section">
        <div class="section-title-row">
          <h2>מי מעביר למי</h2>
          <div class="section-title-actions">
            <button class="secondary-button" data-action="copy-settlement" data-event-id="${event.id}">העתק סיכום</button>
            <button class="secondary-button" data-action="copy-event-report" data-event-id="${event.id}">העתק דוח מלא</button>
          </div>
        </div>
        <div class="stack">
          ${
            transfers.length
              ? transfers.map((transfer) => renderTransferRow(transfer)).join("")
              : `<div class="empty-state">האירוע מאוזן</div>`
          }
        </div>
      </section>

      <section class="section">
        <h2>יתרות</h2>
        <div class="stack">
          ${Object.entries(calculated.balances)
            .map(([participantId, balance]) => renderBalanceRow(participantId, balance))
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderTransferRow(transfer) {
  const paid = transfer.status === "paid";
  return `
    <article class="transfer-row">
      <div>
        <div class="transfer-people">
          ${renderAvatar(transfer.fromParticipantId)}
          <strong>${escapeHtml(participantName(transfer.fromParticipantId))}</strong>
          <span class="transfer-arrow">←</span>
          ${renderAvatar(transfer.toParticipantId)}
          <strong>${escapeHtml(participantName(transfer.toParticipantId))}</strong>
        </div>
        <small class="${paid ? "status-paid" : ""}">${paid ? "שולם" : "ממתין לתשלום"}</small>
      </div>
      <div class="transfer-actions">
        <span class="amount">₪${formatMoney(transfer.amount)}</span>
        ${
          paid
            ? `<button class="secondary-button" data-action="mark-pending" data-transfer-id="${transfer.id}">בטל סימון</button>`
            : `<button class="primary-button" data-action="mark-paid" data-transfer-id="${transfer.id}">סומן כשולם</button>`
        }
      </div>
    </article>
  `;
}

function renderBalanceRow(participantId, balance) {
  const className = balance > 0 ? "is-credit" : balance < 0 ? "is-debt" : "";
  const label = balance > 0 ? "מקבל" : balance < 0 ? "משלם" : "מאוזן";
  return `
    <div class="balance-row ${className}">
      <strong>${escapeHtml(participantName(participantId))}</strong>
      <span>${label} <span class="amount">₪${formatMoney(Math.abs(balance))}</span></span>
    </div>
  `;
}

function renderParticipantChecks(selectedIds, action, event = null) {
  const participants = event ? eventParticipants(event, true) : state.participants;
  const disabled = event && !canCurrentParticipantEdit(event);
  return `
    <div class="participant-grid">
      ${participants
        .map(
          (participant) => `
            <label class="participant-pill ${participant.kind === "guest" ? "is-guest" : ""}">
              <input
                type="checkbox"
                data-action="${action}"
                data-participant-id="${participant.id}"
                ${selectedIds.includes(participant.id) ? "checked" : ""}
                ${disabled ? "disabled" : ""}
              />
              ${renderAvatar(participant.id)}
              <span>${escapeHtml(participant.displayName)}</span>
            </label>
          `
        )
        .join("")}
    </div>
  `;
}

async function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;

  if (action === "home") {
    screen = { name: "home" };
    newEventDraft = null;
    expenseDraft = null;
    groupDraft = null;
    editingGroupDraft = null;
    render();
  }

  if (action === "save-profile") {
    await saveProfileFromDraft();
  }

  if (action === "edit-profile") {
    screen = { name: "profile" };
    profileNameDraft = localProfile?.displayName ?? participantName(state.currentParticipantId);
    profileError = "";
    render();
  }

  if (action === "reset") {
    state = await resetSharedState();
    screen = { name: "home" };
    newEventDraft = null;
    expenseDraft = null;
    groupDraft = null;
    editingGroupDraft = null;
    render();
  }

  if (action === "new-event") {
    screen = { name: "new-event" };
    newEventDraft = null;
    editingGroupDraft = null;
    render();
  }

  if (action === "groups") {
    screen = { name: "groups" };
    groupDraft = null;
    editingGroupDraft = null;
    render();
  }

  if (action === "open-event") {
    screen = { name: "event", eventId: target.dataset.eventId };
    expenseDraft = null;
    editingGroupDraft = null;
    render();
  }

  if (action === "new-event-add-guest") {
    addGuestToDraft(newEventDraft);
  }

  if (action === "group-add-member") {
    addMemberToGroupDraft();
  }

  if (action === "edit-group-add-member") {
    addMemberToEditingGroupDraft();
  }

  if (action === "create-group") {
    createGroupFromDraft();
  }

  if (action === "edit-group") {
    startEditGroup(target.dataset.groupId);
  }

  if (action === "save-edit-group") {
    saveEditedGroup();
  }

  if (action === "cancel-edit-group") {
    editingGroupDraft = null;
    render();
  }

  if (action === "archive-group") {
    archiveGroupInState(target.dataset.groupId);
  }

  if (action === "remove-participant") {
    removeParticipantFromState(target.dataset.participantId);
  }

  if (action === "create-event") {
    createEventFromDraft();
  }

  if (action === "event-add-guest") {
    addGuestToEvent(target.dataset.eventId);
  }

  if (action === "copy-invite") {
    copyInviteLink(target.dataset.eventId);
  }

  if (action === "copy-settlement") {
    copySettlementSummary(target.dataset.eventId);
  }

  if (action === "copy-event-report") {
    copyEventReport(target.dataset.eventId);
  }

  if (action === "export-state") {
    exportStateBackup();
  }

  if (action === "toggle-admin-edit") {
    toggleAdminEditMode(target.dataset.eventId);
  }

  if (action === "show-expense-form") {
    const event = getEvent(target.dataset.eventId);
    if (event && canCurrentParticipantEdit(event)) startExpenseDraft(target.dataset.eventId);
  }

  if (action === "edit-expense") {
    const event = getEvent(target.dataset.eventId);
    if (event && canCurrentParticipantEdit(event)) {
      startExpenseDraft(target.dataset.eventId, target.dataset.expenseId);
    }
  }

  if (action === "cancel-expense") {
    expenseDraft = null;
    render();
  }

  if (action === "add-payer") {
    addPayerToExpenseDraft();
    render();
  }

  if (action === "remove-payer") {
    expenseDraft.payers.splice(Number(target.dataset.index), 1);
    rebalanceExpenseDraftPayers();
    render();
  }

  if (action === "save-expense") {
    saveExpense(target.dataset.eventId);
  }

  if (action === "delete-expense") {
    deleteExpense(target.dataset.eventId, target.dataset.expenseId);
  }

  if (action === "settle") {
    prepareSettlement(target.dataset.eventId);
  }

  if (action === "duplicate-event") {
    duplicateCurrentEvent(target.dataset.eventId);
  }

  if (action === "toggle-lock") {
    toggleEventLock(target.dataset.eventId);
  }

  if (action === "back-to-event") {
    screen = { name: "event", eventId: target.dataset.eventId };
    render();
  }

  if (action === "mark-paid") {
    markTransferPaid(target.dataset.transferId);
  }

  if (action === "mark-pending") {
    markTransferPending(target.dataset.transferId);
  }
}

function handleInput(event) {
  const target = event.target;
  const action = target.dataset.action;

  if (action === "profile-name") {
    profileNameDraft = target.value;
    profileError = "";
  }
  if (action === "new-event-name") newEventDraft.name = target.value;
  if (action === "new-event-guest-name") newEventDraft.guestName = target.value;
  if (action === "group-name") groupDraft.name = target.value;
  if (action === "group-member-name") groupDraft.newMemberName = target.value;
  if (action === "edit-group-name") editingGroupDraft.name = target.value;
  if (action === "edit-group-member-name") editingGroupDraft.newMemberName = target.value;
  if (action === "event-search") {
    eventSearch = target.value;
    render();
  }
  if (action === "expense-name") expenseDraft.name = target.value;
  if (action === "expense-total") {
    expenseDraft.total = target.value;
    rebalanceExpenseDraftPayers();
    syncExpensePayerAmountInputs();
  }
  if (action === "expense-payer-amount") {
    const index = Number(target.dataset.index);
    expenseDraft.payers[index] = markPayerAmountEdited(expenseDraft.payers[index], target.value);
    rebalanceExpenseDraftPayers();
    syncExpensePayerAmountInputs(index);
  }
}

async function handleChange(event) {
  const target = event.target;
  const action = target.dataset.action;

  if (action === "new-event-group") {
    const group = state.groups.find((item) => item.id === target.value);
    newEventDraft.groupId = target.value;
    newEventDraft.participantIds = group?.memberIds ? [...group.memberIds] : [state.currentParticipantId];
    render();
  }

  if (action === "new-event-participant") {
    toggleId(newEventDraft.participantIds, target.dataset.participantId, target.checked);
  }

  if (action === "group-member") {
    toggleId(groupDraft.memberIds, target.dataset.participantId, target.checked);
  }

  if (action === "edit-group-member") {
    toggleId(editingGroupDraft.memberIds, target.dataset.participantId, target.checked);
  }

  if (action === "edit-group-admin") {
    toggleId(editingGroupDraft.adminIds, target.dataset.participantId, target.checked);
  }

  if (action === "event-participant") {
    toggleEventParticipant(screen.eventId, target.dataset.participantId, target.checked);
  }

  if (action === "expense-shared") {
    toggleId(expenseDraft.sharedByParticipantIds, target.dataset.participantId, target.checked);
  }

  if (action === "expense-payer-id") {
    expenseDraft.payers[Number(target.dataset.index)].participantId = target.value;
  }

  if (action === "import-state-file") {
    await importStateBackup(target.files[0]);
    target.value = "";
  }
}

function createEventFromDraft() {
  if (newEventDraft.participantIds.length === 0) {
    window.alert("צריך לבחור לפחות משתתף אחד.");
    return;
  }

  const event = {
    id: makeId("event"),
    name: newEventDraft.name.trim() || "אירוע חדש",
    groupId: newEventDraft.groupId || undefined,
    participantIds: [...newEventDraft.participantIds],
    expenses: [],
    transfers: [],
    adminIds: [state.currentParticipantId],
    createdByParticipantId: state.currentParticipantId,
    adminsCanEditOnly: false,
    locked: false,
    createdAt: new Date().toISOString()
  };

  state.events.unshift(event);
  persistState();
  newEventDraft = null;
  screen = { name: "event", eventId: event.id };
  render();
}

function addGuestToDraft(draft) {
  const name = draft.guestName.trim();
  if (!name) return;
  const guest = { id: makeId("guest"), displayName: name, kind: "guest" };
  state.participants.push(guest);
  draft.participantIds.push(guest.id);
  draft.guestName = "";
  persistState();
  render();
}

function addMemberToGroupDraft() {
  const name = groupDraft.newMemberName.trim();
  if (!name) return;

  const member = { id: makeId("member"), displayName: name, kind: "guest" };
  state.participants.push(member);
  groupDraft.memberIds.push(member.id);
  groupDraft.newMemberName = "";
  persistState();
  render();
}

function startEditGroup(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) return;

  editingGroupDraft = {
    id: group.id,
    name: group.name,
    memberIds: [...group.memberIds],
    adminIds: [...(group.adminIds ?? [])],
    newMemberName: ""
  };
  render();
}

function addMemberToEditingGroupDraft() {
  if (!editingGroupDraft) return;

  const name = editingGroupDraft.newMemberName.trim();
  if (!name) return;

  const member = { id: makeId("member"), displayName: name, kind: "guest" };
  state.participants.push(member);
  editingGroupDraft.memberIds.push(member.id);
  editingGroupDraft.newMemberName = "";
  persistState();
  render();
}

function saveEditedGroup() {
  if (!editingGroupDraft) return;

  if (editingGroupDraft.memberIds.length === 0) {
    window.alert("צריך לבחור לפחות חבר אחד לקבוצה.");
    return;
  }

  state = updateGroup(state, editingGroupDraft.id, {
    name: editingGroupDraft.name,
    memberIds: editingGroupDraft.memberIds,
    adminIds: editingGroupDraft.adminIds
  });
  editingGroupDraft = null;
  notice = "הקבוצה עודכנה.";
  persistState();
  render();
}

function createGroupFromDraft() {
  if (groupDraft.memberIds.length === 0) {
    window.alert("צריך לבחור לפחות חבר אחד לקבוצה.");
    return;
  }

  state = createGroup(state, {
    id: makeId("group"),
    name: groupDraft.name,
    memberIds: groupDraft.memberIds,
    adminId: state.currentParticipantId
  });
  persistState();
  groupDraft = null;
  render();
}

function archiveGroupInState(groupId) {
  state = archiveGroup(state, groupId);
  persistState();
  render();
}

function removeParticipantFromState(participantId) {
  const participant = state.participants.find((item) => item.id === participantId);
  if (!participant) return;

  if (!canRemoveParticipant(state, participantId)) {
    notice = participantId === state.currentParticipantId
      ? "אי אפשר להסיר את השם שמחובר במכשיר הזה. אפשר להחליף שם מהמסך הראשי."
      : "אי אפשר להסיר שם שכבר מופיע בהוצאות. קודם עורכים או מוחקים את ההוצאות שלו.";
    render();
    return;
  }

  state = removeParticipant(state, participantId);
  dropParticipantFromDrafts(participantId);
  notice = `${participant.displayName} הוסר מהשמות השמורים.`;
  persistState();
  render();
}

function dropParticipantFromDrafts(participantId) {
  if (groupDraft) {
    groupDraft.memberIds = groupDraft.memberIds.filter((id) => id !== participantId);
  }

  if (editingGroupDraft) {
    editingGroupDraft.memberIds = editingGroupDraft.memberIds.filter((id) => id !== participantId);
    editingGroupDraft.adminIds = editingGroupDraft.adminIds.filter((id) => id !== participantId);
  }

  if (newEventDraft) {
    newEventDraft.participantIds = newEventDraft.participantIds.filter((id) => id !== participantId);
  }

  if (expenseDraft) {
    expenseDraft.sharedByParticipantIds = expenseDraft.sharedByParticipantIds.filter((id) => id !== participantId);
    expenseDraft.payers = expenseDraft.payers.filter((payer) => payer.participantId !== participantId);
  }
}

function addGuestToEvent(eventId) {
  const input = app.querySelector('[data-action="event-guest-name"]');
  const name = input?.value.trim();
  if (!name) return;
  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    notice = editBlockedMessage(event);
    render();
    return;
  }
  const guest = { id: makeId("guest"), displayName: name, kind: "guest" };
  state.participants.push(guest);
  event.participantIds.push(guest.id);
  event.transfers = [];
  persistState();
  render();
}

async function copyInviteLink(eventId) {
  const inviteUrl = buildEventInviteUrl(runtimeConfig.publicUrl || window.location.href, eventId);
  copyText(inviteUrl, "קישור ההזמנה הועתק.");
}

async function copySettlementSummary(eventId) {
  const event = getEvent(eventId);
  if (!event) return;

  const participants = eventParticipants(event);
  const summary = formatSettlementSummary({
    eventName: event.name,
    participants,
    transfers: eventSettlementTransfers(event, participants)
  });
  copyText(summary, "סיכום ההתחשבנות הועתק.");
}

async function copyEventReport(eventId) {
  const event = getEvent(eventId);
  if (!event) return;

  const participants = eventParticipants(event);
  const report = formatEventReport({
    eventName: event.name,
    participants,
    expenses: event.expenses,
    transfers: eventSettlementTransfers(event, participants)
  });
  copyText(report, "דוח האירוע הועתק.");
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    notice = successMessage;
  } catch {
    notice = `אפשר להעתיק ידנית: ${text}`;
  }
  render();
}

function exportStateBackup() {
  const json = serializeStateBackup(state);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `settle-friends-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  notice = "קובץ גיבוי נוצר.";
  render();
}

async function importStateBackup(file) {
  if (!file) return;

  try {
    state = parseStateBackup(await file.text());
    screen = { name: "home" };
    newEventDraft = null;
    expenseDraft = null;
    groupDraft = null;
    editingGroupDraft = null;
    notice = "הגיבוי שוחזר.";
    persistState();
  } catch {
    notice = "קובץ הגיבוי לא מתאים או פגום.";
  }

  render();
}

async function saveProfileFromDraft() {
  const displayName = normalizeProfileName(profileNameDraft);
  if (!isFullProfileName(displayName)) {
    profileError = "צריך להזין שם פרטי ושם משפחה כדי להמשיך.";
    render();
    return;
  }

  const invitedEventId = parseInviteEventId(window.location.href);
  const nextState = ensureNamedParticipant(
    state,
    {
      id: localProfile?.participantId ?? makeId("user"),
      displayName
    },
    invitedEventId
  );
  const participant = nextState.participants.find(
    (item) => item.id === nextState.currentParticipantId
  );

  state = nextState;
  localProfile = saveLocalProfile({
    participantId: state.currentParticipantId,
    displayName: participant?.displayName ?? displayName
  });
  profileNameDraft = localProfile.displayName;
  profileError = "";
  screen = invitedEventId && getEvent(invitedEventId)
    ? { name: "event", eventId: invitedEventId }
    : { name: "home" };
  notice = `נכנסת בתור ${participantName(state.currentParticipantId)}.`;

  await saveSharedState(state);
  render();
}

function startExpenseDraft(eventId, expenseId = null) {
  const event = getEvent(eventId);
  const existingExpense = event.expenses.find((expense) => expense.id === expenseId);

  if (existingExpense) {
    expenseDraft = {
      id: existingExpense.id,
      eventId,
      name: existingExpense.name,
      total: formatMoney(existingExpense.total),
      payers: existingExpense.payers.map((payer) => ({
        participantId: payer.participantId,
        amount: formatMoney(payer.amount),
        amountTouched: true,
        autoAmount: false
      })),
      sharedByParticipantIds: [...existingExpense.sharedByParticipantIds],
      createdByParticipantId: existingExpense.createdByParticipantId,
      error: ""
    };
    render();
    return;
  }

  expenseDraft = {
    eventId,
    name: "",
    total: "",
    payers: [createPayerDraft(state.currentParticipantId)],
    sharedByParticipantIds: [...event.participantIds],
    error: ""
  };
  render();
}

function addPayerToExpenseDraft() {
  if (!expenseDraft) return;

  const event = getEvent(expenseDraft.eventId);
  const participantId = nextExpensePayerId(event);
  const nextIndex = expenseDraft.payers.length;
  expenseDraft.payers.push(createPayerDraft(participantId));
  rebalanceExpenseDraftPayers(nextIndex);
}

function nextExpensePayerId(event) {
  const usedPayerIds = new Set(expenseDraft.payers.map((payer) => payer.participantId));
  const participants = event ? eventParticipants(event) : state.participants;
  const unusedParticipant = participants.find(
    (participant) => !usedPayerIds.has(participant.id)
  );

  return unusedParticipant?.id ?? event?.participantIds[0] ?? state.currentParticipantId;
}

function rebalanceExpenseDraftPayers(preferredIndex = undefined) {
  if (!expenseDraft) return;

  expenseDraft.payers = balancePayerAmounts(
    expenseDraft.total,
    expenseDraft.payers,
    preferredIndex
  );
}

function syncExpensePayerAmountInputs(skipIndex = null) {
  app.querySelectorAll('[data-action="expense-payer-amount"]').forEach((input) => {
    const index = Number(input.dataset.index);
    if (index === skipIndex || document.activeElement === input) return;

    const amount = expenseDraft?.payers[index]?.amount ?? "";
    if (input.value !== amount) input.value = amount;
  });
}

function saveExpense(eventId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    expenseDraft.error = editBlockedMessage(event);
    render();
    return;
  }

  try {
    const total = parseMoneyInput(expenseDraft.total);
    const payers = mergePayers(
      expenseDraft.payers
        .map((payer) => ({
          participantId: payer.participantId,
          amount: parseMoneyInput(payer.amount)
        }))
        .filter((payer) => payer.amount > 0)
    );

    const expense = {
      id: expenseDraft.id ?? makeId("expense"),
      name: expenseDraft.name.trim(),
      total,
      payers,
      sharedByParticipantIds: [...expenseDraft.sharedByParticipantIds],
      createdByParticipantId:
        expenseDraft.createdByParticipantId ?? state.currentParticipantId,
      updatedAt: new Date().toISOString()
    };

    const errors = validateExpense(expense);
    if (errors.length) {
      expenseDraft.error = errors[0];
      render();
      return;
    }

    if (expenseDraft.id) {
      state = updateExpense(state, eventId, expense);
    } else {
      event.expenses.unshift(expense);
      event.transfers = [];
    }
    persistState();
    expenseDraft = null;
    render();
  } catch (error) {
    expenseDraft.error = error instanceof Error ? error.message : "אי אפשר לשמור את ההוצאה.";
    render();
  }
}

function deleteExpense(eventId, expenseId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    notice = editBlockedMessage(event);
    render();
    return;
  }

  state = removeExpense(state, eventId, expenseId);
  persistState();
  render();
}

function prepareSettlement(eventId) {
  const event = getEvent(eventId);
  const result = calculateSettlement(eventParticipants(event), event.expenses);
  const previousTransfers = new Map(event.transfers.map((transfer) => [transfer.id, transfer]));
  event.transfers = result.transfers.map((transfer) => {
    const previous = previousTransfers.get(transfer.id);
    return previous?.status === "paid"
      ? {
          ...transfer,
          status: "paid",
          markedPaidByParticipantId: previous.markedPaidByParticipantId,
          markedPaidAt: previous.markedPaidAt
        }
      : transfer;
  });
  persistState();
  screen = { name: "settlement", eventId };
  render();
}

function duplicateCurrentEvent(eventId) {
  const event = getEvent(eventId);
  if (!event) return;

  const nextEventId = makeId("event");
  state = duplicateEvent(state, eventId, {
    id: nextEventId,
    name: `${event.name} - חדש`,
    adminId: state.currentParticipantId,
    createdAt: new Date().toISOString()
  });
  persistState();
  expenseDraft = null;
  screen = { name: "event", eventId: nextEventId };
  notice = "נוצר אירוע דומה בלי הוצאות קודמות.";
  render();
}

function toggleEventLock(eventId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לנעול או לפתוח עריכה.";
    render();
    return;
  }
  event.locked = !event.locked;
  if (event.locked) expenseDraft = null;
  persistState();
  render();
}

function toggleAdminEditMode(eventId) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantManage(event)) {
    notice = "רק מנהל יכול לשנות הרשאות עריכה.";
    render();
    return;
  }

  state = setEventAdminsCanEditOnly(state, eventId, !event.adminsCanEditOnly);
  expenseDraft = null;
  persistState();
  render();
}

function markTransferPaid(transferId) {
  const event = getEvent(screen.eventId);
  if (!event?.transfers.some((item) => item.id === transferId)) return;

  state = updateTransferStatus(state, event.id, transferId, {
    status: "paid",
    participantId: state.currentParticipantId,
    markedAt: new Date().toISOString()
  });
  persistState();
  render();
}

function markTransferPending(transferId) {
  const event = getEvent(screen.eventId);
  if (!event?.transfers.some((item) => item.id === transferId)) return;

  state = updateTransferStatus(state, event.id, transferId, { status: "pending" });
  persistState();
  render();
}

function toggleEventParticipant(eventId, participantId, checked) {
  const event = getEvent(eventId);
  if (!canCurrentParticipantEdit(event)) {
    notice = editBlockedMessage(event);
    render();
    return;
  }

  const isUsed = event.expenses.some(
    (expense) =>
      expense.sharedByParticipantIds.includes(participantId) ||
      expense.payers.some((payer) => payer.participantId === participantId)
  );

  if (!checked && isUsed) {
    window.alert("המשתתף כבר מופיע בהוצאות. צריך לערוך את ההוצאות לפני שמסירים אותו.");
    render();
    return;
  }

  toggleId(event.participantIds, participantId, checked);
  event.transfers = [];
  persistState();
  render();
}

function toggleId(ids, id, checked) {
  const index = ids.indexOf(id);
  if (checked && index === -1) ids.push(id);
  if (!checked && index !== -1) ids.splice(index, 1);
}

function mergePayers(payers) {
  const totals = new Map();
  for (const payer of payers) {
    totals.set(payer.participantId, (totals.get(payer.participantId) ?? 0) + payer.amount);
  }
  return [...totals.entries()].map(([participantId, amount]) => ({ participantId, amount }));
}

function syncLocalProfile(nextState) {
  if (!localProfile) return nextState;

  const invitedEventId = parseInviteEventId(window.location.href);
  const stateWithProfile = ensureNamedParticipant(
    nextState,
    {
      id: localProfile.participantId,
      displayName: localProfile.displayName
    },
    invitedEventId
  );
  const participant = stateWithProfile.participants.find(
    (item) => item.id === stateWithProfile.currentParticipantId
  );

  localProfile = saveLocalProfile({
    participantId: stateWithProfile.currentParticipantId,
    displayName: participant?.displayName ?? localProfile.displayName
  });
  profileNameDraft = localProfile.displayName;
  return stateWithProfile;
}

function openInvitedEventFromUrl() {
  const invitedEventId = parseInviteEventId(window.location.href);
  if (!invitedEventId) return;

  if (getEvent(invitedEventId)) {
    screen = { name: "event", eventId: invitedEventId };
    notice = "פתחת אירוע מקישור הזמנה.";
  } else {
    notice = "קישור ההזמנה לא נמצא במידע המקומי.";
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

function persistState() {
  saveSharedState(state);
}

function eventParticipants(event, includeAllKnown = false) {
  if (includeAllKnown) return state.participants;
  return state.participants.filter((participant) => event.participantIds.includes(participant.id));
}

function eventSettlementTransfers(event, participants = eventParticipants(event)) {
  const calculated = calculateSettlement(participants, event.expenses);
  return event.transfers.length ? event.transfers : calculated.transfers;
}

function renderAvatarStack(participantIds) {
  const visibleIds = participantIds.slice(0, 4);
  const hiddenCount = participantIds.length - visibleIds.length;

  return `
    <span class="avatar-stack" aria-label="משתתפים">
      ${visibleIds.map((participantId) => renderAvatar(participantId)).join("")}
      ${hiddenCount > 0 ? `<span class="avatar avatar-more">+${hiddenCount}</span>` : ""}
    </span>
  `;
}

function renderAvatar(participantId) {
  const participant = state.participants.find((item) => item.id === participantId);
  const name = participant?.displayName ?? "משתתף";
  const guestClass = participant?.kind === "guest" ? "is-guest" : "";

  return `<span class="avatar ${guestClass}" title="${escapeAttribute(name)}">${escapeHtml(participantInitials(name))}</span>`;
}

function participantInitials(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("");

  return initials || "?";
}

function canCurrentParticipantEdit(event) {
  return event ? canEditEvent(state, event, state.currentParticipantId) : false;
}

function canCurrentParticipantManage(event) {
  return event ? canManageEventSettings(state, event, state.currentParticipantId) : false;
}

function editBlockedMessage(event) {
  if (!event) return "האירוע לא נמצא.";
  return event.locked ? "האירוע נעול לעריכה." : "רק מנהל יכול לערוך את האירוע עכשיו.";
}

function getEvent(eventId) {
  return state.events.find((event) => event.id === eventId);
}

function participantName(participantId) {
  return state.participants.find((participant) => participant.id === participantId)?.displayName ?? "משתתף";
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
