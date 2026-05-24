import {
  loadLocalProfile,
  loadSharedState,
  loadState,
  saveSharedState,
  saveState
} from "./data/localStore.mjs";
import {
  buildEventInviteUrl,
  parseInviteEventId
} from "./domain/inviteLinks.mjs";
import { ensureNamedParticipant } from "./domain/userProfile.mjs";

const app = document.querySelector("#app");
const STYLE_ID = "public-join-event-layer-style";

injectJoinEventStyle();
document.addEventListener("click", handleJoinEventClick);
watchApp();
enhanceJoinEventFlow();

function watchApp() {
  if (!app) return;
  new MutationObserver(() => enhanceJoinEventFlow()).observe(app, {
    childList: true,
    subtree: true
  });
}

function enhanceJoinEventFlow() {
  const screen = document.querySelector(".screen");
  if (!screen) return;

  enhanceHomeActions(screen);
  enhanceNewEventScreen(screen);
  reduceNewEventChromeRepetition(screen);
}

function enhanceHomeActions(screen) {
  if (!screen.querySelector('[data-action="new-event"]')) return;

  const heroActions = screen.querySelector(".hero-actions");
  if (heroActions && !heroActions.querySelector('[data-action="join-event-screen"], [data-public-open-join-event]')) {
    const joinButton = document.createElement("button");
    joinButton.type = "button";
    joinButton.className = "secondary-button";
    joinButton.dataset.publicOpenJoinEvent = "true";
    joinButton.textContent = "הצטרפות לאירוע";
    heroActions.insertBefore(joinButton, heroActions.querySelector('[data-action="groups"]'));
  }

  screen
    .querySelectorAll('.personal-next-step [data-action="new-event"]')
    .forEach((button) => button.remove());
}

function enhanceNewEventScreen(screen) {
  if (!screen.querySelector('[data-action="create-event"]')) return;

  screen.querySelector(".brand .eyebrow")?.replaceChildren("אירועים");
  screen.querySelector(".brand h1")?.replaceChildren("פותחים או מצטרפים לחשבון");

  const nativeJoinPanel = screen.querySelector(".join-event-panel");
  if (nativeJoinPanel) {
    nativeJoinPanel.classList.add("public-join-event-panel");
    markCreatePanel(screen);
    return;
  }

  const createPanel = screen.querySelector(".panel");
  if (!createPanel || screen.querySelector(".public-join-event-panel")) return;

  createPanel.classList.add("create-event-panel");
  createPanel.insertAdjacentHTML("beforebegin", renderJoinPanel());
}

function reduceNewEventChromeRepetition(screen) {
  if (!screen.querySelector('[data-action="create-event"]')) return;

  const contextBar = screen.querySelector(".product-context-bar");
  if (!contextBar) return;

  const title = contextBar.querySelector(".product-context-copy strong");
  if (title?.textContent.trim() === "אירוע חדש") {
    title.textContent = "יצירה או הצטרפות";
  }

  const helper = contextBar.querySelector(".product-context-copy small");
  if (helper) {
    helper.textContent = "אפשר לפתוח אירוע חדש או להדביק קישור שקיבלת מחבר.";
  }

  const actions = contextBar.querySelector(".product-context-actions");
  if (actions && !actions.querySelector('[data-public-click="join-existing-event"], [data-public-open-join-event]')) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.dataset.publicClick = "join-existing-event";
    button.textContent = "הצטרף";
    actions.insertBefore(button, actions.lastElementChild);
  }
}

function markCreatePanel(screen) {
  screen
    .querySelector('[data-action="create-event"]')
    ?.closest(".panel")
    ?.classList.add("create-event-panel");
}

function renderJoinPanel() {
  return `
    <section class="panel join-event-panel public-join-event-panel">
      <div class="section-title-row">
        <div>
          <h2>הצטרפות לאירוע קיים</h2>
          <p class="muted">מדביקים קישור הצטרפות שקיבלת מחבר.</p>
        </div>
      </div>
      <label class="field">
        <span>קישור הצטרפות</span>
        <input data-public-join-event-link placeholder="https://sogrim-hashbon.vercel.app/?event=..." />
      </label>
      <p class="field-error" data-public-join-event-error hidden></p>
      <div class="actions section">
        <button class="secondary-button" type="button" data-public-join-existing-event>הצטרף לאירוע</button>
      </div>
    </section>
  `;
}

function handleJoinEventClick(event) {
  const openJoinTarget = event.target.closest("[data-public-open-join-event]");
  if (openJoinTarget) {
    event.preventDefault();
    openJoinEventScreen();
    return;
  }

  const joinTarget = event.target.closest("[data-public-join-existing-event]");
  if (joinTarget) {
    event.preventDefault();
    joinExistingEventFromPublicPanel();
  }
}

function openJoinEventScreen() {
  const nativeJoinButton = document.querySelector('[data-action="join-event-screen"]:not([disabled])');
  if (nativeJoinButton) {
    nativeJoinButton.click();
    return;
  }

  document.querySelector('[data-action="new-event"]:not([disabled])')?.click();
}

async function joinExistingEventFromPublicPanel() {
  const input = document.querySelector("[data-public-join-event-link]");
  const error = document.querySelector("[data-public-join-event-error]");
  const link = input?.value.trim() ?? "";

  setJoinError(error, "");
  if (!link) {
    setJoinError(error, "צריך להדביק קישור הצטרפות.");
    return;
  }

  const eventId = parseEventId(link);
  if (!eventId) {
    setJoinError(error, "הקישור לא נראה כמו קישור הצטרפות תקין.");
    return;
  }

  let state = loadState();
  let targetEvent = findEvent(state, eventId);
  if (!targetEvent) {
    state = await loadSharedState();
    targetEvent = findEvent(state, eventId);
  }

  if (!targetEvent) {
    setJoinError(error, "לא מצאנו אירוע לפי הקישור הזה. כדאי לוודא שהקישור הועתק במלואו.");
    return;
  }

  const profile = loadLocalProfile();
  if (profile) {
    state = ensureNamedParticipant(
      state,
      {
        ...profile,
        id: profile.participantId,
        displayName: profile.displayName
      },
      eventId
    );
    saveState(state);
    await saveSharedState(state);
  }

  window.location.href = buildEventInviteUrl(window.location.href, eventId);
}

function parseEventId(value) {
  try {
    return parseInviteEventId(value) ?? "";
  } catch {
    return value.startsWith("event-") ? value : "";
  }
}

function findEvent(state, eventId) {
  return (state.events ?? []).find((event) => event.id === eventId);
}

function setJoinError(error, message) {
  if (!error) return;

  error.textContent = message;
  error.hidden = !message;
}

function injectJoinEventStyle() {
  if (document.querySelector(`#${STYLE_ID}`)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .join-event-panel,
    .create-event-panel {
      position: relative;
      overflow: hidden;
    }

    .join-event-panel {
      margin-bottom: 14px;
      border-color: rgba(8, 123, 116, 0.2);
      background:
        linear-gradient(135deg, rgba(223, 243, 239, 0.96), rgba(255, 254, 253, 0.92)),
        var(--panel);
    }

    .join-event-panel::before,
    .create-event-panel::before {
      content: "";
      position: absolute;
      inset-inline-start: 0;
      top: 18px;
      bottom: 18px;
      width: 4px;
      border-radius: 8px;
      background: linear-gradient(180deg, var(--accent), var(--warm));
    }
  `;
  document.head.append(style);
}
