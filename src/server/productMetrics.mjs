import {
  createProductMetricId,
  normalizeProductMetricBatch
} from "../domain/productMetrics.mjs";

const RETENTION_DAYS = 90;

export async function storeProductMetrics({
  runtimeConfig,
  env = process.env,
  authorization = "",
  payload,
  fetchImpl = fetch,
  now = Date.now
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

  const userResponse = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!userResponse.ok) return failure(401, "Account session is invalid");
  const user = await userResponse.json().catch(() => null);
  if (!user?.id) return failure(401, "Account session is invalid");

  const insertResponse = await fetchImpl(
    `${supabaseUrl}/rest/v1/product_metrics?on_conflict=id`,
    {
      method: "POST",
      headers: serviceHeaders(serviceRoleKey, "resolution=ignore-duplicates,return=minimal"),
      body: JSON.stringify(metrics.map((metric) => toDatabaseRow(metric, createProductMetricId)))
    }
  );
  if (!insertResponse.ok) return failure(502, "Metrics could not be stored");

  cleanupExpiredMetrics({ supabaseUrl, serviceRoleKey, fetchImpl, now }).catch(() => {});

  return {
    ok: true,
    status: 202,
    payload: { ok: true, accepted: metrics.length }
  };
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

async function cleanupExpiredMetrics({ supabaseUrl, serviceRoleKey, fetchImpl, now }) {
  const cutoff = new Date((Number(now()) || Date.now()) - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await fetchImpl(
    `${supabaseUrl}/rest/v1/product_metrics?received_at=lt.${encodeURIComponent(cutoff.toISOString())}`,
    {
      method: "DELETE",
      headers: serviceHeaders(serviceRoleKey, "return=minimal")
    }
  );
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

function failure(status, error) {
  return { ok: false, status, payload: { ok: false, error } };
}
