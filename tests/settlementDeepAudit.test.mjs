import test from "node:test";
import assert from "node:assert/strict";

import {
  buildParticipantSettlementBreakdown,
  calculateSettlement,
  reconcileSettlementTransfers,
  roundSettlementBalances
} from "../src/domain/settlement.mjs";
import {
  formatMoney,
  parseMoneyInput,
  splitEvenly,
  sumMoneyAmounts
} from "../src/domain/money.mjs";
import {
  createPayerDraft,
  markPayerAmountEdited,
  summarizePayerDraft
} from "../src/domain/expenseDraft.mjs";
import { validateExpense } from "../src/domain/validation.mjs";
import {
  buildQuickItemExpenses,
  QUICK_ITEM_CUSTOM_PARTICIPANTS,
  summarizeQuickItemShares
} from "../src/domain/quickExpenses.mjs";
import { buildEventInsights } from "../src/domain/eventInsights.mjs";
import { formatCurrency } from "../src/domain/currencies.mjs";
import { buildParticipantRelationshipInsights } from "../src/domain/participantRelationshipInsights.mjs";
import { validateSharedStateFinancials } from "../src/domain/sharedStateMerge.mjs";

const DEEP_AUDIT_SEED = 0x51c0ffee;

test("money parsing, formatting and splitting preserve every agora", () => {
  const random = createRandom(DEEP_AUDIT_SEED);
  const boundaryAmounts = [
    0,
    1,
    9,
    10,
    99,
    100,
    101,
    9999,
    Number.MAX_SAFE_INTEGER - 1,
    Number.MAX_SAFE_INTEGER
  ];
  const generatedAmounts = Array.from(
    { length: 20000 },
    () => Math.floor(random() * Number.MAX_SAFE_INTEGER)
  );

  for (const amount of [...boundaryAmounts, ...generatedAmounts]) {
    assert.equal(
      parseMoneyInput(formatMoney(amount)),
      amount,
      `round trip failed for ${amount}`
    );
  }

  for (const malformed of [
    "",
    " ",
    ".",
    "-1",
    "+1",
    "1.001",
    "1,2,3",
    "1e3",
    "Infinity",
    "NaN",
    "₪10",
    "10 שקלים",
    "90071992547409.92"
  ]) {
    assert.throws(() => parseMoneyInput(malformed), undefined, malformed);
  }

  for (let scenario = 0; scenario < 10000; scenario += 1) {
    const participantCount = randomInteger(random, 1, 30);
    const amount = randomInteger(random, 0, 2_000_000_000);
    const ids = Array.from(
      { length: participantCount },
      (_, index) => `p-${index}`
    );
    const shares = splitEvenly(amount, [...ids, ids[0]]);
    const values = Object.values(shares);

    assert.equal(sumMoneyAmounts(values), amount);
    assert.equal(Object.keys(shares).length, participantCount);
    assert.ok(Math.max(...values) - Math.min(...values) <= 1);
  }
});

test("exact, direct and rounded settlements match an independent bigint oracle", () => {
  const random = createRandom(DEEP_AUDIT_SEED ^ 0xa11ce);

  for (let scenarioIndex = 0; scenarioIndex < 2000; scenarioIndex += 1) {
    const scenario = buildScenario(random, `settlement-${scenarioIndex}`, {
      maximumParticipants: 10,
      maximumExpenses: 24
    });
    const oracleBalances = oracleSettlementBalances(
      scenario.participants,
      scenario.expenses
    );
    const exact = calculateSettlement(scenario.participants, scenario.expenses);
    const direct = calculateSettlement(scenario.participants, scenario.expenses, {
      directTransfers: true
    });

    assert.deepEqual(exact.issues, [], `exact issues in scenario ${scenarioIndex}`);
    assert.deepEqual(direct.issues, [], `direct issues in scenario ${scenarioIndex}`);
    assertBalancesMatchOracle(exact.balances, oracleBalances, scenarioIndex);
    assert.deepEqual(direct.balances, exact.balances);
    assertTransfersSettle(exact.balances, exact.transfers, scenario.participants);
    assertTransfersSettle(direct.balances, direct.transfers, scenario.participants);
    assertTransferShape(exact.transfers, scenario.participants);
    assertTransferShape(direct.transfers, scenario.participants, {
      requireNettedRoutes: true
    });

    const roundedBalances = roundSettlementBalances(exact.balances);
    const rounded = calculateSettlement(scenario.participants, scenario.expenses, {
      roundTransfers: true
    });
    const roundedDirect = calculateSettlement(
      scenario.participants,
      scenario.expenses,
      { roundTransfers: true, directTransfers: true }
    );

    assert.deepEqual(rounded.balances, exact.balances);
    assert.deepEqual(roundedDirect.balances, exact.balances);
    assertTransfersSettle(roundedBalances, rounded.transfers, scenario.participants);
    assertTransfersSettle(
      roundedBalances,
      roundedDirect.transfers,
      scenario.participants
    );
    assertTransferShape(rounded.transfers, scenario.participants, {
      unit: 100
    });
    assertTransferShape(roundedDirect.transfers, scenario.participants, {
      unit: 100,
      requireNettedRoutes: true
    });
    assert.equal(sumBigInt(Object.values(roundedBalances)), 0n);
    for (const participant of scenario.participants) {
      assert.equal(Math.abs(roundedBalances[participant.id] % 100), 0);
      assert.ok(
        Math.abs(roundedBalances[participant.id] - exact.balances[participant.id]) < 100
      );

      const breakdown = buildParticipantSettlementBreakdown(
        scenario.participants,
        scenario.expenses,
        participant.id
      );
      assert.deepEqual(breakdown.issues, []);
      assert.equal(breakdown.balance, exact.balances[participant.id]);
      assert.equal(breakdown.paidTotal - breakdown.shareTotal, breakdown.balance);
    }

    const reversedExpenses = calculateSettlement(
      [...scenario.participants].reverse(),
      [...scenario.expenses].reverse()
    );
    for (const participant of scenario.participants) {
      assert.equal(
        reversedExpenses.balances[participant.id],
        exact.balances[participant.id],
        `order changed balance in scenario ${scenarioIndex}`
      );
    }
  }
});

test("smart settlement reaches the true minimum transfer count for small groups", () => {
  const random = createRandom(DEEP_AUDIT_SEED ^ 0x0f71a1);

  for (let scenarioIndex = 0; scenarioIndex < 600; scenarioIndex += 1) {
    const scenario = buildScenario(random, `minimum-${scenarioIndex}`, {
      maximumParticipants: 8,
      maximumExpenses: 12
    });
    const result = calculateSettlement(scenario.participants, scenario.expenses);
    const expectedMinimum = minimumTransferCount(result.balances);

    assert.equal(
      result.transfers.length,
      expectedMinimum,
      `minimum transfer mismatch in scenario ${scenarioIndex}`
    );
  }
});

test("paid history remains exact after expense additions, edits and deletions", () => {
  const random = createRandom(DEEP_AUDIT_SEED ^ 0x0badc0de);

  for (let scenarioIndex = 0; scenarioIndex < 1200; scenarioIndex += 1) {
    const original = buildScenario(random, `history-${scenarioIndex}`, {
      maximumParticipants: 8,
      maximumExpenses: 10
    });
    const directTransfers = scenarioIndex % 2 === 1;
    const previous = calculateSettlement(original.participants, original.expenses, {
      directTransfers
    }).transfers.map((transfer, transferIndex) => ({
      ...transfer,
      status: transferIndex % 2 === scenarioIndex % 2 ? "paid" : "pending",
      markedPaidAt:
        transferIndex % 2 === scenarioIndex % 2
          ? `2026-08-${String((scenarioIndex % 27) + 1).padStart(2, "0")}T12:00:00.000Z`
          : undefined
    }));
    const retainedExpenses = scenarioIndex % 3 === 0
      ? original.expenses.slice(1)
      : original.expenses.map((expense, expenseIndex) =>
          expenseIndex === 0 && scenarioIndex % 3 === 1
            ? scaleExpense(expense, 2)
            : expense
        );
    const added = buildScenario(random, `new-${scenarioIndex}`, {
      participants: original.participants,
      minimumExpenses: 1,
      maximumExpenses: 3
    }).expenses;
    const currentExpenses = [...retainedExpenses, ...added];
    const current = calculateSettlement(original.participants, currentExpenses);
    const reconciled = reconcileSettlementTransfers(
      original.participants,
      currentExpenses,
      previous,
      { directTransfers }
    );

    assert.deepEqual(reconciled.issues, [], `history issues in ${scenarioIndex}`);
    assert.deepEqual(reconciled.balances, current.balances);
    assertTransferShape(reconciled.transfers, original.participants);
    assertTransfersSettle(
      current.balances,
      reconciled.transfers,
      original.participants
    );

    const paidTransfers = reconciled.transfers.filter(
      (transfer) => transfer.status === "paid"
    );
    const pendingTransfers = reconciled.transfers.filter(
      (transfer) => transfer.status !== "paid"
    );
    const expectedOutstanding = applyTransfers(current.balances, paidTransfers);
    assert.deepEqual(reconciled.outstandingBalances, expectedOutstanding);
    assertTransfersSettle(
      reconciled.outstandingBalances,
      pendingTransfers,
      original.participants
    );
    assert.equal(
      new Set(reconciled.transfers.map((transfer) => transfer.id)).size,
      reconciled.transfers.length
    );

    const repeated = reconcileSettlementTransfers(
      original.participants,
      currentExpenses,
      reconciled.transfers,
      { directTransfers }
    );
    assert.deepEqual(
      repeated,
      reconciled,
      `reconciliation was not idempotent in scenario ${scenarioIndex}`
    );
  }
});

test("unsafe cumulative money is rejected instead of producing imprecise balances", () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const participants = [{ id: "a" }, { id: "b" }];
  const hugeExpense = (id) => ({
    id,
    name: id,
    total: maximum,
    payers: [{ participantId: "a", amount: maximum }],
    sharedByParticipantIds: ["b"]
  });
  const result = calculateSettlement(participants, [
    hugeExpense("first"),
    hugeExpense("second")
  ]);

  assert.deepEqual(result.balances, { a: maximum, b: -maximum });
  assert.deepEqual(result.issues, [
    { expenseId: "second", reason: "unsafe-event-total" }
  ]);
  assert.equal(result.transfers[0].amount, maximum);
  assert.equal(Number.isSafeInteger(result.transfers[0].amount), true);

  const overflowingPayers = {
    id: "overflowing-payers",
    name: "overflowing-payers",
    total: maximum,
    payers: [
      { participantId: "a", amount: maximum },
      { participantId: "b", amount: 1 }
    ],
    sharedByParticipantIds: ["a", "b"]
  };
  assert.deepEqual(
    calculateSettlement(participants, [overflowingPayers]).issues,
    [{ expenseId: "overflowing-payers", reason: "unsafe-payer-total" }]
  );
  assert.ok(
    validateExpense(overflowingPayers, { participantIds: ["a", "b"] })
      .includes("סכום המשלמים גדול מדי.")
  );

  const maximumInput = formatMoney(maximum);
  const draftSummary = summarizePayerDraft(maximumInput, [
    markPayerAmountEdited(createPayerDraft("a"), maximumInput),
    markPayerAmountEdited(createPayerDraft("b"), "0.01")
  ]);
  assert.equal(draftSummary.valid, false);
  assert.equal(draftSummary.balanced, false);

  const unsafeHistory = reconcileSettlementTransfers(
    participants,
    [],
    [
      {
        id: "paid-a-b",
        fromParticipantId: "a",
        toParticipantId: "b",
        amount: maximum,
        status: "paid"
      },
      {
        id: "paid-b-a",
        fromParticipantId: "b",
        toParticipantId: "a",
        amount: maximum,
        status: "paid"
      }
    ]
  );
  assert.deepEqual(unsafeHistory.issues, [
    { transferId: "paid-b-a", reason: "unsafe-paid-history" }
  ]);

  assert.throws(() => sumMoneyAmounts([maximum, 1]), RangeError);
  assert.throws(() => sumMoneyAmounts([1.5]), TypeError);
});

test("restaurant calculator and derived event totals match independent sums", () => {
  const random = createRandom(DEEP_AUDIT_SEED ^ 0x7e57a11);

  for (let scenarioIndex = 0; scenarioIndex < 1500; scenarioIndex += 1) {
    const participantCount = randomInteger(random, 2, 8);
    const participantIds = Array.from(
      { length: participantCount },
      (_, index) => `restaurant-${scenarioIndex}-p-${index}`
    );
    const itemCount = randomInteger(random, 1, 20);
    const items = Array.from({ length: itemCount }, (_, itemIndex) => {
      const amount = randomInteger(random, 1, 2_000_000);
      return {
        name: `Item ${itemIndex}`,
        amount: formatMoney(amount),
        sharedBy: QUICK_ITEM_CUSTOM_PARTICIPANTS,
        sharedByParticipantIds: shuffled(random, participantIds).slice(
          0,
          randomInteger(random, 1, participantCount)
        )
      };
    });
    const expectedTotals = Object.fromEntries(
      participantIds.map((participantId) => [participantId, 0n])
    );
    let expectedBillTotal = 0n;
    for (const item of items) {
      const amount = BigInt(parseMoneyInput(item.amount));
      const count = BigInt(item.sharedByParticipantIds.length);
      const base = amount / count;
      const remainder = Number(amount % count);
      expectedBillTotal += amount;
      item.sharedByParticipantIds.forEach((participantId, index) => {
        expectedTotals[participantId] += base + (index < remainder ? 1n : 0n);
      });
    }

    const summary = summarizeQuickItemShares(items, participantIds);
    assert.equal(summary.error, "");
    assert.equal(BigInt(summary.billTotal), expectedBillTotal);
    for (const participantId of participantIds) {
      assert.equal(BigInt(summary.totals[participantId]), expectedTotals[participantId]);
    }

    if (scenarioIndex < 400) {
      let expenseId = 0;
      const built = buildQuickItemExpenses({
        items,
        payerParticipantId: participantIds[0],
        participantIds,
        occurredOn: "2026-08-30",
        createdByParticipantId: participantIds[0],
        makeExpenseId: () => `restaurant-${scenarioIndex}-expense-${expenseId++}`
      });
      const settlement = calculateSettlement(
        participantIds.map((id) => ({ id })),
        built.expenses
      );
      assert.equal(built.error, "");
      assert.deepEqual(settlement.issues, []);
      assertTransfersSettle(
        settlement.balances,
        settlement.transfers,
        participantIds.map((id) => ({ id }))
      );
    }

    const event = {
      expenses: items.map((item, index) => ({
        id: `insight-expense-${index}`,
        total: parseMoneyInput(item.amount)
      })),
      transfers: items.slice(0, Math.min(items.length, 6)).map((item, index) => ({
        amount: parseMoneyInput(item.amount),
        status: index % 2 === 0 ? "pending" : "paid"
      }))
    };
    const insights = buildEventInsights({
      event,
      participants: participantIds.map((id) => ({ id })),
      settlement: { issues: [], transfers: [] }
    });
    const expectedPending = event.transfers
      .filter((transfer) => transfer.status === "pending")
      .reduce((sum, transfer) => sum + BigInt(transfer.amount), 0n);
    assert.equal(BigInt(insights.totalExpenses), expectedBillTotal);
    assert.equal(BigInt(insights.pendingTotal), expectedPending);
  }

  const maximumInput = formatMoney(Number.MAX_SAFE_INTEGER);
  const overflowingItems = [
    {
      name: "Maximum one",
      amount: maximumInput,
      sharedBy: "a"
    },
    {
      name: "Maximum two",
      amount: maximumInput,
      sharedBy: "a"
    }
  ];
  const overflowSummary = summarizeQuickItemShares(overflowingItems, ["a", "b"]);
  assert.equal(overflowSummary.billTotal, Number.MAX_SAFE_INTEGER);
  assert.match(overflowSummary.error, /גדול מדי/);

  const overflowBuild = buildQuickItemExpenses({
    items: overflowingItems,
    payerParticipantId: "a",
    participantIds: ["a", "b"],
    makeExpenseId: () => "expense"
  });
  assert.deepEqual(overflowBuild.expenses, []);
  assert.match(overflowBuild.error, /גדול מדי/);

  const unsafeInsights = buildEventInsights({
    event: {
      expenses: [{ total: Number.MAX_SAFE_INTEGER }, { total: 1 }],
      transfers: []
    },
    participants: [],
    settlement: { issues: [], transfers: [] }
  });
  assert.equal(unsafeInsights.totalExpenses, 0);
  assert.equal(unsafeInsights.status, "needs-review");
  assert.match(formatCurrency(Number.MAX_SAFE_INTEGER, "ILS"), /^₪/);
  assert.throws(() => formatCurrency(Number.MAX_SAFE_INTEGER + 1, "ILS"), TypeError);

});

test("relationship statistics preserve exact totals, leaders and percentages", () => {
  const random = createRandom(DEEP_AUDIT_SEED ^ 0x57a71571);

  for (let scenarioIndex = 0; scenarioIndex < 800; scenarioIndex += 1) {
    const events = [];
    let currentPaid = 0;
    let targetPaid = 0;
    let expenseCount = 0;
    let largestEventTotal = -1;
    let largestEventId = "";
    const eventCount = randomInteger(random, 1, 20);

    for (let eventIndex = 0; eventIndex < eventCount; eventIndex += 1) {
      const expenses = [];
      let eventTotal = 0;
      const currentEventExpenseCount = randomInteger(random, 0, 10);
      for (let expenseIndex = 0; expenseIndex < currentEventExpenseCount; expenseIndex += 1) {
        const total = randomInteger(random, 1, 1_000_000);
        const payer = randomInteger(random, 0, 2);
        const participantId = payer === 0 ? "current" : payer === 1 ? "target" : "other";
        expenses.push({
          id: `relationship-${scenarioIndex}-${eventIndex}-${expenseIndex}`,
          name: `Expense ${expenseIndex}`,
          total,
          payers: [{ participantId, amount: total }]
        });
        if (participantId === "current") currentPaid += total;
        if (participantId === "target") targetPaid += total;
        eventTotal += total;
        expenseCount += 1;
      }
      const eventId = `relationship-${scenarioIndex}-event-${eventIndex}`;
      if (eventTotal > largestEventTotal) {
        largestEventTotal = eventTotal;
        largestEventId = eventId;
      }
      events.push({
        id: eventId,
        name: `Event ${eventIndex}`,
        currency: "ILS",
        participantIds: ["current", "target", "other"],
        expenses
      });
    }

    const insights = buildParticipantRelationshipInsights({
      events,
      currentParticipantId: "current",
      targetParticipantId: "target",
      currency: "ILS"
    });
    const totalPaid = currentPaid + targetPaid;
    const currentShare = totalPaid > 0
      ? Math.round((currentPaid / totalPaid) * 100)
      : 50;

    assert.deepEqual(insights.paid, {
      current: currentPaid,
      target: targetPaid
    });
    assert.deepEqual(insights.paidShare, {
      current: currentShare,
      target: 100 - currentShare
    });
    assert.equal(insights.expenseCount, expenseCount);
    assert.equal(
      insights.paymentLeader,
      currentPaid === targetPaid
        ? "tie"
        : currentPaid > targetPaid ? "current" : "target"
    );
    if (largestEventTotal > 0) {
      assert.equal(insights.largestEvent.id, largestEventId);
      assert.equal(insights.largestEvent.total, largestEventTotal);
    } else {
      assert.equal(insights.largestEvent, null);
    }
  }
});

test("persisted state rejects every unsafe financial integer and cumulative total", () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const baseState = {
    currentParticipantId: "a",
    participants: [{ id: "a" }, { id: "b" }],
    groups: [],
    events: []
  };
  const expense = (id, total = maximum) => ({
    id,
    name: id,
    total,
    payers: [{ participantId: "a", amount: total }],
    sharedByParticipantIds: ["a", "b"]
  });
  const event = (id, expenses, transfers = []) => ({
    id,
    participantIds: ["a", "b"],
    adminIds: ["a"],
    expenses,
    transfers
  });

  assert.deepEqual(
    validateSharedStateFinancials({
      ...baseState,
      events: [event("safe", [expense("safe-expense", 1000)])]
    }),
    []
  );

  const unsafeIntegerErrors = validateSharedStateFinancials({
    ...baseState,
    events: [event("unsafe", [expense("unsafe-expense", maximum + 1)])]
  });
  assert.ok(unsafeIntegerErrors.some((error) => error.includes("safe money range")));

  const cumulativeExpenseErrors = validateSharedStateFinancials({
    ...baseState,
    events: [
      event("first", [expense("first-expense")]),
      event("second", [expense("second-expense")])
    ]
  });
  assert.ok(
    cumulativeExpenseErrors.some((error) =>
      error.includes("expenses exceed the safe cumulative money range")
    )
  );

  const transfer = (id, fromParticipantId, toParticipantId) => ({
    id,
    fromParticipantId,
    toParticipantId,
    amount: maximum,
    status: "paid"
  });
  const cumulativeTransferErrors = validateSharedStateFinancials({
    ...baseState,
    events: [event("transfers", [], [
      transfer("first-transfer", "a", "b"),
      transfer("second-transfer", "b", "a")
    ])]
  });
  assert.ok(
    cumulativeTransferErrors.some((error) =>
      error.includes("transfers exceed the safe cumulative money range")
    )
  );
});

function createRandom(initialSeed) {
  let seed = initialSeed >>> 0;
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function randomInteger(random, minimum, maximum) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function shuffled(random, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInteger(random, 0, index);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function buildScenario(random, prefix, options = {}) {
  const participants = options.participants ?? Array.from(
    {
      length: randomInteger(
        random,
        2,
        options.maximumParticipants ?? 8
      )
    },
    (_, index) => ({ id: `${prefix}-p-${index}`, displayName: `P ${index}` })
  );
  const ids = participants.map((participant) => participant.id);
  const expenseCount = randomInteger(
    random,
    options.minimumExpenses ?? 1,
    options.maximumExpenses ?? 16
  );
  const expenses = Array.from({ length: expenseCount }, (_, expenseIndex) => {
    const payerCount = randomInteger(random, 1, Math.min(4, ids.length));
    const payerIds = shuffled(random, ids).slice(0, payerCount);
    const total = randomInteger(random, payerCount, 2_000_000);
    const payerAmounts = positivePartition(random, total, payerCount);
    const sharedIds = shuffled(random, ids).slice(
      0,
      randomInteger(random, 1, ids.length)
    );

    return {
      id: `${prefix}-expense-${expenseIndex}`,
      name: `Expense ${expenseIndex}`,
      total,
      payers: payerIds.map((participantId, payerIndex) => ({
        participantId,
        amount: payerAmounts[payerIndex]
      })),
      sharedByParticipantIds: sharedIds
    };
  });

  return { participants, expenses };
}

function positivePartition(random, total, count) {
  let remaining = total;
  return Array.from({ length: count }, (_, index) => {
    const remainingParts = count - index - 1;
    const amount = remainingParts === 0
      ? remaining
      : randomInteger(random, 1, remaining - remainingParts);
    remaining -= amount;
    return amount;
  });
}

function oracleSettlementBalances(participants, expenses) {
  const balances = Object.fromEntries(
    participants.map((participant) => [participant.id, 0n])
  );
  for (const expense of expenses) {
    const participantIds = [...new Set(expense.sharedByParticipantIds)];
    const total = BigInt(expense.total);
    const participantCount = BigInt(participantIds.length);
    const base = total / participantCount;
    const remainder = Number(total % participantCount);
    participantIds.forEach((participantId, index) => {
      balances[participantId] -= base + (index < remainder ? 1n : 0n);
    });
    for (const payer of expense.payers) {
      balances[payer.participantId] += BigInt(payer.amount);
    }
  }
  return balances;
}

function assertBalancesMatchOracle(actual, expected, scenarioIndex) {
  for (const [participantId, balance] of Object.entries(actual)) {
    assert.equal(Number.isSafeInteger(balance), true);
    assert.equal(
      BigInt(balance),
      expected[participantId],
      `balance mismatch for ${participantId} in scenario ${scenarioIndex}`
    );
  }
  assert.equal(sumBigInt(Object.values(actual)), 0n);
}

function assertTransferShape(
  transfers,
  participants,
  { unit = 1, requireNettedRoutes = false } = {}
) {
  const ids = new Set(participants.map((participant) => participant.id));
  const routes = new Set();
  for (const transfer of transfers) {
    assert.equal(Number.isSafeInteger(transfer.amount), true);
    assert.ok(transfer.amount > 0);
    assert.equal(transfer.amount % unit, 0);
    assert.ok(ids.has(transfer.fromParticipantId));
    assert.ok(ids.has(transfer.toParticipantId));
    assert.notEqual(transfer.fromParticipantId, transfer.toParticipantId);
    if (requireNettedRoutes) {
      const route = `${transfer.fromParticipantId}\u0000${transfer.toParticipantId}`;
      const reverse = `${transfer.toParticipantId}\u0000${transfer.fromParticipantId}`;
      assert.equal(routes.has(route), false, `duplicate route ${route}`);
      assert.equal(routes.has(reverse), false, `reciprocal route ${route}`);
      routes.add(route);
    }
  }
}

function assertTransfersSettle(balances, transfers, participants) {
  const finalBalances = Object.fromEntries(
    participants.map((participant) => [
      participant.id,
      BigInt(balances[participant.id] ?? 0)
    ])
  );
  for (const transfer of transfers) {
    finalBalances[transfer.fromParticipantId] += BigInt(transfer.amount);
    finalBalances[transfer.toParticipantId] -= BigInt(transfer.amount);
  }
  assert.deepEqual(
    finalBalances,
    Object.fromEntries(participants.map((participant) => [participant.id, 0n]))
  );
}

function applyTransfers(balances, transfers) {
  const next = { ...balances };
  for (const transfer of transfers) {
    next[transfer.fromParticipantId] = sumMoneyAmounts([
      next[transfer.fromParticipantId],
      transfer.amount
    ]);
    next[transfer.toParticipantId] = sumMoneyAmounts([
      next[transfer.toParticipantId],
      -transfer.amount
    ]);
  }
  return next;
}

function minimumTransferCount(balances) {
  const values = Object.values(balances).filter((balance) => balance !== 0);
  if (values.length === 0) return 0;
  const fullMask = (1 << values.length) - 1;
  const sums = new Array(fullMask + 1).fill(0);
  for (let mask = 1; mask <= fullMask; mask += 1) {
    const bit = mask & -mask;
    const index = 31 - Math.clz32(bit);
    sums[mask] = sums[mask ^ bit] + values[index];
  }

  const memo = new Map([[0, 0]]);
  const maximumGroups = (mask) => {
    if (memo.has(mask)) return memo.get(mask);
    const requiredBit = mask & -mask;
    let best = Number.NEGATIVE_INFINITY;
    for (let subset = mask; subset > 0; subset = (subset - 1) & mask) {
      if ((subset & requiredBit) === 0 || sums[subset] !== 0) continue;
      best = Math.max(best, 1 + maximumGroups(mask ^ subset));
    }
    memo.set(mask, best);
    return best;
  };

  return values.length - maximumGroups(fullMask);
}

function scaleExpense(expense, multiplier) {
  return {
    ...expense,
    id: `${expense.id}-scaled-${multiplier}`,
    total: expense.total * multiplier,
    payers: expense.payers.map((payer) => ({
      ...payer,
      amount: payer.amount * multiplier
    }))
  };
}

function sumBigInt(values) {
  return values.reduce((sum, value) => sum + BigInt(value), 0n);
}
