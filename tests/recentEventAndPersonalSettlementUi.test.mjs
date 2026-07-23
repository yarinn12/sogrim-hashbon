import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home lists every event without a separate recent-event card", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const home = app.match(/function renderHome\(\) \{[\s\S]*?\nfunction renderHomeEventTools/);

  assert.ok(home);
  assert.match(home[0], /filterEventsByStatus\(sortedEvents, eventStatusFilter\)/);
  assert.match(home[0], /events\.map\(renderEventRow\)/);
  assert.doesNotMatch(home[0], /recentEvent|renderRecentEventShortcut|listEvents/);
});

test("settlement prioritizes transfers that involve the current participant", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("src/publicCircleDesignLayer.mjs", "utf8");

  assert.match(app, /function renderPersonalSettlement/);
  assert.match(app, /function renderPersonalSettlementRow/);
  assert.match(app, /מה צריך לעשות עכשיו/);
  assert.match(app, /אין לך העברות פתוחות באירוע הזה/);
  assert.match(app, /מי מעביר למי/);
  assert.match(app, /class="settlement-transfer-board"/);
  assert.match(app, /function renderTransferExplanation/);
  assert.match(app, /איך הסכום חושב/);
  assert.match(app, /isPaying \? "העברתי" : "קיבלתי"/);
  assert.match(app, /function renderCompletedTransfers/);
  assert.match(app, /החשבון סגור/);
  assert.match(app, /אפשר לבטל את הסימון מאותה שורה/);
  assert.match(styles, /\.personal-settlement-row/);
  assert.match(styles, /\.settlement-transfer-board/);
  assert.match(styles, /\.transfer-explanation/);
  assert.match(styles, /\.completed-transfers-details/);
});
