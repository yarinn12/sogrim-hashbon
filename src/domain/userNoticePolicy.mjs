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
  if (!normalized.endsWith("…")) return false;
  return ROUTINE_PROGRESS_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
