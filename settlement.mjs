export function buildEventInviteUrl(currentUrl, eventId) {
  const url = new URL(currentUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("event", eventId);
  return url.toString();
}

export function parseInviteEventId(urlValue) {
  const url = new URL(urlValue);
  return url.searchParams.get("event");
}
