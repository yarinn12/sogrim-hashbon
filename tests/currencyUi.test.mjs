import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("event creation and settings expose an event-level currency", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /currency: "ILS"/);
  assert.match(app, /data-action="new-event-currency"/);
  assert.match(app, /data-action="event-currency"/);
  assert.match(app, /currency: normalizeCurrency\(newEventDraft\.currency\)/);
  assert.match(app, /const hasExistingExpenses = event\.expenses\.length > 0/);
  assert.match(app, /\$\{!canManage \? "disabled" : ""\}/);
  assert.match(app, /requestEventCurrencyChange\(event, nextCurrency, target\)/);
  assert.match(app, /kind: "change-event-currency"/);
  assert.match(app, /הסכומים יישארו בדיוק כפי שהוזנו ולא יומרו לפי שער חליפין/);
  assert.match(app, /allowExistingExpenses: true/);
});

test("money views format amounts with the currency of their event", async () => {
  const files = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/domain/settlementSummary.mjs", "utf8"),
    readFile("src/publicEventWorkspaceLayer.mjs", "utf8"),
    readFile("src/publicPersonalActionsLayer.mjs", "utf8"),
    readFile("src/publicExpensePayerSummaryLayer.mjs", "utf8")
  ]);
  const source = files.join("\n");

  assert.match(source, /formatEventMoney/);
  assert.match(source, /formatCurrency/);
  assert.doesNotMatch(source, /₪\$\{formatMoney/);
});

test("rounding explanations do not imply shekels after switching to another event currency", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  assert.match(app, /העברות ביחידות מטבע שלמות/);
  assert.match(app, /מעגלים ליחידות שלמות במטבע האירוע/);
  assert.match(app, /דיוק מלא ללא עיגול/);
  assert.doesNotMatch(app, /שקלים שלמים|לשקל שלם|עד האגורה|כולל אגורות|דיוק מלא באגורות/);
});

test("the personal dashboard keeps balances separate by currency", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /byCurrency: new Map\(\)/);
  assert.match(app, /המאזן מופרד לפי מטבע/);
  assert.match(app, /personal-currency-balance/);
});

test("the installable app caches the currency module", async () => {
  const worker = await readFile("sw.js", "utf8");

  assert.match(worker, /const CACHE_NAME = "settle-friends-live-v\d+"/);
  assert.match(worker, /\/src\/domain\/currencies\.mjs/);
});
