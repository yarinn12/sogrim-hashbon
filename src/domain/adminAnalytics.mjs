export function buildAdminAnalyticsViewModel(overview, locale = "he-IL") {
  const failureCount = (overview?.operationFailures ?? []).reduce(
    (total, item) => total + nonNegativeNumber(item?.count),
    0
  );
  const affectedSessions = nonNegativeNumber(overview?.sessions?.affected);
  const deferredCount = (overview?.deferredOperations ?? []).reduce(
    (total, item) => total + nonNegativeNumber(item?.count),
    0
  );
  const clientErrorCount = nonNegativeNumber(
    overview?.telemetry?.clientErrorsDuringWindow
  );
  const stalePushDeliveries = nonNegativeNumber(
    overview?.pushDelivery?.stalePending
  );
  const continuityIssues = nonNegativeNumber(
    overview?.dataContinuity?.accountsWithoutWorkspace
  ) + nonNegativeNumber(
    overview?.dataContinuity?.eventsWithoutActiveMembers
  );
  const needsAttention = failureCount > 0 ||
    affectedSessions > 0 ||
    stalePushDeliveries > 0 ||
    continuityIssues > 0;
  const registeredAccounts = nonNegativeNumber(overview?.accounts?.registered);
  const activeAccounts = nonNegativeNumber(
    overview?.accounts?.signedInDuringWindow
  );
  const windowDays = nonNegativeNumber(overview?.windowDays) || 30;

  return {
    windowDays,
    status: needsAttention ? "attention" : "healthy",
    statusTitle: needsAttention
      ? "יש נקודות שכדאי לבדוק"
      : "הכול פועל כרגיל",
    statusDescription: `${formatNumber(activeAccounts, locale)} מתוך ${formatNumber(registeredAccounts, locale)} משתמשים היו פעילים ב-${formatNumber(windowDays, locale)} הימים האחרונים`,
    updatedLabel: formatUpdatedLabel(overview?.generatedAt, locale),
    quickStats: [
      {
        id: "accounts",
        value: formatNumber(registeredAccounts, locale),
        label: "משתמשים רשומים"
      },
      {
        id: "active",
        value: formatNumber(activeAccounts, locale),
        label: `פעילים ב-${formatNumber(windowDays, locale)} ימים`
      },
      {
        id: "events",
        value: formatNumber(overview?.storage?.sharedEvents, locale),
        label: "אירועים משותפים"
      },
      {
        id: "push",
        value: formatNumber(overview?.push?.reachableUsers, locale),
        label: "משתמשים זמינים ל-Push"
      }
    ],
    detailGroups: [
      {
        id: "accounts",
        title: "משתמשים",
        icon: "users",
        items: [
          detailItem(
            "חשבונות מאומתים",
            overview?.accounts?.confirmed,
            ratioLabel(
              overview?.accounts?.confirmed,
              registeredAccounts,
              locale
            ),
            locale
          ),
          detailItem(
            `נרשמו ב-${formatNumber(windowDays, locale)} ימים`,
            overview?.accounts?.createdDuringWindow,
            "משתמשים חדשים",
            locale
          ),
          detailItem(
            "פעילים בשבעת הימים האחרונים",
            overview?.accounts?.signedInLast7Days,
            "לפי כניסה לחשבון",
            locale
          ),
          detailItem(
            "פעילים ב-24 השעות האחרונות",
            overview?.accounts?.signedInLast24Hours,
            "לפי כניסה לחשבון",
            locale
          )
        ]
      },
      {
        id: "delivery",
        title: "מכשירים והתראות",
        icon: "bell",
        items: [
          detailItem(
            "מכשירים פעילים",
            overview?.push?.enabledDevices,
            `${ratioLabel(overview?.push?.reachableUsers, registeredAccounts, locale)} מהמשתמשים זמינים`,
            locale
          ),
          detailItem(
            "Android",
            overview?.push?.androidDevices,
            "מכשירים עם Push פעיל",
            locale
          ),
          detailItem(
            "iPhone ו-iPad",
            overview?.push?.iosDevices,
            "מכשירים עם Push פעיל",
            locale
          ),
          detailItem(
            "התראות שלא נקראו",
            overview?.notifications?.unreadItems,
            `${formatNumber(overview?.notifications?.createdDuringWindow, locale)} נוצרו בתקופה`,
            locale
          ),
          detailItem(
            "הודעות Push שנמסרו",
            overview?.pushDelivery?.deliveredDuringWindow,
            `${formatNumber(overview?.pushDelivery?.reservedDuringWindow, locale)} ניסיונות בתקופה`,
            locale
          )
        ]
      },
      {
        id: "activity",
        title: "פעילות",
        icon: "calendar",
        items: [
          detailItem(
            "אירועים פעילים בתקופה",
            overview?.storage?.activeSharedEventsDuringWindow,
            `מתוך ${formatNumber(overview?.storage?.sharedEvents, locale)} אירועים`,
            locale
          ),
          detailItem(
            "קישורי הזמנה פעילים",
            overview?.invites?.activeLinks,
            `${formatNumber(overview?.invites?.redeemedDuringWindow, locale)} שימושים בתקופה`,
            locale
          ),
          detailItem(
            "סביבות משתמש",
            overview?.storage?.workspaces,
            "עותקי מידע אישיים בענן",
            locale
          ),
          detailItem(
            "פניות חדשות",
            overview?.feedback?.new,
            `${formatNumber(overview?.feedback?.reviewing, locale)} בטיפול`,
            locale
          )
        ]
      }
    ],
    reliability: {
      rate: formatHealthRate(overview?.sessions?.errorFreeRate, locale),
      totalSessions: formatNumber(overview?.sessions?.total, locale),
      affectedSessions: formatNumber(affectedSessions, locale),
      failureCount: formatNumber(failureCount, locale),
      deferredCount: formatNumber(deferredCount, locale),
      failures: (overview?.operationFailures ?? []).slice(0, 5).map((item) => ({
        label: operationLabel(item?.operation),
        value: formatNumber(item?.count, locale)
      })),
      deferred: (overview?.deferredOperations ?? []).slice(0, 5).map((item) => ({
        label: operationLabel(item?.operation),
        value: formatNumber(item?.count, locale)
      })),
      platforms: (overview?.platforms ?? []).map((item) => ({
        label: platformLabel(item?.platform),
        sessions: formatNumber(item?.count, locale),
        affected: formatNumber(item?.affected, locale)
      }))
    },
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
      detail: `${formatBytes(overview?.storage?.snapshotBytes, locale)} של נתוני אפליקציה`
    },
    telemetry: {
      attention: nonNegativeNumber(overview?.telemetry?.failuresLast24Hours) > 0,
      title: nonNegativeNumber(overview?.telemetry?.failuresLast24Hours) > 0
        ? `${formatNumber(overview?.telemetry?.failuresLast24Hours, locale)} תקלות ב-24 שעות`
        : "לא נרשמו תקלות ב-24 שעות",
      detail: overview?.telemetry?.lastReceivedAt
        ? `הנתון האחרון התקבל ${formatRelativeTime(overview.telemetry.lastReceivedAt, locale)}`
        : "עדיין לא התקבלו נתוני שימוש"
    },
    delivery: {
      attention: stalePushDeliveries > 0,
      title: stalePushDeliveries > 0
        ? `${formatNumber(stalePushDeliveries, locale)} משלוחים דורשים בדיקה`
        : "משלוחי Push ללא תקיעות",
      detail: overview?.pushDelivery?.deliveryRate === null ||
          overview?.pushDelivery?.deliveryRate === undefined
        ? "לא היו משלוחים בתקופה"
        : `${formatPercent(overview.pushDelivery.deliveryRate, locale)} מהניסיונות נמסרו`
    },
    continuity: {
      attention: continuityIssues > 0,
      title: continuityIssues > 0
        ? `${formatNumber(continuityIssues, locale)} רשומות דורשות תיקון`
        : "רציפות הנתונים תקינה",
      detail: overview?.dataContinuity?.latestSnapshotAt
        ? `שמירה אחרונה ${formatRelativeTime(overview.dataContinuity.latestSnapshotAt, locale)}`
        : "אין עדיין שמירות ענן"
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

function detailItem(label, value, detail, locale) {
  return {
    label,
    value: formatNumber(value, locale),
    detail
  };
}

function ratioLabel(part, total, locale) {
  const denominator = nonNegativeNumber(total);
  if (!denominator) return "0%";
  const ratio = Math.min(1, nonNegativeNumber(part) / denominator);
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0
  }).format(ratio);
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
    auth: "התחברות",
    state_load: "טעינת מידע",
    state_save: "שמירת מידע",
    account_link: "איחוד חשבונות",
    event_invite: "קישורי הזמנה",
    friend_network: "רשת חברים",
    notification_inbox: "טעינת התראות",
    feedback: "שליחת משוב",
    push: "Push",
    ads: "פרסומות",
    share: "שיתוף"
  };
  const [operation, failureClass = ""] = String(value ?? "").trim().split(":");
  const label = labels[operation] ?? "פעולה במערכת";
  return failureClass ? `${label} · ${failureClassLabel(failureClass)}` : label;
}

function failureClassLabel(value) {
  const labels = {
    offline: "ללא חיבור",
    network: "רשת",
    timeout: "המתנה ארוכה",
    auth: "זיהוי חשבון",
    permission: "הרשאה",
    conflict: "התנגשות סנכרון",
    validation: "מידע לא תקין",
    storage: "שמירה מקומית",
    server: "שרת",
    unavailable: "שירות לא זמין",
    unknown: "לא מסווג"
  };
  return labels[String(value ?? "").trim()] ?? "לא מסווג";
}

function platformLabel(value) {
  const labels = {
    android: "Android",
    ios: "iPhone ו-iPad",
    web: "דפדפן"
  };
  const platform = String(value ?? "").trim().toLowerCase();
  return labels[platform] ?? (platform || "לא ידוע");
}

function formatDecimal(value, locale) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1
  }).format(value);
}

function formatPercent(value, locale) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return "—";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1
  }).format(Math.min(1, Math.max(0, rate)));
}

function formatRelativeTime(value, locale) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "לאחרונה";
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 2) return "עכשיו";
  if (elapsedMinutes < 60) return `לפני ${formatNumber(elapsedMinutes, locale)} דקות`;
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `לפני ${formatNumber(elapsedHours, locale)} שעות`;
  return `ב-${new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric"
  }).format(new Date(timestamp))}`;
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
