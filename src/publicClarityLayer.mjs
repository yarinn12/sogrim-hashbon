const app = document.querySelector("#app");
const STYLE_ID = "public-clarity-layer-style";
const STORAGE_KEY = "settle-friends-state";
const LOCAL_PROFILE_KEY = "settle-friends-local-profile";

injectClarityStyle();
document.addEventListener("click", handlePublicClick);
watchApp();
enhanceClarity();

function watchApp() {
  if (!app) return;
  new MutationObserver(() => enhanceClarity()).observe(app, {
    childList: true,
    subtree: true
  });
}

function enhanceClarity() {
  const screen = document.querySelector(".screen");
  if (!screen) return;

  normalizeUserInputPlaceholders(screen);
  clearStarterExpenseDefaults(screen);
  enhanceSavedNamesManagement(screen);
  enhanceNavigationClarity(screen);
  enhanceEventScreen(screen);
}

function handlePublicClick(event) {
  const removeTarget = event.target.closest("[data-public-remove-participant]");
  if (removeTarget) {
    event.preventDefault();
    removeSavedParticipant(removeTarget.dataset.publicRemoveParticipant);
    return;
  }

  const target = event.target.closest("[data-public-click]");
  if (!target) return;

  event.preventDefault();
  goToNativeAction(target.dataset.publicClick);
}

function goToNativeAction(action) {
  const target = document.querySelector(`[data-action="${action}"]:not([disabled])`);
  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.click();
}

function enhanceNavigationClarity(screen) {
  if (screen.querySelector(".product-context-bar")) return;

  const context = getScreenContext(screen);
  if (!context) return;

  const html = `
    <nav class="product-context-bar" aria-label="איפה אני">
      <div class="product-context-copy">
        <span>איפה אני</span>
        <strong>${escapeHtml(context.title)}</strong>
        <small>${escapeHtml(context.helper)}</small>
      </div>
      <div class="product-context-actions" aria-label="מה עושים עכשיו">
        <span>מה עושים עכשיו</span>
        ${context.actions.map(renderPublicAction).join("")}
      </div>
    </nav>
  `;

  screen.querySelector(".top")?.insertAdjacentHTML("afterend", html);
}

function getScreenContext(screen) {
  if (screen.querySelector('[data-action="new-event"]')) {
    return {
      title: "בית",
      helper: "מכאן פותחים יציאה חדשה או נכנסים לאירוע קיים.",
      actions: [
        { label: "אירוע חדש", action: "new-event", primary: true },
        { label: "קבוצות", action: "groups" }
      ]
    };
  }

  if (screen.querySelector('[data-action="show-expense-form"]')) {
    return {
      title: getScreenTitle(screen) || "אירוע",
      helper: "זה מסך האירוע. כאן מוסיפים תשלומים, משתתפים וקישור לחברים.",
      actions: [
        { label: "הוסף הוצאה", action: "show-expense-form", primary: true },
        { label: "שתף קישור", action: "open-event-share" },
        { label: "סגור חשבון", action: "settle" }
      ]
    };
  }

  if (screen.querySelector('[data-action="create-event"]')) {
    return {
      title: "אירוע חדש",
      helper: "בוחרים שם, קבוצה ומשתתפים. מי שלא הגיע פשוט לא מסומן.",
      actions: [
        { label: "צור אירוע", action: "create-event", primary: true },
        { label: "חזרה", action: "home" }
      ]
    };
  }

  if (screen.querySelector('[data-action="copy-settlement"]')) {
    return {
      title: "סגירת חשבון",
      helper: "כאן רואים מי מעביר למי, עם כמה שפחות העברות מיותרות.",
      actions: [
        { label: "העתק סיכום", action: "copy-settlement", primary: true },
        { label: "דוח מלא", action: "copy-event-report" },
        { label: "חזרה לאירוע", action: "back-to-event" }
      ]
    };
  }

  return null;
}

function enhanceEventScreen(screen) {
  if (!screen.querySelector('[data-action="show-expense-form"]')) return;

  screen.classList.add("product-event-screen");

  const summary = screen.querySelector(".summary-strip");
  const hasNativeCommandGrid = screen.querySelector(".event-command-grid");
  if (summary && !hasNativeCommandGrid && !screen.querySelector(".product-event-command")) {
    summary.insertAdjacentHTML(
      "afterend",
      `<section class="product-event-command" aria-label="מה עושים עכשיו">
        <div class="product-event-command-copy">
          <span>מה עושים עכשיו</span>
          <h2>כאן מכניסים הוצאות</h2>
          <p>מוסיפים מי שילם, כמה כל אחד שילם, ומי באמת שותף לכל תשלום.</p>
        </div>
        <div class="product-command-actions">
          ${renderPublicAction({ label: "הוסף הוצאה", action: "show-expense-form", primary: true })}
          ${renderPublicAction({ label: "שתף קישור", action: "open-event-share" })}
          ${renderPublicAction({ label: "סגור חשבון", action: "settle" })}
        </div>
      </section>`
    );
  }

  if (!screen.querySelector(".product-sticky-actions")) {
    screen.insertAdjacentHTML(
      "beforeend",
      `<div class="product-sticky-actions" aria-label="פעולות מהירות">
        ${renderPublicAction({ label: "הוסף הוצאה", action: "show-expense-form", primary: true })}
        ${renderPublicAction({ label: "שתף קישור", action: "open-event-share" })}
        ${renderPublicAction({ label: "סגור חשבון", action: "settle" })}
      </div>`
    );
  }

  enhanceExpenseFormHint(screen);
}

function enhanceExpenseFormHint(screen) {
  const panel = screen.querySelector('[data-action="expense-name"]')?.closest(".panel");
  if (!panel || panel.querySelector(".product-form-helper")) return;

  panel.insertAdjacentHTML(
    "afterbegin",
    `<div class="product-form-helper">
      <strong>ממלאים הוצאה אחת בכל פעם</strong>
      <span>שם, סכום, מי שילם וכמה, ואז מי היה שותף. מי שלא שתה או לא נסע פשוט לא מסומן בתשלום הזה.</span>
    </div>`
  );
}

function normalizeUserInputPlaceholders(screen) {
  screen
    .querySelectorAll('[data-action="profile-name"], [name="displayName"]')
    .forEach((input) => {
      input.setAttribute("placeholder", "שם פרטי ושם משפחה");
    });
}

function clearStarterExpenseDefaults(screen) {
  const expenseName = screen.querySelector('[data-action="expense-name"]');
  const expenseTotal = screen.querySelector('[data-action="expense-total"]');
  const payerAmounts = screen.querySelectorAll('[data-action="expense-payer-amount"]');

  resetInputValue(expenseName, "מונית");
  resetInputValue(expenseTotal, "110");
  payerAmounts.forEach((input) => resetInputValue(input, "110"));
}

function resetInputValue(input, starterValue) {
  if (!input || input.dataset.publicDefaultCleared === "true") return;
  if (input.value !== starterValue) return;

  input.value = "";
  input.dataset.publicDefaultCleared = "true";
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function enhanceSavedNamesManagement(screen) {
  if (!screen.querySelector('[data-action="create-group"]')) return;
  if (
    screen.querySelector(".known-participants-panel") ||
    screen.querySelector(".product-saved-names-panel")
  ) {
    return;
  }

  const state = readStoredState();
  if (!state) return;
  const participants = Array.isArray(state.participants) ? state.participants : [];

  screen.insertAdjacentHTML(
    "beforeend",
    `<section class="panel section product-saved-names-panel">
      <div class="section-title-row">
        <div>
          <h2>שמות שנשמרו</h2>
          <p class="muted">האפליקציה לא ממציאה אנשים. כאן אפשר להסיר שם שהכנסת אם הוא לא מופיע בהוצאה קיימת.</p>
        </div>
      </div>
      <div class="stack">
        ${
          participants.length
            ? participants.map((participant) => renderSavedNameRow(state, participant)).join("")
            : `<div class="empty-state">עדיין לא נשמרו שמות</div>`
        }
      </div>
    </section>`
  );
}

function renderSavedNameRow(state, participant) {
  const profileParticipantId = readLocalProfile()?.participantId ?? "";
  const isCurrent = participant.id === profileParticipantId;
  const canRemove = !isCurrent && !participantHasMoneyHistory(state, participant.id);
  const helper = isCurrent
    ? "זה השם שלך במכשיר הזה"
    : canRemove
      ? "לא מופיע בהוצאות, אפשר להסיר"
      : "מופיע בהוצאה קיימת";

  return `
    <article class="group-row product-saved-name-row">
      <div class="product-saved-name-copy">
        <span class="avatar">${escapeHtml(initials(participant.displayName))}</span>
        <span>
          <strong>${escapeHtml(participant.displayName)}</strong>
          <small>${escapeHtml(helper)}</small>
        </span>
      </div>
      <button class="secondary-button danger-button" type="button" data-public-remove-participant="${escapeAttribute(participant.id)}" ${canRemove ? "" : "disabled"}>הסר</button>
    </article>
  `;
}

function removeSavedParticipant(participantId) {
  const state = readStoredState();
  if (!state || !participantId) return;
  const profileParticipantId = readLocalProfile()?.participantId ?? "";
  if (participantId === profileParticipantId || participantHasMoneyHistory(state, participantId)) return;

  const nextState = {
    ...state,
    participants: (state.participants ?? []).filter((participant) => participant.id !== participantId),
    groups: (state.groups ?? []).map((group) => removeParticipantFromGroup(group, participantId)),
    events: (state.events ?? []).map((event) => removeParticipantFromEvent(event, participantId))
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  window.location.reload();
}

function removeParticipantFromGroup(group, participantId) {
  const memberIds = uniqueIds((group.memberIds ?? []).filter((id) => id !== participantId));
  const adminIds = uniqueIds((group.adminIds ?? []).filter((id) => memberIds.includes(id)));

  return {
    ...group,
    memberIds,
    adminIds: adminIds.length ? adminIds : memberIds.slice(0, 1),
    archived: memberIds.length ? group.archived : true
  };
}

function removeParticipantFromEvent(event, participantId) {
  const participantIds = uniqueIds((event.participantIds ?? []).filter((id) => id !== participantId));
  const adminIds = uniqueIds((event.adminIds ?? []).filter((id) => participantIds.includes(id)));

  return {
    ...event,
    participantIds,
    adminIds: adminIds.length ? adminIds : participantIds.slice(0, 1),
    transfers: []
  };
}

function participantHasMoneyHistory(state, participantId) {
  return (state.events ?? []).some((event) => {
    const appearsInExpenses = (event.expenses ?? []).some(
      (expense) =>
        expense.createdByParticipantId === participantId ||
        (expense.sharedByParticipantIds ?? []).includes(participantId) ||
        (expense.payers ?? []).some((payer) => payer.participantId === participantId)
    );

    const appearsInTransfers = (event.transfers ?? []).some(
      (transfer) =>
        transfer.fromParticipantId === participantId ||
        transfer.toParticipantId === participantId ||
        transfer.markedPaidByParticipantId === participantId
    );

    return appearsInExpenses || appearsInTransfers;
  });
}

function readStoredState() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function readLocalProfile() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_PROFILE_KEY) || "null");
  } catch {
    return null;
  }
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

function initials(name) {
  const letters = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("");

  return letters || "?";
}

function renderPublicAction(action) {
  return `
    <button class="${action.primary ? "primary-button" : "secondary-button"}" type="button" data-public-click="${action.action}">
      ${escapeHtml(action.label)}
    </button>
  `;
}

function getScreenTitle(screen) {
  return screen.querySelector(".brand h1")?.textContent?.trim() ?? "";
}

function injectClarityStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .product-context-bar,
    .product-event-command {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      margin: 0 0 16px;
      padding: 14px;
      border-radius: 8px;
    }

    .product-context-bar {
      background: rgba(255, 253, 248, 0.94);
      border: 1px solid rgba(23, 29, 26, 0.09);
      box-shadow: 0 10px 28px rgba(23, 29, 26, 0.07);
      backdrop-filter: blur(14px);
    }

    .product-context-copy span,
    .product-context-actions > span,
    .product-event-command-copy span {
      display: block;
      color: #c7563d;
      font-size: 0.8rem;
      font-weight: 950;
    }

    .product-context-copy strong {
      display: block;
      margin-top: 3px;
      font-size: clamp(18px, 2vw, 24px);
      line-height: 1.15;
    }

    .product-context-copy small {
      display: block;
      margin-top: 4px;
      color: #69756f;
      font-weight: 750;
      line-height: 1.5;
    }

    .product-context-actions,
    .product-command-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      align-items: center;
    }

    .product-context-actions > span {
      width: 100%;
      color: #0a7d6f;
      text-align: end;
    }

    .product-context-actions button,
    .product-command-actions button {
      min-height: 42px;
      padding-inline: 14px;
      white-space: nowrap;
    }

    .product-event-screen {
      padding-bottom: 116px;
    }

    .product-event-command {
      margin: 16px 0;
      padding: clamp(18px, 3vw, 26px);
      color: white;
      background: linear-gradient(135deg, #171d1a 0%, #0d352f 56%, #8d3d2d 142%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 28px 64px rgba(23, 29, 26, 0.16);
    }

    .product-event-command-copy span {
      color: #fff0bf;
    }

    .product-event-command h2 {
      margin: 4px 0 8px;
      font-size: clamp(26px, 4vw, 42px);
      line-height: 1.08;
    }

    .product-event-command p {
      margin: 0;
      color: rgba(255, 255, 255, 0.82);
      font-weight: 750;
      line-height: 1.65;
    }

    .product-event-command .secondary-button {
      color: #171d1a;
    }

    .product-sticky-actions {
      position: fixed;
      right: 50%;
      bottom: 16px;
      z-index: 30;
      width: min(calc(100% - 24px), 720px);
      display: grid;
      grid-template-columns: 1.12fr 1fr 1fr;
      gap: 8px;
      padding: 10px;
      transform: translateX(50%);
      background: rgba(255, 253, 248, 0.94);
      border: 1px solid rgba(23, 29, 26, 0.12);
      border-radius: 8px;
      box-shadow: 0 20px 48px rgba(23, 29, 26, 0.18);
      backdrop-filter: blur(16px);
    }

    .product-sticky-actions button {
      min-width: 0;
      min-height: 44px;
      padding-inline: 10px;
    }

    .product-form-helper {
      display: grid;
      gap: 5px;
      margin: 0 0 16px;
      padding: 14px;
      color: #4b4030;
      background: #fff8ea;
      border: 1px solid #e5ded2;
      border-radius: 8px;
    }

    .product-form-helper span {
      color: #6f6250;
      font-weight: 750;
      line-height: 1.55;
    }

    .product-saved-name-copy {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;
    }

    .product-saved-name-copy span:last-child {
      min-width: 0;
    }

    @media (max-width: 760px) {
      .product-context-bar,
      .product-event-command {
        grid-template-columns: 1fr;
      }

      .product-context-actions,
      .product-command-actions {
        justify-content: stretch;
      }

      .product-context-actions > span {
        text-align: start;
      }

      .product-context-actions button,
      .product-command-actions button {
        flex: 1 1 0;
      }
    }

    @media (max-width: 440px) {
      .product-sticky-actions {
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
