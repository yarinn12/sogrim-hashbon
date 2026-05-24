import { loadState } from "./data/localStore.mjs";
import { calculateSettlement } from "./domain/settlement.mjs";
import { formatMoney } from "./domain/money.mjs";

const app = document.querySelector("#app");
let eventWorkspaceScheduled = false;

if (app) {
  installEventWorkspaceStyles();
  new MutationObserver(scheduleEventWorkspaceEnhancement).observe(app, {
    childList: true,
    subtree: true
  });
  scheduleEventWorkspaceEnhancement();
}

function scheduleEventWorkspaceEnhancement() {
  if (eventWorkspaceScheduled) return;
  eventWorkspaceScheduled = true;

  requestAnimationFrame(() => {
    eventWorkspaceScheduled = false;
    enhanceEventWorkspace();
    enhanceSettingsDialog();
    enhanceSettlementWorkspace();
  });
}

function enhanceEventWorkspace() {
  const eventId = currentEventId();
  if (!eventId || app.querySelector(".event-workspace-nav")) return;

  const state = loadState();
  const event = state.events?.find((item) => item.id === eventId);
  if (!event || app.querySelector(".settlement-hero")) return;

  const summary = app.querySelector(".summary-strip");
  if (!summary) return;

  summary.after(renderWorkspaceNav(event), renderInsightPanel(state, event));
  hideRepeatedEventControls();
}

function enhanceSettingsDialog() {
  const modal = app.querySelector(".event-modal");
  const eventId = currentEventId();
  if (!modal || !eventId || modal.querySelector('[data-action="duplicate-event"]')) return;

  const actionRow = modal.querySelector(".event-modal-body .actions");
  if (!actionRow) return;

  const duplicateButton = document.createElement("button");
  duplicateButton.className = "secondary-button";
  duplicateButton.dataset.action = "duplicate-event";
  duplicateButton.dataset.eventId = eventId;
  duplicateButton.textContent = "צור אירוע דומה";
  actionRow.append(duplicateButton);
}

function enhanceSettlementWorkspace() {
  const copyButton = app.querySelector('[data-action="copy-settlement"][data-event-id]');
  if (!copyButton || app.querySelector(".settlement-hero")) return;

  const state = loadState();
  const event = state.events?.find((item) => item.id === copyButton.dataset.eventId);
  const summary = app.querySelector(".summary-strip");
  if (!event || !summary) return;

  summary.before(renderSettlementHero(state, event));
  const repeatedActions = app.querySelector(".section-title-actions");
  if (repeatedActions) repeatedActions.hidden = true;
}

function renderWorkspaceNav(event) {
  const nav = document.createElement("nav");
  nav.className = "event-workspace-nav";
  nav.setAttribute("aria-label", "ניווט באירוע");
  nav.innerHTML = `
    <a class="event-workspace-tab is-active" href="#event-expenses">הוצאות</a>
    <button class="event-workspace-tab" data-action="open-event-participants" data-event-id="${escapeAttribute(event.id)}">משתתפים</button>
    <button class="event-workspace-tab" data-action="settle" data-event-id="${escapeAttribute(event.id)}" ${event.expenses?.length ? "" : "disabled"}>סיכום</button>
    <button class="event-workspace-tab" data-action="open-event-settings" data-event-id="${escapeAttribute(event.id)}">הגדרות</button>
  `;
  return nav;
}

function renderInsightPanel(state, event) {
  const participants = eventParticipants(state, event);
  const settlement = calculateSettlement(participants, event.expenses ?? []);
  const transfers = event.transfers?.length ? event.transfers : settlement.transfers;
  const pendingTransfers = transfers.filter((transfer) => transfer.status !== "paid");
  const totalExpenses = (event.expenses ?? []).reduce((sum, expense) => sum + expense.total, 0);
  const issueCount = settlement.issues?.length ?? 0;
  const status = eventStatus(event, settlement, pendingTransfers);
  const message = statusMessage(status);

  const panel = document.createElement("section");
  panel.className = "panel event-insight-panel";
  panel.innerHTML = `
    <div class="event-insight-main">
      <span class="status-chip ${issueCount ? "is-locked" : "is-open"}">${escapeHtml(message.label)}</span>
      <h2>${escapeHtml(message.title)}</h2>
      <p class="muted">${escapeHtml(message.description)}</p>
      <button class="primary-button" data-action="${status === "empty" || status === "needs-review" ? "show-expense-form" : "settle"}" data-event-id="${escapeAttribute(event.id)}">
        ${status === "empty" || status === "needs-review" ? "הוסף הוצאה" : "פתח סיכום"}
      </button>
    </div>
    <div class="event-insight-metrics" aria-label="מצב האירוע">
      <div><span>הוצאות</span><strong>${event.expenses?.length ?? 0}</strong></div>
      <div><span>משתתפים</span><strong>${participants.length}</strong></div>
      <div><span>סך האירוע</span><strong class="amount">₪${formatMoney(totalExpenses)}</strong></div>
      <div><span>פתוח להעברה</span><strong class="amount">₪${formatMoney(sumPending(pendingTransfers))}</strong></div>
    </div>
  `;
  return panel;
}

function renderSettlementHero(state, event) {
  const participants = eventParticipants(state, event);
  const settlement = calculateSettlement(participants, event.expenses ?? []);
  const transfers = event.transfers?.length ? event.transfers : settlement.transfers;
  const pendingTransfers = transfers.filter((transfer) => transfer.status !== "paid");
  const pendingTotal = sumPending(pendingTransfers);
  const title = pendingTransfers.length
    ? `${pendingTransfers.length} העברות נשארו פתוחות`
    : "הכל מאוזן";

  const hero = document.createElement("section");
  hero.className = "panel settlement-hero";
  hero.innerHTML = `
    <div class="settlement-hero-main">
      <span class="status-chip ${pendingTransfers.length ? "is-locked" : "is-open"}">${isEventClosed(event) ? "אירוע סגור" : "לפני סגירה"}</span>
      <h2>${escapeHtml(title)}</h2>
      <p class="muted">${pendingTransfers.length ? "זה הסיכום שכדאי לשלוח לחברים. אחרי שמישהו מעביר, מסמנים כשולם." : "אין כרגע העברות פתוחות בין המשתתפים."}</p>
      <strong class="settlement-hero-amount amount">₪${formatMoney(pendingTotal)}</strong>
    </div>
    <div class="settlement-hero-actions">
      <button class="secondary-button" data-action="copy-settlement" data-event-id="${escapeAttribute(event.id)}">העתק סיכום</button>
      <button class="secondary-button whatsapp-button" data-action="share-whatsapp" data-event-id="${escapeAttribute(event.id)}">שלח בוואטסאפ</button>
      <button class="secondary-button" data-action="copy-event-report" data-event-id="${escapeAttribute(event.id)}">העתק דוח מלא</button>
      ${
        isEventClosed(event)
          ? `<button class="secondary-button" data-action="reopen-event" data-event-id="${escapeAttribute(event.id)}">פתח לעריכה</button>`
          : `<button class="primary-button" data-action="close-event" data-event-id="${escapeAttribute(event.id)}">סגור ונעל אירוע</button>`
      }
    </div>
  `;
  return hero;
}

function hideRepeatedEventControls() {
  const participantPanel = [...app.querySelectorAll(".panel")].find((panel) =>
    panel.querySelector("h2")?.textContent?.includes("משתתפים באירוע")
  );
  if (participantPanel) participantPanel.hidden = true;

  const duplicateButton = app.querySelector('section.screen > section [data-action="duplicate-event"]');
  const repeatedActions = duplicateButton?.closest(".section");
  if (repeatedActions) repeatedActions.hidden = true;

  const expenseSection = [...app.querySelectorAll("section.section")].find((section) =>
    section.querySelector("h2")?.textContent?.includes("הוצאות")
  );
  if (expenseSection && !expenseSection.id) expenseSection.id = "event-expenses";
}

function currentEventId() {
  return (
    app.querySelector('[data-action="show-expense-form"][data-event-id]')?.dataset.eventId ||
    app.querySelector('[data-action="settle"][data-event-id]')?.dataset.eventId ||
    app.querySelector('[data-action="open-event-participants"][data-event-id]')?.dataset.eventId ||
    app.querySelector('[data-action="copy-settlement"][data-event-id]')?.dataset.eventId ||
    ""
  );
}

function eventParticipants(state, event) {
  return (state.participants ?? []).filter((participant) =>
    event.participantIds?.includes(participant.id)
  );
}

function eventStatus(event, settlement, pendingTransfers) {
  if ((settlement.issues?.length ?? 0) > 0) return "needs-review";
  if ((event.expenses?.length ?? 0) === 0) return "empty";
  if (pendingTransfers.length > 0 && (event.transfers?.length ?? 0) > 0) return "pending-payments";
  if ((settlement.transfers?.length ?? 0) > 0) return "ready-to-settle";
  return "balanced";
}

function statusMessage(status) {
  const messages = {
    empty: {
      label: "מתחילים",
      title: "עוד לא נוספה הוצאה",
      description: "הכפתור הראשון פותח חלון נקי להוצאה, ואחרי השמירה חוזרים לכאן."
    },
    "ready-to-settle": {
      label: "מוכן לסיכום",
      title: "יש הוצאות ואפשר לראות מי מעביר למי",
      description: "החישוב מתחשב במי שילם, מי השתתף בכל הוצאה, ובכמה העברות צריך לסגור."
    },
    balanced: {
      label: "מאוזן",
      title: "כרגע אין חוב פתוח בין המשתתפים",
      description: "אפשר עדיין להוסיף הוצאות, או לסגור את האירוע כדי לשמור את המצב."
    },
    "pending-payments": {
      label: "ממתין להעברות",
      title: "הסיכום מוכן ונשאר לסמן תשלומים",
      description: "ברגע שמישהו שילם, מסמנים את ההעברה והסכום הפתוח מתעדכן."
    },
    "needs-review": {
      label: "צריך בדיקה",
      title: "יש הוצאה שלא נכנסה לחישוב",
      description: "כדאי לוודא שסכומי המשלמים שווים לסכום הכולל ושיש משתתפים מסומנים."
    }
  };
  return messages[status] ?? messages.empty;
}

function sumPending(transfers) {
  return transfers.reduce((sum, transfer) => sum + (transfer.amount ?? 0), 0);
}

function isEventClosed(event) {
  return Boolean(event?.closedAt || event?.locked);
}

function installEventWorkspaceStyles() {
  if (document.querySelector("#public-event-workspace-styles")) return;
  const style = document.createElement("style");
  style.id = "public-event-workspace-styles";
  style.textContent = `
    .event-workspace-nav {
      position: sticky;
      top: 10px;
      z-index: 10;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      margin: 14px 0 12px;
      padding: 6px;
      border: 1px solid rgba(18, 29, 27, 0.08);
      border-radius: 8px;
      background: rgba(255, 254, 253, 0.9);
      box-shadow: var(--shadow-soft);
      backdrop-filter: blur(14px);
    }
    .event-workspace-tab {
      min-height: 40px;
      display: inline-grid;
      place-items: center;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-weight: 900;
      text-decoration: none;
    }
    .event-workspace-tab.is-active,
    .event-workspace-tab:hover {
      background: var(--accent-soft);
      color: var(--accent-strong);
    }
    .event-insight-panel,
    .settlement-hero {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.95fr);
      gap: 18px;
      align-items: center;
      margin: 14px 0 18px;
      overflow: hidden;
    }
    .event-insight-main,
    .settlement-hero-main {
      display: grid;
      justify-items: start;
      gap: 8px;
    }
    .event-insight-main h2,
    .event-insight-main p,
    .settlement-hero-main h2,
    .settlement-hero-main p {
      margin-bottom: 0;
    }
    .event-insight-metrics,
    .settlement-hero-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .event-insight-metrics div {
      min-height: 72px;
      display: grid;
      align-content: center;
      gap: 3px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(236, 247, 244, 0.58);
    }
    .event-insight-metrics span {
      color: var(--muted);
      font-size: 0.84rem;
      font-weight: 800;
    }
    .settlement-hero {
      border-color: rgba(8, 123, 116, 0.18);
      background:
        linear-gradient(135deg, rgba(8, 123, 116, 0.12), rgba(248, 224, 143, 0.18)),
        var(--panel);
    }
    .settlement-hero-amount {
      font-size: clamp(28px, 6vw, 46px);
      color: var(--accent-strong);
      line-height: 1;
    }
    @media (max-width: 440px) {
      .event-workspace-nav {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        top: 6px;
      }
      .event-insight-panel,
      .settlement-hero,
      .event-insight-metrics,
      .settlement-hero-actions {
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
