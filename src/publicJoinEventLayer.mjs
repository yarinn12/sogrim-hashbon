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
const EVENT_NAME_PLACEHOLDER = "אוכל / מונית / קניות...";
const DEFAULT_EVENT_NAMES = new Set(["אירוע חדש", "יציאה חדשה"]);
const MODE_CREATE = "create";
const MODE_JOIN = "join";
const MODE_STORAGE_KEY = "sogrimNewEventMode";

let requestedEventMode = readRequestedEventMode();
let joinEnhancementScheduled = false;

injectJoinEventStyle();
document.addEventListener("click", rememberRequestedEventMode, true);
document.addEventListener("click", handleJoinEventClick);
watchApp();
enhanceJoinEventFlow();

function watchApp() {
  if (!app) return;
  new MutationObserver(scheduleJoinEventEnhancement).observe(app, {
    childList: true,
    subtree: true
  });
}

function scheduleJoinEventEnhancement() {
  if (joinEnhancementScheduled) return;
  joinEnhancementScheduled = true;
  requestAnimationFrame(() => {
    joinEnhancementScheduled = false;
    enhanceJoinEventFlow();
  });
}

function enhanceJoinEventFlow() {
  const screen = document.querySelector(".screen");
  if (!screen) return;

  enhanceHomeActions(screen);
  enhanceNewEventScreen(screen);
  reduceNewEventChromeRepetition(screen);
  enhanceNewEventNameInput(screen);
  applyNewEventMode(screen);
}

function rememberRequestedEventMode(event) {
  const target = event.target.closest("[data-action], [data-public-click], [data-public-open-join-event], [data-public-mode-switch]");
  if (!target) return;

  const modeSwitch = target.dataset.publicModeSwitch;
  if (modeSwitch) {
    event.preventDefault();
    setRequestedEventMode(modeSwitch);
    enhanceJoinEventFlow();
    return;
  }

  const publicClick = target.dataset.publicClick;
  if (publicClick === "join-existing-event") {
    event.preventDefault();
    event.stopPropagation();
    setRequestedEventMode(MODE_JOIN);
    enhanceJoinEventFlow();
    focusJoinEventPanel();
    return;
  }

  if (publicClick === "create-event" && requestedEventMode === MODE_JOIN) {
    event.preventDefault();
    event.stopPropagation();
    setRequestedEventMode(MODE_CREATE);
    enhanceJoinEventFlow();
    return;
  }

  const action = target.dataset.action ?? publicClick;
  if (action === "new-event") setRequestedEventMode(MODE_CREATE);
  if (action === "join-event-screen" || target.dataset.publicOpenJoinEvent) {
    setRequestedEventMode(MODE_JOIN);
  }
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

  setTextIfChanged(screen.querySelector(".brand .eyebrow"), "אירועים");
  setTextIfChanged(screen.querySelector(".brand h1"), "פותחים או מצטרפים לחשבון");

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
  if (title?.textContent.trim() === "אירוע חדש") setTextIfChanged(title, "יצירה או הצטרפות");

  const helper = contextBar.querySelector(".product-context-copy small");
  setTextIfChanged(helper, "אפשר לפתוח אירוע חדש או להדביק קישור שקיבלת מחבר.");

  const actions = contextBar.querySelector(".product-context-actions");
  if (actions && !actions.querySelector('[data-public-open-join-panel], [data-public-mode-switch="join"], [data-public-submit-join], [data-public-click="join-existing-event"]')) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.dataset.publicOpenJoinPanel = "true";
    button.textContent = "הצטרף";
    actions.insertBefore(button, actions.lastElementChild);
  }
}

function enhanceNewEventNameInput(screen) {
  const input = screen.querySelector('[data-action="new-event-name"]');
  if (!input) return;

  if (input.placeholder !== EVENT_NAME_PLACEHOLDER) {
    input.placeholder = EVENT_NAME_PLACEHOLDER;
  }

  if (DEFAULT_EVENT_NAMES.has(input.value.trim())) {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function applyNewEventMode(screen) {
  if (!screen.querySelector('[data-action="create-event"]')) return;

  const mode = requestedEventMode === MODE_JOIN ? MODE_JOIN : MODE_CREATE;
  const joinPanel = screen.querySelector(".join-event-panel");
  const createPanel = screen.querySelector(".create-event-panel");

  if (joinPanel) joinPanel.hidden = mode !== MODE_JOIN;
  if (createPanel) createPanel.hidden = mode !== MODE_CREATE;

  const title = mode === MODE_JOIN ? "הצטרפות לאירוע" : "אירוע חדש";
  const helper = mode === MODE_JOIN
    ? "מדביקים קישור שקיבלת מחבר ונכנסים ישר לאירוע."
    : "מגדירים שם, קבוצה ומשתתפים ואז מתחילים להכניס הוצאות.";

  setTextIfChanged(screen.querySelector(".brand h1"), title);
  updateContextForMode(screen, mode, title, helper);
}

function updateContextForMode(screen, mode, title, helper) {
  const contextBar = screen.querySelector(".product-context-bar");
  if (!contextBar) return;

  setTextIfChanged(contextBar.querySelector(".product-context-copy strong"), title);
  setTextIfChanged(contextBar.querySelector(".product-context-copy small"), helper);

  const createButton = contextBar.querySelector('[data-public-click="create-event"], [data-public-mode-switch="create"]');
  const joinButton = contextBar.querySelector('[data-public-click="join-existing-event"], [data-public-open-join-panel], [data-public-mode-switch="join"], [data-public-submit-join]');

  if (mode === MODE_JOIN) {
    convertButton(createButton, {
      label: "פתח אירוע חדש",
      modeSwitch: MODE_CREATE,
      primary: false
    });
    convertButton(joinButton, {
      label: "הצטרף לאירוע",
      submitJoin: true,
      primary: true
    });
    return;
  }

  convertButton(createButton, {
    label: "צור אירוע",
    publicClick: "create-event",
    primary: true
  });
  convertButton(joinButton, {
    label: "הצטרפות לאירוע",
    modeSwitch: MODE_JOIN,
    primary: false
  });
}

function convertButton(button, options) {
  if (!button) return;

  setTextIfChanged(button, options.label);
  button.classList.toggle("primary-button", Boolean(options.primary));
  button.classList.toggle("secondary-button", !options.primary);

  delete button.dataset.publicClick;
  delete button.dataset.publicOpenJoinPanel;
  delete button.dataset.publicModeSwitch;
  delete button.dataset.publicSubmitJoin;

  if (options.publicClick) button.dataset.publicClick = options.publicClick;
  if (options.modeSwitch) button.dataset.publicModeSwitch = options.modeSwitch;
  if (options.submitJoin) button.dataset.publicSubmitJoin = "true";
}

function setTextIfChanged(node, text) {
  if (!node || node.textContent === text) return;
  node.textContent = text;
}

function readRequestedEventMode() {
  try {
    return sessionStorage.getItem(MODE_STORAGE_KEY) === MODE_JOIN ? MODE_JOIN : MODE_CREATE;
  } catch {
    return MODE_CREATE;
  }
}

function setRequestedEventMode(mode) {
  requestedEventMode = mode === MODE_JOIN ? MODE_JOIN : MODE_CREATE;
  try {
    sessionStorage.setItem(MODE_STORAGE_KEY, requestedEventMode);
  } catch {}
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
    setRequestedEventMode(MODE_JOIN);
    openJoinEventScreen();
    return;
  }

  const openJoinPanelTarget = event.target.closest("[data-public-open-join-panel]");
  if (openJoinPanelTarget) {
    event.preventDefault();
    setRequestedEventMode(MODE_JOIN);
    enhanceJoinEventFlow();
    focusJoinEventPanel();
    return;
  }

  const submitJoinTarget = event.target.closest("[data-public-submit-join]");
  if (submitJoinTarget) {
    event.preventDefault();
    joinExistingEventFromPublicPanel();
    return;
  }

  const joinTarget = event.target.closest("[data-public-join-existing-event]");
  if (joinTarget) {
    event.preventDefault();
    joinExistingEventFromPublicPanel();
  }
}

function openJoinEventScreen() {
  setRequestedEventMode(MODE_JOIN);
  const nativeJoinButton = document.querySelector('[data-action="join-event-screen"]:not([disabled])');
  if (nativeJoinButton) {
    nativeJoinButton.click();
    return;
  }

  document.querySelector('[data-action="new-event"]:not([disabled])')?.click();
}

function focusJoinEventPanel() {
  const input = document.querySelector("[data-public-join-event-link], [data-action=\"join-event-link\"]");
  input?.scrollIntoView({ behavior: "smooth", block: "center" });
  input?.focus();
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
