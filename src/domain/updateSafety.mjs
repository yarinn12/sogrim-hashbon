export function hasUpdateSensitiveWork({ document, storage, pending = false, checkOutbox = false }) {
  if (pending) return true;
  if (document?.querySelector?.("#app [role='dialog'], #app .event-note-editor, #app [data-screen-kind='new-event']")) return true;
  const focused = document?.activeElement;
  if (focused?.closest?.("#app") &&
      focused.matches?.("input, textarea, [contenteditable='true']") &&
      String(focused.value ?? focused.textContent ?? "").trim()) return true;
  if (!checkOutbox) return false;
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("settle-friends-pending-sync:") && storage.getItem(key)) return true;
    }
  } catch { return true; }
  return false;
}
