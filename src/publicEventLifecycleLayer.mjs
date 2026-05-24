import { loadState, saveSharedState } from "./data/localStore.mjs";

const STYLE_ID = "sogrim-event-lifecycle-style";
const ACTIONS_CLASS = "event-lifecycle-actions";

let enhancementScheduled = false;

installEventLifecycleLayer();

function installEventLifecycleLayer() {
  injectStyles();
  document.addEventListener("click", handleLifecycleClick, true);
  new MutationObserver(scheduleEnhancement).observe(document.body, {
    childList: true,
    subtree: true
  });
  scheduleEnhancement();
}

function scheduleEnhancement() {
  if (enhancementScheduled) return;
  enhancementScheduled = true;

  requestAnimationFrame(() => {
    enhancementScheduled = false;
    enhanceSettingsDialogs();
  });
}

function enhanceSettingsDialogs() {
  document
    .querySelectorAll('[data-action="toggle-admin-edit"][data-event-id]')
    .forEach((settingsButton) => {
      const dialog =
        settingsButton.closest(".event-modal") ??
        settingsButton.closest(".event-detail-card") ??
        settingsButton.closest(".page-card");
      if (!dialog) return;
      if (dialog.querySelector(`.${ACTIONS_CLASS}`)) return;
      if (dialog.querySelector('[data-action="leave-event"], [data-action="delete-event"]')) return;

      const eventId = settingsButton.dataset.eventId;
      const state = loadState();
      const event = state.events.find((item) => item.id === eventId);
      if (!event) return;

      const canLeave = canLeaveEvent(state, event, state.currentParticipantId);
      const canDelete = canManageEvent(state, event, state.currentParticipantId);
      const zone = document.createElement("section");
      zone.className = `${ACTIONS_CLASS} event-danger-zone section`;
      zone.innerHTML = `
        <div>
          <strong>עזיבה ומחיקה</strong>
          <p class="muted">עזיבה אפשרית רק כשאין הוצאות או העברות על שמך. מחיקה זמינה למנהל בלבד.</p>
        </div>
        <div class="actions">
          <button class="secondary-button danger-button" data-lifecycle-action="leave-event" data-event-id="${escapeAttribute(eventId)}" ${canLeave ? "" : "disabled"}>עזוב אירוע</button>
          <button class="secondary-button danger-button" data-lifecycle-action="delete-event" data-event-id="${escapeAttribute(eventId)}" ${canDelete ? "" : "disabled"}>מחק אירוע</button>
        </div>
      `;

      const actions = settingsButton.closest(".actions");
      actions?.after(zone) ?? dialog.append(zone);
    });
}

async function handleLifecycleClick(event) {
  const target = event.target.closest("[data-lifecycle-action]");
  if (!target) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (target.disabled) return;

  const eventId = target.dataset.eventId;
  const state = loadState();
  const currentEvent = state.events.find((item) => item.id === eventId);
  if (!currentEvent) return;

  if (target.dataset.lifecycleAction === "leave-event") {
    await leaveCurrentEvent(state, currentEvent);
    return;
  }

  if (target.dataset.lifecycleAction === "delete-event") {
    await deleteCurrentEvent(state, currentEvent);
  }
}

async function leaveCurrentEvent(state, event) {
  const participantId = state.currentParticipantId;
  if (!canLeaveEvent(state, event, participantId)) {
    window.alert("אי אפשר לעזוב אירוע שיש בו הוצאות או העברות על שמך, או כשאתה המנהל היחיד.");
    return;
  }

  if (!window.confirm("לעזוב את האירוע הזה? הוא יוסר מהמסך שלך.")) return;

  const nextState = {
    ...state,
    events: state.events.map((item) =>
      item.id === event.id
        ? {
            ...item,
            participantIds: uniqueIds(item.participantIds.filter((id) => id !== participantId)),
            adminIds: uniqueIds((item.adminIds ?? []).filter((id) => id !== participantId)),
            transfers: []
          }
        : item
    )
  };

  await saveAndReload(nextState);
}

async function deleteCurrentEvent(state, event) {
  if (!canManageEvent(state, event, state.currentParticipantId)) {
    window.alert("רק מנהל יכול למחוק אירוע.");
    return;
  }

  if (!window.confirm(`למחוק את "${event.name}"? אי אפשר לשחזר את האירוע אחרי המחיקה.`)) return;

  await saveAndReload({
    ...state,
    events: state.events.filter((item) => item.id !== event.id)
  });
}

async function saveAndReload(state) {
  await saveSharedState(state);
  const url = new URL(window.location.href);
  url.searchParams.delete("event");
  url.searchParams.delete("join");
  window.history.replaceState({}, "", url.toString());
  window.location.reload();
}

function canLeaveEvent(state, event, participantId) {
  if (!event?.participantIds?.includes(participantId)) return false;
  if (event.createdByParticipantId === participantId) return false;
  if (participantHasEventMoneyHistory(event, participantId)) return false;

  const managerIds = eventManagerIds(state, event);
  return !managerIds.includes(participantId) || managerIds.some((id) => id !== participantId);
}

function canManageEvent(state, event, participantId) {
  return eventManagerIds(state, event).includes(participantId);
}

function participantHasEventMoneyHistory(event, participantId) {
  const expenses = event.expenses ?? [];
  const transfers = event.transfers ?? [];

  return (
    expenses.some(
      (expense) =>
        expense.createdByParticipantId === participantId ||
        expense.sharedByParticipantIds?.includes(participantId) ||
        expense.payers?.some((payer) => payer.participantId === participantId)
    ) ||
    transfers.some(
      (transfer) =>
        transfer.fromParticipantId === participantId ||
        transfer.toParticipantId === participantId ||
        transfer.markedPaidByParticipantId === participantId
    )
  );
}

function eventManagerIds(state, event) {
  const group = state.groups?.find((item) => item.id === event.groupId);
  if (group?.adminIds?.length) return uniqueIds(group.adminIds);
  if (event.adminIds?.length) return uniqueIds(event.adminIds);
  return event.createdByParticipantId ? [event.createdByParticipantId] : event.participantIds?.slice(0, 1) ?? [];
}

function uniqueIds(ids) {
  return [...new Set((ids ?? []).filter(Boolean))];
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .event-lifecycle-actions {
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid rgba(184, 45, 45, 0.2);
      border-radius: 8px;
      background: rgba(255, 245, 243, 0.9);
    }

    .event-lifecycle-actions strong,
    .event-lifecycle-actions p {
      margin: 0;
    }
  `;
  document.head.append(style);
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
