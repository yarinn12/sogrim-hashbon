import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout
} from "./fetchTimeout.mjs";

export async function sendPaymentReminder(
  config,
  { eventId, transferId },
  fetchImpl = fetch,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
) {
  const account = config?.storage?.account;
  const normalizedEventId = String(eventId ?? "").trim();
  const normalizedTransferId = String(transferId ?? "").trim();
  if (
    !account?.userId ||
    !account?.accessToken ||
    !normalizedEventId ||
    !normalizedTransferId
  ) {
    return { ok: false, reason: "unavailable" };
  }

  const { response, payload } = await fetchWithTimeout(
    fetchImpl,
    `${config?.apiBaseUrl ?? ""}/api/notifications/payment-reminder`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${account.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        eventId: normalizedEventId,
        transferId: normalizedTransferId
      })
    },
    timeoutMs,
    async (response) => ({
      response,
      payload: await response.json().catch(() => ({}))
    })
  );
  if (response.ok) return payload;

  const error = new Error(
    payload?.error || "Payment reminder could not be sent"
  );
  error.code = payload?.code || "REMINDER_FAILED";
  error.status = response.status;
  error.retryAt = payload?.retryAt || "";
  error.retryable = Boolean(payload?.retryable);
  throw error;
}
