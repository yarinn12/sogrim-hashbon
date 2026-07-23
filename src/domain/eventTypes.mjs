export const EVENT_TYPE_STANDARD = "standard";
export const EVENT_TYPE_RESTAURANT = "restaurant";
export const EVENT_TYPE_TRIP = "trip";

const EVENT_TYPES = {
  [EVENT_TYPE_STANDARD]: {
    id: EVENT_TYPE_STANDARD,
    label: "יציאה רגילה",
    shortLabel: "רגיל",
    defaultName: "יציאה",
    creationTitle: "יציאה חדשה",
    description: "מונית, בר, קניות או ערב עם כמה הוצאות",
    namePlaceholder: "אוכל / מונית / קניות…",
    createLabel: "פתח אירוע",
    actionLabel: "הוסף הוצאה",
    actionHint: "מי שילם, מי השתתף וכמה"
  },
  [EVENT_TYPE_RESTAURANT]: {
    id: EVENT_TYPE_RESTAURANT,
    label: "מסעדה",
    shortLabel: "מסעדה",
    defaultName: "מסעדה",
    creationTitle: "מסעדה חדשה",
    description: "מנות, שתייה, פריטים משותפים וטיפ",
    namePlaceholder: "ארוחת ערב / שם המסעדה…",
    createLabel: "פתח מסעדה",
    actionLabel: "הוסף חשבון מסעדה",
    actionHint: "מקלידים מנות ומשייכים אותן לאנשים"
  },
  [EVENT_TYPE_TRIP]: {
    id: EVENT_TYPE_TRIP,
    label: "טיול או חופשה",
    shortLabel: "טיול",
    defaultName: "טיול",
    creationTitle: "טיול חדש",
    description: "אירוע של כמה ימים עם הוצאות לפי תאריך",
    namePlaceholder: "טיול לצפון / חופשה בחו\"ל…",
    createLabel: "פתח טיול",
    actionLabel: "הוסף הוצאה לטיול",
    actionHint: "כל הוצאה נשמרת ביום שבו קרתה"
  }
};

export function normalizeEventType(value) {
  return EVENT_TYPES[value] ? value : EVENT_TYPE_STANDARD;
}

export function eventTypeConfig(value) {
  return EVENT_TYPES[normalizeEventType(value)];
}

export function eventTypeOptions() {
  return Object.values(EVENT_TYPES);
}

export function defaultExpenseModeForEvent(value) {
  return normalizeEventType(value) === EVENT_TYPE_RESTAURANT ? "items" : "single";
}

export function defaultEventName(value, createdAt = new Date()) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(safeDate);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
  const dayAndMonth = `${part("day")}.${part("month")}`;
  const time = `${part("hour")}:${part("minute")}`;

  return `${eventTypeConfig(value).defaultName} · ${dayAndMonth} · ${time}`;
}

export function uniqueDefaultEventName(
  value,
  createdAt = new Date(),
  existingNames = []
) {
  const baseName = defaultEventName(value, createdAt);
  const names = new Set(existingNames);
  if (!names.has(baseName)) return baseName;

  let sequence = 2;
  while (names.has(`${baseName} · ${sequence}`)) sequence += 1;
  return `${baseName} · ${sequence}`;
}
