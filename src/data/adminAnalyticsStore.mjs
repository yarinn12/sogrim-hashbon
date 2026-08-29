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
  const push = overview.push && typeof overview.push === "object"
    ? overview.push
    : {};
  const notifications = overview.notifications &&
      typeof overview.notifications === "object"
    ? overview.notifications
    : {};
  const invites = overview.invites && typeof overview.invites === "object"
    ? overview.invites
    : {};
  const feedback = overview.feedback && typeof overview.feedback === "object"
    ? overview.feedback
    : {};
  const metrics = overview.metrics && typeof overview.metrics === "object"
    ? overview.metrics
    : {};
  const telemetry = overview.telemetry && typeof overview.telemetry === "object"
    ? overview.telemetry
    : {};
  const pushDelivery = overview.pushDelivery && typeof overview.pushDelivery === "object"
    ? overview.pushDelivery
    : {};
  const dataContinuity = overview.dataContinuity && typeof overview.dataContinuity === "object"
    ? overview.dataContinuity
    : {};

  return {
    generatedAt: validIsoDate(overview.generatedAt),
    windowDays: normalizeWindowDays(overview.windowDays),
    accounts: {
      registered: nonNegativeInteger(accounts.registered),
      confirmed: nonNegativeInteger(accounts.confirmed),
      createdDuringWindow: nonNegativeInteger(accounts.createdDuringWindow),
      signedInLast24Hours: nonNegativeInteger(accounts.signedInLast24Hours),
      signedInLast7Days: nonNegativeInteger(accounts.signedInLast7Days),
      signedInDuringWindow: nonNegativeInteger(accounts.signedInDuringWindow)
    },
    storage: {
      workspaces: nonNegativeInteger(storage.workspaces),
      sharedEvents: nonNegativeInteger(storage.sharedEvents),
      activeSharedEventsDuringWindow: nonNegativeInteger(
        storage.activeSharedEventsDuringWindow
      ),
      snapshotBytes: nonNegativeInteger(storage.snapshotBytes),
      databaseBytes: nonNegativeInteger(storage.databaseBytes)
    },
    push: {
      reachableUsers: nonNegativeInteger(push.reachableUsers),
      enabledDevices: nonNegativeInteger(push.enabledDevices),
      androidDevices: nonNegativeInteger(push.androidDevices),
      iosDevices: nonNegativeInteger(push.iosDevices),
      disabledDevices: nonNegativeInteger(push.disabledDevices)
    },
    notifications: {
      inboxItems: nonNegativeInteger(notifications.inboxItems),
      unreadItems: nonNegativeInteger(notifications.unreadItems),
      createdDuringWindow: nonNegativeInteger(
        notifications.createdDuringWindow
      )
    },
    invites: {
      activeLinks: nonNegativeInteger(invites.activeLinks),
      redeemedDuringWindow: nonNegativeInteger(invites.redeemedDuringWindow)
    },
    feedback: {
      new: nonNegativeInteger(feedback.new),
      reviewing: nonNegativeInteger(feedback.reviewing),
      resolved: nonNegativeInteger(feedback.resolved)
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
    telemetry: {
      lastReceivedAt: validIsoDate(telemetry.lastReceivedAt),
      eventsLast24Hours: nonNegativeInteger(telemetry.eventsLast24Hours),
      failuresLast24Hours: nonNegativeInteger(telemetry.failuresLast24Hours),
      deferredLast24Hours: nonNegativeInteger(telemetry.deferredLast24Hours),
      clientErrorsDuringWindow: nonNegativeInteger(
        telemetry.clientErrorsDuringWindow
      )
    },
    pushDelivery: {
      reservedDuringWindow: nonNegativeInteger(
        pushDelivery.reservedDuringWindow
      ),
      deliveredDuringWindow: nonNegativeInteger(
        pushDelivery.deliveredDuringWindow
      ),
      stalePending: nonNegativeInteger(pushDelivery.stalePending),
      deliveryRate: normalizedRate(pushDelivery.deliveryRate)
    },
    dataContinuity: {
      latestSnapshotAt: validIsoDate(dataContinuity.latestSnapshotAt),
      accountsWithoutWorkspace: nonNegativeInteger(
        dataContinuity.accountsWithoutWorkspace
      ),
      eventsWithoutActiveMembers: nonNegativeInteger(
        dataContinuity.eventsWithoutActiveMembers
      )
    },
    platforms: normalizeCountRows(overview.platforms, "platform"),
    operationFailures: normalizeCountRows(
      overview.operationFailures,
      "operation"
    ),
    deferredOperations: normalizeCountRows(
      overview.deferredOperations,
      "operation"
    ),
    clientErrors: normalizeClientErrorRows(overview.clientErrors)
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

function normalizeClientErrorRows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      platform: String(item?.platform ?? "").trim().toLowerCase(),
      screen: String(item?.screen ?? "").trim().toLowerCase(),
      count: nonNegativeInteger(item?.count)
    }))
    .filter((item) => item.platform && item.screen);
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
