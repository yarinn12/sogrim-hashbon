export function hasUpdateSensitiveWork({ document, storage, pending = false, checkOutbox = false }) {
  if (pending) return true;
  if (document?.querySelector?.([
    "#app [role='dialog']",
    "#app .event-note-editor",
    "#app [data-screen-kind='new-event']",
    "#app [data-screen-kind='group-create']",
    "#app [data-screen-kind='group-edit']",
    "#app [data-screen-kind='friends-add']",
    "#app [data-screen-kind='join-event']"
  ].join(", "))) return true;
  for (const field of document?.querySelectorAll?.("#app input, #app textarea, #app select, #app [contenteditable='true']") ?? []) {
    if (field.disabled || field.readOnly || field.closest?.("[hidden], [inert]")) continue;
    if (field.matches?.("input[type='checkbox'], input[type='radio']")) {
      if (field.checked !== field.defaultChecked) return true;
    } else if (field.matches?.("select")) {
      const options = [...field.options];
      const defaultIndex = options.findIndex(option => option.defaultSelected);
      if (field.selectedIndex !== (defaultIndex < 0 ? 0 : defaultIndex)) return true;
    } else if (field.matches?.("[contenteditable='true']")) {
      if (String(field.textContent ?? "").trim()) return true;
    } else if (field.value !== field.defaultValue) return true;
  }
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
