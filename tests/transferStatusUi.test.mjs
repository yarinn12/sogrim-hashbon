import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("settlement screen lets a paid transfer return to pending", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /data-action="mark-pending"/);
  assert.match(app, /markTransferPending\(target\.dataset\.transferId\)/);
  assert.match(app, /data-action="mark-pending-group"/);
  assert.match(app, /markTransfersPending/);
  assert.match(app, /data-transfer-ids=/);
  assert.doesNotMatch(app, /transfer-complete-button is-static/);
  assert.match(app, /updateTransferStatus/);
  assert.match(app, /"מחכה שתעביר"/);
  assert.match(app, /"מחכה שיגיע"/);
  assert.match(app, /"טרם הושלם"/);
  assert.match(app, /class="secondary-button transfer-complete-button"/);
  assert.match(app, /<span aria-hidden="true">✓<\/span> הושלם/);
  assert.match(app, /reconcileEventTransfers\(updatedEvent, updatedEvent\?\.transfers \?\? \[\]\)/);
});

test("the final paid transfer opens one completion celebration with a history action", async () => {
  const [app, styles] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("styles.css", "utf8")
  ]);

  assert.match(app, /function renderSettlementCelebration\(\)/);
  assert.match(app, /event\?\.transfers\?\.length/);
  assert.match(app, /event\.transfers\.every\(\(transfer\) => transfer\.status === "paid"\)/);
  assert.match(app, /const hadPendingTransfers = event\.transfers\.some/);
  assert.match(app, /const completedAllTransfers = Boolean/);
  assert.match(app, /settlementCelebration = \{ eventId: event\.id \}/);
  assert.match(app, /data-action="archive-settled-event"/);
  assert.match(app, /סגור והעבר להיסטוריה/);
  assert.match(app, /closeCurrentEvent\(eventId, \{ destination: "home" \}\)/);
  assert.match(
    app,
    /dismiss-settlement-celebration[\s\S]*?\.event-workspace-nav \[data-action="settle"\]/
  );
  assert.doesNotMatch(app, /\.settlement-complete-state \[data-action="back-to-event"\]/);
  assert.match(styles, /\.settlement-celebration-dialog/);
  assert.match(styles, /@keyframes settlement-confetti-burst/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("closing with pending transfers uses stateful confirmation and stays reversible", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /let settlementCloseConfirmation = null/);
  assert.match(app, /function requestCloseCurrentEvent\(eventId\)/);
  assert.match(app, /data-action="confirm-close-event"/);
  assert.match(app, /data-action="cancel-close-event-confirmation"/);
  assert.match(app, /נותרה העברה פתוחה בסך/);
  assert.match(app, /נותרו \$\{pendingTransfers\.length\} העברות פתוחות בסך/);
  assert.match(app, /if \(isEventClosed\(event\)\)/);
  assert.match(app, /function syncSettlementCloseConfirmation\(eventId\)/);
});

test("settlement action hierarchy follows payment state", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(
    app,
    /const shareButtonClass = isClosed \|\| \(hasPendingTransfers && !personalPendingTransfers\.length\)/
  );
  assert.match(app, /data-action="share-whatsapp"/);
  assert.match(app, /class="settlement-more-actions"/);
  assert.match(app, /data-action="close-event"/);
  assert.match(app, /data-action="reopen-event"/);
  assert.match(
    app,
    /data-action="share-whatsapp"[\s\S]*?class="settlement-more-actions"[\s\S]*?data-action="(?:reopen-event|close-event)"/
  );
  assert.match(
    app,
    /isPersonal \? "primary-button" : "secondary-button transfer-group-complete-button"/
  );
});

test("settlement summary leads with one ordered transfer list", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /<h2 id="settlement-transfers-title">מי מעביר למי<\/h2>/);
  assert.match(app, /orderSettlementTransfers\(transfers\)/);
  assert.match(app, /groupSettlementTransfersForDisplay\(orderedTransfers\)/);
  assert.match(app, /renderTransferRow\(event, transfer, \{/);
  assert.match(app, /paidHistory/);
  assert.match(app, /renderSettlementListActions\(event\)/);
  assert.doesNotMatch(app, /class="settlement-progress-chip"/);
});

test("a single personal transfer leads with its amount and a compact explanation", async () => {
  const [app, ledger] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(app, /const featuredPersonalTransfer = singlePersonalPayment \?\? singlePersonalReceipt/);
  assert.match(app, /const hasPersonalPendingTransfers =/);
  assert.match(
    app,
    /!hasTransfers \|\| calculated\.issues\.length \|\| hasPersonalPendingTransfers/
  );
  assert.match(app, /function renderFeaturedSettlementHero/);
  assert.match(app, /class="panel settlement-hero is-pending is-personal-pending is-explained"/);
  assert.match(app, /class="settlement-featured-route"/);
  assert.match(app, /class="settlement-featured-amount amount"/);
  assert.match(app, /data-action="mark-paid" data-transfer-id=/);
  assert.match(app, /function renderFeaturedSettlementBreakdown/);
  assert.match(app, /<details class="settlement-featured-breakdown">/);
  assert.match(app, /<strong>איך חישבנו\?<\/strong>/);
  assert.match(app, /class="settlement-featured-breakdown-body"/);
  assert.match(app, /breakdown\.expenseShares\.slice\(0, 3\)/);
  assert.match(app, /פחות מה שמועבר לאחרים/);
  assert.match(app, /סה״כ להעברה/);
  assert.match(app, /href="#settlement-transfers-title">לכל ההעברות/);
  assert.match(ledger, /Selected settlement concept: show the personal route, amount and proof first/);
  assert.match(ledger, /\.settlement-featured-breakdown > summary/);
  assert.match(ledger, /\.settlement-featured-breakdown\[open\] > summary::after/);
  assert.match(ledger, /\.settlement-featured-breakdown-row\.is-total/);
});

test("settlement hero exposes stable visual state hooks without changing actions", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /const settlementHeroStateClass = !hasExpenses/);
  assert.match(app, /\? "is-empty"/);
  assert.match(app, /\? "is-review"/);
  assert.match(app, /\? "is-pending"/);
  assert.match(app, /: "is-complete"/);
  assert.match(
    app,
    /settlementHeroStateClass === "is-pending" &&\s*!isClosed &&\s*personalPendingTransfers\.length/
  );
  assert.match(
    app,
    /class="panel settlement-hero \$\{settlementHeroStateClass\} \$\{settlementHeroPersonalStateClass\} \$\{isBalancedWithoutTransfers \? "is-balanced" : ""\}"/
  );
  for (const action of [
    "share-whatsapp",
    "close-event",
    "reopen-event",
    "copy-settlement",
    "copy-event-report"
  ]) {
    assert.match(app, new RegExp(`data-action="${action}"`));
  }
});

test("settlement identifies offline participants next to money transfers", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /function renderSettlementOfflineNotice/);
  assert.match(app, /settlement-offline-note/);
  assert.match(app, /function renderTransferParticipant/);
  assert.match(app, /renderParticipantConnectionBadge\(participant\)/);
  assert.match(app, /אינם מחוברים לאפליקציה/);
});

test("settlement isolates mixed-direction participant names and monetary values", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /class="transfer-participant-name">\s*<strong><bdi>/);
  assert.match(app, /class="transfer-amount">[\s\S]*?<bdi dir="ltr"><span class="font-num">/);
  assert.match(app, /class="transfer-paid-summary">כבר שולם <bdi dir="ltr"><span class="font-num">/);
});

test("expense changes reconcile paid history instead of clearing it", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /reconcileSettlementTransfers/);
  assert.match(app, /function reconcileEventTransfers/);
  assert.match(app, /reconcileEventTransfers\(getEvent\(eventId\), previousTransfers\)/);
  assert.doesNotMatch(app, /event\.transfers = \[\];/);
});

test("settlement explains friendly rounding and points to the exact invalid expense", async () => {
  const [app, ledger] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(app, /calculateSettlement\(eventParticipants\(event\), \[expense\]\)\.issues\.length/);
  assert.match(app, /צריך תיקון · לא נכנסה לחישוב/);
  assert.match(app, /סכומי ההעברה עוגלו לשקלים שלמים/);
  assert.match(ledger, /\.expense-row\.is-review/);
  assert.match(ledger, /\.transfer-rounding-note/);
});
