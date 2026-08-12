import { fetchWithTimeout } from "./fetchTimeout.mjs";

const INBOX_SELECT = [
  "id",
  "event_id",
  "activity_id",
  "kind",
  "title",
  "body",
  "view",
  "action_url",
  "created_at",
  "read_at"
].join(",");

export async function loadNotificationInbox(
  config,
  { limit = 40 } = {},
  fetchImpl = fetch
) {
  const identity = inboxIdentity(config);
  if (!identity) return { available: false, items: [] };

  const params = new URLSearchParams({
    recipient_user_id: `eq.${identity.userId}`,
    select: INBOX_SELECT,
    order: "created_at.desc",
    limit: String(Math.min(50, Math.max(1, Number(limit) || 40)))
  });
  const response = await fetchWithTimeout(
    fetchImpl,
    `${identity.url}/rest/v1/notification_inbox?${params}`,
    {
      headers: accountHeaders(identity),
      cache: "no-store"
    }
  );
  if (!response.ok) throw new Error("Notification inbox could not be loaded");

  const payload = await response.json().catch(() => []);
  return {
    available: true,
    items: Array.isArray(payload) ? payload.map(normalizeInboxItem).filter(Boolean) : []
  };
}

export async function markNotificationRead(
  config,
  notificationId,
  fetchImpl = fetch
) {
  const identity = inboxIdentity(config);
  const id = String(notificationId ?? "").trim();
  if (!identity || !id) return false;

  const params = new URLSearchParams({
    id: `eq.${id}`,
    recipient_user_id: `eq.${identity.userId}`,
    read_at: "is.null"
  });
  const response = await fetchWithTimeout(
    fetchImpl,
    `${identity.url}/rest/v1/notification_inbox?${params}`,
    {
      method: "PATCH",
      headers: {
        ...accountHeaders(identity),
        prefer: "return=minimal"
      },
      body: JSON.stringify({ read_at: new Date().toISOString() })
    }
  );
  return response.ok;
}

export async function markAllNotificationsRead(config, fetchImpl = fetch) {
  const identity = inboxIdentity(config);
  if (!identity) return false;

  const params = new URLSearchParams({
    recipient_user_id: `eq.${identity.userId}`,
    read_at: "is.null"
  });
  const response = await fetchWithTimeout(
    fetchImpl,
    `${identity.url}/rest/v1/notification_inbox?${params}`,
    {
      method: "PATCH",
      headers: {
        ...accountHeaders(identity),
        prefer: "return=minimal"
      },
      body: JSON.stringify({ read_at: new Date().toISOString() })
    }
  );
  return response.ok;
}

function inboxIdentity(config) {
  const url = String(config?.storage?.url ?? "").replace(/\/+$/, "");
  const anonKey = String(config?.storage?.anonKey ?? "").trim();
  const userId = String(config?.storage?.account?.userId ?? "").trim();
  const accessToken = String(config?.storage?.account?.accessToken ?? "").trim();
  return url && anonKey && userId && accessToken
    ? { url, anonKey, userId, accessToken }
    : null;
}

function accountHeaders(identity) {
  return {
    apikey: identity.anonKey,
    authorization: `Bearer ${identity.accessToken}`,
    "content-type": "application/json"
  };
}

function normalizeInboxItem(item) {
  const id = String(item?.id ?? "").trim();
  const eventId = String(item?.event_id ?? "").trim();
  if (!id || !eventId) return null;

  return {
    id,
    eventId,
    activityId: String(item?.activity_id ?? "").trim(),
    kind: String(item?.kind ?? "").trim(),
    title: String(item?.title ?? "").trim(),
    body: String(item?.body ?? "").trim(),
    view: item?.view === "summary" ? "summary" : "event",
    actionUrl: safeNotificationActionUrl(item?.action_url),
    createdAt: String(item?.created_at ?? "").trim(),
    readAt: String(item?.read_at ?? "").trim()
  };
}

function safeNotificationActionUrl(value) {
  const actionUrl = String(value ?? "").trim();
  if (!actionUrl) return "";
  try {
    const url = new URL(actionUrl);
    return url.protocol === "https:" &&
      url.hostname === "sogrim-hashbon.vercel.app"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}
