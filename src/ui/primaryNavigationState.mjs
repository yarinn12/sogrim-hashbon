export function primaryNavigationDestinationForScreen(kind) {
  if (["groups", "group-workflow"].includes(kind)) return "friends";
  if (["profile", "admin"].includes(kind)) return "profile";
  if (kind === "notifications") return "notifications";
  if (["home", "event", "event-notes", "settlement", "join-event", "new-event"].includes(kind)) return "home";
  return "";
}
