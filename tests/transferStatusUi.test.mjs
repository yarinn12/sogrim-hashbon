import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("settlement screen lets a paid transfer return to pending", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /data-action="mark-pending"/);
  assert.match(app, /markTransferPending\(target\.dataset\.transferId\)/);
  assert.match(app, /updateTransferStatus/);
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

  assert.match(app, /const shareButtonClass = hasPendingTransfers \|\| isClosed/);
  assert.match(app, /const closeButtonClass = hasPendingTransfers \? "secondary-button" : "primary-button"/);
  assert.match(app, /data-action="share-whatsapp"/);
  assert.match(app, /data-action="close-event"/);
  assert.match(app, /data-action="reopen-event"/);
});
