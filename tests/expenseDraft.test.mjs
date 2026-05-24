import test from "node:test";
import assert from "node:assert/strict";

import {
  balancePayerAmounts,
  createPayerDraft,
  markPayerAmountEdited
} from "../src/domain/expenseDraft.mjs";

test("single payer is filled from the total automatically", () => {
  const payers = balancePayerAmounts("120", [createPayerDraft("dan")]);

  assert.equal(payers[0].amount, "120");
  assert.equal(payers[0].autoAmount, true);
});

test("new payer receives the remaining amount after a manual payer edit", () => {
  const firstPayer = markPayerAmountEdited(createPayerDraft("dan"), "50");
  const payers = balancePayerAmounts("120", [firstPayer, createPayerDraft("avi")], 1);

  assert.equal(payers[0].amount, "50");
  assert.equal(payers[1].amount, "70");
});

test("manual payer amounts are not overwritten by auto balancing", () => {
  const payers = balancePayerAmounts("120", [
    markPayerAmountEdited(createPayerDraft("dan"), "50"),
    markPayerAmountEdited(createPayerDraft("avi"), "60")
  ]);

  assert.deepEqual(payers.map((payer) => payer.amount), ["50", "60"]);
});
