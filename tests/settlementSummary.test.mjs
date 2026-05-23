import test from "node:test";
import assert from "node:assert/strict";

import {
  formatEventReport,
  formatSettlementSummary
} from "../src/domain/settlementSummary.mjs";

const participants = [
  { id: "dani", displayName: "דני", kind: "user" },
  { id: "avi", displayName: "אבי", kind: "user" },
  { id: "yarin", displayName: "ירין", kind: "user" },
  { id: "maor", displayName: "מאור", kind: "guest" }
];

test("formatSettlementSummary lists only pending transfers", () => {
  const summary = formatSettlementSummary({
    eventName: "יציאה חמישי",
    participants,
    transfers: [
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
        status: "paid"
      }
    ]
  });

  assert.equal(
    summary,
    "סיכום התחשבנות - יציאה חמישי\nירין מעביר לאבי: ₪27.50"
  );
});

test("formatSettlementSummary says the event is closed when no pending transfer remains", () => {
  const summary = formatSettlementSummary({
    eventName: "יציאה חמישי",
    participants,
    transfers: [
      {
        id: "transfer-maor-dani-2250",
        fromParticipantId: "maor",
        toParticipantId: "dani",
        amount: 2250,
        status: "paid"
      }
    ]
  });

  assert.equal(
    summary,
    "סיכום התחשבנות - יציאה חמישי\nהכל סגור. אין העברות פתוחות."
  );
});

test("formatEventReport includes expenses and pending settlement", () => {
  const report = formatEventReport({
    eventName: "יציאה חמישי",
    participants,
    expenses: [
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
    ],
    transfers: [
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
        status: "paid"
      }
    ]
  });

  assert.equal(
    report,
    [
      "דוח אירוע - יציאה חמישי",
      "הוצאות:",
      "- מונית: ₪110.00 | שילמו: דני ₪50.00, אבי ₪60.00 | שותפים: דני, אבי, ירין, מאור",
      "התחשבנות פתוחה:",
      "ירין מעביר לאבי: ₪27.50"
    ].join("\n")
  );
});
