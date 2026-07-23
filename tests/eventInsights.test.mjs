import test from "node:test";
import assert from "node:assert/strict";
import { buildEventInsights } from "../src/domain/eventInsights.mjs";

test("buildEventInsights summarizes money, transfers, and participants", () => {
  const insights = buildEventInsights({
    event: {
      expenses: [
        { total: 12000 },
        { total: 3000 }
      ],
      transfers: [
        { amount: 2500, status: "pending" },
        { amount: 1000, status: "paid" }
      ]
    },
    participants: [{ id: "a" }, { id: "b" }, { id: "c" }],
    settlement: { issues: [], transfers: [] }
  });

  assert.equal(insights.totalExpenses, 15000);
  assert.equal(insights.expenseCount, 2);
  assert.equal(insights.participantCount, 3);
  assert.equal(insights.transferCount, 2);
  assert.equal(insights.pendingTransferCount, 1);
  assert.equal(insights.pendingTotal, 2500);
  assert.equal(insights.paidTransferCount, 1);
  assert.equal(insights.status, "pending-payments");
});

test("buildEventInsights marks empty, ready, balanced, and review states", () => {
  assert.equal(
    buildEventInsights({
      event: { expenses: [], transfers: [] },
      participants: [],
      settlement: { issues: [], transfers: [] }
    }).status,
    "empty"
  );

  assert.equal(
    buildEventInsights({
      event: { expenses: [{ total: 1000 }], transfers: [] },
      participants: [{ id: "a" }, { id: "b" }],
      settlement: { issues: [], transfers: [{ amount: 500, status: "pending" }] }
    }).status,
    "ready-to-settle"
  );

  assert.equal(
    buildEventInsights({
      event: { expenses: [{ total: 1000 }], transfers: [] },
      participants: [{ id: "a" }],
      settlement: { issues: [], transfers: [] }
    }).status,
    "balanced"
  );

  assert.equal(
    buildEventInsights({
      event: { expenses: [{ total: 1000 }], transfers: [] },
      participants: [{ id: "a" }],
      settlement: { issues: [{ expenseId: "expense-1", reason: "payer-total-mismatch" }], transfers: [] }
    }).status,
    "needs-review"
  );
});

test("paid transfers are settled without pretending the event was closed", () => {
  const openEvent = buildEventInsights({
    event: {
      expenses: [{ total: 1000 }],
      transfers: [{ amount: 500, status: "paid" }]
    },
    participants: [{ id: "a" }, { id: "b" }],
    settlement: { issues: [], transfers: [{ amount: 500, status: "pending" }] }
  });

  assert.equal(openEvent.status, "settled");

  const closedEvent = buildEventInsights({
    event: {
      closedAt: "2026-07-19T10:00:00.000Z",
      expenses: [{ total: 1000 }],
      transfers: [{ amount: 500, status: "paid" }]
    },
    participants: [{ id: "a" }, { id: "b" }],
    settlement: { issues: [], transfers: [{ amount: 500, status: "pending" }] }
  });

  assert.equal(closedEvent.status, "closed");
});
