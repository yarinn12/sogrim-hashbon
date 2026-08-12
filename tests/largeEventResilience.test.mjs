import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  calculateSettlement,
  reconcileSettlementTransfers
} from "../src/domain/settlement.mjs";
import {
  formatEventReport,
  formatSettlementSummary
} from "../src/domain/settlementSummary.mjs";
import {
  mergeSharedStates,
  validateSharedStateFinancials
} from "../src/domain/sharedStateMerge.mjs";

const PARTICIPANT_COUNT = 12;
const EXPENSE_COUNT = 60;

const participants = Array.from({ length: PARTICIPANT_COUNT }, (_, index) => ({
  id: `person-${index + 1}`,
  displayName: `משתתף ${index + 1}`,
  kind: index % 4 === 0 ? "guest" : "user"
}));

const participantIds = participants.map((participant) => participant.id);
const expenses = Array.from({ length: EXPENSE_COUNT }, (_, index) => {
  const total = 1_037 + index * 83;
  const sharedByParticipantIds = participantIds.filter(
    (_, participantIndex) => (participantIndex + index) % 3 !== 0
  );
  const payerId = participantIds[index % participantIds.length];

  return {
    id: `expense-${index + 1}`,
    name: `הוצאה ${index + 1}`,
    total,
    payers: [{ participantId: payerId, amount: total }],
    sharedByParticipantIds,
    createdByParticipantId: payerId,
    occurredOn: `2026-07-${String((index % 6) + 1).padStart(2, "0")}`,
    updatedAt: `2026-07-${String((index % 6) + 1).padStart(2, "0")}T${String(
      index % 24
    ).padStart(2, "0")}:00:00.000Z`
  };
});

function heavyState(eventExpenses) {
  return {
    currentParticipantId: participantIds[0],
    participants,
    groups: [],
    events: [
      {
        id: "event-heavy",
        name: "טיול ארוך",
        eventType: "trip",
        currency: "ILS",
        participantIds,
        adminIds: [participantIds[0]],
        createdByParticipantId: participantIds[0],
        createdAt: "2026-07-01T08:00:00.000Z",
        updatedAt: "2026-07-07T08:00:00.000Z",
        expenses: eventExpenses,
        transfers: []
      }
    ],
    deletedEvents: [],
    deletedParticipants: []
  };
}

test("an event with 60 expenses stays exact and produces a valid settlement quickly", () => {
  const startedAt = performance.now();
  const settlement = calculateSettlement(participants, expenses);
  const elapsed = performance.now() - startedAt;
  const totalDebt = Object.values(settlement.balances)
    .filter((balance) => balance < 0)
    .reduce((sum, balance) => sum + Math.abs(balance), 0);
  const transferred = settlement.transfers.reduce(
    (sum, transfer) => sum + transfer.amount,
    0
  );

  assert.deepEqual(settlement.issues, []);
  assert.equal(
    Object.values(settlement.balances).reduce((sum, balance) => sum + balance, 0),
    0
  );
  assert.equal(transferred, totalDebt);
  assert.ok(settlement.transfers.length <= participants.length - 1);
  assert.ok(elapsed < 2_000, `large settlement took ${elapsed.toFixed(1)}ms`);
  settlement.transfers.forEach((transfer) => {
    assert.equal(Number.isSafeInteger(transfer.amount), true);
    assert.ok(transfer.amount > 0);
    assert.notEqual(transfer.fromParticipantId, transfer.toParticipantId);
  });
});

test("paid transfer history survives recalculation in a large event", () => {
  const initial = calculateSettlement(participants, expenses);
  const paidTransfer = { ...initial.transfers[0], status: "paid" };
  const reconciled = reconcileSettlementTransfers(
    participants,
    expenses,
    [paidTransfer]
  );

  assert.deepEqual(reconciled.issues, []);
  assert.equal(
    reconciled.transfers.some(
      (transfer) => transfer.id === paidTransfer.id && transfer.status === "paid"
    ),
    true
  );
  assert.equal(
    reconciled.transfers
      .filter((transfer) => transfer.status !== "paid")
      .every((transfer) => transfer.amount > 0),
    true
  );
});

test("concurrent devices merge all 60 expenses without duplicates or invalid money", () => {
  const remoteExpenses = expenses.filter((_, index) => index < 40);
  const localExpenses = expenses.filter((_, index) => index >= 20);
  const remote = heavyState(remoteExpenses);
  const local = heavyState(localExpenses);

  remote.events[0].updatedAt = "2026-07-07T08:00:00.000Z";
  local.events[0].updatedAt = "2026-07-07T08:01:00.000Z";

  const merged = mergeSharedStates(remote, local);
  const [event] = merged.events;

  assert.equal(event.expenses.length, EXPENSE_COUNT);
  assert.equal(new Set(event.expenses.map((expense) => expense.id)).size, EXPENSE_COUNT);
  assert.deepEqual(validateSharedStateFinancials(merged), []);
  assert.deepEqual(
    calculateSettlement(participants, event.expenses).issues,
    []
  );
});

test("large settlement copy and full report include the complete event", () => {
  const settlement = calculateSettlement(participants, expenses);
  const summary = formatSettlementSummary({
    eventName: "טיול ארוך",
    participants,
    transfers: settlement.transfers,
    currency: "ILS"
  });
  const report = formatEventReport({
    eventName: "טיול ארוך",
    participants,
    expenses,
    transfers: settlement.transfers,
    currency: "ILS"
  });

  assert.match(summary, /טיול ארוך/);
  assert.match(report, /הוצאה 1/);
  assert.match(report, /הוצאה 60/);
  assert.equal(
    expenses.every((expense) => report.includes(expense.name)),
    true
  );
});
