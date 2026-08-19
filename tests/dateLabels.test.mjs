import test from "node:test";
import assert from "node:assert/strict";

import {
  formatClockTime,
  formatDateInputLabel,
  formatPreciseClockTime,
  formatRelativeCalendarDate
} from "../src/domain/dateLabels.mjs";

test("event dates use today and yesterday by local calendar day", () => {
  const now = new Date(2026, 6, 23, 8, 15);

  assert.equal(
    formatRelativeCalendarDate(new Date(2026, 6, 23, 0, 5), { now }),
    "היום"
  );
  assert.equal(
    formatRelativeCalendarDate(new Date(2026, 6, 22, 23, 55), { now }),
    "אתמול"
  );
});

test("older event dates stay compact and add a year only when needed", () => {
  const now = new Date(2026, 6, 23, 8, 15);

  assert.equal(
    formatRelativeCalendarDate(new Date(2026, 6, 21, 18, 30), { now }),
    "21.7"
  );
  assert.equal(
    formatRelativeCalendarDate(new Date(2025, 11, 31, 18, 30), { now }),
    "31.12.2025"
  );
});

test("event opening times keep a stable 24-hour clock", () => {
  assert.equal(formatClockTime(new Date(2026, 6, 23, 7, 5)), "07:05");
  assert.equal(formatPreciseClockTime(new Date(2026, 6, 23, 7, 5, 9)), "07:05:09");
  assert.equal(formatRelativeCalendarDate("not-a-date"), "");
  assert.equal(formatClockTime("not-a-date"), "");
  assert.equal(formatPreciseClockTime("not-a-date"), "");
});

test("native date inputs get a stable Hebrew companion label without timezone drift", () => {
  const label = formatDateInputLabel("2026-08-19");

  assert.match(label, /יום רביעי/);
  assert.match(label, /19/);
  assert.match(label, /אוגוסט/);
  assert.match(label, /2026/);
  assert.equal(formatDateInputLabel("2026-02-31"), "");
  assert.equal(formatDateInputLabel("not-a-date"), "");
});
