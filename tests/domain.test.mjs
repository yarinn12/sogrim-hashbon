import test from "node:test";
import assert from "node:assert/strict";

import { formatMoney, parseMoneyInput, splitEvenly } from "../src/domain/money.mjs";
import {
  buildParticipantSettlementBreakdown,
  calculateSettlement,
  groupSettlementTransfersForDisplay,
  pendingBalanceForParticipant,
  reconcileSettlementTransfers,
  roundSettlementBalances
} from "../src/domain/settlement.mjs";
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

test("money helpers reject unsafe or fractional internal agora values", () => {
  assert.throws(() => parseMoneyInput("90071992547409.93"), /גדול מדי/);
  assert.throws(() => formatMoney(100.5), /safe integer agorot/);
});

test("splitEvenly ignores duplicate participants so every agora is assigned once", () => {
  assert.deepEqual(splitEvenly(10000, ["dani", "dani", "avi"]), {
    dani: 5000,
    avi: 5000
  });
});

test("splitEvenly preserves every agora across a broad range of totals and group sizes", () => {
  for (let participantCount = 1; participantCount <= 25; participantCount += 1) {
    const participantIds = Array.from(
      { length: participantCount },
      (_, index) => `person-${index + 1}`
    );
    for (const amount of [1, 2, 3, 7, 99, 100, 101, 9999, 10000, 10001, 999999]) {
      const shares = Object.values(splitEvenly(amount, participantIds));
      assert.equal(shares.reduce((sum, share) => sum + share, 0), amount);
      assert.equal(shares.every((share) => Number.isSafeInteger(share) && share >= 0), true);
      assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
    }
  }
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

test("settlement uses the true minimum transfer count for ordinary groups", () => {
  const people = ["p0", "p1", "p2", "p3", "p4"].map((id) => ({
    id,
    displayName: id
  }));
  const expenses = [
    {
      id: "e1",
      total: 1930,
      payers: [{ participantId: "p0", amount: 1930 }],
      sharedByParticipantIds: ["p1"]
    },
    {
      id: "e2",
      total: 575,
      payers: [{ participantId: "p0", amount: 575 }],
      sharedByParticipantIds: ["p3"]
    },
    {
      id: "e3",
      total: 1761,
      payers: [{ participantId: "p2", amount: 1761 }],
      sharedByParticipantIds: ["p3"]
    },
    {
      id: "e4",
      total: 2505,
      payers: [{ participantId: "p2", amount: 2505 }],
      sharedByParticipantIds: ["p4"]
    }
  ];

  const result = calculateSettlement(people, expenses);

  assert.equal(result.transfers.length, 3);
  assert.deepEqual(
    result.transfers
      .map(({ fromParticipantId, toParticipantId, amount }) => ({
        fromParticipantId,
        toParticipantId,
        amount
      }))
      .sort((first, second) =>
        first.fromParticipantId.localeCompare(second.fromParticipantId)
      ),
    [
      { fromParticipantId: "p1", toParticipantId: "p2", amount: 1930 },
      { fromParticipantId: "p3", toParticipantId: "p2", amount: 2336 },
      { fromParticipantId: "p4", toParticipantId: "p0", amount: 2505 }
    ]
  );
});

test("settlement collapses a payment chain into one direct transfer", () => {
  const people = ["a", "b", "c"].map((id) => ({
    id,
    displayName: id
  }));
  const result = calculateSettlement(people, [
    {
      id: "a-paid-for-b",
      total: 1000,
      payers: [{ participantId: "a", amount: 1000 }],
      sharedByParticipantIds: ["b"]
    },
    {
      id: "b-paid-for-c",
      total: 1000,
      payers: [{ participantId: "b", amount: 1000 }],
      sharedByParticipantIds: ["c"]
    }
  ]);

  assert.deepEqual(result.transfers, [
    {
      id: "transfer-c-a-1000",
      fromParticipantId: "c",
      toParticipantId: "a",
      amount: 1000,
      status: "pending"
    }
  ]);
});

test("settlement cancels a closed payment cycle without transfers", () => {
  const people = ["a", "b", "c"].map((id) => ({
    id,
    displayName: id
  }));
  const result = calculateSettlement(people, [
    {
      id: "a-paid-for-b",
      total: 1000,
      payers: [{ participantId: "a", amount: 1000 }],
      sharedByParticipantIds: ["b"]
    },
    {
      id: "b-paid-for-c",
      total: 1000,
      payers: [{ participantId: "b", amount: 1000 }],
      sharedByParticipantIds: ["c"]
    },
    {
      id: "c-paid-for-a",
      total: 1000,
      payers: [{ participantId: "c", amount: 1000 }],
      sharedByParticipantIds: ["a"]
    }
  ]);

  assert.deepEqual(result.balances, { a: 0, b: 0, c: 0 });
  assert.deepEqual(result.transfers, []);
});

test("personal pending balance ignores transfers already marked as paid", () => {
  const transfers = [
    {
      fromParticipantId: "yarin",
      toParticipantId: "dani",
      amount: 2750,
      status: "paid"
    },
    {
      fromParticipantId: "yarin",
      toParticipantId: "avi",
      amount: 500,
      status: "pending"
    },
    {
      fromParticipantId: "maor",
      toParticipantId: "yarin",
      amount: 200,
      status: "pending"
    }
  ];

  assert.equal(pendingBalanceForParticipant(transfers, "yarin"), -300);
  assert.equal(pendingBalanceForParticipant(transfers, "dani"), 0);
  assert.equal(pendingBalanceForParticipant(transfers, "avi"), 500);
  assert.equal(pendingBalanceForParticipant(transfers, "maor"), -200);
});

test("participant settlement breakdown uses the exact settlement shares", () => {
  const expenses = [
    {
      id: "taxi",
      name: "מונית",
      total: 11000,
      payers: [
        { participantId: "dani", amount: 5000 },
        { participantId: "avi", amount: 6000 }
      ],
      sharedByParticipantIds: ["dani", "avi", "yarin", "maor"]
    },
    {
      id: "food",
      name: "אוכל",
      total: 8000,
      payers: [{ participantId: "dani", amount: 8000 }],
      sharedByParticipantIds: ["dani", "yarin"]
    }
  ];

  const breakdown = buildParticipantSettlementBreakdown(participants, expenses, "yarin");

  assert.deepEqual(breakdown, {
    participantId: "yarin",
    paidTotal: 0,
    shareTotal: 6750,
    balance: -6750,
    expenseShares: [
      {
        expenseId: "taxi",
        name: "מונית",
        total: 11000,
        participantPaid: 0,
        participantShare: 2750,
        participantCount: 4
      },
      {
        expenseId: "food",
        name: "אוכל",
        total: 8000,
        participantPaid: 0,
        participantShare: 4000,
        participantCount: 2
      }
    ],
    issues: []
  });
});

test("participant settlement breakdown preserves the rounding agora used by transfers", () => {
  const roundingParticipants = [
    { id: "a", displayName: "א" },
    { id: "b", displayName: "ב" },
    { id: "c", displayName: "ג" }
  ];
  const expenses = [
    {
      id: "rounding",
      name: "חלוקה לא עגולה",
      total: 10000,
      payers: [{ participantId: "c", amount: 10000 }],
      sharedByParticipantIds: ["a", "b", "c"]
    }
  ];

  const settlement = calculateSettlement(roundingParticipants, expenses);
  const breakdown = buildParticipantSettlementBreakdown(
    roundingParticipants,
    expenses,
    "a"
  );

  assert.equal(breakdown.shareTotal, 3334);
  assert.equal(breakdown.balance, -3334);
  assert.equal(breakdown.expenseShares[0].participantShare, 3334);
  assert.equal(
    settlement.transfers.find((transfer) => transfer.fromParticipantId === "a")?.amount,
    3334
  );
});

test("optional friendly rounding keeps exact balances but creates whole-unit transfers", () => {
  const people = [
    { id: "a", displayName: "א" },
    { id: "b", displayName: "ב" }
  ];
  const expenses = [
    {
      id: "awkward-total",
      name: "חלוקה עם אגורות",
      total: 13768,
      payers: [{ participantId: "b", amount: 13768 }],
      sharedByParticipantIds: ["a", "b"]
    }
  ];

  const exact = calculateSettlement(people, expenses);
  const rounded = calculateSettlement(people, expenses, {
    roundTransfers: true
  });

  assert.deepEqual(rounded.balances, exact.balances);
  assert.equal(exact.transfers[0].amount, 6884);
  assert.equal(rounded.transfers[0].amount, 6900);
  assert.equal(rounded.transfers[0].amount % 100, 0);
});

test("friendly rounding balances several people without creating or losing money", () => {
  const people = [
    { id: "a", displayName: "א" },
    { id: "b", displayName: "ב" },
    { id: "c", displayName: "ג" }
  ];
  const rounded = calculateSettlement(
    people,
    [
      {
        id: "thirds",
        name: "שלישים",
        total: 10000,
        payers: [{ participantId: "c", amount: 10000 }],
        sharedByParticipantIds: ["a", "b", "c"]
      }
    ],
    { roundTransfers: true }
  );
  const transferredByParticipant = Object.fromEntries(
    people.map((participant) => [participant.id, 0])
  );

  for (const transfer of rounded.transfers) {
    assert.equal(transfer.amount % 100, 0);
    transferredByParticipant[transfer.fromParticipantId] -= transfer.amount;
    transferredByParticipant[transfer.toParticipantId] += transfer.amount;
  }

  assert.equal(Object.values(transferredByParticipant).reduce((sum, amount) => sum + amount, 0), 0);
  for (const participant of people) {
    assert.ok(
      Math.abs(
        transferredByParticipant[participant.id] - rounded.balances[participant.id]
      ) < 100
    );
  }
});

test("friendly rounding preserves paid history and rounds only the remaining balance", () => {
  const people = [
    { id: "a", displayName: "א" },
    { id: "b", displayName: "ב" }
  ];
  const expenses = [
    {
      id: "awkward-total",
      name: "חלוקה עם אגורות",
      total: 13768,
      payers: [{ participantId: "b", amount: 13768 }],
      sharedByParticipantIds: ["a", "b"]
    }
  ];
  const result = reconcileSettlementTransfers(
    people,
    expenses,
    [
      {
        id: "paid-rounded-transfer",
        fromParticipantId: "a",
        toParticipantId: "b",
        amount: 6900,
        status: "paid"
      }
    ],
    { roundTransfers: true }
  );

  assert.equal(result.transfers.length, 1);
  assert.equal(result.transfers[0].id, "paid-rounded-transfer");
  assert.equal(result.transfers[0].status, "paid");
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

test("paid transfer history survives later expenses and only the remainder stays open", () => {
  const people = [
    { id: "a", displayName: "א" },
    { id: "b", displayName: "ב" }
  ];
  const firstExpense = {
    id: "first",
    name: "ראשונה",
    total: 4000,
    payers: [{ participantId: "a", amount: 4000 }],
    sharedByParticipantIds: ["a", "b"]
  };
  const paidTransfer = {
    ...calculateSettlement(people, [firstExpense]).transfers[0],
    status: "paid",
    markedPaidAt: "2026-07-24T12:00:00.000Z"
  };
  const secondExpense = {
    id: "second",
    name: "שנייה",
    total: 2000,
    payers: [{ participantId: "a", amount: 2000 }],
    sharedByParticipantIds: ["a", "b"]
  };

  const result = reconcileSettlementTransfers(
    people,
    [firstExpense, secondExpense],
    [paidTransfer]
  );

  assert.equal(result.transfers.length, 2);
  assert.deepEqual(
    result.transfers.map(({ fromParticipantId, toParticipantId, amount, status }) => ({
      fromParticipantId,
      toParticipantId,
      amount,
      status
    })),
    [
      {
        fromParticipantId: "b",
        toParticipantId: "a",
        amount: 2000,
        status: "paid"
      },
      {
        fromParticipantId: "b",
        toParticipantId: "a",
        amount: 1000,
        status: "pending"
      }
    ]
  );
  assert.equal(new Set(result.transfers.map((transfer) => transfer.id)).size, 2);
});

test("direct settlement never makes a net funder send money", () => {
  const people = [
    { id: "a", displayName: "A" },
    { id: "b", displayName: "B" },
    { id: "c", displayName: "C" }
  ];
  const result = calculateSettlement(
    people,
    [
      {
        id: "taxi",
        total: 9000,
        payers: [{ participantId: "a", amount: 9000 }],
        sharedByParticipantIds: ["a", "b", "c"]
      },
      {
        id: "food",
        total: 6000,
        payers: [{ participantId: "b", amount: 6000 }],
        sharedByParticipantIds: ["a", "b"]
      }
    ],
    { directTransfers: true }
  );

  assert.deepEqual(
    result.transfers.map(({ fromParticipantId, toParticipantId, amount }) => ({
      fromParticipantId,
      toParticipantId,
      amount
    })),
    [{ fromParticipantId: "c", toParticipantId: "a", amount: 3000 }]
  );
});

test("direct settlement prefers the people who actually funded each expense", () => {
  const people = [
    { id: "a", displayName: "A" },
    { id: "b", displayName: "B" },
    { id: "c", displayName: "C" },
    { id: "d", displayName: "D" }
  ];
  const expenses = [
    {
      id: "a-paid-for-d",
      total: 1000,
      payers: [{ participantId: "a", amount: 1000 }],
      sharedByParticipantIds: ["a", "d"]
    },
    {
      id: "b-paid-for-c",
      total: 1000,
      payers: [{ participantId: "b", amount: 1000 }],
      sharedByParticipantIds: ["b", "c"]
    }
  ];

  const optimized = calculateSettlement(people, expenses);
  const direct = calculateSettlement(people, expenses, {
    directTransfers: true
  });
  const routes = (settlement) => settlement.transfers.map(
    ({ fromParticipantId, toParticipantId, amount }) =>
      `${fromParticipantId}->${toParticipantId}:${amount}`
  );

  assert.deepEqual(routes(optimized), ["c->a:500", "d->b:500"]);
  assert.deepEqual(routes(direct), ["d->a:500", "c->b:500"]);
});

test("direct settlement keeps pairwise routes without duplicates or reciprocals", () => {
  const people = [
    { id: "a", displayName: "A" },
    { id: "b", displayName: "B" },
    { id: "c", displayName: "C" },
    { id: "d", displayName: "D" }
  ];
  const result = calculateSettlement(people, [
    {
      id: "ride",
      total: 24000,
      payers: [{ participantId: "a", amount: 24000 }],
      sharedByParticipantIds: ["a", "b", "c", "d"]
    },
    {
      id: "food",
      total: 10000,
      payers: [{ participantId: "b", amount: 10000 }],
      sharedByParticipantIds: ["a", "b", "c", "d"]
    }
  ], { directTransfers: true });

  const routes = result.transfers.map(
    (transfer) => `${transfer.fromParticipantId}>${transfer.toParticipantId}`
  );
  assert.equal(new Set(routes).size, routes.length);
  assert.equal(
    routes.some((route) => {
      const [from, to] = route.split(">");
      return routes.includes(`${to}>${from}`);
    }),
    false
  );
  const balancesAfterTransfers = { ...result.balances };
  for (const transfer of result.transfers) {
    balancesAfterTransfers[transfer.fromParticipantId] += transfer.amount;
    balancesAfterTransfers[transfer.toParticipantId] -= transfer.amount;
  }
  assert.deepEqual(
    balancesAfterTransfers,
    Object.fromEntries(people.map(({ id }) => [id, 0]))
  );
});

test("direct settlement reimburses multiple payers according to their net contribution", () => {
  const result = calculateSettlement(
    participants,
    [
      {
        id: "shared-taxi",
        total: 12000,
        payers: [
          { participantId: "dani", amount: 5000 },
          { participantId: "avi", amount: 7000 }
        ],
        sharedByParticipantIds: ["dani", "avi", "yarin", "maor"]
      }
    ],
    { directTransfers: true }
  );

  const received = Object.fromEntries(participants.map(({ id }) => [id, 0]));
  for (const transfer of result.transfers) {
    received[transfer.toParticipantId] += transfer.amount;
  }

  assert.equal(received.dani, 2000);
  assert.equal(received.avi, 4000);
  assert.equal(received.yarin, 0);
  assert.equal(received.maor, 0);
});

test("direct settlement fully reimburses a payer who did not share the expense", () => {
  const people = participants.slice(0, 3);
  const result = calculateSettlement(
    people,
    [
      {
        id: "advance-payment",
        total: 10000,
        payers: [{ participantId: "dani", amount: 10000 }],
        sharedByParticipantIds: ["avi", "yarin"]
      }
    ],
    { directTransfers: true }
  );

  assert.deepEqual(
    result.transfers.map(({ fromParticipantId, toParticipantId, amount }) => ({
      fromParticipantId,
      toParticipantId,
      amount
    })),
    [
      { fromParticipantId: "avi", toParticipantId: "dani", amount: 5000 },
      { fromParticipantId: "yarin", toParticipantId: "dani", amount: 5000 }
    ]
  );
});

test("direct settlement combines repeated repayments on the same route", () => {
  const people = [
    { id: "a", displayName: "A" },
    { id: "b", displayName: "B" }
  ];
  const expenses = ["first", "second"].map((id) => ({
    id,
    total: 4000,
    payers: [{ participantId: "a", amount: 4000 }],
    sharedByParticipantIds: ["a", "b"]
  }));

  const result = calculateSettlement(people, expenses, { directTransfers: true });

  assert.equal(result.transfers.length, 1);
  assert.deepEqual(
    result.transfers.map(({ fromParticipantId, toParticipantId, amount }) => ({
      fromParticipantId,
      toParticipantId,
      amount
    })),
    [{ fromParticipantId: "b", toParticipantId: "a", amount: 4000 }]
  );
});

test("direct settlement nets reciprocal reimbursements into one transfer", () => {
  const people = [
    { id: "maor", displayName: "Maor" },
    { id: "yarin", displayName: "Yarin" }
  ];
  const expenses = [
    {
      id: "maor-paid-for-yarin",
      total: 100000,
      payers: [{ participantId: "maor", amount: 100000 }],
      sharedByParticipantIds: ["yarin"]
    },
    {
      id: "yarin-paid-for-maor",
      total: 20000,
      payers: [{ participantId: "yarin", amount: 20000 }],
      sharedByParticipantIds: ["maor"]
    }
  ];

  const result = calculateSettlement(people, expenses, {
    directTransfers: true
  });

  assert.deepEqual(
    result.transfers.map(({ fromParticipantId, toParticipantId, amount }) => ({
      fromParticipantId,
      toParticipantId,
      amount
    })),
    [
      {
        fromParticipantId: "yarin",
        toParticipantId: "maor",
        amount: 80000
      }
    ]
  );
});

test("direct settlement keeps the Korea event reimbursement between Yarin and Maor", () => {
  const people = [
    { id: "yarin", displayName: "Yarin" },
    { id: "maor", displayName: "Maor" },
    { id: "liron", displayName: "Liron" },
    { id: "nizri", displayName: "Nizri" }
  ];
  const expenses = [
    {
      id: "seoul-apartment",
      total: 403600,
      payers: [{ participantId: "yarin", amount: 403600 }],
      sharedByParticipantIds: ["yarin", "maor", "liron", "nizri"]
    },
    {
      id: "seoul-manila-flight",
      total: 128500,
      payers: [{ participantId: "maor", amount: 128500 }],
      sharedByParticipantIds: ["yarin", "maor", "liron"]
    },
    {
      id: "yarin-flight",
      total: 230000,
      payers: [{ participantId: "maor", amount: 230000 }],
      sharedByParticipantIds: ["yarin"]
    }
  ];
  const paid = {
    id: "paid-nizri-yarin-29800",
    fromParticipantId: "nizri",
    toParticipantId: "yarin",
    amount: 29800,
    status: "paid"
  };

  const result = reconcileSettlementTransfers(people, expenses, [paid], {
    directTransfers: true,
    roundTransfers: true
  });

  assert.equal(result.issues.length, 0);
  assert.deepEqual(
    result.transfers
      .filter((transfer) => transfer.status !== "paid")
      .find(
        (transfer) =>
          transfer.fromParticipantId === "yarin" &&
          transfer.toParticipantId === "maor"
      ),
    {
      id: "transfer-yarin-maor-172000",
      fromParticipantId: "yarin",
      toParticipantId: "maor",
      amount: 172000,
      status: "pending"
    }
  );
});

test("direct settlement rounds only final routes without creating money", () => {
  const people = [
    { id: "a", displayName: "A" },
    { id: "b", displayName: "B" },
    { id: "c", displayName: "C" }
  ];
  const result = calculateSettlement(
    people,
    [
      {
        id: "coffee",
        total: 10000,
        payers: [{ participantId: "a", amount: 10000 }],
        sharedByParticipantIds: ["a", "b", "c"]
      }
    ],
    { directTransfers: true, roundTransfers: true }
  );

  assert.deepEqual(result.transfers.map((transfer) => transfer.amount), [3300, 3300]);
  assert.equal(
    result.transfers.reduce((sum, transfer) => sum + transfer.amount, 0),
    6600
  );
  assert.equal(
    result.transfers.reduce((sum, transfer) => sum - transfer.amount + transfer.amount, 0),
    0
  );
});

test("direct rounding never turns two half-shekel debts into a two-shekel reimbursement", () => {
  const people = [
    { id: "a", displayName: "A" },
    { id: "b", displayName: "B" },
    { id: "c", displayName: "C" }
  ];
  const result = calculateSettlement(
    people,
    [
      {
        id: "tiny-expense",
        total: 150,
        payers: [{ participantId: "a", amount: 150 }],
        sharedByParticipantIds: ["a", "b", "c"]
      }
    ],
    { directTransfers: true, roundTransfers: true }
  );

  assert.equal(result.transfers.length, 1);
  assert.equal(result.transfers[0].toParticipantId, "a");
  assert.equal(result.transfers[0].amount, 100);
});

test("direct settlement clears exact balances across unusual mixed expenses", () => {
  const people = Array.from({ length: 7 }, (_, index) => ({
    id: `person-${index + 1}`,
    displayName: `Person ${index + 1}`
  }));
  const expenses = Array.from({ length: 40 }, (_, index) => {
    const payerIndex = index % people.length;
    const secondPayerIndex = (index + 3) % people.length;
    const sharedByParticipantIds = people
      .filter((_, participantIndex) => (participantIndex + index) % 3 !== 0)
      .map(({ id }) => id);
    const total = 1001 + index * 137;
    const firstPayment = Math.floor(total * 0.4);
    return {
      id: `expense-${index}`,
      total,
      payers: [
        { participantId: people[payerIndex].id, amount: firstPayment },
        { participantId: people[secondPayerIndex].id, amount: total - firstPayment }
      ],
      sharedByParticipantIds
    };
  });
  const result = calculateSettlement(people, expenses, { directTransfers: true });
  const balancesAfterTransfers = { ...result.balances };

  for (const transfer of result.transfers) {
    balancesAfterTransfers[transfer.fromParticipantId] += transfer.amount;
    balancesAfterTransfers[transfer.toParticipantId] -= transfer.amount;
  }

  assert.deepEqual(
    balancesAfterTransfers,
    Object.fromEntries(people.map(({ id }) => [id, 0]))
  );
});

test("direct settlement preserves every agora across many generated edge cases", () => {
  let seed = 0x5eed1234;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const randomInteger = (minimum, maximum) =>
    minimum + Math.floor(random() * (maximum - minimum + 1));

  for (let scenario = 0; scenario < 250; scenario += 1) {
    const participantCount = randomInteger(2, 8);
    const people = Array.from({ length: participantCount }, (_, index) => ({
      id: `scenario-${scenario}-person-${index}`,
      displayName: `Person ${index}`
    }));
    const expenseCount = randomInteger(1, 35);
    const expenses = Array.from({ length: expenseCount }, (_, expenseIndex) => {
      const shuffledPeople = [...people].sort(() => random() - 0.5);
      const sharedByParticipantIds = shuffledPeople
        .slice(0, randomInteger(1, participantCount))
        .map(({ id }) => id);
      const payerCount = randomInteger(1, Math.min(3, participantCount));
      const payerIds = [...people]
        .sort(() => random() - 0.5)
        .slice(0, payerCount)
        .map(({ id }) => id);
      const total = randomInteger(payerCount, 50000);
      let remaining = total;
      const payers = payerIds.map((participantId, payerIndex) => {
        const payersLeft = payerIds.length - payerIndex - 1;
        const amount = payersLeft === 0
          ? remaining
          : randomInteger(1, remaining - payersLeft);
        remaining -= amount;
        return { participantId, amount };
      });

      return {
        id: `scenario-${scenario}-expense-${expenseIndex}`,
        total,
        payers,
        sharedByParticipantIds
      };
    });

    for (const roundTransfers of [false, true]) {
      const result = calculateSettlement(people, expenses, {
        directTransfers: true,
        roundTransfers
      });
      const expectedBalances = roundTransfers
        ? roundSettlementBalances(result.balances)
        : result.balances;
      const balancesAfterTransfers = { ...expectedBalances };

      for (const transfer of result.transfers) {
        assert.ok(transfer.amount > 0);
        assert.ok(Number.isSafeInteger(transfer.amount));
        if (roundTransfers) assert.equal(transfer.amount % 100, 0);
        balancesAfterTransfers[transfer.fromParticipantId] += transfer.amount;
        balancesAfterTransfers[transfer.toParticipantId] -= transfer.amount;
      }

      assert.deepEqual(
        balancesAfterTransfers,
        Object.fromEntries(people.map(({ id }) => [id, 0])),
        `scenario ${scenario} did not settle cleanly (round=${roundTransfers})`
      );
    }
  }
});

test("direct settlement keeps paid history and nets only the true remainder", () => {
  const people = [
    { id: "a", displayName: "A" },
    { id: "b", displayName: "B" },
    { id: "c", displayName: "C" }
  ];
  const expenses = [
    {
      id: "taxi",
      total: 9000,
      payers: [{ participantId: "a", amount: 9000 }],
      sharedByParticipantIds: ["a", "b", "c"]
    },
    {
      id: "food",
      total: 6000,
      payers: [{ participantId: "b", amount: 6000 }],
      sharedByParticipantIds: ["a", "b"]
    }
  ];
  const paid = {
    id: "paid-b-a-3000",
    fromParticipantId: "b",
    toParticipantId: "a",
    amount: 3000,
    status: "paid",
    markedPaidAt: "2026-08-15T12:00:00.000Z"
  };

  const result = reconcileSettlementTransfers(people, expenses, [paid], {
    directTransfers: true
  });

  assert.deepEqual(
    result.transfers.map(({ fromParticipantId, toParticipantId, amount, status }) => ({
      fromParticipantId,
      toParticipantId,
      amount,
      status
    })),
    [
      {
        fromParticipantId: "b",
        toParticipantId: "a",
        amount: 3000,
        status: "paid"
      },
      {
        fromParticipantId: "c",
        toParticipantId: "b",
        amount: 3000,
        status: "pending"
      }
    ]
  );
});

test("settlement reroutes an avoidable reverse payment after completed history", () => {
  const people = [
    { id: "harel", displayName: "Harel" },
    { id: "maor", displayName: "Maor" },
    { id: "yarin", displayName: "Yarin" },
    { id: "ariel", displayName: "Ariel" }
  ];
  const result = reconcileSettlementTransfers(
    people,
    [
      {
        id: "new-expense",
        total: 10000,
        payers: [{ participantId: "ariel", amount: 10000 }],
        sharedByParticipantIds: ["yarin", "ariel"]
      }
    ],
    [
      {
        id: "paid-harel-maor-5000",
        fromParticipantId: "harel",
        toParticipantId: "maor",
        amount: 5000,
        status: "paid",
        markedPaidAt: "2026-08-19T08:00:00.000Z"
      }
    ],
    { directTransfers: true }
  );

  assert.deepEqual(
    result.transfers.map(({ fromParticipantId, toParticipantId, amount, status }) => ({
      fromParticipantId,
      toParticipantId,
      amount,
      status
    })),
    [
      {
        fromParticipantId: "harel",
        toParticipantId: "maor",
        amount: 5000,
        status: "paid"
      },
      {
        fromParticipantId: "maor",
        toParticipantId: "ariel",
        amount: 5000,
        status: "pending"
      },
      {
        fromParticipantId: "yarin",
        toParticipantId: "harel",
        amount: 5000,
        status: "pending"
      }
    ]
  );
});

test("settlement keeps a reverse payment only when the balance truly requires it", () => {
  const people = [
    { id: "harel", displayName: "Harel" },
    { id: "maor", displayName: "Maor" }
  ];
  const result = reconcileSettlementTransfers(
    people,
    [
      {
        id: "corrected-expense",
        total: 2000,
        payers: [{ participantId: "maor", amount: 2000 }],
        sharedByParticipantIds: ["harel", "maor"]
      }
    ],
    [
      {
        id: "paid-harel-maor-2000",
        fromParticipantId: "harel",
        toParticipantId: "maor",
        amount: 2000,
        status: "paid"
      }
    ]
  );

  assert.deepEqual(
    result.transfers.map(({ fromParticipantId, toParticipantId, amount, status }) => ({
      fromParticipantId,
      toParticipantId,
      amount,
      status
    })),
    [
      {
        fromParticipantId: "harel",
        toParticipantId: "maor",
        amount: 2000,
        status: "paid"
      },
      {
        fromParticipantId: "maor",
        toParticipantId: "harel",
        amount: 1000,
        status: "pending"
      }
    ]
  );
});

test("paid history and a new remainder to the same person share one display row", () => {
  const paidTransfer = {
    id: "paid-b-a-2000",
    fromParticipantId: "b",
    toParticipantId: "a",
    amount: 2000,
    status: "paid"
  };
  const pendingTransfer = {
    id: "pending-b-a-1000",
    fromParticipantId: "b",
    toParticipantId: "a",
    amount: 1000,
    status: "pending"
  };

  const displayRows = groupSettlementTransfersForDisplay([
    paidTransfer,
    pendingTransfer
  ]);

  assert.equal(displayRows.length, 1);
  assert.equal(displayRows[0].transfer, pendingTransfer);
  assert.deepEqual(displayRows[0].paidHistory, [paidTransfer]);
});

test("completed payments on the same route share one display row", () => {
  const firstPayment = {
    id: "paid-b-a-9200",
    fromParticipantId: "b",
    toParticipantId: "a",
    amount: 9200,
    status: "paid"
  };
  const secondPayment = {
    id: "paid-b-a-500",
    fromParticipantId: "b",
    toParticipantId: "a",
    amount: 500,
    status: "paid"
  };

  const displayRows = groupSettlementTransfersForDisplay([
    firstPayment,
    secondPayment
  ]);

  assert.equal(displayRows.length, 1);
  assert.equal(displayRows[0].transfer.amount, 9700);
  assert.equal(displayRows[0].transfer.status, "paid");
  assert.deepEqual(displayRows[0].groupedPaidTransfers, [
    firstPayment,
    secondPayment
  ]);
});

test("display grouping never combines opposite payment directions", () => {
  const paidTransfer = {
    id: "paid-b-a-2000",
    fromParticipantId: "b",
    toParticipantId: "a",
    amount: 2000,
    status: "paid"
  };
  const reverseTransfer = {
    id: "pending-a-b-1000",
    fromParticipantId: "a",
    toParticipantId: "b",
    amount: 1000,
    status: "pending"
  };

  const displayRows = groupSettlementTransfersForDisplay([
    paidTransfer,
    reverseTransfer
  ]);

  assert.equal(displayRows.length, 2);
  assert.deepEqual(displayRows.map((row) => row.paidHistory), [[], []]);
  assert.deepEqual(displayRows.map((row) => row.groupedPaidTransfers), [[], []]);
});

test("editing below an already paid amount creates a balancing reverse transfer", () => {
  const people = [
    { id: "a", displayName: "א" },
    { id: "b", displayName: "ב" }
  ];
  const paidTransfer = {
    id: "transfer-b-a-2000",
    fromParticipantId: "b",
    toParticipantId: "a",
    amount: 2000,
    status: "paid"
  };
  const smallerExpense = {
    id: "smaller",
    name: "מתוקנת",
    total: 2000,
    payers: [{ participantId: "a", amount: 2000 }],
    sharedByParticipantIds: ["a", "b"]
  };

  const result = reconcileSettlementTransfers(
    people,
    [smallerExpense],
    [paidTransfer]
  );

  assert.deepEqual(
    result.transfers.map(({ fromParticipantId, toParticipantId, amount, status }) => ({
      fromParticipantId,
      toParticipantId,
      amount,
      status
    })),
    [
      {
        fromParticipantId: "b",
        toParticipantId: "a",
        amount: 2000,
        status: "paid"
      },
      {
        fromParticipantId: "a",
        toParticipantId: "b",
        amount: 1000,
        status: "pending"
      }
    ]
  );

  const repeated = reconcileSettlementTransfers(
    people,
    [smallerExpense],
    result.transfers
  );
  assert.deepEqual(repeated.transfers, result.transfers);
});

test("duplicate paid history is applied only once", () => {
  const people = [
    { id: "a", displayName: "A" },
    { id: "b", displayName: "B" }
  ];
  const expense = {
    id: "expense",
    total: 1000,
    payers: [{ participantId: "a", amount: 1000 }],
    sharedByParticipantIds: ["a", "b"]
  };
  const paid = {
    id: "payment-1",
    fromParticipantId: "b",
    toParticipantId: "a",
    amount: 500,
    status: "paid",
    markedPaidAt: "2026-07-24T12:00:00.000Z"
  };

  const result = reconcileSettlementTransfers(
    people,
    [expense],
    [paid, { ...paid }]
  );

  assert.equal(result.transfers.length, 1);
  assert.equal(result.transfers[0].status, "paid");
});

test("settlement skips expenses that cannot be split instead of crashing", () => {
  const result = calculateSettlement(participants.slice(0, 2), [
    {
      id: "broken-expense",
      name: "הוצאה לא שלמה",
      total: 5000,
      payers: [{ participantId: "dani", amount: 5000 }],
      sharedByParticipantIds: [],
      createdByParticipantId: "dani",
      updatedAt: "2026-05-23T00:00:00.000Z"
    }
  ]);

  assert.deepEqual(result.balances, {
    dani: 0,
    avi: 0
  });
  assert.deepEqual(result.transfers, []);
  assert.deepEqual(result.issues, [
    {
      expenseId: "broken-expense",
      reason: "missing-shared-participants"
    }
  ]);
});

test("invalid settlement data never erases existing transfer history", () => {
  const previousTransfers = [
    {
      id: "paid-history",
      fromParticipantId: "avi",
      toParticipantId: "dani",
      amount: 2500,
      status: "paid",
      markedPaidAt: "2026-07-25T10:00:00.000Z"
    }
  ];
  const result = reconcileSettlementTransfers(
    participants.slice(0, 2),
    [
      {
        id: "broken-expense",
        total: 5000,
        payers: [{ participantId: "dani", amount: 5000 }],
        sharedByParticipantIds: ["missing-person"]
      }
    ],
    previousTransfers
  );

  assert.equal(result.issues.length, 1);
  assert.deepEqual(result.transfers, previousTransfers);
  assert.notStrictEqual(result.transfers[0], previousTransfers[0]);
});

test("settlement rejects duplicate payer ids in imported data", () => {
  const result = calculateSettlement(participants.slice(0, 2), [
    {
      id: "duplicate-payers",
      name: "הוצאה פגומה",
      total: 10000,
      payers: [
        { participantId: "dani", amount: 4000 },
        { participantId: "dani", amount: 6000 }
      ],
      sharedByParticipantIds: ["dani", "avi"]
    }
  ]);

  assert.deepEqual(result.issues, [
    { expenseId: "duplicate-payers", reason: "duplicate-payers" }
  ]);
  assert.deepEqual(result.transfers, []);
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
