const STORAGE_KEY = "settle-friends-state";
const LOCAL_PROFILE_KEY = "settle-friends-local-profile";
const STYLE_ID = "public-name-cleanup-style";
const LEGACY_STARTER_EVENT_ID = "event-demo";
const LEGACY_STARTER_GROUP_ID = "thursday";
const LEGACY_PARTICIPANT_IDS = new Set(["yarin", "dani", "avi", "maor"]);

injectNameCleanupStyle();
watchApp();
applyPublicNameCleanup();

function watchApp() {
  const app = document.querySelector("#app");
  if (!app) return;
  new MutationObserver(() => applyPublicNameCleanup()).observe(app, {
    childList: true,
    subtree: true
  });
}

function applyPublicNameCleanup() {
  cleanLegacyStoredState();
  normalizeNamePlaceholders(document);

  const screen = document.querySelector(".screen");
  if (!screen) return;

  clearStarterExpenseDefaults(screen);
  addSavedNamesPanel(screen);
}

function normalizeNamePlaceholders(screen) {
  screen
    .querySelectorAll('[data-action="profile-name"], [name="displayName"]')
    .forEach((input) => {
      input.setAttribute("placeholder", "השם שיופיע לחברים");
    });
}

function clearStarterExpenseDefaults(screen) {
  resetInputValue(screen.querySelector('[data-action="expense-name"]'), "מונית");
  resetInputValue(screen.querySelector('[data-action="expense-total"]'), "110");
  screen
    .querySelectorAll('[data-action="expense-payer-amount"]')
    .forEach((input) => resetInputValue(input, "110"));
}

function resetInputValue(input, starterValue) {
  if (!input || input.dataset.nameCleanupCleared === "true") return;
  if (input.value !== starterValue) return;

  input.value = "";
  input.dataset.nameCleanupCleared = "true";
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function addSavedNamesPanel(screen) {
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

  screen
    .querySelectorAll("[data-name-cleanup-remove]")
    .forEach((button) =>
      button.addEventListener("click", () => removeSavedParticipant(button.dataset.nameCleanupRemove))
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
      <button class="secondary-button danger-button" type="button" data-name-cleanup-remove="${escapeAttribute(participant.id)}" ${canRemove ? "" : "disabled"}>הסר</button>
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

function cleanLegacyStoredState() {
  const state = readStoredState();
  if (!state) return;

  const profileParticipantId = readLocalProfile()?.participantId ?? "";
  const nextState = removeLegacyStarterData(state, profileParticipantId);
  if (JSON.stringify(nextState) === JSON.stringify(state)) return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function removeLegacyStarterData(state, protectedParticipantId = "") {
  const baseEvents = (state.events ?? []).filter((event) => event.id !== LEGACY_STARTER_EVENT_ID);
  const baseGroups = (state.groups ?? []).filter((group) => group.id !== LEGACY_STARTER_GROUP_ID);
  const referencedParticipantIds = collectReferencedParticipantIds({ ...state, events: baseEvents });
  const events = baseEvents.map((event) =>
    removeLegacyParticipantsFromEvent(event, protectedParticipantId, referencedParticipantIds)
  );
  const groups = baseGroups.map((group) =>
    removeLegacyParticipantsFromGroup(group, protectedParticipantId, referencedParticipantIds)
  );
  const participants = (state.participants ?? []).filter(
    (participant) =>
      participant.id === protectedParticipantId ||
      !LEGACY_PARTICIPANT_IDS.has(participant.id) ||
      referencedParticipantIds.has(participant.id)
  );
  const participantIds = new Set(participants.map((participant) => participant.id));
  const currentParticipantId = participantIds.has(state.currentParticipantId)
    ? state.currentParticipantId
    : protectedParticipantId && participantIds.has(protectedParticipantId)
      ? protectedParticipantId
      : participants[0]?.id ?? "";

  return {
    ...state,
    currentParticipantId,
    participants,
    groups,
    events
  };
}

function removeLegacyParticipantsFromGroup(group, protectedParticipantId, referencedParticipantIds) {
  const memberIds = keepNonLegacyIds(
    group.memberIds ?? [],
    protectedParticipantId,
    referencedParticipantIds
  );
  const adminIds = keepNonLegacyIds(
    group.adminIds ?? [],
    protectedParticipantId,
    referencedParticipantIds
  ).filter((id) => memberIds.includes(id));

  return {
    ...group,
    memberIds,
    adminIds: adminIds.length ? adminIds : memberIds.slice(0, 1),
    archived: memberIds.length ? group.archived : true
  };
}

function removeLegacyParticipantsFromEvent(event, protectedParticipantId, referencedParticipantIds) {
  const participantIds = keepNonLegacyIds(
    event.participantIds ?? [],
    protectedParticipantId,
    referencedParticipantIds
  );
  const adminIds = keepNonLegacyIds(
    event.adminIds ?? [],
    protectedParticipantId,
    referencedParticipantIds
  ).filter((id) => participantIds.includes(id));
  const transfers = (event.transfers ?? []).filter(
    (transfer) =>
      keepLegacyId(transfer.fromParticipantId, protectedParticipantId, referencedParticipantIds) &&
      keepLegacyId(transfer.toParticipantId, protectedParticipantId, referencedParticipantIds)
  );

  return {
    ...event,
    participantIds,
    adminIds: adminIds.length ? adminIds : participantIds.slice(0, 1),
    transfers
  };
}

function keepNonLegacyIds(ids, protectedParticipantId, referencedParticipantIds) {
  return uniqueIds(
    ids.filter((id) => keepLegacyId(id, protectedParticipantId, referencedParticipantIds))
  );
}

function keepLegacyId(id, protectedParticipantId, referencedParticipantIds) {
  return (
    id === protectedParticipantId ||
    !LEGACY_PARTICIPANT_IDS.has(id) ||
    referencedParticipantIds.has(id)
  );
}

function collectReferencedParticipantIds(state) {
  const ids = new Set();
  (state.events ?? []).forEach((event) => {
    (event.expenses ?? []).forEach((expense) => {
      addId(ids, expense.createdByParticipantId);
      (expense.sharedByParticipantIds ?? []).forEach((id) => addId(ids, id));
      (expense.payers ?? []).forEach((payer) => addId(ids, payer.participantId));
    });
    (event.transfers ?? []).forEach((transfer) => {
      addId(ids, transfer.fromParticipantId);
      addId(ids, transfer.toParticipantId);
      addId(ids, transfer.markedPaidByParticipantId);
    });
  });

  return ids;
}

function addId(ids, id) {
  if (id) ids.add(id);
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

function injectNameCleanupStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .product-saved-name-copy {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;
    }

    .product-saved-name-copy span:last-child {
      min-width: 0;
    }
  `;
  document.head.append(style);
}
