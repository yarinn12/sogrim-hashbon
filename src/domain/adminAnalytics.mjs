export function buildAdminAnalyticsViewModel(overview, locale = "he-IL") {
  const failureCount = (overview?.operationFailures ?? []).reduce(
    (total, item) => total + nonNegativeNumber(item?.count),
    0
  );
  const affectedSessions = nonNegativeNumber(overview?.sessions?.affected);
  const needsAttention = failureCount > 0 || affectedSessions > 0;
  const activeAccounts = nonNegativeNumber(
    overview?.accounts?.signedInDuringWindow
  );
  const windowDays = nonNegativeNumber(overview?.windowDays) || 30;

  return {
    windowDays,
    status: needsAttention ? "attention" : "healthy",
    statusTitle: needsAttention
      ? "יש נקודה שכדאי לבדוק"
      : "הכול פועל כרגיל",
    statusDescription: `${formatNumber(activeAccounts, locale)} משתמשים פעילים בתקופה`,
    updatedLabel: formatUpdatedLabel(overview?.generatedAt, locale),
    quickStats: [
      {
        id: "accounts",
        value: formatNumber(overview?.accounts?.registered, locale),
        label: "משתמשים"
      },
      {
        id: "events",
        value: formatNumber(overview?.storage?.sharedEvents, locale),
        label: "אירועים"
      },
      {
        id: "health",
        value: formatHealthRate(overview?.sessions?.errorFreeRate, locale),
        label: "הפעלות תקינות"
      }
    ],
    failure: {
      count: failureCount,
      title: failureCount === 1
        ? "כשל פעולה אחד בתקופה"
        : failureCount > 1
          ? `${formatNumber(failureCount, locale)} כשלי פעולה בתקופה`
          : "לא נרשמו תקלות בתקופה",
      detail: failureCount
        ? operationLabel(overview?.operationFailures?.[0]?.operation)
        : "תקין"
    },
    storage: {
      title: `נפח מידע ${formatBytes(overview?.storage?.databaseBytes, locale)}`,
      detail: "תקין"
    }
  };
}

export function formatBytes(value, locale = "he-IL") {
  const bytes = nonNegativeNumber(value);
  if (bytes < 1024) return `${formatNumber(bytes, locale)} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${formatDecimal(kilobytes, locale)} KB`;
  }
  return `${formatDecimal(kilobytes / 1024, locale)} MB`;
}

function formatHealthRate(value, locale) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return "—";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1
  }).format(Math.min(1, Math.max(0, rate)));
}

function formatUpdatedLabel(value, locale) {
  const date = new Date(value ?? "");
  if (!Number.isFinite(date.getTime())) return "עודכן לאחרונה";
  return `עודכן ב-${new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date)}`;
}

function operationLabel(value) {
  const labels = {
    state_load: "טעינת מידע",
    state_save: "שמירת מידע",
    invite_load: "פתיחת הזמנה",
    notification_load: "טעינת התראות"
  };
  const operation = String(value ?? "").trim();
  return labels[operation] ?? "פעולה במערכת";
}

function formatDecimal(value, locale) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1
  }).format(value);
}

function formatNumber(value, locale) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0
  }).format(nonNegativeNumber(value));
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
