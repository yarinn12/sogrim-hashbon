import { isSafeSharedIdentifier } from "./sharedStateMerge.mjs";

const NOTIFICATION_EVENT_PARAM = "openEvent";
const NOTIFICATION_VIEW_PARAM = "view";
const NOTIFICATION_SOURCE_PARAM = "source";
const ALLOWED_VIEWS = new Set(["event", "summary"]);

export function normalizeNotificationTarget(value) {
  const eventId = String(value?.eventId ?? value?.event_id ?? "").trim();
  const requestedView = String(value?.view ?? value?.screen ?? "event")
    .trim()
    .toLowerCase();
  const view = requestedView === "settlement" ? "summary" : requestedView;

  if (!isSafeSharedIdentifier(eventId) || !ALLOWED_VIEWS.has(view)) {
    return null;
  }

  return { eventId, view };
}

export function notificationTargetFromPayload(payload) {
  const data = payload?.data && typeof payload.data === "object"
    ? payload.data
    : payload;
  return normalizeNotificationTarget(data);
}

export function notificationTargetFromUrl(value) {
  try {
    const url = new URL(value, "https://sogrim-hesbon-app.vercel.app/");
    if (!url.searchParams.has(NOTIFICATION_EVENT_PARAM)) return null;

    return normalizeNotificationTarget({
      eventId: url.searchParams.get(NOTIFICATION_EVENT_PARAM),
      view: url.searchParams.get(NOTIFICATION_VIEW_PARAM) || "event"
    });
  } catch {
    return null;
  }
}

export function buildNotificationDestination(
  currentUrl,
  target,
  { source = "push" } = {}
) {
  const normalized = normalizeNotificationTarget(target);
  if (!normalized) return "";

  try {
    const url = new URL(currentUrl);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    url.searchParams.set(NOTIFICATION_EVENT_PARAM, normalized.eventId);
    url.searchParams.set(NOTIFICATION_VIEW_PARAM, normalized.view);
    if (source) url.searchParams.set(NOTIFICATION_SOURCE_PARAM, source);
    return url.toString();
  } catch {
    return "";
  }
}

export function clearNotificationTargetFromUrl(value) {
  try {
    const url = new URL(value);
    url.searchParams.delete(NOTIFICATION_EVENT_PARAM);
    url.searchParams.delete(NOTIFICATION_VIEW_PARAM);
    url.searchParams.delete(NOTIFICATION_SOURCE_PARAM);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
