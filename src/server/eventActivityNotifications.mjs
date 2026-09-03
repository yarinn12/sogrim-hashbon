import { createHash, timingSafeEqual } from "node:crypto";

import { GoogleAuth } from "google-auth-library";

import { buildEventInviteUrl } from "../domain/inviteLinks.mjs";
import { isSafeSharedIdentifier } from "../domain/sharedStateMerge.mjs";
import { fetchWithTimeout } from "../data/fetchTimeout.mjs";
import {
  activateEventInviteMembership,
  createPrivateEventInvite
} from "./eventInvites.mjs";
import { storeInboxNotification } from "./notificationInbox.mjs";

const FIREBASE_MESSAGING_SCOPE =
  "https://www.googleapis.com/auth/firebase.messaging";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVITY_KINDS = new Set([
  "expense-created",
  "participant-joined",
  "event-invite",
  "event-closed"
]);
const EXPENSE_COOLDOWN_SECONDS = 45;
const PUSH_DELIVERY_REQUEST_TIMEOUT_MS = 10_000;
const RESERVATION_CLEANUP_TIMEOUT_MS = 2_000;
export const EVENT_ACTIVITY_REQUEST_TIMEOUT_MS = 10_000;
const DEADLINE_FETCH = Symbol("event-activity-deadline-fetch");
const DEADLINE_REMAINING_MS = Symbol("event-activity-deadline-remaining-ms");

export async function sendEventActivityNotification({
  runtimeConfig,
  env = process.env,
  authorization = "",
  eventId = "",
  activityId = "",
  kind = "",
  fetchImpl = fetch,
  accessTokenProvider = defaultFirebaseAccessTokenProvider,
  deliveryTimeoutMs = PUSH_DELIVERY_REQUEST_TIMEOUT_MS,
  accessTokenTimeoutMs = PUSH_DELIVERY_REQUEST_TIMEOUT_MS,
  requestTimeoutMs = EVENT_ACTIVITY_REQUEST_TIMEOUT_MS
}) {
  const normalizedEventId = String(eventId ?? "").trim();
  const normalizedActivityId = String(activityId ?? "").trim();
  const normalizedKind = String(kind ?? "").trim();
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
    !isSafeSharedIdentifier(normalizedActivityId) ||
    !ACTIVITY_KINDS.has(normalizedKind)
  ) {
    return failure(400, "Event notification is invalid", {
      code: "INVALID_EVENT_ACTIVITY"
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
    fetchImpl
  });
  const senderParticipantId = `account-${sender.id}`;
  if (
    !senderEvent ||
    !isActiveEventParticipant(senderEvent, senderParticipantId) ||
    !activityBelongsToSender({
      event: senderEvent,
      senderParticipantId,
      activityId: normalizedActivityId,
      kind: normalizedKind
    })
  ) {
    return failure(403, "The event activity could not be verified", {
      code: "EVENT_ACTIVITY_NOT_ALLOWED"
    });
  }

  const invitationRecipientId = normalizedKind === "event-invite"
    ? accountUserId(normalizedActivityId)
    : "";
  const recipientUserIds = normalizedKind === "event-invite"
    ? [invitationRecipientId].filter(
        (userId) => userId && userId !== sender.id
      )
    : [
         ...new Set(
           (senderEvent.participantIds ?? [])
            .filter(
              (participantId) =>
                !(senderEvent.inactiveParticipantIds ?? []).includes(participantId)
            )
             .map(accountUserId)
             .filter((userId) => userId && userId !== sender.id)
         )
      ];
  const notification = activityMessage(senderEvent, normalizedKind);
  const privatePushNotification = privateActivityNotification(normalizedKind);
  const eligibleRecipients = [];
  const reservedRecipients = [];
  let inboxRecipients = 0;
  let membershipRecipients = 0;
  try {
    for (const recipientUserId of recipientUserIds) {
      const canonicallyActive = await (
        normalizedKind === "event-invite"
          ? verifyCanonicalInvitationTarget
          : verifyCanonicalNotificationMembership
      )({
        supabaseUrl,
        serviceRoleKey,
        snapshotId: senderEvent.sharedSpaceId,
        senderUserId: sender.id,
        recipientUserId,
        fetchImpl
      });
      if (!canonicallyActive) continue;

      let privateInvite = null;
      if (normalizedKind === "event-invite") {
        privateInvite = await createPrivateEventInvite({
          supabaseUrl,
          serviceRoleKey,
          event: senderEvent,
          senderUserId: sender.id,
          recipientUserId,
          fetchImpl
        });
        const membershipActivated = privateInvite &&
          await activateEventInviteMembership({
            supabaseUrl,
            serviceRoleKey,
            invite: privateInvite,
            snapshotId: senderEvent.sharedSpaceId,
            userId: recipientUserId,
            fetchImpl
          });
        if (!membershipActivated) continue;
        membershipRecipients += 1;
      }

      let needsRecoveryInvite = false;
      if (normalizedKind !== "event-invite") {
        const recipientState = await loadAccountState({
          supabaseUrl,
          serviceRoleKey,
          userId: recipientUserId,
          eventId: normalizedEventId,
          fetchImpl
        });
        const recipientEvent = eventFromState(recipientState, normalizedEventId);
        needsRecoveryInvite = !sameSharedEvent(senderEvent, recipientEvent);
      }

      const reservation = await reserveActivityNotification({
        supabaseUrl,
        serviceRoleKey,
        eventId: normalizedEventId,
        activityId: normalizedActivityId,
        kind: normalizedKind,
        senderUserId: sender.id,
        recipientUserId,
        minimumIntervalSeconds:
          normalizedKind === "expense-created" ? EXPENSE_COOLDOWN_SECONDS : 0,
        fetchImpl
      });
      if (reservation?.allowed) {
        reservedRecipients.push({
          notificationId: reservation.notification_id
        });
      }
      const shouldStoreInInbox = Boolean(
        reservation?.allowed || reservation?.reason === "rate-limited"
      );
      if (!shouldStoreInInbox) continue;

      let actionUrl = "";
      if (normalizedKind === "event-invite" || needsRecoveryInvite) {
        privateInvite ??= await createPrivateEventInvite({
          supabaseUrl,
          serviceRoleKey,
          event: senderEvent,
          senderUserId: sender.id,
          recipientUserId,
          fetchImpl
        });
        actionUrl = eventInvitationUrl(
          runtimeConfig?.publicUrl,
          senderEvent,
          privateInvite?.token
        );
        if (!actionUrl) {
          await deleteActivityReservation({
            supabaseUrl,
            serviceRoleKey,
            notificationId: reservation.notification_id,
            fetchImpl: cleanupFetchImpl
          });
          continue;
        }
      }

      const storedInInbox = await storeInboxNotification({
        supabaseUrl,
        serviceRoleKey,
        recipientUserId,
        senderUserId: sender.id,
        eventId: normalizedEventId,
        activityId: normalizedActivityId,
        kind: normalizedKind,
        title: notification.title,
        body: notification.body,
        view: normalizedKind === "event-closed" ? "summary" : "event",
        actionUrl,
        publicUrl: runtimeConfig?.publicUrl,
        fetchImpl
      });
      if (storedInInbox) inboxRecipients += 1;
      if (!reservation?.allowed) continue;

      if (!pushDeliveryReady) {
        await completeActivityNotification({
          supabaseUrl,
          serviceRoleKey,
          notificationId: reservation.notification_id,
          delivered: 0,
          fetchImpl: cleanupFetchImpl
        });
        continue;
      }

      const devices = await loadEventUpdateDevices({
        supabaseUrl,
        serviceRoleKey,
        userId: recipientUserId,
        fetchImpl
      });
      if (!devices.length) {
        await completeActivityNotification({
          supabaseUrl,
          serviceRoleKey,
          notificationId: reservation.notification_id,
          delivered: 0,
          fetchImpl: cleanupFetchImpl
        });
        continue;
      }

      eligibleRecipients.push({
        recipientUserId,
        devices,
        notificationId: reservation.notification_id,
        actionUrl
      });
    }
  } catch (error) {
    // No FCM request has started yet, so releasing these reservations is safe.
    // Without cleanup, a retry treats them as duplicates and silently loses push.
    await releaseReservations({
      supabaseUrl,
      serviceRoleKey,
      recipients: reservedRecipients,
      fetchImpl: cleanupFetchImpl
    });
    throw error;
  }

  if (!eligibleRecipients.length) {
    return {
      ok: true,
      status: 200,
      payload: {
        ok: membershipRecipients > 0 || inboxRecipients > 0,
        delivered: 0,
        recipients: 0,
        inboxRecipients,
        ...(membershipRecipients > 0 ? { membershipRecipients } : {}),
        reason: inboxRecipients > 0
          ? "in-app-only"
          : membershipRecipients > 0
            ? "access-granted"
            : "no-eligible-recipients"
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
    await releaseReservations({
      supabaseUrl,
      serviceRoleKey,
      recipients: reservedRecipients,
      fetchImpl: cleanupFetchImpl
    });
    if (membershipRecipients > 0) {
      return membershipAccessGrantedResponse({
        membershipRecipients,
        inboxRecipients
      });
    }
    return failure(503, "Push delivery is temporarily unavailable", {
      code: "PUSH_UNAVAILABLE",
      retryable: true
    });
  }
  if (!firebase?.accessToken || !firebase?.projectId) {
    await releaseReservations({
      supabaseUrl,
      serviceRoleKey,
      recipients: reservedRecipients,
      fetchImpl: cleanupFetchImpl
    });
    if (membershipRecipients > 0) {
      return membershipAccessGrantedResponse({
        membershipRecipients,
        inboxRecipients
      });
    }
    return failure(503, "Push delivery is temporarily unavailable", {
      code: "PUSH_UNAVAILABLE",
      retryable: true
    });
  }
  if (fetchImpl[DEADLINE_REMAINING_MS]() <= 0) {
    await releaseReservations({
      supabaseUrl,
      serviceRoleKey,
      recipients: reservedRecipients,
      fetchImpl: cleanupFetchImpl
    });
    if (membershipRecipients > 0) {
      return membershipAccessGrantedResponse({
        membershipRecipients,
        inboxRecipients
      });
    }
    return failure(503, "Push delivery is temporarily unavailable", {
      code: "PUSH_UNAVAILABLE",
      retryable: true
    });
  }

  let delivered = 0;
  let deliveredRecipients = 0;
  let unconfirmedRecipients = 0;
  for (const recipient of eligibleRecipients) {
    let recipientDeliveries = 0;
    let recipientDeliveryUnconfirmed = false;
    for (const device of recipient.devices) {
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
                notification: privatePushNotification,
                data: {
                  eventId: normalizedEventId,
                  activityId: normalizedActivityId,
                  kind: normalizedKind,
                  view: normalizedKind === "event-closed" ? "summary" : "event",
                  actionUrl: recipient.actionUrl
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
          recipientDeliveryUnconfirmed = true;
        }
        continue;
      }
      if (response.ok) {
        delivered += 1;
        recipientDeliveries += 1;
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

    if (recipientDeliveries) {
      deliveredRecipients += 1;
      await completeActivityNotification({
        supabaseUrl,
        serviceRoleKey,
        notificationId: recipient.notificationId,
        delivered: recipientDeliveries,
        fetchImpl: cleanupFetchImpl
      });
    } else if (recipientDeliveryUnconfirmed) {
      // The in-app notification is already durable. Treat a lost FCM response
      // as an in-app-only completion so an automatic retry cannot double-send.
      unconfirmedRecipients += 1;
      await completeActivityNotification({
        supabaseUrl,
        serviceRoleKey,
        notificationId: recipient.notificationId,
        delivered: 0,
        fetchImpl: cleanupFetchImpl
      });
    } else {
      await deleteActivityReservation({
        supabaseUrl,
        serviceRoleKey,
        notificationId: recipient.notificationId,
        fetchImpl: cleanupFetchImpl
      });
    }
  }

  if (!delivered) {
    if (membershipRecipients > 0) {
      return membershipAccessGrantedResponse({
        membershipRecipients,
        inboxRecipients
      });
    }
    if (unconfirmedRecipients > 0 && inboxRecipients > 0) {
      return {
        ok: true,
        status: 200,
        payload: {
          ok: true,
          delivered: 0,
          recipients: 0,
          inboxRecipients,
          reason: "in-app-only"
        }
      };
    }
    return failure(502, "No device accepted the event notification", {
      code: "DELIVERY_FAILED",
      retryable: true
    });
  }

  return {
    ok: true,
    status: 200,
    payload: {
      ok: true,
      delivered,
      recipients: deliveredRecipients,
      inboxRecipients,
      ...(membershipRecipients > 0 ? { membershipRecipients } : {})
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
    Number(timeoutMs) || EVENT_ACTIVITY_REQUEST_TIMEOUT_MS
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
      const error = new Error("Event activity request timed out");
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
  return fetchImpl(url, options, async (response) => ({
    response,
    payload: await response.json().catch(() => fallback)
  }));
}

function membershipAccessGrantedResponse({
  membershipRecipients,
  inboxRecipients
}) {
  return {
    ok: true,
    status: 200,
    payload: {
      ok: true,
      delivered: 0,
      recipients: 0,
      inboxRecipients,
      membershipRecipients,
      reason: "access-granted"
    }
  };
}

function activityBelongsToSender({
  event,
  senderParticipantId,
  activityId,
  kind
}) {
  if (kind === "event-invite") {
    return (
      isActiveEventParticipant(event, activityId) &&
      (!event.adminsCanEditOnly || event.adminIds?.includes(senderParticipantId))
    );
  }
  if (kind === "participant-joined") {
    return activityId === senderParticipantId;
  }
  if (kind === "event-closed") {
    const closedAt = String(event?.closedAt ?? "").trim();
    const closingActivity = (event.activityLog ?? []).find(
      (entry) => entry?.id === activityId && entry?.kind === kind
    );
    return Boolean(
      event?.locked === true &&
      closedAt &&
      event?.adminIds?.includes(senderParticipantId) &&
      closingActivity?.actorParticipantId === senderParticipantId &&
      String(closingActivity?.occurredAt ?? "").trim() === closedAt
    );
  }
  const expense = (event.expenses ?? []).find((item) => item?.id === activityId);
  return expense?.createdByParticipantId === senderParticipantId;
}

function isActiveEventParticipant(event, participantId) {
  return Boolean(
    participantId &&
    event?.participantIds?.includes(participantId) &&
    !(event.inactiveParticipantIds ?? []).includes(participantId)
  );
}

function sameSharedEvent(expected, actual) {
  const expectedSpaceId = String(expected?.sharedSpaceId ?? "");
  const expectedSpaceKey = String(expected?.sharedSpaceKey ?? "");
  return Boolean(
    expected &&
    actual &&
    expected.id === actual.id &&
    expectedSpaceId &&
    expectedSpaceKey &&
    expectedSpaceId === String(actual.sharedSpaceId ?? "") &&
    expectedSpaceKey === String(actual.sharedSpaceKey ?? "")
  );
}

function activityMessage(event, kind) {
  const eventName = String(event?.name ?? "האירוע").trim().slice(0, 60);
  if (kind === "event-closed") {
    return {
      title: "האירוע נסגר — הגיע הזמן לשלם",
      body: `הסכומים באירוע "${eventName}" סופיים. אפשר לראות עכשיו מי מעביר למי.`
    };
  }
  if (kind === "event-invite") {
    return {
      title: "הזמנה לאירוע",
      body: `הזמינו אותך להצטרף לאירוע "${eventName}".`
    };
  }
  return kind === "participant-joined"
    ? {
        title: "משתתף חדש הצטרף",
        body: `משתתף חדש הצטרף לאירוע "${eventName}".`
      }
    : {
        title: "הוצאה חדשה באירוע",
        body: `נוספה הוצאה חדשה לאירוע "${eventName}".`
      };
}

function eventInvitationUrl(publicUrl, event, inviteToken) {
  const baseUrl = String(publicUrl ?? "").trim();
  if (
    !baseUrl ||
    !isSafeSharedIdentifier(event?.id) ||
    !inviteToken
  ) {
    return "";
  }
  try {
    return buildEventInviteUrl(baseUrl, event.id, null, {
      inviteToken
    });
  } catch {
    return "";
  }
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

function privateActivityNotification(kind) {
  if (kind === "event-invite") {
    return {
      title: "הזמנה חדשה בסוגרים חשבון",
      body: "הזמנה חדשה מחכה לך באפליקציה."
    };
  }
  if (kind === "event-closed") {
    return {
      title: "הגיע הזמן לסגור חשבון",
      body: "פרטי ההתחשבנות מחכים לך באפליקציה."
    };
  }
  return {
    title: "עדכון חדש בסוגרים חשבון",
    body: "פרטי האירוע מחכים לך באפליקציה."
  };
}

async function loadAuthoritativeSharedEvent({
  supabaseUrl,
  serviceRoleKey,
  eventId,
  workspaceEvent,
  fetchImpl
}) {
  const spaceId = String(workspaceEvent?.sharedSpaceId ?? "").trim();
  const spaceKey = String(workspaceEvent?.sharedSpaceKey ?? "").trim();
  if (
    !isSafeSharedIdentifier(spaceId) ||
    !isSafeSharedIdentifier(spaceKey)
  ) {
    return null;
  }
  const params = new URLSearchParams({
    id: `eq.${spaceId}`,
    owner_user_id: "is.null",
    snapshot_kind: "eq.shared_event",
    select: "state,access_key_hash",
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
  const expectedHash = createHash("sha256").update(spaceKey).digest("hex");
  if (!secureHashEquals(snapshot?.access_key_hash, expectedHash)) return null;

  const event = eventFromState(snapshot.state, eventId);
  return event
    ? { ...event, sharedSpaceId: spaceId, sharedSpaceKey: spaceKey }
    : null;
}

async function loadEventUpdateDevices({
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
      row?.preferences?.eventUpdates !== false
  );
}

async function reserveActivityNotification({
  supabaseUrl,
  serviceRoleKey,
  eventId,
  activityId,
  kind,
  senderUserId,
  recipientUserId,
  minimumIntervalSeconds,
  fetchImpl
}) {
  const { response, payload } = await fetchJsonResponse(
    fetchImpl,
    `${supabaseUrl}/rest/v1/rpc/reserve_event_activity_notification`,
    {
      method: "POST",
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({
        p_event_id: eventId,
        p_activity_id: activityId,
        p_kind: kind,
        p_sender_user_id: senderUserId,
        p_recipient_user_id: recipientUserId,
        p_min_interval_seconds: minimumIntervalSeconds
      })
    },
    null
  );
  if (!response.ok) return null;
  return payload;
}

async function completeActivityNotification({
  supabaseUrl,
  serviceRoleKey,
  notificationId,
  delivered,
  fetchImpl
}) {
  if (!UUID_PATTERN.test(String(notificationId ?? ""))) return;
  await fetchImpl(
    `${supabaseUrl}/rest/v1/event_activity_notifications?id=eq.${notificationId}`,
    {
      method: "PATCH",
      headers: {
        ...serviceHeaders(serviceRoleKey),
        prefer: "return=minimal"
      },
      body: JSON.stringify({
        status: "delivered",
        delivered_devices: delivered,
        delivered_at: new Date().toISOString()
      })
    }
  ).catch(() => {});
}

async function deleteActivityReservation({
  supabaseUrl,
  serviceRoleKey,
  notificationId,
  fetchImpl
}) {
  if (!UUID_PATTERN.test(String(notificationId ?? ""))) return;
  await fetchImpl(
    `${supabaseUrl}/rest/v1/event_activity_notifications?id=eq.${notificationId}&status=eq.reserved`,
    {
      method: "DELETE",
      headers: serviceHeaders(serviceRoleKey)
    }
  ).catch(() => {});
}

async function releaseReservations({
  supabaseUrl,
  serviceRoleKey,
  recipients,
  fetchImpl
}) {
  await Promise.all(
    recipients.map((recipient) =>
      deleteActivityReservation({
        supabaseUrl,
        serviceRoleKey,
        notificationId: recipient.notificationId,
        fetchImpl
      })
    )
  );
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

function accountUserId(participantId) {
  const value = String(participantId ?? "");
  const userId = value.startsWith("account-") ? value.slice(8) : "";
  return UUID_PATTERN.test(userId) ? userId : "";
}

function invalidFirebaseToken(payload) {
  const serialized = JSON.stringify(payload ?? {});
  return (
    serialized.includes("UNREGISTERED") ||
    serialized.includes("registration-token-not-registered")
  );
}

function secureHashEquals(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""));
  const rightBuffer = Buffer.from(String(right ?? ""));
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
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

async function verifyCanonicalInvitationTarget({
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
    `${supabaseUrl}/rest/v1/rpc/verify_shared_event_invitation_parties`,
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
