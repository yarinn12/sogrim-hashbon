const DAY_MS = 24 * 60 * 60 * 1000;

export function formatRelativeCalendarDate(
  value,
  { now = new Date(), locale = "he-IL" } = {}
) {
  const date = toValidDate(value);
  const reference = toValidDate(now);
  if (!date || !reference) return "";

  const difference = calendarDayNumber(reference) - calendarDayNumber(date);
  if (difference === 0) return "היום";
  if (difference === 1) return "אתמול";

  const options = {
    day: "numeric",
    month: "numeric"
  };

  if (date.getFullYear() !== reference.getFullYear()) {
    options.year = "numeric";
  }

  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatClockTime(value, locale = "he-IL") {
  const date = toValidDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

export function formatPreciseClockTime(value, locale = "he-IL") {
  const date = toValidDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

export function formatDateInputLabel(value, locale = "he-IL") {
  const serialized = String(value ?? "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(serialized)
    ? dateInputValue(serialized)
    : toValidDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function calendarDayNumber(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function toValidDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateInputValue(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}
