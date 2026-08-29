const KIND_DESTINATIONS = Object.freeze({
  "expense-created": { name: "event", surface: "expense" },
  "participant-joined": { name: "event", surface: "participants" },
  "event-invite": { name: "event", surface: "event" },
  "event-closed": { name: "settlement", surface: "summary" },
  "payment-reminder": { name: "settlement", surface: "transfer" },
  "event-reopened": { name: "event", surface: "event" }
});

export function notificationInboxDestination(item, fallback = {}) {
  const kind = String(item?.kind ?? fallback.kind ?? "").trim();
  if (kind === "friend-request") {
    return { name: "groups", tab: "requests", surface: "friend-requests" };
  }

  const eventId = String(item?.eventId ?? fallback.eventId ?? "").trim();
  if (!eventId) return null;

  const activityId = String(item?.activityId ?? fallback.activityId ?? "").trim();
  const mapped = KIND_DESTINATIONS[kind];
  if (mapped) {
    return {
      ...mapped,
      eventId,
      entityId: activityId
    };
  }

  const view = String(item?.view ?? fallback.view ?? "event").trim();
  return {
    name: view === "summary" ? "settlement" : "event",
    surface: view === "summary" ? "summary" : "event",
    eventId,
    entityId: activityId
  };
}
