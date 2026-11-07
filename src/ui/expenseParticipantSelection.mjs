// Presentation only. The app adapter owns eligible participants and draft updates.
export function renderExpenseParticipantToolbarView({ availableIds, selectedIds, checkIcon }) {
  const available = new Set(availableIds);
  const selected = new Set(selectedIds.filter(id => available.has(id)));
  const allSelected = available.size > 0 && selected.size === available.size;
  const pressed = allSelected ? "true" : selected.size ? "mixed" : "false";
  return `<div class="expense-participant-toolbar" data-expense-participant-toolbar>
    <button class="expense-select-all-compact" type="button" data-action="expense-select-all" aria-pressed="${pressed}">
      <span aria-hidden="true">${checkIcon}</span><span>סמן את כולם</span>
    </button>
  </div>`;
}

export function expenseFriendChoiceDescription({ hasAvailableFriends, hasConnectedFriends, networkStatus = "ready" }) {
  if (hasAvailableFriends) return "בחר משתמש שכבר מחובר אליך";
  if (networkStatus === "loading") return "טוענים את רשימת החברים…";
  if (networkStatus !== "ready") return "רשימת החברים אינה זמינה כרגע";
  return hasConnectedFriends ? "כל החברים שלך כבר באירוע" : "עדיין אין לך חברים באפליקציה";
}
