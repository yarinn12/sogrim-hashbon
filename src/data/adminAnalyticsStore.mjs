const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;

export async function loadAdminAnalyticsOverview(
  config,
  {
    windowDays = DEFAULT_WINDOW_DAYS,
    fetchImpl = fetch
  } = {}
) {
  const accessToken = String(config?.storage?.account?.accessToken ?? "").trim();
  if (!accessToken) {
    return { available: false, status: 401, reason: "signed-out" };
  }

  const apiBaseUrl = String(config?.apiBaseUrl ?? "").replace(/\/+$/, "");
  const response = await fetchImpl(
    `${apiBaseUrl}/api/admin/overview?days=${normalizeWindowDays(windowDays)}`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    }
  );
  const payload = await response.json().catch(() => ({}));

  if ([401, 403, 503].includes(response.status)) {
    return {
      available: false,
      status: response.status,
      reason: response.status === 403 ? "forbidden" : "unavailable"
    };
  }
  if (!response.ok || !payload?.ok || !payload?.overview) {
    const error = new Error("Admin analytics could not be loaded");
    error.status = response.status;
    throw error;
  }

  return {
    available: true,
    status: 200,
    overview: normalizeAdminAnalyticsOverview(payload.overview)
  };
}

export function normalizeAdminAnalyticsOverview(value) {
  const overview = value && typeof value === "object" ? value : {};
  const accounts = overview.accounts && typeof overview.accounts === "object"
    ? overview.accounts
    : {};
  const storage = overview.storage && typeof overview.storage === "object"
    ? overview.storage
    : {};
  const sessions = overview.sessions && typeof overview.sessions === "object"
    ? overview.sessions
    : {};
  const metrics = overview.metrics && typeof overview.metrics === "object"
    ? overview.metrics
    : {};

  return {
    generatedAt: validIsoDate(overview.generatedAt),
    windowDays: normalizeWindowDays(overview.windowDays),
    accounts: {
      registered: nonNegativeInteger(accounts.registered),
      confirmed: nonNegativeInteger(accounts.confirmed),
      signedInDuringWindow: nonNegativeInteger(accounts.signedInDuringWindow)
    },
    storage: {
      workspaces: nonNegativeInteger(storage.workspaces),
      sharedEvents: nonNegativeInteger(storage.sharedEvents),
      snapshotBytes: nonNegativeInteger(storage.snapshotBytes),
      databaseBytes: nonNegativeInteger(storage.databaseBytes)
    },
    metrics: Object.fromEntries(
      Object.entries(metrics)
        .map(([name, count]) => [String(name), nonNegativeInteger(count)])
        .filter(([name]) => name)
    ),
    sessions: {
      total: nonNegativeInteger(sessions.total),
      affected: nonNegativeInteger(sessions.affected),
      errorFreeRate: normalizedRate(sessions.errorFreeRate)
    },
    platforms: normalizeCountRows(overview.platforms, "platform"),
    operationFailures: normalizeCountRows(
      overview.operationFailures,
      "operation"
    )
  };
}

function normalizeCountRows(value, labelKey) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      [labelKey]: String(item?.[labelKey] ?? "").trim(),
      count: nonNegativeInteger(item?.count ?? item?.sessions),
      affected: nonNegativeInteger(item?.affected)
    }))
    .filter((item) => item[labelKey]);
}

function normalizeWindowDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1
    ? Math.min(MAX_WINDOW_DAYS, days)
    : DEFAULT_WINDOW_DAYS;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function normalizedRate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : null;
}

function validIsoDate(value) {
  const text = String(value ?? "").trim();
  return text && Number.isFinite(Date.parse(text)) ? text : "";
}
