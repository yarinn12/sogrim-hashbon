import test from "node:test";
import assert from "node:assert/strict";

import { formatMoney, parseMoneyInput, splitEvenly } from "../src/domain/money.mjs";
import { calculateSettlement } from "../src/domain/settlement.mjs";
import { validateExpense } from "../src/domain/validation.mjs";

const participants = [
  { id: "dani", displayName: "דני", kind: "user" },
  { id: "avi", displayName: "אבי", kind: "user" },
  { id: "yarin", displayName: "ירין", kind: "user" },
  { id: "maor", displayName: "מאור", kind: "guest" }
];

test("money helpers parse, format, and split without losing agorot", () => {
  assert.equal(parseMoneyInput("27.50"), 2750);
  assert.equal(parseMoneyInput("110"), 11000);
  assert.equal(formatMoney(2750), "27.50");
  assert.deepEqual(splitEvenly(10000, ["a", "b", "c"]), {
    a: 3334,
    b: 3333,
    c: 3333
  });
});

test("splitEvenly ignores duplicate participants so every agora is assigned once", () => {
  assert.deepEqual(splitEvenly(10000, ["dani", "dani", "avi"]), {
    dani: 5000,
    avi: 5000
  });
});

test("settlement stays balanced when imported expense data has duplicate participants", () => {
  const result = calculateSettlement(participants.slice(0, 2), [
    {
      id: "taxi",
      name: "מונית",
      total: 10000,
      payers: [{ participantId: "dani", amount: 10000 }],
      sharedByParticipantIds: ["dani", "dani", "avi"],
      createdByParticipantId: "dani",
      updatedAt: "2026-05-23T00:00:00.000Z"
    }
  ]);

  assert.deepEqual(result.balances, {
    dani: 5000,
    avi: -5000
  });
  assert.deepEqual(result.transfers, [
    {
      id: "transfer-avi-dani-5000",
      fromParticipantId: "avi",
      toParticipantId: "dani",
      amount: 5000,
      status: "pending"
    }
  ]);
});

test("settlement only sends money from net debtors to net creditors", () => {
  const result = calculateSettlement(participants, [
    {
      id: "taxi",
      name: "מונית",
      total: 11000,
      payers: [
        { participantId: "dani", amount: 5000 },
        { participantId: "avi", amount: 6000 }
      ],
      sharedByParticipantIds: ["dani", "avi", "yarin", "maor"],
      createdByParticipantId: "dani",
      updatedAt: "2026-05-23T00:00:00.000Z"
    }
  ]);

  assert.deepEqual(result.balances, {
    dani: 2250,
    avi: 3250,
    yarin: -2750,
    maor: -2750
  });

  assert.deepEqual(result.transfers, [
    {
      id: "transfer-yarin-avi-2750",
      fromParticipantId: "yarin",
      toParticipantId: "avi",
      amount: 2750,
      status: "pending"
    },
    {
      id: "transfer-maor-dani-2250",
      fromParticipantId: "maor",
      toParticipantId: "dani",
      amount: 2250,
      status: "pending"
    },
    {
      id: "transfer-maor-avi-500",
      fromParticipantId: "maor",
      toParticipantId: "avi",
      amount: 500,
      status: "pending"
    }
  ]);
});

test("expense shares can exclude people from specific expenses", () => {
  const result = calculateSettlement(participants, [
    {
      id: "food",
      name: "אוכל",
      total: 9000,
      payers: [{ participantId: "dani", amount: 9000 }],
      sharedByParticipantIds: ["dani", "avi", "yarin"],
      createdByParticipantId: "dani",
      updatedAt: "2026-05-23T00:00:00.000Z"
    },
    {
      id: "alcohol",
      name: "אלכוהול",
      total: 6000,
      payers: [{ participantId: "avi", amount: 6000 }],
      sharedByParticipantIds: ["avi", "yarin"],
      createdByParticipantId: "avi",
      updatedAt: "2026-05-23T00:00:00.000Z"
    }
  ]);

  assert.deepEqual(result.balances, {
    dani: 6000,
    avi: 0,
    yarin: -6000,
    maor: 0
  });
  assert.equal(result.transfers.length, 1);
  assert.deepEqual(result.transfers[0], {
    id: "transfer-yarin-dani-6000",
    fromParticipantId: "yarin",
    toParticipantId: "dani",
    amount: 6000,
    status: "pending"
  });
});

test("settlement transfers exactly clear every balance in a mixed event", () => {
  const result = calculateSettlement(participants, [
    {
      id: "taxi",
      name: "מונית",
      total: 10001,
      payers: [
        { participantId: "dani", amount: 5000 },
        { participantId: "avi", amount: 5001 }
      ],
      sharedByParticipantIds: ["dani", "avi", "yarin"],
      createdByParticipantId: "dani",
      updatedAt: "2026-05-23T00:00:00.000Z"
    },
    {
      id: "food",
      name: "אוכל",
      total: 7777,
      payers: [{ participantId: "maor", amount: 7777 }],
      sharedByParticipantIds: ["dani", "maor"],
      createdByParticipantId: "maor",
      updatedAt: "2026-05-23T00:00:00.000Z"
    }
  ]);

  const balancesAfterTransfers = { ...result.balances };
  for (const transfer of result.transfers) {
    assert.ok(result.balances[transfer.fromParticipantId] < 0);
    assert.ok(result.balances[transfer.toParticipantId] > 0);
    balancesAfterTransfers[transfer.fromParticipantId] += transfer.amount;
    balancesAfterTransfers[transfer.toParticipantId] -= transfer.amount;
  }

  assert.deepEqual(balancesAfterTransfers, {
    dani: 0,
    avi: 0,
    yarin: 0,
    maor: 0
  });
});

test("expense validation catches invalid payer totals", () => {
  const errors = validateExpense({
    id: "taxi",
    name: "מונית",
    total: 11000,
    payers: [{ participantId: "dani", amount: 5000 }],
    sharedByParticipantIds: ["dani", "avi"],
    createdByParticipantId: "dani",
    updatedAt: "2026-05-23T00:00:00.000Z"
  });

  assert.deepEqual(errors, ["סכום המשלמים חייב להיות שווה לסכום ההוצאה."]);
});

test("expense validation catches duplicate shares and people outside the event", () => {
  const errors = validateExpense(
    {
      id: "taxi",
      name: "מונית",
      total: 10000,
      payers: [{ participantId: "dani", amount: 10000 }],
      sharedByParticipantIds: ["dani", "dani", "guest"],
      createdByParticipantId: "dani",
      updatedAt: "2026-05-23T00:00:00.000Z"
    },
    { participantIds: ["dani", "avi"] }
  );

  assert.deepEqual(errors, [
    "אותו משתתף מופיע יותר מפעם אחת בהוצאה.",
    "יש בהוצאה משתתף שלא נמצא באירוע."
  ]);
});

test("expense validation rejects non-positive payer amounts", () => {
  const errors = validateExpense(
    {
      id: "refund",
      name: "החזר",
      total: 10000,
      payers: [
        { participantId: "dani", amount: 12000 },
        { participantId: "avi", amount: -2000 }
      ],
      sharedByParticipantIds: ["dani", "avi"],
      createdByParticipantId: "dani",
      updatedAt: "2026-05-23T00:00:00.000Z"
    },
    { participantIds: ["dani", "avi"] }
  );

  assert.deepEqual(errors, ["סכום לכל משלם חייב להיות גדול מאפס."]);
});
