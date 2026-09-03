import { createHmac, timingSafeEqual } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { fetchWithTimeout } from "../data/fetchTimeout.mjs";

const FIREBASE_MESSAGING_SCOPE =
  "https://www.googleapis.com/auth/firebase.messaging";
const AUTH_CONTEXT = "sogrim-broadcast-admin-v1";
const MAX_TITLE_LENGTH = 80;
const MAX_BODY_LENGTH = 240;
const MAX_CAMPAIGN_LENGTH = 80;
export const PUSH_DELIVERY_REQUEST_TIMEOUT_MS = 10_000;
export const BROADCAST_DEPENDENCY_TIMEOUT_MS = 10_000;
const BOUNDED_FETCH = Symbol("broadcast-bounded-fetch");

export async function sendBroadcastNotification({
  env = process.env,
  authorization = "",
  title = "",
  body = "",
  campaignId = "",
  fetchImpl = fetch,
  accessTokenProvider = defaultFirebaseAccessTokenProvider,
  deliveryTimeoutMs = PUSH_DELIVERY_REQUEST_TIMEOUT_MS,
  accessTokenTimeoutMs = PUSH_DELIVERY_REQUEST_TIMEOUT_MS,
  requestTimeoutMs = BROADCAST_DEPENDENCY_TIMEOUT_MS
} = {}) {
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return failure(503, "Broadcast delivery is unavailable", "BROADCAST_UNAVAILABLE");
  }
  if (!authorizedRequest(authorization, serviceRoleKey)) {
    return failure(401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!pushDeliveryEnabled(env.PUSH_DELIVERY_ENABLED)) {
    return failure(503, "Push delivery is unavailable", "PUSH_UNAVAILABLE");
  }

  const notification = normalizeNotification({ title, body, campaignId });
  if (!notification) {
    return failure(400, "Invalid notification payload", "INVALID_PAYLOAD");
  }

  fetchImpl = createBoundedFetch(fetchImpl, requestTimeoutMs);

  const devicesResult = await loadEnabledPushDevices({
    supabaseUrl,
    serviceRoleKey,
    fetchImpl
  });
  if (!devicesResult.ok) {
    return failure(503, "Could not load push recipients", "RECIPIENTS_UNAVAILABLE");
  }

  const devices = [
    ...new Map(
      devicesResult.devices
        .filter((device) => String(device?.token || "").trim())
        .map((device) => [device.token, device])
    ).values()
  ];
  const targetedUsers = new Set(
    devices.map((device) => String(device.user_id || "")).filter(Boolean)
  ).size;

  if (!devices.length) {
    return {
      status: 200,
      payload: {
        ok: true,
        targetedDevices: 0,
        targetedUsers: 0,
        delivered: 0,
        failed: 0,
        disabledInvalid: 0,
        suppressedDuplicates: 0
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
    return failure(503, "Push delivery is unavailable", "PUSH_UNAVAILABLE");
  }
  if (!firebase?.accessToken || !firebase?.projectId) {
    return failure(503, "Push delivery is unavailable", "PUSH_UNAVAILABLE");
  }

  let delivered = 0;
  let failed = 0;
  let disabledInvalid = 0;
  let suppressedDuplicates = 0;

  for (const device of devices) {
    const reservation = await reserveBroadcastDelivery({
      supabaseUrl,
      serviceRoleKey,
      campaignId: notification.campaignId,
      device,
      fetchImpl
    });
    if (!reservation.ok) {
      failed += 1;
      continue;
    }
    if (!reservation.reserved) {
      if (reservation.completed) suppressedDuplicates += 1;
      else failed += 1;
      continue;
    }

    let response = null;
    let responsePayload = {};
    let deliveryUnconfirmed = false;
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
                title: notification.title,
                body: notification.body
              },
              data: {
                kind: "broadcast",
                campaign: notification.campaignId
              },
              android: {
                collapse_key: notification.campaignId,
                priority: "high",
                notification: {
                  channel_id: "event-updates",
                  sound: "default"
                }
              },
              apns: {
                headers: {
                  "apns-collapse-id": notification.campaignId
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
    } catch {
      // A timeout or transport failure has an unknown outcome: FCM may have
      // accepted the message before the response was lost. Keep the
      // reservation so a retry cannot double-send it.
      deliveryUnconfirmed = true;
    }

    if (response?.ok) {
      delivered += 1;
      await markBroadcastDeliveryCompleted({
        supabaseUrl,
        serviceRoleKey,
        campaignId: notification.campaignId,
        deviceId: device.id,
        fetchImpl
      });
      continue;
    }

    failed += 1;
    if (invalidFirebaseToken(responsePayload)) {
      await disableInvalidPushToken({
        supabaseUrl,
        serviceRoleKey,
        token: device.token,
        fetchImpl
      });
      disabledInvalid += 1;
    }
    if (!deliveryUnconfirmed) {
      await releaseBroadcastDelivery({
        supabaseUrl,
        serviceRoleKey,
        campaignId: notification.campaignId,
        deviceId: device.id,
        fetchImpl
      });
    }
  }

  const safelyHandled = delivered > 0 || (
    suppressedDuplicates === devices.length && failed === 0
  );
  return {
    status: safelyHandled ? 200 : 502,
    payload: {
      ok: safelyHandled,
      targetedDevices: devices.length,
      targetedUsers,
      delivered,
      failed,
      disabledInvalid,
      suppressedDuplicates,
      ...(safelyHandled ? {} : {
        error: "No device accepted the notification",
        code: "DELIVERY_FAILED"
      })
    }
  };
}

async function reserveBroadcastDelivery({
  supabaseUrl,
  serviceRoleKey,
  campaignId,
  device,
  fetchImpl
}) {
  const { response, payload } = await fetchJsonResponse(
    fetchImpl,
    `${supabaseUrl}/rest/v1/broadcast_notification_deliveries?on_conflict=campaign_id,device_id`,
    {
      method: "POST",
      headers: {
        ...serviceHeaders(serviceRoleKey),
        prefer: "resolution=ignore-duplicates,return=representation"
      },
      body: JSON.stringify([{
        campaign_id: campaignId,
        device_id: device.id,
        user_id: device.user_id
      }])
    },
    []
  );
  if (!response.ok) return { ok: false, reserved: false };
  const reserved = Array.isArray(payload) && payload.length > 0;
  if (!reserved) {
    const existing = await loadBroadcastDelivery({
      supabaseUrl,
      serviceRoleKey,
      campaignId,
      deviceId: device.id,
      fetchImpl
    });
    if (!existing.ok) return { ok: false, reserved: false };
    return {
      ok: true,
      reserved: false,
      completed: Boolean(existing.deliveredAt)
    };
  }
  return {
    ok: true,
    reserved: true,
    completed: false
  };
}

async function loadBroadcastDelivery({
  supabaseUrl,
  serviceRoleKey,
  campaignId,
  deviceId,
  fetchImpl
}) {
  const params = new URLSearchParams({
    campaign_id: `eq.${campaignId}`,
    device_id: `eq.${deviceId}`,
    select: "delivered_at",
    limit: "1"
  });
  const result = await fetchJsonResponse(
    fetchImpl,
    `${supabaseUrl}/rest/v1/broadcast_notification_deliveries?${params}`,
    { headers: serviceHeaders(serviceRoleKey) },
    []
  ).catch(() => null);
  const response = result?.response;
  if (!response?.ok) return { ok: false, deliveredAt: "" };
  const payload = result.payload;
  const row = Array.isArray(payload) ? payload[0] : null;
  if (!row) return { ok: false, deliveredAt: "" };
  return {
    ok: true,
    deliveredAt: String(row.delivered_at ?? "")
  };
}

async function markBroadcastDeliveryCompleted({
  supabaseUrl,
  serviceRoleKey,
  campaignId,
  deviceId,
  fetchImpl
}) {
  const params = new URLSearchParams({
    campaign_id: `eq.${campaignId}`,
    device_id: `eq.${deviceId}`
  });
  await fetchImpl(
    `${supabaseUrl}/rest/v1/broadcast_notification_deliveries?${params}`,
    {
      method: "PATCH",
      headers: {
        ...serviceHeaders(serviceRoleKey),
        prefer: "return=minimal"
      },
      body: JSON.stringify({ delivered_at: new Date().toISOString() })
    }
  ).catch(() => {});
}

async function releaseBroadcastDelivery({
  supabaseUrl,
  serviceRoleKey,
  campaignId,
  deviceId,
  fetchImpl
}) {
  const params = new URLSearchParams({
    campaign_id: `eq.${campaignId}`,
    device_id: `eq.${deviceId}`,
    delivered_at: "is.null"
  });
  await fetchImpl(
    `${supabaseUrl}/rest/v1/broadcast_notification_deliveries?${params}`,
    {
      method: "DELETE",
      headers: {
        ...serviceHeaders(serviceRoleKey),
        prefer: "return=minimal"
      }
    }
  ).catch(() => {});
}

export function broadcastAuthorizationToken(serviceRoleKey) {
  return createHmac("sha256", String(serviceRoleKey || ""))
    .update(AUTH_CONTEXT)
    .digest("hex");
}

function authorizedRequest(authorization, serviceRoleKey) {
  const value = String(authorization || "").trim();
  const token = value.replace(/^Bearer\s+/i, "");
  const expected = broadcastAuthorizationToken(serviceRoleKey);
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return (
    tokenBuffer.length === expectedBuffer.length &&
    timingSafeEqual(tokenBuffer, expectedBuffer)
  );
}

function normalizeNotification(value) {
  const title = String(value?.title || "").trim();
  const body = String(value?.body || "").trim();
  const campaignId = String(value?.campaignId || "").trim();
  if (
    !title ||
    !body ||
    !campaignId ||
    title.length > MAX_TITLE_LENGTH ||
    body.length > MAX_BODY_LENGTH ||
    campaignId.length > MAX_CAMPAIGN_LENGTH ||
    !/^[a-z0-9][a-z0-9._-]*$/i.test(campaignId)
  ) return null;
  return { title, body, campaignId };
}

function pushDeliveryEnabled(value) {
  return /^(1|true|yes)$/i.test(String(value || "").trim());
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

function createBoundedFetch(fetchImpl, timeoutMs) {
  if (fetchImpl?.[BOUNDED_FETCH]) return fetchImpl;

  const defaultTimeoutMs = Math.max(
    1,
    Number(timeoutMs) || BROADCAST_DEPENDENCY_TIMEOUT_MS
  );
  const boundedFetch = (
    url,
    options = {},
    consumeResponse = null,
    timeoutOverrideMs = null
  ) => {
    const overrideMs = Number(timeoutOverrideMs);
    const effectiveTimeoutMs = Number.isFinite(overrideMs) && overrideMs > 0
      ? overrideMs
      : defaultTimeoutMs;
    return fetchWithTimeout(
      fetchImpl,
      url,
      options,
      effectiveTimeoutMs,
      consumeResponse
    );
  };
  Object.defineProperty(boundedFetch, BOUNDED_FETCH, { value: true });
  return boundedFetch;
}

async function fetchJsonResponse(fetchImpl, url, options, fallback) {
  return fetchImpl(url, options, async (response) => ({
    response,
    payload: await response.json().catch(() => fallback)
  }));
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
  const raw = String(env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  const encoded = String(
    env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 || ""
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

async function loadEnabledPushDevices({
  supabaseUrl,
  serviceRoleKey,
  fetchImpl
}) {
  const params = new URLSearchParams({
    enabled: "eq.true",
    select: "id,user_id,token,platform",
    order: "updated_at.desc"
  });
  const { response, payload } = await fetchJsonResponse(
    fetchImpl,
    `${supabaseUrl}/rest/v1/push_devices?${params}`,
    { headers: serviceHeaders(serviceRoleKey) },
    null
  );
  if (!response.ok) return { ok: false, devices: [] };
  if (!Array.isArray(payload)) return { ok: false, devices: [] };
  return {
    ok: true,
    devices: payload
  };
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

function invalidFirebaseToken(payload) {
  const serialized = JSON.stringify(payload || {});
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

function failure(status, error, code) {
  return {
    status,
    payload: {
      ok: false,
      error,
      code
    }
  };
}
