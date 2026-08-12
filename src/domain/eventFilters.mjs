export function filterEvents(events, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return events;

  return events.filter((event) =>
    event.name.toLocaleLowerCase().includes(normalizedQuery)
  );
}

export function isEventClosed(event) {
  return Boolean(event?.closedAt || event?.locked);
}

export function isEventOpen(event) {
  return !isEventClosed(event);
}

export function eventMatchesStatus(event, status = "open") {
  if (status === "all") return true;
  if (status === "closed") return isEventClosed(event);
  return isEventOpen(event);
}

export function filterEventsByStatus(events, status = "open") {
  return events.filter((event) => eventMatchesStatus(event, status));
}

export function countEventsByStatus(events) {
  const open = events.filter(isEventOpen).length;
  return {
    open,
    closed: events.length - open,
    all: events.length
  };
}
