const INBOX_KINDS = new Set([
  "expense-created",
  "participant-joined",
  "event-invite",
  "payment-reminder"
]);
const INBOX_VIEWS = new Set(["event", "summary"]);

export async function storeInboxNotification({
  supabaseUrl,
  serviceRoleKey,
  recipientUserId,
  senderUserId,
  eventId,
  activityId,
  kind,
  title,
  body,
  view = "event",
  actionUrl = "",
  fetchImpl = fetch
}) {
  const normalized = normalizeInboxNotification({
    recipientUserId,
    senderUserId,
    eventId,
    activityId,
    kind,
    title,
    body,
    view,
    actionUrl
  });
  if (!normalized || !supabaseUrl || !serviceRoleKey) return false;

  const response = await fetchImpl(
    `${String(supabaseUrl).replace(/\/+$/, "")}/rest/v1/notification_inbox?on_conflict=recipient_user_id,event_id,activity_id,kind`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(normalized)
    }
  ).catch(() => null);

  return Boolean(response?.ok);
}

function normalizeInboxNotification(value) {
  const recipientUserId = String(value.recipientUserId ?? "").trim();
  const senderUserId = String(value.senderUserId ?? "").trim();
  const eventId = String(value.eventId ?? "").trim();
  const activityId = String(value.activityId ?? "").trim();
  const kind = String(value.kind ?? "").trim();
  const title = String(value.title ?? "").trim().slice(0, 90);
  const body = String(value.body ?? "").trim().slice(0, 240);
  const view = String(value.view ?? "").trim();
  const actionUrl = normalizeActionUrl(value.actionUrl);
  if (
    !recipientUserId ||
    !senderUserId ||
    !eventId ||
    !activityId ||
    !INBOX_KINDS.has(kind) ||
    !title ||
    !body ||
    !INBOX_VIEWS.has(view) ||
    (kind === "event-invite" && !actionUrl)
  ) {
    return null;
  }

  return {
    recipient_user_id: recipientUserId,
    sender_user_id: senderUserId,
    event_id: eventId,
    activity_id: activityId,
    kind,
    title,
    body,
    view,
    action_url: actionUrl
  };
}

function normalizeActionUrl(value) {
  const actionUrl = String(value ?? "").trim().slice(0, 2048);
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
