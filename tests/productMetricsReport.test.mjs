import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the product report exposes aggregate counts without raw account data", async () => {
  const report = await readFile("scripts/report-product-metrics.mjs", "utf8");

  assert.match(report, /group by event_name/);
  assert.match(report, /group by platform, app_version, build_number, screen, detail/);
  assert.match(report, /count\(distinct session_id\)/);
  assert.match(report, /eventCreation/);
  assert.match(report, /firstExpense/);
  assert.match(report, /inviteJoin/);
  assert.match(report, /errorFreeSessionRate/);
  assert.match(report, /topOperationFailures/);
  assert.match(report, /topDeferredOperations/);
  assert.match(report, /failureClass/);
  assert.doesNotMatch(report, /user_id|email|display_name|event_id|expense_id|amount/);
});
