import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout
} from "./fetchTimeout.mjs";

const SUPPORTED_ACTIVITY_KINDS = new Set([
  "expense-created",
  "participant-joined",
  "event-invite",
  "event-closed"
]);

export async function sendEventActivityNotification(
  config,
  { eventId, activityId, kind },
  fetchImpl = fetch,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
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

  let response;
  let payload;
  try {
    ({ response, payload } = await fetchWithTimeout(
      fetchImpl,
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
      },
      timeoutMs,
      async (response) => ({
        response,
        payload: await response.json().catch(() => ({}))
      })
    ));
  } catch (error) {
    if (
      String(error?.code ?? "") === "NETWORK_TIMEOUT" ||
      error?.name === "TypeError"
    ) {
      error.retryable = true;
    }
    throw error;
  }
  if (response.ok) return payload;

  const error = new Error(
    payload?.error || "Event notification could not be sent"
  );
  error.code = payload?.code || "EVENT_NOTIFICATION_FAILED";
  error.status = response.status;
  error.retryable = Boolean(payload?.retryable);
  throw error;
}
