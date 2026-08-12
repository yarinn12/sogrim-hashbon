const SUPPORTED_ACTIVITY_KINDS = new Set([
  "expense-created",
  "participant-joined",
  "event-invite"
]);

export async function sendEventActivityNotification(
  config,
  { eventId, activityId, kind },
  fetchImpl = fetch
) {
  const account = config?.storage?.account;
  const normalizedEventId = String(eventId ?? "").trim();
  const normalizedActivityId = String(activityId ?? "").trim();
  const normalizedKind = String(kind ?? "").trim();
  if (
    !config?.launch?.cloudStorageReady ||
    !account?.userId ||
    !account?.accessToken ||
    !normalizedEventId ||
    !normalizedActivityId ||
    !SUPPORTED_ACTIVITY_KINDS.has(normalizedKind)
  ) {
    return { ok: false, reason: "unavailable" };
  }

  const response = await fetchImpl(
    `${config?.apiBaseUrl ?? ""}/api/notifications/event-activity`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${account.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        eventId: normalizedEventId,
        activityId: normalizedActivityId,
        kind: normalizedKind
      }),
      keepalive: true
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;

  const error = new Error(
    payload?.error || "Event notification could not be sent"
  );
  error.code = payload?.code || "EVENT_NOTIFICATION_FAILED";
  error.retryable = Boolean(payload?.retryable);
  throw error;
}
