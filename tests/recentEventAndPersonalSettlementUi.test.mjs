import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home lists every event without a separate recent-event card", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const home = app.match(/function renderHome\(\) \{[\s\S]*?(?=\nfunction renderRecentEventShortcut)/);

  assert.ok(home);
  assert.match(home[0], /personalArchivedEventIds\(\)/);
  assert.match(home[0], /eventStatusFilter === "archive"/);
  assert.match(home[0], /events\.map\(renderEventRow\)/);
  assert.doesNotMatch(home[0], /recentEvent|renderRecentEventShortcut|listEvents/);
});

test("settlement prioritizes transfers that involve the current participant", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("src/publicCircleDesignLayer.mjs", "utf8");
  const ledgerStyles = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(app, /orderSettlementTransfers\(transfers\)/);
  assert.match(app, /highlightPersonal: hasPersonalIdentity/);
  assert.match(app, /class="personal-transfer-badge">\$\{personalBadgeLabel\}/);
  assert.match(app, /"ממך"/);
  assert.match(app, /"אליך"/);
  assert.match(app, /isPersonal \? "is-personal"/);
  assert.doesNotMatch(app, /function renderPersonalSettlement/);
  assert.match(app, /מי מעביר למי/);
  assert.doesNotMatch(app, /class="settlement-progress-chip"/);
  assert.match(app, /class="settlement-transfer-board"/);
  assert.match(app, /class="settlement-list-actions"/);
  assert.match(app, /סה"כ פתוח בקבוצה/);
  assert.match(app, /personalPendingTransfers/);
  assert.match(app, /function renderTransferExplanation/);
  assert.match(app, /איך הסכום חושב/);
  assert.match(app, /isCurrentParticipantPaying[\s\S]*?"שילמתי"[\s\S]*?"קיבלתי"/);
  assert.doesNotMatch(app, /function renderCompletedTransfers/);
  assert.doesNotMatch(app, /orderedPaidTransfers/);
  assert.doesNotMatch(app, /orderedPendingTransfers/);
  assert.doesNotMatch(app, /const paidDifference/);
  assert.match(app, /isBalancedWithoutTransfers/);
  assert.match(app, /hasTransfers\s*\? `[\s\S]*?class="section settlement-stage"/);
  assert.doesNotMatch(app, /function renderSettlementCompleteState/);
  assert.match(app, /"הכול שולם"/);
  assert.match(app, /"אין צורך להעביר כסף בין המשתתפים\."/);
  assert.match(app, /hasPendingTransfers[\s\S]*?class="settlement-hero-total"/);
  assert.match(app, /אפשר לבטל את הסימון מאותה שורה/);
  assert.match(styles, /\.settlement-transfer-board/);
  assert.match(styles, /\.transfer-row\.is-personal/);
  assert.match(styles, /\.personal-transfer-badge/);
  assert.match(styles, /\.transfer-explanation/);
  assert.match(ledgerStyles, /\.settlement-hero\.is-balanced/);
  assert.match(
    ledgerStyles,
    /\.screen\.settlement-screen \{[\s\S]*?padding-bottom: calc\(176px \+ env\(safe-area-inset-bottom\)\) !important/
  );
});
