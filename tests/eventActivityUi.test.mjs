import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const design = readFileSync(
  new URL("../src/publicLedgerWorkspaceLayer.mjs", import.meta.url),
  "utf8"
);

test("event settings exposes activity as a focused nested screen", () => {
  assert.match(app, /section: "activity"/);
  assert.match(app, /title: "פעילות באירוע"/);
  assert.match(app, /eventDialog\.kind === "settings-activity"/);
  assert.match(app, /backAction: "event-settings-back"/);
  assert.match(
    app,
    /\["management", "currency", "rounding", "activity", "lock", "danger"\]/
  );
});

test("activity rows are semantic, timestamped, and keep numeric type scoped", () => {
  assert.match(app, /<ol class="event-activity-list">/);
  assert.match(app, /<li class="event-activity-item"/);
  assert.match(app, /<time datetime=/);
  assert.match(app, /<span class="font-num" dir="ltr">/);
  assert.match(app, /formatRelativeCalendarDate\(entry\.occurredAt\)/);
  assert.match(app, /formatClockTime\(entry\.occurredAt\)/);
  assert.match(app, /עוד אין פעילות שנשמרה באירוע/);
});

test("activity timeline follows ledger tokens and dynamic type safeguards", () => {
  assert.match(design, /\.event-activity-panel \{/);
  assert.match(design, /border: 1px solid var\(--ledger-line\)/);
  assert.match(design, /background: var\(--ledger-surface\)/);
  assert.match(design, /grid-template-columns: 14px minmax\(0, 1fr\)/);
  assert.match(design, /\.dynamic-type-extra-large/);
  assert.match(design, /\.event-activity-copy small/);
});

test("important event mutations write activity before persistence", () => {
  for (const kind of [
    "expense-created",
    "expense-updated",
    "expense-deleted",
    "participant-added",
    "participant-removed",
    "participant-restored",
    "transfer-paid",
    "transfer-pending",
    "event-closed",
    "event-reopened"
  ]) {
    assert.match(app, new RegExp(`recordEventActivity\\([^)]*"${kind}"`, "s"));
  }
});
