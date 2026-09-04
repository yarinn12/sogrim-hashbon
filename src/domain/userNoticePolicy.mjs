const ROUTINE_PROGRESS_PREFIXES = [
  "שומר",
  "שומרים",
  "מעדכן",
  "מעדכנים",
  "מכין",
  "מכינים",
  "מסיר",
  "מסירים",
  "פותח את האירוע ושומר"
];

const ERROR_MARKERS = [
  "לא הצלחנו",
  "לא ניתן",
  "אי אפשר",
  "אין הרשאה",
  "אין לחשבון הרשאה",
  "לא נשמר",
  "לא התקבל",
  "נכשל"
];

export function noticePresentation(message) {
  const normalized = String(message ?? "").trim();
  if (!normalized) return { visible: false, ttlMs: 0, kind: "empty" };
  if (isRoutineProgressNotice(normalized)) {
    return { visible: false, ttlMs: 0, kind: "progress" };
  }

  const isError = ERROR_MARKERS.some((marker) => normalized.includes(marker));
  return {
    visible: true,
    ttlMs: isError ? 9_000 : 5_500,
    kind: isError ? "error" : "status"
  };
}

export function isRoutineProgressNotice(message) {
  const normalized = String(message ?? "").trim();
  if (!/(?:…|\.{3})$/.test(normalized)) return false;
  return ROUTINE_PROGRESS_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

// Classify evidence, never raw exception text for display. In particular a
// TypeError in application code is not evidence that the user is offline.
export function saveFailureKind(error) {
  const queue = [error], errors = [], seen = new Set();
  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    errors.push(item);
    queue.push(item.cause);
    if (Array.isArray(item.failures)) queue.push(...item.failures);
  }
  const has = (...codes) => errors.some(item => codes.includes(item.code));
  const status = (...values) => errors.some(item => values.includes(Number(item.status)));
  if (has("STALE_ACCOUNT")) return "stale-account";
  if (has("LOCAL_STORAGE_UNAVAILABLE") || errors.some(item => item.name === "QuotaExceededError")) return "storage";
  if (status(403) || has("SHARED_EVENT_MEMBERSHIP_REVOKED", "SHARED_EVENT_CREATE_NOT_ALLOWED")) return "permission";
  if (status(401) || has("CLOUD_STATE_AUTH_EXPIRED", "AUTH_REQUIRED")) return "auth";
  if (has("CLOUD_STATE_CONFLICT")) return "conflict";
  if (status(400, 409, 422)) return "rejected";
  if (status(404, 410)) return "missing";
  if (status(408, 425, 429) || errors.some(item => Number(item.status) >= 500)) return "server";
  if (has("NETWORK_TIMEOUT", "ERR_NETWORK") || errors.some(item =>
    !Number(item.status) && /^(failed to fetch|fetch failed|networkerror|network request failed|load failed)\b/i.test(String(item.message ?? ""))
  )) return "connection";
  return "unavailable";
}

export function saveFailureMessage(result, prefix = "השינוי לא נשמר.", { draft = false } = {}) {
  if (result?.pending === true || result?.ok === true) return "";
  const kind = result?.mode === "stale-account" ? "stale-account"
    : result?.failureKind || saveFailureKind(result?.error);
  const guidance = {
    "stale-account": "החשבון הפעיל השתנה. חזרו לחשבון שבו התחלתם את הפעולה.",
    storage: "האחסון במכשיר אינו זמין. פנו מקום ונסו שוב לפני סגירת המסך.",
    permission: "אין לחשבון הרשאה לבצע את השינוי הזה. בקשו ממנהל האירוע לבדוק את ההרשאות.",
    auth: "החיבור לחשבון פג. התחברו מחדש ונסו שוב.",
    conflict: "המידע השתנה במכשיר אחר. בדקו את הגרסה המעודכנת לפני ניסיון נוסף.",
    rejected: "השינוי לא התקבל בשרת. בדקו את הפרטים לפני ניסיון נוסף.",
    missing: "הפריט כבר אינו זמין. חזרו לאירוע ובדקו אם הוסר.",
    server: "השרת אינו זמין כרגע. אפשר לנסות שוב מאוחר יותר.",
    connection: globalThis.navigator?.onLine === false
      ? "אין חיבור לאינטרנט כרגע. התחברו ונסו שוב."
      : "לא התקבלה תשובה מהשרת. אפשר לנסות שוב.",
    unavailable: "אירעה תקלה בשמירה. אפשר לנסות שוב."
  };
  return `${prefix} ${guidance[kind] || guidance.unavailable}${draft ? " הטיוטה נשארה כאן." : ""}`;
}

export function pendingSaveMessage(failureKind = "", online = globalThis.navigator?.onLine !== false) {
  if (failureKind === "auth") return "השינויים ממתינים במכשיר. התחברו מחדש כדי להשלים סנכרון.";
  if (failureKind === "permission") return "השינויים ממתינים במכשיר. אין הרשאה לסנכרן אותם; בדקו עם מנהל האירוע.";
  if (["rejected", "missing", "unavailable", "storage"].includes(failureKind)) {
    return "השינויים ממתינים במכשיר והסנכרון לא הושלם. נדרשת בדיקה לפני ניסיון נוסף.";
  }
  return online ? "נשמר במכשיר · ממתין לסנכרון" : "נשמר במכשיר · יסתנכרן כשהחיבור יחזור";
}
