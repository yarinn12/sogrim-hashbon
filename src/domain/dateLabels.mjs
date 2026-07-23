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

function calendarDayNumber(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function toValidDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
