import { peekClientSpaceId } from "./domain/cloudSpace.mjs";
import { loadLocalProfile } from "./data/localStore.mjs";

const STORAGE_KEY = "settle-friends-state";
const HOME_EVENT_SEARCH_THRESHOLD = 4;

setupPersonalMemoryLayer();

function setupPersonalMemoryLayer() {
  applyPersonalMemoryScope();

  const app = document.querySelector("#app");
  if (app) {
    const observer = new MutationObserver(() => applyPersonalMemoryScope());
    observer.observe(app, { childList: true, subtree: true });
  }

  window.addEventListener("storage", applyPersonalMemoryScope);
}

function applyPersonalMemoryScope() {
  const profile = loadLocalProfile();
  const state = readSharedState();
  const participantId = profile?.participantId ?? "";
  if (!participantId || !state) return;

  const visibleEventIds = new Set(
    (state.events ?? [])
      .filter((event) => eventBelongsToParticipant(event, participantId))
      .map((event) => event.id)
  );
  const visibleGroupIds = new Set(
    (state.groups ?? [])
      .filter((group) => groupBelongsToParticipant(group, participantId))
      .map((group) => group.id)
  );

  const visibleEventCount = scopeEventRows(visibleEventIds);
  scopeGroupRows(visibleGroupIds);
  scopeGroupSelectOptions(visibleGroupIds);
  scopeEventSearch(visibleEventCount);
}

function scopeEventRows(visibleEventIds) {
  let visibleCount = 0;
  const rows = document.querySelectorAll('[data-action="open-event"][data-event-id]');

  rows.forEach((row) => {
    const isVisible = visibleEventIds.has(row.dataset.eventId);
    row.hidden = !isVisible;
    row.classList.toggle("is-personal-memory-hidden", !isVisible);
    if (isVisible) visibleCount += 1;
  });

  const list = document.querySelector(".event-list");
  if (list) {
    let empty = list.querySelector("[data-personal-memory-empty]");
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "empty-state";
      empty.dataset.personalMemoryEmpty = "true";
      empty.textContent = "אין אירועים שלך עדיין";
      list.append(empty);
    }
    empty.hidden = visibleCount > 0 || rows.length === 0;
  }

  return visibleCount;
}

function scopeGroupRows(visibleGroupIds) {
  const rows = new Set();
  document
    .querySelectorAll('[data-action="edit-group"][data-group-id], [data-action="archive-group"][data-group-id]')
    .forEach((button) => {
      const row = button.closest(".group-row");
      if (row) rows.add(row);
    });

  rows.forEach((row) => {
    const groupId = row.querySelector("[data-group-id]")?.dataset.groupId ?? "";
    const isVisible = visibleGroupIds.has(groupId);
    row.hidden = !isVisible;
    row.classList.toggle("is-personal-memory-hidden", !isVisible);
  });
}

function scopeGroupSelectOptions(visibleGroupIds) {
  document.querySelectorAll('[data-action="new-event-group"]').forEach((select) => {
    select.querySelectorAll("option[value]").forEach((option) => {
      if (!option.value) return;
      const isVisible = visibleGroupIds.has(option.value);
      option.hidden = !isVisible;
      option.disabled = !isVisible;
    });

    if (select.value && !visibleGroupIds.has(select.value)) {
      select.value = "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

function scopeEventSearch(visibleEventCount) {
  document.querySelectorAll(".search-panel").forEach((panel) => {
    panel.hidden = visibleEventCount < HOME_EVENT_SEARCH_THRESHOLD;
  });
}

function eventBelongsToParticipant(event, participantId) {
  return Boolean(
    event.participantIds?.includes(participantId) ||
      event.adminIds?.includes(participantId) ||
      event.createdByParticipantId === participantId
  );
}

function groupBelongsToParticipant(group, participantId) {
  return Boolean(
    !group.archived &&
      (group.memberIds?.includes(participantId) ||
        group.adminIds?.includes(participantId))
  );
}

function readSharedState() {
  try {
    const key = stateStorageKey();
    const raw = window.localStorage.getItem(key);
    if (raw || key === STORAGE_KEY) {
      return parseStoredState(raw);
    }

    return parseStoredState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function stateStorageKey() {
  const spaceId = peekClientSpaceId(window.location.href, window.localStorage);
  return spaceId ? `${STORAGE_KEY}:${spaceId}` : STORAGE_KEY;
}

function parseStoredState(raw) {
  return JSON.parse(raw || "null");
}
