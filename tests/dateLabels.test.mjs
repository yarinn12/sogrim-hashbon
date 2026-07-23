import test from "node:test";
import assert from "node:assert/strict";

import {
  formatClockTime,
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
  assert.equal(formatRelativeCalendarDate("not-a-date"), "");
  assert.equal(formatClockTime("not-a-date"), "");
});
