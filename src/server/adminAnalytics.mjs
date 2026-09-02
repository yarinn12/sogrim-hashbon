import { fetchWithTimeout } from "../data/fetchTimeout.mjs";

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;
export const ADMIN_ANALYTICS_REQUEST_TIMEOUT_MS = 8_000;

export async function getAdminAnalyticsOverview({
  runtimeConfig,
  env = process.env,
  authorization = "",
  windowDays = DEFAULT_WINDOW_DAYS,
  fetchImpl = fetch,
  requestTimeoutMs = ADMIN_ANALYTICS_REQUEST_TIMEOUT_MS
}) {
  const supabaseUrl = runtimeConfig?.storage?.url;
  const anonKey = runtimeConfig?.storage?.anonKey;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  const adminEmails = parseAdminEmails(env.ADMIN_EMAILS);
  const accessToken = bearerToken(authorization);

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !adminEmails.size) {
    return failure(503, "Admin analytics are not configured");
  }
  if (!accessToken) return failure(401, "Authentication is required");

  const deadlineFetch = createDeadlineFetch(fetchImpl, requestTimeoutMs);
  let userResponse;
  try {
    userResponse = await deadlineFetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`
      }
    });
  } catch {
    return failure(502, "Admin analytics could not be loaded");
  }
  if (!userResponse.ok) return failure(401, "Account session is invalid");

  const user = await userResponse.json().catch(() => null);
  const email = normalizeEmail(user?.email);
  if (!user?.id || !email) return failure(401, "Account identity is unavailable");
  if (!adminEmails.has(email)) return failure(403, "Admin access is required");

  const rpcBaseUrl = `${String(supabaseUrl).replace(/\/+$/, "")}/rest/v1/rpc`;
  const rpcBody = JSON.stringify({
    p_window_days: normalizeWindowDays(windowDays)
  });
  let overviewResponse;
  let operationalResponse;
  try {
    [overviewResponse, operationalResponse] = await Promise.all([
      deadlineFetch(`${rpcBaseUrl}/admin_analytics_overview`, {
        method: "POST",
        headers: serviceHeaders(serviceRoleKey),
        body: rpcBody
      }),
      deadlineFetch(`${rpcBaseUrl}/admin_operational_health`, {
        method: "POST",
        headers: serviceHeaders(serviceRoleKey),
        body: rpcBody
      })
    ]);
  } catch {
    return failure(502, "Admin analytics could not be loaded");
  }
  if (!overviewResponse.ok || !operationalResponse.ok) {
    return failure(502, "Admin analytics could not be loaded");
  }

  const [overview, operational] = await Promise.all([
    overviewResponse.json().catch(() => null),
    operationalResponse.json().catch(() => null)
  ]);
  if (
    !isRecord(overview) ||
    !isRecord(operational)
  ) {
    return failure(502, "Admin analytics returned an invalid response");
  }

  return {
    ok: true,
    status: 200,
    payload: {
      ok: true,
      overview: {
        ...overview,
        ...operational
      }
    }
  };
}

function createDeadlineFetch(fetchImpl, timeoutMs) {
  const duration = Math.max(
    1,
    Number(timeoutMs) || ADMIN_ANALYTICS_REQUEST_TIMEOUT_MS
  );
  const deadline = Date.now() + duration;
  return (url, options = {}) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      const error = new Error("Admin analytics request timed out");
      error.code = "NETWORK_TIMEOUT";
      return Promise.reject(error);
    }
    return fetchWithTimeout(fetchImpl, url, options, remainingMs);
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseAdminEmails(value) {
  return new Set(
    String(value ?? "")
      .split(/[;,\s]+/)
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeWindowDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1
    ? Math.min(MAX_WINDOW_DAYS, days)
    : DEFAULT_WINDOW_DAYS;
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

function failure(status, error) {
  return { ok: false, status, payload: { ok: false, error } };
}
