const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;

export async function getAdminAnalyticsOverview({
  runtimeConfig,
  env = process.env,
  authorization = "",
  windowDays = DEFAULT_WINDOW_DAYS,
  fetchImpl = fetch
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

  const userResponse = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!userResponse.ok) return failure(401, "Account session is invalid");

  const user = await userResponse.json().catch(() => null);
  const email = normalizeEmail(user?.email);
  if (!user?.id || !email) return failure(401, "Account identity is unavailable");
  if (!adminEmails.has(email)) return failure(403, "Admin access is required");

  const overviewResponse = await fetchImpl(
    `${String(supabaseUrl).replace(/\/+$/, "")}/rest/v1/rpc/admin_analytics_overview`,
    {
      method: "POST",
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({
        p_window_days: normalizeWindowDays(windowDays)
      })
    }
  );
  if (!overviewResponse.ok) {
    return failure(502, "Admin analytics could not be loaded");
  }

  const overview = await overviewResponse.json().catch(() => null);
  if (!overview || typeof overview !== "object" || Array.isArray(overview)) {
    return failure(502, "Admin analytics returned an invalid response");
  }

  return {
    ok: true,
    status: 200,
    payload: {
      ok: true,
      overview
    }
  };
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
