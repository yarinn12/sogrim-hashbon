import { GoogleAuth } from "google-auth-library";

import { formatCurrency, normalizeCurrency } from "../domain/currencies.mjs";
import {
  reconcileSettlementTransfers,
  usesRoundedSettlementTransfers
} from "../domain/settlement.mjs";
import { isSafeSharedIdentifier } from "../domain/sharedStateMerge.mjs";
import { storeInboxNotification } from "./notificationInbox.mjs";

const FIREBASE_MESSAGING_SCOPE =
  "https://www.googleapis.com/auth/firebase.messaging";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REMINDER_COOLDOWN_MINUTES = 12 * 60;

export async function sendPaymentReminder({
  runtimeConfig,
  env = process.env,
  authorization = "",
  eventId = "",
  transferId = "",
  fetchImpl = fetch,
  accessTokenProvider = defaultFirebaseAccessTokenProvider
}) {
  const normalizedEventId = String(eventId ?? "").trim();
  const normalizedTransferId = String(transferId ?? "").trim();
  const supabaseUrl = String(runtimeConfig?.storage?.url ?? "").replace(/\/+$/, "");
  const anonKey = String(runtimeConfig?.storage?.anonKey ?? "").trim();
  const serviceRoleKey = String(
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || ""
  ).trim();
  const accountToken = bearerToken(authorization);

  if (!runtimeConfig?.launch?.pushDeliveryReady) {
    return failure(503, "Push delivery is not configured", {
      code: "PUSH_UNAVAILABLE"
    });
  }
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
  const senderEvent = eventFromState(senderState, normalizedEventId);
  const senderTransfer = transferFromState(
    senderState,
    senderEvent,
    normalizedTransferId
  );
  const senderParticipantId = `account-${sender.id}`;
  if (
    !senderEvent ||
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

  const recipientState = await loadAccountState({
    supabaseUrl,
    serviceRoleKey,
    userId: recipientUserId,
    eventId: normalizedEventId,
    fetchImpl
  });
  const recipientEvent = eventFromState(recipientState, normalizedEventId);
  const recipientTransfer = transferFromState(
    recipientState,
    recipientEvent,
    normalizedTransferId
  );
  if (!matchingPendingTransfer(senderTransfer, recipientTransfer)) {
    return failure(409, "The shared payment is not synchronized yet", {
      code: "EVENT_NOT_SYNCED",
      retryable: true
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
  if (!reservation?.allowed) {
    return failure(429, "A reminder was already sent recently", {
      code: "REMINDER_COOLDOWN",
      retryAt: String(reservation?.retry_at ?? "")
    });
  }

  const message = reminderMessage(senderEvent, senderTransfer);
  const storedInInbox = await storeInboxNotification({
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
  const devices = await loadPaymentReminderDevices({
    supabaseUrl,
    serviceRoleKey,
    userId: recipientUserId,
    fetchImpl
  });
  if (!devices.length) {
    await completeReminderReservation({
      supabaseUrl,
      serviceRoleKey,
      reminderId: reservation.reminder_id,
      delivered: 0,
      fetchImpl
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
    firebase = await accessTokenProvider(env);
  } catch {
    await deleteReminderReservation({
      supabaseUrl,
      serviceRoleKey,
      reminderId: reservation.reminder_id,
      fetchImpl
    });
    return failure(503, "Push delivery is temporarily unavailable", {
      code: "PUSH_UNAVAILABLE",
      retryable: true
    });
  }
  if (!firebase?.accessToken || !firebase?.projectId) {
    await deleteReminderReservation({
      supabaseUrl,
      serviceRoleKey,
      reminderId: reservation.reminder_id,
      fetchImpl
    });
    return failure(503, "Push delivery is temporarily unavailable", {
      code: "PUSH_UNAVAILABLE",
      retryable: true
    });
  }

  let delivered = 0;
  for (const device of devices) {
    const response = await fetchImpl(
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
              title: "תזכורת לסגירת חשבון",
              body: message
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
      }
    );
    if (response.ok) {
      delivered += 1;
      continue;
    }

    const payload = await response.json().catch(() => ({}));
    if (invalidFirebaseToken(payload)) {
      await disableInvalidPushToken({
        supabaseUrl,
        serviceRoleKey,
        token: device.token,
        fetchImpl
      });
    }
  }

  if (!delivered) {
    await deleteReminderReservation({
      supabaseUrl,
      serviceRoleKey,
      reminderId: reservation.reminder_id,
      fetchImpl
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
    fetchImpl
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
  const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
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
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/app_snapshots?${params}`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row?.state)
    .find((state) => eventFromState(state, eventId)) ?? null;
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
    select: "token,preferences"
  });
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/push_devices?${params}`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  if (!response.ok) return [];
  const rows = await response.json().catch(() => []);
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
  const response = await fetchImpl(
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
    }
  );
  if (!response.ok) return null;
  return response.json().catch(() => null);
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
    { roundTransfers: usesRoundedSettlementTransfers(event) }
  );
  return settlement.transfers.find((transfer) => transfer.id === transferId) ?? null;
}

function matchingPendingTransfer(expected, actual) {
  return Boolean(
    expected &&
    actual &&
    actual.status !== "paid" &&
    expected.fromParticipantId === actual.fromParticipantId &&
    expected.toParticipantId === actual.toParticipantId &&
    expected.amount === actual.amount
  );
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
