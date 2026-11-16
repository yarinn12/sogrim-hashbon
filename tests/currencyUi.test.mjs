import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("event creation and settings expose an event-level currency", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const currencyView = await readFile("src/ui/eventCurrencyPresentation.mjs", "utf8");

  assert.match(app, /currency: "ILS"/);
  assert.match(app, /action: "new-event-currency-choice"/);
  assert.match(app, /data-action="new-event-currency-search"/);
  assert.match(currencyView, /data-action="event-currency"/);
  assert.match(app, /currency: normalizeCurrency\(newEventDraft\.currency\)/);
  assert.match(app, /hasExistingExpenses: event\.expenses\.length > 0/);
  assert.match(currencyView, /\$\{!canManage \|\| hasConvertedExpenses \? "disabled" : ""\}/);
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
  const roundingView = await readFile("src/ui/eventRoundingPresentation.mjs", "utf8");
  // Both approved surfaces retain currency-neutral copy.
  assert.match(app, /roundingStatus: usesRoundedSettlementTransfers\(event\) \? "סכומים שלמים בהחזרים" : "ללא עיגול"/);
  assert.match(roundingView, /מעגלים את ההחזרים לסכומים שלמים ומאזנים את ההפרש/);
  assert.match(roundingView, /משאירים כל העברה מדויקת, ללא עיגול/);
  assert.doesNotMatch(app + roundingView, /שקלים שלמים|לשקל שלם|עד האגורה|כולל אגורות|דיוק מלא באגורות/);
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
