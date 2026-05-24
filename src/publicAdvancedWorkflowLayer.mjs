import { calculateSettlement } from "./domain/settlement.mjs";
import { formatSettlementSummary } from "./domain/settlementSummary.mjs";

const STORAGE_KEY = "settle-friends-state";
const LOCAL_PARTICIPANT_KEY = "settle-friends-current-participant";
const app = document.querySelector("#app");
let eventFilter = "open";

if (app) {
  installAdvancedStyles();
  document.addEventListener("click", handleAdvancedClick, true);
  document.addEventListener("change", handleAdvancedChange, true);
  new MutationObserver(enhanceAdvancedWorkflows).observe(app, {
    childList: true,
    subtree: true
  });
  requestAnimationFrame(enhanceAdvancedWorkflows);
}

function enhanceAdvancedWorkflows() {
  enhanceHome();
  enhanceExpenseDialog();
  enhanceSettlement();
  enhanceGroups();
}

function enhanceHome() {
  if (app.querySelector('[data-action="event-status-filter"]')) return;
  const eventList = app.querySelector(".event-list");
  if (!eventList || app.querySelector(".advanced-event-filter")) return;

  const state = loadState();
  const eventSection = eventList.closest(".section") ?? eventList.parentElement;
  const dashboard = renderNextOpenEvent(state);
  const filter = document.createElement("section");
  filter.className = "panel advanced-workflow-panel advanced-event-filter";
  filter.innerHTML = `
    <div class="advanced-panel-title">
      <h2>אירועים</h2>
      <p>אפשר להתמקד במה שעדיין פתוח ולחזור לסגורים כשצריך.</p>
    </div>
    <div class="segmented-control advanced-segments" role="tablist" aria-label="סינון אירועים">
      ${renderFilterButton("open", "פתוחים")}
      ${renderFilterButton("closed", "סגורים")}
      ${renderFilterButton("all", "הכל")}
    </div>
  `;

  if (dashboard && eventSection) eventSection.before(dashboard);
  eventSection?.before(filter);
  applyEventFilter();
}

function renderNextOpenEvent(state) {
  const currentParticipantId = currentParticipant(state);
  const nextEvent = [...(state.events ?? [])]
    .filter((event) => !isClosed(event))
    .filter((event) => !currentParticipantId || event.participantIds?.includes(currentParticipantId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];

  if (!nextEvent) return null;

  const section = document.createElement("section");
  section.className = "panel advanced-workflow-panel advanced-next-event";
  section.innerHTML = `
    <div class="advanced-panel-title">
      <span class="advanced-kicker">פתוח עכשיו</span>
      <h2>${escapeHtml(nextEvent.name)}</h2>
      <p>${nextEvent.expenses?.length ?? 0} הוצאות מחכות לסגירה.</p>
    </div>
    <button class="primary-button" data-action="open-event" data-event-id="${escapeAttribute(nextEvent.id)}">פתח</button>
  `;
  return section;
}

function renderFilterButton(value, label) {
  const selected = eventFilter === value ? "true" : "false";
  return `<button type="button" class="secondary-button" data-advanced-filter="${value}" aria-selected="${selected}">${label}</button>`;
}

function applyEventFilter() {
  const state = loadState();
  const eventsById = new Map((state.events ?? []).map((event) => [event.id, event]));

  app.querySelectorAll("[data-advanced-filter]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.advancedFilter === eventFilter));
  });

  app.querySelectorAll(".event-row[data-event-id]").forEach((row) => {
    const event = eventsById.get(row.dataset.eventId);
    const closed = isClosed(event);
    const hidden =
      (eventFilter === "open" && closed) ||
      (eventFilter === "closed" && !closed);
    row.hidden = hidden;
  });
}

function enhanceExpenseDialog() {
  if (app.querySelector(".expense-template-grid")) return;
  const modal = app.querySelector(".expense-modal");
  const nameInput = modal?.querySelector('[data-action="expense-name"]');
  if (!modal || !nameInput) return;

  const grid = document.createElement("section");
  grid.className = "expense-template-grid advanced-template-grid";
  grid.setAttribute("aria-label", "תבניות הוצאה מהירות");
  grid.innerHTML = ["מונית", "אוכל", "שתייה", "כרטיסים", "חניה", "קניות"]
    .map((template) => `
      <button class="secondary-button" type="button" data-advanced-template="${escapeAttribute(template)}">
        ${escapeHtml(template)}
      </button>
    `)
    .join("");

  nameInput.closest(".field")?.before(grid);
}

function enhanceSettlement() {
  if (app.querySelector('[data-action="share-whatsapp"]')) return;
  const copyButton = app.querySelector('[data-action="copy-settlement"][data-event-id]');
  if (!copyButton || app.querySelector(".advanced-settlement-actions")) return;

  const state = loadState();
  const event = findEvent(state, copyButton.dataset.eventId);
  const actions = document.createElement("div");
  actions.className = "actions advanced-settlement-actions";
  actions.innerHTML = `
    <button class="secondary-button whatsapp-button" data-advanced-action="whatsapp" data-event-id="${escapeAttribute(copyButton.dataset.eventId)}">שלח בוואטסאפ</button>
    <button class="secondary-button" data-advanced-action="${isClosed(event) ? "reopen" : "close"}" data-event-id="${escapeAttribute(copyButton.dataset.eventId)}">
      ${isClosed(event) ? "פתח לעריכה" : "סגור אירוע"}
    </button>
  `;
  copyButton.closest(".actions")?.after(actions);
}

function enhanceGroups() {
  if (app.querySelector(".merge-participants-panel")) return;
  const state = loadState();
  if ((state.participants?.length ?? 0) < 2) return;

  const anchor = app.querySelector(".known-participants-panel") ??
    [...app.querySelectorAll("h2")].find((heading) => heading.textContent?.includes("שמות שנשמרו"))?.closest(".panel");
  if (!anchor || app.querySelector(".advanced-merge-panel")) return;

  const [source, target] = state.participants;
  const panel = document.createElement("section");
  panel.className = "panel section advanced-workflow-panel advanced-merge-panel";
  panel.innerHTML = `
    <div class="advanced-panel-title">
      <h2>איחוד שמות כפולים</h2>
      <p>אם אותו אדם נשמר פעמיים, אפשר לאחד את כל ההיסטוריה לשם אחד.</p>
    </div>
    <div class="advanced-merge-grid">
      <label class="field">
        <span>לאחד את</span>
        <select data-advanced-merge-source>${renderParticipantOptions(state, source.id)}</select>
      </label>
      <label class="field">
        <span>אל תוך</span>
        <select data-advanced-merge-target>${renderParticipantOptions(state, target.id)}</select>
      </label>
    </div>
    <button class="primary-button" data-advanced-action="merge">אחד שמות</button>
  `;
  anchor.after(panel);
}

function renderParticipantOptions(state, selectedId) {
  return (state.participants ?? [])
    .map((participant) => `
      <option value="${escapeAttribute(participant.id)}" ${participant.id === selectedId ? "selected" : ""}>
        ${escapeHtml(participant.displayName)}
      </option>
    `)
    .join("");
}

function handleAdvancedClick(event) {
  const filterButton = event.target.closest("[data-advanced-filter]");
  if (filterButton) {
    event.preventDefault();
    eventFilter = filterButton.dataset.advancedFilter;
    applyEventFilter();
    return;
  }

  const templateButton = event.target.closest("[data-advanced-template]");
  if (templateButton) {
    event.preventDefault();
    const input = app.querySelector('.expense-modal [data-action="expense-name"]');
    if (input) {
      input.value = templateButton.dataset.advancedTemplate;
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      input.focus();
    }
    return;
  }

  const action = event.target.closest("[data-advanced-action]");
  if (!action) return;

  if (action.dataset.advancedAction === "whatsapp") {
    event.preventDefault();
    shareEventOnWhatsApp(action.dataset.eventId);
  }

  if (action.dataset.advancedAction === "close") {
    event.preventDefault();
    setEventClosed(action.dataset.eventId, true);
  }

  if (action.dataset.advancedAction === "reopen") {
    event.preventDefault();
    setEventClosed(action.dataset.eventId, false);
  }

  if (action.dataset.advancedAction === "merge") {
    event.preventDefault();
    mergeSelectedParticipants();
  }
}

function handleAdvancedChange(event) {
  if (!event.target.matches("[data-advanced-merge-source], [data-advanced-merge-target]")) return;
  const panel = event.target.closest(".advanced-merge-panel");
  const source = panel?.querySelector("[data-advanced-merge-source]");
  const target = panel?.querySelector("[data-advanced-merge-target]");
  if (!source || !target || source.value !== target.value) return;

  const state = loadState();
  const replacement = state.participants.find((participant) => participant.id !== source.value);
  if (replacement) target.value = replacement.id;
}

function shareEventOnWhatsApp(eventId) {
  const state = loadState();
  const event = findEvent(state, eventId);
  if (!event) return;

  const participants = eventParticipants(state, event);
  const settlement = calculateSettlement(participants, event.expenses ?? []);
  const summary = formatSettlementSummary({
    eventName: event.name,
    participants,
    transfers: event.transfers?.length ? event.transfers : settlement.transfers
  });
  window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, "_blank", "noopener");
}

async function setEventClosed(eventId, closed) {
  const state = loadState();
  const nextState = {
    ...state,
    events: (state.events ?? []).map((event) => {
      if (event.id !== eventId) return event;
      if (closed) {
        return { ...event, locked: true, closedAt: new Date().toISOString() };
      }
      const { closedAt, ...openEvent } = event;
      return { ...openEvent, locked: false };
    })
  };

  await saveState(nextState);
  window.location.reload();
}

async function mergeSelectedParticipants() {
  const panel = app.querySelector(".advanced-merge-panel");
  const sourceId = panel?.querySelector("[data-advanced-merge-source]")?.value;
  const targetId = panel?.querySelector("[data-advanced-merge-target]")?.value;
  if (!sourceId || !targetId || sourceId === targetId) return;

  await saveState(mergeParticipants(loadState(), sourceId, targetId));
  window.location.reload();
}

function mergeParticipants(state, sourceId, targetId) {
  return {
    ...state,
    currentParticipantId: replaceId(state.currentParticipantId, sourceId, targetId),
    participants: (state.participants ?? []).filter((participant) => participant.id !== sourceId),
    groups: (state.groups ?? []).map((group) => ({
      ...group,
      memberIds: uniqueIds((group.memberIds ?? []).map((id) => replaceId(id, sourceId, targetId))),
      adminIds: uniqueIds((group.adminIds ?? []).map((id) => replaceId(id, sourceId, targetId)))
    })),
    events: (state.events ?? []).map((event) => ({
      ...event,
      participantIds: uniqueIds((event.participantIds ?? []).map((id) => replaceId(id, sourceId, targetId))),
      adminIds: uniqueIds((event.adminIds ?? []).map((id) => replaceId(id, sourceId, targetId))),
      createdByParticipantId: replaceId(event.createdByParticipantId, sourceId, targetId),
      expenses: (event.expenses ?? []).map((expense) => ({
        ...expense,
        createdByParticipantId: replaceId(expense.createdByParticipantId, sourceId, targetId),
        sharedByParticipantIds: uniqueIds((expense.sharedByParticipantIds ?? []).map((id) => replaceId(id, sourceId, targetId))),
        payers: mergePayers((expense.payers ?? []).map((payer) => ({
          ...payer,
          participantId: replaceId(payer.participantId, sourceId, targetId)
        })))
      })),
      transfers: (event.transfers ?? [])
        .map((transfer) => ({
          ...transfer,
          fromParticipantId: replaceId(transfer.fromParticipantId, sourceId, targetId),
          toParticipantId: replaceId(transfer.toParticipantId, sourceId, targetId),
          markedPaidByParticipantId: replaceId(transfer.markedPaidByParticipantId, sourceId, targetId)
        }))
        .filter((transfer) => transfer.fromParticipantId !== transfer.toParticipantId)
    }))
  };
}

function loadState() {
  try {
    const state = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      participants: [],
      groups: [],
      events: [],
      ...state
    };
  } catch {
    return { participants: [], groups: [], events: [] };
  }
}

async function saveState(state) {
  const sharedState = {
    ...state,
    currentParticipantId: state.participants?.[0]?.id ?? state.currentParticipantId ?? ""
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sharedState));
  try {
    await fetch("/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sharedState)
    });
  } catch {
    // The local copy is already saved.
  }
}

function findEvent(state, eventId) {
  return (state.events ?? []).find((event) => event.id === eventId);
}

function eventParticipants(state, event) {
  const ids = new Set(event.participantIds ?? []);
  return (state.participants ?? []).filter((participant) => ids.has(participant.id));
}

function currentParticipant(state) {
  const localId = window.localStorage.getItem(LOCAL_PARTICIPANT_KEY);
  return state.participants?.some((participant) => participant.id === localId)
    ? localId
    : state.currentParticipantId;
}

function isClosed(event) {
  return Boolean(event?.locked || event?.closedAt);
}

function replaceId(value, sourceId, targetId) {
  return value === sourceId ? targetId : value;
}

function uniqueIds(ids) {
  return [...new Set((ids ?? []).filter(Boolean))];
}

function mergePayers(payers) {
  const totals = new Map();
  for (const payer of payers) {
    totals.set(payer.participantId, (totals.get(payer.participantId) ?? 0) + payer.amount);
  }
  return [...totals.entries()].map(([participantId, amount]) => ({ participantId, amount }));
}

function installAdvancedStyles() {
  if (document.querySelector("#advanced-workflow-layer-style")) return;
  const style = document.createElement("style");
  style.id = "advanced-workflow-layer-style";
  style.textContent = `
    .advanced-workflow-panel {
      position: relative;
      overflow: hidden;
    }

    .advanced-workflow-panel::after {
      content: "";
      position: absolute;
      inset-inline-start: 0;
      top: 14px;
      bottom: 14px;
      width: 4px;
      border-radius: 8px;
      background: linear-gradient(180deg, var(--accent, #087b74), var(--warm, #cf5d3f));
    }

    .advanced-panel-title h2 {
      margin-bottom: 4px;
    }

    .advanced-panel-title p {
      margin-bottom: 0;
      color: var(--muted, #63756f);
      font-weight: 700;
    }

    .advanced-kicker {
      display: inline-block;
      margin-bottom: 4px;
      color: var(--accent, #087b74);
      font-weight: 900;
    }

    .advanced-next-event,
    .advanced-event-filter {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      margin: 16px 0;
    }

    .advanced-segments,
    .advanced-template-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .advanced-segments [aria-selected="true"] {
      background: var(--accent, #087b74);
      color: white;
      border-color: var(--accent, #087b74);
    }

    .advanced-template-grid {
      margin: 6px 0 14px;
    }

    .advanced-template-grid .secondary-button {
      min-height: 40px;
    }

    .advanced-settlement-actions {
      margin-top: 10px;
    }

    .whatsapp-button {
      background: #e5f8ee;
      border-color: #9bd9b8;
      color: #075e32;
    }

    .advanced-merge-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    @media (max-width: 520px) {
      .advanced-next-event,
      .advanced-event-filter,
      .advanced-merge-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.append(style);
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
