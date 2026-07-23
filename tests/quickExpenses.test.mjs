import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQuickItemExpenses,
  formatExpenseDay,
  groupExpensesByDay,
  QUICK_ITEM_ALL_PARTICIPANTS,
  QUICK_ITEM_CUSTOM_PARTICIPANTS,
  summarizeQuickItemShares
} from "../src/domain/quickExpenses.mjs";

test("restaurant quick entry creates balanced expenses for each item", () => {
  let id = 0;
  const result = buildQuickItemExpenses({
    items: [
      { name: "פסטה", amount: "58", sharedBy: "avi" },
      { name: "סלט משותף", amount: "42.50", sharedBy: QUICK_ITEM_ALL_PARTICIPANTS }
    ],
    payerParticipantId: "dani",
    participantIds: ["avi", "dani", "maor"],
    occurredOn: "2026-07-17",
    createdByParticipantId: "dani",
    makeExpenseId: () => `expense-${++id}`,
    updatedAt: "2026-07-17T20:00:00.000Z"
  });

  assert.equal(result.error, "");
  assert.equal(result.expenses.length, 2);
  assert.equal(result.expenses[0].total, 5800);
  assert.deepEqual(result.expenses[0].sharedByParticipantIds, ["avi"]);
  assert.equal(result.expenses[1].total, 4250);
  assert.deepEqual(result.expenses[1].sharedByParticipantIds, ["avi", "dani", "maor"]);
  assert.deepEqual(result.expenses[1].payers, [{ participantId: "dani", amount: 4250 }]);
});

test("restaurant quick entry rejects incomplete rows", () => {
  const result = buildQuickItemExpenses({
    items: [{ name: "", amount: "45", sharedBy: "avi" }],
    payerParticipantId: "dani",
    participantIds: ["avi", "dani"],
    occurredOn: "",
    createdByParticipantId: "dani",
    makeExpenseId: () => "expense-1"
  });

  assert.match(result.error, /חסר שם/);
  assert.deepEqual(result.expenses, []);
});

test("trip expenses are grouped by newest day", () => {
  const groups = groupExpensesByDay([
    { id: "one", occurredOn: "2026-07-15" },
    { id: "two", occurredOn: "2026-07-17" },
    { id: "three", occurredOn: "2026-07-15" }
  ]);

  assert.deepEqual(groups.map((group) => group.date), ["2026-07-17", "2026-07-15"]);
  assert.equal(groups[1].expenses.length, 2);
  assert.match(formatExpenseDay("2026-07-17"), /17/);
});

test("restaurant calculator shows what each person should pay before anyone pays", () => {
  const summary = summarizeQuickItemShares(
    [
      { name: "Pasta", amount: "60", sharedBy: "avi" },
      { name: "Salad", amount: "45", sharedBy: "dani" },
      { name: "Drinks", amount: "30", sharedBy: QUICK_ITEM_ALL_PARTICIPANTS }
    ],
    ["avi", "dani", "maor"]
  );

  assert.equal(summary.billTotal, 13500);
  assert.deepEqual(summary.totals, { avi: 7000, dani: 5500, maor: 1000 });
  assert.equal(summary.error, "");
});

test("restaurant item can be shared by a selected subset", () => {
  const items = [{
    name: "starter",
    amount: "90",
    sharedBy: QUICK_ITEM_CUSTOM_PARTICIPANTS,
    sharedByParticipantIds: ["avi", "maor"]
  }];
  const summary = summarizeQuickItemShares(items, ["avi", "dani", "maor"]);
  const result = buildQuickItemExpenses({
    items,
    payerParticipantId: "dani",
    participantIds: ["avi", "dani", "maor"],
    occurredOn: "2026-07-17",
    createdByParticipantId: "dani",
    makeExpenseId: () => "expense-custom"
  });

  assert.deepEqual(summary.totals, { avi: 4500, dani: 0, maor: 4500 });
  assert.equal(result.error, "");
  assert.deepEqual(result.expenses[0].sharedByParticipantIds, ["avi", "maor"]);
});

test("restaurant calculator reports incomplete active rows instead of silently omitting them", () => {
  const cases = [
    {
      item: { name: "", amount: "45", sharedBy: "avi" },
      expectedError: /חסר שם.*שורה 1/
    },
    {
      item: { name: "Pasta", amount: "not-a-price", sharedBy: "avi" },
      expectedError: /המחיר.*שורה 1.*אינו תקין/
    },
    {
      item: { name: "Pasta", amount: "0", sharedBy: "avi" },
      expectedError: /המחיר.*שורה 1.*גדול מאפס/
    },
    {
      item: {
        name: "Shared starter",
        amount: "90",
        sharedBy: QUICK_ITEM_CUSTOM_PARTICIPANTS,
        sharedByParticipantIds: []
      },
      expectedError: /צריך לבחור.*שורה 1/
    }
  ];

  for (const { item, expectedError } of cases) {
    const summary = summarizeQuickItemShares([item], ["avi", "dani"]);

    assert.match(summary.error, expectedError);
    assert.deepEqual(summary.totals, { avi: 0, dani: 0 });
    assert.equal(summary.billTotal, 0);
  }
});

test("restaurant calculator ignores blank rows and keeps valid totals when reporting an error", () => {
  const summary = summarizeQuickItemShares(
    [
      { name: "", amount: "", sharedBy: "" },
      { name: "Pasta", amount: "60", sharedBy: "avi" },
      { name: "Missing price", amount: "", sharedBy: "dani" }
    ],
    ["avi", "dani"]
  );

  assert.deepEqual(summary.totals, { avi: 6000, dani: 0 });
  assert.equal(summary.billTotal, 6000);
  assert.match(summary.error, /המחיר.*שורה 2.*אינו תקין/);
});

test("restaurant item rejects a custom split with no selected participants", () => {
  const result = buildQuickItemExpenses({
    items: [{
      name: "starter",
      amount: "90",
      sharedBy: QUICK_ITEM_CUSTOM_PARTICIPANTS,
      sharedByParticipantIds: []
    }],
    payerParticipantId: "dani",
    participantIds: ["avi", "dani"],
    occurredOn: "",
    createdByParticipantId: "dani",
    makeExpenseId: () => "expense-custom"
  });

  assert.match(result.error, /שורה 1/);
  assert.deepEqual(result.expenses, []);
});
