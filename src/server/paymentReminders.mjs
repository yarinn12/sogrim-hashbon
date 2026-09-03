import { GoogleAuth } from "google-auth-library";

import { formatCurrency, normalizeCurrency } from "../domain/currencies.mjs";
import {
  reconcileSettlementTransfers,
  settlementOptionsForEvent
} from "../domain/settlement.mjs";
import { isSafeSharedIdentifier } from "../domain/sharedStateMerge.mjs";
import { fetchWithTimeout } from "../data/fetchTimeout.mjs";
import { storeInboxNotification } from "./notificationInbox.mjs";

const FIREBASE_MESSAGING_SCOPE =
  "https://www.googleapis.com/auth/firebase.messaging";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REMINDER_COOLDOWN_MINUTES = 12 * 60;
const PUSH_DELIVERY_REQUEST_TIMEOUT_MS = 10_000;
const RESERVATION_CLEANUP_TIMEOUT_MS = 2_000;
export const PAYMENT_REMINDER_REQUEST_TIMEOUT_MS = 10_000;
const DEADLINE_FETCH = Symbol("payment-reminder-deadline-fetch");
const DEADLINE_REMAINING_MS = Symbol("payment-reminder-deadline-remaining-ms");

export async function sendPaymentReminder({
  runtimeConfig,
  env = process.env,
  authorization = "",
  eventId = "",
  transferId = "",
  fetchImpl = fetch,
  accessTokenProvider = defaultFirebaseAccessTokenProvider,
  deliveryTimeoutMs = PUSH_DELIVERY_REQUEST_TIMEOUT_MS,
  accessTokenTimeoutMs = PUSH_DELIVERY_REQUEST_TIMEOUT_MS,
  requestTimeoutMs = PAYMENT_REMINDER_REQUEST_TIMEOUT_MS
}) {
  const normalizedEventId = String(eventId ?? "").trim();
  const normalizedTransferId = String(transferId ?? "").trim();
  const supabaseUrl = String(runtimeConfig?.storage?.url ?? "").replace(/\/+$/, "");
  const anonKey = String(runtimeConfig?.storage?.anonKey ?? "").trim();
  const serviceRoleKey = String(
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || ""
  ).trim();
  const accountToken = bearerToken(authorization);
  const pushDeliveryReady = Boolean(runtimeConfig?.launch?.pushDeliveryReady);

  if (!accountToken) {
    return failure(401, "Authentication is required", {
      code: "AUTH_REQUIRED"
    });
  }
  if (
    !isSafeSharedIdentifier(normalizedEventId) ||
    !isSafeSharedIdentifier(normalizedTransferId)
  ) {
    return failure(400, "Payment reminder is invalid", {
      code: "INVALID_REMINDER"
    });
  }
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return failure(503, "Notification storage is unavailable", {
      code: "PUSH_UNAVAILABLE"
    });
  }

  const cleanupFetchImpl = createCleanupFetch(fetchImpl);
  fetchImpl = createDeadlineFetch(fetchImpl, requestTimeoutMs);

  const sender = await loadAuthenticatedUser({
    supabaseUrl,
    anonKey,
    accessToken: accountToken,
    fetchImpl
  });
  if (!sender?.id) {
    return failure(401, "Account session is invalid", {
      code: "AUTH_REQUIRED"
    });
  }

  const senderState = await loadAccountState({
    supabaseUrl,
    serviceRoleKey,
    userId: sender.id,
    eventId: normalizedEventId,
    fetchImpl
  });
  const senderWorkspaceEvent = eventFromState(senderState, normalizedEventId);
  const senderEvent = await loadAuthoritativeSharedEvent({
    supabaseUrl,
    serviceRoleKey,
    eventId: normalizedEventId,
    workspaceEvent: senderWorkspaceEvent,
    senderUserId: sender.id,
    fetchImpl
  });
  const senderTransfer = transferFromState(
    senderState,
    senderEvent,
    normalizedTransferId
  );
  const senderParticipantId = `account-${sender.id}`;
  if (
    !senderEvent ||
    !isActiveEventParticipant(senderEvent, senderParticipantId) ||
    !senderTransfer ||
    senderTransfer.status === "paid" ||
    senderTransfer.toParticipantId !== senderParticipantId
  ) {
    return failure(403, "Only the payment recipient can send this reminder", {
      code: "REMINDER_NOT_ALLOWED"
    });
  }

  const recipientUserId = accountUserId(
    senderTransfer.fromParticipantId
  );
  if (!recipientUserId || recipientUserId === sender.id) {
    return failure(400, "The payer is not an online account", {
      code: "RECIPIENT_OFFLINE"
    });
  }

  if (!isActiveEventParticipant(senderEvent, `account-${recipientUserId}`)) {
    return failure(403, "The payer is no longer in this event", {
      code: "REMINDER_NOT_ALLOWED"
    });
  }

  const canonicalMembers = await verifyCanonicalNotificationMembership({
    supabaseUrl,
    serviceRoleKey,
    snapshotId: senderWorkspaceEvent?.sharedSpaceId,
    senderUserId: sender.id,
    recipientUserId,
    fetchImpl
  });
  if (!canonicalMembers) {
    return failure(403, "The reminder participants are no longer active", {
      code: "REMINDER_NOT_ALLOWED"
    });
  }

  const reservation = await reserveReminder({
    supabaseUrl,
    serviceRoleKey,
    eventId: normalizedEventId,
    transferId: normalizedTransferId,
    senderUserId: sender.id,
    recipientUserId,
    fetchImpl
  });
  if (!reservation) {
    return failure(503, "Payment reminder storage is temporarily unavailable", {
      code: "REMINDER_STORAGE_UNAVAILABLE",
      retryable: true
    });
  }
  if (!reservation?.allowed) {
    return failure(429, "A reminder was already sent recently", {
      code: "REMINDER_COOLDOWN",
      retryAt: String(reservation?.retry_at ?? "")
    });
  }

  const message = reminderMessage(senderEvent, senderTransfer);
  const privatePushNotification = {
    title: "תזכורת חדשה בסוגרים חשבון",
    body: "פרטי ההתחשבנות מחכים לך באפליקציה."
  };
  let storedInInbox = false;
  let devices = [];
  try {
    storedInInbox = await storeInboxNotification({
      supabaseUrl,
      serviceRoleKey,
      recipientUserId,
      senderUserId: sender.id,
      eventId: normalizedEventId,
      activityId: normalizedTransferId,
      kind: "payment-reminder",
      title: "תזכורת לסגירת חשבון",
      body: message,
      view: "summary",
      fetchImpl
    });
    devices = pushDeliveryReady
      ? await loadPaymentReminderDevices({
          supabaseUrl,
          serviceRoleKey,
          userId: recipientUserId,
          fetchImpl
        })
      : [];
  } catch (error) {
    // No FCM request has started, so this reservation is safe to release.
    await deleteReminderReservation({
      supabaseUrl,
      serviceRoleKey,
      reminderId: reservation.reminder_id,
      fetchImpl: cleanupFetchImpl
    });
    throw error;
  }
  if (!devices.length) {
    await completeReminderReservation({
      supabaseUrl,
      serviceRoleKey,
      reminderId: reservation.reminder_id,
      delivered: 0,
      fetchImpl: cleanupFetchImpl
    });
    return {
      ok: true,
      status: 200,
      payload: {
        ok: storedInInbox,
        delivered: 0,
        inbox: storedInInbox,
        reason: storedInInbox ? "in-app-only" : "notifications-disabled"
      }
    };
  }

  let firebase;
  try {
    firebase = await promiseWithTimeout(
      () => accessTokenProvider(env),
      accessTokenTimeoutMs
    );
  } catch {
    if (storedInInbox) {
      return finishInAppOnlyReminder({
        supabaseUrl,
        serviceRoleKey,
        reminderId: reservation.reminder_id,
        fetchImpl: cleanupFetchImpl
      });
    }
    await deleteReminderReservation({
      supabaseUrl,
      serviceRoleKey,
      reminderId: reservation.reminder_id,
      fetchImpl: cleanupFetchImpl
    });
    return failure(503, "Push delivery is temporarily unavailable", {
      code: "PUSH_UNAVAILABLE",
      retryable: true
    });
  }
  if (!firebase?.accessToken || !firebase?.projectId) {
    if (storedInInbox) {
      return finishInAppOnlyReminder({
        supabaseUrl,
        serviceRoleKey,
        reminderId: reservation.reminder_id,
        fetchImpl: cleanupFetchImpl
      });
    }
    await deleteReminderReservation({
      supabaseUrl,
      serviceRoleKey,
      reminderId: reservation.reminder_id,
      fetchImpl: cleanupFetchImpl
    });
    return failure(503, "Push delivery is temporarily unavailable", {
      code: "PUSH_UNAVAILABLE",
      retryable: true
    });
  }
  if (fetchImpl[DEADLINE_REMAINING_MS]() <= 0) {
    if (storedInInbox) {
      return finishInAppOnlyReminder({
        supabaseUrl,
        serviceRoleKey,
        reminderId: reservation.reminder_id,
        fetchImpl: cleanupFetchImpl
      });
    }
    await deleteReminderReservation({
      supabaseUrl,
      serviceRoleKey,
      reminderId: reservation.reminder_id,
      fetchImpl: cleanupFetchImpl
    });
    return failure(503, "Push delivery is temporarily unavailable", {
      code: "PUSH_UNAVAILABLE",
      retryable: true
    });
  }

  let delivered = 0;
  let deliveryUnconfirmed = false;
  for (const device of devices) {
    let response = null;
    let responsePayload = {};
    try {
      const deliveryResult = await fetchImpl(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(firebase.projectId)}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${firebase.accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: {
                title: privatePushNotification.title,
                body: privatePushNotification.body
              },
              data: {
                eventId: normalizedEventId,
                transferId: normalizedTransferId,
                view: "summary"
              },
              android: {
                priority: "high",
                notification: {
                  channel_id: "event-updates",
                  sound: "default"
                }
              }
            }
          })
        },
        async (deliveryResponse) => ({
          response: deliveryResponse,
          payload: deliveryResponse.ok
            ? {}
            : await deliveryResponse.json().catch(() => ({}))
        }),
        deliveryTimeoutMs
      );
      response = deliveryResult.response;
      responsePayload = deliveryResult.payload;
    } catch (error) {
      if (error?.requestStarted !== false) {
        deliveryUnconfirmed = true;
      }
      continue;
    }
    if (response.ok) {
      delivered += 1;
      continue;
    }

    if (invalidFirebaseToken(responsePayload)) {
      await disableInvalidPushToken({
        supabaseUrl,
        serviceRoleKey,
        token: device.token,
        fetchImpl: cleanupFetchImpl
      });
    }
  }

  if (!delivered) {
    if (storedInInbox) {
      return finishInAppOnlyReminder({
        supabaseUrl,
        serviceRoleKey,
        reminderId: reservation.reminder_id,
        fetchImpl: cleanupFetchImpl
      });
    }
    if (deliveryUnconfirmed) {
      // A lost FCM response may still represent an accepted notification.
      // Close the reservation rather than automatically retrying and risking
      // a duplicate reminder when the inbox write was also unavailable.
      await completeReminderReservation({
        supabaseUrl,
        serviceRoleKey,
        reminderId: reservation.reminder_id,
        delivered: 0,
        fetchImpl: cleanupFetchImpl
      });
      return failure(502, "Reminder delivery could not be confirmed", {
        code: "DELIVERY_UNCONFIRMED",
        retryable: false
      });
    }
    await deleteReminderReservation({
      supabaseUrl,
      serviceRoleKey,
      reminderId: reservation.reminder_id,
      fetchImpl: cleanupFetchImpl
    });
    return failure(502, "No device accepted the reminder", {
      code: "DELIVERY_FAILED",
      retryable: true
    });
  }

  await completeReminderReservation({
    supabaseUrl,
    serviceRoleKey,
    reminderId: reservation.reminder_id,
    delivered,
    fetchImpl: cleanupFetchImpl
  });
  return {
    ok: true,
    status: 200,
    payload: {
      ok: true,
      delivered,
      inbox: storedInInbox,
      recipientParticipantId: senderTransfer.fromParticipantId
    }
  };
}

async function promiseWithTimeout(factory, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("Push authorization timed out");
      error.code = "NETWORK_TIMEOUT";
      reject(error);
    }, Math.max(1, Number(timeoutMs) || PUSH_DELIVERY_REQUEST_TIMEOUT_MS));
  });
  try {
    return await Promise.race([Promise.resolve().then(factory), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function createDeadlineFetch(fetchImpl, timeoutMs) {
  if (fetchImpl?.[DEADLINE_FETCH]) return fetchImpl;

  const duration = Math.max(
    1,
    Number(timeoutMs) || PAYMENT_REMINDER_REQUEST_TIMEOUT_MS
  );
  const deadline = Date.now() + duration;
  const deadlineFetch = (
    url,
    options = {},
    consumeResponse = null,
    timeoutOverrideMs = null
  ) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      const error = new Error("Payment reminder request timed out");
      error.code = "NETWORK_TIMEOUT";
      error.requestStarted = false;
      return Promise.reject(error);
    }
    const overrideMs = Number(timeoutOverrideMs);
    const effectiveTimeoutMs = Number.isFinite(overrideMs) && overrideMs > 0
      ? Math.min(remainingMs, overrideMs)
      : remainingMs;
    return fetchWithTimeout(
      fetchImpl,
      url,
      options,
      effectiveTimeoutMs,
      consumeResponse
    );
  };
  Object.defineProperty(deadlineFetch, DEADLINE_FETCH, { value: true });
  Object.defineProperty(deadlineFetch, DEADLINE_REMAINING_MS, {
    value: () => deadline - Date.now()
  });
  return deadlineFetch;
}

function createCleanupFetch(fetchImpl) {
  return (url, options = {}, consumeResponse = null) =>
    fetchWithTimeout(
      fetchImpl,
      url,
      options,
      RESERVATION_CLEANUP_TIMEOUT_MS,
      consumeResponse
    );
}

async function fetchJsonResponse(fetchImpl, url, options, fallback) {
  const result = await fetchImpl(url, options, async (response) => ({
    response,
    payload: await response.json().catch(() => fallback)
  }));
  return result;
}

async function finishInAppOnlyReminder({
  supabaseUrl,
  serviceRoleKey,
  reminderId,
  fetchImpl
}) {
  await completeReminderReservation({
    supabaseUrl,
    serviceRoleKey,
    reminderId,
    delivered: 0,
    fetchImpl
  });
  return {
    ok: true,
    status: 200,
    payload: {
      ok: true,
      delivered: 0,
      inbox: true,
      reason: "in-app-only"
    }
  };
}

async function defaultFirebaseAccessTokenProvider(env) {
  const credentials = firebaseServiceAccountCredentials(env);
  const projectId = String(
    env.FIREBASE_PROJECT_ID || credentials.project_id || ""
  ).trim();
  const auth = new GoogleAuth({
    credentials,
    scopes: [FIREBASE_MESSAGING_SCOPE]
  });
  return {
    accessToken: await auth.getAccessToken(),
    projectId
  };
}

function firebaseServiceAccountCredentials(env) {
  const raw = String(env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "").trim();
  const encoded = String(
    env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 ?? ""
  ).trim();
  const json = raw || (
    encoded ? Buffer.from(encoded, "base64").toString("utf8") : ""
  );
  if (!json) throw new Error("Firebase service account is missing");
  const credentials = JSON.parse(json);
  if (
    !credentials?.client_email ||
    !credentials?.private_key ||
    !credentials?.project_id
  ) {
    throw new Error("Firebase service account is invalid");
  }
  return credentials;
}

async function loadAuthenticatedUser({
  supabaseUrl,
  anonKey,
  accessToken,
  fetchImpl
}) {
  const { response, payload } = await fetchJsonResponse(
    fetchImpl,
    `${supabaseUrl}/auth/v1/user`,
    {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`
      }
    },
    null
  );
  if (!response.ok) return null;
  return payload;
}

async function loadAccountState({
  supabaseUrl,
  serviceRoleKey,
  userId,
  eventId,
  fetchImpl
}) {
  const params = new URLSearchParams({
    owner_user_id: `eq.${userId}`,
    select: "state",
    order: "updated_at.desc",
    limit: "5"
  });
  const { response, payload } = await fetchJsonResponse(
    fetchImpl,
    `${supabaseUrl}/rest/v1/app_snapshots?${params}`,
    { headers: serviceHeaders(serviceRoleKey) },
    []
  );
  if (!response.ok) return null;
  const rows = payload;
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row?.state)
    .find((state) => eventFromState(state, eventId)) ?? null;
}

async function loadAuthoritativeSharedEvent({
  supabaseUrl,
  serviceRoleKey,
  eventId,
  workspaceEvent,
  senderUserId,
  fetchImpl
}) {
  const spaceId = String(workspaceEvent?.sharedSpaceId ?? "").trim();
  if (!isSafeSharedIdentifier(spaceId)) {
    return null;
  }

  // A shared link key can rotate while a member's personal workspace still
  // contains the previous key. Notification authorization must therefore use
  // the canonical membership registry, not a stale copy of the invitation key.
  // Passing the sender as both parties performs a strict active-member check;
  // the sender/recipient pair is checked again after the transfer is resolved.
  const senderIsCanonicalMember = await verifyCanonicalNotificationMembership({
    supabaseUrl,
    serviceRoleKey,
    snapshotId: spaceId,
    senderUserId,
    recipientUserId: senderUserId,
    fetchImpl
  });
  if (!senderIsCanonicalMember) return null;

  const params = new URLSearchParams({
    id: `eq.${spaceId}`,
    owner_user_id: "is.null",
    snapshot_kind: "eq.shared_event",
    select: "state",
    limit: "1"
  });
  const { response, payload } = await fetchJsonResponse(
    fetchImpl,
    `${supabaseUrl}/rest/v1/app_snapshots?${params}`,
    { headers: serviceHeaders(serviceRoleKey) },
    []
  );
  if (!response.ok) return null;

  const rows = payload;
  const snapshot = Array.isArray(rows) ? rows[0] ?? null : null;
  return eventFromState(snapshot?.state, eventId);
}

function isActiveEventParticipant(event, participantId) {
  return Boolean(
    participantId &&
    event?.participantIds?.includes(participantId) &&
    !(event.inactiveParticipantIds ?? []).includes(participantId)
  );
}

async function loadPaymentReminderDevices({
  supabaseUrl,
  serviceRoleKey,
  userId,
  fetchImpl
}) {
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    enabled: "eq.true",
    select: "token,preferences",
    order: "last_seen_at.desc",
    limit: "8"
  });
  const { response, payload } = await fetchJsonResponse(
    fetchImpl,
    `${supabaseUrl}/rest/v1/push_devices?${params}`,
    { headers: serviceHeaders(serviceRoleKey) },
    []
  );
  if (!response.ok) return [];
  const rows = payload;
  return (Array.isArray(rows) ? rows : []).filter(
    (row) =>
      String(row?.token ?? "").length >= 20 &&
      row?.preferences?.paymentReminders !== false
  );
}

async function reserveReminder({
  supabaseUrl,
  serviceRoleKey,
  eventId,
  transferId,
  senderUserId,
  recipientUserId,
  fetchImpl
}) {
  const { response, payload } = await fetchJsonResponse(
    fetchImpl,
    `${supabaseUrl}/rest/v1/rpc/reserve_payment_reminder`,
    {
      method: "POST",
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({
        p_event_id: eventId,
        p_transfer_id: transferId,
        p_sender_user_id: senderUserId,
        p_recipient_user_id: recipientUserId,
        p_cooldown_minutes: REMINDER_COOLDOWN_MINUTES
      })
    },
    null
  );
  if (!response.ok) return null;
  return payload;
}

async function verifyCanonicalNotificationMembership({
  supabaseUrl,
  serviceRoleKey,
  snapshotId,
  senderUserId,
  recipientUserId,
  fetchImpl
}) {
  if (
    !isSafeSharedIdentifier(snapshotId) ||
    !UUID_PATTERN.test(String(senderUserId ?? "")) ||
    !UUID_PATTERN.test(String(recipientUserId ?? ""))
  ) return false;

  const { response, payload } = await fetchJsonResponse(
    fetchImpl,
    `${supabaseUrl}/rest/v1/rpc/verify_shared_event_notification_parties`,
    {
      method: "POST",
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({
        p_snapshot_id: snapshotId,
        p_sender_user_id: senderUserId,
        p_recipient_user_id: recipientUserId
      })
    },
    false
  );
  if (!response.ok) return false;
  return payload === true;
}

async function completeReminderReservation({
  supabaseUrl,
  serviceRoleKey,
  reminderId,
  delivered,
  fetchImpl
}) {
  if (!UUID_PATTERN.test(String(reminderId ?? ""))) return;
  await fetchImpl(
    `${supabaseUrl}/rest/v1/payment_reminders?id=eq.${reminderId}`,
    {
      method: "PATCH",
      headers: {
        ...serviceHeaders(serviceRoleKey),
        prefer: "return=minimal"
      },
      body: JSON.stringify({ delivered_devices: delivered })
    }
  ).catch(() => {});
}

async function deleteReminderReservation({
  supabaseUrl,
  serviceRoleKey,
  reminderId,
  fetchImpl
}) {
  if (!UUID_PATTERN.test(String(reminderId ?? ""))) return;
  await fetchImpl(
    `${supabaseUrl}/rest/v1/payment_reminders?id=eq.${reminderId}`,
    {
      method: "DELETE",
      headers: serviceHeaders(serviceRoleKey)
    }
  ).catch(() => {});
}

async function disableInvalidPushToken({
  supabaseUrl,
  serviceRoleKey,
  token,
  fetchImpl
}) {
  const params = new URLSearchParams({ token: `eq.${token}` });
  await fetchImpl(
    `${supabaseUrl}/rest/v1/push_devices?${params}`,
    {
      method: "PATCH",
      headers: {
        ...serviceHeaders(serviceRoleKey),
        prefer: "return=minimal"
      },
      body: JSON.stringify({
        enabled: false,
        updated_at: new Date().toISOString()
      })
    }
  ).catch(() => {});
}

function eventFromState(state, eventId) {
  return Array.isArray(state?.events)
    ? state.events.find((event) => event?.id === eventId) ?? null
    : null;
}

function transferFromState(state, event, transferId) {
  if (!event || !Array.isArray(state?.participants)) return null;
  const participantIds = new Set(event.participantIds ?? []);
  const participants = state.participants.filter((participant) =>
    participantIds.has(participant?.id)
  );
  const settlement = reconcileSettlementTransfers(
    participants,
    Array.isArray(event.expenses) ? event.expenses : [],
    Array.isArray(event.transfers) ? event.transfers : [],
    settlementOptionsForEvent(event)
  );
  return settlement.transfers.find((transfer) => transfer.id === transferId) ?? null;
}

function accountUserId(participantId) {
  const value = String(participantId ?? "");
  const userId = value.startsWith("account-") ? value.slice(8) : "";
  return UUID_PATTERN.test(userId) ? userId : "";
}

function reminderMessage(event, transfer) {
  const eventName = String(event?.name ?? "האירוע").trim().slice(0, 60);
  const amount = formatCurrency(
    transfer.amount,
    normalizeCurrency(event?.currency)
  );
  return `נשארה לך העברה של ${amount} באירוע "${eventName}".`;
}

function invalidFirebaseToken(payload) {
  const serialized = JSON.stringify(payload ?? {});
  return (
    serialized.includes("UNREGISTERED") ||
    serialized.includes("registration-token-not-registered")
  );
}

function serviceHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json"
  };
}

function bearerToken(value) {
  return String(value).match(/^Bearer\s+([^\s]+)$/i)?.[1] ?? "";
}

function failure(status, error, details = {}) {
  return {
    ok: false,
    status,
    payload: { ok: false, error, ...details }
  };
}
