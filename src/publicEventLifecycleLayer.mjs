import { loadState } from "./data/localStore.mjs";
import { canLeaveEvent } from "./domain/appActions.mjs";
import { canManageEventSettings } from "./domain/permissions.mjs";

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

      const canLeave = canLeaveEvent(state, event.id, state.currentParticipantId);
      const canDelete = canManageEventSettings(
        state,
        event,
        state.currentParticipantId
      );
      const zone = document.createElement("section");
      zone.className = `${ACTIONS_CLASS} event-danger-zone section`;
      zone.innerHTML = `
        <div>
          <strong>עזיבה ומחיקה</strong>
          <p class="muted">בעזיבה נשמרת היסטוריה כספית בשם לא מחובר. מחיקה זמינה למנהל בלבד.</p>
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
