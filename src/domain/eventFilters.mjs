export function filterEvents(events, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return events;

  return events.filter((event) =>
    event.name.toLocaleLowerCase().includes(normalizedQuery)
  );
}
