import test from "node:test";
import assert from "node:assert/strict";

import {
  assignPayerDifference,
  balancePayerAmounts,
  createPayerDraft,
  markPayerAmountEdited,
  summarizePayerDraft
} from "../src/domain/expenseDraft.mjs";

test("single payer is filled from the total automatically", () => {
  const payers = balancePayerAmounts("120", [createPayerDraft("dan")]);

  assert.equal(payers[0].amount, "120");
  assert.equal(payers[0].autoAmount, true);
});

test("automatic difference assignment fills a new blank payer", () => {
  const payers = assignPayerDifference(
    "120",
    [createPayerDraft("dan")],
    0,
    { automatic: true }
  );

  assert.equal(payers[0].amount, "120");
  assert.equal(payers[0].amountTouched, false);
  assert.equal(payers[0].autoAmount, true);
});

test("editing a total assigns the entire difference to a single payer", () => {
  const payers = assignPayerDifference(
    "140",
    [markPayerAmountEdited(createPayerDraft("dan"), "120")],
    0,
    { automatic: true }
  );

  assert.equal(payers[0].amount, "140");
  assert.equal(payers[0].amountTouched, false);
  assert.equal(payers[0].autoAmount, true);
});

test("a total increase can be assigned explicitly when several people paid", () => {
  const payers = [
    markPayerAmountEdited(createPayerDraft("dan"), "50"),
    markPayerAmountEdited(createPayerDraft("avi"), "70")
  ];
  const assigned = assignPayerDifference("140", payers, 0);

  assert.deepEqual(assigned.map((payer) => payer.amount), ["70", "70"]);
  assert.equal(assigned[0].amountTouched, true);
  assert.equal(summarizePayerDraft("140", assigned).balanced, true);
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

test("payer draft summary shows remaining and overpaid amounts", () => {
  assert.deepEqual(
    summarizePayerDraft("120", [
      markPayerAmountEdited(createPayerDraft("dan"), "50"),
      markPayerAmountEdited(createPayerDraft("avi"), "60")
    ]),
    {
      total: 12000,
      paid: 11000,
      remaining: 1000,
      overpaid: 0,
      balanced: false,
      valid: true
    }
  );

  assert.deepEqual(
    summarizePayerDraft("120", [
      markPayerAmountEdited(createPayerDraft("dan"), "70"),
      markPayerAmountEdited(createPayerDraft("avi"), "60")
    ]),
    {
      total: 12000,
      paid: 13000,
      remaining: 0,
      overpaid: 1000,
      balanced: false,
      valid: true
    }
  );

  assert.equal(
    summarizePayerDraft("120", [
      markPayerAmountEdited(createPayerDraft("dan"), "50"),
      markPayerAmountEdited(createPayerDraft("avi"), "70")
    ]).balanced,
    true
  );
});

test("payer draft never reports balanced while a payer amount is invalid", () => {
  const summary = summarizePayerDraft("120", [
    markPayerAmountEdited(createPayerDraft("dan"), "abc"),
    markPayerAmountEdited(createPayerDraft("avi"), "120")
  ]);

  assert.equal(summary.valid, false);
  assert.equal(summary.balanced, false);
});
