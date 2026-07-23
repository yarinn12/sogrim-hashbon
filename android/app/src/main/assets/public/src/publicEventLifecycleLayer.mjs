import { loadState } from "./data/localStore.mjs";

const STYLE_ID = "sogrim-event-lifecycle-style";
const ACTIONS_CLASS = "event-lifecycle-actions";

let enhancementScheduled = false;

installEventLifecycleLayer();

function installEventLifecycleLayer() {
  injectStyles();
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
          <button class="secondary-button danger-button" data-action="leave-event" data-event-id="${escapeAttribute(eventId)}" ${canLeave ? "" : "disabled"}>עזוב אירוע</button>
          <button class="secondary-button danger-button" data-action="delete-event" data-event-id="${escapeAttribute(eventId)}" ${canDelete ? "" : "disabled"}>מחק אירוע</button>
        </div>
      `;

      const actions = settingsButton.closest(".actions");
      actions?.after(zone) ?? dialog.append(zone);
    });
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
  return event.createdByParticipantId
    ? [event.createdByParticipantId]
    : event.participantIds?.slice(0, 1) ?? [];
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
