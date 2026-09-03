import {
  createProductMetricId,
  normalizeProductMetricBatch
} from "../domain/productMetrics.mjs";
import { fetchWithTimeout } from "../data/fetchTimeout.mjs";

const RETENTION_DAYS = 90;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_EVENTS = 120;
export const PRODUCT_METRICS_REQUEST_TIMEOUT_MS = 8_000;

export async function storeProductMetrics({
  runtimeConfig,
  env = process.env,
  authorization = "",
  payload,
  fetchImpl = fetch,
  now = Date.now,
  requestTimeoutMs = PRODUCT_METRICS_REQUEST_TIMEOUT_MS
}) {
  const supabaseUrl = runtimeConfig?.storage?.url;
  const anonKey = runtimeConfig?.storage?.anonKey;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  const accessToken = bearerToken(authorization);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return failure(503, "Product metrics are not configured");
  }
  if (!accessToken) return failure(401, "Authentication is required");

  let metrics;
  try {
    metrics = normalizeProductMetricBatch(payload, { now });
  } catch {
    return failure(400, "Invalid metrics payload");
  }

  const deadlineFetch = createDeadlineFetch(fetchImpl, requestTimeoutMs);
  let userResponse;
  let user;
  try {
    ({ response: userResponse, payload: user } = await fetchJsonResponse(
      deadlineFetch,
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${accessToken}`
        }
      },
      null
    ));
  } catch {
    return failure(502, "Metrics authentication could not be verified");
  }
  if (!userResponse.ok) return failure(401, "Account session is invalid");
  if (!user?.id) return failure(401, "Account session is invalid");

  let capacityResponse;
  let capacityReserved;
  try {
    ({ response: capacityResponse, payload: capacityReserved } = await fetchJsonResponse(
      deadlineFetch,
      `${supabaseUrl}/rest/v1/rpc/reserve_product_metric_batch`,
      {
        method: "POST",
        headers: serviceHeaders(serviceRoleKey, "return=representation"),
        body: JSON.stringify({
          p_user_id: user.id,
          p_event_count: metrics.length,
          p_window_seconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
          p_event_limit: RATE_LIMIT_EVENTS
        })
      },
      false
    ));
  } catch {
    return failure(502, "Metrics capacity could not be reserved");
  }
  if (!capacityResponse.ok) {
    logUpstreamFailure("capacity", capacityResponse, capacityReserved);
    return failure(502, "Metrics capacity could not be reserved");
  }
  if (capacityReserved !== true) return failure(429, "Metrics rate limit exceeded");

  let insertResponse;
  let insertPayload;
  try {
    ({ response: insertResponse, payload: insertPayload } = await fetchJsonResponse(
      deadlineFetch,
      `${supabaseUrl}/rest/v1/product_metrics?on_conflict=id`,
      {
        method: "POST",
        headers: serviceHeaders(serviceRoleKey, "resolution=ignore-duplicates,return=minimal"),
        body: JSON.stringify(metrics.map((metric) => toDatabaseRow(metric, createProductMetricId)))
      },
      null
    ));
  } catch {
    return failure(502, "Metrics could not be stored");
  }
  if (!insertResponse.ok) {
    logUpstreamFailure("insert", insertResponse, insertPayload);
    return failure(502, "Metrics could not be stored");
  }

  cleanupExpiredMetrics({ supabaseUrl, serviceRoleKey, fetchImpl, now }).catch(() => {});

  return {
    ok: true,
    status: 202,
    payload: { ok: true, accepted: metrics.length }
  };
}

export async function purgeExpiredProductMetrics({
  runtimeConfig,
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
  requestTimeoutMs = PRODUCT_METRICS_REQUEST_TIMEOUT_MS
}) {
  const supabaseUrl = runtimeConfig?.storage?.url;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return failure(503, "Product metric retention is not configured");
  }

  const response = await cleanupExpiredMetrics({
    supabaseUrl,
    serviceRoleKey,
    fetchImpl,
    now,
    requestTimeoutMs
  }).catch(() => null);
  if (!response?.ok) return failure(502, "Expired product metrics could not be deleted");

  return { ok: true, status: 200, payload: { ok: true, retentionDays: RETENTION_DAYS } };
}

function toDatabaseRow(metric, createId) {
  return {
    id: metric.id,
    session_id: metric.sessionId || createId(),
    event_name: metric.eventName,
    screen: metric.screen,
    platform: metric.platform,
    app_version: metric.appVersion,
    build_number: metric.buildNumber,
    detail: metric.detail,
    occurred_at: metric.occurredAt
  };
}

async function cleanupExpiredMetrics({
  supabaseUrl,
  serviceRoleKey,
  fetchImpl,
  now,
  requestTimeoutMs = PRODUCT_METRICS_REQUEST_TIMEOUT_MS
}) {
  const cutoff = new Date((Number(now()) || Date.now()) - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return fetchWithTimeout(
    fetchImpl,
    `${supabaseUrl}/rest/v1/product_metrics?received_at=lt.${encodeURIComponent(cutoff.toISOString())}`,
    {
      method: "DELETE",
      headers: serviceHeaders(serviceRoleKey, "return=minimal")
    },
    requestTimeoutMs
  );
}

function createDeadlineFetch(fetchImpl, timeoutMs) {
  const duration = Math.max(
    1,
    Number(timeoutMs) || PRODUCT_METRICS_REQUEST_TIMEOUT_MS
  );
  const deadline = Date.now() + duration;
  return (url, options = {}, consumeResponse = null) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      const error = new Error("Product metrics request timed out");
      error.code = "NETWORK_TIMEOUT";
      return Promise.reject(error);
    }
    return fetchWithTimeout(
      fetchImpl,
      url,
      options,
      remainingMs,
      consumeResponse
    );
  };
}

async function fetchJsonResponse(fetchImpl, url, options, fallback) {
  return fetchImpl(url, options, async (response) => ({
    response,
    payload: await response.json().catch(() => fallback)
  }));
}

function serviceHeaders(serviceRoleKey, prefer) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
    prefer
  };
}

function bearerToken(value) {
  const match = String(value).match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? "";
}

function logUpstreamFailure(stage, response, payload) {
  console.error("[product-metrics] Supabase request failed", {
    stage,
    status: Number(response?.status) || 0,
    code: String(payload?.code ?? "").slice(0, 32)
  });
}

function failure(status, error) {
  return { ok: false, status, payload: { ok: false, error } };
}
